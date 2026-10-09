import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { OrganizationProfileInput, OrganizationUnit, PersonnelAssignment, Practitioner, PractitionerOnboardingInput, RhnApi } from '../../shared/rhnApi'
import { OrganizationPersonnelManagement, resolveDepartmentTypeText } from './OrganizationPersonnelManagement'

const mockOrganizationEnums = Object.entries({
  ORG_KIND: [['LEGAL_ORGANIZATION', '法定机构'], ['ORG_UNIT', '科室']],
  ORG_TYPE: [['TOWNSHIP_HEALTH_CENTER', '乡镇卫生院'], ['HOSPITAL', '医院'], ['CLINICAL_DEPARTMENT', '临床科室']],
  PRACT_GENDER: [['MALE', '男'], ['FEMALE', '女'], ['UNKNOWN', '未知']],
  POSITION_TYPE: [['CLINICAL', '临床'], ['NURSING', '护理']],
  EMPLOYMENT_TYPE: [['PERMANENT', '正式'], ['CONTRACT', '合同']],
  ASSIGNMENT_TYPE: [['PRIMARY', '主任职'], ['PART_TIME', '兼职']],
}).map(([code, items]) => ({ code, name: code, description: '',
  items: items.map(([code, name], sortOrder) => ({ code, name, description: '', sortOrder })) }))
const mockOrganizationDictionary = (code: string) => code === 'DEPT_PROPERTY'
  ? [{ code: 'CLINICAL', name: '临床', sortOrder: 0 }]
  : code === 'DEPT_TYPE' ? [{ code: 'CUSTOM_OTHER', name: '其他自定义科室', sortOrder: 0 }] : []

const mockUnits: OrganizationUnit[] = [
  {
    id: 'org-1',
    revision: 1,
    code: 'ORG01',
    name: '青禾镇中心卫生院',
    sdOrgKind: 'LEGAL_ORGANIZATION',
    sdOrgKindText: '法定机构',
    sdOrgType: 'TOWNSHIP_HEALTH_CENTER',
    sdOrgTypeText: '乡镇卫生院',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '正常',
    validFrom: '2026-01-01',
    sortOrder: 1,
    virtual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'dept-1',
    parentId: 'org-1',
    revision: 1,
    code: 'DEPT01',
    name: '中医科',
    sdOrgKind: 'ORG_UNIT',
    sdOrgKindText: '科室/业务单元',
    sdOrgType: 'TOWNSHIP_HEALTH_CENTER',
    sdOrgTypeText: '乡镇卫生院',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '正常',
    validFrom: '2026-01-01',
    sortOrder: 1,
    virtual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'dept-2',
    parentId: 'org-1',
    revision: 1,
    code: 'GENERAL',
    name: '全科诊室',
    sdOrgKind: 'ORG_UNIT',
    sdOrgKindText: '科室/业务单元',
    sdOrgType: 'CLINICAL_DEPARTMENT',
    sdOrgTypeText: '临床科室',
    sdDepartmentType: 'CUSTOM_OTHER',
    sdDepartmentTypeText: '其他自定义科室',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '正常',
    validFrom: '2026-01-01',
    sortOrder: 2,
    virtual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'dept-empty',
    parentId: 'org-1',
    revision: 1,
    code: 'DEPT_EMPTY',
    name: '空置科室',
    sdOrgKind: 'ORG_UNIT',
    sdOrgKindText: '科室/业务单元',
    sdOrgType: 'TOWNSHIP_HEALTH_CENTER',
    sdOrgTypeText: '乡镇卫生院',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '正常',
    validFrom: '2026-01-01',
    sortOrder: 3,
    virtual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'dept-surgery',
    parentId: 'org-1',
    revision: 1,
    code: 'SURGERY',
    name: '外科门诊',
    shortName: '外科',
    sdOrgKind: 'ORG_UNIT',
    sdOrgKindText: '科室/业务单元',
    sdOrgType: 'CLINICAL_DEPARTMENT',
    sdOrgTypeText: '临床科室',
    sdDepartmentType: 'CLIN_GENERAL_SURGERY',
    sdDepartmentTypeText: 'CLIN_GENERAL_SURGERY',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '已启用',
    validFrom: '2026-01-01',
    sortOrder: 4,
    virtual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

const mockPractitioners: Practitioner[] = [
  {
    id: 'prac-1',
    revision: 1,
    code: 'P001',
    fullName: '陈国华',
    sdPractGender: 'MALE',
    sdPractGenderText: '男',
    sdPersonnelStatus: 'ACTIVE',
    sdPersonnelStatusText: '正常',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prac-2',
    revision: 1,
    code: 'P002',
    fullName: '李全科',
    sdPractGender: 'MALE',
    sdPractGenderText: '男',
    sdPersonnelStatus: 'ACTIVE',
    sdPersonnelStatusText: '正常',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

const mockAssignments: PersonnelAssignment[] = [
  {
    id: 'assign-1',
    revision: 1,
    employmentId: 'emp-1',
    practitionerId: 'prac-1',
    practitionerCode: 'P001',
    practitionerName: '陈国华',
    sdPractGender: 'MALE',
    sdPractGenderText: '男',
    organizationId: 'org-1',
    organizationName: '青禾镇中心卫生院',
    departmentId: 'dept-1',
    departmentName: '中医科',
    positionId: 'pos-1',
    positionName: '中医科主任医师',
    sdPositionType: 'CLINICAL',
    sdPositionTypeText: '临床',
    code: 'ASG001',
    sdAssignmentType: 'PRIMARY',
    sdAssignmentTypeText: '主任职',
    primaryAssignment: true,
    workloadPercent: 100,
    sdPersonnelStatus: 'ACTIVE',
    sdPersonnelStatusText: '正常',
    validFrom: '2026-01-01',
  },
  {
    id: 'assign-2',
    revision: 1,
    employmentId: 'emp-2',
    practitionerId: 'prac-2',
    practitionerCode: 'P002',
    practitionerName: '李全科',
    sdPractGender: 'MALE',
    sdPractGenderText: '男',
    organizationId: 'org-1',
    organizationName: '青禾镇中心卫生院',
    departmentId: 'dept-2',
    departmentName: '全科诊室',
    positionId: 'pos-2',
    positionName: '全科主治医师',
    sdPositionType: 'CLINICAL',
    sdPositionTypeText: '临床',
    code: 'ASG002',
    sdAssignmentType: 'PRIMARY',
    sdAssignmentTypeText: '主任职',
    primaryAssignment: true,
    workloadPercent: 100,
    sdPersonnelStatus: 'ACTIVE',
    sdPersonnelStatusText: '正常',
    validFrom: '2026-01-01',
  },
]

function onboardingResult(input: PractitionerOnboardingInput) {
  const practitioner = { ...mockPractitioners[0], id: 'prac-new', code: input.code.toUpperCase(), fullName: input.fullName,
    sdPractGender: input.sdPractGender, sdPersonnelStatus: 'ACTIVE', revision: 0 }
  return { practitioner,
    employments: [{ id: 'emp-new', revision: 0, practitionerId: practitioner.id, organizationId: input.organizationId,
      code: `EMP_${practitioner.id}`, sdEmploymentType: 'PERMANENT', primaryEmployment: true, hireDate: input.hireDate, sdPersonnelStatus: 'ACTIVE' }],
    assignments: [{ id: 'asn-new', revision: 0, practitionerId: practitioner.id, employmentId: 'emp-new', organizationId: input.organizationId,
      departmentId: input.departmentId, positionId: input.positionId, code: `ASN_${practitioner.id}`, sdAssignmentType: 'PRIMARY',
      primaryAssignment: true, workloadPercent: 100, validFrom: input.hireDate, sdPersonnelStatus: 'ACTIVE' }],
  }
}

function renderComponent(people: Practitioner[] = mockPractitioners, assignmentsList: PersonnelAssignment[] = mockAssignments,
  organizationOverrides: Partial<RhnApi['organization']> = {}, dictionaryOverrides: Partial<RhnApi['dictionaries']> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  const api = {
    organization: {
      tree: vi.fn().mockResolvedValue(mockUnits),
      profile: vi.fn().mockImplementation((unit: OrganizationUnit) => Promise.resolve(unit.sdOrgKind === 'ORG_UNIT'
        ? { department: { ...unit, organizationId: 'org-1', sdDepartmentType: unit.sdDepartmentType ?? 'GENERAL', sdDepartmentTypeText: unit.sdDepartmentTypeText ?? '科室' },
          contacts: [], relations: [], capabilities: [], responsibilities: [] }
        : { organization: unit, identifiers: [], contacts: [], addresses: [], relations: [], capabilities: [], responsibilities: [] })),
      practitioners: vi.fn().mockResolvedValue(people),
      practitioner: vi.fn().mockImplementation((id: string) => {
        const practitioner = people.find((p) => p.id === id) || people[0]
        const assignments = assignmentsList.filter((a) => a.practitionerId === practitioner.id)
        return Promise.resolve({
          practitioner,
          employments: assignments.map(a => ({ id: a.employmentId, revision: 1, practitionerId: practitioner.id,
            organizationId: a.organizationId, organizationName: a.organizationName, code: `EMP_${a.id}`,
            sdEmploymentType: 'PERMANENT', sdEmploymentTypeText: '正式', primaryEmployment: a.primaryAssignment,
            hireDate: a.validFrom, sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' })),
          assignments,
        })
      }),
      createPractitioner: vi.fn().mockImplementation((input: { code: string; fullName: string; sdPractGender: string }) => Promise.resolve({
        id: 'prac-new',
        revision: 1,
        code: input.code,
        fullName: input.fullName,
        sdPractGender: input.sdPractGender,
        sdPractGenderText: input.sdPractGender === 'MALE' ? '男' : '女',
        sdPersonnelStatus: 'ACTIVE',
        sdPersonnelStatusText: '正常',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })),
      updatePractitioner: vi.fn().mockImplementation((id: string, input: { expectedRevision: number; fullName: string; sdPractGender: string }) => Promise.resolve({
        id,
        revision: 2,
        code: 'P001',
        fullName: input.fullName,
        sdPractGender: input.sdPractGender,
        sdPractGenderText: input.sdPractGender === 'MALE' ? '男' : '女',
        sdPersonnelStatus: 'ACTIVE',
        sdPersonnelStatusText: '正常',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })),
      onboardPractitioner: vi.fn().mockImplementation(async (input: PractitionerOnboardingInput) => onboardingResult(input)),
      createEmployment: vi.fn().mockResolvedValue({ id: 'emp-new' }),
      createAssignment: vi.fn().mockResolvedValue({ id: 'assign-new' }),
      positions: vi.fn().mockResolvedValue([
        { id: 'pos-1', code: 'POS01', name: '中医科主任医师', revision: 1, sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' },
        { id: 'pos-2', code: 'POS02', name: '全科主治医师', revision: 1, sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' },
      ]),
      assignments: vi.fn().mockResolvedValue(assignmentsList),
      createUnit: vi.fn().mockResolvedValue(mockUnits[2]),
      updateUnit: vi.fn().mockResolvedValue(mockUnits[2]),
      ...organizationOverrides,
    },
    dictionaries: {
      systemEnums: vi.fn().mockResolvedValue(mockOrganizationEnums),
      resolve: vi.fn().mockImplementation(async code => mockOrganizationDictionary(code)),
      ...dictionaryOverrides,
    },
  } as unknown as RhnApi

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrganizationPersonnelManagement api={api} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...utils, api, queryClient }
}

describe('organization unit writes confirm actual saved facts', () => {
  const edited = (before: OrganizationUnit, input: Record<string, unknown>) => ({ ...before, ...input, revision: before.revision + 1,
    parentId: before.sdOrgKind === 'ORG_UNIT' && !input.parentId ? 'org-1' : input.parentId })
  async function editRoot() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog', { name: '编辑组织节点' })
    await user.clear(within(dialog).getByLabelText(/组织名称/))
    await user.type(within(dialog).getByLabelText(/组织名称/), '更新机构')
    return { user, dialog }
  }
  it.each(['partial', 'old', 'wrong', 'failed'])('retains the edit draft on %s receipt and permits verified retry', async kind => {
    const updateUnit = vi.fn().mockImplementationOnce(async () => {
      if (kind === 'failed') throw new Error('response lost')
      return kind === 'partial' ? { id: 'org-1' } : kind === 'old' ? mockUnits[0] : { ...mockUnits[0], revision: 2, name: 'other' }
    }).mockImplementation(async (_id, input) => edited(mockUnits[0], input))
    renderComponent(mockPractitioners, mockAssignments, { updateUnit })
    const { user, dialog } = await editRoot()
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await within(dialog).findByText(/组织保存结果未确认/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/组织名称/)).toHaveValue('更新机构')
    expect(screen.queryByText('已更新“更新机构”')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '重新核实保存结果' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存组织' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await screen.findByText('已更新“更新机构”')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('saves a top-level department without sending its owning organization as a department parent', async () => {
    const updateUnit = vi.fn().mockImplementation(async (_id, input) => edited(mockUnits[2], input))
    const tree = vi.fn().mockResolvedValue(mockUnits.map(item => item.id === 'dept-2' ? { ...item, sdDepartmentProperty: 'CLINICAL' } : item))
    renderComponent(mockPractitioners, mockAssignments, { updateUnit, tree })
    const user = userEvent.setup()
    await user.click(await within(await screen.findByRole('tree', { name: '组织节点' })).findByText('全科诊室'))
    await user.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog', { name: '编辑组织节点' })
    expect(within(dialog).queryByLabelText('IANA 时区')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: /组织结构类型/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await screen.findByText('已更新“全科诊室”')).toBeInTheDocument()
    expect(updateUnit).toHaveBeenCalledWith('dept-2', expect.objectContaining({ parentId: undefined, timezoneCode: undefined, expectedRevision: 1 }))
    expect(updateUnit.mock.calls[0][1]).not.toHaveProperty('unit')
  })
  it.each(['normal', 'api', 'selection'])('locks pending edit and ignores stale completion after %s changes', async scenario => {
    let finish!: () => void
    const updateUnit = vi.fn().mockImplementation((_id, input) => new Promise(resolve => { finish = () => resolve(edited(mockUnits[0], input)) }))
    const { api, queryClient, rerender } = renderComponent(mockPractitioners, mockAssignments, { updateUnit })
    const { user, dialog } = await editRoot()
    const saveButton = within(dialog).getByRole('button', { name: '保存组织' })
    await user.click(saveButton)
    await waitFor(() => expect(updateUnit).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(dialog).toBeInTheDocument()
    await user.click(saveButton)
    expect(updateUnit).toHaveBeenCalledTimes(1)
    if (scenario === 'api') rerender(<QueryClientProvider client={queryClient}><MemoryRouter><OrganizationPersonnelManagement api={{ ...api }} /></MemoryRouter></QueryClientProvider>)
    if (scenario === 'selection') await user.click(within(screen.getByRole('tree', { name: '组织节点' })).getByText('全科诊室'))
    await act(async () => finish())
    if (scenario === 'normal') expect(await screen.findByText('已更新“更新机构”')).toBeInTheDocument()
    else expect(screen.queryByText('已更新“更新机构”')).not.toBeInTheDocument()
  })
  it('keeps the original status target after a lost response and refreshed state', async () => {
    const saved = { ...mockUnits[0], revision: 2, sdOrgStatus: 'INACTIVE', sdOrgStatusText: '停用' }
    const tree = vi.fn().mockResolvedValue(mockUnits)
    const changeUnitStatus = vi.fn().mockImplementationOnce(async () => {
      tree.mockResolvedValue([saved, ...mockUnits.slice(1)])
      throw new Error('response lost')
    }).mockResolvedValue(saved)
    renderComponent(mockPractitioners, mockAssignments, { tree, changeUnitStatus })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '停用' }))
    const dialog = screen.getByRole('dialog', { name: /确认停用/ })
    await user.click(within(dialog).getByRole('button', { name: '确认停用' }))
    expect(await within(dialog).findByText(/组织保存结果未确认/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '重新核实保存结果' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '确认停用' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(changeUnitStatus).toHaveBeenCalledTimes(2))
    expect(changeUnitStatus.mock.calls).toEqual([['org-1', 1, 'INACTIVE'], ['org-1', 1, 'INACTIVE']])
  })
  it('does not resubmit a new organization after rechecking a lost response finds its code', async () => {
    const tree = vi.fn().mockResolvedValue(mockUnits)
    const createUnit = vi.fn().mockImplementation(async input => {
      tree.mockResolvedValue([...mockUnits, { ...mockUnits[0], ...input, code: input.code.toUpperCase(), id: 'new' }])
      throw new Error('response lost')
    })
    renderComponent(mockPractitioners, mockAssignments, { createUnit, tree })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '新建组织' }))
    const dialog = screen.getByRole('dialog', { name: '新建组织节点' })
    await user.type(within(dialog).getByRole('textbox', { name: /组织代码/ }), 'NEW')
    await user.type(within(dialog).getByLabelText(/组织名称/), '新机构')
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await within(dialog).findByText(/组织保存结果未确认/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '重新核实保存结果' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存组织' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await within(dialog).findByText(/未重复提交/)).toBeInTheDocument()
    expect(createUnit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('已创建“新机构”')).not.toBeInTheDocument()
  })
  it.each(['success', 'partial', 'existing'])('validates new organization creation: %s', async scenario => {
    const createUnit = vi.fn().mockImplementation(async input => scenario === 'partial' ? { id: 'new' }
      : scenario === 'existing' ? { ...mockUnits[0], ...input, code: input.code.toUpperCase() }
        : { ...mockUnits[0], ...input, code: input.code.toUpperCase(), id: 'new' })
    renderComponent(mockPractitioners, mockAssignments, { createUnit })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '新建组织' }))
    const dialog = screen.getByRole('dialog', { name: '新建组织节点' })
    await user.type(within(dialog).getByRole('textbox', { name: /组织代码/ }), 'NEW')
    await user.type(within(dialog).getByLabelText(/组织名称/), '新机构')
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    if (scenario === 'success') expect(await screen.findByText('已创建“新机构”')).toBeInTheDocument()
    else {
      expect(await within(dialog).findByText(/组织保存结果未确认/)).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/组织名称/)).toHaveValue('新机构')
      expect(screen.queryByText('已创建“新机构”')).not.toBeInTheDocument()
    }
  })
})

describe('personnel forms require confirmed type choices', () => {
  const cases = [
    { code: 'PRACT_GENDER', open: '编辑人员', save: '保存人员档案', method: 'updatePractitioner', field: '姓名', retry: '重新核实人员目录' },
    { code: 'POSITION_TYPE', open: '维护岗位', save: '保存岗位', method: 'createPosition', field: '岗位名称', retry: '重新加载岗位与类型目录' },
    { code: 'EMPLOYMENT_TYPE', open: '新增聘用', save: '保存聘用', method: 'createEmployment', field: '聘用代码', retry: '重新加载聘用类型与依赖目录' },
    { code: 'ASSIGNMENT_TYPE', open: '新增任职', save: '保存任职', method: 'createAssignment', field: '任职代码', retry: '重新加载任职类型与依赖目录' },
  ]
  it.each(cases)('blocks cached $code choices during refetch and failure, then preserves the draft on recovery', async item => {
    const systemEnums = vi.fn().mockResolvedValue(mockOrganizationEnums), write = vi.fn()
    const { queryClient } = renderComponent(mockPractitioners, mockAssignments, { [item.method]: write }, { systemEnums })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: item.open }))
    const dialog = within(screen.getByRole('dialog'))
    const field = dialog.getByLabelText(new RegExp(item.field), { selector: 'input' })
    await userEvent.clear(field)
    await userEvent.type(field, 'RETAINED')
    let fail!: (error: Error) => void
    systemEnums.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    await act(async () => { void queryClient.invalidateQueries({ queryKey: ['dictionary-system-enums'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: item.save })).toBeDisabled())
    await act(async () => fail(new Error('offline')))
    expect(dialog.getByRole('button', { name: item.save })).toBeDisabled()
    expect(write).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: item.retry }))
    await waitFor(() => expect(dialog.getByRole('button', { name: item.save })).toBeEnabled())
    expect(field).toHaveValue('RETAINED')
  })
  it.each(['empty', 'missing', 'malformed', 'failed'])('does not fabricate gender options when enums are %s', async scenario => {
    const systemEnums = scenario === 'failed' ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(scenario === 'empty' ? [] : scenario === 'missing'
        ? mockOrganizationEnums.filter(value => value.code !== 'PRACT_GENDER') : [{ code: 'PRACT_GENDER' }])
    renderComponent(mockPractitioners, mockAssignments, {}, { systemEnums })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '编辑人员' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: '保存人员档案' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('combobox', { name: '性别' }))
    expect(screen.queryByRole('option', { name: /女/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /未知/ })).not.toBeInTheDocument()
    expect(dialog.getByText(/人员类型选项/)).toBeInTheDocument()
  })
  it('rejects a preset type absent from a nonempty server catalog before posting', async () => {
    const systemEnums = vi.fn().mockResolvedValue(mockOrganizationEnums.map(value => value.code === 'POSITION_TYPE'
      ? { ...value, items: value.items.filter(item => item.code === 'NURSING') } : value))
    const createPosition = vi.fn()
    renderComponent(mockPractitioners, mockAssignments, { createPosition }, { systemEnums })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '维护岗位' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText(/岗位代码/, { selector: 'input' }), 'NEW')
    await userEvent.type(dialog.getByLabelText(/岗位名称/, { selector: 'input' }), '新岗位')
    await userEvent.click(dialog.getByRole('button', { name: '保存岗位' }))
    expect(await dialog.findByText(/所选代码已失效/)).toBeInTheDocument()
    expect(createPosition).not.toHaveBeenCalled()
  })
  it('does not block position creation for an unrelated missing gender definition', async () => {
    renderComponent(mockPractitioners, mockAssignments, {}, {
      systemEnums: vi.fn().mockResolvedValue(mockOrganizationEnums.filter(value => value.code !== 'PRACT_GENDER')),
    })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '维护岗位' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '保存岗位' })).toBeEnabled()
  })
  it('retains the organization draft while its property dictionary is unconfirmed', async () => {
    const resolve = vi.fn().mockImplementation(async code => mockOrganizationDictionary(code))
    const updateUnit = vi.fn()
    const { queryClient } = renderComponent(mockPractitioners, mockAssignments, { updateUnit }, { resolve })
    await userEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText(/组织名称/), '草稿')
    resolve.mockImplementationOnce(async () => { throw new Error('offline') })
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['dictionary-resolve', 'ORG_PROPERTY'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存组织' })).toBeDisabled())
    expect(updateUnit).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: '重新加载组织类型与字典选项' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存组织' })).toBeEnabled())
    expect(dialog.getByLabelText(/组织名称/)).toHaveValue('青禾镇中心卫生院草稿')
  })
})

describe('profile form dictionary and draft truth', () => {
  const catalog = (code: string) => [{ code: code === 'ORG_CONTACT_USE' ? 'WORK' : 'CUSTOM', name: `${code}选项`, sortOrder: 0 }]
  async function choose(label: string, option: string) {
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: label }))
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(option) }))
  }
  it('keeps all six category drafts separate and never reuses identifier defaults as a person or contact', async () => {
    renderComponent(mockPractitioners, mockAssignments, {}, { resolve: vi.fn().mockImplementation(async code => catalog(code)) })
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('联系方式'), 'actual@example.test')
    await choose('联系方式类型', 'ORG_CONTACT_TYPE选项')
    await choose('使用场景', 'ORG_CONTACT_USE选项')
    await choose('资料类别', '机构标识')
    expect(dialog.getByLabelText('标识体系 URI')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('标识体系 URI'), 'urn:actual')
    await userEvent.type(dialog.getByLabelText('标识编码'), 'license-1')
    expect(dialog.getByRole('combobox', { name: '核验状态' })).not.toHaveTextContent('UNVERIFIED')
    await choose('资料类别', '地址')
    expect(dialog.getByLabelText('国家代码')).toHaveValue('CN')
    expect(dialog.getByLabelText('详细地址')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('详细地址'), '真实地址')
    await choose('资料类别', '机构关系')
    await userEvent.type(dialog.getByLabelText('关系说明'), '转诊关系说明')
    await choose('资料类别', '服务能力')
    expect(dialog.getByLabelText('资质依据编码')).toHaveValue('')
    expect(dialog.getByLabelText('能力范围说明')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('能力范围说明'), '登记能力')
    await choose('资料类别', '负责人')
    expect(dialog.getByLabelText('外部负责人姓名')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('外部负责人姓名'), '真实姓名')
    await choose('资料类别', '联系方式')
    expect(dialog.getByLabelText('联系方式')).toHaveValue('actual@example.test')
    expect(dialog.getByRole('combobox', { name: '联系方式类型' })).toHaveTextContent('ORG_CONTACT_TYPE选项')
    await choose('资料类别', '机构标识')
    expect(dialog.getByLabelText('标识体系 URI')).toHaveValue('urn:actual')
    expect(dialog.getByLabelText('标识编码')).toHaveValue('license-1')
    await choose('资料类别', '地址')
    expect(dialog.getByLabelText('详细地址')).toHaveValue('真实地址')
    await choose('资料类别', '机构关系')
    expect(dialog.getByLabelText('关系说明')).toHaveValue('转诊关系说明')
    await choose('资料类别', '服务能力')
    expect(dialog.getByLabelText('能力范围说明')).toHaveValue('登记能力')
    await choose('资料类别', '负责人')
    expect(dialog.getByLabelText('外部负责人姓名')).toHaveValue('真实姓名')
  })
  it.each(['failed', 'malformed', 'empty'])('blocks saves with %s dictionary and retains the draft during retry', async mode => {
    let recovered = false
    const resolve = vi.fn().mockImplementation(async code => {
      if (code !== 'ORG_CONTACT_TYPE' || recovered) return catalog(code)
      if (mode === 'failed') throw new Error('offline')
      return mode === 'malformed' ? [{ code: 'CUSTOM' }] : []
    })
    const addProfileItem = vi.fn()
    renderComponent(mockPractitioners, mockAssignments, { addProfileItem }, { resolve })
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText(mode === 'empty' ? /没有可用字典选项/ : /字典尚未确认/)).toBeInTheDocument()
    await userEvent.type(dialog.getByLabelText('联系方式'), 'draft@example.test')
    expect(dialog.getByRole('button', { name: '保存档案' })).toBeDisabled()
    expect(addProfileItem).not.toHaveBeenCalled()
    recovered = true
    await userEvent.click(dialog.getByRole('button', { name: '重新加载档案字典' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeEnabled())
    expect(dialog.getByLabelText('联系方式')).toHaveValue('draft@example.test')
  })
  it('blocks stale choices while a refetch fails and rejects a selection removed by a later catalog', async () => {
    const resolve = vi.fn().mockImplementation(async code => catalog(code))
    const addProfileItem = vi.fn()
    const { queryClient } = renderComponent(mockPractitioners, mockAssignments, { addProfileItem }, { resolve })
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('联系方式'), 'draft@example.test')
    await choose('联系方式类型', 'ORG_CONTACT_TYPE选项')
    await choose('使用场景', 'ORG_CONTACT_USE选项')
    let fail!: (error: Error) => void
    resolve.mockImplementation(code => code === 'ORG_CONTACT_TYPE' ? new Promise((_resolve, reject) => { fail = reject }) : Promise.resolve(catalog(code)))
    await act(async () => { void queryClient.invalidateQueries({ queryKey: ['dictionary-resolve', 'ORG_CONTACT_TYPE'] }) })
    expect(await dialog.findByText(/字典尚未确认/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '保存档案' })).toBeDisabled()
    await act(async () => fail(new Error('offline')))
    expect(dialog.getByRole('button', { name: '保存档案' })).toBeDisabled()
    resolve.mockImplementation(async code => code === 'ORG_CONTACT_TYPE' ? [{ code: 'CHANGED', name: '新选项', sortOrder: 0 }] : catalog(code))
    await userEvent.click(dialog.getByRole('button', { name: '重新加载档案字典' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeEnabled())
    await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
    expect(await dialog.findByText(/字典选项尚未确认或已失效/)).toBeInTheDocument()
    expect(addProfileItem).not.toHaveBeenCalled()
    expect(dialog.getByLabelText('联系方式')).toHaveValue('draft@example.test')
  })
  it('does not let an unrelated unavailable dictionary block contact maintenance', async () => {
    renderComponent(mockPractitioners, mockAssignments, {}, { resolve: vi.fn().mockImplementation(async code => {
      if (code === 'ORG_ADDRESS_TYPE') throw new Error('address offline')
      return catalog(code)
    }) })
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '保存档案' })).toBeEnabled()
  })
  it('labels unread personnel credentials and contacts as unavailable rather than known missing', async () => {
    renderComponent()
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    const region = await screen.findByLabelText('法定执业与监管认证档案')
    expect(within(region).queryByText('未维护')).not.toBeInTheDocument()
    expect(within(region).getAllByText('尚未接入').length).toBeGreaterThan(0)
    expect(within(region).getByText(/不能据此判断是否已登记/)).toBeInTheDocument()
  })
  it('opens the personnel directory and details for historical staff with unfilled gender', async () => {
    const people = mockPractitioners.map(person => ({ ...person, sdPractGender: null, sdPractGenderText: null }))
    const assignments = mockAssignments.map(assignment => ({ ...assignment, sdPractGender: null, sdPractGenderText: null }))
    renderComponent(people, assignments)
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await within(screen.getByRole('listbox', { name: '人员列表' })).findByText('陈国华')).toBeInTheDocument()
    expect(await screen.findByText('未填写')).toBeInTheDocument()
    expect(screen.queryByText(/人员目录返回不完整|任职目录返回不完整|人员档案返回不完整/)).not.toBeInTheDocument()
  })
})

describe('governance profile writes require an actual new record', () => {
  const empty = (unit: OrganizationUnit) => ({ organization: unit, identifiers: [], contacts: [], addresses: [], relations: [], capabilities: [], responsibilities: [] })
  const dictionaries = { resolve: vi.fn().mockImplementation(async (code: string) => code === 'ORG_CONTACT_TYPE'
    ? [{ code: 'EMAIL', name: '电子邮箱', sortOrder: 1 }] : code === 'ORG_CONTACT_USE' ? [{ code: 'WORK', name: '办公', sortOrder: 1 }] : []) }
  const receipt = (unit: OrganizationUnit, input: OrganizationProfileInput) => {
    if (input.section !== 'contact') throw new Error('This fixture only writes a contact')
    const { section: _section, ...body } = input
    return { ...empty(unit), contacts: [{ ...body, id: 'new-contact', contactValue: input.contactValue.trim(),
      sdContactTypeText: '电子邮箱', sdContactUseText: '办公', sdDetailStatus: 'ACTIVE', sdDetailStatusText: '启用' }] }
  }
  async function fillContact() {
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    const element = screen.getByRole('dialog'), dialog = within(element)
    await userEvent.click(dialog.getByRole('combobox', { name: '联系方式类型' }))
    await userEvent.click(await screen.findByRole('option', { name: /电子邮箱/ }))
    await userEvent.click(dialog.getByRole('combobox', { name: '使用场景' }))
    await userEvent.click(await screen.findByRole('option', { name: /办公/ }))
    await userEvent.type(dialog.getByLabelText('联系方式'), 'new@example.test')
    return { element, dialog }
  }

  it.each(['partial', 'unchanged', 'wrong-value', 'wrong-subject', 'failed', 'success'])('only closes after a matching contact is present: %s', async mode => {
    const profile = vi.fn().mockImplementation(async (unit: OrganizationUnit) => empty(unit))
    const addProfileItem = vi.fn().mockImplementation(async (unit: OrganizationUnit, input: OrganizationProfileInput) => {
      if (mode === 'failed') throw new Error('保存未完成')
      if (mode === 'partial') return { contacts: [] }
      if (mode === 'unchanged') return empty(unit)
      const result = receipt(unit, input)
      if (mode === 'wrong-value') return { ...result, contacts: [{ ...result.contacts[0], contactValue: 'other@example.test' }] }
      if (mode === 'wrong-subject') return { ...result, organization: { ...unit, id: 'other' } }
      profile.mockResolvedValue(result as never)
      return result
    })
    renderComponent(mockPractitioners, mockAssignments, { profile, addProfileItem }, dictionaries)
    const { element, dialog } = await fillContact()
    await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
    await waitFor(() => expect(addProfileItem).toHaveBeenCalledTimes(1))
    if (mode === 'success') {
      expect(await screen.findByText('机构或科室扩展信息已保存')).toBeInTheDocument()
      expect(element).not.toBeInTheDocument()
      expect(await screen.findByText('new@example.test')).toBeInTheDocument()
    } else {
      expect(await dialog.findByText(/治理档案保存结果未确认/)).toBeInTheDocument()
      expect(dialog.getByLabelText('联系方式')).toHaveValue('new@example.test')
      expect(screen.queryByText('机构或科室扩展信息已保存')).not.toBeInTheDocument()
      await userEvent.click(dialog.getByRole('button', { name: '重新核实保存结果' }))
      await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeEnabled())
      expect(dialog.getByLabelText('联系方式')).toHaveValue('new@example.test')
      addProfileItem.mockImplementation(async (unit: OrganizationUnit, input: OrganizationProfileInput) => receipt(unit, input))
      await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
      expect(await screen.findByText('机构或科室扩展信息已保存')).toBeInTheDocument()
      expect(addProfileItem.mock.calls[1]).toEqual(addProfileItem.mock.calls[0])
    }
  })

  it.each(['api', 'unit'] as const)('locks the submitted form and ignores late results after changing %s', async mode => {
    let complete!: () => void
    const profile = vi.fn().mockImplementation(async (unit: OrganizationUnit) => empty(unit))
    const addProfileItem = vi.fn().mockImplementation((unit: OrganizationUnit, input: OrganizationProfileInput) => new Promise(resolve => {
      complete = () => resolve(receipt(unit, input))
    }))
    const { api, queryClient, rerender } = renderComponent(mockPractitioners, mockAssignments, { profile, addProfileItem }, dictionaries)
    const { element, dialog } = await fillContact()
    const save = dialog.getByRole('button', { name: '保存档案' })
    await userEvent.click(save)
    await waitFor(() => expect(addProfileItem).toHaveBeenCalledTimes(1))
    expect(save).toBeDisabled()
    expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(element.querySelector('form')).toHaveAttribute('inert')
    await userEvent.keyboard('{Escape}'); expect(element).toBeInTheDocument()
    await userEvent.click(save); expect(addProfileItem).toHaveBeenCalledTimes(1)
    if (mode === 'api') {
      rerender(<QueryClientProvider client={queryClient}><MemoryRouter><OrganizationPersonnelManagement api={{ ...api }} /></MemoryRouter></QueryClientProvider>)
    } else {
      vi.mocked(api.organization.tree).mockResolvedValue([{ ...mockUnits[0], id: 'other-org', code: 'OTHER', name: '另一机构' }])
      await act(async () => { await queryClient.invalidateQueries({ queryKey: ['organization-units'] }) })
      expect(await screen.findByRole('heading', { name: '另一机构' })).toBeInTheDocument()
    }
    await act(async () => { complete() })
    expect(screen.queryByText('机构或科室扩展信息已保存')).not.toBeInTheDocument()
    if (mode === 'api') expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(addProfileItem.mock.calls[0][0].id).toBe('org-1')
  })

  it.each(['维护地址', '维护服务能力'])('does not offer an unsaved primary flag for %s', async label => {
    renderComponent()
    await userEvent.click(await screen.findByRole('button', { name: label }))
    expect(within(screen.getByRole('dialog')).queryByRole('checkbox', { name: '设为主要记录' })).not.toBeInTheDocument()
  })

  it('does not resend a command when rechecking finds that the first unconfirmed attempt was already persisted', async () => {
    const profile = vi.fn().mockImplementation(async (unit: OrganizationUnit) => empty(unit))
    const addProfileItem = vi.fn().mockImplementation(async (unit: OrganizationUnit, input: OrganizationProfileInput) => {
      profile.mockResolvedValue(receipt(unit, input) as never)
      throw new Error('响应中断，保存结果未知')
    })
    renderComponent(mockPractitioners, mockAssignments, { profile, addProfileItem }, dictionaries)
    const { dialog } = await fillContact()
    await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
    expect(await dialog.findByText(/治理档案保存结果未确认/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '重新核实保存结果' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeEnabled())
    await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
    expect(await dialog.findByText(/未重复提交/)).toBeInTheDocument()
    expect(addProfileItem).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('机构或科室扩展信息已保存')).not.toBeInTheDocument()
  })
})

describe('organization governance profiles retain their actual meaning', () => {
  const emptyProfile = { organization: mockUnits[0], identifiers: [], contacts: [], addresses: [], relations: [], capabilities: [], responsibilities: [] }
  const base = { id: 'record', sdDetailStatus: 'INACTIVE', sdDetailStatusText: '停用', validFrom: '2026-01-01', validTo: '2026-02-01' }
  const contact = { ...base, id: 'email', sdContactType: 'EMAIL', sdContactTypeText: '电子邮箱', contactValue: 'office@example.test',
    sdContactUse: 'WORK', sdContactUseText: '办公', primaryContact: false, sortOrder: 0 }

  it('shows every contact, address and responsibility with its recorded type, status and dates', async () => {
    const profile = vi.fn().mockResolvedValue({ ...emptyProfile,
      contacts: [contact, { ...contact, id: 'phone', sdContactType: 'PHONE', sdContactTypeText: '电话', contactValue: '010-12345678', primaryContact: true }],
      addresses: [{ ...base, sdAddressType: 'MAILING', sdAddressTypeText: '通信地址', countryCode: 'CN', streetAddress: '通信街1号' },
        { ...base, id: 'practice', sdAddressType: 'PRACTICE', sdAddressTypeText: '执业地址', countryCode: 'CN', streetAddress: '诊疗街2号' }],
      responsibilities: [{ ...base, sdResponsibilityType: 'SAFETY', sdResponsibilityTypeText: '安全负责人', responsibleName: '安全专员', primaryResponsibility: false },
        { ...base, id: 'leader', sdResponsibilityType: 'BUSINESS', sdResponsibilityTypeText: '业务负责人', responsibleName: '业务主管', primaryResponsibility: true }],
    })
    renderComponent(mockPractitioners, mockAssignments, { profile })
    const contacts = within(await screen.findByRole('article', { name: '登记联系方式' }))
    expect(contacts.getByText('office@example.test').closest('.master-prop-item')).toHaveTextContent('电子邮箱 · 办公')
    expect(contacts.getByText('010-12345678').closest('.master-prop-item')).toHaveTextContent('电话 · 办公 · 主要')
    expect(contacts.getByText('office@example.test').closest('.master-prop-item')).toHaveTextContent('停用 · 有效期：2026-01-01 至 2026-02-01')
    const addresses = within(screen.getByRole('article', { name: '登记地址' }))
    expect(addresses.getByText('通信街1号').closest('.master-prop-item')).toHaveTextContent('通信地址')
    expect(addresses.getByText('诊疗街2号').closest('.master-prop-item')).toHaveTextContent('执业地址')
    const responsibilities = within(screen.getByRole('article', { name: '登记负责人' }))
    expect(responsibilities.getByText('安全专员')).toBeInTheDocument()
    expect(responsibilities.getByText('业务主管')).toBeInTheDocument()
    expect(screen.queryByText('联系电话 / 分机')).not.toBeInTheDocument()
    expect(screen.queryByText('机构执业地址')).not.toBeInTheDocument()
  })

  it.each(['identifiers', 'addresses', 'contacts', 'responsibilities', 'capabilities', 'relations'])('does not replace a missing %s array with an empty list', async field => {
    renderComponent(mockPractitioners, mockAssignments, { profile: vi.fn().mockResolvedValue({ ...emptyProfile, [field]: undefined }) })
    expect(await screen.findByText('组织治理档案加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '登记联系方式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '维护联络' })).not.toBeInTheDocument()
    expect(screen.queryByText('尚未登记机构标识')).not.toBeInTheDocument()
  })

  it('rejects an organization response returned for a selected department', async () => {
    renderComponent(mockPractitioners, mockAssignments, { profile: vi.fn().mockResolvedValue(emptyProfile) })
    await userEvent.click(await within(screen.getByRole('tree', { name: '组织节点' })).findByText('中医科'))
    expect(await screen.findByText('组织治理档案加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('尚未登记联系方式')).not.toBeInTheDocument()
  })

  it('hides cached records when refreshing fails, keeps the failure inline and recovers on retry', async () => {
    const profile = vi.fn().mockResolvedValue({ ...emptyProfile, contacts: [contact] })
    const { queryClient } = renderComponent(mockPractitioners, mockAssignments, { profile })
    expect(await screen.findByText('office@example.test')).toBeInTheDocument()
    let reject!: (error: Error) => void
    profile.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['organization-profile'] }) })
    expect(await screen.findByText('正在加载组织治理档案…')).toBeInTheDocument()
    expect(screen.queryByText('office@example.test')).not.toBeInTheDocument()
    await act(async () => { reject(new Error('治理档案读取失败')) })
    const error = await screen.findByText('组织治理档案加载失败，尚未核验')
    expect(error.closest('[role="alert"]')).not.toHaveClass('ui-alert')
    expect(screen.queryByText('尚未登记联系方式')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试组织档案' }))
    expect(await screen.findByText('office@example.test')).toBeInTheDocument()
  })

  it('preserves an open profile draft but disables saving while the profile is unconfirmed', async () => {
    const profile = vi.fn().mockResolvedValue(emptyProfile), addProfileItem = vi.fn()
    const { queryClient } = renderComponent(mockPractitioners, mockAssignments, { profile, addProfileItem }, {
      resolve: vi.fn().mockImplementation(async code => ['ORG_CONTACT_TYPE', 'ORG_CONTACT_USE'].includes(code)
        ? [{ code: 'CUSTOM', name: '测试选项', sortOrder: 0 }] : []),
    })
    await userEvent.click(await screen.findByRole('button', { name: '维护联络' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('联系方式'), 'retained@example.test')
    profile.mockRejectedValueOnce(new Error('档案读取失败'))
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['organization-profile'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeDisabled())
    expect(dialog.getByLabelText('联系方式')).toHaveValue('retained@example.test')
    expect(dialog.getByRole('alert')).toHaveTextContent('组织治理档案尚未确认')
    await userEvent.click(dialog.getByRole('button', { name: '保存档案' }))
    expect(addProfileItem).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: '重新加载组织治理档案' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存档案' })).toBeEnabled())
    expect(dialog.getByLabelText('联系方式')).toHaveValue('retained@example.test')
  })
})

describe('personnel writes only succeed with confirmed receipts', () => {
  const cases = [
    { kind: 'position', method: 'createPosition', open: '维护岗位', save: '保存岗位', success: '已创建岗位“新增岗位”' },
    { kind: 'employment', method: 'createEmployment', open: '新增聘用', save: '保存聘用', success: '已建立聘用关系' },
    { kind: 'assignment', method: 'createAssignment', open: '新增任职', save: '保存任职', success: '已建立人员任职' },
  ] as const
  function receipt(kind: string, input: Record<string, unknown>) {
    if (kind === 'position') return { ...input, id: 'new-position', revision: 0, sdPositionTypeText: '临床', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
    if (kind === 'employment') return { ...input, id: 'new-employment', revision: 0, organizationName: '青禾镇中心卫生院',
      sdEmploymentTypeText: '正式', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
    return { ...mockAssignments[0], ...input, id: 'new-assignment', revision: 0 }
  }
  it.each(cases.flatMap(item => [false, true].map(complete => ({ ...item, complete }))))('verifies $kind before closing its form; complete=$complete', async item => {
    const user = userEvent.setup()
    const write = vi.fn().mockImplementation(async input => item.complete ? receipt(item.kind, input) : { id: 'partial-result' })
    renderComponent(mockPractitioners, mockAssignments, { [item.method]: write })
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(await screen.findByRole('button', { name: item.open }))
    const dialogElement = screen.getByRole('dialog'), dialog = within(dialogElement)
    if (item.kind === 'position') {
      await user.type(dialog.getByLabelText(/岗位代码/, { selector: 'input' }), 'POS_NEW')
      await user.type(dialog.getByLabelText(/岗位名称/, { selector: 'input' }), '新增岗位')
    }
    if (item.kind === 'assignment') await user.type(dialog.getByLabelText(/任职代码/, { selector: 'input' }), 'ASG_NEW')
    await user.click(dialog.getByRole('button', { name: item.save }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    if (item.complete) {
      expect(await screen.findByText(item.success)).toBeInTheDocument()
      expect(dialogElement).not.toBeInTheDocument()
    } else {
      expect(await dialog.findByText(/保存结果未确认/)).toBeInTheDocument()
      expect(screen.queryByText(item.success)).not.toBeInTheDocument()
      expect(dialog.getByRole('button', { name: '重新核实保存结果' })).toBeInTheDocument()
      const field = item.kind === 'position' ? '岗位名称' : item.kind === 'assignment' ? '任职代码' : '聘用代码'
      const value = (dialog.getByLabelText(new RegExp(field), { selector: 'input' }) as HTMLInputElement).value
      await user.click(dialog.getByRole('button', { name: '重新核实保存结果' }))
      await waitFor(() => expect(dialog.getByRole('button', { name: item.save })).toBeEnabled())
      expect(dialog.getByLabelText(new RegExp(field), { selector: 'input' })).toHaveValue(value)
      write.mockImplementation(async input => receipt(item.kind, input))
      await user.click(dialog.getByRole('button', { name: item.save }))
      expect(await screen.findByText(item.success)).toBeInTheDocument()
    }
  })

  it('keeps an edited practitioner draft when the returned revision has not advanced', async () => {
    const updatePractitioner = vi.fn().mockResolvedValue({ ...mockPractitioners[0], fullName: '新姓名' })
    renderComponent(mockPractitioners, mockAssignments, { updatePractitioner })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '编辑人员' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.clear(dialog.getByLabelText(/姓名/)); await userEvent.type(dialog.getByLabelText(/姓名/), '新姓名')
    await userEvent.click(dialog.getByRole('button', { name: '保存人员档案' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('人员保存未确认')
    expect(dialog.getByLabelText(/姓名/)).toHaveValue('新姓名')
    expect(screen.queryByText('已保存人员“新姓名”')).not.toBeInTheDocument()
    updatePractitioner.mockResolvedValue({ ...mockPractitioners[0], fullName: '新姓名', revision: 2 })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存人员档案' })).toBeEnabled())
    await userEvent.click(dialog.getByRole('button', { name: '保存人员档案' }))
    expect(await screen.findByText('已保存人员“新姓名”')).toBeInTheDocument()
    expect(updatePractitioner.mock.calls[1][1].expectedRevision).toBe(1)
  })

  it('retains the original status target and revision after an unconfirmed result and recheck', async () => {
    const changePractitionerStatus = vi.fn().mockResolvedValue({ id: 'prac-1' })
    const { api } = renderComponent(mockPractitioners, mockAssignments, { changePractitionerStatus })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '停用' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: '确认停用' }))
    expect(await dialog.findByText(/保存结果未确认/)).toBeInTheDocument()
    expect(screen.queryByText('“陈国华”状态已更新')).not.toBeInTheDocument()
    vi.mocked(api.organization.practitioner).mockResolvedValue({ practitioner: { ...mockPractitioners[0], revision: 2, sdPersonnelStatus: 'INACTIVE' }, employments: [], assignments: [] })
    await userEvent.click(dialog.getByRole('button', { name: '重新核实保存结果' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '确认停用' })).toBeEnabled())
    changePractitionerStatus.mockRejectedValue(new Error('版本冲突，请核实后关闭确认框'))
    await userEvent.click(dialog.getByRole('button', { name: '确认停用' }))
    expect(changePractitionerStatus.mock.calls).toEqual([['prac-1', 1, 'INACTIVE'], ['prac-1', 1, 'INACTIVE']])
    expect(await dialog.findByText(/版本冲突/)).toBeInTheDocument()
  })

  it('confirms a real status transition before closing the confirmation dialog', async () => {
    const changePractitionerStatus = vi.fn().mockResolvedValue({ ...mockPractitioners[0], revision: 2, sdPersonnelStatus: 'INACTIVE', sdPersonnelStatusText: '停用' })
    renderComponent(mockPractitioners, mockAssignments, { changePractitionerStatus })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '停用' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认停用' }))
    expect(await screen.findByText('“陈国华”状态已更新')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(changePractitionerStatus).toHaveBeenCalledWith('prac-1', 1, 'INACTIVE')
  })

  it('does not switch back to a previously selected practitioner when an old edit finishes', async () => {
    let resolve!: () => void
    const updatePractitioner = vi.fn().mockImplementation(() => new Promise(done => {
      resolve = () => done({ ...mockPractitioners[0], revision: 2, fullName: '原人员新姓名' })
    }))
    const { api, queryClient } = renderComponent(mockPractitioners, mockAssignments, { updatePractitioner })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    await userEvent.click(await screen.findByRole('button', { name: '编辑人员' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.clear(dialog.getByLabelText(/姓名/)); await userEvent.type(dialog.getByLabelText(/姓名/), '原人员新姓名')
    await userEvent.click(dialog.getByRole('button', { name: '保存人员档案' }))
    await waitFor(() => expect(updatePractitioner).toHaveBeenCalledTimes(1))
    vi.mocked(api.organization.practitioners).mockResolvedValue([mockPractitioners[1]])
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['practitioners'] }) })
    expect(await screen.findByRole('heading', { name: '李全科' })).toBeInTheDocument()
    await act(async () => { resolve() })
    expect(screen.getByRole('heading', { name: '李全科' })).toBeInTheDocument()
    expect(screen.queryByText('已保存人员“原人员新姓名”')).not.toBeInTheDocument()
  })

  it.each(['employment', 'assignment', 'position'] as const)('locks a pending %s and ignores its receipt after API context changes', async kind => {
    const user = userEvent.setup()
    let resolve!: () => void
    const write = vi.fn().mockImplementation((input: Record<string, unknown>) => new Promise(done => {
      resolve = () => done(receipt(kind, { ...input }))
    }))
    const item = cases.find(item => item.kind === kind)!
    const { api, queryClient, rerender } = renderComponent(mockPractitioners, mockAssignments, { [item.method]: write })
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(await screen.findByRole('button', { name: item.open }))
    const dialogElement = screen.getByRole('dialog'), dialog = within(dialogElement)
    if (kind === 'assignment') await user.type(dialog.getByLabelText(/任职代码/, { selector: 'input' }), 'ASG_NEW')
    if (kind === 'position') {
      await user.type(dialog.getByLabelText(/岗位代码/, { selector: 'input' }), 'POS_NEW')
      await user.type(dialog.getByLabelText(/岗位名称/, { selector: 'input' }), '新增岗位')
    }
    const save = dialog.getByRole('button', { name: item.save })
    await user.click(save)
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(save).toBeDisabled()
    expect(dialogElement.querySelector('form')).toHaveAttribute('inert')
    await user.keyboard('{Escape}'); expect(dialogElement).toBeInTheDocument()
    await user.click(save); expect(write).toHaveBeenCalledTimes(1)
    rerender(<QueryClientProvider client={queryClient}><MemoryRouter><OrganizationPersonnelManagement api={{ ...api }} /></MemoryRouter></QueryClientProvider>)
    await act(async () => { resolve() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(item.success)).not.toBeInTheDocument()
  })
})

describe('organization personnel read failures', () => {
  it.each(['failed', 'missing'])('does not call an unconfirmed personnel catalog empty and can retry: %s', async mode => {
    const practitioners = mode === 'failed' ? vi.fn().mockRejectedValue(new Error('人员读取失败')) : vi.fn().mockResolvedValue(null)
    renderComponent(mockPractitioners, mockAssignments, { practitioners })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await screen.findByText('人员与任职目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.queryByText('暂无人员')).not.toBeInTheDocument()
    expect(screen.queryByText('未找到匹配人员')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增人员/ })).toBeDisabled()
    practitioners.mockResolvedValue(mockPractitioners)
    await userEvent.click(screen.getByRole('button', { name: '重新加载人员与任职目录' }))
    expect(await within(screen.getByRole('listbox', { name: '人员列表' })).findByText('陈国华')).toBeInTheDocument()
  })

  it('hides cached assignment counts after a failed refresh instead of reporting no staff', async () => {
    const { api, queryClient } = renderComponent()
    expect(await screen.findByRole('table', { name: '组织任职记录' })).toBeInTheDocument()
    let reject!: (error: Error) => void
    vi.mocked(api.organization.assignments).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['assignments'] }) })
    expect(await screen.findByText('正在核实任职目录…')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '组织任职记录' })).not.toBeInTheDocument()
    await act(async () => { reject(new Error('任职读取失败')) })
    expect(await screen.findByText('任职目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.queryByText('当前组织节点暂无任职记录')).not.toBeInTheDocument()
    expect(screen.queryByText('0 条')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(screen.getByRole('combobox', { name: '按科室或机构筛选人员' })).toBeDisabled()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新加载人员与任职目录' }))
    expect(await within(screen.getByRole('listbox', { name: '人员列表' })).findByText('陈国华')).toBeInTheDocument()
  })

  it.each(['failed', 'missing-employments', 'wrong-person'])('blocks an unconfirmed practitioner detail: %s', async mode => {
    const practitioner = mode === 'failed' ? vi.fn().mockRejectedValue(new Error('档案读取失败')) : vi.fn().mockResolvedValue({
      practitioner: { ...mockPractitioners[0], id: mode === 'wrong-person' ? 'other-person' : mockPractitioners[0].id },
      employments: mode === 'missing-employments' ? undefined : [], assignments: [],
    })
    renderComponent(mockPractitioners, mockAssignments, { practitioner })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await screen.findByText('人员档案尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑人员' })).not.toBeInTheDocument()
    expect(screen.queryByText('尚未建立聘用关系')).not.toBeInTheDocument()
    expect(screen.queryByText('尚未建立科室任职')).not.toBeInTheDocument()
    practitioner.mockResolvedValue({ practitioner: mockPractitioners[0], employments: [], assignments: [] })
    await userEvent.click(screen.getByRole('button', { name: '重新加载人员档案' }))
    expect(await screen.findByRole('button', { name: '编辑人员' })).toBeEnabled()
    expect(screen.getByText('尚未建立科室任职')).toBeInTheDocument()
  })

  it('preserves an edit draft and blocks saving while its authoritative detail is being rechecked', async () => {
    const user = userEvent.setup(), { api, queryClient } = renderComponent()
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(await screen.findByRole('button', { name: '编辑人员' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.clear(dialog.getByLabelText(/姓名/)); await user.type(dialog.getByLabelText(/姓名/), '保留草稿')
    let reject!: (error: Error) => void
    vi.mocked(api.organization.practitioner).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    act(() => { void queryClient.invalidateQueries({ queryKey: ['practitioner'] }) })
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存人员档案' })).toBeDisabled())
    await act(async () => { reject(new Error('复核失败')) })
    expect(dialog.getByLabelText(/姓名/)).toHaveValue('保留草稿')
    await user.click(dialog.getByRole('button', { name: '保存人员档案' }))
    expect(api.organization.updatePractitioner).not.toHaveBeenCalled()
    await user.click(dialog.getByRole('button', { name: '重新核实人员目录' }))
    await waitFor(() => expect(dialog.getByRole('button', { name: '保存人员档案' })).toBeEnabled())
    expect(dialog.getByLabelText(/姓名/)).toHaveValue('保留草稿')
  })

  it('does not invent primary relationships or a hire date from a secondary assignment', async () => {
    renderComponent(mockPractitioners, mockAssignments.map(item => ({ ...item, primaryAssignment: false, sdAssignmentType: 'PART_TIME' })))
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await screen.findByText('未设置主要聘用')).toBeInTheDocument()
    expect(screen.getAllByText('未设置主要任职')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '编辑人员' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('入职聘用日期')).toHaveValue('')
  })

  it('keeps genuine detail visible but blocks new relationships when the position catalog fails', async () => {
    const positions = vi.fn().mockRejectedValue(new Error('岗位读取失败'))
    renderComponent(mockPractitioners, mockAssignments, { positions })
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await screen.findByText('机构与岗位目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: '人员科室任职' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增任职' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /新增人员/ })).toBeDisabled()
  })

  it('never reuses another API context cached directories', async () => {
    const { api, queryClient, rerender } = renderComponent()
    await userEvent.click(screen.getByRole('tab', { name: '人员任职' }))
    expect(await screen.findByRole('button', { name: '编辑人员' })).toBeInTheDocument()
    const other = { ...api, organization: { ...api.organization, practitioners: vi.fn().mockRejectedValue(new Error('新上下文未确认')) } }
    rerender(<QueryClientProvider client={queryClient}><MemoryRouter><OrganizationPersonnelManagement api={other} /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('人员与任职目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑人员' })).not.toBeInTheDocument()
    expect(screen.queryByText('陈国华')).not.toBeInTheDocument()
  })
})

describe('OrganizationPersonnelManagement Department Staff Query & Cross-linking', () => {
  it.each([false, true])('locks an in-flight onboarding and ignores its receipt after changing context: %s', async changeContext => {
    const user = userEvent.setup()
    let complete!: () => void
    const onboardPractitioner = vi.fn().mockImplementation((input: PractitionerOnboardingInput) =>
      new Promise(resolve => { complete = () => resolve(onboardingResult(input)) }))
    const { api, queryClient, rerender } = renderComponent(mockPractitioners, mockAssignments,
      { onboardPractitioner } as unknown as Partial<RhnApi['organization']>)
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(screen.getAllByRole('button', { name: /新增人员/ })[0])
    const dialogElement = screen.getByRole('dialog'), dialog = within(dialogElement)
    await user.type(dialog.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }), 'NEW_DOCTOR')
    await user.type(dialog.getByLabelText(/姓名/), '新医生')
    const submit = dialog.getByRole('button', { name: '保存并完成入职配置' })
    await user.click(submit)
    await waitFor(() => expect(onboardPractitioner).toHaveBeenCalledTimes(1))
    expect(submit).toBeDisabled()
    expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(dialogElement.querySelector('form')).toHaveAttribute('inert')
    await user.click(submit)
    await user.keyboard('{Escape}')
    expect(dialogElement).toBeInTheDocument()
    if (changeContext) {
      rerender(<QueryClientProvider client={queryClient}><MemoryRouter>
        <OrganizationPersonnelManagement api={{ ...api }} />
      </MemoryRouter></QueryClientProvider>)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
    await act(async () => { complete() })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onboardPractitioner).toHaveBeenCalledTimes(1)
    if (changeContext) expect(screen.queryByText('已保存人员“新医生”')).not.toBeInTheDocument()
    else expect(await screen.findByText('已保存人员“新医生”')).toBeInTheDocument()
    expect(api.organization.createPractitioner).not.toHaveBeenCalled()
    expect(api.organization.createEmployment).not.toHaveBeenCalled()
    expect(api.organization.createAssignment).not.toHaveBeenCalled()
  })

  it.each(['failure', 'incomplete'])('keeps an unconfirmed onboarding draft and never calls the legacy three-step sequence: %s', async mode => {
    const user = userEvent.setup()
    const onboardPractitioner = vi.fn().mockImplementation(async (input: PractitionerOnboardingInput) => {
      if (mode === 'failure') throw new Error('岗位已停用，入职未保存')
      return { ...onboardingResult(input), assignments: [] }
    })
    const { api } = renderComponent(mockPractitioners, mockAssignments, { onboardPractitioner } as unknown as Partial<RhnApi['organization']>)
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(screen.getAllByRole('button', { name: /新增人员/ })[0])
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }), 'NEW_DOCTOR')
    await user.type(dialog.getByLabelText(/姓名/), '新医生')
    await user.click(dialog.getByRole('button', { name: '保存并完成入职配置' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('人员保存未确认')
    expect(dialog.getByLabelText(/姓名/)).toHaveValue('新医生')
    expect(api.organization.createPractitioner).not.toHaveBeenCalled()
    expect(api.organization.createEmployment).not.toHaveBeenCalled()
    expect(api.organization.createAssignment).not.toHaveBeenCalled()
    expect(screen.queryByText('已保存人员“新医生”')).not.toBeInTheDocument()
  })

  it('does not fall back to today when the onboarding date is explicitly cleared', async () => {
    const user = userEvent.setup()
    const { api } = renderComponent()
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    await user.click(screen.getAllByRole('button', { name: /新增人员/ })[0])
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }), 'NEW_DOCTOR')
    await user.type(dialog.getByLabelText(/姓名/), '新医生')
    await user.clear(dialog.getByLabelText('入职聘用日期'))
    await user.click(dialog.getByRole('button', { name: '保存并完成入职配置' }))
    expect(await dialog.findByText('请完整填写入职配置')).toBeInTheDocument()
    expect(api.organization.onboardPractitioner).not.toHaveBeenCalled()
  })

  it('displays department staff list when selecting a department node and supports cross-link jump', async () => {
    renderComponent()

    // 1. Wait for tree to render
    await waitFor(() => {
      expect(screen.getByText('青禾镇中心卫生院')).toBeInTheDocument()
    })

    // 2. Click on "中医科" department node
    const tcmNode = screen.getByText('中医科')
    await userEvent.click(tcmNode)

    // 3. Right detail panel should display "科室任职记录" and list 陈国华
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '科室任职记录' })).toBeInTheDocument()
    })
    expect(screen.getByText('中医科主任医师')).toBeInTheDocument()

    // 4. Click "查看任职档案"
    const viewButton = screen.getByRole('button', { name: '查看任职档案' })
    await userEvent.click(viewButton)

    // 5. It should switch to personnel tab and show 陈国华's profile
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '人员目录' })).toBeInTheDocument()
    })
  })

  it('filters personnel catalog by department select and displays department & position on cards', async () => {
    renderComponent()

    // 1. Switch to personnel tab
    const personnelTab = screen.getByRole('tab', { name: '人员任职' })
    await userEvent.click(personnelTab)

    // 2. Verify both practitioners are shown with their department and position
    await waitFor(() => {
      expect(screen.getAllByText('陈国华').length).toBeGreaterThan(0)
      expect(screen.getAllByText('李全科').length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('navigation', { name: '人员目录分页' })).toBeInTheDocument()
    expect(screen.getByText('共 2 条记录')).toBeInTheDocument()
    expect(screen.getAllByText('中医科 · 中医科主任医师').length).toBeGreaterThan(0)
    expect(screen.getAllByText('全科诊室 · 全科主治医师').length).toBeGreaterThan(0)

    // 3. Filter by "中医科"
    const filterSelect = screen.getByRole('combobox', { name: '按科室或机构筛选人员' })
    await userEvent.click(filterSelect)
    const listboxId = filterSelect.getAttribute('aria-controls')
    const listbox = await waitFor(() => {
      const el = document.getElementById(listboxId || '')
      expect(el).toBeInTheDocument()
      return el!
    })
    const tcmOption = within(listbox).getByText('中医科')
    await userEvent.click(tcmOption)

    // 4. Now only 陈国华 is displayed, 李全科 is filtered out
    await waitFor(() => {
      expect(screen.getAllByText('陈国华').length).toBeGreaterThan(0)
      expect(screen.queryByText('李全科')).not.toBeInTheDocument()
    })
  })
})


describe('personnel pagination and scroll boundaries', () => {
  const people = Array.from({ length: 45 }, (_, index) => ({
    ...mockPractitioners[0], id: `person-${index}`, code: `P${index}`,
    fullName: `人员${String(index + 1).padStart(2, '0')}`,
  }))

  it('pages within the directory, resets scroll on page/size/filter changes and keeps controls outside the body', async () => {
    const user = userEvent.setup()
    renderComponent(people)
    await user.click(screen.getByRole('tab', { name: '人员任职' }))
    const list = await screen.findByRole('listbox', { name: '人员列表' })
    const body = screen.getByRole('region', { name: '人员目录内容' })
    const pagination = screen.getByRole('navigation', { name: '人员目录分页' })
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(20))
    expect(within(pagination).getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(body).not.toContainElement(pagination)
    expect(body).not.toContainElement(screen.getByRole('searchbox', { name: '搜索人员' }))
    body.scrollTop = 300
    await user.click(within(pagination).getByRole('button', { name: '下一页' }))
    expect(within(list).getByText('人员21')).toBeInTheDocument()
    expect(within(list).queryByText('人员01')).not.toBeInTheDocument()
    expect(body.scrollTop).toBe(0)
    // Keyboard navigation stays within the visible page.
    within(list).getAllByRole('option')[0].focus()
    await user.keyboard('{End}')
    expect(within(list).getAllByRole('option')[19]).toHaveFocus()
    expect(await screen.findByRole('heading', { name: '人员40' })).toBeInTheDocument()
    await user.click(within(pagination).getByRole('button', { name: '下一页' }))
    expect(within(list).getAllByRole('option')).toHaveLength(5)
    expect(within(pagination).getByRole('button', { name: '下一页' })).toBeDisabled()
    body.scrollTop = 120
    await user.selectOptions(within(pagination).getByLabelText('每页显示条数'), '50')
    expect(within(list).getAllByRole('option')).toHaveLength(45)
    expect(body.scrollTop).toBe(0)
    await user.selectOptions(within(pagination).getByLabelText('每页显示条数'), '20')
    await user.click(within(pagination).getByRole('button', { name: '下一页' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索人员' }), '人员01')
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    expect(within(pagination).getByRole('button', { name: '上一页' })).toBeDisabled()
    await user.clear(screen.getByRole('searchbox', { name: '搜索人员' }))
    expect(within(list).getAllByRole('option')).toHaveLength(20)
    await user.type(screen.getByRole('searchbox', { name: '搜索人员' }), '不存在')
    expect(within(list).queryAllByRole('option')).toHaveLength(0)
    expect(within(pagination).getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('reveals a linked practitioner on the correct directory page', async () => {
    const user = userEvent.setup()
    renderComponent([...people.slice(0, 43), ...mockPractitioners])
    const tree = await screen.findByRole('tree', { name: '组织节点' })
    await user.click(await within(tree).findByText('中医科'))
    await user.click(await screen.findByRole('button', { name: '查看任职档案' }))
    const list = await screen.findByRole('listbox', { name: '人员列表' })
    await waitFor(() => expect(within(list).getByRole('option', { selected: true })).toHaveTextContent('陈国华'))
    expect(within(list).getAllByRole('option')).toHaveLength(5)
    expect(within(screen.getByRole('navigation', { name: '人员目录分页' })).getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('resets detail scroll when changing organization without moving its fixed actions', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })
    await waitFor(() => expect(within(tree).getAllByRole('treeitem').length).toBeGreaterThan(1))
    const detail = screen.getByRole('region', { name: '组织详情内容' })
    detail.scrollTop = 400
    await user.click(within(tree).getByText('中医科'))
    expect(detail.scrollTop).toBe(0)
    expect(detail).not.toContainElement(screen.getByRole('button', { name: '编辑' }))
  })

  it('maintains stable container classes for staff list whether populated or empty', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })

    // 1. Check department with staff (中医科)
    const tcmNode = await within(tree).findByText('中医科')
    await user.click(tcmNode)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '科室任职记录' })).toBeInTheDocument()
    })
    const populatedContainer = screen.getByRole('table', { name: '组织任职记录' }).closest('.master-table-wrap--staff')
    expect(populatedContainer).toBeInTheDocument()
    expect(populatedContainer).not.toHaveClass('is-empty')

    // 2. Check department without staff (空置科室)
    const emptyNode = await within(tree).findByText('空置科室')
    await user.click(emptyNode)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '科室任职记录' })).toBeInTheDocument()
    })
    const emptyContainer = screen.getByText('当前组织节点暂无任职记录').closest('.master-table-wrap--staff')
    expect(emptyContainer).toBeInTheDocument()
    expect(emptyContainer).toHaveClass('is-empty')
  })

  it('renders split workbench layout with recorded capabilities and unverified regulatory status', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })

    const tcmNode = await within(tree).findByText('中医科')
    await user.click(tcmNode)

    // 1. Verify facts bar
    await waitFor(() => {
      expect(screen.getByText('组织类型')).toBeInTheDocument()
      expect(screen.getByText('任职记录数')).toBeInTheDocument()
    })

    // 2. Verify split workbench regions
    expect(screen.getByRole('region', { name: '任职记录工作区' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '科室业务属性与档案治理' })).toBeInTheDocument()

    // 3. Only recorded capability data is presented; no inferred permissions.
    expect(screen.getByRole('heading', { name: '已登记服务能力' })).toBeInTheDocument()
    expect(screen.getByText('尚未登记服务能力，不能据此判断业务权限')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '医保对照与法定标识' })).toBeInTheDocument()
    expect(screen.getByText('未接入标准对照数据')).toBeInTheDocument()
    expect(screen.queryByText('01.01 (中医内科专业)')).not.toBeInTheDocument()

    // 4. Verify clinical qualification badges in staff table
    expect(screen.queryByText('普通处方')).not.toBeInTheDocument()
    expect(screen.queryByText('麻精/抗菌')).not.toBeInTheDocument()
    expect(screen.getAllByText('未核验').length).toBeGreaterThan(0)
  })

  it('shows recorded organization facts without inferring permissions, regulatory codes, or descriptions', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })
    await user.click(await within(tree).findByText('全科诊室'))
    expect(await screen.findByText('其他自定义科室')).toBeInTheDocument()
    expect(screen.queryByText(/承担辖区居民常见病/)).not.toBeInTheDocument()
    expect(screen.queryByText('01.04 (全科医疗科)')).not.toBeInTheDocument()
    expect(screen.queryByText('已接入医疗保障平台')).not.toBeInTheDocument()
    expect(screen.queryByText(/具备开单权|具备管床权|参与排班/)).not.toBeInTheDocument()
    expect(await screen.findByText('尚未登记服务能力，不能据此判断业务权限')).toBeInTheDocument()
    expect(screen.getByText('未维护科室性质')).toBeInTheDocument()
  })

  it('preserves custom department type and empty description when editing a general-practice-named department', async () => {
    const user = userEvent.setup()
    const { api } = renderComponent(mockPractitioners, mockAssignments, {
      tree: vi.fn().mockResolvedValue(mockUnits.map(item => item.id === 'dept-2' ? { ...item, sdDepartmentProperty: 'CLINICAL' } : item)),
    })
    const tree = await screen.findByRole('tree', { name: '组织节点' })
    await user.click(await within(tree).findByText('全科诊室'))
    await user.click(screen.getByRole('button', { name: '编辑' }))
    const dialog = screen.getByRole('dialog', { name: '编辑组织节点' })
    expect(within(dialog).getByLabelText('组织说明')).toHaveValue('')
    expect(within(dialog).getByRole('combobox', { name: /具体科室类型/ })).toHaveTextContent('其他自定义科室')
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    await waitFor(() => expect(api.organization.updateUnit).toHaveBeenCalledWith('dept-2',
      expect.objectContaining({ sdDepartmentType: 'CUSTOM_OTHER', description: undefined })))
  })

  it('does not choose a department type from the first dictionary item for a new unit', async () => {
    const user = userEvent.setup()
    const { api } = renderComponent(mockPractitioners, mockAssignments, {}, {
      resolve: vi.fn().mockImplementation(async (code) => code === 'DEPT_TYPE'
        ? [{ code: '02', name: '全科医疗科', sortOrder: 1 }] : mockOrganizationDictionary(code)),
    })
    await screen.findByRole('button', { name: '新增下级' })
    await user.click(screen.getByRole('button', { name: '新增下级' }))
    const dialog = screen.getByRole('dialog', { name: '新建组织节点' })
    expect(within(dialog).getByRole('combobox', { name: /具体科室类型/ })).toHaveTextContent('请选择')
    await user.click(within(dialog).getByRole('combobox', { name: /具体科室类型/ }))
    expect(await screen.findByRole('option', { name: /全科医疗科/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.type(within(dialog).getByRole('textbox', { name: /组织代码/ }), 'NEW_DEPT')
    await user.type(within(dialog).getByLabelText(/组织名称/), '测试科室')
    await user.click(within(dialog).getByRole('button', { name: '保存组织' }))
    expect(await screen.findByText('科室或护理单元必须选择具体科室类型')).toBeInTheDocument()
    expect(api.organization.createUnit).not.toHaveBeenCalled()
  })

  it('keeps failed governance queries distinct from an empty profile and allows retry', async () => {
    const user = userEvent.setup()
    const profile = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      organization: mockUnits[0], identifiers: [], contacts: [], addresses: [], relations: [], responsibilities: [],
      capabilities: [{ id: 'cap-1', sdCapabilityType: 'CUSTOM', sdCapabilityTypeText: '实际登记能力',
        sdVerifyStatus: 'UNVERIFIED', sdVerifyStatusText: '待核验', sdDetailStatus: 'ACTIVE', sdDetailStatusText: '启用',
        validFrom: '2026-01-01', validTo: '2026-12-31', capabilityScope: '实际登记的服务范围' }],
    })
    renderComponent(mockPractitioners, mockAssignments, { profile })
    expect(await screen.findByText('组织治理档案加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('尚未登记服务能力，不能据此判断业务权限')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试组织档案' }))
    expect(await screen.findByText('实际登记能力')).toBeInTheDocument()
    expect(screen.getByText('实际登记的服务范围')).toBeInTheDocument()
    expect(screen.getByText('待核验')).toBeInTheDocument()
    expect(screen.getByText('未维护机构性质')).toBeInTheDocument()
    expect(screen.queryByText('公立基层医疗机构')).not.toBeInTheDocument()
    expect(screen.queryByText('已接入医疗保障平台')).not.toBeInTheDocument()
  })

  it.each([null, {}])('does not treat incomplete profile data as an empty valid profile: %j', async (profile) => {
    renderComponent(mockPractitioners, mockAssignments, { profile: vi.fn().mockResolvedValue(profile) })
    expect(await screen.findByText('组织治理档案加载失败，尚未核验')).toBeInTheDocument()
    expect(screen.queryByText('尚未登记服务能力，不能据此判断业务权限')).not.toBeInTheDocument()
  })

  it('uses saved type metadata and never guesses a department type from its name', () => {
    expect(resolveDepartmentTypeText(mockUnits[1])).toBe('未维护科室类型')
    expect(resolveDepartmentTypeText({ ...mockUnits[1], name: '药房', sdDepartmentType: 'CUSTOM_X' })).toBe('CUSTOM_X')
    expect(resolveDepartmentTypeText(mockUnits[2], [{ code: 'CUSTOM_OTHER', name: '实际字典类型' }] as never))
      .toBe('实际字典类型')
  })

  it('resolves clinical department type codes like CLIN_GENERAL_SURGERY to Chinese standard name', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })

    const surgeryNode = await within(tree).findByText('外科门诊')
    await user.click(surgeryNode)

    // Facts bar displays "普通外科专业" instead of raw English "CLIN_GENERAL_SURGERY"
    await waitFor(() => {
      expect(screen.getByText('普通外科专业')).toBeInTheDocument()
    })
    expect(screen.queryByText('CLIN_GENERAL_SURGERY')).not.toBeInTheDocument()
  })

  it('supports full pagination for staff list in organization detail', async () => {
    const user = userEvent.setup()
    // Generate 15 staff assignments for dept-1 (中医科)
    const extraAssignments: PersonnelAssignment[] = Array.from({ length: 15 }, (_, i) => ({
      id: `assign-tcm-${i + 1}`,
      revision: 1,
      employmentId: `emp-tcm-${i + 1}`,
      practitionerId: `prac-tcm-${i + 1}`,
      practitionerCode: `P${100 + i + 1}`,
      practitionerName: `中医医师_${i + 1}`,
      sdPractGender: 'MALE',
      sdPractGenderText: '男',
      organizationId: 'org-1',
      organizationName: '青禾镇中心卫生院',
      departmentId: 'dept-1',
      departmentName: '中医科',
      positionId: 'pos-1',
      positionName: '中医科医师',
      sdPositionType: 'CLINICAL',
      sdPositionTypeText: '临床',
      code: `ASG_TCM_${i + 1}`,
      sdAssignmentType: 'PRIMARY',
      sdAssignmentTypeText: '主任职',
      primaryAssignment: true,
      workloadPercent: 100,
      sdPersonnelStatus: 'ACTIVE',
      sdPersonnelStatusText: '正常',
      validFrom: '2026-01-01',
    }))

    renderComponent(mockPractitioners, extraAssignments)
    const tree = await screen.findByRole('tree', { name: '组织节点' })
    const tcmNode = await within(tree).findByText('中医科')
    await user.click(tcmNode)

    // 1. Pagination is rendered and shows 15 total records
    await waitFor(() => {
      expect(screen.getByText('共 15 条记录')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: '组织任职记录分页' })).toHaveTextContent('1 / 2')
    })

    // 2. Page 1 displays first 10 items
    expect(screen.getByText('中医医师_1')).toBeInTheDocument()
    expect(screen.getByText('中医医师_10')).toBeInTheDocument()
    expect(screen.queryByText('中医医师_11')).not.toBeInTheDocument()

    // 3. Click next page
    const staffPagination = screen.getByRole('navigation', { name: '组织任职记录分页' })
    const nextBtn = within(staffPagination).getByRole('button', { name: '下一页' })
    await user.click(nextBtn)

    // 4. Page 2 displays remaining 5 items
    await waitFor(() => {
      expect(staffPagination).toHaveTextContent('2 / 2')
      expect(screen.getByText('中医医师_11')).toBeInTheDocument()
      expect(screen.getByText('中医医师_15')).toBeInTheDocument()
      expect(screen.queryByText('中医医师_1')).not.toBeInTheDocument()
    })

    // 5. Change page size to 20
    const pageSizeSelect = within(staffPagination).getByRole('combobox')
    await user.selectOptions(pageSizeSelect, '20')

    await waitFor(() => {
      expect(staffPagination).toHaveTextContent('1 / 1')
      expect(screen.getByText('中医医师_1')).toBeInTheDocument()
      expect(screen.getByText('中医医师_15')).toBeInTheDocument()
    })
  })

  it('renders comprehensive HIS practitioner workbench with clinical prescribing rights, licenses, insurance and CA certification', async () => {
    const user = userEvent.setup()
    renderComponent()

    // 1. Switch to personnel tab
    const personnelTab = screen.getByRole('tab', { name: '人员任职' })
    await user.click(personnelTab)

    // 2. Select practitioner 陈国华
    const list = await screen.findByRole('listbox', { name: '人员列表' })
    const chengOption = within(list).getByText('陈国华')
    await user.click(chengOption)

    // 3. Verify facts bar
    await waitFor(() => {
      expect(screen.getByText('主要任职岗位')).toBeInTheDocument()
      expect(screen.getByText('核心处方准入')).toBeInTheDocument()
      expect(screen.getByText('执业与医保未核验')).toBeInTheDocument()
      expect(screen.getByText('数字证书未核验')).toBeInTheDocument()
    })

    // 4. Verify left column: HIS clinical access & prescribing matrix
    expect(screen.getByRole('region', { name: '临床资质与任职工作区' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'HIS 临床准入与处方权限管控' })).toBeInTheDocument()
    expect(screen.getByText(/尚无已核验的处方权限记录/)).toBeInTheDocument()
    expect(screen.queryByText('国家平台实名已备案')).not.toBeInTheDocument()
    expect(screen.queryByText('UKEY-ZH82910-P001')).not.toBeInTheDocument()
    expect(screen.queryByText('110330100000001')).not.toBeInTheDocument()

    // 5. Verify left column: assignments & employments tables
    expect(screen.getByRole('heading', { name: '科室任职与工作量配置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '机构劳动与聘用档案' })).toBeInTheDocument()

    // 6. Verify right column: regulatory license, insurance, CA and demographics
    expect(screen.getByRole('complementary', { name: '法定执业与监管认证档案' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '法定执业证书与监管登记' })).toBeInTheDocument()
    expect(screen.getByText('医师执业证书编码')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '国家医保代码与信用备案' })).toBeInTheDocument()
    expect(screen.getByText('全国医保医师代码')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CA 数字证书与电子签名' })).toBeInTheDocument()
    expect(screen.getByText('CA 认证机构')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '人口学档案与联络信息' })).toBeInTheDocument()
    expect(screen.getByText('法定身份证号')).toBeInTheDocument()
  })

  it('opens PractitionerDialog with comprehensive HIS attributes and grouped sections when clicking 新增人员', async () => {
    const user = userEvent.setup()
    const { api } = renderComponent()

    // 1. Switch to personnel tab
    const personnelTab = screen.getByRole('tab', { name: '人员任职' })
    await user.click(personnelTab)

    // 2. Click "新增人员" button
    const addButtons = screen.getAllByRole('button', { name: /新增人员/ })
    await user.click(addButtons[0])

    // 3. Verify dialog header
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '新增医疗从业人员' })).toBeInTheDocument()
    })
    expect(screen.getByText('人员主数据与执业准入')).toBeInTheDocument()

    // 4. Verify 4 grouped sections
    expect(screen.getByRole('region', { name: '基础身份与人口学档案' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '医疗资格与执业准入' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '聘用与任职分配' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '国家医保与数字证书档案' })).toBeInTheDocument()

    // 5. Verify onboarding banner
    expect(screen.getByText('新增人员时指定聘用机构、科室与岗位，系统将一次性建立正式主聘用、主任职和100%工作量配置；任一步失败均不保存。')).toBeInTheDocument()

    // 6. Verify HIS fields are present
    expect(screen.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/姓名/)).toBeInTheDocument()
    expect(screen.getByLabelText(/居民身份证号/)).toBeDisabled()
    expect(screen.getByLabelText(/居民身份证号/)).toHaveValue('')
    expect(screen.getByLabelText(/移动联络电话/)).toBeInTheDocument()
    expect(screen.getByLabelText(/最高学历与院校专业/)).toBeInTheDocument()
    expect(screen.getByLabelText(/从业人员大类/)).toBeInTheDocument()
    expect(screen.getByLabelText(/专业技术职称/)).toBeInTheDocument()
    expect(screen.getByLabelText(/核心处方准入级别/)).toBeInTheDocument()
    expect(screen.getByLabelText(/医师\/护士执业证书编码/, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/医师\/护士资格证书编码/, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/法定执业专业范围/)).toBeInTheDocument()
    expect(screen.getByLabelText(/聘用医疗机构/)).toBeInTheDocument()
    expect(screen.getByLabelText(/任职业务科室/)).toBeInTheDocument()
    expect(screen.getByLabelText(/标准任职岗位/)).toBeInTheDocument()
    expect(screen.getByLabelText(/入职聘用日期/)).toBeInTheDocument()
    expect(screen.getByLabelText(/全国医保医师代码/, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/CA 数字证书 Key ID/, { selector: 'input' })).toBeDisabled()
    expect(screen.getByLabelText(/CA 数字证书 Key ID/, { selector: 'input' })).toHaveValue('')

    // 7. Fill required fields and submit
    await user.type(screen.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }), 'DOC888')
    await user.type(screen.getByLabelText(/姓名/), '赵医生')

    const submitBtn = screen.getByRole('button', { name: '保存并完成入职配置' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(api.organization.onboardPractitioner).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DOC888',
          fullName: '赵医生',
        })
      )
    })
  })

  it('opens PractitionerDialog with populated clinical details when clicking 编辑人员', async () => {
    const user = userEvent.setup()
    renderComponent()

    // 1. Switch to personnel tab
    const personnelTab = screen.getByRole('tab', { name: '人员任职' })
    await user.click(personnelTab)

    // 2. Select practitioner 陈国华
    const list = await screen.findByRole('listbox', { name: '人员列表' })
    const chengOption = within(list).getByText('陈国华')
    await user.click(chengOption)

    // 3. Click "编辑人员"
    const editBtn = screen.getByRole('button', { name: '编辑人员' })
    await user.click(editBtn)

    // 4. Verify dialog title and populated fields
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '编辑人员档案 · 陈国华' })).toBeInTheDocument()
    })
    const codeInput = screen.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }) as HTMLInputElement
    expect(codeInput.value).toBe('P001')
    expect(codeInput).toHaveAttribute('readonly')

    const nameInput = screen.getByLabelText(/姓名/) as HTMLInputElement
    expect(nameInput.value).toBe('陈国华')

    expect(screen.getByRole('button', { name: '保存人员档案' })).toBeInTheDocument()
  })
})
