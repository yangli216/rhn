import { describe, expect, it } from 'vitest'
import type { MedicationRequest } from '../../shared/api/encountersApi'
import { formatDoseWithMinimumUnit, formatFrequencyName } from './medicationDisplay'

describe('pharmacy dose presentation', () => {
  const request = { doseValue: 2, doseUnit: 'mg', preparationUnit: '片', baseQuantity: 42,
    frequencyCode: 'MISLEADING-QD', frequencyName: '每日一次', durationValue: 7, durationUnit: '天',
  } as MedicationRequest

  it('uses the saved frequency rule instead of guessing from its code/name', () => {
    expect(formatDoseWithMinimumUnit({ ...request, frequencyRule: {
      ruleType: 'FIXED_INTERVAL', frequencyCount: 1, periodValue: 8, periodUnit: 'H',
    } })).toBe('2 mg（2片）')
  })

  it.each([undefined, { ruleType: 'PRN' }, { ruleType: 'ONCE' }, { ruleType: 'CALENDAR' }])(
    'does not invent a tablet count without a fixed rate: %j', (frequencyRule) => {
      expect(formatDoseWithMinimumUnit({ ...request, frequencyRule })).toBe('2 mg')
    },
  )

  it('does not confuse a herbal dose count with treatment days', () => {
    expect(formatDoseWithMinimumUnit({ ...request, durationUnit: '剂', frequencyRule: {
      ruleType: 'TIMES_PER_PERIOD', frequencyCount: 2, periodValue: 1, periodUnit: 'D',
    } })).toBe('2 mg')
    expect(formatFrequencyName()).toBe('频次未记录')
  })
})
