import type { DiagnosticObservation, DiagnosticReport } from '../api/diagnosticsApi'

const valueFields = ['valueString', 'valueNumber', 'valueBoolean', 'valueCode', 'valueDateTime'] as const
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', timeZoneName: 'short',
})

/** Read the declared value only. A missing boolean is not false and conflicting fields are not alternatives. */
export function diagnosticObservationValue(value: DiagnosticObservation): string {
  const populated = valueFields.filter((field) => value[field] != null
    && !(typeof value[field] === 'string' && !value[field].trim()))
  if (populated.length === 0) return '结果缺失'
  if (populated.length !== 1) return '结果数据异常，请核对'
  switch (value.valueType) {
    case 'NUMBER':
      if (typeof value.valueNumber === 'number' && Number.isFinite(value.valueNumber)) return String(value.valueNumber)
      break
    case 'STRING':
      if (typeof value.valueString === 'string' && value.valueString.trim()) return value.valueString
      break
    case 'CODE':
      if (typeof value.valueCode === 'string' && value.valueCode.trim()) return value.valueCode
      break
    case 'BOOLEAN':
      if (typeof value.valueBoolean === 'boolean') return value.valueBoolean ? '是' : '否'
      break
    case 'DATETIME':
      if (typeof value.valueDateTime === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.valueDateTime)
        && Number.isFinite(Date.parse(value.valueDateTime))) {
        return dateTime.format(new Date(value.valueDateTime))
      }
      break
  }
  return '结果数据异常，请核对'
}

export function requireDiagnosticReports(result: DiagnosticReport[], scope: {
  encounterId: string; residentId: string; requestId?: string
}): DiagnosticReport[] {
  if (!Array.isArray(result) || result.some((report) => !report
    || report.encounterId !== scope.encounterId || report.residentId !== scope.residentId
    || (scope.requestId !== undefined && report.requestId !== scope.requestId)
    || !['PRELIMINARY', 'FINAL', 'CORRECTED', 'CANCELLED'].includes(report.status)
    || !Array.isArray(report.observations) || report.observations.some((item) => !item
      || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.observationName !== 'string' || !item.observationName.trim()))) {
    throw new Error('报告结果不完整或与当前患者、申请不一致，请重新查询')
  }
  return result
}
