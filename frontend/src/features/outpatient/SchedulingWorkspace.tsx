import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { ScheduleDayPart } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'

const weekdayOptions = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
  { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' },
  { value: 7, label: '周日' },
]

function dateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function plusDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return dateInput(date)
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(`${value}T00:00:00`))
}

function scheduleTone(status: string) {
  if (status === 'PUBLISHED') return 'success' as const
  if (status === 'SUSPENDED') return 'warning' as const
  if (status === 'CANCELLED') return 'danger' as const
  return 'neutral' as const
}

export function SchedulingWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const initialized = useRef(false)
  const today = useMemo(() => dateInput(new Date()), [])
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(plusDays(today, 27))
  const [practitionerId, setPractitionerId] = useState('')
  const [catalogItemId, setCatalogItemId] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [dayParts, setDayParts] = useState<ScheduleDayPart[]>(['MORNING', 'AFTERNOON'])
  const [capacity, setCapacity] = useState('50')
  const [locationName, setLocationName] = useState('全科门诊')
  const [morningStart, setMorningStart] = useState('08:00')
  const [morningEnd, setMorningEnd] = useState('12:00')
  const [afternoonStart, setAfternoonStart] = useState('14:00')
  const [afternoonEnd, setAfternoonEnd] = useState('17:00')
  const [success, setSuccess] = useState('')

  const bootstrap = useQuery({ queryKey: ['scheduling-bootstrap', clinicalContext.department.id], queryFn: api.scheduling.bootstrap })
  const services = useQuery({
    queryKey: ['scheduling-services', clinicalContext.organization.id],
    queryFn: () => api.masterData.services('', '', 'ACTIVE', clinicalContext.organization.id),
  })
  const schedules = useQuery({
    queryKey: ['service-schedules', clinicalContext.department.id, dateFrom, dateTo],
    queryFn: () => api.scheduling.schedules(dateFrom, dateTo), enabled: Boolean(dateFrom && dateTo),
  })

  useEffect(() => {
    initialized.current = false
    setPractitionerId('')
    setCatalogItemId('')
  }, [clinicalContext.department.id])

  useEffect(() => {
    if (!bootstrap.data || initialized.current) return
    initialized.current = true
    setCapacity(String(bootstrap.data.defaultCapacity))
    setDateTo(plusDays(today, bootstrap.data.defaultGenerateDays - 1))
    setMorningStart(bootstrap.data.morning.start.slice(0, 5))
    setMorningEnd(bootstrap.data.morning.end.slice(0, 5))
    setAfternoonStart(bootstrap.data.afternoon.start.slice(0, 5))
    setAfternoonEnd(bootstrap.data.afternoon.end.slice(0, 5))
    setPractitionerId(bootstrap.data.practitioners[0]?.id ?? '')
  }, [bootstrap.data, today])

  useEffect(() => {
    if (!catalogItemId && services.data?.length) setCatalogItemId(services.data[0].id)
    if (catalogItemId && services.data && !services.data.some((item) => item.id === catalogItemId)) {
      setCatalogItemId(services.data[0]?.id ?? '')
    }
  }, [catalogItemId, services.data])

  const createSchedules = useMutation({
    mutationFn: () => api.scheduling.quickCreate({
      practitionerId, catalogItemId, dateFrom, dateTo, weekdays, dayParts,
      morningStart, morningEnd, afternoonStart, afternoonEnd, capacity: Number(capacity),
      locationName: locationName.trim() || undefined, idempotencyCode: crypto.randomUUID(),
    }),
    onSuccess: async (result) => {
      setSuccess(`已生成 ${result.generatedCount} 个排班${result.skippedCount ? `，跳过 ${result.skippedCount} 个重复时段` : ''}`)
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  const error = bootstrap.error || services.error || schedules.error || createSchedules.error
  const canSubmit = practitionerId && catalogItemId && dateFrom && dateTo && weekdays.length > 0
    && dayParts.length > 0 && Number(capacity) > 0

  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())
  }

  function toggleDayPart(value: ScheduleDayPart) {
    setDayParts((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  return <>
    <PageHeader eyebrow="门诊医疗 · 基层排班" title="排班与号源"
      description="选择医生、日期和上午/下午即可批量生成排班，所有渠道默认共享一个号源池。"
      actions={<Button variant="secondary" onClick={() => void schedules.refetch()}>刷新排班</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}

    <section className="scheduling-mode-strip" aria-label="排班管理模式">
      <div className={bootstrap.data?.sdManagementMode !== 'PROFESSIONAL' ? 'is-active' : ''}>
        <span>{bootstrap.data?.sdManagementMode !== 'PROFESSIONAL' ? '当前模式' : '日常方式'}</span>
        <strong>简易排班</strong><p>适合基层日常使用，只维护必要信息。</p></div>
      <div className={bootstrap.data?.sdManagementMode === 'PROFESSIONAL' ? 'is-active' : ''}>
        <span>{bootstrap.data?.sdManagementMode === 'PROFESSIONAL' ? '当前模式' : '按需启用'}</span>
        <strong>专业模式</strong><p>用于渠道配额、分时号源和复杂预约规则。</p></div>
      <div className="scheduling-context"><span>当前工作范围</span><strong>{clinicalContext.organization.name}</strong>
        <p>{clinicalContext.department.name} · 参数可按机构或科室覆盖</p></div>
    </section>

    {(bootstrap.isPending || services.isPending) && <Panel><LoadingState label="正在准备快速排班…" /></Panel>}
    {!bootstrap.isPending && !services.isPending && <Panel className="quick-schedule-panel">
      <header className="quick-schedule-panel__head"><div><span className="ui-eyebrow">快速排班</span>
        <h2>一次设置，批量生成</h2><p>默认工作日、上午和下午；一般只需确认医生、项目和号源数。</p></div>
        <StatusBadge tone="success">共享号源</StatusBadge></header>
      <div className="quick-schedule-form">
        <FormField label="出诊医生" required><Select value={practitionerId} onChange={setPractitionerId}
          placeholder="请选择医生" options={(bootstrap.data?.practitioners ?? []).map((item) => ({
            value: item.id, label: item.name, code: item.code,
          }))} /></FormField>
        <FormField label="门诊服务" required><Select value={catalogItemId} onChange={setCatalogItemId}
          placeholder="请选择诊疗项目" options={(services.data ?? []).map((item) => ({
            value: item.id, label: item.name, code: item.code,
          }))} /></FormField>
        <FormField label="诊室/地点"><input value={locationName} onChange={(event) => setLocationName(event.target.value)}
          placeholder="例如：全科门诊一诊室" /></FormField>
        <FormField label="每时段号源数" required><input type="number" min="1" max="500" value={capacity}
          onChange={(event) => setCapacity(event.target.value)} /></FormField>

        <FormField label="开始日期" required><input type="date" min={today} value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)} /></FormField>
        <FormField label="结束日期" required><input type="date" min={dateFrom} value={dateTo}
          onChange={(event) => setDateTo(event.target.value)} /></FormField>
        <div className="quick-schedule-field quick-schedule-field--weekdays"><span>每周出诊日</span>
          <div>{weekdayOptions.map((item) => <button type="button" aria-pressed={weekdays.includes(item.value)}
            className={weekdays.includes(item.value) ? 'is-selected' : ''} key={item.value}
            onClick={() => toggleWeekday(item.value)}>{item.label}</button>)}</div></div>
        <div className="quick-schedule-field quick-schedule-field--sessions"><span>出诊时段</span><div>
          <button type="button" aria-pressed={dayParts.includes('MORNING')}
            className={dayParts.includes('MORNING') ? 'is-selected' : ''} onClick={() => toggleDayPart('MORNING')}>
            <strong>上午</strong><small>{morningStart}–{morningEnd}</small></button>
          <button type="button" aria-pressed={dayParts.includes('AFTERNOON')}
            className={dayParts.includes('AFTERNOON') ? 'is-selected' : ''} onClick={() => toggleDayPart('AFTERNOON')}>
            <strong>下午</strong><small>{afternoonStart}–{afternoonEnd}</small></button>
        </div></div>
      </div>
      <footer className="quick-schedule-actions"><span>系统会自动避开同一医生、项目和时段的重复排班。</span>
        <Button busy={createSchedules.isPending} busyLabel="正在生成" disabled={!canSubmit}
          onClick={() => { setSuccess(''); createSchedules.mutate() }}>生成排班</Button></footer>
    </Panel>}

    <Panel className="schedule-list-panel">
      <header className="schedule-list-panel__head"><div><span className="ui-eyebrow">排班列表</span><h2>当前号源</h2>
        <p>{dateFrom} 至 {dateTo}</p></div><strong>{schedules.data?.length ?? 0}<small>个排班</small></strong></header>
      {schedules.isPending ? <LoadingState label="正在加载排班…" /> : !schedules.data?.length
        ? <EmptyState icon="clinical" title="当前日期范围暂无排班" copy="使用上方快速排班，几步即可建立日常门诊号源。" />
        : <div className="schedule-list"><div className="schedule-list__head"><span>日期时段</span><span>医生与服务</span>
          <span>地点</span><span>号源</span><span>状态</span></div>{schedules.data.map((item) => <article key={item.id}>
          <div><strong>{dateLabel(item.serviceDate)} · {item.sdDayPartText}</strong>
            <small>{shortTime(item.startAt)}–{shortTime(item.endAt)}</small></div>
          <div><strong>{item.practitionerName}</strong><small>{item.serviceName} · {item.serviceCode}</small></div>
          <span>{item.locationName || '未指定'}</span>
          <div className="schedule-capacity"><strong>{item.availableCount}</strong><small>可用 / 共 {item.totalCount}</small></div>
          <StatusBadge tone={scheduleTone(item.sdStatus)}>{item.sdStatusText}</StatusBadge>
        </article>)}</div>}
    </Panel>
  </>
}
