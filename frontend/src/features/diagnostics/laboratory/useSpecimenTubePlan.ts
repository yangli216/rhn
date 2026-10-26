import { useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'

/** 向后端试算所选申请的实际分管（容器与管数），与生成标本条码时采用同一套主数据规则。 */
export function useSpecimenTubePlan(api: RhnApi, tasks: DiagnosticExecutionTask[], enabled: boolean) {
  const key = tasks.map((item) => `${item.id}:${item.revision}`).sort()
  return useQuery({
    queryKey: ['diagnostic-specimen-plan', key],
    enabled: enabled && tasks.length > 0,
    retry: false,
    queryFn: async () => {
      const plan = await api.diagnostics.specimenPlan(tasks.map((item) => ({ taskId: item.id })))
      if (!plan || !Array.isArray(plan.groups) || plan.groups.some((group) => !Array.isArray(group.taskIds)
        || !Number.isInteger(group.tubeCount) || group.tubeCount <= 0)) throw new Error('分管试算数据不完整，请重新读取。')
      return plan
    },
  })
}
