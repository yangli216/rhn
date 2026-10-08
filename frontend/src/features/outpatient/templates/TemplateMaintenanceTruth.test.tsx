import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { SaveOutpatientNoteTemplateInput, OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'
import { maintainedNoteReceipt, maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'

function fixture() {
  const plan = maintainedPlanFixture()
  const createNote = vi.fn(async (input: SaveOutpatientNoteTemplateInput) => maintainedNoteReceipt(input))
  const updatePlan = vi.fn(async (_id: string, input: object) => ({ ...plan, ...input, revision: 4 }))
  const list = vi.fn().mockResolvedValue([])
  const api = { outpatientNoteTemplates: { create: createNote, list }, outpatientPlanTemplates: { update: updatePlan },
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, features: ['PLAN_COMPILATION'] }) },
    masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue({ version: '1', doseUnits: [], routes: [], frequencies: [] }) },
  } as unknown as RhnApi
  const onSaved = vi.fn(), onClose = vi.fn(), user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { plan, api, createNote, updatePlan, list, onSaved, onClose, user, client }
}

describe('template maintenance acknowledgment and lifecycle', () => {
  it.each(['missing', 'wrong-body'])('keeps manual note input after a %s receipt', async failure => {
    const f = fixture()
    f.createNote.mockImplementationOnce(async input => failure === 'missing' ? undefined as never
      : { ...maintainedNoteReceipt(input), content: { chiefComplaint: '另一个正文' } })
    render(<ManualClinicalTemplateDialog {...f} kind="NOTE" />)
    await f.user.type(screen.getByPlaceholderText('输入便于识别的模板名称'), '新病历模板')
    await f.user.type(screen.getByPlaceholderText('输入可复用的主诉内容'), '原始主诉')
    await f.user.click(screen.getByRole('button', { name: '保存模板' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存未确认')
    expect(screen.getByPlaceholderText('输入可复用的主诉内容')).toHaveValue('原始主诉')
    expect(f.onSaved).not.toHaveBeenCalled()
    expect(f.onClose).not.toHaveBeenCalled()
  })

  it.each(['api', 'draft', 'unmount'])('does not acknowledge a late manual save after %s changes', async change => {
    const f = fixture()
    let resolve!: (note: OutpatientNoteTemplate) => void
    f.createNote.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const view = render(<ManualClinicalTemplateDialog {...f} kind="NOTE" />)
    await f.user.type(screen.getByPlaceholderText('输入便于识别的模板名称'), '模板')
    await f.user.type(screen.getByPlaceholderText('输入可复用的主诉内容'), '主诉')
    const submit = screen.getByRole('button', { name: '保存模板' })
    fireEvent.click(submit); fireEvent.click(submit)
    expect(f.createNote).toHaveBeenCalledTimes(1)
    const receipt = maintainedNoteReceipt(f.createNote.mock.calls[0][0])
    if (change === 'api') view.rerender(<ManualClinicalTemplateDialog {...f} api={{ ...f.api }} kind="NOTE" />)
    if (change === 'draft') fireEvent.change(screen.getByPlaceholderText('输入可复用的主诉内容'), { target: { value: '新主诉' } })
    if (change === 'unmount') view.unmount()
    await act(async () => { resolve(receipt) })
    expect(f.onSaved).not.toHaveBeenCalled()
    if (change !== 'unmount') expect(screen.getByRole('alert')).toHaveTextContent('远端可能已保存')
  })

  it('shows a linked-note directory error and requires verified reload before preserving a link', async () => {
    const f = fixture(); f.plan.medications = []; f.plan.noteTemplateId = 'note'
    f.list.mockRejectedValueOnce(new Error('目录服务不可用'))
    render(<ManualClinicalTemplateDialog {...f} kind="PLAN" editingPlan={f.plan} />)
    expect(await screen.findByText(/病历模板加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('不关联时，方案仅包含诊断与医嘱。')).not.toBeInTheDocument()
    await f.user.click(screen.getByRole('button', { name: '保存模板' }))
    expect(f.updatePlan).not.toHaveBeenCalled()
    f.list.mockResolvedValue([maintainedNoteReceipt({ name: '配套病历', scopeType: 'PERSONAL', specialtyCode: 'GENERAL_PRACTICE',
      sortOrder: 0, content: { chiefComplaint: '病历段落' } })])
    await f.user.click(screen.getByRole('button', { name: '重新加载病历模板' }))
    await screen.findByText('已关联')
    await f.user.click(screen.getByRole('button', { name: '保存模板' }))
    await waitFor(() => expect(f.onSaved).toHaveBeenCalledTimes(1))
    expect(f.updatePlan).toHaveBeenCalledWith('plan', expect.objectContaining({ noteTemplateId: 'note', expectedRevision: 3 }))
  })

  it.each([0, undefined])('does not save AI medication quantity %s as one', async quantity => {
    const f = fixture(); Object.assign(f.plan.medications[0], { quantity })
    render(<QueryClientProvider client={f.client}><AiPlanTemplateDraftModal {...f} editingTemplate={f.plan} /></QueryClientProvider>)
    await f.user.type(screen.getByRole('textbox', { name: '主诉' }), '本次模板段落')
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/数量|明细/)
    expect(f.createNote).not.toHaveBeenCalled()
    expect(f.updatePlan).not.toHaveBeenCalled()
    expect(f.onSaved).not.toHaveBeenCalled()
  })

  it.each(['wrong-receipt', 'late-api', 'unmount'])('does not acknowledge an AI plan save with %s', async failure => {
    const f = fixture()
    let resolve!: (value: typeof f.plan) => void
    f.updatePlan.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const tree = (api: RhnApi) => <QueryClientProvider client={f.client}><AiPlanTemplateDraftModal {...f} api={api} editingTemplate={f.plan} /></QueryClientProvider>
    const view = render(tree(f.api))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    expect(f.updatePlan).toHaveBeenCalledTimes(1)
    if (failure === 'late-api') view.rerender(tree({ ...f.api }))
    if (failure === 'unmount') view.unmount()
    await act(async () => { resolve({ ...f.plan, revision: 4, ...(failure === 'wrong-receipt' ? { medications: [] } : {}) }) })
    expect(f.onSaved).not.toHaveBeenCalled()
    if (failure !== 'unmount') expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('未确认'))).toBe(true)
  })
})
