import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeReviewEvent, KnowledgeRuleCandidate } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination, Select, StatusBadge } from '../../shared/ui'
import { MedicationKnowledgeRuleView } from './MedicationKnowledgeRuleView'
import './medication-knowledge-review.css'

const operations: Record<string, string> = { SUBMIT: '提交审核', APPROVE: '审核通过', REJECT: '退回修改', WITHDRAW: '撤回提交' }
const states: Record<string, string> = { DRAFT: '草稿', IN_REVIEW: '待审核', APPROVED: '审核通过', REJECTED: '已退回', RETIRED: '已废止' }
const actions: Record<string, string> = { WARN: '提醒核对', REQUIRE_OVERRIDE: '需填写理由后继续', BLOCK: '阻止提交' }
const outcomes: Record<string, string> = { MATCH: '命中', NO_MATCH: '未命中', UNAVAILABLE: '不可评价', NOT_APPLICABLE: '不适用' }
export function MedicationKnowledgeReviewDialog({ api, candidate, onClose }: { api: RhnApi; candidate: KnowledgeRuleCandidate; onClose: () => void }) {
  const instance = useId(), [page, setPage] = useState(0), [event, setEvent] = useState<KnowledgeReviewEvent>(), [historyMode, setHistoryMode] = useState(false)
  const [reason, setReason] = useState(''), [assessment, setAssessment] = useState(''), [action, setAction] = useState(''), [unavailableAction, setUnavailableAction] = useState('')
  const [standard, setStandard] = useState(false), [evidence, setEvidence] = useState(false), [tests, setTests] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const preview = useQuery({ queryKey: ['knowledge-review', instance, candidate.id], queryFn: () => api.medicationKnowledgeDrafts.reviewPreview(candidate.id), retry: false, refetchOnWindowFocus: false })
  const history = useQuery({ queryKey: ['knowledge-review-history', instance, candidate.id, page], queryFn: () => api.medicationKnowledgeDrafts.reviewHistory(candidate.id, page) })
  const current = preview.isError ? undefined : preview.data
  const displayedEvent = historyMode ? event : current?.status === 'APPROVED' ? current.latest : current?.status === 'IN_REVIEW' ? current.submission : undefined
  const basis = historyMode ? event?.basis : displayedEvent?.basis ?? current?.current
  const checks = standard && evidence && tests && !!assessment.trim() && !!action && !!unavailableAction
  const invalidateChecks = () => { setAction(''); setUnavailableAction(''); setStandard(false); setEvidence(false); setTests(false) }
  const reset = () => { setReason(''); setAssessment(''); invalidateChecks() }
  const task = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await fn() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  const refresh = () => { setEvent(undefined); setHistoryMode(false); invalidateChecks(); void task(async () => { await preview.refetch(); await history.refetch() }) }
  const command = (operation: string) => {
    if (!current) return
    const fingerprint = operation === 'SUBMIT' ? current.current.fingerprint : current.submission?.basis.fingerprint
    if (!fingerprint) return
    void task(async () => {
      try {
        await api.medicationKnowledgeDrafts.reviewCommand(candidate.id, { expectedRevision: current.revision, operation, expectedBasisHash: fingerprint, reason: reason.trim(), ...(operation === 'APPROVE' ? { action, unavailableAction, standardVerified: standard, evidenceVerified: evidence, testsVerified: tests, assessment: assessment.trim() } : {}) })
        setNotice(`${operations[operation]}已记录。该操作不会发布或启用规则。`); reset(); setEvent(undefined); setHistoryMode(false)
      } finally { invalidateChecks(); await preview.refetch(); if (page) setPage(0); else await history.refetch() }
    })
  }
  return <Dialog title="知识候选 · 审核与提交" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="knowledge-review"><p><strong>{candidate.knowledge.body.title} · 候选 v{candidate.version}</strong>。提交固定来源与验证材料；审核需由不同于知识、候选、样例作者、验证执行者及提交者的有权限人员完成。</p>
      <Alert>审核通过只确认此候选的依据与处置策略。旁路需在“旁路部署与观察”中单独启用；正式启用须再经“正式启用与回退”独立操作。人员专业资质需由机构授权管理，本功能不自动认证。</Alert>
      {error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}{preview.error && <Alert tone="error">{errorMessage(preview.error)}</Alert>}
      <div className="knowledge-review__layout"><section className="knowledge-review__main"><div className="knowledge-review__toolbar"><h4>{historyMode ? '历史审核材料 · 只读' : displayedEvent ? '本次提交时冻结的材料' : '当前待提交材料'}</h4><Button variant="secondary" disabled={busy || preview.isFetching} onClick={refresh}>刷新当前材料</Button></div>
        {preview.isPending && <p>正在复核当前标准、来源和人工验证…</p>}
        {basis && <><MedicationKnowledgeRuleView value={basis.candidate} /><section className="knowledge-review__validation"><h4>需比对的其他知识</h4>{basis.possibleConflicts.length ? <><p>以下仅为药品范围可能重叠，不代表已经确认临床冲突；审核时需比对来源及适用条件。</p><ul>{basis.possibleConflicts.map(c => <li key={`${c.id}-${c.version}`}>{c.title} · 知识 {c.id} · 第 {c.version} 版：{c.reason}</li>)}</ul></> : <p>当前未识别到范围重叠的已存知识，不代表没有冲突。</p>}<h4>人工验证依据</h4>
          {basis.validation ? <><p>样例 v{basis.validation.suite.version} · {basis.validation.results.filter(r => r.passed).length}/{basis.validation.results.length} 通过 · 样例作者 {basis.validation.suite.actor} · 执行者 {basis.validation.actor}</p>
            {basis.validation.results.map(r => { const c = basis.validation!.suite.cases[r.index]; return <details key={r.index}><summary>{r.passed ? '通过' : '失败'} · {c?.title || `样例 ${r.index + 1}`}</summary><p>预期依据：{c?.rationale}</p><p>预期：{outcomes[c?.expectedOutcome]}；实际：{outcomes[r.actual.outcome]}</p><p>预期医嘱：{c?.expectedOrderIds.join('、') || '无'}；实际医嘱：{r.actual.matchedOrderIds.join('、') || '无'}</p><p>{r.actual.reasons.join('；')}</p><pre>{JSON.stringify(c?.input, null, 2)}</pre></details> })}
          </> : <p>还没有最新人工样例的执行记录。</p>}<small>审核材料指纹：{basis.fingerprint}</small>
        </section></>}
        {displayedEvent && <section className="knowledge-review__decision"><h4>{operations[displayedEvent.operation]}记录</h4><p>{displayedEvent.actor} · {new Date(displayedEvent.time).toLocaleString()} · {displayedEvent.reason}</p>{displayedEvent.operation === 'APPROVE' && <><p>命中时：{actions[displayedEvent.action ?? '']}；无法评价时：{actions[displayedEvent.unavailableAction ?? '']}</p><p>药学审核意见：{displayedEvent.assessment}</p></>}</section>}
      </section><aside className="knowledge-review__aside"><h4>当前治理状态</h4>{current && <><StatusBadge tone={current.status === 'APPROVED' ? 'info' : 'warning'}>{states[current.status] || current.status}</StatusBadge><p>审核状态与部署状态独立管理。</p>
        {current.gaps.length > 0 && <Alert tone="warning"><strong>当前待处理项</strong><ul>{current.gaps.map(g => <li key={g}>{g}</li>)}</ul></Alert>}{current.issues.map((i, index) => <p key={index}>{i.message}</p>)}
        {current.submission && !current.basisUnchanged && <Alert tone="warning">当前材料与提交时不同。原记录保留；需核对新知识或验证版本，不能直接批准旧提交。</Alert>}
        {current.reviewerRestrictions.length > 0 && <p>当前人员不能批准或退回：{current.reviewerRestrictions.join('；')}。提交人可在待审核时撤回。</p>}
        {!historyMode && current.allowedOperations.length > 0 && <fieldset disabled={busy || preview.isFetching}><FormField label="审核操作原因"><textarea aria-label="审核操作原因" rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></FormField>
          {current.allowedOperations.includes('APPROVE') && <><label><input type="checkbox" checked={standard} onChange={e => setStandard(e.target.checked)} />已核对标准身份、范围与版本</label><label><input type="checkbox" checked={evidence} onChange={e => setEvidence(e.target.checked)} />已核对来源原文、适用条件、证据有效性与潜在冲突</label><label><input type="checkbox" checked={tests} onChange={e => setTests(e.target.checked)} />已独立复核样例、预期及验证结果</label>
            <FormField label="命中时处置"><Select aria-label="命中时处置" value={action} onChange={setAction} options={Object.entries(actions).map(([value, label]) => ({ value, label }))} placeholder="审核人明确选择" /></FormField><FormField label="无法评价时处置"><Select aria-label="无法评价时处置" value={unavailableAction} onChange={setUnavailableAction} options={Object.entries(actions).map(([value, label]) => ({ value, label }))} placeholder="审核人明确选择" /></FormField><FormField label="药学审核意见"><textarea aria-label="药学审核意见" rows={3} maxLength={4000} value={assessment} onChange={e => setAssessment(e.target.value)} placeholder="适用性、样例覆盖及处置策略的审核结论" /></FormField>
          </>}
          <div className="knowledge-review__toolbar">{current.allowedOperations.map(op => <Button key={op} variant={op === 'APPROVE' || op === 'SUBMIT' ? 'primary' : 'secondary'} disabled={!reason.trim() || op === 'APPROVE' && !checks} onClick={() => command(op)}>{operations[op]}</Button>)}</div>
        </fieldset>}
      </>}
        <h4>提交与审核历史</h4>{history.error && <Alert tone="error">{errorMessage(history.error)}</Alert>}
        {!history.isError && history.data?.content.map(h => <button type="button" className="knowledge-review__history" key={h.id} disabled={busy} onClick={() => { setHistoryMode(true); setEvent(undefined); invalidateChecks(); void task(async () => setEvent(await api.medicationKnowledgeDrafts.reviewEvent(candidate.id, h.id))) }}><strong>{operations[h.operation]} · {h.actor}</strong><small>{new Date(h.time).toLocaleString()}</small><small>{h.reason}</small></button>)}
        {history.data && <Pagination page={page} totalPages={Math.max(1, history.data.totalPages)} total={history.data.totalElements} pageSize={20} onChange={p => { if (!busy) setPage(p) }} label="知识审核历史分页" />}
      </aside></div>
    </div>
  </Dialog>
}
