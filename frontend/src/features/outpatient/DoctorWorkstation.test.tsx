import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { GenerateClinicalAiSuggestionInput, ClinicalAiSuggestion } from '../../shared/api/clinicalAiApi'
import type { ClinicalContext } from '../../app/AppShell'
import type { Encounter, Resident } from '../../shared/model'
import type { ReceptionQueueItem, RhnApi } from '../../shared/rhnApi'
import { DoctorWorkstation } from './DoctorWorkstation'
import { persistOrderDrafts } from './orders/persistOrderDrafts'

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
  organizationId: 'org-1',
  departmentId: 'dept-1',
  status: 'REGISTERED',
  visitType: 'GENERAL',
  chiefComplaint: '',
  presentIllness: '',
  medicalHistory: '',
  physicalExam: '',
  treatmentPlan: '',
  vitalSigns: { systolic: 120, diastolic: 80 },
  registeredAt: '2026-09-02T08:00:00Z',
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

const mockCompletedEncounter: Encounter = {
  ...mockRegisteredEncounter,
  status: 'COMPLETED',
} as unknown as Encounter

const outpatientNote = (status: 'DRAFT' | 'SIGNED' | 'AMENDMENT_IN_PROGRESS' = 'DRAFT', version = 1) => ({
  id: 'note-1', residentId: 'resident-1', encounterId: 'encounter-101', organizationId: 'org-1',
  departmentId: 'dept-1', documentType: 'OUTPATIENT_NOTE', instanceKey: 'DEFAULT', title: '门诊病历',
  status, currentVersion: version, contentSchema: 'RHN.OUTPATIENT_NOTE.V1',
  content: { chiefComplaint: '头痛复诊', presentIllness: '头痛较前缓解', vitalSigns: { systolic: 120, diastolic: 80 },
    diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] },
  createdBy: 'doctor', createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z', history: [],
})

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
  initialEncounterStatus?: 'REGISTERED' | 'IN_PROGRESS' | 'SUSPENDED' | 'COMPLETED'
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
    clinicalAi: {
      capabilities: vi.fn().mockResolvedValue({ available: false, mode: 'DISABLED', provider: 'test', features: [] }),
      history: vi.fn().mockResolvedValue([]),
    },
    clinicalSafety: {
      vitalSignRules: vi.fn().mockResolvedValue({ rules: [] }),
    },
    scheduling: {
      receptionQueue: vi.fn().mockResolvedValue([{ ...mockQueueItem, status: queueStatus }]),
    },
    outpatientReferrals: {
      inbox: vi.fn().mockResolvedValue([]),
    },
    residents: {
      get: vi.fn().mockResolvedValue(mockResident),
      allergies: vi.fn().mockResolvedValue([]),
      allergenTerms: vi.fn().mockResolvedValue([{
        id: 'allergen-penicillin', categoryCode: 'DRUG', conceptType: 'DRUG_INGREDIENT',
        codeSystemUri: 'http://example.test/allergens', code: 'PENICILLIN', display: '青霉素', aliases: '盘尼西林',
      }]),
      recordAllergy: vi.fn().mockResolvedValue({ id: 'allergy-1', revision: 1 }),
      inactivateAllergy: vi.fn().mockResolvedValue({ id: 'allergy-1', revision: 2, clinicalStatus: 'INACTIVE' }),
      conditions: vi.fn().mockResolvedValue([]),
      medications: vi.fn().mockResolvedValue([]),
      familyMembers: vi.fn().mockResolvedValue([]),
      socialRelations: vi.fn().mockResolvedValue([]),
    },
    encounters: {
      byResident: vi.fn().mockImplementation(() =>
        Promise.resolve([encounterStatus === 'REGISTERED' ? mockRegisteredEncounter
          : encounterStatus === 'SUSPENDED' ? mockSuspendedEncounter
            : encounterStatus === 'COMPLETED' ? mockCompletedEncounter : mockInProgressEncounter])
      ),
      recordClinicalData: vi.fn().mockImplementation((id: string, input: any) => Promise.resolve({
        ...mockInProgressEncounter,
        id,
        chiefComplaint: input.chiefComplaint,
        systolic: input.systolic,
        diastolic: input.diastolic,
        diagnoses: (input.diagnoses ?? []).map((d: any, idx: number) => ({
          id: `diag-${idx}`,
          conceptId: d.conceptId,
          diagnosisDomain: d.diagnosisDomain,
          diagnosisGroupId: d.diagnosisGroupId,
          code: d.code,
          display: d.display,
          type: d.type,
          managementPrograms: [],
        })),
      })),
      start: startMock,
      complete: vi.fn(),
      suspend: vi.fn(),
      resume: resumeMock,
      prescriptions: vi.fn().mockResolvedValue([]),
      evaluatePrescriptionSafety: vi.fn().mockResolvedValue({
        evaluationId: 'evaluation-pass', prescriptionId: 'rx-pass', prescriptionRevision: 0,
        inputHash: 'hash-pass', ruleSetVersion: 'qmed-foundation-shadow-v1', engineVersion: 'test',
        mode: 'SHADOW', decision: 'PASS', findings: [], ruleExecutions: [], failureCodes: [],
      }),
      submitPrescription: vi.fn(),
      serviceRequests: vi.fn().mockResolvedValue([]),
      medicationRequests: vi.fn().mockResolvedValue([]),
      orderableMedications: vi.fn().mockResolvedValue([]),
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
      applicable: vi.fn().mockResolvedValue([]),
    },
    billing: {
      statement: vi.fn().mockResolvedValue({
        accountId: 'acc-1',
        encounterId: 'encounter-101',
        chargeAmount: 10.0,
        paymentAmount: 10.0,
        uninvoicedAmount: 0.0,
        currencyCode: 'CNY',
        settlements: [],
        charges: [],
      }),
      paymentOrders: vi.fn().mockResolvedValue([]),
      createPaymentOrder: vi.fn(),
      issueInvoice: vi.fn(),
    },
    masterData: {
      diseases: vi.fn().mockResolvedValue([
        {
          id: 'concept-hyp-1',
          revision: 1,
          codeSystemId: 'cs-1',
          systemCode: 'ICD10',
          systemName: '国际疾病分类第十次修订版',
          systemVersion: '2019',
          sdDiagnosisDomain: 'WESTERN_MEDICINE',
          sdDiagnosisDomainText: '西医诊断',
          code: 'I10',
          display: '原发性高血压',
          sdConceptType: 'DISEASE',
          sdConceptTypeText: '疾病',
          sdStatus: 'ACTIVE',
          sdStatusText: '启用',
          effectiveFrom: '2020-01-01',
          aliases: [],
          managementPrograms: [],
        },
      ]),
      medications: vi.fn().mockResolvedValue([]),
      services: vi.fn().mockResolvedValue([]),
      activeOrderFrequencies: vi.fn().mockResolvedValue([]),
      activeMedicationRoutes: vi.fn().mockResolvedValue([]),
      searchServices: vi.fn().mockResolvedValue({ content: [] }),
      itemGroups: vi.fn().mockResolvedValue([]),
    },
    treatments: {
      skinTestWorklist: vi.fn().mockResolvedValue([]),
    },
  } as unknown as RhnApi
}

function renderStation(api: RhnApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
    <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
  </MemoryRouter></QueryClientProvider>)
}

it('shows direct reception only when enabled and opens the patient identity workflow', async () => {
  const api = createMockApi()
  api.encounters.directVisitSettings = vi.fn().mockResolvedValue({ enabled: true, catalogItemId: null })
  renderStation(api)
  await userEvent.click(await screen.findByRole('button', { name: '直接接诊' }))
  expect(await screen.findByRole('dialog', { name: /直接接诊/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认身份并接诊' })).toBeDisabled()
  expect(screen.getByText(/本科室未配置门诊服务费/)).toBeInTheDocument()
})

it('keeps the standard queue workflow when direct reception is disabled', async () => {
  const api = createMockApi()
  api.encounters.directVisitSettings = vi.fn().mockResolvedValue({ enabled: false })
  renderStation(api)
  await waitFor(() => expect(api.encounters.directVisitSettings).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: '直接接诊' })).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '接诊 张建国' })).toBeInTheDocument()
})

describe('DoctorWorkstation reception flow', () => {
  it('loads the personal view by default and reloads when the data scope changes', async () => {
    const user = userEvent.setup()
    const api = createMockApi()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    await screen.findByText('张建国')
    expect(api.scheduling.receptionQueue).toHaveBeenCalledWith(expect.any(String), undefined, 'PERSONAL')
    await user.click(screen.getByRole('button', { name: '本科室' }))
    await waitFor(() => expect(api.scheduling.receptionQueue)
      .toHaveBeenCalledWith(expect.any(String), undefined, 'DEPARTMENT'))
    await user.click(screen.getByRole('button', { name: '本院' }))
    await waitFor(() => expect(api.scheduling.receptionQueue)
      .toHaveBeenCalledWith(expect.any(String), undefined, 'ORGANIZATION'))
  })

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
    expect(screen.getAllByRole('button', { name: '刷新队列' })).toHaveLength(1)

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
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
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
    expect(screen.queryByRole('button', { name: '切换患者' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '进入编辑' }))
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

  it('opens a completed encounter in a stable read-only layout without an edit action', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'COMPLETED', queueStatus: 'COMPLETED' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    const { container } = render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    await user.click(await screen.findByRole('tab', { name: /已接诊/ }))
    await user.click(await screen.findByRole('button', { name: '查看病历 张建国' }))

    expect(await screen.findByText('阅读状态')).toBeInTheDocument()
    expect(screen.getByText('本次就诊已结束；如需更正，应发起病历修订并保留原始版本')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入编辑' })).not.toBeInTheDocument()
    expect(container.querySelector('.doctor-clinical-cockpit')).toHaveClass('is-reading')
    expect(container.querySelector('.doctor-clinical-readonly-note')).toBeInTheDocument()
    expect(container.querySelector('.doctor-record-column')).toBeInTheDocument()
    expect(screen.getByLabelText('诊断与医嘱工作区')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回患者列表' }))
    expect(await screen.findByRole('heading', { name: '门诊医生站' })).toBeInTheDocument()
    expect(screen.queryByText('阅读状态')).not.toBeInTheDocument()
  })

  it('hides back-to-list button in editing mode and requires suspend/complete/terminate to finish', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    // 1. 接诊进入编辑状态
    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    expect(await screen.findByRole('heading', { name: '门诊病历' })).toBeInTheDocument()

    // 2. 移除非查看状态下的“返回列表”按钮，防止接诊状态挂起紊乱
    expect(screen.queryByRole('button', { name: '返回患者列表' })).not.toBeInTheDocument()
    expect(screen.queryByText('返回列表')).not.toBeInTheDocument()

    // 3. 必须通过暂挂、诊毕或终止诊疗来正常终结接诊
    expect(screen.getByRole('button', { name: '暂挂' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '诊毕' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '终止诊疗' })).toBeInTheDocument()
  })

  it('manages allergies in the workstation drawer and records a controlled allergen directly', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS' })
    const { container } = renderStation(api)

    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: /过敏信息：尚未核对/ }))

    const drawer = screen.getByRole('complementary', { name: '过敏信息' })
    expect(drawer).toHaveClass('is-allergy')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(drawer).getByText('新增过敏事实')).toBeInTheDocument()
    expect(drawer.querySelectorAll('select')).toHaveLength(0)

    await user.click(within(drawer).getByRole('combobox', { name: /标准过敏原/ }))
    await user.click(await screen.findByRole('option', { name: /青霉素/ }))
    await user.type(within(drawer).getByLabelText('过敏反应'), '皮疹')
    await user.click(within(drawer).getByRole('button', { name: '记录过敏事实' }))

    await waitFor(() => expect(api.residents.recordAllergy).toHaveBeenCalledWith('resident-1', {
      encounterId: 'encounter-101',
      assertionType: 'ALLERGY',
      categoryCode: 'DRUG',
      criticalityCode: 'UNABLE_TO_ASSESS',
      reactionSeverity: 'MILD',
      informationSource: 'PATIENT',
      allergenId: 'allergen-penicillin',
      substanceDisplay: '青霉素',
      substanceCodeSystemUri: 'http://example.test/allergens',
      substanceCode: 'PENICILLIN',
      reactionText: '皮疹',
    }))
    expect(container.querySelector('.ui-dialog-backdrop')).not.toBeInTheDocument()
  })

  it('confirms no known drug allergy without opening another layer', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS' })
    renderStation(api)

    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: /过敏信息：尚未核对/ }))
    await user.click(screen.getByRole('button', { name: '确认无已知药物过敏' }))

    await waitFor(() => expect(api.residents.recordAllergy).toHaveBeenCalledWith('resident-1', {
      encounterId: 'encounter-101', assertionType: 'NO_KNOWN_DRUG_ALLERGY', informationSource: 'PATIENT',
    }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses the shared anchored confirmation before inactivating an allergy record', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS' })
    api.residents.allergies = vi.fn().mockResolvedValue([{
      id: 'allergy-1', residentId: 'resident-1', revision: 3, clinicalStatus: 'ACTIVE',
      assertionType: 'ALLERGY', categoryCode: 'DRUG', criticalityCode: 'HIGH', reactionSeverity: 'SEVERE',
      informationSource: 'PATIENT', substanceDisplay: '青霉素', reactionText: '呼吸困难',
      recordedAt: '2026-09-10T08:00:00Z',
    }])
    const nativeConfirm = vi.spyOn(window, 'confirm')
    renderStation(api)

    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: /过敏信息：青霉素/ }))
    await user.click(screen.getByRole('button', { name: '停用' }))

    expect(nativeConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('停用“青霉素”过敏记录？')
    await user.click(screen.getByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(api.residents.inactivateAllergy)
      .toHaveBeenCalledWith('resident-1', 'allergy-1', 3, '医生复核后停用'))
    nativeConfirm.mockRestore()
  })

  it('renders physical exam inputs without dummy value placeholders and applies reference vitals from history', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS' })
    const pastEncounter = {
      id: 'encounter-past-1',
      encounterNo: 'ENC20260825001',
      residentId: 'resident-1',
      status: 'COMPLETED',
      visitType: 'GENERAL',
      registeredAt: '2026-08-25T09:00:00Z',
      systolic: 135,
      diastolic: 85,
      diagnoses: [],
    } as unknown as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([
      mockInProgressEncounter,
      pastEncounter,
    ])
    api.clinicalDocuments.byEncounter = vi.fn().mockImplementation((encId: string) => {
      if (encId === 'encounter-past-1') {
        return Promise.resolve([{
          id: 'doc-past-1',
          documentType: 'OUTPATIENT_NOTE',
          content: {
            vitalSigns: {
              systolic: 135,
              diastolic: 85,
              temperature: 36.6,
              pulseRate: 76,
              weightKg: 68,
              heightCm: 172,
            },
          },
        }])
      }
      return Promise.resolve([])
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    // 点击接诊进入编辑模式
    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    expect(await screen.findByRole('heading', { name: '门诊病历' })).toBeInTheDocument()
    expect(await screen.findByText('体格检查')).toBeInTheDocument()

    // 1. 验证没有任何假数值的 placeholder
    expect(screen.queryByPlaceholderText('36.5')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('75')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('120')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('80')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('170')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('65')).not.toBeInTheDocument()

    // 2. 没有真实分诊来源时，只显示服务端返回的上次就诊体征
    expect(await screen.findByText('近期参考')).toBeInTheDocument()
    expect(screen.queryByText(/分诊测量/)).not.toBeInTheDocument()
    expect(screen.getByText(/上次就诊/)).toBeInTheDocument()
    expect(await screen.findByText('135/85 mmHg')).toBeInTheDocument()

    // 3. 验证引用上次结果按钮并点击
    const applyBtn = screen.getByRole('button', { name: /引用上次结果/ })
    expect(applyBtn).toBeInTheDocument()
    await user.click(applyBtn)

    // 验证数值填入收缩压与舒张压，且按钮反馈为已带入
    const sysInput = screen.getByLabelText('收缩压') as HTMLInputElement
    const diaInput = screen.getByLabelText('舒张压') as HTMLInputElement
    expect(sysInput.value).toBe('135')
    expect(diaInput.value).toBe('85')
    expect(await screen.findByText('已带入')).toBeInTheDocument()
  })

  it('marks blood pressure required and explains empty, range and relationship errors in Chinese', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    const systolic = await screen.findByLabelText('收缩压'), diastolic = screen.getByLabelText('舒张压')
    expect(systolic).toHaveAttribute('aria-required', 'true')
    expect(diastolic).toHaveAttribute('aria-required', 'true')
    await user.clear(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'))
    await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '发热3天')
    await user.clear(systolic); await user.clear(diastolic)
    await user.click(screen.getByRole('button', { name: '保存全部草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('请填写收缩压；请填写舒张压'))
    expect(screen.queryByText(/NaN|Invalid input/)).not.toBeInTheDocument()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    fireEvent.change(systolic, { target: { value: '301' } })
    fireEvent.change(diastolic, { target: { value: '80' } })
    await user.click(screen.getByRole('button', { name: '保存全部草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('收缩压请输入 20～300 之间的数值'))
    fireEvent.change(systolic, { target: { value: '70' } })
    await user.click(screen.getByRole('button', { name: '保存全部草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('收缩压必须大于舒张压'))
  })

  it('preserves chief complaint, diagnoses, and physical exam data without clearing after saving draft', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const recordSpy = vi.fn().mockImplementation((id: string, input: any) => Promise.resolve({
      ...mockInProgressEncounter,
      id,
      chiefComplaint: input.chiefComplaint,
      systolic: input.systolic,
      diastolic: input.diastolic,
      diagnoses: (input.diagnoses ?? []).map((d: any, idx: number) => ({
        id: `diag-${idx}`,
        conceptId: d.conceptId,
        diagnosisDomain: d.diagnosisDomain,
        diagnosisGroupId: d.diagnosisGroupId,
        code: d.code,
        display: d.display,
        type: d.type,
        managementPrograms: [],
      })),
    }))
    api.encounters.recordClinicalData = recordSpy

    let currentDocs: any[] = []
    api.clinicalDocuments.byEncounter = vi.fn().mockImplementation(() => Promise.resolve(currentDocs))

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/reception']}>
        <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
      </MemoryRouter>
    </QueryClientProvider>)

    // 1. 进入接诊编辑
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(await screen.findByRole('heading', { name: '门诊病历' })).toBeInTheDocument()

    // 2. 录入主诉、现病史、体格检查与生命体征
    const complaintInput = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.clear(complaintInput)
    await user.type(complaintInput, '持续性头痛3天，伴恶心')

    const presentIllnessInput = screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')
    await user.type(presentIllnessInput, '患者3天前无明显诱因下出现头痛')

    const examInput = screen.getByPlaceholderText('阳性体征及必要的阴性体征')
    await user.type(examInput, '心肺听诊未见异常，双下肢无水肿')

    const sysInput = screen.getByLabelText('收缩压')
    await user.type(sysInput, '140')

    const diaInput = screen.getByLabelText('舒张压')
    await user.type(diaInput, '90')

    const tempInput = screen.getByLabelText('体温')
    await user.type(tempInput, '36.8')

    // 3. 录入主要诊断（空记录时默认已插入空行，无需手动点击新增诊断）
    const addDiagBtn = screen.queryByRole('button', { name: /新增诊断/ })
    if (addDiagBtn) {
      await user.click(addDiagBtn)
    }
    const diagTrigger = await screen.findByText(/检索并选择主要诊断/)
    await user.click(diagTrigger)
    const searchInput = await screen.findByPlaceholderText('输入诊断名称、编码或拼音码')
    await user.type(searchInput, '高血压')
    const option = await screen.findByRole('option', { name: /原发性高血压/ })
    fireEvent.click(option)

    expect(await screen.findByText('原发性高血压')).toBeInTheDocument()

    // 模拟服务端保存后返回的 document 草稿
    currentDocs = [{
      id: 'doc-note-1',
      documentType: 'OUTPATIENT_NOTE',
      title: '门诊病历',
      currentVersion: 1,
      status: 'DRAFT',
      content: {
        chiefComplaint: '持续性头痛3天，伴恶心',
        presentIllness: '患者3天前无明显诱因下出现头痛',
        physicalExam: '心肺听诊未见异常，双下肢无水肿',
        vitalSigns: {
          systolic: 140,
          diastolic: 90,
          temperature: 36.8,
        },
        diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
      },
    }]

    await user.clear(screen.getByLabelText('体温'))
    await user.type(screen.getByLabelText('体温'), '36.8')
    await user.clear(screen.getByLabelText('体温'))
    // 4. 点击保存草稿
    const saveDraftBtn = screen.getByRole('button', { name: '保存全部草稿' })
    await user.click(saveDraftBtn)

    // 5. 验证后端接口被正确调用
    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
        chiefComplaint: '持续性头痛3天，伴恶心',
        presentIllness: '患者3天前无明显诱因下出现头痛',
        physicalExam: '心肺听诊未见异常，双下肢无水肿',
        systolic: 140,
        diastolic: 90,
        temperature: undefined,
        diagnoses: [expect.objectContaining({ code: 'I10', display: '原发性高血压', type: 'PRIMARY' })],
      }))
    })

    // 6. 验证保存草稿后，主诉、体格检查数据和诊断依然完整保留在界面中，未被清空
    await waitFor(() => {
      expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('持续性头痛3天，伴恶心')
      expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('患者3天前无明显诱因下出现头痛')
      expect(screen.getByPlaceholderText('阳性体征及必要的阴性体征')).toHaveValue('心肺听诊未见异常，双下肢无水肿')
      expect(screen.getByLabelText('收缩压')).toHaveValue(140)
      expect(screen.getByLabelText('舒张压')).toHaveValue(90)
      expect(screen.getByLabelText('体温')).toHaveValue(null)
      expect(screen.getByText('原发性高血压')).toBeInTheDocument()
    })
    expect(await screen.findByText(/草稿 V1/)).toBeInTheDocument()
  })

  it('persists medication and service drafts to backend DRAFT prescriptions and requests', async () => {
    const api = createMockApi()
    const mockPrescription = {
      id: 'rx-draft-1',
      categoryCode: 'WESTERN',
      status: 'DRAFT',
      medicationRequests: [],
    }
    const createPrescriptionSpy = vi.fn().mockResolvedValue(mockPrescription)
    const createMedReqSpy = vi.fn().mockResolvedValue({ id: 'med-req-1', status: 'DRAFT' })
    const createSvcReqSpy = vi.fn().mockResolvedValue({ id: 'svc-req-1', status: 'DRAFT' })
    api.encounters.createPrescription = createPrescriptionSpy
    api.encounters.createMedicationRequest = createMedReqSpy
    api.encounters.createServiceRequest = createSvcReqSpy

    const mockDraft: any = {
      id: 'draft-1',
      categoryCode: 'WESTERN',
      request: {
        medicationId: 'm-1',
        doseValue: 10,
        doseUnit: 'mg',
        routeCode: 'ORAL',
        frequencyCode: 'QD',
        durationValue: 7,
        quantity: 1,
      },
    }

    const mockSvcDraft: any = {
      id: 'svc-1',
      catalogItemId: 'cat-1',
      quantity: 2,
      unitCode: '次',
      clinicalDescription: '抽血检验',
    }

    await persistOrderDrafts('enc-1' as any, [mockDraft], [mockSvcDraft], api, [])

    expect(createPrescriptionSpy).toHaveBeenCalledWith('enc-1', 'WESTERN', '门诊西药/中成药处方')
    expect(createMedReqSpy).toHaveBeenCalledWith('enc-1', expect.objectContaining({
      prescriptionId: 'rx-draft-1',
      medicationId: 'm-1',
      quantity: 1,
    }))
    expect(createSvcReqSpy).toHaveBeenCalledWith('enc-1', expect.objectContaining({
      catalogItemId: 'cat-1',
      quantity: 2,
    }))
  })

  it('shows shadow medication safety findings before submitting a draft prescription', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationRequest = {
      id: 'med-levofloxacin', revision: 0, prescriptionId: 'rx-child', status: 'DRAFT',
      medicationId: '362387880000128', medicationSnapshot: { name: '左氧氟沙星片' },
      quantity: 1, quantityUnit: '片', doseValue: 0.25, doseUnit: 'g', routeCode: 'ORAL',
      frequencyCode: 'TID', durationValue: 3, durationUnit: 'DAY', substitutionAllowed: false,
      selfProvided: true, itemAttributeSnapshot: {}, itemAttributeHash: 'item-hash', standardMappings: [],
      authoredAt: '2026-09-18T08:00:00Z',
    } as any
    const prescription = {
      id: 'rx-child', revision: 0, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX-CHILD', categoryCode: 'WESTERN', status: 'DRAFT',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-18T08:00:00Z', medicationRequests: [medicationRequest],
    } as any
    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescription])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue([medicationRequest])
    const evaluation = {
      evaluationId: 'evaluation-age', prescriptionId: 'rx-child', prescriptionRevision: 0,
      inputHash: 'hash-age', ruleSetVersion: 'qmed-foundation-shadow-v1', engineVersion: 'qmed-test',
      mode: 'SHADOW', decision: 'BLOCK', failureCodes: [], ruleExecutions: [],
      findings: [{
        findingId: 'finding-age', ruleCode: 'QMED.AGE_CONTRAINDICATION', ruleVersion: 1,
        category: 'SPECIAL_POPULATION_CONTRAINDICATION', severity: 'CRITICAL', decision: 'BLOCK',
        message: '患者年龄（6岁）未满18周岁，禁用氟喹诺酮类抗菌药物【左氧氟沙星片】。',
        medicationRequestIds: ['med-levofloxacin'], evidence: [], overridePolicy: 'REASON_REQUIRED',
        suggestedAction: '请更换为儿童适用的抗菌药。',
      }],
    } as const
    api.encounters.evaluatePrescriptionSafety = vi.fn().mockResolvedValue(evaluation)
    api.encounters.submitPrescription = vi.fn().mockResolvedValue({
      ...prescription, status: 'ACTIVE', safetyEvaluation: evaluation,
    })

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '审核开立' }))
    await user.click(screen.getByRole('button', { name: '确认保存并开立' }))

    expect(await screen.findByRole('region', { name: '合理用药审查' })).toHaveTextContent('儿童及特定年龄禁忌用药核对')
    expect(screen.getByRole('region', { name: '合理用药审查' })).toHaveTextContent('6岁')
    expect(screen.getByRole('region', { name: '合理用药审查' })).toHaveTextContent('左氧氟沙星片')
    expect(api.encounters.submitPrescription).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '已知晓风险，继续开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith('encounter-101', 'rx-child', 0))
  })

  function prepareFormalSafetyReview(status: 'BLOCK' | 'UNAVAILABLE' | 'REQUIRE_OVERRIDE' | 'WARN' = 'REQUIRE_OVERRIDE') {
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationRequests = ['a', 'b'].map((suffix) => ({
      id: `med-${suffix}`, revision: 0, prescriptionId: 'rx-pair', status: 'DRAFT',
      medicationId: `drug-${suffix}`, medicationSnapshot: { name: `测试药品${suffix}` },
      quantity: 1, quantityUnit: '片', doseValue: 1, doseUnit: '片', routeCode: 'ORAL',
      frequencyCode: 'QD', durationValue: 3, durationUnit: 'DAY', selfProvided: true,
      itemAttributeSnapshot: {}, standardMappings: [], authoredAt: '2026-09-21T08:00:00Z',
    }))
    const prescription = {
      id: 'rx-pair', revision: 0, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX-PAIR', categoryCode: 'WESTERN', status: 'DRAFT',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-21T08:00:00Z', medicationRequests,
    } as any
    const evaluation = {
      evaluationId: 'evaluation-pair', prescriptionId: 'rx-pair', prescriptionRevision: 0,
      inputHash: 'pair-hash', ruleSetVersion: 'release-1', engineVersion: 'test',
      mode: 'ENFORCED', decision: status, failureCodes: [], ruleExecutions: [],
      findings: [{ findingId: 'finding-pair', ruleCode: 'QMED.KNOW.TEST', ruleVersion: 1,
        category: 'DRUG_INTERACTION', severity: 'HIGH', decision: status,
        message: '测试配对命中相互作用条件', medicationRequestIds: ['med-a', 'med-b'],
        evidence: [{ sourceType: 'INSTITUTION', sourceTitle: '合成验收依据', sourceVersion: '1',
          sourceLocator: '测试章节', section: '配对', excerpt: '本材料仅用于测试，不用于临床。', usageScope: '隔离测试' }],
        overridePolicy: 'REASON_REQUIRED', suggestedAction: '核对配对并调整处方。' }],
    } as any
    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescription])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue(medicationRequests)
    api.encounters.evaluatePrescriptionSafety = vi.fn().mockResolvedValue(evaluation)
    api.encounters.submitPrescription = vi.fn().mockResolvedValue({ ...prescription, status: 'ACTIVE' })
    return { api, evaluation }
  }

  async function openSafetyReview(api: RhnApi, user: ReturnType<typeof userEvent.setup>) {
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '审核开立' }))
    await user.click(screen.getByRole('button', { name: '确认保存并开立' }))
    return screen.findByRole('region', { name: '合理用药审查' })
  }

  it.each(['BLOCK', 'UNAVAILABLE'] as const)('prevents acknowledgement from bypassing formal %s and rechecks after returning to edit', async (status) => {
    const user = userEvent.setup()
    const { api, evaluation } = prepareFormalSafetyReview(status)
    const review = await openSafetyReview(api, user)
    expect(review).toHaveTextContent('正式审查，按规则要求处理')
    expect(review).not.toHaveTextContent('仅提示不阻断')
    expect(screen.getByRole('button', { name: '当前处方不可开立' })).toBeDisabled()
    expect(api.encounters.submitPrescription).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '返回修改' }))
    vi.mocked(api.encounters.evaluatePrescriptionSafety).mockResolvedValue({
      ...evaluation, inputHash: 'corrected-prescription', decision: 'PASS', findings: [],
    })
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    await user.click(screen.getByRole('button', { name: '确认保存并开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith('encounter-101', 'rx-pair', 0))
    expect(api.encounters.evaluatePrescriptionSafety).toHaveBeenCalledTimes(2)
  })

  it('shows paired drugs and evidence, requires a reason, and sends it only after a fresh equivalent evaluation', async () => {
    const user = userEvent.setup()
    const { api, evaluation } = prepareFormalSafetyReview()
    const review = await openSafetyReview(api, user)
    expect(review).toHaveTextContent('涉及药品：测试药品a、测试药品b')
    await user.click(within(review).getByText('查看规则依据'))
    expect(within(review).getByText('合成验收依据 · 1 · 配对 · 测试章节')).toBeVisible()
    expect(screen.getByRole('button', { name: '已知晓风险，继续开立' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'rx-pair 继续开立理由' }), '   ')
    expect(screen.getByRole('button', { name: '已知晓风险，继续开立' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'rx-pair 继续开立理由' }), '已核对适用条件，记录测试处理理由')
    vi.mocked(api.encounters.evaluatePrescriptionSafety).mockResolvedValue({
      ...evaluation, evaluationId: 'evaluation-new', ruleSetVersion: 'release-new',
      findings: [{ ...evaluation.findings[0], findingId: 'finding-new' }],
    })
    await user.click(screen.getByRole('button', { name: '已知晓风险，继续开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith(
      'encounter-101', 'rx-pair', 0, '已核对适用条件，记录测试处理理由'))
    expect(api.encounters.evaluatePrescriptionSafety).toHaveBeenCalledTimes(2)
  })

  it('requires reasons separately for every affected prescription', async () => {
    const user = userEvent.setup()
    const { api, evaluation } = prepareFormalSafetyReview()
    const first = (await api.encounters.prescriptions('encounter-101'))[0]
    const second = { ...first, id: 'rx-second', prescriptionNo: 'RX-SECOND', medicationRequests:
      first.medicationRequests.map((request) => ({ ...request, id: `${request.id}-2`, prescriptionId: 'rx-second' })) }
    vi.mocked(api.encounters.prescriptions).mockResolvedValue([first, second])
    vi.mocked(api.encounters.evaluatePrescriptionSafety).mockImplementation(async (_encounter, id) => ({
      ...evaluation, prescriptionId: id, findings: [{ ...evaluation.findings[0],
        medicationRequestIds: id === 'rx-second' ? ['med-a-2', 'med-b-2'] : ['med-a', 'med-b'] }],
    }))
    await openSafetyReview(api, user)
    await user.type(screen.getByRole('textbox', { name: 'rx-pair 继续开立理由' }), '第一张处方理由')
    expect(screen.getByRole('button', { name: '已知晓风险，继续开立' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'rx-second 继续开立理由' }), '第二张处方理由')
    await user.click(screen.getByRole('button', { name: '已知晓风险，继续开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith(
      'encounter-101', 'rx-second', 0, '第二张处方理由'))
    expect(api.encounters.submitPrescription).toHaveBeenCalledWith('encounter-101', 'rx-pair', 0, '第一张处方理由')
  })

  it('discards the old acknowledgement and reason when clinical input changes before confirmation', async () => {
    const user = userEvent.setup()
    const { api, evaluation } = prepareFormalSafetyReview()
    await openSafetyReview(api, user)
    await user.type(screen.getByRole('textbox', { name: 'rx-pair 继续开立理由' }), '原处理理由')
    vi.mocked(api.encounters.evaluatePrescriptionSafety).mockResolvedValue({ ...evaluation, inputHash: 'changed' })
    await user.click(screen.getByRole('button', { name: '已知晓风险，继续开立' }))
    expect(await screen.findByText('处方或审查结果已变化，请重新核对本次提示并填写处理理由。')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'rx-pair 继续开立理由' })).toHaveValue('')
    expect(screen.getByRole('button', { name: '已知晓风险，继续开立' })).toBeDisabled()
    expect(api.encounters.submitPrescription).not.toHaveBeenCalled()
  })

  it('does not automatically append new medication to a prescription with confirmed document metadata', async () => {
    const api = createMockApi()
    api.encounters.createPrescription = vi.fn().mockResolvedValue({ id: 'rx-new', categoryCode: 'WESTERN', status: 'DRAFT', medicationRequests: [] })
    api.encounters.createMedicationRequest = vi.fn().mockResolvedValue({ id: 'mr-new', status: 'DRAFT' })
    const drafts = [{ id: 'new', categoryCode: 'WESTERN', routeExecutionType: 'NONE',
      request: { medicationId: 'm-new', routeCode: 'ORAL', frequencyCode: 'QD', quantity: 1 } }] as any
    const existing = [{ id: 'rx-existing', categoryCode: 'WESTERN', status: 'DRAFT', medicationRequests: [],
      documentInfo: { diagnoses: [], externalPrescription: true } }] as any
    await persistOrderDrafts('enc-1', drafts, [], api, existing)
    expect(api.encounters.createPrescription).toHaveBeenCalledTimes(1)
    expect(api.encounters.createMedicationRequest).toHaveBeenCalledWith('enc-1', expect.objectContaining({ prescriptionId: 'rx-new' }))
  })

  it('automatically splits the sixth regular medication into a second prescription', async () => {
    const api = createMockApi()
    let prescriptionSequence = 0
    const createPrescription = vi.fn().mockImplementation(async (_encounterId, categoryCode) => ({
      id: `rx-${++prescriptionSequence}`, categoryCode, status: 'DRAFT', medicationRequests: [],
    }))
    const createMedicationRequest = vi.fn().mockImplementation(async (_encounterId, input) => ({
      ...input, id: `mr-${createMedicationRequest.mock.calls.length}`, status: 'DRAFT',
    }))
    api.encounters.createPrescription = createPrescription
    api.encounters.createMedicationRequest = createMedicationRequest
    const drafts = Array.from({ length: 6 }, (_, index) => ({
      id: `draft-${index}`, categoryCode: 'WESTERN', routeExecutionType: 'NONE',
      request: { medicationId: `m-${index}`, routeCode: 'ORAL', frequencyCode: 'QD', durationValue: 3,
        quantity: 1, substitutionAllowed: true, selfProvided: false },
    })) as any

    await persistOrderDrafts('enc-1', drafts, [], api, [])

    expect(createPrescription).toHaveBeenCalledTimes(2)
    expect(createMedicationRequest.mock.calls.slice(0, 5).every(([, input]) => input.prescriptionId === 'rx-1')).toBe(true)
    expect(createMedicationRequest.mock.calls[5][1].prescriptionId).toBe('rx-2')
  })

  it('keeps more than five herbal ingredients in one separate herbal prescription', async () => {
    const api = createMockApi()
    let prescriptionSequence = 0
    const createPrescription = vi.fn().mockImplementation(async (_encounterId, categoryCode) => ({
      id: `rx-${++prescriptionSequence}`, categoryCode, status: 'DRAFT', medicationRequests: [],
    }))
    api.encounters.createPrescription = createPrescription
    api.encounters.createMedicationRequest = vi.fn().mockImplementation(async (_encounterId, input) => ({
      ...input, id: globalThis.crypto.randomUUID(), status: 'DRAFT',
    }))
    const drafts = [
      ...Array.from({ length: 2 }, (_, index) => ({ id: `western-${index}`, categoryCode: 'WESTERN' })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `herbal-${index}`, categoryCode: 'HERBAL' })),
    ].map((draft) => ({ ...draft, routeExecutionType: 'NONE', request: {
      medicationId: draft.id, routeCode: 'ORAL', frequencyCode: 'BID', durationValue: 7,
      quantity: 1, substitutionAllowed: true, selfProvided: false,
    } })) as any

    await persistOrderDrafts('enc-1', drafts, [], api, [])

    expect(createPrescription.mock.calls.map((call) => call[1])).toEqual(['WESTERN', 'HERBAL'])
  })

  it('persists explicit infusion group roots and rejects incompatible same-group usage', async () => {
    const api = createMockApi()
    api.encounters.createPrescription = vi.fn().mockResolvedValue({
      id: 'rx-iv', categoryCode: 'WESTERN', status: 'DRAFT', medicationRequests: [],
    })
    const createMedicationRequest = vi.fn().mockImplementation(async (_encounterId, input) => ({
      ...input, id: `mr-${createMedicationRequest.mock.calls.length}`, status: 'DRAFT',
    }))
    api.encounters.createMedicationRequest = createMedicationRequest
    const infusion = (id: string, group: string, frequencyCode = 'QD') => ({
      id, categoryCode: 'WESTERN', routeExecutionType: 'INFUSION', administrationGroupKey: group,
      request: { medicationId: id, routeCode: 'IV', frequencyCode, durationValue: 1,
        quantity: 1, substitutionAllowed: true, selfProvided: false },
    }) as any

    await persistOrderDrafts('enc-1', [infusion('m-1', 'draft:one'), infusion('m-2', 'draft:one'),
      infusion('m-3', 'draft:two')], [], api, [])

    expect(createMedicationRequest.mock.calls[0][1].parentRequestId).toBeUndefined()
    expect(createMedicationRequest.mock.calls[1][1].parentRequestId).toBe('mr-1')
    expect(createMedicationRequest.mock.calls[2][1].parentRequestId).toBeUndefined()

    await expect(persistOrderDrafts('enc-2', [infusion('m-4', 'draft:conflict'),
      infusion('m-5', 'draft:conflict', 'BID')], [], api, [])).rejects
      .toThrow('同一输液组的给药途径、频次和疗程必须一致')
  })

  it('delegates to batchOrderPrescriptions when available on api.encounters', async () => {
    const api = createMockApi()
    const batchSpy = vi.fn().mockResolvedValue([{ id: 'rx-split-1' }])
    ;(api.encounters as any).batchOrderPrescriptions = batchSpy

    const drafts = [
      {
        id: 'draft-1',
        categoryCode: 'WESTERN',
        request: { medicationId: 'm-1', routeCode: 'ORAL', frequencyCode: 'QD', durationValue: 3, quantity: 1 },
      },
    ] as any

    await persistOrderDrafts('enc-1', drafts, [], api, [], true)

    expect(batchSpy).toHaveBeenCalledWith('enc-1', {
      items: [
        expect.objectContaining({
          medicationId: 'm-1',
          routeCode: 'ORAL',
          frequencyCode: 'QD',
        }),
      ],
      autoSubmit: true,
    })
  })

  it('renders friendly completion dialog with 4-metric fee card, quick phrase chips, and standardized checklist icons', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>)

    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(await screen.findByRole('button', { name: '诊毕' })).toBeInTheDocument()

    // Click '诊毕' button to open completion dialog
    await user.click(screen.getByRole('button', { name: '诊毕' }))

    // Completion modal title and eyebrow
    await waitFor(() => {
      expect(screen.getByText('本次就诊收口')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: /诊毕确认/ })).toBeInTheDocument()
    })

    // Verify 4-metric fee totals grid
    expect(screen.getByText('费用合计')).toBeInTheDocument()
    expect(screen.getByText('已支付')).toBeInTheDocument()
    expect(screen.getByText('未开票')).toBeInTheDocument()
    expect(screen.getByText('待支付')).toBeInTheDocument()

    // Verify quick phrase chips
    const followUpChip = screen.getByRole('button', { name: '一周后门诊复查' })
    expect(followUpChip).toBeInTheDocument()

    // Click quick phrase chip to auto-populate textarea
    await user.click(followUpChip)
    const textarea = screen.getByPlaceholderText('复诊时间、注意事项、转诊去向等') as HTMLTextAreaElement
    expect(textarea.value).toBe('一周后门诊复查')

    // Verify standardized checklist
    const checklist = screen.getByLabelText('诊毕准入核对')
    expect(checklist).toHaveTextContent('主诉已保存')
    expect(checklist).toHaveTextContent('主要诊断')
    expect(checklist).toHaveTextContent('确认时自动签署')

    // Ensure raw Unicode check/circle characters are completely absent
    expect(checklist.textContent).not.toContain('✓')
    expect(checklist.textContent).not.toContain('○')
  })

  it('uses the default combined mode to sign the saved note and complete the encounter in one confirmation', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const readyEncounter = { ...mockInProgressEncounter, chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ conceptId: 'concept-hyp-1', diagnosisDomain: 'WESTERN_MEDICINE',
        code: 'I10', display: '原发性高血压', type: 'PRIMARY', managementPrograms: [] }] } as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([readyEncounter])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    api.clinicalDocuments.sign = vi.fn().mockResolvedValue(outpatientNote('SIGNED'))
    api.encounters.complete = vi.fn().mockResolvedValue({ ...readyEncounter, status: 'COMPLETED' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(screen.queryByRole('button', { name: '签署当前版本' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    const finish = await screen.findByRole('button', { name: '签署并诊毕' })
    expect(finish).toBeEnabled()
    await user.click(finish)
    await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
    expect(api.clinicalDocuments.sign).toHaveBeenCalledWith('note-1', 1)
    expect(vi.mocked(api.clinicalDocuments.sign).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.encounters.complete).mock.invocationCallOrder[0])
  })

  it('saves unsaved work before opening the completion confirmation', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const readyEncounter = { ...mockInProgressEncounter, chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ conceptId: 'concept-hyp-1', diagnosisDomain: 'WESTERN_MEDICINE',
        code: 'I10', display: '原发性高血压', type: 'PRIMARY', managementPrograms: [] }] } as Encounter
    let finishSave: ((value: Encounter) => void) | undefined
    api.encounters.byResident = vi.fn().mockResolvedValue([readyEncounter])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    api.encounters.recordClinicalData = vi.fn().mockImplementation(() => new Promise<Encounter>((resolve) => {
      finishSave = resolve
    }))
    renderStation(api)

    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    const complaint = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await waitFor(() => expect(complaint).toHaveValue('头痛复诊'))
    fireEvent.change(complaint, { target: { value: '头痛复诊，今日加重' } })
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    expect(await screen.findByRole('button', { name: '保存并继续诊毕' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存并继续诊毕' }))
    expect(api.encounters.recordClinicalData).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      chiefComplaint: '头痛复诊，今日加重',
    }))
    expect(screen.queryByRole('dialog', { name: /诊毕确认/ })).not.toBeInTheDocument()

    finishSave?.({ ...readyEncounter, chiefComplaint: '头痛复诊，今日加重' })
    expect(await screen.findByRole('dialog', { name: /诊毕确认/ })).toBeInTheDocument()
  })

  it('keeps separate signing available when the completion mode parameter requests it', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.configuration = { resolve: vi.fn().mockResolvedValue({
      key: 'outpatient.doctor-workstation.completion-mode', value: 'SEPARATE_CONFIRMATIONS',
      requestedScope: 'DEPARTMENT', resolvedScope: 'DEPARTMENT', inherited: false, suppressedByDependency: false,
    }) } as never
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(await screen.findByRole('button', { name: '签署当前版本' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    expect(await screen.findByRole('button', { name: '立即签署' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认诊毕' })).toBeDisabled()
  })

  it('starts an auditable amendment instead of withdrawing a signed note', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    api.clinicalDocuments.amend = vi.fn().mockResolvedValue(outpatientNote('AMENDMENT_IN_PROGRESS', 2))
    api.clinicalDocuments.sign = vi.fn().mockResolvedValue(outpatientNote('SIGNED', 2))
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '发起更正' }))
    expect(screen.getByText('原签署版本和签名证据将完整保留；以下更正内容将生成新版本并重新签署。')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('说明需要更正的内容和原因'), '更正现病史中的症状持续时间')
    await user.click(screen.getByRole('button', { name: '更正并重新签署' }))
    await waitFor(() => expect(api.clinicalDocuments.amend).toHaveBeenCalledWith('note-1', expect.objectContaining({
      expectedCurrentVersion: 1, changeReason: '更正现病史中的症状持续时间',
    })))
    expect(api.clinicalDocuments.sign).toHaveBeenCalledWith('note-1', 2)
  })

  it('offers an auditable correction action after the encounter is completed', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'COMPLETED', queueStatus: 'COMPLETED' })
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    renderStation(api)

    await user.click(await screen.findByRole('tab', { name: /已接诊/ }))
    await user.click(await screen.findByRole('button', { name: '查看病历 张建国' }))

    expect(await screen.findByRole('button', { name: '发起更正' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入编辑' })).not.toBeInTheDocument()
  })

  it('only enables drag on the handle icon and not the entire diagnosis row', async () => {
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.encounters.byResident = vi.fn().mockResolvedValue([{
      ...mockInProgressEncounter,
      diagnoses: [
        { id: 'diag-1', code: 'I10', display: '原发性高血压', type: 'PRIMARY', diagnosisDomain: 'WESTERN_MEDICINE' },
        { id: 'diag-2', code: 'E11', display: '2型糖尿病', type: 'SECONDARY', diagnosisDomain: 'WESTERN_MEDICINE' },
      ],
    }])

    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/outpatient/reception']}>
          <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>)

    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    expect(await screen.findByText('原发性高血压')).toBeInTheDocument()
    expect(await screen.findByText('2型糖尿病')).toBeInTheDocument()

    // 验证整个诊断行不具备 draggable="true"
    const rows = document.querySelectorAll('.doctor-diagnosis-row:not(.is-launcher):not(.is-active-composer)')
    expect(rows.length).toBe(2)
    rows.forEach((row) => {
      expect(row.getAttribute('draggable')).not.toBe('true')
    })

    // 验证仅有拖拽把手图标具备 draggable="true"
    const dragHandles = screen.getAllByLabelText(/拖动调整诊断顺序/)
    expect(dragHandles.length).toBe(2)
    dragHandles.forEach((handle) => {
      expect(handle).toHaveAttribute('draggable', 'true')
    })

    // 模拟从 handle 拖拽并放置到第二行
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(),
      setDragImage: vi.fn(),
    }

    fireEvent.dragStart(dragHandles[0], { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('move')

    fireEvent.dragOver(rows[1], { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('move')

    fireEvent.drop(rows[1], { dataTransfer })
    fireEvent.dragEnd(dragHandles[0])

    // 验证顺序调整成功：2型糖尿病排到了原发性高血压前面
    const updatedRows = document.querySelectorAll('.doctor-diagnosis-row:not(.is-launcher):not(.is-active-composer)')
    expect(updatedRows[0]).toHaveTextContent('2型糖尿病')
    expect(updatedRows[1]).toHaveTextContent('原发性高血压')
  })
})


describe('DoctorWorkstation inline AI collaboration', () => {
  function aiApi() {
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.clinicalAi.capabilities = vi.fn().mockResolvedValue({ available: true, mode: 'MODEL', provider: 'test',
      features: ['RECORD_COMPLETENESS', 'TERMINOLOGY_VALIDATION', 'PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL'] })
    api.clinicalAi.generate = vi.fn().mockImplementation((_id: string, input: GenerateClinicalAiSuggestionInput) =>
      Promise.resolve({ id: `ai-${crypto.randomUUID()}`, status: 'GENERATED', contextHash: 'server-context',
        clientContextFingerprint: input.clientContextFingerprint, provider: 'test', promptVersion: 'V1',
        generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
        summary: '本次复诊资料待核对', recordDraft: { chiefComplaint: '高血压复诊', presentIllness: '患者自述规律服药' },
        diagnosisCandidates: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY', confidence: 0.8, rationale: '既往记录待核对' }],
        differentialDiagnoses: [], missingInformation: ['核对近期用药'], safetyAlerts: [], recommendedPlans: [],
        disclaimer: '仅供参考' } satisfies ClinicalAiSuggestion))
    api.clinicalAi.recordEvent = vi.fn().mockResolvedValue(undefined)
    api.masterData.diseases = vi.fn().mockResolvedValue([{ code: 'I10', display: '原发性高血压',
      sdStatus: 'ACTIVE', systemCode: 'WHO.BD.CS.ICD10' }])
    return api
  }

  async function enter(api: RhnApi) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    const aiPill = await screen.findByRole('button', { name: /AI 辅诊/ })
    await user.click(aiPill)
    await screen.findByRole('button', { name: '分析当前病历' })
    return user
  }

  it('saves a six-year-old patient record without blood pressure', async () => {
    const api = aiApi()
    api.residents.get = vi.fn().mockResolvedValue({ ...mockResident, birthDate: '2020-01-01' })
    api.encounters.byResident = vi.fn().mockResolvedValue([{ ...mockInProgressEncounter,
      diagnoses: [{ code: 'R05', display: '咳嗽', type: 'PRIMARY' }] }])
    const user = await enter(api)
    await user.clear(screen.getByLabelText('收缩压'))
    await user.clear(screen.getByLabelText('舒张压'))
    expect(screen.getByLabelText('收缩压')).toHaveAttribute('aria-required', 'false')
    await user.clear(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'))
    await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '咳嗽两天')
    await user.click(screen.getByRole('button', { name: '保存全部草稿' }))
    await waitFor(() => expect(api.encounters.recordClinicalData).toHaveBeenCalledWith('encounter-101',
      expect.objectContaining({ chiefComplaint: '咳嗽两天', systolic: undefined, diastolic: undefined })))
  })

  it('keeps mapped treatment suggestions available after record and diagnosis adoption', async () => {
    const api = aiApi()
    api.masterData.searchServices = vi.fn().mockResolvedValue({ content: [{
      id: 'lab-1', code: 'LAB001', name: '血常规', sdServiceType: 'LABORATORY', sdUsageType: 'COMMON',
      sdStatus: 'ACTIVE', orderable: true, unitCode: '次', validFrom: '2020-01-01', prices: [],
      organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true },
    }] } as never)
    const generate = api.clinicalAi.generate
    api.clinicalAi.generate = vi.fn().mockImplementation(async (id, input) => ({ ...await generate(id, input),
      treatmentRecommendations: [{ type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '评估病因' }] }))
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await waitFor(() => expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('高血压复诊'))
    const diagnosisTable = screen.getByRole('table', { name: '本次诊断连续录入列表' })
    const orderTable = screen.getByRole('table', { name: '本次医嘱连续录入列表' })
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toHaveTextContent('原发性高血压')
    await user.clear(screen.getByLabelText('收缩压'))
    await user.clear(screen.getByLabelText('舒张压'))
    const saveDraftBtn = screen.getByRole('button', { name: '保存全部草稿' })
    await user.click(saveDraftBtn)
    console.log('DIAGNOSES DOM:', diagnosisTable.innerHTML)
    console.log('ORDERS DOM:', orderTable.innerHTML)
    await user.click(within(diagnosisTable).getByRole('button', { name: '确认录入' }))
    await waitFor(() => expect(document.querySelector('.doctor-diagnosis-row')).toHaveTextContent('原发性高血压'))
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    await user.click(within(orderTable).getByRole('button', { name: '确认所选（1）' }))
    await waitFor(() => expect(within(orderTable).queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument())
    expect(orderTable.querySelector('.doctor-unified-order-row.is-draft')).toHaveTextContent('血常规')
    expect(await screen.findByRole('dialog', { name: '审核诊疗方案' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认保存并开立' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '返回修改' }))
    expect(api.clinicalAi.recordEvent).toHaveBeenCalledWith(expect.stringMatching(/^ai-/),
      expect.objectContaining({ eventType: 'ADOPTED', sectionCode: 'TREATMENT' }))
    expect(document.querySelector('.doctor-ai-summary-slot')).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('既往疾病、手术、过敏及长期用药'), '补充人工病史')
    expect(screen.queryByLabelText('AI 诊断待确认')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
  })

  it('preserves AI diagnosis and treatment recommendations when clicking save all drafts without blood pressure filled', async () => {
    const api = aiApi()
    api.masterData.searchServices = vi.fn().mockResolvedValue({ content: [{
      id: 'lab-1', code: 'LAB001', name: '血常规', sdServiceType: 'LABORATORY', sdUsageType: 'COMMON',
      sdStatus: 'ACTIVE', orderable: true, unitCode: '次', validFrom: '2020-01-01', prices: [],
      organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true },
    }] } as never)
    const generate = api.clinicalAi.generate
    api.clinicalAi.generate = vi.fn().mockImplementation(async (id, input) => ({
      ...await generate(id, input),
      recordDraft: {
        chiefComplaint: '发热3天',
        presentIllness: '患者发热3天，最高体温39℃。',
        medicalHistory: '既往体健。',
        physicalExam: '咽部充血。',
        treatmentPlan: '门诊对症治疗。',
      },
      diagnosisCandidates: [{ code: 'J06.900', display: '急性上呼吸道感染', type: 'PRIMARY', confidence: 0.9, rationale: '临床表现相符' }],
      treatmentRecommendations: [{ type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '明确感染指标' }],
    }))
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await waitFor(() => expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('发热3天'))

    const diagnosisTable = screen.getByRole('table', { name: '本次诊断连续录入列表' })
    const orderTable = screen.getByRole('table', { name: '本次医嘱连续录入列表' })

    // AI 生成的诊断与医嘱建议此时都在表格中
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toHaveTextContent('急性上呼吸道感染')
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')

    // 清空收缩压与舒张压
    const systolicInput = screen.getByLabelText('收缩压')
    const diastolicInput = screen.getByLabelText('舒张压')
    await user.clear(systolicInput)
    await user.clear(diastolicInput)

    // 点击保存全部草稿
    const saveDraftBtn = screen.getByRole('button', { name: '保存全部草稿' })
    await user.click(saveDraftBtn)

    // 应该提示血压错误
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('请填写收缩压；请填写舒张压'))
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()

    // 关键断言：提示血压错误后，AI 生成的诊断和医嘱绝不能丢失！
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toHaveTextContent('急性上呼吸道感染')
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')

    // 医生补录血压
    await user.type(systolicInput, '120')
    await user.type(diastolicInput, '80')

    // 补录血压后，AI 诊断和医嘱依然稳定保留
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toHaveTextContent('急性上呼吸道感染')
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')

    // 医生可继续确认录入 AI 诊断
    await user.click(within(diagnosisTable).getByRole('button', { name: '确认录入' }))
    await waitFor(() => expect(document.querySelector('.doctor-diagnosis-row')).toHaveTextContent('急性上呼吸道感染'))

    // AI 医嘱依然存在且可确认
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    await user.click(within(orderTable).getByRole('button', { name: '确认所选（1）' }))
    await waitFor(() => expect(within(orderTable).queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument())
    expect(orderTable.querySelector('.doctor-unified-order-row.is-draft')).toHaveTextContent('血常规')
  })

  it('streams into the original fields and restores their values if final audit fails', async () => {
    const api = aiApi()
    api.clinicalAi.capabilities = vi.fn().mockResolvedValue({ available: true, mode: 'MODEL', provider: 'test',
      features: ['STREAMING_DRAFT', 'RECORD_COMPLETENESS', 'TERMINOLOGY_VALIDATION', 'AUDIT_TRAIL'] })
    let finish!: (value: ClinicalAiSuggestion) => void
    let input!: GenerateClinicalAiSuggestionInput
    api.clinicalAi.generateStream = vi.fn().mockImplementation((_id, value, _signal, delta) => {
      input = value
      delta('{"recordDraft":{"chiefComplaint":"发热3天","presentIllness":"患者发热3天')
      return new Promise<ClinicalAiSuggestion>((resolve) => { finish = resolve })
    })
    api.clinicalAi.recordEvent = vi.fn().mockImplementation((_id, event) => event.eventType === 'ADOPTED'
      ? Promise.reject(new Error('审计暂不可用')) : Promise.resolve())
    const user = await enter(api)
    const chief = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(chief, '原始主诉')
    await user.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await waitFor(() => expect(chief).toHaveValue('发热3天'))
    expect(chief).toHaveAttribute('readonly')
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('患者发热3天')
    expect(document.querySelector('.doctor-ai-stream-preview')).toBeNull()
    await act(async () => finish(await api.clinicalAi.generate('enc-1', input)))
    await waitFor(() => expect(chief).toHaveValue('原始主诉'))
    expect(chief).not.toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: '撤销本次病历采纳' })).not.toBeInTheDocument()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
  })

  it('directly fills all five record paragraphs and restores them with one undo', async () => {
    const api = aiApi()
    const previousGenerate = api.clinicalAi.generate
    api.clinicalAi.generate = vi.fn().mockImplementation(async (id, input) => ({ ...await previousGenerate(id, input),
      recordDraft: { chiefComplaint: '发热3天', presentIllness: '患者发热3天，最高体温39℃。',
        medicalHistory: '既往史待询问', physicalExam: '相关专科查体待完成', treatmentPlan: '拟完善病因评估并随访。' } }))
    const user = await enter(api)
    const chief = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(chief, '原始主诉')
    await user.type(screen.getByLabelText('问诊要点或辅助要求'), '感冒发热3天，最高体温39度')
    await user.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await waitFor(() => expect(chief).toHaveValue('发热3天'))
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('患者发热3天，最高体温39℃。')
    expect(screen.getByDisplayValue('既往史待询问')).toBeInTheDocument()
    expect(screen.getByDisplayValue('相关专科查体待完成')).toBeInTheDocument()
    expect(screen.getByDisplayValue('拟完善病因评估并随访。')).toBeInTheDocument()
    const diagnosisTable = screen.getByRole('table', { name: '本次诊断连续录入列表' })
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toBeInTheDocument()
    expect(within(diagnosisTable).getByRole('button', { name: '确认录入' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '撤销本次病历采纳' }))
    expect(chief).toHaveValue('原始主诉')
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('')
    expect(screen.queryByDisplayValue('既往史待询问')).not.toBeInTheDocument()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
  })

  it('shares analysis across clinical areas, applies only checked edits, and can undo record edits without dropping diagnoses', async () => {
    const api = aiApi()
    const user = await enter(api)
    const chief = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(chief, '原始主诉')
    await user.click(screen.getByRole('button', { name: '分析当前病历' }))
    await user.click(await screen.findByRole('button', { name: /接诊摘要/ }))
    await screen.findByText('本次复诊资料待核对')
    expect(screen.queryByRole('tab', { name: '当前建议' })).not.toBeInTheDocument()
    expect(api.clinicalAi.generate).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('checkbox', { name: /主诉/ }))
    const proposal = screen.getByRole('textbox', { name: '主诉建议（可编辑）' })
    await user.clear(proposal)
    await user.type(proposal, '核对后的复诊主诉')
    await user.click(screen.getAllByRole('button', { name: /采纳所选草稿/ })[0])
    await waitFor(() => expect(chief).toHaveValue('核对后的复诊主诉'))
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('')
    await user.click(within(screen.getByRole('table', { name: '本次诊断连续录入列表' }))
      .getByRole('button', { name: '确认录入' }))
    expect(within(screen.getByRole('table', { name: '本次诊断连续录入列表' })).getByText('原发性高血压')).toBeInTheDocument()
    expect(api.clinicalAi.recordEvent).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      eventType: 'ADOPTED', sectionCode: 'RECORD', detail: expect.stringContaining('chiefComplaint'),
    }))
    expect(api.clinicalAi.recordEvent).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      eventType: 'ADOPTED', sectionCode: 'DIAGNOSIS',
    }))
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    expect(api.encounters.complete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '撤销本次病历采纳' }))
    expect(chief).toHaveValue('原始主诉')
    expect(within(screen.getByRole('table', { name: '本次诊断连续录入列表' })).getByText('原发性高血压')).toBeInTheDocument()
  })

  it('rejects stale suggestions after a manual edit and keeps the current session when the detail drawer is closed', async () => {
    const api = aiApi()
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '分析当前病历' }))
    await user.click(await screen.findByRole('button', { name: /接诊摘要/ }))
    await screen.findByText('本次复诊资料待核对')
    await user.click(screen.getByRole('checkbox', { name: /主诉/ }))
    await user.click(screen.getByRole('button', { name: '更多辅助' }))
    await screen.findByRole('tab', { name: '当前建议' })
    await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
    expect(screen.getByRole('checkbox', { name: /主诉/ })).toBeChecked()
    await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '新补充的主诉')
    expect(screen.getByText('资料已变化，等待更新')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /采纳所选草稿/ })).not.toBeInTheDocument()
    expect(vi.mocked(api.clinicalAi.recordEvent).mock.calls.some(([, event]) => event.eventType === 'ADOPTED')).toBe(false)
  })

  it('leaves the record untouched when audit fails and does not undo later manual edits', async () => {
    const api = aiApi()
    api.clinicalAi.recordEvent = vi.fn().mockImplementation((_id, event) => event.eventType === 'ADOPTED'
      ? Promise.reject(new Error('采纳留痕失败')) : Promise.resolve())
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '分析当前病历' }))
    await user.click(await screen.findByRole('button', { name: /接诊摘要/ }))
    await screen.findByText('本次复诊资料待核对')
    await user.click(screen.getByRole('checkbox', { name: /主诉/ }))
    await user.click(screen.getAllByRole('button', { name: /采纳所选草稿/ })[0])
    expect(await screen.findByText('采纳留痕失败')).toBeInTheDocument()
    const chief = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    expect(chief).toHaveValue('')
    api.clinicalAi.recordEvent = vi.fn().mockResolvedValue(undefined)
    await user.click(screen.getAllByRole('button', { name: /采纳所选草稿/ })[0])
    await waitFor(() => expect(chief).toHaveValue('高血压复诊'))
    await user.type(chief, '，补充新症状')
    expect(screen.getByRole('button', { name: '撤销本次病历采纳' })).toBeDisabled()
    expect(chief).toHaveValue('高血压复诊，补充新症状')
  })
})
