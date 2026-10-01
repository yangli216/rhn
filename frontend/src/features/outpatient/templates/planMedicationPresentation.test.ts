import { describe, expect, it } from 'vitest'
import { formatRouteName, medicationSingleDoseLabel } from './planMedicationPresentation'
import type { CompiledPlanMedicationItem } from '../../../shared/api/outpatientPlanTemplatesApi'
const medication = (preparationSpec: string, doseValue = 0.5, doseUnit = 'g') => ({ medicationName: '阿莫西林胶囊', preparationSpec, doseValue, doseUnit }) as CompiledPlanMedicationItem

describe('matched medication dose preview', () => {
  it('recalculates capsule count from actual strength including mg conversion', () => {
    expect(medicationSingleDoseLabel(medication('0.125g'))).toBe('每次 0.5g（4粒）')
    expect(medicationSingleDoseLabel(medication('0.25g/粒'))).toBe('每次 0.5g（2粒）')
    expect(medicationSingleDoseLabel(medication('125mg'))).toBe('每次 0.5g（4粒）')
  })
  it('does not convert compound strength or incompatible units, or round partial capsules', () => {
    expect(medicationSingleDoseLabel(medication('0.125g+0.1g'))).toBe('每次 0.5g')
    expect(medicationSingleDoseLabel(medication('0.3g'))).toBe('每次 0.5g（制剂数量需核对）')
    expect(medicationSingleDoseLabel(medication('0.125g', 5, 'mL'))).toBe('每次 5mL')
  })
  it('formats standard route codes to readable Chinese names', () => {
    expect(formatRouteName('ORAL')).toBe('口服')
    expect(formatRouteName('PO')).toBe('口服')
    expect(formatRouteName('IVGTT')).toBe('静脉滴注')
    expect(formatRouteName('CUSTOM_ROUTE')).toBe('CUSTOM_ROUTE')
    expect(formatRouteName(null)).toBe('')
  })
})

