import type { ApiClient } from './httpClient'

export interface BillingWorkItem {
  encounterId: string
  residentId: string
  residentName: string
  healthRecordNo: string
  gender: string
  birthDate: string
  encounterNo: string
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
  sourceType: 'REGISTRATION' | 'SERVICE_REQUEST' | 'SERVICE_REQUEST_REVERSAL'
    | 'MEDICATION_REQUEST' | 'MEDICATION_REQUEST_REVERSAL' | 'MEDICATION_DISPENSE' | 'MEDICATION_RETURN'
    | 'INPATIENT_ORDER_TASK' | 'INPATIENT_BED_DAY' | 'INPATIENT_BED_DAY_REVERSAL'
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

export interface SettlementLine {
  id: string
  chargeItemId: string
  lineNo: number
  settledQuantity: number
  grossAmount: number
  discountAmount: number
  insuranceAmount: number
  patientAmount: number
  otherAmount: number
  netAmount: number
}

export interface SettlementTender {
  id: string
  paymentId?: string
  claimResponseId?: string
  lineNo: number
  tenderType: string
  payerCode?: string
  payerName?: string
  amount: number
  currencyCode: string
}

export interface SettlementEvent {
  id: string
  eventType: string
  statusFrom?: string
  statusTo: string
  commandCode: string
  actorId?: string
  errorCode?: string
  errorMessage?: string
  occurredAt: string
}

export interface Settlement {
  id: string
  revision: number
  patientAccountId: string
  reversesSettlementId?: string
  legacyInvoiceId?: string
  settlementNo: string
  commandCode: string
  settlementType: 'NORMAL' | 'REVERSAL' | 'SUPPLEMENT'
  settlementScene: 'REGISTRATION' | 'OUTPATIENT' | 'INPATIENT' | 'HOME_BED' | 'PHARMACY'
  terminalScene: 'CASHIER' | 'DOCTOR_STATION' | 'SELF_SERVICE' | 'MOBILE' | 'ONLINE'
  status: 'DRAFT' | 'PRICED' | 'PAYMENT_PENDING' | 'PARTIAL' | 'SETTLED' | 'REVERSING' | 'REVERSED' | 'FAILED'
  grossAmount: number
  discountAmount: number
  insuranceAmount: number
  patientAmount: number
  otherAmount: number
  roundingAmount: number
  netAmount: number
  tenderedAmount: number
  outstandingAmount: number
  currencyCode: string
  terminalCode?: string
  createdBy: string
  createdAt: string
  finalizedBy?: string
  finalizedAt?: string
  errorCode?: string
  errorMessage?: string
  lines: SettlementLine[]
  tenders: SettlementTender[]
  events: SettlementEvent[]
}

export interface Payment {
  id: string
  patientAccountId: string
  invoiceId?: string
  paymentOrderId?: string
  paymentNo: string
  paymentType: 'PAYMENT' | 'REFUND'
  paymentMethodCode: string
  paymentSceneCode?: string
  status: string
  amount: number
  currencyCode: string
  paidAt: string
  externalTransactionNo?: string
  reversesPaymentId?: string
  enteredBy: string
  description?: string
}

export interface PaymentOrderEvent {
  id: string
  externalMessageId?: string
  eventType: string
  statusFrom?: string
  statusTo: string
  commandCode: string
  externalTransactionNo?: string
  eventAmount?: number
  errorCode?: string
  errorMessage?: string
  occurredAt: string
}

export interface PaymentOrder {
  id: string
  revision: number
  patientAccountId: string
  settlementId: string
  originalPaymentId?: string
  orderNo: string
  idempotencyKey: string
  businessScene: 'REGISTRATION' | 'OUTPATIENT' | 'INPATIENT' | 'HOME_BED' | 'PHARMACY'
  paymentSceneCode: string
  paymentMethodCode: string
  paymentMethodName: string
  orderType: string
  status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'PARTIAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDING' | 'REFUNDED'
  requestedAmount: number
  capturedAmount: number
  refundedAmount: number
  currencyCode: string
  externalOrderNo?: string
  correlationId?: string
  terminalCode?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
  errorCode?: string
  errorMessage?: string
  duplicate: boolean
  events: PaymentOrderEvent[]
}

export interface RegistrationBillingIntent {
  id: string
  revision: number
  residentId: string
  organizationId: string
  departmentId: string
  appointmentId?: string
  scheduleId?: string
  catalogItemId?: string
  slotHoldId?: string
  patientAccountId?: string
  settlementId?: string
  paymentOrderId?: string
  encounterId?: string
  idempotencyCode: string
  registrationSource: 'WINDOW' | 'WALK_IN' | 'DIRECT' | 'EMERGENCY'
  visitType: 'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY'
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  coverageId?: string
  coverageTypeCode?: string
  coveragePayerName?: string
  status: 'PAYMENT_PENDING' | 'PAID' | 'COMPLETING' | 'COMPLETED' | 'COMPLETION_FAILED' | 'CANCELLED' | 'EXPIRED'
  feeAmount: number
  currencyCode: string
  itemCode?: string
  itemName?: string
  expiresAt?: string
  completionAttempts: number
  lastErrorCode?: string
  lastErrorMessage?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  duplicate: boolean
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
  claimResponseId?: string
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
  settlements: Settlement[]
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

export interface CashierCloseLine {
  lineNo: number
  paymentMethodCode: string
  paymentType: 'PAYMENT' | 'REFUND'
  transactionCount: number
  expectedAmount: number
  actualAmount: number
  differenceAmount: number
  currencyCode: string
}

export interface CashierClose {
  id: string
  revision: number
  reversesCloseId?: string
  closeNo: string
  commandCode: string
  organizationId: string
  cashierUserId: string
  terminalCode: string
  status: 'CALCULATED' | 'CONFIRMED' | 'REVERSED'
  rangeFrom: string
  rangeTo: string
  transactionCount: number
  expectedAmount: number
  actualAmount: number
  differenceAmount: number
  currencyCode: string
  differenceReason?: string
  createdAt: string
  confirmedAt?: string
  duplicate: boolean
  lines: CashierCloseLine[]
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
    issueInvoice: (accountId: string, invoiceNo: string, settlementScene?: string, chargeItemIds?: string[]) => client.request<Invoice>(
      `/api/billing/accounts/${accountId}/invoices`, {
        method: 'POST', body: JSON.stringify({ invoiceNo, settlementScene, chargeItemIds }),
      },
    ),
    collect: (invoiceId: string, input: {
      paymentNo: string; paymentMethodCode: string; amount: number
      paymentSceneCode?: string
      externalTransactionNo?: string; description?: string
    }) => client.request<Payment>(`/api/billing/invoices/${invoiceId}/payments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    createPaymentOrder: (settlementId: string, input: {
      idempotencyKey: string
      businessScene: PaymentOrder['businessScene']
      paymentSceneCode: string
      paymentMethodCode: string
      amount: number
      correlationId?: string
      terminalCode?: string
      expiresAt?: string
    }) => client.request<PaymentOrder>(`/api/billing/settlements/${settlementId}/payment-orders`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    createRegistrationIntent: (input: {
      residentId: string
      organizationId: string
      departmentId: string
      appointmentId?: string
      scheduleId?: string
      idempotencyCode: string
      registrationSource?: RegistrationBillingIntent['registrationSource']
      visitType?: RegistrationBillingIntent['visitType']
      settlementMode?: RegistrationBillingIntent['settlementMode']
      coverageId?: string
    }) => client.request<RegistrationBillingIntent>('/api/billing/registration-intents', {
      method: 'POST', body: JSON.stringify(input),
    }),
    registrationIntent: (intentId: string) => client.request<RegistrationBillingIntent>(
      `/api/billing/registration-intents/${intentId}`,
    ),
    retryRegistrationCompletion: (intentId: string) => client.request<RegistrationBillingIntent>(
      `/api/billing/registration-intents/${intentId}/completion/retry`, { method: 'POST' },
    ),
    cancelRegistrationIntent: (intentId: string) => client.request<RegistrationBillingIntent>(
      `/api/billing/registration-intents/${intentId}/cancel`, { method: 'POST' },
    ),
    retryBusinessCompletion: (paymentOrderId: string) => client.request<PaymentOrder>(
      `/api/billing/payment-orders/${paymentOrderId}/business-completion/retry`, { method: 'POST' },
    ),
    paymentOrder: (paymentOrderId: string) => client.request<PaymentOrder>(
      `/api/billing/payment-orders/${paymentOrderId}`,
    ),
    queryPaymentOrder: (paymentOrderId: string) => client.request<PaymentOrder>(
      `/api/billing/payment-orders/${paymentOrderId}/query`, { method: 'POST' },
    ),
    cancelPaymentOrder: (paymentOrderId: string) => client.request<PaymentOrder>(
      `/api/billing/payment-orders/${paymentOrderId}/cancel`, { method: 'POST' },
    ),
    settlement: (settlementId: string) => client.request<Settlement>(
      `/api/billing/settlements/${settlementId}`,
    ),
    paymentOrders: (accountId: string) => client.request<PaymentOrder[]>(
      `/api/billing/accounts/${accountId}/payment-orders`,
    ),
    createRefundOrder: (paymentId: string, input: {
      idempotencyKey: string
      amount: number
      reason: string
      correlationId?: string
      terminalCode?: string
    }) => client.request<PaymentOrder>(`/api/billing/payments/${paymentId}/refund-orders`, {
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
    cashierCloses: () => client.request<CashierClose[]>('/api/billing/cashier-closes'),
    calculateCashierClose: (input: {
      commandCode: string
      terminalCode: string
      rangeFrom: string
      rangeTo: string
      actualAmounts: Array<{ paymentMethodCode: string; paymentType: 'PAYMENT' | 'REFUND'; amount: number }>
    }) => client.request<CashierClose>('/api/billing/cashier-closes', {
      method: 'POST', body: JSON.stringify(input),
    }),
    confirmCashierClose: (closeId: string, input: { commandCode: string; differenceReason?: string }) =>
      client.request<CashierClose>(`/api/billing/cashier-closes/${closeId}/confirm`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    reverseCashierClose: (closeId: string, input: { commandCode: string; reason: string }) =>
      client.request<CashierClose>(`/api/billing/cashier-closes/${closeId}/reverse`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    queryInsurancePerson: (input: ChsPersonInfoRequest) => client.request<ChsPersonInfoResponse>(
      '/api/billing/insurance/person-info', {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    quickPreSettleInsurance: (settlementId: string, input?: {
      insuranceTypeCode?: string
      regionCode?: string
      coverageId?: string
      idempotencyKey?: string
    }) => client.request<InsuranceSettlementView>(
      `/api/billing/settlements/${settlementId}/insurance/quick-pre-settle`, {
        method: 'POST', body: JSON.stringify(input ?? {}),
      },
    ),
    settleInsurance: (claimId: string, commandCode: string) => client.request<InsuranceSettlementView>(
      `/api/billing/insurance-claims/${claimId}/settle`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      },
    ),
    reverseInsurance: (claimId: string, input: { commandCode: string; reason: string }) =>
      client.request<InsuranceSettlementView>(`/api/billing/insurance-claims/${claimId}/reverse`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    insuranceClaim: (claimId: string) => client.request<InsuranceSettlementView>(
      `/api/billing/insurance-claims/${claimId}`,
    ),
  }
}

export interface ChsPersonInfoRequest {
  psnCertType?: string
  certno: string
  psnName?: string
}

export interface ChsPersonInfoResponse {
  psnNo: string
  psnCertType: string
  certno: string
  psnName: string
  gender?: string
  birthday?: string
  insutype: string
  insutypeName: string
  balc: number
  insuOptins: string
  insuOptinsName?: string
  psnType?: string
  status?: string
}

export interface InsuranceSettlementView {
  claimId: string
  revision: number
  settlementId: string
  patientAccountId: string
  coverageId?: string
  claimNo: string
  settlementNo: string
  status: 'PRE_SETTLED' | 'SETTLED' | 'REVERSED' | 'FAILED'
  currentOperation?: string
  regionCode: string
  insuranceTypeCode: string
  externalPreSettlementNo?: string
  externalSettlementNo?: string
  grossAmount: number
  insuranceFundAmount: number
  personalAccountAmount: number
  patientCashAmount: number
  otherFundAmount: number
  currencyCode: string
  reversalReason?: string
  reversedAt?: string
  errorCode?: string
  errorMessage?: string
  duplicate?: boolean
  lines?: InsuranceClaimLineView[]
  responses?: InsuranceClaimResponseView[]
}

export interface InsuranceClaimLineView {
  id: string
  settlementLineId: string
  lineNo: number
  itemCode: string
  insuranceItemCode?: string
  itemName: string
  categoryCode?: string
  quantity: number
  unitPrice: number
  claimedAmount: number
  approvedAmount: number
  rejectionCode?: string
}

export interface InsuranceClaimResponseView {
  id: string
  externalMessageId?: string
  responseNo: string
  commandCode: string
  operation: string
  status: string
  externalSettlementNo?: string
  insuranceFundAmount: number
  personalAccountAmount: number
  patientCashAmount: number
  otherFundAmount: number
  errorCode?: string
  errorMessage?: string
  respondedAt?: string
}

