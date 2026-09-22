import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import {
  APPOINTMENT_SYSTEM_ENUM,
  type Appointment,
  type AppointmentSource,
  type AppointmentStatus,
} from '../../shared/api/appointmentsApi'
import type { ServiceSchedule } from '../../shared/api/schedulingApi'
import { systemEnumItems } from '../../shared/api/dictionaryApi'
import { age, genderLabel } from '../../shared/format'
import type { Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, Dialog, EmptyState, FormField, FUTURE_QUERY_PRESETS, Icon, LoadingState, PageHeader, Panel, PanelHead,
  PatientIdentitySearch, SearchField, Select,
  StatusBadge, type DateRange,
} from '../../shared/ui'
import { pinyinInitials } from '../../shared/ui/pinyinInitials'
import '../../styles/features/scheduling-registration.css'

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

function isExpertSchedule(item?: ServiceSchedule) {
  if (!item) return false
  const text = (item.serviceName + ' ' + (item.practitionerName ?? '') + ' ' + (item.serviceCode ?? '')).toLowerCase()
  return text.includes('专家') || text.includes('名医') || text.includes('名老中医')
    || text.includes('主任医师') || text.includes('副主任医师')
}

function getClinicTypeBadge(item: ServiceSchedule) {
  const text = (item.serviceName + ' ' + (item.practitionerName ?? '') + ' ' + (item.serviceCode ?? '')).toLowerCase()
  if (text.includes('名老中医') || text.includes('名医')) return { label: '名老中医', tone: 'gold' as const }
  if (text.includes('主任医师') || text.includes('专家')) return { label: '专家门诊', tone: 'expert' as const }
  if (text.includes('副主任医师')) return { label: '副高专家', tone: 'expert' as const }
  return { label: '普通门诊', tone: 'regular' as const }
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
    <div className="appointment-management-page">
      <PageHeader eyebrow="门诊医疗 · 预约业务" title="预约管理"
      description="统一办理提前预约、查询、取消和改约；所有操作复用排班共享号源并保留完整业务轨迹。"
      actions={<><Button variant="secondary" onClick={() => onNavigate('/outpatient/scheduling')}>排班与号源</Button>
        <Button variant="secondary" onClick={() => void refresh()}><Icon name="refresh" />刷新</Button>
        <Button onClick={() => { setSuccess(''); setCreateOpen(true) }}><Icon name="add" />新建预约</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {success && <Alert className="ui-page-feedback" tone="success">{success}</Alert>}

    <section className="registration-metrics appointment-metrics" aria-label="预约摘要">
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
        : <div className="appointment-list-scroll">
          <div className="appointment-list">
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
                {value.serviceDate === businessDate() ? (
                  <Button size="sm" variant="primary"
                    onClick={() => onNavigate(`/outpatient/registration?residentId=${value.residentId}&appointmentId=${value.id}`)}>
                    到院取号
                  </Button>
                ) : (
                  <span className="appointment-future-hint" title="未到就诊日期，就诊当日方可办理取号">
                    当日取号
                  </span>
                )}
                <Button size="sm" variant="text" onClick={() => { setSuccess(''); setRescheduling(value) }}>改约</Button>
                <Button size="sm" variant="text" onClick={() => { setSuccess(''); setCancelling(value) }}>取消</Button>
              </>}</div>
            </article>)}
          </div>
        </div>}
    </Panel>

    </div>

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

function clock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short',
  }).format(new Date(value))
}

interface ShiftGroup {
  key: string
  representative: ServiceSchedule
  schedules: ServiceSchedule[]
  serviceDate: string
  sdDayPart: string
  sdDayPartText: string
  practitionerName?: string
  departmentName?: string
  serviceName: string
  locationName?: string
  feeConfigured: boolean
  registrationFee?: number
  isExpert: boolean
  isTimedMode: boolean
  totalAvailable: number
  startAt: string
  endAt: string
}

function groupSchedulesIntoShifts(schedules: ServiceSchedule[]): ShiftGroup[] {
  const map = new Map<string, ShiftGroup>()
  for (const s of schedules) {
    const key = `${s.serviceDate}_${s.departmentName || s.serviceName}_${s.practitionerId || s.practitionerName || s.serviceCode}_${s.sdDayPart}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        representative: s,
        schedules: [s],
        serviceDate: s.serviceDate,
        sdDayPart: s.sdDayPart,
        sdDayPartText: s.sdDayPartText || (s.sdDayPart === 'MORNING' ? '上午' : s.sdDayPart === 'AFTERNOON' ? '下午' : '全天'),
        practitionerName: s.practitionerName,
        departmentName: s.departmentName,
        serviceName: s.serviceName,
        locationName: s.locationName,
        feeConfigured: s.feeConfigured,
        registrationFee: s.registrationFee,
        isExpert: isExpertSchedule(s),
        isTimedMode: s.sdSlotMode === 'TIMED',
        totalAvailable: s.availableCount,
        startAt: s.startAt,
        endAt: s.endAt,
      })
    } else {
      const g = map.get(key)!
      g.schedules.push(s)
      g.totalAvailable += s.availableCount
      if (s.sdSlotMode === 'TIMED') g.isTimedMode = true
      if (new Date(s.startAt).getTime() < new Date(g.startAt).getTime()) {
        g.startAt = s.startAt
      }
      if (new Date(s.endAt).getTime() > new Date(g.endAt).getTime()) {
        g.endAt = s.endAt
      }
    }
  }

  const result = Array.from(map.values())
  for (const g of result) {
    g.schedules.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }
  return result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
}

function generatePoolTimeSlices(startAt: string, endAt: string): string[] {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const durationMs = end.getTime() - start.getTime()
  if (durationMs <= 45 * 60 * 1000) {
    return [`${clock(startAt)} - ${clock(endAt)}`]
  }
  const slices: string[] = []
  let curr = new Date(start.getTime())
  while (curr.getTime() < end.getTime()) {
    const next = new Date(Math.min(curr.getTime() + 30 * 60 * 1000, end.getTime()))
    slices.push(`${clock(curr.toISOString())} - ${clock(next.toISOString())}`)
    curr = next
  }
  return slices
}

function scheduleOptions(values: Array<{ id: string; startAt: string; practitionerName?: string; serviceName: string; availableCount: number }>) {
  return values.map((value) => ({ value: value.id,
    label: `${dateTime(value.startAt)} · ${value.practitionerName || '普通门诊'} · ${value.serviceName}（余 ${value.availableCount}）` }))
}

function CreateAppointmentDialog({ api, schedules: initialSchedules, sourceOptions, busy, error, onClose, onSubmit }: {
  api: RhnApi
  schedules: ServiceSchedule[]
  sourceOptions: Array<{ value: string; label: string }>
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (input: { residentId: string; scheduleId: string; bookingSource: AppointmentSource; reason?: string }) => void
}) {
  const [resident, setResident] = useState<Resident | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [selectedPoolSlice, setSelectedPoolSlice] = useState<string>('')
  const [source, setSource] = useState<AppointmentSource>('WINDOW')
  const [reason, setReason] = useState('')

  // 自主拉取未来 14 天全部可用排班，避免受限于外层列表的过滤日期
  const futureFrom = useMemo(() => businessDate(0), [])
  const futureTo = useMemo(() => businessDate(14), [])
  const futureSchedules = useQuery({
    queryKey: ['future-appointment-schedules', futureFrom, futureTo],
    queryFn: () => api.scheduling.schedules(futureFrom, futureTo),
  })

  // 合并可用号源
  const allAvailableSchedules = useMemo(() => {
    const raw = futureSchedules.data ?? initialSchedules ?? []
    return raw.filter((value) =>
      value.sdStatus === 'PUBLISHED' && value.availableCount > 0 && new Date(value.startAt).getTime() > Date.now(),
    )
  }, [futureSchedules.data, initialSchedules])

  // 筛选状态
  const [selectedDate, setSelectedDate] = useState<string>('ALL')
  const [selectedDept, setSelectedDept] = useState<string>('ALL')
  const [selectedClinicType, setSelectedClinicType] = useState<'ALL' | 'EXPERT' | 'REGULAR'>('ALL')
  const [selectedDayPart, setSelectedDayPart] = useState<string>('ALL')
  const [keyword, setKeyword] = useState('')

  // 动态提取日期列表
  const dateOptions = useMemo(() => {
    const map = new Map<string, { date: string; label: string; count: number; availableSum: number }>()
    for (const item of allAvailableSchedules) {
      const d = item.serviceDate
      if (!map.has(d)) {
        const dateObj = new Date(item.startAt)
        const isToday = d === businessDate(0)
        const isTomorrow = d === businessDate(1)
        const dateStr = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(dateObj)
        const weekStr = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(dateObj)
        const label = isToday ? `${dateStr} 今天` : isTomorrow ? `${dateStr} 明天` : `${dateStr} ${weekStr}`
        map.set(d, { date: d, label, count: 0, availableSum: 0 })
      }
      const entry = map.get(d)!
      entry.count += 1
      entry.availableSum += item.availableCount
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [allAvailableSchedules])

  // 动态提取科室列表
  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const item of allAvailableSchedules) {
      const name = item.departmentName || item.serviceName
      if (name) set.add(name)
    }
    return Array.from(set)
  }, [allAvailableSchedules])

  // 过滤排班列表
  const filteredSchedules = useMemo(() => {
    return allAvailableSchedules.filter((item) => {
      if (selectedDate !== 'ALL' && item.serviceDate !== selectedDate) return false
      if (selectedDept !== 'ALL' && item.departmentName !== selectedDept && item.serviceName !== selectedDept) return false
      if (selectedClinicType === 'EXPERT' && !isExpertSchedule(item)) return false
      if (selectedClinicType === 'REGULAR' && isExpertSchedule(item)) return false
      if (selectedDayPart !== 'ALL' && item.sdDayPart !== selectedDayPart) return false

      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase()
        const texts = [
          item.serviceName,
          item.practitionerName,
          item.departmentName,
          item.locationName,
          item.serviceCode,
        ].filter(Boolean) as string[]
        const matched = texts.some((t) => t.toLowerCase().includes(q) || pinyinInitials(t).toLowerCase().includes(q))
        if (!matched) return false
      }
      return true
    })
  }, [allAvailableSchedules, selectedDate, selectedDept, selectedClinicType, selectedDayPart, keyword])

  // 聚合出诊班次
  const shiftGroups = useMemo(() => {
    return groupSchedulesIntoShifts(filteredSchedules)
  }, [filteredSchedules])

  // 总可用号源数
  const totalSlotsCount = useMemo(() => {
    return shiftGroups.reduce((acc, g) => acc + g.totalAvailable, 0)
  }, [shiftGroups])

  // 自动/同步选中
  useEffect(() => {
    if (!scheduleId && shiftGroups[0]) {
      const target = shiftGroups[0].schedules.find((s) => s.availableCount > 0) ?? shiftGroups[0].schedules[0]
      if (target) setScheduleId(target.id)
    } else if (scheduleId && !allAvailableSchedules.some((s) => s.id === scheduleId)) {
      const target = shiftGroups[0]?.schedules.find((s) => s.availableCount > 0) ?? shiftGroups[0]?.schedules[0]
      setScheduleId(target?.id ?? '')
    }
  }, [scheduleId, shiftGroups, allAvailableSchedules])

  const selectedSchedule = useMemo(() => {
    return allAvailableSchedules.find((s) => s.id === scheduleId)
  }, [allAvailableSchedules, scheduleId])

  const activeGroup = useMemo(() => {
    return shiftGroups.find((g) => g.schedules.some((s) => s.id === scheduleId)) ?? shiftGroups[0]
  }, [shiftGroups, scheduleId])

  const poolTimeSlices = useMemo(() => {
    if (!activeGroup || activeGroup.isTimedMode) return []
    return generatePoolTimeSlices(activeGroup.startAt, activeGroup.endAt)
  }, [activeGroup])

  return <Dialog title="新建预约" eyebrow="门诊预约 · 号源调度" size="xwide"
    className="appointment-workbench-dialog"
    description="支持按就诊人、未来排班日期、科室与出诊医生快速导诊并锁定号源。" onClose={onClose}
    footer={null}>
    {error && <Alert tone="error">{error}</Alert>}

    {/* 顶部单行通栏（T型横梁）：患者信息确认 */}
    <div className="appointment-intake-strip">
      <div className="appointment-intake-patient">
        <div className="appointment-intake-section-title">
          <strong>1. 就诊患者确认</strong>
          <small>{resident ? '已确认就诊人' : '请检索居民'}</small>
        </div>
        {!resident ? (
          <div className="appointment-intake-search">
            <PatientIdentitySearch queryKey="appointment-create" search={api.residents.search} selected={resident}
              onSelect={setResident} onClear={() => setResident(null)} compact
              emptyTitle="检索就诊居民"
              emptyCopy="输入居民姓名、手机号、身份证或病历号进行检索。" />
          </div>
        ) : (
          <div className="appointment-intake-profile">
            <span className={`resident-avatar ${resident.gender.toLowerCase()}`}>
              {resident.fullName.slice(-1)}
            </span>
            <div className="appointment-intake-identity">
              <strong className="appointment-patient-name">{resident.fullName}</strong>
              <span className="appointment-patient-meta">
                {genderLabel(resident.gender)} · {age(resident.birthDate)} 岁
              </span>
            </div>
            <div className="appointment-intake-meta-pills">
              <div className="appointment-intake-pill">
                <span>档案号</span>
                <strong>{resident.healthRecordNo}</strong>
              </div>
              <div className="appointment-intake-pill">
                <span>提醒手机</span>
                <strong>{resident.phone || '未留电话'}</strong>
              </div>
              {resident.maskedNationalId && (
                <div className="appointment-intake-pill">
                  <span>身份证件</span>
                  <strong>{resident.maskedNationalId}</strong>
                </div>
              )}
            </div>
            <Button size="sm" variant="text" onClick={() => setResident(null)}>
              重新选择
            </Button>
          </div>
        )}
      </div>
    </div>

    {/* 主体工作台：左右协同（T型立柱双栏） */}
    <div className="appointment-create-workbench">
      {/* 左栏：号源选择全流程区域（日期 -> 班次筛选 -> 差异化号源时段） */}
      <section className="appointment-workbench-left">
        {/* 1. 未来排班日历横向胶囊导航 */}
        <div className="appointment-date-strip-wrapper">
          <div className="appointment-date-strip">
            <Button size="sm" variant={selectedDate === 'ALL' ? 'secondary' : 'text'}
              className={`appointment-date-pill ${selectedDate === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setSelectedDate('ALL')}>
              <strong>全部日期</strong>
              <small>共 {allAvailableSchedules.length} 班次</small>
            </Button>
            {dateOptions.map((opt) => (
              <Button key={opt.date} size="sm" variant={selectedDate === opt.date ? 'secondary' : 'text'}
                className={`appointment-date-pill ${selectedDate === opt.date ? 'is-active' : ''}`}
                onClick={() => setSelectedDate(opt.date)}>
                <strong>{opt.label}</strong>
                <small>余 {opt.availableSum} 号</small>
              </Button>
            ))}
          </div>
        </div>

        {/* 2. 多维分类与快捷筛选工具栏 */}
        <div className="appointment-filter-toolbar">
          <div className="appointment-filter-row">
            <div className="appointment-segmented-group">
              <Button size="sm" variant={selectedClinicType === 'ALL' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedClinicType === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setSelectedClinicType('ALL')}>全部号别</Button>
              <Button size="sm" variant={selectedClinicType === 'EXPERT' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedClinicType === 'EXPERT' ? 'is-active' : ''}`}
                onClick={() => setSelectedClinicType('EXPERT')}>专家门诊</Button>
              <Button size="sm" variant={selectedClinicType === 'REGULAR' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedClinicType === 'REGULAR' ? 'is-active' : ''}`}
                onClick={() => setSelectedClinicType('REGULAR')}>普通门诊</Button>
            </div>

            <div className="appointment-segmented-group">
              <Button size="sm" variant={selectedDayPart === 'ALL' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedDayPart === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setSelectedDayPart('ALL')}>全天</Button>
              <Button size="sm" variant={selectedDayPart === 'MORNING' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedDayPart === 'MORNING' ? 'is-active' : ''}`}
                onClick={() => setSelectedDayPart('MORNING')}>上午</Button>
              <Button size="sm" variant={selectedDayPart === 'AFTERNOON' ? 'secondary' : 'text'}
                className={`appointment-segmented-btn ${selectedDayPart === 'AFTERNOON' ? 'is-active' : ''}`}
                onClick={() => setSelectedDayPart('AFTERNOON')}>下午</Button>
            </div>

            <div className="appointment-search-box">
              <SearchField label="科室或医生"
                placeholder="搜索科室/医生/拼音 (如: NK、李医生)"
                value={keyword} onChange={setKeyword} />
            </div>
          </div>

          {departmentOptions.length > 1 && (
            <div className="appointment-dept-chips">
              <Button size="sm" variant={selectedDept === 'ALL' ? 'secondary' : 'text'}
                className={`appointment-dept-chip ${selectedDept === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setSelectedDept('ALL')}>
                全部科室 ({departmentOptions.length})
              </Button>
              {departmentOptions.map((dept) => (
                <Button key={dept} size="sm" variant={selectedDept === dept ? 'secondary' : 'text'}
                  className={`appointment-dept-chip ${selectedDept === dept ? 'is-active' : ''}`}
                  onClick={() => setSelectedDept(dept)}>
                  {dept}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 出诊班次卡片网格 */}
        <div className="appointment-schedule-container">
          <div className="appointment-schedule-header">
            <span>找到 <strong>{shiftGroups.length}</strong> 个出诊班次（共余 {totalSlotsCount} 个号源）</span>
            <small>点击排班班次，下方联动号源时段，右侧实时核验凭单</small>
          </div>

          {futureSchedules.isPending ? (
            <LoadingState label="正在加载未来出诊排班与号源…" />
          ) : shiftGroups.length === 0 ? (
            <EmptyState icon="tasks" title="暂无可预约班次"
              copy="所选日期或科室条件下暂无开放号源，可切换其他日期或重置筛选条件。"
              action={<Button size="sm" variant="secondary" onClick={() => {
                setSelectedDate('ALL'); setSelectedDept('ALL'); setSelectedClinicType('ALL'); setSelectedDayPart('ALL'); setKeyword('')
              }}>重置所有筛选</Button>} />
          ) : (
            <div className="appointment-schedule-grid">
              {shiftGroups.map((group) => {
                const badge = getClinicTypeBadge(group.representative)
                const isGroupSelected = activeGroup?.key === group.key
                const isLow = group.totalAvailable <= 5
                return (
                  <div key={group.key} role="button" tabIndex={0}
                    className={`appointment-schedule-card ${isGroupSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      const target = group.schedules.find((s) => s.availableCount > 0) || group.schedules[0]
                      if (target) {
                        setScheduleId(target.id)
                        setSelectedPoolSlice('')
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        const target = group.schedules.find((s) => s.availableCount > 0) || group.schedules[0]
                        if (target) {
                          setScheduleId(target.id)
                          setSelectedPoolSlice('')
                        }
                      }
                    }}>
                    <div className="appointment-schedule-card__top">
                      <span className="appointment-schedule-card__dept" title={group.departmentName || group.serviceName}>
                        {group.departmentName || group.serviceName}
                      </span>
                      <div className="appointment-schedule-card__top-badges">
                        <span className={`appointment-slot-mode-tag ${group.isTimedMode ? 'is-timed' : 'is-pool'}`}>
                          {group.isTimedMode ? '分时排班' : '号池模式'}
                        </span>
                        <span className={`appointment-clinic-badge tone-${badge.tone}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    <div className="appointment-schedule-card__doctor">
                      <strong className="appointment-schedule-card__doctor-name">
                        {group.practitionerName || '普通门诊'}
                      </strong>
                      {group.locationName && (
                        <span className="appointment-schedule-card__location" title={group.locationName}>
                          {group.locationName}
                        </span>
                      )}
                    </div>

                    <div className="appointment-schedule-card__time">
                      <Icon name="calendar" />
                      <span>{dateTime(group.startAt)} ~ {clock(group.endAt)}</span>
                    </div>

                    <div className="appointment-schedule-card__footer">
                      <span className="appointment-schedule-card__fee">
                        {group.feeConfigured && group.registrationFee != null
                          ? `¥${group.registrationFee.toFixed(2)}`
                          : '免诊查费'}
                      </span>
                      <span className={`appointment-slot-badge ${isLow ? 'is-low' : ''}`}>
                        {isLow ? `仅余 ${group.totalAvailable} 号` : `余 ${group.totalAvailable} 号`}
                      </span>
                    </div>

                    {isGroupSelected && (
                      <span className="appointment-card-checked" aria-label="已选中">
                        <Icon name="check" />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 4. 根据号源排班模式差异化呈现的号源选择看板 */}
        <div className="appointment-slot-panel">
          <div className="appointment-card-title">
            <div className="appointment-slot-title-group">
              <strong>专业分时号源</strong>
              <span className={`appointment-slot-mode-chip ${activeGroup?.isTimedMode ? 'is-timed' : 'is-pool'}`}>
                {activeGroup?.isTimedMode ? '专业分时模式' : '号池共享模式'}
              </span>
            </div>
            {activeGroup && (
              <small className="appointment-slot-sub">
                {activeGroup.practitionerName || activeGroup.serviceName} · 共余 {activeGroup.totalAvailable} 号
              </small>
            )}
          </div>

          {!activeGroup ? (
            <div className="appointment-ticket-placeholder">
              <Icon name="calendar" />
              <span>请在上方选择出诊班次以查看并选择具体号源</span>
            </div>
          ) : activeGroup.isTimedMode ? (
            <div className="appointment-slot-grid-container">
              <div className="appointment-slot-tip">
                <span>点击具体就诊时段锁定号源，精准预约、错峰就诊：</span>
              </div>
              <div className="appointment-slot-grid">
                {activeGroup.schedules.map((slot) => {
                  const isSelected = slot.id === scheduleId
                  const isFull = slot.availableCount <= 0
                  return (
                    <div key={slot.id} role="button" tabIndex={isFull ? -1 : 0}
                      aria-disabled={isFull}
                      className={`appointment-slot-cell ${isSelected ? 'is-selected' : ''} ${isFull ? 'is-full' : ''}`}
                      onClick={() => {
                        if (!isFull) setScheduleId(slot.id)
                      }}
                      onKeyDown={(e) => {
                        if (!isFull && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          setScheduleId(slot.id)
                        }
                      }}>
                      <div className="appointment-slot-cell__time">
                        <Icon name="calendar" />
                        <span>{clock(slot.startAt)} - {clock(slot.endAt)}</span>
                      </div>
                      <div className="appointment-slot-cell__meta">
                        <span className={`appointment-slot-badge ${slot.availableCount <= 3 ? 'is-low' : ''}`}>
                          {isFull ? '约满' : `余 ${slot.availableCount} 号`}
                        </span>
                        {isSelected && (
                          <span className="appointment-slot-cell__check">
                            <Icon name="check" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="appointment-slot-grid-container">
              <div className="appointment-slot-tip">
                <span>该班次采用整段共享号池（余 {activeGroup.totalAvailable} 号）。可按需选择期望到达时段：</span>
              </div>
              <div className="appointment-slot-grid">
                {poolTimeSlices.map((slice) => {
                  const isSelected = selectedPoolSlice === slice
                  return (
                    <div key={slice} role="button" tabIndex={0}
                      className={`appointment-slot-cell ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedPoolSlice(slice)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedPoolSlice(slice)
                        }
                      }}>
                      <div className="appointment-slot-cell__time">
                        <Icon name="calendar" />
                        <span>{slice}</span>
                      </div>
                      <div className="appointment-slot-cell__meta">
                        <span className="appointment-slot-badge">可选时段</span>
                        {isSelected && (
                          <span className="appointment-slot-cell__check">
                            <Icon name="check" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 右栏：结果确认和保存区域（类似挂号与收费工作台 CashierPanel） */}
      <section className="appointment-workbench-right">
        <div className="appointment-confirmation-panel">
          {/* 头部 & 金额 Banner */}
          <div className="appointment-confirmation-head">
            <div className="appointment-card-title">
              <strong>3. 预约核验单预览</strong>
              <span className="appointment-ticket-status">就诊凭单预览</span>
            </div>
            <div className="appointment-confirmation-amount">
              <span className="appointment-confirmation-amount-label">挂号诊查费</span>
              <strong className="appointment-confirmation-amount-value">
                {selectedSchedule
                  ? (selectedSchedule.feeConfigured && selectedSchedule.registrationFee != null
                    ? `¥${selectedSchedule.registrationFee.toFixed(2)}`
                    : '免收诊查费')
                  : '--'}
              </strong>
            </div>
          </div>

          {/* 主体滚动区 */}
          <div className="appointment-confirmation-body">
            {selectedSchedule ? (
              <div className="appointment-ticket-preview">
                <div className="appointment-ticket-row">
                  <span>就诊患者</span>
                  <strong>{resident ? `${resident.fullName} (${genderLabel(resident.gender)} · ${age(resident.birthDate)}岁)` : '尚未选择就诊患者'}</strong>
                </div>
                <div className="appointment-ticket-row">
                  <span>就诊科室</span>
                  <strong>{selectedSchedule.departmentName || selectedSchedule.serviceName}</strong>
                </div>
                <div className="appointment-ticket-row">
                  <span>出诊医生</span>
                  <strong>{selectedSchedule.practitionerName || '普通门诊'}（{getClinicTypeBadge(selectedSchedule).label}）</strong>
                </div>
                <div className="appointment-ticket-row appointment-ticket-row--highlight">
                  <span>就诊时段</span>
                  <strong className="appointment-ticket-time-highlight">
                    {shortDate(selectedSchedule.startAt)} {activeGroup?.isTimedMode ? `${clock(selectedSchedule.startAt)} - ${clock(selectedSchedule.endAt)} (精准号源)` : selectedPoolSlice ? `${selectedPoolSlice} (意向时段)` : `${selectedSchedule.sdDayPartText} (${clock(selectedSchedule.startAt)}-${clock(selectedSchedule.endAt)})`}
                  </strong>
                </div>
                <div className="appointment-ticket-row">
                  <span>诊室地点</span>
                  <strong>{selectedSchedule.locationName || '门诊诊室'}</strong>
                </div>
                <div className="appointment-ticket-row">
                  <span>预约渠道</span>
                  <strong>{sourceOptions.find((o) => o.value === source)?.label || source}</strong>
                </div>
              </div>
            ) : (
              <div className="appointment-ticket-placeholder">
                <Icon name="tasks" />
                <span>请在左侧选择出诊排班与号源，系统将实时生成预约核验凭单</span>
              </div>
            )}

            {/* 预约设置表单 */}
            <div className="appointment-confirmation-settings">
              <div className="appointment-card-title">
                <strong>2. 预约设置</strong>
              </div>
              <div className="appointment-settings-form">
                <div className="appointment-settings-field">
                  <label className="appointment-intake-label">预约来源 *</label>
                  <Select value={source} options={sourceOptions}
                    onChange={(val) => setSource(val as AppointmentSource)} searchable={false} clearable={false} />
                </div>
                <div className="appointment-settings-field">
                  <label className="appointment-intake-label">就诊诉求说明</label>
                  <input type="text" className="appointment-reason-input" value={reason} maxLength={500}
                    placeholder="如复诊配药、携带既往报告等（选填）"
                    onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
            </div>

            {/* 就诊须知 */}
            <div className="appointment-ticket-notice">
              <Icon name="sparkles" />
              <span>就诊当日请持医保码/身份证到门诊窗口或自助机办理取号，过号需重新排队。</span>
            </div>
          </div>

          {/* 底部确认与保存操作区 */}
          <div className="appointment-confirmation-footer">
            <Button variant="primary" size="lg" className="appointment-confirm-btn" busy={busy}
              disabled={!resident || !selectedSchedule}
              onClick={() => {
                if (resident && selectedSchedule) {
                  const finalReason = [
                    !activeGroup?.isTimedMode && selectedPoolSlice ? `[建议就诊时段: ${selectedPoolSlice}]` : '',
                    reason.trim(),
                  ].filter(Boolean).join(' ')
                  onSubmit({
                    residentId: resident.id,
                    scheduleId: selectedSchedule.id,
                    bookingSource: source,
                    reason: finalReason || undefined,
                  })
                }
              }}>
              {selectedSchedule ? '确认预约' : '请先选择出诊班次'}
            </Button>
            <Button variant="secondary" size="md" className="appointment-cancel-btn" onClick={onClose}>
              取消
            </Button>
          </div>
        </div>
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
