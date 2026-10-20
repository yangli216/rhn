import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceSimulator } from '../../shared/api/billingApi'
import type { Resident } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { InsuranceMediaSimulator } from './InsuranceMediaSimulator'

const simulator: InsuranceSimulator = {
  enabled: true, mode: 'GATEWAY', consoleUrl: 'http://127.0.0.1:18090',
  personas: [
    { id: 'TEST-310', label: '职工医保 · 正常', insuranceType: '310', certNo: 'TEST-310', residentKeyword: 'HRMOCK0001', expectation: '完整结算' },
    { id: 'TEST-NOINSU', label: '无参保信息', insuranceType: null, certNo: 'TEST-NOINSU', residentKeyword: 'HRMOCK0012', expectation: '1101 被拒' },
  ],
}
const resident = { id: 'r1', fullName: '模拟·职工医保·正常', healthRecordNo: 'HRMOCK0001' } as Resident
const person = { psnNo: 'PSN-TEST-310', psnCertType: '06', certno: 'TEST-310', psnName: '测试', insutype: '310', insutypeName: '职工基本医疗保险', balc: 1850, insuOptins: '360100', status: 'NORMAL' }

function setup(data: InsuranceSimulator | Error, queryInsurancePerson = vi.fn().mockResolvedValue(person)) {
  const api = {
    billing: {
      insuranceSimulator: data instanceof Error ? vi.fn().mockRejectedValue(data) : vi.fn().mockResolvedValue(data),
      queryInsurancePerson,
    },
    residents: { search: vi.fn().mockResolvedValue([resident]) },
  } as unknown as RhnApi
  const onRead = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <InsuranceMediaSimulator api={api} onRead={onRead} />
  </QueryClientProvider>)
  return { api, onRead }
}

describe('InsuranceMediaSimulator', () => {
  it('renders nothing when the simulator is off, as in a formal deployment', async () => {
    const { api } = setup({ enabled: false, mode: 'GATEWAY', personas: [] })
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    expect(screen.queryByText('医保联调模拟')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /模拟读卡/ })).not.toBeInTheDocument()
  })

  it('renders nothing when the simulator status cannot be read', async () => {
    const { api } = setup(new Error('forbidden'))
    await waitFor(() => expect(api.billing.insuranceSimulator).toHaveBeenCalled())
    expect(screen.queryByText('医保联调模拟')).not.toBeInTheDocument()
  })

  it('reads a card through 1101, then locates the preset mock patient', async () => {
    const { api, onRead } = setup(simulator)
    await userEvent.click(await screen.findByRole('button', { name: /模拟读卡/ }))
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    expect(api.billing.queryInsurancePerson).toHaveBeenCalledWith({ psnCertType: '06', certno: 'TEST-310', psnName: undefined })
    expect(api.residents.search).toHaveBeenCalledWith('HRMOCK0001')
    expect(onRead.mock.calls[0][0]).toMatchObject({ media: 'CARD', resident, person, persona: { id: 'TEST-310' } })
  })

  it('uses the electronic credential type for a simulated medical insurance code', async () => {
    const { api, onRead } = setup(simulator)
    await userEvent.click(await screen.findByRole('button', { name: /模拟医保码/ }))
    await waitFor(() => expect(onRead).toHaveBeenCalled())
    expect(api.billing.queryInsurancePerson).toHaveBeenCalledWith(expect.objectContaining({ psnCertType: '02' }))
    expect(onRead.mock.calls[0][0].media).toBe('CODE')
  })

  it('shows the platform rejection and does not select a patient', async () => {
    const reject = vi.fn().mockRejectedValue(new Error('1101 无参保信息'))
    const { api, onRead } = setup(simulator, reject)
    await userEvent.click(await screen.findByRole('button', { name: /模拟读卡/ }))
    await waitFor(() => expect(reject).toHaveBeenCalled())
    expect(onRead).not.toHaveBeenCalled()
    expect(api.residents.search).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('1101 无参保信息')
  })
})
