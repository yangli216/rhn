import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceSimulator } from '../api/billingApi'
import type { Resident } from '../model'
import type { RhnApi } from '../rhnApi'
import { InsuranceCredentialDialog } from './InsuranceCredentialDialog'
import { InsuranceMediaButtons, useInsuranceMediaReader, type InsuranceReadHandler } from './insuranceMedia'

const simulator: InsuranceSimulator = {
  enabled: true, mode: 'GATEWAY', consoleUrl: 'http://127.0.0.1:18090',
  personas: [
    { id: 'TEST-310', label: '职工医保 · 正常', insuranceType: '310', certNo: 'TEST-310', residentKeyword: 'HRMOCK0001', expectation: '完整结算' },
    { id: 'TEST-NOINSU', label: '无参保信息', insuranceType: null, certNo: 'TEST-NOINSU', residentKeyword: 'HRMOCK0012', expectation: '1101 被拒' },
  ],
}
const resident = { id: 'r1', fullName: '模拟·职工医保·正常', healthRecordNo: 'HRMOCK0001' } as Resident
const person = { psnNo: 'PSN-TEST-310', psnCertType: '06', certno: 'TEST-310', psnName: '测试', insutype: '310', insutypeName: '职工基本医疗保险', balc: 1850, insuOptins: '360100', status: 'NORMAL' }

function apiOf(data: InsuranceSimulator | Error, queryInsurancePerson: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(person)) {
  return {
    billing: {
      insuranceSimulator: data instanceof Error ? vi.fn().mockRejectedValue(data) : vi.fn().mockResolvedValue(data),
      queryInsurancePerson,
    },
    residents: { search: vi.fn().mockResolvedValue([resident]) },
  } as unknown as RhnApi
}

function Reader({ api, onRead }: { api: RhnApi; onRead: InsuranceReadHandler }) {
  const reader = useInsuranceMediaReader(api, onRead)
  return <><InsuranceMediaButtons onRead={reader.open} />{reader.dialog}</>
}

function setup(data: InsuranceSimulator | Error, queryInsurancePerson?: ReturnType<typeof vi.fn>, onRead = vi.fn()) {
  const api = apiOf(data, queryInsurancePerson)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Reader api={api} onRead={onRead} />
  </QueryClientProvider>)
  return { api, onRead }
}

describe('insurance media reader', () => {
  it('opens the formal credential reader when the mock service is off', async () => {
    const { api } = setup({ enabled: false, mode: 'GATEWAY', personas: [] })
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '读社保卡' }))
    expect(await screen.findByText('读取凭证调入患者')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /社保卡/, pressed: true })).toBeInTheDocument()
    expect(screen.queryByText(/Mock/)).not.toBeInTheDocument()
  })

  it('falls back to the formal reader when the mock status cannot be read', async () => {
    const { api } = setup(new Error('forbidden'))
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '医保码' }))
    expect(await screen.findByText('读取凭证调入患者')).toBeInTheDocument()
  })

  it('picks a mock persona on card read, runs 1101 and locates the preset patient', async () => {
    const { api, onRead } = setup(simulator)
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '读社保卡' }))
    expect(await screen.findByText('选择 Mock 参保人员读卡')).toBeInTheDocument()
    expect(screen.queryByText('读取凭证调入患者')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '读卡' }))
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    expect(api.billing.queryInsurancePerson).toHaveBeenCalledWith({ psnCertType: '06', certno: 'TEST-310', psnName: undefined })
    expect(api.residents.search).toHaveBeenCalledWith('HRMOCK0001')
    expect(onRead.mock.calls[0][0]).toMatchObject({ media: 'CARD', resident, person })
    await waitFor(() => expect(screen.queryByText('选择 Mock 参保人员读卡')).not.toBeInTheDocument())
  })

  it('uses the electronic credential type for a mock insurance code', async () => {
    const { api, onRead } = setup(simulator)
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '医保码' }))
    await userEvent.dblClick(await screen.findByRole('option', { name: /无参保信息/ }))
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    expect(api.billing.queryInsurancePerson).toHaveBeenCalledWith(expect.objectContaining({ psnCertType: '02', certno: 'TEST-NOINSU' }))
    expect(onRead.mock.calls[0][0].media).toBe('CODE')
  })

  it('keeps the mock picker open with the platform rejection', async () => {
    const reject = vi.fn().mockRejectedValue(new Error('1101 无参保信息'))
    const { api, onRead } = setup(simulator, reject)
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '读社保卡' }))
    await userEvent.click(await screen.findByRole('button', { name: '读卡' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1101 无参保信息')
    expect(onRead).not.toHaveBeenCalled()
    expect(api.residents.search).not.toHaveBeenCalled()
    expect(screen.getByText('选择 Mock 参保人员读卡')).toBeInTheDocument()
  })

  it('keeps the mock picker open when the page rejects the patient', async () => {
    const { api } = setup(simulator, undefined, vi.fn().mockReturnValue('该患者当前没有待收费业务'))
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '读社保卡' }))
    await userEvent.click(await screen.findByRole('button', { name: '读卡' }))
    expect(await screen.findByText('该患者当前没有待收费业务')).toBeInTheDocument()
    expect(screen.getByText('选择 Mock 参保人员读卡')).toBeInTheDocument()
  })

  it('opens the mock picker from the credential re-read dialog and continues verification', async () => {
    const api = apiOf(simulator)
    const onVerified = vi.fn()
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InsuranceCredentialDialog api={api} residentId="r1" onVerified={onVerified} onCancel={vi.fn()} />
    </QueryClientProvider>)
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /社保卡/ }))
    await userEvent.click(await screen.findByRole('button', { name: '读卡' }))
    await waitFor(() => expect(onVerified).toHaveBeenCalled())
    expect(api.billing.queryInsurancePerson).toHaveBeenCalledWith(expect.objectContaining({ psnCertType: '06', certno: 'TEST-310' }))
    expect(api.residents.search).not.toHaveBeenCalled()
  })
})
