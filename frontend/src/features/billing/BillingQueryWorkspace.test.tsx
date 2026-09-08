import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingQueryWorkspace } from './BillingQueryWorkspace'

const record: SettlementRecord = {
  id: 'settlement-1', patientAccountId: 'account-1', residentId: 'resident-1', encounterId: 'encounter-1',
  departmentId: 'department-1', residentName: '王建国', healthRecordNo: 'JMD-0001', gender: 'MALE',
  birthDate: '1976-03-12', encounterNo: 'MZ20260908001', departmentName: '全科门诊',
  settlementNo: 'STL-20260908-001', settlementType: 'NORMAL',
  settlementScene: 'OUTPATIENT', terminalScene: 'CASHIER', status: 'SETTLED', grossAmount: 86,
  discountAmount: 0, insuranceAmount: 50, patientAmount: 36, otherAmount: 0, roundingAmount: 0,
  netAmount: 86, currencyCode: 'CNY', terminalCode: 'CASHIER-01',
  createdAt: '2026-09-08T01:30:00Z', finalizedAt: '2026-09-08T01:31:00Z',
}

function renderWorkspace(sourceRecords: SettlementRecord[] = [record]) {
  const api = { billing: {
    settlementRecords: vi.fn().mockResolvedValue(sourceRecords),
    settlement: vi.fn().mockResolvedValue({ ...record, revision: 1, commandCode: 'SETTLE-001',
      tenderedAmount: 86, outstandingAmount: 0, createdBy: 'user-1', finalizedBy: 'user-1',
      lines: [{ id: 'line-1', chargeItemId: 'charge-1', lineNo: 1, settledQuantity: 2,
        grossAmount: 36, discountAmount: 0, insuranceAmount: 20, patientAmount: 16,
        otherAmount: 0, netAmount: 36 }],
      tenders: [{ id: 'tender-1', lineNo: 1, tenderType: 'DIGITAL', payerName: '微信支付',
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
      receiptType: 'MEDICAL_E_INVOICE', status: 'ISSUED', fiscalNumber: '360100000001', amount: 86,
      currencyCode: 'CNY', issueChannel: 'CASHIER', createdAt: '2026-09-08T01:32:00Z',
      issuedAt: '2026-09-08T01:32:00Z', updatedAt: '2026-09-08T01:32:00Z', duplicate: false }]),
  } } as unknown as RhnApi
  const clinicalContext = {
    organization: { id: 'org-1', name: '青禾镇中心卫生院' },
    department: { id: 'department-1', name: '全科门诊' },
  } as ClinicalContext
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <BillingQueryWorkspace api={api} clinicalContext={clinicalContext} />
  </QueryClientProvider>)
  return api
}

describe('BillingQueryWorkspace', () => {
  it('shows completed settlement, charge, tender and receipt details', async () => {
    const api = renderWorkspace()

    const recordButton = await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    expect(recordButton).toHaveTextContent('王建国')
    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(within(detail).getByText('微信支付')).toBeInTheDocument()
    expect(within(detail).getByText('360100000001')).toBeInTheDocument()
    expect(api.billing.settlementRecords).toHaveBeenCalledWith(200)
  })

  it('filters records by patient identity', async () => {
    renderWorkspace()
    await screen.findByRole('button', { name: '结算记录 STL-20260908-001' })
    await userEvent.type(screen.getByRole('searchbox', { name: '收费记录' }), '不存在的患者')
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
    }
    const api = renderWorkspace([historicalRecord])

    const detail = await screen.findByRole('region', { name: '收费记录详情' })
    expect(await within(detail).findByText('RGI-HISTORICAL-001')).toBeInTheDocument()
    expect(within(detail).getByText('门诊号 --')).toBeInTheDocument()
    expect(api.billing.statement).not.toHaveBeenCalled()
  })
})
