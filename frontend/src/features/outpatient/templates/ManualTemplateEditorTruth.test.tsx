import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { ClinicalMedicationStandards } from '../../../shared/api/masterDataApi'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

function fixture() {
  const plan = maintainedPlanFixture()
  const standards = vi.fn().mockResolvedValue(editorStandardsFixture())
  const update = vi.fn(async (_id: string, input: object) => ({ ...plan, ...input, revision: plan.revision + 1 }))
  const searchMedications = vi.fn().mockResolvedValue({ content: [{ id: 'new-med', code: 'NEW', name: '目录药品', sdStatus: 'ACTIVE' }],
    totalElements: 1, totalPages: 1, page: 0, size: 30 })
  const searchServices = vi.fn()
  const api = { outpatientNoteTemplates: { list: vi.fn().mockResolvedValue([]) }, outpatientPlanTemplates: { update },
    masterData: { clinicalMedicationStandards: standards, searchMedications, searchServices } } as unknown as RhnApi
  const onSaved = vi.fn(), onClose = vi.fn(), user = userEvent.setup()
  const tree = (nextApi = api) => <ManualClinicalTemplateDialog api={nextApi} organizationId="org" kind="PLAN"
    editingPlan={plan} onClose={onClose} onSaved={onSaved} />
  return { plan, api, standards, update, searchMedications, searchServices, onSaved, user, tree }
}
const save = () => screen.getByRole('button', { name: '保存模板' })

describe('manual template editor preserves actual clinical input', () => {
  it('shows dictionary failure, blocks medication edits/save and retries without clearing the draft', async () => {
    const f = fixture(); f.standards.mockRejectedValueOnce(new Error('字典服务不可用'))
    render(f.tree())
    expect(await screen.findByText(/用法字典加载失败/)).toHaveTextContent('字典服务不可用')
    expect(screen.getByLabelText('测试药品 单次剂量')).toBeDisabled()
    expect(save()).toBeDisabled()
    await f.user.click(save())
    expect(f.update).not.toHaveBeenCalled()
    await f.user.click(screen.getByRole('button', { name: '重新加载用法字典' }))
    await waitFor(() => expect(save()).toBeEnabled())
    expect(screen.getByLabelText('测试药品 数量')).toHaveValue(2)
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
  })

  it('ignores an old dictionary response after the API context changes', async () => {
    const f = fixture(); let resolve!: (value: ClinicalMedicationStandards) => void
    f.standards.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const view = render(f.tree())
    await waitFor(() => expect(f.standards).toHaveBeenCalled())
    const other = { ...f.api, masterData: { ...f.api.masterData,
      clinicalMedicationStandards: vi.fn().mockRejectedValue(new Error('新会话字典失败')) } }
    view.rerender(f.tree(other))
    await screen.findByText(/新会话字典失败/)
    await act(async () => { resolve(editorStandardsFixture()) })
    expect(save()).toBeDisabled()
    expect(screen.getByLabelText('测试药品 给药途径')).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })

  it.each(['', '0', '-2'])('retains invalid medication quantity %s instead of writing one', async quantity => {
    const f = fixture(); render(f.tree())
    await waitFor(() => expect(save()).toBeEnabled())
    const input = screen.getByLabelText('测试药品 数量')
    fireEvent.change(input, { target: { value: quantity } })
    expect(input).toHaveValue(quantity === '' ? null : Number(quantity))
    await f.user.click(save())
    expect(f.update).not.toHaveBeenCalled()
    expect(f.onSaved).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '3' } })
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ medications: [expect.objectContaining({ quantity: 3 })] }))
  })

  it('adds a directory drug without invented duration, packaging or free-pricing status', async () => {
    const f = fixture(); f.plan.medications = []
    f.update.mockImplementationOnce(async (_id, value) => {
      const input = value as SaveOutpatientPlanTemplateInput
      return { ...f.plan, name: input.name, scopeType: input.scopeType, revision: 4, medications: input.medications.map(item => ({ ...item,
        medicationId: 'new-med', lineId: 'saved-line', editorMode: 'regular' as const, categoryCode: 'WESTERN', medicationCode: 'NEW', medicationName: '目录药品',
      })) }
    })
    render(f.tree())
    await f.user.click(screen.getByLabelText('模板医嘱检索'))
    await f.user.type(await screen.findByPlaceholderText('输入药品名称、编码或拼音码'), '目录')
    await f.user.click(await screen.findByRole('option', { name: /目录药品/ }))
    expect(screen.getByLabelText('目录药品 疗程')).toHaveValue(null)
    const row = screen.getByRole('row', { name: '编辑模板医嘱 目录药品' })
    const quantityCell = screen.getByLabelText('目录药品 数量').closest('td')!
    const unit = within(quantityCell).getByRole('textbox', { name: '单位' })
    expect(unit).toHaveValue('')
    await f.user.click(save())
    expect(f.update).not.toHaveBeenCalled()
    fireEvent.change(unit, { target: { value: '粒' } })
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    const request = f.update.mock.calls[0][1] as { medications: Record<string, unknown>[] }
    expect(request.medications[0]).toMatchObject({ medicationId: 'new-med', quantityUnit: '粒' })
    expect(request.medications[0].durationValue).toBeUndefined()
    expect(request.medications[0].durationUnit).toBeUndefined()
    expect(request.medications[0].pricingRequired).toBeUndefined()
    expect(row).not.toHaveTextContent('3 天')
  })

  it('labels an unknown route as unconfirmed and excludes it from selectable dictionary entries', async () => {
    const f = fixture(); f.plan.medications[0].routeCode = 'LEGACY'
    render(f.tree())
    await waitFor(() => expect(screen.getByLabelText('测试药品 给药途径')).toBeEnabled())
    expect(screen.getByText('待确认（LEGACY）')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    await f.user.click(screen.getByLabelText('测试药品 给药途径'))
    expect(screen.queryByRole('option', { name: 'LEGACY' })).not.toBeInTheDocument()
    await f.user.click(screen.getByRole('option', { name: /口服/ }))
    await waitFor(() => expect(save()).toBeEnabled())
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
  })

  it('does not display or save a missing duration unit as days', async () => {
    const f = fixture(); f.plan.medications[0].durationValue = 3
    render(f.tree())
    const cell = screen.getByLabelText('测试药品 疗程').closest('td')!
    expect(within(cell).getByRole('combobox', { name: '单位' })).not.toHaveTextContent('天')
    expect(await screen.findByText('药品剂量或疗程缺少明确单位，请补充后保存。')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    await f.user.click(within(cell).getByRole('combobox', { name: '单位' }))
    await f.user.click(screen.getByRole('option', { name: /周/ }))
    await waitFor(() => expect(save()).toBeEnabled())
    await f.user.click(save())
    expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ medications: [expect.objectContaining({ durationValue: 3, durationUnit: 'w' })] }))
  })

  it('preserves the diagnosis code system and distinguishes the same code in another system', async () => {
    const f = fixture(); f.plan.medications = []
    f.plan.diagnoses = [{ conceptId: 'old', codeSystem: 'SYSTEM_A', diagnosisDomain: 'WESTERN_MEDICINE',
      code: 'A01', display: '原目录诊断', type: 'PRIMARY' }]
    f.api.masterData.diseases = vi.fn().mockResolvedValue([{ id: 'new', systemCode: 'SYSTEM_B',
      code: 'A01', display: '另一目录诊断', sdDiagnosisDomain: 'WESTERN_MEDICINE', sdStatus: 'ACTIVE' }])
    render(f.tree())
    await f.user.click(screen.getByLabelText('添加标准诊断'))
    await f.user.type(await screen.findByPlaceholderText('输入诊断名称、编码或拼音码'), '另一目录')
    await f.user.click(await screen.findByRole('option', { name: /另一目录诊断/ }))
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ diagnoses: [
      expect.objectContaining({ codeSystem: 'SYSTEM_A', code: 'A01' }),
      expect.objectContaining({ codeSystem: 'SYSTEM_B', code: 'A01', conceptId: 'new' }),
    ] }))
  })

  it.each(['', '0', '-2'])('retains invalid service quantity %s instead of writing one', async quantity => {
    const f = fixture(); f.plan.medications = []
    f.plan.services = [{ catalogItemId: 's', itemCode: 'S', itemName: '检查项目', serviceType: 'EXAMINATION', quantity: 2, unitCode: '项' }]
    render(f.tree())
    const input = screen.getByLabelText('检查项目 数量')
    fireEvent.change(input, { target: { value: quantity } })
    expect(input).toHaveValue(quantity === '' ? null : Number(quantity))
    await f.user.click(save())
    expect(f.update).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '3' } })
    await f.user.click(save())
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ services: [expect.objectContaining({ quantity: 3 })] }))
  })
})
