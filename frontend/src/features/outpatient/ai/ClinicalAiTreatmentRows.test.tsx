import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiTreatmentRows } from './ClinicalAiTreatmentRows'

const item = { type: 'MEDICATION' as const, catalogItemId: 'p1', medicationId: 'm1', code: 'TEST', name: '测试药品', rationale: '合成测试' }
function setup(defaults = true) {
  const medication = { id: 'm1', code: 'TEST', name: '测试药品', preparationUnit: '片', preparationSpec: '0.5g',
    defaultDose: defaults ? 0.5 : undefined, defaultDoseUnit: 'g', defaultRoute: 'ORAL', defaultFrequency: 'QD',
    strengthValue: 500, strengthUnit: 'mg', products: [{ id: 'p1', name: '测试片剂', sdStatus: 'ACTIVE', orderable: true,
      chargeable: true, unitCode: '片', instruction: '测试用药嘱托',
      organizationAdoption: { organizationId: 'o1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true },
      packages: [{ id: 'pack1', unitCode: 'BOX', unitName: '盒', quantityFactor: 10, packageSpec: '0.5g*10片/盒',
        sdStatus: 'ACTIVE', validFrom: '2020-01-01', defaultDispense: true }],
      prices: [{ packageId: 'pack1', price: 8.6, sdStatus: 'ACTIVE', sdPriceType: 'SALE', validFrom: '2020-01-01' }] }] }
  const api = { encounters: { orderableMedications: vi.fn().mockResolvedValue([medication]) }, masterData: {
    activeMedicationRoutes: vi.fn().mockResolvedValue([{ code: 'ORAL', name: '口服' }]),
    activeOrderFrequencies: vi.fn().mockResolvedValue([{ code: 'QD', name: '每日一次', executionTimes: ['08:00'] }]),
    searchServices: vi.fn().mockResolvedValue({ content: [{ id: 's1', unitCode: 'ITEM', specimenType: '静脉血',
      examinationNotes: '测试采样要求', prices: [] }] }),
  } } as unknown as RhnApi
  const onReview = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><ClinicalAiTreatmentRows items={[item,
    { type: 'LABORATORY', catalogItemId: 's1', code: 'LAB', name: '测试检验', rationale: '评估病因' }]}
    api={api} encounter={{ id: 'e1', organizationId: 'o1', departmentId: 'd1' } as Encounter} disabled={false} onReview={onReview} />
  </QueryClientProvider>)
  return { api, onReview }
}

describe('catalog-backed AI order details', () => {
  it('loads dose, route, frequency, packaging and specimen requirements without another trigger', async () => {
    const { onReview } = setup()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeEnabled())
    expect(screen.getByText('每次 0.5 g · 口服 · 每日一次')).toBeInTheDocument()
    expect(screen.getByText('1 盒')).toBeInTheDocument()
    expect(screen.getByText('¥8.60')).toBeInTheDocument()
    expect(screen.getAllByText(/标本：静脉血/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    expect(onReview).toHaveBeenCalledWith([expect.objectContaining({ orderDraft: expect.objectContaining({
      doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL', frequencyCode: 'QD', quantity: 1, packageId: 'pack1',
    }) }), expect.objectContaining({ orderDraft: { quantity: 1, instruction: '标本：静脉血；测试采样要求；评估病因' } })])
  })

  it('recalculates quantity from the edited course and preserves a manually overridden quantity and instructions', async () => {
    const { onReview } = setup()
    await waitFor(() => expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeEnabled())
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('天数'), { target: { value: '15' } })
    expect(editor.getByLabelText('总量（盒）')).toHaveValue(2)
    fireEvent.change(editor.getByLabelText('总量（盒）'), { target: { value: '3' } })
    fireEvent.change(editor.getByLabelText('用药嘱托'), { target: { value: '医生修改后嘱托' } })
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    expect(onReview.mock.calls[0][0][0].orderDraft).toMatchObject({ durationValue: 15, quantity: 3, instruction: '医生修改后嘱托' })
  })

  it('requires missing catalog doses to be filled and prevents zero quantities', async () => {
    const { onReview } = setup(false)
    await screen.findByText('每次 待填 g · 口服 · 每日一次')
    const confirm = screen.getByRole('button', { name: '确认所选（2）' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0])
    const editor = within(screen.getByLabelText('修改 测试药品'))
    fireEvent.change(editor.getByLabelText('单次剂量'), { target: { value: '0.5' } })
    expect(confirm).toBeEnabled()
    fireEvent.change(editor.getByLabelText('总量（盒）'), { target: { value: '0' } })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onReview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试药品' }))
    expect(screen.getByRole('button', { name: '确认所选（1）' })).toBeEnabled()
  })
})
