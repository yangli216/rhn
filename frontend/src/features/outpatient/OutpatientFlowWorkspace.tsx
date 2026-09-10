import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { OutpatientFlowStage, OutpatientFlowStatus, OutpatientFlowVisit } from '../../shared/api/outpatientFlowApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, EmptyState, getTodayRange, LoadingState, PageHeader, Pagination, Panel,
  SearchField, StatusBadge, type DateRange, type StatusTone,
} from '../../shared/ui'

type FlowFilter = 'ACTIVE' | 'DOWNSTREAM' | 'EXCEPTION' | 'COMPLETED' | 'ALL'

const activeStatuses: OutpatientFlowStatus[] = ['WAITING_CONSULTATION', 'IN_CONSULTATION', 'CONSULTATION_SUSPENDED',
  'WAITING_COORDINATION', 'WAITING_TRANSFER']
const downstreamStatuses: OutpatientFlowStatus[] = ['WAITING_SETTLEMENT', 'WAITING_PHARMACY',
  'WAITING_DIAGNOSTICS', 'WAITING_TREATMENT', 'DOWNSTREAM_IN_PROGRESS']
function flowTone(status: OutpatientFlowStatus): StatusTone {
  if (status === 'COMPLETED' || status === 'TRANSFERRED') return 'success'
  if (status === 'EXCEPTION' || status === 'TERMINATED' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_CONSULTATION' || status === 'DOWNSTREAM_IN_PROGRESS') return 'info'
  return 'warning'
}

function stageTone(status: OutpatientFlowStage['status']): StatusTone {
  if (status === 'COMPLETED') return 'success'
  if (status === 'EXCEPTION' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_PROGRESS') return 'info'
  return 'warning'
}

function pendingAge(minutes: number) {
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} 小时${rest ? ` ${rest} 分钟` : ''}`
}

export function OutpatientFlowWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
}) {
  const [dateRange, setDateRange] = useState<DateRange>(getTodayRange)
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<FlowFilter>('ACTIVE')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(0)
  }, [filter, dateRange, keyword])

  const board = useQuery({
    queryKey: ['outpatient-flow', dateRange.from, dateRange.to, keyword.trim()],
    queryFn: () => api.outpatientFlow.board(dateRange.from, dateRange.to, undefined, keyword),
    refetchInterval: 20_000,
  })
  const values = useMemo(() => (board.data?.visits ?? []).filter((value) => {
    if (filter === 'ALL') return true
    if (filter === 'ACTIVE') return activeStatuses.includes(value.flowStatus)
    if (filter === 'DOWNSTREAM') return downstreamStatuses.includes(value.flowStatus)
    if (filter === 'EXCEPTION') return value.flowStatus === 'EXCEPTION'
    return value.flowStatus === 'COMPLETED' || value.flowStatus === 'TRANSFERRED'
      || value.flowStatus === 'TERMINATED' || value.flowStatus === 'CANCELLED'
  }), [board.data?.visits, filter])
  const summary = board.data?.summary

  const totalPages = Math.max(1, Math.ceil(values.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pagedVisits = useMemo(() => {
    const start = safePage * pageSize
    return values.slice(start, start + pageSize)
  }, [values, safePage, pageSize])

  return <>
    <PageHeader compact eyebrow="门诊医疗 · 全程协同" title="门诊流转看板"
      description="诊毕不等于流程完成；统一查看患者当前去向和待办环节，基层机构无需在多个页面之间逐一核对。"
      actions={<Button variant="secondary" onClick={() => void board.refetch()}>刷新</Button>} />
    {board.error && <Alert>{errorMessage(board.error)}</Alert>}
    <section className="outpatient-flow-metrics" aria-label="门诊流转摘要">
      <button type="button" className={filter === 'ACTIVE' ? 'is-active' : ''} onClick={() => setFilter('ACTIVE')}>
        <span>候诊 / 接诊</span><strong>{(summary?.waitingConsultationCount ?? 0) + (summary?.inConsultationCount ?? 0)}</strong>
        <small>{summary?.waitingConsultationCount ?? 0} 人候诊</small></button>
      <button type="button" className={filter === 'DOWNSTREAM' ? 'is-active' : ''} onClick={() => setFilter('DOWNSTREAM')}>
        <span>诊后待办</span><strong>{summary?.downstreamPendingCount ?? 0}</strong><small>收费、取药、医技或治疗</small></button>
      <button type="button" className={filter === 'EXCEPTION' ? 'is-active' : ''} onClick={() => setFilter('EXCEPTION')}>
        <span>异常关注</span><strong>{summary?.exceptionCount ?? 0}</strong><small>需要人工协调</small></button>
      <button type="button" className={filter === 'COMPLETED' ? 'is-active' : ''} onClick={() => setFilter('COMPLETED')}>
        <span>流程完成</span><strong>{summary?.completedCount ?? 0}</strong><small>完成、转科、终止或取消</small></button>
    </section>
    <Panel className="outpatient-flow-board">
      <header className="outpatient-flow-toolbar">
        <div><h2>患者去向</h2><span>{clinicalContext.department.name} · {values.length} 人</span></div>
        <nav aria-label="流转状态筛选">{([
          ['ACTIVE', '诊前诊中'], ['DOWNSTREAM', '诊后待办'], ['EXCEPTION', '异常'], ['COMPLETED', '已完成'], ['ALL', '全部'],
        ] as [FlowFilter, string][]).map(([value, label]) => <button type="button" key={value}
          className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</nav>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <SearchField
          label="搜索患者"
          value={keyword}
          onChange={setKeyword}
          placeholder="姓名 / 档案号 / 就诊号"
        />
      </header>
      {board.isPending && <LoadingState label="正在汇总门诊各环节状态…" />}
      {!board.isPending && values.length === 0 && <EmptyState icon="clinical" title="当前筛选下暂无患者"
        copy="完成挂号后，患者会自动进入流转看板。" />}
      {values.length > 0 && <>
        <div className="outpatient-flow-list" role="table" aria-label="门诊患者流转列表">
          <div className="outpatient-flow-row outpatient-flow-row--head" role="row">
            <span>患者</span><span>门诊状态</span><span>业务进度</span><span>当前去向 / 原因</span><span /></div>
          {pagedVisits.map((value) => <VisitRow key={value.encounterId} value={value} onNavigate={onNavigate} />)}
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={values.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(0)
          }}
          onChange={setPage}
          label="门诊患者流转列表分页"
        />
      </>}
    </Panel>
  </>
}

function VisitRow({ value, onNavigate }: { value: OutpatientFlowVisit; onNavigate: (path: string) => void }) {
  return <article className="outpatient-flow-row" role="row">
    <div className="outpatient-flow-patient"><span className="outpatient-flow-avatar">{value.residentName.slice(0, 1)}</span>
      <span><strong>{value.residentName}</strong><small>{value.healthRecordNo}</small></span></div>
    <div className="outpatient-flow-clinical"><StatusBadge tone={flowTone(value.flowStatus)}>{value.flowStatusText}</StatusBadge>
      <small>{formatTime(value.registeredAt)} 挂号{value.clinicalCompletedAt ? ` · ${formatTime(value.clinicalCompletedAt)} 诊毕` : ''}</small></div>
    <div className="outpatient-flow-stages">{value.stages.map((stage) => <StageChip key={stage.stageCode} stage={stage} />)}</div>
    <div className="outpatient-flow-destination"><strong>{value.nextDestination}</strong>
      <small title={value.attentionReason}>{value.attentionReason}{value.pendingSince ? ` · 已等待 ${pendingAge(value.pendingMinutes)}` : ''}</small></div>
    <div>{value.nextRoute && <Button size="sm" variant="secondary" onClick={() => onNavigate(value.nextRoute!)}>
      {value.nextActionText || '去处理'}</Button>}</div>
  </article>
}

function StageChip({ stage }: { stage: OutpatientFlowStage }) {
  return <span className={`outpatient-flow-stage is-${stage.status.toLowerCase()}`} title={`${stage.stageName}：${stage.statusText}`}>
    <i aria-hidden="true" /><span>{stage.stageName}</span><small>{stage.statusText}{stage.totalCount > 1 ? ` · ${stage.totalCount}项` : ''}</small>
    <StatusBadge tone={stageTone(stage.status)}>{stage.status === 'COMPLETED' ? '✓' : stage.pendingCount || '·'}</StatusBadge>
  </span>
}
