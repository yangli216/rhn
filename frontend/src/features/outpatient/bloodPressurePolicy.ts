import { useQuery } from '@tanstack/react-query'
import type { BloodPressureRequirement } from '../../shared/api/encountersApi'
import type { RhnApi } from '../../shared/rhnApi'

/**
 * 血压测量要求以服务端为准（机构参数 outpatient.vital-signs.blood-pressure.requirement）。
 * 查询未完成或失败时前端不额外阻断，保存与诊毕仍由服务端校验。
 */
export function useBloodPressureRequirement(api: RhnApi, encounterId: string) {
  return useQuery({
    queryKey: ['encounter-blood-pressure-requirement', encounterId],
    queryFn: () => api.encounters.bloodPressureRequirement(encounterId),
    enabled: Boolean(encounterId),
    staleTime: 60_000,
  })
}

export function bloodPressureBlocksDraft(requirement: BloodPressureRequirement | undefined) {
  return Boolean(requirement?.required && requirement.enforceAt === 'DRAFT')
}

export function bloodPressureMissing(requirement: BloodPressureRequirement | undefined,
  value: { systolic?: number | null; diastolic?: number | null } | undefined) {
  return Boolean(requirement?.required && (value?.systolic == null || value?.diastolic == null))
}
