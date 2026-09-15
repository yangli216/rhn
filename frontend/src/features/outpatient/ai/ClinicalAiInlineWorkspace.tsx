import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiTreatmentRows } from './ClinicalAiTreatmentRows'
import type { ReactNode } from 'react'
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
}

/** One analysis session, rendered beside the clinical objects it can help edit. */
export function ClinicalAiInlineWorkspace({ api, encounter, surfaces, context, capability, suggestion, current, busy,
  generating, inputBusy, preview, onView, disabled, canAdopt, error, voiceInput, interimTranscript, question, onQuestionChange, onClearVoice, onGenerate, onApply,
  onReviewPlan, onReviewTreatment, existingTreatmentKeys = [], onOpenDetail, onOpenHistory, onOpenResults, templatesPending, sceneAssessment, sceneLoading }: {
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
  onReviewPlan: (plan: ClinicalAiRecommendedPlan) => void
  onOpenDetail?: () => void
  onOpenHistory?: () => void
  onOpenResults?: () => void
  templatesPending: boolean
  sceneAssessment?: ReceptionSceneAssessment
  sceneLoading?: boolean
}) {
  const diagnosisFeature = capability.features.includes('TERMINOLOGY_VALIDATION')
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
  const availableTreatmentItems = planFeature
    ? (suggestion?.treatmentRecommendations ?? []).filter((item) => !existingTreatmentKeys.includes(treatmentKey(item))) : []
  const treatmentItems = current ? availableTreatmentItems : []
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
            <span className="doctor-diag-col-type"><span className="doctor-ai-pending-badge"><Icon name="sparkles" />AI 建议</span></span>
            <span className="doctor-diag-col-main"><span className="doctor-diag-name-wrap">
              <strong className="doctor-diag-name">{item.display}</strong><span className="doctor-diag-code-pill">{item.code}</span>
            </span></span>
            <span className="doctor-diag-col-domain"><span className="doctor-diag-badge is-secondary">待医生确认</span></span>
            <span className="doctor-diag-col-management" title={item.rationale || undefined}>{item.rationale || '请结合当前病历核对。'}</span>
            <span className="doctor-diag-col-actions"><Button size="sm" variant="secondary"
              disabled={disabled || busy || !canAdopt}
              onClick={() => onApply({ diagnoses: [{ code: item.code, display: item.display, type: item.type }] })}>确认录入</Button>
              <Button size="sm" variant="text" onClick={onOpenDetail}>查看依据</Button></span>
          </div>
        })}
      </div>, surfaces.diagnoses, 'diagnoses')}

    {current && planFeature && treatmentItems.length > 0 && portal(
      <ClinicalAiTreatmentRows key={`${context.encounterId}:${suggestion?.id}`} items={treatmentItems}
        api={api} encounter={encounter} disabled={disabled || busy || !canAdopt || !onReviewTreatment}
        onReview={(items) => onReviewTreatment?.(items)} />, surfaces.plans, 'treatments')}
    {current && planFeature && Boolean(suggestion?.recommendedPlans.length) && portal(
      <div className="doctor-ai-order-suggestions" aria-label="AI 院内方案待确认">
        {suggestion!.recommendedPlans.map((plan) => <div className="doctor-unified-order-row is-ai-suggestion is-plan"
          role="row" key={plan.templateId}>
          <span className="doctor-unified-cell-type"><span className="doctor-ai-pending-badge"><Icon name="sparkles" />方案</span></span>
          <span className="doctor-unified-cell-name"><strong>{plan.name}</strong></span>
          <span className="doctor-unified-cell-directions">包含诊断、药品及诊疗项目</span>
          <span className="doctor-unified-cell-qty">—</span>
          <span className="doctor-unified-cell-instruction">{plan.rationale || plan.description}</span>
          <span className="doctor-unified-cell-price">—</span>
          <span className="doctor-unified-cell-status"><span className="doctor-ai-review-status">AI 待确认</span></span>
          <span className="doctor-unified-cell-actions"><Button size="sm" variant="secondary"
            disabled={disabled || busy || !current || !canAdopt || templatesPending}
            onClick={() => onReviewPlan(plan)}>核对方案</Button></span>
        </div>)}
      </div>, surfaces.plans, 'plans')}
  </>
}

function treatmentKey(item: ClinicalAiTreatmentRecommendation) {
  return `${item.type}:${item.catalogItemId}`
}
