import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientStationPatientWorkspace } from './InpatientStationShared'
import { DischargeDialog, InpatientAdmissionQueryWorkspace, InpatientAdmissionWorkspace } from './InpatientWorkspace'

const clinicalContext = { organization: { id: 'org-1' }, department: { id: 'ward-1' } } as ClinicalContext
const episode = { id: 'episode-1', revision: 0, episodeNo: 'IP001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', organizationId: 'org-1', departmentId: 'ward-1', encounterId: 'encounter-1',
  admittedAt: '2026-10-03T08:00:00+08:00' } as InpatientEpisode

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
  return client
}

describe('Inpatient registration facts', () => {
  it.each([new Error('连接失败'), null])('does not equate failed bed queries with no available beds: %s', async (response) => {
    const bootstrap = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response)
    const api = { inpatient: { bootstrap } } as unknown as RhnApi
    renderWithQuery(<InpatientAdmissionWorkspace api={api} clinicalContext={clinicalContext} />)
    expect(await screen.findByRole('button', { name: '重试床位查询' })).toBeInTheDocument()
    expect(screen.queryByText(/当前没有可分配床位/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认入院登记' })).not.toBeInTheDocument()
  })

  it('only shows an empty registration result after a successful query', async () => {
    const bootstrap = vi.fn().mockRejectedValue(new Error('连接失败'))
    const api = { inpatient: { bootstrap } } as unknown as RhnApi
    renderWithQuery(<InpatientAdmissionQueryWorkspace api={api} clinicalContext={clinicalContext} />)
    await screen.findByRole('button', { name: '重试登记查询' })
    expect(screen.queryByText('没有匹配的登记记录')).not.toBeInTheDocument()
    bootstrap.mockResolvedValue({ beds: [], episodes: [] })
    await userEvent.click(screen.getByRole('button', { name: '重试登记查询' }))
    expect(await screen.findByText('没有匹配的登记记录')).toBeInTheDocument()
  })

  it('does not label an unknown payment method as self pay', () => {
    render(<InpatientStationPatientWorkspace title="护理" episodes={[episode]} selected={episode}
      selectedId={episode.id} keyword="" loading={false} onKeywordChange={vi.fn()} onSearch={vi.fn()}
      onSelect={vi.fn()} onBack={vi.fn()}><div /></InpatientStationPatientWorkspace>)
    expect(screen.getByText('付费方式未登记')).toBeInTheDocument()
    expect(screen.queryByText('自费')).not.toBeInTheDocument()
  })

  it('does not reuse a ready result after the discharge check fails', async () => {
    const ready = { ready: true, openLongTermOrderCount: 0, incompleteTemporaryOrderCount: 0,
      pendingTaskCount: 0, requiredDocuments: [], dischargeDiagnoses: [], blockers: [] }
    const dischargeReadiness = vi.fn().mockResolvedValue(ready)
    const discharge = vi.fn()
    const api = { inpatient: { dischargeReadiness, discharge }, masterData: { diseases: vi.fn() } } as unknown as RhnApi
    const client = renderWithQuery(<DischargeDialog api={api} episode={episode} onClose={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByText('临床条件已满足')
    await userEvent.click(screen.getByLabelText('出院转归'))
    await userEvent.click(screen.getByRole('option', { name: '回家' }))
    expect(screen.getByRole('button', { name: '确认出院' })).toBeEnabled()
    dischargeReadiness.mockRejectedValue(new Error('核验失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['inpatient-discharge-readiness', episode.id] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认出院' })).toBeDisabled())
    expect(screen.queryByText('临床条件已满足')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '确认出院' }))
    expect(discharge).not.toHaveBeenCalled()
    dischargeReadiness.mockResolvedValue(ready)
    await userEvent.click(screen.getByRole('button', { name: '重新核对出院条件' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认出院' })).toBeEnabled())
  })
})
