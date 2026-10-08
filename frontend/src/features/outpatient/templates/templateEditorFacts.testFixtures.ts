import type { ClinicalMedicationStandards } from '../../../shared/api/masterDataApi'

export function editorStandardsFixture(): ClinicalMedicationStandards {
  return { version: '1', doseUnits: [{ id: 'g', code: 'g', display: '克', dimension: 'MASS', canonicalUnit: 'g', conversionFactor: 1, semanticVersion: 1 }],
    routes: [{ id: 'po', code: 'PO', name: '口服', systemCode: 'ROUTE', systemVersion: '1', executionType: 'ADMINISTRATION' }],
    frequencies: ['BID', 'TID'].map((code, i) => ({ id: code, code, name: i ? '每日三次' : '每日两次', standard: {
      system: 'FREQUENCY', version: '1', conceptId: code, status: 'ACTIVE', interpretation: {
        kind: 'REGULAR', dailyRateComputable: true, doses: i + 2, perDays: 1, unknownReason: null,
      },
    } })) }
}
