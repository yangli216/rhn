import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { EncounterQueryItem } from '../../shared/api/encountersApi'
import { REGISTRATION_SOURCE_LABELS } from '../../shared/api/schedulingApi'
import { age, genderLabel } from '../../shared/format'
import { encounterStatusPresentation } from '../../shared/presentation'
import type { Encounter } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, EmptyState, FormField, getTodayRange, Icon, LoadingState, PageHeader, Pagination, Panel, PanelHead, Select,
  StatusBadge, type DateRange,
} from '../../shared/ui'
import '../../styles/features/scheduling-registration.css'

const encounterStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'REGISTERED', label: '已挂号/待接诊' },
  { value: 'IN_PROGRESS', label: '接诊中' },
  { value: 'SUSPENDED', label: '已暂挂' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'TRANSFERRED', label: '已转科' },
  { value: 'TERMINATED', label: '已终止' },
  { value: 'CANCELLED', label: '已取消' },
]

const visitTypeLabels: Record<string, string> = {
  GENERAL: '普通门诊',
  FOLLOW_UP: '复诊',
  EMERGENCY: '急诊',
  TRANSFER: '转科就诊',
}

const scopeOptions = [
  { value: 'DEPARTMENT', label: '当前科室' },
  { value: 'ORGANIZATION', label: '全院机构' },
]

function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-')
}

function formatTimeOnly(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function resolveStatusPresentation(status: string) {
  const presentation = encounterStatusPresentation(status as Encounter['status'])
  if (presentation) return presentation
  return { label: status, tone: 'neutral' as const }
}

export function EncounterQueryWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const [dateRange, setDateRange] = useState<DateRange>(getTodayRange)
  const [status, setStatus] = useState<string>('')
  const [scope, setScope] = useState<'DEPARTMENT' | 'ORGANIZATION'>('DEPARTMENT')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const encounters = useQuery({
    queryKey: [
      'outpatient-encounters-page', clinicalContext.organization.id, clinicalContext.department.id,
      scope, dateRange.from, dateRange.to, status, submittedQuery, pageIndex, pageSize,
    ],
    queryFn: () => api.encounters.page({
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      status: status || undefined,
      query: submittedQuery || undefined,
      page: pageIndex,
      size: pageSize,
      scope,
    }),
    enabled: Boolean(dateRange.from && dateRange.to),
  })

  useEffect(() => {
    setPageIndex(0)
  }, [clinicalContext.organization.id, clinicalContext.department.id, scope])

  function handleDateRangeChange(range: DateRange) {
    setDateRange(range)
    setPageIndex(0)
  }

  function handleStatusChange(value: string) {
    setStatus(value)
    setPageIndex(0)
  }

  function handleScopeChange(value: string) {
    setScope(value as 'DEPARTMENT' | 'ORGANIZATION')
    setPageIndex(0)
  }

  function search(event: FormEvent) {
    event.preventDefault()
    setSubmittedQuery(query.trim())
    setPageIndex(0)
  }

  const items = encounters.data?.content ?? []
  const totalElements = encounters.data?.totalElements ?? 0
  const totalPages = encounters.data?.totalPages ?? 0

  const active = items.filter((item) => ['IN_PROGRESS', 'SUSPENDED'].includes(item.status)).length
  const completed = items.filter((item) => ['COMPLETED', 'TRANSFERRED'].includes(item.status)).length
  const closed = items.filter((item) => ['TERMINATED', 'CANCELLED'].includes(item.status)).length
  const dateRangeLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} 至 ${dateRange.to}`
  const scopeLabel = scope === 'ORGANIZATION' ? clinicalContext.organization.name : clinicalContext.department.name

  return <>
    <PageHeader
      eyebrow="门诊医疗 · 就诊业务"
      title="就诊查询"
      description="按日期范围查询当前科室或全院就诊记录，掌握医生接诊进度与诊断信息，支持快速进入门诊医生站继续接诊或复核病历。"
      actions={<>
        <Button onClick={() => onNavigate('/outpatient/reception')}>
          <Icon name="stethoscope" />门诊医生站
        </Button>
        <Button variant="secondary" onClick={() => void encounters.refetch()}>
          <Icon name="refresh" />刷新
        </Button>
      </>}
    />

    {encounters.error && <Alert className="ui-page-feedback">{errorMessage(encounters.error)}</Alert>}

    <section className="registration-metrics" aria-label="就诊查询摘要">
      <div><span>查询结果</span><strong>{totalElements}</strong><small>{dateRangeLabel}</small></div>
      <div><span>接诊中 / 暂挂</span><strong>{active}</strong><small>正在进行的诊疗流程</small></div>
      <div><span>已诊毕 / 已转科</span><strong>{completed}</strong><small>诊疗正常结束记录</small></div>
      <div><span>已终止 / 已取消</span><strong>{closed}</strong><small>退号或非计划终止</small></div>
    </section>

    <Panel className="encounter-query-filter-panel">
      <form className="encounter-query-filter-form" onSubmit={search}>
        <FormField label="就诊日期范围">
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        </FormField>
        <FormField label="就诊状态">
          <Select
            value={status}
            options={encounterStatusOptions}
            placeholder="全部状态"
            searchable={false}
            clearable={false}
            onChange={(value) => handleStatusChange(value as string)}
          />
        </FormField>
        <FormField label="查询范围">
          <Select
            value={scope}
            options={scopeOptions}
            placeholder="查询范围"
            searchable={false}
            clearable={false}
            onChange={(value) => handleScopeChange(value as string)}
          />
        </FormField>
        <FormField label="就诊关键词">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="姓名、档案号、就诊号、挂号单、医生、诊断或主诉"
          />
        </FormField>
        <Button type="submit" variant="secondary" busy={encounters.isFetching}>
          <Icon name="search" />查询
        </Button>
      </form>
    </Panel>

    <Panel className="registration-query-list-panel">
      <PanelHead title="就诊记录" meta={`共 ${totalElements} 条 · ${scopeLabel}`} />
      {encounters.isPending ? (
        <LoadingState label="正在加载就诊记录…" />
      ) : totalElements === 0 ? (
        <EmptyState
          icon="clinical"
          title={!submittedQuery && !status ? `${dateRangeLabel} 暂无就诊记录` : '没有匹配的就诊记录'}
          copy={!submittedQuery && !status ? '患者完成挂号后将进入就诊列表。' : '请调整状态、范围或关键词后重新查询。'}
          action={
            !submittedQuery && !status ? (
              <Button onClick={() => onNavigate('/outpatient/reception')}>前往门诊医生站</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="registration-query-list-scroll">
            <div className="encounter-today-list">
              <div className="encounter-today-list__head">
                <span>就诊号</span>
                <span>居民患者</span>
                <span>就诊科室与诊室</span>
                <span>挂号与渠道</span>
                <span>接诊医生</span>
                <span>主要诊断与主诉</span>
                <span>就诊时间</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {items.map((item: EncounterQueryItem) => {
                const sourceLabel = item.registrationSource
                  ? ((REGISTRATION_SOURCE_LABELS as Record<string, string>)[item.registrationSource] || item.registrationSource)
                  : '窗口办理'
                const visitTypeDisplay = item.visitType ? (visitTypeLabels[item.visitType] || item.visitType) : '普通门诊'
                const deptName = item.departmentName || clinicalContext.department.name
                const doctorName = item.clinicianName || item.clinicianId || '待接诊'
                const regDate = formatDateTime(item.registeredAt)
                const completionInfo = item.completedAt ? `诊毕: ${formatTimeOnly(item.completedAt)}` : item.startedAt ? `开始: ${formatTimeOnly(item.startedAt)}` : '等待接诊'
                const statusInfo = resolveStatusPresentation(item.status)
                const isInService = ['IN_PROGRESS', 'SUSPENDED', 'REGISTERED'].includes(item.status)

                return (
                  <article key={item.id}>
                    <strong className="encounter-no-cell" title={item.encounterNo}>{item.encounterNo}</strong>
                    <div>
                      <strong>{item.residentName || '匿名居民'}</strong>
                      <small>
                        {item.gender ? genderLabel(item.gender as 'MALE' | 'FEMALE' | 'UNKNOWN') : '--'}
                        {item.birthDate ? ` · ${age(item.birthDate)} 岁` : ''}
                        {item.healthRecordNo ? ` · ${item.healthRecordNo}` : ''}
                      </small>
                    </div>
                    <div>
                      <strong>{deptName}</strong>
                      <small>{item.serviceName || item.locationName || '门诊诊室'}</small>
                    </div>
                    <div>
                      <strong>{item.registrationNo || '直接就诊'}</strong>
                      <small>{sourceLabel} · {visitTypeDisplay}</small>
                    </div>
                    <div>
                      <strong>{doctorName}</strong>
                      <small>{item.clinicianId ? `工号: ${item.clinicianId}` : '系统排队'}</small>
                    </div>
                    <div>
                      {item.primaryDiagnosisName ? (
                        <span className="encounter-diagnosis-tag">
                          <strong>{item.primaryDiagnosisName}</strong>
                          {item.primaryDiagnosisCode && <small>({item.primaryDiagnosisCode})</small>}
                        </span>
                      ) : (
                        <strong>{item.chiefComplaint || '暂未录入诊断'}</strong>
                      )}
                      <small>
                        {item.chiefComplaint && item.primaryDiagnosisName ? `主诉: ${item.chiefComplaint}` : ''}
                        {item.systolic && item.diastolic ? ` · 血压: ${item.systolic}/${item.diastolic} mmHg` : ''}
                        {item.diagnosisCount > 1 ? ` · 共 ${item.diagnosisCount} 项诊断` : ''}
                      </small>
                    </div>
                    <div>
                      <strong>{regDate}</strong>
                      <small>{completionInfo}</small>
                    </div>
                    <div className="registration-status-cell">
                      <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                    </div>
                    <span className="registration-row-actions">
                      <Button
                        size="sm"
                        variant="text"
                        onClick={() => onNavigate(`/outpatient/reception?${new URLSearchParams({
                          residentId: item.residentId,
                          encounterId: item.id,
                        }).toString()}`)}
                      >
                        {isInService ? '继续接诊' : '查看病历'}
                      </Button>
                    </span>
                  </article>
                )
              })}
            </div>
          </div>
          <Pagination
            page={pageIndex}
            totalPages={totalPages}
            total={totalElements}
            pageSize={pageSize}
            onChange={setPageIndex}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPageIndex(0)
            }}
            pageSizeOptions={[10, 20, 50]}
            label="就诊记录分页"
          />
        </>
      )}
    </Panel>
  </>
}
