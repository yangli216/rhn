import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaWorkbench } from './SchemaWorkbench'
import type { Annotation, Catalog, Table } from './api'

const annotation: Annotation = { revision: 0, owner: '', purpose: '', grain: '', lifecycle: '', writeEntry: '', notes: '', reviewState: 'draft', reviewer: '', reviewedAt: null, relations: [], fieldNotes: [] }
const makeTable = (physical: string, logical: string, comment: string, key: string): Table => ({ physical, logical, comment, catalogComment: comment, legacy: logical, domain: 'VIS', structureAvailable: true,
  columns: [{ physical: 'ID_TNT', logical: 'tenant_id', type: 'BIGINT', nullable: false, comment: '租户标识' }, { physical: key, logical: 'id', type: 'BIGINT', nullable: false, comment: '主键' }],
  primaryKey: [key], uniqueKeys: [], indexes: [], checks: [], annotation: structuredClone(annotation), codeReferences: [{ path: 'backend/Entity.java', line: 10 }] })
function fixture(): Catalog {
  const encounter = makeTable('RHN_VIS_ENC', 'vis.encounter', '就诊；一行代表一次就诊', 'ID_ENC')
  encounter.columns.push({ physical: 'ID_PAT', logical: 'resident_id', type: 'BIGINT', nullable: false, comment: '患者标识' })
  const patient = makeTable('RHN_PI_PAT', 'pi.resident', '居民；一行代表一名居民', 'ID_PAT')
  return { tables: [encounter, patient], relations: [{ id: 'FK_ENC_PAT', sourceTable: encounter.physical, sourceColumns: ['ID_TNT', 'ID_PAT'], targetTable: patient.physical, targetColumns: ['ID_TNT', 'ID_PAT'],
    kind: 'foreign-key', reviewState: 'database', cardinality: 'MANY_TO_ONE', evidence: '迁移验证库', description: '' }],
    domains: [{ code: 'VIS', name: '就诊', count: 2 }], fingerprint: 'source', stale: false, expected: { capturedAt: '2026-09-22T01:00:00Z', database: 'H2', profile: 'test', inputFingerprint: 'source', tableCount: 2, relationCount: 1, migrations: [] },
    oracle: null, previousOracle: null, drift: [], changes: [], issues: [], proposals: [], documents: [{ id: 'rhn', title: 'RHN 数据库规范', path: 'docs/database/design-standard.md', scope: '项目适用规则' }],
    job: { status: 'idle', message: '', startedAt: null, finishedAt: null }, semantic: { version: '1', domain: 'OUTPATIENT', nodes: [{ id: 'ENCOUNTER', label: '门诊就诊', entityCode: 'ENCOUNTER', table: encounter.physical,
      primaryKey: 'ID_ENC', grain: 'ENCOUNTER_VISIT', description: '单次就诊', nodeType: 'FACT', metricCount: 0, dimensionCount: 0, attributes: [] }], edges: [], metrics: [], dimensions: [],
      statistics: { entityCount: 1, relationshipCount: 0, dimensionCount: 0, metricCount: 0, fanoutRiskCount: 0, assetPath: 'semantic/outpatient-ontology.v1.yaml' } } }
}

let data: Catalog
let failSave = false
beforeEach(() => {
  data = fixture(); failSave = false
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname.endsWith('/catalog')) return new Response(JSON.stringify(data))
    if (url.pathname.endsWith('/document')) return new Response(JSON.stringify({ ...data.documents[0], content: '# 设计规范\n\n## 租户规则\n关联必须包含 ID_TNT。\n\n## 金额规则\n明确精度。' }))
    if (url.pathname.endsWith('/context')) return new Response(JSON.stringify({ markdown: '# 上下文\nRHN_VIS_ENC(ID_TNT, ID_PAT)' }))
    if (url.pathname.endsWith('/annotation')) {
      if (failSave) return new Response(JSON.stringify({ message: '说明已被其他开发人员更新，当前输入已保留。' }), { status: 409 })
      const body = JSON.parse(String(init?.body)); data.tables[0].annotation = { ...body.annotation, revision: 1 }
      return new Response(JSON.stringify(data.tables[0].annotation))
    }
    return new Response(JSON.stringify({ message: '未实现的测试接口' }), { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('database collaboration workbench', () => {
  it('separates directory, fields and checks from fixed controls and resets each list when paging', async () => {
    const user = userEvent.setup()
    for (let i = 0; i < 25; i++) data.tables.push(makeTable(`RHN_VIS_DEMO_${i}`, `vis.demo_${i}`, `演示表 ${i}；一行代表一项`, 'ID_DEMO'))
    data.issues = Array.from({ length: 30 }, (_, i) => ({ table: 'RHN_VIS_ENC', rule: '测试规则', severity: 'info', message: `检查项 ${i + 1}` }))
    render(<SchemaWorkbench />)
    await screen.findByRole('table', { name: '表字段' })
    const directory = screen.getByRole('region', { name: '数据库表目录内容' })
    const fields = screen.getByRole('region', { name: '表字段滚动区' })
    const directoryPages = screen.getByRole('navigation', { name: '表目录分页' })
    expect(directory).not.toContainElement(directoryPages)
    expect(directory).not.toContainElement(screen.getByRole('searchbox', { name: '搜索表与字段' }))
    expect(fields).not.toContainElement(screen.getByRole('tablist', { name: '数据库工作台视图' }))
    expect(within(fields).queryByText('backend/Entity.java:10')).not.toBeInTheDocument()
    directory.scrollTop = 700; fields.scrollTop = 500
    await user.click(within(directoryPages).getByRole('button', { name: '下一页' }))
    expect(directory.scrollTop).toBe(0)
    expect(fields.scrollTop).toBe(500)
    await user.click(screen.getByRole('tab', { name: '结构检查' }))
    const checks = screen.getByRole('region', { name: '检查结果滚动区' })
    const checkPages = screen.getByRole('navigation', { name: '检查结果分页' })
    expect(checks).not.toContainElement(checkPages)
    checks.scrollTop = 900
    await user.click(within(checkPages).getByRole('button', { name: '下一页' }))
    expect(checks.scrollTop).toBe(0)
    expect(within(checks).getByText('检查项 26')).toBeInTheDocument()
  })

  it('searches fields and navigates complete composite-key relationships', async () => {
    const user = userEvent.setup(); render(<SchemaWorkbench />)
    expect(await screen.findByRole('table', { name: '表字段' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await user.type(screen.getByRole('searchbox', { name: '搜索表与字段' }), 'resident_id')
    expect(screen.queryByRole('button', { name: /居民 RHN_PI_PAT/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清空搜索表与字段' }))
    await user.click(screen.getByRole('tab', { name: '表关系' }))
    expect(screen.getByText('ID_TNT = ID_TNT AND ID_PAT = ID_PAT')).toBeInTheDocument()
    await user.click(within(screen.getByRole('region', { name: '数据关系图' })).getByRole('button', { name: /居民.*RHN_PI_PAT/ }))
    expect(screen.getByRole('heading', { level: 2, name: '居民' })).toBeInTheDocument()
  })

  it('keeps edits after conflict and requires an explicit choice before changing tables', async () => {
    const user = userEvent.setup(); render(<SchemaWorkbench />)
    await screen.findByRole('table', { name: '表字段' })
    await user.click(screen.getByRole('tab', { name: '人机共建' }))
    await user.type(screen.getByRole('textbox', { name: '业务用途' }), '业务含义应保留')
    failSave = true
    await user.click(screen.getByRole('button', { name: '保存业务说明' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('说明已被其他开发人员更新')
    expect(screen.getByRole('textbox', { name: '业务用途' })).toHaveValue('业务含义应保留')
    await user.click(screen.getByRole('button', { name: /居民.*RHN_PI_PAT.*pi.resident/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('当前业务说明尚未保存')
    await user.click(screen.getByRole('button', { name: '继续编辑' }))
    failSave = false
    await user.click(screen.getByRole('button', { name: '保存业务说明' }))
    await waitFor(() => expect(data.tables[0].annotation.revision).toBe(1))
    expect(screen.getByRole('textbox', { name: '业务用途' })).toHaveValue('业务含义应保留')
  })

  it('reads design standards and generates scoped AI context without invoking analytics queries', async () => {
    const user = userEvent.setup(); render(<SchemaWorkbench />)
    await screen.findByRole('table', { name: '表字段' })
    await user.click(screen.getByRole('tab', { name: '设计规范' }))
    expect(await screen.findByText('关联必须包含 ID_TNT。')).toBeInTheDocument()
    const document = screen.getByRole('region', { name: '设计规范内容' })
    expect(document).not.toContainElement(screen.getByRole('searchbox', { name: '搜索规范内容' }))
    document.scrollTop = 300
    await user.type(screen.getByRole('searchbox', { name: '搜索规范内容' }), '租户')
    expect(document.scrollTop).toBe(0)
    expect(screen.queryByText('明确精度。')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'AI 上下文' }))
    await user.click(screen.getByRole('button', { name: '生成 AI 上下文' }))
    expect(await screen.findByRole('textbox', { name: '可复制的数据库上下文' })).toHaveValue('# 上下文\nRHN_VIS_ENC(ID_TNT, ID_PAT)')
    expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes('/execute'))).toBe(true)
  })

  it('keeps access-denied separate from missing metadata and offers retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '只允许本机开发请求' }), { status: 403 })))
    render(<SchemaWorkbench />)
    expect(await screen.findByText('当前连接无权访问开发工作台')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载目录' })).toBeInTheDocument()
  })
})
