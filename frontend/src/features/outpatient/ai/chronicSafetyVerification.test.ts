import { describe, it, expect } from 'vitest'
import { assessChronicMedicationSafety } from './chronicSafetyVerification'
import type { DiagnosticReport } from '../../../shared/api/diagnosticsApi'

const now = Date.parse('2026-10-13T10:00:00Z')

function createReport({
  code,
  name,
  value,
  high = 5.2,
  low = 3.5,
  unit = 'mmol/L',
  daysAgo = 5,
}: {
  code: string
  name: string
  value: number
  high?: number
  low?: number
  unit?: string
  daysAgo?: number
}): DiagnosticReport {
  const issuedAt = new Date(now - daysAgo * 86_400_000).toISOString()
  return {
    id: `rep-${code}`,
    residentId: 'res-1',
    encounterId: 'enc-1',
    requestId: 'req-1',
    endpointCode: 'LIS',
    externalReportId: 'ext-1',
    reportVersion: 1,
    reportType: 'LABORATORY',
    reportCode: 'BIOCHEM',
    reportName: '生化检验',
    status: 'FINAL',
    issuedAt,
    receivedAt: issuedAt,
    contentDigestAlgorithm: 'SHA-256',
    contentDigest: 'mock',
    inboundMessageId: 'msg-1',
    observations: [
      {
        id: `obs-${code}`,
        sortOrder: 1,
        codeSystemUri: 'urn:iso',
        observationCode: code,
        observationName: name,
        status: 'FINAL',
        valueType: 'NUMBER',
        valueNumber: value,
        referenceRangeLow: low,
        referenceRangeHigh: high,
        unitCode: unit,
        effectiveAt: issuedAt,
      },
    ],
  }
}

describe('assessChronicMedicationSafety', () => {
  it('flags CRITICAL for elevated potassium with ARB/ACEI medications', () => {
    const kReport = createReport({
      code: 'K+',
      name: '血清钾',
      value: 5.6,
      high: 5.2,
      daysAgo: 10,
    })

    const assessment = assessChronicMedicationSafety({
      medications: [{ medicationName: '氯沙坦钾片 50mg' }],
      reports: [kReport],
      now,
    })

    expect(assessment.overallStatus).toBe('CRITICAL')
    expect(assessment.hasCriticalBlockers).toBe(true)
    const alert = assessment.alerts.find((a) => a.ruleCode === 'HYPERKALEMIA_RISK')
    expect(alert).toBeDefined()
    expect(alert?.detail).toContain('5.6')
    expect(alert?.relatedMedication).toBe('氯沙坦钾片 50mg')
    expect(assessment.suggestedLabOrderNames).toContain('血清电解质测定')
  })

  it('flags CRITICAL for impaired eGFR with Metformin', () => {
    const egfrReport = createReport({
      code: 'EGFR',
      name: '估算肾小球滤过率',
      value: 38,
      low: 60,
      high: 120,
      unit: 'mL/min',
      daysAgo: 20,
    })

    const assessment = assessChronicMedicationSafety({
      medications: [{ medicationName: '盐酸二甲双胍片 0.5g' }],
      reports: [egfrReport],
      now,
    })

    expect(assessment.overallStatus).toBe('CRITICAL')
    const alert = assessment.alerts.find((a) => a.ruleCode === 'RENAL_RISK')
    expect(alert).toBeDefined()
    expect(alert?.detail).toContain('38')
    expect(assessment.suggestedLabOrderNames).toContain('肾功能全套 (含eGFR)')
  })

  it('flags CRITICAL for 3x elevated ALT with Atorvastatin', () => {
    const altReport = createReport({
      code: 'ALT',
      name: '丙氨酸氨基转移酶',
      value: 165,
      high: 50,
      unit: 'U/L',
      daysAgo: 7,
    })

    const assessment = assessChronicMedicationSafety({
      medications: [{ medicationName: '阿托伐他汀钙片 20mg' }],
      reports: [altReport],
      now,
    })

    expect(assessment.overallStatus).toBe('CRITICAL')
    const alert = assessment.alerts.find((a) => a.ruleCode === 'HEPATIC_RISK')
    expect(alert).toBeDefined()
    expect(alert?.detail).toContain('165')
  })

  it('flags WARNING for overdue lab tests (> 180 days) when metrics are missing', () => {
    const assessment = assessChronicMedicationSafety({
      medications: [
        { medicationName: '苯磺酸氨氯地平片 5mg' },
        { medicationName: '盐酸二甲双胍片 0.5g' },
      ],
      reports: [],
      now,
    })

    expect(assessment.overallStatus).toBe('WARNING')
    expect(assessment.hasCriticalBlockers).toBe(false)
    expect(assessment.alerts.some((a) => a.ruleCode === 'MONITORING_OVERDUE')).toBe(true)
    expect(assessment.suggestedLabOrderNames).toContain('肾功能+电解质')
    expect(assessment.suggestedLabOrderNames).toContain('糖化血红蛋白 (HbA1c)')
  })

  it('returns SAFE when all relevant lab metrics are normal and fresh', () => {
    const normalK = createReport({ code: 'K', name: '血清钾', value: 4.2, high: 5.2, daysAgo: 15 })
    const normalCr = createReport({ code: 'CR', name: '血清肌酐', value: 75, high: 110, daysAgo: 15 })
    const normalHb = createReport({ code: 'HBA1C', name: '糖化血红蛋白', value: 6.5, high: 7.0, daysAgo: 30 })

    const assessment = assessChronicMedicationSafety({
      medications: [
        { medicationName: '氯沙坦钾片 50mg' },
        { medicationName: '盐酸二甲双胍片 0.5g' },
      ],
      reports: [normalK, normalCr, normalHb],
      now,
    })

    expect(assessment.overallStatus).toBe('SAFE')
    expect(assessment.hasCriticalBlockers).toBe(false)
    expect(assessment.alerts[0].ruleCode).toBe('STABLE_METRICS')
  })

  it('matches drug classes accurately using ATC codes and trade brand names', () => {
    const kReport = createReport({
      code: 'K',
      name: '血清钾',
      value: 5.8,
      high: 5.2,
      daysAgo: 5,
    })

    // Drug name is just a brand code without generic keywords in the string
    const assessment = assessChronicMedicationSafety({
      medications: [
        {
          medicationName: '安博诺', // Irbesartan/HCTZ compound brand name
          atcCode: 'C09DA04',
        },
      ],
      reports: [kReport],
      now,
    })

    expect(assessment.overallStatus).toBe('CRITICAL')
    expect(assessment.alerts[0].ruleCode).toBe('HYPERKALEMIA_RISK')
  })

  it('respects customized policy configurations', () => {
    const altReport = createReport({
      code: 'ALT',
      name: '丙氨酸氨基转移酶',
      value: 90,
      high: 50,
      unit: 'U/L',
      daysAgo: 10,
    })

    // Under default policy (3.0x, 90 < 150), this would not trigger critical.
    // Under a strict clinical policy of 1.5x (50 * 1.5 = 75), it triggers critical.
    const strictAssessment = assessChronicMedicationSafety({
      medications: [{ medicationName: '立普妥 20mg' }],
      reports: [altReport],
      policy: { hepaticElevationMultiple: 1.5 },
      now,
    })

    expect(strictAssessment.overallStatus).toBe('CRITICAL')
    expect(strictAssessment.alerts[0].ruleCode).toBe('HEPATIC_RISK')
  })
})
