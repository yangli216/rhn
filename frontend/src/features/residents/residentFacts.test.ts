import { describe, expect, it } from 'vitest'
import { requireCoverageFacts } from './residentFacts'

describe('explicit resident coverage facts', () => {
  const coverage = { sdCoverageType: '02', payerName: '实际支付机构', memberNo: 'MEMBER-7', primary: true, validFrom: '2021-01-01' }
  it('allows no registered coverage and preserves complete coverage without defaulting any field', () => {
    expect(() => requireCoverageFacts([])).not.toThrow()
    const values = [structuredClone(coverage)]
    expect(() => requireCoverageFacts(values)).not.toThrow()
    expect(values).toEqual([coverage])
  })
  it.each([{ sdCoverageType: '' }, { payerName: '' }, { payerName: '  ' }, { validFrom: '' },
    { validFrom: '2021-02-30' }, { validTo: '2020-12-31' }, { validTo: 'invalid' }])(
    'rejects incomplete or invalid coverage instead of supplying insurer and dates: %j', patch => {
      expect(() => requireCoverageFacts([{ ...coverage, ...patch }])).toThrow('需明确保障类型、支付方和有效期')
    }
  )
})
