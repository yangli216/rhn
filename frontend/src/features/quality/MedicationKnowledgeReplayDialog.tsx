import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeReplayRun, KnowledgeVersion } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, Pagination, StatusBadge, TableShell } from '../../shared/ui'
import './medication-knowledge-replay.css'

const outcomes: Record<string, string> = { MATCH: '草稿条件命中', NO_MATCH: '未命中此草稿', NOT_APPLICABLE: '不在适用范围', UNAVAILABLE: '不可评价' }
const states: Record<string, string> = { DRAFT: '草稿', ACTIVE: '有效', CANCELLED: '已取消', STOPPED: '已停止' }
export function MedicationKnowledgeReplayDialog({ api, knowledge, onClose }: { api: RhnApi; knowledge: KnowledgeVersion; onClose: () => void }) {
  const instance = useId(), [page, setPage] = useState(0), [historyPage, setHistoryPage] = useState(0)
  const [selected, setSelected] = useState(''), [run, setRun] = useState<KnowledgeReplayRun>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const sources = useQuery({ queryKey: ['knowledge-replay-sources', instance, page], queryFn: () => api.medicationKnowledgeDrafts.replaySources(page) })
  const history = useQuery({ queryKey: ['knowledge-replays', instance, knowledge.id, historyPage], queryFn: () => api.medicationKnowledgeDrafts.replays(knowledge.id, historyPage) })
  const task = async (fn: () => Promise<KnowledgeReplayRun>, created = false) => {
    setBusy(true); setError(''); setRun(undefined)
    try { setRun(await fn()); if (created) { if (historyPage === 0) await history.refetch(); else setHistoryPage(0) } }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const changePage = (next: number) => { if (!busy) { setPage(next); setSelected(''); setRun(undefined); setError('') } }
  return <Dialog title="知识草稿 · 历史处方回放" size="xwide" enterNavigation={false} onClose={onClose}>
    <div className="knowledge-replay"><p><strong>{knowledge.body.title} · 已保存第 {knowledge.version} 版</strong>。使用原用药审查保存的处方输入，不重新读取当前药品或患者资料；不调用 AI，不改变处方和规则发布状态。</p>
      <Alert>回放验证草稿逻辑与数据适配，不代表药学审核通过；未命中不代表用药安全，也不计入正式规则的旁路观察。</Alert>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="knowledge-replay__layout"><aside className="knowledge-replay__queue"><h4>选择原审查记录</h4><p>仅当前工作机构／科室；同一处方的不同审查记录代表不同冻结输入。</p>
        {sources.error && <Alert tone="error">{errorMessage(sources.error)}</Alert>}{sources.isPending && <p>读取原审查记录…</p>}
        {!sources.isError && sources.data?.content.map(s => <button key={s.evaluationId} type="button" disabled={busy} className={selected === s.evaluationId ? 'is-selected' : ''} onClick={() => { setSelected(s.evaluationId); setRun(undefined); setError('') }}>
          <strong>处方 {s.prescriptionId} · 版本 {s.prescriptionRevision}</strong><small>审查记录 {s.evaluationId}</small><small>{s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleString() : '原审查时间未知'} · {s.originalMode === 'SHADOW' ? '旁路' : s.originalMode === 'ENFORCED' ? '正式' : s.originalMode}</small>
        </button>)}
        {!sources.isError && sources.data && !sources.data.content.length && <p>当前范围暂无原审查快照。请先在正常门诊流程中完成用药审查；不以合成事实代替历史处方。</p>}
        {sources.data && <Pagination page={page} totalPages={Math.max(1, sources.data.totalPages)} total={sources.data.totalElements} pageSize={20} onChange={changePage} label="原审查记录分页" />}
        <div className="knowledge-replay__actions"><Button variant="secondary" disabled={busy || sources.isFetching} onClick={() => { setSelected(''); setRun(undefined); void sources.refetch() }}>刷新原记录</Button><Button disabled={busy || !selected || sources.isError} onClick={() => { void task(() => api.medicationKnowledgeDrafts.replay(knowledge.id, knowledge.version, selected), true) }}>{busy ? '处理中…' : '执行并保存回放'}</Button></div>
        <h4>已保存回放 · 全部知识版本</h4>{history.error && <Alert tone="error">{errorMessage(history.error)}</Alert>}
        {!history.isError && history.data?.content.map(h => <button type="button" key={h.id} disabled={busy} onClick={() => { setSelected(''); void task(() => api.medicationKnowledgeDrafts.replayDetail(knowledge.id, h.id)) }}><strong>知识第 {h.knowledgeVersion} 版 · {outcomes[h.outcome]}</strong><small>原审查 {h.evaluationId} · {h.actor}</small><small>{new Date(h.createdAt).toLocaleString()}</small></button>)}
        {history.data && <Pagination page={historyPage} totalPages={Math.max(1, history.data.totalPages)} total={history.data.totalElements} pageSize={20} onChange={p => { if (!busy) setHistoryPage(p) }} label="知识回放历史分页" />}
      </aside><section className="knowledge-replay__result"><h4>冻结输入与回放结果</h4>
        {!run && <p>选择原审查记录后执行回放，或查看已有回放。草稿有未保存修改时，请先保存新版本。</p>}
        {run && <><div className="knowledge-replay__actions"><StatusBadge tone={run.result.outcome === 'UNAVAILABLE' ? 'warning' : 'info'}>{outcomes[run.result.outcome] || run.result.outcome}</StatusBadge><span>知识第 {run.knowledge.version} 版 · 回放 {run.id}</span></div>
          <ul>{run.result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p>原审查 {run.source.evaluationId} · 处方 {run.source.prescriptionId} · 就诊 {run.source.encounterId} · 处方版本 {run.source.prescriptionRevision}</p>
          <p>原机构 {run.source.organizationId} / 科室 {run.source.departmentId}。年龄：{run.input.facts.age ?? '未知'} 岁；评价日期：{run.input.facts.date || '未知'}。</p><p>{run.input.dateBasis}。旧快照只保存周岁，不能转换为精确月龄或日龄。</p>
          {run.currentKnowledgeIssues.length > 0 && <Alert tone="warning">执行回放时发现当前知识依赖有变化或缺口；本结果使用当时保存的知识版本，不能用于直接发布。{run.currentKnowledgeIssues.map(i => i.message).join('；')}</Alert>}
          <TableShell><table><thead><tr><th>医嘱与原状态</th><th>冻结标准身份</th><th>途径与缺口</th></tr></thead><tbody>{run.input.items.map(item => <tr key={item.orderId}>
            <td><strong>{item.medicationName}</strong><small>{item.orderId} · {states[item.originalStatus] || item.originalStatus}</small>{run.result.matchedOrderIds.includes(item.orderId) && <StatusBadge tone="warning">参与命中</StatusBadge>}</td>
            <td>{item.fact.entryId || '标准条目缺失'}<small>{item.fact.specificationId || '规格身份缺失'}</small><small>{item.fact.catalogId} · {item.fact.catalogVersion}</small></td>
            <td>{item.route?.code || '途径未知'}<small>{item.route?.system} · {item.route?.version}</small>{item.gaps.map((g, i) => <p key={i}>{g}</p>)}</td>
          </tr>)}</tbody></table></TableShell>
          <details><summary>知识依据与回放指纹</summary><p>{run.knowledge.body.evidence?.title} · {run.knowledge.body.evidence?.edition} · {run.knowledge.body.evidence?.locator}</p><blockquote>{run.knowledge.body.evidence?.excerpt}</blockquote><small>知识指纹：{run.knowledgeHash}</small><small>原评价输入指纹：{run.source.inputHash}</small><small>本次适配输入指纹：{run.inputHash}</small><small>引擎：{run.engineVersion} · {run.actor} · {new Date(run.createdAt).toLocaleString()}</small></details>
        </>}
      </section></div>
    </div>
  </Dialog>
}
