import { describe, expect, it } from 'vitest'
import type { OutpatientPlanTemplate, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import { requireCreatedPlanReceipt, requireUsedPlanReceipt, requireUsedNoteReceipt, requireNoTemplateOrderConflicts, requirePlanCreationInput } from './templateApplicationReceipt'

function plan(): OutpatientPlanTemplate {
  return { id: 'plan', revision: 2, name: '复诊方案', scopeType: 'PERSONAL', status: 'ACTIVE', sourceType: 'MANUAL',
    sortOrder: 0, useCount: 1, createdAt: '', updatedAt: '', tasks: [],
    diagnoses: [{ code: 'D1', display: '诊断一', type: 'PRIMARY' }, { code: 'D2', display: '诊断二', type: 'SECONDARY' }],
    medications: [{ lineId: 'line', medicationId: 'med', medicationCode: 'MED', medicationName: '药品',
      editorMode: 'regular', categoryCode: 'WESTERN', catalogItemId: 'product', packageId: 'box',
      quantity: 2, quantityUnit: '盒', substitutionAllowed: false, selfProvided: false, doseValue: 5, doseUnit: 'mg' }],
    services: [{ catalogItemId: 'service', itemCode: 'S1', itemName: '项目', serviceType: 'LABORATORY', quantity: 1, unitCode: '次' }],
  }
}
function note(): OutpatientNoteTemplate {
  return { id: 'note', revision: 2, name: '病历模板', scopeType: 'PERSONAL', status: 'ACTIVE',
    specialtyCode: 'GENERAL_PRACTICE', documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
    content: { chiefComplaint: '复诊', presentIllness: '病情稳定' }, sortOrder: 0, useCount: 1, createdAt: '', updatedAt: '' }
}

describe('template application receipts', () => {
  it.each(['quantity', 'selfProvided', 'substitutionAllowed'])(
    'rejects a missing explicit %s before sending the creation request', field => {
      const input: SaveOutpatientPlanTemplateInput = structuredClone(plan())
      Object.assign(input.medications[0], { [field]: undefined })
      expect(() => requirePlanCreationInput(input)).toThrow(/所选方案缺少/)
    })
  it('takes only the captured selection from the verified server receipt, allowing usage metadata to advance', () => {
    const viewed = plan(), receipt = { ...structuredClone(viewed), revision: 3, useCount: 2 }
    const result = requireUsedPlanReceipt(receipt, viewed, { ...viewed, diagnoses: [viewed.diagnoses[1]], services: [] })
    expect(result.diagnoses).toEqual([receipt.diagnoses[1]])
    expect(result.diagnoses[0]).toBe(receipt.diagnoses[1])
    expect(result.medications[0]).toBe(receipt.medications[0])
    expect(result.services).toEqual([])
    expect(result.revision).toBe(3)
  })
  it.each(['empty', 'wrong-id', 'older', 'inactive', 'dropped-line', 'dose', 'quantity', 'duplicate-line', 'missing-unit', 'linked-note'])(
    'rejects unusable or changed plan receipt: %s', failure => {
      const viewed = plan(), receipt = structuredClone(viewed)
      if (failure === 'wrong-id') receipt.id = 'another'
      if (failure === 'older') receipt.revision = 1
      if (failure === 'inactive') receipt.status = 'INACTIVE'
      if (failure === 'dropped-line') receipt.diagnoses.pop()
      if (failure === 'dose') receipt.medications[0].doseValue = 10
      if (failure === 'quantity') receipt.services[0].quantity = 9
      if (failure === 'duplicate-line') receipt.medications.push(receipt.medications[0])
      if (failure === 'missing-unit') receipt.medications[0].quantityUnit = undefined
      if (failure === 'linked-note') receipt.noteTemplateId = 'new-note'
      expect(() => requireUsedPlanReceipt(failure === 'empty' ? null as unknown as OutpatientPlanTemplate : receipt, viewed, viewed)).toThrow(/模板未带入/)
    })
  it('rejects a selection which was not part of the reviewed template', () => {
    const viewed = plan(), selection = structuredClone(viewed)
    selection.medications[0].quantity = 4
    expect(() => requireUsedPlanReceipt(viewed, viewed, selection)).toThrow(/勾选明细/)
  })
  it.each(['id', 'status', 'content', 'invalid-content', 'invalid-annotations', 'revision'])(
    'rejects a changed or invalid note receipt: %s', failure => {
      const viewed = note(), receipt = structuredClone(viewed)
      if (failure === 'id') receipt.id = 'other'
      if (failure === 'status') receipt.status = 'INACTIVE'
      if (failure === 'content') receipt.content.chiefComplaint = '未核对的新内容'
      if (failure === 'invalid-content') Object.assign(receipt.content, { chiefComplaint: 3 })
      if (failure === 'invalid-annotations') Object.assign(receipt.content, { annotations: 'not an array' })
      if (failure === 'revision') receipt.revision = -1
      expect(() => requireUsedNoteReceipt(receipt, viewed)).toThrow(/病历模板/)
    })
  it('accepts the same note content after the use counter increases', () => {
    const viewed = note(), receipt = { ...viewed, revision: 3, useCount: 2 }
    expect(requireUsedNoteReceipt(receipt, viewed)).toBe(receipt)
  })
  it.each(['missing', 'dose', 'quantity', 'scope', 'source'])(
    'does not acknowledge an incomplete or changed create receipt: %s', failure => {
      const receipt = plan(), input: SaveOutpatientPlanTemplateInput = structuredClone(receipt)
      if (failure === 'missing') receipt.medications = []
      if (failure === 'dose') receipt.medications[0].doseValue = 0
      if (failure === 'quantity') receipt.services[0].quantity = 2
      if (failure === 'scope') receipt.scopeType = 'HOSPITAL'
      if (failure === 'source') receipt.sourceType = 'AI_MINED'
      expect(() => requireCreatedPlanReceipt(receipt, input)).toThrow(/模板未带入/)
    })
  it('allows server-assigned line identities, while preserving all explicit clinical values', () => {
    const receipt = plan(), input: SaveOutpatientPlanTemplateInput = structuredClone(receipt)
    receipt.medications[0].lineId = 'new-server-line'
    expect(requireCreatedPlanReceipt(receipt, input)).toBe(receipt)
  })
  it('rejects an entire selection that overlaps existing draft orders', () => {
    const value = plan()
    expect(() => requireNoTemplateOrderConflicts(value, [], [{ id: 'draft', catalogItemId: 'service', itemCode: 'S1', itemName: '项目', quantity: 1 }]))
      .toThrow(/整批未带入/)
  })
})
