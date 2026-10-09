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

  it('supports adding medications from master data to the category', async () => {
    const api = createMockApi()
    const onNotice = vi.fn()
    const user = userEvent.setup()
    render(<MedicationSafetyCategories api={api} onNotice={onNotice} />)

    await user.click(await screen.findByRole('button', { name: /纳入药品/ }))
    expect(await screen.findByText(/纳入药品成员 · 双硫仑样反应致敏抗菌药物/)).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/输入药品通用名、拼音缩写或代码/)
    await user.type(searchInput, '替硝唑')
    await user.click(screen.getByRole('button', { name: '搜索药品' }))

    expect(await screen.findByText('替硝唑注射液')).toBeInTheDocument()

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
    expect(await screen.findByText(/纳入药品成员 · 双硫仑样反应致敏抗菌药物/)).toBeInTheDocument()

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
})
