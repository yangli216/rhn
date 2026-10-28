import type { DiagnosticExecutionTask, DiagnosticTaskStatus, LocalDiagnosticReportInput } from '../../../shared/api/diagnosticsApi'
import { requireDiagnosticReports } from '../../../shared/clinical/diagnosticResults'
import type { RhnApi } from '../../../shared/rhnApi'
import { diagnosticTaskStatusPresentation } from '../../../shared/presentation'

export type DiagnosticForm = { input: LocalDiagnosticReportInput; dirty: boolean; correction: boolean }
export type DiagnosticView = 'work' | 'specimens' | 'reports' | 'request' | 'images'

export function diagnosticStatusOptions(laboratory: boolean) {
  const statuses: DiagnosticTaskStatus[] = ['READY', ...(laboratory ? ['COLLECTED' as const] : []),
    'IN_PROGRESS', 'COMPLETED', 'EXCEPTION', 'WAITING_SETTLEMENT', 'CANCELLED']
  return [{ value: '', label: '全部状态' }, ...statuses.map((value) => ({ value, label: diagnosticTaskStatusPresentation(value, laboratory).label }))]
}

// Date pickers use the operator's local day; the API uses an exclusive instant boundary.
/** Default application-date window: the last 7 days including today, in local time. */
export function defaultDiagnosticDates(days = 7, now = new Date()) {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  return { from: fmt(start), to: fmt(now) }
}

export function diagnosticDateBoundary(value: string, nextDay = false) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + (nextDay ? 1 : 0)).toISOString()
}

export async function loadTaskReports(api: RhnApi, task: DiagnosticExecutionTask) {
  const values = requireDiagnosticReports(await api.diagnostics.reportsByRequest(task.requestId), task)
  if (task.status === 'COMPLETED' && !values.some((report) => report.id === task.reportId))
    throw new Error('未查询到对应报告，请核对任务完成记录。')
  return values
}
