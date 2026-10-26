import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { OutpatientFlowStage, OutpatientFlowStatus, OutpatientFlowVisit } from '../../shared/api/outpatientFlowApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  ActionMenu, Alert, Button, DateRangePicker, EmptyState, getTodayRange, LoadingState, PageHeader, Pagination, Panel,
  SearchField, StatusBadge, DataTable, TableShell, tableCellClass, type DateRange, type StatusTone,
} from '../../shared/ui'
import '../../styles/features/diagnostic-execution.css'
import { requireOutpatientFlowBoard } from './outpatientFlowTruth'

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
  if (status === 'RETURNED' || status === 'PARTIALLY_RETURNED') return 'neutral'
  if (status === 'EXCEPTION' || status === 'CANCELLED') return 'danger'
  if (status === 'IN_PROGRESS') return 'info'
  return 'warning'
}

function pendingAge(minutes: number) {
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor(minutes % 1440 / 60)
    return `${days} 天${hours ? ` ${hours} 小时` : ''}`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours} 小时${rest ? ` ${rest} 分钟` : ''}`
}

export function OutpatientFlowWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
}) {
  const [dateRange, setDateRange] = useState<DateRange>(getTodayRange)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FlowFilter>('ACTIVE')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setDateRange(getTodayRange())
    setFilter('ACTIVE')
    setPage(0)
  }

  useEffect(() => {
    setPage(0)
  }, [filter, dateRange, query, clinicalContext.organization.id, clinicalContext.department.id])

  const board = useQuery({
    queryKey: ['outpatient-flow', clinicalContext.organization.id, clinicalContext.department.id, dateRange.from, dateRange.to, query],
    queryFn: async () => requireOutpatientFlowBoard(
      await api.outpatientFlow.board(dateRange.from, dateRange.to, undefined, query), dateRange.from),
    refetchInterval: 20_000,
  })
  const available = board.isSuccess && !board.isFetching && !!board.data
  const values = useMemo(() => (available ? board.data!.visits : []).filter((value) => {
    if (filter === 'ALL') return true
    if (filter === 'ACTIVE') return activeStatuses.includes(value.flowStatus)
    if (filter === 'DOWNSTREAM') return downstreamStatuses.includes(value.flowStatus)
    if (filter === 'EXCEPTION') return value.flowStatus === 'EXCEPTION'
    return value.flowStatus === 'COMPLETED' || value.flowStatus === 'TRANSFERRED'
      || value.flowStatus === 'TERMINATED' || value.flowStatus === 'CANCELLED'
  }), [available, board.data, filter])
  const summary = available ? board.data!.summary : undefined

  const totalPages = Math.max(1, Math.ceil(values.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pagedVisits = useMemo(() => {
    const start = safePage * pageSize
    return values.slice(start, start + pageSize)
  }, [values, safePage, pageSize])

  return <>
    <PageHeader compact eyebrow="门诊医疗 · 全程协同" title="门诊流转看板"
      description="查看患者去向及待办；诊毕后仍可能需要缴费、取药或执行。"
      actions={<Button variant="secondary" busy={board.isFetching} busyLabel="刷新中" onClick={() => void board.refetch()}>刷新</Button>} />
    {board.error && <Alert duration={null}>{errorMessage(board.error)}</Alert>}
    {available && <section className="outpatient-flow-metrics" aria-label="门诊流转摘要">
      <Button variant={filter === 'ACTIVE' ? 'primary' : 'secondary'} aria-pressed={filter === 'ACTIVE'}
        title="候诊、接诊、暂挂及会诊转科" onClick={() => setFilter('ACTIVE')}>
        候诊 / 接诊 <strong>{(summary?.waitingConsultationCount ?? 0) + (summary?.inConsultationCount ?? 0)}</strong></Button>
      <Button variant={filter === 'DOWNSTREAM' ? 'primary' : 'secondary'} aria-pressed={filter === 'DOWNSTREAM'}
        title="收费、取药、检查检验或治疗" onClick={() => setFilter('DOWNSTREAM')}>
        诊后待办 <strong>{summary?.downstreamPendingCount ?? 0}</strong></Button>
      <Button variant={filter === 'EXCEPTION' ? 'primary' : 'secondary'} aria-pressed={filter === 'EXCEPTION'}
        title="需要人工协调" onClick={() => setFilter('EXCEPTION')}>
        异常关注 <strong>{summary?.exceptionCount ?? 0}</strong></Button>
      <Button variant={filter === 'COMPLETED' ? 'primary' : 'secondary'} aria-pressed={filter === 'COMPLETED'}
        title="完成、转科、终止或取消" onClick={() => setFilter('COMPLETED')}>
        流程结束 <strong>{summary?.completedCount ?? 0}</strong></Button>
    </section>}
    <Panel className="outpatient-flow-board">
      <header className="outpatient-flow-toolbar ui-query-filters" aria-label="患者去向查询">
        <span className="outpatient-flow-toolbar-context">{clinicalContext.department.name} · {available ? `${values.length} 人` : '人数待确认'}</span>
        <Button variant={filter === 'ALL' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>全部患者</Button>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <div className="ui-query-filters__group">
          <SearchField
            label="搜索患者"
            value={keyword}
            onChange={setKeyword}
            onSearch={handleSearch}
            placeholder="姓名 / 档案号 / 就诊号"
          />
          <div className="ui-query-filters__actions"><Button variant="primary" onClick={handleSearch}>查询</Button>
          <Button variant="secondary" onClick={handleReset}>重置</Button></div>
        </div>
      </header>
      {(board.isPending || board.isFetching) && <LoadingState label="正在汇总门诊各环节状态…" />}
      {board.isError && !board.isFetching && <EmptyState icon="clinical" title="门诊流转资料暂不可用"
        copy="当前人数、完成状态和患者去向尚未确认，请重新加载。"
        action={<Button variant="secondary" onClick={() => void board.refetch()}>重新加载</Button>} />}
      {available && values.length === 0 && <EmptyState icon="clinical" title="当前筛选下暂无患者"
        copy="可切换状态、调整日期或清空关键词后查询。" />}
      {values.length > 0 && <TableShell scrollLabel="门诊患者流转列表滚动区"
        resetScrollKey={`${clinicalContext.organization.id}:${clinicalContext.department.id}:${filter}:${dateRange.from}:${dateRange.to}:${query}:${safePage}:${pageSize}`}
        footer={
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
        />}>
        <DataTable compact className="outpatient-flow-table" aria-label="门诊患者流转列表">
          <colgroup><col className="outpatient-flow-col-patient" /><col className="outpatient-flow-col-status" />
            <col className="outpatient-flow-col-progress" /><col /><col className="outpatient-flow-col-actions" /></colgroup>
          <thead><tr><th scope="col">患者 / 就诊号</th><th scope="col" className={tableCellClass('status')}>门诊状态</th>
            <th scope="col">业务进度</th><th scope="col">当前去向 / 原因</th><th scope="col" className={tableCellClass('actions')}>操作</th></tr></thead>
          <tbody>{pagedVisits.map((value) => <VisitRow key={value.encounterId} value={value} onNavigate={onNavigate} />)}</tbody>
        </DataTable>
      </TableShell>}
    </Panel>
  </>
}

function VisitRow({ value, onNavigate }: { value: OutpatientFlowVisit; onNavigate: (path: string) => void }) {
  const nextRoute = value.nextRoute ? new URL(value.nextRoute, 'https://rhn.invalid') : undefined
  const diagnosticDestination = nextRoute?.pathname === '/diagnostics'
  // The aggregate flow API still returns the legacy billing destination for refund exceptions.
  if (nextRoute?.pathname === '/billing' && value.flowStatus === 'EXCEPTION') nextRoute.pathname = '/billing/refunds'
  const nextActionText = nextRoute?.pathname === '/outpatient/reception' ? '查看接诊' : value.nextActionText || '去处理'
  return <tr>
    <td className="outpatient-flow-patient"><strong title={value.healthRecordNo}>{value.residentName}</strong><small title={`档案号：${value.healthRecordNo} · 就诊号：${value.encounterNo}`}>{value.encounterNo}</small></td>
    <td className={`${tableCellClass('status')} outpatient-flow-clinical`}><StatusBadge tone={flowTone(value.flowStatus)}>{value.flowStatusText}</StatusBadge>
      <small title={`挂号：${formatTime(value.registeredAt)}${value.clinicalCompletedAt ? ` · 诊毕：${formatTime(value.clinicalCompletedAt)}` : ''}`}>
        {formatTime(value.clinicalCompletedAt || value.registeredAt)} {value.clinicalCompletedAt ? '诊毕' : '挂号'}</small></td>
    <td><div className="outpatient-flow-stages">{value.stages.map((stage) => <StageChip key={stage.stageCode} stage={stage} />)}</div></td>
    <td className="outpatient-flow-destination"><strong>{value.nextDestination}</strong>
      <small title={value.attentionReason}>{value.attentionReason}{value.pendingSince ? ` · 已等待 ${pendingAge(value.pendingMinutes)}` : ''}</small></td>
    <td className={tableCellClass('actions')}>{diagnosticDestination ? <ActionMenu size="sm" label={value.nextActionText || '检查检验'} items={[
      { key: 'laboratory', label: '检验工作台', onSelect: () => onNavigate(`/diagnostics/laboratory${nextRoute.search}`) },
      { key: 'examination', label: '检查工作台', onSelect: () => onNavigate(`/diagnostics/examination${nextRoute.search}`) },
    ]} /> : nextRoute && <Button size="sm" variant="secondary" onClick={() => onNavigate(`${nextRoute.pathname}${nextRoute.search}${nextRoute.hash}`)}>
      {nextActionText}</Button>}</td>
  </tr>
}

function StageChip({ stage }: { stage: OutpatientFlowStage }) {
  return <span title={`${stage.stageName}：${stage.statusText} · 共 ${stage.totalCount} 项，待办 ${stage.pendingCount} 项`}>
    <StatusBadge tone={stageTone(stage.status)}>{stage.stageName}：{stage.statusText}{stage.totalCount > 1
      ? stage.pendingCount > 0 ? ` · 待${stage.pendingCount}/${stage.totalCount}项` : ` · ${stage.totalCount}项` : ''}</StatusBadge>
  </span>
}
