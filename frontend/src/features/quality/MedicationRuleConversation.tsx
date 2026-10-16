import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeBody, KnowledgeCategoryReference, KnowledgeEvidence, KnowledgeReference, KnowledgeTarget, RuleCardCandidates, RuleCardView } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Icon, PanelHead, Select, StatusBadge } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { cardSentence, compileCard } from './ruleCards'
import '../../styles/features/outpatient-doctor.css'
import './medication-rule-conversation.css'

interface Picked { name: string; target: KnowledgeTarget; label: string; key: string }
interface Turn { role: 'user' | 'assistant'; text: string; error?: boolean }
const sourceTypes = [{ value: 'LABEL', label: '说明书', title: '药品说明书' }, { value: 'GUIDELINE', label: '指南', title: '指南 / 共识 / 文献' }, { value: 'INSTITUTION_POLICY', label: '制度', title: '机构管理规范' }, { value: 'REGULATION', label: '法规', title: '法规 / 规章' }]
const reviseChips = ['补充适用年龄', '补充给药途径', '合用时仅提示', '合用时需填理由', '合用时阻断', '删除这条']
const stateText = { READY: ['success', '可转换'], NEEDS_INFO: ['warning', '需补充'], UNSUPPORTED: ['neutral', '暂不能转换'] } as const
const actionChoices = [['WARN', '警告提示'], ['REQUIRE_OVERRIDE', '需理由后继续'], ['BLOCK', '阻断']] as const
interface Entry { entryId: string; name: string; ref: KnowledgeReference; specs: number }
/** Rules attach to a catalog classification or a standard drug name (all specifications); a specification is never picked automatically. */
const entriesOf = (item: RuleCardCandidates): Entry[] => {
  const map = new Map<string, Entry>()
  for (const ref of item.candidates) { const hit = map.get(ref.entryId); if (hit) hit.specs += 1; else map.set(ref.entryId, { entryId: ref.entryId, name: ref.name, ref, specs: 1 }) }
  return [...map.values()]
}
const entryLabel = (e: Entry) => `${e.name}（全部规格${e.specs > 1 ? `，${e.specs} 个` : ''}）`
const targetOf = (e: Entry): KnowledgeTarget => ({ level: 'ENTRY', specificationId: e.ref.specificationId, catalogId: e.ref.catalogId, catalogVersion: e.ref.catalogVersion, contentHash: e.ref.contentHash })
const categoryLabel = (c: KnowledgeCategoryReference) => `${c.label} · 目录分类，含 ${c.entryIds.length} 个药品`
const categoryTarget = (c: KnowledgeCategoryReference): KnowledgeTarget => ({ level: 'CATEGORY', specificationId: '', categoryKey: c.key, catalogId: c.catalogId, catalogVersion: c.catalogVersion, contentHash: c.contentHash })
interface Option { id: string; label: string; target: KnowledgeTarget; key: string }
/** Classifications come first: rules are written about drug classes and names far more often than about one specification. */
const optionsOf = (item: RuleCardCandidates): Option[] => [
  ...(item.categories ?? []).map(c => ({ id: `C:${c.key}`, label: categoryLabel(c), target: categoryTarget(c), key: c.key })),
  ...entriesOf(item).map(e => ({ id: `E:${e.entryId}`, label: entryLabel(e), target: targetOf(e), key: e.ref.specificationId })),
]
const excerpt = (text: string) => `规则原文（${text.length} 字）：${text.replace(/\s+/g, ' ').slice(0, 60)}${text.length > 60 ? '…' : ''}`

/** Conversational rule building, laid out like 智能方案构建: chat on the left, plain-language rule cards for review on the right. */
export function MedicationRuleConversation({ api, routes, evidence, onEvidence, onConfirm }: {
  api: RhnApi; routes: { code: string; name: string }[]; evidence: KnowledgeEvidence; onEvidence: (patch: Partial<KnowledgeEvidence>) => void
  onConfirm: (body: KnowledgeBody, labels: Record<string, string>) => void
}) {
  const drafts = api.medicationKnowledgeDrafts
  const aiStatus = useQuery({ queryKey: ['knowledge-extraction-status'], queryFn: () => drafts.extractionStatus(), retry: false })
  const [turns, setTurns] = useState<Turn[]>([]), [views, setViews] = useState<RuleCardView[]>([]), [started, setStarted] = useState(false)
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<string, Picked[]>>({})
  const thread = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null), dismissed = useRef(new Set<string>())
  const ready = !!aiStatus.data?.available
  const scroll = () => requestAnimationFrame(() => { if (thread.current) thread.current.scrollTop = thread.current.scrollHeight })
  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (busy || !text) return
    const first = !started
    if (first) onEvidence({ excerpt: text })
    const shown: Turn[] = [...turns, { role: 'user', text: first ? excerpt(text) : text }]
    setTurns(shown); if (override === undefined) setInput(''); setBusy(true); setError(''); scroll()
    try {
      const history = turns.filter(t => !t.error).map(t => ({ role: t.role, text: t.text })).slice(-20)
      const result = await drafts.converse({ source: first ? text : evidence.excerpt, cards: views.map(v => v.card), message: first ? '' : text, history })
      setViews(result.cards); setStarted(true); setPicked(prev => autoPick(prev, result.cards, dismissed.current)); setTurns([...shown, { role: 'assistant' as const, text: result.reply || '已整理。' }].slice(-40))
    } catch (e) { setTurns([...shown, { role: 'assistant', text: errorMessage(e), error: true }]); if (first) setInput(text) } finally { setBusy(false); scroll() }
  }
  const restart = () => { dismissed.current.clear(); setStarted(false); setTurns([]); setViews([]); setPicked({}); setInput(''); setError('') }
  const keyOf = (id: string, group: 'A' | 'B') => `${id}|${group}`
  const pick = (id: string, group: 'A' | 'B', name: string, option: Option) => setPicked(v => {
    const key = keyOf(id, group), list = v[key] ?? []
    dismissed.current.delete(`${key}|${name}`)
    if (list.some(p => p.name === name && p.key === option.key)) return v
    return { ...v, [key]: [...list.filter(p => p.name !== name), { name, label: option.label, target: option.target, key: option.key }] }
  })
  const unpick = (id: string, group: 'A' | 'B', name: string) => { dismissed.current.add(`${keyOf(id, group)}|${name}`); setPicked(v => ({ ...v, [keyOf(id, group)]: (v[keyOf(id, group)] ?? []).filter(p => p.name !== name) })) }
  const live = (view: RuleCardView, group: 'A' | 'B') => (picked[keyOf(view.card.id, group)] ?? []).filter(p => (group === 'A' ? view.card.groupA : view.card.groupB).includes(p.name))
  const confirm = (view: RuleCardView) => {
    const a = live(view, 'A'), b = live(view, 'B')
    onConfirm(compileCard(view.card, evidence, { A: a.map(p => p.target), B: b.map(p => p.target) }, routes), Object.fromEntries([...a, ...b].map(p => [p.key, p.label])))
  }
  const ask = (text: string) => { if (!busy) void send(text) }
  const reply = (question: string) => { setInput(`关于“${question}”：`); composer.current?.focus() }
  const drugRows = (view: RuleCardView, group: 'A' | 'B', items: RuleCardCandidates[]) => items.map(item => {
    const options = optionsOf(item), chosen = live(view, group).find(p => p.name === item.name)
    return <div key={`${group}-${item.name}`} className="rule-chat__med">
      <b>{group} 组</b><span className="rule-chat__med-name">{item.name}</span>
      {chosen ? <Button size="sm" variant="secondary" aria-label={`取消 ${group} 组 ${item.name} 的标准范围`} onClick={() => unpick(view.card.id, group, item.name)}>{chosen.label} ×</Button>
        : options.length ? <Select aria-label={`选择 ${group} 组 ${item.name} 的标准范围`} value="" placeholder={options.length > 1 ? `${options.length} 个标准范围，请选择` : '选择标准范围'}
          onChange={id => { const o = options.find(x => x.id === id); if (o) pick(view.card.id, group, item.name, o) }} options={options.map(o => ({ value: o.id, label: o.label }))} />
          : <small>未找到同名的标准分类或药品，转换后在系统规则中添加</small>}
    </div>
  })
  return <div className="rule-chat">
    <section className="rule-chat__left" aria-label="智能规则构建">
      <PanelHead title="智能规则构建" actions={started ? <Button size="sm" variant="text" disabled={busy} onClick={restart}>重新开始</Button> : undefined} />
      <div className="ai-plan-modal-toolbar">
        <div className="ai-plan-scope-selector" role="radiogroup" aria-label="规则来源类型">
          <span className="ai-plan-scope-label">规则来源</span>
          <div className="ai-plan-scope-pills">
            {sourceTypes.map(opt => <Button variant="text" size="sm" key={opt.value} type="button" role="radio" aria-checked={(evidence.sourceType || 'INSTITUTION_POLICY') === opt.value} disabled={started}
              className={`ai-plan-scope-pill ${(evidence.sourceType || 'INSTITUTION_POLICY') === opt.value ? 'is-active' : ''}`} title={opt.title} onClick={() => onEvidence({ sourceType: opt.value })}>{opt.label}</Button>)}
          </div>
        </div>
        {ready && <span className="ai-plan-model-badge" title={`模型：${aiStatus.data?.model}`}><span className="ai-plan-model-dot" /><span>AI 助手就绪</span></span>}
      </div>
      {aiStatus.data && !ready && <Alert tone="warning">当前未启用真实模型：{aiStatus.data.message}；可点右上“手工新建”直接填写。</Alert>}
      {aiStatus.isError && <Alert tone="warning">暂时无法读取模型状态：{errorMessage(aiStatus.error)}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="ai-plan-chat-thread" role="region" aria-label="规则整理对话" ref={thread}>
        <div className="ai-plan-chat-msg ai-plan-chat-msg--assistant"><div className="ai-plan-chat-msg__avatar"><Icon name="sparkles" /></div>
          <div className="ai-plan-chat-msg__bubble"><p>粘贴文字性用药规则原文（可含多条），AI 帮你整理成规则卡片；之后可以直接对话修改。</p></div></div>
        {turns.map((t, i) => <div key={i} className={`ai-plan-chat-msg ai-plan-chat-msg--${t.role} ${t.error ? 'ai-plan-chat-msg--error' : ''}`}>
          <div className="ai-plan-chat-msg__avatar">{t.role === 'assistant' ? <Icon name="sparkles" /> : '我'}</div><div className="ai-plan-chat-msg__bubble"><p>{t.text}</p></div></div>)}
        {busy && <div className="ai-plan-chat-msg ai-plan-chat-msg--assistant"><div className="ai-plan-chat-msg__avatar"><Icon name="sparkles" /></div><div className="ai-plan-chat-msg__bubble"><p>整理中…</p></div></div>}
      </div>
      <div className="ai-plan-chat-composer">
        {started && <div className="ai-plan-chat-chips" aria-label="快捷修改">
          <span className="ai-plan-chat-chips-label"><Icon name="sparkles" /> 灵感:</span>
          {reviseChips.slice(0, 3).map(chip => <Button variant="text" size="sm" key={chip} type="button" className="ai-plan-chat-chip" onClick={() => setInput(prev => prev ? `${prev}；${chip}` : chip)}>+ {chip}</Button>)}
        </div>}
        <div className="ai-plan-chat-card">
          <textarea ref={composer} className="ai-plan-chat-card__input" rows={started ? 2 : 4} maxLength={started ? 2000 : 8000} value={input} onChange={e => setInput(e.target.value)} aria-label={started ? '对话输入' : '规则原文'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
            placeholder={started ? '告诉我怎么调整，如：只适用于 18 岁以下；A 组加上呋塞米；第 2 条删掉…' : '粘贴文字性用药规则原文（说明书、指南、制度条文，可含多条）…'} />
          <div className="ai-plan-chat-card__toolbar"><span />
            <Button variant="text" size="sm" type="button" disabled={busy || !ready || !input.trim()} className="ai-plan-send-btn" onClick={() => void send()} aria-label="发送"><Icon name="send" /><span>{busy ? '整理中...' : '发送'}</span></Button></div>
        </div>
      </div>
    </section>
    <WorkspacePane label="规则卡片" className="rule-chat__pane"
      header={<PanelHead title="系统规则核对" meta={views.length ? `${views.length} 条` : undefined} actions={<StatusBadge tone="warning">AI 整理 · 待你确认</StatusBadge>} />}>
      <div className="rule-chat__body">
        {!views.length && <p className="rule-chat__empty">在左侧粘贴规则原文，AI 会把每条规则整理成一张卡片，用日常语言描述。可通过对话修改，确认后才转为系统规则。</p>}
        {views.map(view => { const [tone, text] = stateText[view.state]; const c = view.card, supported = view.state !== 'UNSUPPORTED'
          const needAction = supported && !c.proposedAction
          const questions = c.questions.filter(q => !(needAction && /处置|提示|强度|严重|动作/.test(q)))
          return <article key={c.id} className={`rule-chat__card is-${view.state.toLowerCase()}`} aria-label={`规则卡片 ${c.title}`}>
          <header><strong>{c.title || '未命名规则'}</strong><span><StatusBadge tone="neutral">{view.kindName}</StatusBadge><StatusBadge tone={tone}>{text}</StatusBadge></span></header>
          <p className="rule-chat__sentence">{supported ? cardSentence(c) : c.quote || c.title}</p>
          {!supported && <p className="rule-chat__hint">系统暂无此类规则的转换能力，已保留为需求。</p>}
          {supported && c.clinicalMeaning && <p className="rule-chat__meaning">{c.clinicalMeaning}</p>}
          {c.boundaryNote && <p className="rule-chat__boundary">{c.boundaryNote}</p>}
          {supported && (view.groupACandidates.length > 0 || view.groupBCandidates.length > 0) && <div className="rule-chat__meds">{drugRows(view, 'A', view.groupACandidates)}{drugRows(view, 'B', view.groupBCandidates)}</div>}
          {needAction && <div className="rule-chat__quick"><span>命中后：</span>{actionChoices.map(([value, name]) => <Button key={value} size="sm" variant="secondary" disabled={busy} onClick={() => ask(`把“${c.title}”的处置方式设为${name}`)}>{name}</Button>)}</div>}
          {view.kindName.startsWith('配伍') && !supported && <div className="rule-chat__quick"><span>想让系统检查？</span><Button size="sm" variant="secondary" disabled={busy} onClick={() => ask(`把“${c.title}”按两药合用处理：同一处方同时开立时提示`)}>按两药合用处理</Button></div>}
          {!!questions.length && <div className="rule-chat__asks"><span>待确认，点击后在左侧回答：</span>{questions.map((q, i) => <Button key={i} size="sm" variant="text" className="rule-chat__ask" onClick={() => reply(q)}>{q}</Button>)}</div>}
          {!!c.otherConditions && <details className="rule-chat__quote"><summary>系统暂无法表达的条件</summary><blockquote>{c.otherConditions}</blockquote></details>}
          {supported && c.quote && <details className="rule-chat__quote"><summary>对应原文</summary><blockquote>{c.quote}</blockquote></details>}
          {supported && <footer>{!!view.missing.length && <small className="rule-chat__missing">待补充：{view.missing.join('、')}</small>}<Button size="sm" variant={view.state === 'READY' ? 'primary' : 'secondary'} disabled={busy} onClick={() => confirm(view)}>确认并转为系统规则</Button></footer>}
        </article> })}
      </div>
    </WorkspacePane>
  </div>
}

/** Names with exactly one standard classification or drug are attached automatically; the maintainer can still remove them. */
function autoPick(prev: Record<string, Picked[]>, cards: RuleCardView[], dismissed: Set<string>): Record<string, Picked[]> {
  const next = { ...prev }
  for (const view of cards) for (const [group, items] of [['A', view.groupACandidates], ['B', view.groupBCandidates]] as const) for (const item of items) {
    const key = `${view.card.id}|${group}`, options = optionsOf(item)
    if (options.length !== 1 || dismissed.has(`${key}|${item.name}`) || (next[key] ?? []).some(p => p.name === item.name)) continue
    next[key] = [...(next[key] ?? []), { name: item.name, label: options[0].label, target: options[0].target, key: options[0].key }]
  }
  return next
}
