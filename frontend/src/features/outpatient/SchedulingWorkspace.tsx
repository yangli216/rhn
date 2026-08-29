import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { ScheduleDayPart, ServiceSchedule, UpdateScheduleInput } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'

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
  const [editing, setEditing] = useState<ServiceSchedule | null>(null)
  const [statusChange, setStatusChange] = useState<{
    schedule: ServiceSchedule; action: 'SUSPEND' | 'RESUME' | 'CANCEL'
  } | null>(null)

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
      setSuccess(`已生成 ${result.generatedCount} 个排班${result.skippedCount ? `，跳过 ${result.skippedCount} 个重复或冲突时段` : ''}`)
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  const updateSchedule = useMutation({
    mutationFn: ({ scheduleId, input }: { scheduleId: string; input: UpdateScheduleInput }) =>
      api.scheduling.update(scheduleId, input),
    onSuccess: async () => {
      setEditing(null)
      setSuccess('班次信息已更新')
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  const changeScheduleStatus = useMutation({
    mutationFn: ({ scheduleId, action, reason }: { scheduleId: string; action: 'SUSPEND' | 'RESUME' | 'CANCEL'; reason: string }) =>
      api.scheduling.changeStatus(scheduleId, { action, reason, commandCode: crypto.randomUUID() }),
    onSuccess: async (value) => {
      setStatusChange(null)
      setSuccess(value.sdStatus === 'PUBLISHED' ? '班次已恢复预约'
        : value.sdStatus === 'SUSPENDED' ? '班次已暂停预约' : '班次已取消')
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  const error = bootstrap.error || services.error || schedules.error || createSchedules.error
    || updateSchedule.error || changeScheduleStatus.error
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
      <footer className="quick-schedule-actions"><span>系统会自动避开同一医生时间重叠的排班。</span>
        <Button busy={createSchedules.isPending} busyLabel="正在生成" disabled={!canSubmit}
          onClick={() => { setSuccess(''); createSchedules.mutate() }}>生成排班</Button></footer>
    </Panel>}

    <Panel className="schedule-list-panel">
      <header className="schedule-list-panel__head"><div><span className="ui-eyebrow">排班列表</span><h2>当前号源</h2>
        <p>{dateFrom} 至 {dateTo}</p></div><strong>{schedules.data?.length ?? 0}<small>个排班</small></strong></header>
      {schedules.isPending ? <LoadingState label="正在加载排班…" /> : !schedules.data?.length
        ? <EmptyState icon="clinical" title="当前日期范围暂无排班" copy="使用上方快速排班，几步即可建立日常门诊号源。" />
        : <div className="schedule-list"><div className="schedule-list__head"><span>日期时段</span><span>医生与服务</span>
          <span>地点</span><span>号源</span><span>状态</span><span>操作</span></div>{schedules.data.map((item) => <article key={item.id}>
          <div><strong>{dateLabel(item.serviceDate)} · {item.sdDayPartText}</strong>
            <small>{shortTime(item.startAt)}–{shortTime(item.endAt)}</small></div>
          <div><strong>{item.practitionerName}</strong><small>{item.serviceName} · {item.serviceCode}</small></div>
          <span>{item.locationName || '未指定'}</span>
          <div className="schedule-capacity"><strong>{item.availableCount}</strong><small>可用 / 共 {item.totalCount}</small></div>
          <StatusBadge tone={scheduleTone(item.sdStatus)}>{item.sdStatusText}</StatusBadge>
          <div className="schedule-row-actions">
            {['PUBLISHED', 'SUSPENDED'].includes(item.sdStatus) && <Button size="sm" variant="text"
              onClick={() => { setSuccess(''); setEditing(item) }}>修改</Button>}
            {item.sdStatus === 'PUBLISHED' && <Button size="sm" variant="text"
              onClick={() => { setSuccess(''); setStatusChange({ schedule: item, action: 'SUSPEND' }) }}>暂停</Button>}
            {item.sdStatus === 'SUSPENDED' && <Button size="sm" variant="text"
              onClick={() => { setSuccess(''); setStatusChange({ schedule: item, action: 'RESUME' }) }}>恢复</Button>}
            {['PUBLISHED', 'SUSPENDED'].includes(item.sdStatus) && <Button size="sm" variant="text"
              onClick={() => { setSuccess(''); setStatusChange({ schedule: item, action: 'CANCEL' }) }}>取消</Button>}
          </div>
        </article>)}</div>}
    </Panel>
    {editing && <ScheduleEditDialog schedule={editing} busy={updateSchedule.isPending}
      onClose={() => setEditing(null)} onSave={(input) => updateSchedule.mutate({ scheduleId: editing.id, input })} />}
    {statusChange && <ScheduleStatusDialog value={statusChange} busy={changeScheduleStatus.isPending}
      onClose={() => setStatusChange(null)} onConfirm={(reason) => changeScheduleStatus.mutate({
        scheduleId: statusChange.schedule.id, action: statusChange.action, reason,
      })} />}
  </>
}

function ScheduleEditDialog({ schedule, busy, onClose, onSave }: {
  schedule: ServiceSchedule
  busy: boolean
  onClose: () => void
  onSave: (input: UpdateScheduleInput) => void
}) {
  const [startTime, setStartTime] = useState(shortTime(schedule.startAt))
  const [endTime, setEndTime] = useState(shortTime(schedule.endAt))
  const [capacity, setCapacity] = useState(String(schedule.totalCount))
  const [locationName, setLocationName] = useState(schedule.locationName ?? '')
  const [reason, setReason] = useState('调整基层门诊班次')
  const used = schedule.heldCount + schedule.occupiedCount + schedule.frozenCount
  const valid = startTime && endTime && endTime > startTime && Number(capacity) >= Math.max(1, used) && reason.trim()
  const timeLocked = schedule.heldCount + schedule.occupiedCount > 0
  return <Dialog title="修改班次" eyebrow={`${dateLabel(schedule.serviceDate)} · ${schedule.practitionerName}`}
    description={timeLocked ? '班次已有暂占或挂号记录，本次只能调整号源上限和诊室。' : '调整将立即影响该班次后续挂号。'}
    onClose={onClose} closeOnBackdrop={false} footer={<>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!valid} onClick={() => onSave({
        startTime, endTime, capacity: Number(capacity), locationName: locationName.trim() || undefined,
        reason: reason.trim(), commandCode: crypto.randomUUID(),
      })}>保存调整</Button>
    </>}>
    <div className="schedule-edit-form">
      <FormField label="开始时间" required><input type="time" value={startTime} disabled={timeLocked}
        onChange={(event) => setStartTime(event.target.value)} /></FormField>
      <FormField label="结束时间" required><input type="time" value={endTime} disabled={timeLocked}
        onChange={(event) => setEndTime(event.target.value)} /></FormField>
      <FormField label="号源上限" required><input type="number" min={Math.max(1, used)} max="500" value={capacity}
        onChange={(event) => setCapacity(event.target.value)} /></FormField>
      <FormField label="诊室/地点"><input value={locationName} maxLength={200}
        onChange={(event) => setLocationName(event.target.value)} /></FormField>
      <FormField label="调整原因" required className="schedule-edit-form__wide"><input value={reason} maxLength={500}
        onChange={(event) => setReason(event.target.value)} /></FormField>
    </div>
  </Dialog>
}

function ScheduleStatusDialog({ value, busy, onClose, onConfirm }: {
  value: { schedule: ServiceSchedule; action: 'SUSPEND' | 'RESUME' | 'CANCEL' }
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState(value.action === 'SUSPEND' ? '临时停诊'
    : value.action === 'RESUME' ? '恢复正常出诊' : '取消本次排班')
  const label = value.action === 'SUSPEND' ? '暂停班次' : value.action === 'RESUME' ? '恢复班次' : '取消班次'
  const hasUsage = value.schedule.heldCount + value.schedule.occupiedCount + value.schedule.frozenCount > 0
  return <Dialog title={label} eyebrow={`${dateLabel(value.schedule.serviceDate)} · ${value.schedule.practitionerName}`}
    description={value.action === 'CANCEL' && hasUsage
      ? '该班次已有暂占、挂号或冻结号源，系统将拒绝直接取消，请先完成影响处理。'
      : '操作原因将记录到排班事件中。'} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>返回</Button>
      <Button variant={value.action === 'CANCEL' ? 'danger' : 'primary'} busy={busy}
        disabled={!reason.trim() || (value.action === 'CANCEL' && hasUsage)}
        onClick={() => onConfirm(reason.trim())}>确认{label}</Button>
    </>}>
    <FormField label="操作原因" required><input value={reason} maxLength={500}
      onChange={(event) => setReason(event.target.value)} /></FormField>
  </Dialog>
}
