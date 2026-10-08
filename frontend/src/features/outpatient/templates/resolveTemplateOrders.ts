import { z } from 'zod'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { MedicationKnowledge } from '../../../shared/api/masterDataApi'
import type { OutpatientPlanTemplate, OutpatientPlanTemplateMedication } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { resolveDispensableOptions } from '../orders/dispensableOptions'
import { resolveServicePricing } from '../orders/servicePricing'
import { resolveOrderExecutionDepartment } from '../orders/orderExecutionDepartment'
import { draftToBatchItem, matchSplitPreviewDraft } from '../orders/persistOrderDrafts'
import { requireSplitPreview } from '../orders/usePrescriptionSplitPreview'
import { requirePlanApplicationShape } from './templateApplicationReceipt'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const fail = (detail: string): never => { throw new Error(`模板医嘱未带入：${detail}`) }
const sameUnit = (left: string | undefined, right: string | undefined) => text(left) && text(right) && left.trim().toLowerCase() === right.trim().toLowerCase()
function effective(row: { validFrom: string; validTo?: string }, at: string) {
  return z.iso.date().safeParse(row.validFrom).success && row.validFrom <= at && (row.validTo == null
    || (z.iso.date().safeParse(row.validTo).success && row.validTo >= row.validFrom && row.validTo >= at))
}

function productFacts(item: OutpatientPlanTemplateMedication, medication: MedicationKnowledge, organizationId: string, at: string) {
  const priced = item.pricingRequired ?? Boolean(item.catalogItemId && !item.selfProvided)
  if (!item.catalogItemId) {
    if (!item.selfProvided) return fail(`${medication.name}未指定院内发药产品，请在模板或医嘱区明确选择产品`)
    if (item.packageId || priced || !sameUnit(item.quantityUnit, medication.preparationUnit)) {
      return fail(`${medication.name}的自备药包装、计价设置或数量单位未确认`)
    }
    return { product: undefined, itemPackage: undefined, unitCode: medication.preparationUnit!, unitName: medication.preparationUnit!,
      packageFactor: 1, price: undefined, currencyCode: undefined, priced }
  }
  if (!Array.isArray(medication.products)) return fail(`${medication.name}的产品目录未确认`)
  const products = medication.products.filter(product => product?.id === item.catalogItemId)
  if (products.length !== 1) return fail(`${medication.name}的原产品已不可用或不唯一`)
  const product = products[0], adoption = product.organizationAdoption
  if (product.medicationId !== medication.id || !text(product.name) || !text(product.unitCode)
    || product.sdStatus !== 'ACTIVE' || product.orderable !== true || !effective(product, at)
    || !adoption || adoption.organizationId !== organizationId || adoption.sdStatus !== 'ACTIVE'
    || adoption.orderable !== true || !effective(adoption, at) || (!item.selfProvided && adoption.dispensable !== true)) {
    return fail(`${medication.name}的产品归属、采用状态或有效期未确认`)
  }
  if (priced) {
    if (item.priceType != null && item.priceType !== 'SALE') return fail(`${medication.name}的模板价格类型不适用于门诊销售，请核实模板`)
    const options = resolveDispensableOptions(medication, organizationId, !item.selfProvided).filter(option => option.product.id === product.id
      && (option.itemPackage?.id ?? null) === (item.packageId ?? null))
    if (options.length !== 1) return fail(`${medication.name}的原包装或当前销售价格未确认`)
    return { ...options[0], priced }
  }
  // Explicit non-priced/self-provided orders still require real product and package facts; they do not acquire a fabricated zero price.
  if (!Array.isArray(product.packages)) return fail(`${medication.name}的包装目录未确认`)
  const packages = product.packages.filter(row => row?.id === item.packageId)
  const itemPackage = item.packageId ? packages[0] : undefined
  if (item.packageId && (packages.length !== 1 || itemPackage!.sdStatus !== 'ACTIVE' || !effective(itemPackage!, at)
    || !positive(itemPackage!.quantityFactor) || !text(itemPackage!.unitCode) || !text(itemPackage!.unitName))) {
    return fail(`${medication.name}的原包装或换算关系未确认`)
  }
  return { product, itemPackage, unitCode: itemPackage?.unitCode ?? product.unitCode,
    unitName: itemPackage?.unitName ?? product.unitCode, packageFactor: itemPackage?.quantityFactor ?? 1,
    price: undefined, currencyCode: undefined, priced }
}

export type ResolvedTemplateOrders = { medications: MedicationPlanDraft[]; services: ServicePlanDraft[] }

export async function resolveTemplateOrders(plan: OutpatientPlanTemplate, encounter: Encounter, api: RhnApi,
  allergies: AllergyIntolerance[], allergyReady: boolean): Promise<ResolvedTemplateOrders> {
  requirePlanApplicationShape(plan)
  if (encounter.status !== 'IN_PROGRESS' || !text(encounter.id) || !text(encounter.residentId)
    || !text(encounter.organizationId) || !text(encounter.departmentId)) return fail('当前就诊或工作上下文未确认')
  if (plan.medications.length && (!allergyReady || !Array.isArray(allergies))) return fail('当前患者过敏资料尚未确认')
  if (plan.medications.length && allergies.some(item => item.residentId !== encounter.residentId)) return fail('过敏资料不属于当前患者')
  const allergyRecorded = allergies.some(item => item.clinicalStatus === 'ACTIVE' && item.verificationStatus === 'CONFIRMED'
    && (item.assertionType === 'NO_KNOWN_ALLERGY' || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY'
      || (item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')))
  const now = new Date(), at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [routes, frequencies] = plan.medications.length ? await Promise.all([
    api.masterData.activeMedicationRoutes('OUTPATIENT'),
    api.masterData.activeOrderFrequencies(encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
  ]) : [[], []]
  if (!Array.isArray(routes) || !Array.isArray(frequencies)) return fail('当前用法或频次目录未确认')
  const knowledge = new Map<string, ReturnType<RhnApi['masterData']['medications']>>()
  const stocks = new Map<string, ReturnType<RhnApi['encounters']['orderableMedications']>>()
  const departments = new Map<string, ReturnType<typeof resolveOrderExecutionDepartment>>()
  const medicationFacts = await Promise.all(plan.medications.map(async (item, index) => {
    if (!knowledge.has(item.medicationId)) knowledge.set(item.medicationId,
      api.masterData.medications(item.medicationCode, '', 'ACTIVE', encounter.organizationId))
    const rows = await knowledge.get(item.medicationId)!
    if (!Array.isArray(rows)) return fail(`${item.medicationName}的知识目录未确认`)
    const matches = rows.filter(row => row?.id === item.medicationId && row.code === item.medicationCode)
    if (matches.length !== 1) return fail(`${item.medicationName}未匹配到唯一的当前药品`)
    const medication = matches[0]
    if (medication.sdStatus !== 'ACTIVE' || medication.sdMedicationType !== item.categoryCode || !text(medication.name)
      || typeof medication.skinTestRequired !== 'boolean' || typeof medication.antimicrobial !== 'boolean'
      || !Array.isArray(medication.allergenConceptIds) || !medication.allergenConceptIds.every(text)
      || (medication.sdMedicationType === 'HERBAL') !== (item.editorMode === 'herbal')) return fail(`${item.medicationName}的类别或用药风险资料未确认`)
    const route = routes.filter(row => row?.code === item.routeCode)
    const frequency = frequencies.filter(row => row?.code === item.frequencyCode)
    if (route.length !== 1 || !text(route[0].name) || !['NONE', 'ADMINISTRATION', 'INFUSION'].includes(route[0].executionType)
      || frequency.length !== 1 || !text(frequency[0].name)) return fail(`${item.medicationName}的用法或频次当前不可用，请重新选择`)
    if (item.routeExecutionType != null && item.routeExecutionType !== route[0].executionType) return fail(`${item.medicationName}的用法执行类型已变化，请重新核对模板`)
    if ((item.doseValue != null && (!positive(item.doseValue) || !text(item.doseUnit)))
      || (item.durationValue != null && (!positive(item.durationValue) || !text(item.durationUnit)))) return fail(`${item.medicationName}的剂量或疗程信息不完整`)
    const product = productFacts(item, medication, encounter.organizationId, at)
    if (!sameUnit(item.quantityUnit, product.unitCode) && !sameUnit(item.quantityUnit, product.unitName)) {
      return fail(`${item.medicationName}的模板数量单位与当前包装不一致，请核对换算关系`)
    }
    if (!item.selfProvided && !stocks.has(item.medicationId)) stocks.set(item.medicationId,
      api.encounters.orderableMedications(encounter.id, medication.code))
    const inventory = item.selfProvided ? [] : await stocks.get(item.medicationId)!
    if (!Array.isArray(inventory)) return fail(`${item.medicationName}的当前库存未确认`)
    const draft: MedicationPlanDraft = {
      id: crypto.randomUUID(), sequence: Date.now() + index, editorMode: item.editorMode, categoryCode: medication.sdMedicationType,
      quantityManuallySet: true, medicationCode: medication.code, medicationName: medication.name,
      productName: product.product?.name ?? '自备药品（产品未指定）', preparationSpec: medication.preparationSpec,
      productSpec: product.itemPackage?.packageSpec, manufacturerName: product.product?.manufacturerName,
      unitPrice: product.price, currencyCode: product.currencyCode, packageUnitName: product.unitName,
      routeName: route[0].name, routeExecutionType: route[0].executionType,
      administrationGroupKey: route[0].executionType === 'INFUSION' ? `draft:${crypto.randomUUID()}` : undefined,
      skinTestRequired: medication.skinTestRequired, skinTestResultValidityHours: medication.skinTestResultValidityHours,
      antimicrobial: medication.antimicrobial, sdAntimicrobialLevelText: medication.sdAntimicrobialLevelText,
      allergenConceptIds: medication.allergenConceptIds,
      request: { medicationId: medication.id, catalogItemId: product.product?.id, packageId: product.itemPackage?.id,
        doseValue: item.doseValue, doseUnit: item.doseUnit, routeCode: route[0].code, frequencyCode: frequency[0].code,
        durationValue: item.durationValue, durationUnit: item.durationUnit, quantity: item.quantity, quantityUnit: product.unitCode,
        substitutionAllowed: item.substitutionAllowed, selfProvided: item.selfProvided, medicationInstruction: item.medicationInstruction,
        allergyReviewConfirmed: allergyRecorded, pricingRequired: product.priced, priceType: item.priceType ?? 'SALE', reason: item.reason },
    }
    return { draft, inventory, product, medication }
  }))
  const services = await Promise.all(plan.services.map(async (item, index): Promise<ServicePlanDraft> => {
    const page = await api.masterData.searchServices(item.itemCode, item.serviceType, 'ACTIVE', encounter.organizationId, 0, 100)
    if (!page || !Array.isArray(page.content)) return fail(`${item.itemName}的项目目录未确认`)
    const matches = page.content.filter(row => row?.id === item.catalogItemId)
    if (matches.length !== 1) return fail(`${item.itemName}未匹配到唯一的当前项目`)
    const current = matches[0]
    if (current.code !== item.itemCode || current.sdServiceType !== item.serviceType || !text(current.name)
      || (item.priceType != null && item.priceType !== 'SALE') || item.pricingRequired === false) return fail(`${item.itemName}的项目类型或计价设置不适用于当前门诊开立`)
    const pricing = resolveServicePricing(current, encounter.organizationId)
    if (!pricing.price) return fail(`${item.itemName}：${pricing.error}`)
    if (!sameUnit(item.unitCode, current.unitCode)) return fail(`${item.itemName}的模板单位与当前目录不一致`)
    const organizationId = item.performerOrganizationId ?? encounter.organizationId, departmentId = item.performerDepartmentId ?? encounter.departmentId
    const departmentKey = `${organizationId}|${departmentId}`
    if (!departments.has(departmentKey)) departments.set(departmentKey, resolveOrderExecutionDepartment(departmentId, organizationId, api))
    const department = await departments.get(departmentKey)!
    return { id: crypto.randomUUID(), sequence: Date.now() + index, serviceType: current.sdServiceType,
      catalogItemId: current.id, itemCode: current.code, itemName: current.name, quantity: item.quantity, unitCode: current.unitCode,
      clinicalDescription: item.clinicalDescription, unitPrice: pricing.price.price, currencyCode: pricing.price.currencyCode,
      performerOrganizationId: organizationId, performerDepartmentId: department.id, performerDepartmentName: department.name }
  }))
  const medications = medicationFacts.map(value => value.draft)
  if (medications.length) {
    const inputs = medications.map(draftToBatchItem)
    const plans = requireSplitPreview(await api.encounters.autoSplitPreview(encounter.id, inputs), inputs)
    const remaining = [...medications], demand = new Map<string, { amount: number; available: number }>()
    for (const line of plans.flatMap(value => value.items)) {
      const draft = matchSplitPreviewDraft(remaining, line.item)
      if (!draft) return fail('分方结果未匹配完整模板明细')
      remaining.splice(remaining.indexOf(draft), 1)
      if (draft.request.selfProvided) continue
      const facts = medicationFacts[medications.indexOf(draft)]
      const rows = facts.inventory.filter(row => row?.id === draft.request.medicationId
        && row.stockSiteId === String(line.item.stockSiteId) && row.products?.some(product => product.id === draft.request.catalogItemId))
      if (rows.length !== 1 || rows[0].stockSiteName !== line.item.stockSiteName || rows[0].baseUnitCode !== facts.product.product?.unitCode
        || !positive(rows[0].availableBaseQuantity)) return fail(`${draft.medicationName}的目标药房库存或基础单位未确认`)
      const amount = draft.request.quantity * facts.product.packageFactor, key = `${rows[0].stockSiteId}|${draft.request.catalogItemId}`
      const total = amount + (demand.get(key)?.amount ?? 0), available = Math.min(rows[0].availableBaseQuantity, demand.get(key)?.available ?? Infinity)
      if (!positive(amount) || !Number.isFinite(total) || total - available > Math.max(total, available) * Number.EPSILON * medications.length) {
        return fail(`${draft.medicationName}的所选总量超过目标药房当前可用库存`)
      }
      demand.set(key, { amount: total, available })
      draft.stockSiteId = rows[0].stockSiteId; draft.stockSiteName = rows[0].stockSiteName
      draft.availablePackageQuantity = rows[0].availableBaseQuantity / facts.product.packageFactor
    }
  }
  return { medications, services }
}
