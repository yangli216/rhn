import { useState } from 'react'
import { Alert, Button, DataTable, EmptyState, FormField, PanelHead, RelationshipGraph, Select, StatusBadge, tableCellClass } from '../../shared/ui'
import { schemaReviewPresentation } from '../../shared/presentation'
import { messageOf, request, type Catalog, type Proposal, type Table } from './api'

export function SemanticPanel({ catalog, table, onSelect, onOpenCollaboration }: {
  catalog: Catalog; table: Table; onSelect: (name: string) => void; onOpenCollaboration: () => void
}) {
  const graph = catalog.semantic
  const [entity, setEntity] = useState(graph.nodes.find(n => n.table === table.physical)?.id ?? '')
  const node = graph.nodes.find(n => n.id === entity)
  const metrics = graph.metrics.filter(m => m.source === entity)
  const dimensions = graph.dimensions.filter(d => d.entity === entity || d.grain === entity)
  const related = graph.nodes.filter(n => n.table === table.physical)
  if (!graph.nodes.length) return <EmptyState icon="database" title="尚未加载统计语义资产" copy="刷新迁移结构后，读取项目现有语义 YAML。" />
  return <>
    <PanelHead title="业务实体、维度与指标" meta={`版本 ${graph.version} · ${graph.nodes.length} 实体 / ${graph.edges.length} 关系 / ${graph.metrics.length} 指标`} />
    <p>与“业务实体数据关系网 · 语义工作台”共用 <code>{graph.statistics.assetPath}</code>。</p>
    <p className="schema-muted">当前表关联实体：{related.map(n => n.label).join('、') || '未纳入统计语义目录'}。物理结构与统计白名单分别表达存储约束和可分析口径。</p>
    <div className="schema-toolbar"><Select aria-label="统计业务实体" value={entity} clearable={false} onChange={setEntity} options={[{ value: '', label: '当前表尚未映射统计实体' }, ...graph.nodes.map(n => ({ value: n.id, label: n.label, secondaryText: n.table || '未映射物理表' }))]} />
      {node?.table && <Button variant="secondary" onClick={() => onSelect(node.table ?? '')}>定位物理表</Button>}
      <Button variant="secondary" onClick={onOpenCollaboration}>进入人机共建</Button></div>
    {!node ? <EmptyState icon="database" title="当前表尚未映射统计实体" copy="先在业务实体数据关系网中登记实体与物理表的对应关系；这里不会用其他实体代替展示。" /> : <><p>{node.description} · 粒度：{node.grain} · 物理表：<code>{node.table || '尚未映射'}</code></p>
      <RelationshipGraph label="统计语义关系图" nodes={graph.nodes.map(n => ({ id: n.id, label: n.label, detail: n.table || '未映射' }))}
        edges={graph.edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: `${e.cardinality}${e.fanoutRisk ? ' · 有聚合扇出风险' : ''}`,
          detail: e.conditions.map(c => `${c.fromField} = ${c.toField}`).join(' AND ') }))} selected={entity} onSelect={setEntity} />
    </>}
    <PanelHead title="受影响的统计指标" meta={`${metrics.length} 项`} />
    <DataTable compact aria-label="统计指标"><thead><tr><th>指标</th><th>计算与粒度</th><th>默认口径 / 禁止含义</th></tr></thead><tbody>
      {metrics.map(metric => <tr key={metric.code}><td>{metric.name}<small className="schema-muted">{metric.code}</small></td><td><code>{metric.aggregate}({metric.field})</code><br />{metric.grain}</td>
        <td>{metric.description}<br />{metric.defaultFilters.map(f => `${f.field} ${f.op} ${f.values.join(',')}`).join('；')}<br />禁止解释为：{metric.forbiddenMeanings.join('、') || '未登记'}</td></tr>)}
    </tbody></DataTable>
    <PanelHead title="维度与属性映射" meta={`${dimensions.length} 项`} />
    <DataTable compact aria-label="语义维度"><thead><tr><th>维度 / 字段</th><th>属性与物理字段</th><th>自然语言别名</th></tr></thead><tbody>
      {dimensions.map(d => <tr key={d.code}><td>{d.name}<br /><code>{d.entity}.{d.field}</code></td><td>{d.attributes?.map(a => `${a.name} → ${a.physicalColumn}`).join('；') || '—'}</td><td>{d.aliases.join('、')}</td></tr>)}
    </tbody></DataTable>
  </>
}

export function ProposalReview({ proposals, onSaved }: { proposals: Proposal[]; onSaved: () => void }) {
  const [selected, setSelected] = useState(''), [reviewer, setReviewer] = useState(''), [note, setNote] = useState('')
  const [state, setState] = useState('reviewed'), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const proposal = proposals.find(p => p.id === selected)
  async function save() {
    if (!proposal || busy) return
    setBusy(true); setError('')
    try { await request('proposals', 'PUT', { id: proposal.id, expectedRevision: proposal.revision, status: state, reviewer, reviewNote: note }); onSaved(); setSelected('') }
    catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }
  return <>
    <PanelHead title="语义共建评审队列" meta={`${proposals.length} 项`} />
    <p className="schema-muted">接收原语义工作台的候选建议。审核记录保存到仓库，变更需通过代码评审与既有发布流程落实。</p>
    {!proposals.length ? <p>暂无共建建议。可从统计语义工作台保存候选规则，也可在这里维护表的业务说明与关系。</p> : <DataTable compact aria-label="语义共建建议">
      <thead><tr><th>实体 / 需求</th><th className={tableCellClass('status')}>状态</th><th>审核人</th><th className={tableCellClass('actions')}>操作</th></tr></thead><tbody>{proposals.map(p => {
        const status = schemaReviewPresentation(p.status)
        return <tr key={p.id}><td>{p.entity}<br />{p.prompt}</td><td className={tableCellClass('status')}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td><td>{p.reviewer || '—'}</td>
          <td className={tableCellClass('actions')}><Button variant="text" size="sm" disabled={busy} onClick={() => { setSelected(p.id); setReviewer(p.reviewer); setNote(p.reviewNote); setError('') }}>查看与审核</Button></td></tr>
      })}</tbody></DataTable>}
    {proposal && <section className="schema-rule"><h3>{proposal.entity} · {proposal.prompt}</h3><p>{proposal.rationale}</p><pre>{proposal.suggestedYamlDiff}</pre>
      {error && <Alert duration={null}>{error}</Alert>}
      <form onSubmit={event => { event.preventDefault(); void save() }}><div className="schema-grid">
        <FormField label="建议审核人"><input disabled={busy} value={reviewer} onChange={event => setReviewer(event.target.value)} /></FormField>
        <FormField label="建议审核状态"><Select disabled={busy} clearable={false} value={state} onChange={setState} options={[{ value: 'reviewed', label: '审核通过（尚未发布）' }, { value: 'rejected', label: '退回' }, { value: 'draft', label: '继续待确认' }]} /></FormField>
      </div><FormField label="建议审核意见"><textarea disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></FormField>
        <div className="schema-actions"><Button variant="secondary" disabled={busy} onClick={() => setSelected('')}>关闭审核</Button><Button type="submit" busy={busy}>保存审核记录</Button></div>
      </form></section>}
  </>
}
