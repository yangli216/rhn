import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type {
  ProfessionalScheduleExceptionInput, ProfessionalSlotMode, ScheduleDayPart, ScheduleExceptionType,
  ScheduleRegistrationScope, ServiceSchedule, UpdateScheduleInput,
} from '../../shared/api/schedulingApi'
import type { CatalogPrice, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'

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

export function SchedulingWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate?: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const initialized = useRef(false)
  const today = useMemo(() => dateInput(new Date()), [])
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(plusDays(today, 27))
  const [practitionerId, setPractitionerId] = useState('')
  const [registrationScope, setRegistrationScope] = useState<ScheduleRegistrationScope>('DEPARTMENT')
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
  const [workspaceMode, setWorkspaceMode] = useState<'SIMPLE' | 'PROFESSIONAL'>('SIMPLE')
  const [editing, setEditing] = useState<ServiceSchedule | null>(null)
  const [statusChange, setStatusChange] = useState<{
    schedule: ServiceSchedule; action: 'SUSPEND' | 'RESUME' | 'CANCEL'
  } | null>(null)

  const bootstrap = useQuery({ queryKey: ['scheduling-bootstrap', clinicalContext.department.id], queryFn: api.scheduling.bootstrap })
  const services = useQuery({
    queryKey: ['scheduling-services', clinicalContext.organization.id],
    queryFn: async () => (await api.masterData.services(
      '', '', 'ACTIVE', clinicalContext.organization.id)).filter((item) =>
      item.orderable && item.sdUsageType === 'OUTPATIENT'
      && item.serviceSubtype === 'OUTPATIENT_VISIT'
      && item.accountingCategory === 'REGISTRATION'
      && item.organizationAdoption?.sdStatus === 'ACTIVE'
      && item.organizationAdoption.orderable && item.organizationAdoption.executable),
  })
  const schedules = useQuery({
    queryKey: ['service-schedules', clinicalContext.department.id, dateFrom, dateTo],
    queryFn: () => api.scheduling.schedules(dateFrom, dateTo), enabled: Boolean(dateFrom && dateTo),
  })

  useEffect(() => {
    initialized.current = false
    setPractitionerId('')
    setRegistrationScope('DEPARTMENT')
    setCatalogItemId('')
    setWorkspaceMode('SIMPLE')
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
    setWorkspaceMode(bootstrap.data.sdManagementMode)
  }, [bootstrap.data, today])

  useEffect(() => {
    if (!catalogItemId && services.data?.length) setCatalogItemId(services.data[0].id)
    if (catalogItemId && services.data && !services.data.some((item) => item.id === catalogItemId)) {
      setCatalogItemId(services.data[0]?.id ?? '')
    }
  }, [catalogItemId, services.data])

  const createSchedules = useMutation({
    mutationFn: () => api.scheduling.quickCreate({
      registrationScope, practitionerId: registrationScope === 'PRACTITIONER' ? practitionerId : undefined,
      catalogItemId, dateFrom, dateTo, weekdays, dayParts,
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
  const canSubmit = (registrationScope === 'DEPARTMENT' || practitionerId) && catalogItemId && dateFrom && dateTo && weekdays.length > 0
    && dayParts.length > 0 && Number(capacity) > 0

  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())
  }

  function toggleDayPart(value: ScheduleDayPart) {
    setDayParts((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  return <>
    <PageHeader eyebrow="门诊医疗 · 基层排班" title="排班与号源"
      description={workspaceMode === 'PROFESSIONAL'
        ? '按模板维护精细时段与例外日期，支持整段号源和分时号源。'
        : '选择科室号或医生号、日期和上午/下午即可批量生成排班，所有渠道默认共享一个号源池。'}
      actions={<>
        <div className="scheduling-mode-switch" role="tablist" aria-label="排班模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'SIMPLE'}
            className={`scheduling-mode-btn ${workspaceMode === 'SIMPLE' ? 'is-active' : ''}`}
            onClick={() => setWorkspaceMode('SIMPLE')}
          >
            简易排班
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'PROFESSIONAL'}
            className={`scheduling-mode-btn ${workspaceMode === 'PROFESSIONAL' ? 'is-active' : ''}`}
            disabled={bootstrap.data?.sdManagementMode !== 'PROFESSIONAL'}
            title={bootstrap.data?.sdManagementMode !== 'PROFESSIONAL' ? '科室尚未启用专业排班（可在参数管理中开启）' : undefined}
            onClick={() => {
              if (bootstrap.data?.sdManagementMode === 'PROFESSIONAL') {
                setWorkspaceMode('PROFESSIONAL')
              }
            }}
          >
            专业模式{bootstrap.data?.sdManagementMode !== 'PROFESSIONAL' ? '（未启用）' : ''}
          </button>
        </div>
        <Button variant="secondary" onClick={() => void schedules.refetch()}><Icon name="refresh" />刷新排班</Button>
      </>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}

    {(bootstrap.isPending || services.isPending) && <Panel><LoadingState label="正在准备快速排班…" /></Panel>}
    {!bootstrap.isPending && !services.isPending && workspaceMode === 'SIMPLE' && <Panel className="quick-schedule-panel">
      <header className="quick-schedule-panel__head"><div><span className="ui-eyebrow">快速排班</span>
        <h2>一次设置，批量生成</h2><p>可按科室开放普通号，也可为指定医生开放专家号或专病号。</p></div>
        <StatusBadge tone="success">共享号源</StatusBadge></header>
      <div className="quick-schedule-form">
        <FormField label="挂号对象" required><Select value={registrationScope}
          onChange={(value) => setRegistrationScope(value as ScheduleRegistrationScope)} options={[
            { value: 'DEPARTMENT', label: '按科室挂号', secondaryText: '到科后分诊给医生' },
            { value: 'PRACTITIONER', label: '按医生挂号', secondaryText: '锁定指定出诊医生' },
          ]} /></FormField>
        {registrationScope === 'PRACTITIONER' && <FormField label="出诊医生" required><Select value={practitionerId} onChange={setPractitionerId}
          placeholder="请选择医生" options={(bootstrap.data?.practitioners ?? []).map((item) => ({
            value: item.id, label: item.name, code: item.code,
          }))} /></FormField>}
        <FormField label="门诊服务" required><Select value={catalogItemId} onChange={setCatalogItemId}
          placeholder="请选择门诊服务" options={(services.data ?? []).map((item) => ({
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
      <footer className="quick-schedule-actions"><span>{registrationScope === 'PRACTITIONER'
        ? '系统会自动避开同一医生时间重叠的排班。' : '科室号在接诊前不绑定医生，适合普通门诊和分诊场景。'}</span>
        <Button busy={createSchedules.isPending} busyLabel="正在生成" disabled={!canSubmit}
          onClick={() => { setSuccess(''); createSchedules.mutate() }}>生成排班</Button></footer>
    </Panel>}

    {!bootstrap.isPending && !services.isPending && workspaceMode === 'PROFESSIONAL' &&
      bootstrap.data?.sdManagementMode === 'PROFESSIONAL' && <ProfessionalSchedulingPanel api={api}
        clinicalContext={clinicalContext} today={today} defaultGenerateDays={bootstrap.data.defaultGenerateDays}
        practitioners={bootstrap.data.practitioners} services={(services.data ?? []).map((item) => ({
          id: item.id, code: item.code, name: item.name,
        }))} onCreated={(message) => setSuccess(message)} />}

    {!services.isPending && <RegistrationFeePanel api={api} clinicalContext={clinicalContext}
      services={services.data ?? []} today={today} />}

    <Panel className="schedule-list-panel">
      <header className="schedule-list-panel__head"><div><span className="ui-eyebrow">排班列表</span><h2>当前号源</h2>
        <p>{dateFrom} 至 {dateTo}</p></div><strong>{schedules.data?.length ?? 0}<small>个排班</small></strong></header>
      {schedules.isPending ? <LoadingState label="正在加载排班…" /> : !schedules.data?.length
        ? <EmptyState icon="clinical" title="当前日期范围暂无排班" copy="使用上方快速排班，几步即可建立日常门诊号源。" />
        : <div className="schedule-list-scroll"><div className="schedule-list"><div className="schedule-list__head"><span>日期时段</span><span>挂号对象与服务</span>
          <span>地点</span><span>号源</span><span>状态</span><span>操作</span></div>{schedules.data.map((item) => <article key={item.id}>
          <div><strong>{dateLabel(item.serviceDate)} · {item.sdDayPartText}</strong>
            <small>{shortTime(item.startAt)}–{shortTime(item.endAt)}</small></div>
          <div><strong>{item.sdRegistrationScope === 'DEPARTMENT' ? clinicalContext.department.name : item.practitionerName}</strong>
            <small>{item.serviceName} · {item.sdRegistrationScopeText}</small></div>
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
        </article>)}</div></div>}
    </Panel>
    {editing && <ScheduleEditDialog schedule={editing} busy={updateSchedule.isPending}
      onClose={() => setEditing(null)} onSave={(input) => updateSchedule.mutate({ scheduleId: editing.id, input })} />}
    {statusChange && <ScheduleStatusDialog value={statusChange} busy={changeScheduleStatus.isPending}
      onClose={() => setStatusChange(null)} onConfirm={(reason) => changeScheduleStatus.mutate({
        scheduleId: statusChange.schedule.id, action: statusChange.action, reason,
      })} />}
  </>
}

function effectiveSalePrice(service: ServiceCatalogItem, organizationId: string, businessDate: string) {
  return [...(service.prices ?? [])].filter((price) => price.sdPriceType === 'SALE' && price.sdStatus === 'ACTIVE'
    && !price.packageId && (!price.organizationId || price.organizationId === organizationId)
    && price.validFrom <= businessDate && (!price.validTo || price.validTo >= businessDate))
    .sort((left, right) => Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId))
      || right.validFrom.localeCompare(left.validFrom))[0]
}

function feeText(service: ServiceCatalogItem, price?: CatalogPrice) {
  if (!service.chargeable) return '免收'
  if (!price) return '未定价'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: price.currencyCode }).format(price.price)
}

function RegistrationFeePanel({ api, clinicalContext, services, today }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  services: ServiceCatalogItem[]
  today: string
}) {
  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null)
  const missing = services.filter((item) => item.chargeable
    && !effectiveSalePrice(item, clinicalContext.organization.id, today)).length
  return <>
    <Panel className="registration-fee-maintenance-panel">
      <header className="registration-fee-maintenance-panel__head"><div><span className="ui-eyebrow">挂号费维护</span>
        <h2>门诊诊查项目与机构价格</h2><p>价格按项目和机构分版本生效；普通、专家、急诊、中医或基层一般诊疗费应分别建目录项目。</p></div>
        <StatusBadge tone={missing ? 'warning' : 'success'}>{missing ? `${missing} 项未定价` : '价格完整'}</StatusBadge></header>
      <div className="registration-fee-list-scroll"><div className="registration-fee-list">
        <div className="registration-fee-list__head"><span>收费项目</span><span>当前机构价格</span><span>有效期</span><span>政策依据</span><span>操作</span></div>
        {services.map((service) => {
          const price = effectiveSalePrice(service, clinicalContext.organization.id, today)
          return <article key={service.id}>
            <div><strong>{service.name}</strong><small>{service.code}</small></div>
            <strong className={!price && service.chargeable ? 'is-missing' : ''}>{feeText(service, price)}</strong>
            <span>{price ? `${price.validFrom} 起${price.validTo ? ` 至 ${price.validTo}` : ''}` : '—'}</span>
            <span>{price?.priceDocumentCode || (service.chargeable ? '未登记' : '不适用')}</span>
            {service.chargeable ? <Button size="sm" variant="text" onClick={() => setEditing(service)}>
              {price ? '调价' : '设置价格'}</Button> : <span>无需维护</span>}
          </article>
        })}
      </div></div>
      <footer className="registration-fee-maintenance-panel__note">基层机构启用“一般诊疗费”时，请停用同场景的门诊诊查费，避免重复收费；医保支付和减免由结算规则处理，不写入挂号价。</footer>
    </Panel>
    {editing && <RegistrationFeeDialog api={api} clinicalContext={clinicalContext} service={editing}
      today={today} onClose={() => setEditing(null)} />}
  </>
}

function RegistrationFeeDialog({ api, clinicalContext, service, today, onClose }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  service: ServiceCatalogItem
  today: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const effective = effectiveSalePrice(service, clinicalContext.organization.id, today)
  const organizationPrice = effective?.organizationId === clinicalContext.organization.id ? effective : undefined
  const earliest = organizationPrice && organizationPrice.validFrom >= today
    ? plusDays(organizationPrice.validFrom, 1) : today
  const [price, setPrice] = useState(String(effective?.price ?? ''))
  const [validFrom, setValidFrom] = useState(earliest)
  const [priceDocumentCode, setPriceDocumentCode] = useState(effective?.priceDocumentCode ?? '')
  const [reason, setReason] = useState(effective ? '按最新医疗服务价格政策调整' : '首次配置机构挂号收费标准')
  const save = useMutation({
    mutationFn: () => {
      const input = {
        organizationId: clinicalContext.organization.id, priceType: 'SALE', price: Number(price),
        currencyCode: effective?.currencyCode ?? 'CNY', priceDocumentCode: priceDocumentCode.trim() || undefined,
        priceReason: reason.trim(), validFrom, status: 'ACTIVE' as const,
      }
      return organizationPrice
        ? api.masterData.replaceLifecyclePrice(organizationPrice.id, organizationPrice.revision, input)
        : api.masterData.createLifecyclePrice(service.id, input)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scheduling-services', clinicalContext.organization.id] }),
        queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] }),
        queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
      ])
      onClose()
    },
  })
  const valid = price !== '' && Number(price) >= 0 && validFrom >= earliest && reason.trim()
  return <Dialog title={effective ? '调整挂号费' : '设置挂号费'} eyebrow={`${service.name} · ${service.code}`}
    description={organizationPrice ? `当前机构价 ${feeText(service, organizationPrice)}，新版本将从所选日期生效。`
      : effective ? `当前使用全局价 ${feeText(service, effective)}，本次将建立机构专属价格。`
        : '设置后，排班选号、挂号核价和收费结算将使用同一有效价格。'}
    onClose={onClose} closeOnBackdrop={false} footer={<>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={save.isPending} disabled={!valid} onClick={() => save.mutate()}>保存价格版本</Button>
    </>}>
    {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    <div className="registration-fee-edit-form">
      <FormField label="收费金额（元/次）" required><input type="number" min="0" step="0.01" value={price}
        onChange={(event) => setPrice(event.target.value)} /></FormField>
      <FormField label="生效日期" required><input type="date" min={earliest} value={validFrom}
        onChange={(event) => setValidFrom(event.target.value)} /></FormField>
      <FormField label="政策文件/价格文号"><input value={priceDocumentCode} maxLength={128}
        placeholder="例如：某医保价采〔2026〕xx号" onChange={(event) => setPriceDocumentCode(event.target.value)} /></FormField>
      <FormField label="定价或调价原因" required><input value={reason} maxLength={1000}
        onChange={(event) => setReason(event.target.value)} /></FormField>
    </div>
    <Alert tone="info">这里维护的是医疗服务项目价格。医保基金支付、个人自付、优待减免和退费规则应由结算模块按患者待遇实时计算。</Alert>
  </Dialog>
}

interface ProfessionalExceptionDraft {
  key: string
  exceptionDate: string
  exceptionType: ScheduleExceptionType
  startTime: string
  endTime: string
  capacity: string
  slotMinutes: string
  reason: string
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function ProfessionalSchedulingPanel({ api, clinicalContext, today, defaultGenerateDays, practitioners, services, onCreated }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  today: string
  defaultGenerateDays: number
  practitioners: Array<{ id: string; code: string; name: string; assignmentId: string }>
  services: Array<{ id: string; code: string; name: string }>
  onCreated: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [templateName, setTemplateName] = useState('基层门诊分时排班')
  const [registrationScope, setRegistrationScope] = useState<ScheduleRegistrationScope>('PRACTITIONER')
  const [practitionerId, setPractitionerId] = useState(practitioners[0]?.id ?? '')
  const [catalogItemId, setCatalogItemId] = useState(services[0]?.id ?? '')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(plusDays(today, defaultGenerateDays - 1))
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('12:00')
  const [slotMode, setSlotMode] = useState<ProfessionalSlotMode>('TIMED')
  const [slotMinutes, setSlotMinutes] = useState('30')
  const [capacity, setCapacity] = useState('1')
  const [locationName, setLocationName] = useState('全科门诊')
  const [exceptions, setExceptions] = useState<ProfessionalExceptionDraft[]>([])

  useEffect(() => {
    if (!practitioners.some((item) => item.id === practitionerId)) setPractitionerId(practitioners[0]?.id ?? '')
    if (!services.some((item) => item.id === catalogItemId)) setCatalogItemId(services[0]?.id ?? '')
  }, [catalogItemId, practitionerId, practitioners, services])

  const templates = useQuery({
    queryKey: ['professional-schedule-templates', clinicalContext.department.id],
    queryFn: api.scheduling.professionalTemplates,
  })
  const createTemplate = useMutation({
    mutationFn: () => api.scheduling.createProfessionalTemplate({
      templateName: templateName.trim(), registrationScope,
      practitionerId: registrationScope === 'PRACTITIONER' ? practitionerId : undefined,
      catalogItemId, dateFrom, dateTo, weekdays,
      startTime, endTime, capacity: Number(capacity), slotMode,
      slotMinutes: slotMode === 'TIMED' ? Number(slotMinutes) : undefined,
      locationName: locationName.trim() || undefined,
      exceptions: exceptions.map<ProfessionalScheduleExceptionInput>((item) => ({
        exceptionDate: item.exceptionDate, exceptionType: item.exceptionType,
        startTime: item.exceptionType === 'OVERRIDE' ? item.startTime : undefined,
        endTime: item.exceptionType === 'OVERRIDE' ? item.endTime : undefined,
        capacity: item.exceptionType === 'OVERRIDE' ? Number(item.capacity) : undefined,
        slotMinutes: item.exceptionType === 'OVERRIDE' && slotMode === 'TIMED' ? Number(item.slotMinutes) : undefined,
        reason: item.reason.trim(),
      })),
      idempotencyCode: crypto.randomUUID(),
    }),
    onSuccess: async (result) => {
      onCreated(`专业模板“${result.template.templateName}”已保存，生成 ${result.generatedCount} 个班次${result.skippedCount ? `，跳过 ${result.skippedCount} 个冲突时段` : ''}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['professional-schedule-templates', clinicalContext.department.id] }),
        queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] }),
      ])
    },
  })

  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())
  }

  function addException() {
    setExceptions((current) => [...current, {
      key: crypto.randomUUID(), exceptionDate: dateFrom, exceptionType: 'CLOSED', startTime, endTime,
      capacity, slotMinutes, reason: '临时停诊',
    }])
  }

  function updateException(key: string, patch: Partial<ProfessionalExceptionDraft>) {
    setExceptions((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  const duration = startTime && endTime ? timeMinutes(endTime) - timeMinutes(startTime) : 0
  const slotSize = Number(slotMinutes)
  const exceptionDates = exceptions.map((item) => item.exceptionDate)
  const exceptionsValid = exceptions.every((item) => item.exceptionDate >= dateFrom && item.exceptionDate <= dateTo
    && item.reason.trim() && (item.exceptionType === 'CLOSED' || (item.startTime < item.endTime
      && Number(item.capacity) > 0 && (slotMode === 'POOL' || (Number(item.slotMinutes) >= 5
        && (timeMinutes(item.endTime) - timeMinutes(item.startTime)) % Number(item.slotMinutes) === 0)))))
    && new Set(exceptionDates).size === exceptionDates.length
  const valid = templateName.trim() && (registrationScope === 'DEPARTMENT' || practitionerId)
    && catalogItemId && dateFrom >= today && dateTo >= dateFrom
    && weekdays.length > 0 && startTime < endTime && Number(capacity) > 0 && exceptionsValid
    && (slotMode === 'POOL' || (slotSize >= 5 && duration > 0 && duration % slotSize === 0))

  return <>
    {(templates.error || createTemplate.error) && <Alert>{errorMessage(templates.error || createTemplate.error)}</Alert>}
    <Panel className="professional-schedule-panel">
      <header className="professional-schedule-panel__head"><div><span className="ui-eyebrow">专业排班</span>
        <h2>建立规则模板并生成班次</h2><p>先定义固定出诊规则；停诊或临时调整只作为日期例外维护。</p></div>
        <StatusBadge tone="success">科室已启用</StatusBadge></header>
      <div className="professional-schedule-form">
        <FormField label="模板名称" required><input value={templateName} maxLength={200}
          onChange={(event) => setTemplateName(event.target.value)} /></FormField>
        <FormField label="挂号对象" required><Select value={registrationScope}
          onChange={(value) => setRegistrationScope(value as ScheduleRegistrationScope)} options={[
            { value: 'DEPARTMENT', label: '按科室挂号', secondaryText: '接诊时分配医生' },
            { value: 'PRACTITIONER', label: '按医生挂号', secondaryText: '预约即锁定医生' },
          ]} /></FormField>
        {registrationScope === 'PRACTITIONER' && <FormField label="出诊医生" required><Select value={practitionerId} onChange={setPractitionerId}
          placeholder="请选择医生" options={practitioners.map((item) => ({ value: item.id, label: item.name, code: item.code }))} /></FormField>}
        <FormField label="门诊服务" required><Select value={catalogItemId} onChange={setCatalogItemId}
          placeholder="请选择门诊服务" options={services.map((item) => ({ value: item.id, label: item.name, code: item.code }))} /></FormField>
        <FormField label="诊室/地点"><input value={locationName} maxLength={200}
          onChange={(event) => setLocationName(event.target.value)} /></FormField>
        <FormField label="开始日期" required><input type="date" min={today} value={dateFrom}
          onChange={(event) => { setDateFrom(event.target.value); if (dateTo < event.target.value) setDateTo(event.target.value) }} /></FormField>
        <FormField label="结束日期" required><input type="date" min={dateFrom} value={dateTo}
          onChange={(event) => setDateTo(event.target.value)} /></FormField>
        <FormField label="开始时间" required><input type="time" value={startTime}
          onChange={(event) => setStartTime(event.target.value)} /></FormField>
        <FormField label="结束时间" required><input type="time" value={endTime}
          onChange={(event) => setEndTime(event.target.value)} /></FormField>
        <div className="quick-schedule-field professional-schedule-weekdays"><span>每周出诊日</span><div>
          {weekdayOptions.map((item) => <button type="button" aria-pressed={weekdays.includes(item.value)}
            className={weekdays.includes(item.value) ? 'is-selected' : ''} key={item.value}
            onClick={() => toggleWeekday(item.value)}>{item.label}</button>)}</div></div>
        <FormField label="号源方式" required><Select value={slotMode} onChange={(value) => {
          const next = value as ProfessionalSlotMode
          setSlotMode(next)
          if (next === 'POOL' && capacity === '1') setCapacity('30')
          if (next === 'TIMED' && capacity === '30') setCapacity('1')
        }} options={[{ value: 'TIMED', label: '分时号源' }, { value: 'POOL', label: '时段总量' }]} /></FormField>
        {slotMode === 'TIMED' && <FormField label="每格时长（分钟）" required><input type="number" min="5" max="120"
          value={slotMinutes} onChange={(event) => setSlotMinutes(event.target.value)} /></FormField>}
        <FormField label={slotMode === 'TIMED' ? '每格号源数' : '时段号源总数'} required><input type="number" min="1" max="500"
          value={capacity} onChange={(event) => setCapacity(event.target.value)} /></FormField>
      </div>

      <section className="professional-exceptions"><header><div><h3>日期例外</h3><p>只维护与固定规则不同的日期，可停诊或临时调整出诊时间。</p></div>
        <Button size="sm" variant="secondary" onClick={addException}>新增例外</Button></header>
        {!exceptions.length ? <div className="professional-exceptions__empty">暂无例外，将按固定规则生成全部班次。</div>
          : <div className="professional-exception-list">{exceptions.map((item, index) => <div key={item.key}>
            <FormField label={`例外 ${index + 1} · 日期`} required><input type="date" min={dateFrom} max={dateTo}
              value={item.exceptionDate} onChange={(event) => updateException(item.key, { exceptionDate: event.target.value })} /></FormField>
            <FormField label="处理方式" required><Select value={item.exceptionType} onChange={(value) => {
              const type = value as ScheduleExceptionType
              updateException(item.key, { exceptionType: type, reason: type === 'CLOSED' ? '临时停诊' : '临时调整' })
            }} options={[{ value: 'CLOSED', label: '停诊' }, { value: 'OVERRIDE', label: '调整班次' }]} /></FormField>
            {item.exceptionType === 'OVERRIDE' && <>
              <FormField label="开始时间" required><input type="time" value={item.startTime}
                onChange={(event) => updateException(item.key, { startTime: event.target.value })} /></FormField>
              <FormField label="结束时间" required><input type="time" value={item.endTime}
                onChange={(event) => updateException(item.key, { endTime: event.target.value })} /></FormField>
              <FormField label={slotMode === 'TIMED' ? '每格号源数' : '号源总数'} required><input type="number" min="1" max="500"
                value={item.capacity} onChange={(event) => updateException(item.key, { capacity: event.target.value })} /></FormField>
              {slotMode === 'TIMED' && <FormField label="每格分钟" required><input type="number" min="5" max="120"
                value={item.slotMinutes} onChange={(event) => updateException(item.key, { slotMinutes: event.target.value })} /></FormField>}
            </>}
            <FormField label="原因" required><input value={item.reason} maxLength={500}
              onChange={(event) => updateException(item.key, { reason: event.target.value })} /></FormField>
            <Button size="sm" variant="text" onClick={() => setExceptions((current) => current.filter((entry) => entry.key !== item.key))}>移除</Button>
          </div>)}</div>}
      </section>
      <footer className="quick-schedule-actions"><span>{slotMode === 'TIMED'
        ? `每个出诊日将按 ${slotMinutes || '—'} 分钟拆分，预约可选择具体时间。`
        : '每个出诊日生成一个共享号源池，适合只控制时段总量。'}</span>
        <Button busy={createTemplate.isPending} busyLabel="正在保存" disabled={!valid}
          onClick={() => createTemplate.mutate()}>保存模板并生成班次</Button></footer>
    </Panel>

    <Panel className="professional-template-panel">
      <header className="professional-template-panel__head"><div><span className="ui-eyebrow">已建模板</span><h2>本部门专业排班</h2></div>
        <strong>{templates.data?.length ?? 0}<small>个模板</small></strong></header>
      {templates.isPending ? <LoadingState label="正在加载专业模板…" /> : !templates.data?.length
        ? <EmptyState icon="calendar" title="尚未建立专业模板" copy="保存上方规则后，模板和实际班次会一并生成。" />
        : <div className="professional-template-list-scroll"><div className="professional-template-list">{templates.data.map((item) => <article key={item.id}>
          <div><strong>{item.templateName}</strong><small>{item.templateCode}</small></div>
          <div><strong>{item.serviceName}</strong><small>{item.sdRegistrationScope === 'DEPARTMENT'
            ? `${clinicalContext.department.name} · 到科分诊` : item.practitionerName}</small></div>
          <div><strong>{item.validFrom} 至 {item.validTo}</strong><small>{item.periods.length} 个规则日 · {item.exceptions.length} 个例外</small></div>
          <StatusBadge tone="success">{item.status === 'ACTIVE' ? '生效中' : item.status}</StatusBadge>
        </article>)}</div></div>}
    </Panel>
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
  const registrationOwner = schedule.sdRegistrationScope === 'DEPARTMENT'
    ? schedule.sdRegistrationScopeText : schedule.practitionerName
  return <Dialog title="修改班次" eyebrow={`${dateLabel(schedule.serviceDate)} · ${registrationOwner}`}
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
  const registrationOwner = value.schedule.sdRegistrationScope === 'DEPARTMENT'
    ? value.schedule.sdRegistrationScopeText : value.schedule.practitionerName
  return <Dialog title={label} eyebrow={`${dateLabel(value.schedule.serviceDate)} · ${registrationOwner}`}
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
