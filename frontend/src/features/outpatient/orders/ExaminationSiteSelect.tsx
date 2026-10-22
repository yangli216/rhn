import type { ExaminationSiteOptions } from '../../../shared/api/encountersApi'
import { Select } from '../../../shared/ui'
import { maxSelectableSites } from './examinationSites'

/** 检查部位选择：只列出项目已启用的部位；单部位项目单选，多部位项目按上限多选。 */
export function ExaminationSiteSelect({ id, rule, value, onChange, disabled, invalid }: {
  id?: string
  rule: ExaminationSiteOptions
  value: string[]
  onChange: (sites: { code: string; name: string }[]) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const options = rule.sites.map(site => ({ value: site.code, label: site.name }))
  const pick = (codes: string[]) => onChange(codes.flatMap(code => {
    const site = rule.sites.find(item => item.code === code)
    return site ? [{ code: site.code, name: site.name }] : []
  }))
  const max = maxSelectableSites(rule)
  const placeholder = rule.bodySiteRequired ? '检查部位（必选）' : '检查部位'
  return max > 1
    ? <Select id={id} multiple size="sm" aria-label="检查部位" aria-required={rule.bodySiteRequired} aria-invalid={invalid}
      className="doctor-exam-site-select" disabled={disabled} value={value} options={options} placeholder={placeholder}
      onChange={codes => pick(codes.slice(0, max))} />
    : <Select id={id} size="sm" aria-label="检查部位" aria-required={rule.bodySiteRequired} aria-invalid={invalid}
      className="doctor-exam-site-select" disabled={disabled} value={value[0] ?? ''} options={options} placeholder={placeholder}
      onChange={code => pick(code ? [code] : [])} />
}
