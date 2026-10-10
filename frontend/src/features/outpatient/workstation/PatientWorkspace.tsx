import { useContextSession } from '../../../shared/clinical/useContextSession'
import { signClinicalDocument } from "../record/clinicalDocumentWorkflow";
import { useClinicalDocumentSession } from "../record/useClinicalDocumentSession";
import { completeEncounter } from "../record/completeEncounter";
import { createCompletionBillingWriter } from "../record/completionBillingWrites";
import { completionModeKey, requireCompletionMode, confirmCompletionFacts } from "../record/completionFacts";
import type { ClinicalAiFieldStream } from "../../../shared/api/clinicalAiStream";
import { OutpatientDiagnosticResults } from "../OutpatientDiagnosticResults";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ClinicalContext } from "../../../shared/clinical/workContext";
import type { ClinicalDocument } from "../../../shared/api/clinicalDocumentsApi";
import type { ClinicalAiDraftContext } from "../../../shared/api/clinicalAiApi";
import type { CompleteEncounterInput } from "../../../shared/api/encountersApi";
import type { TerminateEncounterInput } from "../../../shared/api/outpatientFlowApi";
import { type PrepareAiPlan } from "../record/useAiPlanApplication";
import type { Encounter, Resident } from "../../../shared/model";
import { age } from "../../../shared/format";
import { encounterStatusPresentation } from "../../../shared/presentation";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, Icon, LoadingState, ActionMenu, ObjectContextBar, PanelHead, StatusBadge, Tooltip } from "../../../shared/ui";
import { type AiOrderReviewCommand } from "../UnifiedOrderListEditor";
import type { ClinicalAiSurfaceRefs } from "../ai/ClinicalAiInlineWorkspace";
import { type ClinicalAiDraftRequest } from "../ai/aiDraftAdapter";
import { QueueCapsuleBar } from "../waiting/QueueCapsuleBar";
import { QueuePeekDrawer } from "../waiting/QueuePeekDrawer";
import type { EnhancedQueueItem } from "../waiting/queueTypes";
import { type QueueCommand, type WorkTool, type HistoryCopyDraft, type EncounterDraftState, emptyDraftState, type GuardedPatientAction, commandCode, draftStateLabels, AllergyContextValue, toggleTool, toolLabel, ToolButton } from './workstationShared'
import { ClinicalRecordPanel } from '../record/ClinicalRecordPanel'
import { HistoryPanel } from '../history/HistoryPanel'
import { AllergySafetyPanel } from '../record/AllergySafetyPanel'
import { ReferralCoordinationPanel } from '../referrals/ReferralCoordination'
import { EncounterPrintPanel, BatchPrintDialog } from '../printing/EncounterPrintPanel'
import { EncounterCompletionDialog } from '../record/EncounterCompletionDialog'
import { EncounterSuspendDialog, EncounterTerminationDialog } from './EncounterFlowDialogs'

export const ClinicalAiAssistantPanel = lazy(() => import('../ai/ClinicalAiAssistantPanel')
  .then((module) => ({ default: module.ClinicalAiAssistantPanel })))

export function PatientContextIdentifier({ label, value }: { label: string; value: string }) {
  const [notice, setNotice] = useState('')
  useEffect(() => setNotice(''), [value])
  return <Tooltip content={notice || `${value}；点击复制`}>
    <Button variant="text" size="sm" className="doctor-context-identifier" aria-label={`复制${label} ${value}`}
      onClick={() => {
        void (async () => {
          try { await navigator.clipboard.writeText(value); setNotice('已复制') }
          catch { setNotice(`复制失败，请手动复制：${value}`) }
        })()
      }}><span>{value}</span><Icon name="copy" /></Button>
  </Tooltip>
}

export function PatientWorkspace({ resident, encounterId, entryIntent, api, clinicalContext, canEdit, onBack, onQueueRefresh,
  enhancedQueueItems = [], onSwitchPatient, onQueueAction, peekDrawerOpen = false, setPeekDrawerOpen }: {
  resident: Resident; encounterId: string | null; api: RhnApi; clinicalContext: ClinicalContext
  entryIntent: 'READ' | 'EDIT'; canEdit: boolean; onBack: () => void; onQueueRefresh: () => Promise<unknown>
  enhancedQueueItems?: EnhancedQueueItem[]
  onSwitchPatient?: (item: EnhancedQueueItem) => void
  onQueueAction?: (item: EnhancedQueueItem, action: QueueCommand) => Promise<unknown>
  peekDrawerOpen?: boolean
  setPeekDrawerOpen?: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [activeTool, setActiveTool] = useState<WorkTool | null>(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [suspensionOpen, setSuspensionOpen] = useState(false)
  const [terminationOpen, setTerminationOpen] = useState(false)
  const [historyCopy, setHistoryCopy] = useState<HistoryCopyDraft | null>(null)
  const [aiFieldStream, setAiFieldStream] = useState<ClinicalAiFieldStream | null>(null)
  const [aiOrderReview, setAiOrderReview] = useState<AiOrderReviewCommand | null>(null)
  const [existingTreatmentKeys, setExistingTreatmentKeys] = useState<string[]>([])
  const [aiContext, setAiContext] = useState<ClinicalAiDraftContext | null>(null)
  const [aiDraft, setAiDraft] = useState<ClinicalAiDraftRequest | null>(null)
  const aiPlanHandler = useRef<PrepareAiPlan | null>(null)
  const registerAiPlan = useCallback((handler: PrepareAiPlan | null) => { aiPlanHandler.current = handler }, [])
  const prepareAiPlan = useCallback<PrepareAiPlan>(request => {
    if (!aiPlanHandler.current) return Promise.reject(new Error('当前病历编辑器不可用，AI 方案未带入。'))
    return aiPlanHandler.current(request)
  }, [])
  const [aiAdoptionBusy, setAiAdoptionBusy] = useState(false)
  const [aiNote, setAiNote] = useState<HTMLDivElement | null>(null)
  const [aiDiagnoses, setAiDiagnoses] = useState<HTMLDivElement | null>(null)
  const [aiPlans, setAiPlans] = useState<HTMLDivElement | null>(null)
  const [aiDetail, setAiDetail] = useState<HTMLDivElement | null>(null)
  const [recommendedPlanId, setRecommendedPlanId] = useState<string>()
  const [planTemplateDrawerHost, setPlanTemplateDrawerHost] = useState<HTMLDivElement | null>(null)
  const workspaceDrawerRef = useRef<HTMLElement | null>(null)
  const aiSurfaceRefs = useMemo<ClinicalAiSurfaceRefs>(() => ({
    note: setAiNote, diagnoses: setAiDiagnoses, plans: setAiPlans,
  }), [])
  const [draftState, setDraftState] = useState<EncounterDraftState>(emptyDraftState)
  const [guardedAction, setGuardedAction] = useState<GuardedPatientAction | null>(null)
  const [editing, setEditing] = useState(false)
  const saveDraftHandlerRef = useRef<(() => Promise<boolean>) | null>(null)
  const [saveDraftNotice, setSaveDraftNotice] = useState<{ message: string; tone?: 'success' | 'error' | 'warning' } | null>(null)
  const automaticEntry = useRef<string | null>(null)
  const [resumeCommandCode] = useState(() => commandCode('RESUME', encounterId ?? resident.id))
  const queryClient = useQueryClient()
  const encounters = useQuery({ queryKey: ['doctor-encounters', resident.id], queryFn: () => api.encounters.byResident(resident.id) })
  const allergies = useQuery({ queryKey: ['doctor-allergies', resident.id], queryFn: () => api.residents.allergies(resident.id) })
  const allergyState: ClinicalAiDraftContext['allergyState'] = allergies.isFetching
    ? 'LOADING' : allergies.error ? 'ERROR' : 'READY'
  const encounter = encounters.data?.find((item) => item.id === encounterId)
  useEffect(() => { setRecommendedPlanId(undefined) }, [encounterId])
    ?? encounters.data?.find((item) => ['IN_PROGRESS', 'SUSPENDED', 'REGISTERED'].includes(item.status))
    ?? encounters.data?.[0]
  const currentEnhancedItem = enhancedQueueItems.find((i) => i.residentId === resident.id || i.encounterId === encounter?.id)
  const currentCalledItem = enhancedQueueItems.find((item) => item.status === 'CALLED')
  const documents = useQuery({
    queryKey: ['doctor-document', encounter?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter!.id),
    enabled: Boolean(encounter?.id),
  })
  const patientTriageRecord = useQuery({
    queryKey: ['patient-latest-triage', encounter?.id],
    queryFn: () => api.outpatientTriage.getByEncounter(encounter!.id),
    enabled: Boolean(encounter?.id),
    staleTime: 60 * 1000,
  })
  const effectiveTriageVitals = useMemo(() => {
    if (patientTriageRecord.data) {
      const rec = patientTriageRecord.data
      return {
        systolic: rec.systolic,
        diastolic: rec.diastolic,
        temperature: rec.temperature,
        pulseRate: rec.pulseRate,
        spo2: rec.oxygenSaturation,
        measuredAt: rec.triageTime,
      }
    }
    return currentEnhancedItem?.vitals
  }, [patientTriageRecord.data, currentEnhancedItem?.vitals])
  const outpatientNote = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE' && item.instanceKey === 'DEFAULT')
  const completionConfigurationSession = useContextSession(api)
  const completionModeQuery = useQuery({
    queryKey: ['outpatient-completion-mode', completionConfigurationSession, encounter?.organizationId, encounter?.departmentId],
    queryFn: async () => requireCompletionMode(await api.configuration.resolve<string>(completionModeKey, {
      organizationId: encounter?.organizationId,
      departmentId: encounter?.departmentId,
      moduleCode: 'DOCTOR_WORKSTATION',
    })),
    enabled: Boolean(encounter), retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const completionMode = completionModeQuery.isSuccess && !completionModeQuery.isFetching ? completionModeQuery.data : undefined
  const hasCompletionBasics = Boolean(encounter?.chiefComplaint
    && encounter.diagnoses.some((item) => item.type === 'PRIMARY') && outpatientNote)
  const readyToComplete = Boolean(completionMode && hasCompletionBasics && (outpatientNote?.status === 'SIGNED'
    || completionMode === 'COMBINED_CONFIRMATION'))
  const captureDocumentSession = useClinicalDocumentSession(api, JSON.stringify([encounter?.id, resident.id,
    clinicalContext.organization.id, clinicalContext.department.id]), canEdit)
  const signNoteMutation = useMutation({
    mutationFn: async () => {
      const assertCurrent = captureDocumentSession()
      const signed = await signClinicalDocument(api.clinicalDocuments, outpatientNote!, assertCurrent)
      return { signed, assertCurrent }
    },
    onSuccess: async ({ signed, assertCurrent }) => {
      assertCurrent()
      queryClient.setQueryData<ClinicalDocument[]>(['doctor-document', signed.encounterId], current =>
        current?.map(item => item.id === signed.id ? signed : item) ?? [signed])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter?.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-encounters', resident.id] }),
        queryClient.invalidateQueries({ queryKey: ['encounters'] }),
      ])
    },
  })
  const draftLabels = draftStateLabels(draftState)
  const hasUnsavedDraft = draftLabels.length > 0
  useEffect(() => {
    setEditing(false)
    setAiContext(null)
    setAiDraft(null)
    setAiAdoptionBusy(false)
    setActiveTool((current) => current === 'assistant' || current === 'plans' || current === 'allergy' ? null : current)
  }, [encounter?.id])
  useEffect(() => {
    if (outpatientNote?.status === 'SIGNED') {
      setActiveTool((current) => current === 'plans' ? null : current)
    }
  }, [outpatientNote?.status])
  useEffect(() => {
    const drawer = workspaceDrawerRef.current
    if (activeTool !== 'plans' || !drawer) return

    const updateVisibleHeight = () => {
      const availableHeight = Math.max(1, Math.floor(window.innerHeight - drawer.getBoundingClientRect().top - 16))
      drawer.style.setProperty('--doctor-plan-drawer-height', `${availableHeight}px`)
    }
    updateVisibleHeight()
    window.addEventListener('resize', updateVisibleHeight)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateVisibleHeight)
    if (drawer.parentElement) resizeObserver?.observe(drawer.parentElement)
    return () => {
      window.removeEventListener('resize', updateVisibleHeight)
      resizeObserver?.disconnect()
      drawer.style.removeProperty('--doctor-plan-drawer-height')
    }
  }, [activeTool])
  useEffect(() => {
    if (!hasUnsavedDraft) return
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsavedDraft])
  const handleSaveDraft = useCallback(async () => {
    if (saveDraftHandlerRef.current) {
      return saveDraftHandlerRef.current()
    } else {
      setSaveDraftNotice({ message: '病历编辑器尚未就绪，请稍后重试保存', tone: 'error' })
      return false
    }
  }, [])
  const handleRegisterSaveDraft = useCallback((handler: (() => Promise<boolean>) | null) => {
    saveDraftHandlerRef.current = handler
  }, [])
  const handleSaveDraftNotice = useCallback((notice: { message: string; tone?: 'success' | 'error' | 'warning' }) => {
    setSaveDraftNotice(notice)
    setTimeout(() => setSaveDraftNotice(null), 3500)
  }, [])
  useEffect(() => {
    if (!editing || encounter?.status !== 'IN_PROGRESS') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveDraft()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing, encounter?.status, handleSaveDraft])
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['doctor-encounters', resident.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter?.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] }),
      onQueueRefresh(),
    ])
  }
  const start = useMutation({
    mutationFn: (targetEncounter: Encounter) => api.encounters.start(targetEncounter.id, {
      commandCode: commandCode('START', targetEncounter.id),
      factorResults: { NAME: true, DEMOGRAPHIC_OR_IDENTIFIER: true },
      terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess: async () => { await refresh(); setEditing(true) },
  })
  const [completionBatchPrint, setCompletionBatchPrint] = useState(false)
  const completionBillingWriter = useRef(createCompletionBillingWriter()).current
  const [workstationBatchPrintOpen, setWorkstationBatchPrintOpen] = useState(false)
  const finishCompletion = async ({ completed, assertCurrent }: { completed: Encounter; assertCurrent: () => void }) => {
    assertCurrent()
    queryClient.setQueryData<Encounter[]>(['doctor-encounters', completed.residentId], current =>
      current?.map(item => item.id === completed.id ? completed : item))
    await refresh()
    assertCurrent()
    setCompletionOpen(false)
    if (completionBatchPrint) setWorkstationBatchPrintOpen(true)
    else onBack()
  }
  const complete = useMutation({
    mutationFn: async (input: CompleteEncounterInput) => {
      const assertCurrent = captureDocumentSession()
      await confirmCompletionFacts(api, encounter!, completionMode, assertCurrent)
      const completed = await completeEncounter(api.encounters, encounter!, input, assertCurrent)
      return { completed, assertCurrent }
    },
    onSuccess: finishCompletion,
  })
  const completeWithSignature = useMutation({
    mutationFn: async (input: CompleteEncounterInput) => {
      if (!outpatientNote) throw new Error('请先保存门诊病历')
      const assertCurrent = captureDocumentSession()
      await confirmCompletionFacts(api, encounter!, completionMode, assertCurrent)
      const signedNote = await signClinicalDocument(api.clinicalDocuments, outpatientNote, assertCurrent)
      assertCurrent()
      queryClient.setQueryData<ClinicalDocument[]>(['doctor-document', encounter!.id], current =>
        current?.map(item => item.id === signedNote.id ? signedNote : item) ?? [signedNote])
      const completed = await completeEncounter(api.encounters, encounter!, input, assertCurrent)
      assertCurrent()
      return { completed, assertCurrent }
    },
    onSuccess: finishCompletion,
  })
  const suspend = useMutation({
    mutationFn: (input: { commandCode: string; reason: string }) => api.encounters.suspend(encounter!.id, input),
    onSuccess: async () => { setSuspensionOpen(false); await refresh(); onBack() },
  })
  const resume = useMutation({
    mutationFn: () => api.encounters.resume(encounter!.id, {
      commandCode: resumeCommandCode, terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess: async () => { await refresh(); setEditing(true) },
  })
  const terminate = useMutation({
    mutationFn: (input: TerminateEncounterInput) => api.outpatientFlow.terminate(encounter!.id, input),
    onSuccess: async () => { setTerminationOpen(false); await refresh(); onBack() },
  })
  const requestAction = (action: GuardedPatientAction) => {
    if (aiAdoptionBusy) return
    if (hasUnsavedDraft) { setGuardedAction(action); return }
    runAction(action)
  }
  const runAction = (action: GuardedPatientAction) => {
    setGuardedAction(null)
    if (action === 'queue') onBack()
    if (action === 'suspend') setSuspensionOpen(true)
    if (action === 'complete') setCompletionOpen(true)
    if (action === 'terminate') setTerminationOpen(true)
  }
  const saveAndContinue = async (action: GuardedPatientAction) => {
    const saved = await handleSaveDraft()
    if (saved) runAction(action)
  }
  const enterEditing = () => {
    if (!encounter || !canEdit) return
    if (encounter.status === 'REGISTERED') { start.mutate(encounter); return }
    if (encounter.status === 'SUSPENDED') { resume.mutate(); return }
    if (encounter.status === 'IN_PROGRESS') setEditing(true)
  }
  useEffect(() => {
    if (!encounter || entryIntent !== 'EDIT' || !canEdit) return
    // StrictMode replays effects in development. Re-apply the local edit state on
    // every replay, while keeping API-backed start/resume commands idempotent.
    if (encounter.status === 'IN_PROGRESS') { setEditing(true); return }
    if (automaticEntry.current === encounter.id) return
    automaticEntry.current = encounter.id
    if (encounter.status === 'REGISTERED') start.mutate(encounter)
    else if (encounter.status === 'SUSPENDED') resume.mutate()
  }, [canEdit, encounter, entryIntent, resume, start])
  const enterReading = () => {
    setEditing(false)
    setActiveTool((current) => current === 'assistant' || current === 'plans' || current === 'coordination' ? null : current)
  }
  return <section className="doctor-patient-workspace">
    <ObjectContextBar avatar={resident.fullName.slice(-1)} title={resident.fullName}
      description={`${resident.genderText ?? '未知'} · ${age(resident.birthDate)} 岁 · ${resident.maskedNationalId || '无证件标识'}`}
      identityStatus={encounter && <StatusBadge tone={encounterStatusPresentation(encounter.status).tone}>
        {encounterStatusPresentation(encounter.status).label}</StatusBadge>}
      facts={[{ label: '健康档案号', value: <PatientContextIdentifier label="健康档案号" value={resident.healthRecordNo} /> },
        { label: '就诊号', value: encounter ? <PatientContextIdentifier label="就诊号" value={encounter.encounterNo} /> : '无当前就诊' },
        ...(patientTriageRecord.data ? [{
          label: '预检分诊',
          value: (
            <span className="doctor-context-triage">
              <StatusBadge tone={
                patientTriageRecord.data.triageLevel === 'LEVEL_1_CRITICAL' ? 'danger'
                : patientTriageRecord.data.triageLevel === 'LEVEL_2_URGENT' ? 'warning'
                : patientTriageRecord.data.triageLevel === 'LEVEL_3_ROUTINE_URGENT' ? 'info'
                : 'neutral'
              }>
                {patientTriageRecord.data.triageLevel === 'LEVEL_1_CRITICAL' ? '一级·危急'
                : patientTriageRecord.data.triageLevel === 'LEVEL_2_URGENT' ? '二级·急症'
                : patientTriageRecord.data.triageLevel === 'LEVEL_3_ROUTINE_URGENT' ? '三级·急诊'
                : '四级·普通'}
              </StatusBadge>
              {patientTriageRecord.data.fever && <StatusBadge tone="danger">发热</StatusBadge>}
            </span>
          ),
        }] : []),
        { label: '过敏信息', value: <AllergyContextValue allergies={allergies.data ?? []}
          loading={allergies.isPending} error={allergies.error} disabled={!encounter}
          onClick={() => setActiveTool(toggleTool(activeTool, 'allergy'))} /> }]}
      support={<div className="doctor-context-support">
        <div className="doctor-context-phone"><span>联系电话</span><strong>{resident.phone || '未登记'}</strong></div>
          {encounter && enhancedQueueItems.length > 0 && (
            <QueueCapsuleBar
              items={enhancedQueueItems}
              currentEncounterId={encounter.id}
              currentResidentName={resident.fullName}
              canEdit={canEdit}
              onCallAndEnterNext={(targetItem) => {
                void (async () => {
                  await onQueueAction?.(targetItem, 'call')
                  onSwitchPatient?.(targetItem)
                })()
              }}
              onRecallCurrent={currentCalledItem && onQueueAction
                ? () => { void onQueueAction(currentCalledItem, 'recall') } : undefined}
              onSkipAndPostpone={currentCalledItem && onQueueAction
                ? () => { void onQueueAction(currentCalledItem, 'miss') } : undefined}
              onSuspendCurrent={() => requestAction('suspend')}
              onOpenPeekDrawer={() => setPeekDrawerOpen?.(true)}
            />
          )}
      </div>}
      actions={<div className="doctor-context-actions">
        {entryIntent === 'READ' && !editing && (
          <Button size="sm" variant="secondary" aria-label="返回患者列表"
            title="退出当前患者并返回患者列表" onClick={() => requestAction('queue')}>
            <Icon name="arrow-left" /><span>返回列表</span>
          </Button>
        )}
        {encounter && <>
          <div className="doctor-context-actions__buttons">
            {editing && encounter.status === 'IN_PROGRESS' && <>
              <Button
                size="sm"
                variant="secondary"
                className="doctor-btn--save-draft"
                aria-label={hasUnsavedDraft ? '保存草稿' : '草稿已保存'}
                busy={draftState.busy}
                disabled={aiAdoptionBusy || Boolean(aiFieldStream) || !hasUnsavedDraft}
                title={hasUnsavedDraft ? '保存病历、诊断与医嘱草稿 (Ctrl+S)' : '当前草稿已与服务器同步 (Ctrl+S)'}
                onClick={() => { void handleSaveDraft() }}
              >
                <Icon name="check" />
                <span>{hasUnsavedDraft ? '保存草稿' : '已保存'}</span>
              </Button>
              <Button size="sm" variant="secondary" disabled={aiAdoptionBusy}
                title="暂时释放当前接诊工作会话，患者返回后可继续"
                onClick={() => requestAction('suspend')}>暂挂</Button>
              <Button size="sm" busy={complete.isPending} disabled={aiAdoptionBusy}
                title="进入诊毕汇总，核对费用和转归信息"
                onClick={() => requestAction('complete')}>诊毕</Button>
              <ActionMenu label="更多" disabled={aiAdoptionBusy} items={[{
                key: 'terminate', label: '终止诊疗', danger: true,
                onSelect: () => requestAction('terminate'),
              }]} />
            </>}
          </div>
        </>}
      </div>} />
    {encounters.isPending ? <LoadingState label="正在加载就诊记录…" /> : !encounter
      ? <EmptyState icon="clinical" title="没有可处理的门诊就诊" copy="请先在门诊挂号工作台完成挂号。" />
      : <div className="doctor-workspace-body">
          <main className={`doctor-workspace-main${aiAdoptionBusy ? ' is-ai-adoption-busy' : ''}`}
            aria-busy={aiAdoptionBusy || undefined}>
            {(start.error || resume.error) && <Alert className="ui-page-feedback">{errorMessage(start.error || resume.error)}</Alert>}
            {saveDraftNotice && <Alert tone={saveDraftNotice.tone ?? 'success'} className="ui-page-feedback">
              <Icon name={saveDraftNotice.tone === 'error' ? 'error' : 'check'} /> {saveDraftNotice.message}
            </Alert>}
            <ClinicalRecordPanel aiSurfaceRefs={aiSurfaceRefs} key={encounter.id} encounter={encounter} editing={editing} canEdit={canEdit}
                completionMode={completionMode} birthDate={resident.birthDate}
                enteringEdit={start.isPending || resume.isPending}
                currentDepartmentName={clinicalContext.department.name}
                allergies={allergies.data ?? []} allergyState={allergyState} api={api} historyCopy={historyCopy}
                onHistoryCopyConsumed={() => setHistoryCopy(null)} onDraftStateChange={setDraftState}
                onRegisterSaveDraft={handleRegisterSaveDraft}
                onSaveDraftNotice={handleSaveDraftNotice}
                aiFieldStream={aiFieldStream} aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={() => setAiOrderReview(null)}
                onTreatmentKeysChange={setExistingTreatmentKeys}
                onRegisterAiPlan={registerAiPlan} aiDraft={aiDraft} onAiDraftConsumed={() => setAiDraft(null)} onAiContextChange={setAiContext}
                onRequestEditing={enterEditing} onRequestReading={enterReading} onRefresh={refresh}
                aiPreConsultation={currentEnhancedItem?.aiPreConsultation}
                triageVitals={effectiveTriageVitals}
                historyEncounters={encounters.data ?? []}
                planTemplateDrawerHost={planTemplateDrawerHost} recommendedPlanId={recommendedPlanId}
                onClosePlanDrawer={() => setActiveTool(null)} onOpenPrintCenter={() => setActiveTool('prints')} />
          </main>
          {editing && encounter.status === 'IN_PROGRESS' && aiContext?.encounterId === encounter.id
            && aiContext.residentId === encounter.residentId && (
              <Suspense fallback={<LoadingState label="正在加载 AI 辅诊…" />}>
                <ClinicalAiAssistantPanel key={encounter.id}
                  encounter={encounter} currentContext={aiContext} allergies={allergies.data ?? []}
                  allergyState={allergyState} api={api}
                  disabled={outpatientNote?.status === 'SIGNED' || draftState.busy}
                  surfaces={{ summary: aiNote, note: aiNote, diagnoses: aiDiagnoses, plans: aiPlans, detail: aiDetail }}
                  onOpenDetail={() => setActiveTool('assistant')}
                  onReviewRecommendedPlan={(plan) => { setRecommendedPlanId(plan.templateId); setActiveTool('plans') }}
                  onOpenHistory={() => setActiveTool('history')} onOpenResults={() => setActiveTool('results')}
                  onAdoptionBusyChange={setAiAdoptionBusy} onApply={setAiDraft} onPreparePlan={prepareAiPlan} onFieldStream={setAiFieldStream}
                  existingTreatmentKeys={existingTreatmentKeys}
                  onReviewTreatment={(items, onCompleted, onFailed) => setAiOrderReview({
                    id: crypto.randomUUID(), encounterId: encounter.id, items, onCompleted, onFailed,
                  })}
                  historyEncounters={encounters.data ?? []} />
              </Suspense>
            )}
          {activeTool && <aside ref={workspaceDrawerRef} className={`doctor-workspace-drawer${activeTool === 'history' ? ' is-history' : ''}${activeTool === 'assistant' ? ' is-assistant' : ''}${activeTool === 'plans' ? ' is-plans' : ''}${activeTool === 'allergy' ? ' is-allergy' : ''}${activeTool === 'prints' ? ' is-prints' : ''}`}
            aria-label={toolLabel(activeTool)}>
            <PanelHead title={toolLabel(activeTool)}
              actions={<Button variant="text" aria-label="关闭扩展工具" disabled={activeTool === 'assistant' && aiAdoptionBusy}
                onClick={() => setActiveTool(null)}><Icon name="close" /></Button>} />
            <div className="doctor-workspace-drawer__content">
              {activeTool === 'assistant' && <div ref={setAiDetail} />}
              {activeTool === 'plans' && <div ref={setPlanTemplateDrawerHost} className="doctor-plan-drawer-host" />}
              {activeTool === 'history' && <HistoryPanel encounters={encounters.data ?? []}
                currentEncounter={encounter} api={api} allergies={allergies.data ?? []} allergyReady={allergyState === 'READY'} copyDisabled={!editing || encounter.status !== 'IN_PROGRESS' || outpatientNote?.status === 'SIGNED'}
                onCopy={(draft) => { setHistoryCopy({ ...draft, targetEncounterId: encounter.id, targetResidentId: encounter.residentId }); setActiveTool(null) }} />}
              {activeTool === 'results' && <OutpatientDiagnosticResults encounter={encounter} api={api} />}
              {activeTool === 'allergy' && <AllergySafetyPanel resident={resident} encounter={encounter}
                allergies={allergies.data ?? []} loading={allergies.isPending} error={allergies.error}
                api={api} readOnly={!editing} />}
              {activeTool === 'coordination' && editing && <ReferralCoordinationPanel encounter={encounter}
                clinicalContext={clinicalContext} api={api} hasUnsavedDraft={hasUnsavedDraft} onRefresh={refresh} />}
              {activeTool === 'prints' && <EncounterPrintPanel encounter={encounter} resident={resident} api={api} />}
            </div>
          </aside>}
          <nav className="doctor-workspace-tools" aria-label="医生站扩展工具">
            {editing && encounter.status === 'IN_PROGRESS' && <ToolButton icon="sparkles" label="智医助理"
              active={activeTool === 'assistant'}
              onClick={() => !aiAdoptionBusy && setActiveTool(toggleTool(activeTool, 'assistant'))} />}
            {editing && encounter.status === 'IN_PROGRESS' && outpatientNote?.status !== 'SIGNED'
              && <ToolButton icon="stethoscope" label="临床模板" active={activeTool === 'plans'}
                onClick={() => setActiveTool(toggleTool(activeTool, 'plans'))} />}
            <ToolButton icon="roadmap" label="就诊历史" active={activeTool === 'history'} onClick={() => setActiveTool(toggleTool(activeTool, 'history'))} />
            <ToolButton icon="clinical" label="检验结果" active={activeTool === 'results'} onClick={() => setActiveTool(toggleTool(activeTool, 'results'))} />
            <ToolButton icon="print" label="就诊文书" active={activeTool === 'prints'} onClick={() => setActiveTool(toggleTool(activeTool, 'prints'))} />
            {editing && <ToolButton icon="tasks" label="皮试管理" active={false}
              onClick={() => navigate(`/skin-tests?encounterId=${encounter.id}`)} />}
            {editing && <ToolButton icon="organization" label="协同业务" active={activeTool === 'coordination'} onClick={() => setActiveTool(toggleTool(activeTool, 'coordination'))} />}
          </nav>
        </div>}
    {completionOpen && encounter && <EncounterCompletionDialog encounter={encounter} api={api}
      canEdit={canEdit} billingWriter={completionBillingWriter}
      signed={outpatientNote?.status === 'SIGNED'} ready={readyToComplete}
      busy={complete.isPending || completeWithSignature.isPending}
      completionMode={completionMode}
      configurationError={completionModeQuery.error} configurationLoading={completionModeQuery.isPending || completionModeQuery.isFetching}
      onReloadConfiguration={() => completionModeQuery.refetch()}
      error={complete.error || completeWithSignature.error || signNoteMutation.error} onClose={() => setCompletionOpen(false)}
      onComplete={(input, batchPrint) => {
        if (!completionMode) return
        setCompletionBatchPrint(Boolean(batchPrint))
        if (completionMode === 'COMBINED_CONFIRMATION') {
          completeWithSignature.mutate(input)
        } else {
          complete.mutate(input)
        }
      }}
      onSignNote={completionMode === 'SEPARATE_CONFIRMATIONS' && outpatientNote
        ? () => signNoteMutation.mutate() : undefined}
      signing={signNoteMutation.isPending || completeWithSignature.isPending} />}
    {workstationBatchPrintOpen && encounter && (
      <BatchPrintDialog
        encounter={encounter}
        api={api}
        onClose={() => {
          setWorkstationBatchPrintOpen(false)
          if (completionBatchPrint) {
            setCompletionBatchPrint(false)
            onBack()
          }
        }}
        onPrinted={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      />
    )}
    {suspensionOpen && encounter && <EncounterSuspendDialog encounterId={encounter.id}
      busy={suspend.isPending} error={suspend.error}
      onClose={() => setSuspensionOpen(false)} onConfirm={(input) => suspend.mutate(input)} />}
    {terminationOpen && encounter && <EncounterTerminationDialog encounter={encounter} api={api}
      busy={terminate.isPending} error={terminate.error} onClose={() => setTerminationOpen(false)}
      onConfirm={(input) => terminate.mutate(input)} />}
    {guardedAction && <UnsavedPatientWorkDialog residentName={resident.fullName} action={guardedAction}
      labels={draftLabels} saving={draftState.busy} onClose={() => setGuardedAction(null)}
      onSaveAndContinue={() => saveAndContinue(guardedAction)} onDiscard={() => runAction(guardedAction)} />}
    {setPeekDrawerOpen && (
      <QueuePeekDrawer
        open={peekDrawerOpen}
        onClose={() => setPeekDrawerOpen(false)}
        items={enhancedQueueItems}
        currentEncounterId={encounter?.id ?? null}
        canEdit={canEdit}
        onSelectPatient={(targetItem) => {
          onSwitchPatient?.(targetItem)
        }}
        onSkipItem={onQueueAction ? (item) => { void onQueueAction(item, 'miss') } : undefined}
      />
    )}
  </section>
}

export function UnsavedPatientWorkDialog({ residentName, action, labels, saving, onClose, onSaveAndContinue, onDiscard }: {
  residentName: string; action: GuardedPatientAction; labels: string[]; saving: boolean
  onClose: () => void; onSaveAndContinue: () => Promise<void>; onDiscard: () => void
}) {
  const actionText = ({ queue: '切换患者', suspend: '暂挂接诊', complete: '完成诊毕', terminate: '终止诊疗' } as const)[action]
  const completionBlocked = action === 'complete'
  return <Dialog title={`${actionText}前请处理草稿`} eyebrow={`${residentName} · 防止串写`}
    closeOnBackdrop={false} description="当前页面还有未保存内容，直接离开会丢失这些修改。"
    onClose={onClose} footer={completionBlocked
      ? <><Button variant="secondary" disabled={saving} onClick={onClose}>继续修改</Button>
        <Button busy={saving} onClick={() => { void onSaveAndContinue() }}>保存并继续诊毕</Button></>
      : <><Button variant="secondary" onClick={onClose}>继续当前患者</Button>
        <Button onClick={onDiscard}>放弃草稿并{actionText}</Button></>}>
    <div className="doctor-unsaved-work-list" role="list" aria-label="未保存内容">
      {labels.map((label) => <div role="listitem" key={label}><Icon name="warning" /><span>{label}</span></div>)}
    </div>
    {completionBlocked && <Alert>保存将同步病历、诊断和医嘱草稿；校验通过后自动进入诊毕核对。</Alert>}
  </Dialog>
}
