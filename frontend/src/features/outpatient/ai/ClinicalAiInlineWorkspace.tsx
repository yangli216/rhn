import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiTreatmentRows } from './ClinicalAiTreatmentRows'
import { ClinicalAiCatalogReview } from './ClinicalAiCatalogReview'
import { MedicalInsertViewerModal } from './MedicalInsertViewerModal'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext, ClinicalAiRecordDraft,
  ClinicalAiSuggestion, ClinicalAiRecommendedPlan, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import { IconButton, Button, Icon } from '../../../shared/ui'
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
  generating, inputBusy, preview, diagnosisBatchDismissed = false, onView, disabled, canAdopt, error, voiceInput, interimTranscript, question, onQuestionChange, onClearVoice, onGenerate, onApply,
  onFindPlans, planInputKey, stableVoiceTranscript, onReviewRecommendedPlan, onReviewTreatment, existingTreatmentKeys = [], onOpenDetail, onOpenHistory, onOpenResults, onOpenEvidenceChain, sceneAssessment, sceneLoading }: {
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
  diagnosisBatchDismissed?: boolean
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
  onOpenEvidenceChain?: (diagnosis: { code: string; display: string }) => void
  sceneAssessment?: ReceptionSceneAssessment
  sceneLoading?: boolean
}) {
  const session = `${context.encounterId}:${generating ? 'generating' : suggestion?.id ?? ''}`
  const [viewingGuideline, setViewingGuideline] = useState<string | null>(null)
  const [catalogSelection, setCatalogSelection] = useState<{ session: string; keys: string[]; items: ClinicalAiTreatmentRecommendation[] }>({ session: '', keys: [], items: [] })
  const resolvedCatalog = catalogSelection.session === session ? catalogSelection : { keys: [] as string[], items: [] as ClinicalAiTreatmentRecommendation[] }
  const [diagnosisSelection, setDiagnosisSelection] = useState<{ session: string; excluded: string[] }>({ session: '', excluded: [] })
  const excludedDiagnoses = diagnosisSelection.session === session ? diagnosisSelection.excluded : []
  const alreadyEntered = (code: string) => context.diagnoses.some(diagnosis =>
    diagnosis.codeSystem === 'WHO.BD.CS.ICD10' && diagnosis.diagnosisDomain === 'WESTERN_MEDICINE'
    && diagnosis.code.trim().toUpperCase() === code.trim().toUpperCase())
  const diagnosisCandidates = generating ? preview.diagnosisCandidates ?? []
    : diagnosisBatchDismissed ? [] : suggestion?.diagnosisCandidates ?? []
  const diagnoses = diagnosisCandidates.filter((item) =>
    !alreadyEntered(item.code))
  const selectedDiagnoses = diagnoses.filter((item) => !excludedDiagnoses.includes(item.code))
  const diagnosisFeature = capability.features.includes('TERMINOLOGY_VALIDATION')
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
  const treatmentItems = [...(generating ? preview.treatmentRecommendations ?? [] : suggestion?.treatmentRecommendations ?? []), ...resolvedCatalog.items]
  const availableTreatmentItems = planFeature
    ? [...new Map(treatmentItems.map(item => [treatmentKey(item), item])).values()]
      .filter((item) => !existingTreatmentKeys.includes(treatmentKey(item))) : []
  const pendingMatches = planFeature && !generating ? (suggestion?.treatmentMatches ?? [])
    .filter(match => !resolvedCatalog.keys.includes(match.key)) : []
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

    {(current || generating) && diagnosisFeature && diagnoses.length > 0 && portal(
      <div className="doctor-ai-diagnosis-suggestions" aria-label="AI 诊断待确认">
        {diagnosisCandidates.map((item) => {
          const exists = alreadyEntered(item.code)
          if (exists) return null
          return <div className="doctor-diagnosis-row is-ai-suggestion" role="row" key={item.code}>
            <span className="doctor-diag-col-type"><label className="doctor-ai-order-select">
              <input type="checkbox" aria-label={`选择 ${item.display}`} checked={!excludedDiagnoses.includes(item.code)}
                disabled={disabled || busy || generating || !canAdopt} onChange={() => setDiagnosisSelection({ session,
                  excluded: excludedDiagnoses.includes(item.code) ? excludedDiagnoses.filter((code) => code !== item.code) : [...excludedDiagnoses, item.code] })} />
              <span className="doctor-ai-pending-badge">AI 建议</span></label></span>
            <span className="doctor-diag-col-main"><span className="doctor-diag-name-wrap">
              <strong className="doctor-diag-name">{item.display}</strong>
              <span className="doctor-diag-code-pill">{item.code}</span>
              <IconButton icon="book-open" label="指南"
                title={`在临床知识库中查阅《${item.display}》相关指南`}
                onClick={(e) => {
                  e.stopPropagation()
                  setViewingGuideline(item.display)
                }}
              />
            </span></span>
            <span className="doctor-diag-col-domain"><span className="doctor-diag-badge is-secondary">待医生确认</span></span>
            <span className="doctor-diag-col-management">—</span>
            <span className="doctor-diag-col-actions">
              <Button size="sm" variant="text"
                title="查看循证推导检查点清单与指南依据"
                onClick={() => onOpenEvidenceChain ? onOpenEvidenceChain({ code: item.code, display: item.display }) : onOpenDetail?.()}>
                <Icon name="info" />为什么推荐？
              </Button></span>
          </div>
        })}
        <div className="doctor-ai-order-batch is-diagnosis" role="row"><span>{generating ? '诊断建议已生成，正在整理医嘱，完成后可确认。' : `已选 ${selectedDiagnoses.length} 项，核对后录入诊断。`}</span>
          <Button size="sm" disabled={disabled || busy || generating || !canAdopt || selectedDiagnoses.length === 0}
            onClick={() => onApply({ diagnoses: selectedDiagnoses.map(({ code, display, type }) => ({ code, display, type })) })}>
            <Icon name="check" />确认所选诊断（{selectedDiagnoses.length}）</Button></div>
      </div>, surfaces.diagnoses, 'diagnoses')}

    {(suggestion || generating) && planFeature && portal(
      <div hidden={!(current || generating) || (!availableTreatmentItems.length && !pendingMatches.length)}>
        <ClinicalAiCatalogReview key={`catalog:${session}`} matches={pendingMatches} api={api} encounterId={encounter.id} organizationId={encounter.organizationId}
          disabled={disabled || busy || generating || !canAdopt || !onReviewTreatment}
          onResolved={(keys, items) => setCatalogSelection({ session, keys: [...resolvedCatalog.keys, ...keys],
            items: [...new Map([...resolvedCatalog.items, ...items].map(item => [treatmentKey(item), item])).values()] })} />
        <ClinicalAiTreatmentRows key={context.encounterId} items={availableTreatmentItems}
        api={api} encounter={encounter} disabled={disabled || busy || generating || !canAdopt || !onReviewTreatment}
        onReview={(items) => onReviewTreatment?.(items)} /></div>, surfaces.plans, 'treatments')}

    <MedicalInsertViewerModal
      isOpen={Boolean(viewingGuideline)}
      onClose={() => setViewingGuideline(null)}
      target={viewingGuideline ? { name: viewingGuideline, type: 'guideline' } : null}
      api={api}
    />
  </>
}

function treatmentKey(item: ClinicalAiTreatmentRecommendation) {
  return `${item.type}:${item.catalogItemId}`
}
