import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OutpatientPlanTemplate, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { SaveOrderSetDialog } from './SaveOrderSetDialog'
import { buildOrderSetCandidates } from './orderSetCandidates'

const medication = (): MedicationPlanDraft => ({
  id: 'd-med', editorMode: 'regular', categoryCode: 'WESTERN', medicationName: '阿莫西林胶囊', medicationCode: 'M1', preparationSpec: '0.25g',
  productName: '产品', request: { medicationId: 'med-1', catalogItemId: 'prod-1', packageId: 'pkg-1', doseValue: 2, doseUnit: 'mg', routeCode: 'PO',
    frequencyCode: 'BID', durationValue: 3, durationUnit: 'd', quantity: 1, quantityUnit: '盒', substitutionAllowed: true, selfProvided: false,
    pricingRequired: true, priceType: 'SALE' } })
const lab = (): ServicePlanDraft => ({ id: 'd-lab', catalogItemId: 'srv-1', itemCode: 'LAB1', itemName: '血常规五分类', serviceType: 'LABORATORY',
  quantity: 1, unitCode: '次', performerDepartmentId: 'encounter-dept' })
const exam = (): ServicePlanDraft => ({ id: 'd-exam', catalogItemId: 'srv-2', itemCode: 'EXAM1', itemName: '十二导联心电图', serviceType: 'EXAMINATION',
  quantity: 1, unitCode: '次' })

/** 回执按服务端 View 形态回显入参，覆盖 saveMaintainedPlan 的回执核对。 */
function receipt(input: SaveOutpatientPlanTemplateInput): OutpatientPlanTemplate {
  return { ...input, id: 'new-set', revision: 0, status: 'ACTIVE', sortOrder: 0, useCount: 0, createdAt: '', updatedAt: '', tasks: [],
    medications: input.medications.map((item, index) => ({ ...item, lineId: `l${index}`, medicationCode: 'M1', editorMode: 'regular', categoryCode: 'WESTERN' })),
    services: input.services } as unknown as OutpatientPlanTemplate
}

function setup(create = vi.fn(async (input: SaveOutpatientPlanTemplateInput) => receipt(input)),
  source: Parameters<typeof buildOrderSetCandidates>[0] = { medicationDrafts: [medication()], serviceDrafts: [lab(), exam()], medications: [], services: [] }) {
  const api = { outpatientPlanTemplates: { create } } as unknown as RhnApi
  const onClose = vi.fn(), onSaved = vi.fn(), user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}>
    <SaveOrderSetDialog api={api} candidates={buildOrderSetCandidates(source)} onClose={onClose} onSaved={onSaved} />
  </QueryClientProvider>)
  return { create, onClose, onSaved, user, invalidate }
}

describe('SaveOrderSetDialog (医嘱区“存为组套”)', () => {
  it('lists every draft row selected by default and starts with the 我的 scope', () => {
    setup()
    for (const name of ['选择药品 阿莫西林胶囊', '选择项目 血常规五分类', '选择项目 十二导联心电图']) expect(screen.getByRole('checkbox', { name })).toBeChecked()
    expect(screen.getByText('已选 3 / 共 3 项')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /使用范围/ })).toHaveTextContent('我的')
    expect(screen.getByRole('button', { name: '保存组套' })).toBeDisabled()
  })

  it('saves only the checked rows as an ORDER_SET, invalidates template queries and reports the saved set', async () => {
    const f = setup()
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '复查组套')
    await f.user.click(screen.getByRole('checkbox', { name: '选择项目 十二导联心电图' }))
    expect(screen.getByText('已选 2 / 共 3 项')).toBeInTheDocument()
    await f.user.click(screen.getByRole('button', { name: '保存组套' }))
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ templateKind: 'ORDER_SET', scopeType: 'PERSONAL', name: '复查组套',
      sourceType: 'MANUAL', diagnoses: [], tasks: [],
      medications: [expect.objectContaining({ medicationId: 'med-1', catalogItemId: 'prod-1', defaultSelected: true })],
      services: [expect.objectContaining({ catalogItemId: 'srv-1', itemCode: 'LAB1', defaultSelected: true })] }))
    expect(f.create.mock.calls[0][0].services).toHaveLength(1)
    // 草稿上的接诊科室不写入共享组套
    expect(f.create.mock.calls[0][0].services[0]).not.toHaveProperty('executionDepartmentId')
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ['outpatient-plan-templates'] })
    expect(f.onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-set', name: '复查组套' }))
  })

  it('lets the doctor pick a wider scope and sends it', async () => {
    const f = setup()
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '科室共用')
    await f.user.click(screen.getByRole('combobox', { name: /使用范围/ }))
    await f.user.click(await screen.findByRole('option', { name: '科室' }))
    await f.user.click(screen.getByRole('button', { name: '保存组套' }))
    await waitFor(() => expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ scopeType: 'DEPARTMENT' })))
  })

  it('disables saving when every row is unchecked', async () => {
    const f = setup()
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '空组套')
    await f.user.click(screen.getByRole('checkbox', { name: '全选医嘱' }))
    expect(screen.getByText('已选 0 / 共 3 项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存组套' })).toBeDisabled()
    expect(f.create).not.toHaveBeenCalled()
  })

  it.each([
    ['ORDER_SET_EMPTY', /至少需要一条/],
    ['PLAN_TEMPLATE_EXECUTION_DEPARTMENT_INVALID', /执行科室不可用/],
  ])('keeps the dialog open with a code-based message when the server answers %s', async (code, text) => {
    const f = setup(vi.fn().mockRejectedValue({ code, message: '服务端原文' }))
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '失败')
    await f.user.click(screen.getByRole('button', { name: '保存组套' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(f.onSaved).not.toHaveBeenCalled()
    expect(f.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: '选择项目 血常规五分类' })).toBeChecked()
  })

  it('does not report success when the save receipt disagrees with the request', async () => {
    const f = setup(vi.fn(async (input: SaveOutpatientPlanTemplateInput) => ({ ...receipt(input), templateKind: 'PROTOCOL' as const })))
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '回执不符')
    await f.user.click(screen.getByRole('button', { name: '保存组套' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存未确认')
    expect(f.onSaved).not.toHaveBeenCalled()
  })

  it('groups rows by source, excludes cancelled orders, dedupes and greys out herbal rows', async () => {
    const issued = { id: 'r-med', revision: 1, status: 'ACTIVE', medicationId: 'med-9', catalogItemId: 'prod-9', medicationName: '布洛芬缓释胶囊',
      medicationCode: 'M9', medicationType: 'WESTERN', itemName: '布洛芬', quantity: 2, quantityUnit: '盒', doseValue: 0.3, doseUnit: 'g',
      substitutionAllowed: true, selfProvided: false, authoredAt: '2026-01-01T00:00:00Z' }
    const herbal = { ...issued, id: 'r-herb', medicationId: 'herb-1', catalogItemId: 'herb-c', medicationName: '当归', medicationType: 'HERBAL' }
    const cancelled = { ...issued, id: 'r-x', status: 'CANCELLED', medicationId: 'med-x', catalogItemId: 'prod-x', medicationName: '已撤销药' }
    const savedLab = { id: 'r-lab', revision: 1, status: 'DRAFT', catalogItemId: 'srv-1', itemCode: 'LAB1', itemName: '血常规五分类', serviceType: 'LABORATORY',
      quantity: 1, unitCode: '次', authoredAt: '2026-01-01T00:00:00Z' }
    const issuedEcg = { ...savedLab, id: 'r-ecg', status: 'ACTIVE', catalogItemId: 'srv-7', itemCode: 'ECG', itemName: '动态心电图', serviceType: 'EXAMINATION' }
    const f = setup(undefined, { medicationDrafts: [medication()], serviceDrafts: [lab()],
      medications: [issued, herbal, cancelled] as never, services: [savedLab, issuedEcg] as never })
    expect(screen.getByRole('group', { name: '待确认草稿' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '本次已开立' })).toBeInTheDocument()
    // 血常规在待确认与已保存草稿中重复，只列一次；已撤销的不出现
    expect(screen.getAllByRole('checkbox', { name: '选择项目 血常规五分类' })).toHaveLength(1)
    expect(screen.queryByRole('group', { name: '已保存的医嘱草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /已撤销药/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择药品 当归' })).toBeDisabled()
    expect(screen.getByText(/草药整方暂不支持/)).toBeInTheDocument()
    expect(screen.getByText('已选 4 / 共 4 项')).toBeInTheDocument()
    await f.user.type(screen.getByPlaceholderText('例如：血常规复查组套'), '混合来源')
    await f.user.click(screen.getByRole('button', { name: '保存组套' }))
    await waitFor(() => expect(f.onSaved).toHaveBeenCalled())
    const input = f.create.mock.calls[0][0]
    expect(input.medications.map(item => item.medicationId).sort()).toEqual(['med-1', 'med-9'])
    expect(input.medications.find(item => item.medicationId === 'med-9')).toMatchObject({ doseValue: 0.3, doseUnit: 'g', catalogItemId: 'prod-9' })
    expect(input.services.map(item => item.catalogItemId).sort()).toEqual(['srv-1', 'srv-7'])
  })

  it('works with issued orders only', () => {
    setup(undefined, { medicationDrafts: [], serviceDrafts: [], medications: [], services: [{ id: 'r', revision: 1, status: 'ACTIVE', catalogItemId: 's',
      itemCode: 'S', itemName: '胸片', serviceType: 'EXAMINATION', quantity: 1, unitCode: '次', authoredAt: '2026-01-01T00:00:00Z' }] as never })
    expect(screen.getByRole('checkbox', { name: '选择项目 胸片' })).toBeChecked()
  })
})
