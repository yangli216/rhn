import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { ClinicalAiDraftContext, ClinicalAiRecordDraft } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import { aiRecordDraftFields, clinicalAiContextFingerprint, mergeAiDiagnoses, mergeAiRecordDraft, type ClinicalAiDraftRequest } from '../ai/aiDraftAdapter'
import { normalizeDiagnosisOrder, type RecordForm } from './clinicalRecordDraft'
import { aiContextFromDraft, type ClinicalAiContextState } from './clinicalAiDraftContext'

export interface AiRecordUndo {
  before: ClinicalAiRecordDraft
  after: ClinicalAiRecordDraft
  documentVersion: number
}

// Shared draft/undo data belongs to the editor; this hook owns AI subscriptions and adoption guards.
export function useClinicalAiDraft({ encounter, form, diagnoses, setDiagnoses, aiDraft,
  onAiDraftConsumed, onAiContextChange, context, businessBusy, aiRecordUndo, setAiRecordUndo,
  onNotice, onPlan }: {
  encounter: Encounter
  form: Pick<UseFormReturn<RecordForm>, 'getValues' | 'reset' | 'watch'>
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  aiDraft: ClinicalAiDraftRequest | null
  onAiDraftConsumed: () => void
  onAiContextChange: (context: ClinicalAiDraftContext | null) => void
  context: ClinicalAiContextState
  businessBusy: boolean
  aiRecordUndo: AiRecordUndo | null
  setAiRecordUndo: Dispatch<SetStateAction<AiRecordUndo | null>>
  onNotice: (message: string) => void
  onPlan: (request: ClinicalAiDraftRequest, diagnoses: DiagnosisInput[]) => void
}) {
  const { getValues, reset, watch } = form
  const { document, documentStatus, structuredFormId, structuredFormVersion, structuredValues,
    medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy } = context
  const processedAiDraft = useRef<string | null>(null)
  const buildAiContext = () => aiContextFromDraft(getValues(), diagnoses, encounter, {
    document, documentStatus, structuredFormId,
    structuredFormVersion, structuredValues,
    medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy,
  })
  useEffect(() => {
    const publish = () => onAiContextChange(aiContextFromDraft(getValues(), diagnoses, encounter, {
      document, documentStatus, structuredFormId,
      structuredFormVersion, structuredValues,
      medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy,
    }))
    publish()
    const subscription = watch(publish)
    return () => subscription.unsubscribe()
  }, [aiContextBusy, allergies, allergyState, diagnoses, document, documentStatus, encounter, getValues,
    medicationDrafts, onAiContextChange, structuredFormVersion, structuredFormId, serviceDrafts,
    structuredValues, watch])
  useEffect(() => () => onAiContextChange(null), [onAiContextChange])
  useEffect(() => {
    if (!aiDraft || processedAiDraft.current === aiDraft.requestId) return
    processedAiDraft.current = aiDraft.requestId
    const currentContext = buildAiContext()
    const wrongPatient = aiDraft.encounterId !== encounter.id || aiDraft.residentId !== encounter.residentId
    if (wrongPatient || businessBusy
      || clinicalAiContextFingerprint(currentContext) !== aiDraft.contextFingerprint) {
      onNotice(wrongPatient
        ? '当前患者或就诊已切换，系统已拒绝带入智医助理建议。'
        : businessBusy ? '当前正在保存、签署或处理医嘱，系统已拒绝带入智医助理建议，请稍后重试。'
          : '智医助理建议生成后当前草稿已变化，系统已拒绝带入；请重新分析。')
      onAiDraftConsumed(); return
    }
    if (aiDraft.planTemplate && allergyState !== 'READY') {
      onNotice('患者过敏信息尚未就绪，系统已拒绝带入诊疗方案；请核对后重新分析。')
      onAiDraftConsumed(); return
    }
    if (aiDraft.recordDraft) {
      const previous = getValues()
      const next = mergeAiRecordDraft(previous, aiDraft.recordDraft, aiDraft.overwriteRecord === true)
      const changedFields = aiRecordDraftFields
        .filter((field) => previous[field] !== next[field])
      if (changedFields.length) setAiRecordUndo({
        before: Object.fromEntries(changedFields.map((field) => [field, previous[field]])),
        after: Object.fromEntries(changedFields.map((field) => [field, next[field]])),
        documentVersion: document?.currentVersion ?? 0,
      })
      reset(next, { keepDefaultValues: true })
    }
    const diagnosesWithAi = aiDraft.diagnoses?.length
      ? mergeAiDiagnoses(diagnoses, aiDraft.diagnoses) : diagnoses
    if (aiDraft.diagnoses?.length) setDiagnoses(normalizeDiagnosisOrder(diagnosesWithAi))
    if (aiDraft.planTemplate) {
      onPlan(aiDraft, diagnosesWithAi)
    }
    onNotice(`已带入${aiDraft.sourceLabel}，内容仍是草稿，请逐项核对后保存和开立。`)
    onAiDraftConsumed()
  }, [aiDraft, allergies, allergyState, businessBusy, diagnoses, document, documentStatus, encounter,
    getValues, medicationDrafts, onAiDraftConsumed, reset, structuredFormVersion, structuredFormId,
    serviceDrafts, structuredValues, aiContextBusy, onPlan, onNotice, setAiRecordUndo, setDiagnoses])
  const canUndoAiRecord = Boolean(aiRecordUndo && document?.status !== 'SIGNED' && !businessBusy
    && aiRecordUndo.documentVersion === (document?.currentVersion ?? 0)
    && Object.entries(aiRecordUndo.after).every(([field, value]) =>
      getValues(field as keyof ClinicalAiRecordDraft) === value))
  const undoAiRecord = () => {
    if (!canUndoAiRecord || !aiRecordUndo) return
    reset({ ...getValues(), ...aiRecordUndo.before }, { keepDefaultValues: true })
    setAiRecordUndo(null)
    onNotice('已撤销本次 AI 病历采纳；诊断及医嘱草稿保留。')
  }

  return { buildAiContext, canUndoAiRecord, undoAiRecord }
}
