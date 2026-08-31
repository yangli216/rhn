import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientBillingAccount, InpatientDischargeReadiness, InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientBillingPanel } from './InpatientBillingPanel'
import { DischargeDialog } from './InpatientWorkspace'

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 3, episodeNo: 'ZY20260831001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', organizationId: 'org-1',
  departmentId: 'dept-1', departmentName: '综合病区', encounterId: 'encounter-1', encounterNo: 'E001',
  bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-30T08:00:00+08:00',
}

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

const blockedReadiness: InpatientDischargeReadiness = {
  episodeId: episode.id, encounterId: episode.encounterId, episodeStatus: 'ADMITTED', dischargeCompleted: false,
  ready: false, checkedAt: '2026-08-31T08:00:00+08:00', openLongTermOrderCount: 0,
  incompleteTemporaryOrderCount: 0, pendingTaskCount: 0,
  requiredDocuments: [{ documentType: 'INPATIENT_DISCHARGE_RECORD', title: '出院记录', status: 'SIGNED', satisfied: true }],
  dischargeDiagnoses: [], blockers: [{ code: 'PRIMARY_DISCHARGE_DIAGNOSIS_REQUIRED', message: '缺少主要出院诊断',
    objectType: 'ENCOUNTER_DIAGNOSIS', count: 1, objectIds: [] }],
}

describe('DischargeDialog', () => {
  it('keeps discharge blocked until a structured primary diagnosis is saved', async () => {
    const diagnosis = { diagnosisStage: 'DISCHARGE' as const, code: 'J06.9', display: '急性上呼吸道感染',
      diagnosisType: 'PRIMARY' as const }
    const ready = { ...blockedReadiness, ready: true, dischargeDiagnoses: [diagnosis], blockers: [] }
    const dischargeReadiness = vi.fn().mockResolvedValueOnce(blockedReadiness).mockResolvedValue(ready)
    const saveDischargeDiagnoses = vi.fn().mockResolvedValue({ episodeId: episode.id,
      encounterId: episode.encounterId, diagnoses: [diagnosis] })
    const discharge = vi.fn().mockResolvedValue({ ...episode, status: 'DISCHARGED' })
    const api = { inpatient: { dischargeReadiness, saveDischargeDiagnoses, discharge }, masterData: {
      diseases: vi.fn().mockResolvedValue([{ id: 'disease-1', code: diagnosis.code, display: diagnosis.display,
        systemName: 'ICD-10' }]),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'command-1' })
    renderWithQuery(<DischargeDialog api={api} episode={episode} onClose={vi.fn()} onSuccess={vi.fn()} />)

    expect(await screen.findByText('缺少主要出院诊断')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认出院' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('搜索出院诊断'), '上感')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await userEvent.click(await screen.findByRole('button', { name: /急性上呼吸道感染/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存诊断' }))

    await waitFor(() => expect(saveDischargeDiagnoses).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      expectedEpisodeRevision: episode.revision,
      diagnoses: [{ code: diagnosis.code, display: diagnosis.display, diagnosisType: 'PRIMARY' }],
    })))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认出院' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '确认出院' }))
    await waitFor(() => expect(discharge).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      expectedRevision: episode.revision, dispositionCode: 'HOME',
    })))
  })
})

describe('InpatientBillingPanel', () => {
  it('shows estimated costs and registers a deposit', async () => {
    const account: InpatientBillingAccount = {
      episodeId: episode.id, encounterId: episode.encounterId, patientAccountId: 'account-1', accountStatus: 'OPEN',
      clinicalStatus: 'ADMITTED', currencyCode: 'CNY', postedChargeAmount: 100, estimatedOrderAmount: 80,
      estimatedBedAmount: 20, estimatedTotalAmount: 200, depositAmount: 50, ledgerBalance: -50,
      estimatedOutstandingAmount: 150, estimatedCreditAmount: 0, paymentDue: true, financialWarningOnly: true,
      deposits: [{ paymentId: 'payment-0', paymentNo: 'IPD-0', originalAmount: 50, allocatedAmount: 0,
        refundedAmount: 0, availableAmount: 50, currencyCode: 'CNY', paymentMethodCode: 'CASH',
        paidAt: '2026-08-31T07:00:00+08:00' }],
      costLines: [],
    }
    const registerDeposit = vi.fn().mockResolvedValue({ paymentId: 'payment-1', paymentNo: 'IPD-1', amount: 100,
      currencyCode: 'CNY', paymentMethodCode: 'CASH', paidAt: '2026-08-31T08:00:00+08:00', duplicate: false,
      account: { ...account, depositAmount: 150, estimatedOutstandingAmount: 50,
        deposits: [...account.deposits, { paymentId: 'payment-1', paymentNo: 'IPD-1', originalAmount: 100,
          allocatedAmount: 0, refundedAmount: 0, availableAmount: 100, currencyCode: 'CNY',
          paymentMethodCode: 'CASH', paidAt: '2026-08-31T08:00:00+08:00' }] } })
    const postBedDays = vi.fn().mockResolvedValue({ episodeId: episode.id, encounterId: episode.encounterId,
      throughDate: '2026-08-31', createdCount: 1, existingCount: 0, postedAmount: 20,
      account: { ...account, postedChargeAmount: 120, estimatedBedAmount: 0 } })
    const api = { inpatient: { billing: vi.fn().mockResolvedValue(account), registerDeposit, postBedDays,
      dailyStatement: vi.fn().mockResolvedValue({ episodeId: episode.id, encounterId: episode.encounterId,
        businessDate: '2026-08-31', postedAmount: 100, estimatedAmount: 20, categorySummaries: [],
        lines: [], asOf: '2026-08-31T08:00:00+08:00' }),
    } } as unknown as RhnApi
    renderWithQuery(<InpatientBillingPanel api={api} episode={episode} />)

    expect(await screen.findByText('¥150.00')).toBeInTheDocument()
    expect(screen.getByText('IPD-0')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('预交金额'), '100')
    await userEvent.click(screen.getByRole('button', { name: '收取预交金' }))
    await waitFor(() => expect(registerDeposit).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      amount: 100, currencyCode: 'CNY', paymentMethodCode: 'CASH',
    })))
    await userEvent.click(screen.getByRole('button', { name: '床日记账至今日' }))
    await waitFor(() => expect(postBedDays).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      currencyCode: 'CNY',
    })))
  })

  it('shows a discharged patient surplus as an actionable refund instead of settled', async () => {
    const discharged = { ...episode, status: 'DISCHARGED' as const }
    const financialSettlement = {
      invoiceId: 'invoice-1', settlementId: 'settlement-1', revision: 1, invoiceNo: 'IP-001',
      settlementNo: 'IP-001', settlementStatus: 'SETTLED' as const,
      financialStatus: 'PENDING_REFUND' as const, netAmount: 20, prepaymentAmount: 20,
      paidAmount: 20, outstandingAmount: 0, refundableAmount: 30, currencyCode: 'CNY',
    }
    const account: InpatientBillingAccount = {
      episodeId: discharged.id, encounterId: discharged.encounterId, patientAccountId: 'account-1',
      accountStatus: 'OPEN', clinicalStatus: 'DISCHARGED', currencyCode: 'CNY', postedChargeAmount: 20,
      estimatedOrderAmount: 0, estimatedBedAmount: 0, estimatedTotalAmount: 20, depositAmount: 30,
      ledgerBalance: -30, estimatedOutstandingAmount: 0, estimatedCreditAmount: 30, paymentDue: false,
      financialWarningOnly: true, financialSettlement,
      deposits: [{ paymentId: 'payment-1', paymentNo: 'IPD-SURPLUS', originalAmount: 50, allocatedAmount: 20,
        refundedAmount: 0, availableAmount: 30, currencyCode: 'CNY', paymentMethodCode: 'CASH',
        paidAt: '2026-08-31T08:00:00+08:00' }], costLines: [],
    }
    const refundSurplus = vi.fn().mockResolvedValue({ paymentIds: ['refund-1'], duplicate: false,
      settlement: { ...financialSettlement, financialStatus: 'SETTLED', refundableAmount: 0 },
      account: { ...account, accountStatus: 'CLOSED', depositAmount: 0, ledgerBalance: 0,
        financialSettlement: { ...financialSettlement, financialStatus: 'SETTLED', refundableAmount: 0 } },
    })
    const api = { inpatient: { billing: vi.fn().mockResolvedValue(account), refundSurplus,
      dailyStatement: vi.fn().mockResolvedValue({ episodeId: episode.id, encounterId: episode.encounterId,
        businessDate: '2026-08-31', postedAmount: 20, estimatedAmount: 0, categorySummaries: [],
        lines: [], asOf: '2026-08-31T08:00:00+08:00' }),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'refund-command' })
    renderWithQuery(<InpatientBillingPanel api={api} episode={discharged} />)

    expect((await screen.findAllByText('待退余')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: /退还预交金余额/ }))
    await waitFor(() => expect(refundSurplus).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      expectedRevision: 1, amount: 30, currencyCode: 'CNY', reason: expect.stringContaining('预交金余额'),
    })))
  })

  it('defaults available deposits into final settlement after discharge', async () => {
    const discharged = { ...episode, status: 'DISCHARGED' as const }
    const account: InpatientBillingAccount = {
      episodeId: discharged.id, encounterId: discharged.encounterId, patientAccountId: 'account-1',
      accountStatus: 'OPEN', clinicalStatus: 'DISCHARGED', currencyCode: 'CNY', postedChargeAmount: 80,
      estimatedOrderAmount: 0, estimatedBedAmount: 0, estimatedTotalAmount: 80, depositAmount: 50,
      ledgerBalance: 30, estimatedOutstandingAmount: 30, estimatedCreditAmount: 0, paymentDue: true,
      financialWarningOnly: true,
      deposits: [{ paymentId: 'payment-1', paymentNo: 'IPD-FINAL', originalAmount: 50, allocatedAmount: 0,
        refundedAmount: 0, availableAmount: 50, currencyCode: 'CNY', paymentMethodCode: 'CASH',
        paidAt: '2026-08-31T08:00:00+08:00' }], costLines: [],
    }
    const finalSettlement = vi.fn().mockResolvedValue({ episodeId: discharged.id,
      encounterId: discharged.encounterId, invoiceId: 'invoice-1', settlementId: 'settlement-1',
      invoiceNo: 'IP-001', settlementNo: 'IP-001', status: 'PARTIAL', netAmount: 80,
      prepaymentAmount: 50, paidAmount: 50, outstandingAmount: 30, refundableAmount: 0,
      financialStatus: 'PENDING_PAYMENT', currencyCode: 'CNY', duplicate: false, account,
    })
    const api = { inpatient: { billing: vi.fn().mockResolvedValue(account), finalSettlement,
      dailyStatement: vi.fn().mockResolvedValue({ episodeId: episode.id, encounterId: episode.encounterId,
        businessDate: '2026-08-31', postedAmount: 80, estimatedAmount: 0, categorySummaries: [],
        lines: [], asOf: '2026-08-31T08:00:00+08:00' }),
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'settlement-command' })
    renderWithQuery(<InpatientBillingPanel api={api} episode={discharged} />)

    expect(await screen.findByText(/可用预交金.*¥50.00.*默认优先参与本次结算/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '生成结算单并自动抵扣预交金' }))
    await waitFor(() => expect(finalSettlement).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      currencyCode: 'CNY', terminalCode: 'INPATIENT-WORKSPACE',
    })))
  })
})
