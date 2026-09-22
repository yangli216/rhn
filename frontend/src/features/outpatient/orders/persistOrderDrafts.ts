import type { BatchOrderMedicationItem, MedicationRequest, Prescription } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { isInfusionRoute, type MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'

export type OrderDraftApi = { encounters: Pick<RhnApi['encounters'],
  'batchOrderPrescriptions' | 'createPrescription' | 'createMedicationRequest' | 'createServiceRequest'> }

function infusionGroupSignature(value: Pick<MedicationRequest, 'routeCode' | 'frequencyCode' | 'durationValue'>
  | Pick<MedicationPlanDraft, 'request'>) {
  const request = 'request' in value ? value.request : value
  return [request.routeCode?.trim().toUpperCase(), request.frequencyCode,
    String(request.durationValue ?? '')].join('|')
}

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

export async function persistOrderDrafts(
  encounterId: string | number,
  medDrafts: MedicationPlanDraft[],
  svcDrafts: ServicePlanDraft[],
  api: OrderDraftApi,
  existingPrescriptions: Prescription[] = [],
  autoSubmit = false,
) {
  if (medDrafts.length === 0 && svcDrafts.length === 0) return
  const encId = String(encounterId)

  if (medDrafts.length > 0) {
    if (typeof api.encounters?.batchOrderPrescriptions === 'function') {
      const items = medDrafts.map(draftToBatchItem)
      await api.encounters.batchOrderPrescriptions(encId, { items, autoSubmit })
    } else {
      const prescriptionsByCategory = new Map<string, Prescription[]>()
      const requestsByPrescription = new Map<string, MedicationRequest[]>()
      for (const value of existingPrescriptions) {
        if (value.status === 'DRAFT' && !value.documentInfo?.externalPrescription
          && !value.documentInfo?.specialDisease && !value.documentInfo?.diagnoses.length) {
          const values = prescriptionsByCategory.get(value.categoryCode) ?? []
          values.push(value)
          prescriptionsByCategory.set(value.categoryCode, values)
        }
        requestsByPrescription.set(value.id, [...value.medicationRequests])
      }

      const infusionRoots = new Map<string, string>()
      const infusionSignatures = new Map<string, string>()
      for (const prescription of existingPrescriptions) {
        for (const request of prescription.medicationRequests.filter((value) => value.status !== 'CANCELLED'
          && isInfusionRoute(value.routeCode, value.routeExecutionType))) {
          const rootId = request.parentRequestId || request.id
          infusionRoots.set(`request:${rootId}`, rootId)
          infusionSignatures.set(`request:${rootId}`, infusionGroupSignature(request))
        }
      }

      for (const draft of medDrafts) {
        const categoryPrescriptions = prescriptionsByCategory.get(draft.categoryCode) ?? []
        let prescription = draft.categoryCode === 'HERBAL'
          ? categoryPrescriptions[0]
          : categoryPrescriptions.find((value) => (requestsByPrescription.get(value.id) ?? [])
              .filter((request) => request.status !== 'CANCELLED').length < 5)
        if (!prescription) {
          prescription = await api.encounters.createPrescription(
            encId,
            draft.categoryCode,
            draft.categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊西药/中成药处方'
          )
          categoryPrescriptions.push(prescription)
          prescriptionsByCategory.set(draft.categoryCode, categoryPrescriptions)
          requestsByPrescription.set(prescription.id, [])
        }
        const existingRequests = requestsByPrescription.get(prescription.id) ?? []
        let parentRequestId: string | undefined
        if (isInfusionRoute(draft.request.routeCode, draft.routeExecutionType) && draft.administrationGroupKey) {
          const signature = infusionGroupSignature(draft)
          const existingSignature = infusionSignatures.get(draft.administrationGroupKey)
          if (existingSignature && existingSignature !== signature) {
            throw new Error('同一输液组的给药途径、频次和疗程必须一致')
          }
          parentRequestId = infusionRoots.get(draft.administrationGroupKey)
          infusionSignatures.set(draft.administrationGroupKey, signature)
        }
        const created = await api.encounters.createMedicationRequest(encId, {
          ...draft.request,
          prescriptionId: prescription.id,
          parentRequestId,
        })
        if (isInfusionRoute(draft.request.routeCode, draft.routeExecutionType) && draft.administrationGroupKey
          && !infusionRoots.has(draft.administrationGroupKey)) {
          infusionRoots.set(draft.administrationGroupKey, created.id)
        }
        existingRequests.push(created)
        requestsByPrescription.set(prescription.id, existingRequests)
      }
    }
  }

  for (const draft of svcDrafts) {
    await api.encounters.createServiceRequest(encId, {
      catalogItemId: draft.catalogItemId,
      quantity: draft.quantity,
      unitCode: draft.unitCode,
      priceType: 'SALE',
      pricingRequired: true,
      reason: '门诊诊疗申请',
      clinicalDescription: draft.clinicalDescription || '门诊医生站诊疗方案',
    })
  }
}

