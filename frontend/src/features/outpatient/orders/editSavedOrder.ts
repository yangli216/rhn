import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'

/** SIMPLE：保存即生效；SIGNING：保存为未签署，签署后生效。 */
export type OrderWorkflowMode = 'SIMPLE' | 'SIGNING'

/**
 * “修改”在原医嘱上进行：未签署的随时可改；简单模式下已生效且未进结算单的也可改（保存时退回未签署、改完立即生效）。
 * 签署模式下已签署的须先“取消签署”再改。中药饮片按整方、输液组按组开立，单行修改会拆散处方或组，只能删除后重开。
 */
export function savedOrderEditable(value: MedicationRequest | ServiceRequest, mode: OrderWorkflowMode,
  siblings: MedicationRequest[] = []) {
  if (value.status === 'CANCELLED') return false
  if (value.status === 'ACTIVE' && (mode !== 'SIMPLE' || value.editBlockedReason)) return false
  if ('medicationId' in value) {
    return value.medicationType !== 'HERBAL' && !value.parentRequestId
      && !siblings.some((other) => other.parentRequestId === value.id && other.status !== 'CANCELLED')
  }
  return true
}

/** 签署模式：已签署、执行未接收且未进结算单的医嘱可以取消签署。 */
export function savedOrderWithdrawable(value: MedicationRequest | ServiceRequest, mode: OrderWorkflowMode) {
  return mode === 'SIGNING' && value.status === 'ACTIVE' && !value.editBlockedReason
}

export function medicationRequestToDraft(value: MedicationRequest): MedicationPlanDraft {
  const herbal = value.medicationType === 'HERBAL'
  return {
    id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: herbal ? 'herbal' : 'regular',
    quantityManuallySet: true,
    categoryCode: value.medicationType || 'WESTERN',
    medicationName: value.medicationName, medicationCode: value.medicationCode,
    preparationSpec: value.preparationSpec, productName: value.itemName || value.medicationName,
    productSpec: value.packageSpec, manufacturerName: value.manufacturerName,
    unitPrice: value.unitPrice, currencyCode: value.currencyCode,
    routeName: value.routeName, routeExecutionType: value.routeExecutionType,
    stockSiteId: value.stockSiteId ?? undefined, stockSiteName: value.stockSiteName ?? undefined,
    packageUnitName: value.packageUnitName,
    skinTestRequired: value.skinTestRequired, antimicrobial: value.antimicrobial,
    revises: { id: value.id, revision: value.revision },
    request: {
      medicationId: value.medicationId, catalogItemId: value.catalogItemId, packageId: value.packageId,
      doseValue: value.doseValue, doseUnit: value.doseUnit, routeCode: value.routeCode,
      frequencyCode: value.frequencyCode, durationValue: value.durationValue, durationUnit: value.durationUnit,
      quantity: value.quantity, quantityUnit: value.quantityUnit,
      substitutionAllowed: value.substitutionAllowed, selfProvided: value.selfProvided,
      medicationInstruction: value.medicationInstruction,
      // 原医嘱开立时已完成过敏核对；过敏资料变化时服务端仍按当前资料重新校验。
      allergyReviewConfirmed: true,
      skinTestExempt: value.skinTestExempt, skinTestExemptReason: value.skinTestExemptReason,
      exemptEvidenceEventId: value.exemptEvidenceEventId,
      priceType: value.priceType, pricingRequired: true,
      reason: herbal ? '门诊草药处方' : '门诊处方',
    },
  }
}

export function serviceRequestToDraft(value: ServiceRequest, performerDepartmentName?: string): ServicePlanDraft {
  return {
    id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: value.serviceType,
    catalogItemId: value.catalogItemId, itemCode: value.itemCode, itemName: value.itemName,
    quantity: value.quantity, unitCode: value.unitCode, clinicalDescription: value.clinicalDescription,
    unitPrice: value.unitPrice, currencyCode: value.currencyCode,
    performerOrganizationId: value.performerOrganizationId, performerDepartmentId: value.performerDepartmentId,
    performerDepartmentName,
    revises: { id: value.id, revision: value.revision },
  }
}
