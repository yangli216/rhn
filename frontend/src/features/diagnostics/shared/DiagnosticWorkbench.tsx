import { includeLinkedDiagnosticTask, useDiagnosticTaskLink } from './useDiagnosticTaskLink'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { DiagnosticExecutionTask, DiagnosticTaskStatus, DiagnosticWorklistFilters } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DateRangePicker, EmptyState, FormField, LoadingState, Pagination, PanelHead, SearchField, Select, Tabs } from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { DiagnosticQueue, DiagnosticTaskContext, DiagnosticRequestDetails, TaskReports } from './DiagnosticTaskPanels'
import { DiagnosticQueueNote } from './DiagnosticQueueNote'
import { DiagnosticTaskOperations } from './DiagnosticTaskOperations'
import { defaultDiagnosticDates, diagnosticDateBoundary,diagnosticStatusOptions, type DiagnosticForm, type DiagnosticView } from './diagnosticWorkbenchModel'
import '../../../styles/features/diagnostic-execution.css'
import './diagnostic-workbench.css'

export interface DiagnosticWorkbenchProps {
  api: RhnApi; clinicalContext: ClinicalContext; onNavigate: (path: string) => void
  onDirtyChange?: (dirty: boolean) => void
  authorities?: string[]
}

export function DiagnosticWorkbench({ api, clinicalContext, onNavigate, requestType, onDirtyChange, authorities }: DiagnosticWorkbenchProps & {
  requestType: 'LABORATORY' | 'EXAMINATION'
}) {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('taskId') || '')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dates, setDates] = useState(defaultDiagnosticDates)
  const [filters, setFilters] = useState(() => ({ keyword: '', status: '', ...defaultDiagnosticDates() }))
  const [filterError, setFilterError] = useState('')
  const [page, setPage] = useState(0)
  const [forms, setForms] = useState<Record<string, DiagnosticForm>>({})
  const [views, setViews] = useState<Record<string, DiagnosticView>>({})
  const scope = `${clinicalContext.organization.id}:${clinicalContext.department.id}:${requestType}`
  const laboratory = requestType === 'LABORATORY'
  const allowed = (action: string) => !authorities || authorities.includes('ROLE_ADMIN')
    || authorities.includes(`DIAGNOSTICS.${requestType}.${action}`)
  const requireTask = (task: DiagnosticExecutionTask) => {
    if (!task || !task.id || !task.residentId || !task.encounterId || task.organizationId !== clinicalContext.organization.id
      || task.departmentId !== clinicalContext.department.id || task.requestType !== requestType)
      throw new Error('队列数据不完整或与当前工作上下文不一致，请重新读取。')
    return task
  }
  const linkedTask = useDiagnosticTaskLink(api, params.get('taskId'), scope, requireTask)
  const worklist = useQuery({ queryKey: ['diagnostic-worklist', scope, filters, page, params.toString()],
    queryFn: async () => {
      const queryFilters: DiagnosticWorklistFilters = { activeAndRecent: true, status: (filters.status || undefined) as DiagnosticTaskStatus | undefined,
        createdFrom: diagnosticDateBoundary(filters.from), createdBefore: diagnosticDateBoundary(filters.to, true) }
      const result = await api.diagnostics.worklistPage(requestType, filters.keyword, page, 20,
        params.get('encounterId') || undefined, params.get('residentId') || undefined, queryFilters)
      if (!result || !Array.isArray(result.content) || !Number.isInteger(result.totalElements) || result.totalElements < 0
        || !Number.isInteger(result.totalPages) || result.totalPages < 0 || result.page !== page)
        throw new Error('队列分页数据不完整，请重新读取。')
      result.content.forEach(requireTask)
      return result
    }, refetchInterval: 30_000 })
  const tasks = useMemo(() => includeLinkedDiagnosticTask(worklist.isSuccess ? worklist.data.content : [], linkedTask.isSuccess ? linkedTask.data : undefined), [worklist.isSuccess, worklist.data, linkedTask.isSuccess, linkedTask.data])
  const selected = tasks.find((task) => task.id === selectedId)
  useEffect(() => { if (params.get('taskId')) setSelectedId(params.get('taskId')!) }, [params])
  const hasUnsaved = Object.values(forms).some((form) => form.dirty)
  useEffect(() => {
    onDirtyChange?.(hasUnsaved)
    return () => onDirtyChange?.(false)
  }, [hasUnsaved, onDirtyChange])
  useEffect(() => {
    if (!hasUnsaved) return
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsaved])
  useEffect(() => {
    if (params.get('taskId') && !linkedTask.isSuccess) return
    if (!tasks.some((task) => task.id === selectedId)) setSelectedId(tasks[0]?.id || '')
  }, [tasks, selectedId, params, linkedTask.isSuccess])
  useEffect(() => {
    setSelectedId(params.get('taskId') || ''); setKeyword(''); setStatus(''); const range = defaultDiagnosticDates(); setDates(range); setFilterError('')
    setFilters({ keyword: '', status: '', ...range }); setPage(0)
  }, [scope, params])
  // A state transition can remove the last row on a page; return to the last remaining page.
  useEffect(() => {
    if (worklist.isSuccess && page > 0 && page >= worklist.data.totalPages) setPage(Math.max(0, worklist.data.totalPages - 1))
  }, [worklist.isSuccess, worklist.data, page])
  const refresh = async () => { await Promise.all([
    'diagnostic-worklist', 'diagnostic-linked-task', 'diagnostic-task-reports', 'diagnostic-draft', 'diagnostic-specimens', 'diagnostic-patient-demographics',
    'doctor-reports', 'inpatient-diagnostic-reports',
  ].map((key) => client.invalidateQueries({ queryKey: [key] }))) }
  const applyFilters = () => {
    if (dates.from && dates.to && dates.from > dates.to) { setFilterError('申请开始日期不能晚于结束日期。'); return }
    setFilterError(''); setPage(0)
    setFilters({ keyword: keyword.trim(), status, ...dates })
  }
  const resetFilters = () => {
    const range = defaultDiagnosticDates()
    setKeyword(''); setStatus(''); setDates(range); setFilterError(''); setPage(0)
    setFilters({ keyword: '', status: '', ...range })
  }
  const formKey = `${scope}:${selected?.id || ''}`
  const view = views[formKey] || 'work'
  const title = laboratory ? '检验工作台' : '检查工作台'
  return <div className="diagnostic-workbench"><MasterDetailPage title={title}
    description={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`}
    actions={<Button variant="secondary" busy={worklist.isFetching} onClick={() => void refresh()}>刷新队列</Button>}
    feedback={<><div className="ui-query-filters diagnostic-query">
      <FormField label="患者 / 申请 / 标本" className="ui-query-filter--keyword"><SearchField label="搜索患者、申请或标本"
        placeholder="姓名、档案号、申请单号、标本号" value={keyword} onChange={setKeyword} onSearch={applyFilters} /></FormField>
      <FormField label="任务状态"><Select value={status} onChange={setStatus} options={diagnosticStatusOptions(laboratory)} clearable={false} searchable={false} /></FormField>
      <FormField label="申请日期" className="ui-query-filter--date"><DateRangePicker value={dates} onChange={setDates}
        startAriaLabel="申请开始日期" endAriaLabel="申请结束日期" /></FormField>
      <div className="ui-query-filters__actions"><Button onClick={applyFilters}>查询</Button>
        <Button variant="secondary" onClick={resetFilters}>重置</Button></div>
      <DiagnosticQueueNote reportPath={`/diagnostics/${laboratory ? 'laboratory' : 'examination'}/reports`} onNavigate={onNavigate} />
    </div>{filterError && <Alert placement="inline">{filterError}</Alert>}
    {linkedTask.error && <Alert>{errorMessage(linkedTask.error)}</Alert>}
    {worklist.error && <Alert>{errorMessage(worklist.error)}</Alert>}
    {(params.get('encounterId') || params.get('residentId')) && <Alert tone="info" placement="inline">当前限定为临床入口关联的患者申请。
      <Button variant="text" onClick={() => { const next = new URLSearchParams(params); next.delete('encounterId'); next.delete('residentId');
        setPage(0); setParams(next) }}>查看全部患者</Button></Alert>}</>}
    navigationLabel="执行队列" navigationResetScrollKey={`${page}:${JSON.stringify(filters)}`}
    navigationHeader={<PanelHead title="申请队列" meta={worklist.isSuccess ? `共 ${worklist.data.totalElements} 项` : '读取中'} />}
    navigationFooter={worklist.isSuccess && <Pagination page={page} totalPages={worklist.data.totalPages} total={worklist.data.totalElements}
      onChange={setPage} mode="simple" />}
    navigation={worklist.isPending ? <LoadingState label="正在加载医技队列…" /> : worklist.isError
      ? <EmptyState icon="clinical" title="医技队列加载失败" copy="请重新读取后继续操作。" action={<Button onClick={() => void refresh()}>重新读取队列</Button>} />
      : tasks.length === 0 ? <EmptyState icon="clinical" title="暂无匹配任务" copy="调整筛选条件，或等待临床申请放行。" />
        : <DiagnosticQueue api={api} tasks={tasks} selectedId={selectedId} forms={forms} scope={scope}
          onSelect={setSelectedId} />}
    detailLabel="医技作业" detailScroll="content" detailResetScrollKey={`${formKey}:${view}`}
    detailHeader={selected && <><DiagnosticTaskContext api={api} task={selected} />
      <Tabs label="医技作业视图" value={view} onChange={(value) => setViews((previous) => ({ ...previous, [formKey]: value }))}
        items={[{ value: 'work', label: selected.status === 'COMPLETED' ? '报告与更正' : '当前作业' },
          ...(laboratory ? [{ value: 'specimens' as const, label: '标本管理' }] : []),
          { value: 'reports', label: '报告历史' }, { value: 'request', label: '申请信息' }]} /></>}>
    {!selected ? <EmptyState icon="clinical" title="请选择医技任务" copy="从申请队列选择患者和项目后开始作业。" />
      : view === 'reports' ? <div className="diagnostic-scroll" role="region" aria-label="报告历史内容" tabIndex={0}><TaskReports api={api} task={selected} /></div>
        : view === 'request' ? <div className="diagnostic-scroll" role="region" aria-label="申请信息内容" tabIndex={0}><DiagnosticRequestDetails task={selected} /></div>
          : <DiagnosticTaskOperations key={formKey} api={api} task={selected} view={view} refreshing={worklist.isFetching}
            canExecute={allowed('EXECUTE')} canEdit={allowed('EDIT')} canSign={allowed('SIGN')} onRefresh={refresh} onNavigate={onNavigate}
            candidates={tasks} form={forms[formKey]}
            onForm={(form) => setForms((previous) => ({ ...previous, [formKey]: form }))} />}
  </MasterDetailPage></div>
}
