import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MedicationSafetyCategories } from './MedicationSafetyCategories'
import type { RhnApi } from '../../shared/rhnApi'

describe('MedicationSafetyCategories', () => {
  const mockCategories = [
    {
      id: '101',
      code: 'DISULFIRAM_INDUCER',
      name: '双硫仑样反应致敏抗菌药物',
      ruleKind: 'INTERACTION_CONTRAINDICATION',
      rationale: '抑制乙醛脱氢酶导致乙醛蓄积中毒',
      isSystem: true,
      status: 'ACTIVE',
      memberCount: 2,
      revision: 0,
      createdAt: '2026-09-16T00:00:00Z',
      updatedAt: '2026-09-16T00:00:00Z'
    },
    {
      id: '102',
      code: 'CUSTOM_HEPATOTOXIC',
      name: '高危肝毒性药物监控',
      ruleKind: 'SPECIAL_POPULATION_CONTRAINDICATION',
      rationale: '严重肝功能异常者禁用',
      isSystem: false,
      status: 'ACTIVE',
      memberCount: 0,
      revision: 1,
      createdAt: '2026-09-16T00:00:00Z',
      updatedAt: '2026-09-16T00:00:00Z'
    }
  ]

  const mockMembers = [
    {
      id: '201',
      categoryId: '101',
      medicationId: '301',
      medicationCode: 'MED-001',
      medicationName: '注射用头孢哌酮钠舒巴坦钠',
      preparationSpec: '1.5g',
      doseForm: '注射剂',
      createdAt: '2026-09-16T10:00:00Z'
    },
    {
      id: '202',
      categoryId: '101',
      medicationId: '302',
      medicationCode: 'MED-002',
      medicationName: '甲硝唑注射液',
      preparationSpec: '100ml:0.5g',
      doseForm: '注射剂',
      createdAt: '2026-09-16T11:00:00Z'
    }
  ]

  const mockMasterMedications = [
    {
      id: '401',
      code: 'MED-003',
      name: '替硝唑注射液',
      preparationSpec: '100ml:0.4g',
      sdDoseFormText: '注射剂'
    }
  ]

  function createMockApi() {
    return {
      medicationWorkbench: {
        listSafetyCategories: vi.fn().mockResolvedValue(mockCategories),
        listSafetyCategoryMembers: vi.fn().mockResolvedValue(mockMembers),
        createSafetyCategory: vi.fn().mockImplementation(req =>
          Promise.resolve({
            id: '103',
            code: req.code,
            name: req.name,
            ruleKind: req.ruleKind,
            rationale: req.rationale,
            isSystem: false,
            status: 'ACTIVE',
            memberCount: 0,
            revision: 0,
            createdAt: '2026-09-16T12:00:00Z',
            updatedAt: '2026-09-16T12:00:00Z'
          })
        ),
        updateSafetyCategory: vi.fn().mockImplementation((_id, req) =>
          Promise.resolve({
            ...mockCategories[0],
            name: req.name,
            rationale: req.rationale,
            status: req.status,
            revision: req.expectedRevision + 1
          })
        ),
        deleteSafetyCategory: vi.fn().mockResolvedValue(undefined),
        addSafetyCategoryMembers: vi.fn().mockResolvedValue(1),
        removeSafetyCategoryMember: vi.fn().mockResolvedValue(undefined),
        clearSafetyCategoryMembers: vi.fn().mockResolvedValue(2),
        listStandardCatalogCategories: vi.fn().mockResolvedValue([
          { major: '一、抗微生物药', sub: '（八）喹诺酮类', entryCount: 15, entryNames: ['左氧氟沙星'] }
        ]),
        searchStandardCatalogCandidates: vi.fn().mockResolvedValue([
          { medicationId: '501', medicationCode: 'MED-LVFX', medicationName: '盐酸左氧氟沙星胶囊', preparationSpec: '0.1g', doseForm: '胶囊剂' }
        ]),
        importSafetyCategoryMembersFromCatalog: vi.fn().mockResolvedValue({ importedCount: 1, skippedCount: 0, totalCount: 1 })
      },
      masterData: {
        medications: vi.fn().mockResolvedValue(mockMasterMedications)
      }
    } as unknown as RhnApi
  }

  it('renders categories list, selection detail, and managed drug members', async () => {
    const api = createMockApi()
    render(<MedicationSafetyCategories api={api} />)

    expect(await screen.findByText('合理用药安全分类')).toBeInTheDocument()
    expect((await screen.findAllByText('双硫仑样反应致敏抗菌药物')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('高危肝毒性药物监控')).toBeInTheDocument()
    expect(screen.getByText('系统预置')).toBeInTheDocument()

    // 默认选中第一个分类，展示右侧详情
    expect(await screen.findByText('抑制乙醛脱氢酶导致乙醛蓄积中毒')).toBeInTheDocument()
    expect(await screen.findByText('注射用头孢哌酮钠舒巴坦钠')).toBeInTheDocument()
    expect(screen.getByText('甲硝唑注射液')).toBeInTheDocument()
  })

  it('supports creating a new safety category', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    await user.click(await screen.findByRole('button', { name: /新建分类/ }))
    expect(await screen.findByText('新建合理用药安全分类')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/如 DISULFIRAM_INDUCER/), 'NEPHROTOXIC_DRUGS')
    await user.type(screen.getByPlaceholderText(/如 双硫仑样反应致敏抗菌药物/), '肾毒性药物监控')
    await user.type(screen.getByPlaceholderText(/说明该分类纳管药物的临床风险机理/), '肾小球滤过率降低时高危')

    await user.click(screen.getByRole('button', { name: '保存分类' }))

    await waitFor(() => {
      expect(api.medicationWorkbench.createSafetyCategory).toHaveBeenCalledWith({
        code: 'NEPHROTOXIC_DRUGS',
        name: '肾毒性药物监控',
        ruleKind: 'INTERACTION_CONTRAINDICATION',
        rationale: '肾小球滤过率降低时高危',
        catalogMajor: null,
        catalogSub: null,
        systemicOnly: false
      })
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('肾毒性药物监控'))
    })
  })

  it('supports adding medications from master data to the category via Enter search', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    await user.click(await screen.findByRole('button', { name: /纳入药品/ }))
    expect(await screen.findByText(/纳入药品 · 双硫仑样反应致敏抗菌药物/)).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/输入药品通用名/)
    // 打字时不应触发搜索，也不应提前弹出“未找到”提示
    await user.type(searchInput, '替硝唑')
    expect(api.masterData.medications).not.toHaveBeenCalled()
    expect(screen.getByText('请输入药品通用名、拼音码或代码，按回车开始搜索')).toBeInTheDocument()
    expect(screen.queryByText(/未找到/)).not.toBeInTheDocument()

    // 按回车键触发检索
    await user.keyboard('{Enter}')
    expect(await screen.findByText('替硝唑注射液')).toBeInTheDocument()
    expect(api.masterData.medications).toHaveBeenCalledWith('替硝唑', '', 'ACTIVE')

    // 勾选候选药品并确认添加
    await user.click(screen.getByText('替硝唑注射液'))
    expect(screen.getByRole('button', { name: /确认纳入 \(1\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /确认纳入 \(1\)/ }))

    await waitFor(() => {
      expect(api.medicationWorkbench.addSafetyCategoryMembers).toHaveBeenCalledWith(
        '101',
        expect.arrayContaining([
          expect.objectContaining({
            medicationId: '401',
            medicationName: '替硝唑注射液'
          })
        ])
      )
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('已成功将 1 个药品纳入分类'))
    })
  })

  it('supports removing a medication from the category', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    const removeButtons = await screen.findAllByRole('button', { name: '移出' })
    await user.click(removeButtons[0])

    expect(await screen.findByText('移出药品成员确认')).toBeInTheDocument()
    expect(screen.getByText(/确定要将/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认移出' }))

    await waitFor(() => {
      expect(api.medicationWorkbench.removeSafetyCategoryMember).toHaveBeenCalledWith('101', '201')
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('从当前分类移出'))
    })
  })

  it('supports batch importing medications from standard catalog', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    await user.click(await screen.findByRole('button', { name: /纳入药品/ }))
    expect(await screen.findByText(/纳入药品 · 双硫仑样反应致敏抗菌药物/)).toBeInTheDocument()

    // 切换到标准目录批量导入 Tab
    await user.click(screen.getByRole('button', { name: /按国家基药标准目录批量导入/ }))
    expect(screen.getByText(/选择国家基药标准分类/)).toBeInTheDocument()

    // 点击一键全量导入
    await user.click(screen.getByRole('button', { name: /一键全量导入/ }))

    await waitFor(() => {
      expect(api.medicationWorkbench.importSafetyCategoryMembersFromCatalog).toHaveBeenCalledWith(
        '101',
        expect.objectContaining({
          catalogSub: '（八）喹诺酮类'
        })
      )
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('成功从标准目录批量导入'))
    })
  })

  it('supports filtering candidates by standard drug chip and importing specific drug specifications', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    await user.click(await screen.findByRole('button', { name: /纳入药品/ }))
    await user.click(screen.getByRole('button', { name: /按国家基药标准目录批量导入/ }))

    // 点击“左氧氟沙星”芯片进行品种筛选
    const chip = await screen.findByRole('button', { name: '左氧氟沙星' })
    await user.click(chip)

    expect(screen.getByText('已筛选品种：左氧氟沙星')).toBeInTheDocument()
    const singleDrugImportBtn = screen.getByRole('button', { name: /仅导入【左氧氟沙星】全规格/ })
    expect(singleDrugImportBtn).toBeInTheDocument()

    // 点击仅导入该品种
    await user.click(singleDrugImportBtn)

    await waitFor(() => {
      expect(api.medicationWorkbench.addSafetyCategoryMembers).toHaveBeenCalledWith(
        '101',
        expect.arrayContaining([
          expect.objectContaining({
            medicationId: '501',
            medicationName: '盐酸左氧氟沙星胶囊'
          })
        ])
      )
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('已成功将标准药品【左氧氟沙星】下的 1 种在库规格药品导入'))
    })
  })

  it('displays bound rules indicator and section when category has active rules', async () => {
    const api = createMockApi()
    api.medicationWorkbench.listSafetyCategories = vi.fn().mockResolvedValue([
      {
        id: '105',
        code: 'PREGNANCY_CONTRA_CATEGORY_X',
        name: '妊娠期禁用致畸高危药物',
        ruleKind: 'SPECIAL_POPULATION_CONTRAINDICATION',
        rationale: '人类胚胎致畸毒性',
        isSystem: true,
        status: 'ACTIVE',
        memberCount: 3,
        revision: 0
      }
    ])
    render(<MedicationSafetyCategories api={api} />)

    expect(await screen.findByText(/已配规则 \(1\)/)).toBeInTheDocument()
    expect(await screen.findByText(/关联在行合理用药质控规则/)).toBeInTheDocument()
    expect(screen.getByText('QMED.PREGNANCY_CONTRA')).toBeInTheDocument()
    expect(screen.getByText('育龄期及妊娠期妇女禁用高危致畸药物核对')).toBeInTheDocument()
  })

  it('supports one-click clearing all manual category members', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    const clearBtn = await screen.findByRole('button', { name: /一键清空 \(2\)/ })
    expect(clearBtn).toBeInTheDocument()

    await user.click(clearBtn)
    expect(await screen.findByText('一键清空手工纳管药品确认')).toBeInTheDocument()
    expect(screen.getByText(/确定要清空安全分类/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '确认清空全部手工药品' }))

    await waitFor(() => {
      expect(api.medicationWorkbench.clearSafetyCategoryMembers).toHaveBeenCalledWith('101')
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('已成功清空分类'))
    })
  })

  it('supports quick standard catalog binding and unbinding from detail header', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    // 分类 101 初始未绑定目录，展示绑定入口
    const bindPromptBtn = await screen.findByRole('button', { name: /绑定基药标准目录（推荐）/ })
    expect(bindPromptBtn).toBeInTheDocument()

    await user.click(bindPromptBtn)
    expect(await screen.findByText(/绑定国家基药标准目录 · 双硫仑样反应致敏抗菌药物/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '仅保存目录级联绑定' }))

    await waitFor(() => {
      expect(api.medicationWorkbench.updateSafetyCategory).toHaveBeenCalledWith(
        '101',
        expect.objectContaining({
          catalogSub: '（八）喹诺酮类',
          catalogMajor: '一、抗微生物药'
        })
      )
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('已成功将分类'))
    })
  })

  it('renders standard catalog as a hierarchical tree and natural numeral order in bind dialog', async () => {
    const api = createMockApi()
    api.medicationWorkbench.listStandardCatalogCategories = vi.fn().mockResolvedValue([
      { major: '一、内科用药', sub: '（七）扶正剂', entryCount: 30, entryNames: ['人参归脾丸'] },
      { major: '一、内科用药', sub: '（二）泻下剂', entryCount: 1, entryNames: ['麻仁润肠丸'] },
      { major: '一、内科用药', sub: '（一）解表剂', entryCount: 10, entryNames: ['感冒清热颗粒'] },
      { major: '一、抗微生物药', sub: '（三）氨基糖苷类', entryCount: 2, entryNames: ['阿米卡星', '庆大霉素'] }
    ])

    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} />)

    const bindPromptBtn = await screen.findByRole('button', { name: /绑定基药标准目录（推荐）/ })
    await user.click(bindPromptBtn)

    const combobox = screen.getByRole('combobox', { name: '选择国家基药标准目录' })
    await user.click(combobox)

    expect(screen.getByRole('tree')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /一、抗微生物药/ })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /一、内科用药/ })).toBeInTheDocument()

    // 验证子项自动随选中项展开，且按自然中文序号排序（一）->（二）->（七）
    const jieBiaoNode = screen.getByRole('treeitem', { name: /（一）解表剂/ })
    const xieXiaNode = screen.getByRole('treeitem', { name: /（二）泻下剂/ })
    const fuZhengNode = screen.getByRole('treeitem', { name: /（七）扶正剂/ })

    expect(jieBiaoNode).toBeInTheDocument()
    expect(xieXiaNode).toBeInTheDocument()
    expect(fuZhengNode).toBeInTheDocument()

    const allTreeitems = screen.getAllByRole('treeitem')
    const labels = allTreeitems.map(t => t.textContent || '')
    const jieBiaoIdx = labels.findIndex(l => l.includes('（一）解表剂'))
    const xieXiaIdx = labels.findIndex(l => l.includes('（二）泻下剂'))
    const fuZhengIdx = labels.findIndex(l => l.includes('（七）扶正剂'))

    expect(jieBiaoIdx).toBeLessThan(xieXiaIdx)
    expect(xieXiaIdx).toBeLessThan(fuZhengIdx)
  })
})
