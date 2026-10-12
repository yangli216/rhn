import { useState } from 'react'
import { observationScope } from '../../shared/api/observationScope'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, DataTable, DateRangePicker, Dialog, FormField, LoadingState, Pagination, Select, TableShell } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { decisionComparisons, decisionModes, decisionOutcomes, decisionScenes, decisionVerdicts, labelOf, observationDates, observationRange, observationTime } from '../../shared/presentation/decisionObservation'
import './decision-run-observation.css'

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
export function DecisionRunObservation({ api, onClose }: { api: RhnApi; onClose: () => void }) {
  const scopeKey = observationScope(api)
  const [dates, setDates] = useState(() => observationRange())
  const [scene, setScene] = useState(''), [mode, setMode] = useState(''), [outcome, setOutcome] = useState('')
  const [filter, setFilter] = useState(() => ({ ...observationDates(dates.from, dates.to), scene: '', mode: '', outcome: '', page: 0 }))
  const [selected, setSelected] = useState<string>()
  const query = useQuery({ queryKey: ['decision-observations', scopeKey, filter], queryFn: () => api.decisionObservations.list(filter), retry: false })
  const data = query.isError ? undefined : query.data
  const stats = data?.statistics
  const valid = Boolean(dates.from && dates.to && dates.from <= dates.to)
  return <Dialog title="决策运行观察" size="xwide" onClose={onClose}>
    <div className="decision-observation">
      <WorkspacePane label="决策运行记录" scroll="content" header={<div className="decision-observation__header">
        <div className="decision-observation__filters ui-query-filters">
          <FormField label="决策场景" className="decision-observation__filter-field--scene">
            <Select aria-label="决策场景" value={scene} onChange={setScene} options={options(decisionScenes)} placeholder="全部场景" />
          </FormField>
          <FormField label="运行模式" className="decision-observation__filter-field--mode">
            <Select aria-label="运行模式" value={mode} onChange={setMode} options={options(decisionModes)} placeholder="全部模式" />
          </FormField>
          <FormField label="运行结果" className="decision-observation__filter-field--outcome">
            <Select aria-label="运行结果" value={outcome} onChange={setOutcome} options={options(decisionOutcomes).filter(v => !['NOT_TRIGGERED', 'RECORDED'].includes(v.value))} placeholder="全部结果" />
          </FormField>
          <FormField label="日期范围" className="decision-observation__filter-field--date">
            <DateRangePicker value={dates} onChange={setDates} />
          </FormField>
          <div className="ui-query-filters__actions">
            <Button disabled={!valid || query.isFetching} onClick={() => {
              setFilter({ scene, mode, outcome, ...observationDates(dates.from, dates.to), page: 0 })
              setSelected(undefined)
            }}>查询</Button>
            <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>刷新</Button>
          </div>
        </div>
        {query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}
        {data && <>
          <div className="decision-observation__meta-bar">
            <span className="decision-observation__scope-badge">
              机构 <strong>{data.organizationId}</strong> · 科室 <strong>{data.departmentId}</strong>
            </span>
            <span className="decision-observation__version-tag">{data.auditVersion}</span>
            <span className="decision-observation__note">
              （统计按调用次数计算，原流程需人工核对的样本不计入一致率）
            </span>
          </div>
          {data.scenes && data.scenes.length > 0 && (
            <div className="decision-observation__scenes">
              {data.scenes.map(s => {
                const isInactive = s.state === 'NOT_TRIGGERED' || s.state === 'SCENE_DISABLED'
                return (
                  <div key={s.scene} className={`decision-observation__scene-chip ${isInactive ? 'is-muted' : 'is-active'}`}>
                    <span className="chip-name">{s.label}</span>
                    <span className="chip-mode">{labelOf(decisionModes, s.mode)}</span>
                    <span className="chip-state">{labelOf(decisionOutcomes, s.state)}</span>
                    {s.lastTriggeredAt && <span className="chip-time">最近: {observationTime(s.lastTriggeredAt)}</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="decision-observation__stats-grid">
            <div className="decision-observation__stat-card">
              <span className="stat-label">总尝试</span>
              <span className="stat-value">{stats?.total ?? 0}</span>
            </div>
            <div className="decision-observation__stat-card">
              <span className="stat-label">基线一致</span>
              <span className="stat-value">
                {stats?.equal ?? 0} <span className="stat-total">/ {stats?.comparable ?? 0}</span>
              </span>
              <span className="stat-sub">非临床正确率</span>
            </div>
            <div className="decision-observation__stat-card">
              <span className="stat-label">人工研判</span>
              <span className="stat-value">已研判 {stats?.reviewed ?? 0}</span>
              <span className="stat-sub">待研判 {(stats?.total ?? 0) - (stats?.reviewed ?? 0)}</span>
            </div>
            <div className="decision-observation__stat-card">
              <span className="stat-label">模型调用</span>
              <span className="stat-value">{stats?.modelCalls ?? 0}</span>
              <span className="stat-sub">有效 {stats?.judged ?? 0} · 不确定 {stats?.uncertain ?? 0}</span>
            </div>
            <div className="decision-observation__stat-card">
              <span className="stat-label">平均耗时</span>
              <span className="stat-value">
                {stats?.averageLatencyMs == null ? '—' : Math.round(stats.averageLatencyMs)} <small>ms</small>
              </span>
              <span className="stat-sub">P95 {stats?.p95LatencyMs ?? '—'} ms</span>
            </div>
          </div>
        </>}
      </div>}>
        <TableShell scrollLabel="决策运行结果" resetScrollKey={JSON.stringify(filter)} footer={<Pagination page={filter.page}
          totalPages={Math.max(1, data?.records?.totalPages ?? 1)} total={Number(data?.records?.totalElements ?? 0)} pageSize={20}
          onChange={page => setFilter(v => ({ ...v, page }))} label="决策运行分页" />}>
          {query.isPending ? <LoadingState label="正在读取运行记录…" /> : data && <DataTable aria-label="决策运行记录">
            <thead><tr><th>时间／场景</th><th>模式／结果</th><th>模型／耗时</th><th>基线比较</th><th>人工研判</th><th>操作</th></tr></thead>
            <tbody>{data.records?.content?.map(r => <tr key={r.id}>
              <td>{observationTime(r.time)}<br />{labelOf(decisionScenes, r.scene)}</td>
              <td>{labelOf(decisionModes, r.mode)}<br />{labelOf(decisionOutcomes, r.outcome)}{r.uncertain && <p>存在不确定／无匹配判断</p>}</td>
              <td>{r.modelCalled ? r.model || '模型名称未返回' : '未调用模型'}<br />{r.latencyMs ?? '—'} ms</td>
              <td>{r.comparison === 'COMPARABLE' ? r.equal ? '与基线一致' : '与基线不同' : labelOf(decisionComparisons, r.comparison)}</td>
              <td>{r.review ? labelOf(decisionVerdicts, r.review.verdict) : '待研判'}</td>
              <td><Button variant="secondary" size="sm" onClick={() => setSelected(r.id)}>详情与研判</Button></td>
            </tr>)}{!data.records?.content?.length && <tr><td colSpan={6}>当前范围暂无记录。请核对上方场景状态；启用后还需业务触发，不会自动调用模型；若确认已触发但无记录，请核对服务日志中的留痕写入告警。</td></tr>}</tbody>
          </DataTable>}
        </TableShell>
      </WorkspacePane>
    </div>
    {selected && <DecisionRunDetail key={`${scopeKey}-${selected}`} api={api} id={selected} onClose={() => setSelected(undefined)} onReviewed={() => void query.refetch()} />}
  </Dialog>
}

function DecisionRunDetail({ api, id, onClose, onReviewed }: { api: RhnApi; id: string; onClose: () => void; onReviewed: () => void }) {
  const [verdict, setVerdict] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const scopeKey = observationScope(api)
  const query = useQuery({ queryKey: ['decision-run-detail', scopeKey, id], queryFn: () => api.decisionObservations.detail(id), retry: false, gcTime: 0 })
  const detail = query.isError ? undefined : query.data, run = detail?.run
  return <Dialog title="运行详情与人工研判" size="xwide" onClose={busy ? () => {} : onClose} closeOnBackdrop={false}>
    {query.isPending && <LoadingState label="正在读取快照…" />}{query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}
    {run && <>
      <p>{labelOf(decisionScenes, run.scene)} · {labelOf(decisionModes, run.mode)} · {labelOf(decisionOutcomes, run.outcome)} · {observationTime(run.time)}</p>
      <p>模型 {run.model || '未调用'} · 版本 {run.version} · 阈值 {run.threshold ?? '—'} · 耗时 {run.latencyMs ?? '—'} ms</p>
      <p>追踪 {run.traceId || '—'} · 关联 {run.correlationId || '—'} · 输入指纹 {run.inputHash || '未形成模型输入'}</p>
      <p>比较依据：{labelOf(decisionComparisons, run.comparison)}；模型选择 {run.selected?.join('、') || '无可确认选择'}；规则选择 {run.baseline?.join('、') || '需人工核对'}</p>
      {run.exceptionType && <Alert tone="warning">异常类型：{run.exceptionType}；业务继续原流程。</Alert>}
      <div className="decision-observation__snapshots">
        <details><summary>输入与候选快照（核对资料使用）</summary><pre>{JSON.stringify(run.input, null, 2) || '本次未形成模型输入'}</pre></details>
        <details><summary>模型判断与概率分布</summary><pre>{JSON.stringify(run.answers, null, 2) || '本次没有可用模型判断'}</pre></details>
      </div>
      <Alert>人工研判只记录意见，不修改分诊、处方或模型配置。概率和一致性均不代表临床正确率。</Alert>
      <div className="decision-observation__review">
        <FormField label="研判结果"><Select aria-label="研判结果" value={verdict} onChange={setVerdict} options={options(decisionVerdicts)} disabled={busy} /></FormField>
        <FormField label="研判原因"><textarea aria-label="研判原因" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} rows={3} disabled={busy} /></FormField>
        <Button disabled={!verdict || !reason.trim() || busy} busy={busy} onClick={async () => {
          setBusy(true); setError('')
          try { await api.decisionObservations.review(id, verdict, reason.trim()); setReason(''); await query.refetch(); onReviewed() }
          catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
        }}>记录研判</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <h3>研判历史</h3>{detail?.reviews?.map(r => <p key={r.id}>{observationTime(r.time)} · {r.actor} · {labelOf(decisionVerdicts, r.verdict)}：{r.reason}</p>)}
    </>}
  </Dialog>
}
