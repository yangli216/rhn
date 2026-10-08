import type { AccountStatement, Settlement } from '../../../shared/api/billingApi'
import type { Encounter } from '../../../shared/model'

export function completionStatementFixture(encounter: Encounter): AccountStatement {
  return { accountId: 'acc-1', revision: 0, encounterId: encounter.id, residentId: encounter.residentId,
    organizationId: encounter.organizationId, departmentId: encounter.departmentId, accountType: 'OUTPATIENT',
    currencyCode: 'CNY', status: 'OPEN', openedAt: encounter.registeredAt,
    chargeAmount: 0, invoicedAmount: 0, uninvoicedAmount: 0, paymentAmount: 0, refundAmount: 0, accountBalance: 0,
    charges: [], invoices: [], settlements: [], payments: [], ledgerEntries: [] }
}
export function completionSettlementFixture(overrides: Partial<Settlement> = {}): Settlement {
  return { id: 'settlement-1', revision: 0, patientAccountId: 'acc-1', settlementNo: 'SET-1', commandCode: 'settle-1',
    settlementType: 'NORMAL', settlementScene: 'OUTPATIENT', terminalScene: 'DOCTOR_STATION', status: 'PRICED',
    grossAmount: 10, discountAmount: 0, insuranceAmount: 0, patientAmount: 10, otherAmount: 0, roundingAmount: 0,
    netAmount: 10, tenderedAmount: 0, outstandingAmount: 10, currencyCode: 'CNY', createdBy: 'doctor-1',
    createdAt: '2026-10-04T00:00:00Z', lines: [], tenders: [], events: [], ...overrides }
}
