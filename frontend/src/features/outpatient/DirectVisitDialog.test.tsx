import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { Resident, Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { DirectVisitDialog } from './DirectVisitDialog'

const resident = { id: 'resident', fullName: '测试患者', birthDate: '1992-03-04', gender: 'FEMALE',
  healthRecordNo: 'HR12345678' } as Resident
const encounter = { id: 'encounter', encounterNo: 'ENC1', residentId: resident.id,
  registeredAt: '2026-09-18T08:00:00Z', status: 'IN_PROGRESS' } as Encounter
function show(directVisit = vi.fn().mockResolvedValue({ outcome: 'CREATED', encounter, candidates: [] }), hasServiceFee = false) {
  const onReceived = vi.fn()
  const identify = vi.fn().mockResolvedValue(resident)
  const api = { residents: { search: vi.fn().mockResolvedValue([resident]) }, encounters: { directVisit } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <DirectVisitDialog api={api} hasServiceFee={hasServiceFee} onClose={vi.fn()} onReceived={onReceived}
      identityMethods={[{ id: 'CARD', label: '读卡', identify }]} />
  </QueryClientProvider>)
  return { directVisit, onReceived, identify }
}
async function verifyIdentity() {
  await userEvent.click(screen.getByRole('button', { name: /读卡/ }))
  await userEvent.click(await screen.findByRole('checkbox', { name: /已核对患者姓名/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /已核对出生日期/ }))
}

it('requires two identity confirmations and enters the returned encounter after card identification', async () => {
  const { directVisit, onReceived } = show()
  expect(screen.getByRole('button', { name: '确认身份并接诊' })).toBeDisabled()
  expect(screen.getByText(/未配置门诊服务费/)).toBeInTheDocument()
  await verifyIdentity()
  await userEvent.click(screen.getByRole('button', { name: '确认身份并接诊' }))
  await waitFor(() => expect(onReceived).toHaveBeenCalledWith(resident, encounter))
  expect(directVisit).toHaveBeenCalledWith(expect.objectContaining({ residentId: resident.id,
    factorResults: { NAME: true, DEMOGRAPHIC_OR_IDENTIFIER: true } }))
})

it('requires selection when several registrations exist and does not open an arbitrary encounter', async () => {
  const directVisit = vi.fn().mockResolvedValueOnce({ outcome: 'SELECT_REGISTRATION', encounter: null,
    candidates: [encounter, { ...encounter, id: 'second', encounterNo: 'ENC2' }] })
    .mockResolvedValueOnce({ outcome: 'REUSED', encounter, candidates: [] })
  const { onReceived } = show(directVisit, true)
  expect(screen.getByText(/加入待结算费用/)).toBeInTheDocument()
  await verifyIdentity()
  await userEvent.click(screen.getByRole('button', { name: '确认身份并接诊' }))
  expect(await screen.findByText(/发现多条有效挂号/)).toBeInTheDocument()
  expect(onReceived).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '确认身份并接诊' })).toBeDisabled()
  await userEvent.click(screen.getByRole('combobox', { name: '选择有效挂号' }))
  await userEvent.click(await screen.findByRole('option', { name: /ENC1/ }))
  await userEvent.click(screen.getByRole('button', { name: '确认身份并接诊' }))
  await waitFor(() => expect(onReceived).toHaveBeenCalledWith(resident, encounter))
  expect(directVisit.mock.calls[1][0].encounterId).toBe(encounter.id)
})

it('retries an uncertain request with the same idempotency command', async () => {
  const directVisit = vi.fn().mockRejectedValueOnce(new Error('网络中断')).mockResolvedValueOnce({ outcome: 'REUSED', encounter, candidates: [] })
  show(directVisit)
  await verifyIdentity()
  await userEvent.click(screen.getByRole('button', { name: '确认身份并接诊' }))
  expect(await screen.findByText('网络中断')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '确认身份并接诊' }))
  await waitFor(() => expect(directVisit).toHaveBeenCalledTimes(2))
  expect(directVisit.mock.calls[0][0]).toEqual(directVisit.mock.calls[1][0])
})
