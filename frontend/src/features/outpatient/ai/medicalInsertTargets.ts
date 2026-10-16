import type { MedicalInsertTarget } from './MedicalInsertViewerModal'

export type ServiceInsertType = 'laboratory' | 'examination'

/** Only laboratory and examination items have a clinical-knowledge insert; treatments and others do not. */
export function serviceInsertType(serviceType?: string | null): ServiceInsertType | null {
  if (serviceType === 'LABORATORY') return 'laboratory'
  if (serviceType === 'EXAMINATION') return 'examination'
  return null
}

export function serviceInsertTarget(name: string | undefined | null, serviceType?: string | null): MedicalInsertTarget | null {
  const type = serviceInsertType(serviceType)
  const trimmed = name?.trim()
  return type && trimmed ? { name: trimmed, type } : null
}

export const serviceInsertLabel: Record<ServiceInsertType, string> = { laboratory: '检验', examination: '检查' }
