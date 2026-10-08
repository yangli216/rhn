import type { MedicationRequest, Prescription } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { resolveDispensableOptions } from '../orders/dispensableOptions'
import type { MedicationPlanDraft } from '../orders/medicationDraft'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const fail = (reason: string): never => { throw new Error(`历史处方未带入：${reason}`) }

function frequencyMeaning(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rule = value as Record<string, unknown>
  if (!['TIMES_PER_PERIOD', 'FIXED_INTERVAL', 'CALENDAR', 'PRN', 'ONCE'].includes(String(rule.ruleType))
    || !['ORDER_START', 'STANDARD_TIME', 'CALENDAR', 'EVENT'].includes(String(rule.anchorType))
    || !['REMAINING_SLOTS', 'FULL_SCHEDULE', 'FROM_ORDER_TIME'].includes(String(rule.firstDayPolicy))
    || !Array.isArray(rule.executionTimes) || !rule.executionTimes.every(time =>
      typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time))) return undefined
  if (['TIMES_PER_PERIOD', 'FIXED_INTERVAL'].includes(String(rule.ruleType))
    && (!positive(rule.frequencyCount) || !Number.isInteger(rule.frequencyCount) || !positive(rule.periodValue)
      || !text(rule.periodUnit))) return undefined
  return JSON.stringify([rule.ruleType, rule.frequencyCount ?? null, rule.periodValue ?? null,
    rule.periodUnit ?? null, rule.anchorType, [...rule.executionTimes].sort(), rule.firstDayPolicy])
}

export function historicalEncounterEligible(encounter: Encounter) {
  const registered = Date.parse(encounter.registeredAt)
  return encounter.status === 'COMPLETED' && Number.isFinite(registered)
    && registered >= Date.now() - 90 * 86_400_000 && registered <= Date.now()
}

export function historicalMedicationSelectable(rx: Prescription, item: MedicationRequest) {
  return rx.status === 'ACTIVE' && ['WESTERN', 'CHINESE_PATENT'].includes(rx.categoryCode)
    && item.status === 'ACTIVE' && item.antimicrobial === false && item.skinTestRequired === false
    && ['NONE', 'ADMINISTRATION'].includes(item.routeExecutionType ?? '') && item.selfProvided === false
}

export function requireHistoricalPrescriptions(value: Prescription[], source: Encounter): Prescription[] {
  if (!Array.isArray(value)) return fail('处方列表未确认，请重新加载')
  const rxIds = new Set<string>(), lineIds = new Set<string>()
  for (const rx of value) {
    if (!rx || !text(rx.id) || rxIds.has(rx.id) || rx.encounterId !== source.id || rx.residentId !== source.residentId
      || !Number.isSafeInteger(rx.revision) || rx.revision < 0 || !Array.isArray(rx.medicationRequests)) {
      return fail('历史处方归属或版本未确认，请重新加载')
    }
    rxIds.add(rx.id)
    for (const item of rx.medicationRequests) {
      if (!item || !text(item.id) || lineIds.has(item.id) || item.prescriptionId !== rx.id
        || item.encounterId !== source.id || item.residentId !== source.residentId
        || !Number.isSafeInteger(item.revision) || item.revision < 0) {
        return fail('历史医嘱归属或版本未确认，请重新加载')
      }
      lineIds.add(item.id)
    }
  }
  return value
}

export async function resolveHistoricalPrescriptionImport({ source, target, viewed, selectedIds, api, allergyOverrideReason }: {
  source: Encounter; target: Encounter; viewed: Prescription[]; selectedIds: string[]; api: RhnApi; allergyOverrideReason: string
}): Promise<MedicationPlanDraft[]> {
  if (!historicalEncounterEligible(source) || target.status !== 'IN_PROGRESS' || source.id === target.id
    || !text(target.id) || !text(target.residentId) || target.residentId !== source.residentId
    || !text(target.organizationId) || !text(target.departmentId)) return fail('当前就诊与历史患者未确认，请重新选择')
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length) return fail('请选择需要续方的医嘱')
  const before = requireHistoricalPrescriptions(viewed, source)
  const latest = requireHistoricalPrescriptions(await api.encounters.prescriptions(source.id), source)
  const selected = selectedIds.map(id => {
    const oldRx = before.find(rx => rx.medicationRequests.some(item => item.id === id))
    const rx = latest.find(rx => rx.medicationRequests.some(item => item.id === id))
    const old = oldRx?.medicationRequests.find(item => item.id === id)
    const item = rx?.medicationRequests.find(item => item.id === id)
    if (!oldRx || !rx || !old || !item || rx.id !== oldRx.id || rx.revision !== oldRx.revision
      || rx.categoryCode !== oldRx.categoryCode || JSON.stringify(item) !== JSON.stringify(old)
      || !historicalMedicationSelectable(rx, item)) return fail('所选历史医嘱已变化或不适合直接续方，请重新加载核对')
    if (!text(item.medicationId) || !text(item.medicationCode) || !text(item.catalogItemId)
      || (item.packageId != null && !text(item.packageId)) || !positive(item.quantity) || !text(item.quantityUnit)
      || !positive(item.doseValue) || !text(item.doseUnit) || !text(item.routeCode) || !text(item.frequencyCode)
      || !positive(item.packageFactor) || !positive(item.baseQuantity) || !text(item.baseUnit)
      || typeof item.substitutionAllowed !== 'boolean'
      || (item.durationValue != null && (!positive(item.durationValue) || !text(item.durationUnit)))
      || (item.durationValue == null && item.durationUnit != null)) return fail(`${item.medicationName}的历史剂量、数量或单位不完整，请手工核对开立`)
    return { rx, item }
  })
  const [routes, frequencies] = await Promise.all([
    api.masterData.activeMedicationRoutes('OUTPATIENT'),
    api.masterData.activeOrderFrequencies(target.organizationId, target.departmentId, 'OUTPATIENT', 'MEDICATION'),
  ])
  if (!Array.isArray(routes) || !Array.isArray(frequencies)) return fail('当前用法或频次目录未确认')
  const availability = new Map<string, number>()
  const additions = await Promise.all(selected.map(async ({ rx, item }): Promise<MedicationPlanDraft> => {
    const matches = await api.encounters.orderableMedications(target.id, item.medicationCode)
    if (!Array.isArray(matches)) return fail(`${item.medicationName}的当前目录未确认`)
    const candidates = matches.filter(raw => raw?.id === item.medicationId && raw.code === item.medicationCode
      && Array.isArray(raw.products) && raw.products.some(product => product.id === item.catalogItemId))
    if (candidates.length !== 1) return fail(`${item.medicationName}未匹配到唯一的当前产品与药房`)
    const raw = candidates[0]
    if (raw.sdStatus !== 'ACTIVE' || raw.sdMedicationType !== rx.categoryCode || !text(raw.name)
      || raw.antimicrobial !== false || raw.skinTestRequired !== false) {
      return fail(`${item.medicationName}的当前类别或药品风险已变化，请在医嘱区重新评估`)
    }
    const options = resolveDispensableOptions(raw, target.organizationId).filter(option =>
      option.product.id === item.catalogItemId && (option.itemPackage?.id ?? null) === (item.packageId ?? null))
    if (options.length !== 1) return fail(`${item.medicationName}的原产品、包装或当前销售价不可用，请重新选择`)
    const option = options[0]
    if (!text(option.product.name) || option.unitCode !== item.quantityUnit || option.packageFactor !== item.packageFactor
      || raw.baseUnitCode !== item.baseUnit || option.product.unitCode !== item.baseUnit) {
      return fail(`${item.medicationName}的包装换算或数量单位已变化，请重新核对总量`)
    }
    const routeMatches = routes.filter(route => route.code === item.routeCode)
    const frequencyMatches = frequencies.filter(frequency => frequency.code === item.frequencyCode)
    if (routeMatches.length !== 1 || !text(routeMatches[0].name)
      || !['NONE', 'ADMINISTRATION'].includes(routeMatches[0].executionType)
      || routeMatches[0].executionType !== item.routeExecutionType || frequencyMatches.length !== 1) {
      return fail(`${item.medicationName}的当前用法或频次不可用，请重新选择`)
    }
    const historicalFrequency = frequencyMeaning(item.frequencyRule)
    if (!historicalFrequency || item.frequencyRule?.code !== item.frequencyCode
      || historicalFrequency !== frequencyMeaning(frequencyMatches[0])) {
      return fail(`${item.medicationName}的频次规则缺失或已变化，请重新核对用法`)
    }
    if (!text(raw.stockSiteId) || !text(raw.stockSiteName) || !positive(raw.availableBaseQuantity)) {
      return fail(`${item.medicationName}的当前库存或发药药房未确认`)
    }
    const quantity = item.quantity * option.packageFactor
    if (!Number.isFinite(quantity) || Math.abs(quantity - item.baseQuantity) > Math.max(quantity, item.baseQuantity) * Number.EPSILON * 8) {
      return fail(`${item.medicationName}的历史总量与包装换算不一致，请手工核对`)
    }
    const stockKey = `${raw.stockSiteId}|${option.product.id}`
    availability.set(stockKey, Math.min(availability.get(stockKey) ?? Infinity, raw.availableBaseQuantity))
    return {
      id: crypto.randomUUID(), sequence: Date.now(), editorMode: 'regular', quantityManuallySet: true,
      categoryCode: raw.sdMedicationType, medicationName: raw.name, medicationCode: raw.code,
      productName: option.product.name, productSpec: option.itemPackage?.packageSpec,
      preparationSpec: raw.preparationSpec, manufacturerName: option.product.manufacturerName,
      routeName: routeMatches[0].name, routeExecutionType: routeMatches[0].executionType,
      unitPrice: option.price, currencyCode: option.currencyCode,
      stockSiteId: raw.stockSiteId, stockSiteName: raw.stockSiteName,
      availablePackageQuantity: raw.availableBaseQuantity / option.packageFactor, packageUnitName: option.unitName,
      skinTestRequired: raw.skinTestRequired, antimicrobial: raw.antimicrobial, allergenConceptIds: raw.allergenConceptIds,
      request: { medicationId: raw.id, catalogItemId: option.product.id, packageId: option.itemPackage?.id,
        doseValue: item.doseValue, doseUnit: item.doseUnit, routeCode: routeMatches[0].code, frequencyCode: frequencyMatches[0].code,
        durationValue: item.durationValue, durationUnit: item.durationUnit, quantity: item.quantity,
        quantityUnit: option.unitCode, medicationInstruction: item.medicationInstruction,
        substitutionAllowed: item.substitutionAllowed, selfProvided: item.selfProvided, allergyReviewConfirmed: true,
        allergyOverrideReason: allergyOverrideReason.trim() || undefined, priceType: option.priceType, pricingRequired: true,
        reason: `历史处方续方参考：${rx.prescriptionNo}` },
    }
  }))
  // Several selected lines may consume the same product. Check their combined demand in base units.
  const demand = new Map<string, number>()
  for (const [index, draft] of additions.entries()) {
    const key = `${draft.stockSiteId}|${draft.request.catalogItemId}`
    const total = (demand.get(key) ?? 0) + selected[index].item.baseQuantity
    const available = availability.get(key)!
    demand.set(key, total)
    if (!Number.isFinite(total) || total - available > Math.max(total, available) * Number.EPSILON * additions.length) {
      return fail(`${draft.medicationName}的所选总量超过当前可用库存`)
    }
  }
  return additions
}
