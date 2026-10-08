import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { SkinTestHistoryStatus, useSkinTestHistory } from './skinTestHistory'

const evidence = { eventId: 'event-1', status: 'NEGATIVE', residentId: 'resident-1', medicationId: 'med-1' }
const defaults = { organizationId: 'org-1', residentId: 'resident-1', medicationId: 'med-1', validityHours: 24 }
function Harness({ api, context = defaults }: { api: RhnApi; context?: Omit<typeof defaults, 'validityHours'> & { validityHours?: number } }) {
  const history = useSkinTestHistory(api, context.organizationId, context.residentId,
    context.medicationId, context.validityHours, true)
  return <><SkinTestHistoryStatus history={history} />{history.item && <span>可引用 {history.item.eventId}</span>}</>
}
function setup(query: ReturnType<typeof vi.fn>, context = defaults) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const api = { treatments: { validNegativeSkinTests: query } } as unknown as RhnApi
  const view = render(<Harness api={api} context={context} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  return { client, api, ...view }
}

describe('skin test history verification', () => {
  it('distinguishes pending, failed, and successful empty results, with retry', async () => {
    const user = userEvent.setup()
    let reject!: (error: Error) => void
    const query = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
      .mockResolvedValue([])
    setup(query)
    expect(screen.getByText('正在核验历史皮试结果…')).toBeInTheDocument()
    reject(new Error('offline'))
    expect(await screen.findByText('皮试历史查询失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('未查到有效历史阴性凭据')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试皮试历史' }))
    expect(await screen.findByText('未查到有效历史阴性凭据')).toBeInTheDocument()
  })

  it.each(['organizationId', 'residentId', 'medicationId', 'validityHours'] as const)(
    'does not reuse old evidence after changing %s', async (field) => {
      const query = vi.fn().mockResolvedValueOnce([evidence]).mockResolvedValue([])
      const { rerender, api } = setup(query)
      expect(await screen.findByText('可引用 event-1')).toBeInTheDocument()
      const context = { ...defaults, [field]: field === 'validityHours' ? 6 : 'changed' }
      rerender(<Harness api={api} context={context} />)
      await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
      expect(screen.queryByText('可引用 event-1')).not.toBeInTheDocument()
      expect(await screen.findByText('未查到有效历史阴性凭据')).toBeInTheDocument()
    })

  it('does not expose retained evidence after a refetch fails', async () => {
    const query = vi.fn().mockResolvedValueOnce([evidence]).mockRejectedValue(new Error('offline'))
    const { client } = setup(query)
    expect(await screen.findByText('可引用 event-1')).toBeInTheDocument()
    await client.invalidateQueries({ queryKey: ['recent-negative-skin-test'] })
    expect(await screen.findByText('皮试历史查询失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('可引用 event-1')).not.toBeInTheDocument()
  })

  it.each([null, [{ ...evidence, medicationId: 'wrong-medication' }], [{ ...evidence, eventId: undefined }]])(
    'reports invalid result data instead of showing empty or valid evidence: %j', async (response) => {
      setup(vi.fn().mockResolvedValue(response))
      expect(await screen.findByText('皮试历史查询失败，尚未核验')).toBeInTheDocument()
      expect(screen.queryByText('可引用 event-1')).not.toBeInTheDocument()
    })

  it('does not query with a fabricated validity window when configuration is missing', async () => {
    const query = vi.fn()
    const { rerender, api } = setup(query, { ...defaults, validityHours: 0 })
    rerender(<Harness api={api} context={{ ...defaults, validityHours: undefined }} />)
    expect(screen.getByText('皮试结果有效期未配置，无法核验历史阴性结果')).toBeInTheDocument()
    expect(query).not.toHaveBeenCalled()
  })
})
