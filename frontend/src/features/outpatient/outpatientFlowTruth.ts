import type { OutpatientFlowBoard, OutpatientFlowStage, OutpatientFlowStatus } from '../../shared/api/outpatientFlowApi'

const flowStatuses = new Set<OutpatientFlowStatus>(['WAITING_CONSULTATION', 'IN_CONSULTATION', 'CONSULTATION_SUSPENDED',
  'WAITING_COORDINATION', 'WAITING_TRANSFER', 'WAITING_SETTLEMENT', 'WAITING_PHARMACY', 'WAITING_DIAGNOSTICS',
  'WAITING_TREATMENT', 'DOWNSTREAM_IN_PROGRESS', 'EXCEPTION', 'COMPLETED', 'TRANSFERRED', 'TERMINATED', 'CANCELLED'])
const clinicalStages = { REGISTERED: 'WAITING', IN_PROGRESS: 'IN_PROGRESS', SUSPENDED: 'BLOCKED',
  COMPLETED: 'COMPLETED', TRANSFERRED: 'COMPLETED', TERMINATED: 'CANCELLED', CANCELLED: 'CANCELLED' } as const
const stageCodes = new Set(['CLINICAL', 'BILLING', 'PHARMACY', 'DIAGNOSTICS', 'TREATMENT', 'COORDINATION'])
const stageStatuses = new Set(['WAITING', 'IN_PROGRESS', 'BLOCKED', 'EXCEPTION', 'COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED'])
const terminalStages = new Set(['COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED'])
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const time = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value))
const route = (value: unknown) => value == null || (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//'))

function validStage(stage: OutpatientFlowStage): boolean {
  return !!stage && stageCodes.has(stage.stageCode) && stageStatuses.has(stage.status)
    && text(stage.stageName) && text(stage.statusText) && count(stage.totalCount) && stage.totalCount > 0
    && count(stage.pendingCount) && stage.pendingCount <= stage.totalCount
    && (!terminalStages.has(stage.status) || stage.pendingCount === 0)
    && (!['RETURNED', 'PARTIALLY_RETURNED'].includes(stage.status) || stage.stageCode === 'PHARMACY')
    && route(stage.routePath)
}

/** Reject incomplete or contradictory snapshots instead of presenting invented zero counts or completion. */
export function requireOutpatientFlowBoard(board: OutpatientFlowBoard, expectedBusinessDate?: string): OutpatientFlowBoard {
  if (!board || !board.summary || !Array.isArray(board.visits) || !time(board.refreshedAt)
    || !text(board.businessDate) || !/^\d{4}-\d{2}-\d{2}$/.test(board.businessDate)
    || (expectedBusinessDate && board.businessDate !== expectedBusinessDate)) {
    throw new Error('门诊流转资料未完整返回或日期不匹配，请重新加载。')
  }
  const expected = { totalCount: board.visits.length, waitingConsultationCount: 0, inConsultationCount: 0,
    downstreamPendingCount: 0, exceptionCount: 0, completedCount: 0 }
  const encounterIds = new Set<string>()
  for (const visit of board.visits) {
    if (!visit || !text(visit.encounterId) || encounterIds.has(visit.encounterId) || !text(visit.residentId)
      || !text(visit.encounterNo) || !text(visit.residentName) || !flowStatuses.has(visit.flowStatus)
      || !Object.hasOwn(clinicalStages, visit.clinicalStatus) || !text(visit.flowStatusText)
      || !text(visit.nextDestination) || !text(visit.attentionReason) || !time(visit.registeredAt)
      || (visit.startedAt != null && !time(visit.startedAt)) || (visit.clinicalCompletedAt != null && !time(visit.clinicalCompletedAt))
      || (visit.pendingSince != null && !time(visit.pendingSince)) || !count(visit.pendingMinutes)
      || typeof visit.outstandingAmount !== 'number' || !Number.isFinite(visit.outstandingAmount) || visit.outstandingAmount < 0
      || !route(visit.nextRoute) || (visit.nextRoute != null && !text(visit.nextActionText))
      || !Array.isArray(visit.stages) || visit.stages.some(stage => !validStage(stage))) {
      throw new Error('患者流转状态或业务凭据不完整，暂不能确认去向。')
    }
    encounterIds.add(visit.encounterId)
    const clinical = visit.stages.find(stage => stage.stageCode === 'CLINICAL')
    if (!clinical || clinical.status !== clinicalStages[visit.clinicalStatus]
      || new Set(visit.stages.map(stage => stage.stageCode)).size !== visit.stages.length) {
      throw new Error('门诊状态与环节明细不一致，请重新核对。')
    }
    if (visit.flowStatus === 'COMPLETED' && (visit.clinicalStatus !== 'COMPLETED' || visit.outstandingAmount !== 0
      || visit.stages.some(stage => !terminalStages.has(stage.status) || stage.pendingCount !== 0))) {
      throw new Error('仍有未完成环节或待收费用，不能确认流程完成。')
    }
    if (visit.nextRoute) {
      const params = new URL(visit.nextRoute, 'https://rhn.invalid').searchParams
      if ((params.has('encounterId') && params.get('encounterId') !== visit.encounterId)
        || (params.has('residentId') && params.get('residentId') !== visit.residentId)) {
        throw new Error('流转操作入口与患者或就诊不匹配，暂不能跳转。')
      }
    }
    switch (visit.flowStatus) {
      case 'WAITING_CONSULTATION': case 'CONSULTATION_SUSPENDED': case 'WAITING_COORDINATION': case 'WAITING_TRANSFER':
        expected.waitingConsultationCount++; break
      case 'IN_CONSULTATION': expected.inConsultationCount++; break
      case 'EXCEPTION': expected.exceptionCount++; break
      case 'COMPLETED': case 'TRANSFERRED': case 'TERMINATED': case 'CANCELLED': expected.completedCount++; break
      default: expected.downstreamPendingCount++
    }
  }
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (!count(board.summary[key]) || board.summary[key] !== expected[key]) {
      throw new Error('门诊统计与患者明细不一致，不能按零人数或完成数展示。')
    }
  }
  return board
}
