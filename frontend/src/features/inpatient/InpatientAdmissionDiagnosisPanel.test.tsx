import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InpatientAdmissionDiagnosis, InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientAdmissionDiagnosisPanel } from './InpatientAdmissionDiagnosisPanel'

vi.mock('../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/ui')>(),
  ClinicalResourceSearch: ({ onChange }: { onChange: (value: unknown) => void }) =>
    <button onClick={() => onChange({ id: '362387869795067', label: '消渴病', raw: {
      id: '362387869795067', code: 'XK_BING', display: '消渴病', sdDiagnosisDomain: 'TCM_DISEASE',
    } })}>选择中医目录诊断</button>,
}))

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 2, episodeNo: 'ZY001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', organizationId: 'org-1',
  departmentId: 'ward-1', departmentName: '综合病区', encounterId: 'encounter-1', encounterNo: 'E001',
  bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-31T08:00:00+08:00',
}

describe('InpatientAdmissionDiagnosisPanel', () => {
  it('saves a provisional admission diagnosis as confirmed', async () => {
    const diagnosis: InpatientAdmissionDiagnosis = {
      id: 'diagnosis-1', conceptId: 'disease-pneumonia', diagnosisDomain: 'WESTERN_MEDICINE', diagnosisStage: 'ADMISSION', code: 'J18.9', display: '肺炎，未特指',
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
        verificationStatus: 'CONFIRMED', conceptId: 'disease-pneumonia', diagnosisDomain: 'WESTERN_MEDICINE' }],
      commandCode: 'ADMISSION-DIAGNOSIS-diagnosis-save',
    }))
  })
  it('carries the selected catalog concept and TCM domain into the admission save request', async () => {
    const saved = { diagnosisStage: 'ADMISSION', code: 'XK_BING', display: '消渴病',
      conceptId: '362387869795067', diagnosisDomain: 'TCM_DISEASE', diagnosisType: 'PRIMARY', verificationStatus: 'PROVISIONAL' }
    const saveAdmissionDiagnoses = vi.fn().mockResolvedValue({ diagnoses: [saved] })
    const api = { inpatient: { admissionDiagnoses: vi.fn().mockResolvedValue({ diagnoses: [] }), saveAdmissionDiagnoses } } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><InpatientAdmissionDiagnosisPanel api={api} episode={episode} /></QueryClientProvider>)
    await userEvent.click(await screen.findByRole('button', { name: '选择中医目录诊断' }))
    await userEvent.click(screen.getByRole('button', { name: '添加诊断' }))
    expect(screen.getByText(/中医病名/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存诊断' }))
    await waitFor(() => expect(saveAdmissionDiagnoses).toHaveBeenCalledWith(episode.id, expect.objectContaining({ diagnoses: [{
      code: 'XK_BING', display: '消渴病', conceptId: '362387869795067', diagnosisDomain: 'TCM_DISEASE',
      diagnosisType: 'PRIMARY', verificationStatus: 'PROVISIONAL',
    }] })))
  })

  it('displays unknown historical domain without inventing western medicine', async () => {
    const api = { inpatient: { admissionDiagnoses: vi.fn().mockResolvedValue({ diagnoses: [{
      code: 'HISTORY', display: '历史诊断', diagnosisType: 'PRIMARY', verificationStatus: 'PROVISIONAL', diagnosisDomain: null,
    }] }) } } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><InpatientAdmissionDiagnosisPanel api={api} episode={episode} variant="summary" /></QueryClientProvider>)
    expect(await screen.findByText(/体系待确认/)).toBeInTheDocument()
    expect(screen.queryByText(/西医诊断/)).not.toBeInTheDocument()
  })

})
