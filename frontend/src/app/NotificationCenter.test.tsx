import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../shared/rhnApi'
import type { PortalNotification } from '../shared/api/portalApi'
import { NotificationCenter } from './AppShell'

const summary = { activeResidents: 1, registeredToday: 1, inProgress: 0, completedToday: 0,
  tasks: { ready: 0, inProgress: 0, overdue: 0, totalOpen: 0 }, notifications: { unread: 1, total: 1 } }
const message: PortalNotification = { id: '1', category: 'BUSINESS', severity: 'INFO', title: '实际业务通知',
  message: '来自真实业务事件', status: 'UNREAD', sourceType: 'Encounter', sourceId: '2',
  createdAt: '2026-09-28T11:36:00Z', revision: 0, routePath: '/residents' }

function apiFor(list = vi.fn().mockResolvedValue([message]), summaryFn = vi.fn().mockResolvedValue(summary)) {
  return { portal: { summary: summaryFn, notifications: { list,
    markRead: vi.fn().mockResolvedValue({ ...message, status: 'READ', readAt: '2026-09-28T12:00:00Z' }),
    archive: vi.fn().mockResolvedValue(undefined) } } } as unknown as RhnApi
}

function show(api: RhnApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const navigate = vi.fn()
  const ui = (value: RhnApi, contextKey = 'A') => <QueryClientProvider client={client}>
    <NotificationCenter api={value} contextKey={contextKey} onNavigate={navigate} />
  </QueryClientProvider>
  const view = render(ui(api))
  fireEvent.click(screen.getByRole('button', { name: /^消息，/ }))
  return { client, navigate, ...view, ui }
}

describe('NotificationCenter truth', () => {
  it('shows unknown unread counts on failure and recovers a genuine zero', async () => {
    const counts = vi.fn().mockRejectedValue(new Error('统计服务不可用'))
    show(apiFor(vi.fn().mockResolvedValue([]), counts))
    await screen.findByText('未读数暂不可用')
    expect(screen.queryByText('0 条未读消息')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '消息，未读消息数加载失败' })).toBeInTheDocument()
    counts.mockResolvedValue({ ...summary, notifications: { unread: 0, total: 0 } })
    fireEvent.click(screen.getByRole('button', { name: '重新加载未读数' }))
    expect(await screen.findByText('0 条未读消息')).toBeInTheDocument()
  })

  it('never presents a pending count as zero', async () => {
    let resolve!: (value: typeof summary) => void
    show(apiFor(vi.fn().mockResolvedValue([]), vi.fn().mockReturnValue(new Promise((done) => { resolve = done }))))
    expect(screen.getByText('正在加载未读消息数…')).toBeInTheDocument()
    expect(screen.queryByText('0 条未读消息')).not.toBeInTheDocument()
    await act(async () => resolve(summary))
    expect(await screen.findByText('1 条未读消息')).toBeInTheDocument()
  })

  it('removes stale messages and actions throughout refresh and failure, then recovers an empty inbox', async () => {
    const list = vi.fn().mockResolvedValue([message])
    const { client } = show(apiFor(list))
    await screen.findByText(message.title)
    let reject!: (reason: Error) => void
    list.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    act(() => { void client.invalidateQueries({ queryKey: ['portal-notifications', 'A'] }) })
    await screen.findByText('正在加载消息…')
    expect(screen.queryByText(message.title)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument()
    await act(async () => reject(new Error('消息服务不可用')))
    await screen.findByText('消息列表加载失败')
    expect(screen.queryByText(message.title)).not.toBeInTheDocument()
    expect(screen.queryByText('暂无消息')).not.toBeInTheDocument()
    list.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '重新加载消息' }))
    expect(await screen.findByText('暂无消息')).toBeInTheDocument()
  })

  it('does not display a cached empty inbox as a successful refresh', async () => {
    const list = vi.fn().mockResolvedValue([])
    const { client } = show(apiFor(list))
    await screen.findByText('暂无消息')
    list.mockRejectedValue(new Error('离线'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['portal-notifications', 'A'] }) })
    await screen.findByText('消息列表加载失败')
    expect(screen.queryByText('暂无消息')).not.toBeInTheDocument()
  })

  it('isolates counts, list and actions when switching departments', async () => {
    const original = apiFor()
    const { rerender, ui } = show(original)
    await screen.findByText(message.title)
    let resolve!: (value: PortalNotification[]) => void
    const next = apiFor(vi.fn().mockReturnValue(new Promise((done) => { resolve = done })),
      vi.fn().mockRejectedValue(new Error('新科室统计暂不可用')))
    rerender(ui(next, 'B'))
    await screen.findByText('正在加载消息…')
    expect(screen.queryByText(message.title)).not.toBeInTheDocument()
    expect(screen.queryByText('1 条未读消息')).not.toBeInTheDocument()
    await act(async () => resolve([]))
    expect(await screen.findByText('暂无消息')).toBeInTheDocument()
    expect(original.portal.notifications.archive).not.toHaveBeenCalled()
  })

  it.each([null, {}, [null], [message, message],
    ...['id', 'title', 'message', 'sourceId', 'sourceType', 'category', 'createdAt', 'status', 'severity', 'revision']
      .map((field) => [{ ...message, [field]: undefined }]),
    [{ ...message, status: 'NEW_STATUS' }], [{ ...message, status: 'ARCHIVED' }],
    [{ ...message, status: 'READ', readAt: null }], [{ ...message, readAt: '2026-09-28T12:00:00Z' }],
    [{ ...message, createdAt: 'not-a-date' }], [{ ...message, createdAt: '1' }],
    [{ ...message, createdAt: '2026-02-30T12:00:00Z' }], [{ ...message, revision: -1 }],
  ].map((value) => [value]))('rejects malformed or contradictory notification facts: %j', async (value) => {
    show(apiFor(vi.fn().mockResolvedValue(value)))
    expect(await screen.findByText('消息列表加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无消息')).not.toBeInTheDocument()
  })

  it('validates summary counts before displaying them', async () => {
    show(apiFor(undefined, vi.fn().mockResolvedValue({ ...summary, notifications: { unread: 2, total: 1 } })))
    expect(await screen.findByText('未读数暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('2 条未读消息')).not.toBeInTheDocument()
  })

  it('retains real read state and calls the real navigation and read action', async () => {
    const api = apiFor(vi.fn().mockResolvedValue([{ ...message, status: 'READ', readAt: '2026-09-28T12:00:00Z' }]))
    const { navigate } = show(api)
    await screen.findByText('已读')
    fireEvent.click(screen.getByRole('button', { name: /实际业务通知/ }))
    await waitFor(() => expect(api.portal.notifications.markRead).toHaveBeenCalledWith('1', expect.anything()))
    expect(navigate).toHaveBeenCalledWith('/residents')
  })
})
