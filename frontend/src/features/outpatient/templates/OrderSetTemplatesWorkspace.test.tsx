import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { OutpatientPlanTemplatesWorkspace } from './OutpatientPlanTemplatesWorkspace'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

function orderSet(patch: Partial<OutpatientPlanTemplate> = {}): OutpatientPlanTemplate {
  return { id: 'set-1', revision: 2, templateKind: 'ORDER_SET', scopeType: 'DEPARTMENT', name: '血常规复查组套', description: '复诊复查用',
    status: 'ACTIVE', sourceType: 'MANUAL', sortOrder: 0, useCount: 3, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
    diagnoses: [], tasks: [],
    medications: [{ lineId: 'line-1', medicationId: 'med-1', medicationCode: 'M1', medicationName: '对乙酰氨基酚片', preparationSpec: '0.5g',
      editorMode: 'regular', categoryCode: 'WESTERN', doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'TID', durationValue: 3,
      durationUnit: 'd', quantity: 1, quantityUnit: '盒', substitutionAllowed: true, selfProvided: false, defaultSelected: true }],
    services: [{ catalogItemId: 'srv-1', itemCode: 'LAB001', itemName: '血常规五分类', serviceType: 'LABORATORY', quantity: 1, unitCode: '次',
      defaultSelected: true }], ...patch }
}
const legacyGroup = (): ItemGroup => ({ id: 'group-1', revision: 1, code: 'SET001', name: '高血压常规检查组合', groupType: 'ORDER_SET', status: 'ACTIVE',
  pointOfCare: false, validFrom: '2020-01-01', members: [{ id: 'm1', catalogItemId: 'c1', itemCode: 'EXAM001', itemName: '十二导联心电图',
    serviceType: 'EXAMINATION', sortOrder: 0, quantity: 1, unitCode: '次', requiredMember: true }] })

function setup(sets: OutpatientPlanTemplate[] = [orderSet()], groups: ItemGroup[] = [legacyGroup()]) {
  const echo = (previous: OutpatientPlanTemplate, input: Record<string, unknown>, revision: number): OutpatientPlanTemplate => ({
    ...previous, ...input, revision,
    medications: ((input.medications as object[]) ?? []).map((item, index) => ({ ...previous.medications[index], ...item })),
    services: ((input.services as object[]) ?? []).map((item, index) => ({ ...previous.services[index], ...item })),
  } as OutpatientPlanTemplate)
  const update = vi.fn(async (_id: string, input: Record<string, unknown>) => echo(sets[0], input, 3))
  const create = vi.fn(async (input: Record<string, unknown>) => ({ ...echo(sets[0], input, 0), id: 'set-copy', useCount: 0 }))
  const disable = vi.fn(async () => ({ ...sets[0], status: 'INACTIVE' as const }))
  const list = vi.fn(async (_keyword?: string, kind?: string) => kind === 'ORDER_SET' ? sets : [])
  const api = {
    outpatientPlanTemplates: { list, update, create, disable, minedSuggestions: vi.fn().mockResolvedValue([]) },
    outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([]) },
    masterData: { itemGroups: vi.fn().mockResolvedValue(groups), clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()),
      searchMedications: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 30 }),
      searchServices: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 30 }) },
    organization: { departments: vi.fn().mockResolvedValue([
      { id: 'dept-lab', organizationId: 'org-1', name: '检验科', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null, virtual: false },
    ]) },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <OutpatientPlanTemplatesWorkspace api={api} clinicalContext={{ organization: { id: 'org-1' } } as unknown as ClinicalContext} />
  </QueryClientProvider>)
  return { api, list, update, create, disable, user: userEvent.setup(), client }
}
const openOrderSets = async (f: ReturnType<typeof setup>) => { await f.user.click(screen.getByRole('tab', { name: /医嘱组套/ })) }

describe('clinical template library: three types in fixed order with unified scope names', () => {
  it('orders the type tabs 诊疗方案 / 医嘱组套 / 病历模板 and names the scope tabs 全部 / 我的 / 科室 / 全院', async () => {
    const f = setup()
    const types = within(screen.getByRole('tablist', { name: '模板类型' })).getAllByRole('tab').map(tab => tab.textContent)
    expect(types[0]).toMatch(/^诊疗方案/); expect(types[1]).toMatch(/^医嘱组套/); expect(types[2]).toMatch(/^病历模板/)
    expect(screen.getByRole('tab', { selected: true, name: /诊疗方案/ })).toBeInTheDocument()
    await openOrderSets(f)
    const scopes = within(screen.getByRole('tablist', { name: '医嘱组套范围分类' })).getAllByRole('tab').map(tab => tab.textContent?.replace(/\(\d+\)/, ''))
    expect(scopes).toEqual(['全部', '我的', '科室', '全院'])
    expect(screen.queryByText(/个人高频|科室路径|全院\/指南/)).not.toBeInTheDocument()
  })

  it('asks for the type first, with a one-line description each, then opens the matching editor', async () => {
    const f = setup()
    await f.user.click(screen.getByRole('button', { name: /新建模板/ }))
    const dialog = await screen.findByRole('dialog', { name: '新建临床模板' })
    const options = within(dialog).getAllByRole('radio')
    expect(options.map(option => option.closest('label')?.textContent)).toEqual([
      '诊疗方案病历、诊断、医嘱一整套，按诊断推荐', '医嘱组套一次开一组药品或检查治疗', '病历模板快速填写病历段落'])
    expect(options[0]).toBeChecked()
    await f.user.click(options[1])
    await f.user.click(within(dialog).getByRole('button', { name: '下一步' }))
    expect(await screen.findByText('新建医嘱组套')).toBeInTheDocument()
    // 组套隐藏诊断与病历关联，只有药品与项目
    expect(screen.queryByLabelText('添加标准诊断')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('配套病历模板')).not.toBeInTheDocument()
    expect(screen.getByLabelText('模板医嘱检索')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存模板' })).toBeDisabled()
    expect(screen.getByRole('tab', { selected: true, name: /医嘱组套/ })).toBeInTheDocument()
  })
})

describe('order sets in the library', () => {
  it('lists new order sets together with read-only legacy groups labelled as maintained by the medical affairs office', async () => {
    const f = setup()
    await openOrderSets(f)
    await waitFor(() => expect(screen.getAllByText('高血压常规检查组合').length).toBeGreaterThan(0))
    expect(f.list).toHaveBeenCalledWith('', 'ORDER_SET')
    expect(screen.getAllByText('血常规复查组套').length).toBeGreaterThan(0)
    expect(screen.getByText('由医务科维护')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /医嘱组套\(2\)/ })).toBeInTheDocument()
  })

  it('shows a new order set with default-selection and execution department per row, and actions to edit, copy and disable', async () => {
    const f = setup([orderSet({ services: [{ ...orderSet().services[0], executionDepartmentId: 'dept-lab', defaultSelected: false }] })])
    await openOrderSets(f)
    expect(await screen.findByRole('button', { name: '编辑组套' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制为我的' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停用组套' })).toBeInTheDocument()
    const services = screen.getByRole('table', { name: '组套项目' })
    await waitFor(() => expect(within(services).getByText('检验科')).toBeInTheDocument())
    expect(within(services).getByText('不勾选')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: '组套药品' })).getByText('勾选')).toBeInTheDocument()
    expect(screen.getByText(/累计已使用 3 次/)).toBeInTheDocument()
  })

  it('keeps legacy groups read-only: no edit, disable or copy action', async () => {
    const f = setup()
    await openOrderSets(f)
    await f.user.click((await screen.findAllByText('高血压常规检查组合'))[0])
    expect(await screen.findByRole('table', { name: '旧组合项目' })).toBeInTheDocument()
    expect(screen.getAllByText(/全院 · 由医务科维护/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /编辑组套|停用组套|复制为我的|编辑|停用/ })).not.toBeInTheDocument()
  })

  it('filters legacy groups out of the 我的 and 科室 scopes', async () => {
    const f = setup()
    await openOrderSets(f)
    await screen.findAllByText('高血压常规检查组合')
    await f.user.click(screen.getByRole('tab', { name: /^我的/ }))
    expect(screen.queryAllByText('高血压常规检查组合')).toHaveLength(0)
    expect(screen.getByText('未找到匹配的医嘱组套')).toBeInTheDocument()
    await f.user.click(screen.getByRole('tab', { name: /^全院/ }))
    expect(screen.getAllByText('高血压常规检查组合').length).toBeGreaterThan(0)
  })

  it('saves edits with row default selection and execution department, as an ORDER_SET update', async () => {
    const f = setup()
    await openOrderSets(f)
    await f.user.click(await screen.findByRole('button', { name: '编辑组套' }))
    expect(await screen.findByText('编辑医嘱组套')).toBeInTheDocument()
    await f.user.click(screen.getByRole('switch', { name: '血常规五分类 默认勾选' }))
    await waitFor(() => expect(f.api.organization.departments).toHaveBeenCalledWith('org-1'))
    await f.user.click(await screen.findByLabelText('血常规五分类 执行科室'))
    await f.user.click(await screen.findByRole('option', { name: '检验科' }))
    await f.user.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    expect(f.update).toHaveBeenCalledWith('set-1', expect.objectContaining({
      templateKind: 'ORDER_SET', expectedRevision: 2, scopeType: 'DEPARTMENT', diagnoses: [], tasks: [],
      medications: [expect.objectContaining({ medicationId: 'med-1', defaultSelected: true })],
      services: [expect.objectContaining({ catalogItemId: 'srv-1', defaultSelected: false, executionDepartmentId: 'dept-lab' })],
    }))
    expect(await screen.findByText('医嘱组套“血常规复查组套”已保存。')).toBeInTheDocument()
  })

  it.each([
    ['PLAN_TEMPLATE_EXECUTION_DEPARTMENT_INVALID', /执行科室不可用/],
    ['ORDER_SET_CONTENT_INVALID', /不能带诊断、任务或病历关联/],
    ['ORDER_SET_EMPTY', /至少需要一条/],
    ['CLINICAL_TEMPLATE_KIND_INVALID', /类型创建后不能修改/],
  ])('shows a code-based message for %s and keeps the editor open', async (code, text) => {
    const f = setup()
    f.update.mockRejectedValueOnce({ code, message: '英文或其它服务端文案' })
    await openOrderSets(f)
    await f.user.click(await screen.findByRole('button', { name: '编辑组套' }))
    await f.user.click(await screen.findByRole('button', { name: '保存模板' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByText('编辑医嘱组套')).toBeInTheDocument()
  })

  it('copies an order set as a personal one with a new name', async () => {
    const f = setup([orderSet({ scopeType: 'HOSPITAL' })])
    await openOrderSets(f)
    await f.user.click(await screen.findByRole('button', { name: '复制为我的' }))
    expect(await screen.findByText('新建医嘱组套')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入便于识别的模板名称')).toHaveValue('血常规复查组套（副本）')
    expect(screen.getByRole('combobox', { name: '使用范围' })).toHaveTextContent('我的')
    await f.user.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => expect(f.create).toHaveBeenCalledTimes(1))
    const input = f.create.mock.calls[0][0] as { medications: object[]; services: object[] }
    expect(input).toMatchObject({ templateKind: 'ORDER_SET', scopeType: 'PERSONAL', name: '血常规复查组套（副本）', diagnoses: [], tasks: [] })
    expect(input.medications[0]).not.toHaveProperty('lineId')
    expect(f.update).not.toHaveBeenCalled()
  })

  it('disables an order set after confirmation', async () => {
    const f = setup()
    await openOrderSets(f)
    await f.user.click(await screen.findByRole('button', { name: '停用组套' }))
    await f.user.click(await screen.findByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(f.disable).toHaveBeenCalledWith('set-1', 2))
    expect(await screen.findByText('已停用医嘱组套“血常规复查组套”。')).toBeInTheDocument()
  })
})
