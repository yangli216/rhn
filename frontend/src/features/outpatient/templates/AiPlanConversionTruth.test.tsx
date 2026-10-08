import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'

function fixture() {
  const reviewItems = [{ kind: 'MEDICATION' as const, text: '暂不使用测试药品', origin: 'EXPLICIT' as const }]
  const draft = { name: '核对方案', scopeType: 'PERSONAL' as const, narrative: '保留医嘱原始说明', reviewItems }
  const response: SaveOutpatientPlanTemplateInput = { name: draft.name, scopeType: draft.scopeType,
    diagnoses: [{ code: 'A01', display: '目录诊断', type: 'PRIMARY' }],
    medications: [{ medicationId: 'med', medicationName: '测试药品', quantity: 1, quantityUnit: '片', substitutionAllowed: false, selfProvided: false }],
    services: [], tasks: [] }
  const convertDraft = vi.fn().mockResolvedValue(response)
  const api = { clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, features: ['PLAN_COMPILATION'] }) },
    outpatientPlanTemplates: { compileDraftStream: vi.fn().mockResolvedValue(draft), convertDraft } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), saved = vi.fn()
  const tree = (current = api) => <QueryClientProvider client={client}><AiPlanTemplateDraftModal api={current} onClose={vi.fn()} onSaved={saved} /></QueryClientProvider>
  const view = render(tree()), user = userEvent.setup()
  async function compile() {
    await user.type(screen.getByPlaceholderText(/请输入您的问题或描述症状/), '核对方案')
    await user.click(await screen.findByRole('button', { name: '发送' }))
    return await screen.findByRole('button', { name: '确认方案并匹配院内目录' })
  }
  return { ...view, api, tree, user, compile, response, convertDraft, saved }
}

describe('AI plan conversion acknowledgment', () => {
  it('keeps a name substring unmatched and prevents saving', async () => {
    const f = fixture()
    await f.user.click(await f.compile())
    expect(await screen.findByText(/仍有 1 项诊断、药品或检验检查未能唯一匹配/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认存入方案池' })).toBeDisabled()
    expect(f.saved).not.toHaveBeenCalled()
  })
  it.each(['missing', 'wrong-scope', 'false-match'])('keeps the original text available after a %s conversion', async failure => {
    const f = fixture()
    f.convertDraft.mockResolvedValueOnce(failure === 'missing' ? undefined : failure === 'wrong-scope'
      ? { ...f.response, scopeType: 'HOSPITAL' } : { ...f.response, medications: [], tasks: [
        { kind: 'MEDICATION', text: '暂不使用测试药品', origin: 'EXPLICIT', status: 'MATCHED' },
      ] })
    await f.user.click(await f.compile())
    expect(await screen.findByRole('alert')).toHaveTextContent('目录转换结果未确认')
    expect(screen.getByRole('button', { name: '确认方案并匹配院内目录' })).toBeEnabled()
    expect(screen.getByText('暂不使用测试药品')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认存入方案池' })).not.toBeInTheDocument()
    await f.user.click(screen.getByRole('button', { name: '确认方案并匹配院内目录' }))
    expect(await screen.findByRole('button', { name: '确认存入方案池' })).toBeDisabled()
  })
  it.each(['api', 'scope', 'unmount'])('ignores a late conversion after %s changes', async change => {
    const f = fixture(); let resolve!: (value: SaveOutpatientPlanTemplateInput) => void
    f.convertDraft.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const button = await f.compile()
    fireEvent.click(button); fireEvent.click(button)
    expect(f.convertDraft).toHaveBeenCalledTimes(1)
    if (change === 'api') f.rerender(f.tree({ ...f.api }))
    if (change === 'scope') fireEvent.click(screen.getByRole('radio', { name: '科室' }))
    if (change === 'unmount') f.unmount()
    await act(async () => { resolve(f.response) })
    expect(screen.queryByRole('button', { name: '确认存入方案池' })).not.toBeInTheDocument()
    if (change !== 'unmount') expect(screen.getByRole('alert')).toHaveTextContent('本次目录转换结果未带入')
    expect(f.saved).not.toHaveBeenCalled()
  })
  it('invalidates a medication match after the medication is removed', async () => {
    const plan = maintainedPlanFixture()
    plan.tasks = [{ kind: 'MEDICATION', text: '测试药品', origin: 'EXPLICIT', status: 'MATCHED' }]
    const api = { clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, features: ['PLAN_COMPILATION'] }) } } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><AiPlanTemplateDraftModal api={api} editingTemplate={plan} onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>)
    await userEvent.click(screen.getByRole('button', { name: '移除药品 测试药品' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认保存调整' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '对齐目录药品' })).toBeInTheDocument()
  })
})
