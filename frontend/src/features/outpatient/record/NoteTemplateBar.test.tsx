import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import { NoteTemplateBar } from './NoteTemplateBar'

afterEach(() => vi.restoreAllMocks())

function template(): OutpatientNoteTemplate {
  return { id: 'note-1', revision: 1, name: '复诊模板', scopeType: 'PERSONAL', status: 'ACTIVE',
    specialtyCode: 'GENERAL_PRACTICE', documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
    content: { chiefComplaint: '模板主诉', presentIllness: '模板现病史' }, sortOrder: 0, useCount: 0,
    createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
}
function created(input: SaveOutpatientNoteTemplateInput): OutpatientNoteTemplate {
  return { ...template(), ...input, specialtyCode: input.specialtyCode!, sortOrder: input.sortOrder!, id: 'created' }
}
function setup() {
  let content: OutpatientNoteTemplateContent = { chiefComplaint: '本次主诉' }
  const create = vi.fn(async (input: SaveOutpatientNoteTemplateInput) => created(input))
  const api = { outpatientNoteTemplates: { list: vi.fn(), create, use: vi.fn(), update: vi.fn(), disable: vi.fn() } }
  const onOpenLibrary = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const props: ComponentProps<typeof NoteTemplateBar> = { api, disabled: false, contextKey: 'encounter-one', currentContent: () => content, onOpenLibrary }
  const tree = () => <QueryClientProvider client={queryClient}><NoteTemplateBar {...props} /></QueryClientProvider>
  const view = render(tree())
  return { ...view, props, api, create, onOpenLibrary, queryClient, user: userEvent.setup(),
    change: (next: Partial<typeof props>) => { Object.assign(props, next); view.rerender(tree()) },
    setContent: (value: OutpatientNoteTemplateContent) => { content = value }, read: () => content }
}
async function openSave(f: ReturnType<typeof setup>) {
  await f.user.click(screen.getByRole('button', { name: '存为模板' }))
  const dialog = within(screen.getByRole('dialog', { name: '保存病历模板' }))
  await f.user.type(dialog.getByRole('textbox', { name: /模板名称/ }), '复诊模板')
  return dialog
}
describe('note template bar: save and library entry', () => {
  it('saves only explicit reusable content and reports a verified save once', async () => {
    const f = setup()
    f.setContent({ chiefComplaint: '  咳嗽3天  ', allergyHistory: '医生明确补充', medicationHistory: '明确用药史',
      auxiliaryExaminations: '既有检查内容', treatmentPlan: '不应保存的自由医嘱',
      annotations: [{ field: 'chiefComplaint', text: '3天', start: 4, source: 'DOCTOR', kind: 'FACT', confirmed: true }] })
    const dialog = await openSave(f)
    expect(dialog.getByText('过敏史补充')).toBeInTheDocument()
    await f.user.click(dialog.getByRole('button', { name: '确认保存' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已保存病历模板“复诊模板”（我的）')
    expect(f.create).toHaveBeenCalledExactlyOnceWith({ scopeType: 'PERSONAL', name: '复诊模板', description: undefined,
      specialtyCode: 'GENERAL_PRACTICE', sortOrder: 0, content: { chiefComplaint: '咳嗽3天', allergyHistory: '医生明确补充',
        medicationHistory: '明确用药史', auxiliaryExaminations: '既有检查内容',
        annotations: [{ field: 'chiefComplaint', text: '3天', start: 2, source: 'DOCTOR', kind: 'FACT', confirmed: false }] } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['missing', 'wrong-body', 'wrong-scope', 'rejected'])('retains the save form without success for %s receipts', async failure => {
    const f = setup()
    if (failure === 'rejected') f.create.mockRejectedValueOnce(new Error('保存请求失败'))
    else f.create.mockImplementationOnce(async input => failure === 'missing' ? undefined as unknown as OutpatientNoteTemplate
      : { ...created(input), ...(failure === 'wrong-scope' ? { scopeType: 'DEPARTMENT' as const } : { content: { chiefComplaint: '被替换' } }) })
    const dialog = await openSave(f)
    await f.user.click(dialog.getByRole('button', { name: '确认保存' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/保存/)
    expect(dialog.getByRole('textbox', { name: /模板名称/ })).toHaveValue('复诊模板')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(f.create).toHaveBeenCalledTimes(1)
  })

  it('rejects empty reusable content without creating a template', async () => {
    const f = setup(); f.setContent({ treatmentPlan: '仅文字医嘱' })
    const dialog = await openSave(f)
    await f.user.click(dialog.getByRole('button', { name: '确认保存' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('未保存')
    expect(f.create).not.toHaveBeenCalled()
  })

  it.each(['context', 'blocked', 'draft', 'api', 'unmount'])('does not acknowledge a late save after %s changes', async change => {
    const f = setup()
    let resolve!: (value: OutpatientNoteTemplate) => void
    f.create.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const dialog = await openSave(f)
    const submit = dialog.getByRole('button', { name: '确认保存' })
    fireEvent.click(submit); fireEvent.click(submit)
    expect(f.create).toHaveBeenCalledTimes(1)
    const saved = created(f.create.mock.calls[0][0])
    if (change === 'unmount') f.unmount()
    if (change === 'context') f.change({ contextKey: 'encounter-two' })
    if (change === 'blocked') f.change({ disabled: true })
    if (change === 'draft') f.setContent({ chiefComplaint: '新草稿' })
    if (change === 'api') f.change({ api: { ...f.api } })
    await act(async () => { resolve(saved) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    if (change !== 'unmount') {
      expect(dialog.getByRole('alert')).toHaveTextContent('远端保存可能已完成')
      expect(dialog.getByRole('textbox', { name: /模板名称/ })).toHaveValue('复诊模板')
    }
  })

  it('opens the unified template library for record writing instead of its own picker', async () => {
    const f = setup()
    await f.user.click(screen.getByRole('button', { name: '套用模板' }))
    expect(f.onOpenLibrary).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(f.api.outpatientNoteTemplates.list).not.toHaveBeenCalled()
  })

  it('hides the apply entry when no library is available and disables it with the bar', async () => {
    const f = setup()
    f.change({ disabled: true })
    expect(screen.getByRole('button', { name: '套用模板' })).toBeDisabled()
    f.change({ onOpenLibrary: undefined })
    expect(screen.queryByRole('button', { name: '套用模板' })).not.toBeInTheDocument()
  })

  it.each(['valid', 'empty-receipt'])('verifies the save receipt through the production API transport: %s', async outcome => {
    const f = setup()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
      expect(String(path)).toBe('/api/outpatient/note-templates')
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('X-Organization-Id')).toBe('org')
      expect(headers.get('X-Department-Id')).toBe('dept')
      const input = JSON.parse(String(init?.body)) as SaveOutpatientNoteTemplateInput
      expect(input.content).toEqual({ chiefComplaint: '本次主诉', annotations: [] })
      return outcome === 'valid' ? new Response(JSON.stringify(created(input))) : new Response(null, { status: 204 })
    })
    f.change({ api: createRhnSessionApi('tenant').withWorkContext({ organizationId: 'org', departmentId: 'dept' }) })
    const dialog = await openSave(f)
    await f.user.click(dialog.getByRole('button', { name: '确认保存' }))
    if (outcome === 'valid') expect(await screen.findByRole('status')).toHaveTextContent('已保存')
    else { expect(await dialog.findByRole('alert')).toHaveTextContent('保存未确认'); expect(screen.queryByRole('status')).not.toBeInTheDocument() }
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
