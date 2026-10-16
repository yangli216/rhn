import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  DiagnosticPatientDemographics,
  DiagnosticRequestDetails,
  DiagnosticTaskContext,
  TaskReports,
} from '../shared/DiagnosticTaskPanels'
import { ReportComposer } from '../shared/ReportComposer'
import {
  diagnosticDateBoundary,
  diagnosticStatusOptions,
  type DiagnosticForm,
  type DiagnosticView,
} from '../shared/diagnosticWorkbenchModel'
import {
  recommendExamModality,
} from '../../../shared/clinical/nationalStandardExamCatalog'
import { diagnosticTaskStatusPresentation } from '../../../shared/presentation'
import { formatTime } from '../../../shared/format'
import { ExaminationImages } from './ExaminationImages'
import { DiagnosticPrintAction } from '../../../shared/clinical/DiagnosticPrintAction'
import '../../../styles/features/diagnostic-execution.css'
import '../shared/diagnostic-workbench.css'

export interface ExaminationWorkspaceProps {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
  onDirtyChange?: (dirty: boolean) => void
  authorities?: string[]
}

const MODALITY_OPTIONS = [
  { value: '', label: '全部影像类别 (All)' },
  { value: 'DR', label: 'DR 数字化X射线摄影' },
  { value: 'CT', label: 'CT 计算机断层扫描' },
  { value: 'MR', label: 'MR 磁共振成像' },
  { value: 'US', label: 'US 超声医学影像' },
  { value: 'ECG', label: 'ECG 心电图' },
  { value: 'ES', label: 'ES 电子内窥镜' },
]

/**
 * 生产级医学检查工作台（PACS 专属图文作业流水线）
 *
 * 遵循 WorkbenchPage 三栏作业规范，彻底解耦检验（LIS）逻辑：
 * - 左栏：检查申请排队队列（支持患者/申请号检索、DICOM Modality 影像类别筛选与状态分面）
 * - 中栏：三查七对与检查核对 + WS 445.11 两段式图文报告书写与 PACS 关键影像灯箱
 * - 右栏：设备前处理与禁忌症质控指南 + A4 图文报告单打印与影像危急值预警
 */
export function ExaminationWorkspace({
  api,
  clinicalContext,
  onNavigate,
  onDirtyChange,
  authorities,
}: ExaminationWorkspaceProps) {
  const client = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [modality, setModality] = useState('')
  const [dates, setDates] = useState({ from: '', to: '' })
  const [filters, setFilters] = useState({ keyword: '', status: '', modality: '', from: '', to: '' })
  const [filterError, setFilterError] = useState('')
  const [page, setPage] = useState(0)
  const [forms, setForms] = useState<Record<string, DiagnosticForm>>({})
  const [views, setViews] = useState<Record<string, DiagnosticView>>({})

  const scope = `${clinicalContext.organization.id}:${clinicalContext.department.id}:EXAMINATION`

  const allowed = (action: string) =>
    !authorities ||
    authorities.includes('ROLE_ADMIN') ||
    authorities.includes(`DIAGNOSTICS.EXAMINATION.${action}`)

  const requireTask = (task: DiagnosticExecutionTask) => {
    if (
      !task ||
      !task.id ||
      !task.residentId ||
      !task.encounterId ||
      task.organizationId !== clinicalContext.organization.id ||
      task.departmentId !== clinicalContext.department.id ||
      task.requestType !== 'EXAMINATION'
    ) {
      throw new Error('检查队列数据不完整或与当前工作上下文不一致，请重新读取。')
    }
    return task
  }

  const [manualRefreshing, setManualRefreshing] = useState(false)
  const hasUnsaved = Object.values(forms).some((form) => form.dirty)

  const worklist = useQuery({
    queryKey: ['diagnostic-worklist', scope, filters, page, params.toString()],
    queryFn: async () => {
      const queryFilters: DiagnosticWorklistFilters = {
        status: (filters.status || undefined) as DiagnosticTaskStatus | undefined,
        createdFrom: diagnosticDateBoundary(filters.from),
        createdBefore: diagnosticDateBoundary(filters.to, true),
      }
      const result = await api.diagnostics.worklistPage(
        'EXAMINATION',
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
        throw new Error('检查队列分页数据不完整，请重新读取。')
      }
      result.content.forEach(requireTask)
      return result
    },
    refetchInterval: hasUnsaved ? false : 30_000,
  })

  const rawTasks = useMemo(() => (worklist.isSuccess ? worklist.data.content : []), [worklist.isSuccess, worklist.data])

  // Modality 前端分面过滤
  const tasks = useMemo(() => {
    if (!filters.modality) return rawTasks
    return rawTasks.filter((task) => {
      const std = recommendExamModality(task.itemName)
      return std.code === filters.modality
    })
  }, [rawTasks, filters.modality])

  const selected = tasks.find((task) => task.id === selectedId) || tasks[0]

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
    if (!tasks.some((task) => task.id === selectedId)) setSelectedId(tasks[0]?.id || '')
  }, [tasks, selectedId])

  useEffect(() => {
    setSelectedId('')
    setKeyword('')
    setStatus('')
    setModality('')
    setDates({ from: '', to: '' })
    setFilterError('')
    setFilters({ keyword: '', status: '', modality: '', from: '', to: '' })
    setPage(0)
  }, [scope])

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
          'diagnostic-task-reports',
          'diagnostic-draft',
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
    setFilters({ keyword: keyword.trim(), status, modality, ...dates })
  }

  const resetFilters = () => {
    setKeyword('')
    setStatus('')
    setModality('')
    setDates({ from: '', to: '' })
    setFilterError('')
    setPage(0)
    setFilters({ keyword: '', status: '', modality: '', from: '', to: '' })
  }

  const formKey = `${scope}:${selected?.id || ''}`
  const view = views[formKey] || 'work'

  // 当前选中项目的 Modality 标准
  const currentModalityStandard = selected ? recommendExamModality(selected.itemName) : undefined

  // 读取选中任务的草稿
  const draft = useQuery({
    queryKey: ['diagnostic-draft', selected?.id, selected?.organizationId, selected?.departmentId],
    queryFn: () => api.diagnostics.draft(selected!.id),
    enabled: Boolean(selected && ['IN_PROGRESS', 'COMPLETED'].includes(selected.status)),
  })

  // 开始检查 Mutation
  const startExam = useMutation({
    mutationFn: () => api.diagnostics.start(selected!.id, selected!.revision),
    onSuccess: refresh,
  })

  const [safetyConfirmed, setSafetyConfirmed] = useState(true)

  return (
    <div className="diagnostic-workbench diagnostic-examination-workbench">
      <WorkbenchPage
        title="检查工作台 (PACS)"
        description={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`}
        actions={
          <>
            <StatusBadge tone="success">PACS 影像网关已联通</StatusBadge>
            <Button variant="secondary" busy={worklist.isFetching} onClick={() => void refresh()}>
              刷新队列
            </Button>
          </>
        }
        feedback={
          <>
            <div className="ui-query-filters diagnostic-query">
              <FormField label="患者 / 申请" className="ui-query-filter--keyword">
                <SearchField
                  label="搜索患者或检查申请"
                  placeholder="姓名、档案号、申请单号"
                  value={keyword}
                  onChange={setKeyword}
                  onSearch={applyFilters}
                />
              </FormField>
              <FormField label="影像类别 (Modality)">
                <Select
                  value={modality}
                  onChange={setModality}
                  options={MODALITY_OPTIONS}
                  clearable={false}
                  searchable={false}
                />
              </FormField>
              <FormField label="任务状态">
                <Select
                  value={status}
                  onChange={setStatus}
                  options={diagnosticStatusOptions(false)}
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
            </div>
            {filterError && <Alert placement="inline">{filterError}</Alert>}
            {worklist.error && <Alert>{errorMessage(worklist.error)}</Alert>}
            {startExam.error && <Alert>{errorMessage(startExam.error)}</Alert>}
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
        queueLabel="检查申请与排队队列"
        queueHeader={
          <PanelHead
            title="检查队列"
            meta={worklist.isSuccess ? `共 ${tasks.length} 项` : '读取中'}
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
            <LoadingState label="正在加载检查申请队列…" />
          ) : worklist.isError ? (
            <EmptyState
              icon="clinical"
              title="检查队列加载失败"
              copy="请重新读取后继续操作。"
              action={<Button onClick={() => void refresh()}>重新读取队列</Button>}
            />
          ) : tasks.length === 0 ? (
            <EmptyState icon="clinical" title="暂无待检项目与任务" copy="调整筛选条件，或等待门诊/住院开单放行。" />
          ) : (
            <ul aria-label="检查申请队列" className="diagnostic-queue-list">
              {tasks.map((task) => {
                const itemStatus = diagnosticTaskStatusPresentation(task.status, false)
                const std = recommendExamModality(task.itemName)
                return (
                  <li
                    key={task.id}
                    className={`diagnostic-queue-entry ${task.id === selected?.id ? 'is-active' : ''}`}
                  >
                    <Button
                      variant="text"
                      className="diagnostic-queue-choice"
                      aria-current={task.id === selected?.id ? 'true' : undefined}
                      aria-label={`${task.residentName} · [${std.code}] ${task.itemName}`}
                      title={`申请单号 ${task.requestNo}`}
                      onClick={() => setSelectedId(task.id)}
                    >
                      <span className="diagnostic-queue-summary">
                        <span className="diagnostic-queue-col diagnostic-queue-col--patient">
                          <strong className="diagnostic-queue-patient-name">{task.residentName}</strong>
                          <span className="diagnostic-queue-demographics">
                            <DiagnosticPatientDemographics api={api} task={task} compact />
                          </span>
                        </span>
                        <span className="diagnostic-queue-col diagnostic-queue-col--project">
                          <span className="diagnostic-queue-project">
                            <span
                              className={`diagnostic-modality-badge diagnostic-modality-badge--${std.code.toLowerCase()}`}
                            >
                              {std.code}
                            </span>{' '}
                            {task.itemName}
                          </span>
                          <span className="diagnostic-queue-meta">
                            申请 {formatTime(task.createdAt) || '—'} · 单号 {task.requestNo}
                          </span>
                        </span>
                      </span>
                    </Button>
                    <div className="diagnostic-queue-state">
                      <StatusBadge tone={itemStatus.tone}>{itemStatus.label}</StatusBadge>
                      {forms[`${scope}:${task.id}`]?.dirty && (
                        <small className="diagnostic-unsaved">未保存</small>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        }
        context={selected && <DiagnosticTaskContext api={api} task={selected} />}
        referenceLabel="影像规范与报告质控"
        reference={
          !selected ? (
            <EmptyState icon="clinical" title="影像设备与质控指南" copy="选中检查申请后查看设备准备规范与质控要求。" />
          ) : (
            <div className="diagnostic-scroll" tabIndex={0} role="region" aria-label="辅助参考与质控信息">
              {currentModalityStandard && (
                <section className="diagnostic-tube-reference-card">
                  <PanelHead title={`设备规范 (${currentModalityStandard.code})`} />
                  <div className="diagnostic-tube-reference-body">
                    <div>
                      <strong>{currentModalityStandard.name}</strong>
                      <span className="ui-text-secondary"> ({currentModalityStandard.shortLabel})</span>
                    </div>
                    <dl className="diagnostic-tube-details">
                      <div>
                        <dt>检查前准备规范</dt>
                        <dd>{currentModalityStandard.preparationGuide}</dd>
                      </div>
                      <div>
                        <dt>安全排查与禁忌症</dt>
                        <dd>{currentModalityStandard.contraindicationGuide}</dd>
                      </div>
                    </dl>
                    <small className="ui-text-secondary">
                      依据 WS 445.11-2014 规范：检查报告需客观记录影像征象与诊断意见，关键阳性或阴性切面应附图留档。
                    </small>
                  </div>
                </section>
              )}

              <section className="diagnostic-tube-reference-card">
                <PanelHead title="医学影像图文报告单" />
                <div className="diagnostic-tube-reference-body">
                  {selected.status === 'COMPLETED' ? (
                    <>
                      <p>该检查已完成并签发正式医学影像图文报告：</p>
                      <DiagnosticPrintAction
                        api={api}
                        encounterId={selected.encounterId}
                        sourceId={selected.reportId || selected.id}
                        sourceLabel={selected.requestNo}
                        taskCode="DIAGNOSTICS.EXAMINATION.REPORT.PRINT"
                      />
                    </>
                  ) : (
                    <p>完成影像采集并审核签发报告后，可在此直接打印附带关键帧图像的 A4 医学影像图文报告单。</p>
                  )}
                </div>
              </section>

              <section className="diagnostic-tube-reference-card">
                <PanelHead title="影像急症与危急值通报" />
                <div className="diagnostic-tube-reference-body">
                  <p className="diagnostic-critical-reminder">
                    依据三级医院放射与超声质量管理规范：凡发现急性颅内出血、脑疝、气胸压缩&gt;30%、大面积肺栓塞、主动脉夹层、消化道穿孔游离气体等影像急症危急征象，必须在
                    10 分钟内核查并启动电话通报闭环。
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
            title="请选择检查申请"
            copy="从左侧待检队列中选择患者开始作业。"
          />
        ) : (
          <div className="diagnostic-examination-main-work">
            <Tabs
              label="检查作业视图"
              value={view}
              onChange={(value) => setViews((previous) => ({ ...previous, [formKey]: value }))}
              items={[
                { value: 'work', label: selected.status === 'COMPLETED' ? '报告与更正' : '当前作业' },
                { value: 'images', label: 'PACS 影像附件' },
                { value: 'request', label: '申请信息' },
                { value: 'reports', label: '报告历史' },
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
            ) : view === 'images' ? (
              <div className="diagnostic-scroll" role="region" aria-label="PACS 影像附件" tabIndex={0}>
                <section className="diagnostic-precheck-card">
                  <PanelHead title="PACS 关键影像采集与灯箱阅片" meta="Keyframes & Lightbox" />
                  <p className="ui-text-secondary">
                    支持粘贴或上传超声、心电、内窥镜或 DR/CT 关键征象切面截图（支持拖拽与 Ctrl+V 粘贴）；可设置“★ 报告首选主图”。
                  </p>
                  {draft.isPending ? (
                    <LoadingState label="正在读取影像附件…" />
                  ) : draft.isError ? (
                    <Alert>{errorMessage(draft.error)}</Alert>
                  ) : (
                    <ExaminationImages
                      api={api}
                      task={selected}
                      draft={draft.data}
                      disabled={!allowed('EDIT') || selected.status === 'COMPLETED'}
                      onRefresh={refresh}
                    />
                  )}
                </section>
              </div>
            ) : (
              /* view === 'work' */
              selected.status === 'READY' ? (
                <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
                  <section className="diagnostic-precheck-card">
                    <PanelHead
                      title="三查七对与检查准备核对"
                      meta={currentModalityStandard?.name}
                    />
                    <p className="ui-text-secondary">
                      上机检查前请严格核对患者身份与禁忌症排查，确认无误后开始检查。
                    </p>

                    <dl className="diagnostic-request-details">
                      <div>
                        <dt>受检患者</dt>
                        <dd>
                          <strong>{selected.residentName}</strong> ·{' '}
                          <DiagnosticPatientDemographics api={api} task={selected} />
                        </dd>
                      </div>
                      <div>
                        <dt>健康档案号</dt>
                        <dd>{selected.healthRecordNo}</dd>
                      </div>
                      <div>
                        <dt>申请项目</dt>
                        <dd>
                          <strong>{selected.itemName}</strong> ({selected.itemCode})
                        </dd>
                      </div>
                      <div>
                        <dt>检查类型</dt>
                        <dd>{currentModalityStandard?.name || selected.examinationTypeText || '未配置'}</dd>
                      </div>
                      <div>
                        <dt>申请单号</dt>
                        <dd>{selected.requestNo}</dd>
                      </div>
                      <div>
                        <dt>申请时间</dt>
                        <dd>{formatTime(selected.createdAt) || '—'}</dd>
                      </div>
                    </dl>

                    {currentModalityStandard && (
                      <div className="diagnostic-precheck-checklist">
                        <div className="diagnostic-precheck-item">
                          <strong>检查前准备规范：</strong>
                          <span>{currentModalityStandard.preparationGuide}</span>
                        </div>
                        <div className="diagnostic-precheck-item">
                          <strong>安全排查与禁忌症：</strong>
                          <span>{currentModalityStandard.contraindicationGuide}</span>
                        </div>
                      </div>
                    )}

                    {!allowed('EXECUTE') && (
                      <Alert tone="info" placement="inline">
                        当前身份可查阅任务，暂无执行权限。
                      </Alert>
                    )}

                    <div className="diagnostic-precheck-confirm">
                      <label className="ui-checkbox-label">
                        <input
                          type="checkbox"
                          checked={safetyConfirmed}
                          onChange={(e) => setSafetyConfirmed(e.target.checked)}
                          disabled={worklist.isFetching || !allowed('EXECUTE')}
                        />
                        <span>
                          已完成患者身份三查七对，已核对检查部位与技术方法，确认无禁忌症、符合检查要求。
                        </span>
                      </label>
                    </div>

                    <div className="ui-form-actions">
                      <Button
                        disabled={worklist.isFetching || !allowed('EXECUTE') || !safetyConfirmed}
                        busy={startExam.isPending}
                        onClick={() => startExam.mutate()}
                      >
                        确认核对并开始检查
                      </Button>
                    </div>
                  </section>
                </div>
              ) : selected.status === 'WAITING_SETTLEMENT' ? (
                <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
                  <Alert tone="info" placement="inline">
                    患者检查费用待结算，结算后自动放行上机。
                    <Button variant="text" onClick={() => onNavigate(`/billing/settlement?encounterId=${selected.encounterId}`)}>
                      去费用结算
                    </Button>
                  </Alert>
                </div>
              ) : selected.status === 'EXCEPTION' ? (
                <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
                  <Alert placement="inline">{selected.exceptionNote || '任务需要核对后继续处理。'}</Alert>
                </div>
              ) : selected.status === 'CANCELLED' ? (
                <div className="diagnostic-scroll diagnostic-operation-body" role="region" aria-label="当前作业内容" tabIndex={0}>
                  <EmptyState icon="clinical" title="申请已取消" copy="可查看申请记录和历史报告。" />
                </div>
              ) : (
                /* IN_PROGRESS or COMPLETED */
                draft.isPending ? (
                  <LoadingState label="正在读取报告草稿…" />
                ) : draft.isError ? (
                  <EmptyState
                    icon="clinical"
                    title="草稿加载失败"
                    copy="为避免覆盖已有内容，请重新读取。"
                    action={<Button onClick={() => void draft.refetch()}>重新读取草稿</Button>}
                  />
                ) : (
                  <ReportComposer
                    key={formKey}
                    api={api}
                    task={selected}
                    draft={draft.data}
                    refreshing={manualRefreshing}
                    onRefresh={refresh}
                    form={forms[formKey]}
                    onForm={(form) => setForms((previous) => ({ ...previous, [formKey]: form }))}
                    canEdit={allowed('EDIT')}
                    canSign={allowed('SIGN')}
                  />
                )
              )
            )}
          </div>
        )}
      </WorkbenchPage>
    </div>
  )
}
