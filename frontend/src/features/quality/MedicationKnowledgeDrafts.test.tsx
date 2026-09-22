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
  }, masterData: { clinicalMedicationStandards: vi.fn().mockResolvedValue({ routes: [{ code: 'PO', name: '口服' }] }) } }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><MedicationKnowledgeDrafts api={api as unknown as RhnApi} /></QueryClientProvider>)
  return api
}
it('universal duplicate drafts do not require forced drug selection and save incomplete structure as drafts', async () => {
  const api = mount()
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
  await userEvent.type(screen.getByRole('textbox', { name: '知识标题' }), '我的未保存内容')
  await userEvent.click(screen.getByRole('button', { name: '重复用药与相互作用验收样例' }))
  await userEvent.click(await screen.findByRole('button', { name: '填入未保存知识草稿' }))
  expect(screen.getByRole('dialog', { name: '处理未保存修改' })).toBeVisible()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '放弃修改并继续' }))
  expect(screen.getByRole('textbox', { name: '知识标题' })).toHaveValue('验收重复用药示例')
  expect(screen.getByRole('button', { name: '保存草稿新版本' })).toBeDisabled()
  expect(api.medicationKnowledgeDrafts.save).not.toHaveBeenCalled()
})
