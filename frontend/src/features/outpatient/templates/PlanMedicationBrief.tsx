import { parseMedicationBrief, type MedicationBrief } from './medicationBriefParser'

type BriefField = keyof Omit<MedicationBrief, 'usage' | 'other'>

// 药品的适用条件与慎用已包含在药品说明书中，不重复展示；检验检查没有说明书，开立条件需要直接可见。
const fieldsByVariant: Record<'medication' | 'service', Array<{ field: BriefField; label: string }>> = {
  medication: [
    { field: 'purpose', label: '目的' },
    { field: 'advice', label: '嘱托' },
  ],
  service: [
    { field: 'purpose', label: '目的' },
    { field: 'indication', label: '开立条件' },
    { field: 'caution', label: '不建议' },
  ],
}

/** One wrapping paragraph: usage first (medication), then the plan-specific notes as inline label/value pairs. */
export function PlanMedicationBrief({ details, variant = 'medication' }: {
  details?: string | null
  variant?: 'medication' | 'service'
}) {
  const brief = parseMedicationBrief(details)
  const entries = fieldsByVariant[variant].flatMap(({ field, label }) => brief[field] ? [{ field, label, value: brief[field] }] : [])
  if (!brief.usage && !entries.length && !brief.other.length) return null
  return (
    <p className="ai-plan-med-brief" aria-label={variant === 'service' ? '检验检查说明' : '临床用药说明'}>
      {brief.usage && (
        <span className="ai-plan-med-brief__seg ai-plan-med-brief__seg--usage">
          <b>用法</b><strong>{brief.usage}</strong>
        </span>
      )}
      {entries.map(({ field, label, value }) => (
        <span key={field} className={`ai-plan-med-brief__seg ai-plan-med-brief__seg--${field}`}>
          <b>{label}</b>{value}
        </span>
      ))}
      {brief.other.map((text) => (
        <span key={text} className="ai-plan-med-brief__seg"><b>备注</b>{text}</span>
      ))}
    </p>
  )
}
