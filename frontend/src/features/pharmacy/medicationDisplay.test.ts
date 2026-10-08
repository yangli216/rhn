import { describe, expect, it } from 'vitest'
import type { MedicationRequest } from '../../shared/api/encountersApi'
import { formatDoseWithMinimumUnit, formatFrequencyName, recordedMedicationAmount, sumRecordedAmounts, displayRecordedAmount, formatRecordedDuration } from './medicationDisplay'

describe('pharmacy dose presentation', () => {
  const request = { doseValue: 2, doseUnit: 'mg', preparationUnit: '片', baseQuantity: 42,
    frequencyCode: 'MISLEADING-QD', frequencyName: '每日一次', durationValue: 7, durationUnit: '天',
  } as MedicationRequest

  it.each([undefined, { ruleType: 'FIXED_INTERVAL', frequencyCount: 1, periodValue: 8, periodUnit: 'H' },
    { ruleType: 'PRN' }, { ruleType: 'ONCE' }, { ruleType: 'CALENDAR' }])(
    'does not infer a dose from dispensed packages and frequency: %j', (frequencyRule) => {
      expect(formatDoseWithMinimumUnit({ ...request, frequencyRule })).toBe('2 mg')
    },
  )
  it('does not confuse a herbal dose count with treatment days', () => {
    expect(formatRecordedDuration({ durationValue: 7, durationUnit: '剂' })).toBe('7 剂')
    expect(formatRecordedDuration({ durationValue: 4, durationUnit: 'DAY' })).toBe('4 天')
    expect(formatRecordedDuration({})).toBe('疗程未记录')
    expect(formatRecordedDuration({ durationValue: 7 })).toContain('疗程单位未记录')
    expect(formatFrequencyName()).toBe('频次未记录')
  })
  it('never supplies a missing dose or dose unit from catalog strength', () => {
    expect(formatDoseWithMinimumUnit({ ...request, doseValue: undefined, preparationSpec: '10mg' })).toBe('剂量未记录')
    expect(formatDoseWithMinimumUnit({ ...request, doseUnit: undefined, preparationSpec: '10mg' })).toBe('2（剂量单位未记录）')
  })
  it('only converts compatible units using the actual presentation strength', () => {
    expect(formatDoseWithMinimumUnit({ ...request, doseValue: 500, preparationSpec: '0.25g' })).toBe('500 mg（2片）')
    expect(formatDoseWithMinimumUnit({ ...request, doseUnit: 'ML', preparationSpec: '10mg' })).toBe('2 ml')
    expect(formatDoseWithMinimumUnit({ ...request, preparationSpec: '100mg/10ml' })).toBe('2 mg')
    expect(formatDoseWithMinimumUnit({ ...request, preparationSpec: '1mg/支' })).toBe('2 mg')
    expect(formatDoseWithMinimumUnit({ ...request, preparationSpec: '1mg/片' })).toBe('2 mg（2片）')
    expect(formatDoseWithMinimumUnit({ ...request, doseUnit: 'BOX', preparationSpec: '10mg' })).toBe('2 盒')
    expect(formatDoseWithMinimumUnit({ ...request, doseUnit: 'TABLET', preparationSpec: '10mg' })).toBe('20 mg（2片）')
    expect(formatDoseWithMinimumUnit({ ...request, preparationUnit: undefined, preparationSpec: '1mg' })).toBe('2 mg')
  })
})

describe('pharmacy recorded amounts', () => {
  it('preserves unknown and zero amounts, without deriving charges from package quantity', () => {
    expect(recordedMedicationAmount({})).toBeNull()
    expect(recordedMedicationAmount({ totalAmount: 0 })).toBe(0)
    expect(recordedMedicationAmount({ totalAmount: NaN })).toBeNull()
    expect(sumRecordedAmounts([10, null])).toBeNull()
    expect(sumRecordedAmounts([10, 0])).toBe(10)
    expect(sumRecordedAmounts([])).toBe(0)
    expect(displayRecordedAmount(null)).toBe('金额未提供')
    expect(displayRecordedAmount(0)).toBe('0.00 元')
  })
})
