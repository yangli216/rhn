import { describe, expect, it } from 'vitest'
import cases from '../../../../backend/src/test/resources/contracts/clinical-frequency-semantics.json'
import { fixedDailyRate, interpretClinicalFrequency } from './frequencySemantics'

describe('frequency semantics shared with Java', () => {
  it.each(cases)('$id', ({ snapshot, expected }) => {
    expect(interpretClinicalFrequency(snapshot)).toEqual(expected)
    const rate = fixedDailyRate(snapshot)
    if (expected.dailyRateComputable) expect(rate).toBeCloseTo(expected.doses! / expected.perDays!)
    else expect(rate).toBeNull()
  })

  it('rejects malformed numeric fields without falling back to a code or display name', () => {
    for (const periodValue of [NaN, Infinity, '8', -1]) {
      expect(fixedDailyRate({ ruleType: 'FIXED_INTERVAL', frequencyCount: 1, periodValue,
        periodUnit: 'H', code: 'QD', name: '每日一次' })).toBeNull()
    }
  })
})
