import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationKnowledgeDrafts, emptyKnowledge } from './MedicationKnowledgeDrafts'
import { KnowledgeTargetPicker } from './KnowledgeTargetPicker'
import type { KnowledgeDetail, KnowledgeAssessment } from '../../shared/api/medicationKnowledgeDraftApi'

const complete: KnowledgeAssessment = { structureComplete: true, issues: [], ruleDescription: '合成结构说明', groupA: [], groupB: [], groupARoutes: [], groupBRoutes: [] }
const base: KnowledgeDetail = { saved: { id: '100', version: 1, status: 'DRAFT', body: { ...emptyKnowledge(), title: '合成重复草稿' }, assessment: complete, actor: '作者', savedAt: '2026-09-21T00:00:00Z', changeReason: '建立样例' }, currentAssessment: complete, possibleConflicts: [], cases: [{ name: '合成案例', input: { age: 30, ageUnit: 'YEAR', date: '2026-01-01', medications: [] }, expected: 'NO_MATCH', actual: { outcome: 'NO_MATCH', reasons: ['未满足条件，不代表安全'], matchedOrderIds: [] }, passed: true }] }
const page = { content: [{ id: '100', version: 1, title: '合成重复草稿', kind: 'DUPLICATE_THERAPY', structureComplete: true }], totalElements: 1, totalPages: 1, page: 0, size: 20 }
function mount(detail = base) {
  const api = { medicationKnowledgeDrafts: {
    list: vi.fn().mockResolvedValue(page), detail: vi.fn().mockResolvedValue(detail), history: vi.fn().mockResolvedValue([detail.saved]),
    save: vi.fn().mockImplementation((_id, _v, body) => Promise.resolve({ ...detail, saved: { ...detail.saved, body, version: 2 } })),
    examples: vi.fn().mockResolvedValue([{ id: 'duplicate', purpose: '核对重复开立', notes: ['机构策略待确认'], sourceUrl: 'https://example.com/source', sourceMaterial: '合成材料',
      body: { ...base.saved.body, title: '验收重复用药示例' }, assessment: complete, medicationLabels: {}, manualCases: [], results: base.cases }]),
    validate: vi.fn().mockResolvedValue(complete), preview: vi.fn().mockResolvedValue(base.cases),
    extractionStatus: vi.fn().mockResolvedValue({ available: true, model: 'synthetic-model', message: '' }), extract: vi.fn(), converse: vi.fn(),
  }, masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue({ routes: [{ code: 'PO', name: '口服' }] }) },
  dictionaries: { systemEnum: vi.fn().mockResolvedValue({ code: 'MED_KNOWLEDGE_ACTION', name: '用药知识处置方式', items: [{ code: 'WARN', name: '警告提示', description: '', sortOrder: 10 }, { code: 'REQUIRE_OVERRIDE', name: '需理由后继续', description: '', sortOrder: 20 }, { code: 'BLOCK', name: '阻断', description: '', sortOrder: 30 }] }) } }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MedicationKnowledgeDrafts api={api as unknown as RhnApi} /></QueryClientProvider>)
  return api
}
const toForm = async () => { await userEvent.click(await screen.findByRole('button', { name: '手工新建' })) }
it('universal duplicate drafts do not require forced drug selection and save incomplete structure as drafts', async () => {
  const api = mount()
  await toForm()
  expect(screen.queryByRole('button', { name: '添加标准药品至 A 组' })).not.toBeInTheDocument()
  expect(screen.getByText(/所有具有一致标准身份/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保存草稿新版本' })).toBeDisabled()
  await userEvent.type(screen.getByRole('textbox', { name: '知识标题' }), '所有标准药品重复开立')
  await userEvent.type(screen.getByRole('textbox', { name: '本次保存原因' }), '先保留机构需求')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(api.medicationKnowledgeDrafts.save).toHaveBeenCalledWith(undefined, 0, expect.objectContaining({ matchMode: 'SAME_STANDARD_ENTRY', groupA: [], groupB: [], conditions: expect.objectContaining({ ageMode: 'UNSPECIFIED' }) }), '先保留机构需求', undefined, undefined))
  expect(await screen.findByText(/已保存草稿第 2 版/)).toBeInTheDocument()
})
it('interaction model exposes independent A and B ranges and routes without inventing a relation', async () => {
  mount()
  await toForm()
  await userEvent.click(screen.getByRole('button', { name: '新建相互作用' }))
  expect(screen.getByRole('button', { name: '添加标准药品至 A 组' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '添加标准药品至 B 组' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'A 组给药途径' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'B 组给药途径' })).toBeInTheDocument()
  expect(screen.queryByRole('spinbutton', { name: '触发医嘱条数' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '来源原文片段' })).toHaveValue('')
})
it('editing invalidates prior validation and sample output, while save uses the current version', async () => {
  const api = mount()
  await userEvent.click(await screen.findByRole('button', { name: /^草稿库/ }))
  await userEvent.click(await screen.findByRole('button', { name: /合成重复草稿/ }))
  expect(await screen.findByText('合成样例 1 / 1 通过')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '历史处方快照回放' })).toBeEnabled()
  await userEvent.type(screen.getByRole('textbox', { name: '其他适用条件' }), '给药时间需重叠')
  expect(screen.getByRole('button', { name: '历史处方快照回放' })).toBeDisabled()
  expect(screen.queryByText('合成样例 1 / 1 通过')).not.toBeInTheDocument()
  api.medicationKnowledgeDrafts.validate.mockResolvedValue({ ...complete, structureComplete: false, issues: [{ field: 'conditions', code: 'UNSTRUCTURED', message: '补充条件尚未结构化' }] })
  await userEvent.click(screen.getByRole('button', { name: '校验并预演' }))
  expect(await screen.findByText('补充条件尚未结构化')).toBeInTheDocument()
  expect(api.medicationKnowledgeDrafts.preview).not.toHaveBeenCalled()
  await userEvent.type(screen.getByRole('textbox', { name: '本次保存原因' }), '记录缺口')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(api.medicationKnowledgeDrafts.save).toHaveBeenCalledWith('100', 1, expect.objectContaining({ conditions: expect.objectContaining({ additionalConditions: '给药时间需重叠' }) }), '记录缺口', undefined, undefined))
})
it('keeps unsaved work when navigation is cancelled and shows immutable history separately', async () => {
  mount()
  await userEvent.click(await screen.findByRole('button', { name: /^草稿库/ }))
  await userEvent.click(await screen.findByRole('button', { name: /合成重复草稿/ }))
  await screen.findByText('合成样例 1 / 1 通过')
  await userEvent.type(screen.getByRole('textbox', { name: '来源原文片段' }), '新增原文')
  await userEvent.click(screen.getByRole('button', { name: '新建相互作用' }))
  expect(screen.getByRole('dialog', { name: '处理未保存修改' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '返回编辑' }))
  expect(screen.getByRole('textbox', { name: '来源原文片段' })).toHaveValue('新增原文')
  await userEvent.click(screen.getByRole('button', { name: '版本与原文历史' }))
  expect(await screen.findByText('保存原因：建立样例')).toBeInTheDocument()
  expect(screen.getByText('未填写原文')).toBeInTheDocument()
})
it('a version conflict preserves unsaved input and does not present a success', async () => {
  const api = mount()
  await toForm()
  api.medicationKnowledgeDrafts.save.mockRejectedValue(new Error('草稿版本已变化，请刷新并核对后保存'))
  await userEvent.type(screen.getByRole('textbox', { name: '知识标题' }), '保留标题')
  await userEvent.type(screen.getByRole('textbox', { name: '本次保存原因' }), '修改')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  expect(await screen.findByText('草稿版本已变化，请刷新并核对后保存')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '知识标题' })).toHaveValue('保留标题')
  expect(screen.queryByText(/已保存草稿第/)).not.toBeInTheDocument()
})
it('standard picker pins actual catalogue identity and requires an explicit specification selection', async () => {
  const selected = vi.fn(), closed = vi.fn()
  const api = { masterData: { standardMedicationSummary: vi.fn().mockResolvedValue({ catalogId: 'C', catalogVersion: 'V1', contentHash: 'hash' }), standardMedications: vi.fn().mockResolvedValue({ ...page, content: [{ id: 'E1', name: '合成标准甲', legacyCode: 'K', specificationCount: 1 }] }), standardMedicationDetail: vi.fn().mockResolvedValue({ id: 'E1', name: '合成标准甲', specifications: [{ id: 'S1', doseForm: 'TABLET', doseFormName: '片剂', specification: '合成规格' }] }) } }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><KnowledgeTargetPicker api={api as unknown as RhnApi} onClose={closed} onSelect={selected} /></QueryClientProvider>)
  await userEvent.click(await screen.findByRole('button', { name: /合成标准甲/ }))
  expect(selected).not.toHaveBeenCalled()
  await userEvent.click(await screen.findByRole('button', { name: '选择该规格' }))
  expect(selected).toHaveBeenCalledWith({ level: 'SPECIFICATION', specificationId: 'S1', catalogId: 'C', catalogVersion: 'V1', contentHash: 'hash' }, '合成标准甲 · 合成规格', expect.objectContaining({ entryId: 'E1', specificationId: 'S1', catalogId: 'C', catalogVersion: 'V1', contentHash: 'hash' }))
  expect(closed).toHaveBeenCalled()
})
it('preserves extraction provenance on save and detaches it when the original excerpt changes', async () => {
  const api = mount({ ...base, saved: { ...base.saved, extractionId: '900' } })
  await userEvent.click(await screen.findByRole('button', { name: /^草稿库/ }))
  await userEvent.click(await screen.findByRole('button', { name: /合成重复草稿/ }))
  await screen.findByText('关联 AI 抽取记录')
  await userEvent.type(screen.getByRole('textbox', { name: '本次保存原因' }), '补充元数据')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(api.medicationKnowledgeDrafts.save).toHaveBeenCalledWith('100', 1, expect.anything(), '补充元数据', '900', undefined))
  await userEvent.type(screen.getByRole('textbox', { name: '来源原文片段' }), '原文已改变')
  expect(screen.queryByText('关联 AI 抽取记录')).not.toBeInTheDocument()
  expect(screen.getByText(/原文已修改，已取消/)).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox', { name: '本次保存原因' }), '变更原文')
  await userEvent.click(screen.getByRole('button', { name: '保存草稿新版本' }))
  await waitFor(() => expect(api.medicationKnowledgeDrafts.save).toHaveBeenLastCalledWith('100', 2, expect.objectContaining({ evidence: expect.objectContaining({ excerpt: '原文已改变' }) }), '变更原文', undefined, undefined))
})

it('loads a reviewed example as a new unsaved draft and preserves unsaved-edit confirmation', async () => {
  const api = mount()
  await toForm()
  await userEvent.type(screen.getByRole('textbox', { name: '知识标题' }), '我的未保存内容')
  await userEvent.click(screen.getByRole('button', { name: '验收样例' }))
  await userEvent.click(await screen.findByRole('button', { name: '填入未保存知识草稿' }))
  expect(screen.getByRole('dialog', { name: '处理未保存修改' })).toBeVisible()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '放弃修改并继续' }))
  expect(screen.getByRole('textbox', { name: '知识标题' })).toHaveValue('验收重复用药示例')
  expect(screen.getByRole('button', { name: '保存草稿新版本' })).toBeDisabled()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
})

it('builds rules by conversation: cards are confirmed by the maintainer and compiled into an unsaved draft', async () => {
  const api = mount()
  const ref = { catalogId: 'C', catalogVersion: '1', contentHash: 'h', sourceHash: 's', entryId: 'E', specificationId: 'S1', name: '阿莫西林', doseForm: '片剂', preparationSpec: '0.25g' }
  const card = { id: 'c1', kind: 'DRUG_INTERACTION', title: '阿莫西林与乙', quote: '阿莫西林与乙合用', groupA: ['阿莫西林'], groupB: ['乙'], matchMode: 'GROUP_PAIR', exposureScope: 'SAME_PRESCRIPTION', minimumOrders: null,
    ageMode: null, ageUnit: null, minimumAgeInclusive: null, maximumAgeExclusive: null, routesA: [], routesB: [], proposedAction: null, severity: null, clinicalMeaning: '', otherConditions: '', questions: [] }
  const unsupported = { ...card, id: 'c2', kind: 'COMPATIBILITY', title: '不宜用葡萄糖稀释', quote: '不宜用葡萄糖稀释', groupA: [], groupB: [] }
  api.medicationKnowledgeDrafts.converse
    .mockResolvedValueOnce({ runId: '1', reply: '拆成 2 条，第 2 条暂不能转换。', cards: [
      { card, state: 'NEEDS_INFO', kindName: '相互作用', missing: ['命中后的处置方式'], groupACandidates: [{ name: '阿莫西林', candidates: [ref] }], groupBCandidates: [{ name: '乙', candidates: [] }] },
      { card: unsupported, state: 'UNSUPPORTED', kindName: '配伍、溶媒与输液顺序', missing: [], groupACandidates: [], groupBCandidates: [] }] })
    .mockResolvedValueOnce({ runId: '2', reply: '已设为阻断。', cards: [{ card: { ...card, proposedAction: 'BLOCK' }, state: 'READY', kindName: '相互作用', missing: [], groupACandidates: [{ name: '阿莫西林', candidates: [ref] }], groupBCandidates: [{ name: '乙', candidates: [] }] }] })
  await userEvent.type(await screen.findByRole('textbox', { name: '规则原文' }), '阿莫西林与乙合用。不宜用葡萄糖稀释。')
  await userEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('拆成 2 条，第 2 条暂不能转换。')).toBeInTheDocument()
  expect(screen.getByText(/【处置方式待确认】/)).toBeInTheDocument()
  expect(screen.getByText('暂不能转换')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '确认并转为系统规则' })).toHaveLength(1)
  // A unique standard entry is attached automatically (all specifications); the missing 处置方式 is answered with one click.
  expect(screen.getByRole('button', { name: '取消 A 组 阿莫西林 的标准范围' })).toHaveTextContent('阿莫西林（全部规格）')
  await userEvent.click(screen.getByRole('button', { name: '阻断' }))
  expect(await screen.findByText('已设为阻断。')).toBeInTheDocument()
  expect(api.medicationKnowledgeDrafts.converse).toHaveBeenLastCalledWith(expect.objectContaining({ message: '把“阿莫西林与乙”的处置方式设为阻断', cards: expect.arrayContaining([expect.objectContaining({ id: 'c1' })]) }))
  await userEvent.click(screen.getByRole('button', { name: '确认并转为系统规则' }))
  expect(await screen.findByDisplayValue('阿莫西林与乙')).toBeInTheDocument()
  expect(screen.getByText(/已按确认的规则卡片生成系统规则草稿/)).toBeInTheDocument()
  expect(screen.getByText('阿莫西林（全部规格）')).toBeInTheDocument()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
})

it('asks the maintainer to choose when a name matches several standard entries and turns open questions into answerable prompts', async () => {
  const api = mount()
  const ref = (entryId: string, specificationId: string, spec: string) => ({ catalogId: 'C', catalogVersion: '1', contentHash: 'h', sourceHash: 's', entryId, specificationId, name: '呋塞米', doseForm: '片剂', preparationSpec: spec })
  const card = { id: 'c1', kind: 'DRUG_INTERACTION', title: '呋塞米与多巴胺', quote: '原文', groupA: ['呋塞米'], groupB: [], matchMode: 'GROUP_PAIR', exposureScope: 'SAME_PRESCRIPTION', minimumOrders: null, ageMode: null, ageUnit: null,
    minimumAgeInclusive: null, maximumAgeExclusive: null, routesA: [], routesB: [], proposedAction: 'WARN', severity: null, clinicalMeaning: '', otherConditions: '', questions: ['是否仅针对静脉输注途径？'], boundaryNote: null }
  api.medicationKnowledgeDrafts.converse.mockResolvedValue({ runId: '1', reply: '已整理', cards: [{ card, state: 'NEEDS_INFO', kindName: '相互作用', missing: ['B 组药品'],
    groupACandidates: [{ name: '呋塞米', candidates: [ref('E1', 'S1', '20mg'), ref('E1', 'S2', '40mg'), ref('E2', 'S3', '20mg/2ml')] }], groupBCandidates: [] }] })
  await userEvent.type(await screen.findByRole('textbox', { name: '规则原文' }), '呋塞米与多巴胺合用')
  await userEvent.click(screen.getByRole('button', { name: '发送' }))
  await screen.findByText('已整理')
  expect(screen.queryByRole('button', { name: '取消 A 组 呋塞米 的标准范围' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('combobox', { name: '选择 A 组 呋塞米 的标准范围' }))
  expect(await screen.findByRole('option', { name: '呋塞米（全部规格，2 个）' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: '呋塞米（全部规格）' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('option', { name: '呋塞米（全部规格，2 个）' }))
  expect(screen.getByRole('button', { name: '取消 A 组 呋塞米 的标准范围' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '是否仅针对静脉输注途径？' }))
  expect(screen.getByRole('textbox', { name: '对话输入' })).toHaveValue('关于“是否仅针对静脉输注途径？”：')
})

it('prefers a catalog classification over drug specifications and compiles it as a CATEGORY target', async () => {
  const api = mount()
  const category = { catalogId: 'C', catalogVersion: '1', contentHash: 'h', sourceHash: 's', key: '一、抗微生物药/（一）青霉素类', label: '（一）青霉素类', entryIds: ['E1', 'E2', 'E3'] }
  const card = { id: 'c1', kind: 'DUPLICATE_THERAPY', title: '青霉素类重复', quote: '青霉素类药物不宜重复使用', groupA: ['青霉素类'], groupB: [], matchMode: 'EXPLICIT_GROUP', exposureScope: 'SAME_PRESCRIPTION', minimumOrders: 2,
    ageMode: null, ageUnit: null, minimumAgeInclusive: null, maximumAgeExclusive: null, routesA: [], routesB: [], proposedAction: 'WARN', severity: null, clinicalMeaning: '', otherConditions: '', questions: [], boundaryNote: null }
  api.medicationKnowledgeDrafts.converse.mockResolvedValue({ runId: '1', reply: '已整理', cards: [{ card, state: 'READY', kindName: '重复用药', missing: [], groupACandidates: [{ name: '青霉素类', candidates: [], categories: [category] }], groupBCandidates: [] }] })
  await userEvent.type(await screen.findByRole('textbox', { name: '规则原文' }), '青霉素类药物不宜重复使用')
  await userEvent.click(screen.getByRole('button', { name: '发送' }))
  await screen.findByText('已整理')
  expect(screen.getByRole('button', { name: '取消 A 组 青霉素类 的标准范围' })).toHaveTextContent('（一）青霉素类 · 目录分类，含 3 个药品')
  await userEvent.click(screen.getByRole('button', { name: '确认并转为系统规则' }))
  expect(await screen.findByText(/（一）青霉素类 · 目录分类，含 3 个药品/)).toBeInTheDocument()
  expect(screen.getByText(/目录分类下全部药品/)).toBeInTheDocument()
})
