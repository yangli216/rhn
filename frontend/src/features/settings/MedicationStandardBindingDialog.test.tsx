import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationStandardBindingDialog } from './MedicationStandardBindingDialog'

const identity = {catalogId: 'catalog', catalogVersion: 'v1', contentHash: 'content', sourceHash: 'source'}
const base = {medication: {id: '1', revision: 3, code: 'LOCAL-1', name: '测试药品', doseForm: 'CAPSULE', preparationSpec: '0.25g', presentationUnit: '粒'},
  identity, reference: {status: 'UNMAPPED'}, candidates: [{specification: {id: 'STD-1', name: '测试药品', doseForm: 'CAPSULE', doseFormName: '胶囊', specification: '0.25g', presentationUnit: '粒', sourceBlock: '测试原文条款'}, canBind: true, issues: [] as string[]}], bindings: [], audits: []}
function mount(data = base, mutation = vi.fn().mockResolvedValue({...base, reference: {status: 'LINKED'}, candidates: []})) {
  const preview = vi.fn().mockResolvedValue(data)
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}})
  render(<QueryClientProvider client={client}><MedicationStandardBindingDialog api={{masterData: {
    medicationStandardBindingPreview: preview, bindMedicationStandard: mutation,
  }} as unknown as RhnApi} medicationId="1" onClose={vi.fn()} /></QueryClientProvider>)
  return {preview, mutation}
}
it('requires explicit selection, evidence and confirmation, sending only the binding command', async () => {
  const {mutation} = mount()
  const select = await screen.findByRole('radio', {name: /选择 测试药品.*STD-1/})
  expect(select).not.toBeChecked()
  expect(screen.getByRole('button', {name: '建立标准关联'})).toBeDisabled()
  await userEvent.click(select)
  await userEvent.type(screen.getByRole('textbox', {name: /核对依据与关联理由/}), '按原文核对')
  expect(screen.getByRole('button', {name: '建立标准关联'})).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', {name: '建立标准关联'}))
  expect(mutation).toHaveBeenCalledWith('1', {expectedRevision: 3, identity, specificationId: 'STD-1', reason: '按原文核对', confirmedIdentity: true})
  await screen.findByText(/标准关联已建立/)
})
it('keeps excluded results out of the selection and explains them on demand', async () => {
  mount({...base, candidates: [{...base.candidates[0], canBind: false, issues: ['STANDARD_REFERENCE_STRENGTH_MISMATCH']}]})
  const toggle = await screen.findByRole('button', {name: '查看排除项及原因（1）'})
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByText(/已有含量与标准不一致/)).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.getByText(/已有含量与标准不一致/)).toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '建立标准关联'})).not.toBeInTheDocument()
})
it('does not invent a candidate when no identity clue matches', async () => {
  mount({...base, candidates: []})
  await screen.findByText(/没有明确匹配的标准身份线索/)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '建立标准关联'})).not.toBeInTheDocument()
})
it('explains missing salt identity and prevents choosing an ambiguous specification', async () => {
  mount({...base, candidates: [{...base.candidates[0], canBind: false, issues: ['STANDARD_REFERENCE_QUALIFIER_MISSING']}]})
  await userEvent.click(await screen.findByRole('button', {name: '查看排除项及原因（1）'}))
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.getByText(/缺少盐型信息，请先核对并补全药品名称/)).toBeInTheDocument()
})
it('clears prior consent when the medication revision changes during a refresh', async () => {
  const {preview} = mount()
  await userEvent.click(await screen.findByRole('radio'))
  await userEvent.type(screen.getByRole('textbox', {name: /核对依据与关联理由/}), '旧版依据')
  await userEvent.click(screen.getByRole('checkbox'))
  preview.mockResolvedValue({...base, medication: {...base.medication, revision: 4}})
  await userEvent.click(screen.getByRole('button', {name: '刷新核对结果'}))
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
  expect(screen.getByRole('textbox', {name: /核对依据与关联理由/})).toHaveValue('')
  expect(screen.getByRole('radio')).not.toBeChecked()
})

it('allows an existing local record to share a validated standard identity without merging records', async () => {
  const shared = {...base, candidates: [{...base.candidates[0], boundMedicationId: '2'}]}
  mount(shared)
  expect(await screen.findByRole('radio')).toBeEnabled()
  expect(screen.getByText(/身份一致时可共享标准身份/)).toBeInTheDocument()
  expect(screen.getByRole('button', {name: '建立标准关联'})).toBeDisabled()
})

it('shows only eligible choices in mixed results, with exclusions collapsible and non-selectable', async () => {
  mount({...base, candidates: [base.candidates[0], {...base.candidates[0], specification: {...base.candidates[0].specification, id: 'STD-2', doseFormName: '肠溶片'}, canBind: false, issues: ['STANDARD_REFERENCE_FORM_MISMATCH']}]})
  await screen.findByRole('radio')
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.queryByText(/肠溶片/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '查看排除项及原因（1）'}))
  expect(screen.getByText(/剂型不一致（当前：胶囊；候选：肠溶片）/)).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', {name: '收起排除项及原因（1）'}))
  expect(screen.queryByText(/排除原因：剂型不一致/)).not.toBeInTheDocument()
})
it('uses Chinese dosage forms and shows both forms when an exclusion is a dosage-form mismatch', async () => {
  mount({...base, candidates: [{...base.candidates[0], specification: {...base.candidates[0].specification, id: 'STD-INJECTION', doseForm: 'INJECTION', doseFormName: '注射液'}, canBind: false, issues: ['STANDARD_REFERENCE_FORM_MISMATCH']}]})
  expect(await screen.findByText('胶囊')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '查看排除项及原因（1）'}))
  expect(screen.getByText(/剂型不一致（当前：胶囊；候选：注射液）/)).toBeInTheDocument()
})
it('treats an explicit release qualifier as a confirmable dosage-form variant', async () => {
  mount({...base, medication: {...base.medication, name: '测试药品缓释'}, candidates: [{...base.candidates[0], specification: {...base.candidates[0].specification, id: 'STD-ER', doseForm: 'EXTENDED_RELEASE_CAPSULE', doseFormName: '缓释胶囊'}}]})
  expect(await screen.findByRole('radio', {name: /缓释胶囊.*STD-ER/})).toBeEnabled()
  expect(screen.getByText(/基础剂型为胶囊，药品名称已明确缓释胶囊属性/)).toBeInTheDocument()
})
it('explains how to resolve an unstandardized local dosage form', async () => {
  const onClose = vi.fn()
  const preview = vi.fn().mockResolvedValue({...base, medication: {...base.medication, doseForm: 'OTHER'}, candidates: [{...base.candidates[0], canBind: false, issues: ['STANDARD_REFERENCE_FORM_MISMATCH']}]})
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}})
  render(<QueryClientProvider client={client}><MedicationStandardBindingDialog api={{masterData: {medicationStandardBindingPreview: preview, bindMedicationStandard: vi.fn()}} as unknown as RhnApi} medicationId="1" onClose={onClose} /></QueryClientProvider>)
  expect(await screen.findByText('其他剂型（未规范）')).toBeInTheDocument()
  expect(screen.getByText('先修正本院药品档案')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', {name: '返回修正药品档案'}))
  expect(onClose).toHaveBeenCalled()
})
it('distinguishes unavailable actions from identity exclusions', async () => {
  mount({...base, candidates: [{...base.candidates[0], canBind: false}]})
  await screen.findByText(/身份一致但当前不可操作/)
  expect(screen.getByText(/当前状态或权限不允许关联/)).toBeInTheDocument()
  expect(screen.queryByRole('button', {name: /排除项及原因/})).not.toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})
it('clears evidence and consent when a different specification is selected', async () => {
  mount({...base, candidates: [base.candidates[0], {...base.candidates[0], specification: {...base.candidates[0].specification, id: 'STD-2', sourceBlock: '另一原文'}}]})
  await userEvent.click(await screen.findByRole('radio', {name: /STD-1/}))
  await userEvent.type(screen.getByRole('textbox'), '第一个规格依据')
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('radio', {name: /STD-2/}))
  expect(screen.getByText('另一原文')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('button', {name: '建立标准关联'})).toBeDisabled()
})
it('withdraws selection when eligibility changes on refresh without a medication revision change', async () => {
  const {preview, mutation} = mount()
  await userEvent.click(await screen.findByRole('radio'))
  await userEvent.type(screen.getByRole('textbox'), '原文依据')
  await userEvent.click(screen.getByRole('checkbox'))
  preview.mockResolvedValue({...base, candidates: [{...base.candidates[0], canBind: false}]})
  await userEvent.click(screen.getByRole('button', {name: '刷新核对结果'}))
  await screen.findByText(/身份一致但当前不可操作/)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '建立标准关联'})).not.toBeInTheDocument()
  expect(mutation).not.toHaveBeenCalled()
})
it('keeps the selected specification and evidence available after a failed submit', async () => {
  mount(base, vi.fn().mockRejectedValue(new Error('关联失败，请重试')))
  await userEvent.click(await screen.findByRole('radio'))
  await userEvent.type(screen.getByRole('textbox'), '原文依据')
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', {name: '建立标准关联'}))
  await screen.findByText(/关联失败，请重试/)
  expect(screen.getByRole('textbox')).toHaveValue('原文依据')
  expect(screen.getByRole('radio')).toBeChecked()
  expect(screen.getByRole('button', {name: '建立标准关联'})).toBeEnabled()
})
