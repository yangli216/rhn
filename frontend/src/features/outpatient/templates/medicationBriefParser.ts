export interface MedicationBrief {
  usage: string | null
  indication: string | null
  purpose: string | null
  caution: string | null
  advice: string | null
  other: string[]
}

const usageLabels = ['常规用法', '用法', '用法用量', '单次剂量']
const adviceLabels = ['嘱托', '医嘱', '嘱咐']
const labelFields: Array<{ field: keyof Omit<MedicationBrief, 'usage' | 'other'>; labels: string[] }> = [
  { field: 'indication', labels: ['适用条件', '适应证', '适用'] },
  { field: 'purpose', labels: ['目的', '用药目的'] },
  { field: 'caution', labels: ['不建议常规使用', '不建议使用', '慎用', '禁忌', '注意事项'] },
  { field: 'advice', labels: adviceLabels },
]
const ignoredLabels = ['规格', '每粒含量', '每片含量', '含量']
const usageHint = /口服|外用|静脉|静滴|肌注|肌内|皮下|吸入|滴眼|滴鼻|含服|舌下|雾化|\b(?:qd|bid|tid|qid|prn|qn|qod|q\d+h)\b|每日|每次|每天/i

const emptyAdvice = /^(?:无|无特殊(?:嘱托|要求)?|暂无)$/u
const clean = (value: string) => value.trim().replace(/[。；;\s]+$/u, '')

/** Splits the model-written medication note into the fields a doctor scans, without inventing any content. */
export function parseMedicationBrief(details?: string | null): MedicationBrief {
  const brief: MedicationBrief = { usage: null, indication: null, purpose: null, caution: null, advice: null, other: [] }
  const usageParts: string[] = []
  for (const segment of (details ?? '').split(/[；;\n]+|。(?=\s*[^：:。；;]{1,12}[：:])/u)) {
    const text = segment.trim()
    if (!text) continue
    const match = /^([^：:]{1,12})[：:]\s*(.*)$/u.exec(text)
    const label = match?.[1].trim()
    const value = clean(match?.[2] ?? text)
    if (!value) continue
    if (label && ignoredLabels.includes(label)) continue
    if (label && usageLabels.includes(label)) {
      usageParts.push(value)
      continue
    }
    if (label && adviceLabels.includes(label) && emptyAdvice.test(value)) continue
    const target = label ? labelFields.find(({ labels }) => labels.includes(label)) : undefined
    if (target) {
      brief[target.field] = brief[target.field] ? `${brief[target.field]}；${value}` : value
    } else if (!label && usageHint.test(value)) {
      usageParts.push(value)
    } else {
      brief.other.push(clean(text))
    }
  }
  brief.usage = usageParts.length ? usageParts.join(' · ') : null
  return brief
}
