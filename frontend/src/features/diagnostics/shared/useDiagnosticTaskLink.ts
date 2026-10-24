import { useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'

/** Historical correction links load one authorized task without widening the active queue. */
export function useDiagnosticTaskLink(api: RhnApi, taskId: string | null, scope: string,
  requireTask: (task: DiagnosticExecutionTask) => DiagnosticExecutionTask) {
  return useQuery({ queryKey: ['diagnostic-linked-task', scope, taskId], enabled: Boolean(taskId),
    queryFn: async () => requireTask(await api.diagnostics.task(taskId!)) })
}

export function includeLinkedDiagnosticTask(tasks: DiagnosticExecutionTask[], linked?: DiagnosticExecutionTask) {
  return linked && !tasks.some((task) => task.id === linked.id) ? [linked, ...tasks] : tasks
}
