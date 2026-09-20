import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrderDocumentEditor, documentMissing, orderDocuments } from './OrderDocuments'
import type { Encounter } from '../../shared/model'
import type { Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { RhnApi } from '../../shared/rhnApi'

const prescription = {
  id: 'rx1', revision: 2, authoredAt: '2026-09-19T01:00:00Z', status: 'DRAFT', prescriptionNo: 'RX001', categoryCode: 'WESTERN',
  medicationRequests: [{ id: 'm1', medicationName: '药品甲', status: 'DRAFT' }, { id: 'm2', medicationName: '药品乙', status: 'DRAFT' }],
  documentInfo: { diagnoses: [], externalPrescription: false },
} as unknown as Prescription
const encounter = { id: 'enc1', diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' }, { code: 'R42', display: '头晕', type: 'SECONDARY' }] } as Encounter

function setup(value = prescription, save = vi.fn().mockImplementation(async (_enc, _id, _revision, documentInfo) => ({ ...value, revision: 3, documentInfo }))) {
  const docs = orderDocuments([value], [])
  const onSelect = vi.fn(), onClose = vi.fn(), onSaved = vi.fn().mockResolvedValue(undefined)
  const navigationRef = createRef<((key: string | null) => void) | null>()
  const api = { encounters: { updatePrescriptionDocumentInfo: save } } as unknown as RhnApi
  render(<OrderDocumentEditor document={docs[0]} documents={docs} encounter={encounter} api={api} readOnly={false}
    onSaved={onSaved} onClose={onClose} onSelect={onSelect} onDirtyChange={vi.fn()} navigationRef={navigationRef} />)
  return { save, onSelect, onClose, onSaved, navigationRef }
}

describe('order document metadata', () => {
  it('keeps document labels stable across response reordering and identifies actual missing fields', () => {
    const second = { ...prescription, id: 'rx2', authoredAt: '2026-09-19T02:00:00Z' }
    const docs = orderDocuments([second, prescription], [])
    expect(docs.map(doc => doc.key)).toEqual(['prescription:rx1', 'prescription:rx2'])
    expect(docs[0].shortLabel).toBe('方1')
    expect(documentMissing(docs[0])).toEqual(['关联诊断'])
    const services = orderDocuments([], [{ id: 's1', authoredAt: prescription.authoredAt, serviceType: 'EXAMINATION', status: 'ACTIVE', itemName: 'CT', clinicalDescription: '胸部' } as ServiceRequest])
    expect(documentMissing(services[0])).toEqual(['关联诊断', '检查目的'])
  })

  it('saves metadata against the selected document revision and retains all member orders', async () => {
    const { save, onSaved } = setup()
    fireEvent.click(screen.getByRole('button', { name: '带入本次主要诊断' }))
    fireEvent.click(screen.getByLabelText('外配处方标记（本方全部药品）'))
    fireEvent.change(screen.getByLabelText('门诊特病病种'), { target: { value: '高血压' } })
    fireEvent.click(screen.getByRole('button', { name: '保存单据信息' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('enc1', 'rx1', 2, expect.objectContaining({
      diagnoses: [{ code: 'I10', display: '高血压', primary: true }], externalPrescription: true, specialDisease: '高血压',
    }))
    expect(screen.getByRole('button', { name: '药品甲' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '药品乙' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存单据信息' })).toBeDisabled()
  })

  it('guards switching from summary and preserves edits on failed saves', async () => {
    const { navigationRef, onSelect, save } = setup(prescription, vi.fn().mockRejectedValue(new Error('版本冲突')))
    fireEvent.change(screen.getByLabelText('门诊特病病种'), { target: { value: '特病甲' } })
    act(() => navigationRef.current?.('prescription:rx2'))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText('门诊特病病种')).toHaveValue('特病甲')
    expect(screen.getByText('版本冲突')).toBeInTheDocument()
  })

  it('makes submitted prescriptions read only', () => {
    setup({ ...prescription, status: 'ACTIVE' })
    expect(screen.getByLabelText('门诊特病病种')).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存单据信息' })).toBeDisabled()
  })
})
