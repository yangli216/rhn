import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ClinicalContext } from '../../app/AppShell'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { ClinicalAiDraftContext } from '../../shared/api/clinicalAiApi'
import type { DiseaseConcept } from '../../shared/api/masterDataApi'
import type { Department } from '../../shared/api/organizationApi'
import type {
  CreateOutpatientReferralInput, OutpatientReferral, OutpatientReferralStatus, OutpatientReferralType,
} from '../../shared/api/outpatientReferralsApi'
import type {
  ClinicalRecordInput, CompleteEncounterInput, DiagnosisInput, MedicationRequest, Prescription,
} from '../../shared/api/encountersApi'
import type { TerminateEncounterInput } from '../../shared/api/outpatientFlowApi'
import type { OutpatientPlanTemplate, OutpatientPlanTemplateScope } from '../../shared/api/outpatientPlanTemplatesApi'
import type {
  OutpatientNoteTemplate, OutpatientNoteTemplateContent, OutpatientNoteTemplateScope,
} from '../../shared/api/outpatientNoteTemplatesApi'
import type {
  OutpatientNoteForm, OutpatientNoteFormField,
} from '../../shared/api/outpatientNoteFormsApi'
import type { PrintPurpose, PrintReceipt, PrintRecord } from '../../shared/api/printingApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { ReceptionQueueItem } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import { age, formatTime, genderLabel } from '../../shared/format'
import { encounterStatusPresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import {
  Alert, Button, ClinicalResourceSearch, Dialog, EmptyState, FormField, Icon, LoadingState,
  ObjectContextBar, PageHeader, Panel, PanelHead, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'
import {
  isInfusionRoute, type MedicationPlanDraft,
} from './PrescriptionListEditor'
import { UnifiedOrderListEditor, type ServicePlanDraft } from './UnifiedOrderListEditor'
import { ClinicalAiAssistantPanel } from './ai/ClinicalAiAssistantPanel'
import {
  clinicalAiContextFingerprint, mergeAiDiagnoses, mergeAiRecordDraft, stableClinicalAiFingerprint,
  type ClinicalAiDraftRequest,
} from './ai/aiDraftAdapter'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function commandCode(action: string, encounterId: string) {
  return `${action}-${encounterId}-${globalThis.crypto.randomUUID()}`
}

interface PatientSelection {
  resident: Resident
  encounterId: string | null
}

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

export function DoctorWorkstation({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const [params] = useSearchParams()
  const linkedResidentId = params.get('residentId')
  const linkedEncounterId = params.get('encounterId')
  const [selected, setSelected] = useState<PatientSelection | null>(null)
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id],
    queryFn: () => api.scheduling.receptionQueue(businessDate()),
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
    if (linkedResident.data) setSelected({ resident: linkedResident.data, encounterId: linkedEncounterId })
  }, [linkedEncounterId, linkedResident.data])
  const openPatient = useMutation({
    mutationFn: (item: ReceptionQueueItem) => api.residents.get(item.residentId),
    onSuccess: (resident, item) => setSelected({ resident, encounterId: item.encounterId }),
  })

  const refreshQueue = () => queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] })
  const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['outpatient-referral-inbox'] })
  if (selected) return <PatientWorkspace resident={selected.resident} encounterId={selected.encounterId} api={api}
    clinicalContext={clinicalContext} onBack={() => setSelected(null)} onQueueRefresh={refreshQueue} />

  const waiting = (queue.data ?? []).filter((item) => ['WAITING', 'IN_SERVICE', 'SUSPENDED'].includes(item.status))
  return <>
    <PageHeader eyebrow="门诊医疗 · 医生工作区" title="门诊医生站"
      description="从本人科室候诊队列进入就诊；居民建档、挂号和排班在各自工作台完成。"
      actions={<Button variant="secondary" onClick={() => void queue.refetch()}><Icon name="refresh" />刷新</Button>} />
    {(queue.error || referralInbox.error || openPatient.error || linkedResident.error) && <Alert className="ui-page-feedback">
      {errorMessage(queue.error || referralInbox.error || openPatient.error || linkedResident.error)}</Alert>}
    <section className="doctor-queue-summary" aria-label="候诊概览">
      <div><span>候诊</span><strong>{waiting.filter((item) => item.status === 'WAITING').length}</strong></div>
      <div><span>接诊中</span><strong>{waiting.filter((item) => item.status === 'IN_SERVICE').length}</strong></div>
      <div><span>暂挂</span><strong>{waiting.filter((item) => item.status === 'SUSPENDED').length}</strong></div>
      <div><span>当前科室</span><strong>{clinicalContext.department.name}</strong></div>
    </section>
    <ReferralInboxPanel requests={referralInbox.data ?? []} loading={referralInbox.isPending}
      api={api} onRefresh={async () => { await Promise.all([refreshInbox(), refreshQueue()]) }} />
    <Panel className="doctor-queue-panel">
      <PanelHead title="今日候诊队列" meta={`${waiting.length} 人待处理`} />
      {queue.isPending || (Boolean(linkedResidentId) && linkedResident.isPending) ? <LoadingState label="正在加载候诊队列…" /> : waiting.length === 0
        ? <EmptyState icon="clinical" title="当前没有候诊患者" copy="新挂号患者会自动进入本科室候诊队列。" />
        : <div className="doctor-queue-list">{waiting.map((item) => <QueueRow key={item.registrationId}
          item={item} busy={openPatient.isPending} onOpen={() => openPatient.mutate(item)} />)}</div>}
    </Panel>
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

function QueueRow({ item, busy, onOpen }: { item: ReceptionQueueItem; busy: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} disabled={busy}>
    <span className="doctor-queue-ticket">{item.ticketNo}</span>
    <span><strong>{item.residentName}</strong><small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
    <span><strong>{item.serviceName || '普通门诊'}</strong><small>{item.practitionerName || '现场接诊'}{item.locationName ? ` · ${item.locationName}` : ''}</small></span>
    <span><strong>{formatTime(item.registeredAt)}</strong><small>挂号时间</small></span>
    <StatusBadge tone={item.status === 'IN_SERVICE' ? 'success' : 'warning'}>
      {item.status === 'IN_SERVICE' ? '接诊中' : item.status === 'SUSPENDED' ? '已暂挂' : '候诊'}</StatusBadge>
    <Icon name="chevron-right" />
  </button>
}

type WorkTool = 'assistant' | 'history' | 'results' | 'coordination'
type GuardedPatientAction = 'queue' | 'suspend' | 'complete' | 'terminate'
type HistoryRecordField = 'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'treatmentPlan'
type HistoryCopyField = HistoryRecordField | `diagnosis:${string}`
type HistoryCopyRecord = Partial<Pick<ClinicalRecordInput,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'treatmentPlan'>>

interface HistoryCopyDraft {
  requestId: number
  sourceEncounterNo: string
  sourceRegisteredAt: string
  record: HistoryCopyRecord
  diagnoses?: DiagnosisInput[]
}

function PatientWorkspace({ resident, encounterId, api, clinicalContext, onBack, onQueueRefresh }: {
  resident: Resident; encounterId: string | null; api: RhnApi; clinicalContext: ClinicalContext
  onBack: () => void; onQueueRefresh: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const [activeTool, setActiveTool] = useState<WorkTool | null>(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [suspensionOpen, setSuspensionOpen] = useState(false)
  const [terminationOpen, setTerminationOpen] = useState(false)
  const [allergyOpen, setAllergyOpen] = useState(false)
  const [historyCopy, setHistoryCopy] = useState<HistoryCopyDraft | null>(null)
  const [aiContext, setAiContext] = useState<ClinicalAiDraftContext | null>(null)
  const [aiDraft, setAiDraft] = useState<ClinicalAiDraftRequest | null>(null)
  const [aiAdoptionBusy, setAiAdoptionBusy] = useState(false)
  const [draftState, setDraftState] = useState<EncounterDraftState>(emptyDraftState)
  const [guardedAction, setGuardedAction] = useState<GuardedPatientAction | null>(null)
  const [resumeCommandCode] = useState(() => commandCode('RESUME', encounterId ?? resident.id))
  const queryClient = useQueryClient()
  const encounters = useQuery({ queryKey: ['doctor-encounters', resident.id], queryFn: () => api.encounters.byResident(resident.id) })
  const allergies = useQuery({ queryKey: ['doctor-allergies', resident.id], queryFn: () => api.residents.allergies(resident.id) })
  const allergyState: ClinicalAiDraftContext['allergyState'] = allergies.isFetching
    ? 'LOADING' : allergies.error ? 'ERROR' : 'READY'
  const encounter = encounters.data?.find((item) => item.id === encounterId)
    ?? encounters.data?.find((item) => ['IN_PROGRESS', 'SUSPENDED', 'REGISTERED'].includes(item.status))
    ?? encounters.data?.[0]
  const documents = useQuery({
    queryKey: ['doctor-document', encounter?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter!.id),
    enabled: Boolean(encounter?.id),
  })
  const outpatientNote = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const readyToComplete = Boolean(encounter?.chiefComplaint
    && encounter.diagnoses.some((item) => item.type === 'PRIMARY') && outpatientNote?.status === 'SIGNED')
  const draftLabels = draftStateLabels(draftState)
  const hasUnsavedDraft = draftLabels.length > 0
  useEffect(() => {
    setAiContext(null)
    setAiDraft(null)
    setAiAdoptionBusy(false)
    setActiveTool((current) => current === 'assistant' ? null : current)
  }, [encounter?.id])
  useEffect(() => {
    if (!hasUnsavedDraft) return
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsavedDraft])
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['doctor-encounters', resident.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter?.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] }),
      onQueueRefresh(),
    ])
  }
  const complete = useMutation({
    mutationFn: (input: CompleteEncounterInput) => api.encounters.complete(encounter!.id, input),
    onSuccess: async () => { setCompletionOpen(false); await refresh(); onBack() },
  })
  const suspend = useMutation({
    mutationFn: (input: { commandCode: string; reason: string }) => api.encounters.suspend(encounter!.id, input),
    onSuccess: async () => { setSuspensionOpen(false); await refresh(); onBack() },
  })
  const resume = useMutation({
    mutationFn: () => api.encounters.resume(encounter!.id, {
      commandCode: resumeCommandCode, terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess: refresh,
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

  return <section className="doctor-patient-workspace">
    <ObjectContextBar avatar={resident.fullName.slice(-1)} eyebrow="当前患者" title={resident.fullName}
      description={`${genderLabel(resident.gender)} · ${age(resident.birthDate)} 岁 · ${resident.maskedNationalId || '无证件标识'}`}
      facts={[{ label: '健康档案号', value: resident.healthRecordNo },
        { label: '联系电话', value: resident.phone || '未登记' },
        { label: '就诊号', value: encounter?.encounterNo || '无当前就诊' },
        { label: '过敏信息', value: <AllergyContextValue allergies={allergies.data ?? []}
          loading={allergies.isPending} error={allergies.error} disabled={!encounter}
          onClick={() => setAllergyOpen(true)} /> }]}
      actions={encounter && <div className="doctor-context-actions">
        <Button size="sm" variant="secondary" disabled={draftState.busy || aiAdoptionBusy}
          title="返回候诊队列并选择其他患者" onClick={() => requestAction('queue')}>切换患者</Button>
        <StatusBadge tone={encounterStatusPresentation(encounter.status).tone}>
          {encounterStatusPresentation(encounter.status).label}</StatusBadge>
        {encounter.status === 'IN_PROGRESS' && <>
          <Button size="sm" variant="secondary" disabled={aiAdoptionBusy}
            title="暂时释放当前接诊工作会话，患者返回后可继续"
            onClick={() => requestAction('suspend')}>暂挂</Button>
          <Button size="sm" busy={complete.isPending} disabled={aiAdoptionBusy}
            title="进入诊毕汇总，核对费用和转归信息"
            onClick={() => requestAction('complete')}>诊毕</Button>
          <Button size="sm" variant="text" disabled={aiAdoptionBusy}
            title="患者离开或明确要求停止本次诊疗"
            onClick={() => requestAction('terminate')}>终止诊疗</Button>
        </>}
        {encounter.status === 'SUSPENDED' && <>
          <Button size="sm" busy={resume.isPending}
            title="恢复本次接诊并重新建立医生工作会话" onClick={() => resume.mutate()}>恢复接诊</Button>
          <Button size="sm" variant="text" title="确认患者不再返回并终止本次诊疗"
            onClick={() => requestAction('terminate')}>终止诊疗</Button>
        </>}
      </div>} />
    {encounters.isPending ? <LoadingState label="正在建立就诊上下文…" /> : !encounter
      ? <EmptyState icon="clinical" title="没有可处理的门诊就诊" copy="请先在门诊挂号工作台完成挂号。" />
      : <div className="doctor-workspace-body">
          <main className={`doctor-workspace-main${aiAdoptionBusy ? ' is-ai-adoption-busy' : ''}`}
            aria-busy={aiAdoptionBusy || undefined}>
            {encounter.status === 'REGISTERED' ? <IdentityStartPanel encounter={encounter} api={api} onSuccess={refresh} />
              : encounter.status === 'IN_PROGRESS' ? <ClinicalRecordPanel key={encounter.id} encounter={encounter}
                allergies={allergies.data ?? []} allergyState={allergyState} api={api} historyCopy={historyCopy}
                onHistoryCopyConsumed={() => setHistoryCopy(null)} onDraftStateChange={setDraftState}
                aiDraft={aiDraft} onAiDraftConsumed={() => setAiDraft(null)} onAiContextChange={setAiContext}
                onRefresh={refresh} />
                : encounter.status === 'SUSPENDED' ? <Panel className="doctor-identity-panel">
                  <PanelHead title="本次接诊已暂挂" meta="病历和医嘱保持原状，恢复后可继续处理" />
                  <p>患者返回诊室后点击上方“恢复接诊”，系统会重新建立本次医生工作会话。</p>
                  {resume.error && <Alert>{errorMessage(resume.error)}</Alert>}
                </Panel>
                : <HistoryPanel encounters={encounters.data ?? []} currentEncounterId={encounter.id} api={api} />}
          </main>
          {activeTool && <aside className={`doctor-workspace-drawer${activeTool === 'history' ? ' is-history' : ''}${activeTool === 'assistant' ? ' is-assistant' : ''}`}
            aria-label={toolLabel(activeTool)}>
            <header><div><span>扩展业务</span><strong>{toolLabel(activeTool)}</strong></div>
              <button type="button" aria-label="关闭扩展工具" disabled={activeTool === 'assistant' && aiAdoptionBusy}
                onClick={() => setActiveTool(null)}><Icon name="close" /></button></header>
            <div className="doctor-workspace-drawer__content">
              {activeTool === 'assistant' && aiContext && <ClinicalAiAssistantPanel key={encounter.id} encounter={encounter}
                currentContext={aiContext} allergies={allergies.data ?? []} allergyState={allergyState} api={api}
                disabled={outpatientNote?.status === 'SIGNED' || draftState.busy}
                onAdoptionBusyChange={setAiAdoptionBusy}
                onApply={(request) => { setAiDraft(request); setActiveTool(null) }} />}
              {activeTool === 'history' && <HistoryPanel encounters={encounters.data ?? []}
                currentEncounterId={encounter.id} api={api} copyDisabled={encounter.status !== 'IN_PROGRESS' || outpatientNote?.status === 'SIGNED'}
                onCopy={(draft) => { setHistoryCopy(draft); setActiveTool(null) }} />}
              {activeTool === 'results' && <ResultsPanel encounter={encounter} api={api} />}
              {activeTool === 'coordination' && <ReferralCoordinationPanel encounter={encounter}
                clinicalContext={clinicalContext} api={api} hasUnsavedDraft={hasUnsavedDraft} onRefresh={refresh} />}
            </div>
          </aside>}
          <nav className="doctor-workspace-tools" aria-label="医生站扩展工具">
            {encounter.status === 'IN_PROGRESS' && <ToolButton icon="sparkles" label="智医助理"
              active={activeTool === 'assistant'}
              onClick={() => !aiAdoptionBusy && setActiveTool(toggleTool(activeTool, 'assistant'))} />}
            <ToolButton icon="roadmap" label="就诊历史" active={activeTool === 'history'} onClick={() => setActiveTool(toggleTool(activeTool, 'history'))} />
            <ToolButton icon="clinical" label="检验结果" active={activeTool === 'results'} onClick={() => setActiveTool(toggleTool(activeTool, 'results'))} />
            <ToolButton icon="clinical" label="皮试管理" active={false}
              onClick={() => navigate(`/skin-tests?encounterId=${encounter.id}`)} />
            <ToolButton icon="tasks" label="协同业务" active={activeTool === 'coordination'} onClick={() => setActiveTool(toggleTool(activeTool, 'coordination'))} />
          </nav>
        </div>}
    {completionOpen && encounter && <EncounterCompletionDialog encounter={encounter} api={api}
      signed={outpatientNote?.status === 'SIGNED'} ready={readyToComplete} busy={complete.isPending}
      error={complete.error} onClose={() => setCompletionOpen(false)} onComplete={(input) => complete.mutate(input)} />}
    {suspensionOpen && encounter && <EncounterSuspendDialog encounterId={encounter.id}
      busy={suspend.isPending} error={suspend.error}
      onClose={() => setSuspensionOpen(false)} onConfirm={(input) => suspend.mutate(input)} />}
    {terminationOpen && encounter && <EncounterTerminationDialog encounter={encounter} api={api}
      busy={terminate.isPending} error={terminate.error} onClose={() => setTerminationOpen(false)}
      onConfirm={(input) => terminate.mutate(input)} />}
    {allergyOpen && encounter && <Dialog title="过敏信息" eyebrow={`${resident.fullName} · 患者安全`}
      description="核对并维护患者过敏事实，变更将关联当前就诊留痕。" size="wide" onClose={() => setAllergyOpen(false)}
      footer={<Button variant="secondary" onClick={() => setAllergyOpen(false)}>关闭</Button>}>
      <AllergySafetyPanel resident={resident} encounter={encounter} allergies={allergies.data ?? []}
        loading={allergies.isPending} error={allergies.error} api={api} dialog />
    </Dialog>}
    {guardedAction && <UnsavedPatientWorkDialog residentName={resident.fullName} action={guardedAction}
      labels={draftLabels} onClose={() => setGuardedAction(null)} onDiscard={() => runAction(guardedAction)} />}
  </section>
}

function UnsavedPatientWorkDialog({ residentName, action, labels, onClose, onDiscard }: {
  residentName: string; action: GuardedPatientAction; labels: string[]; onClose: () => void; onDiscard: () => void
}) {
  const actionText = ({ queue: '切换患者', suspend: '暂挂接诊', complete: '完成诊毕', terminate: '终止诊疗' } as const)[action]
  const completionBlocked = action === 'complete'
  return <Dialog title={`${actionText}前请处理草稿`} eyebrow={`${residentName} · 防止串写`}
    closeOnBackdrop={false} description="当前页面还有未保存内容，直接离开会丢失这些修改。"
    onClose={onClose} footer={completionBlocked
      ? <Button onClick={onClose}>返回处理草稿</Button>
      : <><Button variant="secondary" onClick={onClose}>继续当前患者</Button>
        <Button onClick={onDiscard}>放弃草稿并{actionText}</Button></>}>
    <div className="doctor-unsaved-work-list" role="list" aria-label="未保存内容">
      {labels.map((label) => <div role="listitem" key={label}><Icon name="warning" /><span>{label}</span></div>)}
    </div>
    {completionBlocked && <Alert>诊毕前必须先保存病历和诊断，并确认待开立医嘱；系统不会静默丢弃草稿。</Alert>}
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
      {issues.map((issue) => <span key={issue.code}>○ {issue.message}</span>)}
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
  return <button type="button" className={`doctor-context-allergy is-${tone}`} disabled={disabled}
    title={`${summary}；点击查看和维护`} onClick={onClick}><span>{summary}</span><Icon name="chevron-right" /></button>
}

function toggleTool(current: WorkTool | null, next: WorkTool): WorkTool | null {
  return current === next ? null : next
}

function toolLabel(value: WorkTool) {
  return ({ assistant: '智医助理', history: '就诊历史', results: '检验检查结果', coordination: '协同业务' } as const)[value]
}

function ToolButton({ icon, label, active, onClick }: {
  icon: 'sparkles' | 'roadmap' | 'clinical' | 'tasks'; label: string; active: boolean; onClick: () => void
}) {
  const labelLines = Array.from({ length: Math.ceil(label.length / 2) }, (_, index) => label.slice(index * 2, index * 2 + 2))
  return <button type="button" className={active ? 'is-active' : ''} aria-label={label}
    aria-pressed={active} title={label} onClick={onClick}>
    <Icon name={icon} /><span className="doctor-tool-label" aria-hidden="true">
      {labelLines.map(line => <span key={line}>{line}</span>)}
    </span>
  </button>
}

function EncounterCompletionDialog({ encounter, api, signed, ready, busy, error, onClose, onComplete }: {
  encounter: Encounter; api: RhnApi; signed: boolean; ready: boolean; busy: boolean; error: unknown
  onClose: () => void; onComplete: (input: CompleteEncounterInput) => void
}) {
  const [dispositionCode, setDispositionCode] = useState<CompleteEncounterInput['dispositionCode']>('HOME')
  const [dispositionNote, setDispositionNote] = useState('按医嘱用药，如症状加重及时复诊')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('COMPLETE', encounter.id))
  const queryClient = useQueryClient()
  const statement = useQuery({
    queryKey: ['doctor-billing-statement', encounter.id], queryFn: () => api.billing.statement(encounter.id), retry: false,
  })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
  const methods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE'),
  })
  const orders = useQuery({
    queryKey: ['doctor-payment-orders', statement.data?.accountId],
    queryFn: () => api.billing.paymentOrders(statement.data!.accountId), enabled: Boolean(statement.data?.accountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false,
  })
  const createPayment = useMutation({
    mutationFn: (command: SettlementPaymentCommand) => api.billing.createPaymentOrder(command.settlementId, {
      idempotencyKey: command.idempotencyKey, businessScene: 'OUTPATIENT', paymentSceneCode: 'CLINIC_SETTLE',
      paymentMethodCode: command.paymentMethodCode, amount: command.amount,
      correlationId: `DOCTOR-STATION-${encounter.id}`, terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess: async () => { await Promise.all([statement.refetch(), orders.refetch(),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })]) },
  })
  const issueInvoice = useMutation({
    mutationFn: () => api.billing.issueInvoice(statement.data!.accountId,
      `INV-${encounter.id}-${Date.now()}`),
    onSuccess: async () => { await Promise.all([statement.refetch(), orders.refetch(),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })]) },
  })
  const payable = (statement.data?.settlements ?? []).filter((value) =>
    ['PRICED', 'PAYMENT_PENDING', 'PARTIAL'].includes(value.status) && value.outstandingAmount > 0)
  const outstanding = payable.reduce((sum, value) => sum + value.outstandingAmount, 0)
  const orderCount = (services.data?.filter((value) => value.status !== 'CANCELLED').length ?? 0)
    + (medications.data?.filter((value) => value.status !== 'CANCELLED').length ?? 0)

  return <Dialog title="诊毕确认" eyebrow="本次就诊收口" size="xwide" closeOnBackdrop={false} onClose={onClose}
    description="集中核对病历、诊断、医嘱、费用与患者转归；确认后当前就诊将结束。"
    footer={<><Button variant="secondary" onClick={onClose}>继续诊疗</Button>
      <Button busy={busy} disabled={!ready || !dispositionCode || outstanding > 0}
        title={outstanding > 0 ? '请先完成诊间结算' : !ready ? '病历、主要诊断或签署尚未完成' : '确认诊毕'}
        onClick={() => onComplete({ commandCode: requestCommand, dispositionCode,
          dispositionNote: dispositionNote.trim() || undefined })}>确认诊毕</Button></>}>
    <div className="doctor-completion-dialog">
      {(error || createPayment.error || issueInvoice.error)
        && <Alert>{errorMessage(error || createPayment.error || issueInvoice.error)}</Alert>}
      <section className="doctor-completion-overview" aria-label="诊毕状态汇总">
        <div><span>主要诊断</span><strong>{encounter.diagnoses.find((value) => value.type === 'PRIMARY')?.display || '未录入'}</strong></div>
        <div><span>病历状态</span><strong className={signed ? 'is-success' : 'is-warning'}>{signed ? '已签署' : '待签署'}</strong></div>
        <div><span>本次医嘱</span><strong>{orderCount} 项</strong></div>
        <div><span>待收金额</span><strong className={outstanding > 0 ? 'is-warning' : 'is-success'}>
          {statement.data ? money(outstanding, statement.data.currencyCode) : '暂无费用'}</strong></div>
      </section>
      <section className="doctor-completion-section">
        <header><div><span>费用信息</span><strong>{statement.data ? `本次费用 ${money(statement.data.chargeAmount, statement.data.currencyCode)}` : '本次就诊尚未形成费用'}</strong></div>
          {statement.isPending ? <StatusBadge tone="neutral">读取中</StatusBadge>
            : statement.data && statement.data.uninvoicedAmount > 0
              ? <Button size="sm" variant="secondary" busy={issueInvoice.isPending}
                onClick={() => issueInvoice.mutate()}>确认费用并生成结算单</Button> : null}</header>
        {statement.data && <EncounterFeeSummary statement={statement.data} />}
        {statement.error && <p className="doctor-completion-note">暂无可结算费用；后续执行计费仍可在收费工作台处理。</p>}
        {payable.length > 0 && <div className="doctor-completion-payment"><SettlementPaymentPanel settlements={payable.map((value) => ({
          id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount, currencyCode: value.currencyCode,
        }))} methods={(methods.data ?? []).map((value) => ({ code: value.code, name: value.name }))}
        orders={orders.data ?? []} busy={createPayment.isPending} sceneLabel="诊间收款"
        onSubmit={(command) => createPayment.mutateAsync(command)} /></div>}
      </section>
      <section className="doctor-completion-section">
        <header><div><span>转归信息</span><strong>明确患者本次就诊去向</strong></div></header>
        <div className="doctor-disposition-form">
          <FormField label="就诊转归" required><select className="ui-field__control" value={dispositionCode}
            onChange={(event) => { setDispositionCode(event.target.value as CompleteEncounterInput['dispositionCode'])
              setRequestCommand(commandCode('COMPLETE', encounter.id)) }}>
            <option value="HOME">门诊离院</option><option value="FOLLOW_UP">预约复诊</option>
            <option value="OBSERVATION">留观</option><option value="REFERRAL">转诊 / 转科</option>
            <option value="ADMISSION">转住院</option>
          </select></FormField>
          <FormField label="转归及随访说明"><textarea className="ui-field__control" maxLength={800} value={dispositionNote}
            onChange={(event) => { setDispositionNote(event.target.value)
              setRequestCommand(commandCode('COMPLETE', encounter.id)) }}
            placeholder="复诊时间、注意事项、转诊去向等" /></FormField>
        </div>
      </section>
      {!ready && <div className="doctor-completion-checklist doctor-completion-checklist--dialog">
        <span className={encounter.chiefComplaint ? 'is-ready' : ''}>{encounter.chiefComplaint ? '✓' : '○'} 主诉已保存</span>
        <span className={encounter.diagnoses.some((value) => value.type === 'PRIMARY') ? 'is-ready' : ''}>
          {encounter.diagnoses.some((value) => value.type === 'PRIMARY') ? '✓' : '○'} 主要诊断</span>
        <span className={signed ? 'is-ready' : ''}>{signed ? '✓' : '○'} 病历签署</span>
      </div>}
    </div>
  </Dialog>
}

function AllergySafetyPanel({ resident, encounter, allergies, loading, error, api, dialog = false }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; loading: boolean; error: unknown; api: RhnApi
  dialog?: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState<NonNullable<AllergyIntolerance['categoryCode']>>('DRUG')
  const [criticality, setCriticality] = useState<NonNullable<AllergyIntolerance['criticalityCode']>>('UNABLE_TO_ASSESS')
  const [severity, setSeverity] = useState<NonNullable<AllergyIntolerance['reactionSeverity']>>('MILD')
  const [substance, setSubstance] = useState('')
  const [substanceCode, setSubstanceCode] = useState('')
  const [reaction, setReaction] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] })
  const record = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'ALLERGY', categoryCode: category, criticalityCode: criticality,
      reactionSeverity: severity, informationSource: 'PATIENT', substanceDisplay: substance.trim(),
      substanceCode: substanceCode.trim() || undefined, reactionText: reaction.trim() || undefined,
    }),
    onSuccess: async () => { setEditing(false); setSubstance(''); setSubstanceCode(''); setReaction(''); await refresh() },
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

  return <section className={`doctor-allergy-safety ${dialog ? 'doctor-allergy-safety--dialog ' : ''}${actual.length ? 'is-risk' : noKnownAssertion ? 'is-clear' : 'is-unknown'}`}
    aria-label="患者过敏安全信息">
    <div className="doctor-allergy-heading"><span>过敏安全</span>{loading ? <small>加载中…</small>
      : actual.length ? <strong>{actual.length} 项有效过敏记录</strong>
        : noKnownAssertion ? <strong>已确认无已知药物过敏</strong> : <strong>尚未核对过敏信息</strong>}</div>
    {actual.length > 0 && <div className="doctor-allergy-list">{actual.map((item) => <span key={item.id}>
      <strong>{item.substanceDisplay}</strong>
      <small>{[allergyCategoryLabel(item.categoryCode), allergySeverityLabel(item.reactionSeverity), item.reactionText]
        .filter(Boolean).join(' · ')}</small>
      <Button size="sm" variant="text" busy={inactivate.isPending}
        onClick={() => { if (window.confirm(`确认停用“${item.substanceDisplay}”过敏记录？`)) inactivate.mutate(item) }}>停用</Button>
    </span>)}</div>}
    {!loading && <div className="doctor-allergy-actions">
      <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? '取消录入' : '记录过敏'}</Button>
      {allergies.length === 0 && <Button size="sm" variant="text" busy={noKnown.isPending}
        onClick={() => noKnown.mutate()}>确认无已知药物过敏</Button>}
    </div>}
    {editing && <div className="doctor-allergy-editor">
      <FormField label="类别" required><select value={category}
        onChange={(event) => setCategory(event.target.value as typeof category)}>
        <option value="DRUG">药物</option><option value="FOOD">食物</option><option value="ENVIRONMENT">环境</option>
        <option value="BIOLOGIC">生物制品</option><option value="OTHER">其他</option>
      </select></FormField>
      <FormField label="过敏原" required><input value={substance} maxLength={300}
        onChange={(event) => setSubstance(event.target.value)} placeholder="如青霉素" /></FormField>
      <FormField label="药品/物质编码"><input value={substanceCode} maxLength={128}
        onChange={(event) => setSubstanceCode(event.target.value)} placeholder="有标准编码时填写" /></FormField>
      <FormField label="危急程度"><select value={criticality}
        onChange={(event) => setCriticality(event.target.value as typeof criticality)}>
        <option value="HIGH">高</option><option value="LOW">低</option><option value="UNABLE_TO_ASSESS">无法评估</option>
      </select></FormField>
      <FormField label="反应严重度"><select value={severity}
        onChange={(event) => setSeverity(event.target.value as typeof severity)}>
        <option value="MILD">轻度</option><option value="MODERATE">中度</option><option value="SEVERE">重度</option>
      </select></FormField>
      <FormField label="过敏反应"><input value={reaction} maxLength={1000}
        onChange={(event) => setReaction(event.target.value)} placeholder="如皮疹、呼吸困难" /></FormField>
      <Button size="sm" busy={record.isPending} disabled={!substance.trim()} onClick={() => record.mutate()}>保存过敏事实</Button>
    </div>}
    {(error || mutationError) && <Alert>{errorMessage(error || mutationError)}</Alert>}
  </section>
}

function allergyCategoryLabel(value?: AllergyIntolerance['categoryCode']) {
  return ({ DRUG: '药物', FOOD: '食物', ENVIRONMENT: '环境', BIOLOGIC: '生物制品', OTHER: '其他' } as const)[value ?? 'OTHER']
}

function allergySeverityLabel(value?: AllergyIntolerance['reactionSeverity']) {
  return value ? ({ MILD: '轻度', MODERATE: '中度', SEVERE: '重度' } as const)[value] : ''
}

function IdentityStartPanel({ encounter, api, onSuccess }: { encounter: Encounter; api: RhnApi; onSuccess: () => Promise<unknown> }) {
  const [nameChecked, setNameChecked] = useState(false)
  const [secondFactorChecked, setSecondFactorChecked] = useState(false)
  const [requestCommand] = useState(() => commandCode('START', encounter.id))
  const start = useMutation({
    mutationFn: () => api.encounters.start(encounter.id, {
      commandCode: requestCommand,
      factorResults: { NAME: nameChecked, DEMOGRAPHIC_OR_IDENTIFIER: secondFactorChecked },
      terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess,
  })
  return <Panel className="doctor-identity-panel">
    <PanelHead title="开始接诊前核验患者身份" meta="核验结果将作为不可覆盖业务事实保存" />
    <div className="doctor-identity-checks">
      <label><input type="checkbox" checked={nameChecked} onChange={(event) => setNameChecked(event.target.checked)} />
        <span><strong>已向患者确认姓名</strong><small>不得仅依据候诊号判断患者身份</small></span></label>
      <label><input type="checkbox" checked={secondFactorChecked} onChange={(event) => setSecondFactorChecked(event.target.checked)} />
        <span><strong>已核对第二身份因子</strong><small>健康档案号、出生日期或脱敏证件信息之一</small></span></label>
    </div>
    {start.error && <Alert>{errorMessage(start.error)}</Alert>}
    <div className="ui-form-actions"><Button busy={start.isPending} disabled={!nameChecked || !secondFactorChecked}
      onClick={() => start.mutate()}>核验通过，开始接诊</Button></div>
  </Panel>
}

const recordSchema = z.object({
  chiefComplaint: z.string().trim().min(1, '请输入主诉').max(1000),
  presentIllness: z.string().trim().max(4000),
  medicalHistory: z.string().trim().max(4000),
  physicalExam: z.string().trim().max(4000),
  treatmentPlan: z.string().trim().max(4000),
  systolic: z.number().int().min(40).max(300),
  diastolic: z.number().int().min(20).max(200),
  temperature: z.number().min(30).max(45).optional(),
  pulseRate: z.number().int().min(20).max(250).optional(),
  respiratoryRate: z.number().int().min(5).max(80).optional(),
  heightCm: z.number().min(30).max(250).optional(),
  weightKg: z.number().min(1).max(500).optional(),
  oxygenSaturation: z.number().int().min(50).max(100).optional(),
})
type RecordForm = z.infer<typeof recordSchema>

interface ClinicalAiContextState {
  document?: ClinicalDocument
  documentStatus: string
  structuredFormId: string
  structuredFormVersion?: number
  structuredValues: Record<string, unknown>
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
  allergies: AllergyIntolerance[]
  allergyState: ClinicalAiDraftContext['allergyState']
  busy: boolean
}

function aiContextPartFingerprint(prefix: string, value: unknown) {
  return stableClinicalAiFingerprint(prefix, value)
}

function aiContextFromDraft(value: RecordForm, diagnoses: DiagnosisInput[], encounter: Encounter,
  state: ClinicalAiContextState): ClinicalAiDraftContext {
  return {
    encounterId: encounter.id, residentId: encounter.residentId,
    encounterStatus: encounter.status,
    documentVersion: state.document?.currentVersion ?? 0,
    documentStatus: state.documentStatus,
    structuredContextFingerprint: aiContextPartFingerprint('structured', {
      formId: state.structuredFormId, formVersion: state.structuredFormVersion ?? 0,
      values: state.structuredValues,
    }),
    medicationDraftFingerprint: aiContextPartFingerprint('medications', state.medicationDrafts),
    serviceDraftFingerprint: aiContextPartFingerprint('services', state.serviceDrafts),
    allergyContextFingerprint: aiContextPartFingerprint('allergies', [...state.allergies]
      .sort((left, right) => left.id.localeCompare(right.id))),
    allergyState: state.allergyState,
    busy: state.busy,
    chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
    medicalHistory: value.medicalHistory, physicalExam: value.physicalExam,
    treatmentPlan: value.treatmentPlan, systolic: value.systolic, diastolic: value.diastolic,
    temperature: value.temperature, pulseRate: value.pulseRate, respiratoryRate: value.respiratoryRate,
    oxygenSaturation: value.oxygenSaturation, heightCm: value.heightCm, weightKg: value.weightKg,
    diagnoses: diagnoses.map(({ code, display, type }) => ({ code, display, type })),
  }
}

export type NoteTemplateField = keyof OutpatientNoteTemplateContent
const noteTemplateFields: Array<{ key: NoteTemplateField; label: string }> = [
  { key: 'chiefComplaint', label: '主诉' },
  { key: 'presentIllness', label: '现病史' },
  { key: 'medicalHistory', label: '既往史' },
  { key: 'physicalExam', label: '查体所见' },
  { key: 'treatmentPlan', label: '诊疗计划' },
]

export function mergeNoteTemplateContent(current: OutpatientNoteTemplateContent,
  template: OutpatientNoteTemplateContent, fields: Set<NoteTemplateField>, overwrite: boolean) {
  const next = { ...current }
  fields.forEach((key) => {
    const incoming = template[key]?.trim()
    if (incoming && (overwrite || !current[key]?.trim())) next[key] = incoming
  })
  return next
}

export function structuredFormSignature(formVersionId: string, values: Record<string, unknown>) {
  return JSON.stringify({ formVersionId, values: Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== '')
      .sort(([left], [right]) => left.localeCompare(right)),
  ) })
}

export function validateStructuredForm(form: OutpatientNoteForm | undefined, values: Record<string, unknown>) {
  const errors: Record<string, string> = {}
  form?.sections.forEach((section) => section.fields.forEach((field) => {
    const value = values[field.code]
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim())
    if (field.required && empty) errors[field.code] = `请填写${field.label}`
    if (!empty && typeof value === 'string' && field.maxLength && value.trim().length > field.maxLength) {
      errors[field.code] = `${field.label}不能超过 ${field.maxLength} 个字符`
    }
    if (!empty && field.type === 'NUMBER' && typeof value === 'number') {
      if (field.minimum != null && value < field.minimum) errors[field.code] = `${field.label}不能小于 ${field.minimum}`
      if (field.maximum != null && value > field.maximum) errors[field.code] = `${field.label}不能大于 ${field.maximum}`
    }
  }))
  return errors
}

function StructuredNoteForm({ form, values, errors, disabled, onChange }: {
  form: OutpatientNoteForm
  values: Record<string, unknown>
  errors: Record<string, string>
  disabled: boolean
  onChange: (code: string, value: unknown) => void
}) {
  return <div className="doctor-structured-note" aria-label={`${form.name}结构化病历`}>
    <div className="doctor-structured-note__head">
      <span><strong>{form.name}</strong><small>{form.formCode} · V{form.version}</small></span>
      <StatusBadge tone="info">科室结构</StatusBadge>
    </div>
    {form.description && <p>{form.description}</p>}
    {form.sections.map((section) => <fieldset key={section.code}>
      <legend>{section.title}</legend>
      {section.description && <small className="doctor-structured-note__description">{section.description}</small>}
      <div className="doctor-structured-note__fields">
        {section.fields.map((field) => <StructuredNoteField key={field.code} field={field}
          value={values[field.code]} error={errors[field.code]} disabled={disabled}
          onChange={(value) => onChange(field.code, value)} />)}
      </div>
    </fieldset>)}
  </div>
}

function StructuredNoteField({ field, value, error, disabled, onChange }: {
  field: OutpatientNoteFormField
  value: unknown
  error?: string
  disabled: boolean
  onChange: (value: unknown) => void
}) {
  const common = { disabled, 'aria-label': field.label }
  let control
  if (field.type === 'TEXTAREA') {
    control = <textarea {...common} value={typeof value === 'string' ? value : ''}
      maxLength={field.maxLength ?? undefined} placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)} />
  } else if (field.type === 'SELECT') {
    control = <select {...common} value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">请选择</option>
      {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  } else if (field.type === 'BOOLEAN') {
    control = <select {...common} value={typeof value === 'boolean' ? String(value) : ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}>
      <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
    </select>
  } else if (field.type === 'NUMBER') {
    control = <span className="doctor-structured-note__number"><input {...common} type="number"
      value={typeof value === 'number' ? value : ''} min={field.minimum ?? undefined} max={field.maximum ?? undefined}
      placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
      {field.unit && <small>{field.unit}</small>}</span>
  } else {
    control = <input {...common} type={field.type === 'DATE' ? 'date' : 'text'}
      value={typeof value === 'string' ? value : ''} maxLength={field.maxLength ?? undefined}
      placeholder={field.placeholder ?? undefined} onChange={(event) => onChange(event.target.value)} />
  }
  return <FormField label={field.label} required={field.required} error={error}>{control}</FormField>
}

function NoteTemplateBar({ api, disabled, currentContent, onApply }: {
  api: RhnApi
  disabled: boolean
  currentContent: () => OutpatientNoteTemplateContent
  onApply: (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [managerOpen, setManagerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<OutpatientNoteTemplateScope>('PERSONAL')
  const [checked, setChecked] = useState<Set<NoteTemplateField>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const [notice, setNotice] = useState('')
  const templates = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
  })
  const selected = templates.data?.find((value) => value.id === selectedId)
  useEffect(() => {
    if (!selectedId && templates.data?.length) setSelectedId(templates.data[0].id)
    if (selectedId && templates.data && !templates.data.some((value) => value.id === selectedId)) {
      setSelectedId(templates.data[0]?.id ?? '')
    }
  }, [selectedId, templates.data])
  const save = useMutation({
    mutationFn: () => api.outpatientNoteTemplates.create({
      scopeType: scope, name: name.trim(), description: description.trim() || undefined,
      specialtyCode: 'GENERAL_PRACTICE', content: currentContent(),
    }),
    onSuccess: async (value) => {
      setSaveOpen(false); setName(''); setDescription(''); setSelectedId(value.id)
      setNotice(`已保存${value.scopeType === 'PERSONAL' ? '个人' : '科室'}病历模板“${value.name}”。`)
      await queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    },
  })
  const apply = useMutation({
    mutationFn: (value: OutpatientNoteTemplate) => api.outpatientNoteTemplates.use(value.id),
    onSuccess: (value) => {
      onApply(value, checked, overwrite); setApplyOpen(false)
      setNotice(`已带入“${value.name}”的 ${checked.size} 个病历段落，请核对后保存。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    },
  })
  const openApply = () => {
    if (!selected) return
    setChecked(new Set(noteTemplateFields.filter(({ key }) => Boolean(selected.content[key]?.trim()))
      .map(({ key }) => key)))
    setOverwrite(false); setApplyOpen(true)
  }
  const toggleField = (key: NoteTemplateField) => setChecked((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const error = templates.error || save.error || apply.error

  return <div className="doctor-note-template-bar">
    <div>
      <strong>病历模板</strong>
      <select aria-label="选择病历模板" value={selectedId}
        onChange={(event) => { setSelectedId(event.target.value); setNotice('') }}>
        {templates.data?.length ? templates.data.map((value) => <option key={value.id} value={value.id}>
          {value.scopeType === 'PERSONAL' ? '个人' : '科室'} · {value.name}
        </option>) : <option value="">暂无模板</option>}
      </select>
      <Button size="sm" type="button" variant="secondary" disabled={disabled || !selected}
        onClick={openApply}>带入</Button>
      <Button size="sm" type="button" variant="text" disabled={disabled}
        onClick={() => setSaveOpen(true)}>存为模板</Button>
    </div>
    {templates.isPending && <small>正在加载模板…</small>}
    {selected && <small>{selected.description || '受控病历段落模板'}
      {selected.useCount > 0 ? ` · 已用 ${selected.useCount} 次` : ''}</small>}
    {notice && <span>{notice}</span>}
    {error && <Alert>{errorMessage(error)}</Alert>}
    {saveOpen && <Dialog title="保存病历模板" eyebrow="门诊病历 · 书写效率"
      description="仅保存主诉、现病史、既往史、查体所见和诊疗计划；患者信息、生命体征、诊断及医嘱不会进入模板。"
      onClose={() => !save.isPending && setSaveOpen(false)} footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={() => setSaveOpen(false)}>取消</Button>
        <Button busy={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>确认保存</Button>
      </>}>
      <div className="ui-form-grid">
        <FormField label="模板名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="如：高血压常规复诊病历" /></FormField>
        <FormField label="使用范围"><select value={scope}
          onChange={(event) => setScope(event.target.value as OutpatientNoteTemplateScope)}>
          <option value="PERSONAL">仅本人</option><option value="DEPARTMENT">本科室</option>
        </select></FormField>
        <FormField className="ui-form-span-2" label="模板说明"><textarea value={description} maxLength={500}
          onChange={(event) => setDescription(event.target.value)} placeholder="适用场景和书写提醒（可选）" /></FormField>
      </div>
      <div className="doctor-note-template-facts">
        {noteTemplateFields.map(({ key, label }) => <span key={key} className={currentContent()[key]?.trim() ? 'is-ready' : ''}>
          {currentContent()[key]?.trim() ? '✓' : '○'} {label}</span>)}
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </Dialog>}
    {applyOpen && selected && <Dialog title={`带入“${selected.name}”`} eyebrow="病历模板"
      description="模板只修改当前页面草稿，不会自动保存或签署病历。默认保留已经书写的内容。"
      closeOnBackdrop={false} onClose={() => !apply.isPending && setApplyOpen(false)} footer={<>
        <Button variant="secondary" disabled={apply.isPending} onClick={() => setApplyOpen(false)}>取消</Button>
        <Button busy={apply.isPending} disabled={checked.size === 0}
          onClick={() => apply.mutate(selected)}>确认带入</Button>
      </>}>
      <label className="doctor-note-template-mode"><input type="checkbox" checked={overwrite}
        onChange={(event) => setOverwrite(event.target.checked)} />
        <span><strong>覆盖所选字段已有内容</strong><small>未勾选时只填充当前为空的段落。</small></span></label>
      <div className="doctor-note-template-preview">
        {noteTemplateFields.filter(({ key }) => selected.content[key]?.trim()).map(({ key, label }) => <label key={key}>
          <input type="checkbox" checked={checked.has(key)} onChange={() => toggleField(key)} />
          <span><strong>{label}</strong><small>{selected.content[key]}</small></span>
        </label>)}
      </div>
      {apply.error && <Alert>{errorMessage(apply.error)}</Alert>}
    </Dialog>}
  </div>
}

export function diagnosisDraftSignature(values: DiagnosisInput[]) {
  return values.map((value) => `${value.conceptId ?? ''}|${value.diagnosisDomain ?? ''}|${value.code}|${value.display}|${value.type}`)
    .sort().join('\n')
}

function ClinicalRecordPanel({ encounter, allergies, allergyState, api, historyCopy, onHistoryCopyConsumed,
  aiDraft, onAiDraftConsumed, onAiContextChange, onDraftStateChange, onRefresh }: {
  encounter: Encounter; allergies: AllergyIntolerance[]; allergyState: ClinicalAiDraftContext['allergyState']
  api: RhnApi; historyCopy: HistoryCopyDraft | null
  aiDraft: ClinicalAiDraftRequest | null; onAiDraftConsumed: () => void
  onAiContextChange: (value: ClinicalAiDraftContext | null) => void
  onHistoryCopyConsumed: () => void; onDraftStateChange: (value: EncounterDraftState) => void
  onRefresh: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [diagnosisSearch, setDiagnosisSearch] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const [diagnosisDomainFilter, setDiagnosisDomainFilter] = useState('')
  const [diagnosisType, setDiagnosisType] = useState<DiagnosisInput['type']>('SECONDARY')
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
  const [medicationDrafts, setMedicationDrafts] = useState<MedicationPlanDraft[]>([])
  const [serviceDrafts, setServiceDrafts] = useState<ServicePlanDraft[]>([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [diagnosisError, setDiagnosisError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [selectedNoteFormId, setSelectedNoteFormId] = useState('')
  const [structuredValues, setStructuredValues] = useState<Record<string, unknown>>({})
  const [structuredBaseline, setStructuredBaseline] = useState(structuredFormSignature('', {}))
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({})
  const pendingRecordCommand = useRef<{ fingerprint: string; commandCode: string } | null>(null)
  const processedAiDraft = useRef<string | null>(null)
  const serverStateInitialized = useRef(false)
  const acceptNextServerState = useRef(false)
  const { register, handleSubmit, reset, getValues, watch, formState } = useForm<RecordForm>({
    resolver: zodResolver(recordSchema),
    defaultValues: { chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '',
      systolic: undefined, diastolic: undefined, temperature: undefined, pulseRate: undefined,
      respiratoryRate: undefined, heightCm: undefined, weightKg: undefined, oxygenSaturation: undefined },
  })
  const documents = useQuery({ queryKey: ['doctor-document', encounter.id], queryFn: () => api.clinicalDocuments.byEncounter(encounter.id) })
  const noteForms = useQuery({ queryKey: ['outpatient-note-forms', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteForms.list('GENERAL_PRACTICE') })
  const document = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
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
    encounter.diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type, managementPrograms }) =>
      ({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type, managementPrograms })))
  useEffect(() => {
    const hasLocalWork = formState.isDirty || structuredChanged || diagnosesChanged
      || medicationDrafts.length > 0 || serviceDrafts.length > 0
    if (serverStateInitialized.current && hasLocalWork && !acceptNextServerState.current) return
    reset({ chiefComplaint: encounter.chiefComplaint ?? '', presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '', physicalExam: document?.content.physicalExam ?? '',
      treatmentPlan: document?.content.treatmentPlan ?? '', systolic: encounter.systolic, diastolic: encounter.diastolic,
      temperature: document?.content.vitalSigns?.temperature, pulseRate: document?.content.vitalSigns?.pulseRate,
      respiratoryRate: document?.content.vitalSigns?.respiratoryRate, heightCm: document?.content.vitalSigns?.heightCm,
      weightKg: document?.content.vitalSigns?.weightKg, oxygenSaturation: document?.content.vitalSigns?.oxygenSaturation })
    setDiagnoses(encounter.diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementPrograms }) => ({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementPrograms })))
    const savedFormId = document?.content.structuredForm?.versionId ?? ''
    const savedValues = document?.content.structuredData ?? {}
    setSelectedNoteFormId(savedFormId)
    setStructuredValues(savedValues)
    setStructuredErrors({})
    setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))
    serverStateInitialized.current = true
    acceptNextServerState.current = false
  }, [diagnosesChanged, document, encounter, formState.isDirty, medicationDrafts.length, reset,
    serviceDrafts.length, structuredChanged])
  useEffect(() => {
    setMedicationDrafts([])
    setServiceDrafts([])
  }, [encounter.id])
  useEffect(() => {
    if (!historyCopy || documents.isPending) return
    reset({ ...getValues(), ...historyCopy.record }, { keepDefaultValues: true })
    if (historyCopy.diagnoses?.length) {
      setDiagnoses((current) => {
        const currentCodes = new Set(current.map((item) => item.code))
        const hasPrimary = current.some((item) => item.type === 'PRIMARY')
        return [...current, ...historyCopy.diagnoses!.filter((item) => !currentCodes.has(item.code)).map((item) => ({
          ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type,
        }))]
      })
    }
    setCopyNotice(`已从 ${formatTime(historyCopy.sourceRegisteredAt)}（${historyCopy.sourceEncounterNo}）带入所选内容，请核对后保存。`)
    onHistoryCopyConsumed()
  }, [documents.isPending, getValues, historyCopy, onHistoryCopyConsumed, reset])
  const save = useMutation({
    mutationFn: (form: RecordForm) => {
      if (!diagnoses.some((item) => item.type === 'PRIMARY')) throw new Error('请确认一个主要诊断')
      const formErrors = validateStructuredForm(selectedNoteForm, structuredValues)
      setStructuredErrors(formErrors)
      if (Object.keys(formErrors).length) throw new Error(Object.values(formErrors)[0])
      const content = {
        chiefComplaint: form.chiefComplaint, presentIllness: form.presentIllness, medicalHistory: form.medicalHistory,
        physicalExam: form.physicalExam, treatmentPlan: form.treatmentPlan,
        systolic: form.systolic, diastolic: form.diastolic, temperature: form.temperature,
        pulseRate: form.pulseRate, respiratoryRate: form.respiratoryRate, heightCm: form.heightCm,
        weightKg: form.weightKg, oxygenSaturation: form.oxygenSaturation,
        noteFormVersionId: selectedNoteFormId || undefined,
        structuredData: selectedNoteFormId ? structuredValues : undefined,
        diagnoses: diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type }) => ({
          conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
        })),
      }
      const fingerprint = JSON.stringify(content)
      if (pendingRecordCommand.current?.fingerprint !== fingerprint) {
        pendingRecordCommand.current = { fingerprint, commandCode: commandCode('RECORD', encounter.id) }
      }
      return api.encounters.recordClinicalData(encounter.id, {
        commandCode: pendingRecordCommand.current.commandCode, ...content,
      })
    },
    onSuccess: async () => { pendingRecordCommand.current = null; acceptNextServerState.current = true; setCopyNotice('')
      await queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter.id] }); await onRefresh() },
  })
  const sign = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(document!.id, document!.currentVersion),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter.id] }); await onRefresh() },
  })
  const businessBusy = save.isPending || sign.isPending || orderBusy
  const aiContextBusy = businessBusy || documents.isPending || Boolean(documents.error)
  const documentStatus = documents.isPending ? 'LOADING'
    : documents.error ? 'ERROR' : document?.status ?? 'NONE'
  const buildAiContext = () => aiContextFromDraft(getValues(), diagnoses, encounter, {
    document, documentStatus, structuredFormId: selectedNoteFormId,
    structuredFormVersion: selectedNoteForm?.version, structuredValues,
    medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy,
  })
  useEffect(() => {
    const publish = () => onAiContextChange(aiContextFromDraft(getValues(), diagnoses, encounter, {
      document, documentStatus, structuredFormId: selectedNoteFormId,
      structuredFormVersion: selectedNoteForm?.version, structuredValues,
      medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy,
    }))
    publish()
    const subscription = watch(publish)
    return () => subscription.unsubscribe()
  }, [aiContextBusy, allergies, allergyState, diagnoses, document, documentStatus, encounter, getValues,
    medicationDrafts, onAiContextChange, selectedNoteForm?.version, selectedNoteFormId, serviceDrafts,
    structuredValues, watch])
  useEffect(() => () => onAiContextChange(null), [onAiContextChange])
  useEffect(() => {
    if (!aiDraft || processedAiDraft.current === aiDraft.requestId) return
    processedAiDraft.current = aiDraft.requestId
    const currentContext = buildAiContext()
    const wrongPatient = aiDraft.encounterId !== encounter.id || aiDraft.residentId !== encounter.residentId
    if (wrongPatient || businessBusy
      || clinicalAiContextFingerprint(currentContext) !== aiDraft.contextFingerprint) {
      setCopyNotice(wrongPatient
        ? '当前患者或就诊已切换，系统已拒绝带入智医助理建议。'
        : businessBusy ? '当前正在保存、签署或处理医嘱，系统已拒绝带入智医助理建议，请稍后重试。'
          : '智医助理建议生成后当前草稿已变化，系统已拒绝带入；请重新分析。')
      onAiDraftConsumed(); return
    }
    if (aiDraft.planTemplate && allergyState !== 'READY') {
      setCopyNotice('患者过敏信息尚未就绪，系统已拒绝带入诊疗方案；请核对后重新分析。')
      onAiDraftConsumed(); return
    }
    if (aiDraft.recordDraft) {
      reset(mergeAiRecordDraft(getValues(), aiDraft.recordDraft), { keepDefaultValues: true })
    }
    const diagnosesWithAi = aiDraft.diagnoses?.length
      ? mergeAiDiagnoses(diagnoses, aiDraft.diagnoses) : diagnoses
    if (aiDraft.diagnoses?.length) setDiagnoses(diagnosesWithAi)
    if (aiDraft.planTemplate) {
      stageTemplate(aiDraft.planTemplate, diagnosesWithAi, setDiagnoses, medicationDrafts, setMedicationDrafts,
        serviceDrafts, setServiceDrafts, aiDraft.allergyOverrideReason, aiDraft.allergyReviewConfirmed === true)
    }
    setCopyNotice(`已带入${aiDraft.sourceLabel}，内容仍是草稿，请逐项核对后保存和开立。`)
    onAiDraftConsumed()
  }, [aiDraft, allergies, allergyState, businessBusy, diagnoses, document, documentStatus, encounter,
    getValues, medicationDrafts, onAiDraftConsumed, reset, selectedNoteForm?.version, selectedNoteFormId,
    serviceDrafts, structuredValues])
  useEffect(() => {
    onDraftStateChange({ recordChanged: formState.isDirty || structuredChanged, diagnosesChanged,
      medicationDraftCount: medicationDrafts.length, serviceDraftCount: serviceDrafts.length,
      busy: businessBusy })
  }, [diagnosesChanged, formState.isDirty, medicationDrafts.length, onDraftStateChange, orderBusy,
    save.isPending, serviceDrafts.length, sign.isPending, structuredChanged, businessBusy])
  const signed = document?.status === 'SIGNED'
  const addDiagnosis = () => {
    const selected = diagnosisSearch?.raw
    if (!selected) { setDiagnosisError('请先检索并选择诊断'); return }
    if (diagnoses.some((item) => item.conceptId === selected.id
      || (item.diagnosisDomain === selected.sdDiagnosisDomain && item.code === selected.code))) {
      setDiagnosisError('该诊断已经录入'); return
    }
    const diagnosisGroupId = selected.sdDiagnosisDomain === 'WESTERN_MEDICINE'
      ? undefined : `TCM-${encounter.id}`
    setDiagnoses((current) => [
      ...current.map((item) => diagnosisType === 'PRIMARY' ? { ...item, type: 'SECONDARY' as const } : item),
      { conceptId: selected.id, diagnosisDomain: selected.sdDiagnosisDomain, diagnosisGroupId,
        code: selected.code, display: selected.display, type: diagnosisType,
        managementPrograms: selected.managementPrograms.map((program) => ({ id: program.id, code: program.code,
          name: program.name, managementType: program.sdManagementType, triggerAction: program.sdTriggerAction,
          reportCardType: program.reportCardType, reportDeadlineHours: program.reportDeadlineHours })) },
    ])
    setDiagnosisSearch(undefined)
    setDiagnosisType('SECONDARY')
    setDiagnosisError('')
  }
  const makePrimary = (key: string) => setDiagnoses((current) => current.map((item) => ({
    ...item, type: (item.conceptId || `${item.diagnosisDomain}|${item.code}`) === key ? 'PRIMARY' : 'SECONDARY',
  })))
  const removeDiagnosis = (key: string) => setDiagnoses((current) => current.filter((item) =>
    (item.conceptId || `${item.diagnosisDomain}|${item.code}`) !== key))
  const currentNoteContent = (): OutpatientNoteTemplateContent => {
    const value = getValues()
    return { chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
      medicalHistory: value.medicalHistory, physicalExam: value.physicalExam, treatmentPlan: value.treatmentPlan }
  }
  const applyNoteTemplate = (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => {
    const current = getValues()
    reset({ ...current, ...mergeNoteTemplateContent(current, template.content, fields, overwrite) },
      { keepDefaultValues: true })
    setCopyNotice(`已从病历模板“${template.name}”带入所选段落，请结合本次患者情况核对后保存。`)
  }
  const error = save.error || sign.error || documents.error || noteForms.error

  return <section className="doctor-clinical-cockpit">
    <div className="doctor-record-column"><Panel className="doctor-record-panel">
      <PanelHead title="门诊病历" meta={signed ? '已签署' : '病历草稿 · 保存后签署'} />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {copyNotice && <div className="doctor-history-copy-notice"><Icon name="roadmap" /><span>{copyNotice}</span></div>}
      <NoteTemplateBar api={api} disabled={signed} currentContent={currentNoteContent}
        onApply={applyNoteTemplate} />
      <div className="doctor-note-form-mode">
        <label><span>书写模式</span><select aria-label="病历书写模式" value={selectedNoteFormId} disabled={signed}
          onChange={(event) => {
            setSelectedNoteFormId(event.target.value); setStructuredValues({}); setStructuredErrors({})
          }}>
          <option value="">基础门诊病历（简易）</option>
          {noteForms.data?.map((value) => <option key={value.id} value={value.id}>
            {value.name} · V{value.version}
          </option>)}
          {snapshotForm && !noteForms.data?.some((value) => value.id === snapshotForm.id)
            && <option value={snapshotForm.id}>{snapshotForm.name} · V{snapshotForm.version}（文书快照）</option>}
        </select></label>
        <small>{selectedNoteForm
          ? `${selectedNoteForm.description || '按科室定义补充结构化字段'}；保存时会固化 V${selectedNoteForm.version} 定义快照。`
          : '保留基层常用的简易书写方式；需要精细记录时再选择科室结构。'}</small>
      </div>
      <form className="clinical-form doctor-record-form" noValidate onSubmit={handleSubmit((value) => save.mutate(value))}>
        <FormField className="doctor-record-field--chief" label="主诉" required error={formState.errors.chiefComplaint?.message}>
          <textarea {...register('chiefComplaint')} disabled={signed} placeholder="症状、持续时间及本次就诊原因" />
        </FormField>
        <FormField label="现病史" error={formState.errors.presentIllness?.message}>
          <textarea {...register('presentIllness')} disabled={signed} placeholder="起病、演变、伴随症状及诊治经过" />
        </FormField>
        <FormField label="既往史" error={formState.errors.medicalHistory?.message}>
          <textarea {...register('medicalHistory')} disabled={signed} placeholder="既往疾病、手术、过敏及长期用药" />
        </FormField>
        <div className="doctor-physical-exam" role="group" aria-labelledby="doctor-physical-exam-label">
          <span id="doctor-physical-exam-label" className="doctor-physical-exam__label">体格检查</span>
          <div className="doctor-vital-grid">
            <label><span>体温</span><span><input type="number" step="0.1" disabled={signed}
              {...register('temperature', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>℃</small></span></label>
            <label><span>脉搏</span><span><input type="number" disabled={signed}
              {...register('pulseRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>次/分</small></span></label>
            <label><span>呼吸</span><span><input type="number" disabled={signed}
              {...register('respiratoryRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>次/分</small></span></label>
            <label><span>血氧</span><span><input type="number" disabled={signed}
              {...register('oxygenSaturation', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>%</small></span></label>
            <label className="doctor-vital-blood-pressure"><span>血压</span><span>
              <input aria-label="收缩压" type="number" {...register('systolic', { valueAsNumber: true })} disabled={signed} />
              <b aria-hidden="true">/</b>
              <input aria-label="舒张压" type="number" {...register('diastolic', { valueAsNumber: true })} disabled={signed} />
              <small>mmHg</small></span></label>
            <label><span>身高</span><span><input type="number" step="0.1" disabled={signed}
              {...register('heightCm', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>cm</small></span></label>
            <label><span>体重</span><span><input type="number" step="0.1" disabled={signed}
              {...register('weightKg', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>kg</small></span></label>
          </div>
          {Object.values({ systolic: formState.errors.systolic, diastolic: formState.errors.diastolic,
            temperature: formState.errors.temperature, pulseRate: formState.errors.pulseRate,
            respiratoryRate: formState.errors.respiratoryRate, heightCm: formState.errors.heightCm,
            weightKg: formState.errors.weightKg, oxygenSaturation: formState.errors.oxygenSaturation })
            .find(Boolean)?.message && <small className="ui-field__message ui-field__error">请检查生命体征录入范围</small>}
        </div>
        <FormField label="查体所见" error={formState.errors.physicalExam?.message}>
          <textarea {...register('physicalExam')} disabled={signed} placeholder="阳性体征及必要的阴性体征" />
        </FormField>
        <FormField label="诊疗计划" error={formState.errors.treatmentPlan?.message}>
          <textarea {...register('treatmentPlan')} disabled={signed} placeholder="检查、治疗、用药和随访安排" />
        </FormField>
        {selectedNoteForm && <StructuredNoteForm form={selectedNoteForm} values={structuredValues}
          errors={structuredErrors} disabled={signed} onChange={(code, value) => {
            setStructuredValues((current) => ({ ...current, [code]: value }))
            setStructuredErrors((current) => ({ ...current, [code]: '' }))
          }} />}
        <div className="ui-form-actions doctor-record-actions">
          {document && signed && <Button type="button" variant="secondary"
            onClick={() => setNotePrintOpen(true)}><Icon name="print" />打印病历</Button>}
          {document && !signed && <Button type="button" variant="secondary" busy={sign.isPending}
            disabled={formState.isDirty || structuredChanged || diagnosesChanged || save.isPending}
            title={formState.isDirty || structuredChanged || diagnosesChanged ? '请先保存当前病历和诊断修改' : '签署当前已保存版本'}
            onClick={() => sign.mutate()}>签署当前版本</Button>}
          <Button type="submit" busy={save.isPending} disabled={signed}>保存病历草稿</Button>
        </div>
      </form>
    </Panel>
    </div>
    <aside className="doctor-clinical-aside" aria-label="诊断与医嘱工作区">
      <Panel className="doctor-diagnosis-panel">
        <PanelHead title="诊断" meta={`${diagnoses.length} 项`} actions={
          <PlanTemplatePanel diagnoses={diagnoses} setDiagnoses={setDiagnoses}
            medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
            serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts}
            allergies={allergies} api={api} disabled={signed} />} />
        <div className="doctor-diagnosis-content">
          <div className="doctor-diagnosis-editor">
            <FormField label="诊断体系"><select value={diagnosisDomainFilter} disabled={signed}
              onChange={(event) => { setDiagnosisDomainFilter(event.target.value); setDiagnosisSearch(undefined) }}>
              <option value="">全部体系</option><option value="WESTERN_MEDICINE">西医诊断</option>
              <option value="TCM_DISEASE">中医病名</option><option value="TCM_SYNDROME">中医证候</option>
            </select></FormField>
            <FormField label="诊断检索" required error={diagnosisError || undefined}>
              <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={diagnosisSearch}
                filterResult={(item) => !diagnosisDomainFilter || item.sdDiagnosisDomain === diagnosisDomainFilter}
                disabled={signed} onChange={(option) => { setDiagnosisSearch(option); setDiagnosisError('') }} />
            </FormField>
            <FormField label="诊断类型"><select value={diagnosisType} disabled={signed}
              onChange={(event) => setDiagnosisType(event.target.value as DiagnosisInput['type'])}>
              <option value="SECONDARY">次要诊断</option><option value="PRIMARY">主要诊断</option>
            </select></FormField>
            <Button type="button" variant="secondary" disabled={signed || !diagnosisSearch} onClick={addDiagnosis}>加入诊断</Button>
          </div>
          <div className="doctor-diagnosis-list" aria-label="本次诊断">
            {diagnoses.length === 0 ? <p>尚未录入诊断</p> : diagnoses.map((item) => {
              const key = item.conceptId || `${item.diagnosisDomain}|${item.code}`
              return <div key={key}>
              <StatusBadge tone={item.type === 'PRIMARY' ? 'success' : 'neutral'}>{item.type === 'PRIMARY' ? '主要' : '次要'}</StatusBadge>
              <span><strong>{item.display}</strong><small>{item.code} · {
                item.diagnosisDomain === 'TCM_DISEASE' ? '中医病名'
                  : item.diagnosisDomain === 'TCM_SYNDROME' ? '中医证候' : '西医诊断'
              }</small>{item.managementPrograms?.length ? <small className="doctor-diagnosis-management-tags">
                {item.managementPrograms.map((program) => program.name).join(' · ')}</small> : null}</span>
              {item.type !== 'PRIMARY' && <Button type="button" size="sm" variant="text" disabled={signed}
                onClick={() => makePrimary(key)}>设为主要</Button>}
              <Button type="button" size="sm" variant="text" disabled={signed}
                onClick={() => removeDiagnosis(key)}>移除</Button>
            </div>})}
          </div>
          {diagnoses.some((item) => item.managementPrograms?.length) && <Alert tone="warning"
            className="doctor-diagnosis-management-alert">
            <strong>公共卫生管理提示</strong>
            <span>{Array.from(new Set(diagnoses.flatMap((item) => item.managementPrograms?.map((program) =>
              `${item.display}：${program.name}${program.managementType === 'DISEASE_REPORT' ? '（需生成报卡草稿）' : '（需确认是否纳入管理）'}`) ?? []))).join('；')}</span>
          </Alert>}
        </div>
      </Panel>
      <OrdersPanel encounter={encounter} allergies={allergies} api={api}
        medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
        serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} onBusyChange={setOrderBusy} />
    </aside>
    {notePrintOpen && document && <ControlledPrintDialog api={api} title="打印门诊病历"
      description={`已签署版本 V${document.currentVersion} · 每次生成和重打都会留痕。`}
      sourceLabel={`${document.title} · V${document.currentVersion}`}
      generate={(purpose, copies) => api.printing.clinicalDocument(document.id, purpose, copies)}
      onClose={() => setNotePrintOpen(false)} />}
  </section>
}

function PlanTemplatePanel({ diagnoses, setDiagnoses, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, allergies, api, disabled }: {
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  allergies: AllergyIntolerance[]
  api: RhnApi
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const [managerOpen, setManagerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<OutpatientPlanTemplateScope>('PERSONAL')
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [notice, setNotice] = useState('')
  const templates = useQuery({
    queryKey: ['outpatient-plan-templates'], queryFn: () => api.outpatientPlanTemplates.list(), enabled: managerOpen,
  })
  const selected = templates.data?.find((value) => value.id === selectedId)
  useEffect(() => {
    if (!selectedId && templates.data?.length) setSelectedId(templates.data[0].id)
    if (selectedId && templates.data && !templates.data.some((value) => value.id === selectedId)) {
      setSelectedId(templates.data[0]?.id ?? '')
    }
  }, [selectedId, templates.data])
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const matchedAllergies = selected?.medications.flatMap((medication) => drugAllergies.filter((allergy) =>
    allergy.substanceCode?.toLowerCase() === medication.medicationCode.toLowerCase())) ?? []
  const draftCount = diagnoses.length + medicationDrafts.length + serviceDrafts.length
  const save = useMutation({
    mutationFn: () => api.outpatientPlanTemplates.create({
      scopeType: scope, name: name.trim(), description: description.trim() || undefined,
      diagnoses,
      medications: medicationDrafts.filter((item) => Boolean(item.request.medicationId)).map((item) => ({
        medicationId: item.request.medicationId!, catalogItemId: item.request.catalogItemId,
        packageId: item.request.packageId, doseValue: item.request.doseValue, doseUnit: item.request.doseUnit,
        routeCode: item.request.routeCode, frequencyCode: item.request.frequencyCode,
        durationValue: item.request.durationValue, durationUnit: item.request.durationUnit,
        quantity: item.request.quantity, quantityUnit: item.request.quantityUnit,
        substitutionAllowed: item.request.substitutionAllowed, selfProvided: item.request.selfProvided,
        medicationInstruction: item.request.medicationInstruction, priceType: item.request.priceType,
        pricingRequired: item.request.pricingRequired, reason: item.request.reason,
      })),
      services: serviceDrafts.map((item) => ({
        catalogItemId: item.catalogItemId, quantity: item.quantity, unitCode: item.unitCode,
        priceType: 'SALE', pricingRequired: true, reason: '门诊诊疗申请',
        clinicalDescription: item.clinicalDescription || '常用诊疗方案',
      })),
    }),
    onSuccess: async (value) => {
      await queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      setSelectedId(value.id); setSaveOpen(false); setName(''); setDescription('')
      setNotice(`“${value.name}”已保存为${value.scopeType === 'PERSONAL' ? '个人' : '科室'}常用方案。`)
    },
  })
  const apply = useMutation({
    mutationFn: (value: OutpatientPlanTemplate) => api.outpatientPlanTemplates.use(value.id),
    onSuccess: (value) => {
      stageTemplate(value, diagnoses, setDiagnoses, medicationDrafts, setMedicationDrafts,
        serviceDrafts, setServiceDrafts, overrideReason.trim() || undefined)
      setApplyOpen(false); setSafetyConfirmed(false); setOverrideReason('')
      setNotice(`已带入“${value.name}”，新增内容仍是草稿，请核对后保存病历和开立医嘱。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
    },
  })
  const openApply = () => {
    if (!selected) return
    setSafetyConfirmed(selected.medications.length === 0)
    setOverrideReason('')
    setManagerOpen(false)
    setApplyOpen(true)
  }
  const error = templates.error || save.error || apply.error

  return <>
    <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setManagerOpen(true)}>常用方案</Button>
    {managerOpen && <Dialog title="常用诊疗方案" eyebrow="诊疗方案" size="wide"
      onClose={() => setManagerOpen(false)} footer={<Button variant="secondary" onClick={() => setManagerOpen(false)}>关闭</Button>}>
      <div className="doctor-plan-template-content doctor-plan-template-content--dialog">
        {error && <Alert>{errorMessage(error)}</Alert>}
        {notice && <div className="doctor-plan-template-notice">{notice}</div>}
        {templates.isPending ? <LoadingState label="正在加载常用方案…" /> : <>
          <div className="doctor-plan-template-actions">
            <select aria-label="选择常用诊疗方案" value={selectedId}
              onChange={(event) => { setSelectedId(event.target.value); setNotice('') }}>
              {templates.data?.length ? templates.data.map((value) => <option key={value.id} value={value.id}>
                {value.scopeType === 'PERSONAL' ? '个人' : '科室'} · {value.name}
              </option>) : <option value="">暂无常用方案</option>}
            </select>
            <Button size="sm" variant="secondary" disabled={!selected} onClick={openApply}>带入草稿</Button>
            <Button size="sm" disabled={draftCount === 0}
              onClick={() => { setManagerOpen(false); setSaveOpen(true) }}>保存当前方案</Button>
          </div>
          {selected && <div className="doctor-plan-template-summary">
            <span>{selected.description || selected.name}</span>
            <small>诊断 {selected.diagnoses.length} · 药品 {selected.medications.length} · 诊疗项目 {selected.services.length}</small>
          </div>}
        </>}
      </div>
    </Dialog>}
    {saveOpen && <Dialog title="保存为常用诊疗方案" eyebrow="门诊医生站 · 效率工具"
      description="保存当前诊断和待确认医嘱；患者病历正文、生命体征及已开立医嘱不会写入模板。"
      onClose={() => !save.isPending && setSaveOpen(false)} footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={() => setSaveOpen(false)}>取消</Button>
        <Button busy={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>确认保存</Button>
      </>}>
      <div className="ui-form-grid">
        <FormField label="方案名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="如：高血压常规复诊" /></FormField>
        <FormField label="使用范围"><select value={scope}
          onChange={(event) => setScope(event.target.value as OutpatientPlanTemplateScope)}>
          <option value="PERSONAL">仅本人</option><option value="DEPARTMENT">本科室</option>
        </select></FormField>
        <FormField className="ui-form-span-2" label="方案说明"><textarea value={description} maxLength={500}
          onChange={(event) => setDescription(event.target.value)} placeholder="适用场景、注意事项（可选）" /></FormField>
      </div>
      <div className="doctor-plan-review">
        <div><span>诊断</span><strong>{diagnoses.length} 条</strong></div>
        <div><span>待确认药品</span><strong>{medicationDrafts.length} 条</strong></div>
        <div><span>待确认诊疗项目</span><strong>{serviceDrafts.length} 条</strong></div>
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </Dialog>}
    {applyOpen && selected && <Dialog title={`带入“${selected.name}”`} eyebrow="常用诊疗方案"
      description="方案内容只加入当前草稿，不会自动保存病历、开立处方或产生费用。"
      closeOnBackdrop={false} onClose={() => !apply.isPending && setApplyOpen(false)} footer={<>
        <Button variant="secondary" disabled={apply.isPending} onClick={() => setApplyOpen(false)}>取消</Button>
        <Button busy={apply.isPending} disabled={selected.medications.length > 0
          && (!safetyConfirmed || matchedAllergies.length > 0 && !overrideReason.trim())}
          onClick={() => apply.mutate(selected)}>确认带入草稿</Button>
      </>}>
      <div className="doctor-plan-review">
        <div><span>诊断</span><strong>{selected.diagnoses.length} 条</strong></div>
        <div><span>药品</span><strong>{selected.medications.length} 条</strong></div>
        <div><span>诊疗项目</span><strong>{selected.services.length} 条</strong></div>
      </div>
      {selected.medications.length > 0 && <div className="doctor-template-safety-review">
        <label><input type="checkbox" checked={safetyConfirmed}
          onChange={(event) => setSafetyConfirmed(event.target.checked)} />
          <span><strong>已核对患者过敏信息及方案内全部药品</strong>
            <small>带入后开立时仍会执行药品有效性、机构目录、价格和过敏规则校验。</small></span></label>
        {matchedAllergies.length > 0 && <FormField label="命中过敏原，继续带入的临床理由" required>
          <textarea value={overrideReason} maxLength={1000} onChange={(event) => setOverrideReason(event.target.value)}
            placeholder={`命中：${[...new Set(matchedAllergies.map((item) => item.substanceDisplay))].join('、')}`} />
        </FormField>}
      </div>}
      {apply.error && <Alert>{errorMessage(apply.error)}</Alert>}
    </Dialog>}
  </>
}

function stageTemplate(value: OutpatientPlanTemplate, currentDiagnoses: DiagnosisInput[],
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>, currentMedications: MedicationPlanDraft[],
  setMedications: Dispatch<SetStateAction<MedicationPlanDraft[]>>, currentServices: ServicePlanDraft[],
  setServices: Dispatch<SetStateAction<ServicePlanDraft[]>>, allergyOverrideReason?: string,
  allergyReviewConfirmed = true) {
  const diagnosisCodes = new Set(currentDiagnoses.map((item) => item.code.toUpperCase()))
  const hasPrimary = currentDiagnoses.some((item) => item.type === 'PRIMARY')
  setDiagnoses((current) => [...current, ...value.diagnoses
    .filter((item) => !diagnosisCodes.has(item.code.toUpperCase()))
    .map((item) => ({ ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type }))])
  const medicationKeys = new Set(currentMedications.map(medicationDraftKey))
  setMedications((current) => [...current, ...value.medications.filter((item) => !medicationKeys.has([
    item.medicationId, item.catalogItemId ?? '', item.routeCode ?? '', item.frequencyCode ?? '',
  ].join('|'))).map((item, index) => ({
    id: globalThis.crypto.randomUUID(), sequence: Date.now() + index, editorMode: item.editorMode, categoryCode: item.categoryCode,
    medicationName: item.medicationName, medicationCode: item.medicationCode,
    preparationSpec: item.preparationSpec, productName: item.productName || item.medicationName,
    request: {
      medicationId: item.medicationId, catalogItemId: item.catalogItemId, packageId: item.packageId,
      doseValue: item.doseValue, doseUnit: item.doseUnit, routeCode: item.routeCode,
      frequencyCode: item.frequencyCode, durationValue: item.durationValue, durationUnit: item.durationUnit,
      quantity: item.quantity, quantityUnit: item.quantityUnit,
      substitutionAllowed: item.substitutionAllowed, selfProvided: item.selfProvided,
      medicationInstruction: item.medicationInstruction, allergyReviewConfirmed,
      allergyOverrideReason, priceType: item.priceType, pricingRequired: item.pricingRequired, reason: item.reason,
    },
  }))])
  const serviceIds = new Set(currentServices.map((item) => item.catalogItemId))
  setServices((current) => [...current, ...value.services.filter((item) => !serviceIds.has(item.catalogItemId))
    .map((item, index) => ({ id: globalThis.crypto.randomUUID(), sequence: Date.now() + index,
      serviceType: item.serviceType, catalogItemId: item.catalogItemId,
      itemCode: item.itemCode, itemName: item.itemName, quantity: item.quantity, unitCode: item.unitCode,
      clinicalDescription: item.clinicalDescription }))])
}

function medicationDraftKey(item: MedicationPlanDraft) {
  return [item.request.medicationId ?? '', item.request.catalogItemId ?? '', item.request.routeCode ?? '',
    item.request.frequencyCode ?? ''].join('|')
}

function OrdersPanel({ encounter, allergies, api, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, onBusyChange }: {
  encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  onBusyChange: (busy: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null)
  useEffect(() => {
    setReviewOpen(false)
  }, [encounter.id])
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id], queryFn: () => api.encounters.prescriptions(encounter.id) })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
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
  const confirmPlan = useMutation({
    mutationFn: async () => {
      const prescriptionByCategory = new Map<string, Prescription>()
      const requestsByPrescription = new Map<string, MedicationRequest[]>()
      for (const value of prescriptions.data ?? []) {
        if (value.status === 'DRAFT') prescriptionByCategory.set(value.categoryCode, value)
        requestsByPrescription.set(value.id, [...value.medicationRequests])
      }
      for (const draft of medicationDrafts) {
        let prescription = prescriptionByCategory.get(draft.categoryCode)
        if (!prescription) {
          prescription = await api.encounters.createPrescription(encounter.id, draft.categoryCode,
            draft.categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊西药/中成药处方')
          prescriptionByCategory.set(draft.categoryCode, prescription)
          requestsByPrescription.set(prescription.id, [])
        }
        const existingRequests = requestsByPrescription.get(prescription.id) ?? []
        const created = await api.encounters.createMedicationRequest(encounter.id, {
          ...draft.request,
          prescriptionId: prescription.id,
          parentRequestId: resolveMedicationPlanParent(existingRequests, draft),
        })
        existingRequests.push(created)
        requestsByPrescription.set(prescription.id, existingRequests)
      }
      for (const draft of serviceDrafts) {
        await api.encounters.createServiceRequest(encounter.id, {
          catalogItemId: draft.catalogItemId, quantity: draft.quantity, unitCode: draft.unitCode,
          priceType: 'SALE', pricingRequired: true, reason: '门诊诊疗申请',
          clinicalDescription: draft.clinicalDescription || '门诊医生站诊疗方案',
        })
      }
      const latest = await api.encounters.prescriptions(encounter.id)
      const draftsToSubmit = latest.filter((value) => value.status === 'DRAFT'
        && value.medicationRequests.some((request) => request.status === 'DRAFT'))
      await Promise.all(draftsToSubmit.map((value) =>
        api.encounters.submitPrescription(encounter.id, value.id, value.revision)))
    },
    onSuccess: async () => {
      setMedicationDrafts([])
      setServiceDrafts([])
      setReviewOpen(false)
      await refresh()
    },
  })
  useEffect(() => onBusyChange(confirmPlan.isPending), [confirmPlan.isPending, onBusyChange])
  const persistedDraftCount = (prescriptions.data ?? []).reduce((sum, value) => sum
    + (value.status === 'DRAFT' ? value.medicationRequests.filter((request) => request.status === 'DRAFT').length : 0), 0)
  const planCount = medicationDrafts.length + serviceDrafts.length + persistedDraftCount
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)
  const error = prescriptions.error || services.error || medications.error
    || cancelService.error || cancelMedication.error || confirmPlan.error

  return <Panel className="doctor-orders-panel">
    <PanelHead title="医嘱和费用信息" meta={<>{orderCount} 项已开立
      {statement.data ? ` · ${money(statement.data.chargeAmount, statement.data.currencyCode)}` : ''}</>}
      actions={<div className="doctor-order-head-actions">
        <StatusBadge tone={planCount ? 'warning' : 'neutral'}>{planCount} 项待确认</StatusBadge>
        <Button size="sm" disabled={planCount === 0} onClick={() => setReviewOpen(true)}>审核保存</Button>
      </div>} />
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <div className="doctor-orders-content">
      {prescriptions.isPending || services.isPending || medications.isPending ? <LoadingState />
        : <UnifiedOrderListEditor encounter={encounter} allergies={allergies}
          prescriptions={prescriptions.data ?? []} medications={medications.data ?? []} services={services.data ?? []}
          medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
          serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} api={api}
          busy={cancelService.isPending || cancelMedication.isPending || confirmPlan.isPending}
          onCancelMedication={(item) => { if (window.confirm(`确认撤销“${item.medicationName}”？`)) cancelMedication.mutate(item) }}
          onCancelService={(item) => { if (window.confirm(`确认撤销“${item.itemName}”？`)) cancelService.mutate(item) }}
          onPrint={setPrintPrescription} />}
    </div>
    {reviewOpen && <Dialog title="审核诊疗方案" eyebrow="本次就诊" size="wide" closeOnBackdrop={false}
      onClose={() => !confirmPlan.isPending && setReviewOpen(false)}
      footer={<><Button variant="secondary" disabled={confirmPlan.isPending} onClick={() => setReviewOpen(false)}>返回修改</Button>
        <Button busy={confirmPlan.isPending} disabled={planCount === 0} onClick={() => confirmPlan.mutate()}>确认保存并开立</Button></>}>
      <div className="doctor-plan-review">
        {confirmPlan.error && <Alert>{errorMessage(confirmPlan.error)}</Alert>}
        <div><span>西药 / 中成药</span><strong>{medicationDrafts.filter((item) => item.editorMode === 'regular').length} 条</strong></div>
        <div><span>草药</span><strong>{medicationDrafts.filter((item) => item.editorMode === 'herbal').length} 条</strong></div>
        <div><span>检验检查与治疗</span><strong>{serviceDrafts.length} 条</strong></div>
        {persistedDraftCount > 0 && <p>已有待提交医嘱 {persistedDraftCount} 条</p>}
      </div>
    </Dialog>}
    {printPrescription && <ControlledPrintDialog api={api} title="打印门诊处方"
      description="仅生效处方可以生成正式 PDF；每次生成和重打都会留痕。"
      sourceLabel={`${prescriptionCategoryLabel(printPrescription.categoryCode)} · ${printPrescription.prescriptionNo}`}
      generate={(purpose, copies) => api.printing.prescription(
        encounter.id, printPrescription.id, purpose, copies)}
      onClose={() => setPrintPrescription(null)} />}
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
  const [downloadError, setDownloadError] = useState('')
  const download = async (value: PrintReceipt) => {
    try { setDownloadError(''); await api.printing.download(value) }
    catch (error) { setDownloadError(`文件已生成，但自动下载失败：${errorMessage(error)}`) }
  }
  const createJob = useMutation({
    mutationFn: () => generate(purpose, copies),
    onSuccess: (value) => { setReceipt(value); onGenerated?.(); void download(value) },
  })
  const reprintJob = useMutation({
    mutationFn: () => api.printing.reprint(receipt!.jobId, copies),
    onSuccess: (value) => { setReceipt(value); onGenerated?.(); void download(value) },
  })
  const busy = createJob.isPending || reprintJob.isPending
  const error = createJob.error || reprintJob.error

  return <Dialog title={title} eyebrow="受控打印" description={description} closeOnBackdrop={false}
    onClose={() => !busy && onClose()} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {receipt
        ? <Button busy={reprintJob.isPending} onClick={() => reprintJob.mutate()}><Icon name="print" />登记重打并下载</Button>
        : <Button busy={createJob.isPending} onClick={() => createJob.mutate()}><Icon name="print" />生成并下载</Button>}
    </>}>
    <div className="print-confirmation doctor-print-confirmation">
      {(error || downloadError) && <Alert>{downloadError || errorMessage(error)}</Alert>}
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
        <header><StatusBadge tone="success">{receipt.requestType === 'REPRINT' ? '重打已登记' : '文件已生成'}</StatusBadge>
          <strong>{receipt.fileName}</strong></header>
        <dl>
          <div><dt>用途与份数</dt><dd>{printPurposeLabel(purpose)} · {receipt.copies} 份</dd></div>
          <div><dt>模板版本</dt><dd>{receipt.templateCode} · V{receipt.templateVersion}</dd></div>
          <div className="doctor-print-digest"><dt>SHA-256</dt><dd><code>{receipt.contentDigest}</code></dd></div>
          <div><dt>任务编号</dt><dd>{receipt.jobId}</dd></div>
        </dl>
        <p>如浏览器未自动保存文件，可登记重打后再次下载；重打复用同一份不可变输出。</p>
      </section>}
    </div>
  </Dialog>
}

function HistoricalReprintDialog({ api, record, onReprinted, onClose }: {
  api: RhnApi; record: PrintRecord; onReprinted: () => void; onClose: () => void
}) {
  const [copies, setCopies] = useState(1)
  const [receipt, setReceipt] = useState<PrintReceipt | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const sourceJob = record.jobs[0]
  const reprint = useMutation({
    mutationFn: () => {
      if (!sourceJob) throw new Error('当前正式输出缺少原始打印任务，无法登记补打')
      return api.printing.reprint(sourceJob.jobId, copies)
    },
    onSuccess: async (value) => {
      setReceipt(value); onReprinted()
      try { setDownloadError(''); await api.printing.download(value) }
      catch (error) { setDownloadError(`补打已登记，但自动下载失败：${errorMessage(error)}`) }
    },
  })
  return <Dialog title="补打历史门诊病历" eyebrow="受控打印 · 复用不可变输出"
    description="补打不会重新渲染病历，将复用原 PDF 并新增一条打印任务留痕。" closeOnBackdrop={false}
    onClose={() => !reprint.isPending && onClose()} footer={<>
      <Button variant="secondary" disabled={reprint.isPending} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {!receipt && <Button busy={reprint.isPending} disabled={!sourceJob} onClick={() => reprint.mutate()}>
        <Icon name="print" />登记补打并下载</Button>}
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
      {receipt && <Alert>补打任务 {receipt.jobId} 已登记，共 {receipt.copies} 份；输出摘要保持不变。</Alert>}
    </div>
  </Dialog>
}

function medicationUsage(item: MedicationRequest) {
  return [
    `${item.quantity} ${item.quantityUnit}`,
    item.doseValue && `${item.doseValue} ${item.doseUnit || ''}`,
    item.routeCode,
    item.frequencyCode,
  ].filter(Boolean).join(' · ')
}

function resolveMedicationPlanParent(values: MedicationRequest[], draft: MedicationPlanDraft) {
  if (!isInfusionRoute(draft.request.routeCode)) return undefined
  const previous = values.filter((item) => item.status !== 'CANCELLED').at(-1)
  if (previous && isInfusionRoute(previous.routeCode)
    && previous.routeCode?.trim().toUpperCase() === draft.request.routeCode?.trim().toUpperCase()
    && previous.frequencyCode === draft.request.frequencyCode
    && String(previous.durationValue ?? '') === String(draft.request.durationValue ?? '')) {
    return previous.parentRequestId || previous.id
  }
  return undefined
}

function EncounterFeeSummary({ statement, showCharges = false }: {
  statement: import('../../shared/api/billingApi').AccountStatement; showCharges?: boolean
}) {
  const outstanding = statement.settlements.reduce((sum, value) => sum + Math.max(0, value.outstandingAmount), 0)
  return <div className="doctor-fee-summary">
    <div className="doctor-fee-summary__totals">
      <div><span>费用合计</span><strong>{money(statement.chargeAmount, statement.currencyCode)}</strong></div>
      <div><span>已支付</span><strong>{money(statement.paymentAmount, statement.currencyCode)}</strong></div>
      <div><span>未开票</span><strong>{money(statement.uninvoicedAmount, statement.currencyCode)}</strong></div>
      <div><span>待支付</span><strong className={outstanding > 0 ? 'is-warning' : 'is-success'}>
        {money(outstanding, statement.currencyCode)}</strong></div>
    </div>
    {showCharges && <div className="doctor-fee-lines">
      {statement.charges.length === 0 ? <p>尚无费用项目</p> : statement.charges.map((value) => <div key={value.id}>
        <span><strong>{value.itemName}</strong><small>{value.itemCode} · {value.quantity} {value.unitCode}</small></span>
        <strong>{money(value.totalAmount, statement.currencyCode)}</strong>
      </div>)}
    </div>}
  </div>
}

function money(value: number, currencyCode = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currencyCode,
    minimumFractionDigits: 2 }).format(value)
}

function orderStatusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已开立', SUBMITTED: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

function ResultsPanel({ encounter, api }: { encounter: Encounter; api: RhnApi }) {
  const reports = useQuery({ queryKey: ['doctor-reports', encounter.id], queryFn: () => api.diagnostics.reportsByEncounter(encounter.id) })
  return <Panel><PanelHead title="本次检查检验结果" meta={`${reports.data?.length ?? 0} 份报告`}
    actions={<Button size="sm" variant="secondary" onClick={() => void reports.refetch()}><Icon name="refresh" />刷新</Button>} />
    {reports.error && <Alert>{errorMessage(reports.error)}</Alert>}
    {reports.isPending ? <LoadingState /> : !reports.data?.length
      ? <EmptyState icon="clinical" title="暂无报告" copy="报告接收后会按版本展示，获取失败不会伪造空结果。" />
      : <div className="doctor-report-list">{reports.data.map((report) => <article key={report.id}><header>
        <div><strong>{report.reportName}</strong><small>{report.reportCode} · V{report.reportVersion} · {formatTime(report.issuedAt)}</small></div>
        <StatusBadge tone={report.status === 'FINAL' ? 'success' : 'warning'}>{report.status}</StatusBadge></header>
        <p>{report.conclusion || '无报告结论'}</p><div>{report.observations.map((item) => <span key={item.id}
          className={isAbnormalObservation(item) ? 'is-abnormal' : ''}>
          {item.observationName}：{item.valueNumber ?? item.valueString ?? item.valueCode ?? '—'} {item.unitCode ?? ''}
          {isAbnormalObservation(item) ? ' · 异常' : ''}</span>)}</div>
      </article>)}</div>}
  </Panel>
}

function isAbnormalObservation(item: import('../../shared/api/diagnosticsApi').DiagnosticObservation) {
  if (item.interpretationCode && !['N', 'NORMAL'].includes(item.interpretationCode.toUpperCase())) return true
  if (item.valueNumber == null) return false
  return (item.referenceRangeLow != null && item.valueNumber < item.referenceRangeLow)
    || (item.referenceRangeHigh != null && item.valueNumber > item.referenceRangeHigh)
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

function HistoryPanel({ encounters, currentEncounterId, api, copyDisabled = false, onCopy }: {
  encounters: Encounter[]; currentEncounterId?: string; api: RhnApi; copyDisabled?: boolean
  onCopy?: (draft: HistoryCopyDraft) => void
}) {
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
    { key: 'treatmentPlan', label: '诊疗计划', value: note?.content.treatmentPlan ?? '' },
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
    if (checked.has('treatmentPlan') && note?.content.treatmentPlan) record.treatmentPlan = note.content.treatmentPlan
    onCopy({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo, sourceRegisteredAt: selected.registeredAt,
      record, diagnoses: selected.diagnoses.filter((item) => checked.has(historyDiagnosisKey(item.code)))
        .map(({ code, display, type }) => ({ code, display, type })) })
  }

  return <Panel className="doctor-history-panel"><PanelHead title="门诊就诊历史" meta={`既往 ${history.length} 次`} />
    {history.length === 0 ? <EmptyState icon="roadmap" title="暂无历史就诊" copy="完成本次就诊后可在后续复诊中查看和复用。" />
      : <div className="doctor-history-browser">
        <div className="doctor-history-visits" role="list" aria-label="历史就诊列表">{history.map((item) =>
          <button type="button" role="listitem" key={item.id} className={item.id === selectedId ? 'is-selected' : ''}
            aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
            <span><strong>{formatTime(item.registeredAt)}</strong><small>{item.encounterNo}</small></span>
            <span><strong>{item.chiefComplaint || '门诊就诊'}</strong>
              <small>{item.diagnoses.map((diagnosis) => diagnosis.display).join('、') || '尚无诊断'}</small></span>
            <Icon name="chevron-right" />
          </button>)}</div>
        <section className="doctor-history-detail" aria-label="历史就诊详情">
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
