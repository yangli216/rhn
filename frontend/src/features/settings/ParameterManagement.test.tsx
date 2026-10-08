import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParameterCategory, ParameterDefinition, ParameterDefinitionInput, ParameterDefinitionSummary, ParameterValueInput, RhnApi, SystemEnumDefinition } from '../../shared/rhnApi'
import { ParameterManagement } from './ParameterManagement'

describe('ParameterManagement category write facts', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: { categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([]), ...overrides },
    } as unknown as RhnApi
    return { ...renderWorkspace(api), api, user: userEvent.setup() }
  }
  async function open(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => expect(screen.getByRole('button', { name: '管理分类' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '管理分类' }))
    return within(screen.getByRole('dialog', { name: '参数分类管理' }))
  }
  async function edit(user: ReturnType<typeof userEvent.setup>) {
    const dialog = await open(user)
    await user.click(dialog.getByRole('treeitem', { name: /临床AI/ }))
    await user.click(dialog.getByRole('button', { name: '编辑节点' }))
    await user.clear(dialog.getByRole('textbox', { name: /分类名称/ }))
    await user.type(dialog.getByRole('textbox', { name: /分类名称/ }), '修订后的分类')
    return dialog
  }

  it.each([{ sdParamStatus: undefined }, { revision: undefined }, { parentId: 'missing' }])('blocks malformed category facts and recovers after a real reload %j', async patch => {
    let list: unknown = [{ ...mockCategories[0], ...patch }]
    const { user } = setup({ categories: vi.fn().mockImplementation(async () => list) })
    expect(await screen.findByText('参数分类加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '管理分类' })).toBeDisabled()
    expect(screen.queryByRole('treeitem', { name: /临床AI/ })).not.toBeInTheDocument()
    list = mockCategories
    await user.click(screen.getByRole('button', { name: '重新加载参数' }))
    expect(await screen.findByRole('treeitem', { name: /临床AI/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '管理分类' })).toBeEnabled()
  })

  it('keeps a create draft when the response points to an existing category', async () => {
    const { user } = setup({ createCategory: vi.fn().mockResolvedValue(mockCategories[0]) })
    const dialog = await open(user)
    await user.type(dialog.getByRole('textbox', { name: /分类名称/ }), '新分类')
    await user.type(dialog.getByRole('textbox', { name: /分类编码/ }), 'NEW_CATEGORY')
    await user.click(dialog.getByRole('button', { name: '创建分类' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/创建结果指向已有分类/)
    expect(dialog.getByRole('textbox', { name: /分类名称/ })).toHaveValue('新分类')
    expect(screen.queryByText('参数分类已创建')).not.toBeInTheDocument()
    expect(dialog.queryByText(/已创建分类/)).not.toBeInTheDocument()
  })

  it('confirms a create even when refetch has already returned it, without duplicating the tree node', async () => {
    let list = [...mockCategories]
    let resolve!: (category: ParameterCategory) => void
    const createCategory = vi.fn().mockImplementation(() => new Promise<ParameterCategory>(done => { resolve = done }))
    const { user, queryClient } = setup({ createCategory, categories: vi.fn().mockImplementation(async () => list) })
    const dialog = await open(user)
    await user.type(dialog.getByRole('textbox', { name: /分类名称/ }), '新分类')
    await user.type(dialog.getByRole('textbox', { name: /分类编码/ }), 'NEW_CATEGORY')
    await user.click(dialog.getByRole('button', { name: '创建分类' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalledOnce())
    const created = { ...mockCategories[0], ...createCategory.mock.calls[0][0], id: 'new', revision: 0 }
    list = [...mockCategories, created]
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }) })
    await act(async () => { resolve(created) })
    expect(await screen.findByText('已创建分类“新分类”')).toBeInTheDocument()
    expect(queryClient.getQueryData(['parameter-categories'])).toEqual(list)
    expect(dialog.getAllByRole('treeitem', { name: /新分类/ })).toHaveLength(1)
  })

  it('keeps a stale-update draft and the original revision through refetch and retry', async () => {
    let list = [...mockCategories]
    const updateCategory = vi.fn().mockResolvedValue(mockCategories[0])
    const { user, queryClient } = setup({ updateCategory, categories: vi.fn().mockImplementation(async () => list) })
    const dialog = await edit(user)
    list = [{ ...mockCategories[0], name: '后台新名称', revision: 2 }]
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }) })
    expect(dialog.getByRole('textbox', { name: /分类名称/ })).toHaveValue('修订后的分类')
    await user.click(dialog.getByRole('button', { name: '保存分类' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/更新结果与原目标、修订或提交内容不符/)
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存分类' })).toBeEnabled())
    await user.click(dialog.getByRole('button', { name: '保存分类' }))
    expect(updateCategory).toHaveBeenCalledTimes(2)
    for (const call of updateCategory.mock.calls) expect(call).toEqual(['cat-ai', expect.objectContaining({ expectedRevision: 1, name: '修订后的分类' })])
    expect(screen.queryByText('参数分类已更新')).not.toBeInTheDocument()
    expect(dialog.getByRole('textbox', { name: /分类名称/ })).toHaveValue('修订后的分类')
  })

  it('keeps the editor on refresh failure and disables submission until the tree is confirmed', async () => {
    let failed = false
    const updateCategory = vi.fn()
    const { user, queryClient } = setup({ updateCategory, categories: vi.fn().mockImplementation(async () => {
      if (failed) throw new Error('目录连接失败')
      return mockCategories
    }) })
    const dialog = await edit(user)
    failed = true
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-categories'] }) })
    expect(dialog.getByRole('textbox', { name: /分类名称/ })).toHaveValue('修订后的分类')
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存分类' })).toBeDisabled())
    expect(updateCategory).not.toHaveBeenCalled()
    failed = false
    await user.click(dialog.getByRole('button', { name: '重新确认配置' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存分类' })).toBeEnabled())
    expect(dialog.getByRole('textbox', { name: /分类名称/ })).toHaveValue('修订后的分类')
  })

  it('does not publish an optimistic reorder or accept an unchanged reorder response, then clears the error on a confirmed edit', async () => {
    let list = [ { ...mockCategories[0], sortOrder: 10 }, { ...mockCategories[0], id: 'other', code: 'OTHER', name: '另一分类', sortOrder: 20 } ]
    let resolve!: (categories: ParameterCategory[]) => void
    const reorderCategories = vi.fn().mockImplementation(() => new Promise<ParameterCategory[]>(done => { resolve = done }))
    const updateCategory = vi.fn().mockImplementation(async (id: string, input: { name: string }) => {
      list = list.map(category => category.id === id ? { ...category, name: input.name, revision: category.revision + 1 } : category)
      return list.find(category => category.id === id)
    })
    const { user, queryClient } = setup({ reorderCategories, updateCategory, categories: vi.fn().mockImplementation(async () => list) })
    const dialog = await open(user)
    await user.click(dialog.getByRole('button', { name: '拖拽排序' }))
    fireEvent.keyDown(dialog.getByRole('treeitem', { name: /另一分类/ }), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(reorderCategories).toHaveBeenCalledOnce())
    expect(queryClient.getQueryData(['parameter-categories'])).toEqual(list)
    expect(dialog.getByRole('button', { name: '完成' })).toBeDisabled()
    await act(async () => { resolve(list) })
    expect(await dialog.findByRole('alert')).toHaveTextContent(/排序修订未确认/)
    expect(dialog.queryByText('分类层级与顺序已保存')).not.toBeInTheDocument()
    await waitFor(() => expect(dialog.getByRole('button', { name: '完成' })).toBeEnabled())
    await user.click(dialog.getByRole('treeitem', { name: /临床AI/ }))
    await user.click(dialog.getByRole('button', { name: '编辑节点' }))
    await user.clear(dialog.getByRole('textbox', { name: /分类名称/ }))
    await user.type(dialog.getByRole('textbox', { name: /分类名称/ }), '已核实分类')
    await user.click(dialog.getByRole('button', { name: '保存分类' }))
    expect(await screen.findByText('已保存分类“已核实分类”')).toBeInTheDocument()
    expect(dialog.queryByText(/排序修订未确认/)).not.toBeInTheDocument()
  })

  it('locks a pending form and ignores a response after a work-context switch', async () => {
    let resolve!: (category: ParameterCategory) => void
    const updateCategory = vi.fn().mockImplementation(() => new Promise<ParameterCategory>(done => { resolve = done }))
    const { user, api, queryClient, rerender } = setup({ updateCategory })
    const dialog = await edit(user)
    await user.click(dialog.getByRole('button', { name: '保存分类' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledOnce())
    expect(dialog.getByRole('textbox', { name: /分类名称/ }).closest('form')).toHaveAttribute('inert')
    expect(dialog.getByRole('button', { name: '完成' })).toBeDisabled()
    rerender(<QueryClientProvider client={queryClient}><ParameterManagement api={api} context={{ ...mockContext, tenantId: 'other-tenant' }} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '参数分类管理' })).not.toBeInTheDocument())
    await act(async () => { resolve({ ...mockCategories[0], name: '修订后的分类', revision: 2 }) })
    expect(queryClient.getQueryData(['parameter-categories'])).toEqual(mockCategories)
    expect(screen.queryByText('参数分类已更新')).not.toBeInTheDocument()
  })

  it('moves down one sibling with the keyboard and only publishes the confirmed order', async () => {
    let list = [{ ...mockCategories[0], sortOrder: 10 }, { ...mockCategories[0], id: 'other', code: 'OTHER', name: '另一分类', sortOrder: 20 }]
    const reorderCategories = vi.fn().mockImplementation(async (orders: Array<{ id: string; sortOrder: number; parentId?: string }>) => {
      list = list.map(category => {
        const order = orders.find(item => item.id === category.id)
        return order ? { ...category, ...order, revision: category.revision + 1 } : category
      })
      return list
    })
    const { user } = setup({ reorderCategories, categories: vi.fn().mockImplementation(async () => list) })
    const dialog = await open(user)
    await user.click(dialog.getByRole('button', { name: '拖拽排序' }))
    fireEvent.keyDown(dialog.getByRole('treeitem', { name: /临床AI/ }), { key: 'ArrowDown', altKey: true })
    expect(await screen.findByText('分类层级与顺序已保存')).toBeInTheDocument()
    expect(reorderCategories).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cat-ai', sortOrder: 20, expectedRevision: 1 }),
      expect.objectContaining({ id: 'other', sortOrder: 10, expectedRevision: 1 }),
    ])
    expect(dialog.getAllByRole('treeitem').map(row => row.getAttribute('data-tree-node-id'))).toEqual([null, 'other', 'cat-ai'])
    fireEvent.keyDown(dialog.getByRole('treeitem', { name: /临床AI/ }), { key: 'ArrowDown', altKey: true })
    expect(reorderCategories).toHaveBeenCalledTimes(1)
  })
})

const mockContext = {
  tenantId: '1000',
  organization: { id: '362387869790211', name: '总院' },
  department: { id: '362387869790311', name: '内科' },
  userId: '362387869790001',
}

const mockCategories: ParameterCategory[] = [
  { id: 'cat-ai', code: 'AI_CLINICAL', name: '临床AI', sortOrder: 1, sdParamStatus: 'ACTIVE', sdParamStatusText: '启用', revision: 1 },
]

const mockDefinitions: ParameterDefinitionSummary[] = [
  {
    id: 'def-mode',
    revision: 1,
    categoryId: 'cat-ai',
    categoryName: '临床AI',
    key: 'ai.clinical.mode',
    name: 'AI运行模式',
    sdParamValueType: 'STRING',
    sdParamValueTypeText: '字符串',
    sdParamControlType: 'TEXT',
    sdParamControlTypeText: '单行文本',
    sdParamConfigType: 'BUSINESS',
    sdParamConfigTypeText: '业务参数',
    sdParamStatus: 'ACTIVE',
    sdParamStatusText: '启用',
    valueCount: 1,
    updatedAt: '2026-09-10T10:00:00Z',
    dependencySatisfied: true,
  },
  {
    id: 'def-model',
    revision: 1,
    categoryId: 'cat-ai',
    categoryName: '临床AI',
    key: 'ai.clinical.model',
    name: '临床模型标识',
    sdParamValueType: 'STRING',
    sdParamValueTypeText: '字符串',
    sdParamControlType: 'TEXT',
    sdParamControlTypeText: '单行文本',
    sdParamConfigType: 'BUSINESS',
    sdParamConfigTypeText: '业务参数',
    sdParamStatus: 'ACTIVE',
    sdParamStatusText: '启用',
    valueCount: 1,
    updatedAt: '2026-09-10T10:00:00Z',
    dependsOnKey: 'ai.clinical.mode',
    dependsOnValue: 'MODEL',
    dependencyBehavior: 'DISABLE_AND_SUPPRESS',
    dependsOnName: 'AI运行模式',
    dependencySatisfied: false,
  },
]

const mockDetailModel: ParameterDefinition = {
  ...mockDefinitions[1],
  description: '大语言模型标识',
  hasDefaultValue: false,
  hasExampleValue: false,
  allowedScopes: ['TENANT'],
  inheritanceEnabled: true,
  cacheEnabled: true,
  nullableValue: false,
  sdParamSensitivity: 'NORMAL',
  sdParamSensitivityText: '普通',
  sdParamDisplayPolicy: 'PLAIN',
  sdParamDisplayPolicyText: '明文',
  createdAt: '2026-09-10T10:00:00Z',
  revision: 2,
  values: [
    {
      id: 'val-1',
      definitionId: 'def-model',
      sdParamScopeType: 'TENANT',
      sdParamScopeTypeText: '租户',
      scopeCode: 'TENANT:1000', scopeId: '1000', tenantId: '1000',
      sdParamValueMode: 'OVERRIDE',
      sdParamValueModeText: '覆盖',
      valueJson: '"qwen-max"',
      displayValue: '"qwen-max"',
      hasValue: true,
      secretReference: false,
      sdParamStatus: 'ACTIVE',
      sdParamStatusText: '启用',
      updatedAt: '2026-09-10T10:00:00Z',
      revision: 1,
    },
  ],
}

const mockDetailMode: ParameterDefinition = {
  ...mockDefinitions[0],
  description: '控制AI运行的主策略',
  hasDefaultValue: false,
  hasExampleValue: false,
  allowedScopes: ['TENANT'],
  inheritanceEnabled: true,
  cacheEnabled: true,
  nullableValue: false,
  sdParamSensitivity: 'NORMAL',
  sdParamSensitivityText: '普通',
  sdParamDisplayPolicy: 'PLAIN',
  sdParamDisplayPolicyText: '明文',
  createdAt: '2026-09-10T10:00:00Z',
  revision: 1,
  values: [],
}

const mockSystemEnums: SystemEnumDefinition[] = [
  { code: 'PARAM_VALUE_TYPE', name: '值类型', description: '', items: [{ code: 'STRING', name: '字符串', description: '', sortOrder: 1 }] },
  { code: 'PARAM_CONTROL_TYPE', name: '控件类型', description: '', items: [{ code: 'TEXT', name: '单行文本', description: '', sortOrder: 1 }, { code: 'SECRET_REFERENCE', name: '密钥引用', description: '', sortOrder: 2 }] },
  { code: 'PARAM_CONFIG_TYPE', name: '配置属性', description: '', items: [{ code: 'BUSINESS', name: '业务参数', description: '', sortOrder: 1 }] },
  { code: 'PARAM_SCOPE_TYPE', name: '作用域类型', description: '', items: [{ code: 'TENANT', name: '租户', description: '', sortOrder: 1 }] },
  { code: 'PARAM_SENSITIVITY', name: '敏感级别', description: '', items: [{ code: 'NORMAL', name: '普通', description: '', sortOrder: 1 }, { code: 'SECRET', name: '机密', description: '', sortOrder: 2 }] },
  { code: 'PARAM_DISPLAY_POLICY', name: '展示策略', description: '', items: [{ code: 'PLAIN', name: '明文', description: '', sortOrder: 1 }, { code: 'HIDDEN', name: '隐藏', description: '', sortOrder: 2 }] },
  { code: 'PARAM_VALUE_MODE', name: '值模式', description: '', items: [{ code: 'OVERRIDE', name: '覆盖', description: '', sortOrder: 1 }] },
]

function savedValueResult(definition: ParameterDefinition, input: ParameterValueInput): ParameterDefinition {
  const scopeId = input.scopeType === 'TENANT' ? mockContext.tenantId : input.scopeId
  const scopeCode = input.scopeType === 'PLATFORM' ? 'PLATFORM' : `${input.scopeType}:${scopeId}`
  const original = definition.values.find(value => value.scopeCode === scopeCode)
  const saved = { ...mockDetailModel.values[0], ...original, id: original?.id ?? 'new-value', definitionId: definition.id,
    tenantId: input.scopeType === 'PLATFORM' ? undefined : mockContext.tenantId,
    scopeId, scopeCode, sdParamScopeType: input.scopeType, sdParamValueMode: input.valueMode,
    revision: (input.expectedRevision ?? -1) + 1, hasValue: input.valueMode === 'OVERRIDE',
    secretReference: Boolean(input.secretRef), valueJson: input.valueJson, displayValue: input.valueJson,
  }
  return { ...definition, values: [...definition.values.filter(value => value.scopeCode !== scopeCode), saved] }
}

function savedDefinitionResult(definition: ParameterDefinition, input: ParameterDefinitionInput): ParameterDefinition {
  const protectedSource = definition.sdParamSensitivity !== 'NORMAL' || definition.sdParamDisplayPolicy !== 'PLAIN'
  const reveal = input.sensitivity === 'NORMAL' && input.displayPolicy === 'PLAIN'
  const defaultPresent = input.defaultValueJson != null || protectedSource && input.sensitivity !== 'SECRET' && Boolean(definition.hasDefaultValue)
  const examplePresent = input.exampleValueJson != null || protectedSource && Boolean(definition.hasExampleValue)
  return { ...definition, revision: definition.revision + 1, key: input.key, name: input.name, categoryId: input.categoryId,
    description: input.description, sdParamValueType: input.valueType, sdParamControlType: input.controlType,
    sdParamConfigType: input.category, sdParamSensitivity: input.sensitivity!, sdParamDisplayPolicy: input.displayPolicy!,
    inheritanceEnabled: input.inheritanceEnabled!, cacheEnabled: input.cacheEnabled!, nullableValue: input.nullableValue!,
    jsonSchema: input.jsonSchema, unit: input.unit, dictionaryCode: input.dictionaryCode, allowedScopes: input.allowedScopes,
    hasDefaultValue: defaultPresent, hasExampleValue: examplePresent,
    defaultValueJson: reveal ? input.defaultValueJson : undefined, exampleValueJson: reveal ? input.exampleValueJson : undefined,
    dependsOnKey: input.dependsOnKey, dependsOnValue: input.dependsOnValue,
    dependencyBehavior: input.dependencyBehavior ?? 'DISABLE_AND_SUPPRESS' }
}

function renderWorkspace(api: RhnApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ParameterManagement api={api} context={mockContext} />
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

describe('ParameterManagement Dependency & Suppression', () => {
  it.each(['null', '"null"'])('preserves default JSON %s when editing a nullable definition', async (defaultValueJson) => {
    const user = userEvent.setup()
    const definition = { ...mockDetailMode, nullableValue: true, defaultValueJson, hasDefaultValue: true }
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(definition, input)))
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([mockDefinitions[0]]),
        get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([]), update,
      },
    } as unknown as RhnApi
    renderWorkspace(api)
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    const nullCheckbox = screen.getByRole('checkbox', { name: /默认值为空/ })
    if (defaultValueJson === 'null') expect(nullCheckbox).toBeChecked()
    else {
      expect(nullCheckbox).not.toBeChecked()
      expect(screen.getByPlaceholderText('请输入默认内容')).toHaveValue('null')
    }
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith(definition.id, definition.revision,
      expect.objectContaining({ defaultValueJson, nullableValue: true }), expect.any(String)))
  })

  it('displays dependency badge and suppression banner when condition is not satisfied', async () => {
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue(mockDefinitions),
        get: vi.fn().mockImplementation((id: string) => {
          if (id === 'def-model') return Promise.resolve(mockDetailModel)
          return Promise.resolve(mockDetailMode)
        }),
        changes: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi

    renderWorkspace(api)

    // 找到临床模型标识卡片，断言依赖与抑制徽章
    const modelCard = await screen.findByRole('option', { name: /临床模型标识/ })
    expect(modelCard).toHaveTextContent('依赖: AI运行模式')
    expect(modelCard).toHaveTextContent('预览条件未满足')

    // 点击卡片查看详情
    const user = userEvent.setup()
    await user.click(modelCard)

    // 断言详情面板中的依赖提示横幅
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('前置依赖预览：预览条件未满足')
    })
    expect(screen.getByRole('status')).toHaveTextContent('期望匹配值：MODEL')
    expect(screen.getByRole('status')).toHaveTextContent('当前预览范围内的前置条件未满足')

    // 断言存在“查看/配置前置参数”一键跳转按钮
    const jumpButton = screen.getByRole('button', { name: /查看\/配置前置参数/ })
    expect(jumpButton).toBeInTheDocument()

    // 点击一键跳转前置参数
    await user.click(jumpButton)

    // 选中前置参数 ai.clinical.mode
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'AI运行模式' })).toBeInTheDocument()
    })
  })

  it('submits dependency settings in create and edit parameter dialogs', async () => {
    const user = userEvent.setup()
    const updateFn = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(mockDetailModel, input)))

    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([mockDefinitions[1]]),
        get: vi.fn().mockResolvedValue(mockDetailModel),
        changes: vi.fn().mockResolvedValue([]),
        update: updateFn,
      },
    } as unknown as RhnApi

    renderWorkspace(api)

    // 等待详情加载后点击编辑定义
    const editBtn = await screen.findByRole('button', { name: '编辑定义' })
    await user.click(editBtn)

    // 检查前置依赖分组
    expect(screen.getByRole('heading', { level: 3, name: '前置依赖与联动策略' })).toBeInTheDocument()

    // 修改期望生效值并保存
    const expectedValueInput = screen.getByPlaceholderText('例如: MODEL 或 true')
    expect(expectedValueInput).toHaveValue('MODEL')
    await user.clear(expectedValueInput)
    await user.type(expectedValueInput, 'LOCAL_OR_MODEL')

    await user.click(screen.getByRole('button', { name: '保存定义' }))

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith(
        'def-model',
        2,
        expect.objectContaining({
          dependsOnKey: 'ai.clinical.mode',
          dependsOnValue: 'LOCAL_OR_MODEL',
          dependencyBehavior: 'DISABLE_AND_SUPPRESS',
        }),
        expect.any(String),
      )
    })
  })

  it('allows switching control type to SECRET_REFERENCE and back to TEXT without lockup', async () => {
    const user = userEvent.setup()
    const createFn = vi.fn().mockResolvedValue(mockDetailModel)

    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue(mockDefinitions),
        get: vi.fn().mockResolvedValue(mockDetailModel),
        changes: vi.fn().mockResolvedValue([]),
        create: createFn,
      },
    } as unknown as RhnApi

    renderWorkspace(api)

    const newBtn = await screen.findByRole('button', { name: '新建参数' })
    await user.click(newBtn)

    // 检查界面控件选择器
    const controlSelect = screen.getByRole('combobox', { name: '界面控件' })
    expect(controlSelect).not.toBeDisabled()
    expect(controlSelect).toHaveTextContent('单行文本')

    // 点击展开界面控件选项列表并选择“密钥引用”
    await user.click(controlSelect)
    const secretRefOption = await screen.findByRole('option', { name: /密钥引用/ })
    await user.click(secretRefOption)

    // 验证界面控件显示为密钥引用，且没有被 disabled 锁定
    expect(controlSelect).toHaveTextContent('密钥引用')
    expect(controlSelect).not.toBeDisabled()

    // 此时敏感级别被联动为机密 (SECRET)
    const sensitivitySelect = screen.getByRole('combobox', { name: '敏感级别' })
    expect(sensitivitySelect).toHaveTextContent('机密')

    // 用户再次点击界面控件下拉框，切换回“单行文本”
    await user.click(controlSelect)
    const textOption = await screen.findByRole('option', { name: /单行文本/ })
    await user.click(textOption)

    // 验证控件恢复为单行文本，且敏感级别自动退回普通 (NORMAL)
    expect(controlSelect).toHaveTextContent('单行文本')
    expect(sensitivitySelect).toHaveTextContent('普通')
  })

  it('renders categories on the leftmost sidebar and filters parameters when clicked', async () => {
    const user = userEvent.setup()
    const definitionsFn = vi.fn().mockResolvedValue(mockDefinitions)

    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: definitionsFn,
        get: vi.fn().mockResolvedValue(mockDetailModel),
        changes: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi

    renderWorkspace(api)

    // 验证左侧分类导航面板头部与选项存在
    expect(await screen.findByRole('heading', { level: 2, name: '参数分类' })).toBeInTheDocument()
    const allTab = await screen.findByRole('treeitem', { name: /全部参数/ })
    expect(allTab).toBeInTheDocument()
    expect(allTab).toHaveAttribute('aria-selected', 'true')

    // 验证具体分类“临床AI”项存在且不包含技术编码
    const aiCategoryTab = await screen.findByRole('treeitem', { name: /临床AI/ })
    expect(aiCategoryTab).toBeInTheDocument()
    expect(aiCategoryTab).toHaveTextContent('临床AI')
    expect(aiCategoryTab).not.toHaveTextContent('AI_CLINICAL')

    // 点击临床AI分类
    await user.click(aiCategoryTab)

    // 验证触发按 cat-ai 过滤查询
    await waitFor(() => {
      expect(definitionsFn).toHaveBeenCalledWith('', 'cat-ai', '', '')
    })
    expect(aiCategoryTab).toHaveAttribute('aria-selected', 'true')

    // 分类仍可按编码搜索，但界面不重复展示技术编码。
    await user.type(screen.getByRole('textbox', { name: '搜索分类' }), 'AI_CLINICAL')
    expect(screen.getByRole('treeitem', { name: /临床AI/ })).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: '搜索分类' }))

    // 共享树的 Home/Enter 可恢复全部参数，与点击根节点具有相同业务结果。
    aiCategoryTab.focus()
    await user.keyboard('{Home}')
    await waitFor(() => expect(allTab).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(definitionsFn).toHaveBeenLastCalledWith('', '', '', ''))
    expect(allTab).toHaveAttribute('aria-selected', 'true')
  })

  it('locks configuration category and customizes header when fixedConfigType="BUSINESS"', async () => {
    const definitionsFn = vi.fn().mockResolvedValue(mockDefinitions)
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: definitionsFn,
        get: vi.fn().mockResolvedValue(mockDetailMode),
        changes: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ParameterManagement api={api} context={mockContext} fixedConfigType="BUSINESS" />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: '业务参数配置' })).toBeInTheDocument()
    expect(screen.getByText('按医院、科室维护门诊、挂号、处方、收费等业务流程控制策略与预警阈值。')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '配置属性' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(definitionsFn).toHaveBeenCalledWith('', '', 'BUSINESS', '')
    })
  })
})


describe('ParameterManagement query facts', () => {
  function apiWith(overrides: Record<string, unknown> = {}) {
    return {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([mockDefinitions[0]]),
        get: vi.fn().mockResolvedValue(mockDetailMode),
        changes: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(mockDetailMode),
        rollback: vi.fn().mockResolvedValue(mockDetailMode),
        ...overrides,
      },
    } as unknown as RhnApi
  }

  it('shows unknown category counts when the totals query fails and recovers on retry', async () => {
    const user = userEvent.setup()
    let failed = true
    const definitions = vi.fn().mockImplementation((...args: unknown[]) => args.length === 0 && failed
      ? Promise.reject(new Error('参数总览连接失败')) : Promise.resolve([mockDefinitions[0]]))
    renderWorkspace(apiWith({ definitions }))
    expect(await screen.findByText('参数总览连接失败')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('数量待确认')
    expect(screen.getByRole('treeitem', { name: /临床AI/ })).toHaveTextContent('数量待确认')
    expect(screen.getByRole('button', { name: '新建参数' })).toBeDisabled()
    failed = false
    await user.click(screen.getByRole('button', { name: '重新加载参数' }))
    await waitFor(() => expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('1 项参数'))
    expect(screen.getByRole('button', { name: '新建参数' })).toBeEnabled()
  })

  it('does not show a failed category query as an empty category tree', async () => {
    renderWorkspace(apiWith({ categories: vi.fn().mockRejectedValue(new Error('分类服务不可用')) }))
    expect(await screen.findByText('参数分类加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /全部参数/ })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无节点')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '管理分类' })).toBeDisabled()
  })

  it.each([null, {}, ''])('rejects incomplete list response %j instead of displaying zero', async (response) => {
    renderWorkspace(apiWith({ definitions: vi.fn().mockResolvedValue(response) }))
    expect(await screen.findByText(/参数总览返回数据不完整/)).toBeInTheDocument()
    expect(screen.queryByText('未找到匹配参数')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无参数')).not.toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('数量待确认')
  })

  it('displays a confirmed empty result as zero', async () => {
    renderWorkspace(apiWith({ definitions: vi.fn().mockResolvedValue([]) }))
    expect(await screen.findByText('未找到匹配参数')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('0 项参数')
    expect(screen.getByText('暂无参数')).toBeInTheDocument()
  })

  it('keeps counts unknown while the request is pending', async () => {
    let resolveList!: (value: ParameterDefinitionSummary[]) => void
    const pending = new Promise<ParameterDefinitionSummary[]>((resolve) => { resolveList = resolve })
    renderWorkspace(apiWith({ definitions: vi.fn().mockReturnValue(pending) }))
    expect(await screen.findByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('数量待确认')
    expect(screen.queryByText('暂无参数')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建参数' })).toBeDisabled()
    await act(async () => { resolveList([]) })
    await waitFor(() => expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('0 项参数'))
  })

  it.each([null, { ...mockDetailMode, values: null }])('rejects incomplete detail response', async (value) => {
    renderWorkspace(apiWith({ get: vi.fn().mockResolvedValue(value) }))
    expect(await screen.findByText('参数详情加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无参数')).not.toBeInTheDocument()
    expect(screen.queryByText('尚未维护当前值')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '维护当前值' })).not.toBeInTheDocument()
  })

  it.each(['sdParamValueType', 'sdParamSensitivity', 'sdParamDisplayPolicy', 'inheritanceEnabled', 'cacheEnabled',
    'nullableValue', 'hasDefaultValue', 'hasExampleValue', 'allowedScopes', 'revision'])
  ('blocks existing-definition defaults when the server omits %s and recovers on retry', async key => {
    const user = userEvent.setup()
    const get = vi.fn().mockResolvedValue({ ...mockDetailMode, [key]: undefined })
    renderWorkspace(apiWith({ get }))
    expect(await screen.findByText('参数详情加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑定义' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '维护当前值' })).not.toBeInTheDocument()
    get.mockResolvedValue(mockDetailMode)
    await user.click(screen.getByRole('button', { name: '重新加载参数' }))
    expect(await screen.findByRole('button', { name: '编辑定义' })).toBeEnabled()
  })

  it.each([
    { ...mockDetailMode, id: 'another-definition' },
    { ...mockDetailMode, values: [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id, tenantId: 'another-tenant' }] },
  ])('does not expose actions for detail belonging to another target', async response => {
    renderWorkspace(apiWith({ get: vi.fn().mockResolvedValue(response) }))
    expect(await screen.findByText('参数详情加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑定义' })).not.toBeInTheDocument()
  })

  it('preserves a draft while a malformed refresh blocks saving', async () => {
    const user = userEvent.setup()
    const get = vi.fn().mockResolvedValue(mockDetailMode)
    const update = vi.fn()
    const { queryClient } = renderWorkspace(apiWith({ get, update }))
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    get.mockResolvedValue({ ...mockDetailMode, cacheEnabled: undefined })
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-definition'] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeDisabled())
    expect(screen.getByRole('textbox', { name: /参数名称/ })).toHaveValue('AI运行模式草稿')
    expect(update).not.toHaveBeenCalled()
    get.mockResolvedValue(mockDetailMode)
    await user.click(screen.getByRole('button', { name: '重新确认配置' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: /参数名称/ })).toHaveValue('AI运行模式草稿')
  })

  it('does not publish malformed update responses as confirmed cache or success', async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockResolvedValue({ ...mockDetailMode, sdParamSensitivity: undefined })
    const { queryClient } = renderWorkspace(apiWith({ update }))
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(await within(screen.getByRole('dialog')).findByText(/配置属性、安全策略或状态未确认/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /参数名称/ })).toHaveValue('AI运行模式草稿')
    expect(screen.queryByText(/已更新参数/)).not.toBeInTheDocument()
    const cached = queryClient.getQueriesData<ParameterDefinition>({ queryKey: ['parameter-definition', mockDetailMode.id] })
    expect(cached).toHaveLength(1)
    expect(cached.every(([, data]) => data?.sdParamSensitivity === 'NORMAL')).toBe(true)
  })

  it('hides cached cards and detail actions after a catalog refresh fails', async () => {
    const user = userEvent.setup()
    const definitions = vi.fn().mockResolvedValue([mockDefinitions[0]])
    const { queryClient } = renderWorkspace(apiWith({ definitions }))
    await screen.findByRole('button', { name: '编辑定义' })
    definitions.mockRejectedValue(new Error('目录刷新失败'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-definitions'] }) })
    expect(await screen.findByText('参数目录加载失败')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑定义' })).not.toBeInTheDocument()
    expect(screen.queryByText('未找到匹配参数')).not.toBeInTheDocument()
    definitions.mockResolvedValue([mockDefinitions[0]])
    await user.click(screen.getByRole('button', { name: '重新加载参数' }))
    expect(await screen.findByRole('button', { name: '编辑定义' })).toBeEnabled()
  })

  it('keeps a definition draft but blocks saving until detail refresh succeeds', async () => {
    const user = userEvent.setup()
    const get = vi.fn().mockResolvedValue(mockDetailMode)
    const update = vi.fn().mockResolvedValue(mockDetailMode)
    const { queryClient } = renderWorkspace(apiWith({ get, update }))
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    const dialog = screen.getByRole('dialog', { name: '编辑参数定义' })
    const name = within(dialog).getByRole('textbox', { name: /参数名称/ })
    await user.clear(name)
    await user.type(name, '保留未保存的参数名称')
    get.mockRejectedValue(new Error('详情刷新失败'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-definition'] }) })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存定义' })).toBeDisabled())
    expect(name).toHaveValue('保留未保存的参数名称')
    expect(update).not.toHaveBeenCalled()
    get.mockResolvedValue(mockDetailMode)
    await user.click(within(dialog).getByRole('button', { name: '重新确认配置' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存定义' })).toBeEnabled())
    expect(name).toHaveValue('保留未保存的参数名称')
  })

  it('hides stale history and its rollback button when refreshing history fails', async () => {
    const user = userEvent.setup()
    const history = [{ id: 'change-1', definitionId: 'def-mode', valueId: 'val-1',
      sdParamChangeTargetType: 'VALUE', sdParamChangeType: 'UPDATE', sdParamChangeTypeText: '更新',
      sdParamChangeTargetTypeText: '当前值', reason: '历史配置', changedAt: '2026-09-10T10:00:00Z',
      changedBy: 'operator', requestCode: 'request-1', after: { scopeType: 'TENANT', scopeId: '1000', scopeReference: null,
        scopeCode: 'TENANT:1000', valueMode: 'OVERRIDE', valueJson: '"old"', secretRef: null, active: true } }]
    const changes = vi.fn().mockResolvedValue(history)
    const rollback = vi.fn()
    const { queryClient } = renderWorkspace(apiWith({ changes, rollback, get: vi.fn().mockResolvedValue({ ...mockDetailMode,
      values: [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id }] }) }))
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    expect(await screen.findByRole('button', { name: '恢复此快照' })).toBeEnabled()
    changes.mockRejectedValue(new Error('历史记录刷新失败'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-changes'] }) })
    expect(await screen.findByText('历史记录刷新失败')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '恢复此快照' })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无变更记录')).not.toBeInTheDocument()
    expect(rollback).not.toHaveBeenCalled()
    changes.mockResolvedValue(history)
    await user.click(within(screen.getByRole('dialog', { name: '参数变更记录' })).getByRole('button', { name: '重新确认配置' }))
    expect(await screen.findByRole('button', { name: '恢复此快照' })).toBeEnabled()
  })

  it('counts only the configured page type in the category root', async () => {
    const definitions = [{ ...mockDefinitions[0], sdParamConfigType: 'SYSTEM' }, mockDefinitions[1]]
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}>
      <ParameterManagement api={apiWith({ definitions: vi.fn().mockResolvedValue(definitions) })}
        context={mockContext} fixedConfigType="SYSTEM" />
    </QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('treeitem', { name: /全部参数/ })).toHaveTextContent('1 项参数'))
  })
})


describe('Parameter dependency preview truth', () => {
  function dependencyApi(value?: boolean | null) {
    // The actual summary contract has no dependencySatisfied field.
    const { dependencySatisfied: _ignored, ...summary } = mockDefinitions[1]
    return {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([summary]),
        get: vi.fn().mockResolvedValue({ ...mockDetailModel, dependencySatisfied: value }),
        changes: vi.fn().mockResolvedValue([]),
      },
    } as unknown as RhnApi
  }

  it.each([undefined, null])('does not turn an unknown dependency into suppression', async (value) => {
    renderWorkspace(dependencyApi(value))
    const card = await screen.findByRole('option', { name: /临床模型标识/ })
    expect(card).toHaveTextContent('依赖状态待确认')
    await screen.findByRole('button', { name: '编辑定义' })
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('前置依赖预览：依赖状态待确认')
    expect(screen.queryByText('抑制中')).not.toBeInTheDocument()
    expect(banner).not.toHaveTextContent('条件未满足')
    expect(banner).not.toHaveTextContent('正常生效')
  })

  it.each([[true, '预览条件满足'], [false, '预览条件未满足']] as const)(
    'displays the actual preview result %s without claiming global runtime status', async (value, label) => {
      renderWorkspace(dependencyApi(value))
      await screen.findByRole('button', { name: '编辑定义' })
      expect(screen.getByRole('status')).toHaveTextContent(`前置依赖预览：${label}`)
      expect(screen.getByRole('status')).toHaveTextContent('业务使用时按实际上下文判断')
      expect(screen.getByRole('option', { name: /临床模型标识/ })).toHaveTextContent('依赖状态待确认')
    },
  )

  it('reloads the preview and closes an old draft when work context changes', async () => {
    const user = userEvent.setup()
    const api = dependencyApi(true)
    const get = vi.mocked(api.configuration.get)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}>
      <ParameterManagement api={api} context={mockContext} />
    </QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('dialog', { name: '编辑参数定义' })).toBeInTheDocument()
    get.mockResolvedValue({ ...mockDetailModel, dependencySatisfied: false })
    view.rerender(<QueryClientProvider client={queryClient}>
      <ParameterManagement api={api} context={{ ...mockContext, organization: { id: 'another-org', name: '另一机构' } }} />
    </QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑参数定义' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('预览条件未满足'))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('can retry an unknown preview after the parent configuration recovers', async () => {
    const user = userEvent.setup()
    const api = dependencyApi(null)
    renderWorkspace(api)
    const retry = await screen.findByRole('button', { name: '重新判断依赖' })
    vi.mocked(api.configuration.get).mockResolvedValue({ ...mockDetailModel, dependencySatisfied: true })
    await user.click(retry)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('预览条件满足'))
    expect(screen.queryByRole('button', { name: '重新判断依赖' })).not.toBeInTheDocument()
  })
})

describe('Parameter validation schema truth', () => {
  async function editDefinition(overrides: Partial<ParameterDefinition>) {
    const definition = { ...mockDetailMode, ...overrides }
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(definition, input)))
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([definition]),
        get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([]), update,
      },
    } as unknown as RhnApi
    renderWorkspace(api)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    return { user, update, definition }
  }

  it.each([undefined, '{}', '{ "required": ["a,b", " padded "] }']) (
    'preserves unspecified JSON structure and original schema on rename: %s', async (jsonSchema) => {
      const { user, update } = await editDefinition({ jsonSchema, sdParamValueType: 'JSON', sdParamControlType: 'JSON_EDITOR' })
      expect(screen.getByText('JSON 对象或数组规则')).toBeInTheDocument()
      await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '新版')
      await user.click(screen.getByRole('button', { name: '保存定义' }))
      await waitFor(() => expect(update).toHaveBeenCalled())
      expect(update.mock.calls[0][2].jsonSchema).toBe(jsonSchema)
    },
  )

  it.each(['{broken', '[]', '{"type":"number"}', '{"minLength":"3"}', '{"minLength":5,"maxLength":2}']) (
    'shows invalid source and blocks save until explicitly repaired: %s', async (jsonSchema) => {
      const { user, update } = await editDefinition({ jsonSchema })
      const raw = screen.getByRole('textbox', { name: '原始校验规则（JSON）' })
      expect(raw).toHaveValue(jsonSchema)
      expect(raw).toHaveAttribute('aria-invalid', 'true')
      await user.click(screen.getByRole('button', { name: '保存定义' }))
      expect(update).not.toHaveBeenCalled()
      await user.clear(raw)
      const repaired = '{"type":"string","enum":["a,b"," padded "]}'
      await user.click(raw)
      await user.paste(repaired)
      await user.click(screen.getByRole('button', { name: '保存定义' }))
      await waitFor(() => expect(update).toHaveBeenCalled())
      expect(update.mock.calls[0][2].jsonSchema).toBe(repaired)
    },
  )

  it('changes only the edited length and preserves enum values, regex spaces and other keywords', async () => {
    const original = { type: 'string', enum: ['a,b', ' padded ', 'line\nbreak'], pattern: ' ^x$ ', minimum: 2, required: ['a,b'] }
    const { user, update } = await editDefinition({ jsonSchema: JSON.stringify(original) })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    const enumField = screen.getByRole('textbox', { name: '限定可选值（原始数组）' })
    expect(enumField).toHaveValue(JSON.stringify(original.enum))
    expect(enumField).toHaveAttribute('readonly')
    await user.type(screen.getByRole('spinbutton', { name: '最大长度' }), '20')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual({ ...original, maxLength: 20 })
  })

  it('preserves Java regex syntax when editing a different rule', async () => {
    const original = { pattern: '(?i)abc' }
    const { user, update } = await editDefinition({ jsonSchema: JSON.stringify(original) })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    await user.type(screen.getByRole('spinbutton', { name: '最大长度' }), '20')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual({ ...original, maxLength: 20 })
  })

  it('preserves leading and trailing spaces when explicitly editing a pattern', async () => {
    const { user, update } = await editDefinition({ jsonSchema: '{}' })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    await user.type(screen.getByRole('textbox', { name: '格式规则（正则表达式）' }), ' x ')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual({ pattern: ' x ' })
  })

  it('retains exact required field names when explicitly changing the JSON structure', async () => {
    const original = { type: 'object', required: ['a,b', ' padded '], properties: { 'a,b': { type: 'string' } } }
    const { user, update } = await editDefinition({ jsonSchema: JSON.stringify(original), sdParamValueType: 'JSON', sdParamControlType: 'JSON_EDITOR' })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    expect(screen.getByRole('textbox', { name: '必填属性（原始数组）' })).toHaveValue(JSON.stringify(original.required))
    await user.click(screen.getByRole('combobox', { name: '数据结构' }))
    await user.click(screen.getByRole('option', { name: /对象或数组/ }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    const { type: _type, ...expected } = original
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual(expected)
  })

  it('removes only the explicitly cleared numeric constraint', async () => {
    const original = { type: 'integer', minimum: 2, maximum: 10, enum: [2, 5], multipleOf: 1 }
    const { user, update } = await editDefinition({ jsonSchema: JSON.stringify(original), sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER' })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    await user.clear(screen.getByRole('textbox', { name: '最小值' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    const { minimum: _minimum, ...expected } = original
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual(expected)
  })

  it('shows simple enum separators and changes only the explicitly edited list', async () => {
    const original = { enum: ['enabled', 'disabled'], minLength: 1 }
    const { user, update } = await editDefinition({ jsonSchema: JSON.stringify(original) })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    const choices = screen.getByRole('textbox', { name: '限定可选值' })
    expect(choices).toHaveValue('enabled, disabled')
    await user.type(choices, ', pending')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual({ ...original, enum: ['enabled', 'disabled', 'pending'] })
  })

  it('opens the updated source without dropping earlier edits and accepts Java regex syntax', async () => {
    const { user, update } = await editDefinition({ jsonSchema: '{"minLength":1}' })
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    await user.type(screen.getByRole('textbox', { name: '格式规则（正则表达式）' }), '(?i)abc')
    await user.click(screen.getByRole('button', { name: '查看或编辑原始规则' }))
    expect(screen.getByRole('textbox', { name: '原始校验规则（JSON）' })).toHaveValue('{"minLength":1,"pattern":"(?i)abc"}')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(JSON.parse(update.mock.calls[0][2].jsonSchema)).toEqual({ minLength: 1, pattern: '(?i)abc' })
  })
})

describe('Parameter scope truth', () => {
  const scopeEnums = mockSystemEnums.map((entry) => entry.code === 'PARAM_SCOPE_TYPE' ? {
    ...entry, items: ['PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT'].map((code, sortOrder) => ({
      code, name: { PLATFORM: '平台', TENANT: '租户', ORGANIZATION: '机构', DEPARTMENT: '科室' }[code]!, description: '', sortOrder,
    })),
  } : entry)
  const departmentProfile = { department: { id: 'dept-other', organizationId: 'org-other' } }

  function setup(definition: ParameterDefinition, department = vi.fn().mockResolvedValue(departmentProfile)) {
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(definition, input)))
    const saveValue = vi.fn().mockImplementation((_id: string, input: ParameterValueInput) => Promise.resolve(savedValueResult(definition, input)))
    const departments = vi.fn().mockResolvedValue([{ id: 'dept-other', organizationId: 'org-other', name: '外院科室', code: 'DEPT' }])
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(scopeEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([definition]),
        get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([]), update, saveValue,
      },
      organization: {
        department, departments,
        list: vi.fn().mockResolvedValue([{ id: 'org-other', name: '外院', code: 'OTHER' }]),
      },
    } as unknown as RhnApi
    const view = renderWorkspace(api)
    return { ...view, user: userEvent.setup(), update, saveValue, departments }
  }

  function departmentDefinition(): ParameterDefinition {
    return { ...mockDetailMode, allowedScopes: ['DEPARTMENT'], values: [{
      ...mockDetailModel.values[0], definitionId: mockDetailMode.id,
      sdParamScopeType: 'DEPARTMENT', sdParamScopeTypeText: '科室', scopeId: 'dept-other', scopeCode: 'DEPARTMENT:dept-other',
    }] }
  }

  it('preserves every allowed scope when only editing a name', async () => {
    const allowedScopes: ParameterDefinition['allowedScopes'] = ['PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT']
    const { user, update } = setup({ ...mockDetailMode, allowedScopes })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('combobox', { name: '参数级别' }))
    for (const name of ['平台', '租户', '机构', '科室']) {
      expect(screen.getByRole('option', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true')
    }
    await user.keyboard('{Escape}')
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '新版')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].allowedScopes).toEqual(allowedScopes)
  })

  it('updates only the scopes explicitly selected or removed', async () => {
    const { user, update } = setup({ ...mockDetailMode, allowedScopes: ['PLATFORM', 'TENANT'] })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('combobox', { name: '参数级别' }))
    await user.click(screen.getByRole('option', { name: /平台/ }))
    await user.click(screen.getByRole('option', { name: /科室/ }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].allowedScopes).toEqual(['TENANT', 'DEPARTMENT'])
  })

  it('does not invent a tenant scope for an existing definition with no allowed scopes', async () => {
    const { user, update } = setup({ ...mockDetailMode, allowedScopes: [] })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText('至少选择一个参数级别')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '参数级别' }))
    await user.click(screen.getByRole('option', { name: /租户/ }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].allowedScopes).toEqual(['TENANT'])
  })

  it('waits for actual department ownership before saving, without querying the current organization', async () => {
    let resolveDepartment!: (value: typeof departmentProfile) => void
    const department = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveDepartment = resolve }))
    const { user, saveValue, departments } = setup(departmentDefinition(), department)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
    expect(screen.getByText('正在核实当前科室的所属机构…')).toBeInTheDocument()
    expect(departments).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '保留草稿')
    await act(async () => { resolveDepartment(departmentProfile) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: '变更原因' })).toHaveValue('保留草稿')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalled())
    expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({
      scopeId: 'dept-other', organizationId: 'org-other', reason: '保留草稿',
    }))
    expect(departments).not.toHaveBeenCalledWith(mockContext.organization.id)
  })

  it.each([null, { department: { id: 'wrong-department', organizationId: 'org-other' } },
    { department: { id: 'dept-other', organizationId: '' } }])(
    'blocks invalid ownership response %j and retries without losing the draft', async (response) => {
      const department = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(departmentProfile)
      const { user, saveValue } = setup(departmentDefinition(), department)
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      expect(await screen.findByText('科室归属未确认，无法保存当前值。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
      expect(saveValue).not.toHaveBeenCalled()
      await user.type(screen.getByRole('textbox', { name: '变更原因' }), '确认归属后保存')
      await user.click(screen.getByRole('button', { name: '重新确认科室归属' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
      await user.click(screen.getByRole('button', { name: '保存当前值' }))
      await waitFor(() => expect(saveValue).toHaveBeenCalled())
      expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({ organizationId: 'org-other', reason: '确认归属后保存' }))
    },
  )

  it('does not use cached ownership while a refresh is pending or failed', async () => {
    let rejectRefresh!: (reason: Error) => void
    const department = vi.fn().mockResolvedValueOnce(departmentProfile)
      .mockImplementation(() => new Promise((_resolve, reject) => { rejectRefresh = reject }))
    const { user, queryClient, saveValue } = setup(departmentDefinition(), department)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '刷新中保留')
    act(() => { void queryClient.invalidateQueries({ queryKey: ['parameter-value-department'] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled())
    await act(async () => { rejectRefresh(new Error('科室服务不可用')) })
    expect(await screen.findByText('科室服务不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '变更原因' })).toHaveValue('刷新中保留')
    expect(saveValue).not.toHaveBeenCalled()
  })
})

describe('Direct visit service configuration truth', () => {
  const service = {
    id: 'service-1', name: '普通门诊诊查', code: 'VISIT', sdStatus: 'ACTIVE', orderable: true,
    sdUsageType: 'OUTPATIENT', serviceSubtype: 'OUTPATIENT_VISIT', accountingCategory: 'REGISTRATION',
    organizationAdoption: { catalogItemId: 'service-1', organizationId: 'shared-source-org',
      sdStatus: 'ACTIVE', orderable: true, executable: true },
  }
  function setup(services = vi.fn().mockResolvedValue([service]), existing = true) {
    const definition: ParameterDefinition = { ...mockDetailMode, key: 'outpatient.direct-visit.catalog-item-id',
      name: '直接接诊门诊服务', allowedScopes: ['DEPARTMENT'], nullableValue: true,
      values: existing ? [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id,
        sdParamScopeType: 'DEPARTMENT', scopeId: mockContext.department.id, scopeCode: `DEPARTMENT:${mockContext.department.id}`, valueJson: '"service-1"', displayValue: '"service-1"' }] : [],
    }
    const enums = mockSystemEnums.map(entry => entry.code === 'PARAM_SCOPE_TYPE'
      ? { ...entry, items: [{ code: 'DEPARTMENT', name: '科室', description: '', sortOrder: 1 }] }
      : entry.code === 'PARAM_VALUE_MODE' ? { ...entry, items: [...entry.items,
        { code: 'EXPLICIT_NULL', name: '显式空值', description: '', sortOrder: 2 }] } : entry)
    const saveValue = vi.fn().mockImplementation((_id: string, input: ParameterValueInput) => Promise.resolve(savedValueResult(definition, input)))
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(enums) },
      configuration: { categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue([definition]), get: vi.fn().mockResolvedValue(definition),
        changes: vi.fn().mockResolvedValue([]), saveValue },
      organization: {
        department: vi.fn().mockResolvedValue({ department: { ...mockContext.department, organizationId: mockContext.organization.id } }),
        list: vi.fn().mockResolvedValue([mockContext.organization]),
        departments: vi.fn().mockResolvedValue([{ ...mockContext.department, organizationId: mockContext.organization.id }]),
      }, masterData: { services },
    } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), saveValue, services }
  }

  it('blocks initial pending data and uses the verified tenant and department organization, including shared adoption', async () => {
    let resolve!: (data: typeof service[]) => void
    const services = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
    const { user, saveValue, queryClient } = setup(services)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await waitFor(() => expect(services).toHaveBeenCalledWith('', '', 'ACTIVE', mockContext.organization.id))
    expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '核实后保留')
    await act(async () => { resolve([service]) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    expect(queryClient.getQueryData(['direct-visit-service-options', mockContext.tenantId, mockContext.organization.id])).toEqual([service])
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalled())
    expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({ valueMode: 'OVERRIDE', valueJson: '"service-1"', reason: '核实后保留' }))
  })

  it.each([null, {}, [{ ...service, organizationAdoption: { ...service.organizationAdoption, executable: undefined } }]].map(response => ({ response })))(
    'does not interpret incomplete catalog $response as an empty selection', async ({ response }) => {
      const services = vi.fn().mockResolvedValueOnce(response).mockResolvedValue([service])
      const { user, saveValue } = setup(services)
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      expect(await screen.findByText('门诊服务目录响应不完整，请重新加载。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
      expect(saveValue).not.toHaveBeenCalled()
      await user.type(screen.getByRole('textbox', { name: '变更原因' }), '保留原项目')
      await user.click(screen.getByRole('button', { name: '重新加载门诊服务' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
      await user.click(screen.getByRole('button', { name: '保存当前值' }))
      await waitFor(() => expect(saveValue).toHaveBeenCalled())
      expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({ valueMode: 'OVERRIDE', valueJson: '"service-1"', reason: '保留原项目' }))
    })

  it.each([[], [{ ...service, organizationAdoption: { ...service.organizationAdoption, executable: false } }],
    [{ ...service, orderable: false }], [{ ...service, sdStatus: 'INACTIVE' }]].map(response => ({ response })))(
    'blocks an unavailable saved service in catalog $response until explicitly cleared', async ({ response }) => {
      const { user, saveValue } = setup(vi.fn().mockResolvedValue(response))
      await user.click(await screen.findByRole('button', { name: '编辑' }))
      expect(await screen.findByText(/原门诊服务（service-1）不在当前机构可选目录/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: '不配置门诊服务费' }))
      await user.click(screen.getByRole('button', { name: '保存当前值' }))
      await waitFor(() => expect(saveValue).toHaveBeenCalled())
      expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({ valueMode: 'EXPLICIT_NULL', valueJson: undefined }))
    })

  it('does not silently disable charging on a new blank value, even when the catalog is empty', async () => {
    const { user, saveValue } = setup(vi.fn().mockResolvedValue([]), false)
    await user.click(await screen.findByRole('button', { name: '维护当前值' }))
    expect(await screen.findByText(/请选择门诊服务；如不收费/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
    expect(saveValue).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '不配置门诊服务费' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalled())
    expect(saveValue.mock.calls[0][1].valueMode).toBe('EXPLICIT_NULL')
  })

  it('blocks cached selections during refetch and failure while allowing an explicit no-fee decision', async () => {
    let reject!: (error: Error) => void
    const services = vi.fn().mockResolvedValueOnce([service])
      .mockImplementation(() => new Promise((_done, fail) => { reject = fail }))
    const { user, queryClient, saveValue } = setup(services)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '改为不收费')
    act(() => { void queryClient.invalidateQueries({ queryKey: ['direct-visit-service-options'] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled())
    await act(async () => { reject(new Error('目录暂不可用')) })
    expect(await screen.findByText('目录暂不可用')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '直接接诊门诊服务' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存当前值' })).toBeDisabled()
    expect(saveValue).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '不配置门诊服务费' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalled())
    expect(saveValue.mock.calls[0][1]).toEqual(expect.objectContaining({ valueMode: 'EXPLICIT_NULL', valueJson: undefined, reason: '改为不收费' }))
  })

  it('preserves the documented clear-selection action as an explicit null', async () => {
    const { user, saveValue } = setup()
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.click(screen.getByRole('combobox', { name: '直接接诊门诊服务' }))
    await user.click(screen.getByRole('button', { name: '清空选择' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalled())
    expect(saveValue.mock.calls[0][1].valueMode).toBe('EXPLICIT_NULL')
  })
})

describe('Parameter definition write confirmation', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const configuration = { categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([mockDefinitions[0]]),
      get: vi.fn().mockResolvedValue(mockDetailMode), changes: vi.fn().mockResolvedValue([]), ...overrides }
    const api = { dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) }, configuration } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), api, configuration }
  }

  it.each(['old', 'wrong-content', 'wrong-scope', 'wrong-status'])('keeps the definition draft for a %s response', async fault => {
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => {
      const saved = savedDefinitionResult(mockDetailMode, input)
      return Promise.resolve(fault === 'old' ? mockDetailMode : { ...saved, ...(fault === 'wrong-content' ? { name: '其他名称' }
        : fault === 'wrong-scope' ? { allowedScopes: ['PLATFORM'] } : { sdParamStatus: 'INACTIVE' }) })
    })
    const { user } = setup({ update })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(await within(screen.getByRole('dialog')).findByText(/保存未确认/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /参数名称/ })).toHaveValue('AI运行模式草稿')
    expect(screen.queryByText(/已更新参数/)).not.toBeInTheDocument()
  })

  it('retries a lost update with its original request code and revision after the server has committed', async () => {
    let server = mockDetailMode, first = true
    const get = vi.fn().mockImplementation(() => Promise.resolve(server))
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => {
      server = savedDefinitionResult(mockDetailMode, input)
      if (first) { first = false; return Promise.reject(new Error('响应丢失')) }
      return Promise.resolve(server)
    })
    const { user } = setup({ get, update })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(await within(screen.getByRole('dialog')).findByText('响应丢失')).toBeInTheDocument()
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(update.mock.calls[1]).toEqual(update.mock.calls[0])
    expect(update.mock.calls[1][1]).toBe(mockDetailMode.revision)
    expect(screen.getByText('已更新参数“AI运行模式草稿”')).toBeInTheDocument()
  })

  it('uses a new request code for a changed draft while retaining its original revision', async () => {
    const update = vi.fn().mockResolvedValue(mockDetailMode)
    const { user } = setup({ update })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await within(screen.getByRole('dialog')).findByText(/保存未确认/)
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '修改后的草稿')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1][3]).not.toBe(update.mock.calls[0][3])
    expect(update.mock.calls[1][1]).toBe(mockDetailMode.revision)
  })

  it('does not submit an old draft with a revision silently adopted from a background refresh', async () => {
    const get = vi.fn().mockResolvedValue(mockDetailMode)
    const update = vi.fn().mockRejectedValue(new Error('参数已被其他操作更新'))
    const { user, queryClient } = setup({ get, update })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    get.mockResolvedValue({ ...mockDetailMode, revision: 10, name: '另一人的编辑' })
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['parameter-definition'] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(await within(screen.getByRole('dialog')).findByText('参数已被其他操作更新')).toBeInTheDocument()
    expect(update.mock.calls[0][1]).toBe(mockDetailMode.revision)
    expect(screen.getByRole('textbox', { name: /参数名称/ })).toHaveValue('AI运行模式草稿')
  })

  it('keeps a create draft for the wrong key and reuses its request code for confirmation', async () => {
    let wrong = true
    const create = vi.fn().mockImplementation((input: ParameterDefinitionInput) => Promise.resolve({
      ...savedDefinitionResult(mockDetailMode, input), id: 'created', revision: 0, key: wrong ? 'another.setting' : input.key,
    }))
    const { user } = setup({ create })
    await user.click(await screen.findByRole('button', { name: '新建参数' }))
    await user.type(screen.getByRole('textbox', { name: /参数键/ }), 'test.created')
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '新建参数草稿')
    await user.click(screen.getByRole('button', { name: '创建参数' }))
    expect(await within(screen.getByRole('dialog')).findByText(/保存未确认/)).toBeInTheDocument()
    expect(screen.queryByText(/已创建参数/)).not.toBeInTheDocument()
    wrong = false
    await waitFor(() => expect(screen.getByRole('button', { name: '创建参数' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '创建参数' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(create.mock.calls[1][1]).toBe(create.mock.calls[0][1])
    expect(screen.getByText('已创建参数“新建参数草稿”')).toBeInTheDocument()
  })

  it('keeps status confirmation open for an old response and reuses the same command on retry', async () => {
    const disabled = { ...mockDetailMode, revision: 2, sdParamStatus: 'INACTIVE', sdParamStatusText: '停用' }
    const changeStatus = vi.fn().mockResolvedValueOnce(mockDetailMode).mockResolvedValue(disabled)
    const { user } = setup({ changeStatus })
    await user.click(await screen.findByRole('button', { name: '停用参数' }))
    await user.click(screen.getByRole('button', { name: '确认停用' }))
    expect(await within(screen.getByRole('dialog')).findByText(/保存未确认/)).toBeInTheDocument()
    expect(screen.queryByText(/参数状态已更新/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认停用' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(changeStatus.mock.calls[1]).toEqual(changeStatus.mock.calls[0])
    expect(changeStatus.mock.calls[1].slice(0, 3)).toEqual([mockDetailMode.id, mockDetailMode.revision, false])
    expect(screen.getByText('参数状态已更新为“停用”')).toBeInTheDocument()
  })

  it('locks the submitted form and keeps a late response out of another tenant context', async () => {
    let resolve!: (result: ParameterDefinition) => void
    const update = vi.fn().mockImplementation(() => new Promise<ParameterDefinition>(done => { resolve = done }))
    const { user, api, queryClient, rerender } = setup({ update })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '草稿')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(document.getElementById('parameter-definition-form')).toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    rerender(<QueryClientProvider client={queryClient}><ParameterManagement api={api} context={{ ...mockContext, tenantId: '2000' }} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => { resolve(savedDefinitionResult(mockDetailMode, update.mock.calls[0][2])); await Promise.resolve() })
    expect(screen.queryByText(/已更新参数/)).not.toBeInTheDocument()
    const key = ['parameter-definition', mockDetailMode.id, '2000', mockContext.organization.id, mockContext.department.id, mockContext.userId]
    await waitFor(() => expect(queryClient.getQueryData(key)).toEqual(mockDetailMode))
  })
})

describe('Parameter current-value status and history confirmation', () => {
  const definition: ParameterDefinition = { ...mockDetailMode, values: [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id }] }
  const snapshot = { scopeType: 'TENANT', scopeId: '1000', scopeCode: 'TENANT:1000', scopeReference: null,
    valueMode: 'OVERRIDE', valueJson: '"historical"', secretRef: null, active: false }
  const history = { id: 'change', definitionId: mockDetailMode.id, valueId: 'val-1', sdParamChangeTargetType: 'VALUE',
    sdParamChangeTargetTypeText: '当前值', sdParamChangeType: 'UPDATE', sdParamChangeTypeText: '更新', requestCode: 'history-request',
    changedAt: '2026-10-03T00:00:00Z', changedBy: 'operator', reason: '原始历史', after: snapshot }
  const disabled: ParameterDefinition = { ...definition, values: [{ ...definition.values[0], revision: 2, sdParamStatus: 'INACTIVE', sdParamStatusText: '停用' }] }
  const restored: ParameterDefinition = { ...disabled, values: [{ ...disabled.values[0], valueJson: '"historical"', displayValue: '"historical"' }] }
  function setup(overrides: Record<string, unknown> = {}) {
    const api = { dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) }, configuration: {
      categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([mockDefinitions[0]]),
      get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([history]),
      changeValueStatus: vi.fn().mockResolvedValue(disabled), rollback: vi.fn().mockResolvedValue(restored), ...overrides,
    } } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), api }
  }

  it.each(['old', 'wrong-status', 'wrong-content', 'wrong-target'])('rejects a %s current-value status response', async fault => {
    const response = fault === 'old' ? definition : { ...disabled, values: [{ ...disabled.values[0], ...(fault === 'wrong-status'
      ? { sdParamStatus: 'ACTIVE' } : fault === 'wrong-content' ? { valueJson: '"changed"', displayValue: '"changed"' } : { scopeId: 'another' }) }] }
    const { user } = setup({ changeValueStatus: vi.fn().mockResolvedValue(response) })
    await user.click(await screen.findByRole('button', { name: '停用' }))
    expect(await screen.findByRole('button', { name: '重试本次操作' })).toBeInTheDocument()
    expect(screen.getAllByText(/操作未确认/).length).toBeGreaterThan(0)
    expect(screen.queryByText('参数当前值状态已更新')).not.toBeInTheDocument()
  })

  it('retries the original disable command after a lost committed response instead of toggling it back', async () => {
    let server = definition, lost = true
    const get = vi.fn().mockImplementation(() => Promise.resolve(server))
    const changeValueStatus = vi.fn().mockImplementation(() => {
      server = disabled
      if (lost) { lost = false; return Promise.reject(new Error('响应丢失')) }
      return Promise.resolve(disabled)
    })
    const { user } = setup({ get, changeValueStatus })
    await user.click(await screen.findByRole('button', { name: '停用' }))
    await screen.findByRole('button', { name: '启用' })
    const retry = await screen.findByRole('button', { name: '重试本次操作' })
    await waitFor(() => expect(retry).toBeEnabled())
    await user.click(retry)
    expect(await screen.findByText('参数当前值状态已更新')).toBeInTheDocument()
    expect(changeValueStatus.mock.calls[1]).toEqual(changeValueStatus.mock.calls[0])
    expect(changeValueStatus.mock.calls[1][1].revision).toBe(1)
    expect(changeValueStatus.mock.calls[1][2]).toBe(false)
  })

  it.each(['old', 'wrong-content', 'wrong-status'])('keeps restoration unconfirmed for a %s response', async fault => {
    const response = fault === 'old' ? definition : fault === 'wrong-content' ? disabled
      : { ...restored, values: [{ ...restored.values[0], sdParamStatus: 'ACTIVE' }] }
    const { user } = setup({ rollback: vi.fn().mockResolvedValue(response) })
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    await user.click(await screen.findByRole('button', { name: '恢复此快照' }))
    expect(await within(screen.getByRole('dialog')).findByText(/操作未确认/)).toBeInTheDocument()
    expect(screen.queryByText('已将历史快照恢复为新的当前值')).not.toBeInTheDocument()
  })

  it('retries a committed restoration with the same history target, revision and request code', async () => {
    let server = definition, lost = true
    const get = vi.fn().mockImplementation(() => Promise.resolve(server))
    const rollback = vi.fn().mockImplementation(() => {
      server = restored
      if (lost) { lost = false; return Promise.reject(new Error('响应丢失')) }
      return Promise.resolve(restored)
    })
    const { user } = setup({ get, rollback })
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    await user.click(await screen.findByRole('button', { name: '恢复此快照' }))
    expect(await within(screen.getByRole('dialog')).findByText('响应丢失')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: '重试本次操作' })
    await waitFor(() => expect(retry).toBeEnabled())
    await user.click(retry)
    expect(await screen.findByText('已将历史快照恢复为新的当前值')).toBeInTheDocument()
    expect(rollback.mock.calls[1]).toEqual(rollback.mock.calls[0])
    expect(rollback.mock.calls[1].slice(0, 3)).toEqual([definition.id, history.id, 1])
  })

  it.each([undefined, null, { ...snapshot, active: 'false' }, { ...snapshot, scopeId: 'another' }])
  ('disables restoration for missing or invalid snapshot %j', async after => {
    const rollback = vi.fn()
    const { user } = setup({ rollback, changes: vi.fn().mockResolvedValue([{ ...history, after }]) })
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    expect(await screen.findByText(/无法恢复/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复此快照' })).toBeDisabled()
    if (after === undefined) {
      await user.click(screen.getByText('查看前后快照'))
      expect(screen.getByText('后快照未返回')).toBeInTheDocument()
    }
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rejects cross-definition history instead of showing empty history', async () => {
    const { user } = setup({ changes: vi.fn().mockResolvedValue([{ ...history, definitionId: 'other' }]) })
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    expect(await screen.findByText(/参数变更记录的目标、类型或操作信息未确认/)).toBeInTheDocument()
    expect(screen.queryByText('暂无变更记录')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '恢复此快照' })).not.toBeInTheDocument()
  })

  it('uses separate history queries for different tenant contexts', async () => {
    const { user, api, queryClient, rerender } = setup()
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    await screen.findByText('原始历史')
    vi.mocked(api.configuration.get).mockResolvedValue({ ...definition, values: [] })
    vi.mocked(api.configuration.changes).mockResolvedValue([{ ...history, reason: '另一租户历史' }] as never)
    rerender(<QueryClientProvider client={queryClient}><ParameterManagement api={api} context={{ ...mockContext, tenantId: '2000' }} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    expect(await screen.findByText('另一租户历史')).toBeInTheDocument()
    expect(screen.queryByText('原始历史')).not.toBeInTheDocument()
    const scope = [mockContext.organization.id, mockContext.department.id, mockContext.userId]
    expect(queryClient.getQueryData(['parameter-changes', definition.id, '1000', ...scope])).toEqual([history])
    expect(queryClient.getQueryData(['parameter-changes', definition.id, '2000', ...scope])).toEqual([{ ...history, reason: '另一租户历史' }])
  })

  it('locks a pending restoration and ignores its late response after a context switch', async () => {
    let resolve!: (value: ParameterDefinition) => void
    const rollback = vi.fn().mockImplementation(() => new Promise<ParameterDefinition>(done => { resolve = done }))
    const { user, api, queryClient, rerender } = setup({ rollback })
    await user.click(await screen.findByRole('button', { name: '变更记录' }))
    await user.click(await screen.findByRole('button', { name: '恢复此快照' }))
    await waitFor(() => expect(rollback).toHaveBeenCalled())
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '关闭' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const other = { ...definition, values: [] }
    vi.mocked(api.configuration.get).mockResolvedValue(other)
    rerender(<QueryClientProvider client={queryClient}><ParameterManagement api={api} context={{ ...mockContext, tenantId: '2000' }} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(async () => { resolve(restored); await Promise.resolve() })
    expect(screen.queryByText('已将历史快照恢复为新的当前值')).not.toBeInTheDocument()
    const key = ['parameter-definition', definition.id, '2000', mockContext.organization.id, mockContext.department.id, mockContext.userId]
    await waitFor(() => expect(queryClient.getQueryData(key)).toEqual(other))
  })
})

describe('Parameter current-value write confirmation', () => {
  const definition: ParameterDefinition = { ...mockDetailMode, values: [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id }] }
  function setup(saveValue: ReturnType<typeof vi.fn>) {
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: { categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([definition]),
        get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([]), saveValue },
    } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), api }
  }

  it.each(['missing', 'old', 'wrong-target', 'wrong-content'])('keeps the draft open and does not claim success for a %s receipt', async fault => {
    const saveValue = vi.fn().mockImplementation((_id: string, input: ParameterValueInput) => {
      const saved = savedValueResult(definition, input)
      return Promise.resolve(fault === 'missing' ? null : fault === 'old' ? definition : {
        ...saved, values: [{ ...saved.values[0], ...(fault === 'wrong-target' ? { scopeId: 'other' } : { valueJson: '"not submitted"' }) }],
      })
    })
    const { user } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.type(screen.getByRole('textbox', { name: '参数值' }), '-changed')
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '保留待核实草稿')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(/保存未确认/)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: '参数值' })).toHaveValue('qwen-max-changed')
    expect(within(dialog).getByRole('textbox', { name: '变更原因' })).toHaveValue('保留待核实草稿')
    expect(screen.queryByText('参数当前值已保存')).not.toBeInTheDocument()
  })

  it('reuses a request code after a lost response and closes only after a confirmed retry', async () => {
    const saveValue = vi.fn().mockRejectedValueOnce(new Error('响应丢失'))
      .mockImplementation((_id: string, input: ParameterValueInput) => Promise.resolve(savedValueResult(definition, input)))
    const { user } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.type(screen.getByRole('textbox', { name: '参数值' }), '-updated')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    expect(await within(screen.getByRole('dialog')).findByText('响应丢失')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('参数当前值已保存')).toBeInTheDocument()
    expect(saveValue).toHaveBeenCalledTimes(2)
    expect(saveValue.mock.calls[0][2]).toEqual(expect.any(String))
    expect(saveValue.mock.calls[1][2]).toBe(saveValue.mock.calls[0][2])
    expect(saveValue.mock.calls[1][1]).toEqual(saveValue.mock.calls[0][1])
  })

  it('retains the request code when saved content matches but definition metadata is missing', async () => {
    let omitMetadata = true
    const saveValue = vi.fn().mockImplementation((_id: string, input: ParameterValueInput) => {
      const saved = savedValueResult(definition, input)
      return Promise.resolve(omitMetadata ? { ...saved, cacheEnabled: undefined } : saved)
    })
    const { user } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.type(screen.getByRole('textbox', { name: '参数值' }), '-updated')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    expect(await within(screen.getByRole('dialog')).findByText(/缓存策略未确认/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '参数值' })).toHaveValue('qwen-max-updated')
    expect(screen.queryByText('参数当前值已保存')).not.toBeInTheDocument()
    omitMetadata = false
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(saveValue).toHaveBeenCalledTimes(2)
    expect(saveValue.mock.calls[1][2]).toBe(saveValue.mock.calls[0][2])
    expect(screen.getByText('参数当前值已保存')).toBeInTheDocument()
  })

  it('uses a new request code when the unconfirmed draft changes', async () => {
    const saveValue = vi.fn().mockResolvedValue(definition)
    const { user } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await within(screen.getByRole('dialog')).findByText(/保存未确认/)
    await waitFor(() => expect(screen.getByRole('button', { name: '保存当前值' })).toBeEnabled())
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '新命令')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalledTimes(2))
    expect(saveValue.mock.calls[1][2]).not.toBe(saveValue.mock.calls[0][2])
  })

  it('does not publish a late receipt into a different tenant context', async () => {
    let resolve!: (value: ParameterDefinition) => void
    const saveValue = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
    const { user, api, queryClient, rerender } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(saveValue).toHaveBeenCalledTimes(1))
    const otherDefinition = { ...definition, values: [] }
    vi.mocked(api.configuration.get).mockResolvedValue(otherDefinition)
    const otherContext = { ...mockContext, tenantId: '2000' }
    rerender(<QueryClientProvider client={queryClient}><ParameterManagement api={api} context={otherContext} /></QueryClientProvider>)
    const key = ['parameter-definition', definition.id, '2000', mockContext.organization.id, mockContext.department.id, mockContext.userId]
    await waitFor(() => expect(queryClient.getQueryData(key)).toEqual(otherDefinition))
    await act(async () => { resolve(savedValueResult(definition, saveValue.mock.calls[0][1])) })
    expect(queryClient.getQueryData(key)).toEqual(otherDefinition)
    expect(screen.queryByText('参数当前值已保存')).not.toBeInTheDocument()
  })

  it('locks the submitted form while waiting, then unlocks and preserves it on an unconfirmed receipt', async () => {
    let resolve!: (value: ParameterDefinition) => void
    const saveValue = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
    const { user } = setup(saveValue)
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '参数值' }).closest('form')).toHaveAttribute('inert'))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' })).toBeDisabled()
    await act(async () => { resolve(definition) })
    await within(screen.getByRole('dialog')).findByText(/保存未确认/)
    expect(screen.getByRole('textbox', { name: '参数值' }).closest('form')).not.toHaveAttribute('inert')
    expect(screen.getByRole('textbox', { name: '参数值' })).toHaveValue('qwen-max')
  })
})

describe('Parameter numeric and JSON content fidelity', () => {
  const samples = [
    { type: 'NUMBER', control: 'NUMBER', source: '9007199254740993' },
    { type: 'NUMBER', control: 'NUMBER', source: '0.12345678901234567890123456789' },
    { type: 'NUMBER', control: 'NUMBER', source: '-0' },
    { type: 'NUMBER', control: 'NUMBER', source: '1e400' },
    { type: 'NUMBER', control: 'NUMBER', source: '1e-400' },
    { type: 'JSON', control: 'JSON_EDITOR', source: '{"id":9007199254740993,"amount":0.1234567890123456789,"limit":1e400}' },
    { type: 'JSON', control: 'JSON_EDITOR', source: '[1e-400,-0,{"id":"9007199254740993"}]' },
  ] as const
  function setup(overrides: Partial<ParameterDefinition>) {
    const definition: ParameterDefinition = { ...mockDetailMode, ...overrides }
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(definition, input)))
    const saveValue = vi.fn().mockImplementation((_id: string, input: ParameterValueInput) => Promise.resolve(savedValueResult(definition, input)))
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: { categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([definition]),
        get: vi.fn().mockResolvedValue(definition), changes: vi.fn().mockResolvedValue([]), update, saveValue },
    } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), update, saveValue }
  }

  it.each(samples)('preserves the current $type value $source through a confirmed save', async ({ type, control, source }) => {
    const { user, saveValue } = setup({ sdParamValueType: type, sdParamControlType: control,
      values: [{ ...mockDetailModel.values[0], definitionId: mockDetailMode.id, valueJson: source, displayValue: source }] })
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    expect(screen.getByRole('textbox', { name: '参数值' })).toHaveValue(source)
    await user.type(screen.getByRole('textbox', { name: '变更原因' }), '仅更新说明')
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(saveValue.mock.calls[0][1].valueJson).toBe(source)
    expect(await screen.findByText('参数当前值已保存')).toBeInTheDocument()
  })

  it.each(samples)('preserves the default $type value $source when renaming the definition', async ({ type, control, source }) => {
    const { user, update } = setup({ sdParamValueType: type, sdParamControlType: control, defaultValueJson: source, hasDefaultValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('textbox', { name: '默认值' })).toHaveValue(source)
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '新名称')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBe(source)
  })

  it.each(['0x10', '+1', '.5', 'Infinity', '01'])('does not coerce invalid number input %s into another value', async source => {
    const { user, saveValue } = setup({ sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER' })
    await user.click(await screen.findByRole('button', { name: '维护当前值' }))
    await user.click(screen.getByRole('textbox', { name: '参数值' }))
    await user.paste(source)
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    expect(screen.getByText('请输入有效的十进制数值（可使用科学计数法）')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '参数值' })).toHaveValue(source)
    expect(saveValue).not.toHaveBeenCalled()
  })

  it('keeps all precise schema fields when one bound changes', async () => {
    const schema = '{"minimum":9007199254740993,"maximum":1e400,"enum":[9007199254740993,1.00000000000000001],"custom":{"threshold":1e-400}}'
    const { user, update } = setup({ sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER', jsonSchema: schema })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    expect(screen.getByRole('textbox', { name: '最小值' })).toHaveValue('9007199254740993')
    expect(screen.getByRole('textbox', { name: '最大值' })).toHaveValue('1e400')
    expect(screen.getByRole('textbox', { name: '限定可选值' })).toHaveValue('9007199254740993, 1.00000000000000001')
    await user.clear(screen.getByRole('textbox', { name: '最小值' }))
    await user.paste('9007199254740994')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].jsonSchema).toBe('{"maximum":1e400,"enum":[9007199254740993,1.00000000000000001],"custom":{"threshold":1e-400},"minimum":9007199254740994}')
  })

  it('compares schema bounds without rounding and retains precise edited enum members', async () => {
    const { user, update } = setup({ sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER',
      jsonSchema: '{"minimum":9007199254740992,"maximum":9007199254740992}' })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('button', { name: '展开配置' }))
    await user.clear(screen.getByRole('textbox', { name: '最小值' }))
    await user.paste('9007199254740993')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(await screen.findByText('最小值不能大于最大值')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
    await user.clear(screen.getByRole('textbox', { name: '最大值' }))
    await user.paste('9007199254740994')
    await user.click(screen.getByRole('textbox', { name: '限定可选值' }))
    await user.paste('9007199254740993, 0.1234567890123456789')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].jsonSchema).toBe('{"minimum":9007199254740993,"maximum":9007199254740994,"enum":[9007199254740993,0.1234567890123456789]}')
  })

  it.each(['{"amount":1,"amount":2}', '1e400', 'null', 'true', '"text"'])('does not rewrite ambiguous or non-container JSON %s', async source => {
    const { user, saveValue } = setup({ sdParamValueType: 'JSON', sdParamControlType: 'JSON_EDITOR' })
    await user.click(await screen.findByRole('button', { name: '维护当前值' }))
    await user.click(screen.getByRole('textbox', { name: '参数值' }))
    await user.paste(source)
    await user.click(screen.getByRole('button', { name: '保存当前值' }))
    expect(screen.getByRole('textbox', { name: '参数值' })).toHaveValue(source)
    expect(screen.getByText(/参数值必须是/)).toBeInTheDocument()
    expect(saveValue).not.toHaveBeenCalled()
  })
})

describe('Parameter definition content preservation', () => {
  function setup(overrides: Partial<ParameterDefinition> = {}) {
    const definition = { ...mockDetailMode, ...overrides }
    const update = vi.fn().mockImplementation((_id: string, _revision: number, input: ParameterDefinitionInput) => Promise.resolve(savedDefinitionResult(definition, input)))
    const get = vi.fn().mockResolvedValue(definition)
    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: { categories: vi.fn().mockResolvedValue(mockCategories), definitions: vi.fn().mockResolvedValue([definition]),
        get, changes: vi.fn().mockResolvedValue([]), update },
    } as unknown as RhnApi
    return { ...renderWorkspace(api), user: userEvent.setup(), update, get, definition }
  }

  it.each(['""', '"   "'])('preserves default %s, unit and example when renaming', async defaultValueJson => {
    const { user, update } = setup({ defaultValueJson, hasDefaultValue: true, unit: '天',
      exampleValueJson: '"演示值"', hasExampleValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('textbox', { name: '计量单位' })).toHaveValue('天')
    expect(screen.getByRole('textbox', { name: '示例值（JSON）' })).toHaveValue('"演示值"')
    if (defaultValueJson === '""') expect(screen.getByRole('checkbox', { name: /使用空字符串默认值/ })).toBeChecked()
    else expect(screen.getByRole('textbox', { name: '默认值' })).toHaveValue('   ')
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '改名')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2]).toEqual(expect.objectContaining({ defaultValueJson, unit: '天', exampleValueJson: '"演示值"' }))
  })

  it('clears an empty-string default only after the user disables the explicit choice', async () => {
    const { user, update } = setup({ defaultValueJson: '""', hasDefaultValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('checkbox', { name: /使用空字符串默认值/ }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBeUndefined()
  })

  it.each([
    { source: 'null', toggle: /使用空字符串默认值/, target: '""' },
    { source: '""', toggle: /默认值为空/, target: 'null' },
  ])('distinguishes default $source from $target', async ({ source, toggle, target }) => {
    const { user, update } = setup({ defaultValueJson: source, hasDefaultValue: true, nullableValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('checkbox', { name: toggle }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBe(target)
  })

  it('does not invent an empty-string default for an unconfigured definition', async () => {
    const { user, update } = setup()
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('checkbox', { name: /使用空字符串默认值/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBeUndefined()
  })

  it('allows explicitly configuring an empty string where there was no default', async () => {
    const { user, update } = setup()
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('checkbox', { name: /使用空字符串默认值/ }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBe('""')
  })

  it('blocks missing plaintext facts and fills untouched fields from a verified retry without losing the rename', async () => {
    const { user, update, get, definition } = setup({ hasDefaultValue: true, hasExampleValue: true, unit: '天' })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('button', { name: '保存定义' })).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: /参数名称/ }), '保留名称草稿')
    get.mockResolvedValue({ ...definition, defaultValueJson: '"已确认默认值"', exampleValueJson: '"已确认示例"', unit: '次', revision: 2 })
    await user.click(screen.getByRole('button', { name: '重新确认配置' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存定义' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: '默认值' })).toHaveValue('已确认默认值')
    expect(screen.getByRole('textbox', { name: '示例值（JSON）' })).toHaveValue('"已确认示例"')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2]).toEqual(expect.objectContaining({ name: definition.name + '保留名称草稿', unit: '次',
      defaultValueJson: '"已确认默认值"', exampleValueJson: '"已确认示例"' }))
  })

  it.each(['SENSITIVE', 'SECRET'] as const)('does not manufacture concealed defaults or examples for %s', async sensitivity => {
    const { user, update } = setup({ sdParamSensitivity: sensitivity, sdParamDisplayPolicy: 'HIDDEN',
      sdParamControlType: sensitivity === 'SECRET' ? 'SECRET_REFERENCE' : 'TEXT',
      hasDefaultValue: sensitivity !== 'SECRET', hasExampleValue: true, unit: '次' })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByText('已有示例值受保护；留空保留原值，填写新值替换。')).toBeInTheDocument()
    if (sensitivity !== 'SECRET') expect(screen.getByText('已有默认值受保护；留空保留原值，填写新值替换。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2]).toEqual(expect.objectContaining({ defaultValueJson: undefined, exampleValueJson: undefined, unit: '次' }))
  })

  it('keeps precise example text on edit and clears ordinary metadata only on explicit input', async () => {
    const { user, update } = setup({ sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER',
      unit: '元', exampleValueJson: '1.00000000000000000001', hasExampleValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    expect(screen.getByRole('textbox', { name: '示例值（JSON）' })).toHaveValue('1.00000000000000000001')
    await user.clear(screen.getByRole('textbox', { name: '示例值（JSON）' }))
    await user.paste('1.00000000000000000002')
    await user.clear(screen.getByRole('textbox', { name: '计量单位' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2]).toEqual(expect.objectContaining({ exampleValueJson: '1.00000000000000000002', unit: undefined }))
  })

  it('rejects an incompatible example without silently clearing it', async () => {
    const { user, update } = setup({ sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER', exampleValueJson: '1', hasExampleValue: true })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.clear(screen.getByRole('textbox', { name: '示例值（JSON）' }))
    await user.paste('"not a number"')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(screen.getByText('示例值与参数类型不匹配')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '示例值（JSON）' })).toHaveValue('"not a number"')
    expect(update).not.toHaveBeenCalled()
  })

  it('explains that leaving a protected default blank preserves it even after toggling the empty-string draft', async () => {
    const { user, update } = setup({ hasDefaultValue: true, sdParamSensitivity: 'SENSITIVE', sdParamDisplayPolicy: 'HIDDEN' })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('checkbox', { name: /使用空字符串默认值/ }))
    expect(screen.getByText('默认值将替换为空字符串；关闭此选项并留空会保留原受保护默认值。')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /使用空字符串默认值/ }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBeUndefined()
  })

  it('clears an ordinary example only after explicit editing', async () => {
    const { user, update } = setup({ exampleValueJson: '"remove me"', hasExampleValue: true, unit: '次' })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.clear(screen.getByRole('textbox', { name: '示例值（JSON）' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2]).toEqual(expect.objectContaining({ exampleValueJson: undefined, unit: '次' }))
  })

  it('does not silently remove an incompatible null default when nullable is false', async () => {
    const { user, update } = setup({ defaultValueJson: 'null', hasDefaultValue: true, nullableValue: false })
    await user.click(await screen.findByRole('button', { name: '编辑定义' }))
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    expect(screen.getByText('默认值为空时必须允许空值，请修改默认值或开启允许空值。')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: '默认值' }), '明确替换')
    await user.click(screen.getByRole('button', { name: '保存定义' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][2].defaultValueJson).toBe('"明确替换"')
  })
})
