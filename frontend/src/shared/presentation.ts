import type { Encounter, Resident } from './model'
import type { ClinicalDocument, ClinicalDocumentVersion } from './api/clinicalDocumentsApi'
import type { CriticalValueAlert, DiagnosticReport } from './api/diagnosticsApi'
import type {
  InpatientAdmissionDiagnosis,
  InpatientOrder,
  InpatientOrderCategory,
  InpatientOrderDurationType,
  InpatientOrderTask,
} from './api/inpatientApi'
import type { WardDelivery } from './api/pharmacyApi'

export type SemanticTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

// 分类名称由字典提供，此处仅维护视觉语义。
export function chargeCategoryTone(code: string): SemanticTone {
  const tones: Record<string, SemanticTone> = {
    LABORATORY: 'info', IMAGING: 'info', EXAMINATION: 'info', REGISTRATION: 'info',
    TREATMENT: 'warning', SURGERY: 'warning', MATERIAL: 'warning',
  }
  return tones[code.trim().toUpperCase()] ?? 'neutral'
}

export interface StatusPresentation {
  label: string
  tone: SemanticTone
}

export function historicalPlanDifferencePresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    CONSISTENT: { label: '一致', tone: 'success' }, CONFLICT: { label: '冲突', tone: 'warning' },
    MISSING_IN_HISTORY: { label: '历史方案未列入', tone: 'neutral' }, MISSING_IN_STANDARD: { label: '标准方案未列入', tone: 'neutral' },
    NEEDS_REVIEW: { label: '待核对', tone: 'warning' },
  }
  return values[status] ?? { label: '状态未确认', tone: 'warning' }
}

export function residentStatusPresentation(resident: Pick<Resident, 'status' | 'deceased'>): StatusPresentation {
  if (resident.status === 'MERGED') return { label: '已合并', tone: 'neutral' }
  if (resident.status === 'INACTIVE') return { label: '已停用', tone: 'neutral' }
  if (resident.status !== 'ACTIVE' || typeof resident.deceased !== 'boolean') return { label: '居民状态未知', tone: 'warning' }
  return resident.deceased ? { label: '已登记死亡', tone: 'warning' } : { label: '有效居民', tone: 'success' }
}

export function residentIdentifierSystemLabel(system?: string | null): string {
  const labels: Record<string, string> = {
    '1': '居民身份证', NATIONAL_ID: '居民身份证',
    '2': '中国人民解放军军人身份证件', '3': '中国人民武装警察身份证件',
    '4': '港澳居民来往内地通行证', '5': '台湾居民来往大陆通行证',
    '6': '护照', PASSPORT: '护照', '9': '其他证件/卡', OTHER: '其他证件/卡',
    SOCIAL_SECURITY_CARD: '社会保障卡', HEALTH_CARD: '电子健康卡',
    HOSPITAL_MRN: '病案号', BIRTH_CERTIFICATE: '出生医学证明',
  }
  return system ? labels[system.trim().toUpperCase()] ?? system : '证件类型未提供'
}

export function inventoryReconciliationPresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    PASSED: { label: '校验通过', tone: 'success' }, ISSUES: { label: '发现差异', tone: 'warning' },
    RUNNING: { label: '校验中', tone: 'info' }, FAILED: { label: '校验失败', tone: 'danger' },
  }
  return values[status] ?? { label: '校验状态未知', tone: 'warning' }
}

export function inventoryPeriodClosePresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    RUNNING: { label: '预检中', tone: 'info' }, VALIDATED: { label: '预检完成', tone: 'info' },
    POSTED: { label: '已正式月结', tone: 'success' }, FAILED: { label: '执行失败', tone: 'danger' },
  }
  return values[status] ?? { label: '月结状态未知', tone: 'warning' }
}

export function inventoryPriceAdjustmentPresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    DRAFT: { label: '草稿', tone: 'info' }, SUBMITTED: { label: '待审核', tone: 'warning' },
    APPROVED: { label: '已审核', tone: 'warning' }, POSTING: { label: '记账中', tone: 'info' },
    POSTED: { label: '已记账', tone: 'success' }, CANCELLED: { label: '已取消', tone: 'neutral' },
  }
  return values[status] ?? { label: '调价状态未知', tone: 'warning' }
}

export function careTaskStatusPresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    READY: { label: '待复核', tone: 'info' }, IN_PROGRESS: { label: '处理中', tone: 'info' },
    WAITING_EXTERNAL: { label: '等待外部', tone: 'warning' }, COMPLETED: { label: '已完成', tone: 'success' },
    CANCELLED: { label: '已取消', tone: 'neutral' }, OVERDUE: { label: '已逾期', tone: 'danger' },
    ESCALATED: { label: '已升级', tone: 'warning' }, PLANNED: { label: '计划中', tone: 'info' },
  }
  return values[status] ?? { label: '任务状态未知', tone: 'warning' }
}

export function conditionVerificationPresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    SUSPECTED: { label: '疑似，待临床确认', tone: 'warning' },
    CONFIRMED: { label: '已确认', tone: 'info' }, REFUTED: { label: '已排除', tone: 'neutral' },
  }
  return values[status] ?? { label: '核验状态未知', tone: 'warning' }
}

export function workTaskStatusPresentation(status: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    READY: { label: '待认领', tone: 'neutral' }, IN_PROGRESS: { label: '处理中', tone: 'info' },
    COMPLETED: { label: '已完成', tone: 'success' }, CANCELLED: { label: '已取消', tone: 'neutral' },
  }
  return values[status] ?? { label: '任务状态未知', tone: 'warning' }
}

export function workTaskPriorityPresentation(priority: string): StatusPresentation {
  const values: Record<string, StatusPresentation> = {
    URGENT: { label: '紧急', tone: 'warning' }, HIGH: { label: '高优先级', tone: 'warning' },
    NORMAL: { label: '普通', tone: 'info' }, LOW: { label: '低优先级', tone: 'neutral' },
  }
  return values[priority] ?? { label: '优先级未知', tone: 'warning' }
}

export function workTaskBusinessAction(taskType: string): string | undefined {
  const messages: Record<string, string> = {
    CLINICAL_DOCUMENT_SIGN: '需在病历中完成签署', CRITICAL_VALUE_ACKNOWLEDGE: '需在危急值业务中完成确认',
    OUTPATIENT_ENCOUNTER: '需在门诊业务中完成接诊', CONTINUOUS_CARE: '需在连续照护业务中处理',
  }
  return messages[taskType]
}

export function treatmentFulfillmentPresentation(status: string | undefined, dispenseId?: string): StatusPresentation {
  if (status === 'COMPLETED') return dispenseId
    ? { label: '已发药', tone: 'success' }
    : { label: '发药凭证缺失', tone: 'warning' }
  const labels: Record<string, string> = {
    NOT_INTAKE: '待接收发药', PENDING: '待审方', READY: '待配药', PICKING: '配药中',
    READY_TO_DISPENSE: '待发药', PARTIAL: '部分发药或退药', REJECTED: '审方未通过',
    RETURNED: '已退药', CANCELLED: '发药已取消', RETURNED_OR_PARTIAL: '退药或部分发药', INCOMPLETE: '发药未完成',
  }
  return { label: (status && labels[status]) || '发药状态未知', tone: 'warning' }
}

export function medicationStandardBindingStatusPresentation(status: string): StatusPresentation {
  const labels: Record<string, StatusPresentation> = {
    LINKED: { label: '关联一致', tone: 'success' },
    UNMAPPED: { label: '未关联', tone: 'warning' },
    AMBIGUOUS: { label: '关联冲突', tone: 'danger' },
    STALE: { label: '关联版本不可用', tone: 'warning' },
    MISMATCH: { label: '信息不一致', tone: 'danger' },
  }
  return labels[status] ?? { label: status, tone: 'neutral' }
}

export function medicationCandidateStatusPresentation(status: string): StatusPresentation {
  return status === 'APPROVED_FOR_SHADOW'
    ? { label: '已批准进入旁路监控', tone: 'success' }
    : { label: status, tone: 'neutral' }
}

export function semanticProbeStatusPresentation(status: string): StatusPresentation {
  return { label: status, tone: status === 'READY' ? 'success' : status === 'CLARIFY' ? 'warning' : 'danger' }
}

export function clinicalAiTreatmentMatchPresentation(status: string): StatusPresentation & { shortLabel: string } {
  const values: Record<string, StatusPresentation & { shortLabel: string }> = {
    MATCHED: { label: '已匹配院内项目', shortLabel: '已匹配', tone: 'success' },
    AMBIGUOUS: { label: '待选院内项目', shortLabel: '待选项目', tone: 'warning' },
    NO_ORDERABLE_SERVICE: { label: '未匹配本院项目', shortLabel: '未匹配', tone: 'warning' },
    CATALOG_ERROR: { label: '目录读取失败', shortLabel: '目录异常', tone: 'warning' },
    SPECIFICATION_REVIEW: { label: '待核对规格', shortLabel: '规格待核', tone: 'warning' },
    MEDICATION_UNAVAILABLE: { label: '暂无可开立药品', shortLabel: '不可开立', tone: 'warning' },
    MEDICATION_NOT_FOUND: { label: '未匹配院内药品', shortLabel: '未匹配', tone: 'warning' },
    INVALID_INTENT: { label: '待完善检索', shortLabel: '待完善', tone: 'warning' },
  }
  return values[status] ?? { label: '待核对', shortLabel: '待核对', tone: 'warning' }
}

export function clinicalAiDraftStatusPresentation({ generating, error, current, hasSuggestion }: {
  generating: boolean; error: boolean; current: boolean; hasSuggestion: boolean
}): StatusPresentation {
  if (generating) return { label: '正在共写…', tone: 'info' }
  if (error) return { label: '整理未完成', tone: 'danger' }
  if (current) return { label: '建议已准备好', tone: 'success' }
  if (hasSuggestion) return { label: '资料已变化，等待更新', tone: 'warning' }
  return { label: '待分析', tone: 'neutral' }
}

const encounterStatuses: Record<Encounter['status'], StatusPresentation> = {
  REGISTERED: { label: '已挂号', tone: 'warning' },
  IN_PROGRESS: { label: '接诊中', tone: 'info' },
  SUSPENDED: { label: '已暂挂', tone: 'warning' },
  COMPLETED: { label: '已完成', tone: 'success' },
  TRANSFERRED: { label: '已转科', tone: 'success' },
  TERMINATED: { label: '已终止', tone: 'danger' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
}

const timelineEventLabels: Record<string, string> = {
  OUTPATIENT_REGISTERED: '挂号',
  ENCOUNTER_STARTED: '接诊',
  ENCOUNTER_SUSPENDED: '暂挂接诊',
  ENCOUNTER_RESUMED: '恢复接诊',
  VITAL_SIGNS_RECORDED: '生命体征',
  DIAGNOSIS_RECORDED: '诊断',
  ENCOUNTER_COMPLETED: '完成就诊',
  OUTPATIENT_REFERRAL_REQUESTED: '发起协同',
  OUTPATIENT_CONSULTATION_COMPLETED: '完成会诊',
  OUTPATIENT_DEPARTMENT_TRANSFERRED: '完成转科',
  OUTPATIENT_TRANSFER_ENCOUNTER_REGISTERED: '接收转科',
  ENCOUNTER_TERMINATED: '终止诊疗',
  RESIDENT_MERGED: '居民合并',
  RESIDENT_SPLIT: '撤销合并',
  CLINICAL_DOCUMENT_SIGNED: '文档签署',
  CLINICAL_DOCUMENT_ARCHIVED: '文档归档',
}

export function encounterStatusPresentation(status: Encounter['status']) {
  return encounterStatuses[status]
}

export function timelineEventLabel(eventType: string) {
  return timelineEventLabels[eventType] ?? eventType
}

const inpatientOrderCategoryLabels: Record<InpatientOrderCategory, string> = {
  MEDICATION: '药品',
  SERVICE: '诊疗',
  NURSING: '护理',
}

const inpatientOrderDurationLabels: Record<InpatientOrderDurationType, string> = {
  LONG_TERM: '长期',
  TEMPORARY: '临时',
}

const inpatientOrderStatuses: Record<InpatientOrder['status'], StatusPresentation> = {
  DRAFT: { label: '草稿', tone: 'warning' },
  SIGNED: { label: '待核对', tone: 'info' },
  ACTIVE: { label: '执行中', tone: 'success' },
  COMPLETED: { label: '已完成', tone: 'neutral' },
  STOPPED: { label: '已停嘱', tone: 'neutral' },
}

const inpatientOrderTaskStatuses: Record<InpatientOrderTask['status'], StatusPresentation> = {
  PLANNED: { label: '待执行', tone: 'warning' },
  EXECUTED: { label: '已执行', tone: 'success' },
  SKIPPED: { label: '已跳过', tone: 'neutral' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
}

const wardDeliveryStatuses: Record<WardDelivery['status'], StatusPresentation> = {
  PENDING_DISPATCH: { label: '待送出', tone: 'warning' },
  IN_TRANSIT: { label: '配送中', tone: 'info' },
  RECEIVED: { label: '已签收', tone: 'success' },
  DISCREPANCY: { label: '有差异', tone: 'danger' },
  RESOLVED: { label: '差异已处理', tone: 'neutral' },
}

export function inpatientOrderCategoryLabel(value: InpatientOrderCategory) {
  return inpatientOrderCategoryLabels[value]
}

export function inpatientOrderDurationLabel(value: InpatientOrderDurationType) {
  return inpatientOrderDurationLabels[value]
}

export function inpatientOrderStatusPresentation(value: InpatientOrder['status']) {
  return inpatientOrderStatuses[value]
}

export function inpatientOrderTaskStatusPresentation(value: InpatientOrderTask['status']) {
  return inpatientOrderTaskStatuses[value]
}

export function wardDeliveryStatusPresentation(value: WardDelivery['status']) {
  return wardDeliveryStatuses[value]
}

export function inpatientDiagnosisVerificationPresentation(value: InpatientAdmissionDiagnosis['verificationStatus']): StatusPresentation {
  return value === 'CONFIRMED'
    ? { label: '已确认', tone: 'success' }
    : { label: '初步诊断', tone: 'warning' }
}

export function clinicalDocumentStatusPresentation(document: ClinicalDocument): StatusPresentation {
  if (document.status === 'SIGNED') return { label: `已签署 v${document.currentVersion}`, tone: 'success' }
  if (document.status === 'AMENDMENT_IN_PROGRESS') return { label: `修订中 v${document.currentVersion}`, tone: 'warning' }
  if (document.status === 'ARCHIVED') return { label: `已归档 v${document.currentVersion}`, tone: 'neutral' }
  return { label: `草稿 v${document.currentVersion}`, tone: 'warning' }
}

export function clinicalDocumentVersionLabel(version: ClinicalDocumentVersion) {
  if (version.signedAt) return '已签署'
  if (version.changeType === 'AMENDMENT') return '修订草稿'
  return '草稿'
}

export function criticalValueStatusPresentation(value: CriticalValueAlert['status']): StatusPresentation {
  const states: Record<CriticalValueAlert['status'], StatusPresentation> = {
    OPEN: { label: '待确认', tone: 'danger' }, ESCALATED: { label: '已超时升级', tone: 'danger' },
    ACKNOWLEDGED: { label: '已确认，待处置', tone: 'warning' }, CLOSED: { label: '已关闭', tone: 'neutral' },
    SUPERSEDED: { label: '报告已替代', tone: 'neutral' },
  }
  return states[value] ?? { label: '危急值状态未知', tone: 'warning' }
}

export function diagnosticReportStatusPresentation(value: DiagnosticReport['status']): StatusPresentation {
  if (value === 'FINAL') return { label: '正式报告', tone: 'success' }
  if (value === 'CORRECTED') return { label: '更正报告', tone: 'success' }
  if (value === 'PRELIMINARY') return { label: '初步报告', tone: 'info' }
  return { label: '已取消', tone: 'neutral' }
}
export function schemaReviewPresentation(state: string) {
  if (state === 'reviewed') return { label: '已审核', tone: 'success' as const }
  if (state === 'rejected') return { label: '已退回', tone: 'danger' as const }
  if (state === 'database') return { label: '数据库约束', tone: 'info' as const }
  return { label: '待确认', tone: 'warning' as const }
}

export function schemaRelationPresentation(kind: string) {
  if (kind === 'foreign-key') return { label: '物理外键', tone: 'info' as const }
  if (kind === 'logical') return { label: '业务关联', tone: 'success' as const }
  return { label: '候选关系', tone: 'warning' as const }
}

export function schemaIssuePresentation(severity: string) {
  if (severity === 'error') return { label: '需修正', tone: 'danger' as const }
  if (severity === 'warning') return { label: '待核对', tone: 'warning' as const }
  return { label: '待补充', tone: 'neutral' as const }
}

export function fiscalReceiptStatusPresentation(status: string): StatusPresentation {
  const states: Record<string, StatusPresentation> = {
    REQUESTED: { label: '开具处理中', tone: 'info' },
    ISSUED: { label: '已开具', tone: 'success' },
    FAILED: { label: '开具失败', tone: 'danger' },
    VOIDED: { label: '已作废', tone: 'neutral' },
    RED_FLUSHED: { label: '已红字冲红', tone: 'warning' },
  }
  return states[status] ?? { label: status, tone: 'neutral' }
}

/** Missing terminology is explicitly unknown, never implicitly western medicine. */
export function diagnosisDomainLabel(domain?: string | null): string {
  switch (domain) {
    case 'WESTERN_MEDICINE': return '西医诊断'
    case 'TCM_DISEASE': return '中医病名'
    case 'TCM_SYNDROME': return '中医证候'
    default: return '体系待确认'
  }
}
