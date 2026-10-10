import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import { PresenceManagement } from './PresenceManagement'
import { PresenceIndicator } from '../../shared/realtime/PresenceIndicator'

const at = '2026-10-03T01:00:00Z'
const context = { organization: { id: 'org', name: '实际机构' }, department: { id: 'dept', name: '实际科室' } } as ClinicalContext
const scope = { scopeType: 'DEPARTMENT', organizationId: 'org', departmentId: 'dept', name: '实际科室',
  onlineUsers: 1, activeUsers: 1, onlineContexts: 1, connections: 1 }
const summary = { onlineUsers: 1, activeUsers: 1, onlineContexts: 1, connections: 1, instances: 1,
  asOf: at, organizations: [], departments: [scope] }
const user = { userId: '1', username: '实际账号', organizationId: 'org', departmentId: 'dept',
  organizationName: '实际机构', departmentName: '实际科室', active: true, connectionCount: 1,
  connectedAt: at, lastSeenAt: at, lastActivityAt: at }
const page = { page: 0, size: 50, total: 1, asOf: at, items: [user] }

function show(overrides: Record<string, unknown> = {}) {
  const methods = { summary: vi.fn().mockResolvedValue(summary), users: vi.fn().mockResolvedValue(page),
    trend: vi.fn().mockImplementation((_scope, organizationId, departmentId, from, to) => Promise.resolve({
      scopeType: 'DEPARTMENT', organizationId, departmentId, from, to, points: [0, 1, 60].map((minutes) => ({
        bucketAt: new Date(Date.parse(from) + minutes * 60_000).toISOString(), onlineUsers: 1, activeUsers: 1,
        onlineContexts: 1, connections: 1, instances: 1,
      })),
    })), terminate: vi.fn().mockResolvedValue({ userId: '1', revokedSessions: 1, affectedConnections: 1, terminatedAt: at }),
    ...overrides }
  const api = { presence: methods } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (ctx = context) => <QueryClientProvider client={client}>
    <PresenceManagement api={api} clinicalContext={ctx} canReadTrend canTerminate />
  </QueryClientProvider>
  return { ...render(ui()), methods, client, ui, api }
}

describe('PresenceManagement actual observations', () => {
  it('does not display failed queries as empty statistics or successful empty lists', async () => {
    show({ summary: vi.fn().mockRejectedValue(new Error('统计失败')), users: vi.fn().mockRejectedValue(new Error('名单失败')),
      trend: vi.fn().mockRejectedValue(new Error('趋势失败')) })
    await screen.findByText('在线统计加载失败')
    await screen.findByText('在线名单加载失败')
    await screen.findByText('在线趋势加载失败')
    expect(screen.queryByText('没有匹配的在线用户')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无趋势数据')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无科室在线分布')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '强制下线' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '在线状态概览' })).getAllByText('—')).toHaveLength(5)
  })

  it('keeps real zero and empty results distinct from missing data', async () => {
    show({ summary: vi.fn().mockResolvedValue({ ...summary, onlineUsers: 0, activeUsers: 0, onlineContexts: 0,
      connections: 0, instances: 0, departments: [] }), users: vi.fn().mockResolvedValue({ ...page, total: 0, items: [] }),
    trend: vi.fn().mockImplementation((_s, organizationId, departmentId, from, to) => Promise.resolve({
      scopeType: 'DEPARTMENT', organizationId, departmentId, from, to, points: [] })) })
    await screen.findByText('没有匹配的在线用户')
    await screen.findByText('暂无趋势数据')
    expect(within(screen.getByRole('region', { name: '在线状态概览' })).getAllByText('0')).toHaveLength(5)
  })

  it('labels historical data as samples and plots the actual time spacing', async () => {
    const { container } = show()
    await screen.findByRole('img', { name: '在线用户峰值 1 人' })
    expect(screen.getByText('峰值 1 人 · 最近采样 1 人')).toBeInTheDocument()
    expect(screen.queryByText('最近 5 分钟活跃')).not.toBeInTheDocument()
    const points = container.querySelector('polyline.is-online')!.getAttribute('points')!.split(' ')
      .map((value) => Number(value.split(',')[0]))
    expect(points[1] - points[0]).toBeLessThan((points[2] - points[0]) / 10)
  })

  it('disables an already opened termination dialog while its source list is being refreshed', async () => {
    const { methods, client } = show()
    fireEvent.click(await screen.findByRole('button', { name: '强制下线' }))
    fireEvent.change(screen.getByLabelText('下线原因'), { target: { value: '实际管理员原因' } })
    let reject!: (reason: Error) => void
    vi.mocked(methods.users).mockReturnValue(new Promise((_, fail) => { reject = fail }))
    act(() => { void client.invalidateQueries({ queryKey: ['presence-users'] }) })
    await screen.findByText('正在加载在线用户…')
    expect(screen.getByRole('button', { name: '确认下线' })).toBeDisabled()
    expect(screen.queryByText('实际账号', { selector: 'strong' })).not.toBeInTheDocument()
    await act(async () => reject(new Error('刷新失败')))
    await screen.findByText('在线名单加载失败')
    fireEvent.click(screen.getByRole('button', { name: '确认下线' }))
    expect(methods.terminate).not.toHaveBeenCalled()
  })

  it('does not accept a mismatched termination receipt as success', async () => {
    show({ terminate: vi.fn().mockResolvedValue({ userId: 'wrong', revokedSessions: 1, affectedConnections: 1, terminatedAt: at }) })
    fireEvent.click(await screen.findByRole('button', { name: '强制下线' }))
    fireEvent.change(screen.getByLabelText('下线原因'), { target: { value: '实际管理员原因' } })
    fireEvent.click(screen.getByRole('button', { name: '确认下线' }))
    await screen.findByText('下线结果缺少有效回执，请刷新在线名单核实。')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each([null, {}, { ...summary, activeUsers: 2 }, { ...summary, instances: undefined },
    { ...summary, departments: [scope, scope] }, { ...summary, asOf: '1' }])('rejects invalid summaries: %j', async (value) => {
    show({ summary: vi.fn().mockResolvedValue(value) })
    await screen.findByText('在线统计加载失败')
    expect(screen.queryByText('暂无科室在线分布')).not.toBeInTheDocument()
  })

  it.each([null, {}, { ...page, total: 0 }, { ...page, page: 1 }, { ...page, items: [{ ...user, active: undefined }] },
    { ...page, items: [{ ...user, connectionCount: 0 }] }, { ...page, items: [{ ...user, lastSeenAt: '2026-02-30T01:00:00Z' }] },
    { ...page, total: 2, items: [user, user] }])('rejects invalid lists and blocks actions: %j', async (value) => {
    show({ users: vi.fn().mockResolvedValue(value) })
    await screen.findByText('在线名单加载失败')
    expect(screen.queryByRole('button', { name: '强制下线' })).not.toBeInTheDocument()
  })

  it('clears the previous contexts termination dialog', async () => {
    const { rerender, ui } = show()
    fireEvent.click(await screen.findByRole('button', { name: '强制下线' }))
    rerender(ui({ ...context, department: { ...context.department, id: 'next' } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('makes indicator failures explicit and removes cached online counts', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const read = vi.fn().mockResolvedValue(summary)
    const api = { presence: { summary: read } } as unknown as RhnApi
    render(<QueryClientProvider client={client}><PresenceIndicator api={api} contextKey="A" /></QueryClientProvider>)
    await screen.findByRole('button', { name: '在线用户 1 人' })
    read.mockRejectedValue(new Error('在线服务不可用'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['presence-summary', 'A'] }) })
    expect(await screen.findByRole('button', { name: '在线人数读取失败' })).toHaveTextContent('—')
    expect(screen.queryByRole('button', { name: '在线用户 1 人' })).not.toBeInTheDocument()
  })

  it.each(['wrong-scope', 'missing-points', 'invalid-count', 'unordered-points'])(
    'rejects invalid historical samples: %s', async (problem) => {
      show({ trend: vi.fn().mockImplementation((_s, organizationId, departmentId, from, to) => {
        const point = { bucketAt: from, onlineUsers: 1, activeUsers: 1, onlineContexts: 1, connections: 1, instances: 1 }
        return Promise.resolve({ scopeType: 'DEPARTMENT', organizationId,
          departmentId: problem === 'wrong-scope' ? 'other' : departmentId, from, to,
          points: problem === 'missing-points' ? undefined : problem === 'invalid-count' ? [{ ...point, activeUsers: 2 }]
            : problem === 'unordered-points' ? [{ ...point, bucketAt: to }, point] : [point] })
      }) })
      await screen.findByText('在线趋势加载失败')
      expect(screen.queryByText('暂无趋势数据')).not.toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /在线用户峰值/ })).not.toBeInTheDocument()
    })
})
