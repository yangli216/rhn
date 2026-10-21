import type { OrderDraftSaveInput, OrderDraftSaveReceipt, OrderSubmissionInput, OrderSubmissionResult } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { medicationSafetyBlocksSubmission, medicationSafetyReviewKey, needsMedicationSafetyAcknowledgement } from '../workstation/workstationShared'

/** Synthetic server receipt used only by tests; production always uses the HTTP response. */
export function orderDraftReceipt(encounterId: string, input: OrderDraftSaveInput): OrderDraftSaveReceipt {
  return { encounterId, commandCode: input.commandCode,
    prescriptions: input.medicationItems.map((item, index) => ({
      id: `rx-${index}`, revision: 0, encounterId, status: 'DRAFT', categoryCode: item.categoryCode,
      medicationRequests: [{ ...item, id: `med-${index}`, revision: 0, encounterId,
        prescriptionId: `rx-${index}`, status: 'DRAFT' }],
    })),
    services: input.serviceItems.map((item, index) => ({ ...item, id: `svc-${index}`, revision: 0, encounterId, status: 'DRAFT' })),
  } as OrderDraftSaveReceipt
}

/**
 * Test double for POST order-submissions, expressed through the per-document mocks so existing
 * assertions on evaluation, document info and prescription submission keep describing server behavior.
 */
export function orderSubmissionFake(api: RhnApi) {
  return async (encounterId: string, input: OrderSubmissionInput): Promise<OrderSubmissionResult> => {
    const evaluations = await Promise.all(input.prescriptions.map((entry) =>
      api.encounters.evaluatePrescriptionSafety(encounterId, entry.id)))
    const reviews = evaluations.filter(needsMedicationSafetyAcknowledgement)
    const reviewKey = reviews.length ? medicationSafetyReviewKey(reviews) : null
    if (input.dryRun || (reviewKey && reviewKey !== input.acknowledgedReviewKey)) {
      return { status: reviewKey ? 'REVIEW_REQUIRED' : 'READY', reviewKey, reviews, prescriptions: [], services: [] }
    }
    if (reviews.some(medicationSafetyBlocksSubmission)) throw new Error('合理用药审查未通过，当前处方不能提交')
    const prescriptions = []
    for (const entry of input.prescriptions) {
      let revision = entry.expectedRevision
      if (entry.documentInfo) {
        revision = (await api.encounters.updatePrescriptionDocumentInfo(encounterId, entry.id, revision, entry.documentInfo)).revision
      }
      prescriptions.push(await (entry.safetyReason
        ? api.encounters.submitPrescription(encounterId, entry.id, revision, entry.safetyReason)
        : api.encounters.submitPrescription(encounterId, entry.id, revision)))
    }
    const services = []
    for (const document of input.serviceDocuments) {
      // 申请草稿未改单据信息时由服务端默认关联主诊断并直接生效；替身只记录显式写入的单据信息。
      if (document.documentInfo) {
        services.push(await api.encounters.updateServiceDocumentInfo(encounterId, document.id, document.expectedRevision, document.documentInfo))
      }
    }
    return { status: 'SUBMITTED', reviewKey: null, reviews: [], prescriptions, services }
  }
}
