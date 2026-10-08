import { describe, expect, it } from 'vitest'
import type { OutpatientPlanTask, PlanTextReviewItem, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { confirmConvertedPlan } from './convertedPlanFacts'

const source: PlanTextReviewItem = { kind: 'MEDICATION', text: '暂不使用测试药品', origin: 'EXPLICIT', details: '保留原始要求' }
function result(): SaveOutpatientPlanTemplateInput {
  return { name: '测试方案', scopeType: 'PERSONAL', diagnoses: [{ code: 'A', display: '诊断', type: 'PRIMARY' }],
    medications: [{ medicationId: 'med', medicationName: '测试药品', quantity: 1, quantityUnit: '片', substitutionAllowed: false, selfProvided: false }],
    services: [], tasks: [] }
}
const confirm = (value = result(), items = [source]) => confirmConvertedPlan(value, items, '测试方案', 'PERSONAL')

describe('converted plan facts', () => {
  it('does not infer matching from medication names contained in negative prose', () => {
    expect(confirm().tasks).toEqual([{ ...source, status: 'UNMATCHED' }])
  })
  it.each(['DIAGNOSIS', 'LABORATORY', 'EXAMINATION'] as const)('does not infer %s matching from substrings', kind => {
    const value = result(); value.services = [{ catalogItemId: 'svc', itemCode: 'S', itemName: '项目', serviceType: kind === 'DIAGNOSIS' ? 'EXAMINATION' : kind, quantity: 1, unitCode: '项' }]
    const item = { ...source, kind, text: '诊断 A 或者项目' }
    expect(confirm(value, [item]).tasks?.[0].status).toBe('UNMATCHED')
  })
  it.each(['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED'] as const)('preserves the explicit %s result and both sets of details', status => {
    const value = result(); value.tasks = [{ ...source, status, details: '目录核对说明' }]
    const actual = confirm(value).tasks![0]
    expect(actual.status).toBe(status)
    expect(actual.details).toContain('保留原始要求')
    expect(actual.details).toContain('目录核对说明')
  })
  it('does not attach another task origin to the original clinical request', () => {
    const value = result(); value.tasks = [{ ...source, origin: 'SUGGESTED', status: 'MATCHED' }]
    expect(confirm(value).tasks).toHaveLength(2)
    expect(confirm(value).tasks?.[0].status).toBe('UNMATCHED')
  })
  it.each([{ tasks: undefined }, { diagnoses: undefined }, { scopeType: 'HOSPITAL' }, { name: '另一方案' },
    { medications: [{ medicationId: 'med', quantity: 0 }] }])('rejects an incomplete or mismatched conversion %s', patch => {
    expect(() => confirm({ ...result(), ...patch } as SaveOutpatientPlanTemplateInput)).toThrow('转换结果未确认')
  })
  it('rejects ambiguous duplicate task receipts', () => {
    const value = result(); value.tasks = [{ ...source, status: 'MATCHED' }, { ...source, status: 'UNMATCHED' }]
    expect(() => confirm(value)).toThrow('转换结果未确认')
  })
  it.each(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION'] as const)('rejects MATCHED %s without a corresponding structured row', kind => {
    const value = result(); value.diagnoses = []; value.medications = []
    const item: OutpatientPlanTask = { ...source, kind, status: 'MATCHED' }; value.tasks = [item]
    expect(() => confirm(value, [item])).toThrow('转换结果未确认')
  })
  it('rejects medication amounts without explicit units', () => {
    const value = result(); value.medications[0].doseValue = 3
    expect(() => confirm(value)).toThrow('转换结果未确认')
  })
  it('leaves non-catalog text for review instead of implying directory confirmation', () => {
    expect(confirm(result(), [{ ...source, kind: 'EDUCATION' }]).tasks?.[0].status).toBe('NEEDS_REVIEW')
  })
  it('does not duplicate the original text already preserved in the response', () => {
    const item = { ...source, details: '原'.repeat(300) }, value = result()
    value.tasks = [{ ...item, details: item.details + '目录核对说明', status: 'UNMATCHED' }]
    expect(confirm(value, [item]).tasks?.[0].details).toBe(value.tasks[0].details)
  })
  it('rejects overflowing merged details instead of truncating the original instruction', () => {
    const value = result(); value.tasks = [{ ...source, details: '返'.repeat(300), status: 'UNMATCHED' }]
    expect(() => confirm(value, [{ ...source, details: '原'.repeat(300) }])).toThrow('本次未丢弃原内容')
  })
})
