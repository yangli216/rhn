import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi, SystemAnnouncement } from '../rhnApi'
import { AnnouncementCenter } from './AnnouncementCenter'
import { formatTime } from '../format'

const announcement: SystemAnnouncement = { id: '1', revision: 1, scopeType: 'DEPARTMENT', organizationId: '2',
  departmentId: '3', category: 'POLICY', priority: 'IMPORTANT', title: '实际业务公告', summary: '实际公告摘要',
  content: '实际公告正文', pinned: false, status: 'PUBLISHED', read: false, createdBy: '4', publishedBy: '5',
  createdAt: '2026-09-01T01:00:00Z', publishAt: '2026-09-02T01:00:00Z',
  publishedAt: '2026-09-02T01:05:00Z', updatedAt: '2026-09-02T01:05:00Z' }
const counts = { unread: 1, importantUnread: 1, total: 1 }

function show(active = vi.fn().mockResolvedValue([announcement]), summary = vi.fn().mockResolvedValue(counts)) {
  const markRead = vi.fn().mockResolvedValue({ ...announcement, read: true })
  const api = { announcements: { active, summary, markRead } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (contextKey: string) => <QueryClientProvider client={client}>
    <AnnouncementCenter api={api} contextKey={contextKey} />
  </QueryClientProvider>
  const view = render(ui('A'))
  fireEvent.click(screen.getByRole('button', { name: /^系统公告，/ }))
  return { ...view, ui, client, active, summary, markRead }
}

describe('AnnouncementCenter actual facts', () => {
  it('distinguishes read failures from zero counts and an empty inbox, and supports retry', async () => {
    const active = vi.fn().mockRejectedValue(new Error('公告读取失败'))
    const summary = vi.fn().mockRejectedValue(new Error('公告统计失败'))
    show(active, summary)
    await screen.findByText('公告统计加载失败')
    await screen.findByText('公告列表加载失败')
    expect(screen.queryByText('0 条公告未读')).not.toBeInTheDocument()
    expect(screen.queryByText('当前没有有效公告')).not.toBeInTheDocument()
    active.mockResolvedValue([]); summary.mockResolvedValue({ unread: 0, importantUnread: 0, total: 0 })
    fireEvent.click(screen.getByRole('button', { name: '重新加载公告' }))
    fireEvent.click(screen.getByRole('button', { name: '重新加载公告统计' }))
    await screen.findByText('当前没有有效公告')
    await screen.findByText('0 条公告未读')
  })

  it('does not claim zero unread announcements while loading', async () => {
    let resolve!: (value: typeof counts) => void
    show(undefined, vi.fn().mockReturnValue(new Promise((done) => { resolve = done })))
    expect(screen.getByText('正在核实公告未读数…')).toBeInTheDocument()
    expect(screen.queryByText('0 条公告未读')).not.toBeInTheDocument()
    await act(async () => resolve(counts))
    await screen.findByText('1 条重要公告尚未阅读')
  })

  it('removes cached announcements and details during refresh and after failure', async () => {
    const { active, client } = show(vi.fn().mockResolvedValue([{ ...announcement, read: true }]))
    fireEvent.click(await screen.findByRole('button', { name: /实际业务公告/ }))
    await screen.findByText('实际公告正文')
    let reject!: (reason: Error) => void
    active.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    act(() => { void client.invalidateQueries({ queryKey: ['announcements', 'A'] }) })
    await screen.findByText('正在加载公告…')
    expect(screen.queryByText('实际公告正文')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /实际业务公告/ })).not.toBeInTheDocument()
    await act(async () => reject(new Error('刷新失败')))
    await screen.findByText('公告列表加载失败')
    expect(screen.queryByText('当前没有有效公告')).not.toBeInTheDocument()
  })

  it('does not retain an empty-state claim after a failed refresh', async () => {
    const { active, client } = show(vi.fn().mockResolvedValue([]))
    await screen.findByText('当前没有有效公告')
    active.mockRejectedValue(new Error('刷新失败'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['announcements', 'A'] }) })
    await screen.findByText('公告列表加载失败')
    expect(screen.queryByText('当前没有有效公告')).not.toBeInTheDocument()
  })

  it('renders the actual publishing and effective timestamps separately', async () => {
    show(vi.fn().mockResolvedValue([{ ...announcement, read: true }]))
    fireEvent.click(await screen.findByRole('button', { name: /实际业务公告/ }))
    expect(await screen.findByText(/实际发布时间：/)).toHaveTextContent(formatTime(announcement.publishedAt))
    expect(screen.getByText(/生效时间：/)).toHaveTextContent(formatTime(announcement.publishAt))
  })

  it.each([null, {}, [null], [announcement, announcement],
    ...['id', 'revision', 'scopeType', 'organizationId', 'departmentId', 'category', 'priority', 'title',
      'summary', 'content', 'pinned', 'status', 'read', 'publishAt', 'publishedAt', 'publishedBy', 'createdAt', 'updatedAt']
      .map((field) => [{ ...announcement, [field]: undefined }]),
    [{ ...announcement, status: 'DRAFT' }], [{ ...announcement, category: 'UNKNOWN' }],
    [{ ...announcement, read: 'true' }], [{ ...announcement, publishedAt: '2026-02-30T01:00:00Z' }],
    [{ ...announcement, withdrawnBy: '4' }], [{ ...announcement, expireAt: announcement.publishAt }],
  ].map((value) => [value]))('rejects missing or inconsistent publication facts: %j', async (value) => {
    show(vi.fn().mockResolvedValue(value))
    await screen.findByText('公告列表加载失败')
    expect(screen.queryByText('当前没有有效公告')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /实际业务公告/ })).not.toBeInTheDocument()
  })

  it.each([null, {}, { unread: -1, importantUnread: 0, total: 1 }, { unread: 1, importantUnread: 2, total: 2 },
    { unread: 2, importantUnread: 1, total: 1 }, { unread: '1', importantUnread: 1, total: 1 },
  ])('rejects fabricated or inconsistent unread counts: %j', async (value) => {
    show(undefined, vi.fn().mockResolvedValue(value))
    await screen.findByText('公告统计加载失败')
    expect(screen.queryByText('0 条公告未读')).not.toBeInTheDocument()
  })

  it.each([{ ...announcement, read: false }, { ...announcement, id: 'wrong', read: true },
    { ...announcement, read: true, publishedAt: null }])('does not apply an invalid read receipt: %j', async (receipt) => {
    const { markRead, client } = show()
    markRead.mockResolvedValue(receipt)
    fireEvent.click(await screen.findByRole('button', { name: /实际业务公告/ }))
    await screen.findByRole('alert')
    expect(client.getQueryData(['announcements', 'A'])).toEqual([announcement])
  })

  it('reloads authoritative list data after a valid receipt rather than overwriting it with that receipt', async () => {
    const { active, markRead, client } = show()
    await screen.findByRole('button', { name: /实际业务公告/ })
    active.mockResolvedValue([{ ...announcement, read: true }])
    markRead.mockResolvedValue({ ...announcement, read: true, content: '回执中的旧正文' })
    fireEvent.click(screen.getByRole('button', { name: /实际业务公告/ }))
    await waitFor(() => expect(active).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('实际公告正文')).toBeInTheDocument()
    expect(screen.queryByText('回执中的旧正文')).not.toBeInTheDocument()
    expect(client.getQueryData(['announcements', 'A'])).toEqual([{ ...announcement, read: true }])
  })

  it('does not apply a late read receipt to another work context', async () => {
    const { active, markRead, rerender, ui, client } = show()
    let resolve!: (value: SystemAnnouncement) => void
    markRead.mockReturnValue(new Promise((done) => { resolve = done }))
    fireEvent.click(await screen.findByRole('button', { name: /实际业务公告/ }))
    active.mockResolvedValue([])
    rerender(ui('B'))
    fireEvent.click(screen.getByRole('button', { name: /^系统公告，/ }))
    await screen.findByText('当前没有有效公告')
    await act(async () => resolve({ ...announcement, read: true }))
    expect(client.getQueryData(['announcements', 'B'])).toEqual([])
    expect(screen.queryByText('实际公告正文')).not.toBeInTheDocument()
  })
})
