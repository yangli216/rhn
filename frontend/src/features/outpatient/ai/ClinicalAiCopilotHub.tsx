import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext,
  ClinicalAiSuggestion, ClinicalAiRecommendedPlan } from '../../../shared/api/clinicalAiApi'
import { Button, FormField, Icon, StatusBadge } from '../../../shared/ui'
import type { ClinicalAiPreview } from '../../../shared/api/clinicalAiStream'
import { clinicalAiDraftStatusPresentation } from '../../../shared/presentation'
import { aiRecordDraftFields, aiRecordDraftValue, aiVitalDefinitions, formatAiRecordDraftValue,
  isAiVitalField, recordDraftFieldLabels, type AiRecordDraftField } from './aiDraftAdapter'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import { ClinicalAiPipelineStepper } from './ClinicalAiPipelineStepper'
import { useStableVoiceCopilot } from './useStableVoiceCopilot'
import { clinicalAiContextFingerprint, stableClinicalAiFingerprint } from './aiDraftAdapter'
import { copilotNextStep } from './copilotNextStep'
import type { ClinicalAiSurfaces, InlineAiSelection } from './ClinicalAiInlineWorkspace'
import { buildChronicRefillPrompt } from './chronicRefillPromptBuilder'
import { ChronicRefillQuickPanel } from './ChronicRefillQuickPanel'
import { NextStepQuickPanel } from './NextStepQuickPanel'
import { ReportFollowUpQuickPanel } from './ReportFollowUpQuickPanel'
import { buildReportFollowUpPrompt } from './reportFollowUpPrompt'
import type { ChronicRefillController } from './useChronicRefill'
import { RecordExpansionTrigger } from './RecordExpansionTrigger'
import { canExpandRecord, hasRecordNarrative, pickRecordExpansion, recordExpansionTargets } from './recordExpansion'
import type { ClinicalAiGenerateOptions } from './ClinicalAiInlineWorkspace'

export type ClinicalAiGeneratingTarget = 'DIAGNOSES' | 'TREATMENTS'
const generatingTargetText = (target: ClinicalAiGeneratingTarget) => target === 'DIAGNOSES' ? '正在推荐诊断…' : '正在推荐医嘱…'

export interface ClinicalAiCopilotHubProps {
  context: ClinicalAiDraftContext
  capability: ClinicalAiCapabilities
  suggestion: ClinicalAiSuggestion | null
  current: boolean
  busy: boolean
  generating: boolean
  /** Set when the running generation only recommends diagnoses or orders, not the record. */
  generatingTarget?: ClinicalAiGeneratingTarget
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
  onGenerate: (focus?: string, options?: ClinicalAiGenerateOptions) => Promise<string>
  stableVoiceTranscript?: string
  planInputKey?: string
  onFindPlans?: (options?: { preview?: boolean }) => Promise<ClinicalAiRecommendedPlan[]>
  onReviewRecommendedPlan?: (plan: ClinicalAiRecommendedPlan) => void
  onApply: (selection: InlineAiSelection) => void
  onOpenDetail?: () => void
  onOpenHistory?: () => void
  onOpenResults?: () => void
  sceneAssessment?: ReceptionSceneAssessment
  sceneLoading?: boolean
  surfaces: ClinicalAiSurfaces
  /** Shared chronic refill session; drives the auto-opened quick panel. */
  chronicRefill?: ChronicRefillController
}

export function ClinicalAiCopilotHub({
  context, capability, suggestion, current, busy, generating, generatingTarget, inputBusy, preview,
  onView, disabled, canAdopt, error, voiceInput, interimTranscript, question,
  onQuestionChange, onClearVoice, onGenerate, planInputKey, stableVoiceTranscript, onFindPlans, onReviewRecommendedPlan, onApply, onOpenDetail, onOpenHistory,
  onOpenResults, sceneAssessment, sceneLoading, surfaces, chronicRefill,
}: ClinicalAiCopilotHubProps) {
  const [findingPlans, setFindingPlans] = useState(false)
  const [planError, setPlanError] = useState('')
  const [planChoice, setPlanChoice] = useState<{ plans: ClinicalAiRecommendedPlan[]; focus?: string; auto: boolean; key: string }>()
  const inputIdentity = planInputKey ?? `${clinicalAiContextFingerprint(context)}:${question}`
  const latestPlanInput = useRef(inputIdentity)
  latestPlanInput.current = inputIdentity
  const requestSequence = useRef(0)
  useEffect(() => {
    requestSequence.current++
    setPlanChoice(undefined); setPlanError(''); setFindingPlans(false)
  }, [inputIdentity])
  useEffect(() => () => { requestSequence.current++ }, [])
  const [hubOpen, setHubOpen] = useState(false)
  const [refillPanelOpen, setRefillPanelOpen] = useState(false)
  const [reportPanelOpen, setReportPanelOpen] = useState(false)
  const reportAutoShownFor = useRef<string | null>(null)
  const [nextPanelOpen, setNextPanelOpen] = useState(false)
  const refillAutoShownFor = useRef<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [fields, setFields] = useState<string[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const appliedSuggestionId = useRef<string | null>(null)
  const incrementalAdoption = useRef(false)
  /** Suggestion id whose adoption is limited to the chief complaint and still-empty expansion targets. */
  const expansionSuggestionId = useRef<string | null>(null)
  const latestContext = useRef(context)
  latestContext.current = context
  const [expanding, setExpanding] = useState(false)
  const [expansionError, setExpansionError] = useState('')
  const awaitingTemplate = useRef<string | null>(null)
  const hubRef = useRef<HTMLDivElement>(null)
  const composerInputId = useId()
  useEffect(() => {
    awaitingTemplate.current = null; appliedSuggestionId.current = null; expansionSuggestionId.current = null
    setExpansionError('')
  }, [context.encounterId])

  useEffect(() => {
    setFields([])
    setEdited({})
  }, [suggestion?.id])

  useEffect(() => {
    if (interimTranscript) {
      setHubOpen(true)
    }
  }, [interimTranscript])

  useEffect(() => {
    if (current && (reviewOpen || summaryOpen)) {
      onView()
    }
  }, [current, reviewOpen, summaryOpen, onView])

  const recordFeature = capability.features.includes('RECORD_COMPLETENESS')
  const expansionAvailable = recordFeature && capability.features.includes('RECORD_EXPANSION') && canExpandRecord(context)
  const entries = recordFeature && current ? aiRecordDraftFields.filter((field) =>
    aiRecordDraftValue(field, suggestion?.recordDraft[field]) !== undefined) : []
  const editedValue = (field: AiRecordDraftField) => {
    const value = edited[field]
    return aiRecordDraftValue(field, value === undefined ? suggestion?.recordDraft[field]
      : isAiVitalField(field) ? value.trim() ? Number(value) : undefined : value)
  }
  const selectedFields = entries.filter((field) => fields.includes(field)
    && editedValue(field) !== undefined)
  const comparisonLabel = entries.some(isAiVitalField) ? '病历对照' : '段落对照'
  const selectionCount = selectedFields.length
  const adoptionDisabled = disabled || busy || !current || !canAdopt || selectionCount === 0

  const toggle = (values: string[], key: string) => values.includes(key)
    ? values.filter((value) => value !== key) : [...values, key]

  const applySelection = () => onApply({
    recordDraft: selectedFields.length ? { ...Object.fromEntries(selectedFields
      .map((field) => [field, editedValue(field)])), annotations: suggestion?.recordDraft.annotations
        ?.filter((mark) => selectedFields.includes(mark.field) && edited[mark.field] === undefined) } : undefined,
  })

  const generate = async (focus?: string, skipPlans = false) => {
    if (!skipPlans && await offerPlans(false, focus)) return
    appliedSuggestionId.current = null
    setReviewOpen(true)
    void onGenerate(focus).catch(() => undefined)
  }

  const generateAndApply = async (presetPrompt?: string, skipPlans = false) => {
    if (disabled || busy || !canAdopt || !recordFeature || sceneLoading) return
    if (!skipPlans && presetPrompt && onFindPlans) { onQuestionChange(presetPrompt); return }
    if (!skipPlans && !presetPrompt && await offerPlans(true, 'RECORD')) return
    if (presetPrompt) {
      onQuestionChange(presetPrompt)
    }
    appliedSuggestionId.current = null
    incrementalAdoption.current = false
    try {
      const id = await onGenerate('RECORD')
      appliedSuggestionId.current = id || null
    } catch {
      appliedSuggestionId.current = null
    }
  }

  async function offerPlans(auto: boolean, focus?: string) {
    if (!onFindPlans) return false
    const key = inputIdentity, request = ++requestSequence.current
    setFindingPlans(true); setPlanError(''); setPlanChoice(undefined)
    try {
      const plans = await onFindPlans()
      if (request !== requestSequence.current || key !== latestPlanInput.current) return true
      if (plans.length) { setPlanChoice({ plans, auto, focus, key }); return true }
      return false
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return true
      if (request === requestSequence.current) setPlanError(error instanceof Error ? error.message : '方案匹配失败，请重试。')
      return true
    } finally {
      if (request === requestSequence.current) setFindingPlans(false)
    }
  }

  const expansionBlocked = disabled || busy || generating || findingPlans || !canAdopt || Boolean(sceneLoading)
  const expandRecord = async () => {
    if (!expansionAvailable || expansionBlocked || expanding) return
    setExpanding(true); setExpansionError('')
    appliedSuggestionId.current = null
    expansionSuggestionId.current = null
    try {
      const id = await onGenerate(undefined, { intent: 'RECORD_EXPANSION' })
      expansionSuggestionId.current = id || null
      appliedSuggestionId.current = id || null
    } catch (failure) {
      appliedSuggestionId.current = null
      // Cancellation follows the doctor editing the record; only real failures are worth surfacing here.
      if ((failure as Error)?.name !== 'AbortError') {
        setExpansionError(failure instanceof Error && failure.message ? failure.message : '扩写病历失败，请重试。')
      }
    } finally {
      setExpanding(false)
    }
  }

  const generateFromSpeech = async (skipPlans = false) => {
    setHubOpen(true)
    if (!skipPlans && await offerPlans(true, 'VOICE')) return
    appliedSuggestionId.current = null
    incrementalAdoption.current = true
    const id = await onGenerate(skipPlans ? 'RECORD' : undefined)
    appliedSuggestionId.current = id || null
  }
  useStableVoiceCopilot({ scope: context.encounterId, transcript: stableVoiceTranscript ?? '',
    inputKey: inputIdentity, enabled: !disabled && canAdopt && recordFeature,
    busy: busy || generating || findingPlans || Boolean(sceneLoading),
    run: () => generateFromSpeech(Boolean(context.annotations?.some((mark) => mark.source === 'TEMPLATE'))),
  })
  // After a recommended template is actually brought into the editor, adapt its variables to the same dictation.
  const templateMarks = JSON.stringify(context.annotations?.filter((mark) => mark.source === 'TEMPLATE') ?? [])
  useEffect(() => {
    if (!awaitingTemplate.current || awaitingTemplate.current === templateMarks || templateMarks === '[]'
      || disabled || busy || generating || !stableVoiceTranscript) return
    awaitingTemplate.current = null
    void generateFromSpeech(true).catch(() => undefined)
  }, [templateMarks, disabled, busy, generating, stableVoiceTranscript])

  useEffect(() => {
    if (!appliedSuggestionId.current || !current || !suggestion || appliedSuggestionId.current !== suggestion.id) return
    appliedSuggestionId.current = null
    if (expansionSuggestionId.current === suggestion.id) {
      expansionSuggestionId.current = null
      // Overwrite only replaces the chief complaint; every other picked field is still empty in the editor.
      const recordDraft = pickRecordExpansion(suggestion.recordDraft, recordExpansionTargets(latestContext.current))
      if (Object.keys(recordDraft).some((field) => field !== 'annotations')) onApply({ recordDraft, incrementalRecord: false })
      return
    }
    const validEntries = aiRecordDraftFields.filter((field) =>
      aiRecordDraftValue(field, suggestion.recordDraft[field]) !== undefined)
    if (validEntries.length === 0) return
    onApply({
      recordDraft: { ...Object.fromEntries(validEntries.map((field) => [field, suggestion.recordDraft[field]])),
        annotations: suggestion.recordDraft.annotations },
      incrementalRecord: incrementalAdoption.current,
    })
  }, [current, onApply, suggestion])

  // Close on Escape key
  useEffect(() => {
    if (!hubOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHubOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [hubOpen])

  // Determine pill scene tag & label
  const isChronic = sceneAssessment?.scene === 'CHRONIC_REFILL'
  const refillReady = Boolean(isChronic && chronicRefill?.ready && chronicRefill.encounterId === context.encounterId)
  const refillBlocked = disabled || busy || !canAdopt || !recordFeature || Boolean(sceneLoading)
  // The guide waits for the stable-plan query so it opens once in its final form (refill or record-only).
  // A record-only guide (no refillable plan) is moot once the narrative exists, so it never interrupts a written record.
  const guideUseful = Boolean(chronicRefill?.ready) || !hasRecordNarrative(context)
  const chronicGuideReady = Boolean(isChronic && chronicRefill && !chronicRefill.loading
    && chronicRefill.encounterId === context.encounterId && guideUseful)

  // Lightweight chronic follow-up guide: auto-open when the scene is first recognized, and again whenever the
  // recognition changes meaningfully (a different set of matched conditions, or the scene was lost and regained
  // after the chief complaint was revised). Plain edits that keep the same recognition never re-open it.
  const guideKey = `${context.encounterId}|${[...(sceneAssessment?.matchedConditions ?? [])].sort().join(',')}`
  useEffect(() => { setRefillPanelOpen(false) }, [context.encounterId])
  useEffect(() => {
    if (sceneAssessment && !sceneLoading && !isChronic) refillAutoShownFor.current = null
  }, [sceneAssessment, sceneLoading, isChronic])
  useEffect(() => {
    if (!chronicGuideReady || refillBlocked || chronicRefill?.adopted || hubOpen) return
    if (refillAutoShownFor.current === guideKey) return
    refillAutoShownFor.current = guideKey
    setRefillPanelOpen(true)
  }, [chronicGuideReady, refillBlocked, chronicRefill?.adopted, hubOpen, guideKey])
  useEffect(() => {
    // Opening the full hub counts as having seen the shortcut for the current recognition.
    if (hubOpen) refillAutoShownFor.current = guideKey
    if (hubOpen || chronicRefill?.adopted || !chronicGuideReady) setRefillPanelOpen(false)
  }, [hubOpen, chronicRefill?.adopted, chronicGuideReady, guideKey])
  useEffect(() => {
    if (!refillPanelOpen) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setRefillPanelOpen(false) }
    const outside = (event: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(event.target as Node)) setRefillPanelOpen(false)
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('mousedown', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('mousedown', outside)
    }
  }, [refillPanelOpen])

  // Report follow-up guide: opens once per encounter while the record is still unwritten, then stays out of the way.
  const reportGuideReady = sceneAssessment?.scene === 'REPORT_FOLLOW_UP' && !hasRecordNarrative(context)
  useEffect(() => { setReportPanelOpen(false) }, [context.encounterId])
  useEffect(() => {
    if (!reportGuideReady || refillBlocked || hubOpen || reportAutoShownFor.current === context.encounterId) return
    reportAutoShownFor.current = context.encounterId
    setReportPanelOpen(true)
  }, [reportGuideReady, refillBlocked, hubOpen, context.encounterId])
  useEffect(() => {
    if (hubOpen) reportAutoShownFor.current = context.encounterId
    if (hubOpen || !reportGuideReady) setReportPanelOpen(false)
  }, [hubOpen, reportGuideReady, context.encounterId])
  useEffect(() => {
    if (!reportPanelOpen) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setReportPanelOpen(false) }
    const outside = (event: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(event.target as Node)) setReportPanelOpen(false)
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('mousedown', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('mousedown', outside)
    }
  }, [reportPanelOpen])
  const emptyMedications = stableClinicalAiFingerprint('medications', [])
  const emptyServices = stableClinicalAiFingerprint('services', [])
  const hasOrders = context.medicationDraftFingerprint !== emptyMedications
    || context.serviceDraftFingerprint !== emptyServices
  // Proofread whole plans are looked up quietly once per distinct complaint/diagnosis/scene, after typing settles.
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
  const templateApplied = Boolean(context.annotations?.some((mark) => mark.source === 'TEMPLATE'))
  const planTrigger = `${context.encounterId}|${context.chiefComplaint?.trim() ?? ''}|${context.diagnoses.map((item) => item.code).sort().join(',')}|${sceneAssessment?.scene ?? ''}`
  const planLookupReady = Boolean(onFindPlans) && planFeature && !disabled && canAdopt && !busy && !generating
    && !sceneLoading && !templateApplied && !hasOrders && Boolean(context.chiefComplaint?.trim() || context.diagnoses.length)
  const [matchedPlans, setMatchedPlans] = useState<{ trigger: string; plans: ClinicalAiRecommendedPlan[] }>({ trigger: '', plans: [] })
  const planLookedUp = useRef(new Set<string>())
  const findPlansRef = useRef(onFindPlans)
  findPlansRef.current = onFindPlans
  useEffect(() => {
    if (!planLookupReady || findingPlans || planLookedUp.current.has(planTrigger)) return
    const timer = window.setTimeout(() => {
      planLookedUp.current.add(planTrigger)
      findPlansRef.current?.({ preview: true }).then((plans) => setMatchedPlans({ trigger: planTrigger, plans }))
        .catch(() => undefined)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [planLookupReady, planTrigger, findingPlans])
  // Transient busy states must not retract a shown offer; only a plan being applied or orders appearing does.
  const availablePlans = matchedPlans.trigger === planTrigger && !templateApplied && !hasOrders ? matchedPlans.plans : []
  const nextStep = disabled || !canAdopt || !recordFeature ? undefined
    : copilotNextStep(context, hasOrders, sceneAssessment?.scene, availablePlans)
  const reviewPlan = (plan: ClinicalAiRecommendedPlan) => {
    awaitingTemplate.current = templateMarks
    setNextPanelOpen(false); setHubOpen(false)
    onReviewRecommendedPlan?.(plan)
  }
  const runNextStep = () => {
    if (!nextStep || busy || generating || findingPlans || sceneLoading) return
    if (nextStep.kind === 'PLAN') {
      // "No plan, generate instead": mark this lookup as declined so the AI draft path takes over.
      setMatchedPlans({ trigger: '', plans: [] })
      void onGenerate('RECORD').catch(() => undefined)
      return
    }
    if (nextStep.kind === 'RECORD') {
      appliedSuggestionId.current = null
      incrementalAdoption.current = true
      void onGenerate('RECORD').then((id) => { appliedSuggestionId.current = id || null }).catch(() => undefined)
      return
    }
    // Diagnoses and orders arrive as inline suggestions; the hub stays closed so the doctor keeps working.
    // Each step asks only for its own result: no record rewrite, and orders never re-recommend diagnoses.
    appliedSuggestionId.current = null
    const intent = nextStep.kind === 'DIAGNOSIS' ? 'DIAGNOSIS_RECOMMENDATION' : 'TREATMENT_RECOMMENDATION'
    void onGenerate(undefined, { intent }).catch(() => undefined)
  }

  // Next-step shortcut: an inline segment on the pill. Only the plan step opens a list, and only when the doctor asks.
  const nextKey = nextStep ? `${context.encounterId}:${nextStep.kind}` : ''
  const nextBlocked = busy || generating || findingPlans || Boolean(sceneLoading)
  useEffect(() => { if (!nextKey || hubOpen) setNextPanelOpen(false) }, [nextKey, hubOpen])
  useEffect(() => {
    if (!nextPanelOpen) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setNextPanelOpen(false) }
    const outside = (event: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(event.target as Node)) setNextPanelOpen(false)
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('mousedown', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('mousedown', outside)
    }
  }, [nextPanelOpen])
  const generateReportRecordNow = () => {
    if (refillBlocked || !sceneAssessment) return
    void generateRefillRecord(buildReportFollowUpPrompt(sceneAssessment)).catch(() => undefined)
  }

  /** Routes refill generation through the hub so the record draft is adopted when it returns. */
  const generateRefillRecord = async (focus?: string) => {
    appliedSuggestionId.current = null
    incrementalAdoption.current = false
    const id = await onGenerate(focus)
    appliedSuggestionId.current = id || null
    return id
  }
  const runChronicRefill = () => {
    if (!chronicRefill || refillBlocked) return
    chronicRefill.applyRefill(generateRefillRecord)
  }
  const chronicRecordFocus = () => buildChronicRefillPrompt({
    encounter: { systolic: context.systolic, diastolic: context.diastolic },
    matchedConditions: sceneAssessment?.matchedConditions ?? [],
    medications: chronicRefill?.medications ?? [],
    safetyAssessment: chronicRefill?.safetyAssessment,
  }).aiFocusPrompt
  const generateChronicRecord = () => { void generateAndApply(chronicRecordFocus()) }
  /** Guide shortcut: generate and auto-adopt the follow-up record right away, without the plan-choice detour. */
  const generateChronicRecordNow = () => {
    if (refillBlocked) return
    void generateRefillRecord(chronicRecordFocus()).catch(() => undefined)
  }

  const isReport = sceneAssessment?.scene === 'REPORT_FOLLOW_UP'
  const scenePillText = isChronic ? '慢病复诊'
    : isReport ? `报告回诊${sceneAssessment?.selectedReportIds.length ? ` (${sceneAssessment.selectedReportIds.length})` : ''}`
    : ''

  const toggleHub = () => {
    setHubOpen(!hubOpen)
    onView()
  }

  return (
    <div className={`doctor-ai-copilot-hub ${hubOpen ? 'is-expanded' : ''}`} ref={hubRef}>
      {surfaces.chiefComplaint && (expansionAvailable || expanding) && (
        <RecordExpansionTrigger surface={surfaces.chiefComplaint} disabled={expansionBlocked} expanding={expanding}
          error={expansionError} onExpand={() => { void expandRecord() }} />
      )}
      {/* Title Bar Compact Pill Entry: title / next-step action / caret are sibling buttons of one capsule */}
      <div className={`doctor-ai-copilot-pill is-${sceneAssessment?.badgeTone ?? 'brand'} ${generating ? 'is-generating' : ''} ${hubOpen ? 'is-active' : ''}`}>
        <button
          type="button"
          className="doctor-ai-copilot-pill__main"
          aria-expanded={hubOpen}
          aria-label="AI 辅诊"
          title="点击展开 AI 辅诊中心、情境识别与场景快捷操作"
          onClick={toggleHub}
        >
          <span className="doctor-ai-copilot-pill__icon" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <strong className="doctor-ai-copilot-pill__title">AI 辅诊</strong>
          {generating ? (
            <span className="doctor-ai-copilot-pill__status">
              <span className="doctor-ai-copilot-pill__pulse" />
              {generatingTarget ? generatingTargetText(generatingTarget) : '正在共写…'}
            </span>
          ) : !nextStep && scenePillText ? (
            <span className="doctor-ai-copilot-pill__tag">{scenePillText}</span>
          ) : !nextStep && current ? (
            <span className="doctor-ai-copilot-pill__dot is-ready" title="建议已准备好" />
          ) : null}
        </button>
        {!generating && nextStep && (
          <button
            type="button"
            className="doctor-ai-copilot-pill__action"
            title={nextStep.hint}
            disabled={nextBlocked}
            aria-expanded={nextStep.kind === 'PLAN' ? nextPanelOpen : undefined}
            onClick={() => {
              if (nextStep.kind === 'PLAN') setNextPanelOpen((open) => !open)
              else runNextStep()
            }}
          >
            {nextStep.kind === 'PLAN' ? `核对方案 (${availablePlans.length})` : nextStep.action}
          </button>
        )}
        <button
          type="button"
          className="doctor-ai-copilot-pill__toggle"
          aria-hidden="true"
          tabIndex={-1}
          onClick={toggleHub}
        >
          <Icon name={hubOpen ? 'chevron-up' : 'chevron-down'} className="doctor-ai-copilot-pill__caret" />
        </button>
      </div>

      {nextPanelOpen && nextStep && !hubOpen && (
        <NextStepQuickPanel step={nextStep} plans={availablePlans} onReviewPlan={reviewPlan} disabled={nextBlocked}
          onRun={() => { setNextPanelOpen(false); runNextStep() }}
          onOpenHub={() => { setNextPanelOpen(false); setHubOpen(true); onView() }}
          onClose={() => setNextPanelOpen(false)} />
      )}

      {reportPanelOpen && sceneAssessment && !hubOpen && (
        <ReportFollowUpQuickPanel scene={sceneAssessment} generateDisabled={refillBlocked}
          onGenerateRecord={() => { setReportPanelOpen(false); generateReportRecordNow() }}
          onOpenResults={onOpenResults ? () => { setReportPanelOpen(false); onOpenResults() } : undefined}
          onOpenHub={() => { setReportPanelOpen(false); setHubOpen(true); onView() }}
          onClose={() => setReportPanelOpen(false)} />
      )}

      {refillPanelOpen && chronicRefill && !hubOpen && (
        <ChronicRefillQuickPanel
          refill={chronicRefill}
          onRefill={runChronicRefill}
          refillDisabled={refillBlocked}
          onGenerateRecord={() => { setRefillPanelOpen(false); generateChronicRecordNow() }}
          sceneSummary={sceneAssessment?.summaryText}
          onClose={() => setRefillPanelOpen(false)}
          onOpenHub={() => { setRefillPanelOpen(false); setHubOpen(true); onView() }}
        />
      )}

      {/* Floating Command Palette Popover */}
      {hubOpen && (
        <div className="doctor-ai-copilot-popover" role="dialog" aria-label="AI 临床辅诊中枢">
          {/* Popover Header */}
          <header className="doctor-ai-copilot-popover__head">
            <div className="doctor-ai-copilot-popover__title-wrap">
              <span className="doctor-ai-copilot-popover__badge" aria-hidden="true">
                <Icon name="sparkles" />
              </span>
              <div>
                <div className="doctor-ai-copilot-popover__title-row">
                  <h3 className="doctor-ai-copilot-popover__title">AI 临床辅诊中枢</h3>
                  <span className="doctor-ai-brand__title">AI 共写</span>
                </div>
                <span className="doctor-ai-copilot-popover__subtitle">
                  {isChronic ? '当前识别为【慢病复诊配药】场景' : isReport ? '当前识别为【报告回诊】场景' : '随行临床决策副驾'}
                </span>
              </div>
            </div>

            <div className="doctor-ai-copilot-popover__status-wrap">
              <span role="status">
                <StatusBadge tone={clinicalAiDraftStatusPresentation({ generating, error: !!error, current, hasSuggestion: !!suggestion }).tone}>
                  {clinicalAiDraftStatusPresentation({ generating, error: !!error, current, hasSuggestion: !!suggestion }).label}
                </StatusBadge>
              </span>
              <button
                type="button"
                className="doctor-ai-copilot-popover__close"
                aria-label="关闭 AI 辅诊面板"
                onClick={() => setHubOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div className="doctor-ai-copilot-popover__body">
            {nextStep && (
              <section className="doctor-ai-next-step" aria-label="下一步建议">
                <span className="doctor-ai-next-step__hint">{nextStep.hint}</span>
                <Button size="sm" variant="primary" disabled={busy || generating || findingPlans || Boolean(sceneLoading)}
                  onClick={() => { setHubOpen(false); runNextStep() }}>
                  <Icon name="sparkles" />
                  <span>{nextStep.action}</span>
                </Button>
              </section>
            )}
            {/* 1. Context Insight Card */}
            {sceneAssessment && (
              <section className={`doctor-ai-insight-card is-${sceneAssessment.badgeTone}`} aria-label="接诊情境洞察">
                <div className="doctor-ai-insight-card__head">
                  <span className="doctor-ai-insight-card__icon" aria-hidden="true">
                    <Icon name="clinical" />
                  </span>
                  <strong>接诊情境感知</strong>
                  <span className="doctor-ai-insight-card__tag">
                    {isChronic ? '慢病复诊配药' : isReport ? '报告回诊解读' : '常规门诊'}
                  </span>
                </div>
                <p className="doctor-ai-insight-card__summary">{sceneAssessment.summaryText}</p>
                {isChronic && chronicRefill && chronicGuideReady && !chronicRefill.adopted && (
                  <Button size="sm" variant="text" className="doctor-ai-insight-card__guide"
                    title="收起辅诊中心，重新打开慢病复诊的续方引导卡片"
                    onClick={() => { setHubOpen(false); setRefillPanelOpen(true) }}>
                    <Icon name="pill" />
                    <span>查看续方引导</span>
                  </Button>
                )}

                {sceneAssessment.matchedConditions.length > 0 && (
                  <div className="doctor-ai-insight-card__pills">
                    <span className="doctor-ai-insight-card__label">慢病档案：</span>
                    {sceneAssessment.matchedConditions.map((cond) => (
                      <span key={cond} className="doctor-ai-condition-chip">{cond}</span>
                    ))}
                  </div>
                )}

                {sceneAssessment.reportHighlights.length > 0 && (
                  <div className="doctor-ai-insight-card__reports">
                    <span className="doctor-ai-insight-card__label">异常指标：</span>
                    <div className="doctor-ai-insight-card__report-list">
                      {sceneAssessment.reportHighlights.map((hl, idx) => (
                        <span key={idx} className="doctor-ai-report-highlight-pill">{hl}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 2. Scenario Quick Actions */}
            <section className="doctor-ai-quick-actions" aria-label="场景便捷操作">
              <div className="doctor-ai-quick-actions__title">
                <Icon name="sparkles" />
                <span>场景一键直达</span>
              </div>
              <div className="doctor-ai-quick-actions__grid">
                {isChronic && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      className="doctor-ai-quick-btn"
                      disabled={findingPlans || Boolean(planChoice) || disabled || busy || !canAdopt || sceneLoading}
                      onClick={() => {
                        if (refillReady) { runChronicRefill(); return }
                        generateChronicRecord()
                        if (onOpenHistory) onOpenHistory()
                      }}
                      title="一键生成规范复诊病历草稿并自动联动调出历史处方"
                    >
                      <Icon name="pill" />
                      <span>慢病一键续方（病历+医嘱）</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="doctor-ai-quick-btn"
                      disabled={findingPlans || Boolean(planChoice) || disabled || busy || !canAdopt || sceneLoading}
                      onClick={generateChronicRecord}
                    >
                      <Icon name="file-text" />
                      <span>仅生成复诊病历</span>
                    </Button>
                    {onOpenHistory && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="doctor-ai-quick-btn"
                        onClick={() => {
                          onOpenHistory()
                        }}
                      >
                        <Icon name="pharmacy" />
                        <span>调入历史处方明细</span>
                      </Button>
                    )}
                  </>
                )}

                {isReport && (
                  <>
                    {onOpenResults && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="doctor-ai-quick-btn"
                        onClick={() => {
                          onOpenResults()
                        }}
                      >
                        <Icon name="flask" />
                        <span>查看检验检查结果</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="doctor-ai-quick-btn"
                      disabled={findingPlans || Boolean(planChoice) || disabled || busy || !canAdopt || sceneLoading}
                      onClick={() => { if (sceneAssessment) void generateReportRecordNow(); setHubOpen(false) }}
                    >
                      <Icon name="file-text" />
                      <span>生成报告回诊记录</span>
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  className="doctor-ai-btn--refresh doctor-ai-quick-btn"
                  aria-label="分析当前病历"
                  disabled={findingPlans || Boolean(planChoice) || disabled || busy}
                  onClick={() => generate()}
                  title="根据当前病历重新分析"
                >
                  <Icon name="stethoscope" />
                  <span>{error ? '重试分析' : suggestion ? '更新病历建议' : '分析当前病历'}</span>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="doctor-ai-btn--more doctor-ai-quick-btn"
                  aria-label="更多辅助"
                  onClick={() => {
                    onOpenDetail?.()
                  }}
                  title="打开右侧智医助理面板，查看全套辅助工具"
                >
                  <Icon name="menu" />
                  <span>更多辅助</span>
                </Button>
              </div>
            </section>

            {/* 3. Voice & Input Composer */}
            <section className="doctor-ai-cowrite__composer">
              <div className="doctor-ai-composer-card">
                <div className="doctor-ai-composer-card__head">
                  <div className="doctor-ai-composer-card__lead">
                    <span className="doctor-ai-composer-card__badge" aria-hidden="true">
                      <Icon name="mic" />
                    </span>
                    <label className="doctor-ai-composer-card__title" htmlFor={composerInputId}>
                      问诊要点或辅助要求
                    </label>
                    <span className="doctor-ai-composer-card__sub">支持语音与快捷口述</span>
                  </div>
                  <div className="doctor-ai-composer-card__actions">
                    {voiceInput}
                    {question.trim() && (
                      <Button
                        size="sm"
                        variant="text"
                        className="doctor-ai-btn--clear"
                        onClick={() => {
                          onQuestionChange('')
                          onClearVoice?.()
                        }}
                        title="清空已录入要点"
                      >
                        清空
                      </Button>
                    )}
                  </div>
                </div>

                {interimTranscript && (
                  <div className="doctor-ai-interim-live" role="status" aria-live="polite">
                    <span className="doctor-ai-voice-pulse" aria-hidden="true" />
                    <span className="doctor-ai-interim-live__tag">正在识别语音</span>
                    <span className="doctor-ai-interim-live__text">{interimTranscript}</span>
                  </div>
                )}

                <textarea
                  id={composerInputId}
                  className="ui-field__control doctor-ai-composer-field"
                  value={question}
                  maxLength={500}
                  rows={2}
                  disabled={disabled || inputBusy}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  placeholder={
                    onFindPlans ? '输入或口述问诊要点，先匹配整体诊疗方案；不采用方案时继续 AI 共写。' : isChronic
                      ? '输入或口述慢病复诊要点（如：血压控制良好，无不适，来配降压药），AI 将直接生成规范复诊病历。'
                      : isReport
                        ? '输入或口述报告回诊要点（如：看血常规化验单），AI 将结合报告异常直接生成规范回诊病历。'
                        : '输入患者描述或医生口述要点（如：感冒发热3天，最高体温39度）；AI 将直接规范生成完整病历段落。'
                  }
                />

                <div className="doctor-ai-composer-card__footer">
                  <div className="doctor-ai-composer-card__btns">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={findingPlans || Boolean(planChoice) || disabled || busy || !canAdopt || !recordFeature || sceneLoading}
                      title="先匹配整体诊疗方案；无匹配方案时继续生成病历草稿"
                      onClick={() => generateAndApply()}
                    >
                      <Icon name="sparkles" />
                      {findingPlans ? '正在匹配方案…' : generating ? 'AI 正在共写…' : onFindPlans ? '匹配方案并继续' : '直接生成并带入病历'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={findingPlans || Boolean(planChoice) || disabled || busy}
                      title="先匹配整体方案；不采用方案时生成建议并逐条核对采纳"
                      onClick={() => {
                        setReviewOpen(true)
                        generate()
                      }}
                    >
                      整理并对照建议
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {planError && <div role="alert">{planError}
              <Button size="sm" variant="secondary" disabled={disabled || busy}
                onClick={() => void generate(undefined, true)}>跳过方案匹配，继续对照建议</Button></div>}
            {planChoice && <section className="doctor-ai-whole-plan-choice" aria-label="整体诊疗方案推荐">
              <strong>先核对是否采用整体诊疗方案</strong>
              <p>方案可包含配套病历模板、诊断、药品及诊疗项目。核对后由你决定是否整体带入草稿。</p>
              {planChoice.plans.map((plan) => <article key={plan.templateId}>
                <div><strong>{plan.name}</strong><p>{plan.description || plan.rationale}</p></div>
                <Button size="sm" variant="secondary" disabled={disabled || busy}
                  onClick={() => { awaitingTemplate.current = templateMarks; setHubOpen(false); onReviewRecommendedPlan?.(plan) }}>核对整体方案</Button>
              </article>)}
              <Button size="sm" disabled={disabled || busy} onClick={() => {
                const choice = planChoice
                setPlanChoice(undefined)
                if (choice.key !== latestPlanInput.current) return
                if (choice.focus === 'VOICE') void generateFromSpeech(true).catch(() => undefined)
                else if (choice.auto) void generateAndApply(undefined, true)
                else void generate(choice.focus, true)
              }}>不采用方案，继续 AI 共写</Button>
            </section>}
            {/* 4. Stepper & Diagnostics Details */}
            {generating && (
              <div className="doctor-ai-generation-box" role="status" aria-live="polite">
                <div className="doctor-ai-generation-box__header">
                  <span className="doctor-ai-generation__orb" aria-hidden="true">
                    <Icon name="sparkles" />
                  </span>
                  <span className="doctor-ai-generation__label">
                    {generatingTarget ? generatingTargetText(generatingTarget)
                      : preview.phase === 'TREATMENTS' ? '建议已生成，正在准备确认'
                      : preview.phase === 'DIAGNOSES' ? '诊断已生成，正在匹配医嘱' : '正在共写病历'}
                  </span>
                </div>
                <ClinicalAiPipelineStepper
                  generating={generating}
                  hasTreatmentPlan={Boolean(preview.recordDraft.treatmentPlan)}
                  completedStage={preview.phase}
                  current={current}
                  surfaces={surfaces}
                />
              </div>
            )}

            {/* 5. Toggles for Summary and Review */}
            {current && (
              <div className="doctor-ai-review-chips">
                <Button
                  size="sm"
                  variant="secondary"
                  className={`doctor-ai-btn--chip ${summaryOpen ? 'is-active' : ''}`}
                  aria-expanded={summaryOpen}
                  onClick={() => {
                    setSummaryOpen(!summaryOpen)
                    onView()
                  }}
                >
                  <Icon name="clinical" />
                  <span>接诊摘要{suggestion!.safetyAlerts.length > 0 ? ` · ${suggestion!.safetyAlerts.length} 项待核对` : ''}</span>
                </Button>

                {entries.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={`doctor-ai-btn--chip ${reviewOpen ? 'is-active' : ''}`}
                    aria-expanded={reviewOpen}
                    onClick={() => {
                      setReviewOpen(!reviewOpen)
                      onView()
                    }}
                  >
                    <Icon name="check" />
                    <span>{reviewOpen ? '收起对照' : `${comparisonLabel} · ${entries.length}`}</span>
                  </Button>
                )}
              </div>
            )}

            {/* Summary Details */}
            {summaryOpen && current && suggestion && (
              <div className="doctor-ai-brief__result">
                <p>{suggestion.summary}</p>
                {capability.features.includes('SAFETY_REMINDERS') &&
                  suggestion.safetyAlerts.map((item, index) => (
                    <p key={index}><strong>{item.title}</strong> · {item.detail}</p>
                  ))}
              </div>
            )}

            {/* Review & Paragraph Comparison */}
            {entries.length > 0 && reviewOpen && (
              <details className="doctor-ai-cowrite__review" open>
                <summary>{comparisonLabel} · {entries.length} 项建议</summary>
                <div className="doctor-ai-cowrite__fields">
                  {entries.map((field) => (
                    <article key={field}>
                      <label>
                        <input
                          type="checkbox"
                          checked={fields.includes(field)}
                          disabled={!current || busy || disabled || !canAdopt}
                          onChange={() => setFields(toggle(fields, field))}
                        />
                        <strong>{recordDraftFieldLabels[field]}</strong>
                        <small>{formatAiRecordDraftValue(field, context[field])
                          ? isAiVitalField(field) ? '采纳将替换此值' : '采纳将替换本段'
                          : isAiVitalField(field) ? '补充体格检查' : '补充空白段落'}</small>
                      </label>
                      <div className="doctor-ai-cowrite__comparison">
                        <div>
                          <small>当前内容</small>
                          <p>{formatAiRecordDraftValue(field, context[field]) || '尚未填写'}</p>
                        </div>
                        <FormField label={`${recordDraftFieldLabels[field]}建议（可编辑）`}
                          hint={isAiVitalField(field) ? `单位：${aiVitalDefinitions[field].unit}` : undefined}>
                          {isAiVitalField(field) ? <input type="number"
                            min={aiVitalDefinitions[field].minimum} max={aiVitalDefinitions[field].maximum}
                            step={aiVitalDefinitions[field].step}
                            value={edited[field] ?? suggestion!.recordDraft[field] ?? ''}
                            disabled={!current || busy || disabled}
                            onChange={(event) => setEdited({ ...edited, [field]: event.target.value })}
                          /> : <textarea
                            className="ui-field__control doctor-ai-comparison-textarea"
                            rows={3}
                            value={edited[field] ?? suggestion!.recordDraft[field] ?? ''}
                            disabled={!current || busy || disabled}
                            onChange={(event) => setEdited({ ...edited, [field]: event.target.value })}
                          />}
                        </FormField>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="doctor-ai-review-actions">
                  <small>仅替换勾选内容；采纳后可撤销本次病历修改。</small>
                  <Button size="sm" variant="secondary" disabled={adoptionDisabled} onClick={applySelection}>
                    采纳所选草稿{selectionCount > 0 ? `（${selectionCount}）` : ''}
                  </Button>
                </div>
              </details>
            )}

            {error && <p className="doctor-ai-inline__stale" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
