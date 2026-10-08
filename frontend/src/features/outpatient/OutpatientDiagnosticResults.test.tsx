import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Encounter } from '../../shared/model'
import type { DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientDiagnosticResults } from './OutpatientDiagnosticResults'

const encounter = { id: 'enc1', residentId: 'resident1' } as Encounter
const report = { id: 'report1', encounterId: 'enc1', residentId: 'resident1', requestId: 'req1',
  reportName: '真实报告', status: 'FINAL', reportVersion: 1, issuedAt: '2026-10-03T01:00:00Z',
  observations: [{ id: 'obs1', observationName: '布尔结果', valueType: 'BOOLEAN', valueBoolean: false }] } as DiagnosticReport

function setup(load = vi.fn().mockResolvedValue([report])) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { diagnostics: { reportsByEncounter: load } } as unknown as RhnApi
  render(<QueryClientProvider client={client}><OutpatientDiagnosticResults encounter={encounter} api={api} /></QueryClientProvider>)
  return { client, load }
}

describe('outpatient diagnostic results truth', () => {
  it('shows the actual false result and missing conclusion honestly', async () => {
    setup()
    expect(await screen.findByText('布尔结果：否')).toBeInTheDocument()
    expect(screen.getByText('未记录报告结论')).toBeInTheDocument()
    expect(screen.getByText('正式报告')).toBeInTheDocument()
  })

  it('does not display zero or an empty report list while loading', () => {
    setup(vi.fn().mockReturnValue(new Promise(() => {})))
    expect(screen.getByText('报告数量待核实')).toBeInTheDocument()
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无报告')).not.toBeInTheDocument()
  })

  it.each([null, [{ ...report, residentId: 'other' }], [{ ...report, encounterId: 'other' }],
    [{ ...report, status: 'UNKNOWN' }], [{ ...report, observations: null }],
    [{ ...report, observations: [null] }]])('rejects malformed or mismatched reports: %j', async (result) => {
    setup(vi.fn().mockResolvedValue(result))
    await screen.findByRole('button', { name: '重新加载报告' })
    expect(screen.queryByText('真实报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无报告')).not.toBeInTheDocument()
    expect(screen.queryByText('0 份报告')).not.toBeInTheDocument()
  })

  it('hides cached reports during refresh and failure, then restores only a successful response', async () => {
    const { client, load } = setup()
    await screen.findByText('真实报告')
    let reject!: (error: Error) => void
    load.mockReturnValueOnce(new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    let refresh!: Promise<void>
    await act(async () => { refresh = client.invalidateQueries({ queryKey: ['doctor-reports'] }) })
    await waitFor(() => expect(screen.queryByText('真实报告')).not.toBeInTheDocument())
    await act(async () => { reject(new Error('报告读取失败')); await refresh })
    await screen.findByText('报告读取失败')
    expect(screen.queryByText('真实报告')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无报告')).not.toBeInTheDocument()
    load.mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载报告' }))
    await screen.findByText('暂无报告')
    expect(screen.getByText('0 份报告')).toBeInTheDocument()
  })
})
