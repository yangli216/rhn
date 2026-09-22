import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeBody, KnowledgeEvidence, KnowledgeExtractionRun, KnowledgeTarget } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Select, StatusBadge } from '../../shared/ui'
import './medication-knowledge-extraction.css'

const fieldNames: Record<string, string> = { kind: '知识类型', matchMode: '匹配方式', minimumOrders: '触发医嘱条数', exposureScope: '检查范围', ageMode: '年龄范围', ageUnit: '年龄单位', minimumAgeInclusive: '年龄下限（含）', maximumAgeExclusive: '年龄上限（不含）', groupARouteMode: 'A 组途径范围', groupBRouteMode: 'B 组途径范围', groupARouteNames: 'A 组给药途径', groupBRouteNames: 'B 组给药途径', clinicalMeaning: '临床意义', severity: '建议风险', proposedAction: '建议动作' }
const valueNames: Record<string, string> = { DUPLICATE_THERAPY: '重复用药', DRUG_INTERACTION: '相互作用', SAME_STANDARD_ENTRY: '同一标准条目', EXPLICIT_GROUP: '明确药品组', GROUP_PAIR: '两组配对', SAME_PRESCRIPTION: '同一处方', OVERLAPPING_COURSES: '疗程重叠（待支持）', CURRENT_MEDICATIONS: '在用药清单（待支持）', ALL: '不限（需核对依据）', RANGE: '限定年龄', LIST: '限定途径', YEAR: '岁', MONTH: '月龄', DAY: '日龄', LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '极高', WARN: '警告', REQUIRE_OVERRIDE: '需理由后继续', BLOCK: '阻断' }
export function MedicationKnowledgeExtractionDialog({ api, evidence: initial, runId, onClose, onAdopt }: {
  api: RhnApi; evidence: KnowledgeEvidence; runId?: string; onClose: () => void
  onAdopt: (body: KnowledgeBody, runId: string, labels: Record<string, string>) => void
}) {
  const cache = useQueryClient()
  const [evidence, setEvidence] = useState(initial), [requirement, setRequirement] = useState('')
  const [run, setRun] = useState<KnowledgeExtractionRun>(), [selected, setSelected] = useState<Record<number, string>>({})
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0)
  const status = useQuery({ queryKey: ['knowledge-extraction-status'], queryFn: () => api.medicationKnowledgeDrafts.extractionStatus(), enabled: !runId })
  const history = useQuery({ queryKey: ['knowledge-extractions', page], queryFn: () => api.medicationKnowledgeDrafts.extractions(page), enabled: !runId })
  const saved = useQuery({ queryKey: ['knowledge-extraction', runId], queryFn: () => api.medicationKnowledgeDrafts.extraction(runId!), enabled: !!runId })
  const current = runId ? saved.data : run
  const displayedEvidence = runId ? current?.input.evidence ?? initial : evidence
  const clearResult = () => { setRun(undefined); setSelected({}); setReviewed(false); setError('') }
  const change = (patch: Partial<KnowledgeEvidence>) => { setEvidence(value => ({ ...value, ...patch })); clearResult() }
  const extract = async () => {
    setBusy(true); clearResult()
    try { setRun(await api.medicationKnowledgeDrafts.extract({ evidence, requirement })); await cache.invalidateQueries({ queryKey: ['knowledge-extractions'] }) }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const load = async (id: string) => {
    setBusy(true); clearResult()
    try { const value = await api.medicationKnowledgeDrafts.extraction(id); setRun(value); setEvidence(value.input.evidence); setRequirement(value.input.requirement ?? '') }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const adopt = () => {
    if (!current?.result.adoptable || !current.result.suggestedBody || !reviewed) return
    const body: KnowledgeBody = structuredClone(current.result.suggestedBody), labels: Record<string, string> = {}, unresolved: string[] = []
    current.result.medications.forEach((item, index) => {
      const ref = item.candidates.find(c => c.specificationId === selected[index])
      if (!ref) { unresolved.push(`${item.mention.group} 组：${item.mention.name}（${item.mention.quote}）`); return }
      const target: KnowledgeTarget = { level: item.mention.level, specificationId: ref.specificationId, catalogId: ref.catalogId, catalogVersion: ref.catalogVersion, contentHash: ref.contentHash }
      const key = item.mention.group === 'B' ? 'groupB' : 'groupA'
      if (!body[key].some(t => t.specificationId === target.specificationId && t.level === target.level)) body[key].push(target)
      labels[ref.specificationId] = `${ref.name} · ${ref.preparationSpec}`
    })
    if (unresolved.length) body.conditions.additionalConditions = [body.conditions.additionalConditions, `待明确标准范围：${unresolved.join('；')}`].filter(Boolean).join('\n')
    onAdopt(body, current.id, labels)
  }
  return <Dialog title={runId ? 'AI 知识抽取记录' : '从来源原文提取知识'} size="xwide" enterNavigation={false} onClose={() => { if (!busy) onClose() }}>
    <p>先提供原文，AI 辅助提取重复用药与相互作用条件；标准候选和原文含义由药师确认。填入将创建新的未保存草稿，随后需保存并核验依据，不会直接发布。</p>
    {error && <Alert tone="error">{error}</Alert>}{saved.error && <Alert tone="error">{errorMessage(saved.error)}</Alert>}
    <div className="knowledge-extraction-columns">
      <section className="knowledge-extraction-pane"><h4>1. 来源原文</h4>
        <fieldset disabled={busy || !!runId}>
          <FormField label="抽取来源标题"><input aria-label="抽取来源标题" maxLength={500} value={displayedEvidence.title ?? ''} onChange={e => change({ title: e.target.value })} /></FormField>
          <FormField label="抽取原文定位"><input aria-label="抽取原文定位" maxLength={2000} value={displayedEvidence.locator ?? ''} onChange={e => change({ locator: e.target.value })} placeholder="页码、章节或可追溯链接" /></FormField>
          <FormField label="供 AI 提取的原文"><textarea aria-label="供 AI 提取的原文" rows={12} maxLength={8000} value={displayedEvidence.excerpt ?? ''} onChange={e => change({ excerpt: e.target.value })} placeholder="粘贴一条完整规则的依据，包含适用条件与例外。来源元数据可回到草稿中补充。" /></FormField>
          <FormField label="关注点（不作为证据）"><textarea aria-label="抽取关注点" rows={2} maxLength={2000} value={runId ? current?.input.requirement ?? '' : requirement} onChange={e => { setRequirement(e.target.value); clearResult() }} placeholder="例如：这段原文描述的是同成分重复，还是两组药物相互作用？" /></FormField>
        </fieldset>
        {!runId && <><p>{status.data?.available ? `已配置模型：${status.data.model}` : status.data?.message ?? '正在读取模型配置…'}</p>{status.error && <Alert tone="error">{errorMessage(status.error)}</Alert>}<Button disabled={busy || !status.data?.available || !evidence.excerpt.trim()} onClick={() => void extract()}>{busy ? '处理中…' : 'AI 提取知识'}</Button></>}
        {current && <small className="knowledge-extraction-meta">抽取记录 {current.id}<br />{current.model} · {current.promptVersion}<br />{current.actor} · {new Date(current.createdAt).toLocaleString()}<br />原文文本 SHA-256（不是来源文件指纹）：{current.sourceTextHash}</small>}
      </section>
      <section className="knowledge-extraction-pane"><h4>2. 对照原文与标准范围</h4>
        {!current && <p>提取后逐项显示建议值和原文引用。原文未明确的条件会保留为空，不自动补为不限。</p>}
        {current && <><StatusBadge tone="warning">AI 建议 · 未经药师审核</StatusBadge><h4>{current.result.suggestedBody?.title || '未形成草稿'}</h4>
          {current.result.citations.map((c, i) => <article className="knowledge-extraction-citation" key={i}><strong>{fieldNames[c.field] ?? c.field}：{valueNames[c.value] ?? c.value}</strong><blockquote>{c.quote}</blockquote><small>原文第 {c.start + 1}–{c.end} 字符；只核对引用位置，未验证含义</small></article>)}
          {current.result.medications.map((item, index) => <article className="knowledge-extraction-citation" key={index}><strong>{item.mention.group} 组 · {item.mention.name}</strong><blockquote>{item.mention.quote}</blockquote><p>{item.mention.level === 'ENTRY' ? '范围：标准条目的全部规格，所选规格用于确认条目身份' : item.mention.level === 'SPECIFICATION' ? `范围：指定规格，原文规格 ${item.mention.specificationText || '待明确'}` : '类别、成分或层级待明确，需补充标准范围'}</p>
            {!!item.candidates.length && <Select aria-label={`确认 ${item.mention.group} 组 ${item.mention.name} 标准范围 ${index + 1}`} value={selected[index] ?? ''} onChange={value => { setSelected(v => ({ ...v, [index]: value })); setReviewed(false) }} disabled={busy || !!runId} placeholder="人工核对后选择标准候选" options={item.candidates.map(c => ({ value: c.specificationId, label: `${c.name} · ${c.doseForm} · ${c.preparationSpec} · ${c.catalogVersion}` }))} />}
            {!item.candidates.length && <small>没有可直接确认的标准候选；采纳后保留范围缺口，可在草稿中选择标准药品。</small>}
          </article>)}
          {!!current.result.suggestedBody?.conditions.additionalConditions && <Alert tone="warning">待结构化条件：{current.result.suggestedBody.conditions.additionalConditions}</Alert>}
        </>}
      </section>
      <aside className="knowledge-extraction-pane"><h4>3. 澄清与采纳</h4>
        {current && <><ul>{current.result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          {!runId && <><label className="knowledge-extraction-confirm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy || !current.result.adoptable} />我已对照原文检查建议和遗漏条件；未明确项保留为草稿缺口，尚未完成临床审核。</label><Button disabled={busy || !current.result.adoptable || !reviewed} onClick={adopt}>填入未保存草稿</Button></>}
          <details><summary>模型原始输出（审计）</summary>{current.rawOutputTruncated && <p>模型输出超长，仅保留前 60000 字符，本次不可采纳。</p>}<pre>{current.rawOutput}</pre></details></>}
        {!runId && <><h4>抽取历史</h4>{history.error && <Alert tone="error">{errorMessage(history.error)}</Alert>}{history.data?.map(item => <Button key={item.id} variant="secondary" size="sm" disabled={busy} onClick={() => void load(item.id)}>{item.title || '未命名来源'} · {new Date(item.createdAt).toLocaleString()} · {item.adoptable ? '待核对' : '未形成草稿'}</Button>)}
          <div className="knowledge-toolbar"><Button variant="secondary" size="sm" disabled={busy || page === 0} onClick={() => setPage(v => v - 1)}>上一批记录</Button><Button variant="secondary" size="sm" disabled={busy || !history.data || history.data.length < 20} onClick={() => setPage(v => v + 1)}>下一批记录</Button></div></>}
      </aside>
    </div>
  </Dialog>
}
