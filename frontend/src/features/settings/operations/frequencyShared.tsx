import { Button } from '../../../shared/ui'
import type { OrderFrequency, OrderFrequencyInput, OrderFrequencyRuleType } from "../../../shared/rhnApi";
import { Icon } from "../../../shared/ui";

export type FrequencyDraft = {
  code: string; name: string; shortName: string; description: string; ruleType: OrderFrequencyRuleType
  frequencyCount: string; periodValue: string; periodUnit: string; anchorType: string; defaultExecutionTimes: string
  outpatientApplicable: boolean; inpatientApplicable: boolean; emergencyApplicable: boolean
  medicationApplicable: boolean; treatmentApplicable: boolean; nursingApplicable: boolean
  automaticTaskGeneration: boolean; sortOrder: string; status: string; validFrom: string; validTo: string
}

export const frequencyTemplates: Array<{ id: string; title: string; copy: string; values: Partial<FrequencyDraft> }> = [
  { id: 'DAILY', title: '每日定时', copy: '每日一次或多次，如 QD/BID/TID', values: { ruleType: 'TIMES_PER_PERIOD',
    frequencyCount: '2', periodValue: '1', periodUnit: 'D', anchorType: 'STANDARD_TIME', defaultExecutionTimes: '08:00,20:00',
    outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true,
    treatmentApplicable: true, nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'INTERVAL', title: '固定间隔', copy: '从开立时间起每隔若干小时执行', values: { ruleType: 'FIXED_INTERVAL',
    frequencyCount: '1', periodValue: '6', periodUnit: 'H', anchorType: 'ORDER_START', defaultExecutionTimes: '',
    outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true,
    treatmentApplicable: true, nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'ONCE', title: '单次执行', copy: '仅执行一次或立即执行', values: { ruleType: 'ONCE', frequencyCount: '1',
    periodValue: '1', periodUnit: 'D', anchorType: 'ORDER_START', defaultExecutionTimes: '', outpatientApplicable: true,
    inpatientApplicable: true, emergencyApplicable: true, medicationApplicable: true, treatmentApplicable: true,
    nursingApplicable: false, automaticTaskGeneration: true } },
  { id: 'PRN', title: '必要时', copy: '由临床事件触发，不预生成任务', values: { ruleType: 'PRN', anchorType: 'EVENT',
    defaultExecutionTimes: '', outpatientApplicable: true, inpatientApplicable: true, emergencyApplicable: true,
    medicationApplicable: true, treatmentApplicable: true, nursingApplicable: true, automaticTaskGeneration: false } },
  { id: 'CONTINUOUS', title: '持续执行', copy: '持续输注、监护或治疗', values: { ruleType: 'CONTINUOUS', anchorType: 'ORDER_START',
    defaultExecutionTimes: '', outpatientApplicable: false, inpatientApplicable: true, emergencyApplicable: true,
    medicationApplicable: true, treatmentApplicable: true, nursingApplicable: true, automaticTaskGeneration: false } },
]

export function FrequencyTimeEditor({ value, onChange, inheritLabel, inheritTimes = [] }: {
  value: string[]; onChange: (value: string[]) => void; inheritLabel?: string; inheritTimes?: string[]
}) {
  const update = (index: number, next: string) => onChange(value.map((item, current) => current === index ? next : item)
    .filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).sort())
  const add = () => {
    if (!value.length && inheritTimes.length) { onChange([...inheritTimes].sort()); return }
    const minutes = value.map((item) => Number(item.slice(0, 2)) * 60 + Number(item.slice(3, 5))).sort((a, b) => a - b)
    let nextMinutes = 8 * 60
    if (minutes.length) {
      let gapStart = minutes[0]; let gapSize = -1
      for (let index = 0; index < minutes.length; index += 1) {
        const start = minutes[index]; const end = index === minutes.length - 1 ? minutes[0] + 24 * 60 : minutes[index + 1]
        if (end - start > gapSize) { gapStart = start; gapSize = end - start }
      }
      nextMinutes = Math.round((gapStart + gapSize / 2) / 30) * 30 % (24 * 60)
    }
    const next = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`
    onChange([...value, next].filter((item, index, all) => all.indexOf(item) === index).sort())
  }
  return <div className="frequency-time-editor">
    {value.map((time, index) => <span key={`${time}-${index}`}><input type="time" aria-label={`执行时点 ${index + 1}`} value={time}
      onChange={(event) => update(index, event.target.value)} /><Button type="button" aria-label={`移除执行时点 ${time}`}
        onClick={() => onChange(value.filter((_, current) => current !== index))} variant="text" size="sm">×</Button></span>)}
    <Button type="button" className="frequency-time-editor__add" onClick={add} variant="text" size="sm"><Icon name="add" />
      {!value.length && inheritTimes.length ? '基于主档调整' : '添加时点'}</Button>
    {!value.length && inheritLabel && <small>{inheritLabel}</small>}
  </div>
}

export function FrequencyDraftPreview({ form, compact = false, className = '' }: { form: FrequencyDraft; compact?: boolean; className?: string }) {
  return <aside className={`frequency-draft-preview${compact ? ' is-compact' : ''} ${className}`}>
    <div><span>规则解释</span><strong>{frequencyDraftRuleLabel(form)}</strong><small>{frequencyDraftScopeLabel(form)}</small></div>
    <div><span>执行能力</span><strong>由结构化预演核对</strong><small>{form.automaticTaskGeneration ? '已开启生成意图；能否生成还取决于周期、锚点和日期规则是否完整' : '不自动预生成固定任务'}</small></div>
  </aside>
}

export function frequencyExecutionTimes(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function frequencyDraftRuleLabel(form: FrequencyDraft) {
  const times = frequencyExecutionTimes(form.defaultExecutionTimes)
  if (form.ruleType === 'ONCE') return '按医嘱开始时间执行一次'
  if (form.ruleType === 'TIMES_PER_PERIOD') return `每 ${form.periodValue || 1} ${periodUnitLabel(form.periodUnit)}执行 ${times.length} 次${times.length ? `（${times.join('、')}）` : ''}`
  if (form.ruleType === 'FIXED_INTERVAL') return `从医嘱开始时间起，每 ${form.periodValue || 1} ${periodUnitLabel(form.periodUnit)}执行一次`
  if (form.ruleType === 'CALENDAR') return `按标准时点执行${times.length ? `（${times.join('、')}）` : ''}`
  if (form.ruleType === 'PRN') return '必要时执行，不预先生成固定任务'
  return '持续执行，由业务过程控制开始和停止'
}

export function frequencyDraftScopeLabel(form: FrequencyDraft) {
  const scenes = [form.outpatientApplicable && '门诊', form.inpatientApplicable && '住院', form.emergencyApplicable && '急诊'].filter(Boolean)
  const orders = [form.medicationApplicable && '药品', form.treatmentApplicable && '治疗', form.nursingApplicable && '护理'].filter(Boolean)
  return `${scenes.join('、') || '未选择场景'} · ${orders.join('、') || '未选择医嘱类型'}`
}

export function frequencyDraftInput(form: FrequencyDraft): OrderFrequencyInput {
  const ruleType = form.ruleType, usesPeriod = ['TIMES_PER_PERIOD', 'FIXED_INTERVAL'].includes(ruleType)
  const usesTimes = ['TIMES_PER_PERIOD', 'CALENDAR'].includes(ruleType), times = frequencyExecutionTimes(form.defaultExecutionTimes)
  return { code: form.code, name: form.name, shortName: form.shortName || undefined, description: form.description || undefined, ruleType,
    frequencyCount: usesPeriod ? (ruleType === 'TIMES_PER_PERIOD' ? times.length : 1) : ruleType === 'ONCE' ? 1 : undefined,
    periodValue: usesPeriod ? Number(form.periodValue) : undefined, periodUnit: usesPeriod ? form.periodUnit : undefined,
    anchorType: form.anchorType as OrderFrequencyInput['anchorType'], defaultExecutionTimes: usesTimes ? times.join(',') : undefined,
    outpatientApplicable: form.outpatientApplicable, inpatientApplicable: form.inpatientApplicable, emergencyApplicable: form.emergencyApplicable,
    medicationApplicable: form.medicationApplicable, treatmentApplicable: form.treatmentApplicable, nursingApplicable: form.nursingApplicable,
    automaticTaskGeneration: form.automaticTaskGeneration, sortOrder: Number(form.sortOrder), status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom, validTo: form.validTo || undefined }
}

export const frequencyRuleOptions = [
  { value: 'ONCE', label: '单次执行' }, { value: 'TIMES_PER_PERIOD', label: '周期内固定次数' },
  { value: 'FIXED_INTERVAL', label: '固定间隔' }, { value: 'CALENDAR', label: '日历/标准时点' },
  { value: 'PRN', label: '必要时（PRN）' }, { value: 'CONTINUOUS', label: '持续执行' },
]

export const periodUnitOptions = [
  { value: 'MIN', label: '分钟' }, { value: 'H', label: '小时' }, { value: 'D', label: '天' },
  { value: 'WK', label: '周' }, { value: 'MO', label: '月' },
]

export function frequencyRuleLabel(value: OrderFrequency) {
  if (value.ruleType === 'ONCE') return '执行一次'
  if (value.ruleType === 'TIMES_PER_PERIOD') return `每 ${value.periodValue} ${periodUnitLabel(value.periodUnit)} ${value.frequencyCount} 次`
  if (value.ruleType === 'FIXED_INTERVAL') return `每 ${value.periodValue} ${periodUnitLabel(value.periodUnit)}一次`
  return frequencyRuleOptions.find((item) => item.value === value.ruleType)?.label ?? value.ruleType
}

export function periodUnitLabel(value?: string) { return ({ MIN: '分钟', H: '小时', D: '天', WK: '周', MO: '月' } as Record<string, string>)[value ?? ''] ?? value ?? '' }

export function frequencyApplicabilityLabel(value: OrderFrequency) {
  const scenes = [value.outpatientApplicable && '门诊', value.inpatientApplicable && '住院', value.emergencyApplicable && '急诊'].filter(Boolean)
  const orders = [value.medicationApplicable && '药品', value.treatmentApplicable && '治疗', value.nursingApplicable && '护理'].filter(Boolean)
  return `${scenes.join('/')} · ${orders.join('/')}`
}
