import { displayUnitName } from "../medicationDisplay";
import type { PersonnelAssignment } from "../../../shared/api/organizationApi";
import type { PharmacyInboxItem, PharmacyReviewResult } from "../../../shared/api/pharmacyApi";

export const taskStatusText: Record<string, string> = {
  PENDING_REVIEW: '待审方', INTERVENTION: '待干预', READY_TO_PICK: '待拣货', PICKING: '拣货中',
  READY_TO_DISPENSE: '待发药', PARTIALLY_DISPENSED: '部分发药', COMPLETED: '已完成',
  PARTIALLY_RETURNED: '部分退药', RETURN_REQUIRED: '停嘱待退', RETURNED: '已全部退药', REJECTED: '已驳回',
  CANCELLED: '停嘱已取消', STOPPED: '停嘱已清算',
}

export const reviewText: Record<PharmacyReviewResult, string> = {
  PASS: '通过', REJECT: '驳回', INTERVENE: '干预', OVERRIDE: '强制通过',
}

export type PharmacyWorkspaceMode = 'dispensing' | 'review' | 'returns' | 'query' | 'ward'

export type DispensingPatientGroup = {
  residentId: string
  residentName: string
  gender?: string
  birthDate?: string
  nationalId?: string
  phone?: string
  encounterId: string
  encounterNo?: string
  clinicianId?: string
  items: PharmacyInboxItem[]
}

export type DispenseSearchIntent = 'PATIENT_NAME' | 'PHONE' | 'NATIONAL_ID' | 'PATIENT_ID'
  | 'PRESCRIPTION_NO' | 'ENCOUNTER_NO' | 'MEDICATION' | 'KEYWORD' | 'TRACE_CODE'

export const dispenseSearchIntentText: Record<DispenseSearchIntent, string> = {
  PATIENT_NAME: '患者姓名', PHONE: '手机号', NATIONAL_ID: '身份证号', PATIENT_ID: '患者标识',
  PRESCRIPTION_NO: '处方号', ENCOUNTER_NO: '就诊号', MEDICATION: '药品', KEYWORD: '关键词',
  TRACE_CODE: '药品追溯码',
}

export const TRACE_SCAN_DEBOUNCE_MS = 300

export function parseTraceCodeBatch(rawValue: string) {
  const seen = new Set<string>()
  return rawValue.split(/[\s,，;；]+/).map((value) => value.trim()).filter((value) => {
    if (!value) return false
    const normalized = value.replaceAll(/\s+/g, '').toUpperCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function groupTraceCodesByPrefix(traceCodes: string[], prefixLength = 7) {
  const groups = new Map<string, string[]>()
  for (const traceCode of traceCodes) {
    const normalized = traceCode.replaceAll(/\s+/g, '').toUpperCase()
    const prefix = normalized.slice(0, prefixLength)
    groups.set(prefix, [...(groups.get(prefix) ?? []), traceCode])
  }
  return groups
}

export function requestMatchesSearch(item: PharmacyInboxItem, keyword: string) {
  const request = item.request
  return request.medicationName.toLowerCase().includes(keyword)
    || request.itemName.toLowerCase().includes(keyword)
    || request.requestNo.toLowerCase().includes(keyword)
    || Boolean(request.prescriptionId?.toLowerCase().includes(keyword))
}

export function patientMatchesSearch(patient: DispensingPatientGroup, rawKeyword: string) {
  const keyword = rawKeyword.trim().toLowerCase()
  if (!keyword) return true
  return patient.residentName.toLowerCase().includes(keyword)
    || patient.residentId.toLowerCase().includes(keyword)
    || Boolean(patient.nationalId?.toLowerCase().includes(keyword))
    || Boolean(patient.phone?.includes(keyword))
    || Boolean(patient.encounterNo?.toLowerCase().includes(keyword))
    || patient.items.some((item) => requestMatchesSearch(item, keyword))
}

export function inferDispenseSearchIntent(rawKeyword: string, patients: DispensingPatientGroup[]): DispenseSearchIntent {
  const keyword = rawKeyword.trim().toLowerCase()
  const has = (predicate: (patient: DispensingPatientGroup) => boolean) => patients.some(predicate)
  if (/^1\d{10}$/.test(keyword) || has((patient) => Boolean(patient.phone?.includes(keyword)))) return 'PHONE'
  if (/^\d{17}[\dx]$/.test(keyword)
    || has((patient) => Boolean(patient.nationalId?.toLowerCase().includes(keyword)))) return 'NATIONAL_ID'
  if (has((patient) => patient.items.some((item) => item.request.requestNo.toLowerCase().includes(keyword)
    || Boolean(item.request.prescriptionId?.toLowerCase().includes(keyword))))
    || /^(mr|rx|cf)/i.test(keyword)) return 'PRESCRIPTION_NO'
  if (has((patient) => Boolean(patient.encounterNo?.toLowerCase().includes(keyword)))
    || /^(enc|mz|jz)/i.test(keyword)) return 'ENCOUNTER_NO'
  if (has((patient) => patient.residentId.toLowerCase().includes(keyword))) return 'PATIENT_ID'
  if (has((patient) => patient.residentName.toLowerCase().includes(keyword))) return 'PATIENT_NAME'
  if (has((patient) => patient.items.some((item) => item.request.medicationName.toLowerCase().includes(keyword)
    || item.request.itemName.toLowerCase().includes(keyword)))) return 'MEDICATION'
  if (/\p{Script=Han}/u.test(keyword)) return 'KEYWORD'
  return 'TRACE_CODE'
}

export const workspaceCopy: Record<PharmacyWorkspaceMode, {
  eyebrow: string; title: string; description: string; queueTitle: string; emptyTitle: string; emptyCopy: string
}> = {
  dispensing: {
    eyebrow: '药事管理 · 门诊执行', title: '门诊发药',
    description: '集中处理门诊处方接方、库存预留、配药复核和实际发药。',
    queueTitle: '待发药处方', emptyTitle: '暂无待发药处方', emptyCopy: '新的门诊处方会进入这里。',
  },
  review: {
    eyebrow: '药事管理 · 药学审核', title: '处方审方',
    description: '按系统参数独立处理事前或事后审方，不与门诊发药操作混排。',
    queueTitle: '待审处方', emptyTitle: '暂无待审处方', emptyCopy: '符合当前审方模式的处方会进入这里。',
  },
  returns: {
    eyebrow: '药事管理 · 反向业务', title: '退药管理',
    description: '统一处理患者退药与病区退药验收，形成可追溯的库存回退记录。',
    queueTitle: '患者退药', emptyTitle: '暂无可退药处方', emptyCopy: '已发药且仍有可退数量的处方会进入这里。',
  },
  query: {
    eyebrow: '药事管理 · 业务查询', title: '发药查询',
    description: '查询已完成、已驳回、已取消和已退药记录，查看批次及人员追溯信息。',
    queueTitle: '历史发药记录', emptyTitle: '暂无历史记录', emptyCopy: '已结束的发药任务会进入这里。',
  },
  ward: {
    eyebrow: '药事管理 · 住院供药', title: '病区配送',
    description: '按班次汇总住院用药，完成批量接方、配药发药和病区配送交接。',
    queueTitle: '', emptyTitle: '', emptyCopy: '',
  },
}

export const activeTaskStatuses = new Set(['READY_TO_PICK', 'PICKING', 'READY_TO_DISPENSE', 'PARTIALLY_DISPENSED'])

export const postReviewTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED'])

export const returnTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURN_REQUIRED'])

export const closedTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'REJECTED', 'CANCELLED', 'STOPPED'])

export type PharmacyQueryStatus = 'ALL' | 'COMPLETED' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'REJECTED' | 'CANCELLED' | 'STOPPED'

export type PharmacyQueryFilters = {
  keyword: string
  status: PharmacyQueryStatus
  startDate: string
  endDate: string
}

export function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function pharmacyDateRange(days: number) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - Math.max(0, days - 1))
  return { startDate: localDateValue(start), endDate: localDateValue(end) }
}

export function defaultPharmacyQueryFilters(): PharmacyQueryFilters {
  return { keyword: '', status: 'ALL', ...pharmacyDateRange(1) }
}

export const pharmacyQueryStatusOptions: Array<{ value: PharmacyQueryStatus; label: string }> = [
  { value: 'ALL', label: '全部状态' },
  { value: 'COMPLETED', label: '已完成发药' },
  { value: 'PARTIALLY_RETURNED', label: '部分退药' },
  { value: 'RETURNED', label: '已退药' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'STOPPED', label: '已停嘱' },
]

export function statusTone(status?: string) {
  if (status === 'READY_TO_PICK' || status === 'COMPLETED') return 'success' as const
  if (status === 'INTERVENTION' || status === 'RETURN_REQUIRED') return 'warning' as const
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger' as const
  if (status === 'STOPPED' || status === 'RETURNED') return 'neutral' as const
  return 'info' as const
}

export function pharmacyQueryItemMatches(item: PharmacyInboxItem, rawKeyword: string) {
  const keyword = rawKeyword.trim().toLocaleLowerCase()
  if (!keyword) return true
  const snapshot = item.request.medicationSnapshot as Record<string, unknown> | undefined
  const values = [
    item.request.requestNo, item.request.prescriptionId, item.request.medicationId,
    item.request.medicationCode, item.request.medicationName, item.request.itemCode,
    item.request.itemName, item.request.localCode, item.request.localName,
    item.request.residentId, item.request.encounterId, item.clinicalContext?.encounterNo,
    item.clinicalContext?.clinicianId, item.taskNo, item.taskId,
    item.residentName, item.healthRecordNo, item.residentPhone,
    snapshot?.residentName, snapshot?.fullName, snapshot?.nationalId, snapshot?.phone,
  ]
  return values.some((value) => value != null && String(value).toLocaleLowerCase().includes(keyword))
}

export function pharmacyQueryItemInDateRange(item: PharmacyInboxItem, startDate: string, endDate: string) {
  if (!item.dispensedAt) return !startDate && !endDate
  const dispensedAt = new Date(item.dispensedAt)
  if (Number.isNaN(dispensedAt.getTime())) return !startDate && !endDate
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`)
    if (dispensedAt < start) return false
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`)
    if (dispensedAt > end) return false
  }
  return true
}

export function pharmacyQueryResidentName(item: PharmacyInboxItem) {
  const snapshot = item.request.medicationSnapshot as Record<string, unknown> | undefined
  const residentName = item.residentName ?? snapshot?.residentName ?? snapshot?.fullName
  return residentName ? String(residentName) : '姓名待补充'
}

export const CHINESE_NUMBER_WORDS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export function assignmentOption(value: PersonnelAssignment) {
  return { value: value.id, label: `${value.positionName} · ${value.departmentName}`, code: value.code }
}

export interface RequestQuantityView {
  quantity: number
  quantityUnit: string
  baseQuantity: number
  baseUnit: string
  packageFactor: number
  packageUnitName?: string
}

export function formatRequestQuantity(request: RequestQuantityView) {
  const packageUnit = requestPackageUnit(request.quantityUnit, request.packageUnitName)
  const baseUnit = displayUnitName(request.baseUnit)
  const packageQuantity = formatQuantityWithUnit(request.quantity, packageUnit)
  const baseQuantity = formatQuantityWithUnit(request.baseQuantity, baseUnit)
  return request.packageFactor === 1 && packageUnit === baseUnit && request.quantity === request.baseQuantity
    ? packageQuantity : `${packageQuantity}（${baseQuantity}）`
}

export function formatPackageConversion(request: RequestQuantityView) {
  const packageUnit = requestPackageUnit(request.quantityUnit, request.packageUnitName)
  const baseUnit = displayUnitName(request.baseUnit)
  if (!request.packageFactor || request.packageFactor <= 0) return '未配置换算'
  if (request.packageFactor === 1 && packageUnit === baseUnit) return '无需换算'
  return `1${packageUnit} = ${formatQuantityWithUnit(request.packageFactor, baseUnit)}`
}

export function requestPackageUnit(code: string, name?: string) {
  return name?.trim() || displayUnitName(code)
}

export function formatQuantityWithUnit(value: number, unit: string) {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)}${unit}`
}

export function genderText(value?: string) {
  return { MALE: '男', FEMALE: '女', UNKNOWN: '未知' }[value ?? ''] ?? '未知'
}

export function ageText(birthDate?: string) {
  if (!birthDate) return '81岁'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '81岁'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth()
    || today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) age -= 1
  return `${Math.max(age, 0)}岁`
}
