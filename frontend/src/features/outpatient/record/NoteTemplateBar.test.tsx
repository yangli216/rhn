import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import { mergeNoteTemplateContent, NoteTemplateBar } from './NoteTemplateBar'

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
function setup(showApply = false) {
  let content: OutpatientNoteTemplateContent = { chiefComplaint: '本次主诉' }
  const list = vi.fn().mockResolvedValue([template()])
  const create = vi.fn(async (input: SaveOutpatientNoteTemplateInput) => created(input))
  const use = vi.fn().mockResolvedValue({ ...template(), revision: 2, useCount: 1 })
  const api = { outpatientNoteTemplates: { list, create, use, update: vi.fn(), disable: vi.fn() } }
  const onApply = vi.fn((value: OutpatientNoteTemplate, fields: Parameters<typeof mergeNoteTemplateContent>[2], overwrite: boolean) => {
    const next = mergeNoteTemplateContent(content, value.content, fields, overwrite)
    const changed = [...fields].filter(key => next[key] !== content[key]).length
    content = next
    return changed
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const props: ComponentProps<typeof NoteTemplateBar> = { api, disabled: false, contextKey: 'encounter-one', currentContent: () => content, onApply, showApply }
  const tree = () => <QueryClientProvider client={queryClient}><NoteTemplateBar {...props} /></QueryClientProvider>
  const view = render(tree())
  return { ...view, props, api, list, create, use, onApply, queryClient, user: userEvent.setup(),
    change: (next: Partial<typeof props>) => { Object.assign(props, next); view.rerender(tree()) },
    setContent: (value: OutpatientNoteTemplateContent) => { content = value }, read: () => content }
}
async function openSave(f: ReturnType<typeof setup>) {
  await f.user.click(screen.getByRole('button', { name: '存为病历模板' }))
  const dialog = within(screen.getByRole('dialog', { name: '保存病历模板' }))
  await f.user.type(dialog.getByRole('textbox', { name: /模板名称/ }), '复诊模板')
  return dialog
}
async function openApply(f: ReturnType<typeof setup>) {
  await waitFor(() => expect(f.list).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByText('正在加载模板…')).not.toBeInTheDocument())
  await f.user.click(screen.getByRole('button', { name: '调入病历模板' }))
  return within(screen.getByRole('dialog', { name: '调入病历模板' }))
}

describe('note template save and application truth', () => {
  it('saves only explicit reusable content and reports a verified save once', async () => {
    const f = setup()
    f.setContent({ chiefComplaint: '  咳嗽3天  ', allergyHistory: '医生明确补充', medicationHistory: '明确用药史',
      auxiliaryExaminations: '既有检查内容', treatmentPlan: '不应保存的自由医嘱',
      annotations: [{ field: 'chiefComplaint', text: '3天', start: 4, source: 'DOCTOR', kind: 'FACT', confirmed: true }] })
    const dialog = await openSave(f)
    expect(dialog.getByText('过敏史补充')).toBeInTheDocument()
    await f.user.click(dialog.getByRole('button', { name: '确认保存' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已保存个人病历模板“复诊模板”')
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

  it('reports actual changed paragraphs rather than all checked paragraphs', async () => {
    const f = setup(true), dialog = await openApply(f)
    await f.user.click(dialog.getByRole('button', { name: '确认调入' }))
    expect(await screen.findByRole('status')).toHaveTextContent('的 1 个病历段落')
    expect(f.read()).toMatchObject({ chiefComplaint: '本次主诉', presentIllness: '模板现病史' })
    expect(f.onApply).toHaveBeenCalledTimes(1)
  })

  it('keeps a zero-change explanation inside the open dialog', async () => {
    const f = setup(true); f.setContent({ chiefComplaint: '已有主诉', presentIllness: '已有现病史' })
    const dialog = await openApply(f)
    await f.user.click(dialog.getByRole('button', { name: '确认调入' }))
    expect(await dialog.findByRole('status')).toHaveTextContent('未改变当前病历')
    expect(f.read()).toMatchObject({ chiefComplaint: '已有主诉', presentIllness: '已有现病史' })
    expect(screen.queryByText(/已调入/)).not.toBeInTheDocument()
  })

  it.each(['identity', 'content', 'inactive', 'missing'])('does not apply an invalid %s use receipt', async failure => {
    const f = setup(true), value = template()
    if (failure === 'identity') value.id = 'other'
    if (failure === 'content') value.content = { chiefComplaint: '未查看过的正文' }
    if (failure === 'inactive') value.status = 'INACTIVE'
    f.use.mockResolvedValueOnce(failure === 'missing' ? undefined : value)
    const dialog = await openApply(f)
    await f.user.click(dialog.getByRole('button', { name: '确认调入' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('未带入')
    expect(f.onApply).not.toHaveBeenCalled()
    expect(f.read()).toEqual({ chiefComplaint: '本次主诉' })
    expect(dialog.getByRole('checkbox', { name: /主诉/ })).toBeChecked()
  })

  it.each(['context', 'draft', 'unmount'])('ignores a late use response after %s changes', async change => {
    const f = setup(true)
    let resolve!: (value: OutpatientNoteTemplate) => void
    f.use.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const dialog = await openApply(f)
    await f.user.click(dialog.getByRole('button', { name: '确认调入' }))
    if (change === 'context') f.change({ contextKey: 'another-encounter' })
    if (change === 'draft') f.setContent({ chiefComplaint: '新的主诉' })
    if (change === 'unmount') f.unmount()
    await act(async () => { resolve(template()) })
    expect(f.onApply).not.toHaveBeenCalled()
    expect(screen.queryByText(/已调入/)).not.toBeInTheDocument()
  })

  it('does not replace a removed selection with the first remaining template', async () => {
    const f = setup(true), dialog = await openApply(f)
    f.list.mockResolvedValue([{ ...template(), id: 'replacement', name: '其他模板' }])
    await act(async () => { await f.queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] }) })
    expect(await dialog.findByRole('alert')).toHaveTextContent('所选模板已不可用')
    expect(dialog.getByRole('button', { name: '确认调入' })).toBeDisabled()
    expect(f.use).not.toHaveBeenCalled()
  })

  it('distinguishes a missing directory from a verified empty list and supports reload', async () => {
    const f = setup()
    f.list.mockResolvedValueOnce(undefined)
    f.change({ showApply: true })
    const dialog = await openApply(f)
    expect(await dialog.findByRole('alert')).toHaveTextContent('模板加载失败')
    expect(dialog.queryByText(/暂无可用病历模板/)).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认调入' })).toBeDisabled()
    f.list.mockResolvedValue([])
    await f.user.click(dialog.getByRole('button', { name: '重新加载模板' }))
    expect(await dialog.findByText(/暂无可用病历模板/)).toBeInTheDocument()
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
