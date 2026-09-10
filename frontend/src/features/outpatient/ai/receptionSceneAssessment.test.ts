import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assessReceptionScene } from './receptionSceneAssessment'
import type { Encounter } from '../../../shared/model'
import type { DiagnosticReport } from '../../../shared/api/diagnosticsApi'

const baseEncounter: Encounter = {
  id: 'enc-101',
  residentId: 'res-001',
  encounterNo: 'ENC-2026-0001',
  organizationId: 'org-001',
  departmentId: 'dept-001',
  registeredAt: '2026-09-09T08:00:00Z',
  status: 'IN_PROGRESS',
  visitType: 'GENERAL',
  chiefComplaint: '感冒发热3天',
  diagnoses: [],
}

describe('assessReceptionScene', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T10:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  it('identifies FIRST_VISIT for a new patient without chronic history or reports', () => {
    const assessment = assessReceptionScene({
      encounter: baseEncounter,
      historyEncounters: [],
      diagnosticReports: [],
      currentDraft: { chiefComplaint: '发热伴咳嗽3天' },
    })

    expect(assessment.scene).toBe('FIRST_VISIT')
    expect(assessment.sceneLabel).toBe('初诊全科接诊')
    expect(assessment.matchedConditions).toEqual([])
  })

  it('identifies CHRONIC_REFILL when patient has hypertension history and refill intent', () => {
    const assessment = assessReceptionScene({
      encounter: {
        ...baseEncounter,
        chiefComplaint: '高血压复查配药',
      },
      historyEncounters: [
        {
          ...baseEncounter,
          id: 'enc-100', status: 'COMPLETED',
          encounterNo: 'ENC-2026-0000',
          registeredAt: '2026-08-15T09:00:00Z',
          diagnoses: [
            { code: 'I10', display: '原发性高血压', type: 'PRIMARY' },
          ],
        },
      ],
      diagnosticReports: [],
      currentDraft: { chiefComplaint: '高血压复诊' },
    })

    expect(assessment.scene).toBe('CHRONIC_REFILL')
    expect(assessment.sceneLabel).toBe('慢病复诊配药')
    expect(assessment.matchedConditions).toContain('高血压')
  })

  it('identifies REPORT_FOLLOW_UP when patient has diagnostic reports with abnormal values', () => {
    const abnormalReport: DiagnosticReport = {
      id: 'rep-01',
      residentId: 'res-001',
      encounterId: 'enc-101',
      requestId: 'req-01',
      endpointCode: 'LIS',
      externalReportId: 'ext-01',
      reportVersion: 1,
      reportType: 'LABORATORY',
      reportCode: 'BC01',
      reportName: '全血细胞计数',
      status: 'FINAL',
      issuedAt: '2026-09-09T08:45:00Z',
      receivedAt: '2026-09-09T08:45:00Z',
      contentDigestAlgorithm: 'SHA-256',
      contentDigest: 'mock-digest',
      inboundMessageId: 'msg-01',
      observations: [
        {
          id: 'obs-01',
          sortOrder: 1,
          codeSystemUri: 'urn:iso:std:iso:11073:10101',
          observationCode: 'WBC',
          observationName: '白细胞计数',
          status: 'FINAL',
          valueType: 'NUMBER',
          effectiveAt: '2026-09-09T08:30:00Z',
          valueNumber: 13.5,
          referenceRangeLow: 4.0,
          referenceRangeHigh: 10.0,
          unitCode: '10^9/L',
        },
      ],
    }

    const assessment = assessReceptionScene({
      encounter: {
        ...baseEncounter,
        chiefComplaint: '看血常规化验结果',
      },
      historyEncounters: [],
      diagnosticReports: [abnormalReport],
      currentDraft: { chiefComplaint: '看化验结果' },
    })

    expect(assessment.scene).toBe('REPORT_FOLLOW_UP')
    expect(assessment.sceneLabel).toBe('报告回诊')
    expect(assessment.reportHighlights.length).toBeGreaterThan(0)
    expect(assessment.reportHighlights[0]).toContain('白细胞计数')
    expect(assessment.reportHighlights[0]).toContain('↑')
  })
})

describe('reception evidence boundaries', () => {
  const now = Date.parse('2026-09-09T10:00:00Z')
  const chronic = { ...baseEncounter, id: 'history', status: 'COMPLETED' as const,
    registeredAt: new Date(now - 30 * 86_400_000).toISOString(), diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' as const }] }
  const current = { ...baseEncounter, chiefComplaint: '' }
  it('excludes expired, future, unfinished, same-encounter and other-patient history', () => {
    for (const history of [{ ...chronic, registeredAt: new Date(now - 91 * 86_400_000).toISOString() },
      { ...chronic, registeredAt: new Date(now + 86_400_000).toISOString() }, { ...chronic, status: 'IN_PROGRESS' as const },
      { ...chronic, id: current.id }, { ...chronic, residentId: 'other-patient' }]) {
      expect(assessReceptionScene({ encounter: current, historyEncounters: [history], now }).scene).toBe('FIRST_VISIT')
    }
  })
  it('keeps new symptoms ahead of chronic history and does not infer diabetes from elevated glucose or a denial', () => {
    expect(assessReceptionScene({ encounter: baseEncounter, historyEncounters: [chronic], now }).scene).toBe('FIRST_VISIT')
    expect(assessReceptionScene({ encounter: current, currentDraft: { medicalHistory: '否认高血压、糖尿病，血糖升高待查' }, now }).matchedConditions).toEqual([])
    expect(assessReceptionScene({ encounter: current, currentDraft: { diagnoses: [{ code: 'E10', display: '1型糖尿病', type: 'PRIMARY' }] }, now }).matchedConditions).toEqual(['糖尿病'])
  })
  it('uses only the latest valid report and recognizes qualitative positives', () => {
    const report = { id: 'r1', residentId: current.residentId, encounterId: current.id, requestId: 'req', reportCode: 'LAB',
      reportVersion: 1, status: 'FINAL', reportName: '病原检测', observations: [{ id: 'o', status: 'FINAL',
        observationName: '病原', valueString: '阳性', interpretationCode: 'N' }] } as DiagnosticReport
    expect(assessReceptionScene({ encounter: current, diagnosticReports: [report], now }).scene).toBe('REPORT_FOLLOW_UP')
    const corrected = { ...report, id: 'r2', replacesReportId: 'r1', reportVersion: 2, status: 'CORRECTED' as const,
      observations: [{ ...report.observations[0], valueString: '阴性' }] }
    const assessment = assessReceptionScene({ encounter: current, diagnosticReports: [report, corrected], now })
    expect(assessment.reportHighlights).toEqual([])
    expect(assessment.selectedReportIds).toEqual(['r2'])
    expect(assessReceptionScene({ encounter: current, diagnosticReports: [{ ...report, residentId: 'other' }], now }).scene).toBe('FIRST_VISIT')
    expect(assessReceptionScene({ encounter: current, diagnosticReports: [{ ...report, encounterId: 'unrelated' }], now }).scene).toBe('FIRST_VISIT')
  })
  it('recognizes a normal report with explicit follow-up intent from a recent associated encounter', () => {
    const report = { id: 'r', residentId: current.residentId, encounterId: chronic.id, requestId: 'req', reportCode: 'LAB',
      reportVersion: 1, status: 'FINAL', reportName: '血常规', observations: [] } as unknown as DiagnosticReport
    const assessment = assessReceptionScene({ encounter: { ...current, chiefComplaint: '看检查报告' },
      historyEncounters: [{ ...chronic, registeredAt: new Date(now - 7 * 86_400_000).toISOString() }], diagnosticReports: [report], now })
    expect(assessment.scene).toBe('REPORT_FOLLOW_UP')
    expect(assessment.selectedReportIds).toEqual(['r'])
  })
})
