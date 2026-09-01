import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { ProfessionalScheduleResult } from '../../shared/api/schedulingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { SchedulingWorkspace } from './SchedulingWorkspace'

const clinicalContext = {
  organization: { id: 'org-1', name: '青禾镇中心卫生院' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

describe('SchedulingWorkspace', () => {
  it('creates a minimal professional timed template when the department enables professional mode', async () => {
    const result = {
      generationRunId: 'run-1', replayed: false, generatedCount: 40, skippedCount: 0,
      template: {
        id: 'template-1', templateCode: 'TPL001', templateName: '基层门诊分时排班',
        practitionerId: 'doctor-1', practitionerName: '李医生', catalogItemId: 'service-1',
        serviceCode: 'GENERAL', serviceName: '全科门诊', validFrom: '2099-01-01', validTo: '2099-01-28',
        status: 'ACTIVE', periods: [], exceptions: [],
      },
      schedules: [],
    } as ProfessionalScheduleResult
    const createProfessionalTemplate = vi.fn().mockResolvedValue(result)
    const api = {
      scheduling: {
        bootstrap: vi.fn().mockResolvedValue({
          sdManagementMode: 'PROFESSIONAL', sdManagementModeText: '专业模式', defaultCapacity: 30,
          defaultGenerateDays: 28, morning: { start: '08:00:00', end: '12:00:00' },
          afternoon: { start: '14:00:00', end: '17:00:00' },
          practitioners: [{ id: 'doctor-1', code: 'D001', name: '李医生', assignmentId: 'assignment-1' }],
        }),
        schedules: vi.fn().mockResolvedValue([]),
        professionalTemplates: vi.fn().mockResolvedValue([]),
        createProfessionalTemplate,
      },
      masterData: { services: vi.fn().mockResolvedValue([{
        id: 'service-1', code: 'GENERAL', name: '全科门诊', orderable: true, sdUsageType: 'OUTPATIENT',
        serviceSubtype: 'OUTPATIENT_VISIT', accountingCategory: 'REGISTRATION',
        organizationAdoption: { sdStatus: 'ACTIVE', orderable: true, executable: true },
      }]) },
    } as unknown as RhnApi
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })

    render(<QueryClientProvider client={queryClient}>
      <SchedulingWorkspace api={api} clinicalContext={clinicalContext} onNavigate={vi.fn()} />
    </QueryClientProvider>)

    expect(await screen.findByText('建立规则模板并生成班次')).toBeInTheDocument()
    expect(screen.getByText('暂无例外，将按固定规则生成全部班次。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存模板并生成班次' }))

    await waitFor(() => expect(createProfessionalTemplate).toHaveBeenCalledWith(expect.objectContaining({
      templateName: '基层门诊分时排班', practitionerId: 'doctor-1', catalogItemId: 'service-1',
      weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '12:00', slotMode: 'TIMED',
      slotMinutes: 30, capacity: 1, exceptions: [], idempotencyCode: 'request-1',
    })))
    expect(await screen.findByText(/已保存，生成 40 个班次/)).toBeInTheDocument()
  })
})
