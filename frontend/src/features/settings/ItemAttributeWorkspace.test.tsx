import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemAttributeWorkspace } from './ItemAttributeWorkspace'
import type { RhnApi } from '../../shared/rhnApi'

describe('ItemAttributeWorkspace', () => {
  let queryClient: QueryClient
  let mockApi: Partial<RhnApi>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

    mockApi = {
      masterData: {
        itemAttributeConfigurations: vi.fn().mockResolvedValue({
          subjectType: 'MEDICATION',
          itemTypeId: '',
          itemTypes: [
            { id: 'type-1', code: 'WESTERN', name: '西药', sdStatus: 'ACTIVE' },
          ],
          definitions: [
            {
              id: 'def-1',
              code: 'HIGH_ALERT_LEVEL',
              name: '高危等级',
              description: '高危药品分级管理',
              dataType: 'TEXT',
              cardinality: 'SINGLE',
              variability: 'BASE_ONLY',
              contextBasis: 'NONE',
              sensitivity: 'NORMAL',
              status: 'ACTIVE',
              scopeType: 'TENANT',
              allowedScopes: [],
              storageMode: 'JSON_OVERRIDE',
              editable: true,
            },
          ],
          assignments: [],
        }),
      } as any,
      dictionaries: {
        list: vi.fn().mockResolvedValue([]),
      } as any,
    }
  })

  it('renders workspace page header and action buttons', async () => {
    const handleNavigate = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} onNavigate={handleNavigate} />
      </QueryClientProvider>
    )

    // PageHeader 标题与描述
    expect(screen.getByText('扩展属性管理')).toBeInTheDocument()
    expect(screen.getByText(/统一维护药品主档与诊疗服务项目的租户自定义扩展属性/)).toBeInTheDocument()
    expect(screen.getByText('中心治理 · 扩展属性')).toBeInTheDocument()

    // 快捷跳转按钮
    const medBtn = screen.getByRole('button', { name: '药品知识与目录' })
    const srvBtn = screen.getByRole('button', { name: '诊疗服务目录' })
    expect(medBtn).toBeInTheDocument()
    expect(srvBtn).toBeInTheDocument()

    fireEvent.click(medBtn)
    expect(handleNavigate).toHaveBeenCalledWith('/settings/medications')

    fireEvent.click(srvBtn)
    expect(handleNavigate).toHaveBeenCalledWith('/settings/services')
  })

  it('renders embedded ItemAttributeConfigurationPanel with attribute definitions', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} />
      </QueryClientProvider>
    )

    // 验证内部 ItemAttributeConfigurationPanel
    expect(await screen.findByRole('button', { name: /高危等级/ })).toBeInTheDocument()
    expect(screen.getAllByText('HIGH_ALERT_LEVEL').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '新增租户属性' })).toBeInTheDocument()
  })

  it('allows assignment for platform attributes and renders semantic labels', async () => {
    mockApi.masterData!.itemAttributeConfigurations = vi.fn().mockResolvedValue({
      subjectType: 'CATALOG_ITEM',
      itemTypeId: '',
      tenantNamespace: 'TNT.DEMO.',
      itemTypes: [
        { id: 'type-exam', code: 'SERVICE.EXAMINATION', name: '检查项目', sdStatus: 'ACTIVE' },
      ],
      definitions: [
        {
          id: 'def-prep',
          code: 'EXAM.VARIANT.PREPARATION_NOTE',
          name: '检查部位准备要求',
          description: '检查部位或实施方式特有的准备要求。',
          dataType: 'TEXT',
          cardinality: 'SINGLE',
          variability: 'SCOPE_OVERRIDE',
          contextBasis: 'EXECUTING',
          sensitivity: 'NORMAL',
          status: 'ACTIVE',
          scopeType: 'PLATFORM',
          allowedScopes: ['TENANT', 'ORGANIZATION', 'DEPARTMENT'],
          defaultValue: '按检查协议准备',
          editable: false,
        },
      ],
      assignments: [
        {
          id: 'assign-1',
          itemTypeId: 'type-exam',
          definitionId: 'def-prep',
          groupName: '检查部位参数',
          groupSortOrder: 20,
          attributeSortOrder: 10,
          widgetType: 'TEXT',
          required: false,
          listDisplay: true,
          status: 'ACTIVE',
          editable: true,
        },
      ],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} />
      </QueryClientProvider>
    )

    // 平台属性的标签与锁定提示
    expect(await screen.findByText('平台标准规范 · 定义只读')).toBeInTheDocument()
    expect(screen.getByText('平台标准锁定')).toBeInTheDocument()

    // 关键修复：平台属性同样拥有“新增装配”按钮
    expect(screen.getByRole('button', { name: '新增装配' })).toBeInTheDocument()

    // 语义化转换验证：TEXT 转换为“单行文本”
    expect(screen.getByText('单行文本')).toBeInTheDocument()

    // 分组与排序语义化验证
    expect(screen.getByText('检查部位参数')).toBeInTheDocument()
    expect(screen.getByText('大类 #20')).toBeInTheDocument()
    expect(screen.getByText('序号 #10')).toBeInTheDocument()

    // 规则标签化验证
    expect(screen.getByText('选填')).toBeInTheDocument()
    expect(screen.getByText('列表呈现')).toBeInTheDocument()

    // 可编辑装配提供编辑与停用操作
    expect(screen.getByRole('button', { name: '编辑装配' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停用' })).toBeInTheDocument()

    // 打开装配弹窗，验证提示以 inline 形式内嵌在表单顶部而非浮动 toast
    const assignBtn = screen.getByRole('button', { name: '新增装配' })
    fireEvent.click(assignBtn)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const alert = screen.getByText(/动态扩展属性用于长尾业务字段；如涉及核心医保计费/)
    expect(alert).toBeInTheDocument()
    // 确保属于 inline 静态提示，不带 ui-toast 类
    expect(alert.closest('.ui-alert')).toHaveClass('ui-alert--inline')
    expect(alert.closest('.ui-alert')).not.toHaveClass('ui-toast')
  })

  it('switches to form designer view and supports live preview', async () => {
    mockApi.masterData!.itemAttributeConfigurations = vi.fn().mockResolvedValue({
      subjectType: 'CATALOG_ITEM',
      itemTypeId: '',
      tenantNamespace: 'TNT.DEMO.',
      itemTypes: [
        { id: 'type-exam', code: 'SERVICE.EXAMINATION', name: '检查项目', sdStatus: 'ACTIVE' },
      ],
      definitions: [
        {
          id: 'def-prep',
          code: 'EXAM.VARIANT.PREPARATION_NOTE',
          name: '检查部位准备要求',
          description: '检查部位或实施方式特有的准备要求。',
          dataType: 'TEXT',
          cardinality: 'SINGLE',
          variability: 'SCOPE_OVERRIDE',
          contextBasis: 'EXECUTING',
          sensitivity: 'NORMAL',
          status: 'ACTIVE',
          scopeType: 'PLATFORM',
          allowedScopes: ['TENANT', 'ORGANIZATION', 'DEPARTMENT'],
          defaultValue: '按检查协议准备',
          editable: false,
        },
      ],
      assignments: [
        {
          id: 'assign-1',
          itemTypeId: 'type-exam',
          definitionId: 'def-prep',
          groupName: '检查部位参数',
          groupSortOrder: 20,
          attributeSortOrder: 10,
          widgetType: 'TEXT',
          required: true,
          listDisplay: false,
          status: 'ACTIVE',
          editable: true,
        },
      ],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} />
      </QueryClientProvider>
    )

    // 统计面板验证
    expect(await screen.findByText('扩展属性总数')).toBeInTheDocument()
    expect(screen.getByText('已装配业务类型')).toBeInTheDocument()

    // 切换到“按项目类型设计表单”模式
    const designTab = screen.getByRole('tab', { name: /按项目类型设计表单/ })
    fireEvent.click(designTab)

    // 验证表单设计器加载
    expect(await screen.findByText(/检查项目 · 表单扩展字段装配/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '装配扩展属性' })).toBeInTheDocument()
    expect(screen.getByText('大组排序权重: 20')).toBeInTheDocument()

    // 开启实时表单预览
    const previewBtn = screen.getByRole('button', { name: '实时表单预览' })
    fireEvent.click(previewBtn)

    // 验证实时预览面板生成
    expect(await screen.findByText(/检查项目 · 扩展表单预览/)).toBeInTheDocument()
    expect(screen.getByText('1 个字段生效')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请输入检查部位准备要求…')).toBeInTheDocument()
  })

  it('opens inheritance simulator dialog and inspects stepped resolution ladder', async () => {
    mockApi.masterData!.itemAttributeConfigurations = vi.fn().mockResolvedValue({
      subjectType: 'CATALOG_ITEM',
      itemTypeId: '',
      tenantNamespace: 'TNT.DEMO.',
      itemTypes: [
        { id: 'type-exam', code: 'SERVICE.EXAMINATION', name: '检查项目', sdStatus: 'ACTIVE' },
      ],
      definitions: [
        {
          id: 'def-prep',
          code: 'EXAM.VARIANT.PREPARATION_NOTE',
          name: '检查部位准备要求',
          description: '检查部位或实施方式特有的准备要求。',
          dataType: 'TEXT',
          cardinality: 'SINGLE',
          variability: 'SCOPE_OVERRIDE',
          contextBasis: 'EXECUTING',
          sensitivity: 'NORMAL',
          status: 'ACTIVE',
          scopeType: 'PLATFORM',
          allowedScopes: ['TENANT', 'ORGANIZATION', 'DEPARTMENT'],
          defaultValue: '按检查协议准备',
          editable: false,
        },
      ],
      assignments: [],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ItemAttributeWorkspace api={mockApi as RhnApi} />
      </QueryClientProvider>
    )

    // 点击“链路穿透模拟”
    const simBtn = await screen.findByRole('button', { name: '链路穿透模拟' })
    fireEvent.click(simBtn)

    // 验证模拟器弹窗与阶梯展示
    expect(await screen.findByText(/检查部位准备要求 · 多级继承穿透模拟器/)).toBeInTheDocument()
    expect(screen.getByText('1. 设置模拟输入值')).toBeInTheDocument()
    expect(screen.getByText('2. 继承链阶梯与穿透解析结果')).toBeInTheDocument()

    // 默认回退到系统定义默认值
    expect(screen.getAllByText(/属性定义默认值/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('按检查协议准备').length).toBeGreaterThan(0)

    // 关闭模拟器
    const closeBtn = screen.getByRole('button', { name: '关闭模拟器' })
    fireEvent.click(closeBtn)
  })
})
