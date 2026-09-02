import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { RegistrationBillingIntent, Settlement } from '../../shared/api/billingApi'
import { systemEnumItems } from '../../shared/api/dictionaryApi'
import type { ResidentCoverageInput } from '../../shared/api/residentsApi'
import { SCHEDULING_SYSTEM_ENUM, type ReceptionQueueItem, type ServiceSchedule } from '../../shared/api/schedulingApi'
import { age, genderLabel } from '../../shared/format'
import type { Encounter, Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead,
  PatientIdentitySearch, Select, StatusBadge } from '../../shared/ui'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function clock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(value))
}

function availableSchedules(schedules: ServiceSchedule[]) {
  return schedules.filter((item) => item.sdStatus === 'PUBLISHED' && item.availableCount > 0)
}

interface RegistrationSuccess {
  encounter: Encounter
  receipt?: ReceptionQueueItem
}

type ActiveMedicalCoverage = ResidentCoverageInput & { id: string }

const PINYIN_LOOKUP: Record<string, string[]> = {
  '全科医疗科': ['qk', 'qkylk', 'quanke', 'general'],
  '全科门诊': ['qk', 'qkmz', 'quanke'],
  '内科': ['nk', 'nkmz', 'neike', 'internal'],
  '内科门诊': ['nk', 'nkmz', 'neike'],
  '心血管内科': ['xxg', 'xnk', 'xinxueguan'],
  '消化内科': ['xhnk', 'xiaohua'],
  '呼吸内科': ['hxnk', 'huxi'],
  '内分泌科': ['nfm', 'neifenmi'],
  '外科': ['wk', 'wkmz', 'waike', 'surgery'],
  '外科门诊': ['wk', 'wkmz', 'waike'],
  '普外科': ['pwk', 'puwai'],
  '骨科': ['gk', 'guke', 'orthopedics'],
  '儿科': ['ek', 'erke', 'pediatrics', 'er'],
  '儿科门诊': ['ek', 'erke', 'ekmz'],
  '妇产科': ['fck', 'fuchan', 'obgyn'],
  '妇科': ['fk', 'fuke', 'gynecology'],
  '中医科': ['zyk', 'zhongyi', 'tcm'],
  '针灸推拿科': ['zjtn', 'zhenjiu'],
  '眼科': ['yk', 'yanke', 'eye'],
  '耳鼻喉科': ['ebhk', 'erbihou', 'ent'],
  '口腔科': ['kqk', 'kouqiang', 'dental'],
  '皮肤科': ['pfk', 'pifu', 'derma'],
  '急诊科': ['jzk', 'jizhen', 'er', 'emergency'],
  '发热门诊': ['frmz', 'fare'],
  '康复医学科': ['kfk', 'kangfu', 'rehab'],
}

const DEPT_CATEGORIES = [
  { key: 'ALL', label: '全部科室' },
  { key: 'GENERAL', label: '全科' },
  { key: 'INTERNAL', label: '内科' },
  { key: 'SURGERY', label: '外科' },
  { key: 'PEDIATRICS', label: '儿科' },
  { key: 'TCM', label: '中医' },
  { key: 'GYN', label: '妇产科' },
  { key: 'EMERGENCY', label: '急诊' },
]

const CLINIC_TYPE_OPTIONS = [
  { key: 'ALL', label: '全部号源' },
  { key: 'REGULAR', label: '🏢 普通门诊' },
  { key: 'EXPERT', label: '👑 专家/名医号' },
]

const DAYPART_OPTIONS = [
  { key: 'ALL', label: '全天' },
  { key: 'MORNING', label: '上午' },
  { key: 'AFTERNOON', label: '下午' },
]

function isExpertSchedule(item?: ServiceSchedule) {
  if (!item) return false
  const text = (item.serviceName + ' ' + (item.practitionerName ?? '') + ' ' + (item.serviceCode ?? '')).toLowerCase()
  return text.includes('专家') || text.includes('名医') || text.includes('名老中医')
    || text.includes('主任医师') || text.includes('副主任医师') || text.includes('tcm-exp') || text.includes('im-exp')
}

function getClinicTypeBadge(item: ServiceSchedule) {
  const text = (item.serviceName + ' ' + (item.practitionerName ?? '') + ' ' + (item.serviceCode ?? '')).toLowerCase()
  if (text.includes('名老中医') || text.includes('名医')) return { label: '名老中医', tone: 'gold' as const }
  if (text.includes('主任医师') || text.includes('专家')) return { label: '专家门诊', tone: 'expert' as const }
  if (text.includes('副主任医师')) return { label: '副高专家', tone: 'expert' as const }
  return { label: '普通门诊', tone: 'regular' as const }
}

function getScheduleBaseFee(item?: ServiceSchedule, visitType?: string) {
  void visitType
  if (!item || !item.feeConfigured) return 0
  return item.registrationFee ?? 0
}

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  CASH: '现金收款',
  PERSONAL_ACCOUNT: '医保个账',
}

function statusTone(status: ReceptionQueueItem['status']) {
  if (status === 'WAITING' || status === 'SUSPENDED') return 'warning' as const
  if (status === 'IN_SERVICE' || status === 'TRANSFERRED') return 'info' as const
  if (status === 'COMPLETED') return 'success' as const
  return 'neutral' as const
}

function statusLabel(status: ReceptionQueueItem['status']) {
  const map: Record<ReceptionQueueItem['status'], string> = {
    WAITING: '候诊中',
    IN_SERVICE: '接诊中',
    SUSPENDED: '已暂挂',
    COMPLETED: '已诊毕',
    TRANSFERRED: '已转诊',
    CANCELLED: '已退号',
  }
  return map[status] || status
}

function QuickResidentCreateDialog({ api, onClose, onSuccess }: {
  api: RhnApi
  onClose: () => void
  onSuccess: (resident: Resident) => void
}) {
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'UNKNOWN'>('MALE')
  const [birthDate, setBirthDate] = useState('1990-01-01')
  const [phone, setPhone] = useState('')
  const [coverageType, setCoverageType] = useState('SELF_PAY')
  const [error, setError] = useState<unknown>(null)

  const handleIdChange = (val: string) => {
    setNationalId(val)
    if (val.length === 18 && /^\d{17}[\dXx]$/.test(val)) {
      const year = val.substring(6, 10)
      const month = val.substring(10, 12)
      const day = val.substring(12, 14)
      setBirthDate(`${year}-${month}-${day}`)
      const genderDigit = parseInt(val.substring(16, 17), 10)
      setGender(genderDigit % 2 === 1 ? 'MALE' : 'FEMALE')
    }
  }

  const createMutation = useMutation({
    mutationFn: () => api.residents.create({
      fullName,
      nationalId,
      gender,
      birthDate,
      phone,
      identifiers: nationalId ? [{ system: '1', value: nationalId, useType: 'OFFICIAL' }] : [],
      coverages: (coverageType !== '07' && coverageType !== 'SELF_PAY') ? [{
        sdCoverageType: coverageType,
        payerName: (coverageType === '01' || coverageType === 'EMPLOYEE_BASIC') ? '城镇职工基本医疗保险' : '城乡居民基本医疗保险',
        primary: true,
        validFrom: businessDate(),
      }] : [],
    }),
    onSuccess: (created) => {
      onSuccess(created)
      onClose()
    },
    onError: (err) => setError(err),
  })

  return <Dialog title="30秒极速建档" eyebrow="窗口临时/快速办卡" size="wide" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={createMutation.isPending} disabled={!fullName || !birthDate}
        onClick={() => createMutation.mutate()}>确认建档并挂号</Button></>}>
    {Boolean(error) && <Alert tone="error">{errorMessage(error)}</Alert>}
    <form className="quick-resident-form" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
      <div className="ui-form-row">
        <FormField label="患者姓名" required><input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus required placeholder="如 张三" /></FormField>
        <FormField label="身份证号"><input value={nationalId} onChange={(e) => handleIdChange(e.target.value)} placeholder="18位身份证号（自动识别生日性别）" maxLength={18} /></FormField>
      </div>
      <div className="ui-form-row">
        <FormField label="性别" required><Select value={gender} onChange={(v) => setGender(v as typeof gender)} options={[{ value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }, { value: 'UNKNOWN', label: '未知' }]} /></FormField>
        <FormField label="出生日期" required><input type="date" value={birthDate} max={businessDate()} onChange={(e) => setBirthDate(e.target.value)} required /></FormField>
        <FormField label="联系电话"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号码" maxLength={20} /></FormField>
      </div>
      <div className="ui-form-row">
        <FormField label="医保保障类别"><Select value={coverageType} onChange={(v) => setCoverageType(v)} options={[
          { value: '07', label: '自费患者' },
          { value: '01', label: '城镇职工基本医疗保险' },
          { value: '02', label: '城乡居民基本医疗保险' },
        ]} /></FormField>
      </div>
    </form>
  </Dialog>
}

function ThermalReceiptModal({ receipt, organizationName, departmentName, locationName, feeBreakdown, paymentMethodName, onClose }: {
  receipt: ReceptionQueueItem
  organizationName: string
  departmentName: string
  locationName?: string
  feeBreakdown?: { baseFee: number; seniorDiscount: number; insuranceDeduction: number; payableAmount: number }
  paymentMethodName?: string
  onClose: () => void
}) {
  const breakdown = feeBreakdown ?? { baseFee: 0, seniorDiscount: 0, insuranceDeduction: 0, payableAmount: 0 }
  return <Dialog title="门诊挂号热敏凭条" eyebrow="小票打印预览" size="wide" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>
      <Button onClick={() => window.print()}><Icon name="print" />立即打印小票</Button></>}>
    <div className="thermal-receipt-container">
      <article className="thermal-receipt-paper" aria-label="热敏就诊凭条">
        <header>
          <h3>{organizationName}</h3>
          <p>门诊挂号就诊凭条（热敏存根）</p>
        </header>

        <section className="thermal-receipt-queue-section">
          <span>候诊排队序号</span>
          <strong>{receipt.ticketNo}</strong>
        </section>

        <dl className="thermal-receipt-dl">
          <dt>挂号单号</dt><dd>{receipt.registrationNo}</dd>
          <dt>患者姓名</dt><dd>{receipt.residentName}</dd>
          <dt>健康档案</dt><dd>{receipt.healthRecordNo}</dd>
          <dt>就诊科室</dt><dd>{departmentName}</dd>
          <dt>诊室地址</dt><dd><strong>{locationName || `${departmentName} 诊室`}</strong></dd>
          {Boolean(receipt.practitionerName) && (
            <><dt>接诊医生</dt><dd>{receipt.practitionerName}</dd></>
          )}
          <dt>诊疗项目</dt><dd>{receipt.serviceName}</dd>
          <dt>就诊时段</dt><dd>{receipt.sdDayPartText || '当日出诊'}</dd>
          <dt>门诊诊查费</dt><dd>¥{breakdown.baseFee.toFixed(2)}</dd>
          {breakdown.insuranceDeduction > 0 && <><dt>医保基金抵扣</dt><dd>-¥{breakdown.insuranceDeduction.toFixed(2)}</dd></>}
          {breakdown.seniorDiscount > 0 && <><dt>优待政策减免</dt><dd>-¥{breakdown.seniorDiscount.toFixed(2)}</dd></>}
          <dt>自费实收金额</dt><dd>¥{breakdown.payableAmount.toFixed(2)} ({paymentMethodName || '现金/移动支付'})</dd>
          <dt>挂号时间</dt><dd>{clock(receipt.registeredAt)}</dd>
        </dl>

        <div className="thermal-receipt-barcode-box">
          <div className="thermal-receipt-barcode-bars" aria-hidden="true">
            {Array.from({ length: 48 }).map((_, i) => <span key={i} />)}
          </div>
          <small>{receipt.registrationNo}</small>
        </div>

        <footer className="thermal-receipt-guidance">
          <p>★ 请凭本凭条前往候诊区，关注大屏幕叫号 ★</p>
          <p>当日当班有效 · 祝您早日康复</p>
        </footer>
      </article>
    </div>
  </Dialog>
}

function CancelRegistrationModal({ item, onClose, onConfirm, isPending }: {
  item: ReceptionQueueItem
  onClose: () => void
  onConfirm: (reason: string) => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('患者主动要求退号')
  return <Dialog title="办理退号与退款" eyebrow="门诊挂号撤销" size="wide" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button variant="danger" busy={isPending} onClick={() => onConfirm(reason)}>确认退号并退费</Button></>}>
    <p style={{ margin: '0 0 var(--space-3)' }}>
      即将为患者 <strong>{item.residentName}</strong>（候诊号 <strong>{item.ticketNo}</strong> / 单号 {item.registrationNo}）办理退号。
      退号后号源将自动释放回号源池，挂号费用将原路退回。
    </p>
    <FormField label="退号原因" required>
      <Select value={reason} onChange={(v) => setReason(v)} options={[
        { value: '患者主动要求退号', label: '患者主动要求退号' },
        { value: '挂错科室或医生', label: '挂错科室或医生' },
        { value: '等待时间过长', label: '等待时间过长' },
        { value: '医生临时停诊/外出', label: '医生临时停诊/外出' },
        { value: '其他原因', label: '其他原因' },
      ]} />
    </FormField>
  </Dialog>
}

export function OutpatientRegistrationWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const today = useMemo(businessDate, [])
  const [selected, setSelected] = useState<Resident | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [visitType, setVisitType] = useState<'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY'>('GENERAL')
  const [coverageSelection, setCoverageSelection] = useState('SELF_PAY')
  const [coverageTouched, setCoverageTouched] = useState(false)
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)
  const [intentId, setIntentId] = useState('')
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [activeReceiptItem, setActiveReceiptItem] = useState<ReceptionQueueItem | null>(null)
  const [cancellingItem, setCancellingItem] = useState<ReceptionQueueItem | null>(null)
  const [cancellationResult, setCancellationResult] = useState<string | null>(null)
  const [deptSearch, setDeptSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [selectedClinicType, setSelectedClinicType] = useState('ALL')
  const [selectedDayPart, setSelectedDayPart] = useState('ALL')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('WECHAT')
  const [autoPrintTicket, setAutoPrintTicket] = useState(true)

  const deptSearchInputRef = useRef<HTMLInputElement>(null)

  const linkedResidentId = searchParams.get('residentId')
  const linkedAppointmentId = searchParams.get('appointmentId')

  const linkedResident = useQuery({
    queryKey: ['registration-resident-deep-link', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  const linkedAppointment = useQuery({
    queryKey: ['registration-appointment-deep-link', linkedAppointmentId],
    queryFn: () => api.appointments.get(linkedAppointmentId!),
    enabled: Boolean(linkedAppointmentId),
  })
  const residentProfile = useQuery({
    queryKey: ['registration-resident-profile', selected?.id],
    queryFn: () => api.residents.profile(selected!.id),
    enabled: Boolean(selected),
  })
  const schedules = useQuery({
    queryKey: ['registration-schedules', clinicalContext.department.id, today],
    queryFn: () => api.scheduling.schedules(today, today),
  })
  const todayQueue = useQuery({
    queryKey: ['outpatient-reception-queue', clinicalContext.organization.id, clinicalContext.department.id, today],
    queryFn: () => api.scheduling.receptionQueue(today),
  })
  const visitTypes = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.visitType],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.visitType),
  })
  const paymentMethods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'),
  })
  const intent = useQuery({
    queryKey: ['registration-billing-intent', intentId],
    queryFn: () => api.billing.registrationIntent(intentId), enabled: Boolean(intentId),
    refetchInterval: (query) => ['PAYMENT_PENDING', 'PAID', 'COMPLETING'].includes(
      (query.state.data as RegistrationBillingIntent | undefined)?.status ?? '') ? 2500 : false,
  })
  const intentSettlement = useQuery({
    queryKey: ['registration-settlement', intent.data?.settlementId],
    queryFn: () => api.billing.settlement(intent.data!.settlementId!),
    enabled: Boolean(intent.data?.settlementId),
    refetchInterval: (query) => intent.data?.settlementMode === 'MEDICAL_INSURANCE'
      && query.state.data && !insuranceSettlementReady(query.state.data as Settlement) ? 2500 : false,
  })
  const paymentOrders = useQuery({
    queryKey: ['registration-payment-orders', intent.data?.patientAccountId],
    queryFn: () => api.billing.paymentOrders(intent.data!.patientAccountId!),
    enabled: Boolean(intent.data?.patientAccountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false,
  })

  const allAvailable = useMemo(() => availableSchedules(schedules.data ?? []), [schedules.data])
  
  // Filter schedules by selected department, category, clinic type (regular vs expert), daypart, and search text
  const filteredSchedules = useMemo(() => {
    let result = allAvailable
    const q = deptSearch.trim().toLowerCase()
    if (q) {
      result = result.filter((item) => {
        const name = (item.serviceName + (item.practitionerName ?? '') + (item.locationName ?? '')).toLowerCase()
        if (name.includes(q)) return true
        const initials = PINYIN_LOOKUP[item.serviceName] ?? []
        return initials.some((p) => p.startsWith(q) || p === q)
      })
    }
    if (selectedCategory !== 'ALL') {
      const matchMap: Record<string, string[]> = {
        GENERAL: ['全科', '社区'],
        INTERNAL: ['内科', '心血管', '消化', '呼吸', '内分泌'],
        SURGERY: ['外科', '普外', '骨科'],
        PEDIATRICS: ['儿科'],
        TCM: ['中医', '针灸', '推拿'],
        GYN: ['妇产', '妇科', '产科'],
        EMERGENCY: ['急诊', '发热'],
      }
      const keywords = matchMap[selectedCategory] ?? []
      result = result.filter((item) => keywords.some((k) => item.serviceName.includes(k) || item.locationName?.includes(k)))
    }
    if (selectedClinicType !== 'ALL') {
      if (selectedClinicType === 'EXPERT') {
        result = result.filter(isExpertSchedule)
      } else if (selectedClinicType === 'REGULAR') {
        result = result.filter((item) => !isExpertSchedule(item))
      }
    }
    if (selectedDayPart !== 'ALL') {
      result = result.filter((item) => item.sdDayPart === selectedDayPart)
    }
    return result
  }, [allAvailable, deptSearch, selectedCategory, selectedClinicType, selectedDayPart])

  const linkedSchedule = linkedAppointment.data
    ? (schedules.data ?? []).find((item) => item.id === linkedAppointment.data?.scheduleId) : undefined
  const canUseDirect = !linkedAppointmentId && (allAvailable.length === 0 || visitType === 'EMERGENCY')
  const selectedSchedule = linkedSchedule ?? allAvailable.find((item) => item.id === scheduleId)
  const visitTypeOptions = systemEnumItems(visitTypes.data ? [visitTypes.data] : undefined,
    SCHEDULING_SYSTEM_ENUM.visitType).map((item) => ({ value: item.code, label: item.name }))
  const activeMedicalCoverages = useMemo(() => (residentProfile.data?.coverages ?? [])
    .filter((value) => isActiveMedicalCoverage(value, today)), [residentProfile.data?.coverages, today])
  const coverageOptions = useMemo(() => [
    { value: 'SELF_PAY', label: '自费', secondaryText: '患者个人承担' },
    ...activeMedicalCoverages.map((value) => ({ value: `COVERAGE:${value.id}`,
      label: value.sdCoverageTypeText ?? medicalCoverageLabel(value.sdCoverageType),
      secondaryText: `${value.payerName}${value.primary ? ' · 主要保障' : ''}` })),
  ], [activeMedicalCoverages])
  const selectedCoverage = activeMedicalCoverages.find((value) => `COVERAGE:${value.id}` === coverageSelection)

  // 选号阶段只展示目录有效价；医保支付与减免以正式结算结果为准。
  const feeBreakdown = useMemo(() => {
    const baseFee = getScheduleBaseFee(selectedSchedule, visitType)
    const isExpert = isExpertSchedule(selectedSchedule)
    return {
      baseFee,
      seniorDiscount: 0,
      insuranceDeduction: 0,
      payableAmount: baseFee,
      isElderly: selected ? age(selected.birthDate) >= 65 : false,
      isExpert,
      feeConfigured: !selectedSchedule || selectedSchedule.feeConfigured,
    }
  }, [selected, selectedSchedule, visitType])

  useEffect(() => {
    if (linkedResident.data) setSelected(linkedResident.data)
  }, [linkedResident.data])

  useEffect(() => {
    if (linkedAppointment.data) setScheduleId(linkedAppointment.data.scheduleId)
  }, [linkedAppointment.data])

  useEffect(() => {
    setCoverageSelection('SELF_PAY')
    setCoverageTouched(false)
  }, [selected?.id])

  useEffect(() => {
    if (!selected || residentProfile.isPending || coverageTouched) return
    const preferred = activeMedicalCoverages.find((value) => value.primary) ?? activeMedicalCoverages[0]
    setCoverageSelection(preferred?.id ? `COVERAGE:${preferred.id}` : 'SELF_PAY')
  }, [activeMedicalCoverages, coverageTouched, residentProfile.isPending, selected])

  useEffect(() => {
    if (linkedAppointment.data) return
    if (scheduleId && ((scheduleId === 'DIRECT' && canUseDirect)
      || filteredSchedules.some((item) => item.id === scheduleId))) return
    setScheduleId(filteredSchedules[0]?.id ?? (canUseDirect ? 'DIRECT' : ''))
  }, [canUseDirect, filteredSchedules, linkedAppointment.data, scheduleId])

  useEffect(() => {
    setSelected(null)
    setSuccess(null)
    setIntentId('')
  }, [clinicalContext.department.id])

  const createIntent = useMutation({
    mutationFn: () => api.billing.createRegistrationIntent({
      residentId: selected!.id,
      appointmentId: linkedAppointmentId || undefined,
      scheduleId: scheduleId === 'DIRECT' ? undefined : scheduleId,
      organizationId: clinicalContext.organization.id,
      departmentId: clinicalContext.department.id,
      idempotencyCode: `REG-INTENT-${crypto.randomUUID()}`,
      registrationSource: scheduleId === 'DIRECT' ? (visitType === 'EMERGENCY' ? 'EMERGENCY' : 'DIRECT') : 'WINDOW',
      visitType,
      settlementMode: selectedCoverage ? 'MEDICAL_INSURANCE' : 'SELF_PAY',
      coverageId: selectedCoverage?.id,
    }),
    onSuccess: async (value) => {
      setIntentId(value.id)
      await queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })
    },
  })

  const cancelRegistration = useMutation({
    mutationFn: ({ item, reason }: { item: ReceptionQueueItem; reason: string }) =>
      api.encounters.cancel(item.encounterId, {
        commandCode: `REG-CANCEL-${item.encounterId}`,
        reason, terminalCode: 'REGISTRATION-WINDOW-WEB',
      }),
    onSuccess: async (result) => {
      setCancellationResult(`已成功办理退号：${result.message || '号源已释放'}`)
      setCancellingItem(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['outpatient-registrations'] }),
      ])
    },
  })

  const createPaymentOrder = useMutation({
    mutationFn: (command: SettlementPaymentCommand) => api.billing.createPaymentOrder(command.settlementId, {
      idempotencyKey: command.idempotencyKey, businessScene: 'REGISTRATION', paymentSceneCode: 'CASHIER',
      paymentMethodCode: command.paymentMethodCode, amount: command.amount,
      correlationId: `REGISTRATION-${intentId}`, terminalCode: 'REGISTRATION-WINDOW-WEB',
      expiresAt: intent.data?.expiresAt,
    }),
    onSuccess: async () => {
      await Promise.all([intent.refetch(), paymentOrders.refetch(),
        queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })])
    },
  })

  const retryCompletion = useMutation({
    mutationFn: () => api.billing.retryRegistrationCompletion(intentId),
    onSuccess: async () => { await intent.refetch() },
  })
  const cancelIntent = useMutation({
    mutationFn: () => api.billing.cancelRegistrationIntent(intentId),
    onSuccess: async () => {
      setIntentId('')
      await queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })
    },
  })
  const finishRegistration = useCallback(async (value: RegistrationBillingIntent) => {
    if (!value.encounterId) return
    const [queue, encounters] = await Promise.all([
      api.scheduling.receptionQueue(today), api.encounters.byResident(value.residentId),
    ])
    const encounter = encounters.find((item) => item.id === value.encounterId)
    if (!encounter) return
    const receiptItem = queue.find((item) => item.encounterId === encounter.id)
    setSuccess({ encounter, receipt: receiptItem })
    setActiveReceiptItem(receiptItem ?? null)
    setIntentId('')
    setSelected(null)
    setVisitType('GENERAL')
    if (autoPrintTicket && receiptItem) {
      setShowReceiptModal(true)
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['outpatient-registrations'] }),
    ])
  }, [api.encounters, api.scheduling, autoPrintTicket, queryClient, today])

  useEffect(() => {
    if (intent.data?.status === 'COMPLETED' && intent.data.encounterId) void finishRegistration(intent.data)
  }, [finishRegistration, intent.data])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showQuickCreate || showReceiptModal || cancellingItem) {
        if (e.key === 'Escape') {
          setShowQuickCreate(false)
          setShowReceiptModal(false)
          setCancellingItem(null)
        }
        return
      }

      if (e.key === 'F1' || (e.altKey && e.key === '1')) {
        e.preventDefault()
        const input = document.querySelector('.registration-patient-search input') as HTMLInputElement | null
        input?.focus()
      } else if (e.key === 'F2' || (e.altKey && e.key === '2')) {
        e.preventDefault()
        setShowQuickCreate(true)
      } else if (e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        deptSearchInputRef.current?.focus()
      } else if (e.key === 'F8' || (e.altKey && (e.key === 's' || e.key === 'S'))) {
        if (selected && scheduleId && !createIntent.isPending) {
          e.preventDefault()
          createIntent.mutate()
        }
      } else if (e.key === 'Escape') {
        setSelected(null)
        setSuccess(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancellingItem, createIntent, scheduleId, selected, showQuickCreate, showReceiptModal])

  const displayedSchedules = linkedSchedule ? [linkedSchedule] : filteredSchedules
  const remainingSlots = displayedSchedules.reduce((total, item) => total + item.availableCount, 0)
  const pageError = linkedResident.error || linkedAppointment.error || residentProfile.error || schedules.error
    || visitTypes.error || paymentMethods.error || intent.error || paymentOrders.error
    || intentSettlement.error || createIntent.error || createPaymentOrder.error || retryCompletion.error || cancelIntent.error
  const currentIntent = intent.data
  const currentSettlement = intentSettlement.data
  const settlementOptions = currentIntent?.settlementId ? [{ id: currentIntent.settlementId,
    code: currentIntent.itemName ? `${currentIntent.itemName}挂号结算` : '挂号费结算',
    outstandingAmount: currentSettlement?.outstandingAmount ?? currentIntent.feeAmount,
    currencyCode: currentIntent.currencyCode,
    insuranceReady: currentSettlement ? insuranceSettlementReady(currentSettlement) : false,
    insurancePreparationAllowed: false,
    insuranceAmount: currentSettlement?.insuranceAmount,
    personalAccountAmount: currentSettlement?.tenders.filter((value) => value.tenderType === 'PERSONAL_ACCOUNT')
      .reduce((sum, value) => sum + value.amount, 0),
    otherFundAmount: currentSettlement?.otherAmount }] : []

  const todayList = (todayQueue.data ?? []).slice(0, 10)
  const todayWaitingCount = (todayQueue.data ?? []).filter((item) => item.status === 'WAITING').length

  return <>
    <PageHeader eyebrow="门诊医疗 · 窗口业务" title="门诊挂号"
      description="检索居民、选择今日排班并确认挂号；成功后自动生成候诊号并进入接诊队列。"
      actions={<><Button variant="secondary" onClick={() => setShowQuickCreate(true)}><Icon name="add" />快速建档 (F2)</Button>
        <Button variant="secondary" onClick={() => onNavigate('/outpatient/registration-query')}>挂号查询</Button>
        <Button variant="secondary" onClick={() => onNavigate('/outpatient/appointments')}>预约管理</Button>
        <Button variant="secondary" onClick={() => onNavigate('/outpatient/scheduling')}>排班与号源</Button>
        <Button variant="secondary" onClick={() => void Promise.all([schedules.refetch(), todayQueue.refetch()])}>
          <Icon name="refresh" />刷新</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {cancellationResult && <Alert className="ui-page-feedback" tone="success">{cancellationResult}</Alert>}
    {success && <Alert className="ui-page-feedback" tone="success">
      挂号成功：{success.receipt ? `挂号单 ${success.receipt.registrationNo}，候诊号 ${success.receipt.ticketNo}`
        : `就诊号 ${success.encounter.encounterNo}`}
    </Alert>}

    {showQuickCreate && <QuickResidentCreateDialog api={api} onClose={() => setShowQuickCreate(false)}
      onSuccess={(newResident) => { setSelected(newResident); setSuccess(null) }} />}

    {showReceiptModal && activeReceiptItem && (() => {
      const activeSchedule = (schedules.data ?? []).find((s) => s.id === activeReceiptItem.scheduleId) ?? selectedSchedule
      const activeLocation = activeSchedule?.locationName || (activeReceiptItem.serviceName ? `${activeReceiptItem.serviceName} 诊室` : `${clinicalContext.department.name} 诊室`)
      return <ThermalReceiptModal
        receipt={activeReceiptItem}
        organizationName={clinicalContext.organization.name}
        departmentName={activeReceiptItem.serviceName || clinicalContext.department.name}
        locationName={activeLocation}
        feeBreakdown={feeBreakdown}
        paymentMethodName={PAYMENT_METHOD_NAMES[selectedPaymentMethod] || '自费/医保'}
        onClose={() => setShowReceiptModal(false)} />
    })()}

    {cancellingItem && <CancelRegistrationModal
      item={cancellingItem}
      isPending={cancelRegistration.isPending}
      onClose={() => setCancellingItem(null)}
      onConfirm={(reason) => cancelRegistration.mutate({ item: cancellingItem, reason })} />}

    <section className="registration-workspace-layout">
      {/* Left Column: Patient Intake, Parameters & Real-Time Billing */}
      <Panel className="registration-col-patient">
        <PanelHead title="患者登记与挂号结算" meta={selected ? `${selected.fullName} · 已确认` : '待检索'}
          actions={!selected ? <Button size="sm" variant="secondary" onClick={() => setShowQuickCreate(true)}>
            <Icon name="add" />快速建卡 (F2)</Button> : undefined} />
        
        <div className="registration-intake-form-v2">
          {/* Patient Search Section */}
          <section className="registration-intake-search">
            <header><strong>患者检索 (F1)</strong><span>姓名/身份证/档案号/拼音</span></header>
            <PatientIdentitySearch className="registration-patient-search" queryKey="outpatient-registration"
              search={api.residents.search} selected={selected} disabled={Boolean(intentId)} compact
              showInitialEmpty={false} showSelectedSummary={false} hideResultsWhenSelected
              onSelect={(resident) => { setSelected(resident); setSuccess(null) }} onClear={() => setSelected(null)}
              emptyCopy="输入姓名/拼音/卡号快速检索，或按 F2 快速建档。" />
            {linkedResidentId && linkedResident.isPending && <LoadingState label="正在加载居民…" />}
          </section>

          {/* Patient Identity Profile Card */}
          {selected ? (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <header className="registration-form-group-head">
                <strong>患者身份信息</strong>
                <span className="registration-form-group-actions">
                  <Button size="sm" variant="text" disabled={Boolean(intentId)} onClick={() => setSelected(null)}>重新选择</Button>
                </span>
              </header>
              <div className="registration-patient-identity" style={{ border: 'none', padding: 0, minHeight: 'auto' }}>
                <span className={`resident-avatar ${selected.gender.toLowerCase()}`}>{selected.fullName.slice(-1)}</span>
                <div>
                  <strong>{selected.fullName}</strong>
                  <span>{genderLabel(selected.gender)} · {age(selected.birthDate)} 岁 · 身份证: {selected.maskedNationalId || '未登记'}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>健康档案号: {selected.healthRecordNo} · 电话: {selected.phone || '未登记'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="registration-form-empty" style={{ minHeight: '3.5rem' }}>
              <Icon name="residents" /><span>请先检索患者 (F1) 或快速建卡 (F2)</span>
            </div>
          )}

          {/* Registration Parameters: 2-Column Grid (No Overlap) */}
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <header className="registration-form-group-head">
              <strong>挂号参数</strong>
              <span>{today}</span>
            </header>
            <div className="registration-intake-params-grid">
              <FormField label="就诊类型" required>
                <Select value={visitType} options={visitTypeOptions} disabled={Boolean(intentId)}
                  onChange={(value) => setVisitType(value as typeof visitType)} />
              </FormField>
              <FormField label="费用类别" required>
                <Select value={coverageSelection} options={coverageOptions} disabled={Boolean(intentId) || residentProfile.isPending}
                  onChange={(value) => { setCoverageSelection(value); setCoverageTouched(true) }} />
              </FormField>
            </div>
            <div className="registration-intake-meta-row">
              <div className="registration-intake-meta-item">
                <span>接诊科室</span>
                <strong>{clinicalContext.department.name}</strong>
              </div>
              <div className="registration-intake-meta-item">
                <span>挂号来源</span>
                <strong>{linkedAppointment.data ? '预约到院' : '窗口挂号'}</strong>
              </div>
              <div className="registration-intake-meta-item">
                <span>挂号日期</span>
                <strong>{today}</strong>
              </div>
            </div>
          </div>

          {/* Real-time Fee Card & Cashier */}
          <div style={{ display: 'grid', gap: 'var(--space-2)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
            <header className="registration-form-group-head">
              <strong>费用明细与结算</strong>
              <span style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>实时算费</span>
            </header>
            
            <div className="registration-fee-card" style={{ padding: 'var(--space-2) 0', border: 'none' }}>
              <div className="registration-fee-row">
                <span>{feeBreakdown.isExpert ? '专家门诊诊查费' : '普通门诊诊查费'}</span>
                <strong>{feeBreakdown.feeConfigured ? `¥${feeBreakdown.baseFee.toFixed(2)}` : '未配置'}</strong>
              </div>
              {feeBreakdown.insuranceDeduction > 0 && <div className="registration-fee-row">
                <span>医保统筹基金抵扣</span>
                <strong style={{ color: 'var(--color-success)' }}>-¥{feeBreakdown.insuranceDeduction.toFixed(2)}</strong>
              </div>}
              {feeBreakdown.seniorDiscount > 0 && <div className="registration-fee-row">
                <span>老年人就医优待减免 (≥65岁)</span>
                <strong style={{ color: 'var(--color-success)' }}>-¥{feeBreakdown.seniorDiscount.toFixed(2)}</strong>
              </div>}
              <div className="registration-fee-row is-total">
                <span>目录价（结算前）</span>
                <strong>{feeBreakdown.feeConfigured ? `¥${feeBreakdown.payableAmount.toFixed(2)}` : '未配置'}</strong>
              </div>
            </div>
            {selectedSchedule && !feeBreakdown.feeConfigured && <Alert tone="warning">该挂号项目尚未配置当前有效价格，请先在“排班与号源”的挂号费维护中定价。</Alert>}

            <div className="registration-payment-methods" style={{ padding: 'var(--space-2) 0', border: 'none' }}>
              <button type="button" className={`registration-payment-chip ${selectedPaymentMethod === 'WECHAT' ? 'is-active' : ''}`}
                onClick={() => setSelectedPaymentMethod('WECHAT')}>微信支付</button>
              <button type="button" className={`registration-payment-chip ${selectedPaymentMethod === 'ALIPAY' ? 'is-active' : ''}`}
                onClick={() => setSelectedPaymentMethod('ALIPAY')}>支付宝</button>
              <button type="button" className={`registration-payment-chip ${selectedPaymentMethod === 'CASH' ? 'is-active' : ''}`}
                onClick={() => setSelectedPaymentMethod('CASH')}>现金收款</button>
              <button type="button" className={`registration-payment-chip ${selectedPaymentMethod === 'PERSONAL_ACCOUNT' ? 'is-active' : ''}`}
                onClick={() => setSelectedPaymentMethod('PERSONAL_ACCOUNT')}>医保个账</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) 0' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-small)', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoPrintTicket} onChange={(e) => setAutoPrintTicket(e.target.checked)} />
                <span>自动弹出打印凭条</span>
              </label>
              <span className="registration-shortcuts-hint"><kbd>F8</kbd> 确认出单</span>
            </div>

            {!intentId && !currentIntent && <div>
              <Button style={{ width: '100%', height: '3.125rem', fontSize: 'var(--font-size-body)', fontWeight: 600 }}
                busy={createIntent.isPending} busyLabel="正在核价并出单"
                disabled={!selected || !scheduleId || !feeBreakdown.feeConfigured}
                onClick={() => createIntent.mutate()}><Icon name="add" />确认挂号并出单 (F8 · {feeBreakdown.feeConfigured ? `¥${feeBreakdown.payableAmount.toFixed(2)}` : '未定价'})</Button>
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-small)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                {!selected ? '请先检索患者 (F1) 或快速建卡 (F2)' : selectedSchedule ? `已选: ${selectedSchedule.practitionerName} · ${selectedSchedule.serviceName}` : '请在右侧选择今日号源'}
              </div>
            </div>}

            {success && success.receipt && <div className="registration-receipt-card" style={{ margin: 0 }}>
              <div className="registration-receipt-header">
                <strong>挂号就诊凭条</strong>
                <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--color-brand-strong)' }}>已入队候诊</span>
              </div>
              <div className="registration-receipt-ticket">候诊号 {success.receipt.ticketNo}</div>
              <div style={{ fontSize: 'var(--font-size-small)', color: 'var(--color-text-primary)' }}>
                <div>就诊科室：{clinicalContext.department.name}</div>
                <div>接诊医生：{success.receipt.practitionerName}</div>
                <div>患者姓名：{success.receipt.residentName}</div>
                <div>单号：{success.receipt.registrationNo}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button size="sm" variant="secondary" onClick={() => { setActiveReceiptItem(success.receipt!); setShowReceiptModal(true) }}>
                  <Icon name="print" />查看凭条 / 补打</Button>
              </div>
            </div>}

            {intentId && intent.isPending && <LoadingState label="正在加载挂号结算信息…" />}
            {currentIntent && currentIntent.status !== 'COMPLETED' && <div className="registration-payment-step" style={{ padding: 'var(--space-2) 0' }}>
              <Alert tone={currentIntent.status === 'COMPLETION_FAILED' ? 'error' : 'info'}>
                {currentIntent.status === 'COMPLETION_FAILED'
                  ? `费用已处理，但挂号落地失败：${currentIntent.lastErrorMessage ?? '请重试业务完成'}`
                  : currentIntent.feeAmount > 0
                    ? `号源已暂占，应收挂号费 ${new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currentIntent.currencyCode }).format(currentIntent.feeAmount)}`
                    : '该挂号无需收费，正在生成挂号单与候诊号。'}
              </Alert>
              {currentIntent.status === 'COMPLETION_FAILED' && <Button variant="secondary"
                busy={retryCompletion.isPending} onClick={() => retryCompletion.mutate()}>重试完成挂号</Button>}
              {currentIntent.status === 'PAYMENT_PENDING' && !currentIntent.paymentOrderId && <Button variant="text"
                busy={cancelIntent.isPending} onClick={() => cancelIntent.mutate()}>取消本次挂号并释放号源</Button>}
              {currentIntent.feeAmount > 0 && ['PAYMENT_PENDING', 'PAID'].includes(currentIntent.status)
                && <SettlementPaymentPanel settlements={settlementOptions}
                  methods={(paymentMethods.data ?? []).map((item) => ({ code: item.code, name: item.name }))}
                  orders={paymentOrders.data ?? []} busy={createPaymentOrder.isPending} sceneLabel="挂号费收款"
                  settlementModeCode={currentIntent.settlementMode}
                  onSubmit={(command) => createPaymentOrder.mutateAsync(command)} />}
            </div>}
          </div>
        </div>
        {linkedAppointment.data && <Alert tone="info" className="registration-linked-appointment">正在办理预约 {linkedAppointment.data.appointmentNo} 到院挂号；已占号源不重复扣除。</Alert>}
      </Panel>

      {/* Right Column: Schedules Board (Pro View) & Today's Flow */}
      <div className="registration-col-schedules">
        {/* Upper Section: All-Hospital Schedules Grid Pro */}
        <Panel>
          <PanelHead title="全院选科与今日出诊号源" meta={`${displayedSchedules.length} 个班次 · 剩余 ${remainingSlots} 个号源`} />
          <div className="registration-dept-filter-bar">
            <div className="registration-filter-search-row">
              <input ref={deptSearchInputRef} className="registration-dept-search" type="search"
                placeholder="输入科室/医生名称或拼音 (Alt+K 如: NK、EK、李医生、王专家)"
                value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} />
              <div className="registration-type-segmented">
                {CLINIC_TYPE_OPTIONS.map((opt) => (
                  <button key={opt.key} type="button"
                    className={`registration-type-btn ${selectedClinicType === opt.key ? 'is-active' : ''}`}
                    onClick={() => setSelectedClinicType(opt.key)}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="registration-dept-tabs">
              {DEPT_CATEGORIES.map((cat) => <button key={cat.key} type="button"
                className={`registration-dept-pill ${selectedCategory === cat.key ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(cat.key)}>{cat.label}</button>)}
              <div className="registration-daypart-pills">
                {DAYPART_OPTIONS.map((dp) => (
                  <button key={dp.key} type="button"
                    className={`registration-daypart-pill ${selectedDayPart === dp.key ? 'is-active' : ''}`}
                    onClick={() => setSelectedDayPart(dp.key)}>{dp.label}</button>
                ))}
              </div>
            </div>
          </div>

          {schedules.isPending ? <LoadingState label="正在加载全院号源…" /> : <div className="registration-schedule-grid-pro">
            {displayedSchedules.map((item) => {
              const isExpert = isExpertSchedule(item)
              const badge = getClinicTypeBadge(item)
              const cardBaseFee = getScheduleBaseFee(item, visitType)
              const isSelected = scheduleId === item.id

              return (
                <button key={item.id} type="button"
                  className={`registration-schedule-card-compact ${isExpert ? 'is-expert' : 'is-regular'} ${isSelected ? 'is-selected' : ''}`}
                  aria-pressed={isSelected} disabled={Boolean(intentId) || Boolean(linkedAppointmentId)}
                  onClick={() => setScheduleId(item.id)}>
                  
                  {/* Card Header: Title (Doctor for expert, Dept for regular) & Badges */}
                  <div className="schedule-card-compact__header">
                    <strong className="schedule-card-compact__title">
                      {isExpert ? (item.practitionerName || item.serviceName) : item.serviceName}
                    </strong>
                    <div className="schedule-card-compact__badges">
                      <span className="schedule-badge-daypart">{item.sdDayPartText}</span>
                      <span className={`schedule-badge-clinic is-${badge.tone}`}>
                        {isExpert ? badge.label : '普通号'}
                      </span>
                    </div>
                  </div>

                  {/* Sub-row for Expert: Specialty department */}
                  {isExpert && (
                    <div className="schedule-card-compact__sub">
                      {item.serviceName}
                    </div>
                  )}

                  {/* Card Footer: Time, Price, Remaining Slots */}
                  <div className="schedule-card-compact__footer">
                    <span className="schedule-card-compact__time">
                      <Icon name="clinical" />{clock(item.startAt)}–{clock(item.endAt)}
                    </span>
                    <div className="schedule-card-compact__metrics">
                      <strong className="schedule-card-compact__price">{item.feeConfigured ? `¥${cardBaseFee.toFixed(2)}` : '未定价'}</strong>
                      <span className={`schedule-badge-slots ${item.availableCount <= 3 ? 'is-urgent' : 'is-ample'}`}>
                        余 {item.availableCount}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="schedule-card-compact__selected-marker">
                      <Icon name="check" />
                    </div>
                  )}
                </button>
              )
            })}

            {canUseDirect && (
              <button type="button"
                className={`registration-schedule-card-compact is-direct ${scheduleId === 'DIRECT' ? 'is-selected' : ''}`}
                aria-pressed={scheduleId === 'DIRECT'} disabled={Boolean(intentId)} onClick={() => setScheduleId('DIRECT')}>
                <div className="schedule-card-compact__header">
                  <strong className="schedule-card-compact__title">{clinicalContext.department.name}</strong>
                  <div className="schedule-card-compact__badges">
                    <span className="schedule-badge-direct">绿色通道</span>
                  </div>
                </div>
                <div className="schedule-card-compact__sub">
                  即时急诊 / 临时接诊
                </div>
                <div className="schedule-card-compact__footer">
                  <span className="schedule-card-compact__time">
                    <Icon name="clinical" />实时
                  </span>
                  <div className="schedule-card-compact__metrics">
                    <strong className="schedule-card-compact__price">¥0.00</strong>
                    <span className="schedule-badge-slots is-ample">余 不限</span>
                  </div>
                </div>
                {scheduleId === 'DIRECT' && (
                  <div className="schedule-card-compact__selected-marker">
                    <Icon name="check" />
                  </div>
                )}
              </button>
            )}
          </div>}
          {!schedules.isPending && displayedSchedules.length === 0 && !canUseDirect
            && <EmptyState icon="clinical" title="未找到匹配的号源" copy="请调整科室检索条件，或前往排班管理确认出诊安排。" />}
        </Panel>

        {/* Lower Section: Today's Registration Stream & Return */}
        <Panel className="registration-history-panel">
          <PanelHead title="本窗口今日挂号记录（最近流水）" meta={`共 ${todayList.length} 条记录 · ${todayWaitingCount} 人候诊中`}
            actions={<Button size="sm" variant="secondary" onClick={() => void todayQueue.refetch()}>
              <Icon name="refresh" />刷新流水</Button>} />
          {todayList.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-small)' }}>
              今日尚无挂号流水记录。
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="registration-history-table">
                <thead>
                  <tr>
                    <th>候诊序号</th>
                    <th>挂号单号</th>
                    <th>患者姓名</th>
                    <th>档案号</th>
                    <th>科室 / 医生</th>
                    <th>就诊时段</th>
                    <th>挂号时间</th>
                    <th>当前状态</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {todayList.map((item) => (
                    <tr key={item.registrationId}>
                      <td><strong style={{ color: 'var(--color-brand-primary)' }}>{item.ticketNo}</strong></td>
                      <td>{item.registrationNo}</td>
                      <td><strong>{item.residentName}</strong></td>
                      <td>{item.healthRecordNo}</td>
                      <td>{item.serviceName} · {item.practitionerName || '普通门诊'}</td>
                      <td>{item.sdDayPartText || '当日'}</td>
                      <td>{clock(item.registeredAt)}</td>
                      <td><StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                          <Button size="sm" variant="text" onClick={() => { setActiveReceiptItem(item); setShowReceiptModal(true) }}>
                            补打凭条
                          </Button>
                          {item.status === 'WAITING' && (
                            <Button size="sm" variant="text" style={{ color: 'var(--color-danger)' }}
                              onClick={() => setCancellingItem(item)}>
                              退号
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </section>
  </>
}

function isActiveMedicalCoverage(value: ResidentCoverageInput, today: string): value is ActiveMedicalCoverage {
  if (!value.id || ['07', '05', '99', 'SELF_PAY', 'COMMERCIAL', 'OTHER'].includes(value.sdCoverageType)) return false
  return value.validFrom <= today && (!value.validTo || value.validTo >= today)
}

function medicalCoverageLabel(code: string) {
  return ({
    '01': '城镇职工基本医疗保险',
    '0101': '本市城镇职工基本医疗保险',
    '0102': '外埠城镇职工基本医疗保险',
    '02': '城镇居民基本医疗保险',
    '0201': '本市城乡居民基本医疗保险',
    '0202': '外埠城镇居民基本医疗保险',
    '03': '新型农村合作医疗',
    EMPLOYEE_BASIC: '职工基本医疗保险',
    RESIDENT_BASIC: '城乡居民基本医疗保险',
    BASIC: '基本医疗保险',
  } as Record<string, string>)[code] ?? '医疗保险'
}

function insuranceSettlementReady(settlement: Settlement) {
  const latestInsuranceEvent = [...settlement.events]
    .filter((value) => value.commandCode.startsWith('INSURANCE-'))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  if (latestInsuranceEvent) return latestInsuranceEvent.eventType !== 'REVERSE_COMPLETE'
  return settlement.insuranceAmount > 0 || settlement.tenders.some((value) => Boolean(value.claimResponseId))
}
