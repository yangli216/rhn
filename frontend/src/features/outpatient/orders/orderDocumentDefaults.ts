import type { Encounter, Diagnosis } from '../../../shared/model'
import type { OrderDocumentInfo } from '../../../shared/api/encountersApi'

export function getPrimaryDiagnosis(encounter: Encounter): Diagnosis | undefined {
  if (!encounter.diagnoses || encounter.diagnoses.length === 0) return undefined
  return encounter.diagnoses.find((d) => d.type === 'PRIMARY') || encounter.diagnoses[0]
}

export function buildDefaultDocumentInfo(
  encounter: Encounter,
  kind: 'prescription' | 'service',
  examinationPurpose = ''
): OrderDocumentInfo {
  const primary = getPrimaryDiagnosis(encounter)
  return {
    diagnoses: primary ? [{ code: primary.code, display: primary.display, primary: true }] : [],
    externalPrescription: false,
    specialDisease: '',
    examinationPurpose: kind === 'service' ? examinationPurpose : '',
  }
}

export function checkDocumentInfoMissing(
  info?: OrderDocumentInfo | null,
  kind: 'prescription' | 'service' = 'prescription'
): string[] {
  if (!info) return kind === 'service' ? ['关联诊断', '检查目的'] : ['关联诊断']
  const missing: string[] = []
  if (!info.diagnoses || info.diagnoses.length === 0) {
    missing.push('关联诊断')
  }
  if (kind === 'service' && (!info.examinationPurpose || !info.examinationPurpose.trim())) {
    missing.push('检查目的')
  }
  return missing
}
