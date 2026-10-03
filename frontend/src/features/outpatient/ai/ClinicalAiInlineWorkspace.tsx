import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiTreatmentRows } from './ClinicalAiTreatmentRows'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext, ClinicalAiRecordDraft,
  ClinicalAiSuggestion, ClinicalAiRecommendedPlan, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import { Button, Icon } from '../../../shared/ui'
import type { ClinicalAiPreview } from '../../../shared/api/clinicalAiStream'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'

import { ClinicalAiCopilotHub } from './ClinicalAiCopilotHub'

export interface ClinicalAiSurfaces {
  summary: HTMLDivElement | null
  note: HTMLDivElement | null
  diagnoses: HTMLDivElement | null
  plans: HTMLDivElement | null
  detail: HTMLDivElement | null
}

export type ClinicalAiSurfaceRefs = Pick<Record<keyof ClinicalAiSurfaces,
  (element: HTMLDivElement | null) => void>, 'note' | 'diagnoses' | 'plans'>

export interface InlineAiSelection {
  recordDraft?: ClinicalAiRecordDraft
  diagnoses?: DiagnosisInput[]
  incrementalRecord?: boolean
}

/** One analysis session, rendered beside the clinical objects it can help edit. */
export function ClinicalAiInlineWorkspace({ api, encounter, surfaces, context, capability, suggestion, current, busy,
  generating, inputBusy, preview, onView, disabled, canAdopt, error, voiceInput, interimTranscript, question, onQuestionChange, onClearVoice, onGenerate, onApply,
  onFindPlans, planInputKey, stableVoiceTranscript, onReviewRecommendedPlan, onReviewTreatment, existingTreatmentKeys = [], onOpenDetail, onOpenHistory, onOpenResults,  sceneAssessment, sceneLoading }: {
  api: RhnApi
  encounter: Encounter
  surfaces: ClinicalAiSurfaces
  context: ClinicalAiDraftContext
  capability: ClinicalAiCapabilities
  suggestion: ClinicalAiSuggestion | null
  current: boolean
  busy: boolean
  generating: boolean
  inputBusy: boolean
  preview: ClinicalAiPreview
  onView: () => void
  disabled: boolean
  canAdopt: boolean
  error: string
  voiceInput: ReactNode
  interimTranscript?: string
  question: string
  onQuestionChange: (value: string) => void
  onClearVoice?: () => void
  onGenerate: (focus?: string) => Promise<string>
  onApply: (selection: InlineAiSelection) => void
  onReviewTreatment?: (items: ClinicalAiTreatmentRecommendation[]) => void
  existingTreatmentKeys?: string[]
  stableVoiceTranscript?: string
  planInputKey?: string
  onFindPlans?: () => Promise<ClinicalAiRecommendedPlan[]>
  onReviewRecommendedPlan?: (plan: ClinicalAiRecommendedPlan) => void
  onOpenDetail?: () => void
  onOpenHistory?: () => void
  onOpenResults?: () => void
  sceneAssessment?: ReceptionSceneAssessment
  sceneLoading?: boolean
}) {
  const session = context.encounterId
  const [diagnosisSelection, setDiagnosisSelection] = useState<{ session: string; excluded: string[] }>({ session: '', excluded: [] })
  const excludedDiagnoses = diagnosisSelection.session === session ? diagnosisSelection.excluded : []
  const diagnoses = (suggestion?.diagnosisCandidates ?? []).filter((item) =>
    !context.diagnoses.some((diagnosis) => diagnosis.code.toUpperCase() === item.code.toUpperCase()))
  const selectedDiagnoses = diagnoses.filter((item) => !excludedDiagnoses.includes(item.code))
  const diagnosisFeature = capability.features.includes('TERMINOLOGY_VALIDATION')
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
  const availableTreatmentItems = planFeature
    ? (suggestion?.treatmentRecommendations ?? []).filter((item) => !existingTreatmentKeys.includes(treatmentKey(item))) : []
  const portal = (node: ReactNode, target: HTMLDivElement | null, key: string) => target ? createPortal(node, target, key) : null

  return <>
    {portal(
      <ClinicalAiCopilotHub
        context={context}
        capability={capability}
        suggestion={suggestion}
        current={current}
        busy={busy}
        generating={generating}
        inputBusy={inputBusy}
        preview={preview}
        onView={onView}
        disabled={disabled}
        canAdopt={canAdopt}
        error={error}
        voiceInput={voiceInput}
        interimTranscript={interimTranscript}
        question={question}
        onQuestionChange={onQuestionChange}
        onClearVoice={onClearVoice}
        onGenerate={onGenerate}
        planInputKey={planInputKey}
        stableVoiceTranscript={stableVoiceTranscript}
        onFindPlans={onFindPlans}
        onReviewRecommendedPlan={onReviewRecommendedPlan}
        onApply={onApply}
        onOpenDetail={onOpenDetail}
        onOpenHistory={onOpenHistory}
        onOpenResults={onOpenResults}
        sceneAssessment={sceneAssessment}
        sceneLoading={sceneLoading}
        surfaces={surfaces}
      />,
      surfaces.note,
      'copilot-hub'
    )}

    {current && diagnosisFeature && Boolean(suggestion?.diagnosisCandidates.some((item) =>
      !context.diagnoses.some((diagnosis) => diagnosis.code.toUpperCase() === item.code.toUpperCase()))) && portal(
      <div className="doctor-ai-diagnosis-suggestions" aria-label="AI 诊断待确认">
        {suggestion!.diagnosisCandidates.map((item) => {
          const exists = context.diagnoses.some((diagnosis) => diagnosis.code.toUpperCase() === item.code.toUpperCase())
          if (exists) return null
          return <div className="doctor-diagnosis-row is-ai-suggestion" role="row" key={item.code}>
            <span className="doctor-diag-col-type"><label className="doctor-ai-order-select">
              <input type="checkbox" aria-label={`选择 ${item.display}`} checked={!excludedDiagnoses.includes(item.code)}
                disabled={disabled || busy || !canAdopt} onChange={() => setDiagnosisSelection({ session,
                  excluded: excludedDiagnoses.includes(item.code) ? excludedDiagnoses.filter((code) => code !== item.code) : [...excludedDiagnoses, item.code] })} />
              <span className="doctor-ai-pending-badge">AI 建议</span></label></span>
            <span className="doctor-diag-col-main"><span className="doctor-diag-name-wrap">
              <strong className="doctor-diag-name">{item.display}</strong><span className="doctor-diag-code-pill">{item.code}</span>
            </span></span>
            <span className="doctor-diag-col-domain"><span className="doctor-diag-badge is-secondary">待医生确认</span></span>
            <span className="doctor-diag-col-management" title={item.rationale || undefined}>{item.rationale || '请结合当前病历核对。'}</span>
            <span className="doctor-diag-col-actions"><Button size="sm" variant="secondary"
              disabled={disabled || busy || !canAdopt || excludedDiagnoses.includes(item.code)}
              onClick={() => onApply({ diagnoses: [{ code: item.code, display: item.display, type: item.type }] })}>确认录入</Button>
              <Button size="sm" variant="text" onClick={onOpenDetail}>查看依据</Button></span>
          </div>
        })}
        <div className="doctor-ai-order-batch is-diagnosis" role="row"><span>已选 {selectedDiagnoses.length} 项，核对后录入诊断。</span>
          <Button size="sm" disabled={disabled || busy || !canAdopt || selectedDiagnoses.length === 0}
            onClick={() => onApply({ diagnoses: selectedDiagnoses.map(({ code, display, type }) => ({ code, display, type })) })}>
            <Icon name="check" />确认所选诊断（{selectedDiagnoses.length}）</Button></div>
      </div>, surfaces.diagnoses, 'diagnoses')}

    {suggestion && planFeature && portal(
      <div hidden={!current || !availableTreatmentItems.length}><ClinicalAiTreatmentRows key={context.encounterId} items={availableTreatmentItems}
        api={api} encounter={encounter} disabled={disabled || busy || !canAdopt || !onReviewTreatment}
        onReview={(items) => onReviewTreatment?.(items)} /></div>, surfaces.plans, 'treatments')}

  </>
}

function treatmentKey(item: ClinicalAiTreatmentRecommendation) {
  return `${item.type}:${item.catalogItemId}`
}
