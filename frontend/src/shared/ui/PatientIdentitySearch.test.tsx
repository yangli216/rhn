import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { Resident } from '../model'
import { PatientIdentitySearch, type PatientIdentityMethod } from './PatientIdentitySearch'

const resident: Resident = {
  id: 'resident-1', healthRecordNo: 'HR0001', fullName: '张三', maskedNationalId: '3301********1234',
  gender: 'MALE', birthDate: '1990-01-01', deceased: false, createdAt: '2026-08-29T01:00:00Z',
  status: 'ACTIVE', version: 0, identifiers: [],
}

function renderSearch(props: Partial<ComponentProps<typeof PatientIdentitySearch>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const search = vi.fn().mockResolvedValue([resident])
  const onSelect = vi.fn()
  render(<QueryClientProvider client={client}><PatientIdentitySearch queryKey="test" search={search}
    onSelect={onSelect} {...props} /></QueryClientProvider>)
  return { search, onSelect }
}

describe('PatientIdentitySearch', () => {
  it('does not display identity channels that have no connected adapter', () => {
    renderSearch()

    expect(screen.queryByRole('button', { name: /读卡/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /人脸/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /电子凭证/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument()
  })

  it('keeps name results as candidates until the user confirms one', async () => {
    const { onSelect } = renderSearch()
    await userEvent.type(screen.getByLabelText('患者姓名、证件或卡号'), '张三')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))

    expect(await screen.findByText('1 条候选记录')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /张三/ }))
    expect(onSelect).toHaveBeenCalledWith(resident)
  })

  it('automatically fills a single resident found by a unique identity number', async () => {
    const { search, onSelect } = renderSearch()
    await userEvent.type(screen.getByLabelText('患者姓名、证件或卡号'), '330102199001011234')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(resident))
    expect(search).toHaveBeenCalledWith('330102199001011234')
    expect(screen.queryByText('1 条候选记录')).not.toBeInTheDocument()
  })

  it('lets an available external identity adapter return a resident directly', async () => {
    const identify = vi.fn().mockResolvedValue(resident)
    const methods: PatientIdentityMethod[] = [{ id: 'CARD', label: '读卡', icon: 'card', identify }]
    const { onSelect } = renderSearch({ methods })

    await userEvent.click(screen.getByRole('button', { name: /读卡/ }))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(resident))
    expect(identify).toHaveBeenCalledOnce()
  })
})
