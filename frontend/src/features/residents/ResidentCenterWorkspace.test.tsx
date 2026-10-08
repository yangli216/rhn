import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    dictionaries: {
      resolve: vi.fn().mockImplementation(async (code: string) => code === 'PI_RESIDENT_IDENTIFIER_SYSTEM'
        ? [{ code: '1', name: '居民身份证', sortOrder: 1 }, { code: '6', name: '护照', sortOrder: 2 },
          { code: 'SOCIAL_SECURITY_CARD', name: '社会保障卡', sortOrder: 3 }]
        : code === 'INS_COVERAGE_TYPE' ? [{ code: '02', name: '居民医疗保障', sortOrder: 1 }] : []),
      get: vi.fn(),
    },
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
  const validPage: ResidentPageView = { content: [sampleResident1, sampleResident2], page: 0, size: 20,
    totalElements: 2, totalPages: 1, first: true, last: true }

  it('reports unavailable counts on list failures and recovers through refresh', async () => {
    const page = vi.fn().mockRejectedValueOnce(new Error('居民查询失败')).mockResolvedValue(validPage)
    renderWorkspace(createMockApi({ page }))
    expect(await screen.findByText('居民查询失败')).toBeInTheDocument()
    expect(screen.getByText('档案数量暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('共 0 条档案记录')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到居民档案记录')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('共 2 条档案记录')).toBeInTheDocument()
  })

  it.each([
    null, {}, { ...validPage, content: null }, { ...validPage, totalElements: -1 },
    { ...validPage, totalElements: 0 }, { ...validPage, totalPages: 9 }, { ...validPage, page: 1 },
    { ...validPage, content: [sampleResident1, sampleResident1] },
    { ...validPage, content: [sampleResident1, { ...sampleResident2, status: 'UNRECOGNIZED' }] },
    { ...validPage, content: [sampleResident1, { ...sampleResident2, deceased: undefined }] },
  ])('does not present malformed resident data as a successful empty or valid roster: %j', async response => {
    renderWorkspace(createMockApi({ page: vi.fn().mockResolvedValue(response) }))
    expect(await screen.findByText('档案数量暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('共 0 条档案记录')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到居民档案记录')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看档案' })).not.toBeInTheDocument()
  })

  it('distinguishes a valid empty roster from a failed request', async () => {
    renderWorkspace(createMockApi({ page: vi.fn().mockResolvedValue({ ...validPage, content: [], totalElements: 0, totalPages: 0 }) }))
    expect(await screen.findByText('共 0 条档案记录')).toBeInTheDocument()
    expect(screen.getByText('未找到居民档案记录')).toBeInTheDocument()
  })

  it.each([['MERGED', '已合并'], ['INACTIVE', '已停用']] as const)(
    'uses current profile status %s instead of claiming an effective resident', async (status, label) => {
      const profile = { ...sampleProfile1, resident: { ...sampleResident1, status } }
      renderWorkspace(createMockApi({ profile: vi.fn().mockResolvedValue(profile) }))
      fireEvent.click((await screen.findAllByRole('button', { name: '查看档案' }))[0])
      expect(await screen.findByText(label)).toBeInTheDocument()
      expect(screen.queryByText('有效居民')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '门诊挂号' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '维护档案' })).toBeDisabled()
    }
  )

  it.each([
    { ...sampleProfile1, resident: sampleResident2 },
    { ...sampleProfile1, addresses: null },
    { ...sampleProfile1, demographicProfile: null },
  ])('rejects mismatched or incomplete profile data: %j', async response => {
    renderWorkspace(createMockApi({ profile: vi.fn().mockResolvedValue(response) }))
    fireEvent.click((await screen.findAllByRole('button', { name: '查看档案' }))[0])
    expect(await screen.findByRole('button', { name: '重新读取居民档案' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '门诊挂号' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '维护档案' })).toBeDisabled()
    expect(screen.queryByText('有效居民')).not.toBeInTheDocument()
  })

  it('hides stale profile facts and disables actions through a failed refresh', async () => {
    const profile = vi.fn().mockResolvedValue(sampleProfile1)
    const { queryClient } = renderWorkspace(createMockApi({ profile }))
    fireEvent.click((await screen.findAllByRole('button', { name: '查看档案' }))[0])
    expect(await screen.findByText('户籍人口')).toBeInTheDocument()
    let reject!: (reason: Error) => void
    profile.mockImplementationOnce(() => new Promise((_resolve, rejectRead) => { reject = rejectRead }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['resident-profile', sampleResident1.id] }) })
    expect(await screen.findByText('正在加载居民档案…')).toBeInTheDocument()
    expect(screen.queryByText('有效居民')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '维护档案' })).toBeDisabled()
    await act(async () => reject(new Error('档案刷新失败')))
    expect(await screen.findByText('档案刷新失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '门诊挂号' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新读取居民档案' }))
    expect(await screen.findByText('户籍人口')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '维护档案' })).toBeEnabled()
  })

  it('hides cached roster rows and totals while refreshing or failed', async () => {
    const page = vi.fn().mockResolvedValue(validPage)
    const { queryClient } = renderWorkspace(createMockApi({ page }))
    expect(await screen.findByText('共 2 条档案记录')).toBeInTheDocument()
    let reject!: (reason: Error) => void
    page.mockImplementationOnce(() => new Promise((_resolve, rejectRead) => { reject = rejectRead }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['residents-page'] }) })
    expect(await screen.findByText('正在加载居民档案列表…')).toBeInTheDocument()
    expect(screen.queryByText('共 2 条档案记录')).not.toBeInTheDocument()
    expect(screen.queryByText('赵大海')).not.toBeInTheDocument()
    await act(async () => reject(new Error('名单刷新失败')))
    expect(await screen.findByText('档案数量暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('赵大海')).not.toBeInTheDocument()
  })

  it('preserves unsaved edits but blocks saving until the profile is confirmed again', async () => {
    const profile = vi.fn().mockResolvedValue(sampleProfile1)
    const api = createMockApi({ profile })
    Object.assign(api, { dictionaries: { resolve: vi.fn().mockResolvedValue([]), get: vi.fn() } })
    const { queryClient } = renderWorkspace(api)
    fireEvent.click((await screen.findAllByRole('button', { name: '查看档案' }))[0])
    await screen.findByText('户籍人口')
    fireEvent.click(screen.getByRole('button', { name: '维护档案' }))
    fireEvent.change(screen.getByLabelText(/^姓名/), { target: { value: '待保存姓名' } })
    profile.mockRejectedValueOnce(new Error('档案刷新失败'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['resident-profile', sampleResident1.id] }) })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存档案' })).toBeDisabled())
    expect(screen.getByLabelText(/^姓名/)).toHaveValue('待保存姓名')
    expect(api.residents.updateProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '重新确认档案' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存档案' })).toBeEnabled())
    expect(screen.getByLabelText(/^姓名/)).toHaveValue('待保存姓名')
  })

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

    const maleAvatar = screen.getByText('海')
    expect(maleAvatar).toHaveClass('resident-avatar')
    expect(maleAvatar).toHaveClass('male')

    const femaleAvatar = screen.getByText('丽')
    expect(femaleAvatar).toHaveClass('resident-avatar')
    expect(femaleAvatar).toHaveClass('female')
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

  it('parses a valid national ID without fabricating coverage, nationality or ethnicity in the create payload', async () => {
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
    fireEvent.change(idInput, { target: { value: '33010219900815123X' } })

    await waitFor(() => {
      const birthDateInput = screen.getByLabelText(/出生日期/) as HTMLInputElement
      expect(birthDateInput.value).toBe('1990-08-15')
    })

    expect(screen.queryByLabelText('个人编号/卡号')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^姓名/), { target: { value: '测试居民' } })
    fireEvent.click(screen.getByRole('button', { name: '保存居民档案' }))
    await waitFor(() => expect(api.residents.create).toHaveBeenCalled())
    const payload = vi.mocked(api.residents.create).mock.calls[0][0]
    expect(payload.coverages).toEqual([])
    expect(payload.demographicProfile?.nationalityCode).toBeUndefined()
    expect(payload.demographicProfile?.ethnicityCode).toBeUndefined()
  })

  it('does not parse a passport as a national ID just because the number has 18 characters', async () => {
    renderWorkspace(createMockApi())
    fireEvent.click(screen.getByRole('button', { name: /新建居民/ }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: '第1项证件/卡类型' })).toBeEnabled())
    fireEvent.click(screen.getByRole('combobox', { name: '第1项证件/卡类型' }))
    fireEvent.click(await screen.findByRole('option', { name: /护照/ }))
    fireEvent.change(screen.getByLabelText(/^出生日期/), { target: { value: '1988-01-01' } })
    fireEvent.change(screen.getByPlaceholderText('录入护照号码'), { target: { value: '33010219900815123X' } })
    expect(screen.getByLabelText(/^出生日期/)).toHaveValue('1988-01-01')
    expect(within(screen.getByRole('dialog', { name: '新建居民' })).getByRole('combobox', { name: '性别' })).toHaveTextContent('未知')
    expect(screen.queryByLabelText('个人编号/卡号')).not.toBeInTheDocument()
  })

  it('preserves explicitly entered coverage while identity documents change', async () => {
    const api = createMockApi()
    renderWorkspace(api)
    fireEvent.click(screen.getByRole('button', { name: /新建居民/ }))
    fireEvent.click(screen.getByRole('button', { name: '新增保障信息' }))
    expect(screen.getByLabelText(/^支付方名称/)).toHaveValue('')
    expect(screen.getByLabelText('第1项保障生效日期')).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText('第1项保障类型')).toBeEnabled())
    fireEvent.click(screen.getByLabelText('第1项保障类型'))
    fireEvent.click(await screen.findByRole('option', { name: /居民医疗保障/ }))
    fireEvent.change(screen.getByLabelText(/^支付方名称/), { target: { value: '实际支付机构' } })
    fireEvent.change(screen.getByLabelText('个人编号/卡号'), { target: { value: 'MEMBER-007' } })
    fireEvent.change(screen.getByLabelText('第1项保障生效日期'), { target: { value: '2021-01-01' } })
    fireEvent.blur(screen.getByLabelText('第1项保障生效日期'))
    fireEvent.change(screen.getByPlaceholderText(/录入18位身份证/), { target: { value: '33010219900815123X' } })
    fireEvent.click(screen.getByLabelText(/证件\/卡类型/))
    fireEvent.click(await screen.findByRole('option', { name: /社会保障卡/ }))
    fireEvent.change(screen.getByPlaceholderText('录入社保卡号 / 社会保障号码'), { target: { value: 'SOCIAL-12345678' } })
    expect(screen.getByLabelText(/^支付方名称/)).toHaveValue('实际支付机构')
    expect(screen.getByLabelText('个人编号/卡号')).toHaveValue('MEMBER-007')
    expect(screen.getByLabelText('第1项保障类型')).toHaveTextContent('居民医疗保障')
    fireEvent.change(screen.getByLabelText(/^姓名/), { target: { value: '测试居民' } })
    fireEvent.click(screen.getByRole('button', { name: '保存居民档案' }))
    await waitFor(() => expect(api.residents.create).toHaveBeenCalled())
    expect(vi.mocked(api.residents.create).mock.calls[0][0].coverages).toEqual([
      expect.objectContaining({ sdCoverageType: '02', payerName: '实际支付机构', memberNo: 'MEMBER-007', validFrom: '2021-01-01' }),
    ])
  })

  it.each([['PASSPORT', 'E123****5678', '护照'], ['OTHER', 'YB12****5678', '其他证件/卡'],
    ['HEALTH_CARD', 'MRN1****5678', '电子健康卡']])('labels a %s from its registered type instead of the number prefix', async (system, maskedValue, label) => {
    renderWorkspace(createMockApi({ profile: vi.fn().mockResolvedValue({ ...sampleProfile1,
      resident: { ...sampleResident1, identifiers: [{ ...sampleResident1.identifiers[0], system, maskedValue }] },
    }) }))
    fireEvent.click((await screen.findAllByRole('button', { name: '查看档案' }))[0])
    expect(await screen.findByText(`${label}: ${maskedValue}`)).toBeInTheDocument()
  })
})
