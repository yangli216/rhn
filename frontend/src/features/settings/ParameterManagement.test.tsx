import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParameterCategory, ParameterDefinition, ParameterDefinitionSummary, RhnApi, SystemEnumDefinition } from '../../shared/rhnApi'
import { ParameterManagement } from './ParameterManagement'

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
  hasDefaultValue: true,
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
      scopeCode: '1000',
      sdParamValueMode: 'OVERRIDE',
      sdParamValueModeText: '覆盖',
      valueJson: '"qwen-max"',
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
  hasDefaultValue: true,
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

function renderWorkspace(api: RhnApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ParameterManagement api={api} context={mockContext} />
    </QueryClientProvider>,
  )
}

describe('ParameterManagement Dependency & Suppression', () => {
  it.each(['null', '"null"'])('preserves default JSON %s when editing a nullable definition', async (defaultValueJson) => {
    const user = userEvent.setup()
    const definition = { ...mockDetailMode, nullableValue: true, defaultValueJson }
    const update = vi.fn().mockResolvedValue(definition)
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
      expect.objectContaining({ defaultValueJson, nullableValue: true })))
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
    expect(modelCard).toHaveTextContent('抑制中')

    // 点击卡片查看详情
    const user = userEvent.setup()
    await user.click(modelCard)

    // 断言详情面板中的依赖提示横幅
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('前置依赖联动：条件未满足（运行时已抑制）')
    })
    expect(screen.getByRole('status')).toHaveTextContent('期望匹配值：MODEL')
    expect(screen.getByRole('status')).toHaveTextContent('当前前置条件未满足，业务调用时将安全抑制')

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
    const updateFn = vi.fn().mockResolvedValue(mockDetailModel)

    const api = {
      dictionaries: { systemEnums: vi.fn().mockResolvedValue(mockSystemEnums) },
      configuration: {
        categories: vi.fn().mockResolvedValue(mockCategories),
        definitions: vi.fn().mockResolvedValue(mockDefinitions),
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
    const allTab = await screen.findByRole('tab', { name: /全部参数/ })
    expect(allTab).toBeInTheDocument()
    expect(allTab).toHaveAttribute('aria-selected', 'true')

    // 验证具体分类“临床AI”项存在且不包含技术编码
    const aiCategoryTab = await screen.findByRole('tab', { name: /临床AI/ })
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
