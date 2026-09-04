import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { Encounter, Resident } from '../../shared/model'
import type { ReceptionQueueItem, RhnApi } from '../../shared/rhnApi'
import { DoctorWorkstation } from './DoctorWorkstation'

const mockResident: Resident = {
  id: 'resident-1',
  fullName: '张建国',
  gender: 'MALE',
  birthDate: '1975-06-15',
  healthRecordNo: 'HR362387869900101',
  phone: '13800000001',
  idCardNo: '320101197506151234',
  maskedNationalId: '320101********1234',
  address: '南京市玄武区测试路 1 号',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
} as unknown as Resident

const mockRegisteredEncounter: Encounter = {
  id: 'encounter-101',
  encounterNo: 'ENC20260902001',
  residentId: 'resident-1',
  status: 'REGISTERED',
  visitType: 'GENERAL',
  chiefComplaint: '',
  presentIllness: '',
  medicalHistory: '',
  physicalExam: '',
  treatmentPlan: '',
  vitalSigns: { systolic: 120, diastolic: 80 },
  diagnoses: [],
  createdAt: '2026-09-02T08:00:00Z',
  updatedAt: '2026-09-02T08:00:00Z',
  version: 1,
} as unknown as Encounter

const mockInProgressEncounter: Encounter = {
  ...mockRegisteredEncounter,
  status: 'IN_PROGRESS',
} as unknown as Encounter

const mockSuspendedEncounter: Encounter = {
  ...mockRegisteredEncounter,
  status: 'SUSPENDED',
} as unknown as Encounter

const mockQueueItem: ReceptionQueueItem = {
  registrationId: 'reg-1',
  scheduleId: 'sch-1',
  encounterId: 'encounter-101',
  residentId: 'resident-1',
  healthRecordNo: 'HR362387869900101',
  residentName: '张建国',
  gender: 'MALE',
  birthDate: '1975-06-15',
  registrationNo: 'REG20260902001',
  ticketNo: 'A001',
  sequenceNo: 1,
  priority: 0,
  registrationSource: 'DIRECT',
  visitType: 'GENERAL',
  registrationStatus: 'REGISTERED',
  status: 'WAITING',
  practitionerName: '测试医生',
  serviceName: '普通门诊',
  locationName: '诊室 1',
  registeredAt: '2026-09-02T08:00:00Z',
}

const clinicalContext: ClinicalContext = {
  organization: { id: 'org-1', name: '基层社区卫生服务中心' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

function createMockApi({
  initialEncounterStatus = 'REGISTERED', queueStatus = 'WAITING', startFn = vi.fn(), resumeFn = vi.fn(),
}: {
  initialEncounterStatus?: 'REGISTERED' | 'IN_PROGRESS' | 'SUSPENDED'
  queueStatus?: ReceptionQueueItem['status']
  startFn?: ReturnType<typeof vi.fn>
  resumeFn?: ReturnType<typeof vi.fn>
} = {}) {
  let encounterStatus = initialEncounterStatus

  const startMock = startFn.mockImplementation(() => {
    encounterStatus = 'IN_PROGRESS'
    return Promise.resolve(mockInProgressEncounter)
  })
  const resumeMock = resumeFn.mockImplementation(() => {
    encounterStatus = 'IN_PROGRESS'
    return Promise.resolve(mockInProgressEncounter)
  })

  return {
    scheduling: {
      receptionQueue: vi.fn().mockResolvedValue([{ ...mockQueueItem, status: queueStatus }]),
    },
    outpatientReferrals: {
      inbox: vi.fn().mockResolvedValue([]),
    },
    residents: {
      get: vi.fn().mockResolvedValue(mockResident),
      allergies: vi.fn().mockResolvedValue([]),
      conditions: vi.fn().mockResolvedValue([]),
      medications: vi.fn().mockResolvedValue([]),
      familyMembers: vi.fn().mockResolvedValue([]),
      socialRelations: vi.fn().mockResolvedValue([]),
    },
    encounters: {
      byResident: vi.fn().mockImplementation(() =>
        Promise.resolve([encounterStatus === 'REGISTERED' ? mockRegisteredEncounter
          : encounterStatus === 'SUSPENDED' ? mockSuspendedEncounter : mockInProgressEncounter])
      ),
      start: startMock,
      complete: vi.fn(),
      suspend: vi.fn(),
      resume: resumeMock,
    },
    clinicalDocuments: {
      byEncounter: vi.fn().mockResolvedValue([]),
      activeTemplates: vi.fn().mockResolvedValue([]),
    },
    outpatientNoteForms: {
      list: vi.fn().mockResolvedValue([]),
    },
    outpatientNoteTemplates: {
      list: vi.fn().mockResolvedValue([{
        id: 'note-template-1', revision: 1, scopeType: 'PERSONAL', name: '常规复诊',
        description: '适用于慢病常规复诊', specialtyCode: 'GENERAL_PRACTICE',
        documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
        content: { chiefComplaint: '复诊', presentIllness: '病情平稳' }, status: 'ACTIVE',
        sortOrder: 0, useCount: 3, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      }]),
      use: vi.fn().mockImplementation((id: string) => Promise.resolve({
        id, revision: 1, scopeType: 'PERSONAL', name: '常规复诊',
        description: '适用于慢病常规复诊', specialtyCode: 'GENERAL_PRACTICE',
        documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
        content: { chiefComplaint: '复诊', presentIllness: '病情平稳' }, status: 'ACTIVE',
        sortOrder: 0, useCount: 4, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      })),
      create: vi.fn(),
    },
    unifiedOrders: {
      list: vi.fn().mockResolvedValue([]),
      serviceDefinitions: vi.fn().mockResolvedValue([]),
    },
    prescriptions: {
      byEncounter: vi.fn().mockResolvedValue([]),
    },
    treatmentTasks: {
      byEncounter: vi.fn().mockResolvedValue([]),
    },
    diagnostics: {
      byEncounter: vi.fn().mockResolvedValue([]),
    },
    followUp: {
      byEncounter: vi.fn().mockResolvedValue([]),
    },
    dictionaries: {
      systemEnum: vi.fn().mockResolvedValue({ code: 'TEST', name: '测试', items: [] }),
    },
  } as unknown as RhnApi
}

describe('DoctorWorkstation reception flow', () => {
  it('opens a waiting patient in reading mode from the explicit view action', async () => {
    const user = userEvent.setup()
    const startEncounterSpy = vi.fn()
    const api = createMockApi({ startFn: startEncounterSpy })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Patient appears in the today reception queue
    expect(await screen.findByText('张建国')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看 张建国' }))

    expect(await screen.findByText('阅读状态')).toBeInTheDocument()
    expect(screen.getByLabelText('门诊病历阅读内容')).toBeInTheDocument()
    expect(api.encounters.start).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('症状、持续时间及本次就诊原因')).not.toBeInTheDocument()

  })

  it('starts a waiting encounter and opens editing from the reception action', async () => {
    const user = userEvent.setup()
    const startEncounterSpy = vi.fn()
    const api = createMockApi({ startFn: startEncounterSpy })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>)

    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await waitFor(() => expect(api.encounters.start).toHaveBeenCalledWith(
        'encounter-101',
        expect.objectContaining({
          terminalCode: 'WEB-DOCTOR-WORKSTATION',
          factorResults: { NAME: true, DEMOGRAPHIC_OR_IDENTIFIER: true },
        })
      ))

    const recordHeading = await screen.findByRole('heading', { name: '门诊病历' })
    expect(recordHeading).toBeInTheDocument()
    const importTemplate = screen.getByRole('button', { name: '模板调入' })
    await waitFor(() => expect(importTemplate).toBeEnabled())
    expect(importTemplate.closest('header')).toContainElement(recordHeading)
    expect(screen.queryByLabelText('选择病历模板')).not.toBeInTheDocument()
    await user.click(importTemplate)
    expect(await screen.findByRole('heading', { name: '调入病历模板' })).toBeInTheDocument()
    expect(screen.getByLabelText('选择调入模板')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认调入' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toBeInTheDocument()

    const complaint = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(complaint, '咳嗽三天')
    expect(screen.queryByText('编辑状态')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '返回阅读' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('病历书写模式')).not.toBeInTheDocument()
  })

  it('continues an in-progress encounter directly in editing without starting it again', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'IN_SERVICE' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>)

    await user.click(await screen.findByRole('button', { name: '查看 张建国' }))
    expect(await screen.findByText('阅读状态')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换患者' }))

    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(await screen.findByPlaceholderText('症状、持续时间及本次就诊原因')).toBeInTheDocument()
    expect(screen.queryByText('编辑状态')).not.toBeInTheDocument()
    expect(api.encounters.start).not.toHaveBeenCalled()
    expect(api.encounters.resume).not.toHaveBeenCalled()
  })

  it('keeps a suspended encounter readable and resumes only from the recovery action', async () => {
    const user = userEvent.setup()
    const resumeSpy = vi.fn()
    const api = createMockApi({
      initialEncounterStatus: 'SUSPENDED', queueStatus: 'SUSPENDED', resumeFn: resumeSpy,
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    const view = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    await user.click(await screen.findByRole('button', { name: '查看 张建国' }))
    expect(await screen.findByText('阅读状态')).toBeInTheDocument()
    expect(api.encounters.resume).not.toHaveBeenCalled()

    view.unmount()
    const recoveryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={recoveryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    await user.click(await screen.findByRole('button', { name: '恢复接诊 张建国' }))
    await waitFor(() => expect(resumeSpy).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      terminalCode: 'WEB-DOCTOR-WORKSTATION',
    })))
    expect(await screen.findByPlaceholderText('症状、持续时间及本次就诊原因')).toBeInTheDocument()
    expect(screen.queryByText('编辑状态')).not.toBeInTheDocument()
  })

  it('keeps the record read-only when the current account has no edit permission', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit={false} />
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByRole('button', { name: '接诊 张建国' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '查看 张建国' }))
    expect(await screen.findByText('阅读状态')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始接诊' })).toBeDisabled()
    expect(screen.getByText('当前账号没有病历编辑权限')).toBeInTheDocument()
    expect(api.encounters.start).not.toHaveBeenCalled()
  })
})
