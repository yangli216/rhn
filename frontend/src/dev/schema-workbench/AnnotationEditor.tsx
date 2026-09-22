import { useState } from 'react'
import { Alert, Button, DataTable, FormField, PanelHead, Select, tableCellClass } from '../../shared/ui'
import { messageOf, request, type Annotation, type Relation, type Table } from './api'

export function AnnotationEditor({ table, tables, onDirty, onSaved }: { table: Table; tables: Table[]; onDirty: (dirty: boolean) => void; onSaved: () => void }) {
  const [value, setValue] = useState<Annotation>(structuredClone(table.annotation))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const change = (patch: Partial<Annotation>) => { setValue(current => ({ ...current, ...patch })); onDirty(true) }
  function updateRelation(index: number, patch: Partial<Relation>) {
    change({ relations: value.relations.map((r, i) => i === index ? { ...r, ...patch } : r) })
  }
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try { await request('annotation', 'PUT', { table: table.physical, annotation: value, expectedRevision: value.revision }); onDirty(false); onSaved() }
    catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }
  return <form onSubmit={event => { event.preventDefault(); void save() }}>
    <PanelHead title="业务说明与关系共建" meta={`文件版本 ${value.revision}`} />
    <p className="schema-muted">保存到项目的 docs/database/annotations，随代码评审。审核状态用于记录业务确认，不会修改数据库或发布统计规则。</p>
    {error && <Alert duration={null} onDismiss={() => setError('')}>{error}</Alert>}
    <fieldset disabled={busy} className="schema-fieldset"><div className="schema-grid">
      {([['owner', '业务责任人'], ['reviewer', '审核人'], ['grain', '一行代表什么'], ['writeEntry', '负责写入的服务 / 入口'], ['lifecycle', '生命周期与状态含义']] as const).map(([key, label]) =>
        <FormField key={key} label={label}><input value={value[key]} onChange={event => change({ [key]: event.target.value })} /></FormField>)}
      <FormField label="说明审核状态"><Select clearable={false} value={value.reviewState} onChange={state => change({ reviewState: state as Annotation['reviewState'] })}
        options={[{ value: 'draft', label: '待确认' }, { value: 'reviewed', label: '已审核' }]} /></FormField>
    </div>
    <FormField label="业务用途"><textarea rows={3} value={value.purpose} onChange={event => change({ purpose: event.target.value })} /></FormField>
    <FormField label="业务规则、典型查询与注意事项"><textarea rows={4} value={value.notes} onChange={event => change({ notes: event.target.value })} /></FormField>
    <PanelHead title="字段业务补充" actions={<Button variant="secondary" size="sm" disabled={value.fieldNotes.length >= table.columns.length}
      onClick={() => change({ fieldNotes: [...value.fieldNotes, { column: table.columns.find(c => !value.fieldNotes.some(n => n.column === c.physical))?.physical ?? '', meaning: '', dictionary: '' }] })}>添加字段说明</Button>} />
    {value.fieldNotes.map((note, index) => <div className="schema-grid schema-rule" key={index}>
      <FormField label={`字段 ${index + 1}`}><Select clearable={false} value={note.column} options={table.columns.map(c => ({ value: c.physical, label: c.physical, secondaryText: c.comment }))}
        onChange={column => change({ fieldNotes: value.fieldNotes.map((n, i) => i === index ? { ...n, column } : n) })} /></FormField>
      <FormField label={`字段含义 ${index + 1}`}><input value={note.meaning} onChange={event => change({ fieldNotes: value.fieldNotes.map((n, i) => i === index ? { ...n, meaning: event.target.value } : n) })} /></FormField>
      <FormField label={`字典或枚举依据 ${index + 1}`}><input value={note.dictionary} onChange={event => change({ fieldNotes: value.fieldNotes.map((n, i) => i === index ? { ...n, dictionary: event.target.value } : n) })} /></FormField>
      <Button variant="text" onClick={() => change({ fieldNotes: value.fieldNotes.filter((_, i) => i !== index) })}>移除此字段补充</Button>
    </div>)}
    <PanelHead title="业务关联与待核对候选" actions={<Button variant="secondary" size="sm" onClick={() => change({ relations: [...value.relations, {
      id: crypto.randomUUID(), sourceTable: table.physical, sourceColumns: [], targetTable: '', targetColumns: [], kind: 'candidate', reviewState: 'draft', cardinality: 'MANY_TO_ONE', evidence: '', description: '',
    }] })}>添加关系</Button>} />
    {value.relations.map((relation, index) => <section className="schema-rule" key={relation.id} aria-label={`业务关系 ${index + 1}`}>
      <div className="schema-grid">
        <FormField label={`目标表 ${index + 1}`}><Select value={relation.targetTable} clearable={false} options={tables.map(t => ({ value: t.physical, label: t.physical, secondaryText: t.comment }))}
          onChange={targetTable => updateRelation(index, { targetTable, targetColumns: [] })} /></FormField>
        <FormField label={`关系基数 ${index + 1}`}><Select value={relation.cardinality} clearable={false} onChange={cardinality => updateRelation(index, { cardinality })}
          options={[{ value: 'MANY_TO_ONE', label: '多对一' }, { value: 'ONE_TO_MANY', label: '一对多' }, { value: 'ONE_TO_ONE', label: '一对一' }, { value: 'MANY_TO_MANY', label: '多对多' }]} /></FormField>
        <FormField label={`本表字段 ${index + 1}`} hint="按对应顺序填写，用英文逗号分隔。租户表需保留 ID_TNT。"><input value={relation.sourceColumns.join(',')}
          onChange={event => updateRelation(index, { sourceColumns: event.target.value.split(',').map(c => c.trim().toUpperCase()) })} /></FormField>
        <FormField label={`目标字段 ${index + 1}`}><input value={relation.targetColumns.join(',')} onChange={event => updateRelation(index, { targetColumns: event.target.value.split(',').map(c => c.trim().toUpperCase()) })} /></FormField>
        <FormField label={`关系类型 ${index + 1}`}><Select value={relation.kind} clearable={false} onChange={kind => updateRelation(index, { kind: kind as Relation['kind'], reviewState: 'draft' })}
          options={[{ value: 'candidate', label: '候选关系（待核对）' }, { value: 'logical', label: '业务逻辑关联' }]} /></FormField>
        <FormField label={`关系审核 ${index + 1}`}><Select value={relation.reviewState} clearable={false} onChange={reviewState => updateRelation(index, { reviewState: reviewState as Relation['reviewState'] })}
          options={[{ value: 'draft', label: '待确认' }, { value: 'reviewed', label: '已确认', disabled: relation.kind === 'candidate' }]} /></FormField>
        <FormField label={`业务关系说明 ${index + 1}`}><input value={relation.description} onChange={event => updateRelation(index, { description: event.target.value })} /></FormField>
        <FormField label={`关系依据 ${index + 1}`}><input value={relation.evidence} onChange={event => updateRelation(index, { evidence: event.target.value })} placeholder="代码路径、设计规范或业务确认记录" /></FormField>
      </div>
      <DataTable compact aria-label={`关联字段对照 ${index + 1}`}><thead><tr><th>本表字段</th><th>目标字段</th><th className={tableCellClass('status')}>状态</th></tr></thead>
        <tbody>{relation.sourceColumns.map((column, i) => <tr key={i}><td>{column || '—'}</td><td>{relation.targetColumns[i] || '—'}</td><td className={tableCellClass('status')}>{table.columns.some(c => c.physical === column) && tables.find(t => t.physical === relation.targetTable)?.columns.some(c => c.physical === relation.targetColumns[i]) ? '字段存在' : '待补齐'}</td></tr>)}</tbody></DataTable>
      <Button variant="text" onClick={() => change({ relations: value.relations.filter((_, i) => i !== index) })}>移除此关系草稿</Button>
    </section>)}
    </fieldset>
    <div className="schema-actions"><Button type="submit" busy={busy} busyLabel="保存中">保存业务说明</Button></div>
  </form>
}
