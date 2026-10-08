import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { DiagnosticExecutionTask, DiagnosticTaskStatus, LocalDiagnosticReportInput } from '../../shared/api/diagnosticsApi'
import { diagnosticReportStatusPresentation } from '../../shared/presentation'
import { formatTime } from '../../shared/format'
import { diagnosticObservationValue, requireDiagnosticReports } from '../../shared/clinical/diagnosticResults'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import '../../styles/features/diagnostic-execution.css'

const statusText: Record<DiagnosticTaskStatus, string> = {
  WAITING_SETTLEMENT: '待结算', READY: '待执行', COLLECTED: '已采集', IN_PROGRESS: '执行中',
  COMPLETED: '已出报告', CANCELLED: '已取消', EXCEPTION: '待核对',
}

function tone(status: DiagnosticTaskStatus) {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'WAITING_SETTLEMENT' || status === 'COLLECTED') return 'warning' as const
  if (status === 'EXCEPTION' || status === 'CANCELLED') return 'danger' as const
  return 'info' as const
}

type InterpretationSelection = NonNullable<LocalDiagnosticReportInput['interpretationCode']> | ''

type TaskTypeFilter = 'ALL' | 'LABORATORY' | 'EXAMINATION'

export function DiagnosticWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const linkedResidentId = searchParams.get('residentId')
  const [typeFilter, setTypeFilter] = useState<TaskTypeFilter>('ALL')
  const [taskId, setTaskId] = useState('')
  const [specimenNo, setSpecimenNo] = useState('')
  const [collectionNote, setCollectionNote] = useState('')
  const [valueType, setValueType] = useState<'NUMBER' | 'STRING'>('NUMBER')
  const [observationValue, setObservationValue] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [referenceLow, setReferenceLow] = useState('')
  const [referenceHigh, setReferenceHigh] = useState('')
  const [interpretation, setInterpretation] = useState<InterpretationSelection>('')
  const [conclusion, setConclusion] = useState('')

  const worklist = useQuery({
    queryKey: ['diagnostic-worklist', typeFilter, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.diagnostics.worklist(typeFilter === 'ALL' ? undefined : typeFilter)
      if (!Array.isArray(data)) throw new Error('医技队列返回无效，请重新加载')
      return data
    },
    refetchInterval: 30_000,
  })
  const values = worklist.isSuccess ? worklist.data : []
  useEffect(() => {
    if ((!linkedEncounterId && !linkedResidentId) || !worklist.data) return
    const target = worklist.data.find((item) => linkedEncounterId
      ? item.encounterId === linkedEncounterId : item.residentId === linkedResidentId)
    if (target) setTaskId(target.id)
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
  const reports = useQuery({
    queryKey: ['diagnostic-task-reports', selected?.requestId, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.diagnostics.reportsByRequest(selected!.requestId)
      return requireDiagnosticReports(data, selected!)
    }, enabled: Boolean(selected?.requestId),
  })
  const latestReport = reports.isSuccess
    ? (selected?.reportId ? reports.data.find((value) => value.id === selected.reportId) : reports.data[0]) : undefined

  useEffect(() => {
    setSpecimenNo('')
    setCollectionNote(''); setObservationValue(''); setUnitCode(''); setReferenceLow(''); setReferenceHigh('')
    setInterpretation(''); setConclusion('')
  }, [selected?.id, clinicalContext.organization.id, clinicalContext.department.id])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['diagnostic-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['diagnostic-task-reports', selected?.requestId, clinicalContext.organization.id, clinicalContext.department.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-reports', selected?.encounterId] }),
    ])
  }
  const collect = useMutation({
    mutationFn: () => {
      if (!worklist.isSuccess || worklist.isFetching || !selected || selected.status !== 'READY'
        || selected.requestType !== 'LABORATORY' || !specimenNo.trim()) throw new Error('请核对任务并录入真实标本号')
      return api.diagnostics.collect(selected.id, selected.revision, specimenNo.trim(), collectionNote.trim() || undefined)
    },
    onSuccess: refresh,
  })
  const start = useMutation({
    mutationFn: () => {
      if (!worklist.isSuccess || worklist.isFetching || !selected) throw new Error('请先重新加载有效任务')
      return api.diagnostics.start(selected.id, selected.revision)
    }, onSuccess: refresh,
  })
  const report = useMutation({
    mutationFn: () => {
      if (!worklist.isSuccess || worklist.isFetching || !selected || selected.status !== 'IN_PROGRESS') {
        throw new Error('当前任务尚未就绪，不能签发报告')
      }
      if (selected.requestType === 'LABORATORY' && (!observationValue.trim()
        || (valueType === 'NUMBER' && !Number.isFinite(Number(observationValue))))) {
        throw new Error('请填写有效检验结果')
      }
      if ((referenceLow !== '' && !Number.isFinite(Number(referenceLow)))
        || (referenceHigh !== '' && !Number.isFinite(Number(referenceHigh)))
        || (referenceLow !== '' && referenceHigh !== '' && Number(referenceLow) > Number(referenceHigh))) {
        throw new Error('参考范围无效，请核对上下限')
      }
      if (selected.requestType === 'EXAMINATION' && !conclusion.trim()) throw new Error('请填写检查结论')
      return api.diagnostics.recordLocalReport(selected.id, selected.requestType === 'LABORATORY' ? {
        expectedRevision: selected!.revision, valueType, observationValue: observationValue.trim(),
        unitCode: unitCode.trim() || undefined,
        referenceRangeLow: referenceLow === '' ? undefined : Number(referenceLow),
        referenceRangeHigh: referenceHigh === '' ? undefined : Number(referenceHigh),
        interpretationCode: interpretation || undefined, conclusion: conclusion.trim() || undefined,
      } : { expectedRevision: selected.revision, conclusion: conclusion.trim() })
    },
    onSuccess: refresh,
  })
  const error = worklist.error || reports.error || collect.error || start.error || report.error
  const metrics = useMemo(() => ({
    waiting: values.filter((value) => value.status === 'WAITING_SETTLEMENT').length,
    ready: values.filter((value) => ['READY', 'COLLECTED', 'IN_PROGRESS'].includes(value.status)).length,
    completed: values.filter((value) => value.status === 'COMPLETED').length,
  }), [values])

  return <>
    <PageHeader eyebrow="门诊医疗 · 医技执行" title="检查检验工作台"
      description="基层模式按待结算、采集或检查、执行、出报告推进；已接入 LIS/PACS 时仍可沿用同一任务和报告闭环。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新队列</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <section className="diagnostic-metrics" aria-label="医技任务摘要">
      <div><span>待结算</span><strong>{worklist.isSuccess ? metrics.waiting : '—'}</strong><small>收费完成后自动放行</small></div>
      <div><span>待执行 / 执行中</span><strong>{worklist.isSuccess ? metrics.ready : '—'}</strong><small>含已采集标本</small></div>
      <div><span>已出报告</span><strong>{worklist.isSuccess ? metrics.completed : '—'}</strong><small>医生站同步可见</small></div>
      <div><span>当前科室</span><strong>{clinicalContext.department.name}</strong><small>{clinicalContext.organization.name}</small></div>
    </section>
    <div className="diagnostic-workspace">
      <Panel className="diagnostic-queue">
        <header className="diagnostic-section-head"><div><h2>执行队列</h2><span>{worklist.isSuccess ? `${values.length} 项` : '数量待确认'}</span></div>
          <nav aria-label="项目类型筛选">{(['ALL', 'LABORATORY', 'EXAMINATION'] as TaskTypeFilter[]).map((value) =>
            <button key={value} type="button" className={typeFilter === value ? 'is-active' : ''}
              onClick={() => setTypeFilter(value)}>{value === 'ALL' ? '全部' : value === 'LABORATORY' ? '检验' : '检查'}</button>)}</nav>
        </header>
        {worklist.isPending && <LoadingState label="正在加载医技队列…" />}
        {worklist.isError && <EmptyState icon="clinical" title="医技队列加载失败" copy="无法确认待执行任务，请重试。"
          action={<Button onClick={() => void worklist.refetch()}>重新加载医技队列</Button>} />}
        {worklist.isSuccess && values.length === 0 && <EmptyState icon="clinical" title="暂无检查检验任务"
          copy="医生开立检查检验医嘱后会自动进入此处。" />}
        <div className="diagnostic-queue-list">{values.map((value) => <TaskButton key={value.id}
          value={value} active={value.id === taskId} onClick={() => setTaskId(value.id)} />)}</div>
      </Panel>
      <Panel className="diagnostic-detail">
        {!selected ? <EmptyState icon="clinical" title="请选择医技任务" copy="从左侧队列选择患者和项目后开始操作。" /> : <>
          <header className="diagnostic-detail-head">
            <div><span>{selected.requestType === 'LABORATORY' ? '检验申请' : '检查申请'} · {selected.taskNo}</span>
              <h2>{selected.itemName}</h2><p>{selected.itemCode} · 就诊 {selected.encounterId}</p></div>
            <StatusBadge tone={tone(selected.status)}>{statusText[selected.status]}</StatusBadge>
          </header>
          <dl className="diagnostic-patient-summary">
            <div><dt>居民</dt><dd>{selected.residentName}</dd></div><div><dt>健康档案号</dt><dd>{selected.healthRecordNo}</dd></div>
            <div><dt>{selected.requestType === 'LABORATORY' ? '标本类型' : '检查类型'}</dt>
              <dd>{selected.specimenType || selected.examinationType || '未配置'}</dd></div>
            <div><dt>开立时间</dt><dd>{formatTime(selected.createdAt)}</dd></div>
          </dl>
          {selected.status === 'WAITING_SETTLEMENT' && <Alert tone="info">该申请尚未结算，完成收费后会自动转为待执行。
            <Button size="sm" variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${selected.encounterId}`)}>
              去费用结算</Button></Alert>}
          {selected.status === 'READY' && selected.requestType === 'LABORATORY' && <section className="diagnostic-action-card">
            <h3>1. 标本采集</h3><div className="diagnostic-form-row">
              <FormField label="标本号" required><input value={specimenNo} onChange={(event) => setSpecimenNo(event.target.value)} /></FormField>
              <FormField label="采集说明"><input value={collectionNote} placeholder="如：静脉血"
                onChange={(event) => setCollectionNote(event.target.value)} /></FormField>
              <Button disabled={!specimenNo.trim()} busy={collect.isPending || worklist.isFetching} onClick={() => collect.mutate()}>确认采集</Button>
            </div></section>}
          {selected.status === 'READY' && selected.requestType === 'EXAMINATION' && <section className="diagnostic-action-card">
            <h3>开始检查</h3><p>核对患者和检查项目后进入执行状态。</p>
            <Button busy={start.isPending || worklist.isFetching} onClick={() => start.mutate()}>确认开始检查</Button>
          </section>}
          {selected.status === 'COLLECTED' && <section className="diagnostic-action-card">
            <h3>2. 开始检验</h3><p>标本 {selected.specimenNo} 已于 {formatTime(selected.collectedAt!)} 完成采集。</p>
            <Button busy={start.isPending || worklist.isFetching} onClick={() => start.mutate()}>开始检验</Button>
          </section>}
          {selected.status === 'IN_PROGRESS' && <LocalReportForm task={selected} valueType={valueType}
            setValueType={setValueType} observationValue={observationValue} setObservationValue={setObservationValue}
            unitCode={unitCode} setUnitCode={setUnitCode} referenceLow={referenceLow} setReferenceLow={setReferenceLow}
            referenceHigh={referenceHigh} setReferenceHigh={setReferenceHigh} interpretation={interpretation}
            setInterpretation={setInterpretation} conclusion={conclusion} setConclusion={setConclusion}
            busy={report.isPending || worklist.isFetching} onSubmit={() => report.mutate()} />}
          {selected.status === 'EXCEPTION' && <Alert>{selected.exceptionNote || '任务需要人工核对后继续处理。'}</Alert>}
          {selected.status === 'COMPLETED' && (reports.isPending || reports.isFetching ? <LoadingState label="正在读取报告…" />
            : reports.isError ? <EmptyState icon="clinical" title="报告加载失败" copy="无法确认报告内容，请重新查询。"
              action={<Button onClick={() => void reports.refetch()}>重新加载报告</Button>} />
              : latestReport ? <ReportSummary report={latestReport} />
                : <EmptyState icon="clinical" title="未查询到对应报告" copy="任务状态为已出报告，但尚未取得对应报告内容，请核对或重新查询。"
                  action={<Button onClick={() => void reports.refetch()}>重新加载报告</Button>} />)}
        </>}
      </Panel>
    </div>
  </>
}

function TaskButton({ value, active, onClick }: { value: DiagnosticExecutionTask; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
    <div><strong>{value.residentName}</strong><StatusBadge tone={tone(value.status)}>{statusText[value.status]}</StatusBadge></div>
    <span>{value.itemName}</span><small>{value.requestType === 'LABORATORY' ? '检验' : '检查'} · {formatTime(value.createdAt)}</small>
  </button>
}

function LocalReportForm(props: {
  task: DiagnosticExecutionTask; valueType: 'NUMBER' | 'STRING'; setValueType: (value: 'NUMBER' | 'STRING') => void
  observationValue: string; setObservationValue: (value: string) => void; unitCode: string; setUnitCode: (value: string) => void
  referenceLow: string; setReferenceLow: (value: string) => void; referenceHigh: string; setReferenceHigh: (value: string) => void
  interpretation: InterpretationSelection
  setInterpretation: (value: InterpretationSelection) => void
  conclusion: string; setConclusion: (value: string) => void; busy: boolean; onSubmit: () => void
}) {
  const lab = props.task.requestType === 'LABORATORY'
  const valid = lab ? Boolean(props.observationValue.trim()) : Boolean(props.conclusion.trim())
  return <section className="diagnostic-action-card diagnostic-report-form">
    <h3>{lab ? '3. 录入检验结果' : '录入检查报告'}</h3>
    {lab && <div className="diagnostic-result-grid">
      <FormField label="结果类型"><Select value={props.valueType} searchable={false} clearable={false}
        onChange={(value) => props.setValueType(value as 'NUMBER' | 'STRING')}
        options={[{ value: 'NUMBER', label: '数值' }, { value: 'STRING', label: '文本' }]} /></FormField>
      <FormField label="结果值" required><input type={props.valueType === 'NUMBER' ? 'number' : 'text'}
        value={props.observationValue} onChange={(event) => props.setObservationValue(event.target.value)} /></FormField>
      <FormField label="单位"><input value={props.unitCode} onChange={(event) => props.setUnitCode(event.target.value)} /></FormField>
      <FormField label="结果标志" hint="未判定时不记录正常或异常结论"><Select value={props.interpretation} searchable={false}
        placeholder="未判定" onChange={(value) => props.setInterpretation(value as InterpretationSelection)}
        options={[
          { value: 'N', label: '正常' }, { value: 'H', label: '偏高' }, { value: 'HH', label: '危急高值' },
          { value: 'L', label: '偏低' }, { value: 'LL', label: '危急低值' }, { value: 'A', label: '异常' },
        ]} /></FormField>
      {props.valueType === 'NUMBER' && <><FormField label="参考下限"><input type="number" value={props.referenceLow}
        onChange={(event) => props.setReferenceLow(event.target.value)} /></FormField>
      <FormField label="参考上限"><input type="number" value={props.referenceHigh}
        onChange={(event) => props.setReferenceHigh(event.target.value)} /></FormField></>}
    </div>}
    <FormField label={lab ? '结果说明' : '检查结论'} required={!lab}><textarea rows={3} value={props.conclusion}
      placeholder={lab ? '可填写综合说明' : '填写检查所见与结论'} onChange={(event) => props.setConclusion(event.target.value)} /></FormField>
    <div className="ui-form-actions"><Button disabled={!valid} busy={props.busy} onClick={props.onSubmit}>签发正式报告</Button></div>
  </section>
}

function ReportSummary({ report }: { report: import('../../shared/api/diagnosticsApi').DiagnosticReport }) {
  const presentation = diagnosticReportStatusPresentation(report.status)
  return <section className="diagnostic-report-summary"><header><div><span>{presentation.label} · V{report.reportVersion}</span>
    <h3>{report.reportName}</h3></div><StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge></header>
    <p>{report.conclusion || '未记录综合结论'}</p>
    {report.observations.map((value) => <div className="diagnostic-observation" key={value.id}>
      <span>{value.observationName}</span><strong>{diagnosticObservationValue(value)} {value.unitCode ?? ''}</strong>
      <small>{value.interpretationCode || '未判定'}</small></div>)}
    <footer>签发：{report.authorName || '未记录签发人'} · {formatTime(report.issuedAt)}</footer>
  </section>
}
