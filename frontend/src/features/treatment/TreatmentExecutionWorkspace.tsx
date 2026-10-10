import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { TreatmentExecutionItem, TreatmentExecutionTask, TreatmentTaskStatus, TreatmentTaskType } from '../../shared/api/treatmentApi'
import { formatTime } from '../../shared/format'
import { treatmentFulfillmentPresentation } from '../../shared/presentation'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import '../../styles/features/treatment-skintest.css'

const statusText: Record<TreatmentTaskStatus, string> = {
  WAITING_SETTLEMENT: '待结算', WAITING_DISPENSE: '待发药', WAITING_SKIN_TEST: '待皮试', READY: '待执行', IN_PROGRESS: '执行中',
  COMPLETED: '已完成', CANCELLED: '已取消', EXCEPTION: '异常待处理',
}

function tone(status: TreatmentTaskStatus) {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'WAITING_SETTLEMENT' || status === 'WAITING_DISPENSE' || status === 'WAITING_SKIN_TEST') return 'warning' as const
  if (status === 'CANCELLED' || status === 'EXCEPTION') return 'danger' as const
  return 'info' as const
}

type VerificationMethod = 'NAME_AND_IDENTIFIER' | 'CARD' | 'MANUAL' | ''
type CompletionResult = 'COMPLETED' | 'INTERRUPTED' | 'NOT_COMPLETED' | ''

type TypeFilter = 'ALL' | TreatmentTaskType
type StatusFilter = 'ALL' | 'WAITING' | 'ACTIONABLE' | 'COMPLETED'

export function TreatmentExecutionWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const linkedResidentId = searchParams.get('residentId')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIONABLE')
  const [keyword, setKeyword] = useState('')
  const [taskId, setTaskId] = useState('')
  const [identityVerified, setIdentityVerified] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('')
  const [executionSite, setExecutionSite] = useState('')
  const [startNote, setStartNote] = useState('')
  const [resultCode, setResultCode] = useState<CompletionResult>('')
  const [completionNote, setCompletionNote] = useState('')
  const [adverseReaction, setAdverseReaction] = useState<boolean | null>(null)
  const [adverseReactionDetail, setAdverseReactionDetail] = useState('')

  const worklist = useQuery({
    queryKey: ['treatment-worklist', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.treatments.worklist()
      if (!Array.isArray(data)) throw new Error('治疗队列返回无效，请重新加载')
      return data
    }, refetchInterval: 30_000,
  })
  const allTasks = worklist.isSuccess ? worklist.data : []
  const values = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return allTasks.filter((task) => {
      if (typeFilter !== 'ALL' && task.taskType !== typeFilter) return false
      if (statusFilter === 'WAITING' && !['WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'WAITING_SKIN_TEST'].includes(task.status)) return false
      if (statusFilter === 'ACTIONABLE' && !['READY', 'IN_PROGRESS', 'EXCEPTION'].includes(task.status)) return false
      if (statusFilter === 'COMPLETED' && task.status !== 'COMPLETED') return false
      if (!normalized) return true
      return [task.residentName, task.healthRecordNo, task.taskNo, ...task.items.flatMap((item) => [item.itemName, item.requestNo])]
        .some((value) => value?.toLowerCase().includes(normalized))
    })
  }, [allTasks, keyword, statusFilter, typeFilter])

  useEffect(() => {
    if ((!linkedEncounterId && !linkedResidentId) || !worklist.data) return
    const target = worklist.data.find((item) => linkedEncounterId
      ? item.encounterId === linkedEncounterId : item.residentId === linkedResidentId)
    if (target) {
      if (target.status === 'COMPLETED') setStatusFilter('COMPLETED')
      else if (['WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'WAITING_SKIN_TEST'].includes(target.status)) setStatusFilter('WAITING')
      else setStatusFilter('ACTIONABLE')
      setTypeFilter('ALL')
      setKeyword('')
      setTaskId(target.id)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    next.delete('residentId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, linkedResidentId, searchParams, setSearchParams, worklist.data])
  useEffect(() => {
    if (linkedEncounterId || linkedResidentId) return
    if (!taskId && values.length) setTaskId(values[0].id)
    if (taskId && !values.some((value) => value.id === taskId)) setTaskId(values[0]?.id ?? '')
  }, [linkedEncounterId, linkedResidentId, taskId, values])
  const selected = values.find((value) => value.id === taskId)

  useEffect(() => {
    setIdentityVerified(false)
    setVerificationMethod('')
    setExecutionSite('')
    setStartNote('')
    setResultCode('')
    setCompletionNote('')
    setAdverseReaction(null)
    setAdverseReactionDetail('')
  }, [clinicalContext.organization.id, clinicalContext.department.id, selected?.id])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['treatment-worklist'] })
  const start = useMutation({
    mutationFn: () => {
      if (!worklist.isSuccess || worklist.isFetching || !selected || selected.status !== 'READY'
        || !identityVerified || !verificationMethod) throw new Error('请确认患者身份并选择实际核对方式')
      return api.treatments.start(selected.id, {
        expectedRevision: selected.revision, identityVerified, verificationMethod,
        executionSite: executionSite.trim() || undefined, note: startNote.trim() || undefined,
      })
    },
    onSuccess: refresh,
  })
  const complete = useMutation({
    mutationFn: () => {
      if (!worklist.isSuccess || worklist.isFetching || !selected || selected.status !== 'IN_PROGRESS'
        || !resultCode || adverseReaction === null || (adverseReaction && !adverseReactionDetail.trim())) {
        throw new Error('请明确记录执行结果及不良反应评估')
      }
      return api.treatments.complete(selected.id, {
        expectedRevision: selected.revision, resultCode, note: completionNote.trim() || undefined,
        adverseReaction, adverseReactionDetail: adverseReaction ? adverseReactionDetail.trim() : undefined,
      })
    },
    onSuccess: refresh,
  })
  const error = worklist.error || start.error || complete.error
  const metrics = useMemo(() => ({
    settlement: allTasks.filter((value) => value.status === 'WAITING_SETTLEMENT').length,
    dispense: allTasks.filter((value) => value.status === 'WAITING_DISPENSE').length,
    skinTest: allTasks.filter((value) => value.status === 'WAITING_SKIN_TEST').length,
    actionable: allTasks.filter((value) => ['READY', 'IN_PROGRESS', 'EXCEPTION'].includes(value.status)).length,
    completed: allTasks.filter((value) => value.status === 'COMPLETED').length,
  }), [allTasks])

  return <>
    <PageHeader eyebrow="门诊医疗 · 治疗执行" title="治疗执行工作台"
      description="基层简易模式统一承接注射、输液、雾化和治疗项目；系统自动校验结算与发药状态，执行人员只需完成核对、开始和结束。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新队列</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <section className="treatment-metrics" aria-label="治疗任务摘要">
      <div><span>待结算</span><strong>{worklist.isSuccess ? metrics.settlement : '—'}</strong><small>完成收费后自动放行</small></div>
      <div><span>待发药</span><strong>{worklist.isSuccess ? metrics.dispense : '—'}</strong><small>药房发药后自动放行</small></div>
      <div><span>待皮试</span><strong>{worklist.isSuccess ? metrics.skinTest : '—'}</strong><small>阴性结果后自动放行</small></div>
      <div><span>待执行 / 执行中</span><strong>{worklist.isSuccess ? metrics.actionable : '—'}</strong><small>当前需要治疗室处理</small></div>
      <div><span>今日已完成</span><strong>{worklist.isSuccess ? metrics.completed : '—'}</strong><small>{clinicalContext.department.name}</small></div>
    </section>
    <div className="treatment-workspace">
      <Panel className="treatment-queue">
        <header className="treatment-section-head">
          <div><h2>治疗队列</h2><span>{worklist.isSuccess ? `${values.length} 项` : '数量待确认'}</span></div>
          <input aria-label="搜索治疗任务" value={keyword} placeholder="姓名 / 档案号 / 项目"
            onChange={(event) => setKeyword(event.target.value)} />
        </header>
        <div className="treatment-filter-row">
          <nav aria-label="任务状态筛选">{([
            ['ACTIONABLE', '待处理'], ['WAITING', '未放行'], ['COMPLETED', '已完成'], ['ALL', '全部'],
          ] as [StatusFilter, string][]).map(([value, label]) => <button type="button" key={value}
            className={statusFilter === value ? 'is-active' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}</nav>
          <select aria-label="治疗类型筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
            <option value="ALL">全部类型</option><option value="SERVICE">治疗项目</option><option value="MEDICATION">用药执行</option>
          </select>
        </div>
        {worklist.isError && <EmptyState icon="clinical" title="治疗队列加载失败" copy="无法确认可执行任务，请重新加载。"
          action={<Button onClick={() => void worklist.refetch()}>重新加载治疗队列</Button>} />}
        {worklist.isPending && <LoadingState label="正在加载治疗队列…" />}
        {worklist.isSuccess && values.length === 0 && <EmptyState icon="clinical" title="当前筛选下暂无任务"
          copy="医生开立治疗或注射类医嘱后，任务会自动进入此处。" />}
        <div className="treatment-queue-list">{values.map((value) => <TaskButton key={value.id} value={value}
          active={value.id === taskId} onClick={() => setTaskId(value.id)} />)}</div>
      </Panel>
      <Panel className="treatment-detail">
        {!selected ? <EmptyState icon="clinical" title="请选择治疗任务" copy="从左侧队列选择患者后开始执行。" /> : <>
          <header className="treatment-detail-head"><div><span>{selected.taskType === 'MEDICATION' ? '用药执行' : '治疗项目'} · {selected.taskNo}</span>
            <h2>{selected.residentName}</h2><p>健康档案 {selected.healthRecordNo} · 就诊 {selected.encounterId}</p></div>
            <StatusBadge tone={tone(selected.status)}>{statusText[selected.status]}</StatusBadge></header>
          <section className="treatment-items"><h3>本次执行项目</h3>
            {selected.items.map((item) => <TreatmentItemRow key={item.id} item={item} />)}</section>
          {selected.status === 'WAITING_SETTLEMENT' && <Alert tone="info">任务尚未完成结算，结算后会自动放行。
            <Button size="sm" variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${selected.encounterId}`)}>
              去费用结算</Button></Alert>}
          {selected.status === 'WAITING_DISPENSE' && <Alert tone="info">药品尚未完成发药，不能开始治疗。
            <Button size="sm" variant="text" onClick={() => onNavigate(`/pharmacy?encounterId=${selected.encounterId}`)}>
              去门诊药房</Button></Alert>}
          {selected.status === 'WAITING_SKIN_TEST' && <Alert tone="info">用药尚未取得皮试阴性结果，不能开始治疗。
            <Button size="sm" variant="text" onClick={() => onNavigate(`/skin-tests?encounterId=${selected.encounterId}`)}>
              去皮试管理</Button></Alert>}
          {selected.status === 'READY' && <StartForm identityVerified={identityVerified} setIdentityVerified={setIdentityVerified}
            verificationMethod={verificationMethod} setVerificationMethod={setVerificationMethod}
            executionSite={executionSite} setExecutionSite={setExecutionSite} note={startNote} setNote={setStartNote}
            busy={start.isPending || worklist.isFetching} onSubmit={() => start.mutate()} />}
          {selected.status === 'IN_PROGRESS' && <CompleteForm resultCode={resultCode} setResultCode={setResultCode}
            note={completionNote} setNote={setCompletionNote} adverseReaction={adverseReaction}
            setAdverseReaction={(value) => { setAdverseReaction(value); if (value !== true) setAdverseReactionDetail('') }} adverseReactionDetail={adverseReactionDetail}
            setAdverseReactionDetail={setAdverseReactionDetail} busy={complete.isPending || worklist.isFetching} onSubmit={() => complete.mutate()} />}
          {selected.status === 'EXCEPTION' && <Alert>{selected.exceptionNote || selected.adverseReactionDetail || '该任务需要人工核对和后续处置。'}</Alert>}
          {selected.status === 'COMPLETED' && <section className="treatment-completion-summary">
            <header><div><span>执行结果</span><h3>{selected.resultCode === 'COMPLETED' ? '治疗已完成' : selected.resultCode ? '治疗未正常完成' : '未记录执行结果'}</h3></div>
              <StatusBadge tone="success">{selected.completedAt ? formatTime(selected.completedAt) : '未记录结束时间'}</StatusBadge></header>
            <dl><div><dt>执行地点</dt><dd>{selected.executionSite || '未记录'}</dd></div>
              <div><dt>身份核对</dt><dd>{verificationText(selected.verificationMethod)}</dd></div>
              <div><dt>不良反应评估</dt><dd>{selected.adverseReaction == null ? '未评估' : selected.adverseReaction ? '有' : '无'}</dd></div></dl>
            {selected.completionNote && <p>{selected.completionNote}</p>}
          </section>}
        </>}
      </Panel>
    </div>
  </>
}

function TaskButton({ value, active, onClick }: { value: TreatmentExecutionTask; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
    <div><strong>{value.residentName}</strong><StatusBadge tone={tone(value.status)}>{statusText[value.status]}</StatusBadge></div>
    <span>{value.items.map((item) => item.itemName).join('、')}</span>
    <small>{value.taskType === 'MEDICATION' ? `${value.items.length} 项用药` : '治疗项目'} · {formatTime(value.createdAt)}</small>
  </button>
}

function TreatmentItemRow({ item }: { item: TreatmentExecutionItem }) {
  const fulfillment = treatmentFulfillmentPresentation(item.fulfillmentStatus, item.fulfillmentId)
  const dose = [item.doseValue, item.doseUnit].filter((value) => value !== undefined && value !== null && value !== '').join(' ')
  return <article className="treatment-item-row"><div><strong>{item.itemName}</strong><small>{item.requestNo} · {item.itemCode}</small></div>
    <p>{[dose, item.routeCode, item.frequencyCode, item.durationValue ? `${item.durationValue}${item.durationUnit ?? ''}` : '']
      .filter(Boolean).join(' · ') || '按医嘱执行'}</p>
    <div className="treatment-item-gates">
      {item.settlementRequired && <StatusBadge tone={item.settlementId ? 'success' : 'warning'}>{item.settlementId ? '已结算' : '待结算'}</StatusBadge>}
      {item.fulfillmentRequired && <StatusBadge tone={fulfillment.tone}>{fulfillment.label}</StatusBadge>}
      {item.skinTestRequired && <StatusBadge tone={skinTestTone(item.skinTestStatus)}>
        {skinTestLabel(item.skinTestStatus)}</StatusBadge>}
    </div></article>
}

function skinTestLabel(value: TreatmentExecutionItem['skinTestStatus']) {
  return ({ NOT_REQUIRED: '无需皮试', PENDING: '待皮试', IN_PROGRESS: '皮试中', NEGATIVE: '皮试阴性',
    POSITIVE: '皮试阳性', UNCERTAIN: '结果可疑', INVALID: '结果无效' } as const)[value] ?? '待皮试'
}

function skinTestTone(value: TreatmentExecutionItem['skinTestStatus']) {
  if (value === 'NEGATIVE') return 'success' as const
  if (value === 'POSITIVE') return 'danger' as const
  return 'warning' as const
}

function StartForm(props: {
  identityVerified: boolean; setIdentityVerified: (value: boolean) => void
  verificationMethod: VerificationMethod
  setVerificationMethod: (value: VerificationMethod) => void
  executionSite: string; setExecutionSite: (value: string) => void; note: string; setNote: (value: string) => void
  busy: boolean; onSubmit: () => void
}) {
  return <section className="treatment-action-card"><h3>开始执行</h3>
    <label className="treatment-identity-check"><input type="checkbox" checked={props.identityVerified}
      onChange={(event) => props.setIdentityVerified(event.target.checked)} />
      <span><strong>已当面核对患者身份与执行项目</strong><small>开始前必须完成姓名与证件/卡核对</small></span></label>
    <div className="treatment-form-grid"><FormField label="核对方式" required><Select value={props.verificationMethod}
      searchable={false} placeholder="请选择实际核对方式"
      onChange={(value) => props.setVerificationMethod(value as VerificationMethod)} options={[
        { value: 'NAME_AND_IDENTIFIER', label: '姓名 + 证件/卡' }, { value: 'CARD', label: '读卡核对' }, { value: 'MANUAL', label: '人工核对' },
      ]} /></FormField><FormField label="执行地点"><input value={props.executionSite}
      onChange={(event) => props.setExecutionSite(event.target.value)} /></FormField></div>
    <FormField label="执行说明"><textarea rows={2} value={props.note} placeholder="可填写穿刺部位等说明"
      onChange={(event) => props.setNote(event.target.value)} /></FormField>
    <div className="ui-form-actions"><Button disabled={!props.identityVerified || !props.verificationMethod} busy={props.busy} onClick={props.onSubmit}>确认开始</Button></div>
  </section>
}

function CompleteForm(props: {
  resultCode: CompletionResult
  setResultCode: (value: CompletionResult) => void
  note: string; setNote: (value: string) => void; adverseReaction: boolean | null; setAdverseReaction: (value: boolean | null) => void
  adverseReactionDetail: string; setAdverseReactionDetail: (value: string) => void; busy: boolean; onSubmit: () => void
}) {
  return <section className="treatment-action-card"><h3>完成执行</h3><div className="treatment-form-grid">
    <FormField label="执行结果" required><Select value={props.resultCode} searchable={false} placeholder="请选择实际执行结果"
      onChange={(value) => props.setResultCode(value as CompletionResult)} options={[
        { value: 'COMPLETED', label: '顺利完成' }, { value: 'INTERRUPTED', label: '中途停止' }, { value: 'NOT_COMPLETED', label: '未完成' },
      ]} /></FormField>
    <FormField label="不良反应评估" required><Select value={props.adverseReaction === null ? '' : props.adverseReaction ? 'YES' : 'NO'}
      searchable={false} placeholder="请选择评估结果"
      onChange={(value) => props.setAdverseReaction(value === '' ? null : value === 'YES')}
      options={[{ value: 'NO', label: '未发生不良反应' }, { value: 'YES', label: '发生不良反应' }]} /></FormField></div>
    <FormField label="完成说明"><textarea rows={2} value={props.note} placeholder="记录治疗结果或后续交代"
      onChange={(event) => props.setNote(event.target.value)} /></FormField>
    {props.adverseReaction && <FormField label="不良反应详情" required><textarea rows={2} value={props.adverseReactionDetail}
      onChange={(event) => props.setAdverseReactionDetail(event.target.value)} /></FormField>}
    <div className="ui-form-actions"><Button disabled={!props.resultCode || props.adverseReaction === null || (props.adverseReaction && !props.adverseReactionDetail.trim())}
      busy={props.busy} onClick={props.onSubmit}>确认完成</Button></div>
  </section>
}

function verificationText(value?: TreatmentExecutionTask['verificationMethod']) {
  if (value === 'CARD') return '读卡核对'
  if (value === 'MANUAL') return '人工核对'
  return value === 'NAME_AND_IDENTIFIER' ? '姓名 + 证件/卡' : '未记录核对方式'
}
