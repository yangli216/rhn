import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import '../../styles/features/outpatient-doctor.css'
import { useEffect, useState, type FormEvent } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon, LoadingState, PageHeader, Panel, PanelHead, StatusBadge } from '../../shared/ui'
import { formatTime } from '../../shared/format'
import { requirePresenceSummary, requirePresenceUsers, requirePresenceTrend, requirePresenceTermination } from '../../shared/realtime/presenceFacts'
import type { PresenceTrendPoint, PresenceUser } from '../../shared/api/presenceApi'

const PAGE_SIZE = 50
const TREND_PERIODS = [{ hours: 6, label: '6 小时' }, { hours: 24, label: '24 小时' },
  { hours: 168, label: '7 天' }]

export function PresenceManagement({ api, clinicalContext, canReadTrend = false, canTerminate = false }: {
  api: RhnApi; clinicalContext: ClinicalContext; canReadTrend?: boolean; canTerminate?: boolean
}) {
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [trendHours, setTrendHours] = useState(6)
  const [terminateTarget, setTerminateTarget] = useState<PresenceUser | null>(null)
  const [terminationReason, setTerminationReason] = useState('')
  const queryClient = useQueryClient()
  const contextKey = `${clinicalContext.organization.id}:${clinicalContext.department.id}`
  const summary = useQuery({ queryKey: ['presence-summary', contextKey], queryFn: async () => requirePresenceSummary(await api.presence.summary()),
    refetchInterval: 30_000 })
  const users = useQuery({ queryKey: ['presence-users', contextKey, query, activeOnly, page],
    queryFn: async () => requirePresenceUsers(await api.presence.users(query, activeOnly, page, PAGE_SIZE), page, PAGE_SIZE, activeOnly), refetchInterval: 30_000 })
  const trend = useQuery({ queryKey: ['presence-trend', contextKey, trendHours], enabled: canReadTrend,
    queryFn: async () => {
      const to = new Date()
      const from = new Date(to.getTime() - trendHours * 60 * 60 * 1000)
      const result = await api.presence.trend('DEPARTMENT', clinicalContext.organization.id, clinicalContext.department.id,
        from.toISOString(), to.toISOString())
      return requirePresenceTrend(result, clinicalContext.organization.id, clinicalContext.department.id,
        from.toISOString(), to.toISOString())
    }, refetchInterval: 60_000 })
  const termination = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      if (!canTerminate || !users.isSuccess || users.isFetching || !users.data.items.some((value) => value.userId === userId)) {
        throw new Error('在线名单或操作权限已变化，请刷新核实。')
      }
      return requirePresenceTermination(await api.presence.terminate(userId, reason), userId)
    },
    onSuccess: () => {
      setTerminateTarget(null); setTerminationReason('')
      void queryClient.invalidateQueries({ queryKey: ['presence-summary', contextKey] })
      void queryClient.invalidateQueries({ queryKey: ['presence-users', contextKey] })
    },
  })

  useEffect(() => { setPage(0) }, [query, activeOnly])
  useEffect(() => { setTerminateTarget(null); setTerminationReason(''); setPage(0) }, [contextKey])

  function search(event: FormEvent) { event.preventDefault(); setQuery(draftQuery.trim()) }
  function refresh() { void summary.refetch(); void users.refetch(); if (canReadTrend) void trend.refetch() }
  const summaryValue = summary.isSuccess && !summary.isFetching ? summary.data : undefined
  const usersValue = users.isSuccess && !users.isFetching ? users.data : undefined
  const trendValue = trend.isSuccess && !trend.isFetching ? trend.data : undefined
  const totalPages = usersValue ? Math.max(1, Math.ceil(usersValue.total / PAGE_SIZE)) : undefined
  const canConfirmTermination = canTerminate && usersValue?.items.some((value) => value.userId === terminateTarget?.userId)

  return <>
    <PageHeader compact eyebrow="系统配置 · 实时在线" title="在线用户管理"
      description="按账号和工作上下文去重统计在线状态，区分保持连接与最近活跃，避免多 Tab 重复计数。"
      actions={<Button variant="secondary" onClick={refresh} busy={summary.isFetching || users.isFetching}>
        <Icon name="refresh" />刷新</Button>} />
    {(summary.error || users.error || trend.error || termination.error) && <Alert>{errorMessage(
      summary.error || users.error || trend.error || termination.error,
    )}</Alert>}
    <section className="presence-overview" aria-label="在线状态概览">
      <div><span>在线用户</span><strong>{summaryValue?.onlineUsers ?? '—'}</strong><small>按账号去重</small></div>
      <div><span>活跃用户</span><strong>{summaryValue?.activeUsers ?? '—'}</strong><small>按服务端活跃规则统计</small></div>
      <div><span>工作上下文</span><strong>{summaryValue?.onlineContexts ?? '—'}</strong><small>用户 × 机构 × 科室</small></div>
      <div><span>实时连接</span><strong>{summaryValue?.connections ?? '—'}</strong><small>包含多 Tab 连接</small></div>
      <div><span>服务实例</span><strong>{summaryValue?.instances ?? '—'}</strong><small>承载在线连接的节点</small></div>
    </section>
    {canReadTrend && <Panel className="presence-trend-panel">
      <PanelHead title="在线趋势" meta={`${clinicalContext.department.name} · 历史采样`} actions={
        <div className="presence-trend-period" role="group" aria-label="趋势时间范围">
          {TREND_PERIODS.map((period) => <button key={period.hours} type="button"
            className={trendHours === period.hours ? 'is-active' : ''}
            onClick={() => setTrendHours(period.hours)}>{period.label}</button>)}
        </div>} />
      {(trend.isPending || trend.isFetching) && <LoadingState label="正在加载在线趋势…" />}
      {trend.isError && <EmptyState icon="warning" title="在线趋势加载失败" copy={errorMessage(trend.error)} />}
      {trendValue && <PresenceTrendChart points={trendValue.points} />}
    </Panel>}
    <Panel className="presence-scope-panel">
      <PanelHead title="科室在线分布" meta={`当前范围：${clinicalContext.department.name}`} />
      {(summary.isPending || summary.isFetching) && <LoadingState label="正在统计在线分布…" />}
      {summary.isError && <EmptyState icon="warning" title="在线统计加载失败" copy={errorMessage(summary.error)} />}
      {summaryValue && summaryValue.departments.length === 0 && <EmptyState icon="residents"
        title="暂无科室在线分布" copy="当前统计中没有带科室信息的在线连接。" />}
      {!!summaryValue?.departments.length && <div className="presence-scope-list">
        {summaryValue!.departments.map((scope) => <div key={`${scope.organizationId}:${scope.departmentId}`}>
          <span><strong>{scope.name}</strong><small>{scope.activeUsers} 人活跃 · {scope.connections} 个连接</small></span>
          <b>{scope.onlineUsers}</b>
        </div>)}
      </div>}
    </Panel>
    <Panel className="presence-users-panel">
      <PanelHead title="在线用户" meta={usersValue ? `共 ${usersValue.total} 个在线工作上下文` : '在线名单待核实'} />
      <form className="presence-toolbar" onSubmit={search}>
        <label><span className="visually-hidden">搜索账号、机构或科室</span>
          <Icon name="search" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="搜索账号、机构或科室" /></label>
        <label className="presence-active-filter"><input type="checkbox" checked={activeOnly}
          onChange={(event) => setActiveOnly(event.target.checked)} />只看活跃用户</label>
        <Button type="submit" variant="secondary">查询</Button>
      </form>
      {(users.isPending || users.isFetching) && <LoadingState label="正在加载在线用户…" />}
      {users.isError && <EmptyState icon="warning" title="在线名单加载失败" copy={errorMessage(users.error)} />}
      {usersValue && usersValue.items.length === 0 && <EmptyState icon="user" title="没有匹配的在线用户"
        copy={query || activeOnly ? '调整查询条件后重试。' : '用户建立实时连接后会自动出现在这里。'} />}
      {!!usersValue?.items.length && <div className={`presence-user-table ${canTerminate ? 'can-terminate' : ''}`}
        role="table" aria-label="在线用户列表">
        <div className="presence-user-table__head" role="row">
          <span>用户</span><span>当前工作范围</span><span>在线状态</span><span>连接时间</span><span>最近心跳</span><span>连接数</span>
          {canTerminate && <span>操作</span>}
        </div>
        {usersValue!.items.map((user) => <div className="presence-user-table__row" role="row"
          key={`${user.userId}:${user.organizationId}:${user.departmentId ?? ''}`}>
          <span><strong>{user.username}</strong><small>账号 ID {user.userId}</small></span>
          <span><strong>{user.departmentName}</strong><small>{user.organizationName}</small></span>
          <span><StatusBadge tone={user.active ? 'success' : 'neutral'}>{user.active ? '活跃' : '在线'}</StatusBadge></span>
          <time>{formatTime(user.connectedAt)}</time><time>{formatTime(user.lastSeenAt)}</time>
          <b>{user.connectionCount}</b>
          {canTerminate && <Button variant="text" size="sm" onClick={() => {
            setTerminationReason(''); setTerminateTarget(user)
          }}>强制下线</Button>}
        </div>)}
      </div>}
      {usersValue && usersValue.total > PAGE_SIZE && <footer className="presence-pagination">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>上一页</Button>
        <span>第 {page + 1} / {totalPages} 页</span>
        <Button variant="secondary" disabled={page + 1 >= totalPages!}
          onClick={() => setPage((value) => value + 1)}>下一页</Button>
      </footer>}
    </Panel>
    {terminateTarget && <Dialog title="强制用户下线" eyebrow="高风险会话操作"
      description={`将吊销 ${terminateTarget.username} 的全部当前客户端会话，并断开所有服务实例上的实时连接。`}
      onClose={() => { if (!termination.isPending) setTerminateTarget(null) }}>
      <form className="presence-termination-form" onSubmit={(event) => {
        event.preventDefault()
        if (canConfirmTermination && terminationReason.trim().length >= 2) termination.mutate({
          userId: terminateTarget.userId, reason: terminationReason.trim(),
        })
      }}>
        {!canConfirmTermination && <Alert duration={null}>在线名单或权限待核实，暂不能执行下线。</Alert>}
        <label><span>下线原因</span><textarea required minLength={2} maxLength={200} rows={4}
          value={terminationReason} onChange={(event) => setTerminationReason(event.target.value)}
          placeholder="例如：账号疑似异常登录，需要重新认证" /></label>
        <p>操作会写入审计日志；用户仍可在确认安全后重新登录。</p>
        <footer><Button type="button" variant="secondary" disabled={termination.isPending}
          onClick={() => setTerminateTarget(null)}>取消</Button>
          <Button type="submit" variant="danger" busy={termination.isPending}
            disabled={!canConfirmTermination || terminationReason.trim().length < 2}>确认下线</Button></footer>
      </form>
    </Dialog>}
  </>
}

function PresenceTrendChart({ points }: { points: PresenceTrendPoint[] }) {
  if (!points.length) return <EmptyState icon="residents" title="暂无趋势数据"
    copy="仅显示服务端已记录的采样；缺失区间不按零人数补齐。" />
  const width = 760; const height = 190; const paddingX = 28; const paddingY = 20
  const maximum = Math.max(1, ...points.flatMap((point) => [point.onlineUsers, point.activeUsers]))
  const firstTime = Date.parse(points[0].bucketAt)
  const duration = Math.max(1, Date.parse(points.at(-1)!.bucketAt) - firstTime)
  const coordinates = (selector: (point: PresenceTrendPoint) => number) => points.map((point) => {
    const x = paddingX + (Date.parse(point.bucketAt) - firstTime) * (width - 2 * paddingX) / duration
    const y = height - paddingY - selector(point) / maximum * (height - 2 * paddingY)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const peak = Math.max(...points.map((point) => point.onlineUsers))
  const latest = points.at(-1)!
  return <div className="presence-trend-chart">
    <div className="presence-trend-chart__legend">
      <span><i className="is-online" />在线用户</span><span><i className="is-active" />活跃用户</span>
      <small>按实际采样时间绘制；连线不代表缺失区间的实测值。</small>
      <strong>峰值 {peak} 人 · 最近采样 {latest.onlineUsers} 人</strong>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`在线用户峰值 ${peak} 人`}>
      {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={paddingX} x2={width - paddingX}
        y1={paddingY + ratio * (height - 2 * paddingY)} y2={paddingY + ratio * (height - 2 * paddingY)} />)}
      <polyline className="is-online" points={coordinates((point) => point.onlineUsers)} />
      <polyline className="is-active" points={coordinates((point) => point.activeUsers)} />
    </svg>
    <footer><time>{formatTime(points[0].bucketAt)}</time><time>{formatTime(latest.bucketAt)}</time></footer>
  </div>
}
