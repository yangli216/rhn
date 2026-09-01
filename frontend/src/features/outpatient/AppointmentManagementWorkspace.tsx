import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import {
  APPOINTMENT_SYSTEM_ENUM,
  type Appointment,
  type AppointmentSource,
  type AppointmentStatus,
} from '../../shared/api/appointmentsApi'
import { systemEnumItems } from '../../shared/api/dictionaryApi'
import { age, genderLabel } from '../../shared/format'
import type { Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, Dialog, EmptyState, FormField, FUTURE_QUERY_PRESETS, Icon, LoadingState, PageHeader, Panel, PanelHead,
  PatientIdentitySearch, Select,
  StatusBadge, type DateRange,
} from '../../shared/ui'

function businessDate(days = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + days * 86_400_000))
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function statusTone(status: AppointmentStatus) {
  if (status === 'BOOKED') return 'info' as const
  if (status === 'REGISTERED') return 'warning' as const
  if (status === 'VISITED') return 'success' as const
  return 'neutral' as const
}

export function AppointmentManagementWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: businessDate(),
    to: businessDate(30),
  }))
  const [status, setStatus] = useState<AppointmentStatus | ''>('')
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelling, setCancelling] = useState<Appointment | null>(null)
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null)
  const [success, setSuccess] = useState('')

  const appointments = useQuery({
    queryKey: ['appointments', clinicalContext.department.id, dateRange.from, dateRange.to, status, submittedQuery],
    queryFn: () => api.appointments.list({ dateFrom: dateRange.from, dateTo: dateRange.to, status, query: submittedQuery }),
  })
  const schedules = useQuery({
    queryKey: ['appointment-schedules', clinicalContext.department.id, dateRange.from, dateRange.to],
    queryFn: () => api.scheduling.schedules(dateRange.from, dateRange.to),
  })
  const statuses = useQuery({
    queryKey: ['system-enum', APPOINTMENT_SYSTEM_ENUM.status],
    queryFn: () => api.dictionaries.systemEnum(APPOINTMENT_SYSTEM_ENUM.status),
  })
  const sources = useQuery({
    queryKey: ['system-enum', APPOINTMENT_SYSTEM_ENUM.source],
    queryFn: () => api.dictionaries.systemEnum(APPOINTMENT_SYSTEM_ENUM.source),
  })

  const refresh = async () => {
    await Promise.all([appointments.refetch(), schedules.refetch()])
  }
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['appointment-schedules'] }),
      queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
    ])
  }
  const createAppointment = useMutation({
    mutationFn: (input: { residentId: string; scheduleId: string; bookingSource: AppointmentSource; reason?: string }) =>
      api.appointments.create({ ...input, idempotencyCode: `APPT-BOOK-${crypto.randomUUID()}` }),
    onSuccess: async (value) => {
      setCreateOpen(false)
      setSuccess(`预约成功：${value.appointmentNo}，${value.residentName} · ${dateTime(value.startAt)}`)
      await invalidate()
    },
  })
  const cancelAppointment = useMutation({
    mutationFn: ({ value, reason }: { value: Appointment; reason: string }) => api.appointments.cancel(
      value.id, `APPT-CANCEL-${crypto.randomUUID()}`, reason,
    ),
    onSuccess: async (value) => {
      setCancelling(null)
      setSuccess(`已取消预约 ${value.appointmentNo}，号源已返还`)
      await invalidate()
    },
  })
  const rescheduleAppointment = useMutation({
    mutationFn: ({ value, targetScheduleId, reason }: {
      value: Appointment; targetScheduleId: string; reason: string
    }) => api.appointments.reschedule(
      value.id, targetScheduleId, `APPT-MOVE-${crypto.randomUUID()}`, reason,
    ),
    onSuccess: async (value) => {
      setRescheduling(null)
      setSuccess(`改约成功：新预约号 ${value.appointmentNo} · ${dateTime(value.startAt)}`)
      await invalidate()
    },
  })

  useEffect(() => {
    setCreateOpen(false)
    setCancelling(null)
    setRescheduling(null)
    setSuccess('')
  }, [clinicalContext.department.id])

  const values = appointments.data ?? []
  const bookableSchedules = useMemo(() => (schedules.data ?? []).filter((value) =>
    value.sdStatus === 'PUBLISHED' && value.availableCount > 0 && new Date(value.startAt).getTime() > Date.now(),
  ), [schedules.data])
  const statusOptions = [{ value: '', label: '全部状态' }, ...systemEnumItems(
    statuses.data ? [statuses.data] : undefined, APPOINTMENT_SYSTEM_ENUM.status,
  ).map((value) => ({ value: value.code, label: value.name }))]
  const sourceOptions = systemEnumItems(
    sources.data ? [sources.data] : undefined, APPOINTMENT_SYSTEM_ENUM.source,
  ).filter((value) => ['WINDOW', 'PHONE', 'INTERNAL'].includes(value.code))
    .map((value) => ({ value: value.code, label: value.name }))
  const pageError = appointments.error || schedules.error || statuses.error || sources.error
    || createAppointment.error || cancelAppointment.error || rescheduleAppointment.error

  function search(event: FormEvent) {
    event.preventDefault()
    setSubmittedQuery(query)
  }

  const dateRangeLabel = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} 至 ${dateRange.to}`

  return <>
    <PageHeader eyebrow="门诊医疗 · 预约业务" title="预约管理"
      description="统一办理提前预约、查询、取消和改约；所有操作复用排班共享号源并保留完整业务轨迹。"
      actions={<><Button variant="secondary" onClick={() => onNavigate('/outpatient/scheduling')}>排班与号源</Button>
        <Button variant="secondary" onClick={() => void refresh()}><Icon name="refresh" />刷新</Button>
        <Button onClick={() => { setSuccess(''); setCreateOpen(true) }}><Icon name="add" />新建预约</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {success && <Alert className="ui-page-feedback" tone="success">{success}</Alert>}

    <section className="registration-metrics" aria-label="预约摘要">
      <div><span>查询结果</span><strong>{values.length}</strong><small>{dateRangeLabel}</small></div>
      <div><span>待就诊</span><strong>{values.filter((value) => value.sdStatus === 'BOOKED').length}</strong><small>已确认并占用号源</small></div>
      <div><span>已挂号 / 已就诊</span><strong>{values.filter((value) => value.sdStatus === 'REGISTERED').length} / {values.filter((value) => value.sdStatus === 'VISITED').length}</strong><small>预约后续进度</small></div>
      <div><span>可预约班次</span><strong>{bookableSchedules.length}</strong><small>当前日期范围</small></div>
    </section>

    <Panel className="appointment-filter-panel">
      <form className="appointment-filter-form" onSubmit={search}>
        <FormField label="预约日期范围">
          <DateRangePicker value={dateRange} onChange={setDateRange} presets={FUTURE_QUERY_PRESETS} />
        </FormField>
        <FormField label="预约状态"><Select value={status} options={statusOptions}
          onChange={(value) => setStatus(value as AppointmentStatus | '')} searchable={false} clearable={false} /></FormField>
        <FormField label="居民或预约号"><input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="姓名、档案号、预约号" /></FormField>
        <Button type="submit" variant="secondary" busy={appointments.isFetching}><Icon name="search" />查询</Button>
      </form>
    </Panel>

    <Panel className="appointment-list-panel">
      <PanelHead title="预约记录" meta={`${values.length} 条`} />
      {appointments.isPending ? <LoadingState label="正在加载预约记录…" /> : values.length === 0
        ? <EmptyState icon="tasks" title="当前条件下暂无预约" copy="可以新建预约，或调整日期和状态条件后查询。"
          action={<Button onClick={() => setCreateOpen(true)}>新建预约</Button>} />
        : <div className="appointment-list">
          <div className="appointment-list__head"><span>预约信息</span><span>居民</span><span>预约班次</span>
            <span>服务与医生</span><span>来源</span><span>状态</span><span>操作</span></div>
          {values.map((value) => <article key={value.id}>
            <div><strong>{value.appointmentNo}</strong><small>{dateTime(value.confirmedAt)} 创建</small></div>
            <div><strong>{value.residentName}</strong><small>{genderLabel(value.gender)} · {age(value.birthDate)} 岁 · {value.healthRecordNo}</small></div>
            <div><strong>{dateTime(value.startAt)}</strong><small>{value.sdDayPartText}{value.locationName ? ` · ${value.locationName}` : ''}</small></div>
            <div><strong>{value.practitionerName}</strong><small>{value.serviceName}</small></div>
            <span>{value.sdBookingSourceText}</span>
            <StatusBadge tone={statusTone(value.sdStatus)}>{value.sdStatusText}</StatusBadge>
            <div className="appointment-row-actions">{value.sdStatus === 'BOOKED' && <>
              {value.serviceDate === businessDate() && <Button size="sm" variant="text"
                onClick={() => onNavigate(`/outpatient/registration?residentId=${value.residentId}&appointmentId=${value.id}`)}>挂号</Button>}
              <Button size="sm" variant="text" onClick={() => { setSuccess(''); setRescheduling(value) }}>改约</Button>
              <Button size="sm" variant="text" onClick={() => { setSuccess(''); setCancelling(value) }}>取消</Button>
            </>}</div>
          </article>)}
        </div>}
    </Panel>

    {createOpen && <CreateAppointmentDialog api={api} schedules={bookableSchedules}
      sourceOptions={sourceOptions} busy={createAppointment.isPending}
      error={createAppointment.error ? errorMessage(createAppointment.error) : ''}
      onClose={() => setCreateOpen(false)} onSubmit={(input) => createAppointment.mutate(input)} />}
    {cancelling && <AppointmentReasonDialog title="取消预约" eyebrow="预约业务 · 号源返还"
      description={`${cancelling.residentName} · ${dateTime(cancelling.startAt)}。确认后立即返还该号源。`}
      actionLabel="确认取消" danger busy={cancelAppointment.isPending}
      onClose={() => setCancelling(null)} onConfirm={(reason) => cancelAppointment.mutate({ value: cancelling, reason })} />}
    {rescheduling && <RescheduleDialog value={rescheduling}
      schedules={bookableSchedules.filter((item) => item.id !== rescheduling.scheduleId)}
      busy={rescheduleAppointment.isPending} onClose={() => setRescheduling(null)}
      onConfirm={(targetScheduleId, reason) => rescheduleAppointment.mutate({
        value: rescheduling, targetScheduleId, reason,
      })} />}
  </>
}

function scheduleOptions(values: Array<{ id: string; startAt: string; practitionerName: string; serviceName: string; availableCount: number }>) {
  return values.map((value) => ({ value: value.id,
    label: `${dateTime(value.startAt)} · ${value.practitionerName} · ${value.serviceName}（余 ${value.availableCount}）` }))
}

function CreateAppointmentDialog({ api, schedules, sourceOptions, busy, error, onClose, onSubmit }: {
  api: RhnApi
  schedules: Parameters<typeof scheduleOptions>[0]
  sourceOptions: Array<{ value: string; label: string }>
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (input: { residentId: string; scheduleId: string; bookingSource: AppointmentSource; reason?: string }) => void
}) {
  const [resident, setResident] = useState<Resident | null>(null)
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? '')
  const [source, setSource] = useState<AppointmentSource>('WINDOW')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!scheduleId && schedules[0]) setScheduleId(schedules[0].id)
  }, [scheduleId, schedules])

  return <Dialog title="新建预约" eyebrow="预约管理" size="wide"
    description="先确认居民，再选择未来可用班次。保存成功后号源立即生效。" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!resident || !scheduleId} onClick={() => resident && onSubmit({
        residentId: resident.id, scheduleId, bookingSource: source, reason: reason.trim() || undefined,
      })}>确认预约</Button></>}>
    {error && <Alert>{error}</Alert>}
    <div className="appointment-create-grid">
      <section className="appointment-resident-picker">
        <strong>选择居民</strong>
        <PatientIdentitySearch queryKey="appointment-create" search={api.residents.search} selected={resident}
          onSelect={setResident} onClear={() => setResident(null)} compact
          emptyCopy="确认患者后，再选择未来可用班次。" />
      </section>
      <section className="appointment-booking-form">
        <strong>预约信息</strong>
        {resident && <div className="appointment-selected-resident"><span>已选择</span>
          <strong>{resident.fullName}</strong><small>{resident.healthRecordNo}</small></div>}
        <FormField label="预约班次" required><Select value={scheduleId} options={scheduleOptions(schedules)}
          onChange={setScheduleId} placeholder="请选择未来可用班次" showValue /></FormField>
        <FormField label="预约来源" required><Select value={source} options={sourceOptions}
          onChange={(value) => setSource(value as AppointmentSource)} searchable={false} clearable={false} /></FormField>
        <FormField label="预约说明"><textarea value={reason} maxLength={500}
          onChange={(event) => setReason(event.target.value)} placeholder="可填写预约诉求或备注" /></FormField>
      </section>
    </div>
  </Dialog>
}

function AppointmentReasonDialog({ title, eyebrow, description, actionLabel, danger = false, busy, onClose, onConfirm }: {
  title: string; eyebrow: string; description: string; actionLabel: string; danger?: boolean; busy: boolean
  onClose: () => void; onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return <Dialog title={title} eyebrow={eyebrow} description={description} onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>返回</Button>
      <Button variant={danger ? 'danger' : 'primary'} busy={busy} disabled={!reason.trim()}
        onClick={() => onConfirm(reason.trim())}>{actionLabel}</Button></>}>
    <FormField label="操作原因" required><textarea value={reason} maxLength={500}
      onChange={(event) => setReason(event.target.value)} /></FormField>
  </Dialog>
}

function RescheduleDialog({ value, schedules, busy, onClose, onConfirm }: {
  value: Appointment
  schedules: Parameters<typeof scheduleOptions>[0]
  busy: boolean
  onClose: () => void
  onConfirm: (scheduleId: string, reason: string) => void
}) {
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? '')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!scheduleId && schedules[0]) setScheduleId(schedules[0].id)
  }, [scheduleId, schedules])
  return <Dialog title="改约" eyebrow="预约业务 · 原子换号"
    description={`${value.residentName} · 原预约 ${dateTime(value.startAt)}。目标号源占用成功后才会释放原号源。`}
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>返回</Button>
      <Button busy={busy} disabled={!scheduleId || !reason.trim()}
        onClick={() => onConfirm(scheduleId, reason.trim())}>确认改约</Button></>}>
    {schedules.length === 0 ? <Alert tone="info">当前日期范围内没有其他可用班次，请调整列表日期后再试。</Alert> : <>
      <FormField label="目标班次" required><Select value={scheduleId} options={scheduleOptions(schedules)}
        onChange={setScheduleId} showValue /></FormField>
      <FormField label="改约原因" required><textarea value={reason} maxLength={500}
        onChange={(event) => setReason(event.target.value)} /></FormField>
    </>}
  </Dialog>
}
