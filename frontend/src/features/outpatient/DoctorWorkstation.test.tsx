import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { Encounter, Resident } from '../../shared/model'
import type { ReceptionQueueItem, RhnApi } from '../../shared/rhnApi'
import { DoctorWorkstation, persistOrderDrafts } from './DoctorWorkstation'

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
      serviceRequests: vi.fn().mockResolvedValue([]),
      medicationRequests: vi.fn().mockResolvedValue([]),
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
    },
    treatments: {
      skinTestWorklist: vi.fn().mockResolvedValue([]),
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

    // 3. 录入主要诊断
    const addDiagBtn = screen.getByRole('button', { name: /新增诊断/ })
    await user.click(addDiagBtn)
    const diagTrigger = await screen.findByText(/检索并选择主要诊断/)
    await user.click(diagTrigger)
    const searchInput = await screen.findByPlaceholderText('输入诊断名称、编码或拼音码')
    await user.type(searchInput, '高血压')
    const option = await screen.findByRole('option', { name: /原发性高血压/ })
    await user.click(option)

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

    // 4. 点击保存草稿
    const saveDraftBtn = screen.getByRole('button', { name: '保存草稿' })
    await user.click(saveDraftBtn)

    // 5. 验证后端接口被正确调用
    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
        chiefComplaint: '持续性头痛3天，伴恶心',
        presentIllness: '患者3天前无明显诱因下出现头痛',
        physicalExam: '心肺听诊未见异常，双下肢无水肿',
        systolic: 140,
        diastolic: 90,
        temperature: 36.8,
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
      expect(screen.getByLabelText('体温')).toHaveValue(36.8)
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
    expect(checklist).toHaveTextContent('病历签署')

    // Ensure raw Unicode check/circle characters are completely absent
    expect(checklist.textContent).not.toContain('✓')
    expect(checklist.textContent).not.toContain('○')
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
