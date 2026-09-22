import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { persistOrderDrafts, type OrderDraftApi } from '../orders/persistOrderDrafts'

type DraftSaveApi = OrderDraftApi & {
  encounters: Pick<RhnApi['encounters'], 'recordClinicalData' | 'prescriptions'>
}

interface ClinicalDraft {
  encounterId: string
  content: Omit<ClinicalRecordInput, 'commandCode'>
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
}

/** One instance per editor. Preserve the record command after a failure for safe record retries.
 * The existing record-then-orders sequence is not an atomic cross-endpoint transaction.
 * Order creation/partial-order retry semantics remain owned by persistOrderDrafts and the API.
 */
export function createClinicalDraftSaver(
  newCommand = (encounterId: string) => `RECORD-${encounterId}-${globalThis.crypto.randomUUID()}`,
) {
  let pending: { fingerprint: string; commandCode: string } | null = null
  return {
    async save(api: DraftSaveApi, draft: ClinicalDraft) {
      const { encounterId, content, medicationDrafts, serviceDrafts } = draft
      const fingerprint = JSON.stringify({ encounterId, content })
      if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, commandCode: newCommand(encounterId) }
      }
      const savedEncounter = await api.encounters.recordClinicalData(encounterId, {
        commandCode: pending.commandCode, ...content,
      })
      if (medicationDrafts.length || serviceDrafts.length) {
        const currentPrescriptions = await api.encounters.prescriptions(encounterId).catch(() => [])
        await persistOrderDrafts(encounterId, medicationDrafts, serviceDrafts, api, currentPrescriptions)
      }
      pending = null
      return savedEncounter
    },
  }
}
