import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { AnalyticsEntry } from './AnalyticsEntry'

function show(capabilities: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { analytics: { capabilities } } as unknown as RhnApi
  return render(<QueryClientProvider client={client}><AnalyticsEntry api={api} /></QueryClientProvider>)
}

describe('analytics entry fails closed', () => {
  it('shows disabled state without any query controls', async () => {
    show(async () => ({ enabled: false, queryExecutionEnabled: false, contractVersion: 'a04-contract-v1' }))
    expect(await screen.findByText('统计分析尚未开放')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查询|运行/ })).not.toBeInTheDocument()
  })
  it('enabling the shell still provides no execution action', async () => {
    show(async () => ({ enabled: true, queryExecutionEnabled: false, contractVersion: 'a04-contract-v1' }))
    expect(await screen.findByText('统计分析准备中')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查询|运行/ })).not.toBeInTheDocument()
  })
  it('keeps the entry closed on service failure', async () => {
    show(async () => { throw new Error('unavailable') })
    expect(await screen.findByText('暂时无法确认统计分析是否开放，请稍后重试。')).toBeInTheDocument()
  })
})
