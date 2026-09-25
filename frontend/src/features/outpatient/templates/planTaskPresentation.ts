import type { OutpatientPlanTask } from '../../../shared/api/outpatientPlanTemplatesApi'

export const planTaskKindLabel: Record<OutpatientPlanTask['kind'], string> = {
  DIAGNOSIS: '诊断',
  MEDICATION: '用药',
  LABORATORY: '检验',
  EXAMINATION: '检查',
  EDUCATION: '宣教',
  FOLLOW_UP: '随访',
  CONDITION: '适用条件',
}

export function planSourceReferenceLabel(value: string): string {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const name = parsed.nameSuppliedByUser ?? parsed.guidelineName
    const year = parsed.versionSuppliedByUser ?? parsed.versionYear
    if (typeof name === 'string' && name.trim()) {
      return `${name}${typeof year === 'string' && year.trim() ? `（${year}）` : ''}`
    }
  } catch {
    // Older templates may contain plain text rather than source metadata JSON.
  }
  return value
}
