import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Icon, LoadingState, Panel, PanelHead, StatusBadge, type StatusTone } from '../../shared/ui'

export function Dashboard({ api, onStart, onOpenTasks }: {
  api: RhnApi
  onStart: () => void
  onOpenTasks: () => void
}) {
  const summary = useQuery({ queryKey: ['portal-summary'], queryFn: api.portal.summary, refetchInterval: 60_000 })

  return (
    <>
      <section className="welcome-row">
        <div>
          <span className="ui-eyebrow">个人工作门户</span>
          <h1>下午好，开始今天的连续照护</h1>
          <p>任务、消息和业务指标均按当前机构与科室工作上下文汇总。</p>
        </div>
        <Button onClick={onStart}><Icon name="add" />办理门诊挂号</Button>
      </section>

      {summary.isPending && <LoadingState label="正在汇总工作台数据…" />}
      {summary.error && <Alert>{errorMessage(summary.error)}</Alert>}
      {summary.data && <>
        <section className="metric-grid" aria-label="今日业务摘要">
          <MetricCard tone="teal" icon="人" label="活跃居民" value={summary.data.activeResidents} detail="统一居民主索引" />
          <MetricCard tone="blue" icon="诊" label="今日挂号" value={summary.data.registeredToday} detail={`接诊中 ${summary.data.inProgress}`} />
          <MetricCard tone="amber" icon="事" label="待办任务" value={summary.data.tasks.totalOpen}
            detail={summary.data.tasks.overdue > 0 ? `其中逾期 ${summary.data.tasks.overdue}` : '当前无逾期任务'} onClick={onOpenTasks} />
          <MetricCard tone="violet" icon="档" label="未读消息" value={summary.data.notifications.unread}
            detail={`今日完成接诊 ${summary.data.completedToday}`} />
        </section>

        <section className="dashboard-grid">
          <Panel className="journey-panel">
            <PanelHead title="今日工作队列" meta={`${summary.data.tasks.totalOpen} 项待处理`} />
            <div className="journey">
              {[
                ['待认领', String(summary.data.tasks.ready)],
                ['处理中', String(summary.data.tasks.inProgress)],
                ['已逾期', String(summary.data.tasks.overdue)],
                ['未读消息', String(summary.data.notifications.unread)],
              ].map(([label, detail], index) => (
                <button className="journey-step dashboard-action-step" key={label} type="button" onClick={onOpenTasks}>
                  <span>{index + 1}</span><div><strong>{label}</strong><small>{detail} 项</small></div>
                  <Icon name="chevron-right" />
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="roadmap-panel">
            <PanelHead title="基础能力状态" meta="Foundation 1.2" />
            <div className="foundation-checklist">
              <StatusBadge tone="success">受信工作上下文</StatusBadge>
              <StatusBadge tone="success">可靠事件与幂等</StatusBadge>
              <StatusBadge tone="success">任务与站内通知</StatusBadge>
              <StatusBadge tone="success">门户聚合读模型</StatusBadge>
            </div>
            <div className="roadmap-copy"><strong>工作门户底座已接入</strong><p>主页数据来自服务端聚合，不再使用静态演示指标。</p></div>
          </Panel>
        </section>
      </>}

      <Panel className="capability-panel">
        <PanelHead title="基础能力地图" meta="按县域设计 · 按工作上下文隔离" />
        <div className="capabilities">
          <Capability name="身份与权限" items="任职 · 角色 · 数据范围" state="active" />
          <Capability name="可靠事件" items="Outbox · 重试 · 消费幂等" state="active" />
          <Capability name="工作协同" items="任务 · 通知 · 聚合" state="active" />
          <Capability name="共享健康内核" items="MPI · 文档 · 时间轴" state="active" />
          <Capability name="后续业务" items="处方 · 费用 · 照护" state="planned" />
        </div>
      </Panel>
    </>
  )
}

function MetricCard({ tone, icon, label, value, detail, onClick }: {
  tone: string
  icon: string
  label: string
  value: string | number
  detail: string
  onClick?: () => void
}) {
  const content = <><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></>
  return onClick
    ? <button type="button" className="metric-card metric-card--action" onClick={onClick}>{content}</button>
    : <div className="metric-card">{content}</div>
}

function Capability({ name, items, state }: { name: string; items: string; state: string }) {
  const labels: Record<string, string> = { active: '已贯通', building: '建设中', next: '下一阶段', planned: '待迭代' }
  const tones: Record<string, StatusTone> = { active: 'success', building: 'info', next: 'warning', planned: 'neutral' }
  return <div className={`capability ${state}`}><i /><strong>{name}</strong><span>{items}</span>
    <StatusBadge tone={tones[state]}>{labels[state]}</StatusBadge></div>
}
