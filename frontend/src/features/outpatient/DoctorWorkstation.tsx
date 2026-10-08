import { resolveExecutingDepartment, summarizeExecutingDepartments } from './orders/orderPresentation'
import { AnnotatedRecordField } from './record/AnnotatedRecordField'
import { rebaseAnnotations } from './record/recordAnnotations'
import type { RecordTextField } from '../../shared/api/recordAnnotations'
import { useClinicalAiDraft, type AiRecordUndo } from './record/useClinicalAiDraft'
import { DiagnosisPanel } from './record/DiagnosisPanel'
import { ClinicalVitalsFields } from './record/ClinicalVitalsFields'
import { StructuredNoteForm, ClinicalRecordReadView } from './record/StructuredNoteFields'

import { NoteTemplateBar, mergeNoteTemplateContent, noteTemplateFields, clinicalRecordAdditionalFields, type NoteTemplateField } from './record/NoteTemplateBar'
export { mergeNoteTemplateContent, type NoteTemplateField } from './record/NoteTemplateBar'
import { createClinicalDraftSaver } from './record/saveClinicalDraft'
import { createClinicalAmendmentWriter, signClinicalDocument } from './record/clinicalDocumentWorkflow'
import { useClinicalDocumentSession } from './record/useClinicalDocumentSession'
import { useClinicalDraftSession, type ClinicalDraftSession } from './record/useClinicalDraftSession'
import { completeEncounter } from './record/completeEncounter'
import { createCompletionBillingWriter } from './record/completionBillingWrites'
import { completionModeKey, requireCompletionMode, requireCompletionOrderCount, requireCompletionStatement,
  completionBillingSummary, requireCompletionPaymentOrders, hasPendingCompletionPayment, confirmCompletionFacts,
  type OutpatientCompletionMode } from './record/completionFacts'
import { requirePaymentRounding } from '../../shared/billing/roundAmount'
import { clinicalRecordContent, createRecordSchema, diagnosisDraftSignature,
  normalizeDiagnosisOrder, structuredFormSignature, validateStructuredForm,
  type RecordForm } from './record/clinicalRecordDraft'
import { usePrescriptionSplitPreview } from './orders/usePrescriptionSplitPreview'
import { matchSplitPreviewDraft, draftToBatchItem } from './orders/persistOrderDrafts'
export { createRecordSchema, diagnosisDraftSignature, moveDiagnosis, normalizeDiagnosisOrder,
  structuredFormSignature, validateStructuredForm } from './record/clinicalRecordDraft'
export { draftToBatchItem, persistOrderDrafts } from './orders/persistOrderDrafts'
import { OrderDocumentSummary, orderDocuments } from './OrderDocuments'
import { canPrintPrescription } from './orders/dispensableOptions'
import { buildDefaultDocumentInfo, getPrimaryDiagnosis } from './orders/orderDocumentDefaults'
import { OrderDocumentReviewCard, OrderDocumentReviewList } from './orders/OrderDocumentReviewCard'
import type { ClinicalAiFieldStream } from '../../shared/api/clinicalAiStream'
import { HistoryPrescriptionReference } from './ai/HistoryPrescriptionReference'
import { OutpatientDiagnosticResults } from './OutpatientDiagnosticResults'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import type { ClinicalContext } from '../../app/AppShell'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { ClinicalAiDraftContext, ClinicalAiRecordText } from '../../shared/api/clinicalAiApi'
import type { Department } from '../../shared/api/organizationApi'
import type {
  CreateOutpatientReferralInput, OutpatientReferral, OutpatientReferralStatus, OutpatientReferralType,
} from '../../shared/api/outpatientReferralsApi'
import type {
  ClinicalRecordInput, CompleteEncounterInput, DiagnosisInput,
  MedicationRequest, MedicationSafetyDecision, MedicationSafetyFinding, OrderDocumentInfo, Prescription, ServiceRequest,
} from '../../shared/api/encountersApi'
import type { TerminateEncounterInput } from '../../shared/api/outpatientFlowApi'
import type { OutpatientPlanTemplate, MinedPlanSuggestion, HistoricalStablePlan, SaveOutpatientPlanTemplateInput } from '../../shared/api/outpatientPlanTemplatesApi'
import { requireCreatedPlanReceipt, requireUsedPlanReceipt, requireUsedNoteReceipt, requireNoTemplateOrderConflicts,
  requirePlanCreationInput, templateApiScope } from './templates/templateApplicationReceipt'
import { useTemplateApplication } from './templates/useTemplateApplication'
import { canSelectHistoricalPlanDifference, hasHistoricalReviewEvidence, selectHistoricalPlanDifferences } from './templates/historicalPlanSelection'
import { useAiPlanApplication, type PrepareAiPlan } from './record/useAiPlanApplication'
import { resolveTemplateOrders, type ResolvedTemplateOrders } from './templates/resolveTemplateOrders'
import { planSourceReferenceLabel } from './templates/planTaskPresentation'
import type {
  OutpatientNoteTemplate, OutpatientNoteTemplateContent,
} from '../../shared/api/outpatientNoteTemplatesApi'
import type {
  OutpatientNoteForm,
} from '../../shared/api/outpatientNoteFormsApi'
import type { PrintPurpose, PrintReceipt, PrintRecord } from '../../shared/api/printingApi'
import type { AllergenTerm, AllergyIntolerance } from '../../shared/api/residentsApi'
import type { ReceptionQueueItem, ReceptionQueueScope } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import { age, formatTime } from '../../shared/format'
import { requiresBloodPressure } from './bloodPressurePolicy'
import { encounterStatusPresentation, historicalPlanDifferencePresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import type { SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, LoadingState,
  ObjectContextBar, PageHeader, Panel, PanelHead, Popconfirm, Select, StatusBadge,
  SearchField, tableCellClass, TableShell, Tabs, Tooltip,
} from '../../shared/ui'
import type { MedicationPlanDraft } from './orders/medicationDraft'
import { UnifiedOrderListEditor, type AiOrderReviewCommand, type ServicePlanDraft } from './UnifiedOrderListEditor'
import type { ClinicalAiSurfaceRefs } from './ai/ClinicalAiInlineWorkspace'
import {
  clinicalAiContextFingerprint,
  type ClinicalAiDraftRequest,
} from './ai/aiDraftAdapter'
import './waiting/waitingWorkspace.css'
import '../../styles/features/outpatient-doctor.css'
import '../../styles/doctor-ai-assistant.css'
import './templates/outpatient-plan-templates.css'
import { DedicatedWaitingWorkspace } from './waiting/DedicatedWaitingWorkspace'
import { QueueCapsuleBar } from './waiting/QueueCapsuleBar'
import { QueuePeekDrawer } from './waiting/QueuePeekDrawer'

const SettlementPaymentPanel = lazy(() => import('../../shared/billing/SettlementPaymentPanel')
  .then((module) => ({ default: module.SettlementPaymentPanel })))
const ClinicalAiAssistantPanel = lazy(() => import('./ai/ClinicalAiAssistantPanel')
  .then((module) => ({ default: module.ClinicalAiAssistantPanel })))
const DirectVisitDialog = lazy(() => import('./DirectVisitDialog')
  .then((module) => ({ default: module.DirectVisitDialog })))
import { enhanceQueueList } from './waiting/queueDataEnhancer'
import type { AiPreConsultation, EnhancedQueueItem, VitalsSummary } from './waiting/queueTypes'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function commandCode(action: string, encounterId: string) {
  return `${action}-${encounterId}-${globalThis.crypto.randomUUID()}`
}

interface PatientSelection {
  resident: Resident
  encounterId: string | null
  entryIntent: 'READ' | 'EDIT'
}

type QueueCommand = 'call' | 'recall' | 'miss' | 'requeue'

export interface EncounterDraftState {
  recordChanged: boolean
  diagnosesChanged: boolean
  medicationDraftCount: number
  serviceDraftCount: number
  busy: boolean
}

const emptyDraftState: EncounterDraftState = {
  recordChanged: false, diagnosesChanged: false, medicationDraftCount: 0, serviceDraftCount: 0, busy: false,
}

export function draftStateLabels(value: EncounterDraftState) {
  const labels: string[] = []
  if (value.recordChanged) labels.push('尚未保存的病历内容')
  if (value.diagnosesChanged) labels.push('尚未保存的诊断调整')
  if (value.medicationDraftCount) labels.push(`${value.medicationDraftCount} 条待确认药品医嘱`)
  if (value.serviceDraftCount) labels.push(`${value.serviceDraftCount} 条待确认诊疗项目`)
  return labels
}

export function DoctorWorkstation({ api, clinicalContext, canEdit }: {
  api: RhnApi; clinicalContext: ClinicalContext; canEdit: boolean
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const linkedResidentId = params.get('residentId')
  const linkedEncounterId = params.get('encounterId')
  const [selected, setSelected] = useState<PatientSelection | null>(null)
  const [peekDrawerOpen, setPeekDrawerOpen] = useState(false)
  const [directVisitOpen, setDirectVisitOpen] = useState(false)
  const directVisitSettings = useQuery({
    queryKey: ['direct-visit-settings', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.encounters.directVisitSettings(),
    enabled: canEdit && Boolean(api.encounters.directVisitSettings),
  })
  const [queueScope, setQueueScope] = useState<ReceptionQueueScope>('PERSONAL')
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id, queueScope],
    queryFn: () => api.scheduling.receptionQueue(businessDate(), undefined, queueScope),
    placeholderData: keepPreviousData,
  })
  const referralInbox = useQuery({
    queryKey: ['outpatient-referral-inbox', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.outpatientReferrals.inbox(),
  })
  const linkedResident = useQuery({
    queryKey: ['doctor-workstation-resident', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  useEffect(() => {
    if (linkedResident.data) setSelected({ resident: linkedResident.data, encounterId: linkedEncounterId, entryIntent: 'READ' })
  }, [linkedEncounterId, linkedResident.data])
  const openPatient = useMutation({
    mutationFn: async ({ item, entryIntent }: { item: ReceptionQueueItem | EnhancedQueueItem; entryIntent: 'READ' | 'EDIT' }) => ({
      resident: await api.residents.get(item.residentId), item, entryIntent,
    }),
    onSuccess: ({ resident, item, entryIntent }) => setSelected({ resident, encounterId: item.encounterId, entryIntent }),
  })
  const queueAction = useMutation({
    mutationFn: ({ item, action }: { item: ReceptionQueueItem | EnhancedQueueItem; action: QueueCommand }) => {
      if (!item.ticketId) throw new Error('当前候诊记录缺少统一号票标识，请刷新后重试')
      return api.queueing.action(item.ticketId, action, {
        commandCode: commandCode(`QUEUE-${action.toUpperCase()}`, item.encounterId),
        description: {
          call: '门诊医生呼叫患者',
          recall: '门诊医生重新呼叫患者',
          miss: '患者未到并标记过号',
          requeue: '过号患者到达后重新排队',
        }[action],
      })
    },
    onSuccess: () => refreshQueue(),
  })

  const refreshQueue = () => queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] })
  const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['outpatient-referral-inbox'] })

  const rawQueue = (queue.data ?? []).filter((item) =>
    ['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED', 'COMPLETED'].includes(item.status))
  const enhancedItems = useMemo(() => {
    return enhanceQueueList(rawQueue)
  }, [rawQueue])

  const handleQueueAction = (item: EnhancedQueueItem, action: QueueCommand) =>
    queueAction.mutateAsync({ item, action })

  if (selected) return <PatientWorkspace resident={selected.resident} encounterId={selected.encounterId}
    entryIntent={selected.entryIntent} api={api}
    clinicalContext={clinicalContext} canEdit={canEdit} onBack={() => setSelected(null)} onQueueRefresh={refreshQueue}
    enhancedQueueItems={enhancedItems}
    onSwitchPatient={(targetItem) => openPatient.mutate({ item: targetItem, entryIntent: 'EDIT' })}
    onQueueAction={handleQueueAction}
    peekDrawerOpen={peekDrawerOpen}
    setPeekDrawerOpen={setPeekDrawerOpen} />

  return <>
    <PageHeader compact eyebrow="门诊医疗 · 医生工作区" title="门诊医生站"
      description="门诊候诊、叫号调度与接诊状态协同工作台。"
      actions={<>
        <Button variant="secondary" onClick={() => navigate('/outpatient/plan-templates')}>
          <Icon name="sparkles" />临床模板库
        </Button>
        {canEdit && directVisitSettings.data?.enabled && (
          <Button onClick={() => setDirectVisitOpen(true)}><Icon name="add" />直接接诊</Button>
        )}
      </>} />
    {directVisitSettings.error && <Alert>{errorMessage(directVisitSettings.error)}</Alert>}
    {directVisitOpen && (
      <Suspense fallback={null}>
        <DirectVisitDialog api={api} hasServiceFee={Boolean(directVisitSettings.data?.catalogItemId)}
          onClose={() => setDirectVisitOpen(false)} onReceived={(resident, encounter) => {
            queryClient.setQueryData<Encounter[]>(['doctor-encounters', resident.id], values =>
              [encounter, ...(values ?? []).filter(value => value.id !== encounter.id)])
            void refreshQueue()
            setDirectVisitOpen(false)
            setSelected({ resident, encounterId: encounter.id, entryIntent: 'EDIT' })
          }} />
      </Suspense>
    )}
    {(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error) && <Alert className="ui-page-feedback">
      {errorMessage(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error)}</Alert>}

    <ReferralInboxPanel requests={referralInbox.data ?? []} loading={referralInbox.isPending}
      api={api} onRefresh={async () => { await Promise.all([refreshInbox(), refreshQueue()]) }} />

    {(!queue.data && queue.isPending) || (Boolean(linkedResidentId) && linkedResident.isPending) ? (
      <LoadingState label="正在加载候诊队列…" />
    ) : (
      <DedicatedWaitingWorkspace
        items={enhancedItems}
        queueScope={queueScope}
        onQueueScopeChange={setQueueScope}
        clinicalContext={clinicalContext}
        canEdit={canEdit}
        busy={openPatient.isPending || queueAction.isPending || queue.isFetching}
        onEnter={(item) => openPatient.mutate({ item, entryIntent: 'EDIT' })}
        onView={(item) => openPatient.mutate({ item, entryIntent: 'READ' })}
        onRefresh={() => void queue.refetch()}
        onCallItem={(item) => handleQueueAction(item, item.status === 'CALLED' ? 'recall' : 'call')}
        onMissItem={(item) => handleQueueAction(item, 'miss')}
        onRequeueItem={(item) => handleQueueAction(item, 'requeue')}
      />
    )}
  </>
}

type ReferralInboxAction =
  | { kind: 'ACCEPT'; request: OutpatientReferral }
  | { kind: 'COMPLETE'; request: OutpatientReferral; opinion: string }
  | { kind: 'REJECT'; request: OutpatientReferral; reason: string }

function ReferralInboxPanel({ requests, loading, api, onRefresh }: {
  requests: OutpatientReferral[]; loading: boolean; api: RhnApi; onRefresh: () => Promise<unknown>
}) {
  const [opinions, setOpinions] = useState<Record<string, string>>({})
  const [rejectingId, setRejectingId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const action = useMutation({
    mutationFn: (input: ReferralInboxAction) => {
      const code = commandCode(input.kind, input.request.id)
      if (input.kind === 'ACCEPT') return api.outpatientReferrals.accept(input.request.id, code)
      if (input.kind === 'COMPLETE') return api.outpatientReferrals.complete(input.request.id, code, input.opinion)
      return api.outpatientReferrals.reject(input.request.id, code, input.reason)
    },
    onSuccess: async (_, input) => {
      setRejectingId(''); setRejectReason('')
      if (input.kind === 'COMPLETE') {
        setOpinions((current) => { const next = { ...current }; delete next[input.request.id]; return next })
      }
      await onRefresh()
    },
  })
  if (!loading && requests.length === 0) return null
  return <Panel className="doctor-referral-inbox">
    <PanelHead title="科室协同待办" meta={`${requests.length} 项待处理`} />
    {loading ? <LoadingState label="正在加载会诊与转科请求…" />
      : <div className="doctor-referral-list">{requests.map((request) => {
        const typeLabel = referralTypeLabel(request.referralType)
        const isConsult = request.referralType === 'INTERNAL_CONSULT'
        const opinion = opinions[request.id] ?? ''
        return <article key={request.id} className={request.urgency === 'URGENT' ? 'is-urgent' : ''}>
          <header>
            <div><span>{request.requestNo}</span><strong>{request.residentName} · {typeLabel}</strong>
              <small>{request.sourceDepartmentName} · {request.encounterNo} · {formatTime(request.requestedAt)}</small></div>
            <StatusBadge tone={request.urgency === 'URGENT' ? 'danger' : referralStatusTone(request.status)}>
              {request.urgency === 'URGENT' ? '加急' : referralStatusLabel(request.status)}</StatusBadge>
          </header>
          <dl><div><dt>协同原因</dt><dd>{request.referralReason}</dd></div>
            <div><dt>病情摘要</dt><dd>{request.clinicalSummary}</dd></div></dl>
          {request.status === 'REQUESTED' && <div className="doctor-referral-actions">
            <Button size="sm" busy={action.isPending}
              onClick={() => action.mutate({ kind: 'ACCEPT', request })}>接收{typeLabel}</Button>
            <Button size="sm" variant="text" disabled={action.isPending}
              onClick={() => { setRejectingId(request.id); setRejectReason('') }}>退回</Button>
          </div>}
          {request.status === 'ACCEPTED' && isConsult && <div className="doctor-referral-opinion">
            <FormField label="会诊意见" required><textarea value={opinion} maxLength={4000}
              onChange={(event) => setOpinions((current) => ({ ...current, [request.id]: event.target.value }))}
              placeholder="填写诊疗建议、注意事项和后续处理意见" /></FormField>
            <Button size="sm" busy={action.isPending} disabled={!opinion.trim()}
              onClick={() => action.mutate({ kind: 'COMPLETE', request, opinion: opinion.trim() })}>提交会诊意见</Button>
          </div>}
          {rejectingId === request.id && <div className="doctor-referral-reject">
            <FormField label="退回原因" required><input value={rejectReason} maxLength={1000}
              onChange={(event) => setRejectReason(event.target.value)} placeholder="说明无法接收的原因" /></FormField>
            <div><Button size="sm" variant="secondary" disabled={action.isPending}
              onClick={() => { setRejectingId(''); setRejectReason('') }}>取消</Button>
              <Button size="sm" variant="danger" busy={action.isPending} disabled={!rejectReason.trim()}
                onClick={() => action.mutate({ kind: 'REJECT', request, reason: rejectReason.trim() })}>确认退回</Button></div>
          </div>}
        </article>
      })}</div>}
    {action.error && <Alert>{errorMessage(action.error)}</Alert>}
  </Panel>
}

function referralTypeLabel(value: OutpatientReferralType) {
  return value === 'INTERNAL_CONSULT' ? '院内会诊' : '院内转科'
}

function referralStatusLabel(value: OutpatientReferralStatus) {
  return ({ REQUESTED: '待接收', ACCEPTED: '处理中', COMPLETED: '已完成', REJECTED: '已退回', CANCELLED: '已撤销' } as const)[value]
}

function referralStatusTone(value: OutpatientReferralStatus): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
  return ({ REQUESTED: 'warning', ACCEPTED: 'info', COMPLETED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const)[value]
}

function defaultClinicalSummary(encounter: Encounter) {
  const primary = encounter.diagnoses.find((item) => item.type === 'PRIMARY')
  return [encounter.chiefComplaint && `主诉：${encounter.chiefComplaint}`,
    primary && `主要诊断：${primary.display}（${primary.code}）`].filter(Boolean).join('\n')
}

function ReferralCoordinationPanel({ encounter, clinicalContext, api, hasUnsavedDraft, onRefresh }: {
  encounter: Encounter; clinicalContext: ClinicalContext; api: RhnApi; hasUnsavedDraft: boolean
  onRefresh: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [referralType, setReferralType] = useState<OutpatientReferralType>('INTERNAL_CONSULT')
  const [targetDepartmentId, setTargetDepartmentId] = useState('')
  const [urgency, setUrgency] = useState<CreateOutpatientReferralInput['urgency']>('ROUTINE')
  const [reason, setReason] = useState('')
  const [clinicalSummary, setClinicalSummary] = useState(() => defaultClinicalSummary(encounter))
  const [cancellingId, setCancellingId] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const referrals = useQuery({
    queryKey: ['outpatient-referrals-by-encounter', encounter.id],
    queryFn: () => api.outpatientReferrals.byEncounter(encounter.id),
  })
  const departments = useQuery({
    queryKey: ['organization-departments', clinicalContext.organization.id],
    queryFn: () => api.organization.departments(clinicalContext.organization.id),
  })
  const targets = useMemo(() => (departments.data ?? []).filter((value) => value.id !== encounter.departmentId
    && value.sdOrgStatus === 'ACTIVE' && value.sdDepartmentProperty === 'CLINICAL'),
  [departments.data, encounter.departmentId])
  useEffect(() => {
    if (!targetDepartmentId && targets.length) setTargetDepartmentId(targets[0].id)
    if (targetDepartmentId && departments.data && !targets.some((value) => value.id === targetDepartmentId)) {
      setTargetDepartmentId(targets[0]?.id ?? '')
    }
  }, [departments.data, targetDepartmentId, targets])
  const refreshReferrals = () => queryClient.invalidateQueries({ queryKey: ['outpatient-referrals-by-encounter', encounter.id] })
  const create = useMutation({
    mutationFn: () => api.outpatientReferrals.create(encounter.id, {
      referralType, targetOrganizationId: clinicalContext.organization.id, targetDepartmentId,
      urgency, referralReason: reason.trim(), clinicalSummary: clinicalSummary.trim(),
      commandCode: commandCode('CREATE-REFERRAL', encounter.id),
    }),
    onSuccess: async () => {
      setReason(''); setUrgency('ROUTINE')
      await Promise.all([refreshReferrals(), onRefresh()])
    },
  })
  const cancel = useMutation({
    mutationFn: (request: OutpatientReferral) => api.outpatientReferrals.cancel(request.id,
      commandCode('CANCEL-REFERRAL', request.id), cancelReason.trim()),
    onSuccess: async () => {
      setCancellingId(''); setCancelReason('')
      await Promise.all([refreshReferrals(), onRefresh()])
    },
  })
  const open = (referrals.data ?? []).filter((value) => ['REQUESTED', 'ACCEPTED'].includes(value.status))
  const canCreate = encounter.status === 'IN_PROGRESS' && !hasUnsavedDraft && Boolean(targetDepartmentId)
    && Boolean(reason.trim()) && Boolean(clinicalSummary.trim()) && open.every((value) => value.referralType !== referralType)
  const error = referrals.error || departments.error || create.error || cancel.error

  return <div className="doctor-referral-coordination">
    <section className="doctor-referral-create">
      <header><div><strong>发起院内协同</strong><small>基层场景只填写目标科室、原因和必要病情摘要。</small></div></header>
      {encounter.status !== 'IN_PROGRESS' && <Alert>当前就诊不是接诊中状态，只能查看既往协同记录。</Alert>}
      {hasUnsavedDraft && <Alert>请先保存当前病历、诊断和医嘱草稿，再发起协同，避免病情摘要与病历不一致。</Alert>}
      <div className="doctor-referral-form">
        <FormField label="协同类型" required><select value={referralType}
          onChange={(event) => setReferralType(event.target.value as OutpatientReferralType)}>
          <option value="INTERNAL_CONSULT">院内会诊</option><option value="DEPARTMENT_TRANSFER">院内转科</option>
        </select></FormField>
        <FormField label="目标科室" required><select value={targetDepartmentId}
          onChange={(event) => setTargetDepartmentId(event.target.value)}>
          {targets.length ? targets.map((value: Department) => <option key={value.id} value={value.id}>{value.name}</option>)
            : <option value="">暂无可选科室</option>}
        </select></FormField>
        <FormField label="紧急程度"><select value={urgency}
          onChange={(event) => setUrgency(event.target.value as CreateOutpatientReferralInput['urgency'])}>
          <option value="ROUTINE">常规</option><option value="URGENT">加急</option>
        </select></FormField>
        <FormField className="doctor-referral-form__wide" label="协同原因" required><textarea value={reason}
          maxLength={2000} onChange={(event) => setReason(event.target.value)}
          placeholder={referralType === 'INTERNAL_CONSULT' ? '需要目标科室协助判断或处理的问题' : '需要转入目标科室继续诊疗的原因'} /></FormField>
        <FormField className="doctor-referral-form__wide" label="病情摘要" required><textarea value={clinicalSummary}
          maxLength={4000} onChange={(event) => setClinicalSummary(event.target.value)}
          placeholder="主诉、主要诊断、已完成处置和需要关注的风险" /></FormField>
      </div>
      {referralType === 'DEPARTMENT_TRANSFER' && <p className="doctor-referral-hint">
        转科前必须完成身份核验、主要诊断、病历保存和签署；发起后原接诊暂挂，目标科室接收时自动建立连续就诊。</p>}
      {open.some((value) => value.referralType === referralType) && <Alert>已有同类型协同正在处理，请完成或撤销后再发起。</Alert>}
      <div className="doctor-referral-submit"><Button size="sm" busy={create.isPending} disabled={!canCreate}
        onClick={() => create.mutate()}>发起{referralTypeLabel(referralType)}</Button></div>
    </section>
    <section className="doctor-referral-history">
      <header><strong>本次就诊协同记录</strong><small>{(referrals.data ?? []).length} 条</small></header>
      {referrals.isPending ? <LoadingState label="正在加载协同记录…" /> : !(referrals.data ?? []).length
        ? <EmptyState icon="tasks" title="暂无协同记录" copy="会诊与转科在此统一留痕。" />
        : <div className="doctor-referral-list">{referrals.data!.map((request) => <article key={request.id}>
          <header><div><span>{request.requestNo}</span><strong>{referralTypeLabel(request.referralType)} · {request.targetDepartmentName}</strong>
            <small>{formatTime(request.requestedAt)} · {request.urgency === 'URGENT' ? '加急' : '常规'}</small></div>
            <StatusBadge tone={referralStatusTone(request.status)}>{referralStatusLabel(request.status)}</StatusBadge></header>
          <dl><div><dt>协同原因</dt><dd>{request.referralReason}</dd></div>
            {request.outcomeText && <div><dt>{request.referralType === 'INTERNAL_CONSULT' ? '会诊意见' : '处理结果'}</dt><dd>{request.outcomeText}</dd></div>}
            {request.rejectionReason && <div><dt>退回原因</dt><dd>{request.rejectionReason}</dd></div>}</dl>
          {['REQUESTED', 'ACCEPTED'].includes(request.status) && <div className="doctor-referral-actions">
            <Button size="sm" variant="text" disabled={cancel.isPending}
              onClick={() => { setCancellingId(request.id); setCancelReason('') }}>撤销请求</Button></div>}
          {cancellingId === request.id && <div className="doctor-referral-reject">
            <FormField label="撤销原因" required><input value={cancelReason} maxLength={1000}
              onChange={(event) => setCancelReason(event.target.value)} placeholder="说明协同计划调整原因" /></FormField>
            <div><Button size="sm" variant="secondary" disabled={cancel.isPending}
              onClick={() => { setCancellingId(''); setCancelReason('') }}>取消</Button>
              <Button size="sm" variant="danger" busy={cancel.isPending} disabled={!cancelReason.trim()}
                onClick={() => cancel.mutate(request)}>确认撤销</Button></div>
          </div>}
        </article>)}</div>}
    </section>
    {error && <Alert>{errorMessage(error)}</Alert>}
  </div>
}

function queueEntryLabel(status: ReceptionQueueItem['status']) {
  if (status === 'SERVING') return '继续接诊'
  if (status === 'SUSPENDED') return '恢复接诊'
  return '接诊'
}

export function QueueRow({ item, busy, canEdit, onEnter, onView }: {
  item: ReceptionQueueItem; busy: boolean; canEdit: boolean; onEnter: () => void; onView: () => void
}) {
  const entryLabel = queueEntryLabel(item.status)
  return <article className="doctor-queue-row">
    <span className="doctor-queue-ticket">{item.ticketNo}</span>
    <span className="doctor-queue-patient"><strong>{item.residentName}</strong><small>{item.genderText ?? '未知'} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
    <span className="doctor-queue-service"><strong>{item.serviceName || '普通门诊'}</strong><small>{item.practitionerName || '现场接诊'}{item.locationName ? ` · ${item.locationName}` : ''}</small></span>
    <span className="doctor-queue-time"><strong>{formatTime(item.registeredAt)}</strong><small>挂号时间</small></span>
    <StatusBadge tone={item.status === 'SERVING' ? 'success' : 'warning'}>
      {item.status === 'SERVING' ? '接诊中' : item.status === 'SUSPENDED' ? '已暂挂' : '候诊'}</StatusBadge>
    <span className="doctor-queue-actions">
      <Button size="sm" variant="text" disabled={busy} aria-label={`查看 ${item.residentName}`} onClick={onView}>查看</Button>
      <Button size="sm" busy={busy} disabled={!canEdit} title={canEdit ? `${entryLabel}${item.residentName}` : '当前账号没有病历编辑权限'}
        aria-label={`${entryLabel} ${item.residentName}`} onClick={onEnter}>{entryLabel}</Button>
    </span>
  </article>
}

type WorkTool = 'assistant' | 'plans' | 'history' | 'results' | 'coordination' | 'allergy' | 'prints'
type GuardedPatientAction = 'queue' | 'suspend' | 'complete' | 'terminate'
type HistoryRecordField = 'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'
type HistoryCopyField = HistoryRecordField | `diagnosis:${string}`
type HistoryCopyRecord = Partial<Pick<ClinicalRecordInput,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'>>

interface HistoryCopyDraft {
  targetEncounterId?: string
  targetResidentId?: string
  medicationDrafts?: MedicationPlanDraft[]
  requestId: number
  sourceEncounterNo: string
  sourceRegisteredAt: string
  record: HistoryCopyRecord
  diagnoses?: DiagnosisInput[]
}

function PatientWorkspace({ resident, encounterId, entryIntent, api, clinicalContext, canEdit, onBack, onQueueRefresh,
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
  const completionConfigurationSession = useMemo(() => globalThis.crypto.randomUUID(), [api])
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
      facts={[{ label: '健康档案号', value: resident.healthRecordNo },
        { label: '联系电话', value: resident.phone || '未登记' },
        { label: '就诊号', value: encounter?.encounterNo || '无当前就诊' },
        ...(patientTriageRecord.data ? [{
          label: '预检分诊',
          value: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
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
      actions={<div className="doctor-context-actions">
        {entryIntent === 'READ' && !editing && (
          <Button size="sm" variant="secondary" aria-label="返回患者列表"
            title="退出当前患者并返回患者列表" onClick={() => requestAction('queue')}>
            <Icon name="arrow-left" /><span>返回列表</span>
          </Button>
        )}
        {encounter && <>
          <StatusBadge tone={encounterStatusPresentation(encounter.status).tone}>
            {encounterStatusPresentation(encounter.status).label}</StatusBadge>
          {enhancedQueueItems.length > 0 && (
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
          <div className="doctor-context-actions__buttons">
            {editing && encounter.status === 'IN_PROGRESS' && <>
              <Button
                size="sm"
                variant={hasUnsavedDraft ? 'primary' : 'secondary'}
                className="doctor-btn--save-draft"
                busy={draftState.busy}
                disabled={aiAdoptionBusy || Boolean(aiFieldStream) || !hasUnsavedDraft}
                title={hasUnsavedDraft ? '保存病历、诊断与医嘱草稿 (Ctrl+S)' : '当前草稿已与服务器同步 (Ctrl+S)'}
                onClick={() => { void handleSaveDraft() }}
              >
                <Icon name="check" />
                <span>{hasUnsavedDraft ? '保存全部草稿' : '草稿已保存'}</span>
              </Button>
              <Button size="sm" variant="secondary" disabled={aiAdoptionBusy}
                title="暂时释放当前接诊工作会话，患者返回后可继续"
                onClick={() => requestAction('suspend')}>暂挂</Button>
              <Button size="sm" busy={complete.isPending} disabled={aiAdoptionBusy}
                title="进入诊毕汇总，核对费用和转归信息"
                onClick={() => requestAction('complete')}>诊毕</Button>
              <Button size="sm" variant="text" disabled={aiAdoptionBusy} className="doctor-btn--terminate"
                title="患者离开或明确要求停止本次诊疗"
                onClick={() => requestAction('terminate')}>终止诊疗</Button>
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
                  onReviewTreatment={(items, onCompleted) => setAiOrderReview({
                    id: crypto.randomUUID(), encounterId: encounter.id, items, onCompleted,
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
              {activeTool === 'prints' && <EncounterPrintPanel encounter={encounter} api={api} />}
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
            <ToolButton icon="print" label="受控打印" active={activeTool === 'prints'} onClick={() => setActiveTool(toggleTool(activeTool, 'prints'))} />
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

function UnsavedPatientWorkDialog({ residentName, action, labels, saving, onClose, onSaveAndContinue, onDiscard }: {
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

const suspensionReasons = ['患者暂时离开诊室', '等待检查检验结果', '急诊或其他患者优先处置', '其他原因'] as const

const terminationTypes = [
  ['PATIENT_LEFT', '患者自行离院'],
  ['PATIENT_REQUEST', '患者要求终止'],
  ['TRANSFERRED', '转其他机构或急诊'],
  ['OTHER', '其他原因'],
] as const

function EncounterTerminationDialog({ encounter, api, busy, error, onClose, onConfirm }: {
  encounter: Encounter; api: RhnApi; busy: boolean; error: unknown; onClose: () => void
  onConfirm: (input: TerminateEncounterInput) => void
}) {
  const [terminationCode, setTerminationCode] = useState<TerminateEncounterInput['terminationCode']>('PATIENT_LEFT')
  const [reason, setReason] = useState('')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('TERMINATE', encounter.id))
  const readiness = useQuery({
    queryKey: ['encounter-termination-readiness', encounter.id],
    queryFn: () => api.outpatientFlow.terminationReadiness(encounter.id),
  })
  const issues = readiness.data?.issues ?? []
  return <Dialog title="终止本次诊疗" eyebrow="门诊接诊 · 异常收口" closeOnBackdrop={false}
    description="仅用于已经接诊但无法正常诊毕的场景。系统会保留挂号、病历和已完成业务事实。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>返回接诊</Button>
      <Button busy={busy} disabled={readiness.isPending || !readiness.data?.ready || !reason.trim()}
        onClick={() => onConfirm({ commandCode: requestCommand,
          terminationCode, reason: reason.trim() })}>确认终止诊疗</Button></>}>
    <div className="ui-form-grid">
      <FormField label="终止类型" required><select value={terminationCode}
        onChange={(event) => { setTerminationCode(event.target.value as TerminateEncounterInput['terminationCode'])
          setRequestCommand(commandCode('TERMINATE', encounter.id)) }}>
        {terminationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></FormField>
      <FormField label="终止原因" required><textarea value={reason} maxLength={500}
        onChange={(event) => { setReason(event.target.value); setRequestCommand(commandCode('TERMINATE', encounter.id)) }}
        placeholder="记录患者离院、拒绝继续诊疗或转诊等具体情况" /></FormField>
    </div>
    {readiness.isPending && <LoadingState label="正在核对费用及诊后任务…" />}
    {readiness.data?.ready && <Alert>当前没有未处置的费用、药房、医技或治疗任务，可以终止本次接诊。</Alert>}
    {issues.length > 0 && <div className="doctor-completion-checklist doctor-completion-checklist--dialog">
      {issues.map((issue) => <span key={issue.code}><Icon name="warning" className="ui-icon-inline" /> {issue.message}</span>)}
    </div>}
    {Boolean(readiness.error || error) && <Alert>{errorMessage(readiness.error || error)}</Alert>}
  </Dialog>
}

function EncounterSuspendDialog({ encounterId, busy, error, onClose, onConfirm }: {
  encounterId: string; busy: boolean; error: unknown; onClose: () => void
  onConfirm: (input: { commandCode: string; reason: string }) => void
}) {
  const [reason, setReason] = useState<(typeof suspensionReasons)[number]>(suspensionReasons[0])
  const [note, setNote] = useState('')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('SUSPEND', encounterId))
  const value = `${reason}${note.trim() ? `：${note.trim()}` : ''}`
  return <Dialog title="暂挂本次接诊" eyebrow="门诊队列 · 状态处置"
    description="暂挂后患者会保留在今日队列，病历和医嘱不会丢失，返回后可以继续接诊。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} onClick={() => onConfirm({ commandCode: requestCommand, reason: value })}>确认暂挂</Button></>}>
    <div className="ui-form-grid">
      <FormField label="暂挂原因" required><select value={reason}
        onChange={(event) => { setReason(event.target.value as typeof reason)
          setRequestCommand(commandCode('SUSPEND', encounterId)) }}>
        {suspensionReasons.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></FormField>
      <FormField label="补充说明"><textarea value={note} maxLength={300}
        onChange={(event) => { setNote(event.target.value); setRequestCommand(commandCode('SUSPEND', encounterId)) }}
        placeholder="可选" /></FormField>
    </div>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
  </Dialog>
}

function AllergyContextValue({ allergies, loading, error, disabled, onClick }: {
  allergies: AllergyIntolerance[]; loading: boolean; error: unknown; disabled: boolean; onClick: () => void
}) {
  const actual = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const noKnown = allergies.some((item) => item.assertionType !== 'ALLERGY')
  const tone = error ? 'error' : actual.length ? 'risk' : noKnown ? 'clear' : 'unknown'
  const summary = loading ? '加载中…' : error ? '读取失败' : actual.length
    ? `${actual.slice(0, 2).map((item) => item.substanceDisplay).join('、')}${actual.length > 2 ? `等${actual.length}项` : ''}`
    : noKnown ? '无已知药物过敏' : '尚未核对'
  return <Tooltip content={`${summary}；点击查看和维护`}>
    <Button variant="text" size="sm" type="button" className={`doctor-context-allergy is-${tone}`} disabled={disabled}
      aria-label={`过敏信息：${summary}，点击查看和维护`} onClick={onClick}>
      <span>{summary}</span><Icon name="chevron-right" />
    </Button>
  </Tooltip>
}

function toggleTool(current: WorkTool | null, next: WorkTool): WorkTool | null {
  return current === next ? null : next
}

function toolLabel(value: WorkTool) {
  return ({ assistant: '智医助理', plans: '临床模板', history: '就诊历史', results: '检验检查结果', coordination: '协同业务',
    allergy: '过敏信息', prints: '受控打印' } as const)[value]
}

function ToolButton({ icon, label, active, onClick }: {
  icon: 'sparkles' | 'stethoscope' | 'roadmap' | 'clinical' | 'tasks' | 'organization' | 'print'; label: string; active: boolean; onClick: () => void
}) {
  const labelLines = Array.from({ length: Math.ceil(label.length / 2) }, (_, index) => label.slice(index * 2, index * 2 + 2))
  return <Button variant={active ? 'secondary' : 'text'} aria-label={label}
    aria-pressed={active} title={label} onClick={onClick}>
    <Icon name={icon} /><span className="doctor-tool-label" aria-hidden="true">
      {labelLines.map(line => <span key={line}>{line}</span>)}
    </span>
  </Button>
}

const quickDispositionPhrases = [
  '按医嘱用药，如症状加重及时复诊',
  '遵医嘱服药，注意清淡饮食与休息',
  '一周后门诊复查',
  '两周后复查评估疗效',
  '不适随诊，需监测血压与血糖',
  '建议转专科进一步系统检查与治疗',
]

function EncounterCompletionDialog({ encounter, api, signed, ready, busy, error, completionMode, canEdit, billingWriter,
  configurationError, configurationLoading, onReloadConfiguration,
  onClose, onComplete, onSignNote, signing }: {
  encounter: Encounter; api: RhnApi; signed: boolean; ready: boolean; busy: boolean; error: unknown
  completionMode: OutpatientCompletionMode | undefined
  configurationError: unknown; configurationLoading: boolean; onReloadConfiguration: () => Promise<unknown>
  canEdit: boolean; billingWriter: ReturnType<typeof createCompletionBillingWriter>
  onClose: () => void; onComplete: (input: CompleteEncounterInput, batchPrint?: boolean) => void
  onSignNote?: () => void; signing?: boolean
}) {
  const [batchPrintOnComplete, setBatchPrintOnComplete] = useState(false)
  const [dispositionCode, setDispositionCode] = useState<CompleteEncounterInput['dispositionCode']>('HOME')
  const [dispositionNote, setDispositionNote] = useState('')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('COMPLETE', encounter.id))
  const queryClient = useQueryClient()
  const sessionKey = useMemo(() => globalThis.crypto.randomUUID(), [api])
  const statement = useQuery({
    queryKey: ['doctor-completion-statement', sessionKey, encounter.id],
    queryFn: async () => requireCompletionStatement(await api.billing.statement(encounter.id), encounter), retry: false,
  })
  const services = useQuery({ queryKey: ['doctor-completion-services', sessionKey, encounter.id], retry: false,
    queryFn: async () => requireCompletionOrderCount(await api.encounters.serviceRequests(encounter.id), encounter, 'service') })
  const medications = useQuery({ queryKey: ['doctor-completion-medications', sessionKey, encounter.id], retry: false,
    queryFn: async () => requireCompletionOrderCount(await api.encounters.medicationRequests(encounter.id), encounter, 'medication') })
  const confirmedStatement = statement.isSuccess && !statement.isFetching ? statement.data : undefined
  const billing = confirmedStatement ? completionBillingSummary(confirmedStatement) : undefined
  const methods = useQuery({
    queryKey: ['doctor-completion-methods', sessionKey, encounter.id], retry: false,
    enabled: Boolean(billing?.payable.length),
    queryFn: async () => {
      const items = await api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE')
      if (!Array.isArray(items) || items.some(item => !item || !item.code?.trim() || !item.name?.trim())
        || new Set(items.map(item => item.code)).size !== items.length) throw new Error('诊间支付方式配置无效')
      for (const item of items) if (item.code !== 'MEDICAL_INSURANCE') {
        requirePaymentRounding(item.attributes?.PAYMENT_PRECISION, item.attributes?.ROUNDING_MODE)
      }
      return items.filter(item => item.code !== 'MEDICAL_INSURANCE')
    },
  })
  const orders = useQuery({
    queryKey: ['doctor-completion-payment-orders', sessionKey, encounter.id, confirmedStatement?.accountId], retry: false,
    queryFn: async () => requireCompletionPaymentOrders(await api.billing.paymentOrders(confirmedStatement!.accountId), confirmedStatement!),
    enabled: Boolean(confirmedStatement),
    refetchInterval: query => query.state.data && hasPendingCompletionPayment(query.state.data) ? 2500 : false,
  })
  const ordersReady = orders.isSuccess && !orders.isFetching && Boolean(confirmedStatement)
  const pendingPayment = ordersReady && hasPendingCompletionPayment(orders.data)
  const orderCount = services.isSuccess && !services.isFetching && medications.isSuccess && !medications.isFetching
    ? services.data + medications.data : undefined
  const factsError = configurationError || statement.error || services.error || medications.error || orders.error
    || (billing?.payable.length ? methods.error : undefined)
  const factsLoading = configurationLoading || statement.isFetching || services.isFetching || medications.isFetching || orders.isFetching
  const factsReady = Boolean(completionMode && confirmedStatement && orderCount !== undefined && ordersReady && !factsError)
  const canComplete = ready && factsReady && billing?.settled && !pendingPayment && !billingWriter.hasPending()
  const reloadFacts = async () => {
    await Promise.all([onReloadConfiguration(), statement.refetch(), services.refetch(), medications.refetch(),
      ...(confirmedStatement ? [orders.refetch()] : []), ...(billing?.payable.length ? [methods.refetch()] : [])])
  }
  const captureBillingSession = useClinicalDocumentSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit)
  const billingOperation = useMutation({
    mutationFn: async (input: { kind: 'payment'; command: SettlementPaymentCommand } | { kind: 'invoice' | 'retry' }) => {
      const assertCurrent = captureBillingSession()
      if (input.kind === 'retry') return billingWriter.retry(api.billing, encounter, assertCurrent)
      if (!confirmedStatement || !ordersReady || !canEdit) throw new Error('诊间结算资料尚未确认，请重新加载')
      return input.kind === 'payment'
        ? billingWriter.pay(api.billing, encounter, confirmedStatement, input.command, assertCurrent)
        : billingWriter.issue(api.billing, encounter, confirmedStatement, assertCurrent)
    },
    onSuccess: result => {
      result.assertCurrent()
      queryClient.setQueryData(['doctor-completion-statement', sessionKey, encounter.id], result.statement)
      queryClient.setQueryData(['doctor-completion-payment-orders', sessionKey, encounter.id, result.statement.accountId], result.orders)
      result.confirmApplied()
      void queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })
      void queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] })
    },
  })
  const billingPending = billingWriter.hasPending()
  const dialogBusy = busy || signing || billingOperation.isPending
  const payable = billing?.payable ?? []
  const outstanding = billing?.outstanding

  const primaryDiag = encounter.diagnoses.find((value) => value.type === 'PRIMARY')?.display || '未录入'
  const hasChiefComplaint = Boolean(encounter.chiefComplaint?.trim())
  const hasPrimaryDiagnosis = encounter.diagnoses.some((value) => value.type === 'PRIMARY')
  const signatureReady = signed || completionMode === 'COMBINED_CONFIRMATION'
  const completedRequirementCount = [hasChiefComplaint, hasPrimaryDiagnosis, signatureReady].filter(Boolean).length

  return <Dialog title="诊毕确认" eyebrow="本次就诊收口" size="xwide" className="doctor-completion-modal"
    closeOnBackdrop={false} onClose={() => !dialogBusy && onClose()}
    description="集中核对病历、诊断、医嘱、费用与患者转归；确认后当前就诊将结束。"
    footer={<><Button variant="secondary" disabled={dialogBusy} onClick={onClose}>继续诊疗</Button>
      <Button busy={dialogBusy} disabled={!canComplete || !dispositionCode || billingOperation.isPending}
        title={!factsReady ? '诊毕资料尚未确认' : !billing?.settled || pendingPayment ? '请先完成诊间结算' : !ready ? '病历或主要诊断尚未完成' : signed ? '确认诊毕' : '签署病历并完成诊毕'}
        onClick={() => canComplete && onComplete({ commandCode: requestCommand, dispositionCode,
          dispositionNote: dispositionNote.trim() || undefined }, batchPrintOnComplete)}>{signed ? '确认诊毕' : completionMode === 'COMBINED_CONFIRMATION'
            ? '签署并诊毕' : '确认诊毕'}</Button></>}>
    <div className="doctor-completion-dialog" inert={dialogBusy}>
      {(error || billingOperation.error)
        && <Alert duration={null}>{errorMessage(error || billingOperation.error)}</Alert>}
      {factsError && <Alert duration={null}>诊毕资料加载失败：{errorMessage(factsError)}</Alert>}
      <div className="ui-form-actions">
        <span>{factsLoading ? '正在核对诊毕资料…' : !factsReady ? '诊毕资料待核对' : !billing?.settled || pendingPayment ? '费用或支付处理尚未完成' : '诊毕资料已核对'}</span>
        <Button variant="secondary" size="sm" busy={factsLoading} onClick={() => void reloadFacts()}>重新加载诊毕资料</Button>
      </div>
      {billingPending && <div className="ui-form-actions">
        <span>上次诊间结算尚未确认，请先核实原请求，避免重复收款或开票。</span>
        <Button variant="secondary" disabled={!canEdit} busy={billingOperation.isPending}
          onClick={() => billingOperation.mutate({ kind: 'retry' })}>核实上次结算操作</Button>
      </div>}
      <section className="doctor-completion-overview" aria-label="诊毕状态汇总">
        <div className="doctor-overview-stat doctor-overview-stat--diagnosis">
          <div className="doctor-overview-stat__header">
            <Icon name="clinical" className="ui-icon-inline" />
            <span>主要诊断</span>
          </div>
          <strong title={primaryDiag} className={hasPrimaryDiagnosis ? '' : 'is-warning'}>{primaryDiag}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--note">
          <div className="doctor-overview-stat__header">
            <Icon name={signed ? 'check' : 'warning'} className="ui-icon-inline" />
            <span>病历状态</span>
          </div>
          <strong className={signed || completionMode === 'COMBINED_CONFIRMATION' ? 'is-success' : 'is-warning'}>
            {signed ? '已签署' : completionMode === 'COMBINED_CONFIRMATION' ? '将在诊毕时签署' : '待签署'}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--orders">
          <div className="doctor-overview-stat__header">
            <Icon name="tasks" className="ui-icon-inline" />
            <span>本次医嘱</span>
          </div>
          <strong>{orderCount === undefined ? '医嘱待核对' : `${orderCount} 项`}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--fee">
          <div className="doctor-overview-stat__header">
            <div className="doctor-overview-stat__header-title">
              <Icon name="billing" className="ui-icon-inline" />
              <span>待收金额</span>
            </div>
            {confirmedStatement && confirmedStatement.uninvoicedAmount > 0 && (
              <Button variant="text" size="sm" type="button" className="doctor-fee-quick-invoice-btn" disabled={!canEdit || billingOperation.isPending || billingPending || !ordersReady || pendingPayment}
                onClick={() => billingOperation.mutate({ kind: 'invoice' })}>
                {billingOperation.isPending ? '处理中…' : '生成结算单'}
              </Button>
            )}
          </div>
          <div className="doctor-fee-stat-content">
            <strong className={billing?.settled && ordersReady && !pendingPayment ? 'is-success' : 'is-warning'}>
              {!confirmedStatement ? '费用待核对' : !ordersReady ? '支付状态待核对' : pendingPayment ? '支付处理中'
                : billing?.settled ? `已结清 (${money(0, confirmedStatement.currencyCode)})`
                  : outstanding! > 0 ? money(outstanding!, confirmedStatement.currencyCode)
                    : confirmedStatement.uninvoicedAmount !== 0 ? '尚有未开票费用'
                      : confirmedStatement.accountBalance !== 0 ? '账户余额待核对' : '结算尚未完成'}
            </strong>
            {confirmedStatement ? (
              <div className="doctor-fee-stat-metrics">
                <span>费用合计 <strong>{money(confirmedStatement.chargeAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>已支付 <strong>{money(confirmedStatement.paymentAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>未开票 <strong>{money(confirmedStatement.uninvoicedAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>待支付 <strong>{money(outstanding!, confirmedStatement.currencyCode)}</strong></span>
                <span>账户余额 <strong>{money(confirmedStatement.accountBalance, confirmedStatement.currencyCode)}</strong></span>
              </div>
            ) : statement.isPending ? (
              <small className="doctor-fee-stat__hint">读取中…</small>
            ) : null}
          </div>
        </div>
      </section>
      {payable.length > 0 && (
        <section className="doctor-completion-payment-section">
          <header className="doctor-disposition-section__head">
            <Icon name="billing" className="ui-icon-inline" />
            <strong>诊间收款（待结算 {payable.length} 笔）</strong>
          </header>
          <div className="doctor-completion-payment">
            <Suspense fallback={<LoadingState label="正在加载收款组件…" />}>
              {billingPending || !canEdit || !ordersReady || !methods.isSuccess || methods.isFetching || !methods.data.length
                ? <p>支付资料尚未确认或没有可用支付方式，请重新加载或联系管理员。</p>
                : <SettlementPaymentPanel settlements={payable.map((value) => ({
                id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount, currencyCode: value.currencyCode,
              }))} methods={methods.data.map((value) => ({
                code: value.code,
                name: value.name,
                sortOrder: value.sortOrder,
                precision: value.attributes?.PAYMENT_PRECISION,
                roundingMode: value.attributes?.ROUNDING_MODE,
              }))}
              orders={orders.data!} busy={billingOperation.isPending} sceneLabel="诊间收款"
              onSubmit={(command) => billingOperation.mutateAsync({ kind: 'payment', command })} />}
            </Suspense>
          </div>
        </section>
      )}
      <div className="doctor-completion-workflow">
        <section className="doctor-disposition-section">
          <div className="doctor-disposition-section__head">
            <Icon name="roadmap" className="ui-icon-inline" />
            <strong>就诊转归与随访指导</strong>
          </div>
          <div className="doctor-disposition-form">
            <FormField label="就诊转归" required>
              <Select value={dispositionCode} searchable={false} clearable={false}
                onChange={(value) => {
                  setDispositionCode(value as CompleteEncounterInput['dispositionCode'])
                  setRequestCommand(commandCode('COMPLETE', encounter.id))
                }} options={[
                  { value: 'HOME', label: '门诊离院' }, { value: 'FOLLOW_UP', label: '预约复诊' },
                  { value: 'OBSERVATION', label: '留观' }, { value: 'REFERRAL', label: '转诊 / 转科' },
                  { value: 'ADMISSION', label: '收治住院' },
                ]} />
            </FormField>
            <div className="doctor-disposition-note-wrap">
              <FormField label="转归及随访说明">
                <textarea className="ui-field__control" maxLength={800} value={dispositionNote}
                  onChange={(event) => { setDispositionNote(event.target.value)
                    setRequestCommand(commandCode('COMPLETE', encounter.id)) }}
                  placeholder="复诊时间、注意事项、转诊去向等" />
              </FormField>
              <div className="doctor-quick-phrases" aria-label="常用随访短语">
                <span className="doctor-quick-phrases__label">常用语</span>
                <div className="doctor-quick-phrases__chips">
                  {quickDispositionPhrases.map((phrase) => (
                    <Button variant="text" size="sm"
                      type="button"
                      key={phrase}
                      className="doctor-quick-phrase-chip"
                      onClick={() => {
                        setDispositionNote(phrase)
                        setRequestCommand(commandCode('COMPLETE', encounter.id))
                      }}>
                      {phrase}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className={`doctor-completion-checklist doctor-completion-checklist--dialog ${canComplete ? 'is-ready-group' : 'is-pending-group'}`} aria-label="诊毕准入核对">
          <div className="doctor-completion-checklist__header">
            <span className="doctor-completion-checklist__title">
              <Icon name={canComplete ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>诊毕前置核对</span>
            </span>
            <strong>{canComplete ? '已全部通过' : !factsReady ? '资料待核对' : !billing?.settled || pendingPayment ? '结算待完成' : `${completedRequirementCount}/3 已完成`}</strong>
          </div>
          <div className="doctor-completion-checklist__items">
            <span className={`doctor-checklist-chip ${hasChiefComplaint ? 'is-ready' : 'is-missing'}`}>
              <Icon name={hasChiefComplaint ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>主诉已保存</span>
            </span>
            <span className={`doctor-checklist-chip ${hasPrimaryDiagnosis ? 'is-ready' : 'is-missing'}`}>
              <Icon name={hasPrimaryDiagnosis ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>主要诊断</span>
            </span>
            <span className={`doctor-checklist-chip ${signatureReady ? 'is-ready' : 'is-missing'}`}>
              <Icon name={signatureReady ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>{signed ? '病历已签署' : completionMode === 'COMBINED_CONFIRMATION' ? '确认时自动签署' : '病历签署'}</span>
              {!signed && completionMode === 'SEPARATE_CONFIRMATIONS' && onSignNote && (
                <Button
                  size="sm"
                  variant="primary"
                  className="doctor-checklist-action-btn"
                  busy={signing}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSignNote()
                  }}
                >
                  立即签署
                </Button>
              )}
            </span>
          </div>
        </div>
        <label className="doctor-completion-print-option ui-field__checkbox">
          <input
            type="checkbox"
            checked={batchPrintOnComplete}
            onChange={(event) => setBatchPrintOnComplete(event.target.checked)}
          />
          <span>诊毕后立即打开批量打印（病历及已生效处方/申请单）</span>
        </label>
      </div>
    </div>
  </Dialog>
}

export function AllergySafetyPanel({ resident, encounter, allergies, loading, error, api, readOnly = false }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; loading: boolean; error: unknown; api: RhnApi
  readOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<NonNullable<AllergyIntolerance['categoryCode']>>('DRUG')
  const [criticality, setCriticality] = useState<NonNullable<AllergyIntolerance['criticalityCode']>>('UNABLE_TO_ASSESS')
  const [severity, setSeverity] = useState<NonNullable<AllergyIntolerance['reactionSeverity']>>('MILD')
  const [substance, setSubstance] = useState('')
  const [selectedAllergenId, setSelectedAllergenId] = useState('')
  const [customAllergen, setCustomAllergen] = useState(false)
  const [reaction, setReaction] = useState('')
  const allergenTerms = useQuery({
    queryKey: ['allergen-terms', category],
    queryFn: () => typeof api.residents.allergenTerms === 'function'
      ? api.residents.allergenTerms(category) : Promise.resolve([] as AllergenTerm[]),
    enabled: !readOnly,
  })
  const selectedAllergen = allergenTerms.data?.find((item) => item.id === selectedAllergenId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] })
  const record = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'ALLERGY', categoryCode: category, criticalityCode: criticality,
      reactionSeverity: severity, informationSource: 'PATIENT', allergenId: selectedAllergen?.id,
      substanceDisplay: selectedAllergen?.display ?? substance.trim(),
      substanceCodeSystemUri: selectedAllergen?.codeSystemUri,
      substanceCode: selectedAllergen?.code, reactionText: reaction.trim() || undefined,
    }),
    onSuccess: async () => { setSubstance(''); setSelectedAllergenId('');
      setCustomAllergen(false); setReaction(''); await refresh() },
  })
  const noKnown = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'NO_KNOWN_DRUG_ALLERGY', informationSource: 'PATIENT',
    }), onSuccess: refresh,
  })
  const inactivate = useMutation({
    mutationFn: (value: AllergyIntolerance) => api.residents.inactivateAllergy(
      resident.id, value.id, value.revision, '医生复核后停用',
    ), onSuccess: refresh,
  })
  const actual = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const noKnownAssertion = allergies.find((item) => item.assertionType !== 'ALLERGY')
  const mutationError = record.error || noKnown.error || inactivate.error

  const categoryOptions = [
    { value: 'DRUG', label: '药物' }, { value: 'FOOD', label: '食物' },
    { value: 'ENVIRONMENT', label: '环境' }, { value: 'BIOLOGIC', label: '生物制品' }, { value: 'OTHER', label: '其他' },
  ]

  return <section className={`doctor-allergy-safety ${actual.length ? 'is-risk' : noKnownAssertion ? 'is-clear' : 'is-unknown'}`}
    aria-label="患者过敏安全信息">
    <div className="doctor-allergy-overview">
      <span className="doctor-allergy-overview__icon" aria-hidden="true"><Icon name={actual.length ? 'warning' : noKnownAssertion ? 'check' : 'info'} /></span>
      <div><span>当前过敏状态</span>{loading ? <strong>正在加载</strong>
        : actual.length ? <strong>{actual.length} 项有效过敏记录</strong>
          : noKnownAssertion ? <strong>已确认无已知药物过敏</strong> : <strong>尚未核对过敏信息</strong>}
        <small>{readOnly ? '当前为阅读状态' : '变更将关联本次就诊并留痕'}</small></div>
      {!loading && !readOnly && allergies.length === 0 && <Button size="sm" variant="secondary" busy={noKnown.isPending}
        onClick={() => noKnown.mutate()}>确认无已知药物过敏</Button>}
    </div>

    <div className="doctor-allergy-records">
      <header><strong>有效记录</strong><span>{actual.length} 项</span></header>
      {actual.length > 0 ? <div className="doctor-allergy-list">{actual.map((item) => <article key={item.id}>
        <div><strong>{item.substanceDisplay}</strong>
          <small>{[allergyCategoryLabel(item.categoryCode), allergySeverityLabel(item.reactionSeverity),
            allergyCriticalityLabel(item.criticalityCode), item.reactionText].filter(Boolean).join(' · ')}</small></div>
        {!readOnly && <Popconfirm title={`停用“${item.substanceDisplay}”过敏记录？`}
          description="停用后不再参与处方过敏校验，操作会保留审计记录。" okText="确认停用"
          onConfirm={async () => { await inactivate.mutateAsync(item) }}>
          <Button size="sm" variant="text">停用</Button>
        </Popconfirm>}
      </article>)}</div> : <p className="doctor-allergy-empty">当前没有有效过敏事实。</p>}
    </div>

    {!readOnly && <form className="doctor-allergy-editor" onSubmit={(event) => { event.preventDefault(); record.mutate() }}>
      <header><div><strong>新增过敏事实</strong><small>优先选择标准过敏原，用于处方自动匹配与安全提醒。</small></div>
        <Button size="sm" variant="text" onClick={() => {
          setCustomAllergen((value) => !value); setSelectedAllergenId(''); setSubstance('')
        }}>{customAllergen ? '返回标准过敏原' : '标准库未收录？手工录入'}</Button></header>
      <div className="doctor-allergy-editor__grid">
        <FormField label="类别" required><Select value={category} searchable={false} clearable={false}
          onChange={(next) => { setCategory(next as typeof category); setSelectedAllergenId('');
            setSubstance(''); setCustomAllergen(false) }} options={categoryOptions} /></FormField>
        <FormField label="危急程度"><Select value={criticality} searchable={false} clearable={false}
          onChange={(next) => setCriticality(next as typeof criticality)} options={[
            { value: 'HIGH', label: '高危' }, { value: 'LOW', label: '低危' }, { value: 'UNABLE_TO_ASSESS', label: '无法评估' },
          ]} /></FormField>
        {!customAllergen ? <FormField className="doctor-allergy-editor__wide" label="标准过敏原" required>
          <Select value={selectedAllergenId} onChange={setSelectedAllergenId} searchable clearable
          loading={allergenTerms.isLoading} searchPlaceholder="输入名称、别名或编码"
          placeholder="搜索并选择标准过敏原" options={(allergenTerms.data ?? []).map((item) => ({
            value: item.id, label: item.display, secondaryText: item.code,
            description: allergenConceptTypeLabel(item.conceptType),
            searchKeywords: [item.code, item.aliases ?? ''],
          }))} />
        </FormField> : <FormField className="doctor-allergy-editor__wide" label="过敏原（非标准）" required>
        <input value={substance} maxLength={300} onChange={(event) => setSubstance(event.target.value)}
          placeholder="输入过敏原名称" />
      </FormField>}
      <FormField label="反应严重度"><Select value={severity} searchable={false} clearable={false}
        onChange={(next) => setSeverity(next as typeof severity)} options={[
          { value: 'MILD', label: '轻度' }, { value: 'MODERATE', label: '中度' }, { value: 'SEVERE', label: '重度' },
        ]} /></FormField>
      <FormField label="过敏反应"><input value={reaction} maxLength={1000}
        onChange={(event) => setReaction(event.target.value)} placeholder="如皮疹、呼吸困难" /></FormField>
      </div>
      <footer><Button type="submit" busy={record.isPending} disabled={!selectedAllergenId && !substance.trim()}>
        <Icon name="check" />记录过敏事实
      </Button></footer>
    </form>}
    {(error || mutationError) && <Alert>{errorMessage(error || mutationError)}</Alert>}
  </section>
}

function allergyCategoryLabel(value?: AllergyIntolerance['categoryCode']) {
  return ({ DRUG: '药物', FOOD: '食物', ENVIRONMENT: '环境', BIOLOGIC: '生物制品', OTHER: '其他' } as const)[value ?? 'OTHER']
}

function allergySeverityLabel(value?: AllergyIntolerance['reactionSeverity']) {
  return value ? ({ MILD: '轻度', MODERATE: '中度', SEVERE: '重度' } as const)[value] : ''
}

function allergyCriticalityLabel(value?: AllergyIntolerance['criticalityCode']) {
  return value ? ({ LOW: '低危', HIGH: '高危', UNABLE_TO_ASSESS: '危急程度未评估' } as const)[value] : ''
}

function allergenConceptTypeLabel(value: AllergenTerm['conceptType']) {
  return ({ DRUG_INGREDIENT: '药物成分', DRUG_CLASS: '药物类别', FOOD: '食物', ENVIRONMENT: '环境',
    BIOLOGIC: '生物制品', MATERIAL: '材料', OTHER: '其他' } as const)[value]
}


type AmendmentDraft = Pick<RecordForm,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'>

function ClinicalRecordPanel({ encounter, birthDate, allergies, allergyState, api, historyCopy, onHistoryCopyConsumed,
  aiDraft, onAiDraftConsumed, onRegisterAiPlan, onAiContextChange, onDraftStateChange, onRegisterSaveDraft, onSaveDraftNotice,
  editing, canEdit, completionMode, enteringEdit, onRequestEditing,
  onRequestReading, onRefresh, aiPreConsultation, triageVitals, historyEncounters, aiSurfaceRefs, aiFieldStream,
  aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange, currentDepartmentName, planTemplateDrawerHost, recommendedPlanId,
  onClosePlanDrawer,
  onOpenPrintCenter }: {
  encounter: Encounter; birthDate?: string; allergies: AllergyIntolerance[]; allergyState: ClinicalAiDraftContext['allergyState']
  completionMode: OutpatientCompletionMode | undefined
  api: RhnApi; historyCopy: HistoryCopyDraft | null
  aiDraft: ClinicalAiDraftRequest | null; onAiDraftConsumed: () => void
  onRegisterAiPlan: (handler: PrepareAiPlan | null) => void
  onAiContextChange: (value: ClinicalAiDraftContext | null) => void
  onHistoryCopyConsumed: () => void; onDraftStateChange: (value: EncounterDraftState) => void
  onRegisterSaveDraft?: (handler: (() => Promise<boolean>) | null) => void
  onSaveDraftNotice?: (notice: { message: string; tone?: 'success' | 'error' | 'warning' }) => void
  editing: boolean; canEdit: boolean; enteringEdit: boolean; onRequestEditing: () => void; onRequestReading: () => void
  onRefresh: () => Promise<unknown>
  aiPreConsultation?: AiPreConsultation
  aiSurfaceRefs: ClinicalAiSurfaceRefs
  aiFieldStream?: ClinicalAiFieldStream | null
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onTreatmentKeysChange?: (keys: string[]) => void
  triageVitals?: VitalsSummary
  historyEncounters?: Encounter[]
  currentDepartmentName?: string
  recommendedPlanId?: string
  planTemplateDrawerHost?: HTMLDivElement | null
  onClosePlanDrawer?: () => void
  onOpenPrintCenter?: () => void
}) {
  const queryClient = useQueryClient()
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
  const [medicationDrafts, setMedicationDrafts] = useState<MedicationPlanDraft[]>([])
  const [serviceDrafts, setServiceDrafts] = useState<ServicePlanDraft[]>([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [showRecordAnnotations, setShowRecordAnnotations] = useState(true)
  const [aiRecordUndo, setAiRecordUndo] = useState<AiRecordUndo | null>(null)
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [unsignedPrintModalOpen, setUnsignedPrintModalOpen] = useState(false)
  const [amendmentOpen, setAmendmentOpen] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const [amendmentDraft, setAmendmentDraft] = useState<AmendmentDraft>({
    chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', allergyHistory: '', medicationHistory: '', auxiliaryExaminations: '', healthEducation: '', followUp: '',
  })
  const [selectedNoteFormId, setSelectedNoteFormId] = useState('')
  const [structuredValues, setStructuredValues] = useState<Record<string, unknown>>({})
  const [structuredBaseline, setStructuredBaseline] = useState(structuredFormSignature('', {}))
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({})
  const draftSaver = useRef(createClinicalDraftSaver())
  const serverStateInitialized = useRef(false)
  const bloodPressureRequired = requiresBloodPressure(birthDate, encounter.registeredAt)
  const recordSchema = useMemo(() => createRecordSchema(bloodPressureRequired), [bloodPressureRequired])
  const form = useForm<RecordForm>({
    resolver: zodResolver(recordSchema),
    defaultValues: { chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '', allergyHistory: '', medicationHistory: '', auxiliaryExaminations: '', healthEducation: '', followUp: '',
      systolic: undefined, diastolic: undefined, temperature: undefined, pulseRate: undefined,
      respiratoryRate: undefined, heightCm: undefined, weightKg: undefined, oxygenSaturation: undefined },
  })
  const { handleSubmit, reset, getValues, watch, formState } = form
  const documents = useQuery({ queryKey: ['doctor-document', encounter.id], queryFn: () => api.clinicalDocuments.byEncounter(encounter.id) })
  const noteForms = useQuery({ queryKey: ['outpatient-note-forms', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteForms.list('GENERAL_PRACTICE') })
  const document = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE' && item.instanceKey === 'DEFAULT')
  const snapshot = document?.content.structuredForm
  const snapshotForm: OutpatientNoteForm | undefined = snapshot ? {
    id: snapshot.versionId, formCode: snapshot.formCode, version: snapshot.version,
    specialtyCode: snapshot.specialtyCode, name: snapshot.name, description: snapshot.description,
    definitionSchema: snapshot.definitionSchema, sections: snapshot.sections, status: 'PUBLISHED',
    publishedBy: '', publishedAt: snapshot.publishedAt,
  } : undefined
  const selectedNoteForm = noteForms.data?.find((value) => value.id === selectedNoteFormId)
    ?? (snapshotForm?.id === selectedNoteFormId ? snapshotForm : undefined)
  const currentStructuredSignature = structuredFormSignature(selectedNoteFormId, structuredValues)
  const structuredChanged = currentStructuredSignature !== structuredBaseline
  const diagnosesChanged = diagnosisDraftSignature(diagnoses) !== diagnosisDraftSignature(
    encounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms }) =>
      ({ conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms })))
  const captureDraftSession = useClinicalDraftSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit && editing && encounter.status === 'IN_PROGRESS', form,
  { diagnoses, medicationDrafts, serviceDrafts, selectedNoteFormId, structuredValues })
  const save = useMutation({
    mutationFn: async ({ form, session }: { form: RecordForm; session: ClinicalDraftSession }) => {
      session.assertUnchanged()
      if (!diagnoses.some((item) => item.type === 'PRIMARY')) throw new Error('请确认一个主要诊断')
      const formErrors = validateStructuredForm(selectedNoteForm, structuredValues)
      setStructuredErrors(formErrors)
      if (Object.keys(formErrors).length) throw new Error(Object.values(formErrors)[0])
      return draftSaver.current.save(api, {
        encounterId: encounter.id,
        residentId: encounter.residentId,
        organizationId: encounter.organizationId,
        departmentId: encounter.departmentId,
        previousDocument: document,
        content: clinicalRecordContent(form, diagnoses, selectedNoteFormId, structuredValues),
        medicationDrafts,
        serviceDrafts,
      }, session.assertUnchanged)
    },
    onSuccess: async ({ encounter: savedEncounter, document: savedDocument, documents: savedDocuments, confirmApplied }, { form, session }) => {
      session.assertUnchanged()
      confirmApplied()
      setCopyNotice('')
      setMedicationDrafts([])
      setServiceDrafts([])

      reset({
        annotations: savedDocument.content.annotations,
        chiefComplaint: form.chiefComplaint,
        presentIllness: form.presentIllness,
        medicalHistory: form.medicalHistory,
        physicalExam: form.physicalExam,
        allergyHistory: form.allergyHistory,
        medicationHistory: form.medicationHistory,
        auxiliaryExaminations: form.auxiliaryExaminations,
        healthEducation: form.healthEducation,
        followUp: form.followUp,

        systolic: form.systolic,
        diastolic: form.diastolic,
        temperature: form.temperature,
        pulseRate: form.pulseRate,
        respiratoryRate: form.respiratoryRate,
        heightCm: form.heightCm,
        weightKg: form.weightKg,
        oxygenSaturation: form.oxygenSaturation,
      })

      if (savedEncounter?.diagnoses?.length) {
        setDiagnoses(normalizeDiagnosisOrder(savedEncounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms }) => ({
          conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms,
        }))))
      }

      const savedFormId = savedDocument.content.structuredForm?.versionId ?? ''
      const savedValues = savedDocument.content.structuredData ?? {}
      setSelectedNoteFormId(savedFormId)
      setStructuredValues(savedValues)
      setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))

      if (savedEncounter) {
        queryClient.setQueriesData({ queryKey: ['doctor-encounters'] }, (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((item: Encounter) => item.id === encounter.id ? { ...item, ...savedEncounter } : item)
        })
      }

      queryClient.setQueryData(['doctor-document', encounter.id], savedDocuments)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] }),
        onRefresh(),
      ])
      session.assertCurrent()
      onSaveDraftNotice?.({ message: '门诊病历、诊断与医嘱草稿已保存', tone: 'success' })
    },
    onError: (error, { session }) => {
      if (!session.isCurrent()) return
      onSaveDraftNotice?.({ message: errorMessage(error), tone: 'error' })
    },
  })
  const recordContentChanged = Boolean(aiRecordUndo)
    || formState.isDirty
    || (getValues().chiefComplaint?.trim() ?? '') !== (encounter.chiefComplaint?.trim() ?? '')
    || (getValues().presentIllness?.trim() ?? '') !== (document?.content.presentIllness?.trim() ?? '')
    || (getValues().medicalHistory?.trim() ?? '') !== (document?.content.medicalHistory?.trim() ?? '')
    || (getValues().physicalExam?.trim() ?? '') !== (document?.content.physicalExam?.trim() ?? '')
    || (getValues().allergyHistory?.trim() ?? '') !== (document?.content.allergyHistory?.trim() ?? '')
    || (getValues().medicationHistory?.trim() ?? '') !== (document?.content.medicationHistory?.trim() ?? '')
    || (getValues().auxiliaryExaminations?.trim() ?? '') !== (document?.content.auxiliaryExaminations?.trim() ?? '')
    || (getValues().healthEducation?.trim() ?? '') !== (document?.content.healthEducation?.trim() ?? '')
    || (getValues().followUp?.trim() ?? '') !== (document?.content.followUp?.trim() ?? '')
  useEffect(() => {
    if (save.isPending) return
    const hasLocalWork = recordContentChanged || structuredChanged || diagnosesChanged
      || medicationDrafts.length > 0 || serviceDrafts.length > 0
    if (serverStateInitialized.current && hasLocalWork) return
    if (!serverStateInitialized.current && documents.isPending) return

    reset({ annotations: document?.content.annotations ?? [], chiefComplaint: encounter.chiefComplaint ?? '', presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '', physicalExam: document?.content.physicalExam ?? '',
      treatmentPlan: '', allergyHistory: document?.content.allergyHistory ?? '', medicationHistory: document?.content.medicationHistory ?? '', auxiliaryExaminations: document?.content.auxiliaryExaminations ?? '', healthEducation: document?.content.healthEducation ?? '', followUp: document?.content.followUp ?? '',  systolic: encounter.systolic, diastolic: encounter.diastolic,
      temperature: document?.content.vitalSigns?.temperature, pulseRate: document?.content.vitalSigns?.pulseRate,
      respiratoryRate: document?.content.vitalSigns?.respiratoryRate, heightCm: document?.content.vitalSigns?.heightCm,
      weightKg: document?.content.vitalSigns?.weightKg, oxygenSaturation: document?.content.vitalSigns?.oxygenSaturation })
    setDiagnoses(normalizeDiagnosisOrder(encounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementResolutionStatus, managementPrograms }) => ({ conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementResolutionStatus, managementPrograms }))))
    const savedFormId = document?.content.structuredForm?.versionId ?? ''
    const savedValues = document?.content.structuredData ?? {}
    setSelectedNoteFormId(savedFormId)
    setStructuredValues(savedValues)
    setStructuredErrors({})
    setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))
    serverStateInitialized.current = true
  }, [diagnosesChanged, document, documents.isPending, encounter, formState.isDirty, getValues, medicationDrafts.length, recordContentChanged, reset,
    save.isPending, serviceDrafts.length, structuredChanged])
  useEffect(() => {
    setMedicationDrafts([])
    setServiceDrafts([])
  }, [encounter.id])
  useEffect(() => {
    if (!historyCopy || documents.isPending) return
    if (historyCopy.targetEncounterId && (historyCopy.targetEncounterId !== encounter.id
      || historyCopy.targetResidentId !== encounter.residentId) || save.isPending || orderBusy
      || document?.status === 'SIGNED' || encounter.status !== 'IN_PROGRESS'
      || (historyCopy.medicationDrafts?.length && allergyState !== 'READY')) {
      setCopyNotice('当前就诊状态或过敏资料已变化，已拒绝历史内容带入，请重新核对。')
      onHistoryCopyConsumed(); return
    }
    if (historyCopy.medicationDrafts?.length) {
      const keys = new Set(medicationDrafts.map(medicationDraftKey))
      if (historyCopy.medicationDrafts.some(item => keys.has(medicationDraftKey(item)))) {
        setCopyNotice('所选历史用药与当前待确认医嘱重复，本次未带入，请先核对已有草稿。')
        onHistoryCopyConsumed(); return
      }
      setMedicationDrafts(current => [...current, ...historyCopy.medicationDrafts!])
    }
    reset({ ...getValues(), ...historyCopy.record }, { keepDefaultValues: true })
    if (historyCopy.diagnoses?.length) {
      setDiagnoses((current) => {
        const currentCodes = new Set(current.map((item) => item.code))
        const hasPrimary = current.some((item) => item.type === 'PRIMARY')
        return normalizeDiagnosisOrder([...current, ...historyCopy.diagnoses!.filter((item) => !currentCodes.has(item.code)).map((item) => ({
          ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type,
        }))])
      })
    }
    setCopyNotice(`已从 ${formatTime(historyCopy.sourceRegisteredAt)}（${historyCopy.sourceEncounterNo}）带入所选内容，请核对后保存。`)
    onHistoryCopyConsumed()
  }, [documents.isPending, getValues, historyCopy, onHistoryCopyConsumed, reset, encounter, save.isPending, orderBusy, document?.status, allergyState, medicationDrafts])
  const captureDocumentSession = useClinicalDocumentSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit)
  const amendmentWriter = useRef(createClinicalAmendmentWriter())
  const cacheSignedDocument = (signed: ClinicalDocument) => {
    queryClient.setQueryData<ClinicalDocument[]>(['doctor-document', signed.encounterId], current =>
      current?.map(item => item.id === signed.id ? signed : item) ?? [signed])
  }
  const sign = useMutation({
    mutationFn: async () => {
      const assertCurrent = captureDocumentSession()
      const signed = await signClinicalDocument(api.clinicalDocuments, document!, assertCurrent)
      return { signed, assertCurrent }
    },
    onSuccess: async ({ signed, assertCurrent }) => {
      assertCurrent()
      cacheSignedDocument(signed)
      await onRefresh()
      assertCurrent()
      onRequestReading()
    },
  })
  const amend = useMutation({
    mutationFn: async () => {
      const assertCurrent = captureDocumentSession()
      const signed = await amendmentWriter.current.save(api.clinicalDocuments, document!,
        { ...document!.content, ...amendmentDraft }, amendmentReason, assertCurrent)
      return { signed, assertCurrent }
    },
    onSuccess: async ({ signed, assertCurrent }) => {
      assertCurrent()
      cacheSignedDocument(signed)
      setAmendmentOpen(false)
      setAmendmentReason('')
      await onRefresh()
      assertCurrent()
      onRequestReading()
    },
  })
  const businessBusy = save.isPending || sign.isPending || amend.isPending || orderBusy
  const aiContextBusy = businessBusy || documents.isPending || Boolean(documents.error)
  const documentStatus = documents.isPending ? 'LOADING'
    : documents.error ? 'ERROR' : document?.status ?? 'NONE'
  const { buildAiContext, canUndoAiRecord, undoAiRecord } = useClinicalAiDraft({
    encounter, form, diagnoses, setDiagnoses, aiDraft, onAiDraftConsumed, onAiContextChange,
    context: { document, documentStatus, structuredFormId: selectedNoteFormId,
      structuredFormVersion: selectedNoteForm?.version, structuredValues,
      medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy },
    businessBusy, aiRecordUndo, setAiRecordUndo, onNotice: setCopyNotice,
  })
  const preparePlan = useAiPlanApplication({ api, encounter, form, readContext: buildAiContext,
    blocked: !editing || document?.status === 'SIGNED' || aiContextBusy, allergies, allergyReady: allergyState === 'READY',
    diagnoses, setDiagnoses, medications: medicationDrafts, setMedications: setMedicationDrafts,
    services: serviceDrafts, setServices: setServiceDrafts, setUndo: setAiRecordUndo, onNotice: setCopyNotice })
  useEffect(() => {
    onRegisterAiPlan(preparePlan)
    return () => onRegisterAiPlan(null)
  }, [onRegisterAiPlan, preparePlan])
  useEffect(() => {
    onDraftStateChange({ recordChanged: recordContentChanged || structuredChanged, diagnosesChanged,
      medicationDraftCount: medicationDrafts.length, serviceDraftCount: serviceDrafts.length,
      busy: businessBusy })
  }, [businessBusy, diagnosesChanged, medicationDrafts.length, onDraftStateChange, recordContentChanged,
    serviceDrafts.length, structuredChanged])
  const submitRecordDraft = async (value: RecordForm) => {
      if (aiFieldStream?.encounterId === encounter.id) {
        onSaveDraftNotice?.({ message: 'AI 正在生成，请待完整病历带入并核对后保存。', tone: 'warning' })
        return false
      }
      try {
        const current = recordSchema.safeParse(getValues())
        if (!current.success || JSON.stringify(current.data) !== JSON.stringify(value)) {
          onSaveDraftNotice?.({ message: '校验期间病历内容已变化，请核对当前内容后重新保存', tone: 'warning' })
          return false
        }
        await save.mutateAsync({ form: value, session: captureDraftSession() })
        return true
      } catch {
        return false
      }
  }
  const reportRecordErrors = (formErrors: typeof formState.errors) => {
    const first = Object.values(formErrors)[0]?.message
    onSaveDraftNotice?.({
      message: typeof first === 'string' ? first : '请检查病历表单必填项',
      tone: 'error',
    })
  }
  const handleRecordSubmit = handleSubmit((value) => { void submitRecordDraft(value) }, reportRecordErrors)
  const saveDraftAndWait = async () => {
    let saved = false
    await handleSubmit(async (value) => { saved = await submitRecordDraft(value) }, reportRecordErrors)()
    return saved
  }
  useEffect(() => {
    onRegisterSaveDraft?.(saveDraftAndWait)
    return () => onRegisterSaveDraft?.(null)
  }, [onRegisterSaveDraft, saveDraftAndWait])
  const signed = document?.status === 'SIGNED'
  const recordValues = watch()
  const streamingRecord = aiFieldStream?.encounterId === encounter.id
    && aiFieldStream.contextFingerprint === clinicalAiContextFingerprint(buildAiContext()) ? aiFieldStream.recordDraft : null
  const streamingField = (field: keyof ClinicalAiRecordText) => ({
    value: streamingRecord?.[field] ?? recordValues[field] ?? '',
    readOnly: streamingRecord !== null,
    'aria-busy': streamingRecord !== null || undefined,
    className: streamingRecord !== null ? 'doctor-record-field--generating' : undefined,
  })
  const height = recordValues.heightCm
  const weight = recordValues.weightKg
  const bmi = height && weight && Number(height) > 0 ? (Number(weight) / ((Number(height) / 100) ** 2)).toFixed(1) : undefined

  const currentNoteContent = (): OutpatientNoteTemplateContent => {
    const value = getValues()
    return { annotations: value.annotations, chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
      medicalHistory: value.medicalHistory, physicalExam: value.physicalExam, allergyHistory: value.allergyHistory, medicationHistory: value.medicationHistory, auxiliaryExaminations: value.auxiliaryExaminations, healthEducation: value.healthEducation, followUp: value.followUp,  }
  }
  const annotatedField = (field: RecordTextField, label: string) => ({
    field, 'aria-label': label, value: watch(field) ?? '', annotations: getValues('annotations') ?? [],
    showAnnotations: showRecordAnnotations,
    onValueChange: (value: string) => {
      form.setValue('annotations', rebaseAnnotations(field, getValues(field) ?? '', value, getValues('annotations') ?? []), { shouldDirty: true })
      form.setValue(field, value, { shouldDirty: true, shouldTouch: true })
    },
  })
  const openAmendment = () => {
    setAmendmentReason('')
    setAmendmentDraft({
      chiefComplaint: document?.content.chiefComplaint ?? encounter.chiefComplaint ?? '',
      presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '',
      physicalExam: document?.content.physicalExam ?? '',
      allergyHistory: document?.content.allergyHistory ?? '', medicationHistory: document?.content.medicationHistory ?? '', auxiliaryExaminations: document?.content.auxiliaryExaminations ?? '', healthEducation: document?.content.healthEducation ?? '', followUp: document?.content.followUp ?? '',
    })
    setAmendmentOpen(true)
  }
  const applyNoteTemplate = (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => {
    const current = getValues()
    const merged = mergeNoteTemplateContent(current, template.content, fields, overwrite)
    const applied = [...fields].filter(key => merged[key] !== current[key]).length
    if (applied) {
      reset({ ...current, ...merged }, { keepDefaultValues: true })
      setCopyNotice(`已从病历模板“${template.name}”带入 ${applied} 个段落，请结合本次患者情况核对后保存。`)
    }
    return applied
  }
  const error = (save.variables?.session.isCurrent() ? save.error : undefined) || sign.error || amend.error || documents.error || noteForms.error
  const encounterEditable = ['REGISTERED', 'IN_PROGRESS', 'SUSPENDED'].includes(encounter.status)
  const editActionLabel = encounter.status === 'REGISTERED' ? '开始接诊'
    : encounter.status === 'SUSPENDED' ? '恢复接诊' : '进入编辑'
  const readOnlyReason = !canEdit ? '当前账号没有病历编辑权限'
    : !encounterEditable ? '本次就诊已结束；如需更正，应发起病历修订并保留原始版本'
      : signed ? '病历已签署；如需更正，应发起病历修订' : ''

  return <section className={`doctor-clinical-cockpit ${editing ? 'is-editing' : 'is-reading'}`}>
    {!editing && <div className="doctor-clinical-modebar">
      <div className="doctor-clinical-modebar__status">
        <strong>阅读状态</strong>
        <small>{signed ? '病历已签署' : document ? '仅查看，不会修改就诊状态和时间' : '尚未形成病历记录'}</small>
      </div>
      {readOnlyReason && <div className="doctor-clinical-readonly-note">
        <Icon name="lock" />
        <span>{readOnlyReason}</span>
      </div>}
      {encounterEditable && <Button size="sm" busy={enteringEdit} disabled={Boolean(readOnlyReason)}
          title={readOnlyReason || `${editActionLabel}后可修改病历`}
          onClick={onRequestEditing}>{editActionLabel}</Button>}
    </div>}
    <div className="doctor-record-column"><Panel className="doctor-record-panel">
      <PanelHead className="doctor-record-heading" title="门诊病历"
        meta={signed ? '已签署' : document ? `草稿 V${document.currentVersion}` : '尚未保存'}
        actions={<>{editing && <Button size="sm" variant="text" aria-pressed={showRecordAnnotations}
          onClick={() => setShowRecordAnnotations((value) => !value)}>{showRecordAnnotations ? '隐藏标记' : '显示标记'}</Button>}
          {editing && <NoteTemplateBar api={api} disabled={signed || businessBusy || documents.isPending || Boolean(documents.error)}
          contextKey={JSON.stringify([encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId,
            encounter.clinicianId, document?.currentVersion])} currentContent={currentNoteContent}
          onApply={applyNoteTemplate} showApply={false} />}
          {editing && !signed && <div ref={aiSurfaceRefs.note} className="doctor-record-ai-slot" />}
          {document && signed && canEdit && (
            <Button size="sm" variant="secondary" onClick={openAmendment}>发起更正</Button>
          )}
          <Button
            size="sm"
            variant={document && signed ? 'secondary' : 'text'}
            disabled={!document}
            title={!document ? '门诊病历尚未保存，请先录入并保存' : !signed ? '门诊病历签署后方可受控打印' : '受控打印已签署门诊病历'}
            onClick={() => {
              if (document && signed) {
                setNotePrintOpen(true)
              } else if (document && !signed) {
                setUnsignedPrintModalOpen(true)
              }
            }}
          >
            <Icon name="print" />打印病历
          </Button>
        </>} />
      {document?.status === 'AMENDMENT_IN_PROGRESS' && canEdit && !editing && <Alert tone="warning">
        更正草稿尚未签署。<Button size="sm" busy={sign.isPending} onClick={() => sign.mutate()}>重新签署更正版</Button>
      </Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {copyNotice && <div className="doctor-record-adoption-notice"><Icon name="roadmap" /><span>{copyNotice}</span>
        {editing && aiRecordUndo && <Button size="sm" variant="text" disabled={!canUndoAiRecord}
          title={canUndoAiRecord ? '恢复本次采纳前的病历段落' : '相关段落已修改或保存，不能撤销此前采纳'}
          onClick={undoAiRecord}>撤销本次病历采纳</Button>}</div>}
      {editing ? <form id="doctor-record-form" className="clinical-form doctor-record-form" noValidate onSubmit={handleRecordSubmit}>
        {aiPreConsultation && !signed && (
          <div className="ai-preconsultation-banner">
            <div className="ai-banner-content">
              <Icon name="sparkles" />
              <div>
                <strong>AI 预问诊已提炼主诉与现病史草稿</strong>
                <span>一句话主诉：{aiPreConsultation.chiefComplaintSummary}</span>
              </div>
            </div>
            <div className="ai-banner-actions">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => {
                  const curChief = getValues('chiefComplaint')
                  const curPresent = getValues('presentIllness')
                  reset({
                    ...getValues(),
                    chiefComplaint: curChief || aiPreConsultation.chiefComplaintSummary,
                    presentIllness: curPresent || aiPreConsultation.presentIllnessDraft,
                  }, { keepDefaultValues: true })
                }}
              >
                <Icon name="sparkles" />
                一键采纳预问诊草稿
              </Button>
            </div>
          </div>
        )}
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--chief" label="主诉" required error={formState.errors.chiefComplaint?.message}>
          <AnnotatedRecordField {...annotatedField('chiefComplaint', '主诉')} {...streamingField('chiefComplaint')} disabled={signed} placeholder="症状、持续时间及本次就诊原因" rows={1} />
        </FormField>
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--present" label="现病史" error={formState.errors.presentIllness?.message}>
          <AnnotatedRecordField {...annotatedField('presentIllness', '现病史')} {...streamingField('presentIllness')} disabled={signed} placeholder="起病、演变、伴随症状及诊治经过" rows={3} />
        </FormField>
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--history" label="既往史" error={formState.errors.medicalHistory?.message}>
          <AnnotatedRecordField {...annotatedField('medicalHistory', '既往史')} {...streamingField('medicalHistory')} disabled={signed} placeholder="既往疾病、手术、过敏及长期用药" rows={2} />
        </FormField>
        <ClinicalVitalsFields api={api} encounterId={encounter.id} historyEncounters={historyEncounters}
          triageVitals={triageVitals} form={form} recordValues={recordValues} bmi={bmi}
          signed={signed} bloodPressureRequired={bloodPressureRequired} />
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--exam" label="查体所见" error={formState.errors.physicalExam?.message}>
          <AnnotatedRecordField {...annotatedField('physicalExam', '查体所见')} {...streamingField('physicalExam')} disabled={signed} placeholder="阳性体征及必要的阴性体征" rows={3} />
        </FormField>
        {clinicalRecordAdditionalFields
          .map(({ key, label }) => <FormField appearance="document" key={key} className="doctor-record-narrative doctor-record-writing-field" label={label} error={formState.errors[key]?.message}>
            <AnnotatedRecordField {...annotatedField(key as RecordTextField, label)} {...streamingField(key)} disabled={signed} rows={2}
              placeholder={`记录本次${label}，缺失资料请留空或注明待询问`} />
          </FormField>)}
        {selectedNoteForm && <StructuredNoteForm form={selectedNoteForm} values={structuredValues}
          errors={structuredErrors} disabled={signed} onChange={(code, value) => {
            setStructuredValues((current) => ({ ...current, [code]: value }))
            setStructuredErrors((current) => ({ ...current, [code]: '' }))
          }} />}
        {document && !signed && completionMode === 'SEPARATE_CONFIRMATIONS' && (
          <div className="ui-form-actions doctor-record-actions">
            <Button type="button" variant="secondary" busy={sign.isPending}
              disabled={formState.isDirty || structuredChanged || diagnosesChanged || save.isPending || Boolean(aiFieldStream)}
              title={formState.isDirty || structuredChanged || diagnosesChanged ? '请先保存当前病历和诊断修改' : '签署当前已保存版本'}
              onClick={() => sign.mutate()}>签署当前版本</Button>
          </div>
        )}
      </form> : <ClinicalRecordReadView value={recordValues} bmi={bmi} structuredForm={selectedNoteForm}
        structuredValues={structuredValues} />}
    </Panel>

    </div>
    <aside className="doctor-clinical-aside" aria-label="诊断与医嘱工作区">
      <DiagnosisPanel encounterId={encounter.id} api={api} diagnoses={diagnoses} setDiagnoses={setDiagnoses}
        editing={editing} signed={signed} aiSuggestionSurfaceRef={aiSurfaceRefs.diagnoses} />
      <OrdersPanel draftDiagnoses={diagnoses} onSaveClinicalDraft={async () => {
        if (!recordContentChanged && !diagnosesChanged && !structuredChanged
          && medicationDrafts.length === 0 && serviceDrafts.length === 0) return true
        if (!await form.trigger()) throw new Error('请先补齐病历必填内容')
        await save.mutateAsync({ form: recordSchema.parse(form.getValues()), session: captureDraftSession() })
        return true
      }} aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
        onTreatmentKeysChange={onTreatmentKeysChange} encounter={encounter} allergies={allergies} api={api} editing={editing}
        aiSuggestionSurfaceRef={editing && !signed ? aiSurfaceRefs.plans : undefined}
        medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
        serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} onBusyChange={setOrderBusy}
        currentDepartmentName={currentDepartmentName} onOpenPrintCenter={onOpenPrintCenter} />
    </aside>
    {editing && !signed && planTemplateDrawerHost && createPortal(
      <PlanTemplatePanel initialPlanId={recommendedPlanId} encounter={encounter} busy={aiContextBusy}
        allergies={allergies} allergyReady={allergyState === 'READY'}
        allergyContext={JSON.stringify([allergyState, allergies])} readRecordDraft={() => JSON.stringify(getValues())}
        diagnoses={diagnoses} setDiagnoses={setDiagnoses}
        medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
        serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts}
        onApplyNoteTemplate={applyNoteTemplate}
        api={api}
        onClose={onClosePlanDrawer}
        onNotice={(msg) => onSaveDraftNotice?.({ message: msg, tone: 'success' })} />,
      planTemplateDrawerHost,
    )}
    {notePrintOpen && document && <ControlledPrintDialog api={api} title="打印门诊病历"
      description={`已签署版本 V${document.currentVersion} · 每次生成和重打都会留痕。`}
      sourceLabel={`${document.title} · V${document.currentVersion}`}
      generate={(purpose, copies) => api.printing.clinicalDocument(document.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setNotePrintOpen(false)} />}
    {unsignedPrintModalOpen && document && (
      <Dialog
        title="门诊病历打印受控规范"
        eyebrow="文书签署要求"
        description="依据医疗文书管理与受控打印规范，门诊病历属于法定医疗文书，需由责任医师完成电子签名签署后方可生成不可变正式打印单。"
        closeOnBackdrop={false}
        onClose={() => setUnsignedPrintModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnsignedPrintModalOpen(false)}>暂不打印</Button>
            {canEdit && editing && (
              <Button
                variant="primary"
                busy={sign.isPending}
                disabled={formState.isDirty || structuredChanged || diagnosesChanged || save.isPending}
                title={formState.isDirty || structuredChanged || diagnosesChanged ? '请先保存病历草稿后再签署' : '完成当前版本签署并打开打印窗口'}
                onClick={async () => {
                  try {
                    const result = await sign.mutateAsync()
                    result.assertCurrent()
                    setUnsignedPrintModalOpen(false)
                    setNotePrintOpen(true)
                  } catch {
                    // handled by sign mutation error
                  }
                }}
              >
                <Icon name="check" />签署并打印
              </Button>
            )}
          </>
        }
      >
        <div className="doctor-print-compliance-notice">
          <Alert tone="info">
            当前病历版本为<strong>草稿 V{document.currentVersion}</strong>。受控打印平台要求文书已签署且具备防篡改签名凭证。
            {canEdit && editing && (formState.isDirty || structuredChanged || diagnosesChanged
              ? ' 当前存在未保存的修改，请先保存全部草稿后再执行签署。'
              : ' 您可点击下方【签署并打印】完成正式签署，系统将自动调起受控打印。')}
          </Alert>
        </div>
      </Dialog>
    )}
    {amendmentOpen && document && <Dialog title="发起病历更正" eyebrow={`已签署版本 V${document.currentVersion}`}
      size="xwide"
      closeOnBackdrop={false}
      description="原签署版本和签名证据将完整保留；以下更正内容将生成新版本并重新签署。"
      onClose={() => !amend.isPending && setAmendmentOpen(false)}
      footer={<><Button variant="secondary" disabled={amend.isPending} onClick={() => setAmendmentOpen(false)}>取消</Button>
        <Button busy={amend.isPending} disabled={!amendmentReason.trim() || !amendmentDraft.chiefComplaint.trim()}
          onClick={() => amend.mutate()}>更正并重新签署</Button></>}>
      <div className="doctor-amendment-form" inert={amend.isPending}>
        <FormField label="更正原因" required error={amend.error ? errorMessage(amend.error) : undefined}>
          <textarea className="ui-field__control" value={amendmentReason} maxLength={500} autoFocus
            onChange={(event) => setAmendmentReason(event.target.value)}
            placeholder="说明需要更正的内容和原因" />
        </FormField>
        <FormField label="主诉" required>
          <textarea className="ui-field__control" value={amendmentDraft.chiefComplaint}
            onChange={(event) => setAmendmentDraft((current) => ({ ...current, chiefComplaint: event.target.value }))} />
        </FormField>
        {([
          ['presentIllness', '现病史'], ['medicalHistory', '既往史'], ['physicalExam', '体格检查'], ['auxiliaryExaminations', '辅助检查结果'], ['healthEducation', '健康宣教'], ['followUp', '随访复诊'],
        ] as const).map(([field, label]) => <FormField key={field} label={label}>

          <textarea className="ui-field__control" value={amendmentDraft[field]}
            onChange={(event) => setAmendmentDraft((current) => ({ ...current, [field]: event.target.value }))} />
        </FormField>)}
      </div>
    </Dialog>}
  </section>
}

function PlanTemplatePanel({ initialPlanId, encounter, busy, allergyContext, allergies, allergyReady, readRecordDraft, diagnoses, setDiagnoses, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, api, onApplyNoteTemplate, onClose, onNotice }: {
  initialPlanId?: string
  encounter: Encounter
  busy: boolean
  allergyContext: string
  allergies: AllergyIntolerance[]
  allergyReady: boolean
  readRecordDraft: () => string
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  api: RhnApi
  onApplyNoteTemplate: (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => number
  onClose?: () => void
  onNotice?: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const encounterId = encounter.id
  const apiScope = templateApiScope(api)
  const queryScope = [apiScope, encounter.organizationId, encounter.departmentId]
  const [templateKind, setTemplateKind] = useState<'ALL' | 'NOTE' | 'PLAN'>('ALL')
  const [selectedKind, setSelectedKind] = useState<'NOTE' | 'PLAN'>('PLAN')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState(initialPlanId ?? '')
  const [selectedNoteId, setSelectedNoteId] = useState('')
  useEffect(() => {
    if (initialPlanId) { setSelectedId(initialPlanId); setSelectedKind('PLAN') }
  }, [initialPlanId])
  const [checkedNoteFields, setCheckedNoteFields] = useState<Set<NoteTemplateField>>(new Set())
  const [overwriteNoteFields, setOverwriteNoteFields] = useState(false)
  const [selectedMinedKey, setSelectedMinedKey] = useState('')
  const [includeLinkedNoteTemplate, setIncludeLinkedNoteTemplate] = useState(false)
  const [notice, setNotice] = useState('')

  // 标准方案明细勾选状态
  const [checkedDiagnosisCodes, setCheckedDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedMedicationKeys, setCheckedMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedServiceKeys, setCheckedServiceKeys] = useState<Set<string>>(new Set())

  // 复诊方案明细勾选状态
  const [checkedHistDiagnosisCodes, setCheckedHistDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedHistMedicationKeys, setCheckedHistMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedHistServiceKeys, setCheckedHistServiceKeys] = useState<Set<string>>(new Set())
  const [comparisonTemplateId, setComparisonTemplateId] = useState('')
  const [checkedComparisonKeys, setCheckedComparisonKeys] = useState<Set<string>>(new Set())
  const [comparisonSources, setComparisonSources] = useState<Map<string, 'HISTORICAL' | 'STANDARD'>>(new Map())

  // AI 挖掘方案明细勾选状态
  const [checkedMinedDiagnosisCodes, setCheckedMinedDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedMinedMedicationKeys, setCheckedMinedMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedMinedServiceKeys, setCheckedMinedServiceKeys] = useState<Set<string>>(new Set())

  const templates = useQuery({
    queryKey: ['outpatient-plan-templates', ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.list(),
    select: (values) => values.filter((value) => value.status === 'ACTIVE'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  const noteTemplates = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE', ...queryScope],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
  })

  const minedQuery = useQuery({
    queryKey: ['outpatient-mined-suggestions', ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.minedSuggestions(),
    enabled: false,
  })

  const historicalPlanQuery = useQuery({
    queryKey: ['historical-stable-plan', encounterId, encounter.residentId, ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.getHistoricalStablePlan(encounterId!),
    enabled: Boolean(encounterId) && (scopeFilter === 'ALL' || scopeFilter === 'HISTORICAL'),
  })

  const historicalComparisonQuery = useQuery({
    queryKey: ['historical-plan-comparison', encounterId, comparisonTemplateId, encounter.residentId, ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.compareHistoricalPlan(encounterId!, comparisonTemplateId),
    enabled: Boolean(encounterId && comparisonTemplateId && historicalPlanQuery.data)
      && scopeFilter === 'HISTORICAL',
  })

  const filteredTemplates = useMemo(() => {
    if (!templates.data) return []
    return templates.data.filter((value) => {
      if (scopeFilter !== 'ALL' && value.scopeType !== scopeFilter) return false
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase()
        const matchName = value.name.toLowerCase().includes(kw)
        const matchDesc = value.description?.toLowerCase().includes(kw)
        const matchGuideline = value.guidelineReference?.toLowerCase().includes(kw)
        const matchDiag = value.diagnoses.some((d) => d.display.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw))
        const matchMed = value.medications.some((m) => m.medicationName.toLowerCase().includes(kw))
        if (!matchName && !matchDesc && !matchGuideline && !matchDiag && !matchMed) return false
      }
      return true
    })
  }, [templates.data, scopeFilter, searchKeyword])

  const filteredNoteTemplates = useMemo(() => {
    if (!noteTemplates.data) return []
    const keyword = searchKeyword.trim().toLowerCase()
    return noteTemplates.data.filter((value) => !keyword
      || value.name.toLowerCase().includes(keyword)
      || value.description?.toLowerCase().includes(keyword)
      || noteTemplateFields.some(({ key }) => value.content[key]?.toLowerCase().includes(keyword)))
  }, [noteTemplates.data, searchKeyword])

  const selected = useMemo(() => {
    return filteredTemplates.find((v) => v.id === selectedId)
      || (initialPlanId && selectedId === initialPlanId ? null : filteredTemplates[0]) || null
  }, [filteredTemplates, selectedId, initialPlanId])

  const selectedNote = useMemo(() => filteredNoteTemplates.find((value) => value.id === selectedNoteId)
    || filteredNoteTemplates[0] || null, [filteredNoteTemplates, selectedNoteId])
  const selectedLinkedNoteTemplate = useMemo(() => selected?.noteTemplateId
    ? noteTemplates.data?.find((value) => value.id === selected.noteTemplateId) || null
    : null, [noteTemplates.data, selected?.noteTemplateId])

  useEffect(() => {
    if (templateKind !== 'ALL') return
    if (selectedKind === 'PLAN' && !filteredTemplates.length && filteredNoteTemplates.length) setSelectedKind('NOTE')
    if (selectedKind === 'NOTE' && !filteredNoteTemplates.length && filteredTemplates.length) setSelectedKind('PLAN')
  }, [filteredNoteTemplates.length, filteredTemplates.length, selectedKind, templateKind])

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
  }, [selected, selectedId])

  useEffect(() => {
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id)
  }, [selectedNote, selectedNoteId])

  useEffect(() => {
    if (!selectedNote) {
      setCheckedNoteFields(new Set())
      return
    }
    setCheckedNoteFields(new Set(noteTemplateFields
      .filter(({ key }) => Boolean(selectedNote.content[key]?.trim()))
      .map(({ key }) => key)))
    setOverwriteNoteFields(false)
  }, [selectedNote?.id])

  // 方案切换时默认全选明细项
  useEffect(() => {
    if (selected) {
      setCheckedDiagnosisCodes(new Set(selected.diagnoses.map((d) => d.code)))
      setCheckedMedicationKeys(new Set(selected.medications.map((m, idx) => m.lineId || `${m.medicationId}-${idx}`)))
      setCheckedServiceKeys(new Set(selected.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
      setIncludeLinkedNoteTemplate(Boolean(selected.noteTemplateId))
    } else {
      setCheckedDiagnosisCodes(new Set())
      setCheckedMedicationKeys(new Set())
      setCheckedServiceKeys(new Set())
      setIncludeLinkedNoteTemplate(false)
    }
  }, [selected?.id])

  const selectedMined = useMemo(() => {
    if (!minedQuery.data?.length) return null
    return minedQuery.data.find((v) => v.patternKey === selectedMinedKey) || minedQuery.data[0] || null
  }, [minedQuery.data, selectedMinedKey])

  useEffect(() => {
    if (selectedMined && selectedMined.patternKey !== selectedMinedKey) {
      setSelectedMinedKey(selectedMined.patternKey)
    }
  }, [selectedMined, selectedMinedKey])

  // 挖掘方案切换时默认全选
  useEffect(() => {
    if (selectedMined) {
      setCheckedMinedDiagnosisCodes(new Set(selectedMined.diagnoses.map((d) => d.code)))
      setCheckedMinedMedicationKeys(new Set(selectedMined.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
      setCheckedMinedServiceKeys(new Set(selectedMined.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
    } else {
      setCheckedMinedDiagnosisCodes(new Set())
      setCheckedMinedMedicationKeys(new Set())
      setCheckedMinedServiceKeys(new Set())
    }
  }, [selectedMined?.patternKey])

  // 复诊方案加载或切换时默认全选
  useEffect(() => {
    if (historicalPlanQuery.data) {
      setCheckedHistDiagnosisCodes(new Set(historicalPlanQuery.data.diagnoses.map((d) => d.code)))
      setCheckedHistMedicationKeys(new Set(historicalPlanQuery.data.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
      setCheckedHistServiceKeys(new Set(historicalPlanQuery.data.services.map((s, idx) => `${s.catalogItemId || (s as any).serviceCode || ''}-${idx}`)))
    } else {
      setCheckedHistDiagnosisCodes(new Set())
      setCheckedHistMedicationKeys(new Set())
      setCheckedHistServiceKeys(new Set())
    }
  }, [historicalPlanQuery.data?.encounterId, historicalPlanQuery.data?.sourceEncounterId])

  useEffect(() => {
    const candidates = templates.data ?? []
    if (!historicalPlanQuery.data || candidates.length === 0) return
    if (candidates.some((item) => item.id === comparisonTemplateId)) return
    const historyCodes = new Set(historicalPlanQuery.data.diagnoses.map((item) => item.code.toUpperCase()))
    const ranked = [...candidates].sort((left, right) => {
      const rightMatches = right.diagnoses.filter((item) => historyCodes.has(item.code.toUpperCase())).length
      const leftMatches = left.diagnoses.filter((item) => historyCodes.has(item.code.toUpperCase())).length
      return rightMatches - leftMatches || right.useCount - left.useCount || left.id.localeCompare(right.id)
    })
    setComparisonTemplateId(ranked[0]?.id ?? '')
  }, [comparisonTemplateId, historicalPlanQuery.data, templates.data])

  useEffect(() => {
    const differences = historicalComparisonQuery.data?.differences ?? []
    setCheckedComparisonKeys(new Set(differences.filter(item => canSelectHistoricalPlanDifference(item.status)).map((item) => item.key)))
    setComparisonSources(new Map(differences.map((item) => [item.key,
      item.historicalIndex == null ? 'STANDARD' : 'HISTORICAL'])))
  }, [historicalComparisonQuery.data])

  const application = useTemplateApplication(JSON.stringify({
    apiScope, encounter: [encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId, encounter.status],
    allergyContext, diagnoses, medicationDrafts, serviceDrafts,
    viewed: [selected, selectedNote, selectedMined, historicalPlanQuery.data, historicalComparisonQuery.data],
    selection: [templateKind, selectedKind, scopeFilter, selectedId, selectedNoteId, selectedMinedKey,
      comparisonTemplateId, [...checkedDiagnosisCodes], [...checkedMedicationKeys], [...checkedServiceKeys],
      [...checkedNoteFields], overwriteNoteFields, includeLinkedNoteTemplate, [...checkedHistDiagnosisCodes],
      [...checkedHistMedicationKeys], [...checkedHistServiceKeys], [...checkedComparisonKeys], [...comparisonSources],
      [...checkedMinedDiagnosisCodes], [...checkedMinedMedicationKeys], [...checkedMinedServiceKeys]],
  }), busy || encounter.status !== 'IN_PROGRESS', readRecordDraft)

  function finishPlan(plan: OutpatientPlanTemplate, orders: ResolvedTemplateOrders, note?: OutpatientNoteTemplate) {
    requireNoTemplateOrderConflicts(plan, medicationDrafts, serviceDrafts)
    const existingDiagnoses = new Set(diagnoses.map(item => item.code.toUpperCase()))
    const newDiagnoses = plan.diagnoses.filter(item => !existingDiagnoses.has(item.code.toUpperCase())).length
    stageTemplateDiagnoses(plan.diagnoses, diagnoses, setDiagnoses)
    setMedicationDrafts(current => [...current, ...orders.medications])
    setServiceDrafts(current => [...current, ...orders.services])
    const appliedNoteFields = note ? onApplyNoteTemplate(note, new Set(noteTemplateFields
      .filter(({ key }) => Boolean(note.content[key]?.trim())).map(({ key }) => key)), false) : 0
    const noteResult = !note ? '' : appliedNoteFields ? `，配套病历新增 ${appliedNoteFields} 个段落` : '，配套病历保留原有内容，未新增段落'
    const changed = newDiagnoses + plan.medications.length + plan.services.length + appliedNoteFields > 0
    const msg = changed ? `已从“${plan.name}”带入 ${newDiagnoses} 项诊断、${plan.medications.length} 项药品和 ${plan.services.length} 项诊疗医嘱${noteResult}，请核对后保存和开立。`
      : '所选方案内容已在当前草稿中，未新增内容。'
    setNotice(msg)
    if (changed) onNotice?.(msg)
    void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
    if (changed) onClose?.()
  }

  const apply = {
    isPending: application.pending,
    mutate: (selection: OutpatientPlanTemplate) => {
      const viewed = selected, includeNote = includeLinkedNoteTemplate
      const linked = viewed?.noteTemplateId ? noteTemplates.data?.find(item => item.id === viewed.noteTemplateId) : undefined
      void application.run(async isCurrent => {
        if (!viewed || templates.isFetching || templates.isError) throw new Error('方案目录尚未确认，请重新加载后带入。')
        if (includeNote && viewed.noteTemplateId && (!linked || noteTemplates.isFetching || noteTemplates.isError)) {
          throw new Error('所选配套病历模板不可用，本次未带入，请重新加载核对。')
        }
        const expected = structuredClone(viewed), selectedLines = structuredClone(selection)
        const expectedNote = includeNote && linked ? structuredClone(linked) : undefined
        const plan = requireUsedPlanReceipt(await api.outpatientPlanTemplates.use(expected.id), expected, selectedLines)
        if (!isCurrent()) return undefined
        const note = expectedNote ? requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expectedNote.id), expectedNote) : undefined
        if (!isCurrent()) return undefined
        const orders = await resolveTemplateOrders(plan, encounter, api, allergies, allergyReady)
        return { plan, note, orders }
      }, result => { if (result) finishPlan(result.plan, result.orders, result.note) })
    },
  }

  const applyNote = {
    isPending: application.pending,
    mutate: (value: OutpatientNoteTemplate) => {
      const fields = new Set(checkedNoteFields), overwrite = overwriteNoteFields
      void application.run(async () => {
        if (noteTemplates.isFetching || noteTemplates.isError || !fields.size) throw new Error('病历模板或勾选段落尚未确认，请重新加载核对。')
        const expected = structuredClone(value)
        return requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expected.id), expected)
      }, note => {
        const applied = onApplyNoteTemplate(note, fields, overwrite)
        const msg = applied ? `已带入病历模板“${note.name}”的 ${applied} 个段落，请结合患者情况核对。`
          : '所选病历段落未改变当前内容；如需替换已有段落，请选择覆盖后重新核对。'
        setNotice(msg)
        if (applied) onNotice?.(msg)
        void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
        if (applied) onClose?.()
      })
    },
  }

  function createReviewedPlan(input: SaveOutpatientPlanTemplateInput, applyToDraft: boolean) {
    void application.run(async isCurrent => {
      const expected = requirePlanCreationInput(structuredClone(input))
      const created = requireCreatedPlanReceipt(await api.outpatientPlanTemplates.create(expected), expected)
      if (!isCurrent()) return undefined
      const orders = applyToDraft ? await resolveTemplateOrders(created, encounter, api, allergies, allergyReady) : undefined
      return { created, orders }
    }, result => {
      if (!result) return
      const { created, orders } = result
      if (orders) finishPlan(created, orders)
      else {
        setNotice(`已将开方习惯保存为个人常用方案“${created.name}”。`)
        void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      }
    })
  }
  const applyHistoricalMutation = {
    isPending: application.pending,
    mutate: (plan: HistoricalStablePlan) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.conditionTitle,
      description: plan.summary, sourceType: 'AI_INPUT', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, true),
  }
  const solidifyMinedMutation = {
    isPending: application.pending,
    mutate: (plan: MinedPlanSuggestion) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.suggestedName,
      description: plan.description, sourceType: 'AI_MINED', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, false),
  }
  const applyMinedMutation = {
    isPending: application.pending,
    mutate: (plan: MinedPlanSuggestion) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.suggestedName,
      description: plan.description, sourceType: 'AI_MINED', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, true),
  }

  // 勾选计数与调入处理
  const totalCheckedStandard = checkedDiagnosisCodes.size + checkedMedicationKeys.size + checkedServiceKeys.size
    + (includeLinkedNoteTemplate && selectedLinkedNoteTemplate ? 1 : 0)

  const handleApplyStandard = () => {
    if (!selected) return
    const templateToApply: OutpatientPlanTemplate = {
      ...selected,
      diagnoses: selected.diagnoses.filter((d) => checkedDiagnosisCodes.has(d.code)),
      medications: selected.medications.filter((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`)),
      services: selected.services.filter((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`)),
    }
    apply.mutate(templateToApply)
  }

  const totalCheckedHist = checkedHistDiagnosisCodes.size + checkedHistMedicationKeys.size + checkedHistServiceKeys.size
  const effectiveHistoricalSelectionCount = historicalComparisonQuery.data
    ? checkedComparisonKeys.size : totalCheckedHist

  const handleApplyHistorical = () => {
    if (!historicalPlanQuery.data) return
    const comparison = historicalComparisonQuery.data
    if (!hasHistoricalReviewEvidence(historicalPlanQuery.data) || historicalPlanQuery.isFetching || historicalPlanQuery.isError || historicalPlanQuery.data.encounterId !== encounter.id
      || (comparisonTemplateId && (historicalComparisonQuery.isFetching || historicalComparisonQuery.isError || !comparison))) {
      application.reject('历史方案或比较结果尚未确认，请重新加载后带入。'); return
    }
    if (comparison) {
      try {
        applyHistoricalMutation.mutate(selectHistoricalPlanDifferences(comparison, encounter.id,
          comparisonTemplateId, checkedComparisonKeys, comparisonSources))
      } catch (error) { application.reject(errorMessage(error)) }
      return
    }
    const filtered: HistoricalStablePlan = {
      ...historicalPlanQuery.data,
      diagnoses: historicalPlanQuery.data.diagnoses.filter((d) => checkedHistDiagnosisCodes.has(d.code)),
      medications: historicalPlanQuery.data.medications.filter((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`)),
      services: historicalPlanQuery.data.services.filter((s, idx) => checkedHistServiceKeys.has(`${s.catalogItemId || (s as any).serviceCode || ''}-${idx}`)),
    }
    applyHistoricalMutation.mutate(filtered)
  }

  const totalCheckedMined = checkedMinedDiagnosisCodes.size + checkedMinedMedicationKeys.size + checkedMinedServiceKeys.size

  const handleApplyMined = () => {
    if (!selectedMined) return
    if (minedQuery.isFetching || minedQuery.isError) {
      application.reject('挖掘方案尚未确认，请重新加载后带入。'); return
    }
    const filtered: MinedPlanSuggestion = {
      ...selectedMined,
      diagnoses: selectedMined.diagnoses.filter((d) => checkedMinedDiagnosisCodes.has(d.code)),
      medications: selectedMined.medications.filter((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`)),
      services: selectedMined.services.filter((s, idx) => checkedMinedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`)),
    }
    applyMinedMutation.mutate(filtered)
  }

  const error = application.error || templates.error || noteTemplates.error
    || historicalPlanQuery.error || historicalComparisonQuery.error || minedQuery.error
    || (historicalPlanQuery.data && !hasHistoricalReviewEvidence(historicalPlanQuery.data)
      ? '历史核对状态未返回，请重新加载历史方案后再带入。' : null)
    || (historicalComparisonQuery.data && !hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan)
      ? '历史比较核对状态未返回，请重新加载后再带入。' : null)

  const showingNoteTemplate = templateKind === 'NOTE'
    || (templateKind === 'ALL' && selectedKind === 'NOTE')
  const kindTabs: Array<{ value: 'ALL' | 'NOTE' | 'PLAN'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部', meta: `(${(templates.data?.length ?? 0) + (noteTemplates.data?.length ?? 0)})` },
    { value: 'NOTE', label: '病历模板', meta: noteTemplates.data?.length ? `(${noteTemplates.data.length})` : undefined },
    { value: 'PLAN', label: '诊疗方案', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
  ]

  const scopeTabs: Array<{ value: 'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部方案', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
    { value: 'PERSONAL', label: '个人高频', meta: templates.data?.filter(t => t.scopeType === 'PERSONAL').length ? `(${templates.data.filter(t => t.scopeType === 'PERSONAL').length})` : undefined },
    { value: 'DEPARTMENT', label: '科室路径', meta: templates.data?.filter(t => t.scopeType === 'DEPARTMENT').length ? `(${templates.data.filter(t => t.scopeType === 'DEPARTMENT').length})` : undefined },
    { value: 'HOSPITAL', label: '全院/指南', meta: templates.data?.filter(t => t.scopeType === 'HOSPITAL').length ? `(${templates.data.filter(t => t.scopeType === 'HOSPITAL').length})` : undefined },
    { value: 'HISTORICAL', label: '复诊成熟方案', meta: historicalPlanQuery.data ? '(1)' : undefined },
  ]

  return <>
      <div className="doctor-plan-pool-modal is-drawer">
        {error && <div role="alert" className="doctor-plan-pool-notice">{typeof error === 'string' ? error : errorMessage(error)}
          <Button variant="text" disabled={application.pending} onClick={() => {
            void templates.refetch(); void noteTemplates.refetch()
            if (scopeFilter === 'HISTORICAL') { void historicalPlanQuery.refetch(); if (comparisonTemplateId) void historicalComparisonQuery.refetch() }
            if (scopeFilter === 'MINED') void minedQuery.refetch()
          }}>重新加载模板</Button></div>}
        {notice && <div className="doctor-plan-pool-notice">{notice}</div>}

        {/* 顶部模板类型、方案范围与确认操作 */}
        <div className="doctor-plan-pool-header">
          <div className="doctor-clinical-template-filters">
            <Tabs
              value={templateKind}
              onChange={(tabId) => {
                setTemplateKind(tabId)
                if (tabId !== 'PLAN') setScopeFilter('ALL')
                if (tabId === 'NOTE') setSelectedKind('NOTE')
                if (tabId === 'PLAN') setSelectedKind('PLAN')
                setNotice('')
              }}
              label="临床模板类型"
              variant="line"
              items={kindTabs}
            />
            {templateKind === 'PLAN' && <Tabs
              value={scopeFilter}
              onChange={(tabId) => { setScopeFilter(tabId); setNotice('') }}
              label="诊疗方案范围"
              variant="line"
              items={scopeTabs}
            />}
          </div>
          <div className="doctor-plan-pool-header-actions">
            {showingNoteTemplate ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selectedNote || checkedNoteFields.size === 0 || noteTemplates.isFetching || noteTemplates.isError}
                busy={applyNote.isPending}
                onClick={() => selectedNote && applyNote.mutate(selectedNote)}
              >
                {checkedNoteFields.size > 0 ? `带入病历草稿 (${checkedNoteFields.size})` : '带入病历草稿'}
              </Button>
            ) : scopeFilter === 'HISTORICAL' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !hasHistoricalReviewEvidence(historicalPlanQuery.data) || !historicalPlanQuery.data || effectiveHistoricalSelectionCount === 0 || historicalPlanQuery.isFetching || historicalPlanQuery.isError
                  || Boolean(comparisonTemplateId && (historicalComparisonQuery.isFetching || historicalComparisonQuery.isError || !historicalComparisonQuery.data
                    || !hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan)))}
                busy={applyHistoricalMutation.isPending}
                onClick={handleApplyHistorical}
              >
                {effectiveHistoricalSelectionCount > 0
                  ? `合并带入草稿 (${effectiveHistoricalSelectionCount})` : '合并带入草稿'}
              </Button>
            ) : scopeFilter === 'MINED' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selectedMined || totalCheckedMined === 0 || minedQuery.isFetching || minedQuery.isError}
                busy={applyMinedMutation.isPending}
                onClick={handleApplyMined}
              >
                {totalCheckedMined > 0 ? `直接带入草稿 (${totalCheckedMined})` : '直接带入草稿'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selected || totalCheckedStandard === 0 || templates.isFetching || templates.isError}
                busy={apply.isPending}
                onClick={handleApplyStandard}
              >
                {totalCheckedStandard > 0 ? `带入当前草稿 (${totalCheckedStandard})` : '带入当前草稿'}
              </Button>
            )}
          </div>
        </div>

        {/* 宽屏桌面端左右分栏工作区 */}
        <div className="doctor-plan-pool-split">
          {/* 左侧栏：方案索引与检索 */}
          <div className="doctor-plan-pool-sidebar">
            {(templateKind !== 'PLAN' || scopeFilter !== 'HISTORICAL') && (
              <SearchField
                className="doctor-plan-pool-search"
                label="搜索临床模板"
                value={searchKeyword}
                onChange={setSearchKeyword}
                placeholder="搜索模板、诊断、药品或病历内容..."
              />
            )}

            <div className="doctor-plan-pool-list">
              {templateKind === 'NOTE' ? (
                noteTemplates.isPending ? <LoadingState label="正在加载病历模板..." /> :
                filteredNoteTemplates.length ? filteredNoteTemplates.map((item) => (
                  <Button variant="text" size="sm" key={item.id} type="button"
                    className={`doctor-plan-item-card ${selectedNote?.id === item.id ? 'is-selected' : ''}`}
                    onClick={() => { setSelectedNoteId(item.id); setSelectedKind('NOTE') }}>
                    <div className="doctor-plan-item-card__top">
                      <div className="doctor-plan-card-badges">
                        <StatusBadge tone="info">病历模板</StatusBadge>
                        <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : '科室'}</StatusBadge>
                      </div>
                      <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                    </div>
                    <div className="doctor-plan-item-card__title">{item.name}</div>
                    {item.description && item.description !== item.name && item.description !== '门诊病历段落模板' && (
                      <div className="doctor-plan-item-card__desc">{item.description}</div>
                    )}
                    <div className="doctor-plan-item-card__meta">
                      <span>可用段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                    </div>
                  </Button>
                )) : <div className="doctor-plan-pool-empty-text">未找到匹配的病历模板</div>
              ) : templateKind === 'ALL' ? (
                noteTemplates.isPending || templates.isPending ? <LoadingState label="正在加载临床模板..." /> :
                filteredNoteTemplates.length || filteredTemplates.length ? <>
                  {filteredNoteTemplates.map((item) => (
                    <Button variant="text" size="sm" key={`note-${item.id}`} type="button"
                      className={`doctor-plan-item-card ${selectedKind === 'NOTE' && selectedNote?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => { setSelectedNoteId(item.id); setSelectedKind('NOTE') }}>
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone="info">病历模板</StatusBadge>
                          <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : '科室'}</StatusBadge>
                        </div>
                        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.name}</div>
                      {item.description && item.description !== item.name && item.description !== '门诊病历段落模板' && (
                        <div className="doctor-plan-item-card__desc">{item.description}</div>
                      )}
                      <div className="doctor-plan-item-card__meta">
                        <span>病历段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                      </div>
                    </Button>
                  ))}
                  {filteredTemplates.map((item) => (
                    <Button variant="text" size="sm" key={`plan-${item.id}`} type="button"
                      className={`doctor-plan-item-card ${selectedKind === 'PLAN' && selected?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => { setSelectedId(item.id); setSelectedKind('PLAN') }}>
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone="success">诊疗方案</StatusBadge>
                          <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : item.scopeType === 'DEPARTMENT' ? '科室' : '全院'}</StatusBadge>
                        </div>
                        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.name}</div>
                      {item.description && item.description !== item.name && item.description !== '由医生审核确认的诊疗方案' && (
                        <div className="doctor-plan-item-card__desc">{item.description}</div>
                      )}
                      <div className="doctor-plan-item-card__meta">
                        {item.noteTemplateId && <><span>病历 1</span><span>·</span></>}
                        <span>诊断 {item.diagnoses.length}</span><span>·</span>
                        <span>药品 {item.medications.length}</span><span>·</span>
                        <span>诊疗 {item.services.length}</span>
                      </div>
                    </Button>
                  ))}
                </> : <div className="doctor-plan-pool-empty-text">未找到匹配的临床模板</div>
              ) : scopeFilter === 'HISTORICAL' ? (
                historicalPlanQuery.isPending ? <LoadingState label="正在识别复诊平稳方案..." /> :
                historicalPlanQuery.data ? (
                  <>
                    <FormField label="对照标准方案">
                      <Select value={comparisonTemplateId} onChange={setComparisonTemplateId}
                        clearable={false} searchable options={(templates.data ?? []).map((item) => ({
                          value: item.id, label: item.name,
                          secondaryText: `${item.diagnoses.length} 个诊断 / ${item.medications.length} 个药品`,
                        }))} placeholder="选择院内标准方案" />
                    </FormField>
                    <div className="doctor-plan-item-card is-selected">
                      <div className="doctor-plan-item-card__top">
                        <StatusBadge tone="success">复诊长程处方</StatusBadge>
                        <small className="doctor-plan-card-meta-text">历史平稳期</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{historicalPlanQuery.data.conditionTitle}</div>
                      <div className="doctor-plan-item-card__desc">{historicalPlanQuery.data.summary}</div>
                      <div className="doctor-plan-item-card__meta">
                        <span>诊断 {historicalPlanQuery.data.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {historicalPlanQuery.data.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {historicalPlanQuery.data.services.length}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    未识别到该患者近180天内的平稳期维持处方
                  </div>
                )
              ) : scopeFilter === 'MINED' ? (
                minedQuery.isPending ? <LoadingState label="正在聚类开方习惯..." /> :
                minedQuery.data?.length ? (
                  minedQuery.data.map((item) => (
                    <div
                      key={item.patternKey}
                      className={`doctor-plan-item-card ${selectedMinedKey === item.patternKey ? 'is-selected' : ''}`}
                      onClick={() => setSelectedMinedKey(item.patternKey)}
                    >
                      <div className="doctor-plan-item-card__top">
                        <StatusBadge tone="info">近30天开立 {item.occurrenceCount} 次</StatusBadge>
                        <small className="doctor-plan-card-meta-text">AI 习惯挖掘</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.suggestedName}</div>
                      <div className="doctor-plan-item-card__desc">{item.description}</div>
                      <div className="doctor-plan-item-card__meta">
                        <span>诊断 {item.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {item.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {item.services.length}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    暂无开方聚类习惯推荐
                  </div>
                )
              ) : (
                templates.isPending ? <LoadingState label="正在加载方案库..." /> :
                filteredTemplates.length ? (
                  filteredTemplates.map((item) => (
                    <div
                      key={item.id}
                      className={`doctor-plan-item-card ${selected?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone={item.scopeType === 'PERSONAL' ? 'neutral' : item.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                            {item.scopeType === 'PERSONAL' ? '个人' : item.scopeType === 'DEPARTMENT' ? '科室' : '全院指南'}
                          </StatusBadge>
                          {item.sourceType === 'AI_INPUT' && <StatusBadge tone="info">速记</StatusBadge>}
                          {item.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南抽取</StatusBadge>}
                          {item.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方沉淀</StatusBadge>}
                        </div>
                        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.name}</div>
                      {item.guidelineReference && (
                        <div className="doctor-plan-card-guideline">
                          📖 {item.guidelineReference}
                        </div>
                      )}
                      {item.description && item.description !== item.name && item.description !== '由医生审核确认的诊疗方案' && (
                        <div className="doctor-plan-item-card__desc">{item.description}</div>
                      )}
                      <div className="doctor-plan-item-card__meta">
                        {item.noteTemplateId && <><span>病历 1</span><span>·</span></>}
                        <span>诊断 {item.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {item.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {item.services.length}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    未找到匹配方案
                  </div>
                )
              )}
            </div>
          </div>

          {/* 右侧栏：选中方案明细看板与带入操作 */}
          <div className="doctor-plan-pool-detail">
            {showingNoteTemplate ? (
              selectedNote ? <div className="doctor-plan-pool-detail__body">
                <div className="doctor-plan-detail-hero is-compact">
                  <div className="doctor-plan-detail-hero__title">
                    <span>{selectedNote.name}</span>
                    <StatusBadge tone="info">病历模板</StatusBadge>
                    <StatusBadge tone="neutral">{selectedNote.scopeType === 'PERSONAL' ? '医生个人' : '科室共享'}</StatusBadge>
                  </div>
                  {selectedNote.description && <p className="doctor-plan-detail-desc">{selectedNote.description}</p>}
                </div>

                <label className="doctor-note-template-mode">
                  <input type="checkbox" checked={overwriteNoteFields} disabled={applyNote.isPending}
                    onChange={(event) => setOverwriteNoteFields(event.target.checked)} />
                  <span><strong>覆盖所选段落已有内容</strong><small>默认只填充当前为空的病历段落，避免覆盖医生已书写内容。</small></span>
                </label>

                <div className="doctor-plan-detail-section">
                  <div className="doctor-plan-detail-section__title">选择带入的病历段落 ({checkedNoteFields.size})</div>
                  <div className="doctor-note-template-preview is-workspace">
                    {noteTemplateFields.filter(({ key }) => selectedNote.content[key]?.trim()).map(({ key, label }) => (
                      <label key={key} className={checkedNoteFields.has(key) ? undefined : 'is-row-unchecked'}>
                        <input type="checkbox" checked={checkedNoteFields.has(key)}
                          onChange={() => setCheckedNoteFields((current) => {
                            const next = new Set(current)
                            if (next.has(key)) next.delete(key); else next.add(key)
                            return next
                          })} />
                        <span><strong>{label}</strong><small>{selectedNote.content[key]}</small></span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="doctor-plan-pool-detail__footer">
                  <span className="doctor-plan-footer-hint">只修改当前病历草稿，不会生成诊断、药品或检查医嘱，也不会自动保存。</span>
                </div>
              </div> : <EmptyState icon="clinical" title="暂无病历模板" copy="当前筛选条件下没有匹配的病历模板。" />
            ) : scopeFilter === 'HISTORICAL' ? (
              historicalPlanQuery.data ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{historicalPlanQuery.data.conditionTitle}</span>
                      <StatusBadge tone={historicalPlanQuery.data.reviewItems?.length ? 'warning' : 'info'}>历史重复方案</StatusBadge>
                    </div>
                    <p className="doctor-plan-detail-desc">
                      {historicalPlanQuery.data.summary}
                    </p>
                  </div>

                  {comparisonTemplateId && (historicalComparisonQuery.isPending || historicalComparisonQuery.isFetching
                    ? <LoadingState label="正在计算历史与标准方案差异..." />
                    : !historicalComparisonQuery.isError && historicalComparisonQuery.data
                      && hasHistoricalReviewEvidence(historicalPlanQuery.data)
                      && hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan) && (
                      <div className="doctor-plan-detail-section">
                        <div className="doctor-plan-detail-section__title">
                          与“{historicalComparisonQuery.data.standardPlan.name}”逐项比较
                        </div>
                        <TableShell className="doctor-plan-table-shell">
                          <DataTable compact className="doctor-plan-items-table">
                            <thead><tr>
                              <th className={tableCellClass('control')}>选择</th>
                              <th className={tableCellClass('status')}>类型</th>
                              <th className={tableCellClass('status')}>差异</th>
                              <th className={tableCellClass('text')}>历史稳定方案</th>
                              <th className={tableCellClass('text')}>院内标准方案</th>
                              <th className={tableCellClass('text')}>采用</th>
                            </tr></thead>
                            <tbody>{historicalComparisonQuery.data.differences.map((item) => {
                              const selectable = canSelectHistoricalPlanDifference(item.status)
                              const status = historicalPlanDifferencePresentation(item.status)
                              const checked = selectable && checkedComparisonKeys.has(item.key)
                              const source = comparisonSources.get(item.key)
                                ?? (item.historicalIndex == null ? 'STANDARD' : 'HISTORICAL')
                              const sourceOptions = [
                                ...(item.historicalIndex == null ? [] : [{ value: 'HISTORICAL', label: '历史方案' }]),
                                ...(item.standardIndex == null ? [] : [{ value: 'STANDARD', label: '标准方案' }]),
                              ]
                              return <tr key={item.key} className={checked ? undefined : 'is-row-unchecked'}>
                                <td className={tableCellClass('control')}><input type="checkbox"
                                  aria-label={`选择差异项 ${item.historicalDisplay || item.standardDisplay || item.key}`}
                                  checked={checked} disabled={!selectable} onChange={() => setCheckedComparisonKeys((current) => {
                                    const next = new Set(current)
                                    if (next.has(item.key)) next.delete(item.key); else next.add(item.key)
                                    return next
                                  })} /></td>
                                <td className={tableCellClass('status')}>{item.category === 'DIAGNOSIS' ? '诊断'
                                  : item.category === 'MEDICATION' ? '药品' : '诊疗'}</td>
                                <td className={tableCellClass('status')}><StatusBadge tone={status.tone}>
                                  {status.label}
                                </StatusBadge></td>
                                <td className={tableCellClass('text')}>{item.historicalDisplay || '—'}</td>
                                <td className={tableCellClass('text')}>{item.standardDisplay || '—'}
                                  <small className="doctor-plan-item-subtext">{item.reason}</small></td>
                                <td className={tableCellClass('text')}>{sourceOptions.length ? <Select aria-label={`选择 ${item.key} 的采用来源`}
                                  value={source} disabled={!selectable} onChange={(value) => setComparisonSources((current) => {
                                    const next = new Map(current)
                                    next.set(item.key, value as 'HISTORICAL' | 'STANDARD')
                                    return next
                                  })} options={sourceOptions} clearable={false} searchable={false} /> : '需重新核对'}</td>
                              </tr>
                            })}</tbody>
                          </DataTable>
                        </TableShell>
                      </div>
                    ))}

                  {hasHistoricalReviewEvidence(historicalPlanQuery.data) && historicalPlanQuery.data.reviewItems.length > 0 && (
                    <div className="doctor-plan-detail-section">
                      <div className="doctor-plan-detail-section__title">待核对的历史记录 ({historicalPlanQuery.data.reviewItems.length})</div>
                      <TableShell className="doctor-plan-table-shell">
                        <DataTable compact className="doctor-plan-items-table">
                          <thead><tr><th className={tableCellClass('text')}>原始记录</th><th className={tableCellClass('text')}>未带入原因</th></tr></thead>
                          <tbody>{historicalPlanQuery.data.reviewItems.map((item, index) => <tr key={`${item.category}:${item.sourceId}:${index}`}>
                            <td className={tableCellClass('text')}>{item.display || item.code || '原记录名称未提供'}</td>
                            <td className={tableCellClass('text')}>{item.reason}</td>
                          </tr>)}</tbody>
                        </DataTable>
                      </TableShell>
                    </div>
                  )}

                  {historicalPlanQuery.data.guidanceNotes.length > 0 && (
                    <div className="doctor-plan-detail-notes">
                      <strong>💡 处方平稳期分析与品规对齐建议：</strong>
                      {historicalPlanQuery.data.guidanceNotes.map((note, idx) => (
                        <div key={idx}>• {note}</div>
                      ))}
                    </div>
                  )}

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断列表 ({historicalPlanQuery.data.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={historicalPlanQuery.data.diagnoses.length > 0 && historicalPlanQuery.data.diagnoses.every((d) => checkedHistDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = historicalPlanQuery.data!.diagnoses.length > 0 && historicalPlanQuery.data!.diagnoses.every((d) => checkedHistDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedHistDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedHistDiagnosisCodes(new Set(historicalPlanQuery.data!.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={historicalPlanQuery.data.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalPlanQuery.data.diagnoses.length > 0 ? (
                            historicalPlanQuery.data.diagnoses.map((d) => {
                              const isChecked = checkedHistDiagnosisCodes.has(d.code)
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedHistDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">长程处方维持用药 ({historicalPlanQuery.data.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选维持用药"
                                checked={historicalPlanQuery.data.medications.length > 0 && historicalPlanQuery.data.medications.every((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = historicalPlanQuery.data!.medications.length > 0 && historicalPlanQuery.data!.medications.every((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedHistMedicationKeys(new Set())
                                  } else {
                                    setCheckedHistMedicationKeys(new Set(historicalPlanQuery.data!.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={historicalPlanQuery.data.medications.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>药品及品规</th>
                            <th className={tableCellClass('numeric')}>单次剂量</th>
                            <th className={tableCellClass('text')}>途径</th>
                            <th className={tableCellClass('text')}>频次</th>
                            <th className={tableCellClass('numeric')}>疗程</th>
                            <th className={tableCellClass('numeric')}>数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalPlanQuery.data.medications.length > 0 ? (
                            historicalPlanQuery.data.medications.map((m, idx) => {
                              const medKey = `${m.medicationId}-${idx}`
                              const isChecked = checkedHistMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择维持用药 #${m.medicationId}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedHistMedicationKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(medKey)) next.delete(medKey)
                                          else next.add(medKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('text')}>
                                    <div><strong>药品编码 #{m.medicationId}</strong></div>
                                    {m.medicationInstruction && <small className="doctor-plan-item-subtext">{m.medicationInstruction}</small>}
                                  </td>
                                  <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                                  <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                                  <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                                  <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                                  <td className={tableCellClass('numeric')}>{m.quantity} {m.quantityUnit}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="doctor-plan-table-empty">暂无维持用药</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-pool-detail__footer">
                    <span className="doctor-plan-footer-hint">
                      一键复用将慢病平稳期处方带入草稿，开立前仍执行品规库存和过敏校验。
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="未识别到复诊成熟方案" copy="患者本次就诊暂无近180天内的历史平稳期处方或慢病长程用药记录。" />
              )
            ) : scopeFilter === 'MINED' ? (
              selectedMined ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{selectedMined.suggestedName}</span>
                      <StatusBadge tone="info">近30天高频开立 {selectedMined.occurrenceCount} 次</StatusBadge>
                    </div>
                    <p className="doctor-plan-detail-desc">
                      {selectedMined.description}
                    </p>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断组合 ({selectedMined.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={selectedMined.diagnoses.length > 0 && selectedMined.diagnoses.every((d) => checkedMinedDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = selectedMined.diagnoses.length > 0 && selectedMined.diagnoses.every((d) => checkedMinedDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedMinedDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedMinedDiagnosisCodes(new Set(selectedMined.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={selectedMined.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMined.diagnoses.length > 0 ? (
                            selectedMined.diagnoses.map((d) => {
                              const isChecked = checkedMinedDiagnosisCodes.has(d.code)
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedMinedDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">常用开方药品 ({selectedMined.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选开方药品"
                                checked={selectedMined.medications.length > 0 && selectedMined.medications.every((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = selectedMined.medications.length > 0 && selectedMined.medications.every((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedMinedMedicationKeys(new Set())
                                  } else {
                                    setCheckedMinedMedicationKeys(new Set(selectedMined.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={selectedMined.medications.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>药品编码</th>
                            <th className={tableCellClass('numeric')}>单次剂量</th>
                            <th className={tableCellClass('text')}>途径</th>
                            <th className={tableCellClass('text')}>频次</th>
                            <th className={tableCellClass('numeric')}>疗程</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMined.medications.length > 0 ? (
                            selectedMined.medications.map((m, idx) => {
                              const medKey = `${m.medicationId}-${idx}`
                              const isChecked = checkedMinedMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择开方药品 #${m.medicationId}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedMinedMedicationKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(medKey)) next.delete(medKey)
                                          else next.add(medKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('text')}><strong>药品 #{m.medicationId}</strong></td>
                                  <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                                  <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                                  <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                                  <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="doctor-plan-table-empty">暂无开方药品</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-pool-detail__footer">
                    <Button
                      variant="secondary"
                      busy={solidifyMinedMutation.isPending}
                      onClick={() => solidifyMinedMutation.mutate(selectedMined)}
                    >
                      固化为个人常用方案
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="暂无高频方案建议" copy="AI 暂未挖掘到可聚类的高频开方组合。" />
              )
            ) : (
              selected ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero is-compact">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{selected.name}</span>
                      <StatusBadge tone={selected.scopeType === 'PERSONAL' ? 'neutral' : selected.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                        {selected.scopeType === 'PERSONAL' ? '医生个人方案' : selected.scopeType === 'DEPARTMENT' ? '科室临床路径' : '全院/指南标准方案'}
                      </StatusBadge>
                      {selected.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南结构化抽取</StatusBadge>}
                      {selected.sourceType === 'AI_INPUT' && <StatusBadge tone="info">AI 智能速记</StatusBadge>}
                      {selected.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方习惯沉淀</StatusBadge>}
                    </div>
                    {selected.guidelineReference && (
                      <div className="doctor-plan-detail-guideline">
                        📖 用户录入的条文来源（未核验）：{planSourceReferenceLabel(selected.guidelineReference)}
                      </div>
                    )}
                  </div>

                  {selected.noteTemplateId && <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">配套病历模板</div>
                    <label className="doctor-note-template-mode">
                      <input type="checkbox" checked={includeLinkedNoteTemplate}
                        disabled={!selectedLinkedNoteTemplate || apply.isPending}
                        onChange={(event) => setIncludeLinkedNoteTemplate(event.target.checked)} />
                      <span>
                        <strong>{selectedLinkedNoteTemplate?.name || '关联的病历模板当前不可用'}</strong>
                        <small>{selectedLinkedNoteTemplate
                          ? `整体带入 ${noteTemplateFields.filter(({ key }) => selectedLinkedNoteTemplate.content[key]?.trim()).map(({ label }) => label).join('、')}`
                          : '可能已停用或超出当前科室可见范围；诊断和医嘱仍可单独带入。'}</small>
                      </span>
                    </label>
                  </div>}

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断列表 ({selected.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={selected.diagnoses.length > 0 && selected.diagnoses.every((d) => checkedDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = selected.diagnoses.length > 0 && selected.diagnoses.every((d) => checkedDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedDiagnosisCodes(new Set(selected.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={selected.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.diagnoses.length > 0 ? (
                            selected.diagnoses.map((d) => {
                              const isChecked = checkedDiagnosisCodes.has(d.code)
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">处方药品列表 ({selected.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选处方药品"
                                checked={selected.medications.length > 0 && selected.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = selected.medications.length > 0 && selected.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedMedicationKeys(new Set())
                                  } else {
                                    setCheckedMedicationKeys(new Set(selected.medications.map((m, idx) => m.lineId || `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={selected.medications.length === 0}
                              />
                            </th>
                            <th className={`${tableCellClass('text')} doctor-col--med-name`}>药品名称及规格</th>
                            <th className={`${tableCellClass('numeric')} doctor-col--dose`}>单次剂量</th>
                            <th className={`${tableCellClass('text')} doctor-col--route`}>途径</th>
                            <th className={`${tableCellClass('text')} doctor-col--frequency`}>频次</th>
                            <th className={`${tableCellClass('numeric')} doctor-col--duration`}>疗程</th>
                            <th className={`${tableCellClass('text')} doctor-col--instruction`}>用法说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.medications.length > 0 ? (
                            selected.medications.map((m, idx) => {
                              const medKey = m.lineId || `${m.medicationId}-${idx}`
                              const isChecked = checkedMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择药品 ${m.medicationName}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedMedicationKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(medKey)) next.delete(medKey)
                                          else next.add(medKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={`${tableCellClass('text')} doctor-col--med-name`}>
                                    <div className="doctor-plan-med-name-cell">
                                      <strong>{m.medicationName}</strong>
                                      {m.preparationSpec && <span className="doctor-plan-item-spec">{m.preparationSpec}</span>}
                                    </div>
                                  </td>
                                  <td className={`${tableCellClass('numeric')} doctor-col--dose`}>{m.doseValue} {m.doseUnit}</td>
                                  <td className={`${tableCellClass('text')} doctor-col--route`}>{m.routeName || m.routeCode || '—'}</td>
                                  <td className={`${tableCellClass('text')} doctor-col--frequency`}>{m.frequencyCode || '—'}</td>
                                  <td className={`${tableCellClass('numeric')} doctor-col--duration`}>{m.durationValue} {m.durationUnit}</td>
                                  <td className={`${tableCellClass('text')} doctor-col--instruction`}>
                                    <div className="doctor-plan-instruction-cell" title={m.medicationInstruction || undefined}>
                                      {m.medicationInstruction || '—'}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="doctor-plan-table-empty">暂无处方药品</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">检查 / 检验 / 治疗项目 ({selected.services.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选检查检验治疗项目"
                                checked={selected.services.length > 0 && selected.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))}
                                onChange={() => {
                                  const isAll = selected.services.length > 0 && selected.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))
                                  if (isAll) {
                                    setCheckedServiceKeys(new Set())
                                  } else {
                                    setCheckedServiceKeys(new Set(selected.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
                                  }
                                }}
                                disabled={selected.services.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>项目名称</th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('numeric')} style={{ width: '80px' }}>数量</th>
                            <th className={tableCellClass('text')}>临床要求</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.services.length > 0 ? (
                            selected.services.map((s, idx) => {
                              const srvKey = `${s.catalogItemId || s.itemCode || ''}-${idx}`
                              const isChecked = checkedServiceKeys.has(srvKey)
                              return (
                                <tr key={srvKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择项目 ${s.itemName}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedServiceKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(srvKey)) next.delete(srvKey)
                                          else next.add(srvKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('text')}>
                                    <strong>{s.itemName}</strong> <small className="doctor-plan-item-subtext">({s.itemCode})</small>
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone="neutral">
                                      {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '治疗'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('numeric')}>{s.quantity} {s.unitCode}</td>
                                  <td className={tableCellClass('text')}>
                                    <div className="doctor-plan-instruction-cell" title={s.clinicalDescription || undefined}>
                                      {s.clinicalDescription || '—'}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} className="doctor-plan-table-empty">暂无检查检验治疗项目</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-pool-detail__footer">
                    <span className="doctor-plan-footer-hint">
                      累计已使用 {selected.useCount} 次 · 带入后仍可在门诊工作台进一步调整
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="暂无诊疗方案" copy="当前筛选条件下没有匹配的方案。" />
              )
            )}
          </div>
        </div>
      </div>
  </>
}

function stageTemplateDiagnoses(values: DiagnosisInput[], currentDiagnoses: DiagnosisInput[], setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>) {
  const diagnosisCodes = new Set(currentDiagnoses.map(item => item.code.toUpperCase()))
  const hasPrimary = currentDiagnoses.some(item => item.type === 'PRIMARY')
  setDiagnoses(current => normalizeDiagnosisOrder([...current, ...values
    .filter(item => !diagnosisCodes.has(item.code.toUpperCase()))
    .map(item => ({ ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type }))]))
}

function medicationDraftKey(item: MedicationPlanDraft) {
  return [item.request.medicationId ?? '', item.request.catalogItemId ?? '', item.request.routeCode ?? '',
    item.request.frequencyCode ?? ''].join('|')
}

const medicationSafetyRuleNames: Record<string, string> = {
  'QMED.AGE_CONTRAINDICATION': '儿童及特定年龄禁忌用药核对',
  'QMED.ANTIMICROBIAL_OUTPATIENT': '门诊抗菌药物疗程核对',
  'QMED.DRUG_ALLERGY': '药物过敏风险核对',
  'QMED.DISULFIRAM_INTERACTION': '双硫仑样反应配伍禁忌核对',
  'QMED.EXACT_GENERIC_DUPLICATE': '同通用名重复用药核对',
  'QMED.NSAID_DUPLICATE': '非甾体抗炎药重复用药核对',
  'QMED.SKIN_TEST': '皮试要求核对',
}

function medicationSafetySeverityLabel(severity: MedicationSafetyFinding['severity']) {
  return ({ INFO: '提示', LOW: '低风险', MODERATE: '中风险', HIGH: '高风险', CRITICAL: '极高风险' })[severity]
}

function medicationSafetyDecisionLabel(decision: MedicationSafetyDecision['decision']) {
  return ({ PASS: '通过', WARN: '警告', REQUIRE_OVERRIDE: '需说明理由', BLOCK: '阻断', UNAVAILABLE: '评价不可用' })[decision]
}

function needsMedicationSafetyAcknowledgement(value: MedicationSafetyDecision) {
  return value.decision !== 'PASS' || value.findings.length > 0 || value.failureCodes.length > 0
    || (value.mode !== 'SHADOW' && !value.evaluationId)
}

function medicationSafetyBlocksSubmission(value: MedicationSafetyDecision) {
  return value.mode !== 'SHADOW'
    && (value.decision === 'BLOCK' || value.decision === 'UNAVAILABLE' || !value.evaluationId)
}

function medicationSafetyNeedsReason(value: MedicationSafetyDecision) {
  return value.mode !== 'SHADOW' && value.decision === 'REQUIRE_OVERRIDE'
}

function medicationSafetyReviewKey(reviews: MedicationSafetyDecision[]) {
  // Evaluation/finding IDs and the formal rule-set label are regenerated on each check.
  // Compare clinical input and displayed results so a changed prescription must be reviewed again.
  return JSON.stringify(reviews.map(({ evaluationId, ruleSetVersion, findings, ...review }) => ({
    ...review, recorded: Boolean(evaluationId),
    findings: findings.map(({ findingId, ...finding }) => finding),
  })))
}

function prescriptionReviewTitle(categoryCode: string, index: number) {
  const prefix = categoryCode === 'HERBAL' ? '草' : categoryCode === 'CHINESE_PATENT' ? '成' : '西'
  return `${prefix}${index}`
}

function serviceReviewTitle(serviceType: ServiceRequest['serviceType'], index: number) {
  const prefix = serviceType === 'LABORATORY' ? '检' : serviceType === 'EXAMINATION' ? '查'
    : serviceType === 'TREATMENT' ? '治' : '处'
  return `${prefix}${index}`
}

function OrdersPanel({ encounter: savedEncounter, draftDiagnoses, onSaveClinicalDraft, allergies, api, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, editing, onBusyChange, aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange,
  aiSuggestionSurfaceRef, currentDepartmentName, onOpenPrintCenter: _onOpenPrintCenter }: {
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onTreatmentKeysChange?: (keys: string[]) => void
  aiSuggestionSurfaceRef?: (element: HTMLDivElement | null) => void
  encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi
  draftDiagnoses: DiagnosisInput[]
  onSaveClinicalDraft: () => Promise<boolean>
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  editing: boolean
  onBusyChange: (busy: boolean) => void
  currentDepartmentName?: string
  onOpenPrintCenter?: () => void
}) {
  const encounter: Encounter = { ...savedEncounter, diagnoses: draftDiagnoses }
  const queryClient = useQueryClient()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [documentKey, setDocumentKey] = useState<string | null>(null)
  const [documentDirty, setDocumentDirty] = useState(false)
  const [reviewDocumentInfos, setReviewDocumentInfos] = useState<Record<string, OrderDocumentInfo>>({})
  const documentReturnFocus = useRef<HTMLElement | null>(null)
  const openDocument = (key: string) => {
    setDocumentKey(key)
    setReviewOpen(true)
  }

  const [safetyReviews, setSafetyReviews] = useState<MedicationSafetyDecision[]>([])
  const [safetyReasons, setSafetyReasons] = useState<Record<string, string>>({})
  const [safetyReviewNotice, setSafetyReviewNotice] = useState('')
  const safetyPreviewKey = useRef('')
  useEffect(() => {
    if (!reviewOpen) {
      setSafetyReasons({})
      setSafetyReviewNotice('')
      setReviewDocumentInfos({})
      safetyPreviewKey.current = ''
    }
  }, [reviewOpen])
  const [ordersHovered, setOrdersHovered] = useState(false)
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null)
  const [printServiceRequest, setPrintServiceRequest] = useState<ServiceRequest | null>(null)
  const [batchPrintOpen, setBatchPrintOpen] = useState(false)
  useEffect(() => {
    setReviewOpen(false)
    setSafetyReviews([])
    setDocumentKey(null)
    setDocumentDirty(false)
    setReviewDocumentInfos({})
  }, [encounter.id])
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id], queryFn: () => api.encounters.prescriptions(encounter.id) })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
  const frequencies = useQuery({
    queryKey: ['outpatient-order-frequencies', encounter.organizationId, encounter.departmentId],
    queryFn: () => api.masterData.activeOrderFrequencies(
      encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
    staleTime: 5 * 60 * 1000,
  })
  const routes = useQuery({
    queryKey: ['outpatient-medication-routes'],
    queryFn: () => api.masterData.activeMedicationRoutes('OUTPATIENT'),
    staleTime: 5 * 60 * 1000,
  })
  const treatmentKeys = [
    ...medicationDrafts.map((item) => `MEDICATION:${item.request.catalogItemId}`),
    ...serviceDrafts.map((item) => `${item.serviceType}:${item.catalogItemId}`),
    ...(medications.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `MEDICATION:${item.catalogItemId}`),
    ...(services.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `${item.serviceType}:${item.catalogItemId}`),
  ].filter((key) => !key.endsWith(':undefined')).sort()
  const treatmentKeySignature = treatmentKeys.join('|')
  useEffect(() => onTreatmentKeysChange?.([...new Set(treatmentKeys)]), [onTreatmentKeysChange, treatmentKeySignature])
  const statement = useQuery({ queryKey: ['doctor-billing-statement', encounter.id],
    queryFn: () => api.billing.statement(encounter.id), retry: false })
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] }),
  ])
  const cancelService = useMutation({
    mutationFn: (value: import('../../shared/api/encountersApi').ServiceRequest) =>
      api.encounters.cancelServiceRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  const cancelMedication = useMutation({
    mutationFn: (value: MedicationRequest) =>
      api.encounters.cancelMedicationRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  const splitPreview = usePrescriptionSplitPreview({ api: api.encounters, encounter,
    items: medicationDrafts.map(draftToBatchItem), enabled: reviewOpen })
  const confirmPlan = useMutation({
    mutationFn: async ({ acknowledged }: { acknowledged: boolean }) => {
      splitPreview.requireReady()
      const defaultPrescriptionInfo = buildDefaultDocumentInfo(encounter, 'prescription')
      const defaultServiceInfo = buildDefaultDocumentInfo(encounter, 'service')
      const existingPrescriptionIds = new Set((prescriptions.data ?? []).map((value) => value.id))
      const existingServiceIds = new Set((services.data ?? []).map((value) => value.id))

      const clinicalDraftSaved = await onSaveClinicalDraft()
      if (!clinicalDraftSaved) throw new Error('本次草稿保存未完成，请处理保存提示后重新开立')

      const [latestPrescriptions, latestServices] = await Promise.all([
        api.encounters.prescriptions(encounter.id),
        api.encounters.serviceRequests(encounter.id),
      ])

      const draftPrescriptions = latestPrescriptions.filter((p) => p.status === 'DRAFT')
      const newPrescriptionIndexes = new Map(draftPrescriptions
        .filter((prescription) => !existingPrescriptionIds.has(prescription.id))
        .map((prescription, index) => [prescription.id, index]))
      for (const rx of draftPrescriptions) {
        const previewIndex = newPrescriptionIndexes.get(rx.id)
        const customInfo = reviewDocumentInfos[`prescription:${rx.id}`]
          || (previewIndex === undefined ? undefined : reviewDocumentInfos[`preview-plan-${previewIndex}`])
          || reviewDocumentInfos[rx.categoryCode]
        const targetInfo = customInfo || (rx.documentInfo?.diagnoses?.length ? rx.documentInfo : defaultPrescriptionInfo)
        if (targetInfo && JSON.stringify(targetInfo) !== JSON.stringify(rx.documentInfo)) {
          await api.encounters.updatePrescriptionDocumentInfo(encounter.id, rx.id, rx.revision, targetInfo)
        }
      }

      const activeServices = latestServices.filter((s) => s.status === 'ACTIVE' && s.documentInfoEditable !== false)
      for (let sIdx = 0; sIdx < activeServices.length; sIdx++) {
        const svc = activeServices[sIdx]
        const customInfo = reviewDocumentInfos[`service:${svc.id}`]
          || (!existingServiceIds.has(svc.id) ? reviewDocumentInfos[`draft-service:${svc.catalogItemId}`] : undefined)
        const targetInfo = customInfo || (svc.documentInfo?.diagnoses?.length ? svc.documentInfo : defaultServiceInfo)
        if (targetInfo && JSON.stringify(targetInfo) !== JSON.stringify(svc.documentInfo)) {
          await api.encounters.updateServiceDocumentInfo(encounter.id, svc.id, svc.revision, targetInfo)
        }
      }

      const latest = await api.encounters.prescriptions(encounter.id)
      const draftsToSubmit = latest.filter((value) => value.status === 'DRAFT'
        && value.medicationRequests.some((request) => request.status === 'DRAFT'))

      if (draftsToSubmit.length > 0) {
        const evaluations = await Promise.all(draftsToSubmit.map((value) =>
          api.encounters.evaluatePrescriptionSafety(encounter.id, value.id)))
        const reviews = evaluations.filter(needsMedicationSafetyAcknowledgement)
        if (reviews.length > 0 && (!acknowledged
          || medicationSafetyReviewKey(reviews) !== medicationSafetyReviewKey(safetyReviews))) {
          return { requiresAcknowledgement: true, reviews, changed: acknowledged }
        }
        if (reviews.some(medicationSafetyBlocksSubmission)) throw new Error('当前处方不能开立，请返回修改或补齐评价所需信息。')
        if (reviews.some((review) => medicationSafetyNeedsReason(review) && !safetyReasons[review.prescriptionId]?.trim())) {
          throw new Error('请填写每张处方的继续开立理由。')
        }
      }

      if (draftsToSubmit.length > 0) {
        const submitted = await Promise.all(draftsToSubmit.map((value) =>
          safetyReasons[value.id]?.trim()
            ? api.encounters.submitPrescription(encounter.id, value.id, value.revision, safetyReasons[value.id].trim())
            : api.encounters.submitPrescription(encounter.id, value.id, value.revision)))
        return { requiresAcknowledgement: false,
          reviews: submitted.flatMap((value) => value.safetyEvaluation ? [value.safetyEvaluation] : []) }
      }
      return { requiresAcknowledgement: false, reviews: [] }
    },
    onSuccess: async (result) => {
      if (result.requiresAcknowledgement) {
        setSafetyReviews(result.reviews)
        setSafetyReasons({})
        setSafetyReviewNotice(result.changed ? '处方或审查结果已变化，请重新核对本次提示并填写处理理由。' : '')
        await refresh()
        return
      }
      setSafetyReviews([])
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
  })

  const saveOnlyDocumentInfos = useMutation({
    mutationFn: async () => {
      const allDocs = orderDocuments(prescriptions.data ?? [], services.data ?? [])
      for (const doc of allDocs) {
        const customInfo = reviewDocumentInfos[doc.key]
        if (customInfo && JSON.stringify(customInfo) !== JSON.stringify(doc.value.documentInfo)) {
          if (doc.kind === 'prescription') {
            await api.encounters.updatePrescriptionDocumentInfo(encounter.id, doc.value.id, doc.value.revision, customInfo)
          } else {
            await api.encounters.updateServiceDocumentInfo(encounter.id, doc.value.id, doc.value.revision, customInfo)
          }
        }
      }
    },
    onSuccess: async () => {
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
  })

  const previewSafetyReview = useMutation({
    mutationFn: async (drafts: Prescription[]) => Promise.all(drafts.map((prescription) =>
      api.encounters.evaluatePrescriptionSafety(encounter.id, prescription.id))),
    onSuccess: (evaluations) => {
      setSafetyReviews(evaluations.filter(needsMedicationSafetyAcknowledgement))
      setSafetyReasons({})
      setSafetyReviewNotice('')
    },
  })

  const applyAllPrimaryDiagnosis = () => {
    const primary = getPrimaryDiagnosis(encounter)
    if (!primary) return
    const primaryLink = [{ code: primary.code, display: primary.display, primary: true }]
    setReviewDocumentInfos((curr) => {
      const next = { ...curr }
      const allDocs = orderDocuments(prescriptions.data ?? [], services.data ?? [])
      allDocs.forEach((doc) => {
        next[doc.key] = { ...(next[doc.key] || doc.value.documentInfo || buildDefaultDocumentInfo(encounter, doc.kind)), diagnoses: primaryLink }
      })
      ;splitPreview.plans.forEach((_, idx) => {
        next[`preview-plan-${idx}`] = { ...(next[`preview-plan-${idx}`] || buildDefaultDocumentInfo(encounter, 'prescription')), diagnoses: primaryLink }
      })
      serviceDrafts.forEach((service) => {
        const key = `draft-service:${service.catalogItemId}`
        next[key] = { ...(next[key] || buildDefaultDocumentInfo(encounter, 'service',
          service.clinicalDescription)), diagnoses: primaryLink }
      })
      return next
    })
  }
  useEffect(() => onBusyChange(confirmPlan.isPending || documentDirty), [confirmPlan.isPending, documentDirty, onBusyChange])
  const persistedDraftCount = (prescriptions.data ?? []).reduce((sum, value) => sum
    + (value.status === 'DRAFT' ? value.medicationRequests.filter((request) => request.status === 'DRAFT').length : 0), 0)
  const planCount = medicationDrafts.length + serviceDrafts.length + persistedDraftCount
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)
  const hasUnverifiedAllergyDraft = medicationDrafts.some((value) => value.request.allergyReviewConfirmed !== true)
  const error = prescriptions.error || services.error || medications.error
    || cancelService.error || cancelMedication.error
  const hasAnyOrders = orderCount + planCount > 0
  const safetyBlocked = safetyReviews.some(medicationSafetyBlocksSubmission)
  const safetyReasonMissing = safetyReviews.some((review) => medicationSafetyNeedsReason(review)
    && !safetyReasons[review.prescriptionId]?.trim())
  const documents = orderDocuments(prescriptions.data ?? [], services.data ?? [])
  const persistedServiceDocuments = documents.filter((document) => document.kind === 'service')
  const persistedDraftPrescriptions = (prescriptions.data ?? []).filter((prescription) => prescription.status === 'DRAFT'
    && prescription.medicationRequests.some((request) => request.status === 'DRAFT'))
  const persistedDraftSignature = persistedDraftPrescriptions
    .map((prescription) => `${prescription.id}:${prescription.revision}`).join('|')
  useEffect(() => {
    if (!reviewOpen || !persistedDraftSignature || safetyPreviewKey.current === persistedDraftSignature) return
    safetyPreviewKey.current = persistedDraftSignature
    previewSafetyReview.mutate(persistedDraftPrescriptions)
  }, [reviewOpen, persistedDraftSignature])
  const previewPrescriptionDocumentCount = splitPreview.plans.length
  const pendingPrescriptionDocumentCount = previewPrescriptionDocumentCount + persistedDraftPrescriptions.length
  const reviewDocumentCount = planCount === 0 ? documents.length
    : pendingPrescriptionDocumentCount + serviceDrafts.length + persistedServiceDocuments.length
  const reviewItemCount = planCount === 0
    ? documents.reduce((sum, document) => sum + document.items.length, 0)
    : medicationDrafts.length + persistedDraftCount + serviceDrafts.length
      + persistedServiceDocuments.reduce((sum, document) => sum + document.items.length, 0)
  const reviewTypeCounts = new Map<string, number>()
  const countPrescription = (category: string) => {
    const label = category === 'HERBAL' ? '中药' : category === 'CHINESE_PATENT' ? '中成药' : '西药'
    reviewTypeCounts.set(label, (reviewTypeCounts.get(label) ?? 0) + 1)
  }
  const countService = (type?: string) => {
    const label = type === 'LABORATORY' ? '检验' : type === 'EXAMINATION' ? '检查' : '治疗/处置'
    reviewTypeCounts.set(label, (reviewTypeCounts.get(label) ?? 0) + 1)
  }
  ;splitPreview.plans.forEach(plan => countPrescription(plan.categoryCode))
  persistedDraftPrescriptions.forEach(rx => countPrescription(rx.categoryCode))
  serviceDrafts.forEach(service => countService(service.serviceType))
  documents.filter(doc => doc.kind === 'service' || (planCount === 0 && doc.value.status !== 'DRAFT'))
    .forEach(doc => doc.kind === 'service' ? countService((doc.value as ServiceRequest).serviceType)
      : countPrescription((doc.value as Prescription).categoryCode))
  const reviewTypeSummary = [...reviewTypeCounts].map(([label, count]) => `${label} ${count}`).join(' · ')
  const documentRows = Object.fromEntries(documents.flatMap(doc => doc.items.map(item => [item.id, {
    key: doc.key, label: doc.shortLabel, selected: doc.key === documentKey,
  }])))
  const routeDisplay = (code?: string, fallback?: string) => fallback
    || routes.data?.find((route) => route.code === code)?.name || code || '—'
  const frequencyDisplay = (code?: string, fallback?: string) => fallback
    || frequencies.data?.find((frequency) => frequency.code === code)?.name || code || '—'

  const firstActivePrescription = (prescriptions.data ?? []).find(canPrintPrescription)
  const firstActiveService = (services.data ?? []).find((s) => s.status === 'ACTIVE')
  const hasActivePrintable = Boolean(firstActivePrescription || firstActiveService)

  return <Panel className={`doctor-orders-panel ${!hasAnyOrders ? 'is-empty' : ''} ${ordersHovered ? 'is-hovered' : ''}`}
    onFocusCapture={(event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.doctor-unified-orders')
        && event.target.matches('input, textarea, [contenteditable="true"]')) documentReturnFocus.current = event.target
    }}
    onMouseEnter={() => setOrdersHovered(true)}
    onMouseLeave={() => setOrdersHovered(false)}>
    <PanelHead title="医嘱和费用" meta={<>{orderCount} 项已开立
      {statement.data ? ` · ${money(statement.data.chargeAmount, statement.data.currencyCode)}` : ''}</>}
      actions={<div className="doctor-order-head-actions">
        {hasActivePrintable && (
          <Button
            size="sm"
            variant="secondary"
            title="一键批量受控打印本次就诊已生效处方与单据"
            onClick={() => setBatchPrintOpen(true)}
          >
            <Icon name="print" />批量打印
          </Button>
        )}
        {editing && <>
          <StatusBadge tone={planCount ? 'warning' : 'neutral'}>{planCount} 项待确认</StatusBadge>
          <Button size="sm" disabled={planCount === 0 || documentDirty} onClick={() => setReviewOpen(true)}>审核开立</Button>
        </>}
      </div>} />
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <OrderDocumentSummary
      documents={documents}
      selectedKey={documentKey}
      onSelect={openDocument}
    />
    <div className="doctor-orders-content">
      {prescriptions.isPending || services.isPending || medications.isPending ? <LoadingState />
        : <UnifiedOrderListEditor aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
          onAiOrdersPrepared={() => { if (!documentDirty) setReviewOpen(true) }}
          documentRows={documentRows} onOpenDocument={openDocument} documentEditing={documentDirty}
          documents={documents} selectedDocumentKey={documentKey} onSelectDocument={setDocumentKey}
          onSavedDocument={refresh}
          aiSuggestionSurfaceRef={aiSuggestionSurfaceRef} encounter={encounter} allergies={allergies}
          prescriptions={prescriptions.data ?? []} medications={medications.data ?? []} services={services.data ?? []}
          medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
          serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} api={api}
          readOnly={!editing}
          currentDepartmentName={currentDepartmentName}
          busy={cancelService.isPending || cancelMedication.isPending || confirmPlan.isPending}
          onCancelMedication={(item) => cancelMedication.mutate(item)}
          onCancelService={(item) => cancelService.mutate(item)}
          onPrint={setPrintPrescription} onPrintService={setPrintServiceRequest} />}
    </div>
    {reviewOpen && <Dialog title="医嘱开立核查" size="xwide" closeOnBackdrop={false}
      onClose={() => { if (!confirmPlan.isPending && !saveOnlyDocumentInfos.isPending) { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) } }}
      footer={<>
        <Button variant="secondary" disabled={confirmPlan.isPending || saveOnlyDocumentInfos.isPending}
          onClick={() => { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) }}>
          {planCount > 0 ? '返回修改' : '关闭'}
        </Button>
        {planCount > 0 ? (
          <Button busy={confirmPlan.isPending} disabled={previewSafetyReview.isPending
            || !splitPreview.ready || safetyBlocked || safetyReasonMissing
            || (planCount === 0 && safetyReviews.length === 0)}
            onClick={() => confirmPlan.mutate({ acknowledged: safetyReviews.length > 0 })}>
            {safetyBlocked ? '当前处方不可开立' : safetyReviews.length > 0 ? '已知晓风险，继续开立' : '确认分单并开立'}
          </Button>
        ) : (
          <Button busy={saveOnlyDocumentInfos.isPending} disabled={saveOnlyDocumentInfos.isPending || Object.keys(reviewDocumentInfos).length === 0}
            onClick={() => saveOnlyDocumentInfos.mutate()}>
            保存分单属性
          </Button>
        )}
      </>}>
      <div className="doctor-split-review-container">
        {hasUnverifiedAllergyDraft && <Alert tone="warning">
          患者药物过敏信息尚未核验；本次提交是否允许继续由机构的过敏核验参数控制，请尽快补充核验记录。
        </Alert>}
        {confirmPlan.error && <Alert>{errorMessage(confirmPlan.error)}</Alert>}
        {saveOnlyDocumentInfos.error && <Alert>{errorMessage(saveOnlyDocumentInfos.error)}</Alert>}
        {previewSafetyReview.error && <Alert>{errorMessage(previewSafetyReview.error)}</Alert>}
        {previewSafetyReview.isPending && <p className="doctor-safety-review-loading" role="status">
          正在进行合理用药审查…
        </p>}

        {safetyReviews.length > 0 && <section className="doctor-medication-safety-review" aria-label="合理用药审查">
          <header>
            <div>
              <strong>合理用药审查</strong>
              <span>发现 {safetyReviews.reduce((sum, value) => sum + value.findings.length, 0)} 项用药风险</span>
            </div>
            <StatusBadge tone={safetyBlocked ? 'danger' : 'warning'}>
              {safetyReviews.every((review) => review.mode === 'SHADOW')
                ? '旁路监控，仅提示不阻断' : '正式审查，按规则要求处理'}
            </StatusBadge>
          </header>
          {safetyReviewNotice && <Alert tone="warning">{safetyReviewNotice}</Alert>}
          {safetyBlocked && <Alert>存在阻断或无法完成的正式审查，请返回修改处方或补齐信息后重新检查。</Alert>}
          <div className="doctor-medication-safety-review__grid">
            {safetyReviews.flatMap((review, reviewIndex) => review.findings.map((finding, findingIndex) => (
              <article key={`${review.evaluationId ?? review.prescriptionId}-${finding.findingId}-${reviewIndex}-${findingIndex}`}
                className={`is-${finding.severity.toLowerCase()}`}>
                <div className="doctor-medication-safety-review__finding-head">
                  <StatusBadge tone={finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'danger' : 'warning'}>
                    {medicationSafetySeverityLabel(finding.severity)} · {medicationSafetyDecisionLabel(finding.decision)}
                  </StatusBadge>
                  <span>{medicationSafetyRuleNames[finding.ruleCode]
                    ?? ({ DUPLICATE_THERAPY: '重复用药核对', DRUG_INTERACTION: '相互作用核对' } as Record<string, string>)[finding.category]
                    ?? '用药规则核对'}</span>
                  <span>{prescriptions.data?.find((value) => value.id === review.prescriptionId)?.prescriptionNo ?? review.prescriptionId}
                    {' · '}{review.mode === 'SHADOW' ? '旁路提示' : '正式审查'}</span>
                </div>
                <p><strong>涉及药品：</strong>{finding.medicationRequestIds.map((id) => {
                  const request = medications.data?.find((value) => value.id === id)
                    ?? prescriptions.data?.flatMap((value) => value.medicationRequests).find((value) => value.id === id)
                  return typeof request?.medicationSnapshot.name === 'string' ? request.medicationSnapshot.name : `药品明细 ${id}`
                }).join('、') || '请核对本张处方'}</p>
                <p>{finding.message}</p>
                {finding.suggestedAction && <small><strong>建议：</strong>{finding.suggestedAction}</small>}
                {finding.evidence.length > 0 && <details>
                  <summary>查看规则依据</summary>
                  {finding.evidence.map((evidence, index) => <div key={index}>
                    <small>{[evidence.sourceTitle, evidence.sourceVersion, evidence.section, evidence.sourceLocator].filter(Boolean).join(' · ')}</small>
                    <p>{evidence.excerpt}</p>
                    {evidence.usageScope && <small>适用范围：{evidence.usageScope}</small>}
                  </div>)}
                </details>}
              </article>
            )))}
            {safetyReviews.some((review) => review.failureCodes.length > 0) && <article className="is-unavailable">
              <div className="doctor-medication-safety-review__finding-head">
                <StatusBadge tone="warning">评价不完整</StatusBadge>
                <span>部分规则未能完成评价，请人工核对</span>
              </div>
              <p>{[...new Set(safetyReviews.flatMap((review) => review.failureCodes))].join('、')}</p>
            </article>}
          </div>
          {safetyReviews.filter((review) => review.mode !== 'SHADOW' && !medicationSafetyBlocksSubmission(review))
            .map((review) => <FormField key={review.prescriptionId}
              label={`${prescriptions.data?.find((value) => value.id === review.prescriptionId)?.prescriptionNo ?? review.prescriptionId} 继续开立理由${medicationSafetyNeedsReason(review) ? '（必填）' : '（选填）'}`}>
              <textarea aria-label={`${review.prescriptionId} 继续开立理由`} maxLength={1000}
                disabled={confirmPlan.isPending} value={safetyReasons[review.prescriptionId] ?? ''}
                placeholder="请说明已核对的风险及继续用药的临床理由"
                onChange={(event) => setSafetyReasons((current) => ({ ...current, [review.prescriptionId]: event.target.value }))} />
            </FormField>)}
        </section>}

        <div className="doctor-split-overview-bar">
          <div className="doctor-split-overview-summary">
            <strong>{splitPreview.ready ? `${reviewDocumentCount} 张单据` : '单据数量待确认'}</strong>
            <span>{reviewItemCount} 项医嘱</span>
            <span aria-label="单据分类统计">{splitPreview.ready ? reviewTypeSummary : '药品分方待确认'}</span>
          </div>
          {encounter.diagnoses.length > 0 && (
            <div className="doctor-split-overview-actions">
              <Button size="sm" variant="secondary" onClick={applyAllPrimaryDiagnosis}>
                全部关联主诊断
              </Button>
            </div>
          )}
        </div>

        {medicationDrafts.length > 0 && splitPreview.isFetching && <LoadingState label="正在核对药品分方…" />}
        {medicationDrafts.length > 0 && splitPreview.isError && <div role="alert" className="doctor-unified-order-alert">
          分方预览失败：{errorMessage(splitPreview.error)}
          <Button variant="secondary" disabled={splitPreview.isFetching} onClick={() => void splitPreview.refetch()}>重新核对分方</Button>
        </div>}

        <OrderDocumentReviewList>
          {/* 1. 待开立药品的自动分方预览卡片 */}
          {splitPreview.plans.map((plan, pIdx) => {
            const cardKey = `preview-plan-${pIdx}`
            const kind = plan.categoryCode === 'HERBAL' ? 'herbal'
              : plan.categoryCode === 'CHINESE_PATENT' ? 'patent' : 'western'
            const categoryIndex = splitPreview.plans.slice(0, pIdx + 1)
              .filter((candidate) => candidate.categoryCode === plan.categoryCode).length
            const currentInfo = reviewDocumentInfos[cardKey] || buildDefaultDocumentInfo(encounter, 'prescription')
            const items = plan.items.map((pi, iIdx) => {
              const matchDraft = matchSplitPreviewDraft(medicationDrafts, pi.item)
              return {
                id: iIdx,
                name: matchDraft?.medicationName || '未匹配药品，请返回核对',
                spec: matchDraft?.productSpec || matchDraft?.preparationSpec || '',
                manufacturer: matchDraft?.manufacturerName,
                doseText: pi.item.doseValue ? `${pi.item.doseValue} ${pi.item.doseUnit || ''}` : '—',
                routeAndFreqText: [routeDisplay(pi.item.routeCode, matchDraft?.routeName),
                  frequencyDisplay(pi.item.frequencyCode),
                  pi.item.durationValue ? `${pi.item.durationValue}${pi.item.durationUnit || '单位待确认'}` : ''].filter(Boolean).join(' · '),
                instruction: matchDraft?.request.medicationInstruction,
                quantityText: `${pi.item.quantity} ${pi.item.quantityUnit || '单位待确认'}`,
                isInfusionGroup: Boolean(pi.groupKey),
                isGroupLeader: pi.groupLeader,
              }
            })
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={prescriptionReviewTitle(plan.categoryCode, categoryIndex)}
                kind={kind}
                deptOrSite={summarizeExecutingDepartments(plan.items.map(({ item }) => ({
                  kind: 'medication', stockSiteName: item.stockSiteName, selfProvided: item.selfProvided,
                })))}
                ruleReasons={plan.ruleReasons}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                encounter={encounter}
              />
            )
          })}

          {/* 2. 待开立的检查、检验和处置单据 */}
          {serviceDrafts.map((service, serviceIndex) => {
            const cardKey = `draft-service:${service.catalogItemId}`
            const serviceType: ServiceRequest['serviceType'] = service.serviceType === 'LABORATORY'
              || service.serviceType === 'EXAMINATION' || service.serviceType === 'TREATMENT'
              ? service.serviceType : 'OTHER'
            const kind = serviceType === 'LABORATORY' ? 'lab'
              : serviceType === 'EXAMINATION' ? 'exam' : 'treatment'
            const sameTypeIndex = serviceDrafts.slice(0, serviceIndex + 1)
              .filter((item) => (item.serviceType || 'OTHER') === serviceType).length
            const currentInfo = reviewDocumentInfos[cardKey]
              || buildDefaultDocumentInfo(encounter, 'service', service.clinicalDescription)
            const items = [{
              id: service.id,
              name: service.itemName,
              quantityText: `${service.quantity} ${service.unitCode || '项'}`,
              note: service.clinicalDescription,
            }]
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={serviceReviewTitle(serviceType, sameTypeIndex)}
                kind={kind}
                deptOrSite={resolveExecutingDepartment({ kind: 'service', performerDepartmentId: service.performerDepartmentId,
                  performerDepartmentName: service.performerDepartmentName })}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                encounter={encounter}
              />
            )
          })}

          {/* 3. 此前已保存、仍待提交的处方草稿 */}
          {persistedDraftPrescriptions
            .map((rx, rxIdx) => {
              const cardKey = `prescription:${rx.id}`
              const kind = rx.categoryCode === 'CHINESE_PATENT' ? 'patent'
                : rx.categoryCode === 'HERBAL' ? 'herbal' : 'western'
              const categoryIndex = splitPreview.plans.filter(plan => plan.categoryCode === rx.categoryCode).length
                + persistedDraftPrescriptions.slice(0, rxIdx + 1)
                  .filter((candidate) => candidate.categoryCode === rx.categoryCode).length
              const currentInfo = reviewDocumentInfos[cardKey]
                || (rx.documentInfo?.diagnoses?.length ? rx.documentInfo : buildDefaultDocumentInfo(encounter, 'prescription'))
              const items = rx.medicationRequests.filter((m) => m.status !== 'CANCELLED').map((m) => ({
                id: m.id,
                name: m.itemName || m.medicationName,
                spec: m.packageSpec || m.preparationSpec,
                manufacturer: m.manufacturerName,
                doseText: m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : '—',
                routeAndFreqText: [routeDisplay(m.routeCode, m.routeName),
                  frequencyDisplay(m.frequencyCode, m.frequencyName),
                  m.durationValue ? `${m.durationValue}${m.durationUnit || '天'}` : ''].filter(Boolean).join(' · '),
                instruction: m.medicationInstruction,
                quantityText: `${m.quantity} ${m.quantityUnit || '盒'}`,
              }))
              return (
                <OrderDocumentReviewCard
                  key={cardKey}
                  cardKey={cardKey}
                  title={prescriptionReviewTitle(rx.categoryCode, categoryIndex)}
                  kind={kind}
                  deptOrSite={resolveExecutingDepartment({ kind: 'medication' })}
                  items={items}
                  info={currentInfo}
                  onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                  encounter={encounter}
                />
              )
            })}

          {/* 4. 服务申请创建后即为 ACTIVE；无待开立医嘱时也展示已提交处方供整单核查。 */}
          {documents.filter((document) => document.kind === 'service'
            || (planCount === 0 && document.value.status !== 'DRAFT')).map((doc) => {
            const cardKey = doc.key
            const isPrescription = doc.kind === 'prescription'
            const rx = isPrescription ? (doc.value as Prescription) : undefined
            const svc = !isPrescription ? (doc.value as ServiceRequest) : undefined
            const kind = isPrescription
              ? (rx?.categoryCode === 'CHINESE_PATENT' ? 'patent' : rx?.categoryCode === 'HERBAL' ? 'herbal' : 'western')
              : (svc?.serviceType === 'LABORATORY' ? 'lab' : svc?.serviceType === 'EXAMINATION' ? 'exam' : 'treatment')
            const currentInfo = reviewDocumentInfos[cardKey]
              || (doc.value.documentInfo?.diagnoses?.length
                ? doc.value.documentInfo
                : buildDefaultDocumentInfo(encounter, isPrescription ? 'prescription' : 'service'))
            const items = isPrescription && rx
              ? rx.medicationRequests.filter((m) => m.status !== 'CANCELLED').map((m) => ({
                  id: m.id,
                  name: m.itemName || m.medicationName,
                  spec: m.packageSpec || m.preparationSpec,
                  manufacturer: m.manufacturerName,
                  doseText: m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : '—',
                  routeAndFreqText: [routeDisplay(m.routeCode, m.routeName),
                    frequencyDisplay(m.frequencyCode, m.frequencyName),
                    m.durationValue ? `${m.durationValue}${m.durationUnit || '天'}` : ''].filter(Boolean).join(' · '),
                  instruction: m.medicationInstruction,
                  quantityText: `${m.quantity} ${m.quantityUnit || '盒'}`,
                }))
              : svc
              ? [{
                  id: svc.id,
                  name: svc.itemName,
                  quantityText: `${svc.quantity} ${svc.unitCode || '项'}`,
                  note: [svc.specimenType, svc.clinicalDescription].filter(Boolean).join(' · '),
                }]
              : []
            const readOnly = isPrescription ? rx?.status !== 'DRAFT' : svc?.documentInfoEditable === false
            const draftTypeCount = svc ? serviceDrafts.filter(service => (service.serviceType || 'OTHER') === svc.serviceType).length : 0
            const typeIndex = draftTypeCount + documents.slice(0, documents.indexOf(doc) + 1).filter((candidate) => isPrescription && rx
              ? candidate.kind === 'prescription' && (candidate.value as Prescription).categoryCode === rx.categoryCode
              : candidate.kind === 'service' && (candidate.value as ServiceRequest).serviceType === svc?.serviceType).length
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={isPrescription && rx ? prescriptionReviewTitle(rx.categoryCode, typeIndex)
                  : svc ? serviceReviewTitle(svc.serviceType, typeIndex) : doc.shortLabel}
                kind={kind}
                deptOrSite={resolveExecutingDepartment(isPrescription ? { kind: 'medication' }
                  : { kind: 'service', performerDepartmentId: svc?.performerDepartmentId })}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                encounter={encounter}
                readOnly={readOnly}
              />
            )
          })}
        </OrderDocumentReviewList>
      </div>
    </Dialog>}
    {printPrescription && <ControlledPrintDialog api={api} title="打印门诊处方"
      description="仅生效处方可以生成正式 PDF；每次生成和重打都会留痕。"
      sourceLabel={`${prescriptionCategoryLabel(printPrescription.categoryCode)} · ${printPrescription.prescriptionNo}`}
      generate={(purpose, copies) => api.printing.prescription(
        encounter.id, printPrescription.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setPrintPrescription(null)} />}
    {printServiceRequest && <ControlledPrintDialog api={api}
      title={`打印${serviceApplicationLabel(printServiceRequest.serviceType)}申请单`}
      description="仅生效且未撤销的申请可以生成正式 PDF；每次生成和重打都会留痕。"
      sourceLabel={`${printServiceRequest.itemName} · ${printServiceRequest.requestNo}`}
      generate={(purpose, copies) => api.printing.serviceRequest(
        encounter.id, printServiceRequest.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setPrintServiceRequest(null)} />}
    {batchPrintOpen && (
      <BatchPrintDialog
        encounter={encounter}
        api={api}
        onClose={() => setBatchPrintOpen(false)}
        onPrinted={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      />
    )}
  </Panel>
}

const printPurposeOptions: Array<{ value: PrintPurpose; label: string }> = [
  { value: 'PATIENT_COPY', label: '患者副本' },
  { value: 'CLINICAL_USE', label: '临床使用' },
  { value: 'ARCHIVE_COPY', label: '归档副本' },
]

export function printPurposeLabel(value: PrintPurpose) {
  return printPurposeOptions.find((item) => item.value === value)?.label ?? value
}

export function prescriptionCategoryLabel(value: string) {
  return ({ WESTERN: '西药处方', CHINESE_PATENT: '中成药处方', HERBAL: '草药处方' } as Record<string, string>)[value]
    ?? '门诊处方'
}

function serviceApplicationLabel(value: ServiceRequest['serviceType']) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as const)[value]
}

function ControlledPrintDialog({ api, title, description, sourceLabel, generate, onGenerated, onClose }: {
  api: RhnApi
  title: string
  description: string
  sourceLabel: string
  generate: (purpose: PrintPurpose, copies: number) => Promise<PrintReceipt>
  onGenerated?: () => void
  onClose: () => void
}) {
  const [purpose, setPurpose] = useState<PrintPurpose>('PATIENT_COPY')
  const [copies, setCopies] = useState(1)
  const [receipt, setReceipt] = useState<PrintReceipt | null>(null)
  const [feedbackError, setFeedbackError] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const triggerDirectPrint = async (value: PrintReceipt) => {
    if (value.delivery?.channel === 'LOCAL_BRIDGE') return
    if (!value.downloadUrl) return
    try {
      setIsPrinting(true)
      setFeedbackError('')
      await api.printing.printPdf(value.downloadUrl)
    } catch (err) {
      setFeedbackError(`已生成受控文件，但调起系统打印机失败：${errorMessage(err)}。您可尝试手动点击【调起打印机】或【下载 PDF】。`)
    } finally {
      setIsPrinting(false)
    }
  }

  const triggerDownload = async (value: PrintReceipt) => {
    if (value.delivery?.channel === 'LOCAL_BRIDGE') return
    try {
      setIsDownloading(true)
      setFeedbackError('')
      await api.printing.download(value)
    } catch (err) {
      setFeedbackError(`文件已生成，但下载失败：${errorMessage(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const createJob = useMutation({
    mutationFn: () => generate(purpose, copies),
    onSuccess: async (value) => {
      setReceipt(value)
      onGenerated?.()
      await triggerDirectPrint(value)
    },
  })
  const reprintJob = useMutation({
    mutationFn: () => api.printing.reprint(receipt!.jobId, copies),
    onSuccess: async (value) => {
      setReceipt(value)
      onGenerated?.()
      await triggerDirectPrint(value)
    },
  })
  const busy = createJob.isPending || reprintJob.isPending
  const error = createJob.error || reprintJob.error

  return <Dialog title={title} eyebrow="受控打印" description={description} closeOnBackdrop={false}
    onClose={() => !busy && onClose()} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {receipt ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {receipt.delivery?.channel !== 'LOCAL_BRIDGE' && (
            <>
              <Button variant="secondary" busy={isDownloading} onClick={() => void triggerDownload(receipt)}>
                <Icon name="download" />下载 PDF
              </Button>
              <Button variant="primary" busy={isPrinting} onClick={() => void triggerDirectPrint(receipt)}>
                <Icon name="print" />调起打印机
              </Button>
            </>
          )}
          <Button variant="text" busy={reprintJob.isPending} onClick={() => reprintJob.mutate()}>
            登记重打
          </Button>
        </div>
      ) : (
        <Button variant="primary" busy={createJob.isPending} onClick={() => createJob.mutate()}>
          <Icon name="print" />受控生成并打印
        </Button>
      )}
    </>}>
    <div className="print-confirmation doctor-print-confirmation">
      {(error || feedbackError) && <Alert>{feedbackError || errorMessage(error)}</Alert>}
      <dl>
        <div><dt>打印对象</dt><dd>{sourceLabel}</dd></div>
        <div><dt>打印规则</dt><dd>正式 PDF · 完整性摘要 · 操作留痕</dd></div>
      </dl>
      <div className="ui-form-grid doctor-print-options">
        <FormField label="打印用途"><select value={purpose} disabled={busy || Boolean(receipt)}
          onChange={(event) => setPurpose(event.target.value as PrintPurpose)}>
          {printPurposeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></FormField>
        <FormField label="份数"><input type="number" min="1" max="10" value={copies} disabled={busy}
          onChange={(event) => setCopies(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></FormField>
      </div>
      {receipt && <section className="doctor-print-receipt" aria-label="打印生成结果">
        <header><StatusBadge tone="success">{receipt.delivery?.channel === 'LOCAL_BRIDGE' ? '已进入打印队列'
          : receipt.requestType === 'REPRINT' ? '重打已登记' : '文件已生成'}</StatusBadge>
          <strong>{receipt.fileName}</strong></header>
        <dl>
          <div><dt>用途与份数</dt><dd>{printPurposeLabel(purpose)} · {receipt.copies} 份</dd></div>
          <div><dt>模板版本</dt><dd>{receipt.templateCode} · V{receipt.templateVersion}</dd></div>
          <div className="doctor-print-digest"><dt>SHA-256</dt><dd><code>{receipt.contentDigest}</code></dd></div>
          <div><dt>任务编号</dt><dd>{receipt.jobId}</dd></div>
          <div><dt>目标设备</dt><dd>{receipt.delivery?.deviceName} · {receipt.delivery?.channel === 'LOCAL_BRIDGE' ? '已入队' : '已就绪'}</dd></div>
        </dl>
        <p>{receipt.delivery?.channel === 'LOCAL_BRIDGE'
          ? '本地打印桥将领取任务并回传设备结果；当前入队不代表已经出纸。'
          : '系统已尝试调起打印机预览；若未弹出，可点击下方【调起打印机】或【下载 PDF】。'}</p>
      </section>}
    </div>
  </Dialog>
}

function HistoricalReprintDialog({ api, record, title, onReprinted, onClose }: {
  api: RhnApi; record: PrintRecord; title?: string; onReprinted: () => void; onClose: () => void
}) {
  const [copies, setCopies] = useState(1)
  const [receipt, setReceipt] = useState<PrintReceipt | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const sourceJob = record.jobs[0]
  const dialogTitle = title || (record.sourceType === 'Prescription' ? '补打门诊处方'
    : record.sourceType === 'ServiceRequest' ? '补打门诊申请单' : '补打门诊病历')

  const triggerDirectPrint = async (downloadUrl?: string | null) => {
    if (!downloadUrl) return
    try {
      setIsPrinting(true)
      setDownloadError('')
      await api.printing.printPdf(downloadUrl)
    } catch (err) {
      setDownloadError(`已登记补打，但调起系统打印机失败：${errorMessage(err)}`)
    } finally {
      setIsPrinting(false)
    }
  }

  const triggerDownload = async (file: { downloadUrl: string; fileName: string }) => {
    try {
      setIsDownloading(true)
      setDownloadError('')
      await api.printing.download(file)
    } catch (err) {
      setDownloadError(`补打已登记，但文件下载失败：${errorMessage(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const reprint = useMutation({
    mutationFn: () => {
      if (!sourceJob) throw new Error('当前正式输出缺少原始打印任务，无法登记补打')
      return api.printing.reprint(sourceJob.jobId, copies)
    },
    onSuccess: async (value) => {
      setReceipt(value)
      onReprinted()
      if (value.delivery?.channel === 'LOCAL_BRIDGE') return
      await triggerDirectPrint(value.downloadUrl)
    },
  })
  return <Dialog title={dialogTitle} eyebrow="受控打印 · 复用不可变输出"
    description="补打不会重新渲染病历，将复用原 PDF 并新增一条打印任务留痕。" closeOnBackdrop={false}
    onClose={() => !reprint.isPending && onClose()} footer={<>
      <Button variant="secondary" disabled={reprint.isPending} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {receipt ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="secondary" busy={isDownloading} onClick={() => void triggerDownload(receipt)}>
            <Icon name="download" />下载 PDF
          </Button>
          <Button variant="primary" busy={isPrinting} onClick={() => void triggerDirectPrint(receipt.downloadUrl)}>
            <Icon name="print" />调起打印机
          </Button>
        </div>
      ) : (
        <Button busy={reprint.isPending} disabled={!sourceJob} onClick={() => reprint.mutate()}>
          <Icon name="print" />登记补打并打印
        </Button>
      )}
    </>}>
    <div className="print-confirmation doctor-print-confirmation">
      {(reprint.error || downloadError) && <Alert>{downloadError || errorMessage(reprint.error)}</Alert>}
      <dl>
        <div><dt>正式输出</dt><dd>{record.fileName}</dd></div>
        <div><dt>文书版本</dt><dd>V{record.sourceVersion} · {printPurposeLabel(record.purpose)}</dd></div>
        <div><dt>模板版本</dt><dd>{record.templateCode} · V{record.templateVersion}</dd></div>
        <div><dt>既往任务</dt><dd>{record.jobs.length} 次</dd></div>
      </dl>
      <FormField label="补打份数"><input type="number" min="1" max="10" value={copies}
        disabled={reprint.isPending || Boolean(receipt)}
        onChange={(event) => setCopies(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></FormField>
      <p className="doctor-history-document-digest"><span>{record.contentDigestAlgorithm}</span>
        <code>{record.contentDigest}</code></p>
      {receipt && <Alert>补打任务 {receipt.jobId} 已登记，共 {receipt.copies} 份；
        {receipt.delivery?.channel === 'LOCAL_BRIDGE' ? `已进入 ${receipt.delivery.deviceName} 队列。` : '已发起打印/下载流程。'}
        输出摘要保持不变。</Alert>}
    </div>
  </Dialog>
}


function money(value: number, currencyCode = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currencyCode,
    minimumFractionDigits: 2 }).format(value)
}

interface BatchPrintItem {
  id: string
  kind: 'clinicalDocument' | 'prescription' | 'serviceRequest'
  title: string
  meta: string
  isReady: boolean
  raw: ClinicalDocument | Prescription | ServiceRequest
}

export function BatchPrintDialog({
  encounter,
  api,
  onClose,
  onPrinted,
}: {
  encounter: Encounter
  api: RhnApi
  onClose: () => void
  onPrinted?: () => void
}) {
  const [purpose, setPurpose] = useState<PrintPurpose>('PATIENT_COPY')
  const [copies, setCopies] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [results, setResults] = useState<Array<{ item: BatchPrintItem; receipt?: PrintReceipt; error?: string }>>([])
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false)

  const documents = useQuery({
    queryKey: ['doctor-document', encounter.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter.id),
  })
  const prescriptions = useQuery({
    queryKey: ['doctor-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id),
  })
  const services = useQuery({
    queryKey: ['doctor-services', encounter.id],
    queryFn: () => api.encounters.serviceRequests(encounter.id),
  })

  const note = documents.data?.find((d) => d.documentType === 'OUTPATIENT_NOTE')
  const noteSigned = note?.status === 'SIGNED'

  const items: BatchPrintItem[] = useMemo(() => {
    const list: BatchPrintItem[] = []
    if (note) {
      list.push({
        id: `note-${note.id}`,
        kind: 'clinicalDocument',
        title: '门诊病历',
        meta: noteSigned ? `已签署 · V${note.currentVersion}` : `草稿 V${note.currentVersion}（需先签署）`,
        isReady: Boolean(noteSigned),
        raw: note,
      })
    }
    for (const rx of prescriptions.data ?? []) {
      const activeCount = rx.medicationRequests.filter((m) => m.status === 'ACTIVE').length
      list.push({
        id: `rx-${rx.id}`,
        kind: 'prescription',
        title: `${prescriptionCategoryLabel(rx.categoryCode)} (${rx.prescriptionNo})`,
        meta: rx.status === 'ACTIVE' ? `${activeCount} 项药品 · 已生效` : `${rx.medicationRequests.length} 项药品 · 待审核开立`,
        isReady: rx.status === 'ACTIVE',
        raw: rx,
      })
    }
    for (const svc of services.data ?? []) {
      list.push({
        id: `svc-${svc.id}`,
        kind: 'serviceRequest',
        title: `${serviceApplicationLabel(svc.serviceType)}申请单 · ${svc.itemName}`,
        meta: `${svc.requestNo} · ${svc.status === 'ACTIVE' ? '已生效' : svc.status}`,
        isReady: svc.status === 'ACTIVE',
        raw: svc,
      })
    }
    return list
  }, [note, noteSigned, prescriptions.data, services.data])

  useEffect(() => {
    if (!hasInitializedSelection && (documents.isSuccess || prescriptions.isSuccess || services.isSuccess)) {
      const readyIds = items.filter((item) => item.isReady).map((item) => item.id)
      if (readyIds.length > 0) {
        setSelectedIds(readyIds)
        setHasInitializedSelection(true)
      }
    }
  }, [hasInitializedSelection, documents.isSuccess, prescriptions.isSuccess, services.isSuccess, items])

  const readyItems = items.filter((item) => item.isReady)
  const allReadySelected = readyItems.length > 0 && readyItems.every((item) => selectedIds.includes(item.id))

  const toggleSelectAll = () => {
    if (allReadySelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(readyItems.map((item) => item.id))
    }
  }

  const toggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleBatchPrint = async () => {
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.isReady)
    if (selectedItems.length === 0) return

    setIsExecuting(true)
    setFeedbackError('')
    const batchResults: Array<{ item: BatchPrintItem; receipt?: PrintReceipt; error?: string }> = []

    for (const item of selectedItems) {
      try {
        let receipt: PrintReceipt
        if (item.kind === 'clinicalDocument') {
          receipt = await api.printing.clinicalDocument((item.raw as ClinicalDocument).id, purpose, copies)
        } else if (item.kind === 'prescription') {
          receipt = await api.printing.prescription(encounter.id, (item.raw as Prescription).id, purpose, copies)
        } else {
          receipt = await api.printing.serviceRequest(encounter.id, (item.raw as ServiceRequest).id, purpose, copies)
        }
        batchResults.push({ item, receipt })

        if (receipt.delivery?.channel !== 'LOCAL_BRIDGE' && receipt.downloadUrl) {
          try {
            await api.printing.printPdf(receipt.downloadUrl)
          } catch (e) {
            console.warn('Direct print warning for', item.title, e)
          }
        }
      } catch (err) {
        batchResults.push({ item, error: errorMessage(err) })
      }
    }

    setResults(batchResults)
    setIsExecuting(false)
    onPrinted?.()
  }

  const selectedCount = selectedIds.filter((id) => readyItems.some((item) => item.id === id)).length
  const busy = isExecuting || documents.isPending || prescriptions.isPending || services.isPending

  return (
    <Dialog
      title="批量受控打印"
      eyebrow="一键批量出纸"
      description="集中批量生成并受控打印本次就诊已签署病历、已生效处方及检查检验申请单。"
      size="wide"
      closeOnBackdrop={false}
      onClose={() => !isExecuting && onClose()}
      footer={
        <>
          <Button variant="secondary" disabled={isExecuting} onClick={onClose}>
            {results.length > 0 ? '完成' : '取消'}
          </Button>
          {results.length === 0 && (
            <Button
              variant="primary"
              busy={isExecuting}
              disabled={selectedCount === 0 || busy}
              onClick={() => void handleBatchPrint()}
            >
              <Icon name="print" />
              一键批量打印 ({selectedCount} 项)
            </Button>
          )}
        </>
      }
    >
      <div className="doctor-batch-print-dialog">
        {feedbackError && <Alert>{feedbackError}</Alert>}

        {results.length === 0 ? (
          <>
            <div className="doctor-batch-print-toolbar">
              <div className="doctor-batch-select-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={readyItems.length === 0 || busy}
                  onClick={toggleSelectAll}
                >
                  {allReadySelected ? '取消全选' : '全选就绪项'}
                </Button>
                <span className="doctor-batch-count-hint">
                  已选 <strong>{selectedCount}</strong> / {readyItems.length} 项可打印单据
                </span>
              </div>
              <div className="doctor-batch-options">
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-purpose">用途：</label>
                  <Select
                    id="batch-print-purpose"
                    value={purpose}
                    disabled={busy}
                    onChange={(val) => setPurpose(val as PrintPurpose)}
                    options={printPurposeOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />
                </div>
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-copies">份数：</label>
                  <input
                    id="batch-print-copies"
                    type="number"
                    min={1}
                    max={5}
                    value={copies}
                    disabled={busy}
                    onChange={(e) => setCopies(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>
            </div>

            {busy && items.length === 0 ? (
              <LoadingState label="正在加载可打印单据…" />
            ) : items.length === 0 ? (
              <EmptyState
                icon="clinical"
                title="暂无可打印单据"
                copy="病历录入或开立医嘱后，此处将展示可输出的单据。"
              />
            ) : (
              <div className="doctor-batch-item-list" role="list" aria-label="待打印单据列表">
                {items.map((item) => {
                  const isChecked = selectedIds.includes(item.id)
                  return (
                    <article
                      key={item.id}
                      className={`doctor-batch-item ${isChecked ? 'is-checked' : ''} ${!item.isReady ? 'is-disabled' : ''}`}
                      onClick={() => {
                        if (item.isReady && !busy) toggleItem(item.id)
                      }}
                      role="listitem"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!item.isReady || busy}
                        onChange={() => {
                          if (item.isReady && !busy) toggleItem(item.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`选择${item.title}`}
                      />
                      <div className="doctor-batch-item-info">
                        <strong>{item.title}</strong>
                        <small className={!item.isReady ? 'doctor-batch-item-reason' : ''}>
                          {item.meta}
                        </small>
                      </div>
                      <StatusBadge tone={item.isReady ? 'success' : 'warning'}>
                        {item.isReady ? '就绪' : '待处理'}
                      </StatusBadge>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="doctor-batch-receipts-summary" aria-label="批量受控打印执行结果">
            <div className="doctor-batch-receipts-header">
              <strong>批量受控打印完成（共 {results.length} 项）</strong>
              <small>已为选中的就绪单据生成防篡改正式 PDF 并调起打印，记录已留痕归档。</small>
            </div>
            <div className="doctor-batch-receipt-list">
              {results.map(({ item, receipt, error }, index) => (
                <div key={`${item.id}-${index}`} className="doctor-batch-receipt-item">
                  <div className="doctor-batch-receipt-meta">
                    <strong>{item.title}</strong>
                    {receipt ? (
                      <small>
                        {receipt.fileName} · SHA-256: <code>{receipt.contentDigest.slice(0, 12)}…</code> · 任务: {receipt.jobId}
                      </small>
                    ) : (
                      <small className="doctor-batch-item-reason">生成失败: {error}</small>
                    )}
                  </div>
                  <div className="doctor-batch-receipt-actions">
                    {receipt && (
                      <>
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => {
                            if (receipt.downloadUrl) void api.printing.printPdf(receipt.downloadUrl)
                          }}
                        >
                          <Icon name="print" />调起打印
                        </Button>
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => void api.printing.download(receipt)}
                        >
                          <Icon name="download" />下载
                        </Button>
                      </>
                    )}
                    <StatusBadge tone={receipt ? 'success' : 'danger'}>
                      {receipt ? '成功' : '失败'}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function EncounterPrintPanel({
  encounter,
  api,
  onOpenNotePrint,
  onOpenPrescriptionPrint,
  onOpenServicePrint,
}: {
  encounter: Encounter
  api: RhnApi
  onOpenNotePrint?: () => void
  onOpenPrescriptionPrint?: (rx: Prescription) => void
  onOpenServicePrint?: (svc: ServiceRequest) => void
}) {
  const queryClient = useQueryClient()
  const documents = useQuery({
    queryKey: ['doctor-document', encounter.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter.id),
  })
  const prescriptions = useQuery({
    queryKey: ['doctor-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id),
  })
  const services = useQuery({
    queryKey: ['doctor-services', encounter.id],
    queryFn: () => api.encounters.serviceRequests(encounter.id),
  })
  const printRecords = useQuery({
    queryKey: ['doctor-print-records', encounter.id],
    queryFn: () => api.printing.recordsByEncounter(encounter.id),
  })

  const [activePrescription, setActivePrescription] = useState<Prescription | null>(null)
  const [activeService, setActiveService] = useState<ServiceRequest | null>(null)
  const [activeNotePrint, setActiveNotePrint] = useState(false)
  const [reprintRecord, setReprintRecord] = useState<PrintRecord | null>(null)
  const [batchPrintOpen, setBatchPrintOpen] = useState(false)

  const downloadRecord = useMutation({
    mutationFn: (record: PrintRecord) => api.printing.download(record),
  })
  const directPrintRecord = useMutation({
    mutationFn: (record: PrintRecord) => api.printing.printPdf(record.downloadUrl),
  })

  const note = documents.data?.find((d) => d.documentType === 'OUTPATIENT_NOTE')
  const noteSigned = note?.status === 'SIGNED'

  const activeRxList = (prescriptions.data ?? []).filter((rx) => rx.status === 'ACTIVE')
  const draftRxList = (prescriptions.data ?? []).filter((rx) => rx.status === 'DRAFT')
  const activeSvcList = (services.data ?? []).filter((svc) => svc.status === 'ACTIVE')

  const refreshRecords = () => {
    void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })
  }

  return (
    <Panel className="doctor-print-center-panel">
      <PanelHead
        title="门诊受控打印中心"
        meta={`本次就诊 · ${encounter.encounterNo}`}
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {(noteSigned || activeRxList.length > 0 || activeSvcList.length > 0) && (
              <Button size="sm" variant="primary" onClick={() => setBatchPrintOpen(true)}>
                <Icon name="print" />一键批量打印
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={refreshRecords}>
              <Icon name="refresh" />刷新记录
            </Button>
          </div>
        }
      />

      <div className="doctor-print-center-content">
        <section className="doctor-print-section" aria-label="本次就诊可输出单据">
          <header className="doctor-print-section-header">
            <strong>可输出医疗文书与单据</strong>
            <small>依据规范，仅已签署病历与已生效处方/申请单开放受控打印</small>
          </header>

          <div className="doctor-print-doc-list">
            <article className="doctor-print-doc-item">
              <div className="doctor-print-doc-meta">
                <span className="doctor-print-doc-title">门诊病历</span>
                <small>{note ? (noteSigned ? `已签署 · V${note.currentVersion}` : `草稿 V${note.currentVersion}（未签署）`) : '尚未生成病历'}</small>
              </div>
              <StatusBadge tone={noteSigned ? 'success' : 'warning'}>
                {noteSigned ? '可打印' : '需签署'}
              </StatusBadge>
              <Button
                size="sm"
                variant={noteSigned ? 'secondary' : 'text'}
                disabled={!note}
                title={noteSigned ? '受控打印已签署门诊病历' : '门诊病历签署后方可打印'}
                onClick={() => {
                  if (onOpenNotePrint) onOpenNotePrint()
                  else setActiveNotePrint(true)
                }}
              >
                <Icon name="print" />打印病历
              </Button>
            </article>

            {activeRxList.map((rx) => (
              <article key={rx.id} className="doctor-print-doc-item">
                <div className="doctor-print-doc-meta">
                  <span className="doctor-print-doc-title">
                    {prescriptionCategoryLabel(rx.categoryCode)} ({rx.prescriptionNo})
                  </span>
                  <small>{rx.medicationRequests.filter((m) => m.status === 'ACTIVE').length} 项药品 · 已生效</small>
                </div>
                <StatusBadge tone="success">已生效</StatusBadge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (onOpenPrescriptionPrint) onOpenPrescriptionPrint(rx)
                    else setActivePrescription(rx)
                  }}
                >
                  <Icon name="print" />打印处方
                </Button>
              </article>
            ))}

            {draftRxList.map((rx) => (
              <article key={rx.id} className="doctor-print-doc-item is-draft">
                <div className="doctor-print-doc-meta">
                  <span className="doctor-print-doc-title">
                    {prescriptionCategoryLabel(rx.categoryCode)} ({rx.prescriptionNo})
                  </span>
                  <small>{rx.medicationRequests.length} 项药品 · 待审核开立</small>
                </div>
                <StatusBadge tone="warning">草稿</StatusBadge>
                <Button size="sm" variant="text" disabled title="请先在医嘱工作区完成审核开立生效">
                  待开立
                </Button>
              </article>
            ))}

            {activeSvcList.map((svc) => (
              <article key={svc.id} className="doctor-print-doc-item">
                <div className="doctor-print-doc-meta">
                  <span className="doctor-print-doc-title">
                    {serviceApplicationLabel(svc.serviceType)}申请单 · {svc.itemName}
                  </span>
                  <small>{svc.requestNo} · 已生效</small>
                </div>
                <StatusBadge tone="success">已生效</StatusBadge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (onOpenServicePrint) onOpenServicePrint(svc)
                    else setActiveService(svc)
                  }}
                >
                  <Icon name="print" />打印申请单
                </Button>
              </article>
            ))}

            {!note && activeRxList.length === 0 && draftRxList.length === 0 && activeSvcList.length === 0 && (
              <EmptyState icon="clinical" title="暂无可打印单据" copy="病历录入或开立医嘱后，此处将展示可输出的单据。" />
            )}
          </div>
        </section>

        <section className="doctor-print-section" aria-label="受控打印记录与审计留痕">
          <header className="doctor-print-section-header">
            <strong>本次就诊正式输出留痕 ({printRecords.data?.length ?? 0})</strong>
            <small>不可变 PDF、SHA-256 内容摘要与补打记录</small>
          </header>

          {printRecords.isPending ? (
            <LoadingState label="正在加载打印记录…" />
          ) : !printRecords.data?.length ? (
            <EmptyState
              icon="roadmap"
              title="暂无受控打印记录"
              copy="正式生成文书或处方后，防篡改摘要与任务留痕将记录于此，支持一键补打。"
            />
          ) : (
            <div className="doctor-history-print-list">
              {printRecords.data.map((record) => (
                <article key={record.outputId}>
                  <span>
                    <strong>{record.fileName}</strong>
                    <small>
                      {printPurposeLabel(record.purpose)} · V{record.sourceVersion} · {formatTime(record.generatedAt)}
                    </small>
                  </span>
                  <span>
                    <small>{record.templateCode} · V{record.templateVersion}</small>
                    <small>{record.jobs.length} 次任务</small>
                  </span>
                  <div>
                    <Button
                      size="sm"
                      variant="text"
                      busy={directPrintRecord.isPending}
                      onClick={() => directPrintRecord.mutate(record)}
                      title="调起打印机再次打印"
                    >
                      打印
                    </Button>
                    <Button
                      size="sm"
                      variant="text"
                      busy={downloadRecord.isPending}
                      onClick={() => downloadRecord.mutate(record)}
                      title="下载不可变 PDF 文件"
                    >
                      下载
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReprintRecord(record)}
                      title="登记补打任务留痕并打印"
                    >
                      补打
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {activeNotePrint && note && (
        <ControlledPrintDialog
          api={api}
          title="打印门诊病历"
          description={`已签署版本 V${note.currentVersion} · 每次生成和重打都会留痕。`}
          sourceLabel={`${note.title} · V${note.currentVersion}`}
          generate={(purpose, copies) => api.printing.clinicalDocument(note.id, purpose, copies)}
          onGenerated={refreshRecords}
          onClose={() => setActiveNotePrint(false)}
        />
      )}

      {activePrescription && (
        <ControlledPrintDialog
          api={api}
          title="打印门诊处方"
          description="仅生效处方可以生成正式 PDF；每次生成和重打都会留痕。"
          sourceLabel={`${prescriptionCategoryLabel(activePrescription.categoryCode)} · ${activePrescription.prescriptionNo}`}
          generate={(purpose, copies) =>
            api.printing.prescription(encounter.id, activePrescription.id, purpose, copies)
          }
          onGenerated={refreshRecords}
          onClose={() => setActivePrescription(null)}
        />
      )}

      {activeService && (
        <ControlledPrintDialog
          api={api}
          title={`打印${serviceApplicationLabel(activeService.serviceType)}申请单`}
          description="仅生效且未撤销的申请可以生成正式 PDF；每次生成和重打都会留痕。"
          sourceLabel={`${activeService.itemName} · ${activeService.requestNo}`}
          generate={(purpose, copies) =>
            api.printing.serviceRequest(encounter.id, activeService.id, purpose, copies)
          }
          onGenerated={refreshRecords}
          onClose={() => setActiveService(null)}
        />
      )}

      {reprintRecord && (
        <HistoricalReprintDialog
          api={api}
          record={reprintRecord}
          onReprinted={refreshRecords}
          onClose={() => setReprintRecord(null)}
        />
      )}

      {batchPrintOpen && (
        <BatchPrintDialog
          encounter={encounter}
          api={api}
          onClose={() => setBatchPrintOpen(false)}
          onPrinted={refreshRecords}
        />
      )}
    </Panel>
  )
}


const defaultHistoryRecordFields: HistoryRecordField[] = [
  'chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
]

interface HistoryCopyItem {
  key: HistoryCopyField
  label: string
  value: string
}

interface HistoryCopyGroup {
  key: 'record' | 'diagnosis'
  label: string
  description: string
  items: HistoryCopyItem[]
}

const historyDiagnosisKey = (code: string): HistoryCopyField => `diagnosis:${code}`

function HistoryPanel({ encounters, currentEncounter, api, copyDisabled = false, onCopy, allergies = [], allergyReady = false }: {
  encounters: Encounter[]; currentEncounter: Encounter; api: RhnApi; copyDisabled?: boolean
  onCopy?: (draft: HistoryCopyDraft) => void
  allergies?: AllergyIntolerance[]
  allergyReady?: boolean
}) {
  const currentEncounterId = currentEncounter.id
  const history = encounters.filter((item) => item.id !== currentEncounterId)
  const historyIds = history.map((item) => item.id).join(',')
  const [selectedId, setSelectedId] = useState<string | null>(history[0]?.id ?? null)
  const [checked, setChecked] = useState<Set<HistoryCopyField>>(() => new Set())
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [reprintRecord, setReprintRecord] = useState<PrintRecord | null>(null)
  useEffect(() => {
    if (!selectedId || !history.some((item) => item.id === selectedId)) setSelectedId(history[0]?.id ?? null)
  }, [historyIds, selectedId])
  const selected = history.find((item) => item.id === selectedId)
  const selectedDiagnosisCodes = selected?.diagnoses.map((item) => item.code).join(',') ?? ''
  useEffect(() => {
    setChecked(new Set<HistoryCopyField>([
      ...defaultHistoryRecordFields,
      ...(selected?.diagnoses.map((item) => historyDiagnosisKey(item.code)) ?? []),
    ]))
  }, [selectedDiagnosisCodes, selectedId])
  const documents = useQuery({
    queryKey: ['doctor-history-document', selectedId],
    queryFn: () => api.clinicalDocuments.byEncounter(selectedId!), enabled: Boolean(selectedId),
  })
  const note = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const printRecords = useQuery({
    queryKey: ['doctor-history-print-records', selectedId],
    queryFn: () => api.printing.recordsByEncounter(selectedId!), enabled: Boolean(selectedId),
  })
  const noteVersion = note?.history.find((item) => item.version === note.currentVersion)
  const notePrintRecords = (printRecords.data ?? []).filter((item) => item.sourceType === 'ClinicalDocument'
    && item.sourceId === note?.id)
  const currentPrintRecords = notePrintRecords.filter((item) => item.sourceVersion === note?.currentVersion)
  const latestPrint = currentPrintRecords[0]
  const printJobCount = notePrintRecords.reduce((total, item) => total + item.jobs.length, 0)
  const downloadRecord = useMutation({ mutationFn: (record: PrintRecord) => api.printing.download(record) })
  const allRecordItems: HistoryCopyItem[] = selected ? [
    { key: 'chiefComplaint', label: '主诉', value: selected.chiefComplaint ?? '' },
    { key: 'presentIllness', label: '现病史', value: note?.content.presentIllness ?? '' },
    { key: 'medicalHistory', label: '既往史', value: note?.content.medicalHistory ?? '' },
    { key: 'physicalExam', label: '查体所见', value: note?.content.physicalExam ?? '' },
    { key: 'allergyHistory', label: '过敏史补充', value: note?.content.allergyHistory ?? '' },
    { key: 'medicationHistory', label: '用药史', value: note?.content.medicationHistory ?? '' },
    { key: 'auxiliaryExaminations', label: '辅助检查结果', value: note?.content.auxiliaryExaminations ?? '' },
    { key: 'healthEducation', label: '健康宣教', value: note?.content.healthEducation ?? '' },
    { key: 'followUp', label: '随访复诊', value: note?.content.followUp ?? '' },

  ] : []
  const recordItems = allRecordItems.filter((item) => Boolean(item.value.trim()))
  const diagnosisItems: HistoryCopyItem[] = selected?.diagnoses.map((item) => ({
    key: historyDiagnosisKey(item.code), label: item.type === 'PRIMARY' ? '主要诊断' : '次要诊断',
    value: `${item.display}（${item.code}）`,
  })) ?? []
  const copyGroups: HistoryCopyGroup[] = [
    { key: 'record', label: '病历内容', description: '主诉、病史、查体和诊疗计划', items: recordItems },
    { key: 'diagnosis', label: '诊断信息', description: '按诊断明细选择本次需要沿用的内容', items: diagnosisItems },
  ].filter((group) => group.items.length > 0) as HistoryCopyGroup[]
  const allItems = copyGroups.flatMap((group) => group.items)
  const selectedCount = allItems.filter((item) => checked.has(item.key)).length
  const toggle = (key: HistoryCopyField) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleGroup = (items: HistoryCopyItem[]) => setChecked((current) => {
    const next = new Set(current)
    const allSelected = items.every((item) => next.has(item.key))
    items.forEach((item) => { if (allSelected) next.delete(item.key); else next.add(item.key) })
    return next
  })
  const copyToCurrent = () => {
    if (!selected || !onCopy || selectedCount === 0) return
    const record: HistoryCopyRecord = {}
    if (checked.has('chiefComplaint') && selected.chiefComplaint) record.chiefComplaint = selected.chiefComplaint
    if (checked.has('presentIllness') && note?.content.presentIllness) record.presentIllness = note.content.presentIllness
    if (checked.has('medicalHistory') && note?.content.medicalHistory) record.medicalHistory = note.content.medicalHistory
    if (checked.has('physicalExam') && note?.content.physicalExam) record.physicalExam = note.content.physicalExam
    if (checked.has('allergyHistory') && note?.content.allergyHistory) record.allergyHistory = note.content.allergyHistory
    if (checked.has('medicationHistory') && note?.content.medicationHistory) record.medicationHistory = note.content.medicationHistory
    if (checked.has('auxiliaryExaminations') && note?.content.auxiliaryExaminations) record.auxiliaryExaminations = note.content.auxiliaryExaminations
    if (checked.has('healthEducation') && note?.content.healthEducation) record.healthEducation = note.content.healthEducation
    if (checked.has('followUp') && note?.content.followUp) record.followUp = note.content.followUp

    onCopy({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo, sourceRegisteredAt: selected.registeredAt,
      record, diagnoses: selected.diagnoses.filter((item) => checked.has(historyDiagnosisKey(item.code)))
        .map(({ code, display, type }) => ({ code, display, type })) })
  }

  return <Panel className="doctor-history-panel"><PanelHead title="门诊就诊历史" meta={`既往 ${history.length} 次`} />
    {history.length === 0 ? <EmptyState icon="roadmap" title="暂无历史就诊" copy="完成本次就诊后可在后续复诊中查看和复用。" />
      : <div className="doctor-history-browser">
        <div className="doctor-history-visits" role="list" aria-label="历史就诊列表">{history.map((item) =>
          <Button variant="text" size="sm" type="button" role="listitem" key={item.id} className={item.id === selectedId ? 'is-selected' : ''}
            aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
            <span><strong>{formatTime(item.registeredAt)}</strong><small>{item.encounterNo}</small></span>
            <span><strong>{item.chiefComplaint || '门诊就诊'}</strong>
              <small>{item.diagnoses.map((diagnosis) => diagnosis.display).join('、') || '尚无诊断'}</small></span>
            <Icon name="chevron-right" />
          </Button>)}</div>
        <section className="doctor-history-detail" aria-label="历史就诊详情">
          {selected && <HistoryPrescriptionReference key={selected.id} encounter={selected} targetEncounter={currentEncounter} api={api}
            disabled={copyDisabled || !onCopy} allergies={allergies} allergyReady={allergyReady}
            onStage={(medicationDrafts) => onCopy?.({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo,
              sourceRegisteredAt: selected.registeredAt, record: {}, medicationDrafts })} />}
          {(documents.error || printRecords.error || downloadRecord.error) && <Alert>
            {errorMessage(documents.error || printRecords.error || downloadRecord.error)}</Alert>}
          {documents.isPending ? <LoadingState label="正在加载历史病历…" /> : <>
            <header><div><strong>{selected?.chiefComplaint || '门诊就诊'}</strong>
              <small>{selected ? `${formatTime(selected.registeredAt)} · ${selected.encounterNo}` : ''}</small></div>
              {selected && <StatusBadge tone={encounterStatusPresentation(selected.status).tone}>
                {encounterStatusPresentation(selected.status).label}</StatusBadge>}</header>
            <div className="doctor-history-copy-groups">
              {note && <section className="doctor-history-document-summary" aria-label="历史门诊病历文书">
                <header><span><strong>门诊病历文书</strong><small>签署版本、完整性证据与受控打印记录</small></span>
                  <StatusBadge tone={note.status === 'SIGNED' ? 'success' : 'warning'}>
                    {note.status === 'SIGNED' ? `已签署 · V${note.currentVersion}` : `${note.status} · V${note.currentVersion}`}
                  </StatusBadge></header>
                <dl>
                  <div><dt>签署时间</dt><dd>{noteVersion?.signedAt ? formatTime(noteVersion.signedAt) : '未签署'}</dd></div>
                  <div><dt>签署含义</dt><dd>{noteVersion?.signatureMeaning || '—'}</dd></div>
                  <div><dt>正式输出</dt><dd>{notePrintRecords.length} 份</dd></div>
                  <div><dt>打印任务</dt><dd>{printJobCount} 次</dd></div>
                </dl>
                {noteVersion?.contentDigest && <p className="doctor-history-document-digest">
                  <span>{noteVersion.contentDigestAlgorithm || '摘要'}</span><code>{noteVersion.contentDigest}</code></p>}
                {printRecords.isPending ? <LoadingState label="正在读取打印记录…" />
                  : notePrintRecords.length > 0 && <div className="doctor-history-print-list">
                    {notePrintRecords.map((record) => <article key={record.outputId}>
                      <span><strong>{record.fileName}</strong><small>{printPurposeLabel(record.purpose)} · 文书 V{record.sourceVersion}
                        · {formatTime(record.generatedAt)}</small></span>
                      <span><small>{record.templateCode} · V{record.templateVersion}</small>
                        <small>{record.jobs.length} 次任务</small></span>
                      <div><Button size="sm" variant="text" busy={downloadRecord.isPending}
                        onClick={() => downloadRecord.mutate(record)}>下载</Button>
                        {record.sourceVersion === note.currentVersion && <Button size="sm" variant="secondary"
                          onClick={() => setReprintRecord(record)}>补打</Button>}</div>
                    </article>)}</div>}
                {note.status === 'SIGNED' && !latestPrint && <footer>
                  <span>当前签署版本尚未生成正式 PDF</span>
                  <Button size="sm" onClick={() => setNotePrintOpen(true)}><Icon name="print" />生成并下载</Button>
                </footer>}
              </section>}
              {copyGroups.map((group) => {
              const groupSelectedCount = group.items.filter((item) => checked.has(item.key)).length
              const allSelected = groupSelectedCount === group.items.length
              const partlySelected = groupSelectedCount > 0 && !allSelected
              return <section className="doctor-history-copy-group" key={group.key}>
                <header>{onCopy ? <label>
                  <input type="checkbox" checked={allSelected} disabled={copyDisabled}
                    ref={(node) => { if (node) node.indeterminate = partlySelected }}
                    onChange={() => toggleGroup(group.items)} aria-label={`选择${group.label}`} />
                  <span><strong>{group.label}</strong><small>{group.description}</small></span>
                </label> : <span><strong>{group.label}</strong><small>{group.description}</small></span>}
                  <em>{onCopy ? `已选 ${groupSelectedCount}/${group.items.length}` : `${group.items.length} 项`}</em></header>
                <div className="doctor-history-copy-list">{group.items.map((item) => onCopy
                  ? <label key={item.key} className={checked.has(item.key) ? 'is-checked' : ''}>
                      <input type="checkbox" checked={checked.has(item.key)} disabled={copyDisabled}
                        onChange={() => toggle(item.key)} />
                      <span><strong>{item.label}</strong><small>{item.value}</small></span>
                    </label>
                  : <article key={item.key}><strong>{item.label}</strong><p>{item.value}</p></article>)}</div>
              </section>
            })}</div>
            {allItems.length === 0 && <EmptyState icon="clinical" title="本次就诊暂无可展示病历"
              copy="历史病历尚未形成可复用的结构化内容。" />}
            {onCopy && <footer><span>所选内容覆盖对应草稿；生命体征、医嘱和费用不复制</span>
              <Button size="sm" disabled={copyDisabled || selectedCount === 0} onClick={copyToCurrent}>
                复制所选 {selectedCount} 项</Button></footer>}
            {onCopy && copyDisabled && <p className="doctor-history-copy-disabled">当前病历已签署，不能再带入历史内容。</p>}
          </>}
        </section>
      </div>}
    {notePrintOpen && note && <ControlledPrintDialog api={api} title="打印历史门诊病历"
      description="按当前已签署版本生成不可变 PDF；后续补打复用本次输出。"
      sourceLabel={`${selected?.encounterNo || '历史就诊'} · 病历 V${note.currentVersion}`}
      generate={(purpose, copies) => api.printing.clinicalDocument(note.id, purpose, copies)}
      onGenerated={() => void printRecords.refetch()} onClose={() => setNotePrintOpen(false)} />}
    {reprintRecord && <HistoricalReprintDialog api={api} record={reprintRecord}
      onReprinted={() => void printRecords.refetch()} onClose={() => setReprintRecord(null)} />}
  </Panel>
}
