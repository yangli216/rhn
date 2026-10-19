import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    searchMedications: vi.fn().mockResolvedValue(catalogPage([])), medications: vi.fn().mockResolvedValue([catalogProduct().medication]), services: vi.fn().mockResolvedValue([catalogService()]), diseases: vi.fn().mockResolvedValue([catalogDisease()]), searchDiseases: vi.fn().mockResolvedValue(catalogPage([catalogDisease()])),
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
  // Medication and service search are the shared ClinicalResourceSearch used by the doctor workstation.
  it.each(['medication', 'service'] as const)('keeps %s query failures visible and supports a retry', async kind => {
    const f = fixture()
    const button = kind === 'medication' ? '添加目录药品' : '添加检验/检查'
    const placeholder = kind === 'medication' ? '输入通用名、编码或别名' : '输入项目名称、编码或项目类型'
    const method = kind === 'medication' ? f.masterData.medications : f.masterData.services
    method.mockRejectedValueOnce(new Error('目录连接失败'))
    await f.user.click(f.dialog.getByRole('button', { name: button }))
    await f.user.type(await screen.findByPlaceholderText(placeholder), '目标')
    expect(await screen.findByRole('alert')).toHaveTextContent('目录连接失败')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await f.user.click(screen.getByRole('button', { name: /重试|重新/ }))
    expect(await screen.findByRole('option')).toBeInTheDocument()
    expect(method).toHaveBeenCalledTimes(2)
    expect(f.update).not.toHaveBeenCalled()
  })
  it.each(['MEDICATION', 'LABORATORY'] as const)('does not mark a %s task matched when its directory fails', async kind => {
    const f = fixture({ kind, text: '待匹配任务', origin: 'EXPLICIT', status: 'UNMATCHED' })
    const method = kind === 'MEDICATION' ? f.masterData.medications : f.masterData.services
    method.mockRejectedValueOnce(new Error('查询失败'))
    const label = kind === 'MEDICATION' ? '对齐目录药品' : '对齐院内项目'
    await f.user.click(f.dialog.getByRole('button', { name: label }))
    await f.user.type(await screen.findByPlaceholderText(kind === 'MEDICATION' ? '输入通用名、编码或别名' : '输入项目名称、编码或项目类型'), '目标')
    expect(await screen.findByText(/查询失败/)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(f.dialog.getByRole('button', { name: '确认保存调整' })).toBeDisabled()
    expect(f.update).not.toHaveBeenCalled()
  })
  // Diagnosis search is the doctor workstation's shared ClinicalResourceSearch (api.masterData.diseases).
  it.each(['missing', 'TCM_SYNDROME'])('preserves the diagnosis domain and coding system: %s', async domain => {
    const f = fixture()
    f.masterData.diseases.mockResolvedValue([{ ...catalogDisease(), sdDiagnosisDomain: domain === 'missing' ? undefined : domain }])
    await f.user.click(f.dialog.getByRole('button', { name: '添加标准诊断' }))
    await f.user.type(await screen.findByPlaceholderText('输入诊断名称、编码或拼音码'), '中医病证')
    await f.user.click(await screen.findByRole('option', { name: /目录中医病证/ }))
    if (domain === 'missing') {
      expect(await screen.findByRole('alert')).toHaveTextContent('不能加入方案')
      expect(f.update).not.toHaveBeenCalled()
    } else {
      await f.user.click(f.dialog.getByRole('button', { name: '确认保存调整' }))
      await waitFor(() => expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ diagnoses: expect.arrayContaining([
        expect.objectContaining({ conceptId: 'diagnosis', codeSystem: 'GB_TCM', diagnosisDomain: 'TCM_SYNDROME', code: 'A01', type: 'SECONDARY' }),
      ]) })))
      expect(f.saved).toHaveBeenCalledTimes(1)
    }
  })
  it('aligns an unmatched diagnosis task through the same shared search and marks it matched', async () => {
    const f = fixture({ kind: 'DIAGNOSIS', text: '待匹配诊断', origin: 'EXPLICIT', status: 'UNMATCHED' })
    await f.user.click(f.dialog.getByRole('button', { name: '对齐标准诊断' }))
    await f.user.type(await screen.findByPlaceholderText('输入诊断名称、编码或拼音码'), '中医')
    await f.user.click(await screen.findByRole('option', { name: /目录中医病证/ }))
    expect(f.dialog.queryByRole('button', { name: '对齐标准诊断' })).not.toBeInTheDocument()
    await f.user.click(f.dialog.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ diagnoses: expect.arrayContaining([
      expect.objectContaining({ conceptId: 'diagnosis', diagnosisDomain: 'TCM_SYNDROME' }),
    ]) })))
  })
  it('uses sdServiceType from the current service directory instead of defaulting the type', async () => {
    const f = fixture()
    await f.user.click(f.dialog.getByRole('button', { name: '添加检验/检查' }))
    await f.user.type(await screen.findByPlaceholderText('输入项目名称、编码或项目类型'), '检查')
    await f.user.click(await screen.findByRole('option', { name: /目录检查项目/ }))
    const confirmation = within(screen.getByRole('dialog', { name: '确认项目数量与说明' }))
    await f.user.type(confirmation.getByRole('spinbutton', { name: '项目数量' }), '2')
    await f.user.click(confirmation.getByRole('button', { name: '确认项目加入方案' }))
    await f.user.click(f.dialog.getByRole('button', { name: '确认保存调整' }))
    await waitFor(() => expect(f.update).toHaveBeenCalledWith('plan', expect.objectContaining({ services: [
      expect.objectContaining({ catalogItemId: 'service', serviceType: 'EXAMINATION', unitCode: '次' }),
    ] })))
  })
})
