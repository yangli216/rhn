import { createPaymentReconciliationApi } from './paymentReconciliationApi'
import type { ApiClient } from './httpClient'
import type { components, operations } from './generated'
// Explicit business projections inherit primitive wire fields from the generated contract.
type ContractProjection<Wire, Overrides extends Partial<Wire>> = Omit<Wire, keyof Overrides> & Overrides
type RequiredWireView<Wire, Keys extends keyof Wire> = Omit<Wire, Keys> & { [Key in Keys]-?: NonNullable<Wire[Key]> }


export type InsuranceReadinessCheck = RequiredWireView<components['schemas']['ReadinessCheck'], 'code' | 'title' | 'status' | 'statusText' | 'detail'>
export type InsuranceReadinessSection = ContractProjection<RequiredWireView<components['schemas']['ReadinessSection'], 'code' | 'title'>, { checks: InsuranceReadinessCheck[] }>
export type InsuranceReadinessReport = ContractProjection<RequiredWireView<components['schemas']['ReadinessReport'],
  'checkedAt' | 'clientMode' | 'clientModeText' | 'overall' | 'overallText'>, {
  summary: { pass: number; warn: number; block: number }; sections: InsuranceReadinessSection[]; insuranceSystemCodes: string[]
}>

export type InsuranceProbeCapability = RequiredWireView<components['schemas']['ProbeCapability'],
  'available' | 'mode' | 'modeText' | 'signInRequired' | 'settlementAllowed'>
export type InsuranceProbeFact = RequiredWireView<components['schemas']['ProbeFact'], 'label' | 'value'>
export type InsuranceProbeExchange = RequiredWireView<components['schemas']['ProbeExchange'],
  'infno' | 'infnoText' | 'startedAt' | 'durationMs' | 'outcome' | 'outcomeText' | 'request' | 'response'>
export type InsuranceProbeStepCode = 'SIGN_IN' | 'PERSON' | 'PRE_SETTLE' | 'SETTLE'
export type InsuranceProbeStepResult = ContractProjection<RequiredWireView<components['schemas']['ProbeStepResult'],
  'step' | 'stepText' | 'status' | 'statusText' | 'summary' | 'startedAt' | 'durationMs'>, {
  facts: InsuranceProbeFact[]; exchanges: InsuranceProbeExchange[]
}>
export type InsuranceProbeRequest = {
  person?: { certType: string; certNo: string; personName?: string }
  preSettle?: {
    departmentCode: string; practitionerCode?: string; diagnosisCode: string; diagnosisName: string
    lines: { itemCode: string; insuranceItemCode: string; itemName: string; quantity: number; unitPrice: number }[]
  }
  settle?: { confirmed: boolean; confirmation: string }
}

export type PaymentAuthorizationCodeRule = RequiredWireView<components['schemas']['PaymentAuthorizationCodeRule'], 'pattern' | 'minLength' | 'maxLength'>
export type PaymentChannelCapabilities = ContractProjection<RequiredWireView<components['schemas']['PaymentChannelCapabilities'],
  'adapterCode' | 'interaction' | 'querySupported' | 'refundSupported' | 'confirmBeforeCancel'>, {
  authorizationCodeRule?: PaymentAuthorizationCodeRule
}>
export type PaymentChannelCapability = ContractProjection<RequiredWireView<components['schemas']['PaymentChannelCapabilityView'],
  'paymentMethodCode' | 'available'>, { capabilities?: PaymentChannelCapabilities }>

export type PaymentConfigurationOption = RequiredWireView<components['schemas']['PaymentConfigurationOption'], 'value' | 'label'>
export type PaymentConfigurationField = ContractProjection<RequiredWireView<components['schemas']['PaymentConfigurationField'],
  'key' | 'label' | 'control' | 'required' | 'secret' | 'identity'>, { options: PaymentConfigurationOption[] }>
export type PaymentConfigurationDescriptor = ContractProjection<RequiredWireView<components['schemas']['PaymentConfigurationDescriptor'],
  'paymentMethodCode' | 'adapterCode' | 'name'>, { fields: PaymentConfigurationField[] }>
export type PaymentConfigurationOrganization = RequiredWireView<components['schemas']['PaymentConfigurationOrganization'], 'id' | 'name'>
export type PaymentConfigurationCatalog = ContractProjection<RequiredWireView<components['schemas']['PaymentConfigurationCatalog'], 'encryptionAvailable'>, {
  channels: PaymentConfigurationDescriptor[]; organizations: PaymentConfigurationOrganization[]
}>
export type PaymentMerchantConfiguration = ContractProjection<RequiredWireView<components['schemas']['PaymentMerchantConfigurationView'],
  'organizationId' | 'paymentMethodCode' | 'revision' | 'enabled' | 'identityLocked' | 'source' | 'encryptionAvailable'>, {
  values: Record<string, string>; configuredSecrets: Record<string, boolean>
}>
export type PaymentMerchantConfigurationUpdate = ContractProjection<RequiredWireView<components['schemas']['PaymentMerchantConfigurationUpdate'],
  'expectedRevision' | 'enabled'>, { values: Record<string, string>; clearSecrets: string[] }>
export type PaymentConfigurationCheckResult = RequiredWireView<components['schemas']['PaymentConfigurationCheckResult'], 'success' | 'message' | 'checkedAt'>

export interface BillingWorkItem {
  encounterId: string
  residentId: string
  residentName: string
  healthRecordNo: string
  gender: string
  genderText?: string
  birthDate: string
  encounterNo: string
  departmentName?: string
  registeredAt?: string
  accountId?: string
  currencyCode?: string
  status: 'PENDING_CHARGE' | 'PENDING_INVOICE' | 'PENDING_PAYMENT' | 'PENDING_REFUND' | 'SETTLED'
  /** BIL_WORK_STATUS display text, translated by the server. */
  statusText?: string
  sourceEventCount: number
  chargedEventCount: number
  latestSourceNo: string
  latestOccurredAt: string
  chargeAmount: number
  accountBalance: number
}

/** 已结算就诊分页（GET /api/billing/settled-encounters）。 */
export type BillingWorkItemPage = ContractProjection<RequiredWireView<components['schemas']['BillingWorkItemPageView'],
  'page' | 'size' | 'totalElements' | 'totalPages' | 'first' | 'last'>, { content: BillingWorkItem[] }>
export type SettledEncountersParams = NonNullable<operations['settledEncounters']['parameters']['query']>

export type ChargeItem = ContractProjection<RequiredWireView<components['schemas']['ChargeItemView'], 'id' | 'patientAccountId' | 'residentId' | 'encounterId' | 'catalogItemId' | 'sourceId' | 'requestCode' | 'status' | 'quantity' | 'unitCode' | 'unitPrice' | 'totalAmount' | 'currencyCode' | 'itemCode' | 'itemName' | 'occurredAt'>, {
  sourceType: 'REGISTRATION' | 'DIRECT_VISIT_SERVICE' | 'SERVICE_REQUEST' | 'SERVICE_REQUEST_REVERSAL'
    | 'MEDICATION_REQUEST' | 'MEDICATION_REQUEST_REVERSAL' | 'MEDICATION_DISPENSE' | 'MEDICATION_RETURN'
    | 'INPATIENT_ORDER_TASK' | 'INPATIENT_BED_DAY' | 'INPATIENT_BED_DAY_REVERSAL'
}>

export type InvoiceLine = RequiredWireView<components['schemas']['InvoiceLineView'], 'id' | 'chargeItemId' | 'lineNo' | 'amount'>

export type Invoice = ContractProjection<RequiredWireView<components['schemas']['InvoiceView'], 'id' | 'patientAccountId' | 'invoiceNo' | 'status' | 'currencyCode' | 'grossAmount' | 'discountAmount' | 'netAmount' | 'paidAmount' | 'outstandingAmount' | 'issuedAt' | 'issuedBy'>, {
  invoiceType: 'STANDARD' | 'CREDIT'
  lines: InvoiceLine[]
}>

export type SettlementLine = RequiredWireView<components['schemas']['SettlementLineView'], 'id' | 'chargeItemId' | 'lineNo' | 'settledQuantity' | 'grossAmount' | 'discountAmount' | 'insuranceAmount' | 'patientAmount' | 'otherAmount' | 'netAmount'>

export type SettlementTender = RequiredWireView<components['schemas']['SettlementTenderView'], 'id' | 'lineNo' | 'tenderType' | 'amount' | 'currencyCode'>

export type SettlementEvent = RequiredWireView<components['schemas']['SettlementEventView'], 'id' | 'eventType' | 'statusTo' | 'commandCode' | 'occurredAt'>

export type SettlementCashier = RequiredWireView<components['schemas']['SettlementCashierView'], 'userId' | 'active' | 'terminalScenes'>

export type CancelledSettlement = RequiredWireView<components['schemas']['CancelledSettlementView'],
  'settlementId' | 'settlementNo' | 'netAmount' | 'chargeItemIds'>
export type Settlement = ContractProjection<RequiredWireView<components['schemas']['SettlementView'], 'id' | 'revision' | 'patientAccountId' | 'settlementNo' | 'commandCode' | 'grossAmount' | 'discountAmount' | 'insuranceAmount' | 'patientAmount' | 'otherAmount' | 'roundingAmount' | 'netAmount' | 'tenderedAmount' | 'outstandingAmount' | 'currencyCode' | 'createdBy' | 'createdAt'>, {
  settlementType: 'NORMAL' | 'REVERSAL' | 'SUPPLEMENT'
  settlementMode?: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  settlementScene: 'REGISTRATION' | 'OUTPATIENT' | 'INPATIENT' | 'HOME_BED' | 'PHARMACY'
  terminalScene: 'CASHIER' | 'DOCTOR_STATION' | 'SELF_SERVICE' | 'MOBILE' | 'ONLINE'
  status: 'DRAFT' | 'PRICED' | 'PAYMENT_PENDING' | 'PARTIAL' | 'SETTLED' | 'REVERSING' | 'REVERSED' | 'FAILED'
  lines: SettlementLine[]
  tenders: SettlementTender[]
  events: SettlementEvent[]
}>

export type SettlementExceptionType = 'PAID_NOT_COMPLETED' | 'INSURANCE_SETTLED_UNPAID' | 'INSURANCE_SETTLE_UNCERTAIN'
  | 'PAYMENT_RESULT_UNKNOWN' | 'UNPAID_TIMEOUT'
export type SettlementExceptionAction = 'COLLECT' | 'QUERY_PAYMENT' | 'RETRY_COMPLETION' | 'QUERY_INSURANCE'
  | 'CANCEL' | 'CANCEL_AND_REVERSE'

export interface SettlementException {
  settlement: SettlementRecord
  exceptionType: SettlementExceptionType
  exceptionText: string
  severity: 'CRITICAL' | 'WARNING'
  outstandingAmount: number
  ageMinutes: number
  claimId?: string
  claimStatus?: string
  paymentOrderId?: string
  paymentOrderStatus?: string
  actions: SettlementExceptionAction[]
  suggestion: string
}

export interface SettlementRecord {
  id: string
  patientAccountId: string
  residentId: string
  encounterId?: string
  departmentId: string
  residentName: string
  healthRecordNo: string
  gender: string
  genderText?: string
  birthDate: string
  encounterNo?: string
  departmentName?: string
  settlementNo: string
  settlementType: Settlement['settlementType']
  settlementTypeText?: string
  settlementMode: NonNullable<Settlement['settlementMode']>
  settlementModeText?: string
  settlementScene: Settlement['settlementScene']
  settlementSceneText?: string
  terminalScene: Settlement['terminalScene']
  terminalSceneText?: string
  status: Settlement['status']
  statusText?: string
  grossAmount: number
  discountAmount: number
  insuranceAmount: number
  patientAmount: number
  otherAmount: number
  roundingAmount: number
  netAmount: number
  currencyCode: string
  terminalCode?: string
  createdAt: string
  finalizedAt?: string
  finalizedBy?: string
  cashierName?: string
  cashierUsername?: string
}

export type Payment = ContractProjection<RequiredWireView<components['schemas']['PaymentView'], 'id' | 'patientAccountId' | 'paymentNo' | 'paymentMethodCode' | 'status' | 'amount' | 'currencyCode' | 'paidAt' | 'enteredBy'>, {
  paymentType: 'PAYMENT' | 'REFUND'
}>

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
  statusText?: string
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

export type RegistrationInsuranceTiming = 'REGISTRATION' | 'VISIT_UNIFIED'

export interface RegistrationBillingIntent {
  /** 医保身份挂号的结算时机；自费为空。 */
  insuranceTiming?: RegistrationInsuranceTiming | null
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
  sourceTypeText?: string
  sourceNo?: string
  encounterId: string
  accountId?: string
  chargeItemId?: string
  expectedQuantity?: number
  chargedQuantity?: number
  expectedAmount?: number
  chargedAmount?: number
  status: 'MATCHED' | 'UNCHARGED' | 'MISMATCH' | 'ORPHAN_CHARGE'
  statusText?: string
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
  paymentMethodCodeText?: string
  paymentType: 'PAYMENT' | 'REFUND'
  paymentTypeText?: string
  transactionCount: number
  expectedAmount: number
  actualAmount: number
  differenceAmount: number
  currencyCode: string
}

export interface CashierClosePreview {
  currencyCode: string
  transactionCount: number
  lines: Array<Pick<CashierCloseLine, 'paymentMethodCode' | 'paymentMethodCodeText' | 'paymentType' | 'paymentTypeText'
    | 'transactionCount' | 'expectedAmount'>>
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
  statusText?: string
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

function toChsPersonInfo(view: InsurancePersonInfoView): ChsPersonInfoResponse {
  return {
    psnNo: view.personNo, psnCertType: view.certType, certno: view.certNo, psnName: view.personName,
    gender: view.gender ?? undefined, birthday: view.birthday ?? undefined,
    insutype: view.insuranceType, insutypeName: view.insuranceTypeName, balc: view.accountBalance ?? 0,
    insuOptins: view.regionCode, insuOptinsName: view.regionName ?? undefined,
    psnType: view.personCategory ?? undefined, status: view.status ?? undefined,
  }
}

export function createBillingApi(client: ApiClient) {
  return {
    ...createPaymentReconciliationApi(client),
    worklist: () => client.request<BillingWorkItem[]>('/api/billing/worklist'),
    settledEncounters: (params: SettledEncountersParams = {}) => {
      const query = new URLSearchParams()
      if (params.dateFrom) query.set('dateFrom', params.dateFrom)
      if (params.dateTo) query.set('dateTo', params.dateTo)
      if (params.query) query.set('query', params.query)
      if (params.encounterId) query.set('encounterId', params.encounterId)
      if (params.page !== undefined) query.set('page', String(params.page))
      if (params.size !== undefined) query.set('size', String(params.size))
      const text = query.toString()
      return client.request<BillingWorkItemPage>(`/api/billing/settled-encounters${text ? `?${text}` : ''}`)
    },
    statement: (encounterId: string, currencyCode = 'CNY') => client.request<AccountStatement>(
      `/api/billing/encounters/${encounterId}/statement?currencyCode=${encodeURIComponent(currencyCode)}`,
    ),
    synchronize: (encounterId: string, requestCode: string) => client.request<ChargeSynchronization>(
      `/api/billing/encounters/${encounterId}/charges/synchronize`, {
        method: 'POST', body: JSON.stringify({ requestCode }),
      },
    ),
    issueInvoice: (accountId: string, invoiceNo: string, settlementScene?: string, chargeItemIds?: string[], terminalScene: Settlement['terminalScene'] = 'CASHIER', terminalCode = 'CASHIER-WEB',
      settlementMode?: 'SELF_PAY' | 'MEDICAL_INSURANCE') => client.request<Invoice>(
      `/api/billing/accounts/${accountId}/invoices`, {
        method: 'POST', body: JSON.stringify({ invoiceNo, settlementScene, chargeItemIds, terminalScene, terminalCode, settlementMode }),
      },
    ),
    collect: (invoiceId: string, input: {
      paymentNo: string; paymentMethodCode: string; amount: number
      paymentSceneCode?: string
      externalTransactionNo?: string; description?: string
    }) => client.request<Payment>(`/api/billing/invoices/${invoiceId}/payments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    insuranceReadiness: () => client.request<InsuranceReadinessReport>('/api/billing/insurance/readiness'),
    insuranceProbeCapability: () => client.request<InsuranceProbeCapability>('/api/billing/insurance/probe/capability'),
    runInsuranceProbe: (step: InsuranceProbeStepCode, input: InsuranceProbeRequest = {}) => client.request<InsuranceProbeStepResult>(
      `/api/billing/insurance/probe/steps/${step}`, { method: 'POST', body: JSON.stringify(input) }),
    paymentConfigurationCatalog: () => client.request<PaymentConfigurationCatalog>('/api/billing/payment-channel-management'),
    paymentMerchantConfiguration: (organizationId: string, method: string) => client.request<PaymentMerchantConfiguration>(
      `/api/billing/payment-channel-management/organizations/${encodeURIComponent(organizationId)}/channels/${encodeURIComponent(method)}`,
    ),
    savePaymentMerchantConfiguration: (organizationId: string, method: string, input: PaymentMerchantConfigurationUpdate) => client.request<PaymentMerchantConfiguration>(
      `/api/billing/payment-channel-management/organizations/${encodeURIComponent(organizationId)}/channels/${encodeURIComponent(method)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
    checkPaymentMerchantConfiguration: (organizationId: string, method: string, input: PaymentMerchantConfigurationUpdate) => client.request<PaymentConfigurationCheckResult>(
      `/api/billing/payment-channel-management/organizations/${encodeURIComponent(organizationId)}/channels/${encodeURIComponent(method)}/check`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
    paymentChannelCapabilities: (paymentMethodCode: string) => client.request<PaymentChannelCapability>(
      `/api/billing/payment-methods/${encodeURIComponent(paymentMethodCode)}/capabilities`,
    ),
    createPaymentOrder: (settlementId: string, input: {
      idempotencyKey: string
      businessScene: PaymentOrder['businessScene']
      paymentSceneCode: string
      paymentMethodCode: string
      amount: number
      roundingAdjustment?: number
      authorizationCode?: string
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
    /** 机构／科室选择医保身份挂号时的结算时机：挂号时结算，或并入诊间统一结算。 */
    /** 挂号流水按就诊批量取费用类别：{ 就诊ID: SELF_PAY | MEDICAL_INSURANCE }。 */
    registrationSettlementModes: (encounterIds: string[]) => client.request<Record<string, 'SELF_PAY' | 'MEDICAL_INSURANCE'>>(
      `/api/billing/registration-intents/settlement-modes?encounterIds=${encodeURIComponent(encounterIds.join(','))}`),
    registrationInsuranceTiming: (organizationId: string, departmentId: string) =>
      client.request<{ timing: RegistrationInsuranceTiming }>(
        `/api/billing/registration-intents/insurance-timing?organizationId=${encodeURIComponent(organizationId)}`
        + `&departmentId=${encodeURIComponent(departmentId)}`),
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
    /** 取消未付款结算单，所含收费回到待结算；已试算医保的同时撤销医保平台费用明细。 */
    cancelSettlement: (settlementId: string, reason: string) => client.request<CancelledSettlement>(
      `/api/billing/settlements/${settlementId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) },
    ),
    /** 取消本就诊全部可取消的未付款结算单（不含挂号），供医生修改医嘱、放弃诊间收款时使用。 */
    cancelUnpaidSettlements: (encounterId: string, reason: string) => client.request<CancelledSettlement[]>(
      `/api/billing/encounters/${encounterId}/unpaid-settlements/cancel`, { method: 'POST', body: JSON.stringify({ reason }) },
    ),
    settlementRecords: (limit = 200, filter?: { from: string; to: string; cashier?: string; terminalScene?: string; includeOpen?: boolean }) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (filter?.includeOpen) params.set('includeOpen', 'true')
      if (filter) {
        params.set('from', filter.from); params.set('to', filter.to)
        if (filter.cashier) params.set('cashier', filter.cashier)
        if (filter.terminalScene) params.set('terminalScene', filter.terminalScene)
      }
      return client.request<SettlementRecord[]>(`/api/billing/settlement-records?${params}`)
    },
    /** 异常结算（含单边账）待办：实时推导，付清/取消/冲正后自动消失。 */
    settlementExceptions: (limit = 100) => client.request<SettlementException[]>(`/api/billing/settlement-exceptions?limit=${limit}`),
    /** 收费查询的办理人选项：收费岗位在岗人员 + 范围内实际办理过结算的人员。 */
    settlementCashiers: (filter: { from: string; to: string; terminalScene?: string }) => {
      const params = new URLSearchParams({ from: filter.from, to: filter.to })
      if (filter.terminalScene) params.set('terminalScene', filter.terminalScene)
      return client.request<SettlementCashier[]>(`/api/billing/settlement-cashiers?${params}`)
    },
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
    refundPreCheck: (encounterId: string, accountId?: string) => client.request<RefundPreCheckSummaryView>(
      `/api/billing/encounters/${encounterId}/refund-precheck${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`,
    ),
    directRefund: (paymentId: string, input: DirectRefundRequest) => client.request<PaymentOrder>(
      `/api/billing/payments/${paymentId}/direct-refund`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    dailyReconciliation: (businessDate: string) => client.request<DailyReconciliation>(
      `/api/billing/reconciliation/daily?businessDate=${encodeURIComponent(businessDate)}`,
    ),
    cashierCloses: () => client.request<CashierClose[]>('/api/billing/cashier-closes'),
    cashierClosePreview: (terminalCode: string, rangeFrom: string, rangeTo: string) =>
      client.request<CashierClosePreview>(`/api/billing/cashier-closes/preview?${new URLSearchParams({ terminalCode, rangeFrom, rangeTo })}`),
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
    /** 1101 读证：后端契约为 certType/certNo/personName，此处与界面使用的医保字段名互转。 */
    queryInsurancePerson: async (input: ChsPersonInfoRequest): Promise<ChsPersonInfoResponse> =>
      toChsPersonInfo(await client.request<InsurancePersonInfoView>('/api/billing/insurance/person-info', {
        method: 'POST',
        body: JSON.stringify({ certType: input.psnCertType, certNo: input.certno, personName: input.psnName, residentId: input.residentId }),
      })),
    /** 1101 按患者档案鉴权：证件号与姓名由服务端取自档案并与医保端返回核对，浏览器不接触完整证件号。 */
    authenticateInsuranceByResident: async (residentId: string): Promise<ChsPersonInfoResponse> =>
      toChsPersonInfo(await client.request<InsurancePersonInfoView>('/api/billing/insurance/person-info/by-resident', {
        method: 'POST', body: JSON.stringify({ residentId }),
      })),
    /** 医保联调模拟场景：未开启时 enabled=false，界面不显示任何模拟入口。 */
    insuranceSimulator: () => client.request<InsuranceSimulator>('/api/billing/insurance/simulator'),
    quickPreSettleInsurance: (settlementId: string, input: {
      insuranceTypeCode?: string
      regionCode?: string
      coverageId?: string
      idempotencyKey: string
    }) => client.request<InsuranceSettlementView>(
      `/api/billing/settlements/${settlementId}/insurance/quick-pre-settle`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    settleInsurance: (claimId: string, commandCode: string) => client.request<InsuranceSettlementView>(
      `/api/billing/insurance-claims/${claimId}/settle`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      },
    ),
    /** 向医保平台查询正式结算结果（结果不确定时使用）。 */
    queryInsurance: (claimId: string, commandCode: string) => client.request<InsuranceSettlementView>(
      `/api/billing/insurance-claims/${claimId}/query`, { method: 'POST', body: JSON.stringify({ commandCode }) },
    ),
    reverseInsurance: (claimId: string, input: { commandCode: string; reason: string }) =>
      client.request<InsuranceSettlementView>(`/api/billing/insurance-claims/${claimId}/reverse`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    insuranceClaim: (claimId: string) => client.request<InsuranceSettlementView>(
      `/api/billing/insurance-claims/${claimId}`,
    ),

    // 财政医疗收费电子票据服务接口
    issueSettlementReceipt: (settlementId: string, input: {
      idempotencyKey: string
      receiptType: 'MEDICAL_E_INVOICE' | 'PAPER_INVOICE' | 'RECEIPT' | 'VIRTUAL'
      issueChannel: 'CASHIER' | 'SELF_SERVICE' | 'MOBILE' | 'ONLINE'
      fiscalAuthorityCode?: string
      payerName?: string
      payerIdentityDigest?: string
      correlationId?: string
    }) => client.request<ReceiptView>(`/api/billing/settlements/${settlementId}/receipts`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    settlementReceipts: (settlementId: string) => client.request<ReceiptView[]>(
      `/api/billing/settlements/${settlementId}/receipts`,
    ),
    receiptDetail: (receiptId: string) => client.request<ReceiptView>(
      `/api/billing/receipts/${receiptId}`,
    ),
    retryReceiptIssue: (receiptId: string, commandCode: string, reason?: string) => client.request<ReceiptView>(
      `/api/billing/receipts/${receiptId}/issue/retry`, {
        method: 'POST', body: JSON.stringify({ commandCode, reason }),
      },
    ),
    queryReceiptIssue: (receiptId: string, commandCode: string) => client.request<ReceiptView>(
      `/api/billing/receipts/${receiptId}/issue/query`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      },
    ),
    voidReceipt: (receiptId: string, commandCode: string, reason: string) => client.request<ReceiptView>(
      `/api/billing/receipts/${receiptId}/void`, {
        method: 'POST', body: JSON.stringify({ commandCode, reason }),
      },
    ),
    redFlushReceipt: (receiptId: string, input: {
      commandCode: string
      reason: string
      correlationId?: string
    }) => client.request<ReceiptView>(`/api/billing/receipts/${receiptId}/red-flush`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    printReceipt: (receiptId: string, commandCode: string) => client.request<ReceiptView>(
      `/api/billing/receipts/${receiptId}/prints`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      },
    ),
  }
}

type InsurancePersonInfoView = {
  personNo: string; certType: string; certNo: string; personName: string
  gender?: string | null; birthday?: string | null
  insuranceType: string; insuranceTypeName: string; accountBalance?: number | null
  regionCode: string; regionName?: string | null; personCategory?: string | null; status?: string | null
}

export interface InsuranceSimulatorPersona {
  id: string
  label: string
  insuranceType?: string | null
  certNo: string
  residentKeyword: string
  expectation: string
}

export interface InsuranceSimulator {
  enabled: boolean
  mode: 'GATEWAY' | 'MOCK' | 'UNAVAILABLE'
  consoleUrl?: string | null
  personas: InsuranceSimulatorPersona[]
  reason?: string | null
}

export interface ChsPersonInfoRequest {
  psnCertType?: string
  certno: string
  psnName?: string
  /** 传入当前就诊患者时，服务端核对读证人员与档案一致，不一致即报错并丢弃凭证。 */
  residentId?: string
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
  status: 'PRE_SETTLEMENT_PENDING' | 'PRE_SETTLED' | 'SETTLEMENT_PENDING' | 'SETTLED' | 'REVERSAL_PENDING' | 'REVERSED' | 'FAILED'
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
  insuranceFundAmount: number | null
  personalAccountAmount: number | null
  patientCashAmount: number | null
  otherFundAmount: number | null
  errorCode?: string
  errorMessage?: string
  respondedAt?: string
  amountSource: 'REPORTED' | 'LEGACY_UNVERIFIED'
}

export interface ReceiptView {
  id: string
  revision: number
  settlementId: string
  reversesReceiptId?: string
  receiptNo: string
  commandCode: string
  receiptType: string
  receiptTypeText?: string
  status: 'REQUESTED' | 'ISSUED' | 'FAILED' | 'VOIDED' | 'RED_FLUSHED'
  statusText?: string
  fiscalAuthorityCode?: string
  externalReceiptNo?: string
  fiscalCode?: string
  fiscalNumber?: string
  verificationCode?: string
  controlledObjectReference?: string
  amount: number
  currencyCode: string
  issueChannel: string
  issueChannelText?: string
  payerName?: string
  correlationId?: string
  createdBy?: string
  createdAt: string
  issuedAt?: string
  updatedAt: string
  errorCode?: string
  errorMessage?: string
  duplicate: boolean
  events?: ReceiptEventView[]
}

export interface ReceiptEventView {
  id: string
  externalMessageId?: string
  eventType: string
  statusFrom?: string
  statusTo?: string
  commandCode: string
  actorId?: string
  errorCode?: string
  actionReason?: string
  errorMessage?: string
  occurredAt: string
}

export interface RefundItemPreCheckView {
  chargeItemId: string
  sourceType: string
  sourceTypeText?: string
  sourceId?: string
  documentNo?: string
  itemName: string
  itemCode: string
  quantity: number
  unitCode: string
  totalAmount: number
  executionStatusCode: 'DISPENSED' | 'RETURNED' | 'UNDISPENSED' | 'UNDISPENSED_NEED_CANCEL' | 'REPORTED' | 'UNEXECUTED' | 'UNEXECUTED_NEED_CANCEL' | 'EXECUTED' | 'OTHER' | string
  executionStatusName: string
  allowed: boolean
  statusBadgeText: string
  statusTone: 'success' | 'warning' | 'danger' | 'info' | string
  blockReason?: string
}

export interface RefundPaymentCandidateView {
  paymentId: string
  paymentNo: string
  paymentMethodCode: string
  paymentMethodCodeText?: string
  amount: number
  refundedAmount: number
  refundableAmount: number
  currencyCode: string
  paidAt: string
}

export interface RefundPreCheckSummaryView {
  encounterId: string | null
  accountId?: string | null
  eligibleForRefund: boolean
  overallDecision: 'ALLOWED' | 'BLOCKED' | string
  summaryNotice?: string
  totalPaidAmount: number
  refundableAmount: number
  currencyCode: string
  items: RefundItemPreCheckView[]
  refundablePayments: RefundPaymentCandidateView[]
}

export interface DirectRefundRequest {
  idempotencyKey: string
  refundAmount: number
  reason: string
  terminalCode?: string
  chargeItemIds?: string[]
}
