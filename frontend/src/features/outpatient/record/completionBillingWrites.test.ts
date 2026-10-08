import { describe, expect, it } from 'vitest'
import type { Encounter } from '../../../shared/model'
import { createCompletionBillingWriter } from './completionBillingWrites'
import { billingWriteFixture } from './completionBillingWrites.testFixtures'

const encounter = { id: 'enc-1', residentId: 'r-1', organizationId: 'org-1', departmentId: 'dept-1',
  registeredAt: '2026-10-04T00:00:00Z' } as Encounter
const command = { settlementId: 'settlement-1', idempotencyKey: 'pay-command', paymentMethodCode: 'BANK_CARD', amount: 10 }
const current = () => {}
describe('verified completion billing writes', () => {
  it.each(['PENDING', 'FAILED'] as const)('preserves a real %s payment instead of marking it collected', async status => {
    const { api, before } = billingWriteFixture(encounter, 'payment', status), writer = createCompletionBillingWriter()
    const result = await writer.pay(api, encounter, before, command, current)
    expect(result.orders[0]).toMatchObject({ status, capturedAmount: 0 })
    expect(result.statement.accountBalance).toBe(10)
    result.confirmApplied()
    expect(writer.hasPending()).toBe(false)
  })
  it('allows corrected input only after an explicit server precondition rejection', async () => {
    const { api, before } = billingWriteFixture(encounter, 'payment'), writer = createCompletionBillingWriter()
    api.createPaymentOrder.mockRejectedValueOnce({ code: 'PAYMENT_ORDER_EXCEEDS_AVAILABLE', message: '支付金额超过可付金额' })
    await expect(writer.pay(api, encounter, before, command, current)).rejects.toThrow('请求被拒绝')
    expect(writer.hasPending()).toBe(false)
    const result = await writer.pay(api, encounter, before, { ...command, idempotencyKey: 'corrected', amount: 5 }, current)
    result.confirmApplied()
    expect(api.createPaymentOrder.mock.calls[1][1].amount).toBe(5)
  })
  it.each(['invoice', 'payment'] as const)('accepts %s only after confirmed persisted state and explicit application', async kind => {
    const { api, before } = billingWriteFixture(encounter, kind), writer = createCompletionBillingWriter()
    const result = kind === 'invoice' ? await writer.issue(api, encounter, before, current) : await writer.pay(api, encounter, before, command, current)
    expect(writer.hasPending()).toBe(true)
    expect(result.statement).toMatchObject({ accountId: 'acc-1', encounterId: 'enc-1' })
    result.confirmApplied()
    expect(writer.hasPending()).toBe(false)
    if (kind === 'invoice') expect(api.issueInvoice.mock.calls[0][3]).toEqual(['charge-1'])
    else expect(api.paymentOrder).toHaveBeenCalledWith('payment-pay-command')
  })
  it.each(['invoice', 'payment'] as const)('retains the %s identity after an empty receipt that may have committed', async kind => {
    const { api, before } = billingWriteFixture(encounter, kind), writer = createCompletionBillingWriter()
    if (kind === 'invoice') {
      const actual = api.issueInvoice.getMockImplementation()!
      api.issueInvoice.mockImplementationOnce(async (...args) => { await actual(...args); return undefined as never })
    } else {
      const actual = api.createPaymentOrder.getMockImplementation()!
      api.createPaymentOrder.mockImplementationOnce(async (...args) => { await actual(...args); return undefined as never })
    }
    await expect(kind === 'invoice' ? writer.issue(api, encounter, before, current)
      : writer.pay(api, encounter, before, command, current)).rejects.toThrow('未确认')
    const result = await writer.retry(api, encounter, current)
    result.confirmApplied()
    const calls = kind === 'invoice' ? api.issueInvoice.mock.calls : api.createPaymentOrder.mock.calls
    expect(calls[1]).toEqual(calls[0])
  })
  it.each(['statement', 'paymentOrders', 'paymentOrder'] as const)('does not accept payment after %s read failure', async stage => {
    const { api, before } = billingWriteFixture(encounter, 'payment'), writer = createCompletionBillingWriter()
    api[stage].mockRejectedValueOnce(new Error('读取中断'))
    await expect(writer.pay(api, encounter, before, command, current)).rejects.toThrow('读取中断')
    expect(writer.hasPending()).toBe(true)
    const result = await writer.retry(api, encounter, current)
    result.confirmApplied()
    expect(api.createPaymentOrder.mock.calls[1]).toEqual(api.createPaymentOrder.mock.calls[0])
  })
  it.each(['account', 'amount', 'key', 'method', 'scene', 'id'] as const)('rejects a mismatched payment %s', async field => {
    const { api, before } = billingWriteFixture(encounter, 'payment'), writer = createCompletionBillingWriter()
    const actual = api.createPaymentOrder.getMockImplementation()!
    api.createPaymentOrder.mockImplementationOnce(async (...args) => ({ ...await actual(...args),
      ...(field === 'account' ? { patientAccountId: 'other' } : field === 'amount' ? { requestedAmount: 11 }
        : field === 'key' ? { idempotencyKey: 'other' } : field === 'method' ? { paymentMethodCode: 'CASH' }
          : field === 'scene' ? { paymentSceneCode: 'CASHIER' } : { id: '' }),
    }))
    await expect(writer.pay(api, encounter, before, command, current)).rejects.toThrow('未确认')
    expect(api.statement).not.toHaveBeenCalled()
  })
  it.each(['account', 'number', 'amount', 'line', 'missing-settlement'] as const)('rejects an unconfirmed invoice %s', async field => {
    const { api, before } = billingWriteFixture(encounter), writer = createCompletionBillingWriter()
    const actual = api.issueInvoice.getMockImplementation()!
    if (field === 'missing-settlement') {
      const read = api.statement.getMockImplementation()!
      api.statement.mockImplementationOnce(async (...args) => ({ ...await read(...args), settlements: [] }))
    } else api.issueInvoice.mockImplementationOnce(async (...args) => ({ ...await actual(...args),
      ...(field === 'account' ? { patientAccountId: 'other' } : field === 'number' ? { invoiceNo: 'other' }
        : field === 'amount' ? { grossAmount: 11 } : { lines: [] }),
    }))
    await expect(writer.issue(api, encounter, before, current)).rejects.toThrow('未确认')
    expect(writer.hasPending()).toBe(true)
  })
  it('does not create a new intent after edits, API changes, or a different patient', async () => {
    const { api, before } = billingWriteFixture(encounter, 'payment'), writer = createCompletionBillingWriter()
    api.createPaymentOrder.mockRejectedValueOnce(new Error('连接中断'))
    await expect(writer.pay(api, encounter, before, command, current)).rejects.toThrow('连接中断')
    await expect(writer.pay(api, encounter, before, { ...command, amount: 5, idempotencyKey: 'new' }, current)).rejects.toThrow('尚未核实')
    await expect(writer.retry({ ...api }, encounter, current)).rejects.toThrow('另一个 API')
    expect(() => writer.retry(api, { ...encounter, id: 'other' }, current)).toThrow('当前患者')
    expect(api.createPaymentOrder).toHaveBeenCalledTimes(1)
  })
  it.each(['receipt', 'read', 'apply'] as const)('keeps the original request after a late %s', async stage => {
    const { api, before } = billingWriteFixture(encounter, 'payment'), writer = createCompletionBillingWriter()
    let active = true
    const check = () => { if (!active) throw new Error('工作上下文已变化') }
    if (stage === 'receipt') {
      const actual = api.createPaymentOrder.getMockImplementation()!
      api.createPaymentOrder.mockImplementationOnce(async (...args) => { const saved = await actual(...args); active = false; return saved })
    } else if (stage === 'read') {
      const actual = api.statement.getMockImplementation()!
      api.statement.mockImplementationOnce(async (...args) => { const saved = await actual(...args); active = false; return saved })
    }
    if (stage === 'apply') {
      const result = await writer.pay(api, encounter, before, command, check)
      active = false
      expect(result.confirmApplied).toThrow('工作上下文')
    } else await expect(writer.pay(api, encounter, before, command, check)).rejects.toThrow('工作上下文')
    expect(writer.hasPending()).toBe(true)
    active = true
    const result = await writer.retry(api, encounter, check)
    result.confirmApplied()
    expect(api.createPaymentOrder.mock.calls[1]).toEqual(api.createPaymentOrder.mock.calls[0])
  })
  it('rejects concurrent replay while the original write is pending', async () => {
    const { api, before } = billingWriteFixture(encounter), writer = createCompletionBillingWriter()
    let finish!: () => void
    const actual = api.issueInvoice.getMockImplementation()!
    api.issueInvoice.mockImplementationOnce((...args) => new Promise(resolve => { finish = async () => resolve(await actual(...args)) }))
    const pending = writer.issue(api, encounter, before, current)
    await expect(writer.retry(api, encounter, current)).rejects.toThrow('仍在处理中')
    finish()
    ;(await pending).confirmApplied()
    expect(api.issueInvoice).toHaveBeenCalledTimes(1)
  })
})
