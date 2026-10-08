import type { BatchOrderMedicationItem, OrderDraftSaveReceipt } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'

export type OrderDraftApi = { encounters: Pick<RhnApi['encounters'], 'saveOrderDrafts'> }

export function draftToBatchItem(draft: MedicationPlanDraft): BatchOrderMedicationItem {
  return {
    medicationId: draft.request.medicationId,
    catalogItemId: draft.request.catalogItemId,
    packageId: draft.request.packageId,
    doseValue: draft.request.doseValue,
    doseUnit: draft.request.doseUnit,
    routeCode: draft.request.routeCode,
    frequencyCode: draft.request.frequencyCode,
    durationValue: draft.request.durationValue,
    durationUnit: draft.request.durationUnit,
    quantity: draft.request.quantity,
    quantityUnit: draft.request.quantityUnit,
    substitutionAllowed: draft.request.substitutionAllowed ?? true,
    selfProvided: draft.request.selfProvided ?? false,
    medicationInstruction: draft.request.medicationInstruction,
    allergyReviewConfirmed: draft.request.allergyReviewConfirmed,
    allergyOverrideReason: draft.request.allergyOverrideReason,
    priceType: draft.request.priceType,
    pricingRequired: draft.request.pricingRequired,
    stockSiteId: draft.stockSiteId,
    stockSiteName: draft.stockSiteName,
    administrationGroupKey: draft.administrationGroupKey,
    routeExecutionType: draft.routeExecutionType,
    categoryCode: draft.categoryCode,
    skinTestExempt: draft.request.skinTestExempt,
    skinTestExemptReason: draft.request.skinTestExemptReason,
    exemptEvidenceEventId: draft.request.exemptEvidenceEventId,
    reason: draft.request.reason,
  }
}

/** Missing product IDs must never match two unrelated generic medication drafts. */
export function matchSplitPreviewDraft(drafts: MedicationPlanDraft[], item: BatchOrderMedicationItem) {
  const sameId = (left: unknown, right: unknown) => left != null && right != null && String(left) === String(right)
  const candidates = drafts.filter((draft) => {
    if (item.medicationId != null && !sameId(draft.request.medicationId, item.medicationId)) return false
    if (item.catalogItemId != null && !sameId(draft.request.catalogItemId, item.catalogItemId)) return false
    return item.medicationId != null || item.catalogItemId != null
  })
  if (candidates.length === 1) return candidates[0]
  const fields = ['packageId', 'doseValue', 'doseUnit', 'routeCode', 'frequencyCode', 'durationValue',
    'durationUnit', 'quantity', 'quantityUnit', 'medicationInstruction', 'administrationGroupKey'] as const
  return candidates.find((draft) => {
    const source = draftToBatchItem(draft)
    return fields.every((key) => String(source[key] ?? '') === String(item[key] ?? ''))
  })
}

export async function persistOrderDrafts(
  encounterId: string | number,
  medDrafts: MedicationPlanDraft[],
  svcDrafts: ServicePlanDraft[],
  api: OrderDraftApi,
  commandCode: string,
) {
  if (medDrafts.length === 0 && svcDrafts.length === 0) return
  if (typeof api.encounters?.saveOrderDrafts !== 'function') {
    throw new Error('医嘱整批保存接口不可用，草稿未提交，请更新服务后重试')
  }
  if (!commandCode.trim()) throw new Error('医嘱保存信息不完整，草稿未提交')
  const encId = String(encounterId)
  const input = { commandCode, medicationItems: medDrafts.map(draftToBatchItem), serviceItems: svcDrafts.map(draft => ({
    catalogItemId: draft.catalogItemId,
    ...(draft.performerOrganizationId ? { performerOrganizationId: draft.performerOrganizationId } : {}),
    ...(draft.performerDepartmentId ? { performerDepartmentId: draft.performerDepartmentId } : {}),
    quantity: draft.quantity, unitCode: draft.unitCode, priceType: 'SALE', pricingRequired: true,
    reason: '门诊诊疗申请', clinicalDescription: draft.clinicalDescription?.trim() || undefined,
  })) }
  const receipt = await api.encounters.saveOrderDrafts(encId, input).catch((error: unknown) => {
    if ((error as { code?: string })?.code === 'IDEMPOTENCY_KEY_REUSED') {
      throw new Error('本次内容与上次已保存的医嘱不一致，请先核对已保存医嘱，避免重复开立', { cause: error })
    }
    throw error
  })
  requireOrderDraftReceipt(receipt, encId, commandCode, medDrafts, svcDrafts)
  return receipt
}

export function requireOrderDraftReceipt(receipt: OrderDraftSaveReceipt, encounterId: string, commandCode: string,
  medications: MedicationPlanDraft[], services: ServicePlanDraft[]) {
  const fail = (): never => { throw new Error('医嘱保存回执未确认，草稿已保留；请重试保存以核实结果，勿另行重复开立') }
  const id = (value: unknown) => typeof value === 'string' && value.trim().length > 0
  const revision = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
  if (!receipt || receipt.commandCode !== commandCode || receipt.encounterId !== encounterId
    || !Array.isArray(receipt.prescriptions) || !Array.isArray(receipt.services)) fail()
  const remaining = [...medications], seen = new Set<string>()
  for (const prescription of receipt.prescriptions) {
    if (!prescription || !id(prescription.id) || seen.has(prescription.id) || !revision(prescription.revision)
      || prescription.encounterId !== encounterId || prescription.status !== 'DRAFT'
      || !Array.isArray(prescription.medicationRequests) || !prescription.medicationRequests.length) fail()
    seen.add(prescription.id)
    for (const row of prescription.medicationRequests) {
      if (!row || !id(row.id) || seen.has(row.id) || !revision(row.revision) || row.encounterId !== encounterId
        || row.prescriptionId !== prescription.id || row.status !== 'DRAFT') fail()
      seen.add(row.id)
      const index = remaining.findIndex(({ request }) => (!request.medicationId || request.medicationId === row.medicationId)
        && (!request.catalogItemId || request.catalogItemId === row.catalogItemId)
        && Boolean(request.medicationId || request.catalogItemId)
        && (request.packageId ?? null) === (row.packageId ?? null) && request.quantity === row.quantity
        && (['doseValue', 'doseUnit', 'durationValue', 'durationUnit', 'quantityUnit', 'medicationInstruction',
          'selfProvided', 'substitutionAllowed'] as const).every(field => request[field] == null
          || String(request[field]).trim() === String(row[field] ?? '').trim()))
      if (index < 0) fail()
      remaining.splice(index, 1)
    }
  }
  if (remaining.length || receipt.services.length !== services.length) fail()
  const pendingServices = [...services]
  for (const row of receipt.services) {
    if (!row || !id(row.id) || seen.has(row.id) || !revision(row.revision)
      || row.encounterId !== encounterId || row.status !== 'ACTIVE') fail()
    seen.add(row.id)
    const index = pendingServices.findIndex(draft => row.catalogItemId === draft.catalogItemId && row.quantity === draft.quantity
      && (!draft.performerOrganizationId || draft.performerOrganizationId === row.performerOrganizationId)
      && (!draft.performerDepartmentId || draft.performerDepartmentId === row.performerDepartmentId)
      && (draft.clinicalDescription?.trim() ?? '') === (row.clinicalDescription?.trim() ?? ''))
    if (index < 0) fail()
    pendingServices.splice(index, 1)
  }
}
