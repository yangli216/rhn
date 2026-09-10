import type { ClinicalAiFieldStream } from '../../shared/api/clinicalAiStream'
import { HistoryPrescriptionReference } from './ai/HistoryPrescriptionReference'
import { isAbnormalObservation } from './ai/receptionSceneAssessment'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ClinicalContext } from '../../app/AppShell'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { ClinicalAiDraftContext, ClinicalAiRecordDraft } from '../../shared/api/clinicalAiApi'
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
import { exceedsWarning, VITAL_HARD_LIMITS, vitalRule } from '../../shared/validation/businessValidation'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import {
  Alert, Button, ClinicalResourceSearch, Dialog, EmptyState, FormField, Icon, LoadingState,
  ObjectContextBar, PageHeader, Panel, PanelHead, Popconfirm, Select, StatusBadge,
  type ClinicalResourceOption, type SelectOption,
} from '../../shared/ui'
import {
  isInfusionRoute, type MedicationPlanDraft,
} from './PrescriptionListEditor'
import { UnifiedOrderListEditor, type AiOrderReviewCommand, type ServicePlanDraft } from './UnifiedOrderListEditor'
import { ClinicalAiAssistantPanel } from './ai/ClinicalAiAssistantPanel'
import type { ClinicalAiSurfaceRefs } from './ai/ClinicalAiInlineWorkspace'
import {
  clinicalAiContextFingerprint, mergeAiDiagnoses, mergeAiRecordDraft, stableClinicalAiFingerprint,
  type ClinicalAiDraftRequest,
} from './ai/aiDraftAdapter'
import './waiting/waitingWorkspace.css'
import { DedicatedWaitingWorkspace } from './waiting/DedicatedWaitingWorkspace'
import { QueueCapsuleBar } from './waiting/QueueCapsuleBar'
import { QueuePeekDrawer } from './waiting/QueuePeekDrawer'
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
  const [params] = useSearchParams()
  const linkedResidentId = params.get('residentId')
  const linkedEncounterId = params.get('encounterId')
  const [selected, setSelected] = useState<PatientSelection | null>(null)
  const [peekDrawerOpen, setPeekDrawerOpen] = useState(false)
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
    ['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED'].includes(item.status))
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
    <PageHeader eyebrow="门诊医疗 · 医生工作区" title="门诊医生站"
      description="门诊候诊、叫号调度与接诊状态协同工作台。" />
    {(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error) && <Alert className="ui-page-feedback">
      {errorMessage(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error)}</Alert>}

    <ReferralInboxPanel requests={referralInbox.data ?? []} loading={referralInbox.isPending}
      api={api} onRefresh={async () => { await Promise.all([refreshInbox(), refreshQueue()]) }} />

    {queue.isPending || (Boolean(linkedResidentId) && linkedResident.isPending) ? (
      <LoadingState label="正在加载候诊队列…" />
    ) : (
      <DedicatedWaitingWorkspace
        items={enhancedItems}
        clinicalContext={clinicalContext}
        canEdit={canEdit}
        busy={openPatient.isPending || queueAction.isPending}
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
    <span className="doctor-queue-patient"><strong>{item.residentName}</strong><small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
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

type WorkTool = 'assistant' | 'history' | 'results' | 'coordination'
type GuardedPatientAction = 'queue' | 'suspend' | 'complete' | 'terminate'
type HistoryRecordField = 'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'treatmentPlan'
type HistoryCopyField = HistoryRecordField | `diagnosis:${string}`
type HistoryCopyRecord = Partial<Pick<ClinicalRecordInput,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'treatmentPlan'>>

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
  const [allergyOpen, setAllergyOpen] = useState(false)
  const [historyCopy, setHistoryCopy] = useState<HistoryCopyDraft | null>(null)
  const [aiFieldStream, setAiFieldStream] = useState<ClinicalAiFieldStream | null>(null)
  const [aiOrderReview, setAiOrderReview] = useState<AiOrderReviewCommand | null>(null)
  const [existingTreatmentKeys, setExistingTreatmentKeys] = useState<string[]>([])
  const [aiContext, setAiContext] = useState<ClinicalAiDraftContext | null>(null)
  const [aiDraft, setAiDraft] = useState<ClinicalAiDraftRequest | null>(null)
  const [aiAdoptionBusy, setAiAdoptionBusy] = useState(false)
  const [aiNote, setAiNote] = useState<HTMLDivElement | null>(null)
  const [aiDiagnoses, setAiDiagnoses] = useState<HTMLDivElement | null>(null)
  const [aiPlans, setAiPlans] = useState<HTMLDivElement | null>(null)
  const [aiDetail, setAiDetail] = useState<HTMLDivElement | null>(null)
  const aiSurfaceRefs = useMemo<ClinicalAiSurfaceRefs>(() => ({
    note: setAiNote, diagnoses: setAiDiagnoses, plans: setAiPlans,
  }), [])
  const [draftState, setDraftState] = useState<EncounterDraftState>(emptyDraftState)
  const [guardedAction, setGuardedAction] = useState<GuardedPatientAction | null>(null)
  const [editing, setEditing] = useState(false)
  const saveDraftHandlerRef = useRef<(() => void) | null>(null)
  const [saveDraftNotice, setSaveDraftNotice] = useState<{ message: string; tone?: 'success' | 'error' | 'warning' } | null>(null)
  const automaticEntry = useRef<string | null>(null)
  const [resumeCommandCode] = useState(() => commandCode('RESUME', encounterId ?? resident.id))
  const queryClient = useQueryClient()
  const encounters = useQuery({ queryKey: ['doctor-encounters', resident.id], queryFn: () => api.encounters.byResident(resident.id) })
  const allergies = useQuery({ queryKey: ['doctor-allergies', resident.id], queryFn: () => api.residents.allergies(resident.id) })
  const allergyState: ClinicalAiDraftContext['allergyState'] = allergies.isFetching
    ? 'LOADING' : allergies.error ? 'ERROR' : 'READY'
  const encounter = encounters.data?.find((item) => item.id === encounterId)
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
  const outpatientNote = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const readyToComplete = Boolean(encounter?.chiefComplaint
    && encounter.diagnoses.some((item) => item.type === 'PRIMARY') && outpatientNote?.status === 'SIGNED')
  const signNoteMutation = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(outpatientNote!.id, outpatientNote!.currentVersion),
    onSuccess: async () => {
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
    setActiveTool((current) => current === 'assistant' ? null : current)
  }, [encounter?.id])
  useEffect(() => {
    if (!hasUnsavedDraft) return
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsavedDraft])
  const handleSaveDraft = useCallback(() => {
    if (saveDraftHandlerRef.current) {
      saveDraftHandlerRef.current()
    } else {
      const form = document.getElementById('doctor-record-form') as HTMLFormElement | null
      form?.requestSubmit()
    }
  }, [])
  const handleRegisterSaveDraft = useCallback((handler: (() => void) | null) => {
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
    setActiveTool((current) => current === 'assistant' || current === 'coordination' ? null : current)
  }
  return <section className="doctor-patient-workspace">
    <ObjectContextBar avatar={resident.fullName.slice(-1)} title={resident.fullName}
      description={`${genderLabel(resident.gender)} · ${age(resident.birthDate)} 岁 · ${resident.maskedNationalId || '无证件标识'}`}
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
          onClick={() => setAllergyOpen(true)} /> }]}
      actions={encounter && <div className="doctor-context-actions">
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
              disabled={aiAdoptionBusy || Boolean(aiFieldStream)}
              title={hasUnsavedDraft ? '保存病历、诊断与医嘱草稿 (Ctrl+S)' : '当前草稿已与服务器同步 (Ctrl+S)'}
              onClick={handleSaveDraft}
            >
              <Icon name="check" />
              <span>保存草稿</span>
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
                enteringEdit={start.isPending || resume.isPending}
                allergies={allergies.data ?? []} allergyState={allergyState} api={api} historyCopy={historyCopy}
                onHistoryCopyConsumed={() => setHistoryCopy(null)} onDraftStateChange={setDraftState}
                onRegisterSaveDraft={handleRegisterSaveDraft}
                onSaveDraftNotice={handleSaveDraftNotice}
                aiFieldStream={aiFieldStream} aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={() => setAiOrderReview(null)}
                onTreatmentKeysChange={setExistingTreatmentKeys}
                aiDraft={aiDraft} onAiDraftConsumed={() => setAiDraft(null)} onAiContextChange={setAiContext}
                onRequestEditing={enterEditing} onRequestReading={enterReading} onRefresh={refresh}
                aiPreConsultation={currentEnhancedItem?.aiPreConsultation}
                triageVitals={effectiveTriageVitals}
                historyEncounters={encounters.data ?? []} />
          </main>
          {editing && encounter.status === 'IN_PROGRESS' && aiContext?.encounterId === encounter.id
            && aiContext.residentId === encounter.residentId && <ClinicalAiAssistantPanel key={encounter.id}
              encounter={encounter} currentContext={aiContext} allergies={allergies.data ?? []}
              allergyState={allergyState} api={api}
              disabled={outpatientNote?.status === 'SIGNED' || draftState.busy}
              surfaces={{ summary: aiNote, note: aiNote, diagnoses: aiDiagnoses, plans: aiPlans, detail: aiDetail }}
              onOpenDetail={() => setActiveTool('assistant')}
              onOpenHistory={() => setActiveTool('history')} onOpenResults={() => setActiveTool('results')}
              onAdoptionBusyChange={setAiAdoptionBusy} onApply={setAiDraft} onFieldStream={setAiFieldStream}
              existingTreatmentKeys={existingTreatmentKeys}
              onReviewTreatment={(items, onCompleted) => setAiOrderReview({
                id: crypto.randomUUID(), encounterId: encounter.id, items, onCompleted,
              })}
              historyEncounters={encounters.data ?? []} />}
          {activeTool && <aside className={`doctor-workspace-drawer${activeTool === 'history' ? ' is-history' : ''}${activeTool === 'assistant' ? ' is-assistant' : ''}`}
            aria-label={toolLabel(activeTool)}>
            <header><div><span>扩展业务</span><strong>{toolLabel(activeTool)}</strong></div>
              <button type="button" aria-label="关闭扩展工具" disabled={activeTool === 'assistant' && aiAdoptionBusy}
                onClick={() => setActiveTool(null)}><Icon name="close" /></button></header>
            <div className="doctor-workspace-drawer__content">
              {activeTool === 'assistant' && <div ref={setAiDetail} />}
              {activeTool === 'history' && <HistoryPanel encounters={encounters.data ?? []}
                currentEncounterId={encounter.id} api={api} allergies={allergies.data ?? []} allergyReady={allergyState === 'READY'} copyDisabled={!editing || encounter.status !== 'IN_PROGRESS' || outpatientNote?.status === 'SIGNED'}
                onCopy={(draft) => { setHistoryCopy({ ...draft, targetEncounterId: encounter.id, targetResidentId: encounter.residentId }); setActiveTool(null) }} />}
              {activeTool === 'results' && <ResultsPanel encounter={encounter} api={api} />}
              {activeTool === 'coordination' && editing && <ReferralCoordinationPanel encounter={encounter}
                clinicalContext={clinicalContext} api={api} hasUnsavedDraft={hasUnsavedDraft} onRefresh={refresh} />}
            </div>
          </aside>}
          <nav className="doctor-workspace-tools" aria-label="医生站扩展工具">
            {editing && encounter.status === 'IN_PROGRESS' && <ToolButton icon="sparkles" label="智医助理"
              active={activeTool === 'assistant'}
              onClick={() => !aiAdoptionBusy && setActiveTool(toggleTool(activeTool, 'assistant'))} />}
            <ToolButton icon="roadmap" label="就诊历史" active={activeTool === 'history'} onClick={() => setActiveTool(toggleTool(activeTool, 'history'))} />
            <ToolButton icon="clinical" label="检验结果" active={activeTool === 'results'} onClick={() => setActiveTool(toggleTool(activeTool, 'results'))} />
            {editing && <ToolButton icon="tasks" label="皮试管理" active={false}
              onClick={() => navigate(`/skin-tests?encounterId=${encounter.id}`)} />}
            {editing && <ToolButton icon="organization" label="协同业务" active={activeTool === 'coordination'} onClick={() => setActiveTool(toggleTool(activeTool, 'coordination'))} />}
          </nav>
        </div>}
    {completionOpen && encounter && <EncounterCompletionDialog encounter={encounter} api={api}
      signed={outpatientNote?.status === 'SIGNED'} ready={readyToComplete} busy={complete.isPending}
      error={complete.error || signNoteMutation.error} onClose={() => setCompletionOpen(false)}
      onComplete={(input) => complete.mutate(input)}
      onSignNote={outpatientNote ? () => signNoteMutation.mutate() : undefined}
      signing={signNoteMutation.isPending} />}
    {suspensionOpen && encounter && <EncounterSuspendDialog encounterId={encounter.id}
      busy={suspend.isPending} error={suspend.error}
      onClose={() => setSuspensionOpen(false)} onConfirm={(input) => suspend.mutate(input)} />}
    {terminationOpen && encounter && <EncounterTerminationDialog encounter={encounter} api={api}
      busy={terminate.isPending} error={terminate.error} onClose={() => setTerminationOpen(false)}
      onConfirm={(input) => terminate.mutate(input)} />}
    {allergyOpen && encounter && <Dialog title="过敏信息" eyebrow={`${resident.fullName} · 患者安全`}
      description={editing ? '核对并维护患者过敏事实，变更将关联当前就诊留痕。' : '当前为阅读状态，仅展示已记录的过敏事实。'}
      size="wide" onClose={() => setAllergyOpen(false)}
      footer={<Button variant="secondary" onClick={() => setAllergyOpen(false)}>关闭</Button>}>
      <AllergySafetyPanel resident={resident} encounter={encounter} allergies={allergies.data ?? []}
        loading={allergies.isPending} error={allergies.error} api={api} readOnly={!editing} dialog />
    </Dialog>}
    {guardedAction && <UnsavedPatientWorkDialog residentName={resident.fullName} action={guardedAction}
      labels={draftLabels} onClose={() => setGuardedAction(null)} onDiscard={() => runAction(guardedAction)} />}
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
  icon: 'sparkles' | 'roadmap' | 'clinical' | 'tasks' | 'organization'; label: string; active: boolean; onClick: () => void
}) {
  const labelLines = Array.from({ length: Math.ceil(label.length / 2) }, (_, index) => label.slice(index * 2, index * 2 + 2))
  return <button type="button" className={active ? 'is-active' : ''} aria-label={label}
    aria-pressed={active} title={label} onClick={onClick}>
    <Icon name={icon} /><span className="doctor-tool-label" aria-hidden="true">
      {labelLines.map(line => <span key={line}>{line}</span>)}
    </span>
  </button>
}

const quickDispositionPhrases = [
  '按医嘱用药，如症状加重及时复诊',
  '遵医嘱服药，注意清淡饮食与休息',
  '一周后门诊复查',
  '两周后复查评估疗效',
  '不适随诊，需监测血压与血糖',
  '建议转专科进一步系统检查与治疗',
]

function EncounterCompletionDialog({ encounter, api, signed, ready, busy, error, onClose, onComplete, onSignNote, signing }: {
  encounter: Encounter; api: RhnApi; signed: boolean; ready: boolean; busy: boolean; error: unknown
  onClose: () => void; onComplete: (input: CompleteEncounterInput) => void
  onSignNote?: () => void; signing?: boolean
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
      roundingAdjustment: command.roundingAdjustment,
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

  const primaryDiag = encounter.diagnoses.find((value) => value.type === 'PRIMARY')?.display || '未录入'
  const hasChiefComplaint = Boolean(encounter.chiefComplaint?.trim())
  const hasPrimaryDiagnosis = encounter.diagnoses.some((value) => value.type === 'PRIMARY')
  const completedRequirementCount = [hasChiefComplaint, hasPrimaryDiagnosis, signed].filter(Boolean).length

  return <Dialog title="诊毕确认" eyebrow="本次就诊收口" size="xwide" className="doctor-completion-modal"
    closeOnBackdrop={false} onClose={onClose}
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
          <strong className={signed ? 'is-success' : 'is-warning'}>{signed ? '已签署' : '待签署'}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--orders">
          <div className="doctor-overview-stat__header">
            <Icon name="tasks" className="ui-icon-inline" />
            <span>本次医嘱</span>
          </div>
          <strong>{orderCount} 项</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--fee">
          <div className="doctor-overview-stat__header">
            <div className="doctor-overview-stat__header-title">
              <Icon name="billing" className="ui-icon-inline" />
              <span>待收金额</span>
            </div>
            {statement.data && statement.data.uninvoicedAmount > 0 && (
              <button type="button" className="doctor-fee-quick-invoice-btn" disabled={issueInvoice.isPending}
                onClick={() => issueInvoice.mutate()}>
                {issueInvoice.isPending ? '生成中…' : '生成结算单'}
              </button>
            )}
          </div>
          <div className="doctor-fee-stat-content">
            <strong className={outstanding > 0 ? 'is-warning' : 'is-success'}>
              {statement.data ? (outstanding > 0 ? money(outstanding, statement.data.currencyCode) : '已结清 (¥0.00)') : '暂无费用'}
            </strong>
            {statement.data ? (
              <div className="doctor-fee-stat-metrics">
                <span>费用合计 <strong>{money(statement.data.chargeAmount, statement.data.currencyCode)}</strong></span>
                <span>已支付 <strong>{money(statement.data.paymentAmount, statement.data.currencyCode)}</strong></span>
                <span>未开票 <strong>{money(statement.data.uninvoicedAmount, statement.data.currencyCode)}</strong></span>
                <span>待支付 <strong>{money(outstanding, statement.data.currencyCode)}</strong></span>
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
            <SettlementPaymentPanel settlements={payable.map((value) => ({
              id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount, currencyCode: value.currencyCode,
            }))} methods={(methods.data ?? []).map((value) => ({
              code: value.code,
              name: value.name,
              sortOrder: value.sortOrder,
              precision: value.attributes?.PAYMENT_PRECISION,
              roundingMode: value.attributes?.ROUNDING_MODE,
            }))}
            orders={orders.data ?? []} busy={createPayment.isPending} sceneLabel="诊间收款"
            onSubmit={(command) => createPayment.mutateAsync(command)} />
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
              <select className="ui-field__control" value={dispositionCode}
                onChange={(event) => {
                  const code = event.target.value as CompleteEncounterInput['dispositionCode']
                  setDispositionCode(code)
                  setRequestCommand(commandCode('COMPLETE', encounter.id))
                  if (code === 'FOLLOW_UP' && dispositionNote.includes('按医嘱用药')) {
                    setDispositionNote('预约 1 周后门诊复查，带齐既往检查检验结果')
                  } else if (code === 'REFERRAL') {
                    setDispositionNote('建议转上级医院专科进一步确诊与系统治疗')
                  } else if (code === 'ADMISSION') {
                    setDispositionNote('病情需收治住院进一步系统诊疗，已开具入院证')
                  }
                }}>
                <option value="HOME">门诊离院</option>
                <option value="FOLLOW_UP">预约复诊</option>
                <option value="OBSERVATION">留观</option>
                <option value="REFERRAL">转诊 / 转科</option>
                <option value="ADMISSION">收治住院</option>
              </select>
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
                    <button
                      type="button"
                      key={phrase}
                      className="doctor-quick-phrase-chip"
                      onClick={() => {
                        setDispositionNote(phrase)
                        setRequestCommand(commandCode('COMPLETE', encounter.id))
                      }}>
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className={`doctor-completion-checklist doctor-completion-checklist--dialog ${ready ? 'is-ready-group' : 'is-pending-group'}`} aria-label="诊毕准入核对">
          <div className="doctor-completion-checklist__header">
            <span className="doctor-completion-checklist__title">
              <Icon name={ready ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>诊毕前置核对</span>
            </span>
            <strong>{ready ? '已全部通过' : `${completedRequirementCount}/3 已完成`}</strong>
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
            <span className={`doctor-checklist-chip ${signed ? 'is-ready' : 'is-missing'}`}>
              <Icon name={signed ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>{signed ? '病历已签署' : '病历签署'}</span>
              {!signed && onSignNote && (
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
      </div>
    </div>
  </Dialog>
}

function AllergySafetyPanel({ resident, encounter, allergies, loading, error, api, readOnly = false, dialog = false }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; loading: boolean; error: unknown; api: RhnApi
  readOnly?: boolean; dialog?: boolean
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
      {!readOnly && <Button size="sm" variant="text" busy={inactivate.isPending}
        onClick={() => { if (window.confirm(`确认停用“${item.substanceDisplay}”过敏记录？`)) inactivate.mutate(item) }}>停用</Button>
      }
    </span>)}</div>}
    {!loading && !readOnly && <div className="doctor-allergy-actions">
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


const recordSchema = z.object({
  chiefComplaint: z.string().trim().min(1, '请输入主诉').max(1000),
  presentIllness: z.string().trim().max(4000),
  medicalHistory: z.string().trim().max(4000),
  physicalExam: z.string().trim().max(4000),
  treatmentPlan: z.string().trim().max(4000),
  systolic: z.number().int().min(VITAL_HARD_LIMITS.systolicPressure.minimum).max(VITAL_HARD_LIMITS.systolicPressure.maximum),
  diastolic: z.number().int().min(VITAL_HARD_LIMITS.diastolicPressure.minimum).max(VITAL_HARD_LIMITS.diastolicPressure.maximum),
  temperature: z.number().min(VITAL_HARD_LIMITS.temperature.minimum).max(VITAL_HARD_LIMITS.temperature.maximum).optional(),
  pulseRate: z.number().int().min(VITAL_HARD_LIMITS.pulse.minimum).max(VITAL_HARD_LIMITS.pulse.maximum).optional(),
  respiratoryRate: z.number().int().min(VITAL_HARD_LIMITS.respiratoryRate.minimum).max(VITAL_HARD_LIMITS.respiratoryRate.maximum).optional(),
  heightCm: z.number().min(VITAL_HARD_LIMITS.height.minimum).max(VITAL_HARD_LIMITS.height.maximum).optional(),
  weightKg: z.number().min(VITAL_HARD_LIMITS.weight.minimum).max(VITAL_HARD_LIMITS.weight.maximum).optional(),
  oxygenSaturation: z.number().int().min(VITAL_HARD_LIMITS.oxygenSaturation.minimum).max(VITAL_HARD_LIMITS.oxygenSaturation.maximum).optional(),
}).superRefine((value, context) => {
  if (value.systolic <= value.diastolic) {
    context.addIssue({ code: 'custom', path: ['systolic'], message: '收缩压必须大于舒张压' })
  }
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

function structuredNoteReadValue(field: OutpatientNoteFormField, value: unknown) {
  if (value === undefined || value === null || value === '') return '未记录'
  if (field.type === 'BOOLEAN') return value ? '是' : '否'
  if (field.type === 'SELECT') return field.options.find((option) => option.value === value)?.label ?? String(value)
  return `${String(value)}${field.unit ? ` ${field.unit}` : ''}`
}

function StructuredNoteReadView({ form, values }: {
  form: OutpatientNoteForm
  values: Record<string, unknown>
}) {
  return <section className="doctor-structured-note-read" aria-label={`${form.name}阅读内容`}>
    <header><strong>{form.name}</strong><small>{form.formCode} · V{form.version}</small></header>
    {form.sections.map((section) => <section key={section.code}>
      <h4>{section.title}</h4>
      <dl>{section.fields.map((field) => <div key={field.code}>
        <dt>{field.label}</dt><dd>{structuredNoteReadValue(field, values[field.code])}</dd>
      </div>)}</dl>
    </section>)}
  </section>
}

function ClinicalRecordReadView({ value, bmi, structuredForm, structuredValues }: {
  value: RecordForm
  bmi?: string
  structuredForm?: OutpatientNoteForm
  structuredValues: Record<string, unknown>
}) {
  const sections = [
    { label: '主诉', value: value.chiefComplaint },
    { label: '现病史', value: value.presentIllness },
    { label: '既往史', value: value.medicalHistory },
    { label: '查体所见', value: value.physicalExam },
    { label: '诊疗计划', value: value.treatmentPlan },
  ]
  const vitals = [
    { label: '体温', value: value.temperature, unit: '℃' },
    { label: '脉搏', value: value.pulseRate, unit: '次/分' },
    { label: '呼吸', value: value.respiratoryRate, unit: '次/分' },
    { label: '血氧', value: value.oxygenSaturation, unit: '%' },
    { label: '血压', value: value.systolic && value.diastolic ? `${value.systolic}/${value.diastolic}` : undefined, unit: 'mmHg' },
    { label: '身高', value: value.heightCm, unit: 'cm' },
    { label: '体重', value: value.weightKg, unit: 'kg' },
    { label: 'BMI', value: bmi, unit: 'kg/m²' },
  ]
  return <article className="doctor-record-read" aria-label="门诊病历阅读内容">
    <div className="doctor-record-read__body">
      {sections.slice(0, 3).map((section) => <section key={section.label}>
        <h3>{section.label}</h3>
        <p className={section.value?.trim() ? '' : 'is-empty'}>{section.value?.trim() || '未记录'}</p>
      </section>)}
      <section className="doctor-record-read__vitals">
        <h3>生命体征</h3>
        <dl>{vitals.map((item) => <div key={item.label}>
          <dt>{item.label}</dt><dd className={item.value == null || item.value === '' ? 'is-empty' : ''}>
            {item.value == null || item.value === '' ? '—' : item.value}<small>{item.value == null || item.value === '' ? '' : item.unit}</small>
          </dd>
        </div>)}</dl>
      </section>
      {sections.slice(3).map((section) => <section key={section.label}>
        <h3>{section.label}</h3>
        <p className={section.value?.trim() ? '' : 'is-empty'}>{section.value?.trim() || '未记录'}</p>
      </section>)}
    </div>
    {structuredForm && <StructuredNoteReadView form={structuredForm} values={structuredValues} />}
  </article>
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
      setNotice(`已调入“${value.name}”的 ${checked.size} 个病历段落，请核对后保存。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    },
  })
  const fieldsInTemplate = (value: OutpatientNoteTemplate) => new Set<NoteTemplateField>(
    noteTemplateFields.filter(({ key }) => Boolean(value.content[key]?.trim())).map(({ key }) => key),
  )
  const openApply = () => {
    const value = selected ?? templates.data?.[0]
    if (value) setSelectedId(value.id)
    setChecked(value ? fieldsInTemplate(value) : new Set())
    setOverwrite(false); setApplyOpen(true)
  }
  const selectForApply = (id: string) => {
    setSelectedId(id)
    setNotice('')
    const value = templates.data?.find((template) => template.id === id)
    setChecked(value ? fieldsInTemplate(value) : new Set())
  }
  const toggleField = (key: NoteTemplateField) => setChecked((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const templateOptions: SelectOption[] = useMemo(() => (
    templates.data?.length
      ? templates.data.map((value) => ({
          value: value.id,
          label: `${value.scopeType === 'PERSONAL' ? '个人' : '科室'} · ${value.name}`,
        }))
      : [{ value: '', label: '暂无模板' }]
  ), [templates.data])

  return <div className="doctor-note-template-bar">
    <div>
      <Button size="sm" type="button" variant="secondary" disabled={disabled}
        onClick={openApply}>模板调入</Button>
      <Button size="sm" type="button" variant="text" disabled={disabled}
        onClick={() => setSaveOpen(true)}>存为模板</Button>
    </div>
    {templates.isPending && <small>正在加载模板…</small>}
    {notice && <span>{notice}</span>}
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
        {noteTemplateFields.map(({ key, label }) => {
          const isFilled = Boolean(currentContent()[key]?.trim())
          return <span key={key} className={isFilled ? 'is-ready' : ''}>
            <Icon name={isFilled ? 'check' : 'close'} className="ui-icon-inline" /> {label}
          </span>
        })}
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </Dialog>}
    {applyOpen && <Dialog title="调入病历模板" eyebrow="门诊病历"
      description="选择模板和需要调入的段落；确认后只修改当前页面草稿，不会自动保存或签署病历。"
      closeOnBackdrop={false} onClose={() => !apply.isPending && setApplyOpen(false)} footer={<>
        <Button variant="secondary" disabled={apply.isPending} onClick={() => setApplyOpen(false)}>取消</Button>
        <Button busy={apply.isPending} disabled={!selected || checked.size === 0}
          onClick={() => selected && apply.mutate(selected)}>确认调入</Button>
      </>}>
      <div className="doctor-note-template-picker">
        <span>选择模板</span>
        <Select
          className="doctor-note-template-select"
          aria-label="选择调入模板"
          value={selectedId}
          options={templateOptions}
          clearable={false}
          searchable={templateOptions.length > 5}
          disabled={apply.isPending || !templates.data?.length}
          placeholder="请选择模板"
          onChange={selectForApply}
        />
        <small>{selected
          ? selected.description || `${selected.scopeType === 'PERSONAL' ? '个人' : '科室'}模板 · 已使用 ${selected.useCount} 次`
          : templates.isPending ? '正在加载模板…' : '暂无可用病历模板，可先取消并使用“存为模板”创建。'}</small>
      </div>
      {templates.error && <Alert>{errorMessage(templates.error)}</Alert>}
      <label className="doctor-note-template-mode"><input type="checkbox" checked={overwrite}
        disabled={!selected || apply.isPending}
        onChange={(event) => setOverwrite(event.target.checked)} />
        <span><strong>覆盖所选字段已有内容</strong><small>未勾选时只填充当前为空的段落。</small></span></label>
      <div className="doctor-note-template-preview">
        {selected && noteTemplateFields.filter(({ key }) => selected.content[key]?.trim()).map(({ key, label }) => <label key={key}>
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
    .join('\n')
}

function diagnosisKey(value: DiagnosisInput) {
  return String(value.conceptId || `${value.diagnosisDomain}|${value.code}`)
}

export function normalizeDiagnosisOrder(values: DiagnosisInput[]) {
  return values.map((value, index) => ({
    ...value,
    type: index === 0 ? 'PRIMARY' as const : 'SECONDARY' as const,
  }))
}

export function moveDiagnosis(values: DiagnosisInput[], sourceKey: string, targetKey: string) {
  const sourceIndex = values.findIndex((value) => diagnosisKey(value) === sourceKey)
  const targetIndex = values.findIndex((value) => diagnosisKey(value) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return normalizeDiagnosisOrder(values)
  const next = [...values]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return normalizeDiagnosisOrder(next)
}

function formatShortDate(value?: string) {
  if (!value) return ''
  try {
    const d = new Date(value)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return value
  }
}

function formatShortTime(value?: string) {
  if (!value) return ''
  try {
    const d = new Date(value)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return value
  }
}

function formatVitalsSummary(v: {
  systolic?: number
  diastolic?: number
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  heightCm?: number
  weightKg?: number
}) {
  const items: Array<{ key: string; label: string; text: string }> = []
  if (v.systolic && v.diastolic) {
    items.push({ key: 'bp', label: '血压', text: `${v.systolic}/${v.diastolic} mmHg` })
  } else if (v.systolic) {
    items.push({ key: 'sys', label: '收缩压', text: `${v.systolic} mmHg` })
  } else if (v.diastolic) {
    items.push({ key: 'dia', label: '舒张压', text: `${v.diastolic} mmHg` })
  }
  if (v.pulseRate != null) items.push({ key: 'pulse', label: '脉搏', text: `${v.pulseRate} 次/分` })
  if (v.temperature != null) items.push({ key: 'temp', label: '体温', text: `${v.temperature} ℃` })
  if (v.respiratoryRate != null) items.push({ key: 'resp', label: '呼吸', text: `${v.respiratoryRate} 次/分` })
  if (v.oxygenSaturation != null) items.push({ key: 'spo2', label: '血氧', text: `${v.oxygenSaturation} %` })
  if (v.heightCm != null) items.push({ key: 'height', label: '身高', text: `${v.heightCm} cm` })
  if (v.weightKg != null) items.push({ key: 'weight', label: '体重', text: `${v.weightKg} kg` })
  return items
}

function infusionGroupSignature(value: Pick<MedicationRequest, 'routeCode' | 'frequencyCode' | 'durationValue'>
  | Pick<MedicationPlanDraft, 'request'>) {
  const request = 'request' in value ? value.request : value
  return [request.routeCode?.trim().toUpperCase(), request.frequencyCode,
    String(request.durationValue ?? '')].join('|')
}

export function prescriptionSplitSummary(drafts: MedicationPlanDraft[], existingPrescriptions: Prescription[] = []) {
  const totals = new Map<string, number>()
  for (const prescription of existingPrescriptions.filter((value) => value.status === 'DRAFT')) {
    totals.set(prescription.categoryCode, (totals.get(prescription.categoryCode) ?? 0)
      + prescription.medicationRequests.filter((value) => value.status !== 'CANCELLED').length)
  }
  for (const draft of drafts) totals.set(draft.categoryCode, (totals.get(draft.categoryCode) ?? 0) + 1)
  return [...totals.entries()].map(([categoryCode, count]) => ({
    categoryCode,
    medicationCount: count,
    prescriptionCount: categoryCode === 'HERBAL' ? (count > 0 ? 1 : 0) : Math.ceil(count / 5),
  }))
}

export async function persistOrderDrafts(
  encounterId: string | number,
  medDrafts: MedicationPlanDraft[],
  svcDrafts: ServicePlanDraft[],
  api: RhnApi,
  existingPrescriptions: Prescription[] = []
) {
  if (medDrafts.length === 0 && svcDrafts.length === 0) return
  const encId = String(encounterId)

  const prescriptionsByCategory = new Map<string, Prescription[]>()
  const requestsByPrescription = new Map<string, MedicationRequest[]>()
  for (const value of existingPrescriptions) {
    if (value.status === 'DRAFT') {
      const values = prescriptionsByCategory.get(value.categoryCode) ?? []
      values.push(value)
      prescriptionsByCategory.set(value.categoryCode, values)
    }
    requestsByPrescription.set(value.id, [...value.medicationRequests])
  }

  const infusionRoots = new Map<string, string>()
  const infusionSignatures = new Map<string, string>()
  for (const prescription of existingPrescriptions) {
    for (const request of prescription.medicationRequests.filter((value) => value.status !== 'CANCELLED'
      && isInfusionRoute(value.routeCode, value.routeExecutionType))) {
      const rootId = request.parentRequestId || request.id
      infusionRoots.set(`request:${rootId}`, rootId)
      infusionSignatures.set(`request:${rootId}`, infusionGroupSignature(request))
    }
  }

  for (const draft of medDrafts) {
    const categoryPrescriptions = prescriptionsByCategory.get(draft.categoryCode) ?? []
    let prescription = draft.categoryCode === 'HERBAL'
      ? categoryPrescriptions[0]
      : categoryPrescriptions.find((value) => (requestsByPrescription.get(value.id) ?? [])
          .filter((request) => request.status !== 'CANCELLED').length < 5)
    if (!prescription) {
      prescription = await api.encounters.createPrescription(
        encId,
        draft.categoryCode,
        draft.categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊西药/中成药处方'
      )
      categoryPrescriptions.push(prescription)
      prescriptionsByCategory.set(draft.categoryCode, categoryPrescriptions)
      requestsByPrescription.set(prescription.id, [])
    }
    const existingRequests = requestsByPrescription.get(prescription.id) ?? []
    let parentRequestId: string | undefined
    if (isInfusionRoute(draft.request.routeCode, draft.routeExecutionType) && draft.administrationGroupKey) {
      const signature = infusionGroupSignature(draft)
      const existingSignature = infusionSignatures.get(draft.administrationGroupKey)
      if (existingSignature && existingSignature !== signature) {
        throw new Error('同一输液组的给药途径、频次和疗程必须一致')
      }
      parentRequestId = infusionRoots.get(draft.administrationGroupKey)
      infusionSignatures.set(draft.administrationGroupKey, signature)
    }
    const created = await api.encounters.createMedicationRequest(encId, {
      ...draft.request,
      prescriptionId: prescription.id,
      parentRequestId,
    })
    if (isInfusionRoute(draft.request.routeCode, draft.routeExecutionType) && draft.administrationGroupKey
      && !infusionRoots.has(draft.administrationGroupKey)) {
      infusionRoots.set(draft.administrationGroupKey, created.id)
    }
    existingRequests.push(created)
    requestsByPrescription.set(prescription.id, existingRequests)
  }

  for (const draft of svcDrafts) {
    await api.encounters.createServiceRequest(encId, {
      catalogItemId: draft.catalogItemId,
      quantity: draft.quantity,
      unitCode: draft.unitCode,
      priceType: 'SALE',
      pricingRequired: true,
      reason: '门诊诊疗申请',
      clinicalDescription: draft.clinicalDescription || '门诊医生站诊疗方案',
    })
  }
}

function ClinicalRecordPanel({ encounter, allergies, allergyState, api, historyCopy, onHistoryCopyConsumed,
  aiDraft, onAiDraftConsumed, onAiContextChange, onDraftStateChange, onRegisterSaveDraft, onSaveDraftNotice,
  editing, canEdit, enteringEdit, onRequestEditing,
  onRequestReading, onRefresh, aiPreConsultation, triageVitals, historyEncounters, aiSurfaceRefs, aiFieldStream,
  aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange }: {
  encounter: Encounter; allergies: AllergyIntolerance[]; allergyState: ClinicalAiDraftContext['allergyState']
  api: RhnApi; historyCopy: HistoryCopyDraft | null
  aiDraft: ClinicalAiDraftRequest | null; onAiDraftConsumed: () => void
  onAiContextChange: (value: ClinicalAiDraftContext | null) => void
  onHistoryCopyConsumed: () => void; onDraftStateChange: (value: EncounterDraftState) => void
  onRegisterSaveDraft?: (handler: (() => void) | null) => void
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
}) {
  const queryClient = useQueryClient()
  const vitalRulesQuery = useQuery({
    queryKey: ['clinical-safety-vital-rules'],
    queryFn: api.clinicalSafety.vitalSignRules,
    staleTime: 5 * 60 * 1000,
  })
  const [diagnosisSearch, setDiagnosisSearch] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const [diagnosisDomainFilter, setDiagnosisDomainFilter] = useState('')
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
  const [diagnosisComposerOpen, setDiagnosisComposerOpen] = useState(false)
  const diagnosisComposerRef = useRef<HTMLDivElement>(null)
  const [draggedDiagnosisKey, setDraggedDiagnosisKey] = useState<string>()
  const [medicationDrafts, setMedicationDrafts] = useState<MedicationPlanDraft[]>([])
  const [diagnosisHovered, setDiagnosisHovered] = useState(false)

  useEffect(() => {
    if (!diagnosisComposerOpen && diagnoses.length > 0) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const isInsideRow = diagnosisComposerRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover')
      )
      if (!isInsideRow && !isInsidePopover && !diagnosisSearch) {
        if (diagnoses.length > 0) {
          setDiagnosisComposerOpen(false)
        }
        setDiagnosisSearch(undefined)
        setDiagnosisError('')
      }
    }
    window.document.addEventListener('pointerdown', handlePointerDown)
    return () => window.document.removeEventListener('pointerdown', handlePointerDown)
  }, [diagnosisComposerOpen, diagnosisSearch, diagnoses.length])
  const [serviceDrafts, setServiceDrafts] = useState<ServicePlanDraft[]>([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [diagnosisError, setDiagnosisError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [aiRecordUndo, setAiRecordUndo] = useState<{
    before: ClinicalAiRecordDraft; after: ClinicalAiRecordDraft; documentVersion: number
  } | null>(null)
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [selectedNoteFormId, setSelectedNoteFormId] = useState('')
  const [structuredValues, setStructuredValues] = useState<Record<string, unknown>>({})
  const [structuredBaseline, setStructuredBaseline] = useState(structuredFormSignature('', {}))
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({})
  const [selectedRefIdx, setSelectedRefIdx] = useState(0)
  const [appliedRefFeedback, setAppliedRefFeedback] = useState(false)
  const pendingRecordCommand = useRef<{ fingerprint: string; commandCode: string } | null>(null)
  const processedAiDraft = useRef<string | null>(null)
  const serverStateInitialized = useRef(false)
  const { register, handleSubmit, reset, getValues, watch, formState } = useForm<RecordForm>({
    resolver: zodResolver(recordSchema),
    defaultValues: { chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '',
      systolic: undefined, diastolic: undefined, temperature: undefined, pulseRate: undefined,
      respiratoryRate: undefined, heightCm: undefined, weightKg: undefined, oxygenSaturation: undefined },
  })
  const pastEncounters = useMemo(() => {
    return (historyEncounters ?? []).filter((item) => item.id !== encounter.id)
  }, [historyEncounters, encounter.id])
  const recentPastEncounter = pastEncounters[0]
  const pastDocumentQuery = useQuery({
    queryKey: ['doctor-recent-past-doc', recentPastEncounter?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(recentPastEncounter!.id),
    enabled: Boolean(recentPastEncounter?.id),
    staleTime: 5 * 60 * 1000,
  })
  const pastNote = pastDocumentQuery.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const pastVitalsData = useMemo(() => {
    if (!recentPastEncounter) return null
    const noteVitals = pastNote?.content.vitalSigns
    const systolic = recentPastEncounter.systolic ?? noteVitals?.systolic
    const diastolic = recentPastEncounter.diastolic ?? noteVitals?.diastolic
    const temperature = noteVitals?.temperature
    const pulseRate = noteVitals?.pulseRate
    const respiratoryRate = noteVitals?.respiratoryRate
    const oxygenSaturation = noteVitals?.oxygenSaturation
    const heightCm = noteVitals?.heightCm
    const weightKg = noteVitals?.weightKg

    const hasAny = [systolic, diastolic, temperature, pulseRate, respiratoryRate, oxygenSaturation, heightCm, weightKg]
      .some((v) => v !== undefined && v !== null && !isNaN(Number(v)))

    if (!hasAny) return null

    const dateStr = recentPastEncounter.registeredAt ? formatShortDate(recentPastEncounter.registeredAt) : ''
    return {
      sourceType: 'PAST' as const,
      label: `上次就诊 (${dateStr || '既往'})`,
      vitals: {
        systolic,
        diastolic,
        temperature,
        pulseRate,
        respiratoryRate,
        oxygenSaturation,
        heightCm,
        weightKg,
      },
    }
  }, [recentPastEncounter, pastNote])

  const triageVitalsData = useMemo(() => {
    if (!triageVitals) return null
    const systolic = triageVitals.systolic
    const diastolic = triageVitals.diastolic
    const temperature = triageVitals.temperature
    const pulseRate = triageVitals.pulseRate
    const oxygenSaturation = triageVitals.spo2
    const hasAny = [systolic, diastolic, temperature, pulseRate, oxygenSaturation]
      .some((v) => v !== undefined && v !== null && !isNaN(Number(v)))

    if (!hasAny) return null

    const timeStr = triageVitals.measuredAt ? formatShortTime(triageVitals.measuredAt) : '分诊'
    return {
      sourceType: 'TRIAGE' as const,
      label: `分诊测量 (${timeStr})`,
      vitals: {
        systolic,
        diastolic,
        temperature,
        pulseRate,
        oxygenSaturation,
        respiratoryRate: undefined,
        heightCm: undefined,
        weightKg: undefined,
      },
    }
  }, [triageVitals])

  const availableSources = useMemo(() => {
    const list = []
    if (triageVitalsData) list.push(triageVitalsData)
    if (pastVitalsData) list.push(pastVitalsData)
    return list
  }, [triageVitalsData, pastVitalsData])

  const activeRef = availableSources[selectedRefIdx] ?? availableSources[0]

  const handleApplyReferenceVitals = (refVitals: {
    systolic?: number
    diastolic?: number
    temperature?: number
    pulseRate?: number
    respiratoryRate?: number
    oxygenSaturation?: number
    heightCm?: number
    weightKg?: number
  }) => {
    const current = getValues()
    reset({
      ...current,
      systolic: refVitals.systolic !== undefined ? refVitals.systolic : current.systolic,
      diastolic: refVitals.diastolic !== undefined ? refVitals.diastolic : current.diastolic,
      temperature: refVitals.temperature !== undefined ? refVitals.temperature : current.temperature,
      pulseRate: refVitals.pulseRate !== undefined ? refVitals.pulseRate : current.pulseRate,
      respiratoryRate: refVitals.respiratoryRate !== undefined ? refVitals.respiratoryRate : current.respiratoryRate,
      oxygenSaturation: refVitals.oxygenSaturation !== undefined ? refVitals.oxygenSaturation : current.oxygenSaturation,
      heightCm: refVitals.heightCm !== undefined ? refVitals.heightCm : current.heightCm,
      weightKg: refVitals.weightKg !== undefined ? refVitals.weightKg : current.weightKg,
    }, { keepDefaultValues: true })
    setAppliedRefFeedback(true)
    setTimeout(() => setAppliedRefFeedback(false), 2000)
  }
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
  const save = useMutation({
    mutationFn: async (form: RecordForm) => {
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
      const savedEncounter = await api.encounters.recordClinicalData(encounter.id, {
        commandCode: pendingRecordCommand.current.commandCode, ...content,
      })

      if (medicationDrafts.length > 0 || serviceDrafts.length > 0) {
        const currentPrescriptions = await api.encounters.prescriptions(encounter.id).catch(() => [])
        await persistOrderDrafts(encounter.id, medicationDrafts, serviceDrafts, api, currentPrescriptions)
      }

      return savedEncounter
    },
    onSuccess: async (savedEncounter, form) => {
      pendingRecordCommand.current = null
      setCopyNotice('')
      onSaveDraftNotice?.({ message: '门诊病历、诊断与医嘱草稿已保存', tone: 'success' })
      setMedicationDrafts([])
      setServiceDrafts([])

      reset({
        chiefComplaint: form.chiefComplaint,
        presentIllness: form.presentIllness,
        medicalHistory: form.medicalHistory,
        physicalExam: form.physicalExam,
        treatmentPlan: form.treatmentPlan,
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
        setDiagnoses(normalizeDiagnosisOrder(savedEncounter.diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type, managementPrograms }) => ({
          conceptId, diagnosisDomain, diagnosisGroupId, code, display, type, managementPrograms,
        }))))
      }

      setStructuredBaseline(structuredFormSignature(selectedNoteFormId, structuredValues))

      if (savedEncounter) {
        queryClient.setQueriesData({ queryKey: ['doctor-encounters'] }, (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((item: Encounter) => item.id === encounter.id ? { ...item, ...savedEncounter } : item)
        })
      }

      try {
        const latestDocs = await api.clinicalDocuments.byEncounter(encounter.id)
        queryClient.setQueryData(['doctor-document', encounter.id], latestDocs)
      } catch {
        // ignore
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] }),
        onRefresh(),
      ])
    },
    onError: (error) => {
      onSaveDraftNotice?.({ message: errorMessage(error), tone: 'error' })
    },
  })
  useEffect(() => {
    if (save.isPending) return
    const hasLocalWork = formState.isDirty || structuredChanged || diagnosesChanged
      || medicationDrafts.length > 0 || serviceDrafts.length > 0
    if (serverStateInitialized.current && hasLocalWork) return
    if (!serverStateInitialized.current && documents.isPending) return

    reset({ chiefComplaint: encounter.chiefComplaint ?? '', presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '', physicalExam: document?.content.physicalExam ?? '',
      treatmentPlan: document?.content.treatmentPlan ?? '', systolic: encounter.systolic, diastolic: encounter.diastolic,
      temperature: document?.content.vitalSigns?.temperature, pulseRate: document?.content.vitalSigns?.pulseRate,
      respiratoryRate: document?.content.vitalSigns?.respiratoryRate, heightCm: document?.content.vitalSigns?.heightCm,
      weightKg: document?.content.vitalSigns?.weightKg, oxygenSaturation: document?.content.vitalSigns?.oxygenSaturation })
    setDiagnoses(normalizeDiagnosisOrder(encounter.diagnoses.map(({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementPrograms }) => ({ conceptId, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementPrograms }))))
    const savedFormId = document?.content.structuredForm?.versionId ?? ''
    const savedValues = document?.content.structuredData ?? {}
    setSelectedNoteFormId(savedFormId)
    setStructuredValues(savedValues)
    setStructuredErrors({})
    setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))
    serverStateInitialized.current = true
  }, [diagnosesChanged, document, documents.isPending, encounter, formState.isDirty, medicationDrafts.length, reset,
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
    if (historyCopy.medicationDrafts?.length) setMedicationDrafts((current) => {
      const keys = new Set(current.map(medicationDraftKey))
      return [...current, ...historyCopy.medicationDrafts!.filter((item) => !keys.has(medicationDraftKey(item)))]
    })
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
  }, [documents.isPending, getValues, historyCopy, onHistoryCopyConsumed, reset, encounter, save.isPending, orderBusy, document?.status, allergyState])
  const sign = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(document!.id, document!.currentVersion),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter.id] }); await onRefresh(); onRequestReading() },
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
      const previous = getValues()
      const next = mergeAiRecordDraft(previous, aiDraft.recordDraft, aiDraft.overwriteRecord === true)
      const changedFields = (Object.keys(aiDraft.recordDraft) as Array<keyof ClinicalAiRecordDraft>)
        .filter((field) => previous[field] !== next[field])
      if (changedFields.length) setAiRecordUndo({
        before: Object.fromEntries(changedFields.map((field) => [field, previous[field] ?? ''])),
        after: Object.fromEntries(changedFields.map((field) => [field, next[field] ?? ''])),
        documentVersion: document?.currentVersion ?? 0,
      })
      reset(next, { keepDefaultValues: true })
    }
    const diagnosesWithAi = aiDraft.diagnoses?.length
      ? mergeAiDiagnoses(diagnoses, aiDraft.diagnoses) : diagnoses
    if (aiDraft.diagnoses?.length) setDiagnoses(normalizeDiagnosisOrder(diagnosesWithAi))
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
  const handleRecordSubmit = handleSubmit(
    (value) => {
      if (aiFieldStream?.encounterId === encounter.id) {
        onSaveDraftNotice?.({ message: 'AI 正在生成，请待完整病历带入并核对后保存。', tone: 'warning' })
        return
      }
      save.mutate(value)
    },
    (formErrors) => {
      const first = Object.values(formErrors)[0]?.message
      onSaveDraftNotice?.({
        message: typeof first === 'string' ? first : '请检查病历表单必填项',
        tone: 'error',
      })
    }
  )
  useEffect(() => {
    onRegisterSaveDraft?.(handleRecordSubmit)
    return () => onRegisterSaveDraft?.(null)
  }, [handleRecordSubmit, onRegisterSaveDraft])
  const signed = document?.status === 'SIGNED'
  const isDiagnosisEmpty = diagnoses.length === 0
  const showDiagnosisComposer = editing && !signed && (diagnosisComposerOpen || isDiagnosisEmpty)
  const addDiagnosis = (candidate?: ClinicalResourceOption<DiseaseConcept>) => {
    const selected = candidate?.raw ?? diagnosisSearch?.raw
    if (!selected) { setDiagnosisError('请先检索并选择诊断'); return }
    if (diagnoses.some((item) => item.conceptId === selected.id
      || (item.diagnosisDomain === selected.sdDiagnosisDomain && item.code === selected.code))) {
      setDiagnosisError('该诊断已经录入'); return
    }
    const diagnosisGroupId = selected.sdDiagnosisDomain === 'WESTERN_MEDICINE'
      ? undefined : `TCM-${encounter.id}`
    setDiagnoses((current) => normalizeDiagnosisOrder([
      ...current,
      { conceptId: selected.id, diagnosisDomain: selected.sdDiagnosisDomain, diagnosisGroupId,
        code: selected.code, display: selected.display, type: 'SECONDARY',
        managementPrograms: selected.managementPrograms.map((program) => ({ id: program.id, code: program.code,
          name: program.name, managementType: program.sdManagementType, triggerAction: program.sdTriggerAction,
          reportCardType: program.reportCardType, reportDeadlineHours: program.reportDeadlineHours })) },
    ]))
    setDiagnosisSearch(undefined)
    setDiagnosisError('')
    window.requestAnimationFrame(() => {
      window.document.getElementById('doctor-diagnosis-composer-search')?.focus()
    })
  }
  const recordValues = watch()
  const streamingRecord = aiFieldStream?.encounterId === encounter.id
    && aiFieldStream.contextFingerprint === clinicalAiContextFingerprint(buildAiContext()) ? aiFieldStream.recordDraft : null
  const streamingField = (field: keyof ClinicalAiRecordDraft) => ({
    value: streamingRecord?.[field] ?? recordValues[field] ?? '',
    readOnly: streamingRecord !== null,
    'aria-busy': streamingRecord !== null || undefined,
    className: streamingRecord !== null ? 'doctor-record-field--generating' : undefined,
  })
  const height = recordValues.heightCm
  const weight = recordValues.weightKg
  const bmi = height && weight && Number(height) > 0 ? (Number(weight) / ((Number(height) / 100) ** 2)).toFixed(1) : undefined

  const moveDiagnosisByOffset = (key: string, offset: number) => setDiagnoses((current) => {
    const sourceIndex = current.findIndex((item) => diagnosisKey(item) === key)
    const target = current[sourceIndex + offset]
    return target ? moveDiagnosis(current, key, diagnosisKey(target)) : normalizeDiagnosisOrder(current)
  })
  const makePrimary = (key: string) => setDiagnoses((current) => {
    const first = current[0]
    return first ? moveDiagnosis(current, key, diagnosisKey(first)) : current
  })
  const removeDiagnosis = (key: string) => setDiagnoses((current) => normalizeDiagnosisOrder(current.filter((item) =>
    diagnosisKey(item) !== key)))
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
  const encounterEditable = ['REGISTERED', 'IN_PROGRESS', 'SUSPENDED'].includes(encounter.status)
  const editActionLabel = encounter.status === 'REGISTERED' ? '开始接诊'
    : encounter.status === 'SUSPENDED' ? '恢复接诊' : '进入编辑'
  const readOnlyReason = !canEdit ? '当前账号没有病历编辑权限'
    : !encounterEditable ? '本次就诊已结束；如需更正，应发起病历修订并保留原始版本'
      : signed ? '病历已签署；如需更正，应发起病历修订' : ''

  const canUndoAiRecord = Boolean(aiRecordUndo && !signed && !businessBusy
    && aiRecordUndo.documentVersion === (document?.currentVersion ?? 0)
    && Object.entries(aiRecordUndo.after).every(([field, value]) =>
      getValues(field as keyof ClinicalAiRecordDraft) === value))
  const undoAiRecord = () => {
    if (!canUndoAiRecord || !aiRecordUndo) return
    reset({ ...getValues(), ...aiRecordUndo.before }, { keepDefaultValues: true })
    setAiRecordUndo(null)
    setCopyNotice('已撤销本次 AI 病历采纳；诊断及医嘱草稿保留。')
  }

  return <section className={`doctor-clinical-cockpit ${editing ? 'is-editing' : 'is-reading'}`}>
    {!editing && <div className="doctor-clinical-modebar">
      <span><strong>阅读状态</strong>
        <small>{signed ? '病历已签署' : document ? '仅查看，不会修改就诊状态和时间' : '尚未形成病历记录'}</small></span>
      <Button size="sm" busy={enteringEdit} disabled={Boolean(readOnlyReason)}
          title={readOnlyReason || `${editActionLabel}后可修改病历`}
          onClick={onRequestEditing}>{editActionLabel}</Button>
    </div>}
    {!editing && readOnlyReason && <div className="doctor-clinical-readonly-note"><Icon name="lock" />
      <span>{readOnlyReason}</span></div>}
    <div className="doctor-record-column"><Panel className="doctor-record-panel">
      <PanelHead className="doctor-record-heading" title="门诊病历"
        meta={signed ? '已签署' : document ? `草稿 V${document.currentVersion}` : '尚未保存'}
        actions={<>{editing && <NoteTemplateBar api={api} disabled={signed} currentContent={currentNoteContent}
          onApply={applyNoteTemplate} />}
          {document && signed && <Button size="sm" variant="secondary"
          onClick={() => setNotePrintOpen(true)}><Icon name="print" />打印病历</Button>}</>} />
      {editing && !signed && <div ref={aiSurfaceRefs.note} />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {copyNotice && <div className="doctor-history-copy-notice"><Icon name="roadmap" /><span>{copyNotice}</span>
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
        <FormField className="doctor-record-narrative doctor-record-field--chief" label="主诉" required error={formState.errors.chiefComplaint?.message}>
          <textarea {...register('chiefComplaint')} {...streamingField('chiefComplaint')} disabled={signed} placeholder="症状、持续时间及本次就诊原因" rows={2} />
        </FormField>
        <FormField className="doctor-record-narrative doctor-record-field--present" label="现病史" error={formState.errors.presentIllness?.message}>
          <textarea {...register('presentIllness')} {...streamingField('presentIllness')} disabled={signed} placeholder="起病、演变、伴随症状及诊治经过" rows={3} />
        </FormField>
        <FormField className="doctor-record-narrative doctor-record-field--history" label="既往史" error={formState.errors.medicalHistory?.message}>
          <textarea {...register('medicalHistory')} {...streamingField('medicalHistory')} disabled={signed} placeholder="既往疾病、手术、过敏及长期用药" rows={2} />
        </FormField>
        {(() => {
          const tempNum = recordValues.temperature ? Number(recordValues.temperature) : undefined
          const isTempAbnormal = exceedsWarning(tempNum, vitalRule(vitalRulesQuery.data, 'temperature'))

          const pulseNum = recordValues.pulseRate ? Number(recordValues.pulseRate) : undefined
          const isPulseAbnormal = exceedsWarning(pulseNum, vitalRule(vitalRulesQuery.data, 'pulse'))

          const respNum = recordValues.respiratoryRate ? Number(recordValues.respiratoryRate) : undefined
          const isRespAbnormal = exceedsWarning(respNum, vitalRule(vitalRulesQuery.data, 'respiratory-rate'))

          const spo2Num = recordValues.oxygenSaturation ? Number(recordValues.oxygenSaturation) : undefined
          const isSpo2Abnormal = exceedsWarning(spo2Num, vitalRule(vitalRulesQuery.data, 'oxygen-saturation'))

          const sysNum = recordValues.systolic ? Number(recordValues.systolic) : undefined
          const diaNum = recordValues.diastolic ? Number(recordValues.diastolic) : undefined
          const isBpAbnormal = exceedsWarning(sysNum, vitalRule(vitalRulesQuery.data, 'systolic-pressure'))
            || exceedsWarning(diaNum, vitalRule(vitalRulesQuery.data, 'diastolic-pressure'))

          const bmiNum = bmi ? Number(bmi) : undefined
          const bmiStatus = bmiNum !== undefined && !isNaN(bmiNum)
            ? bmiNum < 18.5 ? { label: '偏瘦', tone: 'info' as const }
              : bmiNum < 24.0 ? { label: '正常', tone: 'normal' as const }
                : bmiNum < 28.0 ? { label: '超重', tone: 'warning' as const }
                  : { label: '肥胖', tone: 'danger' as const }
            : null

          return (
            <div className="doctor-physical-exam" role="group" aria-labelledby="doctor-physical-exam-label">
              <span id="doctor-physical-exam-label" className="doctor-physical-exam__label">体格检查</span>
              <div className="doctor-physical-exam__body">
                {activeRef && (
                  <div className="doctor-recent-vitals-bar" aria-label="近期体格数据参考">
                    <div className="doctor-recent-vitals-head">
                      <Icon name="roadmap" />
                      <span className="doctor-recent-vitals-title">近期参考</span>
                      {availableSources.length > 1 ? (
                        <div className="doctor-recent-vitals-tabs" role="tablist">
                          {availableSources.map((src, idx) => (
                            <button
                              key={src.sourceType}
                              type="button"
                              className={`doctor-recent-vitals-tab ${selectedRefIdx === idx ? 'is-active' : ''}`}
                              onClick={() => setSelectedRefIdx(idx)}
                            >
                              {src.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="doctor-recent-vitals-tag">{activeRef.label}</span>
                      )}
                    </div>
                    <div className="doctor-recent-vitals-metrics">
                      {formatVitalsSummary(activeRef.vitals).map((item) => (
                        <span key={item.key} className="doctor-recent-vitals-metric">
                          <span className="doctor-recent-vitals-metric__name">{item.label}</span>
                          <strong className="doctor-recent-vitals-metric__val">{item.text}</strong>
                        </span>
                      ))}
                    </div>
                    {!signed && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className={`doctor-recent-vitals-apply-btn ${appliedRefFeedback ? 'is-applied' : ''}`}
                        onClick={() => handleApplyReferenceVitals(activeRef.vitals)}
                        title={`将${activeRef.label}的数据一键带入本次病历`}
                      >
                        <Icon name={appliedRefFeedback ? 'check' : 'roadmap'} />
                        {appliedRefFeedback ? '已带入' : `引用${activeRef.sourceType === 'TRIAGE' ? '分诊数据' : '上次结果'}`}
                      </Button>
                    )}
                  </div>
                )}
                <div className={`doctor-vital-grid ${appliedRefFeedback ? 'is-highlight' : ''}`}>
                  <div className={`doctor-vital-cell ${isTempAbnormal ? 'is-abnormal' : ''}`}>
                    <span className="doctor-vital-name">
                      体温
                      {isTempAbnormal && <span className="doctor-vital-alert-dot" title="体温异常" />}
                    </span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="体温" type="number" step="0.1" min={VITAL_HARD_LIMITS.temperature.minimum}
                        max={VITAL_HARD_LIMITS.temperature.maximum} disabled={signed}
                        {...register('temperature', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>℃</small>
                    </div>
                  </div>
                  <div className={`doctor-vital-cell ${isPulseAbnormal ? 'is-abnormal' : ''}`}>
                    <span className="doctor-vital-name">
                      脉搏
                      {isPulseAbnormal && <span className="doctor-vital-alert-dot" title="脉搏异常" />}
                    </span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="脉搏" type="number" min={VITAL_HARD_LIMITS.pulse.minimum}
                        max={VITAL_HARD_LIMITS.pulse.maximum} disabled={signed}
                        {...register('pulseRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>次/分</small>
                    </div>
                  </div>
                  <div className={`doctor-vital-cell ${isRespAbnormal ? 'is-abnormal' : ''}`}>
                    <span className="doctor-vital-name">
                      呼吸
                      {isRespAbnormal && <span className="doctor-vital-alert-dot" title="呼吸频率异常" />}
                    </span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="呼吸" type="number" min={VITAL_HARD_LIMITS.respiratoryRate.minimum}
                        max={VITAL_HARD_LIMITS.respiratoryRate.maximum} disabled={signed}
                        {...register('respiratoryRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>次/分</small>
                    </div>
                  </div>
                  <div className={`doctor-vital-cell ${isSpo2Abnormal ? 'is-abnormal' : ''}`}>
                    <span className="doctor-vital-name">
                      血氧
                      {isSpo2Abnormal && <span className="doctor-vital-alert-dot" title="血氧偏低" />}
                    </span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="血氧" type="number" min={VITAL_HARD_LIMITS.oxygenSaturation.minimum}
                        max={VITAL_HARD_LIMITS.oxygenSaturation.maximum} disabled={signed}
                        {...register('oxygenSaturation', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>%</small>
                    </div>
                  </div>
                  <div className={`doctor-vital-cell doctor-vital-cell--bp ${isBpAbnormal ? 'is-abnormal' : ''}`}>
                    <span className="doctor-vital-name">
                      血压
                      {isBpAbnormal && <span className="doctor-vital-alert-dot" title="血压异常" />}
                    </span>
                    <div className="doctor-vital-input-wrap doctor-vital-bp-wrap">
                      <input aria-label="收缩压" type="number" min={VITAL_HARD_LIMITS.systolicPressure.minimum}
                        max={VITAL_HARD_LIMITS.systolicPressure.maximum}
                        {...register('systolic', { valueAsNumber: true })} disabled={signed} />
                      <b>/</b>
                      <input aria-label="舒张压" type="number" min={VITAL_HARD_LIMITS.diastolicPressure.minimum}
                        max={VITAL_HARD_LIMITS.diastolicPressure.maximum}
                        {...register('diastolic', { valueAsNumber: true })} disabled={signed} />
                      <small>mmHg</small>
                    </div>
                  </div>
                  <div className="doctor-vital-cell">
                    <span className="doctor-vital-name">身高</span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="身高" type="number" step="0.1" min={VITAL_HARD_LIMITS.height.minimum}
                        max={VITAL_HARD_LIMITS.height.maximum} disabled={signed}
                        {...register('heightCm', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>cm</small>
                    </div>
                  </div>
                  <div className="doctor-vital-cell">
                    <span className="doctor-vital-name">体重</span>
                    <div className="doctor-vital-input-wrap">
                      <input aria-label="体重" type="number" step="0.1" min={VITAL_HARD_LIMITS.weight.minimum}
                        max={VITAL_HARD_LIMITS.weight.maximum} disabled={signed}
                        {...register('weightKg', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
                      <small>kg</small>
                    </div>
                  </div>
                  <div className="doctor-vital-cell doctor-vital-cell--bmi">
                    <span className="doctor-vital-name">BMI</span>
                    <div className="doctor-vital-bmi-content">
                      <span className="doctor-vital-bmi-value">{bmi ?? '—'}</span>
                      <small>kg/m²</small>
                      {bmiStatus && <span className={`doctor-vital-bmi-badge doctor-vital-bmi-badge--${bmiStatus.tone}`}>{bmiStatus.label}</span>}
                    </div>
                  </div>
                </div>
              </div>
              {Object.values({ systolic: formState.errors.systolic, diastolic: formState.errors.diastolic,
                temperature: formState.errors.temperature, pulseRate: formState.errors.pulseRate,
                respiratoryRate: formState.errors.respiratoryRate, heightCm: formState.errors.heightCm,
                weightKg: formState.errors.weightKg, oxygenSaturation: formState.errors.oxygenSaturation })
                .find(Boolean)?.message && <small className="ui-field__message ui-field__error">请检查生命体征录入范围</small>}
            </div>
          )
        })()}
        <FormField className="doctor-record-narrative doctor-record-field--exam" label="查体所见" error={formState.errors.physicalExam?.message}>
          <textarea {...register('physicalExam')} {...streamingField('physicalExam')} disabled={signed} placeholder="阳性体征及必要的阴性体征" rows={3} />
        </FormField>
        <FormField className="doctor-record-narrative doctor-record-field--plan" label="诊疗计划" error={formState.errors.treatmentPlan?.message}>
          <textarea {...register('treatmentPlan')} {...streamingField('treatmentPlan')} disabled={signed} placeholder="检查、治疗、用药和随访安排" rows={3} />
        </FormField>
        {selectedNoteForm && <StructuredNoteForm form={selectedNoteForm} values={structuredValues}
          errors={structuredErrors} disabled={signed} onChange={(code, value) => {
            setStructuredValues((current) => ({ ...current, [code]: value }))
            setStructuredErrors((current) => ({ ...current, [code]: '' }))
          }} />}
        {document && !signed && (
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
      <Panel className={`doctor-diagnosis-panel ${diagnoses.length === 0 ? 'is-empty' : ''} ${diagnosisHovered ? 'is-hovered' : ''}`}
        onMouseEnter={() => setDiagnosisHovered(true)}
        onMouseLeave={() => setDiagnosisHovered(false)}>
        <PanelHead title="诊断" meta={`${diagnoses.length} 项`} actions={
          editing ? <PlanTemplatePanel diagnoses={diagnoses} setDiagnoses={setDiagnoses}
            medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
            serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts}
            allergies={allergies} api={api} disabled={signed} /> : undefined} />
        <div className="doctor-diagnosis-content">
          <div className="doctor-table-wrap">
            <div className={`doctor-diagnosis-list ${diagnoses.length === 0 ? 'is-empty' : ''}`} role="table" aria-label="本次诊断连续录入列表">
              <div className="doctor-diagnosis-head" role="row">
                <span className="doctor-diag-col-type">类型</span>
                <span className="doctor-diag-col-main">诊断名称与ICD编码</span>
                <span className="doctor-diag-col-domain">主次</span>
                <span className="doctor-diag-col-management">公共卫生管理 / 临床提示</span>
                {editing && !signed && <span className="doctor-diag-col-actions">操作</span>}
              </div>

              {editing && !signed && <div ref={aiSurfaceRefs.diagnoses} />}

              {diagnoses.length === 0 && (!editing || signed) && (
                <div className="doctor-diagnosis-empty" role="row">
                  <span>尚未录入诊断</span>
                </div>
              )}

              {diagnoses.map((item, index) => {
                const key = item.conceptId || `${item.diagnosisDomain}|${item.code}`
                const isPrimary = item.type === 'PRIMARY'
                return <div key={key} className={`doctor-diagnosis-row ${isPrimary ? 'is-primary' : ''}${draggedDiagnosisKey === key ? ' is-dragging' : ''}`}
                  role="row"
                  onDragOver={(event) => { if (editing && !signed) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (draggedDiagnosisKey) setDiagnoses((current) => moveDiagnosis(current, draggedDiagnosisKey, String(key)))
                    setDraggedDiagnosisKey(undefined)
                  }}
                  onDragEnd={() => setDraggedDiagnosisKey(undefined)}>
                  <span className="doctor-diag-col-type">
                    {editing && !signed && (
                      <span
                        className="doctor-diag-drag-handle"
                        title="拖动调整诊断顺序"
                        role="button"
                        aria-label={`拖动调整诊断顺序 ${item.display}`}
                        draggable
                        onDragStart={(event) => {
                          setDraggedDiagnosisKey(String(key))
                          event.dataTransfer.effectAllowed = 'move'
                          const row = event.currentTarget.closest('.doctor-diagnosis-row') as HTMLElement | null
                          if (row && event.dataTransfer.setDragImage) {
                            const rect = row.getBoundingClientRect()
                            event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top)
                          }
                        }}
                        onDragEnd={() => setDraggedDiagnosisKey(undefined)}
                      >
                        <Icon name="drag" />
                      </span>
                    )}
                    <span className={`doctor-diag-domain-pill is-${(item.diagnosisDomain ?? 'WESTERN_MEDICINE').toLowerCase()}`}>
                      {item.diagnosisDomain === 'TCM_DISEASE' ? '中医病名'
                        : item.diagnosisDomain === 'TCM_SYNDROME' ? '中医证候' : '西医诊断'}
                    </span>
                  </span>
                  <span className="doctor-diag-col-main">
                    <div className="doctor-diag-name-wrap">
                      <strong className="doctor-diag-name">{item.display}</strong>
                      <span className="doctor-diag-code-pill" title={`ICD编码: ${item.code}`}>{item.code}</span>
                    </div>
                  </span>
                  <span className="doctor-diag-col-domain">
                    <span className={`doctor-diag-badge ${isPrimary ? 'is-primary' : 'is-secondary'}`}>
                      {isPrimary ? '主要诊断' : `次要 #${index}`}
                    </span>
                  </span>
                  <span className="doctor-diag-col-management">
                    {item.managementPrograms?.length ? (
                      <div className="doctor-diag-management-flow">
                        {item.managementPrograms.map((program) => (
                          <span key={program.id} className="doctor-diag-management-chip" title={program.name}>
                            {program.name}
                          </span>
                        ))}
                      </div>
                    ) : <span className="doctor-diag-subtle-dash">—</span>}
                  </span>
                  {editing && !signed && (
                    <span className="doctor-diag-col-actions">
                      <Button type="button" size="sm" variant="text" disabled={index === 0}
                        onClick={() => moveDiagnosisByOffset(String(key), -1)} title="上移" aria-label={`上移诊断 ${item.display}`}><Icon name="chevron-up" /></Button>
                      <Button type="button" size="sm" variant="text" disabled={index === diagnoses.length - 1}
                        onClick={() => moveDiagnosisByOffset(String(key), 1)} title="下移" aria-label={`下移诊断 ${item.display}`}><Icon name="chevron-down" /></Button>
                      {!isPrimary && <Button type="button" size="sm" variant="text" disabled={signed}
                        onClick={() => makePrimary(key)}>设为主要</Button>}
                      <Popconfirm
                        title={`确认移除诊断“${item.display}”？`}
                        okText="移除"
                        okVariant="danger"
                        disabled={signed}
                        onConfirm={() => removeDiagnosis(key)}
                      >
                        <Button type="button" size="sm" variant="text" disabled={signed}>移除</Button>
                      </Popconfirm>
                    </span>
                  )}
                </div>
              })}

              {showDiagnosisComposer && (
                <div ref={diagnosisComposerRef} className="doctor-diagnosis-row is-active-composer" role="row"
                  onBlur={(event) => {
                    const next = event.relatedTarget as Node | null
                    if (!next) return
                    const isInsideRow = diagnosisComposerRef.current?.contains(next)
                    const isInsidePopover = Boolean(
                      (next as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover, .ui-popconfirm')
                    )
                    if (!isInsideRow && !isInsidePopover && !diagnosisSearch) {
                      if (!isDiagnosisEmpty) {
                        setDiagnosisComposerOpen(false)
                      }
                      setDiagnosisSearch(undefined)
                      setDiagnosisError('')
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && !diagnosisSearch) {
                      e.preventDefault()
                      setDiagnosisSearch(undefined)
                      if (!isDiagnosisEmpty) {
                        setDiagnosisComposerOpen(false)
                      }
                      setDiagnosisError('')
                    } else if (e.key === 'Enter' && diagnosisSearch && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addDiagnosis()
                    }
                  }}>
                  <span className="doctor-diag-col-type">
                    <div className="doctor-diag-composer-domain">
                      <Select aria-label="诊断类型" value={diagnosisDomainFilter} clearable={false} searchable={false}
                        disabled={signed}
                        placeholder="全部类型"
                        options={[
                          { value: '', label: '全部类型' },
                          { value: 'WESTERN_MEDICINE', label: '西医诊断' },
                          { value: 'TCM_DISEASE', label: '中医病名' },
                          { value: 'TCM_SYNDROME', label: '中医证候' },
                        ]}
                        onChange={(val) => { setDiagnosisDomainFilter(val); setDiagnosisSearch(undefined) }} />
                    </div>
                  </span>
                  <span className="doctor-diag-col-composer-main">
                    <div className="doctor-diag-composer-search">
                      <ClinicalResourceSearch<DiseaseConcept> id="doctor-diagnosis-composer-search" api={api}
                        resource="diagnosis" value={diagnosisSearch}
                        filterResult={(item) => !diagnosisDomainFilter || item.sdDiagnosisDomain === diagnosisDomainFilter}
                        disabled={signed}
                        placeholder={diagnoses.length === 0 ? "检索并选择主要诊断 (拼音/编码/名称，回车连续录入)" : "检索并选择次要诊断 (支持拼音/编码/名称，回车连续录入)"}
                        onChange={(option) => {
                          if (option) {
                            addDiagnosis(option)
                          } else {
                            setDiagnosisSearch(undefined)
                            setDiagnosisError('')
                          }
                        }} />
                    </div>
                  </span>
                  <span className="doctor-diag-col-composer-hint">
                    <span className="doctor-diag-badge is-composer">新增</span>
                    {diagnoses.length === 0 ? (
                      <span className="doctor-diag-hint is-required">接诊需至少录入一项主要诊断</span>
                    ) : (
                      <span className="doctor-diag-hint">已开立 {diagnoses.length} 项，支持连续盲打</span>
                    )}
                    {!isDiagnosisEmpty && (
                      <Button type="button" size="sm" variant="text" onClick={() => {
                        setDiagnosisSearch(undefined); setDiagnosisComposerOpen(false); setDiagnosisError('')
                      }} title="退出诊断录入" aria-label="退出诊断录入"><Icon name="close" /></Button>
                    )}
                  </span>
                </div>
              )}
            </div>

            {editing && !signed && !showDiagnosisComposer && (
              <div className="doctor-diagnosis-row is-launcher" role="row" onClick={() => {
                setDiagnosisComposerOpen(true)
              }}>
                <div className="doctor-diag-launcher-cell">
                  <button type="button" className="doctor-table-launcher-btn" aria-label="新增诊断" onClick={(e) => {
                    e.stopPropagation()
                    setDiagnosisComposerOpen(true)
                  }}>
                    <Icon name="add" />
                    <span><strong>新增诊断</strong></span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {editing && diagnosisError && <small className="ui-field__message ui-field__error">{diagnosisError}</small>}
          {diagnoses.some((item) => item.managementPrograms?.length) && <Alert tone="warning"
            className="doctor-diagnosis-management-alert">
            <strong>公共卫生管理提示</strong>
            <span>{Array.from(new Set(diagnoses.flatMap((item) => item.managementPrograms?.map((program) =>
              `${item.display}：${program.name}${program.managementType === 'DISEASE_REPORT' ? '（需生成报卡草稿）' : '（需确认是否纳入管理）'}`) ?? []))).join('；')}</span>
          </Alert>}
        </div>
      </Panel>
      <OrdersPanel aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
        onTreatmentKeysChange={onTreatmentKeysChange} encounter={encounter} allergies={allergies} api={api} editing={editing}
        aiSuggestionSurfaceRef={editing && !signed ? aiSurfaceRefs.plans : undefined}
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
  setDiagnoses((current) => normalizeDiagnosisOrder([...current, ...value.diagnoses
    .filter((item) => !diagnosisCodes.has(item.code.toUpperCase()))
    .map((item) => ({ ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type }))]))
  const medicationKeys = new Set(currentMedications.map(medicationDraftKey))
  setMedications((current) => [...current, ...value.medications.filter((item) => !medicationKeys.has([
    item.medicationId, item.catalogItemId ?? '', item.routeCode ?? '', item.frequencyCode ?? '',
  ].join('|'))).map((item, index) => ({
    id: globalThis.crypto.randomUUID(), sequence: Date.now() + index, editorMode: item.editorMode, categoryCode: item.categoryCode,
    medicationName: item.medicationName, medicationCode: item.medicationCode,
    preparationSpec: item.preparationSpec, productName: item.productName || item.medicationName,
    routeName: item.routeName, routeExecutionType: item.routeExecutionType,
    administrationGroupKey: item.routeExecutionType === 'INFUSION'
      ? `draft:${globalThis.crypto.randomUUID()}` : undefined,
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
  serviceDrafts, setServiceDrafts, editing, onBusyChange, aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange,
  aiSuggestionSurfaceRef }: {
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onTreatmentKeysChange?: (keys: string[]) => void
  aiSuggestionSurfaceRef?: (element: HTMLDivElement | null) => void
  encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  editing: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [ordersHovered, setOrdersHovered] = useState(false)
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null)
  useEffect(() => {
    setReviewOpen(false)
  }, [encounter.id])
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id], queryFn: () => api.encounters.prescriptions(encounter.id) })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
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
  const saveDraftOrders = useMutation({
    mutationFn: async () => {
      const currentPrescriptions = await api.encounters.prescriptions(encounter.id).catch(() => prescriptions.data ?? [])
      await persistOrderDrafts(encounter.id, medicationDrafts, serviceDrafts, api, currentPrescriptions)
    },
    onSuccess: async () => {
      setMedicationDrafts([])
      setServiceDrafts([])
      await refresh()
    },
  })
  const confirmPlan = useMutation({
    mutationFn: async () => {
      const currentPrescriptions = await api.encounters.prescriptions(encounter.id).catch(() => prescriptions.data ?? [])
      await persistOrderDrafts(encounter.id, medicationDrafts, serviceDrafts, api, currentPrescriptions)
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
  useEffect(() => onBusyChange(confirmPlan.isPending || saveDraftOrders.isPending), [confirmPlan.isPending, saveDraftOrders.isPending, onBusyChange])
  const persistedDraftCount = (prescriptions.data ?? []).reduce((sum, value) => sum
    + (value.status === 'DRAFT' ? value.medicationRequests.filter((request) => request.status === 'DRAFT').length : 0), 0)
  const planCount = medicationDrafts.length + serviceDrafts.length + persistedDraftCount
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)
  const splitSummary = prescriptionSplitSummary(medicationDrafts, prescriptions.data ?? [])
  const error = prescriptions.error || services.error || medications.error
    || cancelService.error || cancelMedication.error || confirmPlan.error || saveDraftOrders.error
  const hasAnyOrders = orderCount + planCount > 0

  return <Panel className={`doctor-orders-panel ${!hasAnyOrders ? 'is-empty' : ''} ${ordersHovered ? 'is-hovered' : ''}`}
    onMouseEnter={() => setOrdersHovered(true)}
    onMouseLeave={() => setOrdersHovered(false)}>
    <PanelHead title="医嘱和费用信息" meta={<>{orderCount} 项已开立
      {statement.data ? ` · ${money(statement.data.chargeAmount, statement.data.currencyCode)}` : ''}</>}
      actions={editing ? <div className="doctor-order-head-actions">
        <StatusBadge tone={planCount ? 'warning' : 'neutral'}>{planCount} 项待确认</StatusBadge>
        <Button size="sm" disabled={planCount === 0} onClick={() => setReviewOpen(true)}>审核开立</Button>
      </div> : undefined} />
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <div className="doctor-orders-content">
      {prescriptions.isPending || services.isPending || medications.isPending ? <LoadingState />
        : <UnifiedOrderListEditor aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
          aiSuggestionSurfaceRef={aiSuggestionSurfaceRef} encounter={encounter} allergies={allergies}
          prescriptions={prescriptions.data ?? []} medications={medications.data ?? []} services={services.data ?? []}
          medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
          serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} api={api}
          readOnly={!editing}
          busy={cancelService.isPending || cancelMedication.isPending || confirmPlan.isPending}
          onCancelMedication={(item) => cancelMedication.mutate(item)}
          onCancelService={(item) => cancelService.mutate(item)}
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
        {splitSummary.length > 0 && <p className="doctor-prescription-split-summary">
          预计处方：{splitSummary.map((item) => `${prescriptionCategoryLabel(item.categoryCode)} ${item.medicationCount} 种 / ${item.prescriptionCount} 张`).join('；')}
        </p>}
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


function money(value: number, currencyCode = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currencyCode,
    minimumFractionDigits: 2 }).format(value)
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

function HistoryPanel({ encounters, currentEncounterId, api, copyDisabled = false, onCopy, allergies = [], allergyReady = false }: {
  encounters: Encounter[]; currentEncounterId?: string; api: RhnApi; copyDisabled?: boolean
  onCopy?: (draft: HistoryCopyDraft) => void
  allergies?: AllergyIntolerance[]
  allergyReady?: boolean
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
          {selected && <HistoryPrescriptionReference key={selected.id} encounter={selected} api={api}
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
