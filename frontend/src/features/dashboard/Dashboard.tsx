import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Icon, type IconName, LoadingState, Panel, PanelHead, StatusBadge, type StatusTone } from '../../shared/ui'

function greetingTime(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function Dashboard({ api, onStart, onOpenTasks, onNavigate }: {
  api: RhnApi
  onStart: () => void
  onOpenTasks: () => void
  onNavigate?: (path: string) => void
}) {
  const summary = useQuery({ queryKey: ['portal-summary'], queryFn: api.portal.summary, refetchInterval: 60_000 })
  const todayText = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="dashboard-container">
      <section className="welcome-banner">
        <div className="welcome-banner__left">
          <div className="welcome-banner__meta">
            <span className="ui-eyebrow">个人工作门户</span>
            <span className="welcome-banner__divider" />
            <span className="welcome-banner__date">{todayText}</span>
          </div>
          <h1 className="welcome-banner__title">{greetingTime()}，开始今天的连续照护</h1>
          <p className="welcome-banner__desc">聚合全科门诊、住院病区、待办任务与危急值提醒，守护居民健康生命周期。</p>
        </div>

        {summary.data && (
          <div className="welcome-banner__quick-stats">
            <div className="welcome-banner__stat-pill">
              <span className="welcome-banner__stat-dot is-online" />
              <span>接诊中 <strong>{summary.data.inProgress}</strong> 人</span>
            </div>
            <div className="welcome-banner__stat-pill">
              <span className={`welcome-banner__stat-dot ${summary.data.tasks.overdue > 0 ? 'is-warning' : 'is-normal'}`} />
              <span>待处理 <strong>{summary.data.tasks.totalOpen}</strong> 项</span>
            </div>
          </div>
        )}

        <div className="welcome-banner__actions">
          <Button variant="primary" onClick={onStart}><Icon name="add" />办理门诊挂号</Button>
          <Button variant="secondary" onClick={onOpenTasks}><Icon name="tasks" />查看待办任务</Button>
        </div>
      </section>

      {summary.isPending && <LoadingState label="正在汇总工作台数据…" />}
      {summary.error && <Alert>{errorMessage(summary.error)}</Alert>}
      {summary.data && <>
        <section className="metric-grid" aria-label="今日业务摘要">
          <MetricCard tone="teal" icon="residents" label="活跃居民" value={summary.data.activeResidents} detail="统一居民主索引建档" />
          <MetricCard tone="blue" icon="clinical" label="今日挂号" value={summary.data.registeredToday} detail={`正在接诊 ${summary.data.inProgress} 人`} />
          <MetricCard tone="amber" icon="tasks" label="待办任务" value={summary.data.tasks.totalOpen}
            detail={summary.data.tasks.overdue > 0 ? `其中逾期 ${summary.data.tasks.overdue} 项` : '当前暂无逾期任务'}
            isUrgent={summary.data.tasks.overdue > 0}
            onClick={onOpenTasks} />
          <MetricCard tone="violet" icon="notification" label="未读消息" value={summary.data.notifications.unread}
            detail={`今日累计完成接诊 ${summary.data.completedToday} 人`} onClick={onOpenTasks} />
        </section>

        <section className="dashboard-grid">
          <Panel className="journey-panel">
            <PanelHead title="今日工作队列" meta={`${summary.data.tasks.totalOpen} 项待处理`} />
            <div className="journey-grid">
              <button className="journey-card" type="button" onClick={onOpenTasks}>
                <div className="journey-card__header">
                  <span className="journey-card__tag">待认领工单</span>
                  <Icon name="chevron-right" />
                </div>
                <div className="journey-card__value">{summary.data.tasks.ready} <small>项</small></div>
                <div className="journey-card__desc">等待分派或认领处置</div>
              </button>

              <button className="journey-card is-active" type="button" onClick={onOpenTasks}>
                <div className="journey-card__header">
                  <span className="journey-card__tag">正在处理中</span>
                  <Icon name="chevron-right" />
                </div>
                <div className="journey-card__value">{summary.data.tasks.inProgress} <small>项</small></div>
                <div className="journey-card__desc">当前正在推进跟进</div>
              </button>

              <button className={`journey-card ${summary.data.tasks.overdue > 0 ? 'is-overdue' : ''}`} type="button" onClick={onOpenTasks}>
                <div className="journey-card__header">
                  <span className="journey-card__tag">已逾期任务</span>
                  <Icon name="chevron-right" />
                </div>
                <div className="journey-card__value">{summary.data.tasks.overdue} <small>项</small></div>
                <div className="journey-card__desc">{summary.data.tasks.overdue > 0 ? '需优先紧急处理' : '无逾期滞留任务'}</div>
              </button>

              <button className="journey-card" type="button" onClick={onOpenTasks}>
                <div className="journey-card__header">
                  <span className="journey-card__tag">未读通知消息</span>
                  <Icon name="chevron-right" />
                </div>
                <div className="journey-card__value">{summary.data.notifications.unread} <small>条</small></div>
                <div className="journey-card__desc">危急值与业务提醒</div>
              </button>
            </div>
          </Panel>

          <Panel className="roadmap-panel">
            <PanelHead title="核心系统底座状态" meta="Active v1.2" />
            <div className="foundation-checklist">
              <StatusBadge tone="success">受信工作上下文</StatusBadge>
              <StatusBadge tone="success">可靠事件与幂等</StatusBadge>
              <StatusBadge tone="success">实时任务通知</StatusBadge>
              <StatusBadge tone="success">读模型动态聚合</StatusBadge>
            </div>
            <div className="roadmap-card">
              <div className="roadmap-card__icon"><Icon name="sparkles" /></div>
              <div>
                <strong>全域工作门户底座已贯通</strong>
                <p>实时聚合各科室数据，支持主色调即时切换与全链路闭环照护。</p>
              </div>
            </div>
          </Panel>
        </section>
      </>}

      <Panel className="capability-panel">
        <PanelHead title="临床业务直通车与连续照护地图" meta="全县域一体化 · 临床全链路实时互通" />
        <div className="capabilities">
          <QuickAccessCard
            icon="clinical"
            name="门诊全科工作站"
            desc="排班挂号 · 医生接诊 · 病历处方"
            status="已贯通"
            onClick={() => onNavigate?.('/outpatient/doctor') ?? onStart()}
          />
          <QuickAccessCard
            icon="residents"
            name="住院病区工作站"
            desc="床位看板 · 医嘱流转 · 护理记录"
            status="已贯通"
            onClick={() => onNavigate?.('/inpatient/doctor')}
          />
          <QuickAccessCard
            icon="pharmacy"
            name="药房调配与库存"
            desc="门诊发药 · 病区退药 · 进销存盘点"
            status="已贯通"
            onClick={() => onNavigate?.('/pharmacy')}
          />
          <QuickAccessCard
            icon="user"
            name="居民健康档案"
            desc="主索引 MPI · 慢病随访 · 连续时间轴"
            status="已贯通"
            onClick={() => onNavigate?.('/residents')}
          />
          <QuickAccessCard
            icon="billing"
            name="结算与预交金"
            desc="自费医保 · 预交金充值 · 出院结算"
            status="已贯通"
            onClick={() => onNavigate?.('/billing')}
          />
        </div>
      </Panel>
    </div>
  )
}

function MetricCard({ tone, icon, label, value, detail, isUrgent, onClick }: {
  tone: string
  icon: IconName
  label: string
  value: string | number
  detail: string
  isUrgent?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className={`metric-icon is-${tone}`}>
        <Icon name={icon} />
      </div>
      <div className="metric-info">
        <div className="metric-info__label-row">
          <span>{label}</span>
          {isUrgent && <span className="metric-info__urgent-dot" />}
        </div>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </>
  )
  return onClick
    ? <button type="button" className={`metric-card metric-card--action ${isUrgent ? 'is-urgent' : ''}`} onClick={onClick}>{content}</button>
    : <div className="metric-card">{content}</div>
}

function QuickAccessCard({
  icon,
  name,
  desc,
  status,
  onClick,
}: {
  icon: IconName
  name: string
  desc: string
  status: string
  onClick?: () => void
}) {
  return (
    <button type="button" className="quick-access-card" onClick={onClick}>
      <div className="quick-access-card__head">
        <div className="quick-access-card__icon">
          <Icon name={icon} />
        </div>
        <div className="quick-access-card__badge">
          <span className="quick-access-card__dot" />
          <span>{status}</span>
        </div>
      </div>
      <div className="quick-access-card__body">
        <strong>{name}</strong>
        <p>{desc}</p>
      </div>
      <div className="quick-access-card__foot">
        <span className="quick-access-card__link">进入工作站</span>
        <Icon name="chevron-right" />
      </div>
    </button>
  )
}
