import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import { recordTextFields } from '../../../shared/api/recordAnnotations'
import type { Encounter } from '../../../shared/model'

/** Test server data only; successful saves explicitly persist both encounter and note snapshots. */
export function clinicalRecordSaveFixture(base: Encounter, input: Omit<ClinicalRecordInput, 'commandCode'>,
  currentVersion = 1, id = 'note-1') {
  const encounter: Encounter = { ...base, chiefComplaint: input.chiefComplaint.trim(),
    systolic: input.systolic, diastolic: input.diastolic,
    diagnoses: input.diagnoses.map((item, index) => ({ ...item, systemCode: item.codeSystem, sortOrder: index + 1 })) }
  const document: ClinicalDocument = { id, residentId: base.residentId, encounterId: base.id,
    organizationId: base.organizationId, departmentId: base.departmentId,
    documentType: 'OUTPATIENT_NOTE', instanceKey: 'DEFAULT', title: '门诊病历', status: 'DRAFT', currentVersion,
    contentSchema: input.noteFormVersionId ? 'RHN.OUTPATIENT_NOTE.V3' : 'RHN.OUTPATIENT_NOTE.V2',
    createdBy: 'test-doctor', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', history: [],
    content: {
      ...Object.fromEntries(recordTextFields.map(field => [field, input[field]?.trim() ?? ''])),
      vitalSigns: { systolic: input.systolic, diastolic: input.diastolic, temperature: input.temperature,
        pulseRate: input.pulseRate, respiratoryRate: input.respiratoryRate, heightCm: input.heightCm,
        weightKg: input.weightKg, oxygenSaturation: input.oxygenSaturation },
      diagnoses: encounter.diagnoses.map(({ code, display, type }) => ({ code, display, type })),
      annotations: (input.annotations ?? []).map(mark => ({ ...mark, confirmed: true,
        start: mark.start ?? (input[mark.field] ?? '').indexOf(mark.text) })),
      ...(input.noteFormVersionId ? { structuredForm: { versionId: input.noteFormVersionId, formCode: 'TEST',
        version: 1, name: '测试表单', specialtyCode: 'GENERAL_PRACTICE', definitionSchema: 'RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1' as const,
        sections: [], publishedAt: '2026-10-04T00:00:00Z' }, structuredData: input.structuredData ?? {} } : {}),
    } }
  return { encounter, document }
}
