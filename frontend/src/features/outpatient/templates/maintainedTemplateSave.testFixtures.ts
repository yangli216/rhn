import type { SaveOutpatientNoteTemplateInput, OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'

export function maintainedPlanFixture(): OutpatientPlanTemplate {
  return { id: 'plan', revision: 3, scopeType: 'PERSONAL', name: '复诊方案', status: 'ACTIVE', sourceType: 'MANUAL',
    sortOrder: 7, useCount: 5, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
    diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' }],
    medications: [{ lineId: 'line', medicationId: 'med', medicationName: '测试药品', medicationCode: 'M1',
      editorMode: 'regular', categoryCode: 'WESTERN', quantity: 2, quantityUnit: '片', substitutionAllowed: false, selfProvided: true }],
    services: [], tasks: [] }
}
export function maintainedNoteReceipt(input: SaveOutpatientNoteTemplateInput): OutpatientNoteTemplate {
  return { ...input, id: 'note', revision: 1, specialtyCode: input.specialtyCode!, sortOrder: input.sortOrder!, useCount: 0,
    status: 'ACTIVE', documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
    createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
}
