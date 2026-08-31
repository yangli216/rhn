import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CriticalValueAlert, DiagnosticReport } from '../../shared/api/diagnosticsApi'
import type { InpatientEpisode, InpatientShiftHandoff } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientDiagnosticResults } from './InpatientDiagnosticResults'
import { InpatientNursingWorkspace } from './InpatientNursingWorkspace'
import { InpatientShiftHandoffWorkspace } from './InpatientShiftHandoffWorkspace'

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 0, episodeNo: 'IP20260831001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', organizationId: 'org-1',
  departmentId: 'ward-1', departmentName: '综合病区', encounterId: 'encounter-1', encounterNo: 'E001',
  bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-31T08:00:00+08:00',
}

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

describe('InpatientNursingWorkspace', () => {
  it('records compact nursing and assessment facts with shared form controls', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'command-1' })
    const appendNursingRecord = vi.fn().mockResolvedValue({ id: 'record-1' })
    const api = { inpatient: {
      nursingRecords: vi.fn().mockResolvedValue([]), appendNursingRecord,
    } } as unknown as RhnApi
    renderWithQuery(<InpatientNursingWorkspace api={api} episode={episode} />)

    await userEvent.click(await screen.findByRole('button', { name: '新增护理记录' }))
    await userEvent.type(screen.getByLabelText('病情观察'), '患者神志清，主诉轻微咳嗽')
    await userEvent.type(screen.getByLabelText('护理记录体温'), '37.8')
    await userEvent.click(screen.getByRole('button', { name: '保存护理事实' }))
    await waitFor(() => expect(appendNursingRecord).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      recordType: 'CONDITION', content: expect.objectContaining({ observation: '患者神志清，主诉轻微咳嗽' }),
      observationSummary: expect.objectContaining({ temperatureCelsius: 37.8 }), commandCode: 'IP-NURSING-command-1',
    })))

    await userEvent.click(screen.getByRole('tab', { name: /入院评估/ }))
    await userEvent.click(screen.getByRole('button', { name: '新增护理评估' }))
    await userEvent.click(screen.getByLabelText('自理能力'))
    await userEvent.click(screen.getByRole('option', { name: '部分协助' }))
    await userEvent.click(screen.getByLabelText('跌倒风险'))
    await userEvent.click(screen.getByRole('option', { name: '高' }))
    await userEvent.type(screen.getByLabelText('护理评估结论'), '步态不稳，活动时需陪同')
    await userEvent.click(screen.getByRole('button', { name: '保存评估事实' }))
    await waitFor(() => expect(appendNursingRecord).toHaveBeenCalledWith(episode.id, expect.objectContaining({
      recordType: 'ASSESSMENT', assessment: expect.objectContaining({
        assessmentType: 'ADMISSION', selfCareLevel: 'PARTIAL_ASSISTANCE', fallRiskLevel: 'HIGH',
        conclusion: '步态不稳，活动时需陪同',
      }), commandCode: 'IP-NURSING-ASSESSMENT-command-1',
    })))
  })
})

describe('InpatientShiftHandoffWorkspace', () => {
  it('presents and signs a ward-level shift handoff', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'command-1' })
    const handoff: InpatientShiftHandoff = {
      id: 'handoff-1', revision: 0, organizationId: 'org-1', departmentId: 'ward-1',
      from: '2026-08-31T08:00:00+08:00', to: '2026-08-31T16:00:00+08:00', wardSummary: '病区平稳',
      generalItems: [], status: 'DRAFT', createdBySubjectId: 'user-1', creatorName: '护士甲',
      createdAt: '2026-08-31T08:00:00+08:00', updatedAt: '2026-08-31T08:00:00+08:00',
      contentDigestAlgorithm: 'SM3', contentDigest: 'digest', integrityEvidenceId: 'evidence-1', signatures: [],
      patients: [{ id: 'item-1', episodeId: episode.id, encounterId: episode.encounterId,
        residentId: episode.residentId, residentName: episode.residentName, bedNo: episode.bedNo,
        situation: '病情平稳，继续观察', pendingActions: ['复测体温'], riskFlags: [], sortOrder: 0 }],
    }
    const submitShiftHandoff = vi.fn().mockResolvedValue({ ...handoff, status: 'SUBMITTED' })
    const api = { inpatient: {
      shiftHandoffs: vi.fn().mockResolvedValue([handoff]), createShiftHandoff: vi.fn(),
      submitShiftHandoff, acceptShiftHandoff: vi.fn(),
    } } as unknown as RhnApi
    renderWithQuery(<InpatientShiftHandoffWorkspace api={api} episodes={[episode]} />)

    expect(await screen.findByRole('heading', { name: '病区交接班' })).toBeInTheDocument()
    expect(await screen.findByText(/复测体温/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '交班签署' }))
    await waitFor(() => expect(submitShiftHandoff).toHaveBeenCalledWith('handoff-1', 'IP-HANDOVER-command-1'))
  })
})

describe('InpatientDiagnosticResults', () => {
  it('shows final inpatient reports and highlights abnormal observations', async () => {
    const report: DiagnosticReport = {
      id: 'report-1', residentId: episode.residentId, encounterId: episode.encounterId, requestId: 'request-1',
      endpointCode: 'LIS', externalReportId: 'LIS-1', reportVersion: 1, reportType: 'LABORATORY', status: 'FINAL',
      reportCode: 'CBC', reportName: '血细胞分析', issuedAt: '2026-08-31T10:00:00+08:00',
      receivedAt: '2026-08-31T10:01:00+08:00', conclusion: '白细胞轻度升高', authorName: '检验科',
      contentDigestAlgorithm: 'SM3', contentDigest: 'digest', inboundMessageId: 'message-1',
      observations: [{ id: 'obs-1', sortOrder: 1, codeSystemUri: 'http://loinc.org', observationCode: 'WBC',
        observationName: '白细胞计数', status: 'FINAL', valueType: 'NUMBER', effectiveAt: '2026-08-31T09:58:00+08:00',
        valueNumber: 12.6, unitCode: '10^9/L', referenceRangeLow: 3.5, referenceRangeHigh: 9.5,
        interpretationCode: 'H' }],
    }
    const api = { diagnostics: {
      reportsByEncounter: vi.fn().mockResolvedValue([report]),
      criticalValues: { active: vi.fn().mockResolvedValue([]) },
    } } as unknown as RhnApi
    const { container } = renderWithQuery(<InpatientDiagnosticResults api={api} episode={episode} />)

    expect(await screen.findByText('血细胞分析')).toBeInTheDocument()
    expect(screen.getByText('白细胞轻度升高')).toBeInTheDocument()
    expect(screen.getByText('12.6 10^9/L')).toBeInTheDocument()
    expect(container.querySelector('.is-abnormal')).toBeInTheDocument()
  })

  it('lets the current ward acknowledge an inpatient critical value', async () => {
    const alert: CriticalValueAlert = {
      id: 'critical-1', revision: 0, reportId: 'report-1', observationId: 'obs-1',
      residentId: episode.residentId, encounterId: episode.encounterId, requestId: 'request-1',
      organizationId: episode.organizationId, departmentId: episode.departmentId, recipientUserId: 'doctor-1',
      severity: 'CRITICAL', observationCode: 'K', observationName: '血钾',
      triggerEvidence: '血钾=6.8 mmol/L，标记=HH', status: 'OPEN',
      detectedAt: '2026-08-31T10:00:00+08:00', acknowledgeDeadlineAt: '2026-08-31T10:15:00+08:00',
      escalationLevel: 0,
    }
    const acknowledge = vi.fn().mockResolvedValue({ ...alert, revision: 1, status: 'ACKNOWLEDGED' })
    const api = { diagnostics: {
      reportsByEncounter: vi.fn().mockResolvedValue([]),
      criticalValues: { active: vi.fn().mockResolvedValue([alert]), acknowledge, close: vi.fn() },
    } } as unknown as RhnApi
    renderWithQuery(<InpatientDiagnosticResults api={api} episode={episode} />)

    expect(await screen.findByText('血钾=6.8 mmol/L，标记=HH')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('确认说明'), '已电话通知值班医生')
    await userEvent.click(screen.getByRole('button', { name: '确认已知晓' }))
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith(
      alert.id, 0, '已电话通知值班医生',
    ))
  })
})
