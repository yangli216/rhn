import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeReference, KnowledgeRuleCandidate, KnowledgeTestCase, KnowledgeTestRow, KnowledgeTestRun, KnowledgeTestSuiteDetail } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination, Select, StatusBadge } from '../../shared/ui'
import { KnowledgeTargetPicker } from './KnowledgeTargetPicker'
import { MedicationKnowledgeExamplesDialog } from './MedicationKnowledgeExamplesDialog'
import './medication-knowledge-test.css'

const outcomes: Record<string, string> = { MATCH: '命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '不可评价' }
const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }))
const blankCase = (): KnowledgeTestCase => ({ title: '', rationale: '', input: { age: null, ageUnit: null, date: null, medications: [] }, expectedOutcome: '', expectedOrderIds: [] })
export function MedicationKnowledgeTestDialog({ api, candidate, onClose }: { api: RhnApi; candidate: KnowledgeRuleCandidate; onClose: () => void }) {
  const [examplesOpen, setExamplesOpen] = useState(false)
  const instance = useId(), [page, setPage] = useState(0), [runPage, setRunPage] = useState(0)
  const [saved, setSaved] = useState<KnowledgeTestSuiteDetail>(), [cases, setCases] = useState<KnowledgeTestCase[]>([]), [index, setIndex] = useState(0)
  const [editing, setEditing] = useState(false), [dirty, setDirty] = useState(false), [expectedVersion, setExpectedVersion] = useState(0)
  const [reason, setReason] = useState(''), [runReason, setRunReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [run, setRun] = useState<KnowledgeTestRun>(), [picker, setPicker] = useState<number>(), [pending, setPending] = useState<() => void>()
  const suites = useQuery({ queryKey: ['knowledge-test-suites', instance, candidate.id, page], queryFn: () => api.medicationKnowledgeDrafts.testSuites(candidate.id, page) })
  const runs = useQuery({ queryKey: ['knowledge-test-runs', instance, candidate.id, runPage], queryFn: () => api.medicationKnowledgeDrafts.testRuns(candidate.id, runPage) })
  const current = cases[index], result = run?.results.find(r => r.index === index)
  const references = [...candidate.program.groupA.targets, ...candidate.program.groupB.targets].map(t => t.reference)
  const routeOptions = [...new Map([...candidate.program.groupA.routes, ...candidate.program.groupB.routes].map(r => [r.code, r])).values()]
  const guard = (action: () => void) => { if (busy) return; if (dirty) setPending(() => action); else action() }
  const change = (next: KnowledgeTestCase[]) => { setCases(next); setDirty(true); setRun(undefined) }
  const patch = (v: Partial<KnowledgeTestCase>) => change(cases.map((c, i) => i === index ? { ...c, ...v } : c))
  const rows = (next: (KnowledgeTestRow | null)[]) => patch({ medicationLabels: Object.fromEntries(Object.entries(current.medicationLabels ?? {}).filter(([id]) => next.some(r => r?.specificationId === id))), input: { ...current.input, medications: next }, expectedOrderIds: current.expectedOrderIds.filter(id => next.some(r => r?.orderId === id)) })
  const rowPatch = (i: number, p: Partial<KnowledgeTestRow>) => rows(current.input.medications.map((r, j) => j === i && r ? { ...r, ...p } : r))
  const selectReference = (i: number, r: KnowledgeReference) => {
    const next = current.input.medications.map((row, j) => j === i && row ? { ...row, catalogId: r.catalogId, catalogVersion: r.catalogVersion, contentHash: r.contentHash, entryId: r.entryId, specificationId: r.specificationId } : row)
    const labels = { ...current.medicationLabels, [r.specificationId]: `${r.name} · ${r.preparationSpec}` }
    patch({ input: { ...current.input, medications: next }, medicationLabels: Object.fromEntries(Object.entries(labels).filter(([id]) => next.some(row => row?.specificationId === id))) })
  }
  const task = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } }
  const adopt = (s: KnowledgeTestSuiteDetail) => { setSaved(s); setCases(structuredClone(s.suite.cases)); setIndex(0); setEditing(false); setDirty(false); setReason(''); setRunReason('') }
  const load = (version: number) => guard(() => { void task(async () => { setSaved(undefined); setCases([]); setRun(undefined); setEditing(false); adopt(await api.medicationKnowledgeDrafts.testSuite(candidate.id, version)) }) })
  const openRun = (id: string) => guard(() => { void task(async () => { setSaved(undefined); setCases([]); setRun(undefined); setEditing(false); const r = await api.medicationKnowledgeDrafts.testRun(candidate.id, id); adopt({ suite: r.suite, suiteHash: r.suiteHash }); setRun(r) }) })
  const start = () => guard(() => { setSaved(undefined); setCases([blankCase()]); setIndex(0); setRun(undefined); setExpectedVersion(suites.data!.totalElements); setReason(''); setError(''); setEditing(true); setDirty(true) })
  const addRow = () => { let n = current.input.medications.length + 1; while (current.input.medications.some(r => r?.orderId === `T-${n}`)) n++; rows([...current.input.medications, { orderId: `T-${n}`, catalogId: null, catalogVersion: null, contentHash: null, entryId: null, specificationId: null, routeCode: null, status: 'ACTIVE' }]) }
  const execute = () => { if (!saved) return; setRun(undefined); void task(async () => { const r = await api.medicationKnowledgeDrafts.executeTests(candidate.id, saved.suite.version, saved.suiteHash, runReason.trim()); setRun(r); if (runPage) setRunPage(0); else await runs.refetch() }) }
  return <Dialog title="知识规则 · 人工验证样例" size="xwide" enterNavigation={false} onClose={() => guard(onClose)}>
    <div className="knowledge-test"><p><strong>{candidate.knowledge.body.title} · 候选 v{candidate.version}</strong>。人工定义合成事实与预期，先保存样例，再运行固定候选。不要填写患者姓名、真实处方或其他患者资料。</p>
      <Alert>验证范围为规则逻辑；标准及途径身份在真实业务中的适配须另行验证。样例通过不代表临床有效性、药学审核或旁路观察通过，也不会自动发布规则。</Alert>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="knowledge-test__layout"><aside className="knowledge-test__pane"><h4>样例版本</h4><Button variant="secondary" disabled={busy || suites.isFetching || runs.isFetching} onClick={() => { void suites.refetch(); void runs.refetch() }}>刷新版本与记录</Button><Button disabled={busy || suites.isPending || suites.isError} onClick={start}>新建样例版本</Button>
        {suites.error && <Alert tone="error">{errorMessage(suites.error)}</Alert>}{suites.isPending && <p>读取版本…</p>}
        {!suites.isError && suites.data?.content.map(s => <button type="button" className="knowledge-test__item" disabled={busy} key={s.version} onClick={() => load(s.version)}><strong>样例 v{s.version} · {s.caseCount} 项</strong><small>{s.actor} · {new Date(s.createdAt).toLocaleString()}</small><small>{s.reason}</small></button>)}
        {suites.data && <Pagination page={page} totalPages={Math.max(1, suites.data.totalPages)} total={suites.data.totalElements} pageSize={20} onChange={p => { if (!busy) setPage(p) }} label="人工样例版本分页" />}
        <h4>验证记录</h4>{runs.error && <Alert tone="error">{errorMessage(runs.error)}</Alert>}
        {!runs.isError && runs.data?.content.map(r => <button type="button" className="knowledge-test__item" disabled={busy} key={r.id} onClick={() => openRun(r.id)}><strong>样例 v{r.suiteVersion} · {r.passedCount}/{r.caseCount} 通过</strong><small>{r.actor} · {new Date(r.createdAt).toLocaleString()}</small></button>)}
        {runs.data && <Pagination page={runPage} totalPages={Math.max(1, runs.data.totalPages)} total={runs.data.totalElements} pageSize={20} onChange={p => { if (!busy) setRunPage(p) }} label="人工验证记录分页" />}
      </aside><section className="knowledge-test__pane knowledge-test__editor"><div className="knowledge-test__actions"><h4>{editing ? '编辑未保存样例' : saved ? `已保存样例 v${saved.suite.version}` : '选择样例或新建'}</h4>
        {saved && !editing && <Button variant="secondary" disabled={busy || suites.isError || suites.isPending || saved.suite.version !== suites.data?.totalElements} onClick={() => { setExpectedVersion(saved.suite.version); setEditing(true); setReason(''); setRun(undefined) }}>编辑为下一版本</Button>}
        {editing && <Button variant="secondary" disabled={busy} onClick={() => setExamplesOpen(true)}>载入验收样例</Button>}
        {editing && <Button variant="secondary" disabled={busy || cases.length >= 30} onClick={() => { change([...cases, blankCase()]); setIndex(cases.length) }}>添加样例</Button>}
      </div>{saved && !editing && <p>保存者 {saved.suite.actor} · {saved.suite.reason}。仅最新样例可编辑为新版本，旧版本保留只读。</p>}
        <div className="knowledge-test__actions">{cases.map((c, i) => <Button size="sm" variant={index === i ? 'primary' : 'secondary'} key={i} disabled={busy} onClick={() => setIndex(i)}>{i + 1}. {c.title || '未命名样例'}</Button>)}</div>
        {current && <fieldset disabled={!editing || busy}><div className="knowledge-test__fields"><FormField label="样例名称"><input aria-label="样例名称" value={current.title} maxLength={200} onChange={e => patch({ title: e.target.value })} /></FormField><FormField label="预期结果"><Select aria-label="预期结果" value={current.expectedOutcome} onChange={expectedOutcome => patch({ expectedOutcome, expectedOrderIds: [] })} options={options(outcomes)} placeholder="由验证人明确选择" /></FormField></div>
          <FormField label="预期依据与测试意图"><textarea aria-label="预期依据与测试意图" rows={2} maxLength={2000} value={current.rationale} onChange={e => patch({ rationale: e.target.value })} /></FormField>
          <div className="knowledge-test__fields"><FormField label="合成年龄（空值表示缺失）"><input type="number" aria-label="合成年龄" value={current.input.age ?? ''} onChange={e => patch({ input: { ...current.input, age: e.target.value === '' ? null : Number(e.target.value) } })} /></FormField><FormField label="年龄单位"><Select aria-label="年龄单位" value={current.input.ageUnit ?? ''} onChange={ageUnit => patch({ input: { ...current.input, ageUnit: ageUnit || null } })} options={options({ YEAR: '岁', MONTH: '月龄', DAY: '日龄' })} /></FormField><FormField label="合成评价日期"><input aria-label="合成评价日期" type="date" value={current.input.date ?? ''} onChange={e => patch({ input: { ...current.input, date: e.target.value || null } })} /></FormField></div>
          <div className="knowledge-test__actions"><h4>合成医嘱 · {current.input.medications.length}/30</h4>{editing && <Button variant="secondary" disabled={current.input.medications.length >= 30} onClick={addRow}>添加合成医嘱</Button>}</div>
          {current.input.medications.map((row, i) => <div className="knowledge-test__row" key={i}>{row ? <><div className="knowledge-test__fields"><FormField label={`医嘱 ${i + 1} 标识`}><input aria-label={`医嘱 ${i + 1} 标识`} value={row.orderId} maxLength={100} onChange={e => rowPatch(i, { orderId: e.target.value })} /></FormField><FormField label={`医嘱 ${i + 1} 状态`}><Select aria-label={`医嘱 ${i + 1} 状态`} clearable={false} value={row.status} onChange={status => rowPatch(i, { status })} options={options({ ACTIVE: '有效', STOPPED: '停止', CANCELLED: '取消', UNKNOWN: '未知（验证缺失边界）' })} /></FormField></div>
            <p>{current.medicationLabels?.[row.specificationId ?? ''] || references.find(r => r.specificationId === row.specificationId)?.name || '合成标准药品'} · {row.entryId || '条目缺失'} / {row.specificationId || '规格缺失'}</p><small>目录 {row.catalogId || '缺失'} · {row.catalogVersion || '版本缺失'} · {row.contentHash || '指纹缺失'}</small>
            {editing && <div className="knowledge-test__actions"><Select aria-label={`医嘱 ${i + 1} 使用候选范围药品`} value="" clearable={false} placeholder="从候选冻结范围填入" options={references.map((r, j) => ({ value: String(j), label: `${r.name} · ${r.preparationSpec}` }))} onChange={v => { const r = references[Number(v)]; if (r) selectReference(i, r) }} /><Button size="sm" variant="secondary" onClick={() => setPicker(i)}>选择标准规格</Button><Button size="sm" variant="secondary" onClick={() => rowPatch(i, { catalogId: null, catalogVersion: null, contentHash: null, entryId: null, specificationId: null })}>设为身份缺失</Button></div>}
            <div className="knowledge-test__fields"><FormField label={`医嘱 ${i + 1} 合成途径编码`}><input aria-label={`医嘱 ${i + 1} 合成途径编码`} value={row.routeCode ?? ''} maxLength={100} onChange={e => rowPatch(i, { routeCode: e.target.value || null })} placeholder="空值表示未知" /></FormField><FormField label={`医嘱 ${i + 1} 目录版次`}><input aria-label={`医嘱 ${i + 1} 目录版次`} value={row.catalogVersion ?? ''} maxLength={200} onChange={e => rowPatch(i, { catalogVersion: e.target.value || null })} /></FormField></div>
            {routeOptions.length > 0 && <small>候选受限途径：{routeOptions.map(r => `${r.name} ${r.code}`).join('；')}。此处验证字面编码匹配，不验证真实途径适配。</small>}
          </> : <p>空医嘱事实</p>}{editing && <Button variant="secondary" size="sm" onClick={() => rows(current.input.medications.filter((_, j) => j !== i))}>移除医嘱 {i + 1}</Button>}</div>)}
          {current.expectedOutcome === 'MATCH' && <div><h4>预期命中的医嘱（须与实际集合完全一致）</h4>{[...new Set(current.input.medications.map(r => r?.orderId).filter((id): id is string => !!id))].map(id => <label className="knowledge-test__check" key={id}><input type="checkbox" checked={current.expectedOrderIds.includes(id)} onChange={e => patch({ expectedOrderIds: e.target.checked ? [...current.expectedOrderIds, id] : current.expectedOrderIds.filter(v => v !== id) })} />{id}</label>)}</div>}
        </fieldset>}
        {editing && <><div className="knowledge-test__actions"><Button variant="secondary" disabled={busy || !current} onClick={() => { change(cases.filter((_, i) => i !== index)); setIndex(Math.max(0, index - 1)) }}>删除当前样例</Button></div><FormField label="样例保存原因"><input aria-label="样例保存原因" maxLength={2000} disabled={busy} value={reason} onChange={e => { setReason(e.target.value); setDirty(true) }} /></FormField><Button disabled={busy || !reason.trim() || !cases.length} onClick={() => { void task(async () => { const s = await api.medicationKnowledgeDrafts.saveTestSuite(candidate.id, { expectedVersion, programHash: candidate.programHash, reason: reason.trim(), cases }); adopt(s); setRun(undefined); if (page) setPage(0); else await suites.refetch() }) }}>保存样例新版本</Button></>}
        {saved && !editing && !dirty && <div className="knowledge-test__execute"><FormField label="验证执行原因"><input aria-label="验证执行原因" value={runReason} maxLength={2000} disabled={busy} onChange={e => setRunReason(e.target.value)} /></FormField><Button disabled={busy || !runReason.trim()} onClick={execute}>运行已保存样例</Button></div>}
      </section><aside className="knowledge-test__pane"><h4>验证结果</h4>{!run && <p>先定义并保存预期，再显式运行。编辑后不显示旧验证结果。</p>}
        {run && <><StatusBadge tone={run.allPassed ? 'info' : 'danger'}>{run.results.filter(r => r.passed).length}/{run.results.length} 项通过</StatusBadge><p>样例 v{run.suite.version} · {run.actor} · {new Date(run.createdAt).toLocaleString()}</p><p>{run.reason}</p>
          {run.missingOutcomeKinds.length > 0 ? <Alert tone="warning">尚未定义这些预期结果：{run.missingOutcomeKinds.map(s => outcomes[s]).join('、')}。</Alert> : <p>已定义主要结果类型；这不表示已覆盖所有业务边界。</p>}
          {current && result && <><h4>{current.title}</h4><p>预期：{outcomes[current.expectedOutcome]}；实际：{outcomes[result.actual.outcome]}</p><p>预期医嘱：{current.expectedOrderIds.join('、') || '无'}</p><p>实际医嘱：{result.actual.matchedOrderIds.join('、') || '无'}</p><ul>{result.actual.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul><StatusBadge tone={result.passed ? 'info' : 'danger'}>{result.passed ? '本例符合预期' : '本例与预期不符'}</StatusBadge></>}
          <details><summary>验证追溯</summary><small>记录 {run.id}</small><small>候选 {run.candidateId}</small><small>表达 {run.programHash}</small><small>样例 {run.suiteHash}</small><small>执行器 {run.engineVersion}</small><small>样例作者 {run.suite.actor}</small></details>
        </>}
      </aside></div>
    </div>
    {examplesOpen && <MedicationKnowledgeExamplesDialog api={api} kind={candidate.knowledge.body.kind} adoptLabel="填入未保存验证样例"
      onClose={() => setExamplesOpen(false)} onAdopt={example => guard(() => {
        change(example.manualCases); setIndex(0); setExamplesOpen(false)
      })} />}
    {picker !== undefined && current && <KnowledgeTargetPicker api={api} specificationOnly onClose={() => setPicker(undefined)} onSelect={(_target, _label, r) => selectReference(picker, r)} />}
    {pending && <Dialog title="处理未保存样例" onClose={() => setPending(undefined)}><p>切换或关闭会放弃未保存的样例修改。</p><Button variant="secondary" onClick={() => setPending(undefined)}>返回编辑</Button><Button onClick={() => { const action = pending; setPending(undefined); setDirty(false); action() }}>放弃修改并继续</Button></Dialog>}
  </Dialog>
}
