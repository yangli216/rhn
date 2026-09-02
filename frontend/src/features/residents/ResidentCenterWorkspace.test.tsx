import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Resident } from '../../shared/model'
import type { ResidentPageView, ResidentProfile } from '../../shared/api/residentsApi'
import type { RhnApi } from '../../shared/rhnApi'
import { ResidentCenterWorkspace } from './ResidentCenterWorkspace'

const sampleResident1: Resident = {
  id: 'resident-1',
  healthRecordNo: 'HR0001',
  fullName: '赵大海',
  gender: 'MALE',
  birthDate: '1980-05-12',
  phone: '13800138001',
  maskedNationalId: '330102********1234',
  deceased: false,
  createdAt: '2026-08-30T10:00:00Z',
  status: 'ACTIVE',
  version: 1,
  identifiers: [
    { id: 'id-1', system: 'NATIONAL_ID', maskedValue: '330102********1234', useType: 'OFFICIAL', status: 'ACTIVE' },
  ],
}

const sampleResident2: Resident = {
  id: 'resident-2',
  healthRecordNo: 'HR0002',
  fullName: '孙美丽',
  gender: 'FEMALE',
  birthDate: '1992-09-20',
  phone: '13900139002',
  maskedNationalId: '330102********5678',
  deceased: false,
  createdAt: '2026-08-31T09:30:00Z',
  status: 'ACTIVE',
  version: 1,
  identifiers: [
    { id: 'id-2', system: 'NATIONAL_ID', maskedValue: '330102********5678', useType: 'OFFICIAL', status: 'ACTIVE' },
  ],
}

const sampleProfile1: ResidentProfile = {
  resident: sampleResident1,
  demographicProfile: {
    nationalityCode: 'CHN',
    ethnicityCode: '01',
    sdResidencyTypeText: '户籍人口',
    sdMaritalStatusText: '已婚',
    sdEducationLevelText: '大学本科',
    sdOccupationTypeText: '专业技术人员',
  },
  addresses: [
    { id: 'addr-1', sdUse: 'HOME', sdUseText: '家庭地址', addressText: '示范街 1 号', primary: true, validFrom: '2020-01-01' },
  ],
  relatedPersons: [],
  coverages: [],
  employments: [],
}

function createMockApi(overrides: Partial<RhnApi['residents']> = {}) {
  const pageMock = vi.fn().mockResolvedValue({
    content: [sampleResident1, sampleResident2],
    page: 0,
    size: 20,
    totalElements: 2,
    totalPages: 1,
    first: true,
    last: true,
  } as ResidentPageView)

  const profileMock = vi.fn().mockResolvedValue(sampleProfile1)
  const createMock = vi.fn().mockResolvedValue(sampleResident1)
  const updateProfileMock = vi.fn().mockResolvedValue(sampleProfile1)
  const searchMock = vi.fn().mockResolvedValue([sampleResident1])

  return {
    residents: {
      page: pageMock,
      profile: profileMock,
      create: createMock,
      updateProfile: updateProfileMock,
      search: searchMock,
      get: vi.fn().mockResolvedValue(sampleResident1),
      allergies: vi.fn().mockResolvedValue([]),
      recordAllergy: vi.fn(),
      inactivateAllergy: vi.fn(),
      ...overrides,
    },
  } as unknown as RhnApi
}

function renderWorkspace(api: RhnApi, onNavigate = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResidentCenterWorkspace api={api} onNavigate={onNavigate} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onNavigate, queryClient }
}

describe('ResidentCenterWorkspace', () => {
  it('renders the resident roster table with correct items and pagination', async () => {
    const api = createMockApi()
    renderWorkspace(api)

    expect(screen.getByText('居民中心')).toBeInTheDocument()
    expect(screen.getByText('已建档居民列表')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('赵大海')).toBeInTheDocument()
      expect(screen.getByText('孙美丽')).toBeInTheDocument()
      expect(screen.getByText('HR0001')).toBeInTheDocument()
      expect(screen.getByText('HR0002')).toBeInTheDocument()
      expect(screen.getByText('共 2 条档案记录')).toBeInTheDocument()
    })
  })

  it('triggers search with query parameters when submitting filter form', async () => {
    const api = createMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByText('赵大海')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('姓名、身份证、档案号或手机号')
    fireEvent.change(searchInput, { target: { value: '赵大海' } })
    fireEvent.click(screen.getByRole('button', { name: /查询/ }))

    await waitFor(() => {
      expect(api.residents.page).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '赵大海',
          page: 0,
        }),
      )
    })
  })

  it('navigates to resident profile view and returns back to list', async () => {
    const api = createMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByText('赵大海')).toBeInTheDocument()
    })

    const viewButtons = screen.getAllByRole('button', { name: /查看档案/ })
    fireEvent.click(viewButtons[0])

    await waitFor(() => {
      expect(screen.getByText('返回居民列表')).toBeInTheDocument()
      expect(screen.getByText('健康档案号')).toBeInTheDocument()
      expect(screen.getByText('基本与人口学资料')).toBeInTheDocument()
      expect(screen.getByText('户籍人口')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('返回居民列表'))

    await waitFor(() => {
      expect(screen.getByText('已建档居民列表')).toBeInTheDocument()
    })
  })

  it('supports clicking 挂号 button to navigate to outpatient registration', async () => {
    const onNavigate = vi.fn()
    const api = createMockApi()
    renderWorkspace(api, onNavigate)

    await waitFor(() => {
      expect(screen.getByText('赵大海')).toBeInTheDocument()
    })

    const registerButtons = screen.getAllByRole('button', { name: /挂号/ })
    fireEvent.click(registerButtons[0])

    expect(onNavigate).toHaveBeenCalledWith('/outpatient/registration?residentId=resident-1')
  })

  it('opens CreateResidentDialog and parses national ID automatically', async () => {
    const api = createMockApi()
    renderWorkspace(api)

    await waitFor(() => {
      expect(screen.getByText('赵大海')).toBeInTheDocument()
    })

    const newResidentBtn = screen.getByRole('button', { name: /新建居民/ })
    fireEvent.click(newResidentBtn)

    await waitFor(() => {
      expect(screen.getByText('身份与基本信息')).toBeInTheDocument()
    })

    const idInput = screen.getByPlaceholderText(/录入18位身份证/)
    fireEvent.change(idInput, { target: { value: '330102199008151234' } })

    await waitFor(() => {
      const birthDateInput = screen.getByLabelText(/出生日期/) as HTMLInputElement
      expect(birthDateInput.value).toBe('1990-08-15')
    })

    // Also check that coverage is synced
    await waitFor(() => {
      const memberNoInput = screen.getByPlaceholderText(/自动关联社保卡或身份证/) as HTMLInputElement
      expect(memberNoInput.value).toBe('330102199008151234')
    })
  })
})
