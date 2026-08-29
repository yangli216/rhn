import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { SystemEnumDefinition } from '../../shared/api/dictionaryApi'
import type { ReceptionQueueItem, ServiceSchedule } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import type { RegistrationBillingIntent } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientRegistrationWorkspace } from './RegistrationWorkspace'

const resident: Resident = {
  id: 'resident-1', healthRecordNo: 'HR0001', fullName: '张三', maskedNationalId: '3301********1234',
  gender: 'MALE', birthDate: '1990-01-01', deceased: false, createdAt: '2026-08-29T01:00:00Z',
  status: 'ACTIVE', version: 0, identifiers: [],
}

const schedule: ServiceSchedule = {
  id: 'schedule-1', scheduleCode: 'SC001', serviceDate: '2026-08-29', sdDayPart: 'MORNING',
  sdDayPartText: '上午', startAt: '2026-08-29T00:00:00Z', endAt: '2026-08-29T04:00:00Z',
  practitionerId: 'doctor-1', practitionerName: '李医生', catalogItemId: 'service-1',
  serviceCode: 'GENERAL', serviceName: '全科门诊', totalCount: 20, heldCount: 0, occupiedCount: 2,
  frozenCount: 0, availableCount: 18, sdStatus: 'PUBLISHED', sdStatusText: '可预约',
  sdManagementMode: 'SIMPLE', sdManagementModeText: '简易模式', sdBookingPolicy: 'SHARED',
  sdBookingPolicyText: '共享号源', sdSlotMode: 'POOL', sdSlotModeText: '号池模式',
}

const encounter: Encounter = {
  id: 'encounter-1', residentId: resident.id, encounterNo: 'E20260829001', organizationId: 'org-1',
  departmentId: 'dept-1', registrationId: 'registration-1', scheduleId: schedule.id,
  registrationSource: 'WINDOW', visitType: 'GENERAL', status: 'REGISTERED', diagnoses: [],
  registeredAt: '2026-08-29T02:00:00Z',
}

const receipt: ReceptionQueueItem = {
  registrationId: 'registration-1', scheduleId: schedule.id, encounterId: encounter.id, residentId: resident.id,
  healthRecordNo: resident.healthRecordNo, residentName: resident.fullName, gender: resident.gender,
  birthDate: resident.birthDate, registrationNo: 'REG001', ticketNo: 'A001', sequenceNo: 1, priority: 0,
  registrationSource: 'WINDOW', visitType: 'GENERAL', registrationStatus: 'REGISTERED', status: 'WAITING',
  practitionerName: '李医生', serviceName: '全科门诊', registeredAt: encounter.registeredAt,
}

const visitTypes = {
  code: 'SC_VISIT_TYPE', name: '门诊就诊类型', items: [
    { code: 'GENERAL', name: '普通门诊', sortOrder: 10 },
    { code: 'FOLLOW_UP', name: '复诊', sortOrder: 20 },
    { code: 'EMERGENCY', name: '急诊', sortOrder: 30 },
  ],
} as SystemEnumDefinition

const receptionStatuses = {
  code: 'SC_RECEPTION_STATUS', name: '门诊候诊状态', items: [
    { code: 'WAITING', name: '候诊中', sortOrder: 10 },
    { code: 'IN_SERVICE', name: '接诊中', sortOrder: 20 },
    { code: 'COMPLETED', name: '已诊毕', sortOrder: 30 },
    { code: 'CANCELLED', name: '已取消', sortOrder: 40 },
  ],
} as SystemEnumDefinition

describe('OutpatientRegistrationWorkspace', () => {
  it('registers the deep-linked resident against an available schedule and shows the queue receipt', async () => {
    const registrationIntent = {
      id: 'intent-1', revision: 1, residentId: resident.id, organizationId: 'org-1', departmentId: 'dept-1',
      scheduleId: schedule.id, slotHoldId: 'hold-1', encounterId: encounter.id,
      idempotencyCode: 'REG-INTENT-request-1', registrationSource: 'WINDOW', visitType: 'GENERAL',
      status: 'COMPLETED', feeAmount: 0, currencyCode: 'CNY', completionAttempts: 1,
      createdAt: '2026-08-29T01:59:00Z', updatedAt: '2026-08-29T02:00:00Z', duplicate: false,
    } as RegistrationBillingIntent
    const createRegistrationIntent = vi.fn().mockResolvedValue(registrationIntent)
    const receptionQueue = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([receipt])
    const api = {
      residents: { get: vi.fn().mockResolvedValue(resident), search: vi.fn() },
      scheduling: { schedules: vi.fn().mockResolvedValue([schedule]), receptionQueue },
      dictionaries: { systemEnum: vi.fn((code: string) => Promise.resolve(
        code === 'SC_VISIT_TYPE' ? visitTypes : receptionStatuses,
      )), applicable: vi.fn().mockResolvedValue([]) },
      billing: {
        createRegistrationIntent,
        registrationIntent: vi.fn().mockResolvedValue(registrationIntent),
      },
      encounters: { byResident: vi.fn().mockResolvedValue([encounter]) },
    } as unknown as RhnApi
    const clinicalContext = {
      organization: { id: 'org-1', name: '基层医疗机构' },
      department: { id: 'dept-1', name: '全科医疗科' },
    } as ClinicalContext
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/registration?residentId=resident-1']}>
        <OutpatientRegistrationWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>)

    await screen.findByText('健康档案号')
    await userEvent.click(screen.getByRole('button', { name: /确认挂号/ }))

    await waitFor(() => expect(createRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({
      residentId: resident.id,
      scheduleId: schedule.id,
      organizationId: 'org-1',
      departmentId: 'dept-1',
      registrationSource: 'WINDOW',
      visitType: 'GENERAL',
      idempotencyCode: 'REG-INTENT-request-1',
    })))
    expect(await screen.findByText('挂号成功：挂号单 REG001，候诊号 A001')).toBeInTheDocument()
  })
})
