import { describe, expect, it } from 'vitest'
import type { AccountStatement, InsuranceSettlementView } from '../api/billingApi'
import { requireClaimTarget, requireInsuranceTarget } from './insuranceCheckout'

const statement = {
  accountId: 'acc-1', encounterId: 'enc-1', organizationId: 'org-1', departmentId: 'dept-1', currencyCode: 'CNY',
  settlements: [{ id: 'set-1', patientAccountId: 'acc-1', settlementType: 'NORMAL', currencyCode: 'CNY', netAmount: 10 }],
} as unknown as AccountStatement

describe('insurance checkout targets', () => {
  it('builds the target from a normal positive settlement of the current account', () => {
    expect(requireInsuranceTarget(statement, 'set-1', { encounterId: 'enc-1', accountId: 'acc-1' }))
      .toEqual({ settlementId: 'set-1', patientAccountId: 'acc-1', currencyCode: 'CNY', grossAmount: 10 })
  })

  it.each([
    ['another encounter', { encounterId: 'enc-2' }],
    ['another account', { accountId: 'acc-2' }],
    ['another department', { departmentId: 'dept-2' }],
  ])('rejects %s', (_, scope) => {
    expect(() => requireInsuranceTarget(statement, 'set-1', scope)).toThrow('医保结果未确认')
  })

  it('rejects an unknown settlement', () => {
    expect(() => requireInsuranceTarget(statement, 'set-9')).toThrow('医保结果未确认')
  })

  it('verifies the final settlement against the pre-settled claim amount', () => {
    const target = requireInsuranceTarget(statement, 'set-1')
    const claim = { claimId: 'claim-1', settlementId: 'set-1', patientAccountId: 'acc-1', grossAmount: 9.99 } as InsuranceSettlementView
    expect(requireClaimTarget(claim, target)).toEqual({ ...target, grossAmount: 9.99, claimId: 'claim-1' })
    expect(() => requireClaimTarget({ ...claim, settlementId: 'set-2' }, target)).toThrow('试算申请与当前结算单不一致')
    expect(() => requireClaimTarget(null, target)).toThrow('试算申请与当前结算单不一致')
  })
})
