import type { ApiClient } from './httpClient'

export interface BillingWorkItem {
  encounterId: string
  residentId: string
  accountId?: string
  currencyCode?: string
  status: 'PENDING_CHARGE' | 'PENDING_INVOICE' | 'PENDING_PAYMENT' | 'PENDING_REFUND' | 'SETTLED'
  sourceEventCount: number
  chargedEventCount: number
  latestSourceNo: string
  latestOccurredAt: string
  chargeAmount: number
  accountBalance: number
}

export interface ChargeItem {
  id: string
  patientAccountId: string
  residentId: string
  encounterId: string
  requestId?: string
  catalogItemId: string
  sourceType: 'MEDICATION_DISPENSE' | 'MEDICATION_RETURN'
  sourceId: string
  requestCode: string
  status: string
  quantity: number
  unitCode: string
  unitPrice: number
  totalAmount: number
  currencyCode: string
  priceId?: string
  priceRevision?: number
  priceType?: string
  itemCode: string
  itemName: string
  occurredAt: string
  reversesChargeItemId?: string
}

export interface InvoiceLine { id: string; chargeItemId: string; lineNo: number; amount: number }

export interface Invoice {
  id: string
  patientAccountId: string
  invoiceNo: string
  invoiceType: 'STANDARD' | 'CREDIT'
  status: string
  currencyCode: string
  grossAmount: number
  discountAmount: number
  netAmount: number
  paidAmount: number
  outstandingAmount: number
  issuedAt: string
  issuedBy: string
  lines: InvoiceLine[]
}

export interface Payment {
  id: string
  patientAccountId: string
  invoiceId?: string
  paymentNo: string
  paymentType: 'PAYMENT' | 'REFUND'
  paymentMethodCode: string
  status: string
  amount: number
  currencyCode: string
  paidAt: string
  externalTransactionNo?: string
  reversesPaymentId?: string
  enteredBy: string
  description?: string
}

export interface LedgerEntry {
  id: string
  patientAccountId: string
  entryType: string
  direction: 'DEBIT' | 'CREDIT'
  amount: number
  currencyCode: string
  chargeItemId?: string
  invoiceId?: string
  paymentId?: string
  reversesLedgerEntryId?: string
  occurredAt: string
  recordedAt: string
  recordedBy: string
}

export interface AccountStatement {
  accountId: string
  revision: number
  residentId: string
  encounterId: string
  organizationId: string
  departmentId: string
  accountType: string
  currencyCode: string
  status: string
  openedAt: string
  chargeAmount: number
  invoicedAmount: number
  uninvoicedAmount: number
  paymentAmount: number
  refundAmount: number
  accountBalance: number
  charges: ChargeItem[]
  invoices: Invoice[]
  payments: Payment[]
  ledgerEntries: LedgerEntry[]
}

export interface ChargeSynchronization {
  createdCharges: number
  existingCharges: number
  statement: AccountStatement
}

export interface ReconciliationLine {
  sourceId: string
  sourceType: string
  sourceNo?: string
  encounterId: string
  accountId?: string
  chargeItemId?: string
  expectedQuantity?: number
  chargedQuantity?: number
  expectedAmount?: number
  chargedAmount?: number
  status: 'MATCHED' | 'UNCHARGED' | 'MISMATCH' | 'ORPHAN_CHARGE'
  description: string
}

export interface DailyReconciliation {
  businessDate: string
  organizationId: string
  currencyCode: string
  sourceEventCount: number
  chargedEventCount: number
  discrepancyCount: number
  chargeAmount: number
  paymentAmount: number
  refundAmount: number
  ledgerDebit: number
  ledgerCredit: number
  ledgerBalance: number
  lines: ReconciliationLine[]
}

export function createBillingApi(client: ApiClient) {
  return {
    worklist: () => client.request<BillingWorkItem[]>('/api/billing/worklist'),
    statement: (encounterId: string, currencyCode = 'CNY') => client.request<AccountStatement>(
      `/api/billing/encounters/${encounterId}/statement?currencyCode=${encodeURIComponent(currencyCode)}`,
    ),
    synchronize: (encounterId: string, requestCode: string) => client.request<ChargeSynchronization>(
      `/api/billing/encounters/${encounterId}/charges/synchronize`, {
        method: 'POST', body: JSON.stringify({ requestCode }),
      },
    ),
    issueInvoice: (accountId: string, invoiceNo: string) => client.request<Invoice>(
      `/api/billing/accounts/${accountId}/invoices`, {
        method: 'POST', body: JSON.stringify({ invoiceNo }),
      },
    ),
    collect: (invoiceId: string, input: {
      paymentNo: string; paymentMethodCode: string; amount: number
      paymentSceneCode?: string
      externalTransactionNo?: string; description?: string
    }) => client.request<Payment>(`/api/billing/invoices/${invoiceId}/payments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    refund: (paymentId: string, input: {
      refundNo: string; amount: number; externalTransactionNo?: string; reason: string
    }) => client.request<Payment>(`/api/billing/payments/${paymentId}/refunds`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    dailyReconciliation: (businessDate: string) => client.request<DailyReconciliation>(
      `/api/billing/reconciliation/daily?businessDate=${encodeURIComponent(businessDate)}`,
    ),
  }
}
