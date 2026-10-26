import { includeLinkedDiagnosticTask, useDiagnosticTaskLink } from '../shared/useDiagnosticTaskLink'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type {
  DiagnosticExecutionTask,
  DiagnosticTaskStatus,
  DiagnosticWorklistFilters,
} from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import {
  Alert,
  Button,
  DateRangePicker,
  EmptyState,
  FormField,
  LoadingState,
  Pagination,
  PanelHead,
  SearchField,
  Select,
  StatusBadge,
  Tabs,
} from '../../../shared/ui'
import { WorkbenchPage } from '../../../shared/ui/templates/PageTemplates'
import { useBarcodeScanner } from '../../../shared/hooks/useBarcodeScanner'
import {
  DiagnosticQueue,
  DiagnosticRequestDetails,
  DiagnosticTaskContext,
  TaskReports,
} from '../shared/DiagnosticTaskPanels'
import { DiagnosticTaskOperations } from '../shared/DiagnosticTaskOperations'
import {
  diagnosticDateBoundary,
  diagnosticStatusOptions,
  type DiagnosticForm,
  type DiagnosticView,
} from '../shared/diagnosticWorkbenchModel'
import { findSpecimenTubeByCode, type SpecimenTubeStandard } from '../../../shared/clinical/specimenTubeStandards'
import { loadDiagnosticSpecimens } from './SpecimenPanel'
import { useSpecimenTubePlan } from './useSpecimenTubePlan'
import { DiagnosticPrintAction } from '../../../shared/clinical/DiagnosticPrintAction'
import { DiagnosticQueueNote } from '../shared/DiagnosticQueueNote'
import '../../../styles/features/diagnostic-execution.css'
import '../shared/diagnostic-workbench.css'

export interface LaboratoryWorkspaceProps {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
  onDirtyChange?: (dirty: boolean) => void
  authorities?: string[]
}

/**
 * 生产级检验工作台（LIS 专属作业流水线）
 *
 * 遵循 WorkbenchPage 三栏作业规范，彻底解耦检查（PACS）逻辑：
 * - 左栏：高密标本/申请队列（支持标本号/申请单/患者检索与状态分面过滤）
 * - 中栏：标本采集/接收流转 + 24项多指标极速录入矩阵（回车跳行、自动匹配参考区间与危急值生命线）
 * - 右栏：采血管耗材前处理指南 + 质控审核与报告历史控制台
 */
export function LaboratoryWorkspace({
  api,
  clinicalContext,
  onNavigate,
  onDirtyChange,
  authorities,
}: LaboratoryWorkspaceProps) {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('taskId') || '')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dates, setDates] = useState({ from: '', to: '' })
  const [filters, setFilters] = useState({ keyword: '', status: '', from: '', to: '' })
  const [filterError, setFilterError] = useState('')
  const [page, setPage] = useState(0)
  const [forms, setForms] = useState<Record<string, DiagnosticForm>>({})
  const [views, setViews] = useState<Record<string, DiagnosticView>>({})

  const scope = `${clinicalContext.organization.id}:${clinicalContext.department.id}:LABORATORY`

  const allowed = (action: string) =>
    !authorities ||
    authorities.includes('ROLE_ADMIN') ||
    authorities.includes(`DIAGNOSTICS.LABORATORY.${action}`)

  const requireTask = (task: DiagnosticExecutionTask) => {
    if (
      !task ||
      !task.id ||
      !task.residentId ||
      !task.encounterId ||
      task.organizationId !== clinicalContext.organization.id ||
      task.departmentId !== clinicalContext.department.id ||
      task.requestType !== 'LABORATORY'
    ) {
      throw new Error('检验队列数据不完整或与当前工作上下文不一致，请重新读取。')
    }
    return task
  }

  const [manualRefreshing, setManualRefreshing] = useState(false)
  const hasUnsaved = Object.values(forms).some((form) => form.dirty)

  const linkedTask = useDiagnosticTaskLink(api, params.get('taskId'), scope, requireTask)
  const worklist = useQuery({
    queryKey: ['diagnostic-worklist', scope, filters, page, params.toString()],
    queryFn: async () => {
      const queryFilters: DiagnosticWorklistFilters = { activeAndRecent: true,
        status: (filters.status || undefined) as DiagnosticTaskStatus | undefined,
        createdFrom: diagnosticDateBoundary(filters.from),
        createdBefore: diagnosticDateBoundary(filters.to, true),
      }
      const result = await api.diagnostics.worklistPage(
        'LABORATORY',
        filters.keyword,
        page,
        20,
        params.get('encounterId') || undefined,
        params.get('residentId') || undefined,
        queryFilters
      )
      if (
        !result ||
        !Array.isArray(result.content) ||
        !Number.isInteger(result.totalElements) ||
        result.totalElements < 0 ||
        !Number.isInteger(result.totalPages) ||
        result.totalPages < 0 ||
        result.page !== page
      ) {
        throw new Error('检验队列分页数据不完整，请重新读取。')
      }
      result.content.forEach(requireTask)
      return result
    },
    refetchInterval: hasUnsaved ? false : 30_000,
  })

  const tasks = useMemo(() => (includeLinkedDiagnosticTask(worklist.isSuccess ? worklist.data.content : [], linkedTask.isSuccess ? linkedTask.data : undefined)), [worklist.isSuccess, worklist.data, linkedTask.isSuccess, linkedTask.data])
  const selected = tasks.find((task) => task.id === selectedId)
  useEffect(() => { if (params.get('taskId')) setSelectedId(params.get('taskId')!) }, [params])

  useEffect(() => {
    onDirtyChange?.(hasUnsaved)
    return () => onDirtyChange?.(false)
  }, [hasUnsaved, onDirtyChange])

  useEffect(() => {
    if (!hasUnsaved) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsaved])

  useEffect(() => {
    if (params.get('taskId') && !linkedTask.isSuccess) return
    if (!tasks.some((task) => task.id === selectedId)) setSelectedId(tasks[0]?.id || '')
  }, [tasks, selectedId, params, linkedTask.isSuccess])

  useEffect(() => {
    setSelectedId(params.get('taskId') || '')
    setKeyword('')
    setStatus('')
    setDates({ from: '', to: '' })
    setFilterError('')
    setFilters({ keyword: '', status: '', from: '', to: '' })
    setPage(0)
  }, [scope, params])

  useEffect(() => {
    if (worklist.isSuccess && page > 0 && page >= worklist.data.totalPages) {
      setPage(Math.max(0, worklist.data.totalPages - 1))
    }
  }, [worklist.isSuccess, worklist.data, page])

  const refresh = async () => {
    setManualRefreshing(true)
    try {
      await Promise.all(
        [
          'diagnostic-worklist',
          'diagnostic-linked-task',
          'diagnostic-task-reports',
          'diagnostic-draft',
          'diagnostic-specimens',
          'diagnostic-patient-demographics',
          'doctor-reports',
          'inpatient-diagnostic-reports',
        ].map((key) => client.invalidateQueries({ queryKey: [key] }))
      )
    } finally {
      setManualRefreshing(false)
    }
  }

  const applyFilters = () => {
    if (dates.from && dates.to && dates.from > dates.to) {
      setFilterError('申请开始日期不能晚于结束日期。')
      return
    }
    setFilterError('')
    setPage(0)
    setFilters({ keyword: keyword.trim(), status, ...dates })
  }

  const resetFilters = () => {
    setKeyword('')
    setStatus('')
    setDates({ from: '', to: '' })
    setFilterError('')
    setPage(0)
    setFilters({ keyword: '', status: '', from: '', to: '' })
  }

  const formKey = `${scope}:${selected?.id || ''}`
  const view = views[formKey] || 'work'

  // 当前选中申请实际使用的容器：已生成标本取实际容器，否则取后端分管试算结果，不再按项目名称猜测
  const selectedSpecimens = useQuery({
    queryKey: ['diagnostic-specimens', selected?.id, selected?.organizationId, selected?.departmentId],
    queryFn: () => loadDiagnosticSpecimens(api, selected!), enabled: Boolean(selected), retry: false })
  const tubePlan = useSpecimenTubePlan(api, selected ? [selected] : [],
    selected?.status === 'READY' && selectedSpecimens.isSuccess && selectedSpecimens.data.length === 0)
  const referenceContainers = (selectedSpecimens.data?.length
    ? selectedSpecimens.data.map((item) => ({ code: item.containerCode, name: item.containerName }))
    : tubePlan.data?.groups.map((item) => ({ code: item.containerCode, name: item.containerName })) ?? [])
  const referenceTubes = [...new Map(referenceContainers.flatMap((item) => {
    const tube = findSpecimenTubeByCode(item.code, item.name)
    return tube ? [[tube.tubeCode, tube] as const] : []
  })).values()] as SpecimenTubeStandard[]

  const [scannedAlert, setScannedAlert] = useState<string | null>(null)

  useBarcodeScanner({
    onScan: (scannedText) => {
      const code = scannedText.trim()
      if (!code) return
      const matched = tasks.find(
        (t) =>
          t.specimenNo === code ||
          t.requestNo === code ||
          t.taskNo === code ||
          t.healthRecordNo === code
      )
      if (matched) {
        setSelectedId(matched.id)
        setScannedAlert(`扫码核收定位成功：已选中条码 ${code}（患者：${matched.residentName} · ${matched.itemName}）`)
      } else {
        setKeyword(code)
        setPage(0)
        setFilters((prev) => ({ ...prev, keyword: code }))
        setScannedAlert(`扫码检索：当前页未命中，正在全库检索条码 ${code}…`)
      }
    },
  })

  return (
    <div className="diagnostic-workbench diagnostic-laboratory-workbench">
      <WorkbenchPage
        title="检验工作台 (LIS)"
        description={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`}
        actions={
          <>
            <StatusBadge tone="success">扫码枪就绪 (HID)</StatusBadge>
            <Button variant="secondary" busy={worklist.isFetching} onClick={() => void refresh()}>
              刷新队列
            </Button>
          </>
        }
        feedback={
          <>
            {scannedAlert && (
              <Alert tone="success" placement="inline">
                {scannedAlert}
              </Alert>
            )}
            <div className="ui-query-filters diagnostic-query">
              <FormField label="患者 / 申请 / 标本" className="ui-query-filter--keyword">
                <SearchField
                  label="搜索患者、申请或标本"
                  placeholder="姓名、档案号、申请单号、标本条码"
                  value={keyword}
                  onChange={setKeyword}
                  onSearch={applyFilters}
                />
              </FormField>
              <FormField label="任务状态">
                <Select
                  value={status}
                  onChange={setStatus}
                  options={diagnosticStatusOptions(true)}
                  clearable={false}
                  searchable={false}
                />
              </FormField>
              <FormField label="申请日期" className="ui-query-filter--date">
                <DateRangePicker
                  value={dates}
                  onChange={setDates}
                  startAriaLabel="申请开始日期"
                  endAriaLabel="申请结束日期"
                />
              </FormField>
              <div className="ui-query-filters__actions">
                <Button variant="secondary" onClick={applyFilters}>
                  查询
                </Button>
                <Button variant="text" onClick={resetFilters}>
                  重置
                </Button>
              </div>
              <DiagnosticQueueNote reportPath="/diagnostics/laboratory/reports" onNavigate={onNavigate} />
            </div>
            {filterError && <Alert placement="inline">{filterError}</Alert>}
            {linkedTask.error && <Alert>{errorMessage(linkedTask.error)}</Alert>}
            {worklist.error && <Alert>{errorMessage(worklist.error)}</Alert>}
            {(params.get('encounterId') || params.get('residentId')) && (
              <Alert tone="info" placement="inline">
                当前限定为临床入口关联的患者申请。
                <Button
                  variant="text"
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.delete('encounterId')
                    next.delete('residentId')
                    setPage(0)
                    setParams(next)
                  }}
                >
                  查看全部患者
                </Button>
              </Alert>
            )}
          </>
        }
        queueLabel="检验申请与标本队列"
        queueHeader={
          <PanelHead
            title="检验队列"
            meta={worklist.isSuccess ? `共 ${worklist.data.totalElements} 项` : '读取中'}
          />
        }
        queueFooter={
          worklist.isSuccess && (
            <Pagination
              page={page}
              totalPages={worklist.data.totalPages}
              total={worklist.data.totalElements}
              onChange={setPage}
              mode="simple"
            />
          )
        }
        queue={
          worklist.isPending ? (
            <LoadingState label="正在加载检验申请队列…" />
          ) : worklist.isError ? (
            <EmptyState
              icon="clinical"
              title="检验队列加载失败"
              copy="请重新读取后继续操作。"
              action={<Button onClick={() => void refresh()}>重新读取队列</Button>}
            />
          ) : tasks.length === 0 ? (
            <EmptyState icon="clinical" title="暂无待检标本与任务" copy="调整筛选条件，或等待门诊/住院开单放行。" />
          ) : (
            <DiagnosticQueue
              api={api}
              tasks={tasks}
              selectedId={selectedId}
              forms={forms}
              scope={scope}
              onSelect={setSelectedId}
            />
          )
        }
        context={selected && <DiagnosticTaskContext api={api} task={selected} />}
        referenceLabel="标本规范与报告质控"
        reference={
          !selected ? (
            <EmptyState icon="clinical" title="标本耗材与质控指南" copy="选中检验申请后查看标准耗材规格与质控历史。" />
          ) : (
            <div className="diagnostic-scroll" tabIndex={0} role="region" aria-label="辅助参考与质控信息">
              {referenceTubes.map((recommendedTube) => (
                <section key={recommendedTube.tubeCode} className="diagnostic-tube-reference-card">
                  <PanelHead title="标准采血管规格 (YY/T 0314)" />
                  <div className="diagnostic-tube-reference-body">
                    <div className="diagnostic-tube-badge">
                      <span
                        className={`diagnostic-tube-dot diagnostic-tube-dot--${recommendedTube.capColorKey}`}
                        aria-hidden="true"
                      />
                      <strong>{recommendedTube.tubeName}</strong>
                    </div>
                    <dl className="diagnostic-tube-details">
                      <div>
                        <dt>标准管帽色标</dt>
                        <dd>{recommendedTube.colorName}</dd>
                      </div>
                      <div>
                        <dt>法定标本类型</dt>
                        <dd>{recommendedTube.specimenType}</dd>
                      </div>
                      <div>
                        <dt>添加剂 / 抗凝剂</dt>
                        <dd>{recommendedTube.additive}</dd>
                      </div>
                      {recommendedTube.drawVolumeMl && (
                        <div>
                          <dt>推荐采血量</dt>
                          <dd>{recommendedTube.drawVolumeMl} mL</dd>
                        </div>
                      )}
                      <div>
                        <dt>采血混匀指南</dt>
                        <dd>{recommendedTube.mixingInstructions}</dd>
                      </div>
                      <div>
                        <dt>特别质控注意</dt>
                        <dd>{recommendedTube.preanalyticalNotes}</dd>
                      </div>
                    </dl>
                  </div>
                </section>
              ))}

              <section className="diagnostic-tube-reference-card">
                <PanelHead title="检验报告单打印与历史" />
                <div className="diagnostic-tube-reference-body">
                  {selected.status === 'COMPLETED' ? (
                    <>
                      <p>该申请已完成化验并签发正式检验报告单：</p>
                      <DiagnosticPrintAction
                        api={api}
                        encounterId={selected.encounterId}
                        sourceId={selected.reportId || selected.id}
                        sourceLabel={selected.requestNo}
                        taskCode="DIAGNOSTICS.LABORATORY.REPORT.PRINT"
                      />
                    </>
                  ) : (
                    <p>化验结果经录入并审核签发后，即可在此直接打印 A4 标准医学检验报告单。</p>
                  )}
                </div>
              </section>

              <section className="diagnostic-tube-reference-card">
                <PanelHead title="危急值管理提醒" />
                <div className="diagnostic-tube-reference-body">
                  <p className="diagnostic-critical-reminder">
                    依据三级医院临床实验室质量管理规范：凡化验指标落入危急值生命线（如 WBC &lt;2.5 或 &gt;25.0、GLU
                    &lt;2.8 或 &gt;22.2、PLT &lt;50 等），系统将自动红底警示，必须在 10
                    分钟内完成仪器复核并启动电话通报闭环。
                  </p>
                </div>
              </section>
            </div>
          )
        }
      >
        {!selected ? (
          <EmptyState
            icon="clinical"
            title="请选择检验申请"
            copy="从左侧待检队列中选择患者或扫描标本条码开始作业。"
          />
        ) : (
          <div className="diagnostic-laboratory-main-work">
            <Tabs
              label="检验作业视图"
              value={view}
              onChange={(value) => setViews((previous) => ({ ...previous, [formKey]: value }))}
              items={[
                { value: 'work', label: selected.status === 'COMPLETED' ? '报告与更正' : '当前作业' },
                { value: 'specimens', label: '标本管理' },
                { value: 'reports', label: '报告历史' },
                { value: 'request', label: '申请信息' },
              ]}
              actions={<div id="diagnostic-tab-actions" className="diagnostic-tab-actions" />}
            />
            {view === 'reports' ? (
              <div className="diagnostic-scroll" role="region" aria-label="报告历史内容" tabIndex={0}>
                <TaskReports api={api} task={selected} />
              </div>
            ) : view === 'request' ? (
              <div className="diagnostic-scroll" role="region" aria-label="申请信息内容" tabIndex={0}>
                <DiagnosticRequestDetails task={selected} />
              </div>
            ) : (
              <DiagnosticTaskOperations
                key={formKey}
                api={api}
                task={selected}
                view={view}
                refreshing={manualRefreshing}
                canExecute={allowed('EXECUTE')}
                canEdit={allowed('EDIT')}
                canSign={allowed('SIGN')}
                onRefresh={refresh}
                onNavigate={onNavigate}
                candidates={tasks}
                form={forms[formKey]}
                onForm={(form) => setForms((previous) => ({ ...previous, [formKey]: form }))}
              />
            )}
          </div>
        )}
      </WorkbenchPage>
    </div>
  )
}
