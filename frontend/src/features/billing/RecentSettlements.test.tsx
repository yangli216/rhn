import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { RecentSettlements } from './RecentSettlements'

const base = {
  patientAccountId: 'a', residentId: 'r', departmentId: 'd', healthRecordNo: 'H', gender: '1', birthDate: '1980-01-01',
  settlementType: 'NORMAL', settlementScene: 'OUTPATIENT', terminalScene: 'CASHIER', status: 'SETTLED', grossAmount: 10,
  discountAmount: 0, insuranceAmount: 4, patientAmount: 6, otherAmount: 0, roundingAmount: 0, netAmount: 10, currencyCode: 'CNY',
} as const
const record = (id: string, no: string, finalizedAt: string, extra: Partial<SettlementRecord> = {}) =>
  ({ ...base, cashierUsername: 'doctor', id, settlementNo: no, residentName: `患者${no}`, createdAt: finalizedAt, finalizedAt, ...extra }) as SettlementRecord

function renderPanel(records: SettlementRecord[], handlers = { onReceipt: vi.fn(), onCopy: vi.fn() }, username = 'doctor') {
  const settlementRecords = vi.fn().mockResolvedValue(records)
  const api = { billing: { settlementRecords } } as unknown as RhnApi
  const clinicalContext = { organization: { id: 'o' }, department: { id: 'd' } } as unknown as ClinicalContext
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RecentSettlements api={api} clinicalContext={clinicalContext} username={username} {...handlers} /></QueryClientProvider>)
  return Object.assign(handlers, { settlementRecords })
}

describe('RecentSettlements', () => {
  afterEach(() => { vi.useRealTimers() })

  it('lists only the latest three settled outpatient settlements and exposes quick actions', async () => {
    const handlers = renderPanel([
      record('1', 'S1', '2026-10-22T01:00:00Z'), record('2', 'S2', '2026-10-22T02:00:00Z'),
      record('3', 'S3', '2026-10-22T03:00:00Z'), record('4', 'S4', '2026-10-22T04:00:00Z'),
      record('5', 'REG', '2026-10-22T05:00:00Z', { settlementScene: 'REGISTRATION' }),
      record('6', 'UNPAID', '2026-10-22T06:00:00Z', { status: 'PRICED' }),
    ])
    expect(await screen.findByText('S4')).toBeInTheDocument()
    expect(screen.getByText('S3')).toBeInTheDocument()
    expect(screen.getByText('S2')).toBeInTheDocument()
    expect(screen.queryByText('S1')).not.toBeInTheDocument()
    expect(screen.queryByText('REG')).not.toBeInTheDocument()
    expect(screen.queryByText('UNPAID')).not.toBeInTheDocument()
    expect(screen.getByText(/今日已完成 4 笔/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: '电子票据' })[0])
    expect(handlers.onReceipt).toHaveBeenCalledWith(expect.objectContaining({ settlementNo: 'S4' }))
    await user.click(screen.getAllByRole('button', { name: '复制单号' })[0])
    expect(handlers.onCopy).toHaveBeenCalledWith(expect.objectContaining({ settlementNo: 'S4' }))
  })

  it('only keeps settlements finalized by the logged-in user, not other usernames containing it', async () => {
    renderPanel([
      record('1', 'MINE', '2026-10-22T01:00:00Z'),
      record('2', 'OTHER', '2026-10-22T02:00:00Z', { cashierUsername: 'doctor2' }),
    ])
    expect(await screen.findByText('MINE')).toBeInTheDocument()
    expect(screen.queryByText('OTHER')).not.toBeInTheDocument()
  })

  it('shows an empty hint when nothing has been settled today', async () => {
    renderPanel([])
    expect(await screen.findByText('今日尚无本人办理的结算。')).toBeInTheDocument()
  })

  it('uses the Asia/Shanghai business date for today and for the displayed settlement time', async () => {
    // UTC 06:00 is 14:00 on 10-24 in Shanghai but still 10-23 evening in the Americas: the browser date must not leak into the query.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T06:00:00Z'))
    const { settlementRecords } = renderPanel([record('1', 'S1', '2026-10-24T06:00:00Z')])
    expect(await screen.findByText('2026-10-24 14:00')).toBeInTheDocument()
    expect(settlementRecords).toHaveBeenCalledWith(100, { from: '2026-10-24', to: '2026-10-24', cashier: 'doctor' })
  })
})
