import type { Encounter } from './model'
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

export interface StatusPresentation {
  label: string
  tone: SemanticTone
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
  if (value === 'ESCALATED') return { label: '已超时升级', tone: 'danger' }
  if (value === 'ACKNOWLEDGED') return { label: '已确认，待处置', tone: 'warning' }
  return { label: '待确认', tone: 'warning' }
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
