import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { RhnApi } from '../../shared/rhnApi'
import { BillingWorkspace } from './BillingWorkspace'

const item = (n: number, extra: Record<string, unknown> = {}) => ({
  encounterId: `enc-${n}`, residentId: `res-${n}`, status: 'PENDING_PAYMENT',
  residentName: ['', '李晓梅', '王建国'][n] ?? `患者${n}`, healthRecordNo: `JMD-000${n}`, gender: '1', genderText: '男',
  birthDate: '1980-01-01', encounterNo: `MZ2026083000${n}`, accountId: `acc-${n}`,
  sourceEventCount: 1, chargedEventCount: 1, accountBalance: 10, currencyCode: 'CNY',
  latestOccurredAt: `2026-08-30T0${n}:00:00Z`, ...extra,
})

const mockSimulator = {
  enabled: true, mode: 'GATEWAY', personas: [
    { id: 'TEST-310', label: '职工医保 · 正常', insuranceType: '310', certNo: 'TEST-310', residentKeyword: 'JMD-0002', expectation: '完整结算' },
  ],
}

function mount(worklist = [item(1), item(2)], residents: Array<{ id: string; fullName: string; healthRecordNo?: string }> = [{ id: 'res-2', fullName: '王建国' }],
  simulator: unknown = { enabled: false, personas: [] }) {
  const search = vi.fn().mockResolvedValue(residents)
  const queryInsurancePerson = vi.fn().mockResolvedValue({
    psnNo: 'P1', psnCertType: '06', certno: '360102198001010011', psnName: '王建国', insutype: '310', insutypeName: '职工', balc: 0,
    insuOptins: '360100', status: 'NORMAL',
  })
  const api = {
    billing: {
      worklist: vi.fn().mockResolvedValue(worklist),
      statement: vi.fn().mockResolvedValue({
        accountId: 'acc-1', currencyCode: 'CNY', chargeAmount: 0, invoicedAmount: 0, paymentAmount: 0, refundAmount: 0,
        accountBalance: 0, uninvoicedAmount: 0, charges: [], invoices: [], settlements: [], payments: [],
      }),
      dailyReconciliation: vi.fn().mockResolvedValue({}),
      paymentOrders: vi.fn().mockResolvedValue([]),
      registrationSettlementModes: vi.fn().mockResolvedValue({}),
      insuranceSimulator: vi.fn().mockResolvedValue(simulator),
      queryInsurancePerson,
    },
    residents: { search },
    dictionaries: { applicable: vi.fn().mockResolvedValue([]) },
  } as unknown as RhnApi
  const clinicalContext = { organization: { id: 'org-1', name: '机构' }, department: { id: 'dept-1', name: '科室' } } as ClinicalContext
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><BillingWorkspace api={api} clinicalContext={clinicalContext} /></MemoryRouter>
  </QueryClientProvider>)
  return { ...view, api, search, queryInsurancePerson }
}

const rows = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.billing-queue-list > button'))
const active = (container: HTMLElement) => container.querySelector('.billing-queue-list > button.is-active')

describe('BillingWorkspace patient lookup', () => {
  it('does not load any patient until one is opened', async () => {
    const { container } = mount()
    await waitFor(() => expect(rows(container)).toHaveLength(2))
    expect(active(container)).toBeNull()
    expect(screen.getByText('请选择待收费患者')).toBeInTheDocument()
    expect(screen.getByText('双击患者行调入')).toBeInTheDocument()
  })

  it('highlights on single click and loads on double click', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await waitFor(() => expect(rows(container)).toHaveLength(2))
    await user.click(rows(container)[1])
    expect(rows(container)[1]).toHaveAttribute('aria-selected', 'true')
    expect(rows(container)[1]).toHaveClass('is-highlighted')
    expect(active(container)).toBeNull()
    await user.dblClick(rows(container)[1])
    await waitFor(() => expect(active(container)).toHaveTextContent('王建国'))
    expect(rows(container)[1]).toHaveAttribute('aria-current', 'true')
  })

  it('moves the highlight with arrow keys and loads with Enter', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await waitFor(() => expect(rows(container)).toHaveLength(2))
    await user.click(rows(container)[0])
    await user.keyboard('{ArrowDown}')
    expect(rows(container)[1]).toHaveClass('is-highlighted')
    expect(active(container)).toBeNull()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(active(container)).toHaveTextContent('王建国'))
  })

  it('loads the matched pending patient after reading a social security card', async () => {
    const user = userEvent.setup()
    const { container, search, queryInsurancePerson } = mount()
    await waitFor(() => expect(rows(container)).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: '读社保卡' }))
    expect(await screen.findByText('读取凭证调入患者')).toBeInTheDocument()
    expect(screen.queryByText('按档案身份证鉴权')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /社保卡/, pressed: true })).toBeInTheDocument()
    await user.type(screen.getByLabelText('凭证号 / 卡号'), 'SB123')
    await user.click(screen.getByRole('button', { name: '读取' }))
    await waitFor(() => expect(active(container)).toHaveTextContent('王建国'))
    expect(queryInsurancePerson).toHaveBeenCalledWith(expect.objectContaining({ psnCertType: '06', certno: 'SB123' }))
    expect(search).toHaveBeenCalledWith('360102198001010011')
    expect(await screen.findByText('已通过医保凭证调入：王建国')).toBeInTheDocument()
    expect(screen.queryByText('读取凭证调入患者')).not.toBeInTheDocument()
  })

  it('picks a preset mock persona instead of the credential reader when the mock service is on', async () => {
    const user = userEvent.setup()
    const { container, api, search, queryInsurancePerson } = mount(undefined,
      [{ id: 'res-2', fullName: '王建国', healthRecordNo: 'JMD-0002' }], mockSimulator)
    await waitFor(() => expect(rows(container)).toHaveLength(2))
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    expect(screen.queryByText(/MOCK/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '读社保卡' }))
    expect(await screen.findByText('选择 Mock 参保人员读卡')).toBeInTheDocument()
    expect(screen.queryByText('读取凭证调入患者')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '读卡' }))
    await waitFor(() => expect(active(container)).toHaveTextContent('王建国'))
    expect(queryInsurancePerson).toHaveBeenCalledWith(expect.objectContaining({ psnCertType: '06', certno: 'TEST-310' }))
    expect(search).toHaveBeenCalledWith('JMD-0002')
    expect(await screen.findByText('已通过医保凭证调入：王建国')).toBeInTheDocument()
    expect(screen.queryByText('选择 Mock 参保人员读卡')).not.toBeInTheDocument()
  })

  it('loads the latest encounter and reports the count when several are pending', async () => {
    const user = userEvent.setup()
    const { container } = mount([item(1), item(2), item(2, { encounterId: 'enc-9', encounterNo: 'MZ99', residentName: '王建国',
      latestOccurredAt: '2026-08-31T09:00:00Z' })])
    await waitFor(() => expect(rows(container)).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: '医保码' }))
    expect(screen.getByRole('button', { name: /医保电子凭证/, pressed: true })).toBeInTheDocument()
    await user.type(screen.getByLabelText('凭证号 / 卡号'), 'EC123')
    await user.click(screen.getByRole('button', { name: '读取' }))
    await waitFor(() => expect(rows(container)[2]).toHaveClass('is-active'))
    expect(await screen.findByText(/共 2 条待收费就诊/)).toBeInTheDocument()
  })

  it('keeps the dialog open when the resident has no pending billing', async () => {
    const user = userEvent.setup()
    const { container } = mount([item(1)])
    await waitFor(() => expect(rows(container)).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: '医保码' }))
    await user.type(screen.getByLabelText('凭证号 / 卡号'), 'EC123')
    await user.click(screen.getByRole('button', { name: '读取' }))
    expect(await screen.findByText('该患者当前没有待收费业务')).toBeInTheDocument()
    expect(screen.getByText('读取凭证调入患者')).toBeInTheDocument()
    expect(active(container)).toBeNull()
  })

  it('reports a missing resident record inside the dialog', async () => {
    const user = userEvent.setup()
    mount([item(1)], [])
    await user.click(await screen.findByRole('button', { name: '医保码' }))
    await user.type(screen.getByLabelText('凭证号 / 卡号'), 'EC123')
    await user.click(screen.getByRole('button', { name: '读取' }))
    expect(await screen.findByText('未找到对应患者档案')).toBeInTheDocument()
  })

  it('opens the credential dialog prefilled when a typed code matches no queue entry', async () => {
    mount()
    const input = await screen.findByLabelText('患者检索')
    fireEvent.change(input, { target: { value: 'ZZ0123456789ABCDEF' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('读取凭证调入患者')).toBeInTheDocument()
    expect(screen.getByLabelText('凭证号 / 卡号')).toHaveValue('ZZ0123456789ABCDEF')
  })

  it('opens the credential dialog prefilled when a scanner reads an unmatched electronic code', async () => {
    mount()
    await screen.findByLabelText('患者检索')
    for (const char of 'ZZ0123456789ABCDEF') window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(await screen.findByText('读取凭证调入患者')).toBeInTheDocument()
    expect(screen.getByLabelText('凭证号 / 卡号')).toHaveValue('ZZ0123456789ABCDEF')
  })
})
