import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingWorkspace } from './BillingWorkspace'

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
            residentName: '李晓梅', healthRecordNo: 'JMD-0001', gender: 'FEMALE', birthDate: '1988-08-08',
            encounterNo: 'MZ20260830001',
            sourceEventCount: 1, chargedEventCount: 0, accountBalance: 0, currencyCode: 'CNY',
            latestOccurredAt: '2026-08-30T01:00:00Z' },
          { encounterId: 'encounter-target', residentId: 'resident-target', status: 'PENDING_PAYMENT',
            residentName: '王建国', healthRecordNo: 'JMD-0002', gender: 'MALE', birthDate: '1976-03-12',
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
    const user = userEvent.setup()
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
        { code: 'CASH', name: '现金' }, { code: 'MEDICAL_INSURANCE', name: '医保支付' },
      ]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' }, department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByRole('list', { name: '结算进度' })).toHaveTextContent('费用确认')
    expect(screen.getByLabelText('结算类型')).toBeInTheDocument()
    expect(screen.queryByText('医保支付')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成结算凭证' })).not.toBeInTheDocument()
    const settleButton = screen.getByRole('button', { name: '结算' })
    await waitFor(() => expect(settleButton).toBeEnabled())
    await user.click(settleButton)

    await waitFor(() => expect(issueInvoice).toHaveBeenCalledWith('account-1', expect.stringMatching(/^INV-/)))
    await waitFor(() => expect(createPaymentOrder).toHaveBeenCalledWith('settlement-1', expect.objectContaining({
      paymentMethodCode: 'CASH', amount: 28.6,
    })))
  })
})
