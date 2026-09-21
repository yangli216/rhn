import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type {
  ProfessionalSlotMode, ScheduleDayPart, ScheduleExceptionType,
  ScheduleRegistrationScope, ServiceSchedule, UpdateScheduleInput,
} from '../../shared/api/schedulingApi'
import type { CatalogPrice, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, DateRangePicker, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead, Select, StatusBadge,
  SCHEDULING_DATE_PRESETS,
} from '../../shared/ui'
import '../../styles/features/scheduling-registration.css'

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

function getMonday(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return dateInput(date)
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(`${dateStr}T00:00:00`)
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

function countMatchingDays(fromStr: string, toStr: string, selectedWeekdays: number[]): number {
  if (!fromStr || !toStr || fromStr > toStr || selectedWeekdays.length === 0) return 0
  let count = 0
  const cur = new Date(`${fromStr}T00:00:00`)
  const end = new Date(`${toStr}T00:00:00`)
  let safety = 0
  while (cur <= end && safety < 366) {
    const day = cur.getDay() === 0 ? 7 : cur.getDay()
    if (selectedWeekdays.includes(day)) count++
    cur.setDate(cur.getDate() + 1)
    safety++
  }
  return count
}

function formatWeekRange(mondayStr: string): string {
  const sundayStr = plusDays(mondayStr, 6)
  const m = new Date(`${mondayStr}T00:00:00`)
  const s = new Date(`${sundayStr}T00:00:00`)
  const year = m.getFullYear()
  const weekNum = getWeekNumber(mondayStr)
  const mMonth = m.getMonth() + 1
  const mDay = m.getDate()
  const sMonth = s.getMonth() + 1
  const sDay = s.getDate()
  return `${year}年 第${weekNum}周 (${mMonth}/${mDay} – ${sMonth}/${sDay})`
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

function serviceSelectOption(service: ServiceCatalogItem, organizationId: string, businessDate: string) {
  const price = effectiveSalePrice(service, organizationId, businessDate)
  const priceScope = price?.organizationId ? '机构价' : '全局价'
  const validity = price ? `${price.validFrom} 至 ${price.validTo || '长期'}` : undefined
  const description = !service.chargeable
    ? `${service.code} · 不收费项目`
    : price
      ? `${service.code} · ${priceScope} · 价格效期 ${validity}${price.priceDocumentCode ? ` · ${price.priceDocumentCode}` : ''}`
      : `${service.code} · 当前日期无有效价格，请先在基础数据中维护`
  return {
    value: service.id,
    label: service.name,
    description,
    trailingText: feeText(service, price),
    searchKeywords: [service.code, price?.priceDocumentCode, price?.priceReason].filter((value): value is string => Boolean(value)),
  }
}

export interface SchedulingDepartmentOption {
  organizationId: string
  organizationName: string
  departmentId: string
  departmentName: string
}

interface MatrixResource {
  key: string
  id?: string
  name: string
  subtext: string
  scope: ScheduleRegistrationScope
}

interface QuickCellScheduleTarget {
  resource: MatrixResource
  date: string
  dayPart?: ScheduleDayPart
}

export function SchedulingWorkspace({ api, clinicalContext, departmentOptions, onDepartmentChange }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  departmentOptions?: SchedulingDepartmentOption[]
  onDepartmentChange?: (organizationId: string, departmentId: string) => void
}) {
  const queryClient = useQueryClient()
  const initialized = useRef(false)
  const today = useMemo(() => dateInput(new Date()), [])
  const maxDateTo = useMemo(() => plusDays(today, 365), [today])

  // 当前矩阵查看的周区间锚点（周一至周日）
  const [currentWeekMonday, setCurrentWeekMonday] = useState(() => getMonday(today))
  const currentWeekSunday = useMemo(() => plusDays(currentWeekMonday, 6), [currentWeekMonday])

  // 批量排班弹窗开关及表单状态（遵循规范：页面默认纯净，大表单按需弹窗呈现）
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(plusDays(today, 27))
  const [practitionerId, setPractitionerId] = useState('')
  const [registrationScope, setRegistrationScope] = useState<ScheduleRegistrationScope>('DEPARTMENT')
  const [catalogItemId, setCatalogItemId] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [dayParts, setDayParts] = useState<ScheduleDayPart[]>(['MORNING', 'AFTERNOON'])
  const [capacity, setCapacity] = useState('50')
  const [locationName, setLocationName] = useState(clinicalContext.department.name || '门诊')
  const [morningStart, setMorningStart] = useState('08:00')
  const [morningEnd, setMorningEnd] = useState('12:00')
  const [afternoonStart, setAfternoonStart] = useState('14:00')
  const [afternoonEnd, setAfternoonEnd] = useState('17:00')
  const [success, setSuccess] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'SIMPLE' | 'PROFESSIONAL'>('SIMPLE')

  // 对话框与抽屉状态
  const [cellScheduleTarget, setCellScheduleTarget] = useState<QuickCellScheduleTarget | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<ServiceSchedule | null>(null)
  const [editing, setEditing] = useState<ServiceSchedule | null>(null)
  const [statusChange, setStatusChange] = useState<{
    schedule: ServiceSchedule; action: 'SUSPEND' | 'RESUME' | 'CANCEL'
  } | null>(null)

  const currentDepartmentKey = `${clinicalContext.organization.id}:${clinicalContext.department.id}`
  const [batchDepartmentKey, setBatchDepartmentKey] = useState('')
  const [showAllDepartments, setShowAllDepartments] = useState(false)

  const selectableDepartments = useMemo(() => {
    const configured = departmentOptions?.length ? departmentOptions : [{
      organizationId: clinicalContext.organization.id,
      organizationName: clinicalContext.organization.name,
      departmentId: clinicalContext.department.id,
      departmentName: clinicalContext.department.name,
    }]
    return Array.from(new Map(configured.map((item) => [
      `${item.organizationId}:${item.departmentId}`, item,
    ])).values())
  }, [clinicalContext, departmentOptions])

  const activeBatchDepartment = useMemo(() => {
    const found = selectableDepartments.find((item) =>
      `${item.organizationId}:${item.departmentId}` === (batchDepartmentKey || currentDepartmentKey))
    return found ?? {
      organizationId: clinicalContext.organization.id,
      organizationName: clinicalContext.organization.name,
      departmentId: clinicalContext.department.id,
      departmentName: clinicalContext.department.name,
    }
  }, [selectableDepartments, batchDepartmentKey, currentDepartmentKey, clinicalContext])

  const batchApi = useMemo(() => {
    if (typeof api.withWorkContext === 'function' && (
      activeBatchDepartment.organizationId !== clinicalContext.organization.id ||
      activeBatchDepartment.departmentId !== clinicalContext.department.id
    )) {
      return api.withWorkContext({
        organizationId: activeBatchDepartment.organizationId,
        departmentId: activeBatchDepartment.departmentId,
      })
    }
    return api
  }, [api, activeBatchDepartment, clinicalContext])

  const bootstrap = useQuery({ queryKey: ['scheduling-bootstrap', clinicalContext.department.id], queryFn: api.scheduling.bootstrap })
  const batchBootstrap = useQuery({
    queryKey: ['scheduling-bootstrap', activeBatchDepartment.departmentId],
    queryFn: () => batchApi.scheduling.bootstrap(),
    enabled: showBatchModal,
  })
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

  // 按当前选中的周区间查询排班
  const schedules = useQuery({
    queryKey: ['service-schedules', clinicalContext.department.id, currentWeekMonday, currentWeekSunday],
    queryFn: () => api.scheduling.schedules(currentWeekMonday, currentWeekSunday),
    enabled: Boolean(currentWeekMonday && currentWeekSunday),
  })

  useEffect(() => {
    initialized.current = false
    setPractitionerId('')
    setCatalogItemId('')
    setLocationName(clinicalContext.department.name || '门诊')
    setWorkspaceMode('SIMPLE')
  }, [clinicalContext.department.id, clinicalContext.department.name])

  useEffect(() => {
    if (!bootstrap.data || initialized.current) return
    initialized.current = true
    setCapacity(String(bootstrap.data.defaultCapacity))
    const computedDateTo = plusDays(today, bootstrap.data.defaultGenerateDays - 1)
    setDateTo(computedDateTo > maxDateTo ? maxDateTo : computedDateTo)
    setMorningStart(bootstrap.data.morning.start.slice(0, 5))
    setMorningEnd(bootstrap.data.morning.end.slice(0, 5))
    setAfternoonStart(bootstrap.data.afternoon.start.slice(0, 5))
    setAfternoonEnd(bootstrap.data.afternoon.end.slice(0, 5))
    setPractitionerId(bootstrap.data.practitioners[0]?.id ?? '')
    setWorkspaceMode(bootstrap.data.sdManagementMode)
  }, [bootstrap.data, today, maxDateTo])

  useEffect(() => {
    if (!catalogItemId && services.data?.length) setCatalogItemId(services.data[0].id)
    if (catalogItemId && services.data && !services.data.some((item) => item.id === catalogItemId)) {
      setCatalogItemId(services.data[0]?.id ?? '')
    }
  }, [catalogItemId, services.data])

  useEffect(() => {
    if (!showBatchModal) return
    setLocationName(activeBatchDepartment.departmentName || '门诊')
    setPractitionerId('')
  }, [activeBatchDepartment.departmentId, activeBatchDepartment.departmentName, showBatchModal])

  useEffect(() => {
    if (!showBatchModal || !batchBootstrap.data) return
    if (!practitionerId && batchBootstrap.data.practitioners.length) {
      setPractitionerId(batchBootstrap.data.practitioners[0].id)
    }
  }, [batchBootstrap.data, practitionerId, showBatchModal])

  const createSchedules = useMutation({
    mutationFn: () => batchApi.scheduling.quickCreate({
      registrationScope, practitionerId: registrationScope === 'PRACTITIONER' ? practitionerId : undefined,
      catalogItemId, dateFrom, dateTo, weekdays, dayParts,
      morningStart, morningEnd, afternoonStart, afternoonEnd, capacity: Number(capacity),
      locationName: locationName.trim() || undefined, idempotencyCode: crypto.randomUUID(),
    }),
    onSuccess: async (result) => {
      setSuccess(`已为【${activeBatchDepartment.departmentName}】生成 ${result.generatedCount} 个排班${result.skippedCount ? `，跳过 ${result.skippedCount} 个重复或冲突时段` : ''}`)
      setShowBatchModal(false)
      if (dateFrom) {
        setCurrentWeekMonday(getMonday(dateFrom))
      }
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', activeBatchDepartment.departmentId] })
      if (activeBatchDepartment.departmentId !== clinicalContext.department.id) {
        onDepartmentChange?.(activeBatchDepartment.organizationId, activeBatchDepartment.departmentId)
      }
    },
  })

  const updateSchedule = useMutation({
    mutationFn: ({ scheduleId, input }: { scheduleId: string; input: UpdateScheduleInput }) =>
      api.scheduling.update(scheduleId, input),
    onSuccess: async () => {
      setEditing(null)
      setSelectedSchedule(null)
      setSuccess('班次信息已更新')
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  const changeScheduleStatus = useMutation({
    mutationFn: ({ scheduleId, action, reason }: { scheduleId: string; action: 'SUSPEND' | 'RESUME' | 'CANCEL'; reason: string }) =>
      api.scheduling.changeStatus(scheduleId, { action, reason, commandCode: crypto.randomUUID() }),
    onSuccess: async (value) => {
      setStatusChange(null)
      setSelectedSchedule(null)
      setSuccess(value.sdStatus === 'PUBLISHED' ? '班次已恢复预约'
        : value.sdStatus === 'SUSPENDED' ? '班次已暂停预约' : '班次已取消')
      await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
    },
  })

  // 本周排班指标统计（符合统一的 4 格指标数据结构）
  const weekSummary = useMemo(() => {
    if (!schedules.data?.length) return null
    const total = schedules.data.reduce((sum, item) => sum + item.totalCount, 0)
    const available = schedules.data.reduce((sum, item) => sum + item.availableCount, 0)
    const occupied = schedules.data.reduce((sum, item) => sum + item.occupiedCount, 0)
    const suspended = schedules.data.filter((item) => item.sdStatus === 'SUSPENDED').length
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0
    return { count: schedules.data.length, total, available, occupied, suspended, rate }
  }, [schedules.data])

  // 周矩阵的横轴 7 天
  const weekDays = useMemo(() => {
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const date = plusDays(currentWeekMonday, offset)
      const d = new Date(`${date}T00:00:00`)
      return {
        date,
        dayOfWeek: offset + 1,
        dayName: dayNames[offset],
        monthDay: `${d.getMonth() + 1}/${d.getDate()}`,
        isToday: date === today,
      }
    })
  }, [currentWeekMonday, today])

  // 周矩阵的纵轴资源列表（科室号 + 各出诊医生）
  const resources: MatrixResource[] = useMemo(() => {
    if (showAllDepartments && schedules.data?.length) {
      // 全部科室模式：每个科室一行，聚合该科室下所有排班（科室号 + 医生号）
      const deptMap = new Map<string, string>()
      for (const item of schedules.data) {
        const deptId = item.departmentId || 'unknown'
        const deptName = item.departmentName || '未知科室'
        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, deptName)
        }
      }
      const list: MatrixResource[] = []
      for (const [deptId, deptName] of deptMap) {
        // 统计该科室下的医生人数
        const practitioners = new Set<string>()
        for (const item of schedules.data) {
          if ((item.departmentId || 'unknown') === deptId && item.practitionerId) {
            practitioners.add(item.practitionerId)
          }
        }
        list.push({
          key: `dept-${deptId}`,
          name: deptName,
          subtext: practitioners.size > 0
            ? `科室号 + ${practitioners.size} 位医生出诊`
            : '科室号 · 到科分诊',
          scope: 'DEPARTMENT',
        })
      }
      return list
    }
    const list: MatrixResource[] = [
      {
        key: 'dept',
        name: `${clinicalContext.department.name}`,
        subtext: '科室号 · 到科分诊',
        scope: 'DEPARTMENT',
      },
    ]
    ;(bootstrap.data?.practitioners ?? []).forEach((p) => {
      list.push({
        key: `doc-${p.id}`,
        id: p.id,
        name: p.name,
        subtext: p.code ? `工号 ${p.code}` : '医生号',
        scope: 'PRACTITIONER',
      })
    })
    return list
  }, [clinicalContext.department, bootstrap.data?.practitioners, showAllDepartments, schedules.data])

  // 矩阵单元格索引：key = `${resourceKey}__${serviceDate}`
  const matrixCellMap = useMemo(() => {
    const map = new Map<string, ServiceSchedule[]>()
    ;(schedules.data ?? []).forEach((item) => {
      let resourceKey: string
      if (showAllDepartments) {
        // 全科室模式：所有排班聚合到科室行
        const deptId = item.departmentId || 'unknown'
        resourceKey = `dept-${deptId}`
      } else {
        resourceKey = item.sdRegistrationScope === 'DEPARTMENT'
          ? 'dept'
          : item.practitionerId ? `doc-${item.practitionerId}` : 'dept'
      }
      const cellKey = `${resourceKey}__${item.serviceDate}`
      if (!map.has(cellKey)) map.set(cellKey, [])
      map.get(cellKey)!.push(item)
    })
    return map
  }, [schedules.data, showAllDepartments])

  const error = bootstrap.error || services.error || schedules.error || createSchedules.error
    || updateSchedule.error || changeScheduleStatus.error
    const estimatedDays = useMemo(() => countMatchingDays(dateFrom, dateTo, weekdays), [dateFrom, dateTo, weekdays])
  const estimatedSchedules = estimatedDays * dayParts.length
  const estimatedTotalSlots = estimatedSchedules * (Number(capacity) || 0)
  const canSubmit = (registrationScope === 'DEPARTMENT' || practitionerId) && catalogItemId && dateFrom && dateTo && weekdays.length > 0
    && dateFrom >= today && dateTo >= dateFrom && dateTo <= maxDateTo
    && estimatedDays > 0 && dayParts.length > 0 && Number(capacity) > 0

  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())
  }

  function toggleDayPart(value: ScheduleDayPart) {
    setDayParts((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  return <>
    {/* 1. 严格符合规范的标准 PageHeader */}
    <PageHeader
      eyebrow="门诊医疗 · 基层排班"
      title="排班与号源"
      description="按周矩阵维护科室出诊计划与号源池，点击空白格快速建班，点击卡片管理号源与运维。"
      actions={<>
        <div className="scheduling-mode-switch" role="tablist" aria-label="排班模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'SIMPLE'}
            className={`scheduling-mode-btn ${workspaceMode === 'SIMPLE' ? 'is-active' : ''}`}
            onClick={() => setWorkspaceMode('SIMPLE')}
          >
            周矩阵工作台
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'PROFESSIONAL'}
            className={`scheduling-mode-btn ${workspaceMode === 'PROFESSIONAL' ? 'is-active' : ''}`}
            disabled={bootstrap.data?.sdManagementMode !== 'PROFESSIONAL'}
            title={bootstrap.data?.sdManagementMode === 'PROFESSIONAL' ? '切换至专业分时排班模板' : '科室尚未启用专业排班模式'}
            onClick={() => setWorkspaceMode('PROFESSIONAL')}
          >
            专业模式{bootstrap.data?.sdManagementMode !== 'PROFESSIONAL' ? '（未启用）' : ''}
          </button>
        </div>
        <Button onClick={() => {
          setBatchDepartmentKey(currentDepartmentKey)
          setShowBatchModal(true)
        }}><Icon name="add" />批量排班</Button>
        <Button variant="secondary" onClick={() => void schedules.refetch()}><Icon name="refresh" />刷新</Button>
      </>}
    />

    {error && <Alert>{errorMessage(error)}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}

    {/* 2. 严格符合系统标准规范的 4 格指标摘要 (registration-metrics) */}
    {weekSummary && workspaceMode === 'SIMPLE' && (
      <section className="registration-metrics" aria-label="排班号源摘要">
        <div>
          <span>本周出诊</span>
          <strong>{weekSummary.count}</strong>
          <small>个排班班次</small>
        </div>
        <div>
          <span>总放号量</span>
          <strong>{weekSummary.total}</strong>
          <small>核定号源池</small>
        </div>
        <div>
          <span>可用号源</span>
          <strong style={{ color: 'var(--color-brand-primary)' }}>{weekSummary.available}</strong>
          <small>当前剩余可预约</small>
        </div>
        <div>
          <span>已预约</span>
          <strong>{weekSummary.occupied}</strong>
          <small>饱和率 {weekSummary.rate}%{weekSummary.suspended > 0 ? ` · ${weekSummary.suspended} 班暂停` : ''}</small>
        </div>
      </section>
    )}

    {(bootstrap.isPending || services.isPending) && <Panel><LoadingState label="正在准备排班工作台…" /></Panel>}

    {/* 专业模式面板 */}
    {!bootstrap.isPending && !services.isPending && workspaceMode === 'PROFESSIONAL' &&
      bootstrap.data?.sdManagementMode === 'PROFESSIONAL' && (
        <ProfessionalSchedulingPanel
          api={api}
          clinicalContext={clinicalContext}
          today={today}
          defaultGenerateDays={bootstrap.data.defaultGenerateDays}
          departmentOptions={selectableDepartments}
          onDepartmentChange={onDepartmentChange}
          practitioners={bootstrap.data.practitioners}
          services={services.data ?? []}
          maxDateTo={maxDateTo}
          onCreated={(message) => setSuccess(message)}
        />
      )}

    {/* 3. 核心：标准 Panel + PanelHead 承载高密度紧凑矩阵 */}
    {!bootstrap.isPending && !services.isPending && workspaceMode === 'SIMPLE' && (
      <Panel className="schedule-matrix-panel">
        <PanelHead
          title="周排班矩阵"
          meta={`${showAllDepartments ? '全部科室' : clinicalContext.department.name} · ${formatWeekRange(currentWeekMonday)}`}
          actions={<div className="schedule-panelhead-actions">
            <div className="schedule-dept-select-wrap">
              <Select
                value={showAllDepartments ? '__ALL__' : currentDepartmentKey}
                clearable={false}
                aria-label="当前科室"
                onChange={(value) => {
                  if (value === '__ALL__') {
                    setShowAllDepartments(true)
                  } else {
                    setShowAllDepartments(false)
                    const selected = selectableDepartments.find((item) => `${item.organizationId}:${item.departmentId}` === value)
                    if (selected && value !== currentDepartmentKey) {
                      onDepartmentChange?.(selected.organizationId, selected.departmentId)
                    }
                  }
                }}
                options={[
                  { value: '__ALL__', label: '全部科室', icon: 'organization' as const },
                  ...selectableDepartments.map((item) => ({
                    value: `${item.organizationId}:${item.departmentId}`,
                    label: item.organizationId === clinicalContext.organization.id
                      ? item.departmentName : `${item.organizationName} · ${item.departmentName}`,
                  })),
                ]}
              />
            </div>

            <div className="schedule-week-navigator" role="navigation" aria-label="周排班导航">
              <Button size="sm" variant="secondary" onClick={() => setCurrentWeekMonday(plusDays(currentWeekMonday, -7))}>
                ◀ 上周
              </Button>
              <strong className="schedule-week-label">{currentWeekMonday.slice(5)} ~ {currentWeekSunday.slice(5)}</strong>
              <Button size="sm" variant="secondary" onClick={() => setCurrentWeekMonday(getMonday(today))}>
                本周
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCurrentWeekMonday(plusDays(currentWeekMonday, 7))}>
                下周 ▶
              </Button>
            </div>
          </div>}
        />

        {schedules.isPending ? (
          <LoadingState label="正在加载本周排班矩阵…" />
        ) : (
          <div className="schedule-matrix-scroll">
            <div className="schedule-matrix">
              {/* 矩阵列头 (周一 ~ 周日，紧凑 32px) */}
              <div className="schedule-matrix__header-row">
                <div className="schedule-matrix__resource-header">出诊资源</div>
                {weekDays.map((d) => (
                  <div key={d.date} className={`schedule-matrix__day-header ${d.isToday ? 'is-today' : ''}`}>
                    <span className="schedule-matrix__day-name">{d.dayName}</span>
                    <span className={`schedule-matrix__day-date ${d.isToday ? 'is-today-badge' : ''}`}>
                      {d.monthDay}
                    </span>
                  </div>
                ))}
              </div>

              {/* 矩阵数据行 */}
              {resources.map((res) => {
                const isDeptGroupRow = showAllDepartments && res.scope === 'DEPARTMENT'
                const isSubRow = showAllDepartments && res.scope === 'PRACTITIONER'
                return (
                <div key={res.key} className={`schedule-matrix__row${isDeptGroupRow ? ' is-dept-group-row' : ''}${isSubRow ? ' is-sub-row' : ''}`}>
                  {/* 资源列头 */}
                  <div className="schedule-matrix__resource-cell">
                    <strong>{res.name}</strong>
                    <small>{res.subtext}</small>
                  </div>

                  {/* 7 天单元格 */}
                  {weekDays.map((d) => {
                    const cellKey = `${res.key}__${d.date}`
                    const cellSchedules = matrixCellMap.get(cellKey) ?? []

                    return (
                      <div key={d.date} className={`schedule-matrix__cell ${d.isToday ? 'is-today-cell' : ''}`}>
                        {/* 紧凑专业班次胶囊 */}
                        {cellSchedules.map((item) => {
                          const percent = item.totalCount > 0
                            ? Math.round(((item.totalCount - item.availableCount) / item.totalCount) * 100) : 0
                          const level = item.availableCount === 0 ? 'full' : item.availableCount <= item.totalCount * 0.2 ? 'low' : 'normal'
                          const isSuspended = item.sdStatus === 'SUSPENDED'
                          // 智能去重：如果地点名称包含在服务名称内或完全一致，则不重复展示
                          const showLocation = item.locationName && !item.serviceName.includes(item.locationName) && !item.locationName.includes(item.serviceName)

                          return (
                            <div
                              key={item.id}
                              className={`schedule-chip schedule-chip--${item.sdDayPart.toLowerCase()} ${isSuspended ? 'is-suspended' : ''}`}
                              onClick={() => setSelectedSchedule(item)}
                              title={`${item.serviceName} · ${item.sdDayPartText}${item.locationName ? ` · ${item.locationName}` : ''} · 可用 ${item.availableCount} / 总 ${item.totalCount}`}
                            >
                              <span className={`chip-part-tag chip-part-tag--${item.sdDayPart.toLowerCase()}`}>
                                {item.sdDayPart === 'MORNING' ? '上' : '下'}
                              </span>
                              <span className="chip-service-text">
                                {showAllDepartments && item.practitionerName && (
                                  <span className="chip-doc-tag">{item.practitionerName}</span>
                                )}
                                {item.serviceName}
                                {showLocation && <span className="chip-loc-sub">({item.locationName})</span>}
                              </span>
                              <span className="chip-quota-text">
                                {item.availableCount}/{item.totalCount}
                              </span>
                              {isSuspended && <span className="chip-status-dot chip-status-dot--warning" title="已暂停" />}
                              <div
                                className="chip-bottom-progress"
                                style={{ width: `${percent}%` }}
                                data-level={level}
                              />
                            </div>
                          )
                        })}

                        {/* 单元格微型加号排班入口 */}
                        <div className="schedule-cell-hover-actions">
                          <button
                            type="button"
                            className="cell-mini-add-btn"
                            onClick={() => setCellScheduleTarget({ resource: res, date: d.date })}
                            title={`为 ${res.name} 排 ${d.date} 班次`}
                          >
                            + 排班
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )})}
            </div>
          </div>
        )}
      </Panel>
    )}

    {/* 4. 批量快速排班弹窗 (遵循系统标准 Dialog 规范) */}
    {showBatchModal && (
      <Dialog
        title="批量排班"
        eyebrow={`${activeBatchDepartment.departmentName} · 批量生成`}
        description="按星期与时段批量生成连续日期的排班与号源池，生成后可在周矩阵中直观调整。"
        size="wide"
        onClose={() => setShowBatchModal(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setShowBatchModal(false)}>取消</Button>
          <Button
            busy={createSchedules.isPending}
            busyLabel="正在生成"
            disabled={!canSubmit}
            onClick={() => { setSuccess(''); createSchedules.mutate() }}
          >
            生成排班
          </Button>
        </>}
      >
        <div className="batch-dialog-body">
          {/* 板块一：出诊服务与基本规则 */}
          <div className="batch-dialog-section">
            <h3 className="batch-section-title">出诊信息</h3>
            <div className="batch-grid-row batch-grid-row--3cols">
              <FormField label="挂号对象" required>
                <Select value={registrationScope}
                  onChange={(value) => setRegistrationScope(value as ScheduleRegistrationScope)} options={[
                    { value: 'DEPARTMENT', label: '按科室挂号', secondaryText: '到科后分诊给医生' },
                    { value: 'PRACTITIONER', label: '按医生挂号', secondaryText: '锁定指定出诊医生' },
                  ]} />
              </FormField>

              <FormField label="排班科室" required>
                <Select value={`${activeBatchDepartment.organizationId}:${activeBatchDepartment.departmentId}`} clearable={false}
                  aria-label="排班科室" onChange={(value) => {
                    setBatchDepartmentKey(value)
                  }} options={selectableDepartments.map((item) => ({
                    value: `${item.organizationId}:${item.departmentId}`,
                    label: item.organizationId === clinicalContext.organization.id
                      ? item.departmentName : `${item.organizationName} · ${item.departmentName}`,
                    secondaryText: item.organizationName,
                  }))} />
              </FormField>

              {registrationScope === 'PRACTITIONER' ? (
                <FormField label="出诊医生" required>
                  <Select value={practitionerId} onChange={setPractitionerId}
                    placeholder="请选择医生" options={(batchBootstrap.data?.practitioners ?? []).map((item) => ({
                      value: item.id, label: item.name, code: item.code,
                    }))} />
                </FormField>
              ) : (
                <FormField label="门诊服务" required>
                  <Select value={catalogItemId} onChange={setCatalogItemId}
                    aria-label="门诊服务" placeholder="请选择门诊服务" popoverMinWidth={500}
                    options={(services.data ?? []).map((item) => serviceSelectOption(
                      item, activeBatchDepartment.organizationId, today))} />
                </FormField>
              )}
            </div>

            {registrationScope === 'PRACTITIONER' && (
              <div className="batch-grid-row batch-grid-row--2cols">
                <FormField label="门诊服务" required>
                  <Select value={catalogItemId} onChange={setCatalogItemId}
                    aria-label="门诊服务" placeholder="请选择门诊服务" popoverMinWidth={500}
                    options={(services.data ?? []).map((item) => serviceSelectOption(
                      item, activeBatchDepartment.organizationId, today))} />
                </FormField>
                <FormField label="诊室/地点">
                  <input value={locationName} onChange={(event) => setLocationName(event.target.value)}
                    placeholder="例如：全科门诊一诊室" />
                </FormField>
              </div>
            )}
          </div>

          {/* 板块二：排期周期与号量控制 */}
          <div className="batch-dialog-section">
            <h3 className="batch-section-title">排期周期与放号数量</h3>
            <div className="batch-grid-row batch-grid-row--3cols">
              <FormField label="排班日期" required className="batch-schedule-date-range">
                <DateRangePicker value={{ from: dateFrom, to: dateTo }}
                  onChange={(range) => { setDateFrom(range.from); setDateTo(range.to) }}
                  presets={SCHEDULING_DATE_PRESETS} min={today} max={maxDateTo}
                  startAriaLabel="排班开始日期" endAriaLabel="排班结束日期" />
              </FormField>
              <FormField label="每时段放号数" required hint={Number(capacity) > 200 ? '号源数较大，请确认' : undefined}>
                <input type="number" min="1" max="500" value={capacity}
                  onChange={(event) => setCapacity(event.target.value)} />
              </FormField>
            </div>

            {registrationScope !== 'PRACTITIONER' && (
              <div className="batch-grid-row batch-grid-row--1col">
                <FormField label="诊室/出诊地点">
                  <input value={locationName} onChange={(event) => setLocationName(event.target.value)}
                    placeholder="例如：全科门诊一诊室" />
                </FormField>
              </div>
            )}
          </div>

          {/* 板块三：每周出诊日 (独立整行展开，带快捷组) */}
          <div className="batch-dialog-section">
            <div className="batch-section-head-with-actions">
              <h3 className="batch-section-title">每周出诊日 <span className="batch-required-mark">*</span></h3>
              <div className="batch-weekday-presets">
                <button type="button" className="batch-preset-pill" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>
                  工作日 (周一至五)
                </button>
                <button type="button" className="batch-preset-pill" onClick={() => setWeekdays([1, 2, 3, 4, 5, 6, 7])}>
                  全周 (周一至日)
                </button>
                <button type="button" className="batch-preset-pill" onClick={() => setWeekdays([])}>
                  清空
                </button>
              </div>
            </div>

            <div className="batch-weekday-grid">
              {weekdayOptions.map((item) => {
                const isChecked = weekdays.includes(item.value)
                const isWeekend = item.value === 6 || item.value === 7
                return (
                  <button
                    type="button"
                    key={item.value}
                    aria-pressed={isChecked}
                    className={`batch-weekday-btn ${isChecked ? 'is-selected' : ''} ${isWeekend ? 'is-weekend' : ''}`}
                    onClick={() => toggleWeekday(item.value)}
                  >
                    <span className="batch-weekday-name">{item.label}</span>
                    <span className="batch-weekday-check">{isChecked ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 板块四：出诊时段 (独立两张大卡片平分) */}
          <div className="batch-dialog-section">
            <h3 className="batch-section-title">出诊时段 <span className="batch-required-mark">*</span></h3>
            <div className="batch-sessions-grid">
              <button
                type="button"
                aria-pressed={dayParts.includes('MORNING')}
                className={`batch-session-card ${dayParts.includes('MORNING') ? 'is-selected' : ''}`}
                onClick={() => toggleDayPart('MORNING')}
              >
                <div className="batch-session-card__head">
                  <strong><Icon name="sun" /> 上午门诊</strong>
                  <span className="batch-session-checkbox">{dayParts.includes('MORNING') ? '✓' : ''}</span>
                </div>
                <div className="batch-session-card__time">{morningStart} – {morningEnd}</div>
              </button>

              <button
                type="button"
                aria-pressed={dayParts.includes('AFTERNOON')}
                className={`batch-session-card ${dayParts.includes('AFTERNOON') ? 'is-selected' : ''}`}
                onClick={() => toggleDayPart('AFTERNOON')}
              >
                <div className="batch-session-card__head">
                  <strong><Icon name="moon" /> 下午门诊</strong>
                  <span className="batch-session-checkbox">{dayParts.includes('AFTERNOON') ? '✓' : ''}</span>
                </div>
                <div className="batch-session-card__time">{afternoonStart} – {afternoonEnd}</div>
              </button>
            </div>
          </div>

          {/* 板块五：排班生成预估与提示条 */}
          <div className="batch-estimate-banner">
            <Icon name="calendar" />
            <div className="batch-estimate-text">
              {estimatedDays > 0 && dayParts.length > 0 ? (
                <>
                  在选定日期区间内，符合规则的出诊日共 <strong>{estimatedDays}</strong> 天 ·
                  预计生成 <strong>{estimatedSchedules}</strong> 个班次 ·
                  投放 <strong>{estimatedTotalSlots.toLocaleString()}</strong> 个共享号源
                </>
              ) : (
                <span style={{ color: 'var(--color-warning)' }}>请选择至少一个出诊日与时段</span>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    )}

    {/* 5. 点位情境化快速排班弹窗 (QuickCellScheduleDialog) */}
    {cellScheduleTarget && <QuickCellScheduleDialog
      target={cellScheduleTarget}
      services={services.data ?? []}
      defaultCapacity={capacity}
      defaultLocation={locationName}
      organizationId={clinicalContext.organization.id}
      today={today}
      morningStart={morningStart}
      morningEnd={morningEnd}
      afternoonStart={afternoonStart}
      afternoonEnd={afternoonEnd}
      busy={createSchedules.isPending}
      onClose={() => setCellScheduleTarget(null)}
      onConfirm={async (input) => {
        try {
          await api.scheduling.quickCreate({
            registrationScope: cellScheduleTarget.resource.scope,
            practitionerId: cellScheduleTarget.resource.scope === 'PRACTITIONER' ? cellScheduleTarget.resource.id : undefined,
            catalogItemId: input.catalogItemId,
            dateFrom: cellScheduleTarget.date,
            dateTo: cellScheduleTarget.date,
            weekdays: [new Date(`${cellScheduleTarget.date}T00:00:00`).getDay() || 7],
            dayParts: [input.dayPart],
            morningStart, morningEnd, afternoonStart, afternoonEnd,
            capacity: input.capacity,
            locationName: input.locationName || undefined,
            idempotencyCode: crypto.randomUUID(),
          })
          setCellScheduleTarget(null)
          setSuccess(`已为 ${cellScheduleTarget.resource.name} 生成 ${cellScheduleTarget.date} 排班`)
          await queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] })
        } catch (err) {
          setSuccess('')
        }
      }}
    />}

    {/* 6. 班次与号源详情抽屉 (ScheduleDetailDrawer) */}
    {selectedSchedule && <ScheduleDetailDrawer
      schedule={selectedSchedule}
      onClose={() => setSelectedSchedule(null)}
      onEdit={() => {
        setEditing(selectedSchedule)
        setSelectedSchedule(null)
      }}
      onSuspend={() => {
        setStatusChange({ schedule: selectedSchedule, action: 'SUSPEND' })
        setSelectedSchedule(null)
      }}
      onResume={() => {
        setStatusChange({ schedule: selectedSchedule, action: 'RESUME' })
        setSelectedSchedule(null)
      }}
      onCancel={() => {
        setStatusChange({ schedule: selectedSchedule, action: 'CANCEL' })
        setSelectedSchedule(null)
      }}
    />}

    {/* 修改班次弹窗 */}
    {editing && <ScheduleEditDialog schedule={editing} busy={updateSchedule.isPending}
      onClose={() => setEditing(null)} onSave={(input) => updateSchedule.mutate({ scheduleId: editing.id, input })} />}

    {/* 状态调整弹窗 */}
    {statusChange && <ScheduleStatusDialog value={statusChange} busy={changeScheduleStatus.isPending}
      onClose={() => setStatusChange(null)} onConfirm={(reason) => changeScheduleStatus.mutate({
        scheduleId: statusChange.schedule.id, action: statusChange.action, reason,
      })} />}
  </>
}

/**
 * 单元格极简情境化排班弹窗
 */
function QuickCellScheduleDialog({
  target, services, defaultCapacity, defaultLocation, organizationId, today,
  morningStart, morningEnd, afternoonStart, afternoonEnd, busy, onClose, onConfirm,
}: {
  target: QuickCellScheduleTarget
  services: ServiceCatalogItem[]
  defaultCapacity: string
  defaultLocation: string
  organizationId: string
  today: string
  morningStart: string
  morningEnd: string
  afternoonStart: string
  afternoonEnd: string
  busy: boolean
  onClose: () => void
  onConfirm: (input: { catalogItemId: string; dayPart: ScheduleDayPart; capacity: number; locationName: string }) => void
}) {
  const [dayPart, setDayPart] = useState<ScheduleDayPart>(target.dayPart ?? 'MORNING')
  const [catalogItemId, setCatalogItemId] = useState(services[0]?.id ?? '')
  const [locationName, setLocationName] = useState(defaultLocation)
  const [capacity, setCapacity] = useState(defaultCapacity)

  const isValid = catalogItemId && Number(capacity) > 0

  return <Dialog
    title="点位快速排班"
    eyebrow={`${target.resource.name} · ${dateLabel(target.date)}`}
    description="为选中医生和日期快速指派门诊服务与号源。"
    onClose={onClose}
    closeOnBackdrop={false}
    footer={<>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!isValid} onClick={() => onConfirm({
        catalogItemId, dayPart, capacity: Number(capacity), locationName: locationName.trim(),
      })}>确认排班</Button>
    </>}
  >
    <div className="quick-cell-schedule-form">
      <FormField label="出诊时段" required>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className={`quick-cell-tab ${dayPart === 'MORNING' ? 'is-selected' : ''}`}
            onClick={() => setDayPart('MORNING')}
          >
            上午 ({morningStart}–{morningEnd})
          </button>
          <button
            type="button"
            className={`quick-cell-tab ${dayPart === 'AFTERNOON' ? 'is-selected' : ''}`}
            onClick={() => setDayPart('AFTERNOON')}
          >
            下午 ({afternoonStart}–{afternoonEnd})
          </button>
        </div>
      </FormField>

      <FormField label="门诊服务" required>
        <Select
          value={catalogItemId}
          onChange={setCatalogItemId}
          popoverMinWidth={480}
          options={services.map((item) => serviceSelectOption(item, organizationId, today))}
        />
      </FormField>

      <FormField label="诊室/地点">
        <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="如：全科门诊一诊室" />
      </FormField>

      <FormField label="放号数量" required hint={Number(capacity) > 200 ? '号源数较大' : undefined}>
        <input type="number" min="1" max="500" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </FormField>
    </div>
  </Dialog>
}

/**
 * 班次与号源详情抽屉 (ScheduleDetailDrawer)
 */
function ScheduleDetailDrawer({
  schedule, onClose, onEdit, onSuspend, onResume, onCancel,
}: {
  schedule: ServiceSchedule
  onClose: () => void
  onEdit: () => void
  onSuspend: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const percent = schedule.totalCount > 0
    ? Math.round(((schedule.totalCount - schedule.availableCount) / schedule.totalCount) * 100) : 0
  const registrationOwner = schedule.sdRegistrationScope === 'DEPARTMENT'
    ? schedule.sdRegistrationScopeText : schedule.practitionerName

  return <Dialog
    title="排班班次与号源详情"
    eyebrow={`${dateLabel(schedule.serviceDate)} · ${schedule.sdDayPartText}`}
    description={`班次号: ${schedule.scheduleCode || schedule.id}`}
    onClose={onClose}
    footer={<>
      <Button variant="secondary" onClick={onClose}>关闭</Button>
      {['PUBLISHED', 'SUSPENDED'].includes(schedule.sdStatus) && (
        <Button onClick={onEdit}>修改班次</Button>
      )}
      {schedule.sdStatus === 'PUBLISHED' && (
        <Button variant="secondary" onClick={onSuspend}>暂停预约</Button>
      )}
      {schedule.sdStatus === 'SUSPENDED' && (
        <Button variant="secondary" onClick={onResume}>恢复预约</Button>
      )}
      {['PUBLISHED', 'SUSPENDED'].includes(schedule.sdStatus) && (
        <Button variant="text" className="action-danger" onClick={onCancel}>取消排班</Button>
      )}
    </>}
  >
    <div className="schedule-detail-drawer-content">
      <div className="schedule-detail-grid">
        <div className="schedule-detail-item">
          <span>出诊对象</span>
          <strong>{registrationOwner}</strong>
        </div>
        <div className="schedule-detail-item">
          <span>门诊服务</span>
          <strong>{schedule.serviceName}</strong>
        </div>
        <div className="schedule-detail-item">
          <span>出诊时段</span>
          <strong>{schedule.sdDayPartText} ({shortTime(schedule.startAt)}–{shortTime(schedule.endAt)})</strong>
        </div>
        <div className="schedule-detail-item">
          <span>诊室地点</span>
          <strong>{schedule.locationName || '未指定'}</strong>
        </div>
        <div className="schedule-detail-item">
          <span>当前状态</span>
          <div><StatusBadge tone={scheduleTone(schedule.sdStatus)}>{schedule.sdStatusText}</StatusBadge></div>
        </div>
        <div className="schedule-detail-item">
          <span>挂号费用</span>
          <strong>{schedule.feeConfigured ? `¥${schedule.registrationFee ?? 0}` : '免收'}</strong>
        </div>
      </div>

      <div className="schedule-detail-quota-card">
        <div className="schedule-detail-quota-header">
          <h3>号源使用情况</h3>
          <span className="schedule-detail-quota-rate">预约饱和度 {percent}%</span>
        </div>

        <div className="capacity-bar" style={{ height: 8, borderRadius: 4 }}>
          <div
            className="capacity-bar__fill"
            style={{ width: `${percent}%` }}
            data-level={schedule.availableCount === 0 ? 'full' : schedule.availableCount <= schedule.totalCount * 0.2 ? 'low' : 'normal'}
          />
        </div>

        <div className="schedule-detail-quota-stats">
          <div className="schedule-detail-stat">
            <strong>{schedule.totalCount}</strong>
            <small>总号源数</small>
          </div>
          <div className="schedule-detail-stat schedule-detail-stat--available">
            <strong>{schedule.availableCount}</strong>
            <small>可用号源</small>
          </div>
          <div className="schedule-detail-stat schedule-detail-stat--occupied">
            <strong>{schedule.occupiedCount}</strong>
            <small>已挂号</small>
          </div>
          <div className="schedule-detail-stat">
            <strong>{schedule.heldCount}</strong>
            <small>暂占中</small>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
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
    </>} >
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
        onClick={() => onConfirm(reason.trim())}>确认${label}</Button>
    </>} >
    <FormField label="操作原因" required><input value={reason} maxLength={500}
      onChange={(event) => setReason(event.target.value)} /></FormField>
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

function ProfessionalSchedulingPanel({ api, clinicalContext, today, defaultGenerateDays, departmentOptions,
  onDepartmentChange, practitioners, services, maxDateTo, onCreated }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  today: string
  defaultGenerateDays: number
  departmentOptions: SchedulingDepartmentOption[]
  onDepartmentChange?: (organizationId: string, departmentId: string) => void
  practitioners: Array<{ id: string; code: string; name: string; assignmentId: string }>
  services: ServiceCatalogItem[]
  maxDateTo: string
  onCreated: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const currentDepartmentKey = `${clinicalContext.organization.id}:${clinicalContext.department.id}`
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
  }, [practitionerId, practitioners])

  const templates = useQuery({ queryKey: ['professional-templates', clinicalContext.department.id], queryFn: api.scheduling.professionalTemplates })

  const createTemplate = useMutation({
    mutationFn: () => api.scheduling.createProfessionalTemplate({
      templateName: templateName.trim(), registrationScope,
      practitionerId: registrationScope === 'PRACTITIONER' ? practitionerId : undefined,
      catalogItemId, dateFrom, dateTo, weekdays, startTime, endTime, capacity: Number(capacity),
      slotMode, slotMinutes: slotMode === 'TIMED' ? Number(slotMinutes) : undefined,
      locationName: locationName.trim() || undefined,
      exceptions: exceptions.map((item) => ({
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
      onCreated(`已保存，生成 ${result.generatedCount} 个班次${result.skippedCount ? `，跳过 ${result.skippedCount} 个时段` : ''}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['service-schedules', clinicalContext.department.id] }),
        queryClient.invalidateQueries({ queryKey: ['professional-templates', clinicalContext.department.id] }),
      ])
    },
  })

  const valid = templateName.trim() && (registrationScope === 'DEPARTMENT' || practitionerId) && catalogItemId
    && dateFrom && dateTo && weekdays.length > 0 && startTime && endTime && timeMinutes(endTime) > timeMinutes(startTime)
    && Number(capacity) > 0 && (slotMode === 'POOL' || Number(slotMinutes) > 0)
    && exceptions.every((item) => item.exceptionDate && item.reason.trim()
      && (item.exceptionType === 'CLOSED' || (item.startTime && item.endTime && item.endTime > item.startTime
        && Number(item.capacity) > 0 && (slotMode === 'POOL' || Number(item.slotMinutes) > 0))))

  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort())
  }

  function addException() {
    setExceptions((current) => [...current, {
      key: crypto.randomUUID(), exceptionDate: dateFrom, exceptionType: 'CLOSED',
      startTime, endTime, capacity, slotMinutes, reason: '临时停诊',
    }])
  }

  function updateException(key: string, patch: Partial<ProfessionalExceptionDraft>) {
    setExceptions((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  return <>
    {(templates.error || createTemplate.error) && <Alert>{errorMessage(templates.error || createTemplate.error)}</Alert>}
    <Panel className="professional-schedule-panel">
      <header className="professional-schedule-panel__head"><div><h2>专业排班</h2></div>
        <StatusBadge tone="success">科室已启用</StatusBadge></header>
      <div className="professional-schedule-form">
        <FormField label="模板名称" required><input value={templateName} maxLength={200}
          onChange={(event) => setTemplateName(event.target.value)} /></FormField>
        <FormField label="挂号对象" required><Select value={registrationScope}
          onChange={(value) => setRegistrationScope(value as ScheduleRegistrationScope)} options={[
            { value: 'DEPARTMENT', label: '按科室挂号', secondaryText: '接诊时分配医生' },
            { value: 'PRACTITIONER', label: '按医生挂号', secondaryText: '预约即锁定医生' },
          ]} /></FormField>
        <FormField label="排班科室" required><Select value={currentDepartmentKey} clearable={false}
          aria-label="专业排班科室" onChange={(value) => {
            const selected = departmentOptions.find((item) =>
              `${item.organizationId}:${item.departmentId}` === value)
            if (selected && value !== currentDepartmentKey) {
              onDepartmentChange?.(selected.organizationId, selected.departmentId)
            }
          }} options={departmentOptions.map((item) => ({
            value: `${item.organizationId}:${item.departmentId}`,
            label: item.organizationId === clinicalContext.organization.id
              ? item.departmentName : `${item.organizationName} · ${item.departmentName}`,
            secondaryText: item.organizationName,
          }))} /></FormField>
        {registrationScope === 'PRACTITIONER' && <FormField label="出诊医生" required><Select value={practitionerId} onChange={setPractitionerId}
          placeholder="请选择医生" options={practitioners.map((item) => ({ value: item.id, label: item.name, code: item.code }))} /></FormField>}
        <FormField label="门诊服务" required><Select value={catalogItemId} onChange={setCatalogItemId}
          aria-label="专业门诊服务" placeholder="请选择门诊服务" popoverMinWidth={640}
          options={services.map((item) => serviceSelectOption(
            item, clinicalContext.organization.id, today))} /></FormField>
        <FormField label="诊室/地点"><input value={locationName} maxLength={200}
          onChange={(event) => setLocationName(event.target.value)} /></FormField>
        <FormField label="开始日期" required><input type="date" min={today} value={dateFrom}
          onChange={(event) => { setDateFrom(event.target.value); if (dateTo < event.target.value) setDateTo(event.target.value) }} /></FormField>
        <FormField label="结束日期" required><input type="date" min={dateFrom} max={maxDateTo} value={dateTo}
          onChange={(event) => setDateTo(event.target.value)} /></FormField>
        <FormField label="开始时间" required><input type="time" value={startTime}
          onChange={(event) => setStartTime(event.target.value)} /></FormField>
        <FormField label="结束时间" required><input type="time" value={endTime}
          onChange={(event) => setEndTime(event.target.value)} /></FormField>
        <div className="professional-schedule-weekdays"><span>每周出诊日</span>
          <div>{weekdayOptions.map((item) => <button type="button" aria-pressed={weekdays.includes(item.value)}
            className={weekdays.includes(item.value) ? 'is-selected' : ''} key={item.value}
            onClick={() => toggleWeekday(item.value)}>{item.label}</button>)}</div></div>
        <FormField label="出诊模式" required><Select value={slotMode} onChange={(value) => setSlotMode(value as ProfessionalSlotMode)}
          options={[{ value: 'TIMED', label: '分时段号源', secondaryText: '按固定间隔拆分预约时段' },
            { value: 'POOL', label: '整段共享号源', secondaryText: '出诊时间内共享号源池' }]} /></FormField>
        {slotMode === 'TIMED' && <FormField label="分时间隔(分钟)" required><input type="number" min="5" max="120"
          value={slotMinutes} onChange={(event) => setSlotMinutes(event.target.value)} /></FormField>}
        <FormField label={slotMode === 'TIMED' ? '每格号源数' : '总号源数'} required><input type="number" min="1" max="500"
          value={capacity} onChange={(event) => setCapacity(event.target.value)} /></FormField>
      </div>

      <section className="professional-exceptions"><header><div><h3>日期例外</h3></div>
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
          <div><strong>{item.validFrom} 至 ${item.validTo}</strong><small>{item.periods.length} 个规则日 · ${item.exceptions.length} 个例外</small></div>
          <StatusBadge tone="success">{item.status === 'ACTIVE' ? '生效中' : item.status}</StatusBadge>
        </article>)}</div></div>}
    </Panel>
  </>
}
