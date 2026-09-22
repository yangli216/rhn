import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { atomicJson, readJson, captureSnapshot, inputFingerprint, digest } from './snapshot.mjs'
import { composeCatalog, compareSnapshots, contextMarkdown, emptyAnnotation, governanceIssues, semanticAsset, validateAnnotation } from './model.mjs'

export const documents = [
  { id: 'rhn', title: 'RHN 数据库设计与协作规范', path: 'docs/database/design-standard.md', scope: '项目适用规则' },
  { id: 'naming', title: '物理命名映射与目录治理', path: 'docs/foundation/RHN物理表命名映射.md', scope: '项目适用规则' },
  { id: 'column-naming', title: '物理字段缩写词典与命名规则', path: 'docs/database/physical-column-naming.md', scope: '项目适用规则' },
  { id: 'column-renames', title: '字段命名优化 · 1.77.0 逐表清单', path: 'docs/database/column-renames-1.77.0.md', scope: '迁移评审清单；Oracle 应用状态见结构对照' },
  { id: 'foundation', title: '基础底座与业务接入清单', path: 'docs/foundation/基础底座1.1.md', scope: '项目适用规则' },
  { id: 'dictionary', title: '字典与术语命名规范', path: 'docs/foundation/字典与术语命名规范.md', scope: '项目适用规则' },
  { id: 'migration', title: '数据库基线与迁移规则', path: 'backend/src/main/resources/db/README.md', scope: '项目适用规则' },
  { id: 'upstream', title: '下一代数据库设计规范 v1.11', path: 'docs/database/reference/upstream-schema-design-standard.md', scope: '上游参考快照；项目差异见 RHN 规范' },
  { id: 'collaboration', title: '物理结构与统计语义的统一维护', path: 'docs/database/README.md', scope: '开发工作台操作说明' },
]

async function codeReferences(root) {
  const result = {}
  async function scan(directory) {
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    for (const entry of entries) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) { await scan(file); continue }
      if (!entry.isFile() || !entry.name.endsWith('.java')) continue
      const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/)
      lines.forEach((line, index) => {
        for (const table of new Set(line.match(/\bRHN_[A-Z0-9_]+\b/g) ?? [])) {
          result[table] ??= []
          if (result[table].length < 40) result[table].push({ path: path.relative(root, file), line: index + 1 })
        }
      })
    }
  }
  for (const name of (await fs.readdir(path.join(root, 'backend'))).filter(n => n.startsWith('rhn-'))) await scan(path.join(root, 'backend', name, 'src/main/java'))
  return result
}

export function createService(root) {
  const runtime = path.join(root, '.runtime/schema-workbench')
  const annotationDirectory = path.join(root, 'docs/database/annotations')
  const proposalDirectory = path.join(root, 'docs/database/proposals')
  let currentJob = { status: 'idle', message: '', startedAt: null, finishedAt: null }
  let writes = Promise.resolve()
  let references
  const serialize = work => { const next = writes.then(work); writes = next.catch(() => {}); return next }

  async function listJson(directory) {
    try { return (await Promise.all((await fs.readdir(directory)).filter(n => n.endsWith('.json')).sort().map(n => readJson(path.join(directory, n))))).filter(Boolean) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  async function catalog() {
    const [mapping, expected, oracle, previous, annotations, proposals, fingerprint] = await Promise.all([
      readJson(path.join(root, 'docs/foundation/rhn-physical-schema-map.json')),
      readJson(path.join(runtime, 'expected.json')), readJson(path.join(runtime, 'oracle.json')), readJson(path.join(runtime, 'previous-oracle.json')),
      listJson(annotationDirectory), listJson(proposalDirectory), inputFingerprint(root),
    ])
    references ??= await codeReferences(root)
    const data = composeCatalog(mapping, expected, Object.fromEntries(annotations.map(a => [a.table, a])), references)
    const metadata = snapshot => snapshot ? { capturedAt: snapshot.capturedAt, database: snapshot.database, profile: snapshot.profile,
      inputFingerprint: snapshot.inputFingerprint, tableCount: snapshot.tables.length, relationCount: snapshot.relations.length, migrations: snapshot.migrations } : null
    return { ...data, fingerprint, stale: Boolean(expected && expected.inputFingerprint !== fingerprint),
      expected: metadata(expected), oracle: metadata(oracle), previousOracle: metadata(previous),
      drift: compareSnapshots(expected, oracle, { crossDialect: true }), changes: compareSnapshots(previous, oracle),
      issues: expected ? governanceIssues(data) : [], documents, proposals, job: currentJob }
  }
  async function refresh(mode = 'all') {
    if (!['all', 'expected', 'oracle'].includes(mode)) throw Object.assign(new Error('刷新来源无效'), { status: 400 })
    if (currentJob.status === 'running') throw Object.assign(new Error('结构采集正在进行'), { status: 409 })
    currentJob = { status: 'running', message: '正在迁移随机 H2 验证库并采集结构', startedAt: new Date().toISOString(), finishedAt: null }
    const task = (async () => {
      try {
        if (mode !== 'oracle') await captureSnapshot(root, 'expected')
        if (mode !== 'expected') {
          currentJob.message = '正在只读采集 Oracle 结构'
          await captureSnapshot(root, 'oracle')
        }
        references = undefined
        await exportCatalog()
        currentJob = { ...currentJob, status: 'complete', message: '结构已刷新，AI 分域目录已更新', finishedAt: new Date().toISOString() }
      } catch (error) {
        currentJob = { ...currentJob, status: 'failed', message: error.message.slice(0, 600), finishedAt: new Date().toISOString() }
      }
    })()
    return { job: { ...currentJob }, completion: task }
  }
  async function saveAnnotation(name, value, expectedRevision) {
    return serialize(async () => {
      const data = await catalog(), table = data.tables.find(t => t.physical === name)
      if (!table) throw Object.assign(new Error('表不存在'), { status: 404 })
      validateAnnotation(value, table, data.tables)
      const file = path.join(annotationDirectory, `${name}.json`)
      const existing = await readJson(file, emptyAnnotation())
      if (existing.revision !== expectedRevision) throw Object.assign(new Error('说明已被其他开发人员更新，请重新加载后合并。当前输入已保留。'), { status: 409 })
      const keys = ['owner', 'purpose', 'grain', 'lifecycle', 'writeEntry', 'notes', 'reviewState', 'reviewer', 'relations', 'fieldNotes']
      const saved = { table: name, ...Object.fromEntries(keys.map(key => [key, value[key]])), revision: existing.revision + 1,
        reviewedAt: value.reviewState === 'reviewed' ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }
      await atomicJson(file, saved)
      if (data.expected && !data.stale) await exportCatalog()
      return saved
    })
  }
  async function saveProposal(value) {
    return serialize(async () => {
      if (!value || typeof value !== 'object') throw Object.assign(new Error('建议格式不正确'), { status: 400 })
      for (const key of ['entity', 'prompt', 'rationale', 'suggestedYamlDiff']) if (typeof value[key] !== 'string' || value[key].length > 24000) throw Object.assign(new Error('建议内容无效或过长'), { status: 400 })
      const data = await catalog()
      if (!data.expected || data.stale) throw Object.assign(new Error('结构与语义资料已过期或未采集，请先刷新结构再保存建议'), { status: 409 })
      const entity = data.semantic.nodes.find(n => n.id === value.entity)
      if (!entity) throw Object.assign(new Error('请刷新结构后选择已登记的语义实体'), { status: 400 })
      if (!value.prompt.trim()) throw Object.assign(new Error('请填写共建需求'), { status: 400 })
      const id = crypto.randomUUID()
      const proposal = { id, entity: entity.id, table: entity.table, prompt: value.prompt, rationale: value.rationale,
        suggestedYamlDiff: value.suggestedYamlDiff, status: 'draft', reviewer: '', reviewNote: '', revision: 1,
        source: semanticAsset, sourceDigest: digest(await fs.readFile(path.join(root, semanticAsset))), createdAt: new Date().toISOString() }
      await atomicJson(path.join(proposalDirectory, `${id}.json`), proposal)
      return proposal
    })
  }
  async function reviewProposal(id, value) {
    return serialize(async () => {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('建议不存在'), { status: 404 })
      const file = path.join(proposalDirectory, `${id}.json`), proposal = await readJson(file)
      if (!proposal) throw Object.assign(new Error('建议不存在'), { status: 404 })
      if (proposal.revision !== value.expectedRevision) throw Object.assign(new Error('建议已被更新，请重新加载'), { status: 409 })
      if (!['reviewed', 'rejected', 'draft'].includes(value.status) || typeof value.reviewer !== 'string' || !value.reviewer.trim()
        || value.reviewer.length > 200 || typeof value.reviewNote !== 'string' || !value.reviewNote.trim() || value.reviewNote.length > 12000) throw Object.assign(new Error('请填写审核人、审核意见和有效状态'), { status: 400 })
      if (value.status === 'reviewed' && proposal.sourceDigest !== digest(await fs.readFile(path.join(root, semanticAsset)))) throw Object.assign(new Error('语义资产已改变，请基于当前版本重新提交建议'), { status: 409 })
      const result = { ...proposal, status: value.status, reviewer: value.reviewer, reviewNote: value.reviewNote, revision: proposal.revision + 1, reviewedAt: new Date().toISOString() }
      await atomicJson(file, result)
      return result
    })
  }
  async function exportCatalog() {
    const data = await catalog()
    if (!data.expected || data.stale) throw new Error('请先刷新迁移结构，再生成 AI 目录')
    const directory = path.join(root, 'docs/database/generated')
    await atomicJson(path.join(directory, 'index.json'), { formatVersion: 1, fingerprint: data.fingerprint, semanticAsset,
      domains: data.domains, tables: data.tables.map(t => ({ physical: t.physical, logical: t.logical, domain: t.domain, comment: t.comment, columns: t.columns.length })) })
    for (const domain of data.domains) {
      const tables = data.tables.filter(t => t.domain === domain.code)
      await atomicJson(path.join(directory, `${domain.code}.json`), { fingerprint: data.fingerprint, tables,
        relations: data.relations.filter(r => tables.some(t => t.physical === r.sourceTable || t.physical === r.targetTable)) })
    }
    return { tables: data.tables.length, domains: data.domains.length }
  }
  async function document(id) {
    const doc = documents.find(d => d.id === id)
    if (!doc) throw Object.assign(new Error('规范不存在'), { status: 404 })
    return { ...doc, content: await fs.readFile(path.join(root, doc.path), 'utf8') }
  }
  async function actualTable(name) {
    const snapshot = await readJson(path.join(runtime, 'oracle.json'))
    return snapshot?.tables.find(t => t.physical === name) ?? null
  }
  return { catalog, refresh, saveAnnotation, saveProposal, reviewProposal, exportCatalog, document, actualTable,
    context: async options => contextMarkdown(await catalog(), options), job: () => ({ ...currentJob }) }
}
