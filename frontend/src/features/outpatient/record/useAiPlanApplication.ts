import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ClinicalAiDraftContext } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { clinicalAiContextFingerprint, mergeAiDiagnoses, mergeAiRecordDraft, aiRecordDraftFields,
  type ClinicalAiDraftRequest } from '../ai/aiDraftAdapter'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { resolveTemplateOrders } from '../templates/resolveTemplateOrders'
import { requireNoTemplateOrderConflicts } from '../templates/templateApplicationReceipt'
import { normalizeDiagnosisOrder, type RecordForm } from './clinicalRecordDraft'
import type { AiRecordUndo } from './useClinicalAiDraft'

export type PrepareAiPlan = (request: ClinicalAiDraftRequest) => Promise<() => void>

// Resolving returns a one-use commit, not partially staged clinical content.
export function useAiPlanApplication(input: {
  api: RhnApi; encounter: Encounter; blocked: boolean
  form: Pick<UseFormReturn<RecordForm>, 'getValues' | 'reset' | 'watch'>
  readContext: () => ClinicalAiDraftContext
  allergies: AllergyIntolerance[]; allergyReady: boolean
  diagnoses: DiagnosisInput[]; setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  medications: MedicationPlanDraft[]; setMedications: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  services: ServicePlanDraft[]; setServices: Dispatch<SetStateAction<ServicePlanDraft[]>>
  setUndo: Dispatch<SetStateAction<AiRecordUndo | null>>; onNotice: (message: string) => void
}): PrepareAiPlan {
  const latest = useRef(input), generation = useRef(0), mounted = useRef(false)
  latest.current = input
  const scope = JSON.stringify([input.encounter.id, input.encounter.residentId, input.encounter.organizationId,
    input.encounter.departmentId, input.encounter.clinicianId, input.blocked, input.allergyReady,
    clinicalAiContextFingerprint(input.readContext())])
  const previous = useRef({ api: input.api, scope })
  if (previous.current.api !== input.api || previous.current.scope !== scope) {
    generation.current += 1; previous.current = { api: input.api, scope }
  }
  useEffect(() => {
    mounted.current = true
    const subscription = input.form.watch(() => { generation.current += 1 })
    return () => { mounted.current = false; generation.current += 1; subscription.unsubscribe() }
  }, [input.form.watch])

  return useCallback(async source => {
    const state = latest.current, request = structuredClone(source), plan = request.planTemplate
    const token = ++generation.current
    const assertCurrent = () => {
      const current = latest.current, context = current.readContext()
      if (!mounted.current || generation.current !== token || current.blocked || context.busy
        || current.encounter.status !== 'IN_PROGRESS' || context.documentStatus === 'SIGNED'
        || request.encounterId !== current.encounter.id || request.residentId !== current.encounter.residentId
        || request.contextFingerprint !== clinicalAiContextFingerprint(context)) {
        throw new Error('当前就诊、草稿或工作上下文已变化，AI 方案本次未带入，请重新核对。')
      }
    }
    assertCurrent()
    if (!plan) throw new Error('AI 方案明细未确认，本次未带入。')
    requireNoTemplateOrderConflicts(plan, state.medications, state.services)
    const orders = await resolveTemplateOrders(plan, state.encounter, state.api, state.allergies, state.allergyReady)
    assertCurrent()
    // An explicit doctor acknowledgement is retained; no acknowledgement is inferred from an empty record.
    for (const item of orders.medications) {
      if (request.allergyReviewConfirmed === true) item.request.allergyReviewConfirmed = true
      if (request.allergyOverrideReason?.trim()) item.request.allergyOverrideReason = request.allergyOverrideReason.trim()
    }
    const before = state.form.getValues()
    const after = request.recordDraft ? mergeAiRecordDraft(before, request.recordDraft, request.overwriteRecord === true) : before
    const changed = aiRecordDraftFields.filter(field => before[field] !== after[field])
    const diagnoses = mergeAiDiagnoses(mergeAiDiagnoses(state.diagnoses, request.diagnoses ?? []), plan.diagnoses)
    const annotationsChanged = JSON.stringify(before.annotations) !== JSON.stringify(after.annotations)
    if (!changed.length && !annotationsChanged && diagnoses.length === state.diagnoses.length
      && !orders.medications.length && !orders.services.length) throw new Error('所选 AI 方案未改变当前草稿，未新增内容。')
    return () => {
      assertCurrent()
      requireNoTemplateOrderConflicts(plan, latest.current.medications, latest.current.services)
      generation.current += 1
      if (changed.length || annotationsChanged) {
        state.setUndo({ before: Object.fromEntries(changed.map(field => [field, before[field]])),
          after: Object.fromEntries(changed.map(field => [field, after[field]])),
          documentVersion: state.readContext().documentVersion,
          beforeAnnotations: before.annotations, afterAnnotations: after.annotations })
        state.form.reset(after, { keepDefaultValues: true })
      }
      state.setDiagnoses(normalizeDiagnosisOrder(diagnoses))
      state.setMedications(current => [...current, ...orders.medications])
      state.setServices(current => [...current, ...orders.services])
      state.onNotice(`已带入${request.sourceLabel}：${changed.length} 个病历字段、${diagnoses.length - state.diagnoses.length} 项诊断、${orders.medications.length} 项药品和 ${orders.services.length} 项诊疗医嘱，请核对后保存和开立。`)
    }
  }, [])
}
