import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SettlementException } from '../../shared/api/billingApi'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import { SettlementExceptionWorkspace } from './SettlementExceptionWorkspace'

const sampleCriticalException: SettlementException = {
  settlement: {
    id: 'stl-1',
    patientAccountId: 'acc-1',
    residentId: 'res-1',
    encounterId: 'enc-1',
    departmentId: 'dept-1',
    residentName: '张三',
    healthRecordNo: 'HRN-001',
    settlementNo: 'STL-20261023-001',
    settlementType: 'NORMAL',
    settlementMode: 'MEDICAL_INSURANCE',
    status: 'PRICED',
    grossAmount: 100,
    discountAmount: 0,
    insuranceAmount: 60,
    patientAmount: 40,
    otherAmount: 0,
    roundingAmount: 0,
    netAmount: 100,
    currencyCode: 'CNY',
    finalizedBy: 'user-1',
    createdAt: '2026-10-23T10:00:00Z',
    tenders: [],
  },
  exceptionType: 'INSURANCE_SETTLED_UNPAID',
  exceptionText: '医保已结算，自付未收（单边账）',
  severity: 'CRITICAL',
  outstandingAmount: 40,
  ageMinutes: 15,
  claimId: 'claim-1',
  claimStatus: 'SETTLED',
  paymentOrderStatus: 'NONE',
  actions: ['COLLECT', 'CANCEL_AND_REVERSE'],
  suggestion: '医保基金已扣，患者自付未收齐',
}

const sampleWarningException: SettlementException = {
  settlement: {
    id: 'stl-2',
    patientAccountId: 'acc-2',
    residentId: 'res-2',
    encounterId: 'enc-2',
    departmentId: 'dept-1',
    residentName: '李四',
    healthRecordNo: 'HRN-002',
    settlementNo: 'STL-20261023-002',
    settlementType: 'NORMAL',
    settlementMode: 'SELF_PAY',
    status: 'PAYMENT_PENDING',
    grossAmount: 50,
    discountAmount: 0,
    insuranceAmount: 0,
    patientAmount: 50,
    otherAmount: 0,
    roundingAmount: 0,
    netAmount: 50,
    currencyCode: 'CNY',
    finalizedBy: 'user-1',
    createdAt: '2026-10-23T10:05:00Z',
    tenders: [],
  },
  exceptionType: 'PAYMENT_RESULT_UNKNOWN',
  exceptionText: '第三方支付结果未知',
  severity: 'WARNING',
  outstandingAmount: 50,
  ageMinutes: 10,
  paymentOrderId: 'order-1',
  paymentOrderStatus: 'PENDING',
  actions: ['QUERY_PAYMENT', 'CANCEL'],
  suggestion: '支付结果未知，建议核单',
}

function renderWorkspace(exceptions: SettlementException[] = [sampleCriticalException, sampleWarningException], overrides = {}) {
  const api = {
    billing: {
      settlementExceptions: vi.fn().mockResolvedValue(exceptions),
      queryPaymentOrder: vi.fn().mockResolvedValue({ status: 'SUCCESS' }),
      retryBusinessCompletion: vi.fn().mockResolvedValue({}),
      queryInsurance: vi.fn().mockResolvedValue({}),
      reverseInsurance: vi.fn().mockResolvedValue({}),
      cancelSettlement: vi.fn().mockResolvedValue({}),
      ...overrides,
    },
  } as any

  const clinicalContext: ClinicalContext = {
    organization: { id: 'org-1', name: '社区医院' },
    department: { id: 'dept-1', name: '全科门诊' },
  } as ClinicalContext

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/billing/exceptions']}>
        <Routes>
          <Route
            path="/billing/exceptions"
            element={<SettlementExceptionWorkspace api={api} clinicalContext={clinicalContext} />}
          />
          <Route path="/billing/settlement" element={<div data-testid="settlement-desk">收费结算工作台</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { api, view }
}

describe('SettlementExceptionWorkspace', () => {
  it('renders standalone page header and metrics overview', async () => {
    renderWorkspace()
    expect(await screen.findByRole('heading', { level: 1, name: '异常待处理' })).toBeInTheDocument()
    expect(screen.getByText('收费管理')).toBeInTheDocument()

    // 等待数据加载完毕
    expect(await screen.findByText('张三')).toBeInTheDocument()

    // 看板统计
    expect(screen.getByText('待处理总数')).toBeInTheDocument()
    expect(screen.getByText('2 笔')).toBeInTheDocument()
    expect(screen.getByText('紧急单边账')).toBeInTheDocument()
    expect(screen.getByText('1 笔')).toBeInTheDocument()
    expect(screen.getByText('未收金额合计')).toBeInTheDocument()
    expect(screen.getByText('¥90.00')).toBeInTheDocument()
    expect(screen.getByText('涉及就诊人')).toBeInTheDocument()
    expect(screen.getByText('2 人')).toBeInTheDocument()
  })

  it('renders empty state when no exceptions exist', async () => {
    renderWorkspace([])
    expect(await screen.findByText('没有异常结算')).toBeInTheDocument()
    expect(screen.getByText(/单边账、支付未完成和超时未付款的结算单会在这里出现/)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('filters exceptions by severity tabs', async () => {
    renderWorkspace()
    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()

    // 点击紧急单边账过滤
    await userEvent.click(screen.getByRole('tab', { name: /紧急单边账/ }))
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.queryByText('李四')).not.toBeInTheDocument()

    // 点击一般异常过滤
    await userEvent.click(screen.getByRole('tab', { name: /一般异常/ }))
    expect(screen.queryByText('张三')).not.toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()

    // 切换回全部
    await userEvent.click(screen.getByRole('tab', { name: /全部异常/ }))
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('李四')).toBeInTheDocument()
  })

  it('navigates to settlement desk on 去收款 action', async () => {
    renderWorkspace([sampleCriticalException])
    const collectBtn = await screen.findByRole('button', { name: '去收款' })
    await userEvent.click(collectBtn)
    expect(await screen.findByTestId('settlement-desk')).toBeInTheDocument()
  })

  it('executes query payment order action', async () => {
    const { api } = renderWorkspace([sampleWarningException])
    const queryBtn = await screen.findByRole('button', { name: '查询支付结果' })
    await userEvent.click(queryBtn)
    await waitFor(() => {
      expect(api.billing.queryPaymentOrder).toHaveBeenCalledWith('order-1')
    })
    expect(await screen.findByText('操作已完成，列表已刷新。')).toBeInTheDocument()
  })

  it('opens confirmation dialog and reverses insurance on 撤销医保结算', async () => {
    const { api } = renderWorkspace([sampleCriticalException])
    const reverseBtn = await screen.findByRole('button', { name: '撤销医保结算' })
    await userEvent.click(reverseBtn)

    expect(await screen.findByRole('heading', { name: '撤销医保结算' })).toBeInTheDocument()
    const reasonInput = screen.getByPlaceholderText('例如：患者已离院，无法补收')
    fireEvent.change(reasonInput, { target: { value: '患者未补齐自付已离开' } })

    const confirmBtn = screen.getByRole('button', { name: '确认' })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(api.billing.reverseInsurance).toHaveBeenCalledWith('claim-1', {
        commandCode: 'EXC-REV-claim-1',
        reason: '患者未补齐自付已离开',
      })
    })
    expect(await screen.findByText(/已提交医保撤销/)).toBeInTheDocument()
  })
})
