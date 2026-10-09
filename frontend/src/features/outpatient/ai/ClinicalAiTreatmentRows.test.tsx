import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiTreatmentRows } from './ClinicalAiTreatmentRows'

const item = { type: 'MEDICATION' as const, catalogItemId: 'p1', medicationId: 'm1', code: 'TEST', name: '测试药品', rationale: '合成测试' }
function setup(defaults = true, servicePricePatch: Record<string, unknown> = {}, servicePatch: Record<string, unknown> = {}) {
  const medication = { id: 'm1', code: 'TEST', name: '测试药品', preparationUnit: '片', preparationSpec: '0.5g',
    stockSiteId: 'pharmacy-1', stockSiteName: '门诊药房',
    defaultDose: defaults ? 0.5 : undefined, defaultDoseUnit: 'g', defaultRoute: 'ORAL', defaultFrequency: 'QD',
    strengthValue: 500, strengthUnit: 'mg', products: [{ id: 'p1', name: '测试片剂', sdStatus: 'ACTIVE', orderable: true,
      chargeable: true, validFrom: '2020-01-01', unitCode: '片', instruction: '测试用药嘱托',
      organizationAdoption: { validFrom: '2020-01-01', organizationId: 'o1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
      packages: [{ id: 'pack1', unitCode: 'BOX', unitName: '盒', quantityFactor: 10, packageSpec: '0.5g*10片/盒',
        sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true }],
      prices: [{ id: 'price1', organizationId: 'o1', currencyCode: 'CNY', packageId: 'pack1', price: 8.6, sdStatus: 'ACTIVE', sdPriceType: 'SALE', validFrom: '2020-01-01' }] }] }
  const api = { organization: { departments: vi.fn().mockResolvedValue([
    { id: 'd1', organizationId: 'o1', name: '检验科', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01' },
    { id: 'd2', organizationId: 'o1', name: '检验中心', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01' },
    { id: 'inactive', organizationId: 'o1', name: '停用科室', sdOrgStatus: 'INACTIVE', validFrom: '2020-01-01' },
  ]) }, encounters: { orderableMedications: vi.fn().mockResolvedValue([medication]) }, masterData: {
    activeMedicationRoutes: vi.fn().mockResolvedValue([{ code: 'ORAL', name: '口服' }]),
    activeOrderFrequencies: vi.fn().mockResolvedValue([{ code: 'QD', name: '每日一次', executionTimes: ['08:00'],
      ruleType: 'TIMES_PER_PERIOD', frequencyCount: 1, periodValue: 1, periodUnit: 'D' }]),
    searchServices: vi.fn().mockResolvedValue({ content: [{ id: 's1', unitCode: 'ITEM', specimenType: '静脉血',
      examinationNotes: '测试采样要求', sdStatus: 'ACTIVE', sdUsageType: 'OUTPATIENT', orderable: true, chargeable: true, validFrom: '2020-01-01',
      organizationAdoption: { organizationId: 'o1', defaultDepartmentId: 'd1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, validFrom: '2020-01-01' },
      prices: [{ id: 'service-price', organizationId: 'o1', sdPriceType: 'SALE', sdStatus: 'ACTIVE', price: 12.5, currencyCode: 'CNY', validFrom: '2020-01-01', ...servicePricePatch }], ...servicePatch }] }),
  } } as unknown as RhnApi
  const onReview = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><ClinicalAiTreatmentRows items={[item,
    { type: 'LABORATORY', catalogItemId: 's1', code: 'LAB', name: '测试检验', aiOriginalName: 'AI 原项目', rationale: '评估病因' }]}
    api={api} encounter={{ id: 'e1', organizationId: 'o1', departmentId: 'd1' } as Encounter} disabled={false} onReview={onReview} />
  </QueryClientProvider>)
  return { api, onReview }
}

describe('catalog-backed AI order details', () => {
  it('uses the server resolved default instead of the requesting clinic and preserves it in review', async () => {
    const { onReview } = setup(true, {}, { defaultExecutionDepartment: { departmentId: 'd2', departmentName: '检验中心', source: 'DEPARTMENT_TYPE' } })
    expect(await screen.findByText('检验中心')).toBeInTheDocument()
    expect(screen.getByText('AI 原建议：AI 原项目')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试药品' }))
    fireEvent.click(screen.getByRole('button', { name: '确认所选（1）' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ orderDraft: expect.objectContaining({ performerDepartmentId: 'd2' }) })])
  })

  it('leaves an ambiguous default empty and lets the physician explicitly select a department', async () => {
    const { onReview } = setup(true, {}, { defaultExecutionDepartment: { departmentId: null, departmentName: null, source: 'AMBIGUOUS' } })
    await screen.findByText('¥12.50')
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试药品' }))
    expect(screen.getByRole('button', { name: '确认所选（1）' })).toBeDisabled()
    const row = screen.getByRole('checkbox', { name: '选择 测试检验' }).closest('.doctor-unified-order-row')!
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '修改' }))
    fireEvent.click(screen.getByRole('combobox', { name: '执行科室' }))
    fireEvent.click(screen.getByRole('option', { name: '检验中心' }))
    fireEvent.click(screen.getByRole('button', { name: '确认所选（1）' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ orderDraft: expect.objectContaining({ performerDepartmentId: 'd2' }) })])
  })
  it('loads dose, route, frequency, packaging and specimen requirements without another trigger', async () => {
    const { onReview } = setup()
    await screen.findByText('每次 0.5 g · 口服 · 每日一次')
    expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeDisabled()
    expect(screen.getByText('每次 0.5 g · 口服 · 每日一次')).toBeInTheDocument()
    expect(screen.getByText('待填 盒')).toBeInTheDocument()
    expect(screen.queryByText('评估病因')).not.toBeInTheDocument()
    const serviceRow = screen.getByRole('checkbox', { name: '选择 测试检验' }).closest('.doctor-unified-order-row')
    expect(serviceRow?.querySelector('.doctor-unified-cell-instruction')).toHaveTextContent('—')
    expect(serviceRow?.querySelector('.doctor-unified-cell-directions')).toHaveTextContent('标本：静脉血')
    expect(serviceRow?.querySelector('.doctor-unified-cell-directions')).not.toHaveTextContent('测试采样要求')
    expect(serviceRow?.querySelector('.doctor-unified-cell-directions')).toHaveAttribute('title', '标本：静脉血；测试采样要求')
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '7' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(1)
    expect(screen.getByText('¥8.60')).toBeInTheDocument()
    expect(screen.getAllByText(/标本：静脉血/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ orderDraft: expect.objectContaining({
      doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL', frequencyCode: 'QD', quantity: 1, packageId: 'pack1',
    }) }), expect.objectContaining({ orderDraft: expect.objectContaining({ quantity: 1,
      performerOrganizationId: 'o1', performerDepartmentId: 'd1' }) })])
  })

  it('recalculates quantity from the edited course and preserves a manually overridden quantity and instructions', async () => {
    const { onReview } = setup()
    await screen.findByText('每次 0.5 g · 口服 · 每日一次')
    expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '15' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(2)
    fireEvent.change(editor.getByLabelText('总量（盒）'), { target: { value: '3' } })
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '30' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(3)
    fireEvent.change(editor.getByLabelText('用药嘱托'), { target: { value: '医生修改后嘱托' } })
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    expect(onReview.mock.calls[0][0][0].orderDraft).toMatchObject({ durationValue: 30, quantity: 3, instruction: '医生修改后嘱托' })
  })

  it('keeps a physician-entered service clinical description without showing it as a patient instruction', async () => {
    const { onReview } = setup()
    await screen.findByText('每次 0.5 g · 口服 · 每日一次')
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    fireEvent.change(within(screen.getByLabelText('修改 测试药品')).getByLabelText('天数'), { target: { value: '7' } })
    const serviceRow = screen.getByRole('checkbox', { name: '选择 测试检验' }).closest('.doctor-unified-order-row')
    expect(serviceRow).not.toBeNull()
    fireEvent.click(within(serviceRow as HTMLElement).getByRole('button', { name: '修改' }))
    const serviceEditor = within(screen.getByLabelText('修改 测试检验'))
    fireEvent.change(serviceEditor.getByLabelText('执行要求'), { target: { value: '医生明确填写的临床说明' } })
    expect(serviceRow?.querySelector('.doctor-unified-cell-directions')).toHaveTextContent('医生明确填写的临床说明')
    expect(serviceRow?.querySelector('.doctor-unified-cell-instruction')).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    expect(onReview.mock.calls[0][0][1].orderDraft).toMatchObject({ quantity: 1, instruction: '医生明确填写的临床说明' })
  })

  it('shows the routed pharmacy and lets the physician change the configured service department before review', async () => {
    const { onReview } = setup()
    await screen.findByText('门诊药房')
    expect(await screen.findByText('检验科')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试药品' }))
    const serviceRow = screen.getByRole('checkbox', { name: '选择 测试检验' }).closest('.doctor-unified-order-row')!
    fireEvent.click(within(serviceRow as HTMLElement).getByRole('button', { name: '修改' }))
    fireEvent.click(screen.getByRole('combobox', { name: '执行科室' }))
    expect(screen.queryByRole('option', { name: '停用科室' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '检验中心' }))
    fireEvent.click(screen.getByRole('button', { name: '确认所选（1）' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ orderDraft: expect.objectContaining({
      performerOrganizationId: 'o1', performerDepartmentId: 'd2', quantity: 1,
    }) })])
  })

  it('requires missing catalog doses to be filled and prevents zero quantities', async () => {
    const { onReview } = setup(false)
    await screen.findByText('每次 待填 g · 口服 · 每日一次')
    const confirm = screen.getByRole('button', { name: '确认所选（2）' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('单次剂量'), { target: { value: '0.5' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '7' } })
    expect(confirm).toBeEnabled()
    fireEvent.change(editor.getByLabelText('总量（盒）'), { target: { value: '0' } })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试药品' }))
    expect(screen.getByRole('button', { name: '确认所选（1）' })).toBeEnabled()
  })
  it('clears the automatic total when the course is removed or the dose unit cannot be converted', async () => {
    const { onReview } = setup()
    await screen.findByText('每次 0.5 g · 口服 · 每日一次')
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '15' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(2)
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(null)
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '15' } })
    fireEvent.change(editor.getByLabelText('剂量单位'), { target: { value: 'ml' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(null)
    expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeDisabled()
    expect(onReview).not.toHaveBeenCalled()
  })

  it.each([{ sdStatus: 'INACTIVE' }, { validTo: '2020-01-01' }, { currencyCode: undefined }])(
    'shows price errors and disables AI confirmation for %j', async patch => {
      const { onReview } = setup(true, patch)
      expect(await screen.findByText(/销售价格/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeDisabled()
      expect(onReview).not.toHaveBeenCalled()
    })
  it('shows an AI service price in its actual currency', async () => {
    setup(true, { currencyCode: 'USD' })
    expect(await screen.findByText('US$12.50')).toBeInTheDocument()
    expect(screen.queryByText('¥12.50')).not.toBeInTheDocument()
  })

})
