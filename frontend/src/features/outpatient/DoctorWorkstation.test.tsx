import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { GenerateClinicalAiSuggestionInput, ClinicalAiSuggestion } from '../../shared/api/clinicalAiApi'
import type { ClinicalContext } from '../../app/AppShell'
import type { Encounter, Resident } from '../../shared/model'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { ClinicalRecordInput } from '../../shared/api/encountersApi'
import { billingWriteFixture } from './record/completionBillingWrites.testFixtures'
import { completionStatementFixture, completionSettlementFixture } from './record/completionFacts.testFixtures'
import { clinicalRecordSaveFixture } from './record/clinicalRecordSave.testFixtures'
import { changedFixture, signedFixture, versionFixture } from './record/clinicalDocumentWorkflow.testFixtures'
import type { ReceptionQueueItem, RhnApi } from '../../shared/rhnApi'
import type { HistoricalStablePlan, OutpatientPlanTemplate } from '../../shared/api/outpatientPlanTemplatesApi'
import type { PrintRecord } from '../../shared/api/printingApi'
import { DoctorWorkstation } from './DoctorWorkstation'
import { orderDraftReceipt } from './orders/orderDraftSave.testFixtures'
import { persistOrderDrafts } from './orders/persistOrderDrafts'
import { historicalImportFixture } from './ai/historicalPrescriptionImport.testFixtures'
import { installTemplateCatalog } from './templates/resolveTemplateOrders.testFixtures'

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
  createdBy: 'doctor', createdAt: '2026-09-10T08:00:00Z', updatedAt: '2026-09-10T08:00:00Z',
  history: Array.from({ length: version }, (_, index) => versionFixture(index + 1, index + 1 < version || status === 'SIGNED',
    index === 0 ? 'CREATE' : 'AMENDMENT')),
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
  let savedDocuments: ClinicalDocument[] = []

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
      recommendPlans: vi.fn().mockResolvedValue([]),
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
      recordClinicalData: vi.fn().mockImplementation((id: string, input: ClinicalRecordInput) => {
        const saved = clinicalRecordSaveFixture({ ...mockInProgressEncounter, id }, input,
          (savedDocuments[0]?.currentVersion ?? 0) + 1)
        savedDocuments = [saved.document]
        return Promise.resolve(saved.encounter)
      }),
      start: startMock,
      complete: vi.fn(),
      suspend: vi.fn(),
      resume: resumeMock,
      prescriptions: vi.fn().mockResolvedValue([]),
      saveOrderDrafts: vi.fn().mockImplementation(async (id, input) => orderDraftReceipt(id, input)),
      evaluatePrescriptionSafety: vi.fn().mockResolvedValue({
        evaluationId: 'evaluation-pass', prescriptionId: 'rx-pass', prescriptionRevision: 0,
        inputHash: 'hash-pass', ruleSetVersion: 'qmed-foundation-shadow-v1', engineVersion: 'test',
        mode: 'SHADOW', decision: 'PASS', findings: [], ruleExecutions: [], failureCodes: [],
      }),
      submitPrescription: vi.fn(),
      updatePrescriptionDocumentInfo: vi.fn().mockImplementation((_encounterId, id, revision, documentInfo) =>
        Promise.resolve({ id, revision: revision + 1, documentInfo })),
      serviceRequests: vi.fn().mockResolvedValue([]),
      updateServiceDocumentInfo: vi.fn().mockImplementation((_encounterId, id, revision, documentInfo) =>
        Promise.resolve({ id, revision: revision + 1, documentInfo })),
      medicationRequests: vi.fn().mockResolvedValue([]),
      orderableMedications: vi.fn().mockResolvedValue([]),
    },
    clinicalDocuments: {
      byEncounter: vi.fn().mockImplementation(async () => savedDocuments),
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
    outpatientPlanTemplates: {
      list: vi.fn().mockResolvedValue([]),
      use: vi.fn(),
      create: vi.fn(),
      disable: vi.fn(),
      compileDraft: vi.fn(),
      compileGuideline: vi.fn(),
      minedSuggestions: vi.fn().mockResolvedValue([]),
      getHistoricalStablePlan: vi.fn().mockResolvedValue(null),
      compareHistoricalPlan: vi.fn(),
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
    configuration: { resolve: vi.fn().mockResolvedValue({
      key: 'outpatient.doctor-workstation.completion-mode', value: 'COMBINED_CONFIRMATION',
      requestedScope: 'DEPARTMENT', resolvedScope: 'DEPARTMENT', inherited: false, suppressedByDependency: false,
    }) },
    dictionaries: {
      systemEnum: vi.fn().mockResolvedValue({ code: 'TEST', name: '测试', items: [] }),
      applicable: vi.fn().mockResolvedValue([]),
    },
    billing: {
      statement: vi.fn().mockResolvedValue(completionStatementFixture(mockInProgressEncounter)),
      paymentOrders: vi.fn().mockResolvedValue([]),
      createPaymentOrder: vi.fn(),
      issueInvoice: vi.fn(),
    },
    organization: {
      departments: vi.fn().mockResolvedValue([
        { id: 'dept-1', organizationId: 'org-1', name: '全科医疗科', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null },
      ]),
      department: vi.fn().mockResolvedValue({ department: {
        id: 'dept-1', organizationId: 'org-1', name: '全科医疗科', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null,
      } }),
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
    printing: {
      clinicalDocument: vi.fn().mockResolvedValue({
        requestType: 'ORIGINAL',
        outputId: 'out-note-1',
        jobId: 'job-note-1',
        sourceType: 'ClinicalDocument',
        sourceId: 'note-1',
        sourceVersion: 1,
        templateCode: 'OUTPATIENT_NOTE_A4',
        templateVersion: 1,
        purpose: 'PATIENT_COPY',
        copies: 1,
        contentDigest: 'sha256-mock-digest-note',
        contentDigestAlgorithm: 'SHA-256',
        fileName: '门诊病历-张建国.pdf',
        downloadUrl: '/api/platform/printing/outputs/out-note-1/content',
        generatedAt: '2026-09-10T09:00:00Z',
        delivery: { channel: 'BROWSER_PDF', status: 'READY', deviceName: '虚拟打印机' },
      }),
      prescription: vi.fn().mockResolvedValue({
        requestType: 'ORIGINAL',
        outputId: 'out-rx-1',
        jobId: 'job-rx-1',
        sourceType: 'Prescription',
        sourceId: 'rx-1',
        sourceVersion: 1,
        templateCode: 'OUTPATIENT_PRESCRIPTION_A4',
        templateVersion: 1,
        purpose: 'PATIENT_COPY',
        copies: 1,
        contentDigest: 'sha256-mock-digest-rx',
        contentDigestAlgorithm: 'SHA-256',
        fileName: '门诊处方-张建国.pdf',
        downloadUrl: '/api/platform/printing/outputs/out-rx-1/content',
        generatedAt: '2026-09-10T09:00:00Z',
        delivery: { channel: 'BROWSER_PDF', status: 'READY', deviceName: '虚拟打印机' },
      }),
      serviceRequest: vi.fn().mockResolvedValue({
        requestType: 'ORIGINAL',
        outputId: 'out-svc-1',
        jobId: 'job-svc-1',
        sourceType: 'ServiceRequest',
        sourceId: 'svc-1',
        sourceVersion: 1,
        templateCode: 'LABORATORY_APPLICATION_A4',
        templateVersion: 1,
        purpose: 'PATIENT_COPY',
        copies: 1,
        contentDigest: 'sha256-mock-digest-svc',
        contentDigestAlgorithm: 'SHA-256',
        fileName: '检验申请单-张建国.pdf',
        downloadUrl: '/api/platform/printing/outputs/out-svc-1/content',
        generatedAt: '2026-09-10T09:00:00Z',
        delivery: { channel: 'BROWSER_PDF', status: 'READY', deviceName: '虚拟打印机' },
      }),
      recordsByEncounter: vi.fn().mockResolvedValue([]),
      reprint: vi.fn().mockResolvedValue({
        requestType: 'REPRINT',
        outputId: 'out-rx-1',
        jobId: 'job-rx-2',
        sourceType: 'Prescription',
        sourceId: 'rx-1',
        sourceVersion: 1,
        templateCode: 'OUTPATIENT_PRESCRIPTION_A4',
        templateVersion: 1,
        purpose: 'PATIENT_COPY',
        copies: 1,
        contentDigest: 'sha256-mock-digest-rx',
        contentDigestAlgorithm: 'SHA-256',
        fileName: '门诊处方-张建国.pdf',
        downloadUrl: '/api/platform/printing/outputs/out-rx-1/content',
        generatedAt: '2026-09-10T09:05:00Z',
        delivery: { channel: 'BROWSER_PDF', status: 'READY', deviceName: '虚拟打印机' },
      }),
      download: vi.fn().mockResolvedValue(undefined),
      printPdf: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as RhnApi
}

function renderStation(api: RhnApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
    <DoctorWorkstation api={api} clinicalContext={clinicalContext} canEdit />
  </MemoryRouter></QueryClientProvider>)
}

function receiptTestPlan(): OutpatientPlanTemplate {
  return { id: 'receipt-plan', revision: 1, scopeType: 'PERSONAL', name: '回执核对方案', status: 'ACTIVE',
    diagnoses: [{ code: 'TEST-RECEIPT', display: '回执测试诊断', type: 'PRIMARY' }], medications: [], services: [], tasks: [],
    sortOrder: 0, useCount: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
}

it.each(['empty', 'wrong-id', 'changed-diagnosis', 'missing-line', 'inactive'])(
  'does not stage cached template content when the use receipt is %s', async failure => {
    const user = userEvent.setup(), api = createMockApi(), plan = receiptTestPlan(), receipt = structuredClone(plan)
    if (failure === 'wrong-id') receipt.id = 'unrelated'
    if (failure === 'changed-diagnosis') receipt.diagnoses[0].display = '另一诊断'
    if (failure === 'missing-line') receipt.diagnoses = []
    if (failure === 'inactive') receipt.status = 'INACTIVE'
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(failure === 'empty' ? undefined as unknown as OutpatientPlanTemplate : receipt)
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await user.click(await screen.findByRole('button', { name: '带入当前草稿 (1)' }))
    const drawer = screen.getByRole('complementary', { name: '临床模板' })
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('模板未带入')
    expect(within(drawer).getByRole('checkbox', { name: '选择诊断 回执测试诊断' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
    expect(screen.queryByText('回执测试诊断')).not.toBeInTheDocument()
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
  })

it('does not stage any plan lines when its selected linked note receipt fails validation', async () => {
  const user = userEvent.setup(), api = createMockApi(), plan = { ...receiptTestPlan(), noteTemplateId: 'note-template-1' }
  vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
  vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(plan)
  vi.mocked(api.outpatientNoteTemplates.use).mockResolvedValue(undefined as unknown as Awaited<ReturnType<RhnApi['outpatientNoteTemplates']['use']>>)
  renderStation(api)
  await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
  await user.click(screen.getByRole('button', { name: '临床模板' }))
  await user.click(await screen.findByRole('button', { name: '带入当前草稿 (2)' }))
  expect(await within(screen.getByRole('complementary', { name: '临床模板' })).findByRole('alert')).toHaveTextContent('病历模板')
  await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
  expect(screen.queryByText('回执测试诊断')).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('')
})

it.each(['selection', 'record'])(
  'does not apply a late template response after the %s changes', async change => {
    const user = userEvent.setup(), api = createMockApi(), plan = receiptTestPlan()
    let resolve!: (value: OutpatientPlanTemplate) => void
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
    vi.mocked(api.outpatientPlanTemplates.use).mockImplementation(() => new Promise(done => { resolve = done }))
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await user.click(await screen.findByRole('button', { name: '带入当前草稿 (1)' }))
    await waitFor(() => expect(api.outpatientPlanTemplates.use).toHaveBeenCalledTimes(1))
    if (change === 'selection') await user.click(screen.getByRole('checkbox', { name: '选择诊断 回执测试诊断' }))
    else await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '用户正在修改')
    await act(async () => { resolve(plan) })
    const drawer = screen.getByRole('complementary', { name: '临床模板' })
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('本次未带入')
    await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
    expect(screen.queryByText('回执测试诊断')).not.toBeInTheDocument()
    if (change === 'record') expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('用户正在修改')
  })

it.each(['catalog-error', 'record-changed'])('keeps the whole template unapplied after %s during catalog verification', async failure => {
  const user = userEvent.setup(), api = createMockApi(), plan: OutpatientPlanTemplate = { ...receiptTestPlan(), noteTemplateId: 'note-template-1',
    services: [{ catalogItemId: 'lab', itemCode: 'LAB', itemName: '血常规', serviceType: 'LABORATORY', quantity: 1, unitCode: '次' }] }
  installTemplateCatalog(api, plan)
  const catalogPage = await api.masterData.searchServices('LAB')
  vi.mocked(api.masterData.searchServices).mockClear()
  let complete!: (value: Awaited<ReturnType<RhnApi['masterData']['searchServices']>>) => void
  let reject!: (reason: Error) => void
  vi.mocked(api.masterData.searchServices).mockImplementation(() => new Promise((done, fail) => { complete = done; reject = fail }) as ReturnType<RhnApi['masterData']['searchServices']>)
  vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
  vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(plan)
  renderStation(api)
  await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
  await user.click(screen.getByRole('button', { name: '临床模板' }))
  await user.click(await screen.findByRole('button', { name: '带入当前草稿 (3)' }))
  await waitFor(() => expect(api.masterData.searchServices).toHaveBeenCalledTimes(1))
  if (failure === 'record-changed') await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '核对中的手工输入')
  await act(async () => {
    if (failure === 'catalog-error') reject(new Error('目录不可访问'))
    else complete(catalogPage)
  })
  const drawer = screen.getByRole('complementary', { name: '临床模板' })
  expect(await within(drawer).findByRole('alert')).toHaveTextContent(failure === 'catalog-error' ? '目录不可访问' : '本次未带入')
  expect(within(drawer).getByRole('checkbox', { name: '选择诊断 回执测试诊断' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
  expect(screen.queryByText('回执测试诊断')).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue(failure === 'record-changed' ? '核对中的手工输入' : '')
  expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
})

it('reports no change when selected note sections are retained instead of claiming they were imported', async () => {
  const user = userEvent.setup(), api = createMockApi()
  renderStation(api)
  await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
  await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '已有主诉')
  await user.type(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过'), '已有现病史')
  await user.click(screen.getByRole('button', { name: '临床模板' }))
  const drawer = screen.getByRole('complementary', { name: '临床模板' })
  await user.click(within(drawer).getByRole('tab', { name: /病历模板/ }))
  await user.click(await within(drawer).findByRole('button', { name: '带入病历草稿 (2)' }))
  expect(await within(drawer).findByText('所选病历段落未改变当前内容；如需替换已有段落，请选择覆盖后重新核对。')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('已有主诉')
  expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('已有现病史')
})

it('rechecks historical renewal against the current encounter and rejects a duplicate batch explicitly', async () => {
  const user = userEvent.setup(), api = createMockApi(), f = historicalImportFixture()
  const historical = { ...f.source, residentId: mockResident.id }
  f.rx.residentId = mockResident.id
  f.rx.medicationRequests[0].residentId = mockResident.id
  f.medication.products[0].organizationAdoption!.organizationId = 'org-1'
  f.medication.products[0].prices[0].organizationId = 'org-1'
  api.encounters.byResident = vi.fn().mockResolvedValue([mockInProgressEncounter, historical])
  api.encounters.prescriptions = vi.fn().mockImplementation(async id => id === historical.id ? [f.rx] : [])
  api.encounters.orderableMedications = f.orderableMedications
  api.masterData.activeMedicationRoutes = f.activeMedicationRoutes
  api.masterData.activeOrderFrequencies = f.activeOrderFrequencies
  renderStation(api)
  await user.click(await screen.findByRole('button', { name: '接诊 张建国' }))
  await screen.findByRole('heading', { name: '门诊病历' })
  const bring = async () => {
    await user.click(screen.getByRole('button', { name: '就诊历史' }))
    await user.click(await screen.findByRole('checkbox', { name: /历史测试药/ }))
    await user.click(screen.getByRole('checkbox', { name: /已核对当前病情/ }))
    await user.click(screen.getByRole('button', { name: /加入续方草稿/ }))
  }
  await bring()
  await waitFor(() => expect(screen.queryByRole('complementary', { name: '就诊历史' })).not.toBeInTheDocument())
  expect(f.orderableMedications).toHaveBeenCalledWith('encounter-101', 'TEST')
  expect(await screen.findByText('当前产品')).toBeInTheDocument()
  expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
  await bring()
  expect(await screen.findByText('所选历史用药与当前待确认医嘱重复，本次未带入，请先核对已有草稿。')).toBeInTheDocument()
  expect(screen.getAllByText('当前产品')).toHaveLength(1)
})

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
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([{
      id: 'plan-1', revision: 1, scopeType: 'PERSONAL', name: '成人急性上呼吸道感染常用方案',
      description: '基层成人上呼吸道感染常用诊疗方案', status: 'ACTIVE', sourceType: 'AI_INPUT',
      sortOrder: 0, useCount: 0, diagnoses: [], medications: [], services: [], tasks: [],
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }, {
      id: 'inactive-plan', revision: 2, scopeType: 'PERSONAL', name: '已停用的诊疗方案',
      status: 'INACTIVE', sourceType: 'AI_INPUT', sortOrder: 0, useCount: 0,
      diagnoses: [], medications: [], services: [], tasks: [],
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } })

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
    expect(screen.queryByRole('button', { name: '调入病历模板' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '存为病历模板' }).closest('header')).toContainElement(recordHeading)
    const clinicalTemplates = screen.getByRole('button', { name: '临床模板' })
    expect(clinicalTemplates.closest('nav')).toHaveAccessibleName('医生站扩展工具')
    await user.click(clinicalTemplates)
    expect(await screen.findByRole('complementary', { name: '临床模板' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '临床模板' })).toBeInTheDocument()
    await waitFor(() => expect(api.outpatientPlanTemplates.list).toHaveBeenCalled())
    await waitFor(() => expect(api.outpatientNoteTemplates.list).toHaveBeenCalled())
    const planDrawer = screen.getByRole('complementary', { name: '临床模板' })
    expect(screen.getByRole('searchbox', { name: '搜索临床模板' }).closest('.ui-search-field'))
      .toHaveClass('doctor-plan-pool-search')
    expect(screen.getByRole('tab', { name: /病历模板/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /诊疗方案/ })).toBeInTheDocument()
    expect(await screen.findAllByText('基层成人上呼吸道感染常用诊疗方案')).toHaveLength(1)
    expect(screen.queryByText('已停用的诊疗方案')).not.toBeInTheDocument()
    expect(within(planDrawer).getByRole('tab', { name: /诊疗方案/ })).toHaveTextContent('(1)')
    expect(planDrawer.querySelector('.doctor-plan-detail-hero.is-compact'))
      .toHaveTextContent('成人急性上呼吸道感染常用方案')
    expect(planDrawer.style.getPropertyValue('--doctor-plan-drawer-height')).not.toBe('')
    await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
    // A plan disabled in another window must disappear even while the local cache is fresh.
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await waitFor(() => expect(screen.queryByText('基层成人上呼吸道感染常用诊疗方案')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '关闭扩展工具' }))
    expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '辅助检查结果' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('记录已获得的检查结果及日期；拟开检查在医嘱区管理')).not.toBeInTheDocument()

    const complaint = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(complaint, '咳嗽三天')
    expect(screen.queryByText('编辑状态')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '返回阅读' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('病历书写模式')).not.toBeInTheDocument()
  })

  it('blocks opening when split preview fails and restores verified counts only after retry', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const template: OutpatientPlanTemplate = { id: 'split-test', revision: 1, scopeType: 'PERSONAL',
      name: '药品方案', status: 'ACTIVE', sortOrder: 0, useCount: 0, diagnoses: [], services: [], tasks: [],
      medications: [{ lineId: 'm', editorMode: 'regular', medicationId: 'MED-001', medicationCode: 'MED-001',
        medicationName: '阿莫西林胶囊', catalogItemId: 'med-product', packageId: 'med-box', categoryCode: 'WESTERN', doseValue: 0.5, doseUnit: 'g', routeCode: 'PO',
        frequencyCode: 'TID', durationValue: 3, durationUnit: 'DAY', quantity: 1, quantityUnit: '盒',
        substitutionAllowed: true, selfProvided: false }], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    template.medications[0].quantityUnit = 'BOX'
    installTemplateCatalog(api, template)
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([template])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(template)
    const successfulPreview = vi.mocked(api.encounters.autoSplitPreview).getMockImplementation()!
    vi.mocked(api.encounters.autoSplitPreview).mockImplementationOnce(successfulPreview)
      .mockRejectedValueOnce(new Error('未配置发药路由'))
    api.encounters.batchOrderPrescriptions = vi.fn()
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await user.click(await screen.findByRole('button', { name: '带入当前草稿 (1)' }))
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    const review = await screen.findByRole('dialog', { name: '医嘱开立核查' })
    expect(await within(review).findByText(/分方预览失败：未配置发药路由/)).toBeInTheDocument()
    expect(within(review).getByText('单据数量待确认')).toBeInTheDocument()
    const submit = within(review).getByRole('button', { name: '确认分单并开立' })
    expect(submit).toBeDisabled()
    await user.click(submit)
    expect(api.encounters.batchOrderPrescriptions).not.toHaveBeenCalled()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    await user.click(within(review).getByRole('button', { name: '重新核对分方' }))
    await waitFor(() => expect(submit).toBeEnabled())
    expect(within(review).getByText('1 张单据')).toBeInTheDocument()
    expect(within(review).getByText('核实药房')).toBeInTheDocument()
    expect(within(review).getByText('1 盒')).toBeInTheDocument()
    expect(within(review).queryByText(/\bBOX\b/)).not.toBeInTheDocument()
    expect(within(review).queryByText('单据数量待确认')).not.toBeInTheDocument()
  })

  it('shows specific record validation errors in review and returns to the invalid field without losing orders', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    vi.mocked(api.encounters.byResident).mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '', systolic: 70, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
    }] as Encounter[])
    const template: OutpatientPlanTemplate = { id: 'record-validation', revision: 1, scopeType: 'PERSONAL', name: '检查方案',
      status: 'ACTIVE', sortOrder: 0, useCount: 0, diagnoses: [], medications: [], tasks: [],
      services: [{ catalogItemId: 'lab', itemCode: 'LAB', itemName: '血常规', serviceType: 'LABORATORY', quantity: 1, unitCode: '次' }],
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    installTemplateCatalog(api, template)
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([template])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(template)
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await user.click(await screen.findByRole('button', { name: '带入当前草稿 (1)' }))
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    const review = await screen.findByRole('dialog', { name: '医嘱开立核查' })
    await user.click(within(review).getByRole('button', { name: '确认分单并开立' }))
    expect(await within(review).findByRole('alert')).toHaveTextContent('病历尚未通过校验：请输入主诉')
    expect(within(review).getByRole('alert')).toHaveTextContent('收缩压必须大于舒张压')
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
    await user.click(within(review).getByRole('button', { name: '返回病历补充' }))
    expect(screen.queryByRole('dialog', { name: '医嘱开立核查' })).not.toBeInTheDocument()
    const chiefComplaint = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await waitFor(() => expect(chiefComplaint).toHaveFocus())
    await user.type(chiefComplaint, '复诊')
    await user.clear(screen.getByLabelText('收缩压'))
    await user.type(screen.getByLabelText('收缩压'), '120')
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    const reopened = await screen.findByRole('dialog', { name: '医嘱开立核查' })
    expect(within(reopened).getByText('血常规')).toBeInTheDocument()
    await user.click(within(reopened).getByRole('button', { name: '确认分单并开立' }))
    await waitFor(() => expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1))
  })

  it('saves an order-only change even when the clinical record has no edits', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    vi.mocked(api.encounters.byResident).mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
    }] as Encounter[])
    const template: OutpatientPlanTemplate = { id: 'order-only', revision: 1, scopeType: 'PERSONAL', name: '检查方案',
      status: 'ACTIVE', sortOrder: 0, useCount: 0, diagnoses: [], medications: [], tasks: [],
      services: [{ catalogItemId: 'lab', itemCode: 'LAB', itemName: '血常规', serviceType: 'LABORATORY', quantity: 1, unitCode: '次' }],
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    installTemplateCatalog(api, template)
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([template])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(template)
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    await user.click(await screen.findByRole('button', { name: '带入当前草稿 (1)' }))
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    await user.click(within(await screen.findByRole('dialog', { name: '医嘱开立核查' })).getByRole('button', { name: '确认分单并开立' }))
    await waitFor(() => expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1))
    expect(api.encounters.saveOrderDrafts).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      medicationItems: [], serviceItems: [expect.objectContaining({ catalogItemId: 'lab', quantity: 1 })],
    }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '医嘱开立核查' })).not.toBeInTheDocument())
  })

  it('allows selective checking and applying of plan items to outpatient drafts', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const mockPlan: OutpatientPlanTemplate = {
      id: 'plan-selective-1',
      revision: 1,
      scopeType: 'PERSONAL',
      name: '上呼吸道感染综合方案',
      description: '包含诊断、药品和检查的常用方案',
      status: 'ACTIVE',
      sourceType: 'AI_INPUT',
      sortOrder: 0,
      useCount: 1,
      diagnoses: [
        { code: 'J06.900', display: '急性上呼吸道感染', type: 'PRIMARY' },
        { code: 'R05.x00', display: '咳嗽', type: 'SECONDARY' },
      ],
      medications: [
        {
          lineId: 'line-med-1',
          editorMode: 'regular',
          medicationId: 'MED-001',
          medicationCode: 'MED-001',
          medicationName: '阿莫西林胶囊',
          catalogItemId: 'med-product',
          packageId: 'med-box',
          categoryCode: 'WESTERN',
          doseValue: 0.5,
          doseUnit: 'g',
          routeCode: 'PO',
          routeName: '口服',
          frequencyCode: 'TID',
          durationValue: 3,
          durationUnit: 'd',
          quantity: 1,
          quantityUnit: '盒',
          substitutionAllowed: true,
          selfProvided: false,
        },
      ],
      services: [
        {
          catalogItemId: 'srv-001',
          itemCode: 'LAB-CBC',
          itemName: '血常规',
          serviceType: 'LABORATORY',
          quantity: 1,
          unitCode: '次',
        },
      ],
      tasks: [],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    }
    installTemplateCatalog(api, mockPlan)
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([mockPlan])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(mockPlan)

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    // 打开临床模板抽屉
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    expect(await screen.findByRole('complementary', { name: '临床模板' })).toBeInTheDocument()

    // 默认全选 4 个明细条目（2 诊断 + 1 药品 + 1 检查）
    const applyButton = screen.getByRole('button', { name: '带入当前草稿 (4)' })
    expect(applyButton).toBeInTheDocument()
    expect(applyButton).toBeEnabled()

    // 测试表头全选 Checkbox：点击全选药品表头将其取消
    const allMedsCheckbox = screen.getByRole('checkbox', { name: '全选处方药品' })
    expect(allMedsCheckbox).toBeChecked()
    await user.click(allMedsCheckbox)
    expect(allMedsCheckbox).not.toBeChecked()
    expect(screen.getByRole('button', { name: '带入当前草稿 (3)' })).toBeInTheDocument()

    // 重新勾选全选处方药品
    await user.click(allMedsCheckbox)
    expect(allMedsCheckbox).toBeChecked()
    expect(screen.getByRole('button', { name: '带入当前草稿 (4)' })).toBeInTheDocument()

    // 取消勾选“咳嗽”诊断
    const coughCheckbox = screen.getByRole('checkbox', { name: '选择诊断 咳嗽' })
    expect(coughCheckbox).toBeChecked()
    await user.click(coughCheckbox)
    expect(coughCheckbox).not.toBeChecked()

    // 联动更新为 3 项
    expect(screen.getByRole('button', { name: '带入当前草稿 (3)' })).toBeInTheDocument()

    // 点击带入：不再二次确认，直接调用 use 接口调入，并自动关闭常用方案抽屉
    await user.click(screen.getByRole('button', { name: '带入当前草稿 (3)' }))

    // 验证不再弹出二次确认弹窗
    expect(screen.queryByRole('dialog', { name: /带入/ })).not.toBeInTheDocument()

    // 验证调用了 use 接口
    await waitFor(() => expect(api.outpatientPlanTemplates.use).toHaveBeenCalledWith('plan-selective-1'))

    // 验证执行调入操作后临床模板抽屉已自动关闭
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '临床模板' })).not.toBeInTheDocument())

    // 验证草稿中只加入了勾选的诊断“急性上呼吸道感染”，没有加入取消勾选的“咳嗽”
    expect(screen.getByText('急性上呼吸道感染')).toBeInTheDocument()
    expect(screen.queryByText('咳嗽')).not.toBeInTheDocument()
  })

  it('applies a linked note template together with diagnosis and orders as one solution', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const plan: OutpatientPlanTemplate = {
      id: 'plan-with-note', revision: 1, scopeType: 'PERSONAL', name: '复诊整体方案',
      noteTemplateId: 'note-template-1', status: 'ACTIVE', sourceType: 'MANUAL', sortOrder: 0, useCount: 0,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
      medications: [], services: [], tasks: [], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(plan)

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    const drawer = await screen.findByRole('complementary', { name: '临床模板' })

    expect(within(drawer).getByText('配套病历模板')).toBeInTheDocument()
    expect(within(drawer).getAllByText('常规复诊').length).toBeGreaterThan(0)
    await user.click(within(drawer).getByRole('button', { name: '带入当前草稿 (2)' }))

    await waitFor(() => expect(api.outpatientPlanTemplates.use).toHaveBeenCalledWith('plan-with-note'))
    await waitFor(() => expect(api.outpatientNoteTemplates.use).toHaveBeenCalledWith('note-template-1'))
    expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('复诊')
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('病情平稳')
    expect(screen.getByText('原发性高血压')).toBeInTheDocument()
  })

  it.each(['MISSING_IN_HISTORY', 'NEEDS_REVIEW', 'LOAD_ERROR', 'UNRESOLVED_HISTORY', 'MISSING_METADATA'] as const)('merges only confirmed historical and standard differences: %s', async (serviceStatus) => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const historicalPlan: HistoricalStablePlan = {
      encounterId: 'encounter-101', sourceEncounterId: 'encounter-88',
      conditionTitle: '高血压复诊稳定方案', summary: '近三次方案稳定',
      diagnoses: [{ codeSystem: 'WHO.BD.CS.ICD10', diagnosisDomain: 'WESTERN_MEDICINE' as const,
        code: 'I10', display: '原发性高血压', type: 'PRIMARY' as const }],
      medications: [{ medicationId: 'med-1', medicationName: '氨氯地平片', catalogItemId: 'catalog-h',
        packageId: 'package-h', doseValue: 5, doseUnit: 'mg', routeCode: 'ORAL', frequencyCode: 'QD',
        durationValue: 30, durationUnit: '天', quantity: 1, quantityUnit: '盒',
        substitutionAllowed: true, selfProvided: false }],
      services: [], guidanceNotes: [], reviewItems: [], assessedCategories: ['DIAGNOSIS' as const, 'MEDICATION' as const, 'SERVICE' as const],
    }
    if (serviceStatus === 'UNRESOLVED_HISTORY') historicalPlan.reviewItems.push({
      category: 'MEDICATION', sourceId: 'original-unverified', medicationId: 'med-unverified',
      display: '原始待核对药品', reason: '原始用法快照未确认，未带入草稿',
    })
    if (serviceStatus === 'MISSING_METADATA') Object.assign(historicalPlan, { reviewItems: undefined })
    const standardPlan: OutpatientPlanTemplate = {
      id: 'plan-standard-1', revision: 3, scopeType: 'HOSPITAL', name: '高血压院内标准方案',
      description: '院内标准方案', status: 'ACTIVE', sourceType: 'MANUAL', sortOrder: 0, useCount: 10,
      diagnoses: [{ codeSystem: 'WHO.BD.CS.ICD10', diagnosisDomain: 'WESTERN_MEDICINE',
        code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
      medications: [{ lineId: 'line-standard-1', editorMode: 'regular', categoryCode: 'WESTERN',
        medicationCode: 'AMLODIPINE', medicationId: 'med-1', medicationName: '氨氯地平片',
        catalogItemId: 'catalog-s', packageId: 'package-s', doseValue: 10, doseUnit: 'mg',
        routeCode: 'ORAL', frequencyCode: 'QD', durationValue: 30, durationUnit: '天',
        quantity: 1, quantityUnit: '盒', substitutionAllowed: false, selfProvided: false }],
      services: [{ catalogItemId: 'service-1', itemCode: 'LAB-RENAL', itemName: '肾功能',
        serviceType: 'LABORATORY', quantity: 1, unitCode: '次' }],
      tasks: [], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    }
    installTemplateCatalog(api, standardPlan)
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([standardPlan])
    vi.mocked(api.outpatientPlanTemplates.getHistoricalStablePlan).mockResolvedValue(historicalPlan)
    vi.mocked(api.outpatientPlanTemplates.compareHistoricalPlan).mockResolvedValue({
      historicalPlan,
      standardPlan: {
        id: standardPlan.id, revision: standardPlan.revision, name: standardPlan.name,
        diagnoses: standardPlan.diagnoses,
        medications: standardPlan.medications,
        services: standardPlan.services,
      },
      differences: [
        ...(serviceStatus === 'UNRESOLVED_HISTORY' ? [{ key: 'REVIEW:MEDICATION:0', category: 'MEDICATION' as const,
          status: 'NEEDS_REVIEW' as const, historicalIndex: null, standardIndex: null,
          historicalDisplay: '原始待核对药品', reason: '原始用法快照未确认，未带入草稿' }] : []),
        { key: 'DX:I10', category: 'DIAGNOSIS', status: 'CONSISTENT', historicalIndex: 0,
          standardIndex: 0, historicalDisplay: '原发性高血压', standardDisplay: '原发性高血压',
          reason: '历史方案与标准方案一致' },
        { key: 'MED:med-1:med-1', category: 'MEDICATION', status: 'CONFLICT', historicalIndex: 0,
          standardIndex: 0, historicalDisplay: '氨氯地平片 5mg', standardDisplay: '氨氯地平片 10mg',
          reason: '药品剂量不同' },
        { key: 'SERVICE:service-1', category: 'SERVICE', status: serviceStatus === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'MISSING_IN_HISTORY', historicalIndex: null, standardIndex: 0,
          standardDisplay: '肾功能', reason: '标准方案存在，历史稳定方案未包含' },
      ],
    })
    if (serviceStatus === 'LOAD_ERROR') vi.mocked(api.outpatientPlanTemplates.compareHistoricalPlan)
      .mockRejectedValue(new Error('成分目录不可用'))
    vi.mocked(api.outpatientPlanTemplates.create).mockImplementation(async (input) => ({
      ...standardPlan, id: 'merged-plan-1', name: input.name, description: input.description,
      scopeType: input.scopeType, sourceType: input.sourceType,
      diagnoses: input.diagnoses, medications: input.medications as OutpatientPlanTemplate['medications'],
      services: input.services as OutpatientPlanTemplate['services'],
    }))

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    const drawer = await screen.findByRole('complementary', { name: '临床模板' })
    await user.click(within(drawer).getByRole('tab', { name: /诊疗方案/ }))
    await user.click(within(drawer).getByRole('tab', { name: /复诊成熟方案/ }))

    await waitFor(() => expect(api.outpatientPlanTemplates.compareHistoricalPlan)
      .toHaveBeenCalledWith('encounter-101', 'plan-standard-1'))
    if (serviceStatus === 'MISSING_METADATA') {
      expect(await within(drawer).findByText('历史核对状态未返回，请重新加载历史方案后再带入。')).toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: /合并带入草稿/ })).toBeDisabled()
      expect(api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
      return
    }
    if (serviceStatus === 'UNRESOLVED_HISTORY') {
      expect(await within(drawer).findByText('待核对的历史记录 (1)')).toBeInTheDocument()
      expect(within(drawer).getByRole('checkbox', { name: '选择差异项 原始待核对药品' })).toBeDisabled()
      expect(within(drawer).queryByRole('combobox', { name: '选择 REVIEW:MEDICATION:0 的采用来源' })).not.toBeInTheDocument()
    }
    if (serviceStatus === 'LOAD_ERROR') {
      expect(await within(drawer).findByText('成分目录不可用')).toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: /合并带入草稿/ })).toBeDisabled()
      expect(api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
      return
    }
    expect(await within(drawer).findByText('氨氯地平片 10mg')).toBeInTheDocument()
    await user.click(within(drawer).getByRole('combobox', { name: '选择 MED:med-1:med-1 的采用来源' }))
    await user.click(await screen.findByRole('option', { name: '标准方案' }))
    const serviceChoice = within(drawer).getByRole('checkbox', { name: '选择差异项 肾功能' })
    if (serviceStatus === 'NEEDS_REVIEW') {
      expect(serviceChoice).toBeDisabled()
      expect(serviceChoice).not.toBeChecked()
      expect(within(drawer).getByText('待核对')).toBeInTheDocument()
    } else await user.click(serviceChoice)
    await user.click(within(drawer).getByRole('button', { name: '合并带入草稿 (2)' }))

    await waitFor(() => expect(api.outpatientPlanTemplates.create).toHaveBeenCalledWith(expect.objectContaining({
      diagnoses: [expect.objectContaining({ code: 'I10' })],
      medications: [expect.objectContaining({ medicationId: 'med-1', doseValue: 10,
        catalogItemId: 'catalog-s', substitutionAllowed: false })],
      services: [],
    })))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '临床模板' })).not.toBeInTheDocument())
  })

  it('applies selected note sections from the unified clinical template drawer', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '临床模板' }))

    const drawer = await screen.findByRole('complementary', { name: '临床模板' })
    await user.click(within(drawer).getByRole('tab', { name: /病历模板/ }))
    expect((await within(drawer).findAllByText('适用于慢病常规复诊')).length).toBeGreaterThan(0)

    const presentIllness = within(drawer).getByRole('checkbox', { name: /现病史/ })
    expect(presentIllness).toBeChecked()
    await user.click(presentIllness)
    await user.click(within(drawer).getByRole('button', { name: '带入病历草稿 (1)' }))

    await waitFor(() => expect(api.outpatientNoteTemplates.use).toHaveBeenCalledWith('note-template-1'))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '临床模板' })).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('复诊')
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('')
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
    api.outpatientFlow = {
      terminationReadiness: vi.fn().mockResolvedValue({ encounterId: 'encounter-101', ready: true, issues: [] }),
      terminate: vi.fn(),
    } as never
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
    expect(screen.queryByRole('menuitem', { name: '终止诊疗' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('menuitem', { name: '终止诊疗' }))
    expect(await screen.findByRole('dialog', { name: '终止本次诊疗' })).toBeInTheDocument()
    expect(api.outpatientFlow.terminate).not.toHaveBeenCalled()
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
    expect(screen.queryByLabelText('过敏史补充')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('用药史')).not.toBeInTheDocument()
    expect(screen.queryByText('诊断（引用）')).not.toBeInTheDocument()
    expect(screen.queryByText('诊疗计划（医嘱引用）')).not.toBeInTheDocument()


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
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('请填写收缩压；请填写舒张压'))
    expect(screen.queryByText(/NaN|Invalid input/)).not.toBeInTheDocument()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    fireEvent.change(systolic, { target: { value: '301' } })
    fireEvent.change(diastolic, { target: { value: '80' } })
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('收缩压请输入 20～300 之间的数值'))
    fireEvent.change(systolic, { target: { value: '70' } })
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(document.getElementById('doctor-vital-errors')).toHaveTextContent('收缩压必须大于舒张压'))
  })

  it('preserves chief complaint, diagnoses, and physical exam data without clearing after saving draft', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const recordSpy = api.encounters.recordClinicalData

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

    await user.clear(screen.getByLabelText('体温'))
    await user.type(screen.getByLabelText('体温'), '36.8')
    await user.clear(screen.getByLabelText('体温'))
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

  it('sends medication and service drafts in one atomic save command', async () => {
    const api = createMockApi()
    const medication = { id: 'm', categoryCode: 'WESTERN', request: { medicationId: 'med', quantity: 1 } } as any
    const service = { id: 's', catalogItemId: 'catalog', quantity: 2, unitCode: '次', clinicalDescription: '核对' } as any
    await persistOrderDrafts('enc-1', [medication], [service], api, 'orders-command')
    expect(api.encounters.saveOrderDrafts).toHaveBeenCalledWith('enc-1', {
      commandCode: 'orders-command', medicationItems: [expect.objectContaining({ medicationId: 'med', quantity: 1 })],
      serviceItems: [expect.objectContaining({ catalogItemId: 'catalog', quantity: 2, clinicalDescription: '核对' })],
    })
  })

  it.each([true, false])('shows an active laboratory document while reviewing a pending prescription (department found: %s)', async departmentFound => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationRequest = {
      id: 'med-draft-1', revision: 0, prescriptionId: 'rx-draft-1', status: 'DRAFT',
      medicationId: 'medication-1', medicationName: '连花清瘟胶囊', itemName: '连花清瘟胶囊 0.35g',
      medicationSnapshot: {}, quantity: 1, quantityUnit: '盒', doseValue: 1, doseUnit: '片',
      routeCode: 'ORAL', frequencyCode: 'QD', selfProvided: false, substitutionAllowed: false,
      itemAttributeSnapshot: {}, itemAttributeHash: 'hash-med', standardMappings: [],
      authoredAt: '2026-09-28T08:10:00Z',
    } as any
    const prescription = {
      id: 'rx-draft-1', revision: 0, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX-001', categoryCode: 'CHINESE_PATENT', status: 'DRAFT',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-28T08:10:00Z', medicationRequests: [medicationRequest],
    } as any
    const laboratoryRequest = {
      id: 'service-lab-1', revision: 0, residentId: 'resident-1', encounterId: 'encounter-101',
      requestNo: 'LAB-001', performerOrganizationId: 'org-1', performerDepartmentId: 'actual-lab-dept', status: 'ACTIVE', catalogItemId: 'catalog-lab-1', businessDate: '2026-09-28',
      itemCode: 'LAB-CBC', itemName: '血常规', unitCode: '次', adoptionId: 'adoption-1', adoptionRevision: 1,
      quantity: 1, itemAttributeSnapshot: {}, itemAttributeHash: 'hash-lab',
      itemAttributeResolvedAt: '2026-09-28T08:10:00Z', standardMappings: [], serviceType: 'LABORATORY',
      clinicalDescription: '明确感染类型', authoredAt: '2026-09-28T08:11:00Z', documentInfoEditable: true,
      documentInfo: { diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染，未特指', primary: true }],
        externalPrescription: false, specialDisease: '', examinationPurpose: '明确感染类型' },
    } as any
    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescription])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue([medicationRequest])
    api.encounters.serviceRequests = vi.fn().mockResolvedValue([laboratoryRequest])
    if (departmentFound) vi.mocked(api.organization.departments).mockResolvedValue([
      { id: 'actual-lab-dept', organizationId: 'org-1', name: '医学检验科', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null },
    ] as never)

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '审核开立' }))

    const review = await screen.findByRole('dialog', { name: '医嘱开立核查' })
    expect(within(review).getByText('2 张单据')).toBeInTheDocument()
    expect(within(review).getByText('2 项医嘱')).toBeInTheDocument()
    expect(within(review).getByText('检1')).toBeInTheDocument()
    expect(within(review).getByText('血常规')).toBeInTheDocument()
    expect(within(review).getByText('明确感染类型')).toBeInTheDocument()
    expect(await within(review).findByText(departmentFound ? '医学检验科' : '科室编号：actual-lab-dept（名称待确认）')).toBeInTheDocument()
    expect(within(review).getByText('发药药房待确认')).toBeInTheDocument()
    for (const guessed of ['检验科', '中成药房', '默认药房']) expect(within(review).queryByText(guessed)).not.toBeInTheDocument()
  })

  it('shows shadow medication safety findings before submitting a draft prescription', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    vi.mocked(api.encounters.byResident).mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
    }] as Encounter[])
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

    expect(await screen.findByRole('region', { name: '合理用药审查' })).toHaveTextContent('儿童及特定年龄禁忌用药核对')
    expect(screen.getByRole('region', { name: '合理用药审查' })).toHaveTextContent('6岁')
    expect(screen.getByRole('region', { name: '合理用药审查' })).toHaveTextContent('左氧氟沙星片')
    expect(api.encounters.submitPrescription).not.toHaveBeenCalled()
    expect(api.encounters.evaluatePrescriptionSafety).toHaveBeenCalledWith('encounter-101', 'rx-child')

    await user.click(screen.getByRole('button', { name: '已知晓风险，继续开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith('encounter-101', 'rx-child', 0))
  })

  function prepareFormalSafetyReview(status: 'BLOCK' | 'UNAVAILABLE' | 'REQUIRE_OVERRIDE' | 'WARN' = 'REQUIRE_OVERRIDE') {
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    vi.mocked(api.encounters.byResident).mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
    }] as Encounter[])
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
    return screen.findByRole('region', { name: '合理用药审查' })
  }

  it.each(['prescriptions', 'serviceRequests'] as const)(
    'keeps the review open and stops submission when the latest %s query fails', async (method) => {
      const user = userEvent.setup()
      const { api, evaluation } = prepareFormalSafetyReview()
      vi.mocked(api.encounters.evaluatePrescriptionSafety).mockResolvedValue({ ...evaluation, decision: 'PASS', findings: [] })
      renderStation(api)
      await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
      await user.click(await screen.findByRole('button', { name: '审核开立' }))
      const dialog = await screen.findByRole('dialog', { name: '医嘱开立核查' })
      const submit = within(dialog).getByRole('button', { name: '确认分单并开立' })
      await waitFor(() => expect(submit).toBeEnabled())
      vi.mocked(api.encounters[method]).mockRejectedValueOnce(new Error('最新单据查询失败'))
      await user.click(submit)
      expect(await screen.findByText('最新单据查询失败')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: '医嘱开立核查' })).toBeInTheDocument()
      expect(api.encounters.submitPrescription).not.toHaveBeenCalled()
      await user.click(submit)
      await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledTimes(1))
    },
  )

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
    await user.click(screen.getByRole('button', { name: '确认分单并开立' }))
    await waitFor(() => expect(api.encounters.submitPrescription).toHaveBeenCalledWith('encounter-101', 'rx-pair', 0))
    expect(api.encounters.evaluatePrescriptionSafety).toHaveBeenCalledTimes(3)
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

  it('renders a compact completion dialog with fee details, disposition selection, and standard checklist icons', async () => {
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

    // Completion modal keeps a single concise title.
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /诊毕确认/ })).toBeInTheDocument()
    })

    // Verify 4-metric fee totals grid
    expect(screen.getByText('费用合计')).toBeInTheDocument()
    expect(screen.getByText('已支付')).toBeInTheDocument()
    expect(screen.getByText('未开票')).toBeInTheDocument()
    expect(screen.getByText('待支付')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: '诊毕确认' })
    expect(within(dialog).getByRole('combobox', { name: '就诊转归' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('转归及随访说明')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: '常用语' })).not.toBeInTheDocument()

    // Verify standardized checklist
    const checklist = screen.getByLabelText('诊毕准入核对')
    expect(checklist).toHaveTextContent('主诉未保存')
    expect(checklist).toHaveTextContent('未录入主要诊断')
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
    api.clinicalDocuments.sign = vi.fn().mockImplementation(async () => {
      const signed = outpatientNote('SIGNED')
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([signed])
      return signed
    })
    api.encounters.complete = vi.fn().mockImplementation(async () => {
      const completed = { ...readyEncounter, status: 'COMPLETED' as const, completedAt: '2026-10-04T00:00:00Z' }
      api.encounters.get = vi.fn().mockResolvedValue(completed)
      api.encounters.byResident = vi.fn().mockResolvedValue([completed])
      return completed
    })
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

  it.each(['wrong-document', 'unsigned', 'missing-evidence', 'not-persisted'] as const)(
    'does not complete the encounter after an unconfirmed signature: %s', async failure => {
      const user = userEvent.setup()
      const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
      api.encounters.byResident = vi.fn().mockResolvedValue([{ ...mockInProgressEncounter,
        chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
        diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] }])
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
      const receipt = outpatientNote(failure === 'unsigned' ? 'DRAFT' : 'SIGNED')
      if (failure === 'wrong-document') receipt.id = 'another-note'
      if (failure === 'missing-evidence') delete receipt.history[0].signatureEvidenceId
      api.clinicalDocuments.sign = vi.fn().mockResolvedValue(receipt)
      renderStation(api)
      await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
      await user.click(screen.getByRole('button', { name: '诊毕' }))
      await user.click(await screen.findByRole('button', { name: '签署并诊毕' }))
      expect((await screen.findAllByText(/文书操作未确认/)).length).toBeGreaterThan(0)
      expect(api.encounters.complete).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: /诊毕确认/ })).toBeInTheDocument()
    })

  it('does not complete after the signing response arrives in a different API session', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.encounters.byResident = vi.fn().mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] }])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    let finishSign!: (value: ClinicalDocument) => void
    api.clinicalDocuments.sign = vi.fn().mockImplementation(() => new Promise<ClinicalDocument>(resolve => { finishSign = resolve }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const view = (currentApi: RhnApi) => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={currentApi} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>
    const rendered = render(view(api))
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    await user.click(await screen.findByRole('button', { name: '签署并诊毕' }))
    await waitFor(() => expect(api.clinicalDocuments.sign).toHaveBeenCalledTimes(1))
    const nextApi = { ...api, encounters: { ...api.encounters, complete: vi.fn() } }
    rendered.rerender(view(nextApi))
    await act(async () => finishSign(outpatientNote('SIGNED')))
    expect((await screen.findAllByText(/文书操作未确认.*工作上下文/)).length).toBeGreaterThan(0)
    expect(api.encounters.complete).not.toHaveBeenCalled()
    expect(nextApi.encounters.complete).not.toHaveBeenCalled()
  })

  it.each(['text', 'diagnoses', 'api'] as const)('preserves current drafts when %s changes during an ordinary save', async change => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const ready = { ...mockInProgressEncounter, chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }, { code: 'R05', display: '咳嗽', type: 'SECONDARY' }] } as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([ready])
    let stored: ClinicalDocument[] = []
    api.clinicalDocuments.byEncounter = vi.fn().mockImplementation(async () => stored)
    let finishSave!: () => void
    api.encounters.recordClinicalData = vi.fn().mockImplementation((_id, input: ClinicalRecordInput) => new Promise<Encounter>(resolve => {
      finishSave = () => { const saved = clinicalRecordSaveFixture(ready, input); stored = [saved.document]; resolve(saved.encounter) }
    }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const view = (currentApi: RhnApi) => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={currentApi} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>
    const rendered = render(view(api))
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    const complaint = await screen.findByPlaceholderText('症状、持续时间及本次就诊原因')
    fireEvent.change(complaint, { target: { value: '已提交的主诉' } })
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.encounters.recordClinicalData).toHaveBeenCalledTimes(1))
    const readCount = vi.mocked(api.clinicalDocuments.byEncounter).mock.calls.length
    if (change === 'text') fireEvent.change(complaint, { target: { value: '等待期间的新主诉' } })
    else if (change === 'diagnoses') await user.click(screen.getByRole('button', { name: '下移诊断 原发性高血压' }))
    else rendered.rerender(view({ ...api }))
    await act(async () => finishSave())
    if (change !== 'api') expect((await screen.findAllByText(/草稿保存未确认.*保存期间内容已变化/)).length).toBeGreaterThan(0)
    expect(api.clinicalDocuments.byEncounter).toHaveBeenCalledTimes(readCount)
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
    expect(screen.queryByText('门诊病历、诊断与医嘱草稿已保存')).not.toBeInTheDocument()
    expect(complaint).toHaveValue(change === 'text' ? '等待期间的新主诉' : '已提交的主诉')
    if (change === 'diagnoses') {
      const rows = document.querySelectorAll('.doctor-diagnosis-row:not(.is-launcher):not(.is-active-composer)')
      expect(rows[0]).toHaveTextContent('咳嗽')
    }
  })

  it.each([
    ['COMBINED_CONFIRMATION', 'empty'], ['COMBINED_CONFIRMATION', 'wrong-patient'],
    ['COMBINED_CONFIRMATION', 'in-progress'], ['COMBINED_CONFIRMATION', 'not-persisted'],
    ['COMBINED_CONFIRMATION', 'read-error'], ['SEPARATE_CONFIRMATIONS', 'empty'],
  ] as const)('keeps the completion dialog and retry command in %s mode after %s', async (mode, failure) => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const ready = { ...mockInProgressEncounter, chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] } as Encounter
    const completed = { ...ready, status: 'COMPLETED' as const, completedAt: '2026-10-04T00:00:00Z' }
    let stored = ready
    api.encounters.byResident = vi.fn().mockImplementation(async () => [stored])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    api.configuration = { resolve: vi.fn().mockResolvedValue({ key: 'outpatient.doctor-workstation.completion-mode', value: mode,
      requestedScope: 'DEPARTMENT', resolvedScope: 'DEPARTMENT', inherited: false, suppressedByDependency: false }) } as never
    api.encounters.get = vi.fn().mockImplementation(async () => stored)
    if (failure === 'read-error') vi.mocked(api.encounters.get).mockRejectedValueOnce(new Error('诊毕回读中断'))
    api.encounters.complete = vi.fn().mockImplementation(async () => { stored = completed; return completed })
      .mockImplementationOnce(async () => {
        stored = failure === 'not-persisted' ? ready : completed
        return failure === 'empty' ? undefined : failure === 'wrong-patient' ? { ...completed, residentId: 'other' }
          : failure === 'in-progress' ? ready : completed
      })
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    const dialog = await screen.findByRole('dialog', { name: '诊毕确认' })
    await user.click(within(dialog).getByLabelText(/诊毕后批量打印/))
    await user.click(within(dialog).getByRole('button', { name: '确认诊毕' }))
    await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
    // Shared Alert renders into the notification viewport outside the dialog portal.
    expect(await screen.findByText(/诊毕结果未确认/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '诊毕确认' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '批量受控打印' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog', { name: '诊毕确认' })).getByRole('button', { name: '确认诊毕' }))
    expect(await screen.findByRole('dialog', { name: '批量受控打印' })).toBeInTheDocument()
    const calls = vi.mocked(api.encounters.complete).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][1]!.commandCode).toBe(calls[1][1]!.commandCode)
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
    api.encounters.recordClinicalData = vi.fn().mockImplementation((_id, input: ClinicalRecordInput) => new Promise<Encounter>((resolve) => {
      finishSave = value => {
        const saved = clinicalRecordSaveFixture(value, input, 2)
        api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([saved.document])
        resolve(saved.encounter)
      }
    }))
    renderStation(api)

    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    const complaint = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await waitFor(() => expect(complaint).toHaveValue('头痛复诊'))
    fireEvent.change(complaint, { target: { value: '头痛复诊，今日加重' } })
    expect(await screen.findByRole('button', { name: /保存草稿/ })).toBeInTheDocument()
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

  function completionFactsApi() {
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const ready = { ...mockInProgressEncounter, chiefComplaint: '复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] } as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([ready])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    api.clinicalDocuments.sign = vi.fn()
    api.encounters.complete = vi.fn().mockImplementation(async () => {
      const completed = { ...ready, status: 'COMPLETED' as const, completedAt: '2026-10-04T00:00:00Z' }
      api.encounters.get = vi.fn().mockResolvedValue(completed)
      api.encounters.byResident = vi.fn().mockResolvedValue([completed])
      return completed
    })
    return api
  }
  async function openCompletionFacts(api: RhnApi) {
    const user = userEvent.setup()
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    await screen.findByRole('dialog', { name: '诊毕确认' })
    return user
  }
  it.each(['configuration', 'statement', 'services', 'medications', 'payments'] as const)(
    'keeps clinical readiness separate from %s loading and failure', async source => {
      const api = completionFactsApi()
      const object = source === 'configuration' ? api.configuration : ['statement', 'payments'].includes(source) ? api.billing : api.encounters
      const key = source === 'configuration' ? 'resolve' : source === 'statement' ? 'statement'
        : source === 'payments' ? 'paymentOrders' : source === 'services' ? 'serviceRequests' : 'medicationRequests'
      const target = object as unknown as Record<string, (...args: unknown[]) => unknown>
      const original = target[key]
      let reject!: (error: Error) => void
      target[key] = vi.fn(() => new Promise((_resolve, fail) => { reject = fail }))
      const user = await openCompletionFacts(api)
      const button = () => within(screen.getByRole('dialog', { name: '诊毕确认' })).getByRole('button', { name: '确认诊毕' })
      const clinicalSource = !['statement', 'payments'].includes(source)
      if (clinicalSource) expect(button()).toBeDisabled()
      else await waitFor(() => expect(button()).toBeEnabled())
      expect(screen.queryByText('已全部通过')).not.toBeInTheDocument()
      if (source === 'statement') {
        expect(screen.getByText('费用待核对')).toBeInTheDocument()
        expect(screen.queryByText('暂无费用')).not.toBeInTheDocument()
        expect(screen.queryByText(/已结清/)).not.toBeInTheDocument()
      }
      if (source === 'services' || source === 'medications') expect(screen.getByText('医嘱待核对')).toBeInTheDocument()
      await act(async () => reject(new Error('读取中断')))
      expect(await screen.findByText(clinicalSource ? /诊毕资料加载失败/ : /费用信息加载失败/)).toBeInTheDocument()
      if (clinicalSource) {
        await user.click(button())
        expect(api.encounters.complete).not.toHaveBeenCalled()
        expect(api.clinicalDocuments.sign).not.toHaveBeenCalled()
      } else expect(button()).toBeEnabled()
      target[key] = original
      await user.click(screen.getByRole('button', { name: '重新加载诊毕资料' }))
      await waitFor(() => expect(button()).toBeEnabled())
      await user.click(button())
      await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
      expect(vi.mocked(api.encounters.complete).mock.calls[0][1]?.dispositionNote).toBeUndefined()
    })

  it.each(['mode-missing', 'mode-unknown', 'mode-suppressed', 'statement-missing', 'statement-owner',
    'statement-negative', 'statement-settlements', 'services-missing', 'medications-owner', 'payments-missing'] as const)(
    'does not present malformed %s data as completed facts', async failure => {
      const api = completionFactsApi()
      if (failure.startsWith('mode')) api.configuration.resolve = vi.fn().mockResolvedValue(failure === 'mode-missing' ? null : {
        key: 'outpatient.doctor-workstation.completion-mode', value: failure === 'mode-unknown' ? 'UNKNOWN' : 'COMBINED_CONFIRMATION',
        requestedScope: 'DEPARTMENT', resolvedScope: 'DEPARTMENT', inherited: false, suppressedByDependency: failure === 'mode-suppressed',
      })
      else if (failure.startsWith('statement')) api.billing.statement = vi.fn().mockResolvedValue(failure === 'statement-missing' ? null : {
        ...completionStatementFixture(mockInProgressEncounter),
        ...(failure === 'statement-owner' ? { residentId: 'other' } : failure === 'statement-negative' ? { paymentAmount: -1 } : { settlements: null }),
      })
      else if (failure === 'services-missing') api.encounters.serviceRequests = vi.fn().mockResolvedValue(null)
      else if (failure === 'medications-owner') api.encounters.medicationRequests = vi.fn().mockResolvedValue([
        { id: 'med-1', residentId: 'other', encounterId: 'encounter-101', status: 'ACTIVE' },
      ])
      else api.billing.paymentOrders = vi.fn().mockResolvedValue(null)
      const user = await openCompletionFacts(api)
      const billingFailure = failure.startsWith('statement') || failure === 'payments-missing'
      expect(await screen.findByText(billingFailure ? /费用信息加载失败/ : /诊毕资料加载失败/)).toBeInTheDocument()
      const button = within(screen.getByRole('dialog', { name: '诊毕确认' })).getByRole('button', { name: '确认诊毕' })
      if (billingFailure) await waitFor(() => expect(button).toBeEnabled())
      else expect(button).toBeDisabled()
      await user.click(button)
      if (billingFailure) await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
      else expect(api.encounters.complete).not.toHaveBeenCalled()
      expect(api.clinicalDocuments.sign).not.toHaveBeenCalled()
      expect(screen.queryByText('已全部通过')).not.toBeInTheDocument()
    })

  it.each(['uninvoiced', 'unpaid', 'partial-payment', 'failed-settlement', 'pending-payment', 'refunding'] as const)(
    'allows signing and completion with %s while preserving the actual billing status', async failure => {
      const api = completionFactsApi()
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
      api.clinicalDocuments.sign = vi.fn().mockImplementation(async () => {
        const signed = outpatientNote('SIGNED')
        api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([signed])
        return signed
      })
      const unpaid = failure === 'unpaid' || failure === 'partial-payment'
      const pending = failure === 'pending-payment' || failure === 'refunding'
      const settlement = completionSettlementFixture({
        status: failure === 'failed-settlement' ? 'FAILED' : failure === 'unpaid' ? 'PRICED'
          : failure === 'partial-payment' ? 'PARTIAL' : 'SETTLED', outstandingAmount: unpaid ? 10 : 0,
      })
      api.billing.statement = vi.fn().mockResolvedValue({ ...completionStatementFixture(mockInProgressEncounter),
        ...(failure === 'uninvoiced' ? { chargeAmount: 10, uninvoicedAmount: 10 } : { settlements: [settlement] }),
      })
      if (pending) api.billing.paymentOrders = vi.fn().mockResolvedValue([
        { id: 'pay-1', patientAccountId: 'acc-1', settlementId: settlement.id,
          status: failure === 'refunding' ? 'REFUNDING' : 'PENDING', currencyCode: 'CNY',
          requestedAmount: 10, capturedAmount: 0, refundedAmount: 0 },
      ])
      const user = await openCompletionFacts(api)
      const overview = screen.getByRole('region', { name: '诊毕状态汇总' })
      expect(await within(overview).findByText(failure === 'uninvoiced' ? '尚有未开票费用'
        : pending ? '支付处理中' : unpaid ? '¥10.00' : '结算尚未完成',
      { selector: '.doctor-fee-stat-content > strong' })).toBeInTheDocument()
      const button = screen.getByRole('button', { name: '签署并诊毕' })
      await waitFor(() => expect(button).toBeEnabled())
      expect(screen.queryByText(/已结清/)).not.toBeInTheDocument()
      await user.click(button)
      await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
      expect(api.clinicalDocuments.sign).toHaveBeenCalledWith('note-1', 1)
      expect(api.billing.issueInvoice).not.toHaveBeenCalled()
      expect(api.billing.createPaymentOrder).not.toHaveBeenCalled()
    })

  it('invalidates stale fee amounts after a failed refresh without blocking completion', async () => {
    const api = completionFactsApi()
    const user = await openCompletionFacts(api)
    await waitFor(() => expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled())
    api.billing.statement = vi.fn().mockRejectedValue(new Error('费用刷新失败'))
    await user.click(screen.getByRole('button', { name: '重新加载诊毕资料' }))
    expect(await screen.findByText(/费用信息加载失败/)).toBeInTheDocument()
    expect(screen.getByText('费用待核对')).toBeInTheDocument()
    expect(screen.queryByText(/已结清/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '确认诊毕' }))
    await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
  })

  it.each(['statement', 'paymentOrders', 'methods'] as const)(
    'allows signing and completion when the billing %s interface fails', async source => {
      const api = completionFactsApi()
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
      api.clinicalDocuments.sign = vi.fn().mockImplementation(async () => {
        const signed = outpatientNote('SIGNED')
        api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([signed])
        return signed
      })
      if (source === 'methods') {
        api.billing.statement = vi.fn().mockResolvedValue({ ...completionStatementFixture(mockInProgressEncounter),
          settlements: [completionSettlementFixture()],
        })
        api.dictionaries.applicable = vi.fn().mockRejectedValue(new Error('支付方式读取中断'))
      } else api.billing[source] = vi.fn().mockRejectedValue(new Error('费用读取中断'))
      const user = await openCompletionFacts(api)
      await screen.findByText(/费用信息加载失败/)
      const button = screen.getByRole('button', { name: '签署并诊毕' })
      await waitFor(() => expect(button).toBeEnabled())
      await user.click(button)
      await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledTimes(1))
      expect(api.clinicalDocuments.sign).toHaveBeenCalledWith('note-1', 1)
    })

  it.each(['configuration', 'mode-changed', 'services', 'medications'] as const)(
    'rechecks %s before signing even after the displayed facts were ready', async source => {
      const api = completionFactsApi()
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
      const user = await openCompletionFacts(api)
      const button = await screen.findByRole('button', { name: '签署并诊毕' })
      await waitFor(() => expect(button).toBeEnabled())
      if (source === 'configuration') api.configuration.resolve = vi.fn().mockRejectedValue(new Error('配置读取中断'))
      else if (source === 'mode-changed') api.configuration.resolve = vi.fn().mockResolvedValue({
        key: 'outpatient.doctor-workstation.completion-mode', value: 'SEPARATE_CONFIRMATIONS',
        requestedScope: 'DEPARTMENT', resolvedScope: 'DEPARTMENT', inherited: false, suppressedByDependency: false,
      })
      else if (source === 'services') api.encounters.serviceRequests = vi.fn().mockResolvedValue(null)
      else api.encounters.medicationRequests = vi.fn().mockResolvedValue(null)
      await user.click(button)
      expect(await screen.findByText(source === 'configuration' ? '配置读取中断' : /诊毕资料未确认/)).toBeInTheDocument()
      expect(api.clinicalDocuments.sign).not.toHaveBeenCalled()
      expect(api.encounters.complete).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: '诊毕确认' })).toBeInTheDocument()
    })

  it('rejects a late pre-completion read when the API session changes', async () => {
    const api = completionFactsApi()
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const view = (currentApi: RhnApi) => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/outpatient/reception']}>
      <DoctorWorkstation api={currentApi} clinicalContext={clinicalContext} canEdit />
    </MemoryRouter></QueryClientProvider>
    const user = userEvent.setup(), rendered = render(view(api))
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(screen.getByRole('button', { name: '诊毕' }))
    const button = await screen.findByRole('button', { name: '签署并诊毕' })
    await waitFor(() => expect(button).toBeEnabled())
    let finish!: (value: never[]) => void
    api.encounters.serviceRequests = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValue([])
    await user.click(button)
    await waitFor(() => expect(api.encounters.serviceRequests).toHaveBeenCalledTimes(1))
    rendered.rerender(view({ ...api }))
    await act(async () => finish([]))
    expect(await screen.findByText(/文书操作未确认.*工作上下文/)).toBeInTheDocument()
    expect(api.clinicalDocuments.sign).not.toHaveBeenCalled()
    expect(api.encounters.complete).not.toHaveBeenCalled()
  })

  it('submits the selected disposition without duplicating follow-up notes and uses the actual currency', async () => {
    const api = completionFactsApi()
    api.billing.statement = vi.fn().mockResolvedValue({ ...completionStatementFixture(mockInProgressEncounter), currencyCode: 'USD' })
    const user = await openCompletionFacts(api)
    await waitFor(() => expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled())
    const overview = screen.getByRole('region', { name: '诊毕状态汇总' })
    expect(within(overview).getByText('已结清')).toBeInTheDocument()
    expect(overview).not.toHaveTextContent('¥')
    expect(overview).toHaveTextContent('US$0.00')
    await user.click(screen.getByRole('combobox', { name: /就诊转归/ }))
    await user.click(screen.getByRole('option', { name: '收治住院' }))
    await user.click(screen.getByRole('combobox', { name: /就诊转归/ }))
    await user.click(screen.getByRole('option', { name: '转诊 / 转科' }))
    await user.click(screen.getByRole('button', { name: '确认诊毕' }))
    await waitFor(() => expect(api.encounters.complete).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      dispositionCode: 'REFERRAL',
    })))
    expect(vi.mocked(api.encounters.complete).mock.calls[0][1]).not.toHaveProperty('dispositionNote')
  })

  it.each([
    ['invoice', 'empty'], ['invoice', 'read-error'], ['invoice', 'not-persisted'], ['invoice', 'wrong-lines'],
    ['payment', 'empty'], ['payment', 'read-error'], ['payment', 'not-persisted'], ['payment', 'wrong-amount'],
  ] as const)('keeps the original %s request after %s and reconciles it on explicit retry', async (kind, failure) => {
    const api = completionFactsApi()
    const fixture = billingWriteFixture(mockInProgressEncounter, kind)
    api.billing = { ...api.billing, ...fixture.api }
    api.dictionaries.applicable = vi.fn().mockResolvedValue([{ code: 'BANK_CARD', name: '银行卡', sortOrder: 1,
      attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }])
    const user = await openCompletionFacts(api)
    const action = await screen.findByRole('button', { name: kind === 'invoice' ? '生成结算单' : '发起诊间收款' })
    await waitFor(() => expect(action).toBeEnabled())
    if (failure === 'read-error') fixture.api.statement.mockRejectedValueOnce(new Error('结算回读失败'))
    else if (failure === 'not-persisted') {
      if (kind === 'invoice') fixture.api.statement.mockResolvedValueOnce(fixture.before)
      else fixture.api.paymentOrders.mockResolvedValueOnce([])
    } else if (kind === 'invoice') {
      const actual = fixture.api.issueInvoice.getMockImplementation()!
      fixture.api.issueInvoice.mockImplementationOnce(async (...args) => {
        const saved = await actual(...args)
        return failure === 'empty' ? undefined as never : { ...saved, lines: [] }
      })
    } else {
      const actual = fixture.api.createPaymentOrder.getMockImplementation()!
      fixture.api.createPaymentOrder.mockImplementationOnce(async (...args) => {
        const saved = await actual(...args)
        return failure === 'empty' ? undefined as never : { ...saved, requestedAmount: 999 }
      })
    }
    await user.click(action)
    expect(await screen.findByText(/诊间结算操作未确认/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled()
    if (failure === 'empty') {
      await user.click(screen.getByRole('button', { name: '继续诊疗' }))
      expect(screen.queryByRole('dialog', { name: '诊毕确认' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '诊毕' }))
      await screen.findByRole('dialog', { name: '诊毕确认' })
    }
    const retry = await screen.findByRole('button', { name: '核实上次结算' })
    await user.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: '核实上次结算' })).not.toBeInTheDocument())
    const calls = kind === 'invoice' ? fixture.api.issueInvoice.mock.calls : fixture.api.createPaymentOrder.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    await waitFor(() => expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled())
  })

  it('keeps the completion dialog open while a collection request is unresolved', async () => {
    const api = completionFactsApi(), fixture = billingWriteFixture(mockInProgressEncounter, 'payment')
    api.billing = { ...api.billing, ...fixture.api }
    api.dictionaries.applicable = vi.fn().mockResolvedValue([{ code: 'BANK_CARD', name: '银行卡', sortOrder: 1,
      attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }])
    const actual = fixture.api.createPaymentOrder.getMockImplementation()!
    let finish!: () => void
    fixture.api.createPaymentOrder.mockImplementationOnce((...args) => new Promise(resolve => { finish = async () => resolve(await actual(...args)) }))
    const user = await openCompletionFacts(api)
    await user.click(await screen.findByRole('button', { name: '发起诊间收款' }))
    await waitFor(() => expect(fixture.api.createPaymentOrder).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '继续诊疗' })).toBeDisabled()
    await user.click(within(screen.getByRole('dialog', { name: '诊毕确认' })).getByRole('button', { name: '关闭弹窗' }))
    expect(screen.getByRole('dialog', { name: '诊毕确认' })).toBeInTheDocument()
    await act(async () => finish())
    await waitFor(() => expect(screen.getByRole('button', { name: '确认诊毕' })).toBeEnabled())
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
    let storedNote: ClinicalDocument = outpatientNote('SIGNED')
    api.clinicalDocuments.byEncounter = vi.fn().mockImplementation(async () => [storedNote])
    api.clinicalDocuments.amend = vi.fn().mockImplementation(async (_id, input) => {
      storedNote = changedFixture(storedNote, input.content, input.changeReason)
      return storedNote
    })
    api.clinicalDocuments.sign = vi.fn().mockImplementation(async () => {
      storedNote = signedFixture(storedNote)
      return storedNote
    }).mockRejectedValueOnce(new Error('签署服务暂不可用'))
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '发起更正' }))
    expect(screen.getByText('原签署版本和签名证据将完整保留；以下更正内容将生成新版本并重新签署。')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('说明需要更正的内容和原因'), '更正现病史中的症状持续时间')
    await user.click(screen.getByRole('button', { name: '更正并重新签署' }))
    await waitFor(() => expect(api.clinicalDocuments.amend).toHaveBeenCalledWith('note-1', expect.objectContaining({
      expectedCurrentVersion: 1, changeReason: '更正现病史中的症状持续时间',
    })))
    expect((await screen.findAllByText(/文书操作未确认.*签署服务暂不可用/)).length).toBeGreaterThan(0)
    const dialog = screen.getByRole('dialog', { name: '发起病历更正' })
    expect(within(dialog).getByPlaceholderText('说明需要更正的内容和原因')).toHaveValue('更正现病史中的症状持续时间')
    await user.click(within(dialog).getByRole('button', { name: '更正并重新签署' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '发起病历更正' })).not.toBeInTheDocument())
    expect(api.clinicalDocuments.amend).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.clinicalDocuments.sign).mock.calls).toEqual([['note-1', 2], ['note-1', 2]])
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
      id: 'concept-hyp-1', sdStatus: 'ACTIVE', systemCode: 'WHO.BD.CS.ICD10', sdDiagnosisDomain: 'WESTERN_MEDICINE',
      effectiveFrom: '2020-01-01', managementPrograms: [] }])
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

  it('reviews and adopts the complete recommended plan with its linked note before AI co-writing', async () => {
    const api = aiApi()
    const plan: OutpatientPlanTemplate = { id: 'whole-plan', revision: 1, scopeType: 'PERSONAL',
      name: '慢病整体方案', description: '病历和诊断', status: 'ACTIVE', noteTemplateId: 'note-template-1',
      sortOrder: 0, useCount: 0, diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
      medications: [], services: [{ catalogItemId: 'lab-plan', itemCode: 'LAB', itemName: '血常规',
        serviceType: 'LABORATORY', quantity: 1, unitCode: '次', clinicalDescription: '明确感染类型' }], tasks: [], createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }
    api.clinicalAi.recommendPlans = vi.fn().mockResolvedValue([{ templateId: plan.id, name: plan.name,
      description: plan.description, rationale: '符合问诊要点' }])
    vi.mocked(api.outpatientPlanTemplates.list).mockResolvedValue([plan])
    vi.mocked(api.outpatientPlanTemplates.use).mockResolvedValue(plan)
    installTemplateCatalog(api, plan)
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '匹配方案并继续' }))
    await user.click(await screen.findByRole('button', { name: '核对整体方案' }))
    const drawer = await screen.findByRole('complementary', { name: '临床模板' })
    expect(await within(drawer).findByText('配套病历模板')).toBeInTheDocument()
    await user.click(await within(drawer).findByRole('button', { name: '带入当前草稿 (3)' }))
    await waitFor(() => expect(api.outpatientNoteTemplates.use).toHaveBeenCalledWith('note-template-1'))
    await waitFor(() => expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('复诊'))
    expect(api.clinicalAi.generate).not.toHaveBeenCalled()
    expect(api.encounters.recordClinicalData).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('收缩压'), '120')
    await user.type(screen.getByLabelText('舒张压'), '80')
    await user.click(screen.getByRole('button', { name: '审核开立' }))
    const review = await screen.findByRole('dialog', { name: '医嘱开立核查' })
    expect(within(review).queryByText('病历未录入诊断')).not.toBeInTheDocument()
    expect(within(review).getByRole('button', { name: '全部关联主诊断' })).toBeInTheDocument()
    expect(within(review).getByText('原发性高血压')).toBeInTheDocument()
    vi.mocked(api.encounters.recordClinicalData).mockRejectedValueOnce(new Error('病历保存失败'))
    await user.click(within(review).getByRole('button', { name: '确认分单并开立' }))
    expect((await screen.findAllByText('病历保存失败')).length).toBeGreaterThan(0)
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
    vi.mocked(api.clinicalDocuments.byEncounter).mockRejectedValueOnce(new Error('文书查询中断'))
    await user.click(within(review).getByRole('button', { name: '确认分单并开立' }))
    expect((await screen.findAllByText(/病历保存回执未确认.*读取保存后的文书失败/)).length).toBeGreaterThan(0)
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
    expect(screen.queryByText('门诊病历、诊断与医嘱草稿已保存')).not.toBeInTheDocument()
    expect(within(review).getByText('原发性高血压')).toBeInTheDocument()
    await user.click(within(review).getByRole('button', { name: '确认分单并开立' }))
    await waitFor(() => expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1))
    const recordCalls = vi.mocked(api.encounters.recordClinicalData).mock.calls
    expect(recordCalls[1][1].commandCode).toBe(recordCalls[2][1].commandCode)
    expect(api.encounters.recordClinicalData).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      diagnoses: expect.arrayContaining([expect.objectContaining({ code: 'I10', type: 'PRIMARY' })]),
    }))
    expect(vi.mocked(api.encounters.recordClinicalData).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.encounters.saveOrderDrafts).mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '医嘱开立核查' })).not.toBeInTheDocument())
  })

  it('edits template marks inline and confirms their remaining sources through the existing save action', async () => {
    const api = aiApi()
    api.residents.get = vi.fn().mockResolvedValue({ ...mockResident, birthDate: '2020-01-01' })
    api.encounters.byResident = vi.fn().mockResolvedValue([{ ...mockInProgressEncounter,
      diagnoses: [{ code: 'R05', display: '咳嗽', type: 'PRIMARY' }] }])
    const [base] = await api.outpatientNoteTemplates.list()
    const template = { ...base, content: { chiefComplaint: '咳嗽3天', presentIllness: '咳嗽3天，用药3天；无胸痛',
      annotations: [
        { field: 'presentIllness' as const, text: '3天', start: 2, source: 'TEMPLATE' as const,
          kind: 'VARIABLE' as const, binding: 'symptom.cough.duration', label: '咳嗽病程' },
        { field: 'presentIllness' as const, text: '无胸痛', source: 'TEMPLATE' as const,
          kind: 'IMPORTANT' as const, label: '重点阴性' },
      ] } }
    vi.mocked(api.outpatientNoteTemplates.list).mockResolvedValue([template])
    vi.mocked(api.outpatientNoteTemplates.use).mockResolvedValue(template)
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '临床模板' }))
    const drawer = await screen.findByRole('complementary', { name: '临床模板' })
    await user.click(within(drawer).getByRole('tab', { name: /病历模板/ }))
    await user.click(await within(drawer).findByRole('button', { name: '带入病历草稿 (2)' }))
    const legend = screen.getByRole('complementary', { name: '病历标记说明' })
    expect(legend).toHaveTextContent('虚线文字可点击查看来源并调整')
    expect(legend).toHaveTextContent('蓝色：需按本次患者替换')
    expect(legend).toHaveTextContent('橙色：重点信息')
    const annotationFooter = document.querySelector('#doctor-record-form')?.lastElementChild
    expect(annotationFooter).toContainElement(legend)
    expect(annotationFooter).toContainElement(screen.getByRole('button', { name: '隐藏标记' }))
    await user.click(screen.getByRole('button', { name: '隐藏标记' }))
    expect(screen.queryByRole('complementary', { name: '病历标记说明' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '显示标记' }))
    await user.click(await screen.findByRole('button', { name: '3天：模板预设 · 咳嗽病程' }))
    await user.clear(screen.getByLabelText('调整文字'))
    await user.type(screen.getByLabelText('调整文字'), '5天')
    await user.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByRole('textbox', { name: '现病史' })).toHaveTextContent('咳嗽5天，用药3天；无胸痛')
    vi.mocked(api.clinicalDocuments.byEncounter).mockResolvedValueOnce([])
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    expect((await screen.findAllByText(/病历保存回执未确认.*未找到唯一的本次门诊病历/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '无胸痛：模板预设 · 重点阴性 · 已保存确认' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '现病史' })).toHaveTextContent('咳嗽5天，用药3天；无胸痛')
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.encounters.recordClinicalData).toHaveBeenCalledWith('encounter-101', expect.objectContaining({
      presentIllness: '咳嗽5天，用药3天；无胸痛',
      annotations: expect.arrayContaining([expect.objectContaining({ source: 'DOCTOR', binding: 'symptom.cough.duration' }),
        expect.objectContaining({ text: '无胸痛', kind: 'IMPORTANT' })]),
    })))
    expect(await screen.findByRole('button', { name: '无胸痛：模板预设 · 重点阴性 · 已保存确认' })).toBeInTheDocument()
  })

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
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.encounters.recordClinicalData).toHaveBeenCalledWith('encounter-101',
      expect.objectContaining({ chiefComplaint: '咳嗽两天', systolic: undefined, diastolic: undefined })))
    await screen.findByText('门诊病历、诊断与医嘱草稿已保存')
    await user.clear(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'))
    await user.type(screen.getByPlaceholderText('症状、持续时间及本次就诊原因'), '咳嗽三天')
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.encounters.recordClinicalData).toHaveBeenCalledTimes(2))
    expect(api.encounters.recordClinicalData).toHaveBeenLastCalledWith('encounter-101',
      expect.objectContaining({ chiefComplaint: '咳嗽三天' }))
    expect(screen.queryByText(/Invalid input: expected string/)).not.toBeInTheDocument()
  })

  it('keeps mapped treatment suggestions available after record and diagnosis adoption', async () => {
    const api = aiApi()
    api.masterData.searchServices = vi.fn().mockResolvedValue({ content: [{
      id: 'lab-1', code: 'LAB001', name: '血常规', sdServiceType: 'LABORATORY', sdUsageType: 'COMMON',
      sdStatus: 'ACTIVE', orderable: true, chargeable: true, unitCode: '次', validFrom: '2020-01-01', prices: [{ id: 'service-price', organizationId: 'org-1', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 12.5, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true, chargeable: true, validFrom: '2020-01-01' },
    }] } as never)
    const generate = api.clinicalAi.generate
    api.clinicalAi.generate = vi.fn().mockImplementation(async (id, input) => ({ ...await generate(id, input),
      treatmentRecommendations: [{ type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '评估病因' }] }))
    const user = await enter(api)
    await user.click(screen.getByRole('button', { name: '匹配方案并继续' }))
    await waitFor(() => expect(screen.getByPlaceholderText('症状、持续时间及本次就诊原因')).toHaveValue('高血压复诊'))
    const diagnosisTable = screen.getByRole('table', { name: '本次诊断连续录入列表' })
    const orderTable = screen.getByRole('table', { name: '本次医嘱连续录入列表' })
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toHaveTextContent('原发性高血压')
    await user.clear(screen.getByLabelText('收缩压'))
    await user.clear(screen.getByLabelText('舒张压'))
    const saveDraftBtn = screen.getByRole('button', { name: '保存草稿' })
    await user.click(saveDraftBtn)
    console.log('DIAGNOSES DOM:', diagnosisTable.innerHTML)
    console.log('ORDERS DOM:', orderTable.innerHTML)
    await user.click(within(diagnosisTable).getByRole('button', { name: /确认所选诊断/ }))
    await waitFor(() => expect(document.querySelector('.doctor-diagnosis-row')).toHaveTextContent('原发性高血压'))
    expect(within(orderTable).getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    await user.click(within(orderTable).getByRole('button', { name: '确认所选（1）' }))
    await waitFor(() => expect(within(orderTable).queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument())
    expect(orderTable.querySelector('.doctor-unified-order-row.is-draft')).toHaveTextContent('血常规')
    expect(await screen.findByRole('dialog', { name: '医嘱开立核查' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认分单并开立' })).toBeEnabled()
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
      sdStatus: 'ACTIVE', orderable: true, chargeable: true, unitCode: '次', validFrom: '2020-01-01', prices: [{ id: 'service-price', organizationId: 'org-1', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 12.5, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true, chargeable: true, validFrom: '2020-01-01' },
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
    await user.click(screen.getByRole('button', { name: '匹配方案并继续' }))
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

    // 点击保存草稿
    const saveDraftBtn = screen.getByRole('button', { name: '保存草稿' })
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
    await user.click(within(diagnosisTable).getByRole('button', { name: /确认所选诊断/ }))
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
    await user.click(screen.getByRole('button', { name: '匹配方案并继续' }))
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

  it('fills writing paragraphs, excludes textual treatment plan, and restores them with one undo', async () => {
    const api = aiApi()
    const previousGenerate = api.clinicalAi.generate
    api.clinicalAi.generate = vi.fn().mockImplementation(async (id, input) => ({ ...await previousGenerate(id, input),
      recordDraft: { chiefComplaint: '发热3天', presentIllness: '患者发热3天，最高体温39℃。',
        medicalHistory: '既往史待询问', physicalExam: '相关专科查体待完成', healthEducation: '已核对的健康宣教', followUp: '复诊安排待确认', treatmentPlan: '拟完善病因评估并随访。' } }))
    const user = await enter(api)
    const chief = screen.getByPlaceholderText('症状、持续时间及本次就诊原因')
    await user.type(chief, '原始主诉')
    await user.type(screen.getByLabelText('问诊要点或辅助要求'), '感冒发热3天，最高体温39度')
    await user.click(screen.getByRole('button', { name: '匹配方案并继续' }))
    await waitFor(() => expect(chief).toHaveValue('发热3天'))
    expect(screen.getByPlaceholderText('起病、演变、伴随症状及诊治经过')).toHaveValue('患者发热3天，最高体温39℃。')
    expect(screen.getByDisplayValue('既往史待询问')).toBeInTheDocument()
    expect(screen.getByDisplayValue('相关专科查体待完成')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('拟完善病因评估并随访。')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('已核对的健康宣教')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '随访复诊' })).toHaveValue('复诊安排待确认')
    expect(screen.queryByRole('textbox', { name: '诊疗计划' })).not.toBeInTheDocument()
    const diagnosisTable = screen.getByRole('table', { name: '本次诊断连续录入列表' })
    expect(within(diagnosisTable).getByLabelText('AI 诊断待确认')).toBeInTheDocument()
    expect(within(diagnosisTable).getByRole('button', { name: /确认所选诊断/ })).toBeEnabled()
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
      .getByRole('button', { name: /确认所选诊断/ }))
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

describe('DoctorWorkstation controlled printing workflow', () => {
  it('opens compliance explanation and supports one-click signing & printing for unsigned note', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const readyEncounter = {
      ...mockInProgressEncounter,
      chiefComplaint: '头痛复诊',
      systolic: 120,
      diastolic: 80,
      diagnoses: [{
        conceptId: 'concept-hyp-1',
        diagnosisDomain: 'WESTERN_MEDICINE',
        code: 'I10',
        display: '原发性高血压',
        type: 'PRIMARY',
        managementPrograms: [],
      }],
    } as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([readyEncounter])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    api.clinicalDocuments.sign = vi.fn().mockImplementation(async () => {
      const signed = outpatientNote('SIGNED')
      api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([signed])
      return signed
    })

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    const printNoteBtn = await screen.findByRole('button', { name: '打印病历' })
    await user.click(printNoteBtn)

    expect(await screen.findByRole('dialog', { name: '门诊病历打印受控规范' })).toBeInTheDocument()
    expect(screen.getByText(/门诊病历属于法定医疗文书，需由责任医师完成电子签名签署后方可生成不可变正式打印单/)).toBeInTheDocument()

    const signAndPrintBtn = screen.getByRole('button', { name: '签署并打印' })
    await user.click(signAndPrintBtn)

    await waitFor(() => expect(api.clinicalDocuments.sign).toHaveBeenCalledWith('note-1', 1))

    const printModal = await screen.findByRole('dialog', { name: '打印门诊病历' })
    expect(printModal).toBeInTheDocument()

    await user.click(within(printModal).getByRole('button', { name: '受控生成并打印' }))

    await waitFor(() => expect(api.printing.clinicalDocument).toHaveBeenCalledWith('note-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-note-1/content'))

    expect(within(printModal).getByRole('button', { name: '调起打印机' })).toBeInTheDocument()
    expect(within(printModal).getByRole('button', { name: '下载 PDF' })).toBeInTheDocument()
  })

  it('keeps the printing confirmation open when the signature receipt is unconfirmed', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.encounters.byResident = vi.fn().mockResolvedValue([{ ...mockInProgressEncounter,
      chiefComplaint: '头痛复诊', systolic: 120, diastolic: 80,
      diagnoses: [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }] }])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('DRAFT')])
    api.clinicalDocuments.sign = vi.fn().mockResolvedValue(outpatientNote('DRAFT'))
    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))
    await user.click(await screen.findByRole('button', { name: '打印病历' }))
    await user.click(await screen.findByRole('button', { name: '签署并打印' }))
    expect((await screen.findAllByText(/文书操作未确认/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('dialog', { name: '门诊病历打印受控规范' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '打印门诊病历' })).not.toBeInTheDocument()
    expect(api.printing.clinicalDocument).not.toHaveBeenCalled()
  })

  it('directly opens controlled print dialog for signed note', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    await user.click(await screen.findByRole('button', { name: '打印病历' }))

    expect(screen.queryByRole('dialog', { name: '门诊病历打印受控规范' })).not.toBeInTheDocument()
    const printModal = await screen.findByRole('dialog', { name: '打印门诊病历' })
    expect(printModal).toBeInTheDocument()

    await user.click(within(printModal).getByRole('button', { name: '受控生成并打印' }))
    await waitFor(() => expect(api.printing.clinicalDocument).toHaveBeenCalledWith('note-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalled())
  })

  it('prints active prescription from document group header and disables for draft', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationActive = {
      id: 'med-1', revision: 1, prescriptionId: 'rx-1', status: 'ACTIVE',
      medicationId: '362387880000128', medicationSnapshot: { name: '阿莫西林胶囊' },
      quantity: 1, quantityUnit: '盒', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL',
      frequencyCode: 'TID', durationValue: 3, durationUnit: 'DAY', substitutionAllowed: false,
      selfProvided: false, itemAttributeSnapshot: {}, itemAttributeHash: 'h1', standardMappings: [],
      authoredAt: '2026-09-28T08:00:00Z',
    } as any
    const prescriptionActive = {
      id: 'rx-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX20260928001', categoryCode: 'WESTERN_MEDICINE', status: 'ACTIVE',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-28T08:00:00Z', medicationRequests: [medicationActive],
    } as any

    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescriptionActive])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue([medicationActive])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    const printRxBtn = await screen.findByRole('button', { name: /打印.*处方/ })
    expect(printRxBtn).toBeEnabled()
    await user.click(printRxBtn)

    const printModal = await screen.findByRole('dialog', { name: '打印门诊处方' })
    expect(printModal).toBeInTheDocument()

    await user.click(within(printModal).getByRole('button', { name: '受控生成并打印' }))
    await waitFor(() => expect(api.printing.prescription).toHaveBeenCalledWith(
      'encounter-101', 'rx-1', 'PATIENT_COPY', 1,
    ))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith(
      '/api/platform/printing/outputs/out-rx-1/content',
    ))
  })

  it('opens EncounterPrintPanel from right toolbar and displays documents and print records', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    const mockPrintRecord: PrintRecord = {
      outputId: 'out-rx-1',
      sourceType: 'Prescription',
      sourceId: 'rx-1',
      sourceVersion: 1,
      taskCode: 'OUTPATIENT_PRESCRIPTION',
      implementationId: 'imp-1',
      implementationBindingId: 'bind-1',
      payloadSchema: 'RHN.PRESCRIPTION.V1',
      documentType: 'PRESCRIPTION',
      residentId: 'resident-1',
      encounterId: 'encounter-101',
      organizationId: 'org-1',
      departmentId: 'dept-1',
      purpose: 'PATIENT_COPY',
      fileName: '门诊处方-张建国.pdf',
      mediaType: 'application/pdf',
      contentDigestAlgorithm: 'SHA-256',
      contentDigest: 'sha256-mock-digest-rx',
      generatedAt: '2026-09-10T09:00:00Z',
      generatedBy: 'doctor',
      templateCode: 'OUTPATIENT_PRESCRIPTION_A4',
      templateName: '门诊西药处方',
      templateVersion: 1,
      downloadUrl: '/api/platform/printing/outputs/out-rx-1/content',
      jobs: [{
        jobId: 'job-rx-1',
        requestType: 'ORIGINAL',
        copies: 1,
        status: 'GENERATED',
        requestedBy: 'doctor',
        requestedAt: '2026-09-10T09:00:00Z',
      }],
    }
    api.printing.recordsByEncounter = vi.fn().mockResolvedValue([mockPrintRecord])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    const printToolBtn = await screen.findByRole('button', { name: '就诊文书' })
    await user.click(printToolBtn)

    const printCenter = (await screen.findByText('可输出医疗文书与单据')).closest('.doctor-print-center-panel') as HTMLElement
    expect(within(printCenter).getByText('可输出医疗文书与单据')).toBeInTheDocument()
    expect(within(printCenter).getByText('门诊病历')).toBeInTheDocument()

    expect(within(printCenter).getByText('门诊处方-张建国.pdf')).toBeInTheDocument()
    expect(within(printCenter).getByText(/1 次任务/)).toBeInTheDocument()

    const downloadBtn = screen.getByRole('button', { name: '下载' })
    await user.click(downloadBtn)
    await waitFor(() => expect(api.printing.download).toHaveBeenCalledWith(mockPrintRecord))

    const reprintBtn = screen.getByRole('button', { name: '补打' })
    await user.click(reprintBtn)
    expect(await screen.findByRole('dialog', { name: '补打门诊处方' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登记补打并打印' }))
    await waitFor(() => expect(api.printing.reprint).toHaveBeenCalledWith('job-rx-1', 1))

    // 验证已签署门诊病历的状态展示准确性
    expect(within(printCenter).getByText('已签署 · V1')).toBeInTheDocument()
    expect(within(printCenter).getByText('可打印')).toBeInTheDocument()

    // 留痕列表仅保留不可变 PDF 下载与受控补打，移除绕过审计的直接打印
    const printSection = within(printCenter).getByLabelText('受控打印记录与审计留痕')
    expect(within(printSection).queryByRole('button', { name: '打印' })).not.toBeInTheDocument()
    expect(within(printSection).getByRole('button', { name: '下载' })).toBeInTheDocument()
    expect(within(printSection).getByRole('button', { name: '补打' })).toBeInTheDocument()
  })

  it('supports inline one-click batch printing directly inside EncounterPrintPanel without secondary dialog', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationActive = {
      id: 'med-1', revision: 1, prescriptionId: 'rx-1', status: 'ACTIVE',
      medicationId: '362387880000128', medicationSnapshot: { name: '阿莫西林胶囊' },
      quantity: 1, quantityUnit: '盒', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL',
      frequencyCode: 'TID', durationValue: 3, durationUnit: 'DAY', substitutionAllowed: false,
      selfProvided: false, itemAttributeSnapshot: {}, itemAttributeHash: 'h1', standardMappings: [],
      authoredAt: '2026-09-28T08:00:00Z',
    } as any
    const prescriptionActive = {
      id: 'rx-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX20260928001', categoryCode: 'WESTERN', status: 'ACTIVE',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-28T08:00:00Z', medicationRequests: [medicationActive],
    } as any
    const serviceActive = {
      id: 'svc-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-101',
      requestNo: 'SR20260928001', serviceType: 'LABORATORY', status: 'ACTIVE',
      itemName: '血常规', catalogItemId: 'lab-1',
      authoredAt: '2026-09-28T08:00:00Z',
    } as any

    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescriptionActive])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue([medicationActive])
    api.encounters.serviceRequests = vi.fn().mockResolvedValue([serviceActive])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    const printToolBtn = await screen.findByRole('button', { name: '就诊文书' })
    await user.click(printToolBtn)

    const printCenter = (await screen.findByText('可输出医疗文书与单据')).closest('.doctor-print-center-panel') as HTMLElement
    expect(printCenter).toBeInTheDocument()

    // 抽屉内直接展示批量操作栏，并且默认勾选了所有就绪项（3 项）
    expect(printCenter.querySelector('.doctor-batch-count-hint')).toHaveTextContent(/已选\s*3\s*\/\s*3\s*项可打印单据/)
    const batchTriggerBtn = within(printCenter).getByRole('button', { name: /一键批量打印/ })
    expect(batchTriggerBtn).toBeInTheDocument()

    // 点击一键批量打印，原地执行，不触发任何二次弹窗
    await user.click(batchTriggerBtn)

    // 确认没有弹出任何二次 Dialog 弹窗
    expect(screen.queryByRole('dialog', { name: '批量受控打印' })).not.toBeInTheDocument()

    // 验证 API 依次调起
    await waitFor(() => expect(api.printing.clinicalDocument).toHaveBeenCalledWith('note-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.prescription).toHaveBeenCalledWith('encounter-101', 'rx-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.serviceRequest).toHaveBeenCalledWith('encounter-101', 'svc-1', 'PATIENT_COPY', 1))

    // 验证调起系统打印
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-note-1/content'))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-rx-1/content'))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-svc-1/content'))

    // 验证出现就地成功反馈提示（Toast/Alert 渲染在系统通知视口）
    expect(await screen.findByText(/已成功完成 3 项文书受控生成并调起打印/)).toBeInTheDocument()
  })

  it('supports one-click batch printing for all ready clinical documents and orders', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const medicationActive = {
      id: 'med-1', revision: 1, prescriptionId: 'rx-1', status: 'ACTIVE',
      medicationId: '362387880000128', medicationSnapshot: { name: '阿莫西林胶囊' },
      quantity: 1, quantityUnit: '盒', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL',
      frequencyCode: 'TID', durationValue: 3, durationUnit: 'DAY', substitutionAllowed: false,
      selfProvided: false, itemAttributeSnapshot: {}, itemAttributeHash: 'h1', standardMappings: [],
      authoredAt: '2026-09-28T08:00:00Z',
    } as any
    const prescriptionActive = {
      id: 'rx-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-101',
      prescriptionNo: 'RX20260928001', categoryCode: 'WESTERN', status: 'ACTIVE',
      performerOrganizationId: 'org-1', performerDepartmentId: 'dept-1',
      authoredAt: '2026-09-28T08:00:00Z', medicationRequests: [medicationActive],
    } as any
    const serviceActive = {
      id: 'svc-1', revision: 1, residentId: 'resident-1', encounterId: 'encounter-101',
      requestNo: 'SR20260928001', serviceType: 'LABORATORY', status: 'ACTIVE',
      itemName: '血常规', catalogItemId: 'lab-1',
      authoredAt: '2026-09-28T08:00:00Z',
    } as any

    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])
    api.encounters.prescriptions = vi.fn().mockResolvedValue([prescriptionActive])
    api.encounters.medicationRequests = vi.fn().mockResolvedValue([medicationActive])
    api.encounters.serviceRequests = vi.fn().mockResolvedValue([serviceActive])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    const batchPrintBtn = await screen.findByRole('button', { name: '批量打印' })
    await user.click(batchPrintBtn)

    const batchModal = await screen.findByRole('dialog', { name: '批量受控打印' })
    expect(batchModal).toBeInTheDocument()

    expect(within(batchModal).getByText('门诊病历')).toBeInTheDocument()
    expect(within(batchModal).getByText(/西药处方/)).toBeInTheDocument()
    expect(within(batchModal).getByText(/检验申请单 · 血常规/)).toBeInTheDocument()
    expect(batchModal.querySelector('.doctor-batch-count-hint')).toHaveTextContent(/已选\s*3\s*\/\s*3\s*项可打印单据/)

    const triggerBtn = within(batchModal).getByRole('button', { name: /一键批量打印/ })
    await user.click(triggerBtn)

    await waitFor(() => expect(api.printing.clinicalDocument).toHaveBeenCalledWith('note-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.prescription).toHaveBeenCalledWith('encounter-101', 'rx-1', 'PATIENT_COPY', 1))
    await waitFor(() => expect(api.printing.serviceRequest).toHaveBeenCalledWith('encounter-101', 'svc-1', 'PATIENT_COPY', 1))

    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-note-1/content'))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-rx-1/content'))
    await waitFor(() => expect(api.printing.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/out-svc-1/content'))

    expect(within(batchModal).getByText('批量受控打印完成（共 3 项）')).toBeInTheDocument()

    await user.click(within(batchModal).getByRole('button', { name: '完成' }))
    expect(screen.queryByRole('dialog', { name: '批量受控打印' })).not.toBeInTheDocument()
  })

  it('supports batch printing linked directly after encounter completion', async () => {
    const user = userEvent.setup()
    const api = createMockApi({ initialEncounterStatus: 'IN_PROGRESS', queueStatus: 'SERVING' })
    const readyEncounter = {
      ...mockInProgressEncounter,
      chiefComplaint: '头痛复诊',
      systolic: 120,
      diastolic: 80,
      diagnoses: [{
        conceptId: 'concept-hyp-1',
        diagnosisDomain: 'WESTERN_MEDICINE',
        code: 'I10',
        display: '原发性高血压',
        type: 'PRIMARY',
        managementPrograms: [],
      }],
    } as Encounter
    api.encounters.byResident = vi.fn().mockResolvedValue([readyEncounter])
    api.clinicalDocuments.byEncounter = vi.fn().mockResolvedValue([outpatientNote('SIGNED')])

    renderStation(api)
    await user.click(await screen.findByRole('button', { name: '继续接诊 张建国' }))

    await user.click(await screen.findByRole('button', { name: '诊毕' }))
    const completionModal = await screen.findByRole('dialog', { name: '诊毕确认' })
    expect(completionModal).toBeInTheDocument()

    api.encounters.complete = vi.fn().mockImplementation(async () => {
      const completed = { ...readyEncounter, status: 'COMPLETED' as const, completedAt: '2026-10-04T00:00:00Z' }
      api.encounters.get = vi.fn().mockResolvedValue(completed)
      api.encounters.byResident = vi.fn().mockResolvedValue([completed])
      return completed
    })

    const printOptionCheckbox = screen.getByLabelText(/诊毕后批量打印/)
    expect(printOptionCheckbox).toBeInTheDocument()
    expect(printOptionCheckbox).not.toBeChecked()

    await user.click(printOptionCheckbox)
    expect(printOptionCheckbox).toBeChecked()

    await user.click(within(completionModal).getByRole('button', { name: '确认诊毕' }))

    await waitFor(() => expect(api.encounters.complete).toHaveBeenCalled())

    const batchModal = await screen.findByRole('dialog', { name: '批量受控打印' })
    expect(batchModal).toBeInTheDocument()
  })
})
