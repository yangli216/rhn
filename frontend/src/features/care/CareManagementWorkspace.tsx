import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { HypertensionCandidate } from '../../shared/api/healthPlanningApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, Icon, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'

const statusText: Record<string, string> = {
  READY: '待复核', IN_PROGRESS: '处理中', WAITING_EXTERNAL: '等待外部', COMPLETED: '已完成',
  CANCELLED: '已取消', OVERDUE: '已逾期', ESCALATED: '已升级', PLANNED: '计划中',
}

function priorityTone(priority?: string) {
  if (priority === 'URGENT') return 'danger' as const
  if (priority === 'HIGH') return 'warning' as const
  return 'info' as const
}

function dueText(value: string) {
  const due = new Date(value)
  const now = new Date()
  if (due <= now) return '立即处理'
  const days = Math.max(1, Math.ceil((due.getTime() - now.getTime()) / 86400000))
  return `${days} 天内`
}

export function CareManagementWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const candidates = useQuery({
    queryKey: ['hypertension-candidates', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.healthPlanning.hypertensionCandidates(),
  })
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return candidates.data ?? []
    return candidates.data?.filter((item) => [item.residentName, item.residentId, item.taskCode,
      item.conditionCode].some((field) => field.toLowerCase().includes(value))) ?? []
  }, [candidates.data, query])
  const selectedId = params.get('taskId') ?? ''
  const selected = filtered.find((item) => item.taskId === selectedId)
    ?? candidates.data?.find((item) => item.taskId === selectedId)
    ?? filtered[0]

  useEffect(() => {
    if (!selected || selected.taskId === selectedId) return
    setParams({ taskId: selected.taskId }, { replace: true })
  }, [selected, selectedId, setParams])

  const urgentCount = candidates.data?.filter((item) => item.priority === 'URGENT').length ?? 0
  const dueCount = candidates.data?.filter((item) => new Date(item.dueAt) <= new Date()).length ?? 0

  return <>
    <PageHeader eyebrow="医防一体化 · M4.1" title="高血压候选识别与复查工作台"
      description="从门诊结构化血压形成可审计候选，单次异常只进入复查流程，不自动确诊；规则版本和原始观察结果随任务固化。"
      actions={<Button variant="secondary" onClick={() => void candidates.refetch()}>刷新候选</Button>} />
    {candidates.error && <Alert>{errorMessage(candidates.error)}</Alert>}
    <div className="care-context-bar">
      <div><span>当前责任单元</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong></div>
      <div><span>待复核候选</span><strong>{candidates.data?.length ?? 0}</strong></div>
      <div><span>立即处理</span><strong className={urgentCount ? 'is-urgent' : ''}>{urgentCount}</strong></div>
      <div><span>到期任务</span><strong>{dueCount}</strong></div>
    </div>
    <div className="care-workspace">
      <Panel className="care-queue">
        <header className="care-section-head"><div><h2>候选队列</h2><span>{filtered.length} 条</span></div></header>
        <label className="care-search"><Icon name="search" /><span className="visually-hidden">检索候选</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、居民号或任务编码" /></label>
        {candidates.isPending && <LoadingState label="正在加载候选队列…" />}
        {!candidates.isPending && !filtered.length && <EmptyState icon="clinical" title="暂无高血压疑诊候选"
          copy="成人门诊录入异常血压后，系统会在这里建立带规则证据的复查任务。" />}
        <div className="care-queue-list">{filtered.map((item) => <button type="button" key={item.taskId}
          className={item.taskId === selected?.taskId ? 'is-active' : ''}
          onClick={() => setParams({ taskId: item.taskId })}>
          <div><strong>{item.residentName}</strong><StatusBadge tone={priorityTone(item.priority)}>
            {item.priority === 'URGENT' ? '紧急复测' : '疑诊复查'}</StatusBadge></div>
          <span>{item.evidenceEvents.at(-1)?.resultDescription}</span>
          <small>{statusText[item.status] ?? item.status} · {dueText(item.dueAt)}</small>
        </button>)}</div>
      </Panel>

      <Panel className="care-detail">
        {!selected && !candidates.isPending && <EmptyState icon="clinical" title="请选择候选任务"
          copy="候选详情将展示原始血压、规则阈值、来源就诊和证据哈希。" />}
        {selected && <CandidateDetail candidate={selected} onNavigate={onNavigate} />}
      </Panel>

      <aside className="care-side">
        <Panel className="care-safety-card">
          <span className="care-safety-card__icon"><Icon name="warning" /></span>
          <h2>单次异常不等于确诊</h2>
          <p>普通疑诊候选应在 4 周内完成另外 2 次非同日规范测量。系统只做候选识别，不替代临床诊断。</p>
        </Panel>
        <Panel>
          <header className="care-section-head"><div><h2>本轮闭环</h2><span>M4.1</span></div></header>
          <ol className="care-steps">
            <li className="is-done"><i>1</i><div><strong>结构化血压</strong><span>LOINC 收缩压与舒张压事实</span></div></li>
            <li className="is-done"><i>2</i><div><strong>候选识别</strong><span>规则版本与证据哈希固化</span></div></li>
            <li className="is-current"><i>3</i><div><strong>临床复查</strong><span>任务进入责任科室工作队列</span></div></li>
            <li><i>4</i><div><strong>确认后建计划</strong><span>M4.2 照护目标与随访排程</span></div></li>
          </ol>
        </Panel>
      </aside>
    </div>
  </>
}

function CandidateDetail({ candidate, onNavigate }: { candidate: HypertensionCandidate; onNavigate: (path: string) => void }) {
  const latest = candidate.evidenceEvents.at(-1)
  return <>
    <header className="care-detail-head">
      <div><span className="ui-eyebrow">居民连续照护候选</span><h2>{candidate.residentName}</h2>
        <p>居民 {candidate.residentId} · 就诊 {candidate.encounterId}</p></div>
      <div><StatusBadge tone={priorityTone(candidate.priority)}>{statusText[candidate.status] ?? candidate.status}</StatusBadge>
        <Button onClick={() => onNavigate(`/outpatient/reception?residentId=${candidate.residentId}&encounterId=${candidate.encounterId}`)}>
          进入居民就诊</Button></div>
    </header>
    <div className="care-fact-grid">
      <div><span>候选病情</span><strong>{candidate.conditionName}</strong><code>{candidate.conditionCode}</code></div>
      <div><span>核验状态</span><strong>疑似，待临床确认</strong><code>{candidate.verificationStatus}</code></div>
      <div><span>复查时限</span><strong>{dueText(candidate.dueAt)}</strong><code>{formatTime(candidate.dueAt)}</code></div>
      <div><span>证据次数</span><strong>{candidate.evidenceEvents.length} 次</strong><code>非同日测量方可用于诊断</code></div>
    </div>
    {latest && <section className="care-reading-card">
      <header><div><h3>最近一次诊室血压</h3><span>{formatTime(latest.evidence.measuredAt)}</span></div>
        <StatusBadge tone={priorityTone(candidate.priority)}>{latest.evidence.decision === 'URGENT_RECHECK' ? '显著升高' : '达到候选阈值'}</StatusBadge></header>
      <div className="care-blood-pressure"><div><strong>{latest.evidence.systolic.value}</strong><span>收缩压</span></div>
        <i>/</i><div><strong>{latest.evidence.diastolic.value}</strong><span>舒张压</span></div><em>{latest.evidence.systolic.unit}</em></div>
      <div className="care-threshold-row"><span>候选阈值 ≥ {latest.evidence.thresholds.systolic}/{latest.evidence.thresholds.diastolic}</span>
        <span>显著升高 ≥ {latest.evidence.thresholds.severeSystolic}/{latest.evidence.thresholds.severeDiastolic}</span></div>
    </section>}
    <section className="care-evidence-section"><header><div><h3>识别证据轨迹</h3><span>追加保存，不覆盖历史判断</span></div></header>
      <div className="care-evidence-table-wrap"><table className="care-evidence-table"><thead><tr>
        <th>测量时间</th><th>血压</th><th>识别结果</th><th>规则版本</th><th>证据摘要</th>
      </tr></thead><tbody>{candidate.evidenceEvents.map((event) => <tr key={event.id}>
        <td>{formatTime(event.evidence.measuredAt)}</td>
        <td><strong>{event.evidence.systolic.value}/{event.evidence.diastolic.value}</strong> {event.evidence.systolic.unit}</td>
        <td>{event.evidence.decision === 'URGENT_RECHECK' ? '立即复测评估' : '疑诊候选'}</td>
        <td><code>{event.ruleVersion}</code><span>{event.ruleCode}</span></td>
        <td><code title={event.evidenceHash}>{event.evidenceHash.slice(0, 12)}…</code></td>
      </tr>)}</tbody></table></div>
    </section>
  </>
}
