import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeRuleCandidate } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination, StatusBadge } from '../../shared/ui'
import { MedicationKnowledgeFeedbackDialog, feedbackVerdicts } from './MedicationKnowledgeFeedbackDialog'
import './medication-knowledge-deployment.css'

const outcomes: Record<string, string> = { MATCH: '命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '不可评价' }
const actions: Record<string, string> = { WARN: '提醒核对', REQUIRE_OVERRIDE: '需填写理由后继续', BLOCK: '阻止提交' }
export function MedicationKnowledgeDeploymentDialog({ api, candidate, onClose }: { api: RhnApi; candidate: KnowledgeRuleCandidate; onClose: () => void }) {
  const instance = useId(), [reason, setReason] = useState(''), [end, setEnd] = useState(''), [selected, setSelected] = useState(''), [page, setPage] = useState(0)
  const [feedbackRun, setFeedbackRun] = useState<{ deploymentId: string; runId: string }>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const preview = useQuery({ queryKey: ['knowledge-deploy', instance, candidate.id], queryFn: () => api.medicationKnowledgeDrafts.deploymentPreview(candidate.id), retry: false, refetchOnWindowFocus: false })
  const current = preview.isError ? undefined : preview.data
  const releases = current?.deployments.filter(d => d.versionId === candidate.id && d.mode === 'SHADOW') ?? []
  const deploymentId = releases.some(d => d.id === selected) ? selected : releases.at(-1)?.id
  const observations = useQuery({ queryKey: ['knowledge-observations', instance, candidate.id, deploymentId, page], queryFn: () => api.medicationKnowledgeDrafts.observations(candidate.id, deploymentId!, page), enabled: !!deploymentId && !!current, retry: false, refetchOnWindowFocus: false })
  const data = observations.isError ? undefined : observations.data
  const command = async (operation: 'DEPLOY' | 'PAUSE', id?: string) => {
    if (!current) return
    setBusy(true); setError(''); setNotice('')
    try {
      const d = await api.medicationKnowledgeDrafts.deploymentCommand(candidate.id, { expectedRevision: current.revision, operation, mode: 'SHADOW', expectedBasisHash: current.approval?.basis.fingerprint, deploymentId: id, effectiveTo: operation === 'DEPLOY' && end ? new Date(end).toISOString() : undefined, reason: reason.trim() })
      setSelected(d.id); setPage(0); setReason(''); setNotice(operation === 'DEPLOY' ? '已启用当前科室旁路。后续处方评价将自动留存观察结果。' : '已暂停该旁路记录。历史观察保留。')
    } catch (e) { setError(errorMessage(e)) }
    finally { await preview.refetch(); setBusy(false) }
  }
  return <Dialog title="知识候选 · 旁路部署与观察" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="knowledge-deployment"><p><strong>{candidate.knowledge.body.title} · 候选 v{candidate.version}</strong></p>
      <Alert>旁路只记录结果，不改变处方提交。正式启用请在统一规则目录的“正式启用与回退”入口核对观察结论、无法评价策略与回退方案。首次范围限定当前机构及科室。</Alert>
      {error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}{preview.error && <Alert tone="error">{errorMessage(preview.error)}</Alert>}
      <div className="knowledge-deployment__layout"><aside><h4>当前科室部署</h4>
        <Button variant="secondary" disabled={busy || preview.isFetching} onClick={() => { void preview.refetch(); if (deploymentId) void observations.refetch() }}>刷新部署与观察</Button>
        {preview.isPending && <p>正在核对批准材料及当前标准…</p>}
        {current && <><p>机构 {current.organizationId} · 科室 {current.departmentId}</p>
          {current.approval && <><p>审核人：{current.approval.actor} · {new Date(current.approval.time).toLocaleString()}</p><p>已审核策略：命中时{actions[current.approval.action ?? '']}；无法评价时{actions[current.approval.unavailableAction ?? '']}。旁路仅记录这些策略，不执行拦截。</p><p>审核意见：{current.approval.assessment}</p><small>批准材料指纹：{current.approval.basis.fingerprint}</small></>}
          {current.gaps.length > 0 && <Alert tone="warning"><strong>新部署待处理项</strong><ul>{current.gaps.map(g => <li key={g}>{g}</li>)}</ul><p>已部署版本继续使用冻结材料；可随时单独暂停。</p></Alert>}
          <fieldset disabled={busy || preview.isFetching}><FormField label="旁路操作原因"><textarea aria-label="旁路操作原因" rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></FormField>
            <FormField label="旁路结束时间（可选）"><input aria-label="旁路结束时间（可选）" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></FormField>
            <Button disabled={!reason.trim() || current.gaps.length > 0} onClick={() => void command('DEPLOY')}>启用当前科室旁路</Button>
            <p>立即生效；相同规则在当前科室原有旁路会被替换。再次启用会生成独立发布记录。</p>
            <h4>该候选发布记录</h4>{!releases.length && <p>尚未部署。</p>}
            {[...releases].reverse().map(d => <section key={d.id} className="knowledge-deployment__release"><StatusBadge tone={d.status === 'ACTIVE' ? 'info' : 'warning'}>{d.status === 'PAUSED' ? '已暂停' : d.status === 'SUPERSEDED' ? '已替换' : d.effectiveTo && new Date(d.effectiveTo).getTime() <= Date.now() ? '已结束' : '旁路中'}</StatusBadge><p>{new Date(d.effectiveFrom).toLocaleString()} 至 {d.effectiveTo ? new Date(d.effectiveTo).toLocaleString() : '长期'}</p><p>{d.reason}</p><div className="knowledge-deployment__buttons"><Button variant="secondary" onClick={() => { setSelected(d.id); setPage(0) }}>{deploymentId === d.id ? '当前观察记录' : '查看观察'}</Button>{d.status === 'ACTIVE' && <Button variant="secondary" disabled={!reason.trim()} onClick={() => void command('PAUSE', d.id)}>暂停此旁路</Button>}</div></section>)}
          </fieldset>
        </>}
      </aside><section className="knowledge-deployment__observations"><h4>该发布记录在当前科室的观察</h4><p>按评价次数统计；同一处方反复评价会分别记录。未命中不等于用药安全，不可评价单独统计。</p>
        {!deploymentId && <p>启用旁路后，在此查看处方评价自动产生的结果。</p>}{observations.isFetching && deploymentId && <p>正在读取观察…</p>}{observations.error && <Alert tone="error">{errorMessage(observations.error)}</Alert>}
        {data && <><div className="knowledge-deployment__counts">{Object.entries(outcomes).map(([key, label]) => <div key={key}><span>{label}</span><strong>{data.counts[key] ?? 0}</strong></div>)}</div>
          {data.feedback && <section className="knowledge-deployment__feedback"><strong>人工研判：已记录 {data.feedback.recorded} 次观察，待研判 {data.feedback.pending} 次观察</strong><p>每次观察只按最新有效意见计数，撤回后回到待研判。同一处方可有多次观察；这些数量不能当作临床准确率。</p><div className="knowledge-deployment__feedback-counts">{Object.entries(feedbackVerdicts).map(([key, label]) => <span key={key}>{label} {data.feedback?.verdicts[key] ?? 0}</span>)}</div></section>}
          {!data.records.content.length && <p>该发布记录尚无当前科室的观察数据。</p>}
          <table><thead><tr><th>评价时间 / 处方</th><th>结果</th><th>匹配医嘱与原因</th><th>人工研判</th></tr></thead><tbody>{data.records.content.map(r => <tr key={r.id}><td>{new Date(r.time).toLocaleString()}<br />处方 {r.prescriptionId}</td><td>{outcomes[r.outcome] ?? r.outcome}</td><td>{r.matchedOrderIds.length > 0 && <p>医嘱：{r.matchedOrderIds.join('、')}</p>}{r.reasons.join('；')}</td><td><p>{r.feedback?.operation === 'RECORD' ? feedbackVerdicts[r.feedback.verdict ?? ''] : r.feedback ? '已撤回 · 待研判' : '待研判'}</p><Button variant="secondary" size="sm" onClick={() => setFeedbackRun({ deploymentId: r.deploymentId, runId: r.id })}>查看与研判</Button></td></tr>)}</tbody></table>
          <Pagination page={page} totalPages={Math.max(1, data.records.totalPages)} total={data.records.totalElements} pageSize={20} onChange={setPage} label="旁路观察分页" />
        </>}
      </section></div>
    </div>
    {feedbackRun && <MedicationKnowledgeFeedbackDialog api={api} candidateId={candidate.id} deploymentId={feedbackRun.deploymentId} runId={feedbackRun.runId} onClose={() => setFeedbackRun(undefined)} onChanged={() => { void observations.refetch() }} />}
  </Dialog>
}
