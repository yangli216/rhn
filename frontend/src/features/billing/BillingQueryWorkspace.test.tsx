import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingQueryWorkspace } from './BillingQueryWorkspace'

const record: SettlementRecord = {
  id: 'settlement-1', patientAccountId: 'account-1', residentId: 'resident-1', encounterId: 'encounter-1',
  departmentId: 'department-1', residentName: '王建国', healthRecordNo: 'JMD-0001', gender: '1',
  birthDate: '1976-03-12', encounterNo: 'MZ20260908001', departmentName: '全科门诊',
  settlementNo: 'STL-20260908-001', settlementType: 'NORMAL', settlementTypeText: '正常结算', settlementMode: 'MEDICAL_INSURANCE', settlementModeText: '医保结算',
  settlementScene: 'OUTPATIENT', settlementSceneText: '门诊收费', terminalScene: 'CASHIER', terminalSceneText: '收费处', status: 'SETTLED', grossAmount: 86,
  discountAmount: 0, insuranceAmount: 50, patientAmount: 36, otherAmount: 0, roundingAmount: 0,
  netAmount: 86, currencyCode: 'CNY', terminalCode: 'CASHIER-01',
  createdAt: '2026-09-08T01:30:00Z', finalizedAt: '2026-09-08T01:31:00Z',
}

function renderWorkspace(sourceRecords: SettlementRecord[] = [record], overrides: Partial<Record<'settlementRecords' | 'settlementExceptions' | 'settlementCashiers' | 'settlement' | 'statement' | 'settlementReceipts', ReturnType<typeof vi.fn>>> = {}) {
  const api = { billing: {
    settlementRecords: vi.fn().mockResolvedValue(sourceRecords),
    settlementExceptions: vi.fn().mockResolvedValue([]),
    settlementCashiers: vi.fn().mockResolvedValue([
      { userId: '123', name: '张收费', username: 'cashier.zhang', active: true, positionName: '收费员', terminalScenes: ['CASHIER'] },
      { userId: '456', name: '李离岗', username: 'cashier.li', active: false, terminalScenes: ['CASHIER'] }]),
    settlement: vi.fn().mockResolvedValue({ ...(sourceRecords[0] ?? record), revision: 1, commandCode: 'SETTLE-001',
      tenderedAmount: 86, outstandingAmount: 0, createdBy: 'user-1', finalizedBy: 'user-1',
      lines: [{ id: 'line-1', chargeItemId: 'charge-1', lineNo: 1, settledQuantity: 2,
        grossAmount: 36, discountAmount: 0, insuranceAmount: 20, patientAmount: 16,
        otherAmount: 0, netAmount: 36 }],
      tenders: [{ id: 'tender-1', lineNo: 1, tenderType: 'DIGITAL', tenderTypeText: '移动支付', payerName: '微信支付',
        amount: 36, currencyCode: 'CNY' }], events: [] }),
    statement: vi.fn().mockResolvedValue({ accountId: 'account-1', revision: 1, residentId: 'resident-1',
      encounterId: 'encounter-1', organizationId: 'org-1', departmentId: 'department-1', accountType: 'OUTPATIENT',
      currencyCode: 'CNY', status: 'OPEN', openedAt: '2026-09-08T01:00:00Z', chargeAmount: 86,
      invoicedAmount: 86, uninvoicedAmount: 0, paymentAmount: 86, refundAmount: 0, accountBalance: 0,
      charges: [{ id: 'charge-1', patientAccountId: 'account-1', residentId: 'resident-1',
        encounterId: 'encounter-1', catalogItemId: 'item-1', sourceType: 'MEDICATION_REQUEST',
        sourceId: 'request-1', requestCode: 'CF001', status: 'INVOICED', quantity: 2, unitCode: 'BOX',
        unitName: '盒', packageSpec: '0.25g x 24粒', unitPrice: 18, totalAmount: 36, currencyCode: 'CNY',
        itemCode: 'AMOX001', itemName: '阿莫西林胶囊', occurredAt: '2026-09-08T01:20:00Z' }],
      invoices: [], settlements: [], payments: [], ledgerEntries: [] }),
    settlementReceipts: vi.fn().mockResolvedValue([{ id: 'receipt-1', revision: 1,
      settlementId: 'settlement-1', receiptNo: 'RCPT001', commandCode: 'ISSUE-001',
      receiptType: 'MEDICAL_E_INVOICE', status: 'ISSUED', statusText: '已开具', fiscalNumber: '360100000001', amount: 86,
      currencyCode: 'CNY', issueChannel: 'CASHIER', createdAt: '2026-09-08T01:32:00Z',
      issuedAt: '2026-09-08T01:32:00Z', updatedAt: '2026-09-08T01:32:00Z', duplicate: false }]),
    ...overrides,
  } } as unknown as RhnApi
  const clinicalContext = {
    organization: { id: 'org-1', name: '青禾镇中心卫生院' },
    department: { id: 'department-1', name: '全科门诊' },
  } as ClinicalContext
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter>
    <BillingQueryWorkspace api={api} clinicalContext={clinicalContext} />
  </MemoryRouter></QueryClientProvider>)
  return api
}

describe('BillingQueryWorkspace', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-08T04:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  it('shows the settlement type badge in the settlement-no cell only for non-normal settlements', async () => {
    const reversal = { ...record, id: 'settlement-2', settlementNo: 'STL-20260908-002', settlementType: 'REVERSAL', settlementTypeText: '冲正结算' } as SettlementRecord
    renderWorkspace([record, reversal])
    const reversalRow = await screen.findByRole('button', { name: '结算记录 STL-20260908-002' })
    const normalRow = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    expect(within(reversalRow.querySelector('td') as HTMLElement).getByText('冲正结算')).toBeInTheDocument()
    expect(normalRow).not.toHaveTextContent('正常结算')
  })
  it('starts today, preserves required dates, and submits cashier selection to the server', async () => {
    const api = renderWorkspace([{ ...record, cashierName: '张收费', cashierUsername: 'cashier.zhang', finalizedBy: '123' }])
    const row = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    expect(row).toHaveTextContent('张收费')
    expect(row).toHaveTextContent('收费处')
    expect(row).not.toHaveTextContent('CASHIER-01')
    expect(screen.getByLabelText('开始日期')).toHaveValue('2026-09-08')
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '' } })
    expect(screen.getByLabelText('开始日期')).toHaveValue('2026-09-08')
    expect(screen.getByLabelText('结束日期')).toHaveValue('2026-09-08')
    await userEvent.click(screen.getByLabelText('办理人'))
    expect(await screen.findByRole('option', { name: '李离岗（cashier.li） · 已离岗' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('option', { name: '张收费（cashier.zhang）' }))
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.billing.settlementRecords).toHaveBeenLastCalledWith(500, { from: '2026-09-08', to: '2026-09-08', cashier: '123', terminalScene: '', includeOpen: true }))
    await userEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByLabelText('办理人')).toHaveTextContent('全部办理人')
    expect(screen.getByLabelText('开始日期')).toHaveValue('2026-09-08')
  })
  it('shows fee category and filters self-pay versus insurance settlements', async () => {
    renderWorkspace([record, { ...record, id: 'stl-2', settlementNo: 'STL-20260908-002', insuranceAmount: 0, patientAmount: 86, settlementMode: 'SELF_PAY', settlementModeText: '自费结算' }])
    const insured = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    const selfPay = screen.getByRole('button', { name: '结算记录 STL-20260908-002' })
    expect(insured).toHaveTextContent('医保')
    expect(selfPay).toHaveTextContent('自费')
    await userEvent.click(screen.getByLabelText('费用类别'))
    await userEvent.click(await screen.findByRole('option', { name: '自费' }))
    expect(screen.queryByRole('button', { name: '结算记录 STL-20260908-001' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '结算记录 STL-20260908-002' })).toBeInTheDocument()
  })
  it('treats an insurance settlement with zero fund payment as insurance, not self-pay', async () => {
    renderWorkspace([
      { ...record, id: 'stl-zero', settlementNo: 'STL-ZERO-FUND', insuranceAmount: 0, patientAmount: 86 },
      { ...record, id: 'stl-self', settlementNo: 'STL-SELF-PAY', insuranceAmount: 0, patientAmount: 86, settlementMode: 'SELF_PAY', settlementModeText: '自费结算' }])
    const zeroFund = await screen.findByRole('button', { name: '结算记录 STL-ZERO-FUND' })
    const selfPay = screen.getByRole('button', { name: '结算记录 STL-SELF-PAY' })
    expect(zeroFund).toHaveTextContent('医保')
    expect(zeroFund).not.toHaveTextContent('自费')
    expect(selfPay).toHaveTextContent('自费')
    await userEvent.click(screen.getByLabelText('费用类别'))
    await userEvent.click(await screen.findByRole('option', { name: '医保' }))
    expect(screen.getByRole('button', { name: '结算记录 STL-ZERO-FUND' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '结算记录 STL-SELF-PAY' })).not.toBeInTheDocument()
  })
  it('shows settlement status and surfaces one-sided accounts in the banner with navigation action', async () => {
    const api = renderWorkspace([record, { ...record, id: 'stl-2', settlementNo: 'STL-20260908-002', status: 'PRICED', statusText: '待收款' }], {
      settlementExceptions: vi.fn().mockResolvedValue([{
        settlement: { ...record, id: 'stl-2', settlementNo: 'STL-20260908-002', status: 'PRICED' },
        exceptionType: 'INSURANCE_SETTLED_UNPAID', exceptionText: '医保已结算，自付未收（单边账）', severity: 'CRITICAL',
        outstandingAmount: 24, ageMinutes: 6, claimId: 'claim-1', claimStatus: 'SETTLED',
        actions: ['COLLECT', 'CANCEL_AND_REVERSE'], suggestion: '医保基金已扣，患者自付未收齐' }]),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('1 笔单边账待处理')
    expect(await screen.findByRole('button', { name: '结算记录 STL-20260908-002' })).toHaveTextContent('待收款')
    expect(screen.getByRole('button', { name: '去处理' })).toBeInTheDocument()
    expect(api.billing.settlementExceptions).toHaveBeenCalled()
  })
  it('filters by entry and disables the operator for entries without staff', async () => {
    const api = renderWorkspace()
    await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    await userEvent.click(screen.getByLabelText('收费入口'))
    await userEvent.click(await screen.findByRole('option', { name: '自助机' }))
    expect(screen.getByLabelText('办理人')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.billing.settlementRecords).toHaveBeenLastCalledWith(500, { from: '2026-09-08', to: '2026-09-08', cashier: '', terminalScene: 'SELF_SERVICE', includeOpen: true }))
    await userEvent.click(screen.getByLabelText('收费入口'))
    await userEvent.click(await screen.findByRole('option', { name: '医生站' }))
    expect(screen.getByLabelText('办理人')).toBeEnabled()
    await waitFor(() => expect(api.billing.settlementCashiers).toHaveBeenLastCalledWith({ from: '2026-09-08', to: '2026-09-08', terminalScene: 'DOCTOR_STATION' }))
  })
  it('shows recorded doctor source even when the physical terminal number is missing', async () => {
    renderWorkspace([{ ...record, terminalScene: 'DOCTOR_STATION', terminalSceneText: '医生站', terminalCode: undefined }])
    const row = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    expect(row).toHaveTextContent('医生站')
    expect(row).toHaveTextContent('未记录办理人')
  })
  it.each(['failure', 'invalid'] as const)('does not present unavailable list as no records: %s', async (state) => {
    const settlementRecords = state === 'failure' ? vi.fn().mockRejectedValue(new Error('查询失败')) : vi.fn().mockResolvedValue(null)
    renderWorkspace([record], { settlementRecords })
    expect(await screen.findByText('收费记录加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无匹配记录')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '财务核算指标' })).not.toBeInTheDocument()
    settlementRecords.mockResolvedValue([record])
    await userEvent.click(screen.getByRole('button', { name: '重新加载收费记录' }))
    expect(await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })).toBeInTheDocument()
  })

  it.each(['settlement', 'statement', 'settlementReceipts'] as const)('distinguishes %s query failure from empty financial detail', async (query) => {
    const load = vi.fn().mockRejectedValue(new Error('明细查询失败'))
    const api = renderWorkspace([record], { [query]: load })
    await userEvent.click(await screen.findByRole('button', { name: '结算记录 STL-20260908-001' }))
    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('收费详情加载失败')).toBeInTheDocument()
    expect(within(detail).queryByText('未查询到收费项目明细。')).not.toBeInTheDocument()
    expect(within(detail).queryByText('当前结算单暂无电子票据。')).not.toBeInTheDocument()
    expect(within(detail).queryByText('0 项')).not.toBeInTheDocument()
    expect(api.billing[query]).toHaveBeenCalledOnce()
    if (query === 'settlementReceipts') {
      load.mockResolvedValue([])
      await userEvent.click(within(detail).getByRole('button', { name: '重新加载收费详情' }))
      expect(await within(detail).findByText('当前结算单暂无电子票据。')).toBeInTheDocument()
    }
  })

  it.each(['settlement', 'statement', 'settlementReceipts'] as const)('rejects an HTTP-success empty body for %s', async (query) => {
    renderWorkspace([record], { [query]: vi.fn().mockResolvedValue(null) })
    await userEvent.click(await screen.findByRole('button', { name: '结算记录 STL-20260908-001' }))
    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('收费详情加载失败')).toBeInTheDocument()
    expect(within(detail).queryByText('当前结算单暂无电子票据。')).not.toBeInTheDocument()
  })

  it('hides cached details when a refresh fails instead of claiming they are current', async () => {
    const api = renderWorkspace()
    await userEvent.click(await screen.findByRole('button', { name: '结算记录 STL-20260908-001' }))
    await screen.findByText('阿莫西林胶囊')
    vi.mocked(api.billing.settlementReceipts).mockRejectedValue(new Error('票据查询失败'))
    await userEvent.click(screen.getByRole('button', { name: /刷新/ }))
    await screen.findByText('收费详情加载失败')
    expect(screen.queryByText('360100000001')).not.toBeInTheDocument()
    await waitFor(() => expect(api.billing.settlementReceipts).toHaveBeenCalledTimes(2))
  })

  it('shows completed settlement, charge, tender and receipt details in slide-over drawer', async () => {
    const api = renderWorkspace()

    const recordButton = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    expect(recordButton).toHaveTextContent('王建国')

    // 点击记录滑出详情抽屉
    await userEvent.click(recordButton)

    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(within(detail).getByText('微信支付')).toBeInTheDocument()
    expect(within(detail).getByText('360100000001')).toBeInTheDocument()
    expect(api.billing.settlementRecords).toHaveBeenCalledWith(500, { from: '2026-09-08', to: '2026-09-08', cashier: '', terminalScene: '', includeOpen: true })

    // 点击关闭按钮关闭抽屉
    const closeBtn = within(detail).getByRole('button', { name: '关闭收费记录详情' })
    await userEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: '收费记录详情' })).not.toBeInTheDocument()
  })

  it('filters records by patient identity', async () => {
    renderWorkspace()
    await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    const input = screen.getByRole('textbox', { name: '姓名/门诊号' })
    await userEvent.type(input, '不存在的患者')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    expect(await screen.findByText('暂无匹配记录')).toBeInTheDocument()
  })

  it('shows historical registration settlement details without requesting an encounter statement', async () => {
    const historicalRecord: SettlementRecord = {
      ...record,
      id: 'settlement-historical',
      encounterId: undefined,
      encounterNo: undefined,
      settlementNo: 'RGI-HISTORICAL-001',
      settlementScene: 'REGISTRATION',
      settlementSceneText: '挂号收费',
    }
    const api = renderWorkspace([historicalRecord])

    const recordButton = await screen.findByRole('button', { name: '结算记录 RGI-HISTORICAL-001' })
    await userEvent.click(recordButton)

    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('RGI-HISTORICAL-001')).toBeInTheDocument()
    expect(within(detail).getByText('门诊号 --')).toBeInTheDocument()
    expect(api.billing.statement).not.toHaveBeenCalled()
  })

  it('displays financial summary metrics in table footer and supports DateRangePicker filtering', async () => {
    renderWorkspace()
    await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })

    // 验证放置在底部的财务核算对账指标条
    const summaryStrip = screen.getByRole('region', { name: '财务核算指标' })
    expect(within(summaryStrip).getByText(/结算总笔数/)).toBeInTheDocument()
    expect(within(summaryStrip).getByText('1')).toBeInTheDocument()
    expect(within(summaryStrip).getByText('¥86.00')).toBeInTheDocument()

    // 通过统一的 DateRangePicker 组件输入筛选日期
    const startInput = screen.getByLabelText('开始日期')
    fireEvent.change(startInput, { target: { value: '2026-09-09' } })
    expect(await screen.findByText('暂无匹配记录')).toBeInTheDocument()

    // 重新输入匹配日期
    fireEvent.change(startInput, { target: { value: '2026-09-08' } })
    expect(await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })).toBeInTheDocument()
  })

  it('supports copying settlement number and closing drawer via Escape key', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    renderWorkspace()
    const copyBtn = await screen.findByRole('button', { name: '复制单号 STL-20260908-001' })
    await userEvent.click(copyBtn)
    expect(writeTextMock).toHaveBeenCalledWith('STL-20260908-001')

    // 查看明细按钮打开抽屉
    const detailBtn = screen.getByRole('button', { name: '查看明细' })
    await userEvent.click(detailBtn)
    expect(await screen.findByRole('region', { name: '收费记录详情' })).toBeInTheDocument()

    // 按 Escape 键关闭抽屉
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: '收费记录详情' })).not.toBeInTheDocument()
  })
})
