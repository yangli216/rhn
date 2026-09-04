import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { RefundManagementWorkspace } from './RefundManagementWorkspace'

describe('RefundManagementWorkspace', () => {
  const clinicalContext = {
    organization: { id: 'org-1', name: '基层医疗机构' },
    department: { id: 'dept-1', name: '全科医疗科' },
  } as ClinicalContext

  it('does not stay stuck in loading state when refund queue is empty', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([]),
        statement: vi.fn(),
        refundPreCheck: vi.fn().mockResolvedValue(null),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><RefundManagementWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('暂无符合就诊')).toBeInTheDocument()
    expect(screen.queryByText('正在进行临床-药房-医技协同退费前置检查…')).not.toBeInTheDocument()
    expect(screen.getAllByText('请选择就诊患者').length).toBeGreaterThan(0)
    expect(screen.getByText('请先选择就诊')).toBeInTheDocument()
  })

  it('shows no account empty state when selected patient has no account', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'enc-refund-1',
          residentId: 'res-1',
          residentName: '张退费',
          gender: 'FEMALE',
          birthDate: '1990-01-01',
          encounterNo: 'MZ20260901001',
          status: 'PENDING_REFUND',
          sourceEventCount: 1,
          chargedEventCount: 0,
          accountBalance: -50,
          currencyCode: 'CNY',
          latestOccurredAt: '2026-09-01T01:00:00Z',
        }]),
        statement: vi.fn(),
        refundPreCheck: vi.fn().mockResolvedValue(null),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><RefundManagementWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('暂无费用账户')).toBeInTheDocument()
    expect(screen.queryByText('正在进行临床-药房-医技协同退费前置检查…')).not.toBeInTheDocument()
  })

  it('renders collaboration pre-check card and blocks direct refund when item is dispensed', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'enc-1',
          accountId: 'acc-1',
          residentId: 'res-1',
          residentName: '李患者',
          gender: 'MALE',
          birthDate: '1985-05-12',
          encounterNo: 'MZ20260901002',
          status: 'SETTLED',
          sourceEventCount: 1,
          chargedEventCount: 1,
          accountBalance: 0,
          currencyCode: 'CNY',
          latestOccurredAt: '2026-09-01T02:00:00Z',
        }]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-1',
          encounterId: 'enc-1',
          residentId: 'res-1',
          currencyCode: 'CNY',
          chargeAmount: 50,
          paymentAmount: 50,
          refundAmount: 0,
          accountBalance: 0,
          status: 'SETTLED',
          invoices: [],
          payments: [{
            id: 'pay-1',
            paymentNo: 'PAY20260901001',
            paymentType: 'PAYMENT',
            paymentMethodCode: 'WECHAT',
            amount: 50,
            currencyCode: 'CNY',
            status: 'SUCCEEDED',
            paidAt: '2026-09-01T02:05:00Z',
          }],
        }),
        refundPreCheck: vi.fn().mockResolvedValue({
          encounterId: 'enc-1',
          accountId: 'acc-1',
          eligibleForRefund: false,
          overallDecision: 'BLOCKED',
          summaryNotice: '药房已发药出库，严禁直接退款！请先指引患者前往药房办理实物退药核收。',
          totalPaidAmount: 50,
          refundableAmount: 0,
          currencyCode: 'CNY',
          items: [{
            chargeItemId: '101',
            sourceType: 'MEDICATION_REQUEST',
            sourceId: '201',
            documentNo: 'CF20260901001',
            itemName: '头孢克肟胶囊',
            itemCode: 'MED001',
            quantity: 1,
            unitCode: '盒',
            totalAmount: 50,
            executionStatusCode: 'DISPENSED',
            executionStatusName: '已发药',
            allowed: false,
            statusBadgeText: '已发药 · 阻断(需药房退药)',
            statusTone: 'danger',
            blockReason: '药房已发药出库，严禁直接退款！请先指引患者前往药房办理实物退药核收。',
          }],
          refundablePayments: [],
        }),
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/billing/refunds?encounterId=enc-1']}>
        <RefundManagementWorkspace api={api} clinicalContext={clinicalContext} />
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('协同审批防损门禁')).toBeInTheDocument()
    expect(screen.getByText('⛔ 协同校验阻断 · 严禁直接退费')).toBeInTheDocument()
    expect(screen.getByText('已发药 · 阻断(需药房退药)')).toBeInTheDocument()
    expect(screen.getAllByText(/药房已发药出库，严禁直接退款/).length).toBeGreaterThan(0)

    // 确认直接退款按钮为禁用状态
    const refundBtn = screen.getByRole('button', { name: /确认未发药直接退款/ })
    expect(refundBtn).toBeDisabled()
  })

  it('allows direct refund for unexecuted item and executes directRefund mutation', async () => {
    const directRefundMock = vi.fn().mockResolvedValue({
      id: 'rpo-1',
      orderNo: 'RPO-20260901-01',
      status: 'SUCCEEDED',
    })
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'enc-2',
          accountId: 'acc-2',
          residentId: 'res-2',
          residentName: '王误收',
          gender: 'FEMALE',
          birthDate: '1992-08-18',
          encounterNo: 'MZ20260901003',
          status: 'SETTLED',
          sourceEventCount: 1,
          chargedEventCount: 1,
          accountBalance: 0,
          currencyCode: 'CNY',
          latestOccurredAt: '2026-09-01T03:00:00Z',
        }]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-2',
          encounterId: 'enc-2',
          residentId: 'res-2',
          currencyCode: 'CNY',
          chargeAmount: 38,
          paymentAmount: 38,
          refundAmount: 0,
          accountBalance: 0,
          status: 'SETTLED',
          invoices: [],
          payments: [{
            id: 'pay-2',
            paymentNo: 'PAY20260901002',
            paymentType: 'PAYMENT',
            paymentMethodCode: 'ALIPAY',
            amount: 38,
            currencyCode: 'CNY',
            status: 'SUCCEEDED',
            paidAt: '2026-09-01T03:05:00Z',
          }],
        }),
        refundPreCheck: vi.fn().mockResolvedValue({
          encounterId: 'enc-2',
          accountId: 'acc-2',
          eligibleForRefund: true,
          overallDecision: 'ALLOWED',
          summaryNotice: '未发药未执行医嘱核验通过，符合直接退费防损策略。',
          totalPaidAmount: 38,
          refundableAmount: 38,
          currencyCode: 'CNY',
          items: [{
            chargeItemId: '102',
            sourceType: 'MEDICATION_REQUEST',
            sourceId: '202',
            documentNo: 'CF20260901002',
            itemName: '感冒止咳糖浆',
            itemCode: 'MED002',
            quantity: 2,
            unitCode: '瓶',
            totalAmount: 38,
            executionStatusCode: 'UNDISPENSED',
            executionStatusName: '未发药',
            allowed: true,
            statusBadgeText: '未发药 · 允许直接退款',
            statusTone: 'success',
          }],
          refundablePayments: [],
        }),
        directRefund: directRefundMock,
      },
    } as unknown as RhnApi
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/billing/refunds?encounterId=enc-2']}>
        <RefundManagementWorkspace api={api} clinicalContext={clinicalContext} />
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('协同审批防损门禁')).toBeInTheDocument()
    expect(screen.getByText('✅ 协同校验通过 · 允许直接退费')).toBeInTheDocument()
    expect(screen.getByText('未发药 · 允许直接退款')).toBeInTheDocument()
    expect((await screen.findAllByText('PAY20260901002')).length).toBeGreaterThan(0)

    // 确认直接退款按钮可用并能触发点击
    const refundBtn = await screen.findByRole('button', { name: /确认未发药直接退款/ })
    expect(refundBtn).not.toBeDisabled()

    fireEvent.click(refundBtn)
    await waitFor(() => {
      expect(directRefundMock).toHaveBeenCalledWith('pay-2', expect.objectContaining({
        refundAmount: 38,
        terminalCode: 'CASHIER-WEB',
        chargeItemIds: ['102'],
      }))
    })
  })
})
