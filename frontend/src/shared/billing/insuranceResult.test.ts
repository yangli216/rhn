import { describe, expect, it, vi } from 'vitest'
import type { InsuranceSettlementView } from '../api/billingApi'
import { confirmInsuranceResult, requireInsuranceResult } from './insuranceResult'

const target = { settlementId: 's-1', patientAccountId: 'a-1', grossAmount: 30, currencyCode: 'CNY', claimId: 'c-1' }
const claim: InsuranceSettlementView = { ...target, claimId: 'c-1', claimNo: 'CHS-1', settlementNo: 'SET-1',
  revision: 1, regionCode: '360100', insuranceTypeCode: '01', status: 'SETTLED',
  externalPreSettlementNo: 'PRE-1', externalSettlementNo: 'FINAL-1', insuranceFundAmount: 20,
  patientCashAmount: 10, personalAccountAmount: 0, otherFundAmount: 0 }

describe('persisted insurance result confirmation', () => {
  it.each([null, undefined, {}, { ...claim, patientCashAmount: NaN }, { ...claim, otherFundAmount: -1 },
    { ...claim, revision: undefined }, { ...claim, externalSettlementNo: '' }])('rejects malformed success data %j', value => {
    expect(() => requireInsuranceResult(value as InsuranceSettlementView, 'SETTLED', target)).toThrow()
  })
  it.each([
    { revision: 0 }, { claimNo: 'OTHER' }, { settlementNo: 'OTHER' }, { status: 'SETTLEMENT_PENDING' },
    { patientAccountId: 'other' }, { settlementId: 'other' }, { claimId: 'other' },
    { externalSettlementNo: 'OTHER' }, { externalPreSettlementNo: 'OTHER' },
    { insuranceFundAmount: 19, patientCashAmount: 11 },
  ])('rejects a persisted claim inconsistent with the receipt %j', async patch => {
    const api = { insuranceClaim: vi.fn().mockResolvedValue({ ...claim, ...patch }) }
    await expect(confirmInsuranceResult(api, claim, 'SETTLED', target, () => {})).rejects.toThrow()
  })
  it('returns the real saved claim and allows a newer matching revision', async () => {
    const saved = { ...claim, revision: 2 }
    const api = { insuranceClaim: vi.fn().mockResolvedValue(saved) }
    expect(await confirmInsuranceResult(api, claim, 'SETTLED', target, () => {})).toBe(saved)
    expect(api.insuranceClaim).toHaveBeenCalledWith('c-1')
  })
  it('does not replace a failed read with the successful write response', async () => {
    await expect(confirmInsuranceResult({ insuranceClaim: vi.fn().mockRejectedValue(new Error('offline')) }, claim,
      'SETTLED', target, () => {})).rejects.toThrow('offline')
  })
  it('checks context again after the saved claim arrives', async () => {
    const check = vi.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('changed') })
    await expect(confirmInsuranceResult({ insuranceClaim: vi.fn().mockResolvedValue(claim) }, claim,
      'SETTLED', target, check)).rejects.toThrow('changed')
  })
})
