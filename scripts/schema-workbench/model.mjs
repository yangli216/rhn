import { columnNamingIssues } from './naming.mjs'

export const domainNames = { SYS: '平台与组织', BD: '基础数据与术语', PI: '居民与患者', SC: '排班与挂号', VIS: '就诊与临床', EX: '医疗请求与执行', HPL: '健康计划', BIL: '收费与结算', INS: '医保', SUP: '药品与供应', META: '元数据', AI: 'AI 协作', INT: '集成', ANL: '分析读模型', AN: '统计分析', OP: '预检分诊', AUD: '审计与质量' }
export const semanticAsset = 'backend/rhn-analytics/src/main/resources/semantic/outpatient-ontology.v1.yaml'

export function ontologyGraph(raw = {}) {
  const dimensions = raw.dimensions ?? [], metrics = raw.metrics ?? []
  const nodes = (raw.entities ?? []).map(entity => ({
    id: entity.code, entityCode: entity.code, label: entity.name, table: entity.table ?? '',
    primaryKey: entity.primaryKey, grain: entity.grain, description: entity.description,
    nodeType: ['DEPARTMENT', 'PATIENT'].includes(entity.code) ? 'DIMENSION' : 'FACT',
    metricCount: metrics.filter(m => m.source === entity.code).length,
    dimensionCount: dimensions.filter(d => d.entity === entity.code || d.grain === entity.code).length,
    attributes: [...new Set(dimensions.filter(d => d.entity === entity.code || d.grain === entity.code).flatMap(d => (d.attributes ?? []).map(a => a.code)))],
  }))
  const edges = (raw.relationships ?? []).map((relation, index) => ({
    id: `semantic-${index}`, source: relation.from, target: relation.to, cardinality: relation.cardinality,
    conditions: relation.conditions.map(c => ({ fromField: c.from, toField: c.to })),
    aggregationSafe: relation.aggregationSafe, fanoutRisk: relation.fanoutRisk, label: relation.cardinality,
  }))
  return { version: raw.version ?? '', domain: raw.domain ?? '', nodes, edges, dimensions, metrics,
    statistics: { entityCount: nodes.length, relationshipCount: edges.length, dimensionCount: dimensions.length,
      metricCount: metrics.length, fanoutRiskCount: edges.filter(e => e.fanoutRisk).length, assetPath: semanticAsset } }
}

export function normalizedType(column) {
  const type = column.type.toUpperCase()
  if (['CLOB', 'TEXT', 'CHARACTER LARGE OBJECT'].includes(type)) return 'TEXT'
  // H2's PostgreSQL TEXT alias is exposed as CHARACTER VARYING(1000000000).
  if (['VARCHAR', 'CHARACTER VARYING'].includes(type) && column.size === 1000000000) return 'TEXT'
  if (['VARCHAR', 'VARCHAR2', 'CHARACTER VARYING', 'NVARCHAR2'].includes(type)) return `VARCHAR(${column.size})`
  if (type === 'BOOLEAN' || type === 'NUMBER' && column.size === 1 && (column.scale ?? 0) === 0) return 'BOOLEAN'
  if (type === 'BIGINT' || ['NUMBER', 'NUMERIC', 'DECIMAL'].includes(type) && column.size === 19 && (column.scale ?? 0) === 0) return 'BIGINT'
  if (type === 'NUMBER' && column.size === 10 && (column.scale ?? 0) === 0) return 'INTEGER'
  if (['NUMBER', 'NUMERIC', 'DECIMAL'].includes(type)) return `DECIMAL(${column.size},${column.scale ?? 0})`
  if (type.startsWith('TIMESTAMP')) return type.includes('TIME ZONE') ? 'TIMESTAMP WITH TIME ZONE' : 'TIMESTAMP'
  if (['INTEGER', 'SMALLINT', 'TINYINT'].includes(type)) return 'INTEGER'
  return type
}

const stable = value => JSON.stringify(value)
const relationSignature = relation => stable([relation.sourceTable, relation.sourceColumns, relation.targetTable, relation.targetColumns, relation.deleteRule ?? 'NO ACTION'])

export function compareSnapshots(before, after, { crossDialect = false } = {}) {
  if (!before || !after) return []
  const changes = []
  const add = (table, subject, kind, oldValue, newValue) => changes.push({ table, subject, kind, before: oldValue ?? '—', after: newValue ?? '—' })
  const oldTables = new Map(before.tables.map(t => [t.physical, t])), newTables = new Map(after.tables.map(t => [t.physical, t]))
  for (const name of new Set([...oldTables.keys(), ...newTables.keys()])) {
    const oldTable = oldTables.get(name), newTable = newTables.get(name)
    if (!oldTable || !newTable) { add(name, '表', oldTable ? 'removed' : 'added', oldTable?.comment, newTable?.comment); continue }
    if (oldTable.comment !== newTable.comment) add(name, '表注释', 'changed', oldTable.comment, newTable.comment)
    const oldCols = new Map(oldTable.columns.map(c => [c.physical, c])), newCols = new Map(newTable.columns.map(c => [c.physical, c]))
    for (const column of new Set([...oldCols.keys(), ...newCols.keys()])) {
      const a = oldCols.get(column), b = newCols.get(column)
      if (!a || !b) { add(name, column, a ? 'removed' : 'added', a && normalizedType(a), b && normalizedType(b)); continue }
      const type = c => crossDialect ? normalizedType(c) : `${c.type}(${c.size},${c.scale ?? ''})`
      for (const [label, first, second] of [['类型', type(a), type(b)], ['可空', String(a.nullable), String(b.nullable)], ['注释', a.comment, b.comment]]) {
        if (first !== second) add(name, `${column} · ${label}`, 'changed', first, second)
      }
      if (!crossDialect && a.defaultValue !== b.defaultValue) add(name, `${column} · 默认值`, 'changed', a.defaultValue, b.defaultValue)
    }
    for (const [label, first, second] of [
      ['主键', oldTable.primaryKey, newTable.primaryKey],
      ['唯一约束', oldTable.uniqueKeys.map(k => k.columns.join(',')).sort(), newTable.uniqueKeys.map(k => k.columns.join(',')).sort()],
    ]) if (stable(first) !== stable(second)) add(name, label, 'changed', stable(first), stable(second))
    if (!crossDialect) for (const key of ['indexes', 'checks']) {
      if (stable(oldTable[key]) !== stable(newTable[key])) add(name, key === 'indexes' ? '索引' : '检查约束', 'changed', stable(oldTable[key]), stable(newTable[key]))
    }
  }
  const previous = new Map(before.relations.map(r => [relationSignature(r), r])), current = new Map(after.relations.map(r => [relationSignature(r), r]))
  for (const [signature, r] of previous) if (!current.has(signature)) add(r.sourceTable, `外键 ${r.id}`, 'removed', signature)
  for (const [signature, r] of current) if (!previous.has(signature)) add(r.sourceTable, `外键 ${r.id}`, 'added', undefined, signature)
  return changes
}

export function emptyAnnotation() {
  return { revision: 0, owner: '', purpose: '', grain: '', lifecycle: '', writeEntry: '', notes: '', reviewState: 'draft', reviewer: '', reviewedAt: null, relations: [], fieldNotes: [] }
}

export function validateAnnotation(value, table, tables) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('业务说明格式不正确')
  for (const field of ['owner', 'purpose', 'grain', 'lifecycle', 'writeEntry', 'notes', 'reviewer']) {
    if (typeof value[field] !== 'string' || value[field].length > 12000) fail(`${field} 必须为不超过 12000 字的文本`)
  }
  if (!['draft', 'reviewed'].includes(value.reviewState)) fail('请选择有效的审核状态')
  if (value.reviewState === 'reviewed' && (!value.reviewer.trim() || !value.owner.trim() || !value.grain.trim() || !value.purpose.trim())) fail('审核通过需要填写责任人、审核人、用途和一行粒度')
  if (!Array.isArray(value.relations) || value.relations.length > 100 || !Array.isArray(value.fieldNotes) || value.fieldNotes.length > table.columns.length) fail('关系或字段说明数量不正确')
  const columns = new Set(table.columns.map(c => c.physical)), ids = new Set()
  for (const relation of value.relations) {
    if (typeof relation.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(relation.id) || ids.has(relation.id)) fail('关系标识无效或重复')
    ids.add(relation.id)
    if (!['logical', 'candidate'].includes(relation.kind) || !['draft', 'reviewed'].includes(relation.reviewState)) fail('关系类型或审核状态不正确')
    if (!['ONE_TO_ONE', 'MANY_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY'].includes(relation.cardinality)) fail('请选择关系基数')
    const target = tables.find(t => t.physical === relation.targetTable)
    if (!target || !Array.isArray(relation.sourceColumns) || !Array.isArray(relation.targetColumns)
      || !relation.sourceColumns.length || relation.sourceColumns.length !== relation.targetColumns.length
      || new Set(relation.sourceColumns).size !== relation.sourceColumns.length || new Set(relation.targetColumns).size !== relation.targetColumns.length
      || !relation.sourceColumns.every(c => columns.has(c)) || !relation.targetColumns.every(c => target.columns.some(t => t.physical === c))) fail('关联字段必须真实存在、数量一致且不能重复')
    for (const field of ['evidence', 'description']) if (typeof relation[field] !== 'string' || relation[field].length > 12000) fail('请填写有效的关系说明与依据')
    if (relation.reviewState === 'reviewed') {
      if (relation.kind === 'candidate' || !relation.evidence.trim() || !value.reviewer.trim()) fail('确认关系须转为业务关联，并填写依据和审核人')
      if (columns.has('ID_TNT') && target.columns.some(c => c.physical === 'ID_TNT')
        && !relation.sourceColumns.some((c, i) => c === 'ID_TNT' && relation.targetColumns[i] === 'ID_TNT')) fail('租户表之间的已确认关联须包含 ID_TNT 对应条件')
    }
  }
  const noted = new Set()
  for (const note of value.fieldNotes) {
    if (!columns.has(note.column) || noted.has(note.column) || typeof note.meaning !== 'string' || typeof note.dictionary !== 'string' || note.meaning.length > 12000 || note.dictionary.length > 2000) fail('字段说明包含未知字段、重复字段或无效内容')
    noted.add(note.column)
  }
}

export function composeCatalog(mapping, snapshot, annotations = {}, codeReferences = {}) {
  const actual = new Map((snapshot?.tables ?? []).map(t => [t.physical, t]))
  const registered = new Set(mapping.map(t => t.physical))
  const entries = [...mapping, ...(snapshot?.tables ?? []).filter(t => !registered.has(t.physical)).map(t => ({
    physical: t.physical, logical: '', domain: t.physical.split('_')[1], comment: '', columns: [],
  }))]
  const tables = entries.map(entry => {
    const structure = actual.get(entry.physical)
    const columnMap = new Map(entry.columns.map(c => [c.physical, c]))
    return { ...entry, ...(structure ?? {}), logical: entry.logical, domain: entry.domain,
      catalogComment: entry.comment, catalogAvailable: registered.has(entry.physical), structureAvailable: Boolean(structure),
      catalogMissingColumns: structure ? entry.columns.filter(c => !structure.columns.some(s => s.physical === c.physical)).map(c => c.physical) : [],
      columns: (structure?.columns ?? entry.columns).map(c => ({ ...c, logical: columnMap.get(c.physical)?.logical ?? '', catalogComment: columnMap.get(c.physical)?.comment ?? '' })),
      annotation: annotations[entry.physical] ?? emptyAnnotation(), codeReferences: codeReferences[entry.physical] ?? [],
      primaryKey: structure?.primaryKey ?? [], uniqueKeys: structure?.uniqueKeys ?? [], indexes: structure?.indexes ?? [], checks: structure?.checks ?? [] }
  })
  const graph = ontologyGraph(snapshot?.semantic)
  const tableMap = new Map(tables.map(t => [t.physical, t]))
  const relations = (snapshot?.relations ?? []).map(r => {
    const source = tableMap.get(r.sourceTable)
    const unique = [source?.primaryKey ?? [], ...(source?.uniqueKeys ?? []).map(k => k.columns)]
      .some(key => key.length && key.every(c => r.sourceColumns.includes(c)))
    return { ...r, cardinality: unique ? 'ONE_TO_ONE' : 'MANY_TO_ONE', reviewState: 'database', evidence: '迁移验证库外键', description: '' }
  })
  for (const table of tables) for (const relation of table.annotation.relations) relations.push({ ...relation, id: `${table.physical}:${relation.id}`, sourceTable: table.physical })
  return { tables, relations, semantic: graph,
    domains: [...new Set(tables.map(t => t.domain))].sort().map(code => ({ code, name: domainNames[code] ?? '未登记业务域', count: tables.filter(t => t.domain === code).length })) }
}

export function governanceIssues(catalog) {
  const issues = [], tableMap = new Map(catalog.tables.map(t => [t.physical, t]))
  const add = (table, rule, message, severity = 'warning') => issues.push({ table, rule, message, severity })
  for (const table of catalog.tables) {
    if (!table.structureAvailable) add(table.physical, '结构覆盖', '映射已登记，但迁移结构中未找到此表', 'error')
    if (!table.catalogAvailable) add(table.physical, '目录覆盖', '迁移中存在此表，但物理映射尚未登记', 'error')
    for (const name of table.catalogMissingColumns) add(table.physical, '字段覆盖', `${name} 已登记，但迁移结构中不存在`, 'error')
    if (!table.comment.includes('一行代表')) add(table.physical, '行粒度', '表注释缺少“一行代表”的粒度说明')
    if (table.physical.length > 30 || !/^RHN_[A-Z_0-9]+$/.test(table.physical)) add(table.physical, '物理命名', '物理表名称不符合 RHN 命名或长度约定', 'error')
    for (const c of table.columns) {
      for (const message of columnNamingIssues(c.physical)) add(table.physical, '字段命名', message, 'error')
      if (!c.logical) add(table.physical, '字段覆盖', `${c.physical} 尚未登记逻辑映射`, 'error')
      if (!c.comment?.trim()) add(table.physical, '字段说明', `${c.physical} 缺少注释`)
    }
    if (!table.annotation.owner) add(table.physical, '业务责任', '尚未登记业务责任人', 'info')
  }
  for (const node of catalog.semantic.nodes) {
    const table = tableMap.get(node.table)
    if (!table) add(node.table || '', '语义映射', `${node.label}（${node.id}）尚未映射到现有物理表`, 'warning')
    else if (!table.columns.some(c => c.physical === node.primaryKey)) add(table.physical, '语义主键', `${node.id} 主键 ${node.primaryKey} 不存在`, 'error')
  }
  const entityMap = new Map(catalog.semantic.nodes.map(n => [n.id, n]))
  for (const edge of catalog.semantic.edges) {
    const from = entityMap.get(edge.source), to = entityMap.get(edge.target)
    for (const [node, field] of edge.conditions.flatMap(c => [[from, c.fromField], [to, c.toField]])) {
      if (node?.table && !tableMap.get(node.table)?.columns.some(c => c.physical === field)) add(node.table, '语义关联字段', `${edge.source} → ${edge.target} 引用了不存在的 ${field}`, 'error')
    }
    if (from?.table && to?.table && [from, to].every(n => tableMap.get(n.table)?.columns.some(c => c.physical === 'ID_TNT'))
      && !edge.conditions.some(c => c.fromField === 'ID_TNT' && c.toField === 'ID_TNT')) add(from.table, '语义租户条件', `${edge.source} → ${edge.target} 的 YAML 未声明租户条件；执行层补充条件需另行核对`)
  }
  return issues
}

export function contextMarkdown(catalog, { table: selected, domain, includeCandidates = false } = {}) {
  const requested = catalog.tables.filter(t => selected ? t.physical === selected : domain ? t.domain === domain : true)
  const names = new Set(requested.map(t => t.physical))
  const relationships = catalog.relations.filter(r => (names.has(r.sourceTable) || names.has(r.targetTable))
    && (r.kind === 'foreign-key' || r.kind === 'logical' && r.reviewState === 'reviewed' || includeCandidates))
  const lines = ['# RHN 数据库上下文', '', `结构来源：迁移隔离验证库；版本指纹：${catalog.expected?.inputFingerprint ?? catalog.fingerprint ?? '未采集'}`,
    `资料状态：${catalog.stale ? '源文件已变化，快照过期，使用前须重新采集' : catalog.expected === null ? '尚未采集结构' : '已采集'}`, `语义来源：${semanticAsset}`, '',
    '物理外键、业务关联和统计关联具有不同语义。查询须保持完整租户条件；结构目录不授予统计查询权限。',
    '字段按下划线分词，每段最多 7 字符，仅完整 REVISION 例外；缩写词典：docs/database/physical-column-abbreviations.json。请使用当前物理名，逻辑名和历史名称不是 SQL 别名。', '']
  for (const table of requested) {
    lines.push(`## ${table.physical} · ${table.logical}`, table.comment, `业务说明状态：${table.annotation.reviewState}；责任人：${table.annotation.owner || '未登记'}`,
      `用途：${table.annotation.purpose || '未补充'}；粒度：${table.annotation.grain || table.comment}`, `主键：${table.primaryKey.join(', ') || '未采集'}`, '',
      '|字段|逻辑名|类型|可空|含义|', '|---|---|---|---|---|')
    const safe = value => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
    for (const c of table.columns) lines.push(`|${c.physical}|${c.logical}|${c.type ? normalizedType(c) : '未采集'}|${c.nullable ?? '未采集'}|${safe(c.comment)}|`)
    if (table.codeReferences.length) lines.push('', '直接代码引用：', ...table.codeReferences.map(ref => `- ${ref.path}:${ref.line}`))
    if (table.annotation.notes) lines.push('', `业务补充：${table.annotation.notes}`)
    if (table.annotation.fieldNotes.length) lines.push('', '人工字段说明：', ...table.annotation.fieldNotes.map(note => `- ${note.column}：${note.meaning}；字典 / 值域：${note.dictionary || '未补充'}`))
    lines.push('')
  }
  lines.push('## 关联', ...relationships.map(r => `- [${r.kind}/${r.reviewState}] ${r.sourceTable}(${r.sourceColumns.join(', ')}) → ${r.targetTable}(${r.targetColumns.join(', ')})；${r.cardinality}；依据：${r.evidence}`))
  const entityIds = new Set(catalog.semantic.nodes.filter(n => names.has(n.table)).map(n => n.id))
  lines.push('', '## 已有统计语义资产', ...catalog.semantic.nodes.filter(n => entityIds.has(n.id)).map(n => `- ${n.id} → ${n.table}；${n.description}`),
    ...catalog.semantic.edges.filter(e => entityIds.has(e.source) || entityIds.has(e.target)).map(e => `- 统计关联 ${e.source} → ${e.target}：${e.conditions.map(c => `${c.fromField} = ${c.toField}`).join(' AND ')}；${e.cardinality}；扇出风险：${e.fanoutRisk}；仅表示 YAML 声明，执行条件须另行校验`),
    ...catalog.semantic.metrics.filter(m => entityIds.has(m.source)).map(m => `- 指标 ${m.code}：${m.name}；${m.description}；计算：${m.aggregate}(${m.field})；默认过滤：${stable(m.defaultFilters)}；禁止解释为：${m.forbiddenMeanings.join('、')}`))
  return lines.join('\n') + '\n'
}
