import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'
import { catalogPage, catalogService } from './templateCatalogSearch.testFixtures'

function fixture(task = true, organizationId: string | undefined = 'org') {
  const plan = maintainedPlanFixture(); plan.medications = []
  plan.tasks = task ? [{ kind: 'EXAMINATION', text: '目录检查项目', origin: 'EXPLICIT', status: 'NEEDS_REVIEW',
    sourceQuote: '必要时复查两次，暂缓增强检查', details: '先核对适应证' }] : []
  const service = catalogService()
  const searchServices = vi.fn().mockResolvedValue(catalogPage([service]))
  const update = vi.fn(async (_id, input) => ({ ...plan, ...input, revision: 4 }))
  const api = { masterData: { searchServices }, outpatientPlanTemplates: { update },
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, features: ['PLAN_COMPILATION'] }) } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), saved = vi.fn()
  const tree = (current = api, org = organizationId) => <QueryClientProvider client={client}><AiPlanTemplateDraftModal api={current}
    organizationId={org} editingTemplate={plan} onSaved={saved} onClose={vi.fn()} /></QueryClientProvider>
  const view = render(tree()), user = userEvent.setup()
  async function search() {
    await user.click(screen.getByRole('button', { name: task ? '对齐院内项目' : '添加检验/检查' }))
    if (!task) {
      await user.type(screen.getByPlaceholderText(/输入项目名称搜索院内/), '检查')
      await user.click(screen.getByRole('button', { name: '搜索' }))
    }
  }
  async function select() {
    await search()
    await user.click(await screen.findByRole('button', { name: '选用' }))
    return within(await screen.findByRole('dialog', { name: '确认项目数量与说明' }))
  }
  return { ...view, tree, api, plan, service, searchServices, update, saved, user, search, select }
}

describe('AI plan service confirmation', () => {
  it('requires explicit quantity and preserves restrictions before confirming a source task', async () => {
    const f = fixture(), dialog = await f.select()
    expect(f.searchServices).toHaveBeenCalledWith('目录检查项目', '', 'ACTIVE', 'org', 0, 10)
    expect(dialog.getByRole('spinbutton', { name: '项目数量' })).toHaveValue(null)
    expect(dialog.getByRole('region', { name: '原始项目建议' })).toHaveTextContent('必要时复查两次，暂缓增强检查')
    expect(dialog.getByRole('button', { name: '确认项目加入方案' })).toBeDisabled()
    await f.user.type(dialog.getByRole('spinbutton', { name: '项目数量' }), '2')
    await f.user.type(dialog.getByRole('textbox', { name: '检查检验说明' }), '核实后复查，暂缓增强')
    await f.user.click(dialog.getByRole('button', { name: '确认项目加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    expect(f.update.mock.calls[0][1].services).toEqual([expect.objectContaining({ catalogItemId: 'service', quantity: 2,
      unitCode: '次', serviceType: 'EXAMINATION', pricingRequired: true, clinicalDescription: '核实后复查，暂缓增强' })])
    expect(f.update.mock.calls[0][1].tasks).toEqual([{ ...f.plan.tasks[0], status: 'MATCHED' }])
    await waitFor(() => expect(f.saved).toHaveBeenCalledTimes(1))
  })
  it('cancel does not append a service or mark the task matched', async () => {
    const f = fixture(), dialog = await f.select()
    await f.user.click(dialog.getByRole('button', { name: '取消选择项目' }))
    expect(screen.queryByRole('button', { name: '调量' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('also requires a quantity for manual addition and reflects confirmed nonchargeable configuration', async () => {
    const f = fixture(false)
    f.service.organizationAdoption.chargeable = false
    const dialog = await f.select()
    expect(dialog.getByText(/作为不计价项目加入/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认项目加入方案' })).toBeDisabled()
    await f.user.type(dialog.getByRole('spinbutton', { name: '项目数量' }), '3')
    await f.user.click(dialog.getByRole('button', { name: '确认项目加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledTimes(1))
    expect(f.update.mock.calls[0][1].services[0]).toMatchObject({ quantity: 3, pricingRequired: false })
  })
  it('blocks saving after clearing or entering a nonpositive quantity', async () => {
    const f = fixture(false), dialog = await f.select()
    const input = dialog.getByRole('spinbutton', { name: '项目数量' })
    await f.user.type(input, '0')
    expect(dialog.getByRole('button', { name: '确认项目加入方案' })).toBeDisabled()
    await f.user.clear(input); await f.user.type(input, '2')
    await f.user.click(dialog.getByRole('button', { name: '确认项目加入方案' }))
    await f.user.click(screen.getByRole('button', { name: '调量' }))
    const quantity = screen.getByRole('spinbutton', { name: '项目数量' })
    await f.user.clear(quantity)
    expect(quantity).toHaveValue(null)
    expect(screen.getByRole('button', { name: '完成' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('invalidates a pending confirmation after organization changes even with the same API object', async () => {
    const f = fixture(), dialog = await f.select()
    await f.user.type(dialog.getByRole('spinbutton', { name: '项目数量' }), '2')
    f.rerender(f.tree(f.api, 'other'))
    expect(dialog.getByText(/当前机构、会话或方案已变化/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认项目加入方案' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('discards a late catalog result after the institution changes', async () => {
    const f = fixture()
    let resolve!: (value: unknown) => void
    f.searchServices.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await f.search()
    f.rerender(f.tree(f.api, 'other'))
    await act(async () => resolve(catalogPage([f.service])))
    expect(screen.queryByRole('button', { name: '选用' })).not.toBeInTheDocument()
    expect(f.update).not.toHaveBeenCalled()
  })
  it('does not silently duplicate a service', async () => {
    const f = fixture(false), dialog = await f.select()
    await f.user.type(dialog.getByRole('spinbutton', { name: '项目数量' }), '2')
    await f.user.click(dialog.getByRole('button', { name: '确认项目加入方案' }))
    await f.search()
    await f.user.click(await screen.findByRole('button', { name: '选用' }))
    expect(screen.getByText(/方案中已有该项目/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '确认项目数量与说明' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '调量' })).toHaveLength(1)
  })
})
