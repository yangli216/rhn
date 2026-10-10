import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingWorkspace, resolveChargeCategory, resolveChargeIcon } from './BillingWorkspace'

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="current-search">{location.search}</output>
}

describe('BillingWorkspace deep link', () => {
  it('selects the linked encounter and consumes the transient route parameters', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([
          { encounterId: 'encounter-first', residentId: 'resident-first', status: 'PENDING_CHARGE',
            residentName: '李晓梅', healthRecordNo: 'JMD-0001', gender: 'FEMALE', genderText: '女', birthDate: '1988-08-08',
            encounterNo: 'MZ20260830001',
            sourceEventCount: 1, chargedEventCount: 0, accountBalance: 0, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T01:00:00Z' },
          { encounterId: 'encounter-target', residentId: 'resident-target', status: 'PENDING_PAYMENT',
            residentName: '王建国', healthRecordNo: 'JMD-0002', gender: 'MALE', genderText: '男', birthDate: '1976-03-12',
            encounterNo: 'MZ20260830002',
            sourceEventCount: 2, chargedEventCount: 2, accountBalance: 28.6, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T02:00:00Z' },
        ]),
        dailyReconciliation: vi.fn().mockResolvedValue({
          businessDate: '2026-08-30', sourceEventCount: 0, chargedEventCount: 0,
          discrepancyCount: 0, ledgerDebit: 0, ledgerCredit: 0, lines: [],
        }),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    const { container } = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/billing?encounterId=encounter-target']}>
        <BillingWorkspace api={api} clinicalContext={clinicalContext} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>)

    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('王建国'))
    const selectedItem = container.querySelector('.billing-queue-list button.is-active')
    expect(selectedItem).toHaveTextContent('男')
    expect(selectedItem).toHaveTextContent('岁')
    expect(selectedItem).not.toHaveTextContent('MZ20260830002')
    expect(selectedItem).not.toHaveTextContent('JMD-0002')
    expect(selectedItem).not.toHaveTextContent('2/2')
    expect(container.querySelector('.billing-workspace-scroll')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('current-search')).toBeEmptyDOMElement())
  })

  it('uses one settlement action to create the settlement and start payment', async () => {
    const charge = {
      id: 'charge-1', patientAccountId: 'account-1', residentId: 'resident-1', encounterId: 'encounter-1',
      catalogItemId: 'catalog-1', sourceType: 'REGISTRATION', sourceId: 'registration-1', requestCode: 'REQ-1',
      status: 'POSTED', quantity: 1, unitCode: '次', unitPrice: 28.6, totalAmount: 28.6, currencyCode: 'CNY',
      itemCode: 'SRV-GP', itemName: '全科门诊诊查', occurredAt: '2026-08-31T01:00:00Z',
    }
    const initialStatement = {
      accountId: 'account-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-1',
      organizationId: 'org-1', departmentId: 'dept-1', accountType: 'OUTPATIENT', currencyCode: 'CNY',
      status: 'OPEN', openedAt: '2026-08-31T01:00:00Z', chargeAmount: 28.6, invoicedAmount: 0,
      uninvoicedAmount: 28.6, paymentAmount: 0, refundAmount: 0, accountBalance: 28.6,
      charges: [charge], invoices: [], settlements: [], payments: [], ledgerEntries: [],
    }
    const invoice = {
      id: 'invoice-1', patientAccountId: 'account-1', invoiceNo: 'INV-1', invoiceType: 'STANDARD', status: 'ISSUED',
      currencyCode: 'CNY', grossAmount: 28.6, discountAmount: 0, netAmount: 28.6, paidAmount: 0,
      outstandingAmount: 28.6, issuedAt: '2026-08-31T01:01:00Z', issuedBy: 'cashier',
      lines: [{ id: 'line-1', chargeItemId: 'charge-1', lineNo: 1, amount: 28.6 }],
    }
    const settlement = {
      id: 'settlement-1', revision: 0, patientAccountId: 'account-1', legacyInvoiceId: 'invoice-1',
      settlementNo: 'INV-1', commandCode: 'INV-1', settlementType: 'NORMAL', settlementScene: 'OUTPATIENT',
      terminalScene: 'CASHIER', status: 'PAYMENT_PENDING', grossAmount: 28.6, discountAmount: 0,
      insuranceAmount: 0, patientAmount: 28.6, otherAmount: 0, roundingAmount: 0, netAmount: 28.6,
      tenderedAmount: 0, outstandingAmount: 28.6, currencyCode: 'CNY', createdBy: 'cashier',
      createdAt: '2026-08-31T01:01:00Z', lines: [], tenders: [], events: [],
    }
    const statement = vi.fn().mockResolvedValueOnce(initialStatement).mockResolvedValue({
      ...initialStatement, revision: 2, invoicedAmount: 28.6, uninvoicedAmount: 0,
      invoices: [invoice], settlements: [settlement],
    })
    const issueInvoice = vi.fn().mockResolvedValue(invoice)
    const createPaymentOrder = vi.fn().mockResolvedValue({ id: 'payment-order-1', status: 'SUCCEEDED' })
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{ encounterId: 'encounter-1', residentId: 'resident-1',
          residentName: '王建国', healthRecordNo: 'JMD-0001', gender: 'MALE', birthDate: '1976-03-12',
          encounterNo: 'MZ20260831001', accountId: 'account-1', status: 'PENDING_INVOICE', sourceEventCount: 1,
          chargedEventCount: 1, latestSourceNo: 'REQ-1', latestOccurredAt: '2026-08-31T01:00:00Z',
          chargeAmount: 28.6, accountBalance: 28.6, currencyCode: 'CNY' }]),
        statement,
        paymentOrders: vi.fn().mockResolvedValue([]),
        issueInvoice,
        createPaymentOrder,
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([
        { code: 'CASH', name: '现金', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }, { code: 'MEDICAL_INSURANCE', name: '医保支付' },
      ]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('待支付金额')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '结算进度' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('结算类型')).toBeInTheDocument()
    expect(screen.queryByText('医保支付')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成结算凭证' })).not.toBeInTheDocument()
    const settleButton = screen.getByRole('button', { name: '结算开票 (Ctrl+Enter)' })
    expect(await screen.findByPlaceholderText('28.6')).toHaveValue(28.6)
    await waitFor(() => expect(settleButton).toBeEnabled())
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))

    await waitFor(() => expect(issueInvoice).toHaveBeenCalledWith(
      'account-1',
      expect.stringMatching(/^INV-/),
      undefined,
      ['charge-1'],
    ))
    await waitFor(() => expect(createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({
      paymentMethodCode: 'CASH', amount: 28.6,
    })))
  })

  it('does not stay stuck in loading state when queue is empty, displays empty prompt', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([]),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('暂无待收费患者')).toBeInTheDocument()
    expect(screen.queryByText('正在加载费用明细…')).not.toBeInTheDocument()
    expect(screen.getByText('请选择待收费患者')).toBeInTheDocument()
    expect(screen.getByText('请先选择患者')).toBeInTheDocument()
  })

  it('displays unsynchronized account prompt without stuck loading when patient has no accountId', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'encounter-new', residentId: 'resident-new', status: 'PENDING_CHARGE',
          residentName: '赵新生', healthRecordNo: 'JMD-0003', gender: 'MALE', birthDate: '1995-05-05',
          encounterNo: 'MZ20260830003', sourceEventCount: 1, chargedEventCount: 0, accountBalance: 0,
          currencyCode: 'CNY', latestOccurredAt: '2026-08-30T03:00:00Z',
        }]),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('尚未形成费用账户')).toBeInTheDocument()
    expect(screen.queryByText('正在加载费用明细…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '生成收费事项' })).toBeInTheDocument()
    expect(screen.getByText('等待生成收费事项')).toBeInTheDocument()
  })

  it('selects patient and displays notice when barcode scanner reads encounter barcode', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([
          { encounterId: 'enc-1', residentId: 'res-1', status: 'PENDING_PAYMENT',
            residentName: '李晓梅', healthRecordNo: 'JMD-0001', gender: 'FEMALE', genderText: '女', birthDate: '1988-08-08',
            encounterNo: 'MZ20260830001', accountId: 'acc-1',
            sourceEventCount: 1, chargedEventCount: 1, accountBalance: 15, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T01:00:00Z' },
          { encounterId: 'enc-2', residentId: 'res-2', status: 'PENDING_PAYMENT',
            residentName: '王建国', healthRecordNo: 'JMD-0002', gender: 'MALE', genderText: '男', birthDate: '1976-03-12',
            encounterNo: 'MZ20260830002', accountId: 'acc-2',
            sourceEventCount: 2, chargedEventCount: 2, accountBalance: 28.6, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T02:00:00Z' },
        ]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-2', encounterId: 'enc-2', residentId: 'res-2', residentName: '王建国',
          status: 'OPEN', currencyCode: 'CNY', chargeAmount: 28.6, invoicedAmount: 0,
          paymentAmount: 0, refundAmount: 0, accountBalance: 28.6, uninvoicedAmount: 28.6,
          charges: [], invoices: [], settlements: [], payments: [],
        }),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
        paymentOrders: vi.fn().mockResolvedValue([]),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    // Initially enc-1 is selected (李晓梅)
    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('李晓梅'))

    // Simulate rapid barcode scanner typing MZ20260830002 + Enter
    const code = 'MZ20260830002'
    for (const char of code) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    // Now enc-2 (王建国) should be selected and notice displayed
    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('王建国'))
    expect(await screen.findByText(/已扫码定位患者：王建国/)).toBeInTheDocument()
  })

  it('navigates patient queue with ArrowDown and cycles the queue with F2', async () => {
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([
          { encounterId: 'enc-1', residentId: 'res-1', status: 'PENDING_PAYMENT',
            residentName: '李晓梅', healthRecordNo: 'JMD-0001', gender: 'FEMALE', genderText: '女', birthDate: '1988-08-08',
            encounterNo: 'MZ20260830001', accountId: 'acc-1',
            sourceEventCount: 1, chargedEventCount: 1, accountBalance: 15, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T01:00:00Z' },
          { encounterId: 'enc-2', residentId: 'res-2', status: 'PENDING_PAYMENT',
            residentName: '王建国', healthRecordNo: 'JMD-0002', gender: 'MALE', genderText: '男', birthDate: '1976-03-12',
            encounterNo: 'MZ20260830002', accountId: 'acc-2',
            sourceEventCount: 2, chargedEventCount: 2, accountBalance: 28.6, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T02:00:00Z' },
        ]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-1', encounterId: 'enc-1', residentId: 'res-1', residentName: '李晓梅',
          status: 'OPEN', currencyCode: 'CNY', chargeAmount: 15, invoicedAmount: 0,
          paymentAmount: 0, refundAmount: 0, accountBalance: 15, uninvoicedAmount: 15,
          charges: [], invoices: [], settlements: [], payments: [],
        }),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
        paymentOrders: vi.fn().mockResolvedValue([]),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('李晓梅'))

    // Press ArrowDown to switch patient
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('王建国'))

    // Press F2 to cycle to the next queue patient
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }))
    await waitFor(() => expect(container.querySelector('.billing-queue-list button.is-active'))
      .toHaveTextContent('李晓梅'))
  })

  it('groups charges by document, supports checkbox partial selection, and warns for expired prescriptions', async () => {
    const user = userEvent.setup()
    const issueInvoice = vi.fn().mockResolvedValue({ id: 'invoice-part-1', invoiceNo: 'INV-PART-1' })
    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([{
          encounterId: 'encounter-group', residentId: 'resident-group', status: 'PENDING_PAYMENT',
          residentName: '钱多宝', healthRecordNo: 'JMD-0009', gender: 'MALE', birthDate: '1985-05-05',
          encounterNo: 'MZ20260830009', accountId: 'acc-group',
          sourceEventCount: 2, chargedEventCount: 2, accountBalance: 58.6, currencyCode: 'CNY',
          latestOccurredAt: '2026-08-30T01:00:00Z',
        }]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-group', encounterId: 'encounter-group', residentId: 'resident-group', residentName: '钱多宝',
          status: 'OPEN', currencyCode: 'CNY', chargeAmount: 58.6, invoicedAmount: 0,
          paymentAmount: 0, refundAmount: 0, accountBalance: 58.6, uninvoicedAmount: 58.6,
          charges: [
            {
              id: 'charge-rx-1', patientAccountId: 'acc-group', residentId: 'resident-group', encounterId: 'encounter-group',
              sourceType: 'MEDICATION_REQUEST', sourceId: '101', requestCode: 'CF-20260830001', status: 'ACTIVE',
              quantity: 1, unitCode: '盒', unitPrice: 28.6, totalAmount: 28.6, currencyCode: 'CNY',
              priceType: 'RETAIL', itemCode: 'MED001', itemName: '阿莫西林胶囊',
              // 5 days ago (> 72h)
              occurredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
            },
            {
              id: 'charge-service-1', patientAccountId: 'acc-group', residentId: 'resident-group', encounterId: 'encounter-group',
              sourceType: 'SERVICE_REQUEST', sourceId: '201', requestCode: 'EX-20260830002', status: 'ACTIVE',
              quantity: 1, unitCode: '次', unitPrice: 30, totalAmount: 30, currencyCode: 'CNY',
              priceType: 'STANDARD', itemCode: 'SRV001', itemName: '常规心电图检查',
              occurredAt: new Date().toISOString(),
            },
          ],
          invoices: [], settlements: [], payments: [],
        }),
        issueInvoice,
        settlement: vi.fn().mockResolvedValue({ id: 'settlement-part-1' }),
        createPaymentOrder: vi.fn().mockResolvedValue({ id: 'order-part-1', status: 'SUCCEEDED', events: [] }),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
        paymentOrders: vi.fn().mockResolvedValue([]),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    // 1. Verify document groups rendered
    expect(await screen.findAllByLabelText('开单科室 / 开单医生')).toHaveLength(2)
    expect(screen.getAllByText('科室未记录')).toHaveLength(2)
    expect(screen.getAllByText('医生未记录')).toHaveLength(2)
    expect(screen.queryByText('CF-20260830001')).not.toBeInTheDocument()
    expect(screen.queryByText('EX-20260830002')).not.toBeInTheDocument()

    // 2. Verify 72-hour prescription expiration warning badge
    expect(screen.getByText('处方已超72小时')).toBeInTheDocument()

    // 3. Verify selection summary initially has 2 items selected (¥58.60)
    expect(screen.getByText(/已勾选总金额/)).toHaveTextContent('2 / 2 项')
    expect(screen.getByText(/已勾选总金额/).querySelector('.billing-selection-summary__amount')).toHaveTextContent('¥58.60')

    // 4. Uncheck the service request item (30.00)
    const serviceCheckbox = screen.getByLabelText('勾选项目 常规心电图检查')
    await user.click(serviceCheckbox)

    // Selection should now be 1 item (¥28.60)
    expect(screen.getByText(/已勾选总金额/)).toHaveTextContent('1 / 2 项')
    expect(screen.getByText(/已勾选总金额/).querySelector('.billing-selection-summary__amount')).toHaveTextContent('¥28.60')

    // 5. Settle only the selected medication item
    const settleButton = screen.getByRole('button', { name: '结算开票 (Ctrl+Enter)' })
    expect(await screen.findByPlaceholderText('28.6')).toHaveValue(28.6)
    await waitFor(() => expect(settleButton).toBeEnabled())
    await user.click(settleButton)

    // Verify issueInvoice was called with ONLY ['charge-rx-1']
    await waitFor(() => expect(issueInvoice).toHaveBeenCalledWith(
      'acc-group',
      expect.stringMatching(/^INV-/),
      undefined,
      ['charge-rx-1'],
    ))
  })

  it('supports viewing fiscal electronic receipt from banner', async () => {
    const user = userEvent.setup()
    const mockReceipt = {
      id: 'rcpt-999',
      revision: 1,
      settlementId: 'settle-done',
      receiptNo: 'RCPT-2026-999',
      commandCode: 'ISSUE-999',
      receiptType: 'MEDICAL_E_INVOICE',
      status: 'ISSUED',
      fiscalAuthorityCode: '360100',
      fiscalCode: '3601060126',
      fiscalNumber: '0001859231',
      verificationCode: '251132',
      controlledObjectReference: 'https://pjcy.jx-fiscal.gov.cn/bill/verify',
      amount: 120.0,
      currencyCode: 'CNY',
      issueChannel: 'CASHIER',
      payerName: '李晓梅',
      duplicate: false,
      createdAt: '2026-09-04T10:00:00Z',
      issuedAt: '2026-09-04T10:00:05Z',
      updatedAt: '2026-09-04T10:00:05Z',
    }

    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([
          { encounterId: 'encounter-done', residentId: 'resident-1', accountId: 'acc-done', status: 'SETTLED',
            residentName: '李晓梅', healthRecordNo: 'JMD-0001', gender: 'FEMALE', genderText: '女', birthDate: '1988-08-08',
            encounterNo: 'MZ20260904001', sourceEventCount: 1, chargedEventCount: 1, accountBalance: 0,
            currencyCode: 'CNY', latestOccurredAt: '2026-09-04T01:00:00Z' },
        ]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-done',
          charges: [],
          invoices: [],
          settlements: [
            { id: 'settle-done', settlementNo: 'SETL-01', settlementType: 'NORMAL', status: 'SETTLED',
              grossAmount: 120.0, insuranceAmount: 80.0, patientAmount: 40.0, otherAmount: 0,
              outstandingAmount: 0, currencyCode: 'CNY', payerName: '李晓梅', createdAt: '2026-09-04T09:00:00Z',
              lines: [{ id: 'line-1', settlementId: 'settle-done', lineNo: 1, itemName: '门诊诊查费', netAmount: 120.0, settledQuantity: 1 }],
              tenders: [], events: [] },
          ],
          payments: [],
          currencyCode: 'CNY',
          accountBalance: 0,
        }),
        paymentOrders: vi.fn().mockResolvedValue([]),
        settlementReceipts: vi.fn().mockResolvedValue([mockReceipt]),
        dailyReconciliation: vi.fn().mockResolvedValue({ businessDate: '2026-09-04', lines: [] }),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi

    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/billing?encounterId=encounter-done']}>
          <BillingWorkspace api={api} clinicalContext={clinicalContext} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // 等待并点击“查看电子票据”
    const viewReceiptBtn = await screen.findByRole('button', { name: /查看电子票据/ })
    expect(viewReceiptBtn).toBeInTheDocument()
    await user.click(viewReceiptBtn)

    // 验证弹出发票预览并展示四要素
    expect(await screen.findByText('电子票据信息')).toBeInTheDocument()
    expect(screen.getByText('3601060126')).toBeInTheDocument()
    expect(screen.getAllByText('0001859231').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('251132')).toBeInTheDocument()
  })

  it('filters out fully settled charges from fee details, displays single table header with fee category column and marks unpaid charges as 待缴款', async () => {
    const paidCharge = {
      id: 'ch-paid', patientAccountId: 'acc-mix', residentId: 'res-mix', encounterId: 'enc-mix',
      sourceType: 'REGISTRATION', sourceId: 'reg-1', requestCode: 'REG-1001',
      quantity: 1, unitCode: '次', unitPrice: 10, totalAmount: 10, currencyCode: 'CNY',
      itemCode: 'SRV-REG', itemName: '全科门诊诊查费', occurredAt: '2026-10-09T01:00:00Z',
      accountingCategory: 'REGISTRATION',
    }
    const unpaidCharge1 = {
      id: 'ch-lab-1', patientAccountId: 'acc-mix', residentId: 'res-mix', encounterId: 'enc-mix',
      sourceType: 'SERVICE_REQUEST', sourceId: 'lab-1', requestCode: 'SR-LAB-01',
      quantity: 1, unitCode: 'BOX', unitName: 'Carton', unitPrice: 15, totalAmount: 15, currencyCode: 'CNY',
      itemCode: 'LAB-CBC', itemName: '血常规（五分类）', occurredAt: '2026-10-09T01:30:00Z',
      accountingCategory: 'LABORATORY', accountingCategoryText: '检验费',
      ordering: { departmentId: 'dept-order', departmentName: '开单内科', practitionerId: 'doctor-order', doctorName: '王医生', serviceType: 'LABORATORY' },
    }
    const unpaidCharge2 = {
      id: 'ch-lab-2', patientAccountId: 'acc-mix', residentId: 'res-mix', encounterId: 'enc-mix',
      sourceType: 'SERVICE_REQUEST', sourceId: 'lab-2', requestCode: 'SR-LAB-02',
      quantity: 1, unitCode: 'CUSTOM_UNIT', unitPrice: 25, totalAmount: 25, currencyCode: 'CNY',
      itemCode: 'DEMO-LAB-CRP', itemName: 'C反应蛋白测定', occurredAt: '2026-10-09T01:30:00Z',
      accountingCategory: 'LABORATORY', accountingCategoryText: '检验费',
      ordering: { departmentId: 'dept-order', departmentName: '开单内科', practitionerId: 'doctor-order', doctorName: '王医生', serviceType: 'LABORATORY' },
    }

    const paidInvoice = {
      id: 'inv-paid', patientAccountId: 'acc-mix', invoiceNo: 'INV-PAID', invoiceType: 'STANDARD',
      status: 'ISSUED', currencyCode: 'CNY', grossAmount: 10, discountAmount: 0, netAmount: 10,
      paidAmount: 10, outstandingAmount: 0, issuedAt: '2026-10-09T01:01:00Z', issuedBy: 'cashier',
      lines: [{ id: 'line-paid', chargeItemId: 'ch-paid', lineNo: 1, amount: 10 }],
    }
    const unpaidInvoice = {
      id: 'inv-unpaid', patientAccountId: 'acc-mix', invoiceNo: 'INV-UNPAID', invoiceType: 'STANDARD',
      status: 'ISSUED', currencyCode: 'CNY', grossAmount: 40, discountAmount: 0, netAmount: 40,
      paidAmount: 0, outstandingAmount: 40, issuedAt: '2026-10-09T01:35:00Z', issuedBy: 'cashier',
      lines: [
        { id: 'line-unpaid-1', chargeItemId: 'ch-lab-1', lineNo: 1, amount: 15 },
        { id: 'line-unpaid-2', chargeItemId: 'ch-lab-2', lineNo: 2, amount: 25 },
      ],
    }

    const paidSettlement = {
      id: 'set-paid', revision: 1, patientAccountId: 'acc-mix', legacyInvoiceId: 'inv-paid',
      settlementNo: 'INV-PAID', commandCode: 'SETL-PAID', settlementType: 'NORMAL', settlementScene: 'REGISTRATION',
      terminalScene: 'CASHIER', status: 'SETTLED', grossAmount: 10, discountAmount: 0, insuranceAmount: 0,
      patientAmount: 10, otherAmount: 0, roundingAmount: 0, netAmount: 10, tenderedAmount: 10,
      outstandingAmount: 0, currencyCode: 'CNY', createdBy: 'cashier', createdAt: '2026-10-09T01:01:00Z',
      lines: [{ id: 'set-line-paid', chargeItemId: 'ch-paid', lineNo: 1, settledQuantity: 1, grossAmount: 10, discountAmount: 0, insuranceAmount: 0, patientAmount: 10, otherAmount: 0, netAmount: 10 }],
      tenders: [{ id: 'ten-1', lineNo: 1, tenderType: 'CASH', amount: 10, currencyCode: 'CNY' }],
      events: [],
    }
    const unpaidSettlement = {
      id: 'set-unpaid', revision: 0, patientAccountId: 'acc-mix', legacyInvoiceId: 'inv-unpaid',
      settlementNo: 'INV-UNPAID', commandCode: 'SETL-UNPAID', settlementType: 'NORMAL', settlementScene: 'OUTPATIENT',
      terminalScene: 'CASHIER', status: 'PRICED', grossAmount: 40, discountAmount: 0, insuranceAmount: 0,
      patientAmount: 40, otherAmount: 0, roundingAmount: 0, netAmount: 40, tenderedAmount: 0,
      outstandingAmount: 40, currencyCode: 'CNY', createdBy: 'cashier', createdAt: '2026-10-09T01:35:00Z',
      lines: [
        { id: 'set-line-1', chargeItemId: 'ch-lab-1', lineNo: 1, settledQuantity: 1, grossAmount: 15, discountAmount: 0, insuranceAmount: 0, patientAmount: 15, otherAmount: 0, netAmount: 15 },
        { id: 'set-line-2', chargeItemId: 'ch-lab-2', lineNo: 2, settledQuantity: 1, grossAmount: 25, discountAmount: 0, insuranceAmount: 0, patientAmount: 25, otherAmount: 0, netAmount: 25 },
      ],
      tenders: [],
      events: [],
    }

    const api = {
      billing: {
        worklist: vi.fn().mockResolvedValue([
          { encounterId: 'enc-mix', residentId: 'res-mix', status: 'PENDING_PAYMENT',
            residentName: '陈明远', healthRecordNo: 'HR-3301', gender: 'MALE', genderText: '男', birthDate: '2020-09-10',
            encounterNo: 'OP-20261009', accountId: 'acc-mix',
            sourceEventCount: 3, chargedEventCount: 3, accountBalance: 40, currencyCode: 'CNY',
            latestOccurredAt: '2026-10-09T01:30:00Z' },
        ]),
        statement: vi.fn().mockResolvedValue({
          accountId: 'acc-mix', encounterId: 'enc-mix', residentId: 'res-mix', residentName: '陈明远',
          status: 'OPEN', currencyCode: 'CNY', chargeAmount: 50, invoicedAmount: 50,
          paymentAmount: 10, refundAmount: 0, accountBalance: 40, uninvoicedAmount: 0,
          charges: [paidCharge, unpaidCharge1, unpaidCharge2],
          invoices: [paidInvoice, unpaidInvoice],
          settlements: [paidSettlement, unpaidSettlement],
          payments: [{ id: 'p1', amount: 10, paymentType: 'PAYMENT', paidAt: '2026-10-09T01:01:00Z', paymentNo: 'P-1', paymentMethodCode: 'CASH', status: 'COMPLETED', enteredBy: 'c1' }],
        }),
        dailyReconciliation: vi.fn().mockResolvedValue({}),
        paymentOrders: vi.fn().mockResolvedValue([]),
      },
      dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    // 1. 已结清的挂号诊查费不应出现在费用明细中
    await waitFor(() => expect(screen.getByText('血常规（五分类）')).toBeInTheDocument())
    expect(screen.queryByText('全科门诊诊查费')).not.toBeInTheDocument()
    expect(screen.queryByText('REG-1001')).not.toBeInTheDocument()

    // 2. 检查单一表头，表头仅出现一次，且包含“费用归并”列
    const tableHeaders = container.querySelectorAll('.billing-table--grouped thead')
    expect(tableHeaders.length).toBe(1)
    expect(screen.getByRole('columnheader', { name: '费用归并' })).toBeInTheDocument()

    // 3. 验证费用归并分类正确识别为“检验费”
    expect(screen.getByText('1 Carton')).toBeInTheDocument()
    expect(screen.getByText('1 CUSTOM_UNIT')).toBeInTheDocument()
    const labBadges = screen.getAllByText('检验费')
    expect(labBadges.length).toBeGreaterThanOrEqual(2)

    // 4. 验证未支付的单据和项目状态为“待缴款”，不再错误显示为“已全额结算”
    expect(screen.queryByText('已全额结算')).not.toBeInTheDocument()
    expect(screen.queryByText('已结')).not.toBeInTheDocument()
    const pendingPaymentBadges = screen.getAllByText('待缴款')
    expect(pendingPaymentBadges).toHaveLength(2)
    const groups = container.querySelectorAll('.billing-doc-group-row')
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(group).toHaveTextContent('开单内科')
      expect(group).toHaveTextContent('王医生')
      expect(group).not.toHaveTextContent('待缴款')
      expect(group).not.toHaveTextContent('检查/检验处置单')
      expect(group).not.toHaveTextContent('SR-LAB')
      expect(group.querySelector('[data-icon="flask"]')).not.toBeNull()
    }
  })

  it('uses server dictionary text including tenant labels and preserves unresolved codes', () => {
    expect(resolveChargeCategory({ accountingCategory: 'LABORATORY', accountingCategoryText: '本院检验收费' } as any))
      .toEqual({ code: 'LABORATORY', name: '本院检验收费', tone: 'info' })
    expect(resolveChargeCategory({ accountingCategory: 'REHAB', accountingCategoryText: '康复理疗费' } as any))
      .toEqual({ code: 'REHAB', name: '康复理疗费', tone: 'neutral' })
    expect(resolveChargeCategory({ accountingCategory: 'HERBAL_MED', accountingCategoryText: '中药饮片费' } as any))
      .toEqual({ code: 'HERBAL_MED', name: '中药饮片费', tone: 'neutral' })
    expect(resolveChargeCategory({ accountingCategory: 'LABORATORY' } as any))
      .toEqual({ code: 'LABORATORY', name: 'LABORATORY', tone: 'info' })
    expect(resolveChargeCategory({ accountingCategory: 'UNKNOWN', accountingCategoryText: ' ' } as any))
      .toEqual({ code: 'UNKNOWN', name: 'UNKNOWN', tone: 'neutral' })
    expect(resolveChargeCategory({ sourceType: 'MEDICATION_REQUEST' } as any))
      .toEqual({ code: '', name: '分类未确认', tone: 'neutral' })
    expect(resolveChargeCategory({ accountingCategory: 'UNCLASSIFIED' } as any))
      .toEqual({ code: 'UNCLASSIFIED', name: '分类未确认', tone: 'neutral' })
  })
  it('uses clinical service types for laboratory and examination icons', () => {
    expect(resolveChargeIcon({ sourceType: 'SERVICE_REQUEST', ordering: { serviceType: 'LABORATORY' } } as any)).toBe('flask')
    expect(resolveChargeIcon({ sourceType: 'SERVICE_REQUEST', ordering: { serviceType: 'EXAMINATION' } } as any)).toBe('scan')
    expect(resolveChargeIcon({ sourceType: 'MEDICATION_REQUEST' } as any)).toBe('pill')
    expect(resolveChargeIcon({ sourceType: 'SERVICE_REQUEST', accountingCategory: 'LABORATORY' } as any)).toBe('file-text')
  })

})
