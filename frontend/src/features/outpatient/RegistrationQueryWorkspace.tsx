import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import { systemEnumItemName } from '../../shared/api/dictionaryApi'
import type { CancelEncounterResult } from '../../shared/api/encountersApi'
import { REGISTRATION_SOURCE_LABELS, SCHEDULING_SYSTEM_ENUM, type ReceptionQueueItem } from '../../shared/api/schedulingApi'
import { age, genderLabel } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, Dialog, EmptyState, FormField, getTodayRange, Icon, LoadingState, PageHeader, Pagination, Panel, PanelHead, Select,
  StatusBadge, type DateRange,
} from '../../shared/ui'
import '../../styles/features/scheduling-registration.css'

const queueStatuses: ReceptionQueueItem['status'][] = [
  'WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED', 'COMPLETED', 'CANCELLED',
]

const fallbackStatusNames: Record<ReceptionQueueItem['status'], string> = {
  WAITING: '候诊中',
  CALLED: '已叫号',
  SERVING: '接诊中',
  SUSPENDED: '已暂挂',
  MISSED: '已过号',
  COMPLETED: '已诊毕',
  CANCELLED: '已取消',
}

function formatRegistrationDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-')
}

function formatRegistrationTime(value?: string) {
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

function queueTone(status: ReceptionQueueItem['status']) {
  if (status === 'WAITING' || status === 'SUSPENDED' || status === 'MISSED') return 'warning' as const
  if (status === 'CALLED' || status === 'SERVING') return 'info' as const
  if (status === 'COMPLETED') return 'success' as const
  return 'neutral' as const
}

export function includesQuery(item: ReceptionQueueItem, query: string) {
  if (!query) return true
  const lowerQuery = query.toLocaleLowerCase('zh-CN')
  return [
    item.residentName, item.healthRecordNo, item.registrationNo, item.ticketNo,
    item.practitionerName, item.serviceName, item.locationName,
    item.registeredByName, item.departmentName,
  ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(lowerQuery))
}

export function RegistrationQueryWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [dateRange, setDateRange] = useState<DateRange>(getTodayRange)
  const [status, setStatus] = useState<ReceptionQueueItem['status'] | ''>('')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [cancelling, setCancelling] = useState<ReceptionQueueItem | null>(null)
  const [cancellationResult, setCancellationResult] = useState<CancelEncounterResult | null>(null)

  const registrations = useQuery({
    queryKey: [
      'outpatient-registrations', clinicalContext.organization.id, clinicalContext.department.id,
      dateRange.from, dateRange.to, status, submittedQuery, pageIndex, pageSize,
    ],
    queryFn: () => api.scheduling.receptionPage({
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      status: status || undefined,
      query: submittedQuery || undefined,
      page: pageIndex,
      size: pageSize,
      scope: 'ORGANIZATION',
    }),
    enabled: Boolean(dateRange.from && dateRange.to),
  })
  const visitTypes = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.visitType],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.visitType),
  })
  const receptionStatuses = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.receptionStatus],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.receptionStatus),
  })

  useEffect(() => {
    setCancelling(null)
    setCancellationResult(null)
    setPageIndex(0)
  }, [clinicalContext.organization.id, clinicalContext.department.id])

  const statusText = (value: ReceptionQueueItem['status']) => {
    const resolved = systemEnumItemName(receptionStatuses.data ? [receptionStatuses.data] : undefined,
      SCHEDULING_SYSTEM_ENUM.receptionStatus, value)
    return resolved === value ? fallbackStatusNames[value] : resolved
  }
  const visitTypeText = (value: ReceptionQueueItem['visitType']) => systemEnumItemName(
    visitTypes.data ? [visitTypes.data] : undefined, SCHEDULING_SYSTEM_ENUM.visitType, value)
  const statusOptions = [
    { value: '', label: '全部状态' },
    ...queueStatuses.map((value) => ({ value, label: statusText(value) })),
  ]
  const registrationItems = registrations.data?.content ?? []
  const totalElements = registrations.data?.totalElements ?? 0
  const totalPages = registrations.data?.totalPages ?? 0

  const cancelRegistration = useMutation({
    mutationFn: ({ item, reason }: { item: ReceptionQueueItem; reason: string }) =>
      api.encounters.cancel(item.encounterId, {
        commandCode: `REG-CANCEL-${item.encounterId}`,
        reason, terminalCode: 'REGISTRATION-WINDOW-WEB',
      }),
    onSuccess: async (value) => {
      setCancellationResult(value)
      setCancelling(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['outpatient-registrations'] }),
        queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      ])
    },
  })

  function handleDateRangeChange(range: DateRange) {
    setDateRange(range)
    setPageIndex(0)
  }

  function handleStatusChange(value: ReceptionQueueItem['status'] | '') {
    setStatus(value)
    setPageIndex(0)
  }

  function search(event: FormEvent) {
    event.preventDefault()
    setSubmittedQuery(query.trim())
    setPageIndex(0)
  }

  const pageError = registrations.error || visitTypes.error || receptionStatuses.error || cancelRegistration.error
  const waiting = registrationItems.filter((item) => item.status === 'WAITING').length
  const active = registrationItems.filter((item) => ['CALLED', 'SERVING', 'SUSPENDED'].includes(item.status)).length
  const completed = registrationItems.filter((item) => item.status === 'COMPLETED').length
  const cancelled = registrationItems.filter((item) => item.status === 'CANCELLED').length
  const dateRangeLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} 至 ${dateRange.to}`

  return <>
    <PageHeader eyebrow="门诊医疗 · 挂号业务" title="挂号查询"
      description="按日期范围查询当前科室的挂号记录，查看候诊进度，并办理未接诊退号。"
      actions={<><Button onClick={() => onNavigate('/outpatient/registration')}><Icon name="add" />办理挂号</Button>
        <Button variant="secondary" onClick={() => void registrations.refetch()}>
          <Icon name="refresh" />刷新</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {cancellationResult && <Alert className="ui-page-feedback"
      tone={cancellationResult.completed ? 'success' : 'info'}>{cancellationResult.message}
      {cancellationResult.refundStatus ? `（退款状态：${cancellationResult.refundStatus}）` : ''}</Alert>}

    <Panel className="registration-query-filter-panel">
      <form className="registration-query-filter-form" onSubmit={search}>
        <FormField label="挂号日期范围">
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        </FormField>
        <FormField label="接诊状态"><Select value={status} options={statusOptions} placeholder="全部状态"
          searchable={false} clearable={false}
          onChange={(value) => handleStatusChange(value as ReceptionQueueItem['status'] | '')} /></FormField>
        <FormField label="挂号记录关键词"><input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="姓名、档案号、挂号单、候诊号、科室或挂号员" /></FormField>
        <Button type="submit" variant="secondary" busy={registrations.isFetching}>
          <Icon name="search" />查询</Button>
      </form>
    </Panel>

    <Panel className="registration-query-list-panel">
      <PanelHead title="挂号记录" meta={`共 ${totalElements} 条 · ${clinicalContext.department.name}`} />
      {registrations.isPending ? <LoadingState label="正在加载挂号记录…" /> : totalElements === 0
        ? <EmptyState icon="clinical" title={!submittedQuery && !status ? `${dateRangeLabel} 暂无挂号` : '没有匹配的挂号记录'}
          copy={!submittedQuery && !status ? '可前往门诊挂号办理新的挂号。' : '请调整状态或关键词后重新查询。'}
          action={!submittedQuery && !status
            ? <Button onClick={() => onNavigate('/outpatient/registration')}>办理挂号</Button> : undefined} />
        : <><div className="registration-query-list-scroll"><div className="registration-today-list">
          <div className="registration-today-list__head">
            <span>候诊号</span>
            <span>居民</span>
            <span>挂号单与渠道</span>
            <span>就诊科室与服务</span>
            <span>接诊医生与时段</span>
            <span>挂号时间</span>
            <span>挂号员</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {registrationItems.map((item) => {
            const sourceLabel = item.registrationSource ? (REGISTRATION_SOURCE_LABELS[item.registrationSource] || item.registrationSource) : '窗口挂号'
            const deptName = item.departmentName || clinicalContext.department.name
            const doctorName = item.practitionerName || '临时接诊'
            const dayPart = item.sdDayPartText || '日间门诊'
            const regDate = formatRegistrationDate(item.registeredAt)
            const regTime = formatRegistrationTime(item.registeredAt)
            const operatorName = item.registeredByName || '系统登记'

            return <article key={item.registrationId}>
              <strong className="registration-ticket">{item.ticketNo}</strong>
              <div>
                <strong>{item.residentName}</strong>
                <small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small>
              </div>
              <div>
                <strong>{item.registrationNo}</strong>
                <small>{sourceLabel} · {visitTypeText(item.visitType)}</small>
              </div>
              <div>
                <strong>{deptName}</strong>
                <small>{item.serviceName || visitTypeText(item.visitType)}{item.locationName ? ` · ${item.locationName}` : ''}</small>
              </div>
              <div>
                <strong>{doctorName}</strong>
                <small>{dayPart}</small>
              </div>
              <div>
                <strong>{regDate}</strong>
                <small>{regTime}</small>
              </div>
              <div>
                <strong>{operatorName}</strong>
                <small>{item.registeredByName ? '经办登记' : '自动办理'}</small>
              </div>
              <div className="registration-status-cell">
                <StatusBadge tone={queueTone(item.status)}>{statusText(item.status)}</StatusBadge>
                {item.registrationStatus === 'CANCELLED' && <span className="registration-cancelled-mark">已退号</span>}
              </div>
              <span className="registration-row-actions">
                {['WAITING', 'CALLED', 'MISSED'].includes(item.status) && item.registrationStatus === 'REGISTERED' && <Button size="sm"
                  variant="text" onClick={() => { setCancellationResult(null); setCancelling(item) }}>退号</Button>}
                <Button size="sm" variant="text"
                  onClick={() => onNavigate(`/outpatient/reception?${new URLSearchParams({
                    residentId: item.residentId, encounterId: item.encounterId,
                  }).toString()}`)}>{['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED'].includes(item.status) ? '查看就诊' : '查看病历'}</Button>
              </span>
            </article>
          })}
        </div></div>
        <Pagination
          left={
            <div className="query-status-summary" aria-label="挂号状态汇总">
              <span className="query-status-summary__item">
                <span>候诊中</span>
                <strong>{waiting}</strong>
              </span>
              <span className="query-status-summary__divider" aria-hidden="true" />
              <span className="query-status-summary__item">
                <span>接诊中 / 暂挂</span>
                <strong>{active}</strong>
              </span>
              <span className="query-status-summary__divider" aria-hidden="true" />
              <span className="query-status-summary__item">
                <span>已诊毕 / 已取消</span>
                <strong>{completed} / {cancelled}</strong>
              </span>
            </div>
          }
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
          label="挂号记录分页"
        />
        </>}
    </Panel>

    {cancelling && <RegistrationCancellationDialog item={cancelling} busy={cancelRegistration.isPending}
      error={cancelRegistration.error} onClose={() => setCancelling(null)}
      onConfirm={(reason) => cancelRegistration.mutate({ item: cancelling, reason })} />}
  </>
}

const cancellationReasons = ['患者主动取消就诊', '重复挂号', '挂错科室或医生', '其他原因'] as const

function RegistrationCancellationDialog({ item, busy, error, onClose, onConfirm }: {
  item: ReceptionQueueItem
  busy: boolean
  error: unknown
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState<(typeof cancellationReasons)[number]>(cancellationReasons[0])
  const [note, setNote] = useState('')
  const value = `${reason}${note.trim() ? `：${note.trim()}` : ''}`
  return <Dialog title="办理退号" eyebrow={`候诊号 ${item.ticketNo} · ${item.residentName}`}
    description="仅限尚未开始接诊的挂号。确认后将关闭候诊资格、返还预约号源；已收挂号费会先原路退款。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button variant="danger" busy={busy} onClick={() => onConfirm(value)}>确认退号</Button></>}>
    <div className="ui-form-grid">
      <FormField label="退号原因" required><select value={reason}
        onChange={(event) => setReason(event.target.value as typeof reason)}>
        {cancellationReasons.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></FormField>
      <FormField label="补充说明"><textarea value={note} maxLength={300}
        onChange={(event) => setNote(event.target.value)} placeholder="可选" /></FormField>
    </div>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
  </Dialog>
}
