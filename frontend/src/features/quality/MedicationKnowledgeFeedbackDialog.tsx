import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeFeedbackCommand, IntakeFeedbackOrigin } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination } from '../../shared/ui'
import { MedicationKnowledgeRuleView } from './MedicationKnowledgeRuleView'
import './medication-knowledge-feedback.css'
import { MedicationFeedbackImprovementDialog } from './MedicationFeedbackImprovementDialog'

export const feedbackVerdicts: Record<string, string> = { SUPPORTED: '结果与核对事实一致', FALSE_POSITIVE: '疑似误报', POSSIBLE_MISS: '疑似漏检', DATA_ISSUE: '事实或标准数据问题', RULE_ISSUE: '规则范围或条件问题', UNCERTAIN: '尚不能判断' }
const outcomes: Record<string, string> = { MATCH: '命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '不可评价' }
export function MedicationKnowledgeFeedbackDialog({ api, candidateId, deploymentId, runId, onClose, onChanged }: { api: RhnApi; candidateId: string; deploymentId: string; runId: string; onClose: () => void; onChanged: () => void }) {
  const [improvement, setImprovement] = useState<IntakeFeedbackOrigin>()
  const instance = useId(), cache = useQueryClient(), [page, setPage] = useState(0)
  const key = ['knowledge-feedback', instance, candidateId, deploymentId, runId, page]
  const query = useQuery({ queryKey: key, queryFn: () => api.medicationKnowledgeDrafts.observationFeedback(candidateId, deploymentId, runId, page), retry: false, refetchOnWindowFocus: false })
  const value = query.isError ? undefined : query.data
  const [verdict, setVerdict] = useState(''), [assessment, setAssessment] = useState(''), [evidence, setEvidence] = useState(''), [suggestion, setSuggestion] = useState(''), [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const token = `${value?.basis.fingerprint ?? ''}:${value?.latest?.revision ?? 0}`
  const lastToken = useRef<string | null>(null)
  useEffect(() => { if (!value || lastToken.current === token) return; lastToken.current = token; setVerdict(''); setAssessment(''); setEvidence(''); setSuggestion(''); setReason(''); setConfirmed(false) }, [token])
  const send = async (operation: KnowledgeFeedbackCommand['operation']) => {
    if (!value) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.medicationKnowledgeDrafts.recordObservationFeedback(candidateId, deploymentId, runId, { expectedRevision: value.latest?.revision ?? 0, expectedBasisHash: value.basis.fingerprint, operation, reason: reason.trim(), ...(operation === 'RECORD' ? { verdict, assessment: assessment.trim(), evidence: evidence.trim(), suggestion: suggestion.trim() } : {}) })
      setPage(0); cache.setQueryData(['knowledge-feedback', instance, candidateId, deploymentId, runId, 0], result)
      setNotice(operation === 'RECORD' ? '已追加研判意见，历史及原运行结果保留。' : '已撤回最新意见，观察重新计入待研判。')
      onChanged()
    } catch (e) { setError(errorMessage(e)); setConfirmed(false); await query.refetch() }
    finally { setBusy(false) }
  }
  return <Dialog title="旁路观察 · 人工研判与追溯" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="knowledge-feedback"><Alert>这是对一次评价的人工意见，不是处方处置或临床启用审批。追加意见成为该观察的最新研判，原意见保留；疑似误报、漏检须结合依据进一步核实。</Alert>
      {query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}{error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}
      <Button variant="secondary" disabled={busy || query.isFetching} onClick={() => { setConfirmed(false); void query.refetch() }}>刷新观察与研判</Button>
      {query.isPending && <p>正在读取本次运行的冻结事实与研判历史…</p>}
      {value && <div className="knowledge-feedback__layout"><section><h4>原观察与固定评价事实</h4>
        <p>处方 {value.observation.prescriptionId} · {new Date(value.observation.time).toLocaleString()} · {outcomes[value.observation.outcome] ?? value.observation.outcome}</p>
        <p>机构 {value.basis.organizationId} · 科室 {value.basis.departmentId} · 发布 {value.basis.deploymentId}</p>
        <p>{value.observation.reasons.join('；')}</p><p>命中医嘱：{value.observation.matchedOrderIds.join('、') || '无'}</p>
        {value.gaps.length > 0 && <Alert tone="warning">{value.gaps.join('；')}</Alert>}
        {value.input && <><p>年龄事实：{value.input.facts.age == null ? '缺失 / 本规则未使用' : `${value.input.facts.age} ${value.input.facts.ageUnit}`}；评价日期：{value.input.facts.date || '未使用'}。</p><p>{value.input.dateBasis}</p>
          {value.input.gaps.length > 0 && <Alert tone="warning">{value.input.gaps.join('；')}</Alert>}
          <table><thead><tr><th>医嘱与药品</th><th>冻结标准与途径</th><th>缺口</th></tr></thead><tbody>{value.input.items.map(item => <tr key={item.orderId}><td>{item.medicationName}<small>医嘱 {item.orderId} · {item.originalStatus} · v{item.revision}</small></td><td>{item.fact?.entryId || '无标准身份'}<small>{item.fact?.specificationId} · {item.fact?.catalogVersion}</small><small>途径 {item.fact?.routeCode || '未使用或缺失'}</small></td><td>{item.gaps.join('；') || '未记录缺口'}</td></tr>)}</tbody></table>
        </>}
        {value.frozenCandidate && <details><summary>本次运行冻结的知识来源与规则表达</summary><MedicationKnowledgeRuleView value={value.frozenCandidate} /></details>}
        <details><summary>版本与指纹</summary><small>观察 {value.basis.runId} · 候选 {value.basis.candidateId}</small><small>运行：{value.basis.runHash}</small><small>发布：{value.basis.releaseFingerprint}</small><small>表达：{value.basis.programHash}</small><small>知识：{value.basis.knowledgeHash}</small></details>
      </section><section><h4>追加人工研判</h4>
        {value.latest && <Alert>最新意见：{value.latest.operation === 'WITHDRAW' ? '已撤回' : feedbackVerdicts[value.latest.verdict ?? '']} · {value.latest.actor} · 第 {value.latest.revision} 次记录。</Alert>}
        <fieldset disabled={busy || query.isFetching}>
          <FormField label="研判分类"><select aria-label="研判分类" value={verdict} onChange={e => { setVerdict(e.target.value); setConfirmed(false) }}><option value="">请选择</option>{value.allowedVerdicts.map(v => <option key={v} value={v}>{feedbackVerdicts[v]}</option>)}</select></FormField>
          <FormField label="研判说明"><textarea aria-label="研判说明" maxLength={4000} rows={3} value={assessment} onChange={e => { setAssessment(e.target.value); setConfirmed(false) }} /></FormField>
          <FormField label="研判依据"><textarea aria-label="研判依据" maxLength={4000} rows={3} value={evidence} onChange={e => { setEvidence(e.target.value); setConfirmed(false) }} placeholder="写明核对过的事实、来源与定位；仅有运行结果不能证明判断正确。请勿填写患者姓名、证件或联系方式。" /></FormField>
          <FormField label="改进建议（可选）"><textarea aria-label="改进建议（可选）" maxLength={2000} rows={2} value={suggestion} onChange={e => { setSuggestion(e.target.value); setConfirmed(false) }} /></FormField>
          <FormField label="记录、更正或撤回原因"><textarea aria-label="记录、更正或撤回原因" maxLength={2000} rows={2} value={reason} onChange={e => { setReason(e.target.value); setConfirmed(false) }} /></FormField>
          <label className="knowledge-feedback__confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />已核对本次固定材料及最新意见，确认本次记录内容</label>
          <div className="knowledge-feedback__actions"><Button disabled={!verdict || !assessment.trim() || !evidence.trim() || !reason.trim() || !confirmed || !value.allowedVerdicts.includes(verdict)} onClick={() => void send('RECORD')}>追加研判意见</Button>{value.canWithdraw && <Button variant="secondary" disabled={!reason.trim() || !confirmed} onClick={() => void send('WITHDRAW')}>撤回我的最新意见</Button>}</div>
        </fieldset>
        {value.latest?.operation === 'RECORD' && value.latest.verdict !== 'SUPPORTED' && value.frozenCandidate && !value.gaps.length && <Button variant="secondary" disabled={busy || query.isFetching} onClick={() => setImprovement({ feedback: value.latest!, knowledgeId: value.frozenCandidate!.knowledgeId, knowledgeVersion: value.frozenCandidate!.version, title: value.frozenCandidate!.knowledge.body.title })}>转为 AI 改进需求</Button>}
        <h4>研判历史</h4>{!value.history.content.length && <p>尚无人工研判。</p>}{value.history.content.map(event => <details key={event.id}><summary>第 {event.revision} 次 · {event.operation === 'WITHDRAW' ? '撤回意见' : feedbackVerdicts[event.verdict ?? '']} · {event.actor} · {new Date(event.time).toLocaleString()}</summary><p>{event.assessment}</p><p>依据：{event.evidence || '本次为撤回操作'}</p><p>建议：{event.suggestion || '未填写'}</p><p>记录原因：{event.reason}</p><small>引用观察：{event.basis.runId} · 表达指纹：{event.basis.programHash}</small></details>)}
        <Pagination page={page} totalPages={Math.max(1, value.history.totalPages)} total={value.history.totalElements} pageSize={20} onChange={next => { setConfirmed(false); setPage(next) }} label="旁路研判历史分页" />
      </section></div>}
    </div>
    {improvement && <MedicationFeedbackImprovementDialog api={api} origin={improvement} onClose={() => { setImprovement(undefined); void query.refetch(); onChanged() }} />}
  </Dialog>
}
