import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientAdmissionDiagnosis, InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientAdmissionDiagnosisPanel } from './InpatientAdmissionDiagnosisPanel'

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 2, episodeNo: 'ZY001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', organizationId: 'org-1',
  departmentId: 'ward-1', departmentName: '综合病区', encounterId: 'encounter-1', encounterNo: 'E001',
  bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-31T08:00:00+08:00',
}

describe('InpatientAdmissionDiagnosisPanel', () => {
  it('saves a provisional admission diagnosis as confirmed', async () => {
    const diagnosis: InpatientAdmissionDiagnosis = {
      id: 'diagnosis-1', diagnosisStage: 'ADMISSION', code: 'J18.9', display: '肺炎，未特指',
      diagnosisType: 'PRIMARY', verificationStatus: 'PROVISIONAL', diagnosisStatus: 'ACTIVE',
    }
    const saveAdmissionDiagnoses = vi.fn().mockResolvedValue({
      episodeId: episode.id, encounterId: episode.encounterId,
      diagnoses: [{ ...diagnosis, verificationStatus: 'CONFIRMED' }],
    })
    const api = { inpatient: {
      admissionDiagnoses: vi.fn().mockResolvedValue({
        episodeId: episode.id, encounterId: episode.encounterId, diagnoses: [diagnosis],
      }),
      saveAdmissionDiagnoses,
    } } as unknown as RhnApi
    vi.stubGlobal('crypto', { randomUUID: () => 'diagnosis-save' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <InpatientAdmissionDiagnosisPanel api={api} episode={episode} />
    </QueryClientProvider>)

    await userEvent.click(await screen.findByRole('combobox', { name: '诊断确认状态 肺炎，未特指' }))
    await userEvent.click(screen.getByRole('option', { name: '已确认' }))
    await userEvent.click(screen.getByRole('button', { name: '保存诊断' }))

    await waitFor(() => expect(saveAdmissionDiagnoses).toHaveBeenCalledWith(episode.id, {
      expectedEpisodeRevision: 2,
      diagnoses: [{ code: 'J18.9', display: '肺炎，未特指', diagnosisType: 'PRIMARY',
        verificationStatus: 'CONFIRMED' }],
      commandCode: 'ADMISSION-DIAGNOSIS-diagnosis-save',
    }))
  })
})
