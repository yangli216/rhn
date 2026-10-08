import { describe, expect, it } from 'vitest'
import { formatRouteName, medicationSingleDoseLabel } from './planMedicationPresentation'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
const medication = (preparationSpec: string, doseValue = 0.5, doseUnit = 'g') => ({ medicationName: '阿莫西林胶囊', preparationSpec, doseValue, doseUnit }) as CompiledPlanMedicationItem

describe('matched medication dose preview', () => {
  it.each(['0.125g', '0.25g/粒', '125mg', '0.125g+0.1g', '0.3g'])('does not infer administration counts from name or free-text strength: %s', spec => {
    expect(medicationSingleDoseLabel(medication(spec))).toBe('每次 0.5g')
  })
  it.each([0, -1, Infinity, NaN])('does not display invalid doses as confirmed: %s', value => {
    expect(medicationSingleDoseLabel(medication('0.25g', value))).toBe('单次剂量待确认')
  })
  it('uses current directory names and marks unknown codes', () => {
    expect(formatRouteName('LOCAL', [{ code: 'LOCAL', name: '目录途径' }])).toBe('目录途径')
    expect(formatRouteName('ORAL', [])).toBe('ORAL（待字典核对）')
    expect(formatRouteName('PO')).toBe('PO（待字典核对）')
    expect(formatRouteName(null)).toBe('途径待确认')
  })
})
