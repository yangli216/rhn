import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { OrganizationUnit, RhnApi } from '../../../shared/rhnApi'
import { PersonnelPage } from './PersonnelPage'

const enums = Object.entries({
  ORG_KIND: [['LEGAL_ORGANIZATION', '法定机构'], ['ORG_UNIT', '科室']],
  ORG_TYPE: [['TOWNSHIP_HEALTH_CENTER', '乡镇卫生院'], ['CLINICAL_DEPARTMENT', '临床科室']],
  PRACT_GENDER: [['1', '男'], ['2', '女']],
  POSITION_TYPE: [['CLINICAL', '临床'], ['NURSING', '护理']],
}).map(([code, items]) => ({ code, name: code, description: '', items: items.map(([item, name], sortOrder) => ({ code: item, name, description: '', sortOrder })) }))
const dictionary = (code: string) => ({
  PRACT_PROF_TITLE: [{ code: 'ATTENDING_PHYSICIAN', name: '主治医师', sortOrder: 0 }],
  PRACT_CATEGORY: [{ code: 'CLINICAL', name: '临床', sortOrder: 0 }],
  BD_ANTIMICROBIAL_LEVEL: [{ code: 'NON_RESTRICTED', name: '非限制使用级', sortOrder: 0 }, { code: 'RESTRICTED', name: '限制使用级', sortOrder: 1 }],
} as Record<string, unknown[]>)[code] ?? []
const base = { revision: 1, sdOrgStatus: 'ACTIVE' as const, sdOrgStatusText: '已启用', validFrom: '2026-01-01', virtual: false, sortOrder: 1,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const units: OrganizationUnit[] = [
  { ...base, id: 'org-1', code: 'ORG01', name: '青禾镇中心卫生院', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgKindText: '法定机构', sdOrgType: 'TOWNSHIP_HEALTH_CENTER', sdOrgTypeText: '乡镇卫生院' },
  { ...base, id: 'dept-1', parentId: 'org-1', code: 'GENERAL', name: '全科门诊', sdOrgKind: 'ORG_UNIT', sdOrgKindText: '科室', sdOrgType: 'CLINICAL_DEPARTMENT', sdOrgTypeText: '临床科室' },
  { ...base, id: 'dept-2', parentId: 'org-1', code: 'INTERNAL', name: '内科门诊', sdOrgKind: 'ORG_UNIT', sdOrgKindText: '科室', sdOrgType: 'CLINICAL_DEPARTMENT', sdOrgTypeText: '临床科室' },
]
const row = { practitionerId: 'p-1', revision: 1, code: 'P001', fullName: '陈国华', sdPractGender: '1', sdPractGenderText: '男', sdPersonnelStatus: 'ACTIVE',
  sdPersonnelStatusText: '正常', primaryAssignment: { assignmentId: 'a-1', organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-1',
    departmentName: '全科门诊', positionId: 'pos-1', positionName: '主治医师', sdPositionType: 'CLINICAL' }, currentAssignmentCount: 1,
  qualificationRegistered: false, prescribing: false, narcoticPrescribing: false }
const detail = {
  practitioner: { id: 'p-1', revision: 1, code: 'P001', fullName: '陈国华', sdPractGender: '1', sdPractGenderText: '男', sdPersonnelStatus: 'ACTIVE',
    sdPersonnelStatusText: '正常', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  employments: [{ id: 'e-1', revision: 1, practitionerId: 'p-1', organizationId: 'org-1', organizationName: '青禾镇中心卫生院', code: 'EMP1',
    sdEmploymentType: 'PERMANENT', sdEmploymentTypeText: '正式', primaryEmployment: true, hireDate: '2026-01-01', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }],
  assignments: [{ id: 'a-1', revision: 1, employmentId: 'e-1', practitionerId: 'p-1', practitionerCode: 'P001', practitionerName: '陈国华', sdPractGender: '1',
    sdPractGenderText: '男', organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-1', departmentName: '全科门诊', positionId: 'pos-1',
    positionName: '主治医师', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', code: 'ASN1', sdAssignmentType: 'PRIMARY', sdAssignmentTypeText: '主任职',
    primaryAssignment: true, workloadPercent: 100, sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', validFrom: '2026-01-01' }],
}
const unregistered = { practitionerId: 'p-1', registered: false, revision: null, prescribing: false, narcoticPrescribing: false }

const scope = { scopeType: 'DEPARTMENT', organizationId: 'org-1', organizationName: '青禾镇中心卫生院', departmentId: 'dept-1', departmentName: '全科门诊' }
const account = { id: 'u-1', username: 'p001', status: 'ACTIVE', practitionerId: 'p-1', practitionerCode: 'P001', practitionerName: '陈国华' }
const defaultGrant = { id: 'g-1', userId: 'u-1', username: 'p001', roleId: 'r-1', roleCode: 'GP_DOCTOR', roleName: '全科医生', organizationId: 'org-1',
  organizationName: '青禾镇中心卫生院', departmentId: 'dept-1', departmentName: '全科门诊', dataScopeType: 'DEPARTMENT', validFrom: '2026-01-01T00:00:00Z',
  validTo: null, createdAt: '2026-01-01T00:00:00Z', effective: true, grantSource: 'DEPT_DEFAULT', staffAssignmentId: 'a-1', practitionerId: 'p-1',
  practitionerCode: 'P001', practitionerName: '陈国华' }
const roles = [{ id: 'r-1', code: 'GP_DOCTOR', name: '全科医生', roleType: 'BUSINESS', status: 'ACTIVE', version: 1, permissionCodes: [] },
  { id: 'r-2', code: 'TRIAGE_NURSE', name: '分诊护士', roleType: 'BUSINESS', status: 'ACTIVE', version: 1, permissionCodes: [] }]

function setup(overrides: Partial<RhnApi['organization']> = {}, { canManage = true, url = '/settings/personnel' } = {},
  identityOverrides: Partial<RhnApi['identityAccess']> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const organization = {
    tree: vi.fn().mockResolvedValue(units),
    positions: vi.fn().mockResolvedValue([{ id: 'pos-1', revision: 1, code: 'POS1', name: '主治医师', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床',
      sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }]),
    personnel: vi.fn().mockResolvedValue({ content: [row], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    practitioner: vi.fn().mockResolvedValue(detail),
    qualification: vi.fn().mockResolvedValue(unregistered),
    saveQualification: vi.fn().mockImplementation(async (id, input) => ({ ...input, practitionerId: id, registered: true, revision: '0',
      sdProfessionalTitleText: '主治医师' })),
    assignPractitioner: vi.fn().mockImplementation(async (_id, input) => ({ ...detail.assignments[0], id: 'a-2', ...input, departmentName: '内科门诊' })),
    endEmployment: vi.fn().mockResolvedValue({ ...detail, employments: [{ ...detail.employments[0], revision: 2, leaveDate: new Date().toLocaleDateString('sv-SE') }] }),
    onboardPractitioner: vi.fn(),
    changes: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
  const identityAccess = {
    practitionerAccess: vi.fn().mockResolvedValue({ practitionerId: 'p-1', account, assignments: [defaultGrant], scope }),
    roles: vi.fn().mockResolvedValue(roles),
    openAccount: vi.fn(),
    assignRole: vi.fn().mockImplementation(async (_userId, input) => ({ ...defaultGrant, id: 'g-2', roleId: input.roleId, roleCode: 'TRIAGE_NURSE',
      roleName: '分诊护士', grantSource: 'MANUAL', staffAssignmentId: null })),
    revokeAssignment: vi.fn(),
    ...identityOverrides,
  }
  const api = { organization, identityAccess, dictionaries: { systemEnums: vi.fn().mockResolvedValue(enums),
    resolve: vi.fn().mockImplementation(async (code: string) => dictionary(code)) } } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}><PersonnelPage api={api} canManage={canManage} /></MemoryRouter></QueryClientProvider>)
  return { organization, identityAccess }
}
async function openDrawer() {
  await userEvent.click(await screen.findByRole('button', { name: '查看' }))
  return within(await screen.findByRole('dialog', { name: '陈国华（P001）' }))
}

describe('PersonnelPage', () => {
  it('lists personnel with primary assignment and prescribing summary, filtered from the URL and filters', async () => {
    const { organization } = setup({}, { url: '/settings/personnel?departmentId=dept-1' })
    const table = within(await screen.findByRole('table', { name: '人员列表' }))
    expect(table.getByText('全科门诊 · 主治医师')).toBeInTheDocument()
    expect(table.getByText('未登记')).toBeInTheDocument()
    expect(organization.personnel).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'dept-1', status: 'ACTIVE', page: 0, size: 20 }))
    await userEvent.click(screen.getByRole('combobox', { name: '处方权' }))
    await userEvent.click(await screen.findByRole('option', { name: '资质未登记' }))
    await waitFor(() => expect(organization.personnel).toHaveBeenLastCalledWith(expect.objectContaining({ prescribing: 'UNREGISTERED' })))
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索人员' }), '陈{Enter}')
    await waitFor(() => expect(organization.personnel).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '陈' })))
  })

  it('shows profile, assignments and qualification in a drawer without exposing employment', async () => {
    setup()
    const drawer = await openDrawer()
    expect(drawer.getByRole('region', { name: '任职' })).toHaveTextContent('全科门诊')
    expect(drawer.queryByText('聘用')).not.toBeInTheDocument()
    expect(drawer.getByRole('button', { name: '调岗' })).toBeInTheDocument()
    expect(await drawer.findByText(/尚未登记执业资质/)).toBeInTheDocument()
  })

  it('registers qualification and clears extended rights when the prescribing right is off', async () => {
    const { organization } = setup()
    const drawer = await openDrawer()
    const form = within(await drawer.findByRole('form', { name: '执业资质表单' }))
    expect(form.getByRole('switch', { name: /麻醉与第一类精神药品处方权/ })).toBeDisabled()
    await userEvent.click(form.getByRole('switch', { name: /普通处方权/ }))
    await userEvent.click(form.getByRole('switch', { name: /麻醉与第一类精神药品处方权/ }))
    await userEvent.click(form.getByRole('combobox', { name: /抗菌药物处方级别/ })); await userEvent.click(await screen.findByRole('option', { name: '限制使用级' }))
    await userEvent.click(form.getByRole('combobox', { name: '职称' })); await userEvent.click(await screen.findByRole('option', { name: '主治医师' }))
    await userEvent.click(form.getByRole('button', { name: '保存执业资质' }))
    await waitFor(() => expect(organization.saveQualification).toHaveBeenCalledWith('p-1', expect.objectContaining({ expectedRevision: undefined,
      sdProfessionalTitle: 'ATTENDING_PHYSICIAN', prescribing: true, narcoticPrescribing: true, sdAntimicrobialLevel: 'RESTRICTED' })))
    expect(await screen.findByText('已保存陈国华的执业资质')).toBeInTheDocument()
  })

  it('adds an assignment by department without asking for employment', async () => {
    const { organization } = setup()
    const drawer = await openDrawer()
    await userEvent.click(drawer.getByRole('button', { name: '新增任职' }))
    const dialog = within(screen.getByRole('dialog', { name: '新增任职' }))
    await userEvent.click(dialog.getByRole('combobox', { name: /科室/ })); await userEvent.click(await screen.findByRole('option', { name: /内科门诊/ }))
    await userEvent.click(dialog.getByRole('combobox', { name: /岗位/ })); await userEvent.click(await screen.findByRole('option', { name: '主治医师' }))
    await userEvent.click(dialog.getByRole('button', { name: '确认新增任职' }))
    await waitFor(() => expect(organization.assignPractitioner).toHaveBeenCalledWith('p-1', expect.objectContaining({ organizationId: 'org-1',
      departmentId: 'dept-2', positionId: 'pos-1', primaryAssignment: false })))
  })

  it('requires a reason before leaving and ends the employment on the last working day', async () => {
    const { organization } = setup()
    const drawer = await openDrawer()
    await userEvent.click(drawer.getByRole('button', { name: '办理离职' }))
    const dialog = within(screen.getByRole('dialog', { name: '办理离职' }))
    await userEvent.click(dialog.getByRole('button', { name: '确认办理离职' }))
    expect(dialog.getByText('请完整填写必填项')).toBeInTheDocument()
    expect(organization.endEmployment).not.toHaveBeenCalled()
    await userEvent.type(dialog.getByLabelText(/原因/), '合同到期')
    await userEvent.click(dialog.getByRole('button', { name: '确认办理离职' }))
    await waitFor(() => expect(organization.endEmployment).toHaveBeenCalledWith('e-1', expect.objectContaining({ expectedRevision: 1, reason: '合同到期' })))
  })

  it('validates onboarding codes before submitting', async () => {
    const { organization } = setup()
    await userEvent.click(await screen.findByRole('button', { name: '办理入职' }))
    const dialog = within(screen.getByRole('dialog', { name: '办理入职' }))
    await userEvent.type(dialog.getByLabelText(/工号/), '001')
    await userEvent.click(dialog.getByRole('button', { name: '确认入职' }))
    expect(dialog.getByText(/工号须以字母开头/)).toBeInTheDocument()
    expect(organization.onboardPractitioner).not.toHaveBeenCalled()
  })

  it('opens a login account and shows the department default roles it received', async () => {
    const opened = { practitionerId: 'p-1', account, assignments: [defaultGrant], scope }
    const { identityAccess } = setup({}, {}, {
      practitionerAccess: vi.fn().mockResolvedValueOnce({ practitionerId: 'p-1', account: null, assignments: [], scope }).mockResolvedValue(opened),
      openAccount: vi.fn().mockResolvedValue(opened),
    })
    const drawer = await openDrawer()
    const section = within(drawer.getByRole('region', { name: '账号与角色' }))
    expect(await section.findByText('未开通登录账号')).toBeInTheDocument()
    await userEvent.click(section.getByRole('button', { name: '开通账号' }))
    const dialog = within(screen.getByRole('dialog', { name: '开通登录账号' }))
    expect(dialog.getByRole('textbox', { name: /^登录账号/ })).toHaveValue('p001')
    await userEvent.type(dialog.getByLabelText(/^初始密码/), 'short')
    await userEvent.click(dialog.getByRole('button', { name: '确认开通' }))
    expect(dialog.getByText(/初始密码须为 8–64 位/)).toBeInTheDocument()
    await userEvent.clear(dialog.getByLabelText(/^初始密码/))
    await userEvent.type(dialog.getByLabelText(/^初始密码/), 'Init2026pass')
    await userEvent.type(dialog.getByLabelText(/确认初始密码/), 'Init2026pass')
    await userEvent.click(dialog.getByRole('button', { name: '确认开通' }))
    await waitFor(() => expect(identityAccess.openAccount).toHaveBeenCalledWith('p-1', { username: 'p001', initialPassword: 'Init2026pass' }))
    expect(await screen.findByText('已为陈国华开通账号 p001，并按科室默认授予 1 个角色')).toBeInTheDocument()
    const table = within(await section.findByRole('table', { name: '角色授权' }))
    expect(table.getByText('科室默认')).toBeInTheDocument()
  })

  it('adds a custom role limited to departments the manager may administer', async () => {
    const { identityAccess } = setup()
    const drawer = await openDrawer()
    const section = within(drawer.getByRole('region', { name: '账号与角色' }))
    await userEvent.click(await section.findByRole('button', { name: '添加角色' }))
    const dialog = within(await screen.findByRole('dialog', { name: '添加角色' }))
    await userEvent.click(dialog.getByRole('combobox', { name: /角色/ })); await userEvent.click(await screen.findByRole('option', { name: /分诊护士/ }))
    expect(dialog.getByRole('combobox', { name: /授权范围/ })).toHaveTextContent('青禾镇中心卫生院 · 全科门诊')
    await userEvent.click(dialog.getByRole('button', { name: '确认授予' }))
    await waitFor(() => expect(identityAccess.assignRole).toHaveBeenCalledWith('u-1', { roleId: 'r-2', dataScopeType: 'DEPARTMENT',
      organizationId: 'org-1', departmentId: 'dept-1', validTo: null }))
    expect(await screen.findByText('已授予“分诊护士”：青禾镇中心卫生院 · 全科门诊')).toBeInTheDocument()
  })

  it('is read-only without management permission', async () => {
    setup({ qualification: vi.fn().mockResolvedValue({ ...unregistered, registered: true, revision: '3', prescribing: true, sdProfessionalTitleText: '主治医师' }) }, { canManage: false })
    expect(screen.queryByRole('button', { name: '办理入职' })).not.toBeInTheDocument()
    const drawer = await openDrawer()
    expect(drawer.queryByRole('button', { name: '新增任职' })).not.toBeInTheDocument()
    expect(await drawer.findByText('主治医师', { selector: 'dd' })).toBeInTheDocument()
    expect(drawer.queryByRole('form', { name: '执业资质表单' })).not.toBeInTheDocument()
  })
})
