import type { CriticalValueAlert } from '../api/diagnosticsApi'
import { isIsoInstant as instant } from '../validation/instant'

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

export function requireActiveCriticalValues(values: CriticalValueAlert[]): CriticalValueAlert[] {
  const ids = new Set<string>()
  if (!Array.isArray(values) || values.some((value) => {
    if (!value || !nonempty(value.id) || ids.has(value.id)) return true
    ids.add(value.id)
    if (![value.reportId, value.observationId, value.residentId, value.encounterId, value.requestId,
      value.organizationId, value.departmentId, value.recipientUserId, value.observationCode,
      value.observationName, value.triggerEvidence].every(nonempty)
      || !Number.isSafeInteger(value.revision) || value.revision < 0
      || value.severity !== 'CRITICAL' || !['OPEN', 'ESCALATED', 'ACKNOWLEDGED'].includes(value.status)
      || !instant(value.detectedAt) || !instant(value.acknowledgeDeadlineAt)
      || Date.parse(value.acknowledgeDeadlineAt) < Date.parse(value.detectedAt)
      || !Number.isSafeInteger(value.escalationLevel) || value.escalationLevel < 0
      || (value.status === 'ESCALATED' && value.escalationLevel === 0)
      || (value.status === 'OPEN' && value.escalationLevel !== 0)
      || value.closedAt != null || value.closedBy != null || value.dispositionCode != null
      || value.supersededByReportId != null
      || (value.acknowledgeNote != null && typeof value.acknowledgeNote !== 'string')) return true
    return value.status === 'ACKNOWLEDGED'
      ? !nonempty(value.acknowledgedBy) || !instant(value.acknowledgedAt)
        || Date.parse(value.acknowledgedAt!) < Date.parse(value.detectedAt)
      : value.acknowledgedBy != null || value.acknowledgedAt != null
  })) throw new Error('危急值数据不完整或状态与凭据不一致，请重新加载核实。')
  return values
}
