import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { OutpatientPlanTask } from '../../../shared/api/outpatientPlanTemplatesApi'
import { AiPlanTemplateDraftModal } from './AiPlanTemplateDraftModal'
import { maintainedPlanFixture } from './maintainedTemplateSave.testFixtures'
import { catalogDisease, catalogPage, catalogProduct, catalogService } from './templateCatalogSearch.testFixtures'

function fixture(task?: OutpatientPlanTask) {
  const plan = maintainedPlanFixture(); plan.medications = []; plan.tasks = task ? [task] : []
  const masterData = { searchMedicationProducts: vi.fn().mockResolvedValue(catalogPage([catalogProduct()])),
    searchMedications: vi.fn().mockResolvedValue(catalogPage([])), searchDiseases: vi.fn().mockResolvedValue(catalogPage([catalogDisease()])),
    searchServices: vi.fn().mockResolvedValue(catalogPage([catalogService()])) }
  const update = vi.fn(async (_id, input) => ({ ...plan, ...input, revision: 4 }))
  const api = { masterData, outpatientPlanTemplates: { update },
    clinicalAi: { capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, features: ['PLAN_COMPILATION'] }) },
  } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const saved = vi.fn()
  const tree = (current = api) => <QueryClientProvider client={client}><AiPlanTemplateDraftModal organizationId="org" api={current} editingTemplate={plan} onClose={vi.fn()} onSaved={saved} /></QueryClientProvider>
  const view = render(tree())
  const dialog = within(screen.getByRole('dialog'))
  return { ...view, api, tree, plan, masterData, update, saved, dialog, user: userEvent.setup() }
}

describe('AI plan catalog search workflow', () => {
  it.each(['diagnosis', 'medication', 'service'] as const)('keeps %s query failures visible and supports a verified retry', async kind => {
    const f = fixture()
    const button = kind === 'diagnosis' ? '添加标准诊断' : kind === 'medication' ? '添加目录药品' : '添加检验/检查'
    const placeholder = kind === 'diagnosis' ? /输入疾病名称/ : kind === 'medication' ? /输入药品名称搜索目录/ : /输入项目名称搜索院内/
    const method = kind === 'diagnosis' ? f.masterData.searchDiseases : kind === 'medication' ? f.masterData.searchMedicationProducts : f.masterData.searchServices
    method.mockRejectedValueOnce(new Error('目录连接失败'))
    await f.user.click(f.dialog.getByRole('button', { name: button }))
    await f.user.type(f.dialog.getByPlaceholderText(placeholder), '目标')
    await f.user.click(f.dialog.getByRole('button', { name: '搜索' }))
    expect(await f.dialog.findByRole('alert')).toHaveTextContent('目录检索失败')
    expect(f.dialog.queryByText('本次查询未找到匹配目录项。')).not.toBeInTheDocument()
    expect(f.dialog.getByPlaceholderText(placeholder)).toHaveValue('目标')
    await f.user.click(f.dialog.getByRole('button', { name: '重新检索' }))
    expect(await f.dialog.findByRole('button', { name: '选用' })).toBeInTheDocument()
    expect(method).toHaveBeenCalledTimes(2)
    expect(f.update).not.toHaveBeenCalled()
  })
  it.each(['DIAGNOSIS', 'MEDICATION', 'LABORATORY'] as const)('does not mark a %s task matched when its directory fails', async kind => {
    const f = fixture({ kind, text: '待匹配任务', origin: 'EXPLICIT', status: 'UNMATCHED' })
    const method = kind === 'DIAGNOSIS' ? f.masterData.searchDiseases : kind === 'MEDICATION' ? f.masterData.searchMedicationProducts : f.masterData.searchServices
    method.mockRejectedValueOnce(new Error('查询失败'))
    const label = kind === 'DIAGNOSIS' ? '对齐标准诊断' : kind === 'MEDICATION' ? '对齐目录药品' : '对齐院内项目'
    await f.user.click(f.dialog.getByRole('button', { name: label }))
    expect(await f.dialog.findByRole('alert')).toHaveTextContent('目录检索失败')
    expect(f.dialog.queryByRole('button', { name: '选用' })).not.toBeInTheDocument()
    expect(f.dialog.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  it.each(['missing', 'TCM_SYNDROME'])('preserves the diagnosis domain and coding system: %s', async domain => {
    const f = fixture()
    f.masterData.searchDiseases.mockResolvedValue(catalogPage([{ ...catalogDisease(), sdDiagnosisDomain: domain === 'missing' ? undefined : domain }]))
    await f.user.click(f.dialog.getByRole('button', { name: '添加标准诊断' }))
    await f.user.type(f.dialog.getByPlaceholderText(/输入疾病名称/), '中医病证')
    await f.user.click(f.dialog.getByRole('button', { name: '搜索' }))
    if (domain === 'missing') {
      expect(await f.dialog.findByRole('alert')).toHaveTextContent('目录缺少')
      expect(f.dialog.queryByRole('button', { name: '选用' })).not.toBeInTheDocument()
      expect(f.update).not.toHaveBeenCalled()
    } else {
      await f.user.click(await f.dialog.findByRole('button', { name: '选用' }))
      await f.user.click(f.dialog.getByRole('button', { name: '确认保存调整' }))
      await waitFor(() => expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ diagnoses: expect.arrayContaining([
        expect.objectContaining({ conceptId: 'diagnosis', codeSystem: 'GB_TCM', diagnosisDomain: 'TCM_SYNDROME', code: 'A01', type: 'SECONDARY' }),
      ]) })))
      expect(f.saved).toHaveBeenCalledTimes(1)
    }
  })
  it('uses sdServiceType from the current service directory instead of defaulting the type', async () => {
    const f = fixture()
    await f.user.click(f.dialog.getByRole('button', { name: '添加检验/检查' }))
    await f.user.type(f.dialog.getByPlaceholderText(/输入项目名称/), '检查')
    await f.user.click(f.dialog.getByRole('button', { name: '搜索' }))
    await f.user.click(await f.dialog.findByRole('button', { name: '选用' }))
    const confirmation = within(screen.getByRole('dialog', { name: '确认项目数量与说明' }))
    await f.user.type(confirmation.getByRole('spinbutton', { name: '项目数量' }), '2')
    await f.user.click(confirmation.getByRole('button', { name: '确认项目加入方案' }))
    await f.user.click(f.dialog.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ services: [
      expect.objectContaining({ catalogItemId: 'service', serviceType: 'EXAMINATION', unitCode: '次' }),
    ] })))
  })
  it.each(['query', 'api', 'cancel', 'unmount'])('does not offer a late candidate after %s changes', async change => {
    const f = fixture()
    let resolve!: (value: unknown) => void
    f.masterData.searchDiseases.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await f.user.click(f.dialog.getByRole('button', { name: '添加标准诊断' }))
    const input = f.dialog.getByPlaceholderText(/输入疾病名称/)
    await f.user.type(input, '旧查询')
    await f.user.click(f.dialog.getByRole('button', { name: '搜索' }))
    expect(f.dialog.getByText('正在检索目录…')).toBeInTheDocument()
    if (change === 'query') await f.user.type(input, '新词')
    if (change === 'api') f.rerender(f.tree({ ...f.api }))
    if (change === 'cancel') await f.user.click(within(input.closest<HTMLElement>('.ai-plan-inline-search')!).getByRole('button', { name: '取消' }))
    if (change === 'unmount') f.unmount()
    await act(async () => { resolve(catalogPage([catalogDisease()])) })
    expect(screen.queryByRole('button', { name: '选用' })).not.toBeInTheDocument()
    expect(f.update).not.toHaveBeenCalled()
  })
})
