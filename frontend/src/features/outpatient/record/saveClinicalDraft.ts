import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { persistOrderDrafts, type OrderDraftApi } from '../orders/persistOrderDrafts'
import { requireClinicalDocument, requireClinicalEncounter, type ClinicalRecordTarget } from './clinicalRecordReceipt'

type DraftSaveApi = OrderDraftApi & {
  encounters: Pick<RhnApi['encounters'], 'recordClinicalData'>
  clinicalDocuments: Pick<RhnApi['clinicalDocuments'], 'byEncounter'>
}

interface ClinicalDraft extends ClinicalRecordTarget {
  content: Omit<ClinicalRecordInput, 'commandCode'>
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
}

/** One instance per editor. Preserve the record command after a failure for safe record retries.
 * The existing record-then-orders sequence is not an atomic cross-endpoint transaction.
 * Medication and service orders share one atomic, idempotent order-save endpoint.
 */
export function createClinicalDraftSaver(
  newCommand = (encounterId: string) => `RECORD-${encounterId}-${globalThis.crypto.randomUUID()}`,
) {
  type State = { pending: { fingerprint: string; commandCode: string } | null; orderCommands: Map<string, string> }
  const states = new WeakMap<DraftSaveApi, State>()
  let busy = false
  let sequence = 0
  let unresolvedApi: DraftSaveApi | undefined
  return {
    async save(api: DraftSaveApi, draft: ClinicalDraft, assertCurrent: () => void) {
      if (busy) throw new Error('草稿正在保存，请等待当前操作完成')
      busy = true
      const attempt = ++sequence
      try {
        assertCurrent()
        if (unresolvedApi && unresolvedApi !== api) {
          throw new Error('草稿保存未确认：原 API 会话仍有未确认的保存请求。请先重新加载并核实原操作，不能在新会话重复提交这些草稿')
        }
        const submitted = structuredClone(draft)
        const { encounterId, content, medicationDrafts, serviceDrafts } = submitted
        let state = states.get(api)
        if (!state) { state = { pending: null, orderCommands: new Map() }; states.set(api, state) }
        const fingerprint = JSON.stringify({ encounterId, content })
        if (state.pending?.fingerprint !== fingerprint) {
          state.pending = { fingerprint, commandCode: newCommand(encounterId) }
        }
        unresolvedApi = api
        const savedEncounter = await api.encounters.recordClinicalData(encounterId, {
          commandCode: state.pending.commandCode, ...content,
        })
        assertCurrent()
        const encounter = requireClinicalEncounter(submitted, content, savedEncounter)
        let documents
        try {
          documents = await api.clinicalDocuments.byEncounter(encounterId)
        } catch {
          assertCurrent()
          throw new Error('病历保存回执未确认：读取保存后的文书失败。医嘱尚未提交，草稿已保留；远端可能已保存，请核实后重试')
        }
        assertCurrent()
        const document = requireClinicalDocument(submitted, content, encounter, documents)
        if (medicationDrafts.length || serviceDrafts.length) {
          // Keep the key even after edits: a committed old payload must conflict rather than create duplicates.
          if (!state.orderCommands.has(encounterId)) state.orderCommands.set(encounterId, `ORDERS-${encounterId}-${globalThis.crypto.randomUUID()}`)
          await persistOrderDrafts(encounterId, medicationDrafts, serviceDrafts, api, state.orderCommands.get(encounterId)!)
          assertCurrent()
        }
        let applied = false
        return { encounter, document, documents, confirmApplied: () => {
          if (applied) return
          assertCurrent()
          if (attempt !== sequence) throw new Error('草稿保存未确认：已有新的保存请求，请核实当前草稿后重试')
          state.pending = null
          unresolvedApi = undefined
          if (medicationDrafts.length || serviceDrafts.length) state.orderCommands.delete(encounterId)
          applied = true
        } }
      } finally { busy = false }
    },
  }
}
