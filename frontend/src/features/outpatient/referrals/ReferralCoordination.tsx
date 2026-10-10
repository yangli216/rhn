import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ClinicalContext } from "../../../shared/clinical/workContext";
import type { Department } from "../../../shared/api/organizationApi";
import type { CreateOutpatientReferralInput, OutpatientReferral, OutpatientReferralStatus, OutpatientReferralType } from "../../../shared/api/outpatientReferralsApi";
import type { Encounter } from "../../../shared/model";
import { formatTime } from "../../../shared/format";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, PanelHead, StatusBadge, Select } from "../../../shared/ui"
import { commandCode } from '../workstation/workstationShared'

export type ReferralInboxAction =
  | { kind: 'ACCEPT'; request: OutpatientReferral }
  | { kind: 'COMPLETE'; request: OutpatientReferral; opinion: string }
  | { kind: 'REJECT'; request: OutpatientReferral; reason: string }

export function ReferralInboxPanel({ requests, loading, api, onRefresh }: {
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

export function referralTypeLabel(value: OutpatientReferralType) {
  return value === 'INTERNAL_CONSULT' ? '院内会诊' : '院内转科'
}

export function referralStatusLabel(value: OutpatientReferralStatus) {
  return ({ REQUESTED: '待接收', ACCEPTED: '处理中', COMPLETED: '已完成', REJECTED: '已退回', CANCELLED: '已撤销' } as const)[value]
}

export function referralStatusTone(value: OutpatientReferralStatus): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
  return ({ REQUESTED: 'warning', ACCEPTED: 'info', COMPLETED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const)[value]
}

export function defaultClinicalSummary(encounter: Encounter) {
  const primary = encounter.diagnoses.find((item) => item.type === 'PRIMARY')
  return [encounter.chiefComplaint && `主诉：${encounter.chiefComplaint}`,
    primary && `主要诊断：${primary.display}（${primary.code}）`].filter(Boolean).join('\n')
}

export function ReferralCoordinationPanel({ encounter, clinicalContext, api, hasUnsavedDraft, onRefresh }: {
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
        <FormField label="协同类型" required><Select value={referralType} clearable={false}
          onChange={(value) => setReferralType(value as OutpatientReferralType)}
          options={[{ value: 'INTERNAL_CONSULT', label: '院内会诊' }, { value: 'DEPARTMENT_TRANSFER', label: '院内转科' }]} /></FormField>
        <FormField label="目标科室" required><Select value={targetDepartmentId} clearable={false} disabled={!targets.length}
          onChange={setTargetDepartmentId} emptyText="暂无可选科室"
          options={targets.map((value: Department) => ({ value: value.id, label: value.name }))} /></FormField>
        <FormField label="紧急程度"><Select value={urgency} clearable={false}
          onChange={(value) => setUrgency(value as CreateOutpatientReferralInput['urgency'])}
          options={[{ value: 'ROUTINE', label: '常规' }, { value: 'URGENT', label: '加急' }]} /></FormField>
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
