import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { composeCatalog, compareSnapshots, contextMarkdown, emptyAnnotation, governanceIssues, normalizedType, validateAnnotation } from './model.mjs'
import { createService } from './service.mjs'
import { atomicJson, inputFingerprint, parseEnv } from './snapshot.mjs'
import { allowedRequest, schemaWorkbenchPlugin } from './vite-plugin.mjs'
import { columnNamingIssues, columnNamingRules } from './naming.mjs'

test('column naming enforces dictionary abbreviations, strict full-name exceptions and unknown words', () => {
  assert.deepEqual(columnNamingIssues('REVISION'), [])
  assert.deepEqual(columnNamingIssues('DT_OCCRD'), [])
  assert.match(columnNamingIssues('DT_OCCURRED').join(' '), /DT_OCCRD/)
  assert.match(columnNamingIssues('DES_UNREGISTERED').join(' '), /请先登记 UNREGISTERED/)
  assert.match(columnNamingIssues('SN_REVISION').join(' '), /REVISION.*超过/)
  for (const name of ['DT__START', 'dt_start', 'X'.repeat(31)]) assert.ok(columnNamingIssues(name).length)
  const abbreviations = Object.values(columnNamingRules.abbreviations)
  assert.equal(new Set(abbreviations).size, abbreviations.length, 'different meanings must not share a new abbreviation')
  for (const name of abbreviations) {
    assert.ok(name.length <= columnNamingRules.maxTokenLength)
    assert.deepEqual(columnNamingIssues(name), [])
  }
  const invalid = table('RHN_VIS_SOURCE', ['ID_TNT', 'ID_SOURCE', 'DT_OCCURRED'])
  const issues = governanceIssues(composeCatalog([invalid], { ...snapshot, tables: [invalid] }))
  assert.ok(issues.some(i => i.severity === 'error' && i.rule === '字段命名' && i.message.includes('DT_OCCRD')))
})

const column = (physical, extra = {}) => ({ physical, logical: physical.toLowerCase(), type: 'BIGINT', size: 64, scale: 0, nullable: false, comment: '标识', ...extra })
const table = (physical, columns) => ({ physical, logical: `vis.${physical.toLowerCase()}`, legacy: physical.toLowerCase(), domain: 'VIS', comment: '业务对象；一行代表一次发生', columns: columns.map(c => column(c)), primaryKey: [columns[1]], uniqueKeys: [{ name: 'UK', columns: ['ID_TNT', columns[1]] }], indexes: [], checks: [] })
const source = table('RHN_VIS_SOURCE', ['ID_TNT', 'ID_SOURCE', 'ID_TARGET'])
const target = table('RHN_VIS_TARGET', ['ID_TNT', 'ID_TARGET'])
const relation = { id: 'FK_SOURCE_TARGET', kind: 'foreign-key', sourceTable: source.physical, sourceColumns: ['ID_TNT', 'ID_TARGET'], targetTable: target.physical, targetColumns: ['ID_TNT', 'ID_TARGET'], deleteRule: 'NO ACTION' }
const snapshot = { tables: [source, target], relations: [relation], semantic: { version: '1', domain: 'VIS', entities: [{ code: 'SOURCE', name: '业务实体', table: source.physical, primaryKey: 'ID_SOURCE', grain: 'SOURCE' }], dimensions: [], metrics: [], relationships: [] } }

test('composite keys, nullable constraints and explicit source survive catalog and AI export', () => {
  const catalog = composeCatalog([source, target], snapshot)
  assert.equal(catalog.relations[0].cardinality, 'MANY_TO_ONE')
  const markdown = contextMarkdown(catalog, { table: source.physical })
  assert.match(markdown, /RHN_VIS_SOURCE\(ID_TNT, ID_TARGET\) → RHN_VIS_TARGET\(ID_TNT, ID_TARGET\)/)
  assert.match(markdown, /SOURCE → RHN_VIS_SOURCE/)
  assert.equal(catalog.semantic.nodes[0].table, source.physical)
})

test('candidate and unreviewed joins stay out of default AI context', () => {
  const annotation = { ...emptyAnnotation(), relations: [
    { ...relation, id: 'candidate', kind: 'candidate', reviewState: 'draft', evidence: '同名猜测' },
    { ...relation, id: 'draft', kind: 'logical', reviewState: 'draft', evidence: '未核实' },
    { ...relation, id: 'confirmed', kind: 'logical', reviewState: 'reviewed', evidence: '已核实服务代码' },
  ] }
  const catalog = composeCatalog([source, target], snapshot, { [source.physical]: annotation })
  const markdown = contextMarkdown(catalog, { table: source.physical })
  assert.doesNotMatch(markdown, /同名猜测|未核实/)
  assert.match(markdown, /已核实服务代码/)
  assert.match(contextMarkdown({ ...catalog, stale: true, expected: { inputFingerprint: 'old' }, fingerprint: 'new' }), /版本指纹：old[\s\S]*快照过期/)
})

test('new and removed columns and unregistered tables cannot disappear from governance checks', () => {
  const changedSource = { ...source, columns: [column('ID_TNT'), column('ID_SOURCE'), column('NEW_FIELD')] }
  const catalog = composeCatalog([source], { ...snapshot, tables: [changedSource, target] })
  assert.equal(catalog.tables.length, 2)
  const errors = governanceIssues(catalog).filter(i => i.severity === 'error')
  assert.ok(errors.some(i => i.table === target.physical && i.rule === '目录覆盖'))
  assert.ok(errors.some(i => i.message.includes('ID_TARGET 已登记')))
  assert.ok(errors.some(i => i.message.includes('NEW_FIELD 尚未登记')))
})

test('approved business relationships require existing paired columns, tenant condition and evidence', () => {
  const value = { ...emptyAnnotation(), reviewer: '开发者', relations: [{ ...relation, id: 'logical', kind: 'logical', reviewState: 'reviewed', cardinality: 'MANY_TO_ONE', evidence: '服务.java:1', description: '关联对象' }] }
  assert.doesNotThrow(() => validateAnnotation(value, source, [source, target]))
  assert.throws(() => validateAnnotation({ ...value, relations: [{ ...value.relations[0], sourceColumns: ['ID_TARGET'], targetColumns: ['ID_TARGET'] }] }, source, [source, target]), /ID_TNT/)
  assert.throws(() => validateAnnotation({ ...value, relations: [{ ...value.relations[0], targetColumns: ['ID_TNT', 'DOES_NOT_EXIST'] }] }, source, [source, target]), /真实存在/)
  assert.throws(() => validateAnnotation({ ...value, relations: [{ ...value.relations[0], kind: 'candidate' }] }, source, [source, target]), /业务关联/)
  assert.throws(() => validateAnnotation({ ...value, reviewState: 'reviewed' }, source, [source, target]), /责任人/)
})

test('snapshot comparison detects composite join changes and normalizes portable types', () => {
  assert.equal(normalizedType(column('ID', { type: 'NUMBER', size: 19 })), normalizedType(column('ID')))
  assert.equal(normalizedType(column('FLAG', { type: 'NUMBER', size: 1 })), 'BOOLEAN')
  assert.equal(normalizedType(column('DOC', { type: 'CHARACTER LARGE OBJECT' })), 'TEXT')
  assert.deepEqual(compareSnapshots(snapshot, structuredClone(snapshot)), [])
  const changed = structuredClone(snapshot); changed.relations[0].sourceColumns = ['ID_TARGET']; changed.relations[0].targetColumns = ['ID_TARGET']
  assert.equal(compareSnapshots(snapshot, changed).filter(c => c.subject.startsWith('外键')).length, 2)
  const renamed = structuredClone(snapshot); renamed.relations[0].id = 'FK_RENAMED'
  assert.deepEqual(compareSnapshots(snapshot, renamed), [])
})

test('development API rejects cross-origin, remote and ordinary browser requests', () => {
  const good = { socket: { remoteAddress: '::1' }, headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'x-rhn-dev-workbench': '1' } }
  assert.equal(allowedRequest(good), true)
  for (const changed of [
    { ...good, headers: { ...good.headers, origin: 'https://other.example' } },
    { ...good, headers: { ...good.headers, host: 'attacker.example' } },
    { ...good, headers: { host: 'localhost:5173' } },
    { ...good, socket: { remoteAddress: '192.168.1.2' } },
  ]) assert.equal(allowedRequest(changed), false)
  const plugin = schemaWorkbenchPlugin('/tmp/test-schema-plugin')
  assert.equal(plugin.apply, 'serve'); assert.equal(plugin.configurePreviewServer, undefined)
})

test('local credential parsing treats shell substitutions as literal data', () => {
  const result = parseEnv('RHN_ORACLE_URL="jdbc:oracle:thin:@local"\nRHN_ORACLE_PASSWORD=\'$(do-not-run)\'\nUNRELATED=not-exported')
  assert.equal(result.RHN_ORACLE_PASSWORD, '$(do-not-run)')
  assert.equal(result.UNRELATED, undefined)
})

test('file collaboration persists, rejects concurrent stale saves, and guards semantic review revisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rhn-schema-test-'))
  try {
    for (const directory of ['docs/foundation', 'scripts/schema-workbench', 'backend/src/main/resources/db/migration', 'backend/src/main/resources/db/local', 'backend/src/main/resources/db/h2', 'backend/src/main/resources/db/oracle', 'backend/rhn-analytics/src/main/resources/semantic']) await fs.mkdir(path.join(root, directory), { recursive: true })
    await atomicJson(path.join(root, 'docs/foundation/rhn-physical-schema-map.json'), [source, target])
    await fs.writeFile(path.join(root, 'scripts/schema-workbench/SchemaSnapshot.java'), 'fixture')
    const yaml = path.join(root, 'backend/rhn-analytics/src/main/resources/semantic/outpatient-ontology.v1.yaml')
    await fs.writeFile(yaml, 'version: 1')
    await atomicJson(path.join(root, '.runtime/schema-workbench/expected.json'), { ...snapshot, inputFingerprint: await inputFingerprint(root), migrations: [], capturedAt: '2026-09-22T00:00:00Z' })
    const service = createService(root), value = { ...emptyAnnotation(), purpose: '保留人工业务解释' }
    const writes = await Promise.allSettled([service.saveAnnotation(source.physical, value, 0), service.saveAnnotation(source.physical, { ...value, purpose: '旧版本覆盖' }, 0)])
    assert.equal(writes[0].status, 'fulfilled'); assert.equal(writes[1].status, 'rejected'); assert.equal(writes[1].reason.status, 409)
    assert.equal((await createService(root).catalog()).tables[0].annotation.purpose, value.purpose)
    const generated = JSON.parse(await fs.readFile(path.join(root, 'docs/database/generated/VIS.json')))
    assert.equal(generated.tables[0].annotation.revision, 1)
    const proposal = await service.saveProposal({ entity: 'SOURCE', prompt: '补充范围', rationale: '人工核对', suggestedYamlDiff: 'draft: true' })
    assert.equal((await createService(root).catalog()).proposals.length, 1)
    await fs.writeFile(yaml, 'version: 2')
    await assert.rejects(() => service.saveProposal({ entity: 'SOURCE', prompt: '旧建议', rationale: '', suggestedYamlDiff: '' }), /过期/)
    await assert.rejects(() => service.reviewProposal(proposal.id, { expectedRevision: 1, status: 'reviewed', reviewer: '审核人', reviewNote: '确认' }), /资产已改变/)
    assert.equal((await service.catalog()).stale, true)
    await assert.rejects(() => service.document('../../outside'), /规范不存在/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
