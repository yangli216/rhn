import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InpatientMedicalRecordWorkspace } from './InpatientMedicalRecordWorkspace'

const editorMock = vi.hoisted(() => ({ validationErrors: [] as Array<{ fieldId: string; label: string; message: string }> }))

vi.mock('./CanvasMedicalRecordEditor', async () => {
  const React = await import('react')
  return {
    CanvasMedicalRecordEditor: ({ readOnly, onSnapshot }: {
      readOnly: boolean
      onSnapshot: (value: unknown) => void
    }) => {
      React.useEffect(() => {
        onSnapshot({
          editorVersion: '0.9.133', editorData: { header: [], main: [], footer: [] },
          plainText: '病历正文', structuredValues: {}, validationErrors: editorMock.validationErrors, changed: false,
        })
      }, [])
      return React.createElement('div', { 'data-testid': 'medical-record-editor', 'data-readonly': readOnly }, '病历编辑器')
    },
  }
})

const episode: InpatientEpisode = {
  id: 'episode-1', revision: 1, episodeNo: 'ZY20260830001', status: 'ADMITTED', residentId: 'resident-1',
  residentName: '张三', healthRecordNo: 'HR001', gender: 'MALE', birthDate: '1980-01-01',
  organizationId: 'org-1', departmentId: 'dept-1', departmentName: '综合病区', encounterId: 'encounter-1',
  encounterNo: 'E001', bedId: 'bed-1', bedNo: '01床', admittedAt: '2026-08-30T08:00:00+08:00',
}

function documentFixture(overrides: Partial<ClinicalDocument> = {}): ClinicalDocument {
  return {
    id: 'document-1', residentId: episode.residentId, encounterId: episode.encounterId,
    organizationId: episode.organizationId, departmentId: episode.departmentId,
    documentType: 'INPATIENT_ADMISSION_RECORD', instanceKey: 'DEFAULT', title: '张三 入院记录',
    status: 'DRAFT', currentVersion: 1, contentSchema: 'RHN.CANVAS_EDITOR_DOCUMENT.V1',
    content: {
      editorVersion: '0.9.133', templateId: 'rhn-inpatient-admission', templateVersion: '1.1.0',
      editorData: { header: [], main: [], footer: [] }, plainText: '病历正文', structuredValues: {},
    },
    createdBy: 'doctor-1', createdAt: '2026-08-30T08:10:00+08:00', updatedAt: '2026-08-30T08:10:00+08:00',
    history: [{
      version: 1, changeType: 'CREATE', changeReason: '创建病历', createdBy: 'doctor-1',
      createdAt: '2026-08-30T08:10:00+08:00',
    }],
    ...overrides,
  }
}

function mockApi(documents: ClinicalDocument[]) {
  const created = documentFixture({
    id: 'document-created', documentType: 'INPATIENT_DAILY_PROGRESS_NOTE', instanceKey: 'PROGRESS-new',
    title: '张三 日常病程',
  })
  return {
    clinicalDocuments: {
      byEncounter: vi.fn().mockResolvedValue(documents),
      create: vi.fn().mockResolvedValue(created),
      updateDraft: vi.fn(),
      sign: vi.fn(),
      amend: vi.fn().mockResolvedValue(documentFixture({ status: 'AMENDMENT_IN_PROGRESS', currentVersion: 2 })),
    },
  } as unknown as RhnApi
}

function renderWorkspace(api: RhnApi, value = episode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>
    <InpatientMedicalRecordWorkspace api={api} episode={value} organizationName="基层医疗机构" />
  </QueryClientProvider>)
}

describe('InpatientMedicalRecordWorkspace', () => {
  beforeEach(() => { editorMock.validationErrors = [] })

  it('keeps daily progress type stable while creating and switching multiple document instances', async () => {
    const dailyMorning = documentFixture({
      id: 'daily-am', documentType: 'INPATIENT_DAILY_PROGRESS_NOTE', instanceKey: 'PROGRESS-AM',
      title: '上午病程', updatedAt: '2026-08-30T09:00:00+08:00', createdAt: '2026-08-30T09:00:00+08:00',
    })
    const dailyEvening = documentFixture({
      id: 'daily-pm', documentType: 'INPATIENT_DAILY_PROGRESS_NOTE', instanceKey: 'PROGRESS-PM',
      title: '下午病程', status: 'SIGNED', updatedAt: '2026-08-30T17:00:00+08:00',
      createdAt: '2026-08-30T17:00:00+08:00',
    })
    const api = mockApi([dailyMorning, dailyEvening])
    renderWorkspace(api)

    await userEvent.click(await screen.findByRole('tab', { name: /日常病程/ }))
    expect(screen.getByText('2份')).toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: '选择日常病程' })
    await userEvent.click(picker)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await userEvent.click(screen.getByRole('option', { name: /08\/30 09:00/ }))
    expect(picker).toHaveTextContent(/08\/30 09:00/)

    await userEvent.click(screen.getByRole('button', { name: '新建病程' }))
    await userEvent.click(await screen.findByRole('button', { name: '保存病历' }))
    await waitFor(() => expect(api.clinicalDocuments.create).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'INPATIENT_DAILY_PROGRESS_NOTE',
      instanceKey: expect.stringMatching(/^PROGRESS-/),
    })))
  })

  it('starts a reasoned amendment from signed content and exposes version evidence as read-only history', async () => {
    const signed = documentFixture({
      status: 'SIGNED', currentVersion: 1,
      history: [{
        version: 1, changeType: 'CREATE', changeReason: '创建并完成入院记录', createdBy: 'doctor-1',
        createdAt: '2026-08-30T08:10:00+08:00', signedBy: 'doctor-1', signedAt: '2026-08-30T08:20:00+08:00',
        signatureMeaning: 'AUTHOR', signatureEvidenceId: 'evidence-1', integrityEvidenceId: 'integrity-1',
      }],
    })
    const api = mockApi([signed])
    renderWorkspace(api)

    expect(await screen.findByText('版本记录（1）')).toBeInTheDocument()
    expect(screen.getByTestId('medical-record-editor')).toHaveAttribute('data-readonly', 'true')
    await userEvent.click(screen.getByRole('button', { name: '发起修订' }))
    await userEvent.type(screen.getByLabelText('修订原因'), '补充入院时查体')
    await userEvent.click(screen.getByRole('button', { name: '创建修订版本' }))

    await waitFor(() => expect(api.clinicalDocuments.amend).toHaveBeenCalledWith(signed.id, expect.objectContaining({
      expectedCurrentVersion: 1, changeReason: '补充入院时查体',
    })))
  })

  it('locks all authoring actions after discharge', async () => {
    const api = mockApi([documentFixture()])
    renderWorkspace(api, { ...episode, status: 'DISCHARGED', dischargedAt: '2026-08-31T10:00:00+08:00' })

    expect(await screen.findByText('该住院患者已出院，病历仅供查看，不能再新增、修改或签署。')).toBeInTheDocument()
    expect(screen.getByTestId('medical-record-editor')).toHaveAttribute('data-readonly', 'true')
    expect(screen.queryByRole('button', { name: '保存病历' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签署' })).not.toBeInTheDocument()
  })

  it('allows an incomplete draft to be saved but blocks signature until required fields are complete', async () => {
    editorMock.validationErrors = [{ fieldId: 'chiefComplaint', label: '主诉', message: '主诉为必填项' }]
    const api = mockApi([documentFixture()])
    renderWorkspace(api)

    expect(await screen.findByText('草稿可以继续保存；签署前请完成：主诉。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '签署' })).toBeDisabled()
  })
})
