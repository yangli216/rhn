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
  const select = await screen.findByRole('radio', {name: '选择 STD-1'})
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
it('shows identity disagreements and disables unavailable candidates', async () => {
  mount({...base, candidates: [{...base.candidates[0], canBind: false, issues: ['STANDARD_REFERENCE_STRENGTH_MISMATCH']}]})
  expect(await screen.findByRole('radio')).toBeDisabled()
  expect(screen.getByText('已有含量与标准不一致')).toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '建立标准关联'})).not.toBeInTheDocument()
})
it('does not invent a candidate when no identity clue matches', async () => {
  mount({...base, candidates: []})
  await screen.findByText(/没有明确匹配的标准身份线索/)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name: '建立标准关联'})).not.toBeInTheDocument()
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
