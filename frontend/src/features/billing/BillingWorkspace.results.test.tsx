import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { InsuranceSettlementView } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingWorkspace } from './BillingWorkspace'
import type { ComponentProps } from 'react'
import type { SettlementPaymentPanel } from '../../shared/billing/SettlementPaymentPanel'

// Keep the workspace's API orchestration real; expose the panel callbacks without unrelated input setup.
vi.mock('../../shared/billing/SettlementPaymentPanel', () => ({
  SettlementPaymentPanel: (props: ComponentProps<typeof SettlementPaymentPanel>) => <div>
    <button onClick={() => props.onSettlementModeChange?.('MEDICAL_INSURANCE')}>选择医保</button>
    <button onClick={() => void props.onPreSettleInsurance?.('settlement-1')}>试算</button>
    <output aria-label="trial-status">{props.insuranceClaimView?.status}</output>
    <button onClick={() => void props.onSubmit({ settlementId: 'settlement-1', paymentMethodCode: 'CASH',
      amount: 10, roundingAdjustment: 0, idempotencyKey: 'PAY-stable' }).catch(() => {})}>现金收款</button>
    <button onClick={() => props.onInitiateScanPay?.({ settlementId: 'settlement-1', paymentMethodCode: 'WECHAT', paymentMethodName: '微信', amount: 10 })}>扫码收款</button>
  </div>,
}))
vi.mock('../../shared/billing/AggregatedPaymentModal', () => ({
  AggregatedPaymentModal: ({ open }: { open: boolean }) => open ? <div>扫码收款已启动</div> : null,
}))
const claim: InsuranceSettlementView = { revision: 1, patientAccountId: 'account-1', claimNo: 'CHS-1', settlementNo: 'SET-1',
  regionCode: '360100', insuranceTypeCode: '01', externalPreSettlementNo: 'PRE-1', externalSettlementNo: 'FINAL-1',
  grossAmount: 30, otherFundAmount: 0, currencyCode: 'CNY', claimId: 'claim-1', settlementId: 'settlement-1', status: 'PRE_SETTLED',
  insuranceFundAmount: 20, personalAccountAmount: 0, patientCashAmount: 10 }

function mount(preStatus: InsuranceSettlementView['status'], finalStatus: InsuranceSettlementView['status'] = 'SETTLED', finalAmount = 10, receiptError?: Error) {
  let persisted = claim
  const billing = {
    worklist: vi.fn().mockResolvedValue([{ encounterId: 'enc-1', residentId: 'res-1', residentName: '患者甲',
      accountId: 'account-1', status: 'PENDING_PAYMENT', accountBalance: 30, currencyCode: 'CNY' }]),
    statement: vi.fn().mockResolvedValue({ organizationId: 'org-1', departmentId: 'dept-1', encounterId: 'enc-1', accountId: 'account-1', accountBalance: 30, currencyCode: 'CNY',
      charges: [], invoices: [], payments: [], settlements: [{ patientAccountId: 'account-1', netAmount: 30, id: 'settlement-1', settlementNo: 'SET-1',
        status: 'PAYMENT_PENDING', settlementType: 'NORMAL', outstandingAmount: 30, grossAmount: 30,
        insuranceAmount: 0, patientAmount: 30, currencyCode: 'CNY', lines: [], tenders: [], events: [] }] }),
    paymentOrders: vi.fn().mockResolvedValue([]),
    settlementReceipts: receiptError ? vi.fn().mockRejectedValue(receiptError) : vi.fn().mockResolvedValue([]),
    quickPreSettleInsurance: vi.fn().mockImplementation(async () => {
      persisted = { ...claim, status: preStatus }
      return persisted
    }),
    settleInsurance: vi.fn().mockImplementation(async () => {
      persisted = { ...claim, status: finalStatus, patientCashAmount: finalAmount, insuranceFundAmount: 30 - finalAmount }
      return persisted
    }),
    insuranceClaim: vi.fn().mockImplementation(async () => persisted),
    createPaymentOrder: vi.fn().mockResolvedValue({ id: 'pay-1', status: 'SUCCEEDED' }),
    issueSettlementReceipt: vi.fn().mockResolvedValue({ id: 'receipt-1', settlementId: 'settlement-1',
      status: 'FAILED', receiptNo: 'REQUEST-1', amount: 30, currencyCode: 'CNY', errorMessage: '财政平台拒绝开票' }),
  }
  const api = { billing, dictionaries: { applicable: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter><BillingWorkspace api={api} clinicalContext={{ organization: { id: 'org-1', name: '机构' },
      department: { id: 'dept-1', name: '科室' } } as ClinicalContext} /></MemoryRouter>
  </QueryClientProvider>)
  return { ...billing, view }
}

async function trial() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '选择医保' }))
  await user.click(screen.getByRole('button', { name: '试算' }))
  return user
}

describe('billing business result guards', () => {
  it.each(['FAILED', 'PRE_SETTLEMENT_PENDING'] as const)('does not present %s as a successful insurance trial', async (status) => {
    const billing = mount(status)
    await trial()
    await waitFor(() => expect(billing.quickPreSettleInsurance).toHaveBeenCalled())
    expect(screen.getByLabelText('trial-status')).toBeEmptyDOMElement()
    expect(screen.queryByText(/预结算试算成功/)).not.toBeInTheDocument()
    expect(billing.createPaymentOrder).not.toHaveBeenCalled()
  })
  it.each(['FAILED', 'SETTLEMENT_PENDING'] as const)('blocks both cash and scan collection when final insurance result is %s', async (status) => {
    const billing = mount('PRE_SETTLED', status)
    const user = await trial()
    await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
    await user.click(screen.getByRole('button', { name: '现金收款' }))
    await waitFor(() => expect(billing.settleInsurance).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '扫码收款' }))
    await waitFor(() => expect(billing.settleInsurance).toHaveBeenCalledTimes(2))
    expect(billing.createPaymentOrder).not.toHaveBeenCalled()
    expect(screen.queryByText('扫码收款已启动')).not.toBeInTheDocument()
  })
  it('collects cash only after a successful final settlement with matching amount', async () => {
    const billing = mount('PRE_SETTLED')
    const user = await trial()
    await user.click(screen.getByRole('button', { name: '现金收款' }))
    await waitFor(() => expect(billing.createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({ amount: 10 })))
  })
  it('blocks collecting the trial amount when final allocation has changed', async () => {
    const billing = mount('PRE_SETTLED', 'SETTLED', 5)
    const user = await trial()
    await user.click(screen.getByRole('button', { name: '现金收款' }))
    expect(await screen.findByText(/自付金额与试算不一致/)).toBeInTheDocument()
    expect(billing.createPaymentOrder).not.toHaveBeenCalled()
  })
  it('presents an HTTP-success failed receipt as failed without fabricated receipt numbers', async () => {
    mount('PRE_SETTLED')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '开具电子票据' }))
    expect(await screen.findByText('开具失败')).toBeInTheDocument()
    expect(screen.queryByText(/票据开具成功/)).not.toBeInTheDocument()
    expect(screen.queryByText('3601060126')).not.toBeInTheDocument()
  })
})

 it('keeps a failed receipt query distinct from no existing receipts and permits recovery', async () => {
    const billing = mount('PRE_SETTLED', 'SETTLED', 10, new Error('offline'))
    const user = userEvent.setup()
    expect(await screen.findByText('票据查询失败，尚不能确认是否已开票，请重试查询。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开具电子票据' })).not.toBeInTheDocument()
    expect(billing.issueSettlementReceipt).not.toHaveBeenCalled()
    billing.settlementReceipts.mockResolvedValue([{ id: 'existing-receipt', settlementId: 'settlement-1',
      status: 'ISSUED', fiscalCode: 'CODE', fiscalNumber: 'EXISTING-NO', amount: 30, currencyCode: 'CNY' }])
    await user.click(screen.getByRole('button', { name: '重试票据查询' }))
    await user.click(await screen.findByRole('button', { name: '查看电子票据' }))
    expect(await screen.findByText('电子票据信息')).toBeInTheDocument()
    expect(screen.getAllByText('EXISTING-NO').length).toBeGreaterThan(0)
    expect(billing.issueSettlementReceipt).not.toHaveBeenCalled()
  })


describe('insurance result identity and persistence', () => {
  it.each([
    ['账户', { patientAccountId: 'other-account' }],
    ['结算单', { settlementId: 'other-settlement' }],
    ['币种', { currencyCode: 'USD' }],
    ['金额缺失', { patientCashAmount: undefined }],
    ['分摊不平', { otherFundAmount: 1 }],
    ['流水缺失', { externalPreSettlementNo: undefined }],
  ])('does not publish a trial with invalid %s', async (_label, patch) => {
    const billing = mount('PRE_SETTLED')
    billing.quickPreSettleInsurance.mockResolvedValue({ ...claim, ...patch } as InsuranceSettlementView)
    await trial()
    expect(await screen.findByText(/医保结果未确认/)).toBeInTheDocument()
    expect(screen.getByLabelText('trial-status')).toBeEmptyDOMElement()
    expect(screen.queryByText(/试算成功/)).not.toBeInTheDocument()
    expect(billing.insuranceClaim).not.toHaveBeenCalled()
  })

  it('keeps the original trial key when persisted verification fails and retries', async () => {
    const billing = mount('PRE_SETTLED')
    billing.insuranceClaim.mockRejectedValueOnce(new Error('医保申请读取失败'))
    const user = await trial()
    expect(await screen.findByText('医保申请读取失败')).toBeInTheDocument()
    expect(screen.getByLabelText('trial-status')).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: '试算' }))
    await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
    expect(billing.quickPreSettleInsurance.mock.calls[1]).toEqual(billing.quickPreSettleInsurance.mock.calls[0])
  })

  it.each(['现金收款', '扫码收款'])('blocks %s when final saved state is still a trial, then reuses the same final key', async (button) => {
    const billing = mount('PRE_SETTLED')
    const user = await trial()
    await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
    billing.insuranceClaim.mockResolvedValueOnce(claim)
    await user.click(screen.getByRole('button', { name: button }))
    expect(await screen.findByText(/医保结算未成功/)).toBeInTheDocument()
    expect(billing.createPaymentOrder).not.toHaveBeenCalled()
    expect(screen.queryByText('扫码收款已启动')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: button }))
    await waitFor(() => expect(billing.settleInsurance).toHaveBeenCalledTimes(2))
    expect(billing.settleInsurance.mock.calls[1]).toEqual(billing.settleInsurance.mock.calls[0])
    if (button === '现金收款') await waitFor(() => expect(billing.createPaymentOrder).toHaveBeenCalledTimes(1))
    else expect(await screen.findByText('扫码收款已启动')).toBeInTheDocument()
  })

  it.each(['现金收款', '扫码收款'])('rejects a different claim returned by %s', async (button) => {
    const billing = mount('PRE_SETTLED')
    const user = await trial()
    await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
    billing.settleInsurance.mockResolvedValueOnce({ ...claim, status: 'SETTLED', claimId: 'other-claim' })
    await user.click(screen.getByRole('button', { name: button }))
    expect(await screen.findByText(/医保申请不一致/)).toBeInTheDocument()
    expect(billing.createPaymentOrder).not.toHaveBeenCalled()
    expect(screen.queryByText('扫码收款已启动')).not.toBeInTheDocument()
  })
})


it.each(['trial', 'final'] as const)('does not apply a late %s result after the cashier view unmounts', async (phase) => {
  const billing = mount('PRE_SETTLED')
  let resolve!: (value: InsuranceSettlementView) => void
  const pending = new Promise<InsuranceSettlementView>(done => { resolve = done })
  if (phase === 'trial') billing.quickPreSettleInsurance.mockReturnValueOnce(pending)
  const user = await trial()
  if (phase === 'final') {
    await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
    billing.settleInsurance.mockReturnValueOnce(pending)
    await user.click(screen.getByRole('button', { name: '现金收款' }))
  }
  const reads = billing.insuranceClaim.mock.calls.length
  billing.view.unmount()
  resolve({ ...claim, status: phase === 'trial' ? 'PRE_SETTLED' : 'SETTLED' })
  await pending
  await new Promise(done => setTimeout(done, 0))
  expect(billing.insuranceClaim).toHaveBeenCalledTimes(reads)
  expect(billing.createPaymentOrder).not.toHaveBeenCalled()
})

it('keeps the confirmed claim amount when payment rounding has changed the settlement before retry', async () => {
  const billing = mount('PRE_SETTLED')
  const user = await trial()
  await waitFor(() => expect(screen.getByLabelText('trial-status')).toHaveTextContent('PRE_SETTLED'))
  const original = await billing.statement()
  billing.createPaymentOrder.mockImplementationOnce(async () => {
    billing.statement.mockResolvedValue({ ...original, settlements: original.settlements.map((value: { netAmount: number }) => ({ ...value,
      netAmount: 30.05, roundingAmount: 0.05 })) })
    throw new Error('收款回执未确认')
  })
  await user.click(screen.getByRole('button', { name: '现金收款' }))
  expect(await screen.findByText('收款回执未确认')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '现金收款' }))
  await waitFor(() => expect(billing.createPaymentOrder).toHaveBeenCalledTimes(2))
  expect(billing.settleInsurance.mock.calls[1]).toEqual(billing.settleInsurance.mock.calls[0])
})
