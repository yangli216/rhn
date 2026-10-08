import type { CareTaskEvidenceEvent, HypertensionCandidate } from '../../shared/api/healthPlanningApi'

const taskStatuses = ['PLANNED', 'READY', 'IN_PROGRESS', 'WAITING_EXTERNAL', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ESCALATED']
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const instant = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
const unique = (values: string[]) => new Set(values).size === values.length

export function isOpenCareTask(value: HypertensionCandidate) {
  return value.status !== 'COMPLETED' && value.status !== 'CANCELLED'
}

export function latestCareEvidence(value: HypertensionCandidate) {
  return value.evidenceEvents.reduce<CareTaskEvidenceEvent | undefined>((latest, event) =>
    !latest || Date.parse(event.evidence.measuredAt) >= Date.parse(latest.evidence.measuredAt) ? event : latest, undefined)
}

/** Validate facts supplied by the screening service, without manufacturing clinical conclusions. */
export function requireCareCandidates(values: HypertensionCandidate[]): HypertensionCandidate[] {
  if (!Array.isArray(values) || values.some((item) => !item
    || ![item.taskId, item.taskCode, item.residentId, item.residentName, item.encounterId,
      item.conditionId, item.conditionCode, item.conditionName, item.organizationId, item.departmentId, item.title].every(text)
    || !Number.isInteger(item.revision) || item.revision < 0
    || !taskStatuses.includes(item.status) || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(item.priority)
    || !['SUSPECTED', 'CONFIRMED', 'REFUTED'].includes(item.verificationStatus)
    || !instant(item.dueAt) || !instant(item.createdAt)
    || !Array.isArray(item.evidenceEvents) || item.evidenceEvents.length === 0
    || item.evidenceEvents.some((event) => {
      if (!event || ![event.id, event.commandCode, event.resultDescription, event.ruleCode, event.ruleVersion].every(text)
        || !['CREATE', 'EVIDENCE_RECORDED'].includes(event.eventType)
        || !instant(event.occurredAt) || typeof event.evidenceHash !== 'string' || !/^[a-f\d]{64}$/i.test(event.evidenceHash)) return true
      const evidence = event.evidence
      if (!evidence || evidence.contractVersion !== 'RHN.HYPERTENSION_SCREENING_EVIDENCE.V1'
        || evidence.diagnosticMeaning !== 'CANDIDATE_NOT_DIAGNOSIS'
        || !['SUSPECTED', 'URGENT_RECHECK'].includes(evidence.decision)
        || !Number.isInteger(evidence.residentAge) || evidence.residentAge < 18
        || !text(evidence.encounterId) || !instant(evidence.measuredAt) || !instant(evidence.recheckDueAt)
        || !evidence.rule || evidence.rule.code !== event.ruleCode || evidence.rule.version !== event.ruleVersion
        || ![evidence.rule.guidanceVersion, evidence.rule.standard].every(text)
        || !evidence.thresholds || ![evidence.thresholds.systolic, evidence.thresholds.diastolic,
          evidence.thresholds.severeSystolic, evidence.thresholds.severeDiastolic].every(positive)) return true
      return [evidence.systolic, evidence.diastolic].some((observation) => !observation
        || ![observation.id, observation.system, observation.code, observation.unit].every(text)
        || !positive(observation.value)) || evidence.systolic.unit !== evidence.diastolic.unit
    }) || !unique(item.evidenceEvents.map((event) => event.id)))
    || !unique(values.map((item) => item.taskId))) {
    throw new Error('候选任务或识别证据不完整，无法确认复查状态，请重新查询并核对原始记录')
  }
  if (values.some((item) => isOpenCareTask(item) && item.evidenceEvents.some((event) =>
    event.evidence.decision === 'URGENT_RECHECK' && (item.priority !== 'URGENT'
      || Date.parse(item.dueAt) > Date.parse(event.evidence.measuredAt))))) {
    throw new Error('存在紧急复测证据，但任务优先级或时限未同步，请核对原始任务')
  }
  return values
}
