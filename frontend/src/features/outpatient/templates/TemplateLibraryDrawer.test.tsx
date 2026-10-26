import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { groupFixture } from '../orders/orderSetImport.testFixtures'
import { mergeNoteTemplateContent, type NoteTemplateField } from '../record/NoteTemplateBar'
import { TemplateLibraryDrawer } from './TemplateLibraryDrawer'
import { templateCatalogFixture } from './resolveTemplateOrders.testFixtures'
import type { OrderSetPreselect, TemplatePurpose } from './templateLibrary'

function noteTemplate(patch: Partial<OutpatientNoteTemplate> = {}): OutpatientNoteTemplate {
  return { id: 'note-1', revision: 1, name: '复诊病历', scopeType: 'PERSONAL', status: 'ACTIVE', specialtyCode: 'GENERAL_PRACTICE',
    documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
    content: { chiefComplaint: '模板主诉', presentIllness: '模板现病史' }, sortOrder: 0, useCount: 0,
    createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', ...patch }
}

interface Options {
  purpose?: TemplatePurpose
  plans?: (f: ReturnType<typeof templateCatalogFixture>) => OutpatientPlanTemplate[]
  /** 临床模板库里的新医嘱组套（kind=ORDER_SET）。 */
  orderSets?: (f: ReturnType<typeof templateCatalogFixture>) => OutpatientPlanTemplate[]
  initialOrderSet?: OrderSetPreselect
  notes?: OutpatientNoteTemplate[]
  groups?: ItemGroup[]
  diagnoses?: DiagnosisInput[]
  medicationDrafts?: MedicationPlanDraft[]
  serviceDrafts?: ServicePlanDraft[]
  initialPlanId?: string
  groupError?: string
}

/** 抽屉由工作站托管草稿状态；这里用一个最小宿主暴露可观察、可修改的草稿。 */
function setup(options: Options = {}) {
  const f = templateCatalogFixture()
  const plans = options.plans?.(f) ?? [], notes = options.notes ?? [], groups = options.groups ?? [], orderSets = options.orderSets?.(f) ?? []
  const itemGroups = options.groupError ? vi.fn().mockRejectedValue(new Error(options.groupError)) : vi.fn().mockResolvedValue(groups)
  const planUse = vi.fn(async (id: string) => [...plans, ...orderSets].find(item => item.id === id))
  const noteUse = vi.fn(async (id: string) => notes.find(item => item.id === id))
  const api = { ...f.api,
    masterData: { ...f.api.masterData, itemGroups },
    outpatientPlanTemplates: { list: vi.fn(async (_keyword?: string, kind?: string) => kind === 'ORDER_SET' ? orderSets : plans), use: planUse, create: vi.fn(),
      minedSuggestions: vi.fn().mockResolvedValue([]), getHistoricalStablePlan: vi.fn().mockResolvedValue(null), compareHistoricalPlan: vi.fn() },
    outpatientNoteTemplates: { list: vi.fn().mockResolvedValue(notes), use: noteUse },
  } as unknown as RhnApi
  // 病历草稿：主诉已有内容，用来验证“仅填空”规则。
  const record = { current: { chiefComplaint: '已有主诉' } as Record<string, string | undefined> }
  const onApplyNoteTemplate = vi.fn((note: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => {
    const merged = mergeNoteTemplateContent(record.current, note.content, fields, overwrite)
    const changed = [...fields].filter(key => merged[key] !== record.current[key]).length
    record.current = merged as Record<string, string | undefined>
    return changed
  })
  const onClose = vi.fn(), onNotice = vi.fn()
  const state: { diagnoses: DiagnosisInput[]; medications: MedicationPlanDraft[]; services: ServicePlanDraft[]
    setServices?: (value: ServicePlanDraft[]) => void } = {
    diagnoses: options.diagnoses ?? [], medications: options.medicationDrafts ?? [], services: options.serviceDrafts ?? [] }
  function Host() {
    const [diagnoses, setDiagnoses] = useState(state.diagnoses)
    const [medications, setMedications] = useState(state.medications)
    const [services, setServices] = useState(state.services)
    state.diagnoses = diagnoses; state.medications = medications; state.services = services
    state.setServices = setServices
    return <TemplateLibraryDrawer purpose={options.purpose} initialPlanId={options.initialPlanId} initialOrderSet={options.initialOrderSet} encounter={f.target} busy={false}
      allergyContext="[]" allergies={[]} allergyReady readRecordDraft={() => JSON.stringify(record.current)}
      diagnoses={diagnoses} setDiagnoses={setDiagnoses} medicationDrafts={medications} setMedicationDrafts={setMedications}
      serviceDrafts={services} setServiceDrafts={setServices} api={api} onApplyNoteTemplate={onApplyNoteTemplate}
      onClose={onClose} onNotice={onNotice} />
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={queryClient}><Host /></QueryClientProvider>)
  return { f, api, state, record, view, user: userEvent.setup(), itemGroups, planUse, noteUse, onApplyNoteTemplate, onClose, onNotice }
}

const selectedTab = () => screen.getAllByRole('tab', { selected: true }).map(tab => tab.textContent)
const cards = () => [...document.querySelectorAll('.doctor-plan-item-card__title')].map(node => node.textContent)
/** 卡片名同时出现在列表和详情标题里，等列表出现再断言。 */
const listed = (...names: string[]) => waitFor(() => names.forEach(name => expect(cards()).toContain(name)))

function ordersPlan(f: ReturnType<typeof templateCatalogFixture>, patch: Partial<OutpatientPlanTemplate> = {}): OutpatientPlanTemplate {
  return { ...f.plan, id: 'orders-plan', name: '医嘱方案', ...patch }
}
function notePlan(patch: Partial<OutpatientPlanTemplate> = {}): OutpatientPlanTemplate {
  return { id: 'note-plan', revision: 1, scopeType: 'PERSONAL', name: '含病历方案', status: 'ACTIVE', sortOrder: 0, useCount: 0, createdAt: '', updatedAt: '',
    tasks: [], noteTemplateId: 'note-1', medications: [], services: [],
    diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }], ...patch }
}
const group = (): ItemGroup => groupFixture()

describe('default filters by purpose', () => {
  const library = (purpose: TemplatePurpose) => setup({ purpose, notes: [noteTemplate()], groups: [group()],
    plans: f => [ordersPlan(f, { diagnoses: [] }), notePlan()] })

  it('RECORD lists note templates and plans that carry a note, hiding order sets and order-only plans', async () => {
    library('RECORD')
    await listed('复诊病历', '含病历方案')
    expect(cards()).toEqual(['复诊病历', '含病历方案'])
    expect(selectedTab()).toEqual(['全部(2)'])
    expect(screen.getByText(/当前用途：病历书写/)).toBeInTheDocument()
    // 默认选中病历模板，按段落勾选
    expect(screen.getByRole('button', { name: '带入病历草稿 (2)' })).toBeEnabled()
  })

  it('ORDERS lists order sets and plans that carry orders, hiding notes and note-only plans', async () => {
    library('ORDERS')
    await listed('检查组套', '医嘱方案')
    expect(cards()).toEqual(['检查组套', '医嘱方案'])
    expect(screen.getByRole('button', { name: '带入医嘱草稿 (2)' })).toBeEnabled()
  })

  it('DIAGNOSIS opens on plans; every kind stays reachable and the purpose filter can be lifted', async () => {
    const f = library('DIAGNOSIS')
    await listed('医嘱方案', '含病历方案')
    expect(selectedTab()).toContain('诊疗方案(2)')
    expect(cards()).toEqual(['医嘱方案', '含病历方案'])
    await f.user.click(screen.getByRole('tab', { name: /医嘱组套/ }))
    expect(cards()).toEqual(['检查组套'])
    await f.user.click(screen.getByRole('tab', { name: /^全部\(/ }))
    expect(cards()).toEqual(['医嘱方案', '含病历方案', '检查组套', '复诊病历'])
  })

  it('"显示全部" lifts the purpose filter on the all-view', async () => {
    const f = library('RECORD')
    await listed('复诊病历')
    await f.user.click(screen.getByRole('button', { name: '显示全部' }))
    expect(cards()).toHaveLength(4)
    expect(screen.queryByText(/当前用途/)).not.toBeInTheDocument()
  })

  it('keeps the AI recommended plan selected when opening for diagnosis', async () => {
    setup({ purpose: 'DIAGNOSIS', initialPlanId: 'note-plan', notes: [noteTemplate()], plans: f => [ordersPlan(f), notePlan()] })
    expect(await screen.findByText('配套病历模板')).toBeInTheDocument()
  })

  it('does not block plans and notes when the order-set directory fails', async () => {
    const f = setup({ purpose: 'DIAGNOSIS', plans: fx => [ordersPlan(fx)], groupError: '无权读取组套' })
    await f.user.click(screen.getByRole('tab', { name: /^全部\(/ }))
    await waitFor(() => expect(screen.getByText(/医嘱组套加载失败：无权读取组套/)).toBeInTheDocument())
    expect(screen.getAllByText('医嘱方案').length).toBeGreaterThan(0)
  })
})

describe('preview zones and default checks', () => {
  it('marks diagnoses already present and leaves them unchecked', async () => {
    const f = setup({ purpose: 'DIAGNOSIS', diagnoses: [{ code: 'i10', display: '原发性高血压', type: 'PRIMARY' }],
      plans: () => [notePlan({ diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }, { code: 'E11', display: '2型糖尿病', type: 'SECONDARY' }], noteTemplateId: undefined })] })
    await screen.findByRole('checkbox', { name: '选择诊断 2型糖尿病' })
    expect(screen.getByRole('checkbox', { name: '选择诊断 原发性高血压' })).not.toBeChecked()
    expect(screen.getByText('已有')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择诊断 2型糖尿病' })).toBeChecked()
    await f.user.click(screen.getByRole('button', { name: '带入当前草稿 (1)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.state.diagnoses.map(item => item.code)).toEqual(['i10', 'E11'])
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringContaining('带入 1 项（诊断 1）'))
  })

  it('ORDERS purpose checks orders only; the diagnosis and record zones stay available but unchecked', async () => {
    const f = setup({ purpose: 'ORDERS', notes: [noteTemplate()], plans: fx => [ordersPlan(fx, { noteTemplateId: 'note-1',
      diagnoses: [{ code: 'J06', display: '上呼吸道感染', type: 'PRIMARY' }] })] })
    await f.user.click(await screen.findByText('医嘱方案'))
    expect(screen.getByRole('checkbox', { name: '选择诊断 上呼吸道感染' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /选择药品/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /选择项目/ })).toBeChecked()
    expect(screen.getByRole('button', { name: '带入当前草稿 (2)' })).toBeEnabled()
    // 病历区可手工勾选
    await f.user.click(screen.getByRole('checkbox', { name: /主诉/ }))
    expect(screen.getByRole('button', { name: '带入当前草稿 (3)' })).toBeEnabled()
  })

  it('RECORD purpose brings a plan\'s note paragraphs and keeps filled paragraphs unless overwrite is chosen', async () => {
    const f = setup({ purpose: 'RECORD', notes: [noteTemplate()], plans: () => [notePlan()] })
    await f.user.click(await screen.findByText('含病历方案'))
    expect(screen.getByRole('checkbox', { name: '选择诊断 原发性高血压' })).not.toBeChecked()
    await f.user.click(screen.getByRole('button', { name: '带入当前草稿 (2)' }))
    await waitFor(() => expect(f.onApplyNoteTemplate).toHaveBeenCalledTimes(1))
    expect(f.planUse).toHaveBeenCalledWith('note-plan')
    expect(f.noteUse).toHaveBeenCalledWith('note-1')
    expect(f.record.current).toEqual(expect.objectContaining({ chiefComplaint: '已有主诉', presentIllness: '模板现病史' }))
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringMatching(/病历段落 1.*跳过 1 项（主诉：已有内容，未覆盖）/))
    expect(f.state.diagnoses).toEqual([])
  })

  it('RECORD overwrite replaces the existing paragraph', async () => {
    const f = setup({ purpose: 'RECORD', notes: [noteTemplate()] })
    await screen.findByRole('button', { name: '带入病历草稿 (2)' })
    await f.user.click(screen.getByRole('checkbox', { name: /覆盖所选段落已有内容/ }))
    await f.user.click(screen.getByRole('button', { name: '带入病历草稿 (2)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.record.current.chiefComplaint).toBe('模板主诉')
  })
})

describe('order rows: duplicates, whole-group selection, validation failures', () => {
  const draftService = (catalogItemId: string): ServicePlanDraft => ({ id: `draft-${catalogItemId}`, catalogItemId, itemCode: catalogItemId, itemName: '已有项目', quantity: 1 })

  it('marks rows that duplicate the current drafts and leaves them unchecked', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()], serviceDrafts: [draftService('s1')] })
    await screen.findByRole('checkbox', { name: '选择项目 旧项目名称' })
    expect(screen.getByRole('checkbox', { name: '选择项目 旧项目名称' })).not.toBeChecked()
    expect(screen.getByText('重复')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '选择项目 检查项目' })).toBeChecked()
    expect(screen.getByRole('button', { name: '带入医嘱草稿 (1)' })).toBeEnabled()
    expect(f.state.services).toHaveLength(1)
  })

  it('marks duplicate plan medications by medication and product and lets the doctor opt in explicitly', async () => {
    const f = setup({ purpose: 'ORDERS', plans: fx => [ordersPlan(fx)], medicationDrafts: [
      { id: 'med-draft', request: { medicationId: 'm', catalogItemId: 'product' } } as unknown as MedicationPlanDraft] })
    await screen.findByText('医嘱方案')
    expect(screen.getAllByText('重复')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: /选择药品/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '带入当前草稿 (1)' })).toBeEnabled()
    await f.user.click(screen.getByRole('checkbox', { name: /选择药品/ }))
    expect(screen.getByRole('button', { name: '带入当前草稿 (2)' })).toBeEnabled()
  })

  it('whole-group toggling covers every selectable row except duplicates', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()], serviceDrafts: [draftService('s1')] })
    const bar = await screen.findByRole('checkbox', { name: '整组勾选 检查组套' })
    expect(bar).toBeChecked()
    expect(screen.getByText(/已选 1 \/ 共 2 项/)).toBeInTheDocument()
    await f.user.click(bar)
    expect(screen.getByRole('checkbox', { name: '选择项目 检查项目' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '带入医嘱草稿' })).toBeDisabled()
    await f.user.click(bar)
    expect(screen.getByRole('checkbox', { name: '选择项目 检查项目' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择项目 旧项目名称' })).not.toBeChecked()
    await f.user.click(screen.getByRole('checkbox', { name: '选择项目 旧项目名称' }))
    expect(screen.getByRole('button', { name: '带入医嘱草稿 (2)' })).toBeEnabled()
  })

  it('brings valid group members, skips a failing member with its reason and locks the row', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()] })
    const defective = vi.mocked(f.f.api.masterData.searchServices).getMockImplementation()!
    vi.mocked(f.api.masterData.searchServices).mockImplementation(async (code, ...rest) => {
      const page = await defective(code, ...rest)
      return code === 'S2' ? { ...page, content: page.content.map(item => ({ ...item, prices: [] })) } : page
    })
    await f.user.click(await screen.findByRole('button', { name: '带入医嘱草稿 (2)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.state.services.map(item => item.itemCode)).toEqual(['S1'])
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringMatching(/已从“检查组套”带入 1 项（诊疗项目 1），跳过 1 项（检查项目：.*销售价格/))
    const row = screen.getByRole('checkbox', { name: '选择项目 检查项目' })
    expect(row).toBeDisabled()
    expect(row).not.toBeChecked()
    expect(screen.getByText('不可带入')).toBeInTheDocument()
  })

  it('reports an error without closing when every selected row fails', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()] })
    vi.mocked(f.api.masterData.searchServices).mockResolvedValue({ content: [] } as never)
    await f.user.click(await screen.findByRole('button', { name: '带入医嘱草稿 (2)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('未带入任何内容，跳过 2 项')
    expect(f.onClose).not.toHaveBeenCalled()
    expect(f.state.services).toEqual([])
    expect(screen.getAllByText('不可带入')).toHaveLength(2)
  })

  it('brings plan rows that validate, skips the one that does not, and keeps other zones', async () => {
    const f = setup({ purpose: 'DIAGNOSIS', plans: fx => [ordersPlan(fx, { diagnoses: [{ code: 'J06', display: '上呼吸道感染', type: 'PRIMARY' }],
      services: [...fx.plan.services, { ...fx.plan.services[0], catalogItemId: 'gone', itemCode: 'GONE', itemName: '已下架项目' }] })] })
    await f.user.click(await screen.findByRole('button', { name: '带入当前草稿 (4)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.state.diagnoses.map(item => item.code)).toEqual(['J06'])
    expect(f.state.medications).toHaveLength(1)
    expect(f.state.services.map(item => item.itemCode)).toEqual(['S1'])
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringMatching(/带入 3 项（诊断 1、药品 1、诊疗项目 1），跳过 1 项（已下架项目：/))
    const locked = screen.getByRole('checkbox', { name: '选择项目 已下架项目' })
    expect(locked).toBeDisabled()
    expect(locked).not.toBeChecked()
  })

  it('does not close or stage anything when a catalog request fails for the whole batch', async () => {
    const f = setup({ purpose: 'ORDERS', plans: fx => [ordersPlan(fx)] })
    vi.mocked(f.api.masterData.servicesByCodes).mockRejectedValue(new Error('目录不可访问'))
    await f.user.click(await screen.findByRole('button', { name: '带入当前草稿 (2)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('目录不可访问')
    expect(f.onClose).not.toHaveBeenCalled()
    expect(f.state.medications).toEqual([])
    expect(f.state.services).toEqual([])
    expect(screen.getByRole('checkbox', { name: /选择项目/ })).toBeChecked()
  })
})

describe('application is abandoned when the context changes', () => {
  it('ignores a late plan use receipt after the draft orders change', async () => {
    let resolve!: (value: OutpatientPlanTemplate) => void
    const f = setup({ purpose: 'ORDERS', plans: fx => [ordersPlan(fx)] })
    f.planUse.mockImplementation(() => new Promise(done => { resolve = done }))
    await f.user.click(await screen.findByRole('button', { name: '带入当前草稿 (2)' }))
    await waitFor(() => expect(f.planUse).toHaveBeenCalledTimes(1))
    const plan = ordersPlan(f.f)
    act(() => f.state.setServices?.([{ id: 'manual', catalogItemId: 'manual', itemCode: 'M', itemName: '手工项目', quantity: 1 }]))
    await act(async () => { resolve(plan) })
    expect(await screen.findByRole('alert')).toHaveTextContent('本次未带入')
    expect(f.state.medications).toEqual([])
    expect(f.state.services.map(item => item.itemCode)).toEqual(['M'])
    expect(f.onClose).not.toHaveBeenCalled()
  })

  it('ignores a late order-set result after the selection changes', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()] })
    let release!: (value: ItemGroup[]) => void
    f.itemGroups.mockImplementation(() => new Promise<ItemGroup[]>(done => { release = done }))
    await f.user.click(await screen.findByRole('button', { name: '带入医嘱草稿 (2)' }))
    await waitFor(() => expect(f.itemGroups).toHaveBeenCalledTimes(2))
    act(() => f.state.setServices?.([{ id: 'manual', catalogItemId: 'manual', itemCode: 'M', itemName: '手工项目', quantity: 1 }]))
    await act(async () => { release([group()]) })
    expect(await screen.findByRole('alert')).toHaveTextContent('本次未带入')
    expect(f.state.services.map(item => item.itemCode)).toEqual(['M'])
    expect(f.onClose).not.toHaveBeenCalled()
  })

  it.each(['identity', 'content', 'inactive', 'missing'])('does not apply a standalone note with an invalid %s use receipt', async failure => {
    const f = setup({ purpose: 'RECORD', notes: [noteTemplate()] })
    const bad = noteTemplate()
    if (failure === 'identity') bad.id = 'other'
    if (failure === 'content') bad.content = { chiefComplaint: '未查看过的正文' }
    if (failure === 'inactive') bad.status = 'INACTIVE'
    f.noteUse.mockResolvedValueOnce(failure === 'missing' ? undefined : bad)
    await f.user.click(await screen.findByRole('button', { name: '带入病历草稿 (2)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('未带入')
    expect(f.onApplyNoteTemplate).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /主诉/ })).toBeChecked()
  })

  it('ignores a late note receipt after the record draft changes', async () => {
    const f = setup({ purpose: 'RECORD', notes: [noteTemplate()] })
    let resolve!: (value: OutpatientNoteTemplate) => void
    f.noteUse.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await f.user.click(await screen.findByRole('button', { name: '带入病历草稿 (2)' }))
    f.record.current = { chiefComplaint: '医生又改了主诉' }
    await act(async () => { resolve(noteTemplate()) })
    expect(f.onApplyNoteTemplate).not.toHaveBeenCalled()
    expect(f.onClose).not.toHaveBeenCalled()
    expect(within(screen.getByRole('alert')).getByText(/本次未带入/)).toBeInTheDocument()
  })
})

describe('order sets from the template library (new) next to legacy groups', () => {
  const orderSet = (f: ReturnType<typeof templateCatalogFixture>, patch: Partial<OutpatientPlanTemplate> = {}): OutpatientPlanTemplate =>
    ({ ...f.plan, id: 'set-a', name: '血常规复查组套', templateKind: 'ORDER_SET', scopeType: 'DEPARTMENT', diagnoses: [], ...patch })

  it('lists new order sets first, then legacy groups tagged 全院 and maintained by the medical affairs office; names scopes 我的/科室/全院', async () => {
    setup({ purpose: 'ORDERS', groups: [group()], orderSets: f => [orderSet(f), orderSet(f, { id: 'set-b', name: '我的换药组套', scopeType: 'PERSONAL' })] })
    await listed('血常规复查组套', '我的换药组套', '检查组套')
    expect(cards()).toEqual(['血常规复查组套', '我的换药组套', '检查组套'])
    const cardOf = (title: string) => [...document.querySelectorAll('.doctor-plan-item-card')].find(node => node.querySelector('.doctor-plan-item-card__title')?.textContent === title)!
    expect(cardOf('血常规复查组套')).toHaveTextContent('医嘱组套')
    expect(cardOf('血常规复查组套')).toHaveTextContent('科室')
    expect(cardOf('我的换药组套')).toHaveTextContent('我的')
    expect(cardOf('检查组套')).toHaveTextContent('全院')
    expect(cardOf('检查组套')).toHaveTextContent('由医务科维护')
    expect(screen.getByRole('tab', { name: /医嘱组套\(3\)/ })).toBeInTheDocument()
  })

  it('leaves rows whose defaultSelected is false unchecked, brings the checked rows and counts the use of the order set', async () => {
    const f = setup({ purpose: 'ORDERS', orderSets: fx => [orderSet(fx, {
      services: [...fx.plan.services, { ...fx.plan.services[0], catalogItemId: 'optional', itemCode: 'OPT', itemName: '可选项目', defaultSelected: false }] })] })
    await screen.findByRole('checkbox', { name: '选择项目 可选项目' })
    expect(screen.getByRole('checkbox', { name: '选择项目 可选项目' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /选择药品/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择项目 旧项目名称' })).toBeChecked()
    await f.user.click(screen.getByRole('button', { name: '带入医嘱草稿 (2)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.planUse).toHaveBeenCalledExactlyOnceWith('set-a')
    expect(f.state.medications).toHaveLength(1)
    expect(f.state.services.map(item => item.itemCode)).toEqual(['S1'])
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringContaining('血常规复查组套'))
    expect(f.onNotice).toHaveBeenCalledWith(expect.stringMatching(/带入 2 项（药品 1、诊疗项目 1）/))
  })

  it('lets the doctor tick an unchecked optional row and brings it too', async () => {
    const f = setup({ purpose: 'ORDERS', orderSets: fx => [orderSet(fx, { medications: [], services: [
      { ...fx.plan.services[0], defaultSelected: false }] })] })
    const row = await screen.findByRole('checkbox', { name: '选择项目 旧项目名称' })
    expect(row).not.toBeChecked()
    expect(screen.getByRole('button', { name: '带入医嘱草稿' })).toBeDisabled()
    await f.user.click(row)
    await f.user.click(screen.getByRole('button', { name: '带入医嘱草稿 (1)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.state.services.map(item => item.itemCode)).toEqual(['S1'])
  })

  it('keeps legacy group application unchanged next to new order sets', async () => {
    const f = setup({ purpose: 'ORDERS', groups: [group()], orderSets: fx => [orderSet(fx)] })
    await f.user.click(await screen.findByText('检查组套'))
    expect(await screen.findByText(/全院 · 由医务科维护/)).toBeInTheDocument()
    await f.user.click(await screen.findByRole('button', { name: '带入医嘱草稿 (2)' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalled())
    expect(f.planUse).not.toHaveBeenCalled()
    expect(f.state.services.length).toBeGreaterThan(0)
  })

  it('preselects the order set picked in the order search and switches to the 医嘱组套 tab', async () => {
    setup({ purpose: 'ORDERS', initialOrderSet: { id: 'set-b', nonce: 1 }, groups: [group()], orderSets: fx => [orderSet(fx),
      orderSet(fx, { id: 'set-b', name: '被检索选中的组套', description: '检索选中说明' })] })
    expect((await screen.findAllByText('检索选中说明')).length).toBeGreaterThan(0)
    expect(selectedTab()[0]).toMatch(/^医嘱组套/)
    const selectedCard = document.querySelector('.doctor-plan-item-card.is-selected')
    expect(selectedCard).toHaveTextContent('被检索选中的组套')
    expect(screen.getByRole('button', { name: '带入医嘱草稿 (2)' })).toBeEnabled()
  })

  it('tells the doctor when the picked order set is no longer available', async () => {
    setup({ purpose: 'ORDERS', initialOrderSet: { id: 'gone', nonce: 1 }, orderSets: fx => [orderSet(fx)] })
    expect(await screen.findByText('所选医嘱组套已不可用，请重新选择。')).toBeInTheDocument()
    expect(document.querySelector('.doctor-plan-item-card.is-selected')).toHaveTextContent('血常规复查组套')
  })

  it('keeps the new order sets usable when the legacy directory fails and says which part failed', async () => {
    setup({ purpose: 'ORDERS', groupError: '旧组合目录不可用', orderSets: fx => [orderSet(fx)] })
    await listed('血常规复查组套')
    expect(screen.getByText(/医嘱组套加载失败：旧组合目录不可用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '带入医嘱草稿 (2)' })).toBeEnabled()
  })
})
