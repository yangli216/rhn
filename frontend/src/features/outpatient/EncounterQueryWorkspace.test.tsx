import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { EncounterPageView, EncounterQueryItem } from '../../shared/api/encountersApi'
import type { RhnApi } from '../../shared/rhnApi'
import { EncounterQueryWorkspace } from './EncounterQueryWorkspace'

const registeredEncounter: EncounterQueryItem = {
  id: 'encounter-1',
  encounterNo: 'ENC202609210001',
  residentId: 'resident-1',
  healthRecordNo: 'HR0001',
  residentName: '张三',
  gender: 'MALE',
  birthDate: '1990-01-01',
  phone: '13800138001',
  organizationId: 'org-1',
  departmentId: 'dept-1',
  departmentName: '全科医疗科',
  registrationId: 'registration-1',
  registrationNo: 'REG001',
  registrationSource: 'WINDOW',
  visitType: 'GENERAL',
  clinicianId: 'DOC01',
  clinicianName: '李医生',
  status: 'REGISTERED',
  chiefComplaint: '咽痛三天伴发热',
  systolic: 120,
  diastolic: 80,
  primaryDiagnosisName: '急性上呼吸道感染',
  primaryDiagnosisCode: 'J00',
  diagnosisCount: 1,
  serviceName: '全科门诊',
  locationName: '诊室 1',
  registeredAt: '2026-09-21T01:30:00Z',
  startedAt: null,
  completedAt: null,
}

const completedEncounter: EncounterQueryItem = {
  ...registeredEncounter,
  id: 'encounter-2',
  encounterNo: 'ENC202609210002',
  residentId: 'resident-2',
  healthRecordNo: 'HR0002',
  residentName: '王芳',
  gender: 'FEMALE',
  birthDate: '1986-03-08',
  phone: '13900139002',
  status: 'COMPLETED',
  primaryDiagnosisName: '原发性高血压',
  primaryDiagnosisCode: 'I10',
  chiefComplaint: '血压升高伴头昏',
  startedAt: '2026-09-21T02:00:00Z',
  completedAt: '2026-09-21T02:25:00Z',
}

const clinicalContext = {
  organization: { id: 'org-1', name: '基层医疗机构' },
  department: { id: 'dept-1', name: '全科医疗科' },
} as ClinicalContext

function renderWorkspace(api: RhnApi, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/outpatient/encounter-query']}>
        <EncounterQueryWorkspace api={api} clinicalContext={clinicalContext} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onNavigate, queryClient }
}

function apiWithPage(list: EncounterQueryItem[]) {
  const page = vi.fn((params: {
    dateFrom?: string
    dateTo?: string
    status?: string
    query?: string
    page?: number
    size?: number
    scope?: 'DEPARTMENT' | 'ORGANIZATION'
  } = {}) => {
    const pageIndex = params.page ?? 0
    const pageSize = params.size ?? 20
    const queryStr = params.query?.toLowerCase()
    const status = params.status
    const filtered = list.filter((item) => {
      if (status && item.status !== status) return false
      if (queryStr) {
        return [item.residentName, item.healthRecordNo, item.encounterNo, item.registrationNo]
          .some((val) => val?.toLowerCase().includes(queryStr))
      }
      return true
    })
    const totalElements = filtered.length
    const totalPages = Math.ceil(totalElements / pageSize)
    const content = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
    const result: EncounterPageView = {
      content,
      page: pageIndex,
      size: pageSize,
      totalElements,
      totalPages,
      first: pageIndex === 0,
      last: pageIndex >= totalPages - 1,
    }
    return Promise.resolve(result)
  })

  return {
    encounters: { page },
  } as unknown as RhnApi
}

describe('EncounterQueryWorkspace', () => {
  it('queries encounters, displays metrics, filters records and navigates to doctor workstation', async () => {
    const api = apiWithPage([registeredEncounter, completedEncounter])
    const onNavigate = vi.fn()
    renderWorkspace(api, onNavigate)

    expect(await screen.findByText('ENC202609210001')).toBeInTheDocument()
    expect(screen.getByText('ENC202609210002')).toBeInTheDocument()
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('王芳')).toBeInTheDocument()
    expect(screen.getByText('急性上呼吸道感染')).toBeInTheDocument()
    expect(screen.getByText('共 2 条 · 全科医疗科')).toBeInTheDocument()
    const statusSummary = screen.getByLabelText('就诊状态汇总')
    expect(statusSummary).toBeInTheDocument()
    expect(within(statusSummary).getByText('接诊中 / 暂挂')).toBeInTheDocument()
    expect(within(statusSummary).getByText('已诊毕 / 已转科')).toBeInTheDocument()
    expect(within(statusSummary).getByText('已终止 / 已取消')).toBeInTheDocument()

    // 改变日期范围触发接口查询
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-09-20' } })
    await waitFor(() => expect(api.encounters.page).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: '2026-09-20',
      dateTo: '2026-09-20',
      page: 0,
    })))

    // 输入关键词过滤
    await userEvent.type(screen.getByPlaceholderText('姓名、档案号、就诊号、挂号单、医生、诊断或主诉'), '王芳')
    await userEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.encounters.page).toHaveBeenCalledWith(expect.objectContaining({
      query: '王芳',
      page: 0,
    })))
    expect(screen.queryByText('ENC202609210001')).not.toBeInTheDocument()
    expect(screen.getByText('ENC202609210002')).toBeInTheDocument()

    // 点击“查看病历”跳转至门诊医生站
    await userEvent.click(screen.getByRole('button', { name: '查看病历' }))
    expect(onNavigate).toHaveBeenCalledWith(
      '/outpatient/reception?residentId=resident-2&encounterId=encounter-2',
    )
  })

  it('supports navigation to doctor workstation via top action button', async () => {
    const api = apiWithPage([registeredEncounter])
    const onNavigate = vi.fn()
    renderWorkspace(api, onNavigate)

    await userEvent.click(screen.getByRole('button', { name: '门诊医生站' }))
    expect(onNavigate).toHaveBeenCalledWith('/outpatient/reception')
  })
})
