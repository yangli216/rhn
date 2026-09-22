import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeAssessment, KnowledgeBody, KnowledgeCase, KnowledgeDetail, KnowledgeRoutes, KnowledgeVersion } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination, SearchField, Select, StatusBadge } from '../../shared/ui'
import { MedicationKnowledgeExtractionDialog } from './MedicationKnowledgeExtractionDialog'
import { MedicationKnowledgeRuleDialog } from './MedicationKnowledgeRuleDialog'
import { MedicationKnowledgeReplayDialog } from './MedicationKnowledgeReplayDialog'
import { IntakeSource, type IntakeSeed } from './MedicationRuleIntake'
import type { RuleIntakeRun } from '../../shared/api/medicationKnowledgeDraftApi'
import { KnowledgeTargetPicker } from './KnowledgeTargetPicker'
import { MedicationKnowledgeExamplesDialog } from './MedicationKnowledgeExamplesDialog'
import './medication-knowledge-drafts.css'

const option = (entries: Record<string, string>) => Object.entries(entries).map(([value, label]) => ({ value, label }))
const kindNames = { DUPLICATE_THERAPY: '重复用药', DRUG_INTERACTION: '相互作用' }
const outcomeNames: Record<string, string> = { MATCH: '匹配命中', NO_MATCH: '不匹配', NOT_APPLICABLE: '不适用', UNAVAILABLE: '无法评价' }
export function emptyKnowledge(kind = 'DUPLICATE_THERAPY'): KnowledgeBody {
  return { title: '', kind, matchMode: kind === 'DRUG_INTERACTION' ? 'GROUP_PAIR' : 'SAME_STANDARD_ENTRY', groupA: [], groupB: [], minimumOrders: kind === 'DRUG_INTERACTION' ? null : 2,
    exposureScope: 'SAME_PRESCRIPTION', conditions: { ageMode: 'UNSPECIFIED', ageUnit: 'YEAR', minimumAgeInclusive: null, maximumAgeExclusive: null, groupARoutes: { mode: 'UNSPECIFIED', codes: [] }, groupBRoutes: { mode: kind === 'DRUG_INTERACTION' ? 'UNSPECIFIED' : 'ALL', codes: [] }, additionalConditions: '' },
    evidence: { sourceType: '', title: '', publisher: '', edition: '', locator: '', excerpt: '', documentHash: '', effectiveFrom: null, effectiveTo: null }, clinicalMeaning: '', severity: '', proposedAction: '' }
}
function normalize(body: KnowledgeBody): KnowledgeBody {
  const defaults = emptyKnowledge(body.kind)
  const c = { ...defaults.conditions, ...body.conditions }
  const e = { ...defaults.evidence, ...body.evidence }
  return { ...defaults, ...body, title: body.title ?? '', clinicalMeaning: body.clinicalMeaning ?? '', severity: body.severity ?? '', proposedAction: body.proposedAction ?? '',
    groupA: body.groupA ?? [], groupB: body.groupB ?? [], conditions: { ...c, ageMode: c.ageMode ?? 'UNSPECIFIED', groupARoutes: c.groupARoutes ?? defaults.conditions.groupARoutes, groupBRoutes: c.groupBRoutes ?? defaults.conditions.groupBRoutes, additionalConditions: c.additionalConditions ?? '' },
    evidence: { ...e, sourceType: e.sourceType ?? '', title: e.title ?? '', publisher: e.publisher ?? '', edition: e.edition ?? '', locator: e.locator ?? '', excerpt: e.excerpt ?? '', documentHash: e.documentHash ?? '' } }

}
function intakeBody(seed?: IntakeSeed): KnowledgeBody {
  const b = emptyKnowledge(seed?.kind)
  return seed ? { ...b, title: `${seed.kind === 'DRUG_INTERACTION' ? '相互作用' : '重复用药'}需求草稿`, matchMode: seed.kind === 'DRUG_INTERACTION' ? 'GROUP_PAIR' : '', minimumOrders: null, exposureScope: '', conditions: { ...b.conditions, ageUnit: null, additionalConditions: `需求分析 ${seed.run.id} 尚待逐项结构化。请核对关联记录中的完整原需求、澄清及例外；将可表达条件填入对应字段，未支持条件需继续保留。` } } : b
}
export function MedicationKnowledgeDrafts({ api, initialIntake, onIntakeConsumed, onBusy }: { api: RhnApi; initialIntake?: IntakeSeed; onIntakeConsumed?: () => void; onBusy?: (busy: boolean) => void }) {
  const cache = useQueryClient()
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [intakeId, setIntakeId] = useState<string | undefined>(initialIntake?.run.id)
  const [originView, setOriginView] = useState<RuleIntakeRun | null>()
  const intake = useQuery({ queryKey: ['knowledge-intake-origin', intakeId], queryFn: () => api.medicationKnowledgeDrafts.intake(intakeId!), enabled: !!intakeId, retry: false })
  useEffect(() => { if (initialIntake) onIntakeConsumed?.() }, [])
  const [replayOpen, setReplayOpen] = useState(false), [ruleOpen, setRuleOpen] = useState(false)
  const [extractionOpen, setExtractionOpen] = useState(false), [extractionRecord, setExtractionRecord] = useState<string>()
  const [extractionId, setExtractionId] = useState<string>(), [extractionDetached, setExtractionDetached] = useState(false)
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const [body, setBody] = useState<KnowledgeBody>(() => intakeBody(initialIntake)), [detail, setDetail] = useState<KnowledgeDetail>()
  const [assessment, setAssessment] = useState<KnowledgeAssessment>(), [cases, setCases] = useState<KnowledgeCase[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({}), [picker, setPicker] = useState<'groupA' | 'groupB'>()
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(!!initialIntake)
  useEffect(() => { onBusy?.(!!busy) }, [busy, onBusy])
  const [pending, setPending] = useState<(() => void)>(), [historyOpen, setHistoryOpen] = useState(false), [historyPage, setHistoryPage] = useState(0)
  const drafts = useQuery({ queryKey: ['medication-knowledge-drafts', query, page], queryFn: () => api.medicationKnowledgeDrafts.list(query, page) })
  const standards = useQuery({ queryKey: ['knowledge-route-options'], queryFn: () => api.masterData.clinicalMedicationStandards() })
  const history = useQuery({ queryKey: ['medication-knowledge-history', detail?.saved.id, detail?.saved.version, historyPage], queryFn: () => api.medicationKnowledgeDrafts.history(detail!.saved.id, historyPage), enabled: historyOpen && !!detail })
  const interaction = body.kind === 'DRUG_INTERACTION'
  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action() }
  const change = (patch: Partial<KnowledgeBody>) => { setBody(value => ({ ...value, ...patch })); setDirty(true); setAssessment(undefined); setCases([]); setNotice('') }
  const conditions = (patch: Partial<KnowledgeBody['conditions']>) => change({ conditions: { ...body.conditions, ...patch } })
  const evidence = (patch: Partial<KnowledgeBody['evidence']>) => { change({ evidence: { ...body.evidence, ...patch } }); if (patch.excerpt !== undefined && patch.excerpt !== body.evidence.excerpt && extractionId) { setExtractionId(undefined); setExtractionDetached(true) } }
  const task = async (label: string, action: () => Promise<void>) => { setBusy(label); setError(''); setNotice(''); try { await action() } catch (e) { setError(errorMessage(e)) } finally { setBusy('') } }
  const adopt = (value: KnowledgeDetail) => {
    setImprovementReady(true)
    setIntakeId(value.intakeId ?? undefined); setExtractionDetached(false); setExtractionId(value.saved.extractionId ?? undefined); setDetail(value); setBody(normalize(value.saved.body)); setAssessment(value.currentAssessment); setCases(value.cases); setReason(''); setDirty(false)
    setLabels(Object.fromEntries([...value.saved.assessment.groupA, ...value.saved.assessment.groupB].map(t => [t.reference.specificationId, `${t.reference.name} · ${t.reference.preparationSpec}`])))
  }
  const [improvementReady, setImprovementReady] = useState(!initialIntake?.knowledgeId)
  useEffect(() => {
    if (!initialIntake?.knowledgeId) return
    let active = true
    setBusy('读取待改进知识'); setError('')
    void api.medicationKnowledgeDrafts.detail(initialIntake.knowledgeId).then(value => {
      if (!active) return
      if (value.saved.body.kind !== initialIntake.kind) throw new Error('分析类型与原知识不同，请回到知识工作台单独建立该类知识，不能覆盖原类型。')
      adopt(value)
      const next = normalize(value.saved.body)
      next.conditions.additionalConditions = `改进需求 ${initialIntake.run.id} 尚待逐项核对与结构化。请对照原反馈、最新知识和独立来源处理，未支持的条件继续保留。\n${next.conditions.additionalConditions}`
      setBody(next); setIntakeId(initialIntake.run.id); setAssessment(undefined); setCases([]); setDirty(true); setImprovementReady(true)
      setNotice(`已载入当前第 ${value.saved.version} 版供修改，尚未保存。原反馈可能引用更早版本，请逐项比较。`)
    }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setBusy('') })
    return () => { active = false }
  }, [])
  const open = (id: string) => guard(() => { void task('读取草稿', async () => adopt(await api.medicationKnowledgeDrafts.detail(id))) })
  const create = (kind: string) => guard(() => { setImprovementReady(true); setIntakeId(undefined); setExtractionDetached(false); setExtractionId(undefined); setDetail(undefined); setBody(emptyKnowledge(kind)); setAssessment(undefined); setCases([]); setLabels({}); setReason(''); setDirty(false); setNotice(''); setError('') })
  const save = () => { if (!improvementReady) return; void task('保存版本', async () => { const result = await api.medicationKnowledgeDrafts.save(detail?.saved.id, detail?.saved.version ?? 0, body, reason, extractionId, intakeId); adopt(result); setNotice(`已保存草稿第 ${result.saved.version} 版，尚未审核或发布。`); await cache.invalidateQueries({ queryKey: ['medication-knowledge-drafts'] }) }) }
  const validate = () => { void task('校验结构', async () => { const result = await api.medicationKnowledgeDrafts.validate(body); setAssessment(result); setCases(result.structureComplete ? await api.medicationKnowledgeDrafts.preview(body) : []) }) }
  const routeEditor = (key: 'groupARoutes' | 'groupBRoutes', title: string) => {
    const route: KnowledgeRoutes = body.conditions[key] ?? { mode: 'UNSPECIFIED', codes: [] }
    return <div className="knowledge-route"><FormField label={title}><Select aria-label={title} clearable={false} value={route.mode} onChange={mode => conditions({ [key]: { mode, codes: [] } })} options={option({ UNSPECIFIED: '待明确', ALL: '不限途径（须有依据）', LIST: '限定标准途径' })} /></FormField>
      {route.mode === 'LIST' && <><Select aria-label={`${title}添加途径`} value="" onChange={code => { if (code && !route.codes.includes(code)) conditions({ [key]: { ...route, codes: [...route.codes, code] } }) }} options={(standards.data?.routes ?? []).map(r => ({ value: r.code, label: r.name }))} placeholder="添加标准途径" />
        <div className="knowledge-tags">{route.codes.map(code => <Button key={code} variant="secondary" size="sm" onClick={() => conditions({ [key]: { ...route, codes: route.codes.filter(c => c !== code) } })}>{standards.data?.routes.find(r => r.code === code)?.name ?? code} ×</Button>)}</div></>}
    </div>
  }
  const groupEditor = (key: 'groupA' | 'groupB', title: string) => <section className="knowledge-group"><div className="knowledge-toolbar"><strong>{title}</strong><Button size="sm" variant="secondary" onClick={() => setPicker(key)}>添加标准药品至{key === 'groupA' ? ' A 组' : ' B 组'}</Button></div>
    {!body[key].length && <small>尚未选择标准药品。范围由证据确定，系统不自动推断药理等效性。</small>}
    {body[key].map((t, index) => <div className="knowledge-target" key={`${t.level}-${t.specificationId}-${index}`}><div>{labels[t.specificationId] ?? t.specificationId}<small>{t.level === 'ENTRY' ? '标准条目全部规格' : '仅指定规格'} · {t.catalogVersion}</small></div><Button variant="secondary" size="sm" onClick={() => change({ [key]: body[key].filter((_, i) => i !== index) })}>移除</Button></div>)}</section>
  return <section className="knowledge-workspace" aria-label="规则知识草稿工作台">
    {intakeId && <details className="knowledge-intake-origin"><summary>关联需求分析 · 非药学证据</summary>{intake.error && <Alert tone="error">{errorMessage(intake.error)}</Alert>}{!intake.isError && intake.data && <IntakeSource run={intake.data} api={api} />}</details>}
    <div className="knowledge-heading"><div><h3>规则知识草稿</h3><p>标准身份 → 来源与适用条件 → 结构校验 → 合成样例。当前保存为草稿，结构完整不等于证据已核验。</p></div><div className="knowledge-toolbar"><Button variant="secondary" disabled={!!busy} onClick={() => setExamplesOpen(true)}>重复用药与相互作用验收样例</Button><Button disabled={!!busy} onClick={() => { setExtractionRecord(undefined); setExtractionOpen(true) }}>AI 从原文提取知识</Button><StatusBadge tone="warning">草稿未生效 · 发布在统一目录</StatusBadge></div></div>
    {error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}
    <div className="knowledge-columns">
      <aside className="knowledge-pane knowledge-queue"><h4>知识目录</h4><div className="knowledge-toolbar"><Button size="sm" disabled={!!busy} onClick={() => create('DUPLICATE_THERAPY')}>新建重复用药</Button><Button size="sm" disabled={!!busy} onClick={() => create('DRUG_INTERACTION')}>新建相互作用</Button></div>
        <form onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setPage(0) }}><SearchField label="检索知识草稿" value={search} onChange={setSearch} placeholder="标题，回车查询" /></form>
        {drafts.error && <Alert tone="error">{errorMessage(drafts.error)}</Alert>}{drafts.isPending && <p>读取草稿目录…</p>}
        {drafts.data?.content.map(v => <button type="button" disabled={!!busy} key={v.id} className={`knowledge-queue__item ${detail?.saved.id === v.id ? 'is-selected' : ''}`} onClick={() => open(v.id)}><strong>{v.title}</strong><small>{kindNames[v.kind as keyof typeof kindNames] ?? v.kind} · 第 {v.version} 版</small><span>{v.structureComplete ? '结构完整 · 待证据审核' : '结构待补充'} · 草稿</span></button>)}
        {drafts.data && !drafts.data.content.length && <p>暂无匹配草稿。可从重复用药或相互作用开始建立知识。</p>}
        {drafts.data && <Pagination page={page} totalPages={Math.max(1, drafts.data.totalPages)} pageSize={20} total={drafts.data.totalElements} onChange={setPage} label="知识草稿分页" />}
      </aside>
      <section className="knowledge-pane knowledge-editor"><div className="knowledge-toolbar"><h4>{detail ? `编辑第 ${detail.saved.version} 版` : '新建知识草稿'}</h4>{detail && <Button size="sm" variant="secondary" onClick={() => { setHistoryPage(0); setHistoryOpen(true) }}>版本与原文历史</Button>}{dirty && <StatusBadge tone="warning">有未保存修改</StatusBadge>}</div>
        <fieldset disabled={!!busy}><FormField label="知识标题"><input aria-label="知识标题" maxLength={200} value={body.title} onChange={e => change({ title: e.target.value })} /></FormField>
          <div className="knowledge-form-grid"><FormField label="知识类型"><input aria-label="知识类型" readOnly value={interaction ? '两组药品相互作用' : '重复用药'} /></FormField>
            <FormField label="匹配方式"><Select aria-label="匹配方式" clearable={false} value={body.matchMode} onChange={matchMode => { if (body.groupA.length) guard(() => change({ matchMode, groupA: [] })); else change({ matchMode }) }} options={interaction ? option({ GROUP_PAIR: 'A／B 两组不同医嘱配对' }) : option({ SAME_STANDARD_ENTRY: '同一标准条目重复开立', EXPLICIT_GROUP: '明确药品组重复治疗' })} /></FormField></div>
          {!body.matchMode ? <p>先依据原文选择匹配方式。同一标准条目重复可覆盖全部已标准化药品，无需逐个选药。</p> : body.matchMode === 'SAME_STANDARD_ENTRY' ? <p className="knowledge-note">适用于所有具有一致标准身份的药品，无需逐个选药。同一条目的不同规格合并计数；不同条目不自动按活性成分合并。</p> : groupEditor('groupA', interaction ? 'A 组药品' : '重复治疗药品组')}
          {interaction && groupEditor('groupB', 'B 组药品')}
          <div className="knowledge-form-grid"><FormField label="检查范围"><Select aria-label="检查范围" clearable={false} value={body.exposureScope} onChange={exposureScope => change({ exposureScope })} options={option({ SAME_PRESCRIPTION: '同一处方', OVERLAPPING_COURSES: '疗程重叠（待支持）', CURRENT_MEDICATIONS: '在用药清单（待支持）' })} /></FormField>
            {!interaction && <FormField label="触发医嘱条数"><input aria-label="触发医嘱条数" type="number" min={2} max={20} value={body.minimumOrders ?? ''} onChange={e => change({ minimumOrders: e.target.value === '' ? null : Number(e.target.value) })} /></FormField>}</div>
          <h4>适用条件</h4><div className="knowledge-form-grid"><FormField label="年龄范围"><Select aria-label="年龄范围" clearable={false} value={body.conditions.ageMode} onChange={ageMode => conditions({ ageMode, minimumAgeInclusive: null, maximumAgeExclusive: null })} options={option({ UNSPECIFIED: '待明确', ALL: '不限年龄（须有依据）', RANGE: '限定年龄范围' })} /></FormField>
            {body.conditions.ageMode === 'RANGE' && <><FormField label="年龄单位"><Select aria-label="年龄单位" clearable={false} value={body.conditions.ageUnit ?? ''} onChange={ageUnit => conditions({ ageUnit })} options={option({ YEAR: '岁', MONTH: '月龄', DAY: '日龄' })} /></FormField>
              <FormField label="年龄下限（含）"><input aria-label="年龄下限（含）" type="number" min={0} value={body.conditions.minimumAgeInclusive ?? ''} onChange={e => conditions({ minimumAgeInclusive: e.target.value === '' ? null : Number(e.target.value) })} /></FormField>
              <FormField label="年龄上限（不含）"><input aria-label="年龄上限（不含）" type="number" min={1} value={body.conditions.maximumAgeExclusive ?? ''} onChange={e => conditions({ maximumAgeExclusive: e.target.value === '' ? null : Number(e.target.value) })} /></FormField></>}
          </div><div className="knowledge-form-grid">{routeEditor('groupARoutes', interaction ? 'A 组给药途径' : '给药途径')}{interaction && routeEditor('groupBRoutes', 'B 组给药途径')}</div>
          {standards.error && <Alert tone="error">标准途径读取失败：{errorMessage(standards.error)}</Alert>}
          <FormField label="其他适用条件（待结构化）"><textarea aria-label="其他适用条件" rows={2} maxLength={4000} value={body.conditions.additionalConditions} onChange={e => conditions({ additionalConditions: e.target.value })} placeholder="例如需结合肾功能、给药间隔。填写后保留原文并标记能力缺口，不会被忽略。" /></FormField>
          <h4>来源证据</h4>{extractionDetached && <p className="knowledge-note">原文已修改，已取消与旧抽取记录的关联；可重新抽取。</p>}{extractionId && <div className="knowledge-toolbar"><StatusBadge tone="info">关联 AI 抽取记录</StatusBadge><Button size="sm" variant="secondary" onClick={() => { setExtractionRecord(extractionId); setExtractionOpen(true) }}>查看抽取原文与建议</Button><Button size="sm" variant="secondary" onClick={() => { setExtractionId(undefined); setDirty(true) }}>取消抽取关联</Button></div>}<div className="knowledge-form-grid">
            <FormField label="来源类型"><Select aria-label="来源类型" value={body.evidence.sourceType} onChange={sourceType => evidence({ sourceType })} options={option({ LABEL: '药品说明书', GUIDELINE: '指南 / 共识', LITERATURE: '研究文献', INSTITUTION_POLICY: '机构管理规范', REGULATION: '法规 / 规章' })} /></FormField>
            <FormField label="来源标题"><input aria-label="来源标题" maxLength={500} value={body.evidence.title} onChange={e => evidence({ title: e.target.value })} /></FormField>
            <FormField label="发布机构"><input aria-label="发布机构" maxLength={300} value={body.evidence.publisher} onChange={e => evidence({ publisher: e.target.value })} /></FormField>
            <FormField label="版本 / 发布日期"><input aria-label="来源版本" maxLength={200} value={body.evidence.edition} onChange={e => evidence({ edition: e.target.value })} /></FormField>
          </div><FormField label="原文定位（页码、章节或链接）"><input aria-label="原文定位" maxLength={2000} value={body.evidence.locator} onChange={e => evidence({ locator: e.target.value })} /></FormField>
          <FormField label="支持规则的原文片段"><textarea aria-label="来源原文片段" rows={4} maxLength={8000} value={body.evidence.excerpt} onChange={e => evidence({ excerpt: e.target.value })} /></FormField>
          <FormField label="来源文件指纹（SHA-256）"><input aria-label="来源文件指纹" maxLength={64} value={body.evidence.documentHash} onChange={e => evidence({ documentHash: e.target.value })} /></FormField>
          <label className="knowledge-file">选择来源文件生成指纹<input aria-label="选择来源文件生成指纹" type="file" onChange={e => { const file = e.target.files?.[0]; if (!file) return; void task('计算来源指纹', async () => { if (file.size > 50 * 1024 * 1024) throw new Error('来源文件请控制在 50 MB 以内'); const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); evidence({ documentHash: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') }); setNotice('已生成文件指纹；文件未上传，请在原文定位中填写可追溯的存放位置。') }) }} /></label>
          <div className="knowledge-form-grid"><FormField label="来源有效期开始（可选）"><input aria-label="来源有效期开始" type="date" value={body.evidence.effectiveFrom ?? ''} onChange={e => evidence({ effectiveFrom: e.target.value || null })} /></FormField><FormField label="来源有效期结束（可选）"><input aria-label="来源有效期结束" type="date" value={body.evidence.effectiveTo ?? ''} onChange={e => evidence({ effectiveTo: e.target.value || null })} /></FormField></div>
          <h4>临床意义与建议</h4><FormField label="临床意义与处置说明"><textarea aria-label="临床意义与处置说明" rows={3} maxLength={4000} value={body.clinicalMeaning} onChange={e => change({ clinicalMeaning: e.target.value })} /></FormField>
          <div className="knowledge-form-grid"><FormField label="建议风险等级"><Select aria-label="建议风险等级" value={body.severity} onChange={severity => change({ severity })} options={option({ LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '极高' })} /></FormField><FormField label="建议动作"><Select aria-label="建议动作" value={body.proposedAction} onChange={proposedAction => change({ proposedAction })} options={option({ WARN: '警告提示', REQUIRE_OVERRIDE: '需理由后继续', BLOCK: '阻断' })} /></FormField></div>
          <FormField label="本次保存原因"><input aria-label="本次保存原因" maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); setDirty(true) }} /></FormField>
        </fieldset><div className="knowledge-actions"><Button variant="secondary" disabled={!!busy} onClick={validate}>校验并预演</Button><Button variant="primary" disabled={!!busy || !improvementReady || !body.title.trim() || !reason.trim()} onClick={save}>{busy || '保存草稿新版本'}</Button></div>
      </section>
      <aside className="knowledge-pane knowledge-validation"><h4>结构校验与预演</h4><p>测试由当前结构生成，用于检查表达和匹配边界。它们不是临床证据或独立专家测试集。</p>
        {detail && <><Button variant="secondary" disabled={!!busy || dirty} onClick={() => setReplayOpen(true)}>历史处方快照回放</Button><Button variant="secondary" disabled={!!busy || dirty} onClick={() => setRuleOpen(true)}>生成规则候选</Button>{dirty && <p>请先保存修改，再对固定知识版本回放。</p>}</>}
        {!assessment && <p>点击“校验并预演”检查当前内容。编辑后需重新校验。</p>}
        {assessment && <><StatusBadge tone={assessment.structureComplete ? 'info' : 'warning'}>{assessment.structureComplete ? '结构完整 · 证据仍待核验' : `${assessment.issues.length} 项结构缺口`}</StatusBadge><p>{assessment.ruleDescription}</p>
          <ul className="knowledge-issues">{assessment.issues.map((issue, i) => <li key={`${issue.field}-${i}`}>{issue.message}</li>)}</ul>
          {cases.length > 0 && <><h4>合成样例 {cases.filter(c => c.passed).length} / {cases.length} 通过</h4>{cases.map((c, i) => <details key={i} className="knowledge-case"><summary>{c.passed ? '✓' : '×'} {c.name}</summary><p>预期：{outcomeNames[c.expected]}；实际：{outcomeNames[c.actual.outcome]}</p><p>{c.actual.reasons.join('；')}</p><small>年龄：{c.input.age ?? '未知'} {c.input.ageUnit ?? ''}；评价日期：{c.input.date}</small><ul>{c.input.medications.map((r, j) => <li key={j}>{r.orderId} · {r.entryId || '身份缺失'} · {r.specificationId || '规格缺失'} · {r.routeCode || '途径缺失'} · {r.status}</li>)}</ul></details>)}</>}
        </>}
        {!dirty && !!detail?.possibleConflicts.length && <><h4>需比对的其他草稿</h4>{detail.possibleConflicts.map(c => <div className="knowledge-related" key={c.id}><strong>{c.title} · 第 {c.version} 版</strong><p>{c.reason}</p><Button size="sm" disabled={!!busy} onClick={() => open(c.id)}>查看草稿</Button></div>)}</>}
      </aside>
    </div>
    {extractionOpen && <MedicationKnowledgeExtractionDialog api={api} evidence={body.evidence} runId={extractionRecord} onClose={() => setExtractionOpen(false)} onAdopt={(suggested, id, targetLabels) => guard(() => {
      if (suggested.kind !== body.kind) setIntakeId(undefined)
      const next = normalize(suggested)
      if (intakeId && suggested.kind === body.kind) next.conditions.additionalConditions = `需求分析 ${intakeId} 仍须与本次抽取逐项对照并结构化。\n${next.conditions.additionalConditions}`
      setExtractionDetached(false); setDetail(undefined); setBody(next); setExtractionId(id); setLabels(targetLabels); setAssessment(undefined); setCases([]); setReason(''); setDirty(true); setExtractionOpen(false); setNotice('已填入新的未保存草稿。请补齐来源与标准范围，核对条件后保存。'); setError('')
    })} />}
    {examplesOpen && <MedicationKnowledgeExamplesDialog api={api} onClose={() => setExamplesOpen(false)} onAdopt={example => guard(() => {
      setImprovementReady(true); setIntakeId(undefined); setExtractionId(undefined); setExtractionDetached(false)
      setDetail(undefined); setBody(normalize(example.body)); setLabels(example.medicationLabels); setReason('')
      setAssessment(undefined); setCases([]); setDirty(true); setExamplesOpen(false); setError('')
      setNotice('已载入人工验收样例，尚未保存或生效。请核对来源原文与验收范围设计的区别；AI 提取结果需另外验证。')
    })} />}
    {ruleOpen && detail && <MedicationKnowledgeRuleDialog api={api} knowledge={detail.saved} onClose={() => setRuleOpen(false)} />}
    {replayOpen && detail && <MedicationKnowledgeReplayDialog api={api} knowledge={detail.saved} onClose={() => setReplayOpen(false)} />}
    {picker && <KnowledgeTargetPicker api={api} onClose={() => setPicker(undefined)} onSelect={(target, label) => { change({ [picker]: [...body[picker], target] }); setLabels(value => ({ ...value, [target.specificationId]: label })) }} />}
    {pending && <Dialog title="处理未保存修改" onClose={() => setPending(undefined)}><p>继续切换会放弃当前未保存的修改。也可以返回编辑并先保存草稿。</p><div className="knowledge-toolbar"><Button variant="secondary" onClick={() => setPending(undefined)}>返回编辑</Button><Button onClick={() => { const action = pending; setPending(undefined); action() }}>放弃修改并继续</Button></div></Dialog>}
    {originView !== undefined && <Dialog title="知识版本的需求分析来源" size="wide" onClose={() => setOriginView(undefined)}>{originView ? <IntakeSource run={originView} api={api} /> : <p>该版本没有关联需求分析，来源原文仍以知识版本中的证据为准。</p>}</Dialog>}
    {historyOpen && detail && <Dialog title="知识版本与原文历史" size="wide" onClose={() => setHistoryOpen(false)}><p>历史记录保留保存时的标准身份、原文和结构校验。历史校验结果不代表当前标准仍然有效。</p>{history.error && <Alert tone="error">{errorMessage(history.error)}</Alert>}{history.isPending && <p>正在读取版本历史…</p>}
      {history.data?.map(v => <KnowledgeHistory key={v.version} value={v} onIntake={() => { void task('读取需求来源', async () => { setOriginView((await api.medicationKnowledgeDrafts.intakeOrigin(detail.saved.id, v.version)) ?? null) }) }} onExtraction={id => { setExtractionRecord(id); setExtractionOpen(true) }} />)}<Pagination page={historyPage} totalPages={Math.ceil(detail.saved.version / 20)} total={detail.saved.version} pageSize={20} onChange={setHistoryPage} label="知识版本历史分页" /></Dialog>}
  </section>
}
function KnowledgeHistory({ value: v, onExtraction, onIntake }: { value: KnowledgeVersion; onIntake: () => void; onExtraction: (id: string) => void }) {
  return <details className="knowledge-history"><summary>第 {v.version} 版 · {new Date(v.savedAt).toLocaleString()} · {v.actor} · 草稿</summary><p>保存原因：{v.changeReason}</p><Button size="sm" variant="secondary" onClick={onIntake}>查看需求分析来源</Button>{v.extractionId && <Button size="sm" variant="secondary" onClick={() => onExtraction(v.extractionId!)}>查看此版抽取来源</Button>}<p>{v.assessment.ruleDescription}</p><p>保存时校验：{v.assessment.structureComplete ? '结构完整，未核验证据' : '结构待补充'}</p><p>{v.body.evidence?.title} · {v.body.evidence?.edition} · {v.body.evidence?.locator}</p><blockquote>{v.body.evidence?.excerpt || '未填写原文'}</blockquote><details><summary>查看完整版本快照</summary><pre>{JSON.stringify(v, null, 2)}</pre></details></details>
}
