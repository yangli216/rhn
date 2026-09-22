import { useEffect, useState } from 'react'
import { Button, DataTable, EmptyState, LoadingState, PanelHead, Select, TableShell, tableCellClass } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { messageOf, request, typeLabel, type Table } from './api'

export function StructurePanel({ table, hasOracle }: { table: Table; hasOracle: boolean }) {
  const [source, setSource] = useState('expected'), [actual, setActual] = useState<Table | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (source !== 'oracle') return
    let active = true; setLoading(true); setError(''); setActual(null)
    request<Table | null>(`actual?table=${encodeURIComponent(table.physical)}`).then(value => { if (active) setActual(value) })
      .catch(e => { if (active) setError(messageOf(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [source, table])
  const structure = source === 'oracle' ? actual?.physical === table.physical ? actual : null : table
  return <div className="schema-structure">
    <WorkspacePane label="字段列表" scroll="content" header={<>
      <PanelHead title="字段" meta={`${structure?.columns.length ?? '—'} 个字段`} />
      <Select aria-label="结构来源" value={source} onChange={setSource} clearable={false} options={[
        { value: 'expected', label: '迁移验证结构 · H2' }, { value: 'oracle', label: 'Oracle 实库快照', disabled: !hasOracle },
      ]} />
    </>}>
      <TableShell scrollLabel="表字段滚动区" resetScrollKey={`${table.physical}:${source}`} footer={<span>所选快照的字段定义 · Oracle 只读采集</span>}>
      {loading ? <LoadingState /> : error ? <EmptyState icon="database" title="结构读取失败" copy={error} action={<Button variant="secondary" onClick={() => setSource('expected')}>查看迁移结构</Button>} />
        : !structure ? <EmptyState icon="database" title="快照中未找到此表" copy="可在结构检查中核对新增或删除情况。" /> :
        <DataTable aria-label="表字段" className="schema-fields-table" compact>
          <colgroup><col style={{ width: '28%' }} /><col style={{ width: '18%' }} /><col style={{ width: '12%' }} /><col style={{ width: '15%' }} /><col style={{ width: '27%' }} /></colgroup>
          <thead><tr><th>物理字段 / 逻辑名</th><th>类型</th><th className={tableCellClass('status')}>约束</th><th>默认值</th><th>业务含义</th></tr></thead>
          <tbody>{structure.columns.map(column => <tr key={column.physical}>
            <td><code>{column.physical}</code><small className="schema-muted">{table.columns.find(c => c.physical === column.physical)?.logical}</small></td>
            <td>{typeLabel(column)}</td><td className={tableCellClass('status')}>{structure.primaryKey.includes(column.physical) ? '主键 · ' : ''}{column.nullable == null ? '未采集' : column.nullable ? '可空' : '必填'}</td>
            <td><code>{column.defaultValue ?? '—'}</code></td><td>{column.comment || '—'}</td>
          </tr>)}</tbody></DataTable>}
      </TableShell>
    </WorkspacePane>
    <WorkspacePane label="约束与代码引用" header={<PanelHead title="约束与代码引用" />} resetScrollKey={`${table.physical}:${source}`}>
      {!loading && !error && structure && <>
        <section><PanelHead title="主键与唯一约束" /><p>主键：<code>{structure.primaryKey.join(' + ') || '未采集'}</code></p>
          {structure.uniqueKeys.map(key => <p key={key.name}><strong>{key.name}</strong><br /><code>{key.columns.join(' + ')}</code></p>)}</section>
        <section><PanelHead title="索引" />{structure.indexes.map(index => <p key={index.name}><strong>{index.name}</strong> {index.unique ? '唯一' : ''}<br /><code>{index.columns.map(c => `${c.name} ${c.direction ?? ''}`).join(' + ')}</code></p>)}</section>
        <details><summary>检查约束（{structure.checks.length}）</summary>{structure.checks.map(check => <p key={check.name}><strong>{check.name}</strong><br /><code>{check.expression}</code></p>)}</details>
      </>}
    <PanelHead title="直接代码引用" meta={`${table.codeReferences.length} 处（最多 40 处）`} />
    {table.codeReferences.map(ref => <p key={`${ref.path}:${ref.line}`}><code>{ref.path}:{ref.line}</code></p>)}
    {!table.codeReferences.length && <p className="schema-muted">尚未发现直接引用该物理名的 Java 文件；不代表此表未被使用。</p>}
    </WorkspacePane>
  </div>
}
