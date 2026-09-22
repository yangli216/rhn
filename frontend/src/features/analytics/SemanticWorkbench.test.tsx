import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import type { OntologyGraphDto, CopilotSuggestResponse, SemanticExecutionResult } from '../../shared/api/semanticOntologyApi'
import { SemanticWorkbench } from './SemanticWorkbench'
import { saveDevelopmentSemanticProposal } from '../../shared/api/developmentSchemaApi'

vi.mock('../../shared/api/developmentSchemaApi', () => ({ saveDevelopmentSemanticProposal: vi.fn().mockResolvedValue({ id: 'saved-proposal' }) }))

const mockGraph: OntologyGraphDto = {
  domain: 'outpatient',
  version: '1.0.0',
  statistics: {
    entityCount: 7,
    relationshipCount: 9,
    dimensionCount: 9,
    metricCount: 15,
    fanoutRiskCount: 2,
    assetPath: 'outpatient-ontology.v1.yaml',
  },
  nodes: [
    {
      id: 'DEPARTMENT',
      label: '科室',
      entityCode: 'DEPARTMENT',
      nodeType: 'DIMENSION',
      table: 'SYS_DEPT',
      primaryKey: 'ID',
      grain: 'DEPARTMENT',
      description: '全院科室字典',
      attributes: ['ID', 'NAME', 'TYPE_CODE'],
      metricCount: 0,
      dimensionCount: 3,
    },
    {
      id: 'CHARGE',
      label: '费用明细',
      entityCode: 'CHARGE',
      nodeType: 'FACT',
      table: 'OUTPATIENT_CHARGE_RECORD',
      primaryKey: 'ID',
      grain: 'CHARGE_ITEM',
      description: '门诊收费明细事实表',
      attributes: ['ID', 'ITEM_CODE', 'AMOUNT'],
      metricCount: 5,
      dimensionCount: 4,
    },
  ],
  edges: [
    {
      id: 'CHARGE-DEPARTMENT',
      source: 'CHARGE',
      target: 'DEPARTMENT',
      cardinality: 'N:1',
      conditions: [{ fromField: 'DEPT_ID', toField: 'ID' }],
      aggregationSafe: true,
      fanoutRisk: false,
      label: '费用归属科室',
    },
  ],
  dimensions: [
    {
      code: 'dept_type',
      name: '科室属性类别',
      aliases: ['科室类型', '科室属性'],
      entity: 'DEPARTMENT',
      field: 'TYPE_CODE',
      grain: 'DEPARTMENT',
      attributes: [
        {
          code: 'CLINICAL',
          name: '诊疗科室',
          aliases: ['临床科室'],
          physicalColumn: 'TYPE_CODE',
        },
      ],
    },
  ],
  metrics: [
    {
      code: 'DRUG_FEE',
      name: '药品费用',
      aliases: ['药品总额'],
      description: '门诊开立并完成结算的合规药品费用总和',
      domain: 'outpatient',
      source: 'CHARGE',
      field: 'ITEM_PRICE * QUANTITY',
      aggregate: 'SUM',
      grain: 'CHARGE_ITEM',
      defaultFilters: [{ field: 'ITEM_CATEGORY', op: 'EQUALS', values: ['DRUG'] }],
      timeDimension: 'FEE_TIME',
      supportedDimensions: ['dept_type'],
      forbiddenMeanings: ['退费前金额'],
    },
  ],
}

const mockCopilotSuggest: CopilotSuggestResponse = {
  status: 'SUCCESS',
  rationale: '检测到科室属性过滤需求，建议补充 CLINICAL 诊疗科室过滤',
  suggestedYamlDiff: 'filters:\n  - dimension: dept_type\n    operator: IN\n    values: ["CLINICAL"]',
}

const mockProbeResult: SemanticExecutionResult = {
  planId: 'plan-123',
  status: 'READY',
  explanation: '门诊各科室药品费用（只统计诊疗科室）',
  compiledSql: 'SELECT d.name AS dept_name, SUM(c.amount) AS drug_fee FROM sys_dept d ...',
  columns: [
    { code: 'dept_name', name: '科室名称', alias: 'dept_name', type: 'DIMENSION' },
    { code: 'drug_fee', name: '药品费用', alias: 'drug_fee', type: 'MEASURE' },
  ],
  rows: [
    { dept_name: '内科门诊', drug_fee: 1250.5 },
    { dept_name: '儿科门诊', drug_fee: 830.0 },
  ],
  totalRows: 2,
  executionTimeMs: 18,
}

function setup() {
  const ontologyGraph = vi.fn().mockResolvedValue(mockGraph)
  const copilotSuggest = vi.fn().mockResolvedValue(mockCopilotSuggest)
  const executeV2 = vi.fn().mockResolvedValue(mockProbeResult)
  const onBack = vi.fn()

  const api = {
    analytics: {
      ontologyGraph,
      copilotSuggest,
      executeV2,
    },
  } as unknown as RhnApi

  return { api, ontologyGraph, copilotSuggest, executeV2, onBack }
}

it('searches and selects semantic entities that have no physical table mapping', async () => {
  const user = userEvent.setup()
  const { api, ontologyGraph } = setup()
  ontologyGraph.mockResolvedValue({ ...mockGraph, nodes: [...mockGraph.nodes,
    { ...mockGraph.nodes[1], id: 'PRESCRIPTION', entityCode: 'PRESCRIPTION', label: '处方', table: null },
  ] })
  render(<SemanticWorkbench api={api} />)
  await screen.findByText(/业务实体数据关系网/)
  const search = screen.getByRole('searchbox', { name: '搜索实体或表名' })
  await user.type(search, '不存在的表')
  expect(screen.queryByText('处方')).not.toBeInTheDocument()
  await user.clear(search)
  await user.click(screen.getByRole('button', { name: /处方/ }))
  expect(screen.getAllByText('尚未映射物理表').length).toBeGreaterThan(0)
})

it('renders three-pane PC layout with ontology graph statistics and entities', async () => {
  const { api, onBack } = setup()
  render(<SemanticWorkbench api={api} onBack={onBack} />)

  expect(await screen.findByText(/业务实体数据关系网/)).toBeInTheDocument()
  expect(screen.getByText(/outpatient-ontology.v1.yaml/)).toBeInTheDocument()

  // 检查顶部统计卡片
  expect(screen.getByText('7')).toBeInTheDocument()
  expect(screen.getAllByText('9')).toHaveLength(2)

  // 检查左侧栏实体目录
  expect(screen.getAllByText('科室').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText('费用明细').length).toBeGreaterThanOrEqual(1)

  // 检查返回按钮
  const backBtn = screen.getByRole('button', { name: '返回统计功能库' })
  expect(backBtn).toBeInTheDocument()
})

it('switches view tabs and supports Live Semantic Probe', async () => {
  const user = userEvent.setup()
  const { api, executeV2 } = setup()
  render(<SemanticWorkbench api={api} />)

  await screen.findByText(/业务实体数据关系网/)

  // 切换到即时语义探针 (Live Probe)
  const probeTab = screen.getByRole('button', { name: /即时语义探针/ })
  await user.click(probeTab)

  // 验证探针界面输入与执行
  const runProbeBtn = screen.getByRole('button', { name: '执行语义探针' })
  await user.click(runProbeBtn)

  // 验证结果表格与防护机制
  expect(await screen.findByText('内科门诊')).toBeInTheDocument()
  expect(screen.getByText('儿科门诊')).toBeInTheDocument()
  expect(screen.getByText('1250.5')).toBeInTheDocument()
  expect(executeV2).toHaveBeenCalled()
})

it('supports AI Copilot human-machine co-construction suggestion', async () => {
  const user = userEvent.setup()
  const { api, copilotSuggest } = setup()
  render(<SemanticWorkbench api={api} />)

  await screen.findByText(/业务实体数据关系网/)

  // 在右侧 Copilot 输入框输入自然语言规则
  const copilotInput = screen.getByPlaceholderText(/建议将检验科、放射科、超声科/)
  await user.type(copilotInput, '遇到科室统计，只保留产生诊疗费用的科室')

  const analyzeBtn = screen.getByRole('button', { name: 'AI 逆向推断规则' })
  await user.click(analyzeBtn)

  // 验证推断结果
  expect(await screen.findByText(/检测到科室属性过滤需求/)).toBeInTheDocument()
  expect(copilotSuggest).toHaveBeenCalled()

  // 点击确认采纳
  const confirmBtn = screen.getByRole('button', { name: '保存至开发评审队列' })
  await user.click(confirmBtn)
  expect(await screen.findByText('已保存至开发评审队列（尚未发布）')).toBeInTheDocument()
  expect(saveDevelopmentSemanticProposal).toHaveBeenCalledWith(expect.objectContaining({ entity: 'DEPARTMENT', prompt: '遇到科室统计，只保留产生诊疗费用的科室' }))
})

it('shows real relationship conditions and links to physical schema governance', async () => {
  const { api } = setup()
  render(<SemanticWorkbench api={api} />)
  expect(await screen.findByRole('region', { name: '业务实体关系图' })).toBeInTheDocument()
  expect(screen.getByText('DEPT_ID = ID')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '表结构、设计规范与共建评审' })).toHaveAttribute('href', '/schema-workbench.html?entity=DEPARTMENT')
})
