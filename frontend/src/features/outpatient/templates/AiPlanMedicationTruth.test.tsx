import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'
import { catalogPage, catalogProduct } from './templateCatalogSearch.testFixtures'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

function fixture(task = true) {
  const plan = maintainedPlanFixture(); plan.medications = []
  plan.tasks = task ? [{ kind: 'MEDICATION', text: '测试药品', origin: 'EXPLICIT', status: 'NEEDS_REVIEW',
    sourceQuote: '不要口服；每次0.5-1g，疗程7-10天，共3盒', details: '核对禁忌后决定用法' }] : []
  const candidate = catalogProduct('product', 'med', '目录药品')
  Object.assign(candidate.medication, { defaultDose: 9, defaultDoseUnit: 'g', defaultRoute: 'PO', defaultFrequency: 'BID' })
  const standards = vi.fn().mockResolvedValue(editorStandardsFixture())
  const update = vi.fn(async (_id, input) => ({ ...plan, ...input, revision: 4,
    medications: input.medications.map((item: object) => ({ ...item, lineId: 'line', medicationCode: 'M', editorMode: 'regular', categoryCode: 'WESTERN' })) }))
  const api = { masterData: { clinicalMedicationStandards: standards,
    searchMedicationProducts: vi.fn().mockResolvedValue(catalogPage([candidate])), searchMedications: vi.fn().mockResolvedValue(catalogPage([])) },
    outpatientPlanTemplates: { update }, clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true }) } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), saved = vi.fn()
  const tree = (current = api) => <QueryClientProvider client={client}><AiPlanTemplateDraftModal api={current} editingTemplate={plan} onSaved={saved} onClose={vi.fn()} /></QueryClientProvider>
  const view = render(tree()), user = userEvent.setup()
  async function select() {
    await user.click(screen.getByRole('button', { name: task ? '对齐目录药品' : '添加目录药品' }))
    if (!task) {
      await user.type(screen.getByPlaceholderText(/输入药品名称搜索目录/), '药品')
      await user.click(screen.getByRole('button', { name: '搜索' }))
    }
    await user.click(await screen.findByRole('button', { name: '选用' }))
    return within(await screen.findByRole('dialog', { name: '确认药品用法与数量' }))
  }
  return { ...view, api, tree, plan, standards, update, saved, user, select }
}
async function fill(f: ReturnType<typeof fixture>, dialog: ReturnType<typeof within>) {
  const dose = dialog.getByRole('spinbutton', { name: '单次剂量' })
  await waitFor(() => expect(dose).toBeEnabled())
  await f.user.type(dose, '0.5')
  await f.user.click(within(dose.closest('.ui-field') as HTMLElement).getByRole('combobox'))
  await f.user.click(screen.getByRole('option', { name: '克' }))
  await f.user.click(dialog.getByRole('combobox', { name: '给药途径' }))
  await f.user.click(screen.getByRole('option', { name: '口服' }))
  await f.user.click(dialog.getByRole('combobox', { name: '用药频次' }))
  await f.user.click(screen.getByRole('option', { name: '每日两次' }))
  await f.user.clear(dialog.getByRole('spinbutton', { name: '药品数量' }))
  await f.user.type(dialog.getByRole('spinbutton', { name: '药品数量' }), '3')
}

describe('AI plan medication confirmation', () => {
  it('preserves original restrictions and requires explicit values before marking a task matched', async () => {
    const f = fixture(), dialog = await f.select()
    expect(dialog.getByRole('region', { name: '原始用药建议' })).toHaveTextContent('不要口服；每次0.5-1g，疗程7-10天，共3盒')
    expect(dialog.getByRole('spinbutton', { name: '单次剂量' })).toHaveValue(null)
    expect(dialog.getByRole('spinbutton', { name: '药品数量' })).toHaveValue(1)
    expect(dialog.getByRole('spinbutton', { name: '疗程' })).toHaveValue(null)
    expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
    await fill(f, dialog)
    await f.user.type(dialog.getByRole('textbox', { name: '用药说明' }), '核实后使用，保留限制说明')
    await f.user.click(dialog.getByRole('button', { name: '确认加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    const input = f.update.mock.calls[0][1]
    expect(input.medications[0]).toMatchObject({ doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID', quantity: 3, quantityUnit: '盒', medicationInstruction: '核实后使用，保留限制说明' })
    expect(input.medications[0].durationValue).toBeUndefined()
    expect(input.tasks[0]).toEqual({ ...f.plan.tasks[0], status: 'MATCHED' })
    await waitFor(() => expect(f.saved).toHaveBeenCalledTimes(1))
  })
  it('cancel leaves the task unmatched and does not append a drug', async () => {
    const f = fixture(), dialog = await f.select()
    await f.user.click(dialog.getByRole('button', { name: '取消选药' }))
    expect(screen.getByText('待匹配目录')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '调整用法' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('retains entered values on dictionary failure and permits an explicit retry', async () => {
    const f = fixture(); f.standards.mockRejectedValueOnce(new Error('字典连接失败'))
    const dialog = await f.select()
    await f.user.clear(dialog.getByRole('spinbutton', { name: '药品数量' }))
    await f.user.type(dialog.getByRole('spinbutton', { name: '药品数量' }), '3')
    expect(await dialog.findByText(/字典连接失败/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeDisabled()
    await f.user.click(dialog.getByRole('button', { name: '重新加载用法字典' }))
    await waitFor(() => expect(dialog.getByRole('spinbutton', { name: '单次剂量' })).toBeEnabled())
    expect(dialog.getByRole('spinbutton', { name: '药品数量' })).toHaveValue(3)
    expect(f.update).not.toHaveBeenCalled()
  })
  it('manual addition uses confirmed catalog defaults and one package as a reviewable starting point', async () => {
    const f = fixture(false), dialog = await f.select()
    await waitFor(() => expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeEnabled())
    await f.user.click(dialog.getByRole('button', { name: '确认加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    expect(f.update.mock.calls[0][1].medications[0]).toMatchObject({ quantity: 1, doseValue: 9,
      doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID' })
  })
  it('does not accept a pending selection after the API context changes', async () => {
    const f = fixture(), dialog = await f.select()
    await fill(f, dialog)
    await act(async () => f.rerender(f.tree({ ...f.api })))
    expect(dialog.getByText(/当前会话或方案已变化/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('blocks saving after clearing a quantity and does not silently restore 1', async () => {
    const f = fixture(false), dialog = await f.select()
    await waitFor(() => expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeEnabled())
    await f.user.click(dialog.getByRole('button', { name: '确认加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '调整用法' }))
    const quantity = screen.getByRole('spinbutton', { name: '药品数量' })
    await f.user.clear(quantity)
    expect(quantity).toHaveValue(null)
    expect(screen.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '完成' })).toBeDisabled()
    await f.user.type(quantity, '4')
    await f.user.click(screen.getByRole('button', { name: '完成' }))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    expect(f.update.mock.calls[0][1].medications[0].quantity).toBe(4)
  })
  it('does not use a late dictionary response from a previous API context', async () => {
    const f = fixture()
    let resolve!: (value: ReturnType<typeof editorStandardsFixture>) => void
    f.standards.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const dialog = await f.select()
    expect(dialog.getByRole('spinbutton', { name: '单次剂量' })).toBeDisabled()
    f.rerender(f.tree({ ...f.api }))
    await act(async () => resolve(editorStandardsFixture()))
    expect(dialog.getByRole('spinbutton', { name: '单次剂量' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: '确认加入方案' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })

})
