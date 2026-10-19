import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceSettlementView, RegistrationBillingIntent, Settlement } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { useRegistrationInsuranceSettlement } from './registrationInsurance'

const intent = { id: 'i1', settlementId: 's1', patientAccountId: 'a1', settlementMode: 'MEDICAL_INSURANCE' } as RegistrationBillingIntent
const settlement = { currencyCode: 'CNY', netAmount: 10 } as Settlement

function claim(status: 'PRE_SETTLED' | 'SETTLED', cash: number): InsuranceSettlementView {
  return {
    claimId: 'c1', revision: 1, settlementId: 's1', patientAccountId: 'a1', claimNo: 'CLM1', settlementNo: 'STL1', status,
    currentOperation: status === 'SETTLED' ? 'SETTLE' : 'PRE_SETTLE', regionCode: '360100', insuranceTypeCode: '310',
    externalPreSettlementNo: 'MDT:PRE', externalSettlementNo: status === 'SETTLED' ? 'MDT:SETL' : undefined,
    grossAmount: 10, insuranceFundAmount: 6, personalAccountAmount: 4 - cash, patientCashAmount: cash, otherFundAmount: 0,
    currencyCode: 'CNY',
  } as unknown as InsuranceSettlementView
}

function setup(cash: number) {
  const pre = claim('PRE_SETTLED', cash), settled = claim('SETTLED', cash)
  const api = { billing: {
    quickPreSettleInsurance: vi.fn().mockResolvedValue(pre),
    settleInsurance: vi.fn().mockResolvedValue(settled),
    insuranceClaim: vi.fn().mockImplementation(async () => (api.billing.settleInsurance.mock.calls.length ? settled : pre)),
  } } as unknown as RhnApi & { billing: { quickPreSettleInsurance: ReturnType<typeof vi.fn>; settleInsurance: ReturnType<typeof vi.fn> } }
  const pay = vi.fn().mockResolvedValue({ id: 'order' })
  const refresh = vi.fn().mockResolvedValue(undefined)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
  const hook = renderHook(() => useRegistrationInsuranceSettlement(api, intent, settlement, pay, refresh), { wrapper })
  return { api, pay, refresh, hook }
}

describe('registration insurance settlement', () => {
  it('pre-settles, settles insurance and then collects only the patient cash part', async () => {
    const { api, pay, hook } = setup(2)
    await act(async () => { await hook.result.current.preSettle.mutateAsync('s1') })
    expect(hook.result.current.claim?.status).toBe('PRE_SETTLED')
    expect(api.billing.quickPreSettleInsurance).toHaveBeenCalledWith('s1', { idempotencyKey: expect.stringMatching(/^PRE-REG-/) })

    const command = { settlementId: 's1', paymentMethodCode: 'CASH', amount: 2, idempotencyKey: 'PAY-1', settlementModeCode: 'MEDICAL_INSURANCE' as const }
    await act(async () => { await hook.result.current.submit.mutateAsync(command) })
    expect(api.billing.settleInsurance).toHaveBeenCalledWith('c1', 'CHS-SETL-c1')
    expect(pay).toHaveBeenCalledWith(command)
    await waitFor(() => expect(hook.result.current.claim?.status).toBe('SETTLED'))
  })

  it('does not create a payment when insurance funds and personal account cover the whole fee', async () => {
    const { pay, hook } = setup(0)
    await act(async () => { await hook.result.current.preSettle.mutateAsync('s1') })
    const command = { settlementId: 's1', paymentMethodCode: 'CASH', amount: 0, idempotencyKey: 'PAY-2', settlementModeCode: 'MEDICAL_INSURANCE' as const }
    await act(async () => { await hook.result.current.submit.mutateAsync(command) })
    expect(pay).not.toHaveBeenCalled()
  })

  it('rejects a collection amount that differs from the settled patient cash', async () => {
    const { pay, hook } = setup(2)
    await act(async () => { await hook.result.current.preSettle.mutateAsync('s1') })
    const command = { settlementId: 's1', paymentMethodCode: 'CASH', amount: 5, idempotencyKey: 'PAY-3', settlementModeCode: 'MEDICAL_INSURANCE' as const }
    await expect(act(async () => { await hook.result.current.submit.mutateAsync(command) })).rejects.toThrow('自付金额与试算不一致')
    expect(pay).not.toHaveBeenCalled()
  })
})
