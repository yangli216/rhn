import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { RuleIntakeRun, IntakeImprovementOrigin } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, FormField, Pagination, StatusBadge } from '../../shared/ui'
import './medication-rule-intake.css'

export interface IntakeSeed { kind: string; run: RuleIntakeRun; knowledgeId?: string }
const scopes: Record<string, string> = { ALL_DRUGS: '全部药品', NAMED_DRUGS: '指定药品', CLASS: '药品类别', INGREDIENT: '成分范围', UNSPECIFIED: '范围待明确' }
const states: Record<string, string> = { ANALYZED: '分析已留存', INVALID_OUTPUT: '输出待核查', MODEL_ERROR: '模型调用失败' }
function sameImprovement(a: IntakeImprovementOrigin, b: IntakeImprovementOrigin) {
  if (a.pharmacy || b.pharmacy) return !!a.pharmacy && !!b.pharmacy && a.pharmacy.taskId === b.pharmacy.taskId && a.pharmacy.review.id === b.pharmacy.review.id && a.pharmacy.finding?.findingId === b.pharmacy.finding?.findingId
  return a.feedback.id === b.feedback.id && a.feedback.basis.fingerprint === b.feedback.basis.fingerprint
}
export function IntakeFeedbackSource({ origin }: { origin: IntakeImprovementOrigin }) {
  if (origin.pharmacy) {
    const p = origin.pharmacy
    return <details open className="rule-intake__source"><summary>改进线索：药师审方 · {origin.title}</summary>
      <p>审方结论：{p.review.result} · {new Date(p.review.reviewedAt).toLocaleString()}</p>
      <p>药师说明：{p.review.description || '未填写补充说明'}</p>
      <p>相关规则提示：{p.finding?.message || '未关联提示，可提出漏报或新增知识需求'}</p>
      {origin.knowledgeId ? <p>关联知识第 {origin.knowledgeVersion} 版；进入编辑时载入最新草稿供核对。</p> : <p>未关联可编辑知识，将建立新的知识草稿。</p>}
      <p>这是已保存的药师意见，不是药学证据。仅发送下方填写的需求与澄清，不自动发送审方原文、处方或患者资料。</p>
    </details>
  }
  const e = origin.feedback
  return <details open className="rule-intake__source"><summary>改进线索：{origin.title} · 知识第 {origin.knowledgeVersion} 版</summary><p>观察 {e.basis.runId} · 发布 {e.basis.deploymentId} · 机构 {e.basis.organizationId} / 科室 {e.basis.departmentId}</p><p>固定研判第 {e.revision} 次 · {e.actor} · {new Date(e.time).toLocaleString()}。后续更正或撤回不会改写此记录，请继续分析前核对原观察。</p><p>研判：{e.assessment}</p><p>核对依据：{e.evidence}</p><p>改进建议：{e.suggestion || '未填写'}</p><p>这些是人工意见，不是药学证据。发送给模型的内容以需求和澄清输入为准，不自动附带处方事实或本材料。</p></details>
}
export function IntakeSource({ run, api }: { run: RuleIntakeRun; api?: RhnApi }) {
  const origin = useQuery({ queryKey: ['intake-feedback-origin', run.id], queryFn: () => api!.medicationKnowledgeDrafts.intakeFeedbackOrigin(run.id), enabled: !!api, retry: false })
  return <section className="rule-intake__source"><>{api && origin.error && <Alert tone="error">改进来源读取失败：{errorMessage(origin.error)}</Alert>}{api && !origin.isError && origin.data && <IntakeFeedbackSource origin={origin.data} />}</><strong>需求分析 {run.id} · {run.actor} · {new Date(run.createdAt).toLocaleString()}</strong><p>这是业务需求来源，不是药学证据。分析时能力范围已留存，当前可用能力仍会单独检查。模型：{run.model}。</p><blockquote>{run.input.requirement}</blockquote>{run.input.clarifications.map((a, i) => <details key={i}><summary>澄清 {i + 1} · {a.question}</summary><p>{a.answer}</p><small>来源分析 {a.analysisId}</small></details>)}</section>
}
export function MedicationRuleIntake({ api, onStartKnowledge, improvement, onBusy }: { api: RhnApi; onStartKnowledge: (seed: IntakeSeed) => void; improvement?: IntakeImprovementOrigin; onBusy?: (busy: boolean) => void }) {
  const instance = useId(), [requirement, setRequirement] = useState(improvement ? `请核查“${improvement.title}”的适用范围与例外，形成待人工核对的知识改进需求。请填写具体问题与需保留的条件。` : ''), [run, setRun] = useState<RuleIntakeRun>(), [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0), [historical, setHistorical] = useState(false)
  const capabilities = useQuery({ queryKey: ['rule-intake-capabilities', instance], queryFn: () => api.medicationKnowledgeDrafts.intakeCapabilities(), retry: false })
  const status = useQuery({ queryKey: ['rule-intake-model', instance], queryFn: () => api.medicationWorkbench.status(), retry: false })
  const history = useQuery({ queryKey: ['rule-intake-history', instance, page], queryFn: () => improvement ? api.medicationKnowledgeDrafts.feedbackImprovementHistory(improvement, page) : api.medicationKnowledgeDrafts.intakeHistory(page), retry: false })
  const [confirmed, setConfirmed] = useState(false)
  const origin = useQuery({ queryKey: ['intake-feedback-origin', run?.id], queryFn: () => api.medicationKnowledgeDrafts.intakeFeedbackOrigin(run!.id), enabled: !!run, retry: false })
  const canResume = origin.isSuccess && (!origin.data || (!!improvement && sameImprovement(origin.data, improvement)))
  const valid = run && !historical && run.input.requirement === requirement
  const task = async (work: () => Promise<void>) => { setBusy(true); onBusy?.(true); setError(''); try { await work() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false); onBusy?.(false); setConfirmed(false) } }
  const analyze = (clarify: boolean) => { void task(async () => {
    const parent = clarify ? run?.id : undefined
    const body = { requirement, parentId: parent, answers: clarify ? Object.entries(answers).filter(([, value]) => value.trim()).map(([questionId, value]) => ({ questionId, value: value.trim() })) : [] }
    const previous = run
    setRun(undefined); setHistorical(false)
    try {
      const value = await (improvement ? api.medicationKnowledgeDrafts.analyzeFeedbackImprovement(improvement, body) : api.medicationKnowledgeDrafts.analyzeIntake(body))
      setRun(value); setAnswers({}); if (page) setPage(0); else await history.refetch()
    } catch (e) { setRun(previous); setHistorical(true); throw e }
  }) }
  return <section className="rule-intake" aria-label="AI 规则需求分析"><Alert>先明确控制目标、标准范围与缺口，再建立有来源的知识。无需先勾选药品；分析不会生成候选、审批或启用规则。</Alert>
    {improvement && <IntakeFeedbackSource origin={improvement} />}{error && <Alert tone="error">{error}</Alert>}<div className="rule-intake__layout"><aside className="rule-intake__pane"><h3>描述需求</h3><FormField label="待分析的用药规则需求"><textarea aria-label="待分析的用药规则需求" rows={6} maxLength={4000} disabled={busy} value={requirement} onChange={e => { setConfirmed(false); setRequirement(e.target.value); setRun(undefined); setAnswers({}); setHistorical(false); setError('') }} placeholder="例如：同一处方重复开立同一标准药品时提示；请保留例外、人群与跨处方要求。" /></FormField>
      {improvement && <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />已核对反馈与待发送文本，确认仅将需求及澄清发送给模型</label>}
      <div className="rule-intake__actions">{!improvement && <Button variant="secondary" disabled={busy} onClick={() => { setRequirement('所有药品单次用量超过3倍制剂规格用量时警告'); setRun(undefined); setAnswers({}); setHistorical(false) }}>填入剂量需求示例</Button>}<Button disabled={busy || !requirement.trim() || !status.data?.available || (!!improvement && !confirmed)} onClick={() => analyze(false)}>{busy ? '正在处理…' : '分析需求与能力缺口'}</Button></div>
      <p>{status.isPending ? '正在检查模型配置…' : status.isError ? errorMessage(status.error) : status.data?.available ? `模型已配置：${status.data.model}` : status.data?.message}</p>
      <details><summary>当前知识建设能力范围</summary>{capabilities.error && <Alert tone="error">{errorMessage(capabilities.error)}</Alert>}{capabilities.data?.map(c => <div key={c.kind} className="rule-intake__capability"><strong>{c.name}</strong> · {c.knowledgeWorkflow ? '可进入知识工作流' : '需求保留，能力待扩展'}<p>{c.boundary}</p></div>)}</details>
      <h4>{improvement ? '本次反馈的改进分析历史' : '分析与澄清历史'}</h4>{history.error && <Alert tone="error">{errorMessage(history.error)}</Alert>}{history.data?.content.map(h => <button type="button" key={h.id} className="rule-intake__history" disabled={busy} onClick={() => { setRun(undefined); setHistorical(true); setAnswers({}); void task(async () => setRun(await api.medicationKnowledgeDrafts.intake(h.id))) }}><strong>{h.requirement}</strong><small>{states[h.status]} · {new Date(h.createdAt).toLocaleString()}</small></button>)}
      {history.data && <Pagination page={page} totalPages={Math.max(1, history.data.totalPages)} total={history.data.totalElements} pageSize={20} onChange={p => { if (!busy) setPage(p) }} label="需求分析历史分页" />}
    </aside><main className="rule-intake__pane"><h3>{historical ? '历史分析 · 只读' : '规则类型、范围与待澄清项'}</h3>
      {!run && <p>分析后逐项核对分类与原文。重复用药、相互作用可转入知识草稿；其他类型显示需要建设的标准、知识和事实能力。</p>}
      {run && <><IntakeSource run={run} api={improvement ? undefined : api} /><StatusBadge tone={run.result.status === 'ANALYZED' ? 'info' : 'warning'}>{states[run.result.status]}</StatusBadge>
        {run.result.notes.map(note => <p key={note}>{note}</p>)}
        <div className="rule-intake__intents">{run.result.intents.map((i, index) => {
          const current = capabilities.isError ? undefined : capabilities.data?.find(c => c.kind === i.kind)
          return <section className="rule-intake__intent" key={`${i.kind}-${index}`}><h4>建议分类：{i.name}</h4><blockquote>{i.citation.quote}</blockquote><p>{scopes[i.scope]}{i.scopeCitation && `：${i.scopeCitation.quote}`}</p>{i.conditions.map((c, n) => <p key={n}>条件原文：{c.citation.quote}</p>)}<p>{i.capability.boundary}</p><strong>需明确的标准与知识</strong><ul>{i.capability.prerequisites.map(p => <li key={p}>{p}</li>)}</ul>
            {valid && current?.knowledgeWorkflow && i.capability.knowledgeWorkflow && <Button disabled={busy} onClick={() => onStartKnowledge({ kind: i.kind, run, ...(improvement?.knowledgeId ? { knowledgeId: improvement.knowledgeId } : {}) })}>以此需求建立{i.name}知识草稿</Button>}
            {!i.capability.knowledgeWorkflow && <StatusBadge tone="warning">保留为能力建设需求</StatusBadge>}
          </section>
        })}</div>
        {valid && run.result.status !== 'ANALYZED' && <Button disabled={busy || !status.data?.available || (!!improvement && !confirmed)} onClick={() => analyze(true)}>保留澄清重试分析</Button>}
        {valid && run.result.questions.length > 0 && <fieldset disabled={busy}><h4>补充回答后重新分析</h4><p>回答只说明业务意图，不能代替来源原文。每次澄清生成新记录，保留原分析。</p>{run.result.questions.map(q => <FormField key={q.id} label={`${q.origin === 'AI' ? 'AI 提问' : '系统检查'}：${q.text}`}><textarea aria-label={q.text} rows={2} maxLength={1000} value={answers[q.id] ?? ''} onChange={e => { setConfirmed(false); setAnswers(old => ({ ...old, [q.id]: e.target.value })) }} /></FormField>)}<Button disabled={!Object.values(answers).some(v => v.trim()) || !status.data?.available || (!!improvement && !confirmed)} onClick={() => analyze(true)}>结合回答重新分析</Button></fieldset>}
        {historical && origin.data && !canResume && <p>该记录关联业务反馈。请从原反馈的“转为 AI 改进需求”入口核对后继续。</p>}{historical && canResume && <Button variant="secondary" disabled={busy} onClick={() => { setRequirement(run.input.requirement); setHistorical(false) }}>基于此记录继续澄清</Button>}
      </>}
    </main></div>
  </section>
}
