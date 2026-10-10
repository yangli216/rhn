import { normalizeDiagnosisOrder } from "../record/clinicalRecordDraft";
import { type Dispatch, type SetStateAction } from "react";
import type { ClinicalRecordInput, DiagnosisInput, MedicationSafetyDecision, MedicationSafetyFinding, ServiceRequest } from "../../../shared/api/encountersApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { ReceptionQueueItem } from "../../../shared/api/schedulingApi";
import type { Resident } from "../../../shared/model";
import { age, formatTime } from "../../../shared/format";
import { Button, Icon, StatusBadge, Tooltip } from "../../../shared/ui";
import type { MedicationPlanDraft } from "../orders/medicationDraft";

export const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export function commandCode(action: string, encounterId: string) {
  return `${action}-${encounterId}-${globalThis.crypto.randomUUID()}`
}

export interface PatientSelection {
  resident: Resident
  encounterId: string | null
  entryIntent: 'READ' | 'EDIT'
}

export type QueueCommand = 'call' | 'recall' | 'miss' | 'requeue'

export interface EncounterDraftState {
  recordChanged: boolean
  diagnosesChanged: boolean
  medicationDraftCount: number
  serviceDraftCount: number
  busy: boolean
}

export const emptyDraftState: EncounterDraftState = {
  recordChanged: false, diagnosesChanged: false, medicationDraftCount: 0, serviceDraftCount: 0, busy: false,
}

export function draftStateLabels(value: EncounterDraftState) {
  const labels: string[] = []
  if (value.recordChanged) labels.push('尚未保存的病历内容')
  if (value.diagnosesChanged) labels.push('尚未保存的诊断调整')
  if (value.medicationDraftCount) labels.push(`${value.medicationDraftCount} 条待确认药品医嘱`)
  if (value.serviceDraftCount) labels.push(`${value.serviceDraftCount} 条待确认诊疗项目`)
  return labels
}

export function queueEntryLabel(status: ReceptionQueueItem['status']) {
  if (status === 'SERVING') return '继续接诊'
  if (status === 'SUSPENDED') return '恢复接诊'
  return '接诊'
}

export function QueueRow({ item, busy, canEdit, onEnter, onView }: {
  item: ReceptionQueueItem; busy: boolean; canEdit: boolean; onEnter: () => void; onView: () => void
}) {
  const entryLabel = queueEntryLabel(item.status)
  return <article className="doctor-queue-row">
    <span className="doctor-queue-ticket">{item.ticketNo}</span>
    <span className="doctor-queue-patient"><strong>{item.residentName}</strong><small>{item.genderText ?? '未知'} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
    <span className="doctor-queue-service"><strong>{item.serviceName || '普通门诊'}</strong><small>{item.practitionerName || '现场接诊'}{item.locationName ? ` · ${item.locationName}` : ''}</small></span>
    <span className="doctor-queue-time"><strong>{formatTime(item.registeredAt)}</strong><small>挂号时间</small></span>
    <StatusBadge tone={item.status === 'SERVING' ? 'success' : 'warning'}>
      {item.status === 'SERVING' ? '接诊中' : item.status === 'SUSPENDED' ? '已暂挂' : '候诊'}</StatusBadge>
    <span className="doctor-queue-actions">
      <Button size="sm" variant="text" disabled={busy} aria-label={`查看 ${item.residentName}`} onClick={onView}>查看</Button>
      <Button size="sm" busy={busy} disabled={!canEdit} title={canEdit ? `${entryLabel}${item.residentName}` : '当前账号没有病历编辑权限'}
        aria-label={`${entryLabel} ${item.residentName}`} onClick={onEnter}>{entryLabel}</Button>
    </span>
  </article>
}

export type WorkTool = 'assistant' | 'plans' | 'history' | 'results' | 'coordination' | 'allergy' | 'prints'

export type GuardedPatientAction = 'queue' | 'suspend' | 'complete' | 'terminate'

export type HistoryRecordField = 'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'

export type HistoryCopyField = HistoryRecordField | `diagnosis:${string}`

export type HistoryCopyRecord = Partial<Pick<ClinicalRecordInput,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'>>

export interface HistoryCopyDraft {
  targetEncounterId?: string
  targetResidentId?: string
  medicationDrafts?: MedicationPlanDraft[]
  requestId: number
  sourceEncounterNo: string
  sourceRegisteredAt: string
  record: HistoryCopyRecord
  diagnoses?: DiagnosisInput[]
}

export function AllergyContextValue({ allergies, loading, error, disabled, onClick }: {
  allergies: AllergyIntolerance[]; loading: boolean; error: unknown; disabled: boolean; onClick: () => void
}) {
  const actual = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const noKnown = allergies.some((item) => item.assertionType !== 'ALLERGY')
  const tone = error ? 'error' : actual.length ? 'risk' : noKnown ? 'clear' : 'unknown'
  const summary = loading ? '加载中…' : error ? '读取失败' : actual.length
    ? `${actual.slice(0, 2).map((item) => item.substanceDisplay).join('、')}${actual.length > 2 ? `等${actual.length}项` : ''}`
    : noKnown ? '无已知药物过敏' : '尚未核对'
  return <Tooltip content={`${summary}；点击查看和维护`}>
    <Button variant="text" size="sm" type="button" className={`doctor-context-allergy is-${tone}`} disabled={disabled}
      aria-label={`过敏信息：${summary}，点击查看和维护`} onClick={onClick}>
      <span>{summary}</span><Icon name="chevron-right" />
    </Button>
  </Tooltip>
}

export function toggleTool(current: WorkTool | null, next: WorkTool): WorkTool | null {
  return current === next ? null : next
}

export function toolLabel(value: WorkTool) {
  return ({ assistant: '智医助理', plans: '临床模板', history: '就诊历史', results: '检验检查结果', coordination: '协同业务',
    allergy: '过敏信息', prints: '就诊文书' } as const)[value]
}

export function ToolButton({ icon, label, active, onClick }: {
  icon: 'sparkles' | 'stethoscope' | 'roadmap' | 'clinical' | 'tasks' | 'organization' | 'print'; label: string; active: boolean; onClick: () => void
}) {
  const labelLines = Array.from({ length: Math.ceil(label.length / 2) }, (_, index) => label.slice(index * 2, index * 2 + 2))
  return <Button variant={active ? 'secondary' : 'text'} aria-label={label}
    aria-pressed={active} title={label} onClick={onClick}>
    <Icon name={icon} /><span className="doctor-tool-label" aria-hidden="true">
      {labelLines.map(line => <span key={line}>{line}</span>)}
    </span>
  </Button>
}

export function stageTemplateDiagnoses(values: DiagnosisInput[], currentDiagnoses: DiagnosisInput[], setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>) {
  const diagnosisCodes = new Set(currentDiagnoses.map(item => item.code.toUpperCase()))
  const hasPrimary = currentDiagnoses.some(item => item.type === 'PRIMARY')
  setDiagnoses(current => normalizeDiagnosisOrder([...current, ...values
    .filter(item => !diagnosisCodes.has(item.code.toUpperCase()))
    .map(item => ({ ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type }))]))
}

export function medicationDraftKey(item: MedicationPlanDraft) {
  return [item.request.medicationId ?? '', item.request.catalogItemId ?? '', item.request.routeCode ?? '',
    item.request.frequencyCode ?? ''].join('|')
}

export const medicationSafetyRuleNames: Record<string, string> = {
  'QMED.AGE_CONTRAINDICATION': '儿童及特定年龄禁忌用药核对',
  'QMED.ANTIMICROBIAL_OUTPATIENT': '门诊抗菌药物疗程核对',
  'QMED.DRUG_ALLERGY': '药物过敏风险核对',
  'QMED.DISULFIRAM_INTERACTION': '双硫仑样反应配伍禁忌核对',
  'QMED.EXACT_GENERIC_DUPLICATE': '同通用名重复用药核对',
  'QMED.NSAID_DUPLICATE': '非甾体抗炎药重复用药核对',
  'QMED.SKIN_TEST': '皮试要求核对',
}

export function medicationSafetySeverityLabel(severity: MedicationSafetyFinding['severity']) {
  return ({ INFO: '提示', LOW: '低风险', MODERATE: '中风险', HIGH: '高风险', CRITICAL: '极高风险' })[severity]
}

export function medicationSafetyDecisionLabel(decision: MedicationSafetyDecision['decision']) {
  return ({ PASS: '通过', WARN: '警告', REQUIRE_OVERRIDE: '需说明理由', BLOCK: '阻断', UNAVAILABLE: '评价不可用' })[decision]
}

export function needsMedicationSafetyAcknowledgement(value: MedicationSafetyDecision) {
  return value.decision !== 'PASS' || value.findings.length > 0 || value.failureCodes.length > 0
    || (value.mode !== 'SHADOW' && !value.evaluationId)
}

export function medicationSafetyBlocksSubmission(value: MedicationSafetyDecision) {
  return value.mode !== 'SHADOW'
    && (value.decision === 'BLOCK' || value.decision === 'UNAVAILABLE' || !value.evaluationId)
}

export function medicationSafetyNeedsReason(value: MedicationSafetyDecision) {
  return value.mode !== 'SHADOW' && value.decision === 'REQUIRE_OVERRIDE'
}

export function medicationSafetyReviewKey(reviews: MedicationSafetyDecision[]) {
  // Evaluation/finding IDs and the formal rule-set label are regenerated on each check.
  // Compare clinical input and displayed results so a changed prescription must be reviewed again.
  return JSON.stringify(reviews.map(({ evaluationId, ruleSetVersion, findings, ...review }) => ({
    ...review, recorded: Boolean(evaluationId),
    findings: findings.map(({ findingId, ...finding }) => finding),
  })))
}

export function prescriptionReviewTitle(categoryCode: string, index: number) {
  const prefix = categoryCode === 'HERBAL' ? '草' : categoryCode === 'CHINESE_PATENT' ? '成' : '西'
  return `${prefix}${index}`
}

export function serviceReviewTitle(serviceType: ServiceRequest['serviceType'], index: number) {
  const prefix = serviceType === 'LABORATORY' ? '检' : serviceType === 'EXAMINATION' ? '查'
    : serviceType === 'TREATMENT' ? '治' : '处'
  return `${prefix}${index}`
}
