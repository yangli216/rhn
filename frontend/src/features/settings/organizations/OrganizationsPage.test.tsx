import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { OrganizationUnit, PersonnelAssignment, RhnApi } from '../../../shared/rhnApi'
import { OrganizationsPage } from './OrganizationsPage'

const enums = Object.entries({
  ORG_KIND: [['LEGAL_ORGANIZATION', '法定机构'], ['ORG_UNIT', '科室']],
  ORG_TYPE: [['TOWNSHIP_HEALTH_CENTER', '乡镇卫生院'], ['HOSPITAL', '医院'], ['CLINICAL_DEPARTMENT', '临床科室']],
}).map(([code, items]) => ({ code, name: code, description: '', items: items.map(([item, name], sortOrder) => ({ code: item, name, description: '', sortOrder })) }))
const dictionary = (code: string) => ({
  DEPT_PROPERTY: [{ code: 'CLINICAL', name: '临床', sortOrder: 0 }],
  DEPT_TYPE: [{ code: 'CUSTOM_OTHER', name: '其他自定义科室', sortOrder: 0 }],
  ORG_CONTACT_TYPE: [{ code: 'PHONE', name: '电话', sortOrder: 0 }, { code: 'EMAIL', name: '邮箱', sortOrder: 1 }],
  ORG_CONTACT_USE: [{ code: 'WORK', name: '工作', sortOrder: 0 }],
  ORG_VERIFY_STATUS: [{ code: 'UNVERIFIED', name: '未确认', sortOrder: 0 }, { code: 'VERIFIED', name: '符合', sortOrder: 1 }],
} as Record<string, unknown[]>)[code] ?? [{ code: 'CUSTOM', name: `${code}选项`, sortOrder: 0 }]

const base = { revision: 1, sdOrgStatus: 'ACTIVE' as const, sdOrgStatusText: '已启用', validFrom: '2026-01-01', virtual: false,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const org: OrganizationUnit = { ...base, id: 'org-1', code: 'ORG01', name: '青禾镇中心卫生院', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgKindText: '法定机构',
  sdOrgType: 'TOWNSHIP_HEALTH_CENTER', sdOrgTypeText: '乡镇卫生院', sortOrder: 1, timezoneCode: 'Asia/Shanghai' }
const dept: OrganizationUnit = { ...base, id: 'dept-1', parentId: 'org-1', code: 'GENERAL', name: '全科门诊', sdOrgKind: 'ORG_UNIT', sdOrgKindText: '科室',
  sdOrgType: 'CLINICAL_DEPARTMENT', sdOrgTypeText: '临床科室', sdDepartmentProperty: 'CLINICAL', sdDepartmentPropertyText: '临床',
  sdDepartmentType: 'CUSTOM_OTHER', sdDepartmentTypeText: '其他自定义科室', sortOrder: 2 }
const assignment = (id: string, practitionerId: string, primary: boolean): PersonnelAssignment => ({
  id, revision: 1, employmentId: `emp-${id}`, practitionerId, practitionerCode: practitionerId, practitionerName: `人员${id}`, sdPractGender: '1',
  sdPractGenderText: '男', organizationId: 'org-1', organizationName: org.name, departmentId: 'dept-1', departmentName: dept.name, positionId: 'pos-1',
  positionName: '医师', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', code: id, sdAssignmentType: primary ? 'PRIMARY' : 'PART_TIME',
  sdAssignmentTypeText: primary ? '主任职' : '兼职', primaryAssignment: primary, workloadPercent: 100, sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', validFrom: '2026-01-01',
} as PersonnelAssignment)
const profileFor = (unit: OrganizationUnit, extra: Record<string, unknown> = {}) => unit.sdOrgKind === 'ORG_UNIT'
  ? { department: { ...unit, organizationId: 'org-1', parentId: null }, contacts: [], relations: [], capabilities: [], responsibilities: [], ...extra }
  : { organization: unit, identifiers: [], contacts: [], addresses: [], relations: [], capabilities: [], responsibilities: [], ...extra }

function LocationProbe() { return <p data-testid="location">{useLocation().pathname}{useLocation().search}</p> }

const defaultRole = { id: 'd-1', organizationId: 'org-1', departmentId: 'dept-1', roleId: 'r-1', roleCode: 'GP_DOCTOR', roleName: '全科医生',
  roleStatus: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' }
const accessRoles = [{ id: 'r-1', code: 'GP_DOCTOR', name: '全科医生', roleType: 'BUSINESS', status: 'ACTIVE', version: 1, permissionCodes: [] },
  { id: 'r-2', code: 'TRIAGE_NURSE', name: '分诊护士', roleType: 'BUSINESS', status: 'ACTIVE', version: 1, permissionCodes: [] }]

function setup(overrides: Partial<RhnApi['organization']> = {}, canManage = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const organization = {
    tree: vi.fn().mockResolvedValue([org, dept]),
    profile: vi.fn().mockImplementation(async (unit: OrganizationUnit) => profileFor(unit.id === 'org-1' ? org : dept)),
    assignments: vi.fn().mockResolvedValue([assignment('a1', 'p1', true), assignment('a2', 'p1', false), assignment('a3', 'p2', true)]),
    businessConfiguration: vi.fn().mockResolvedValue({ runtimeUses: [{ code: 'SCHEDULING', name: '门诊排班', classificationMatches: true, requirement: '还需排班与任职' }],
      suggestedCapabilityTypes: [], warnings: [] }),
    deactivationImpact: vi.fn().mockResolvedValue({ activeChildren: 1, continuingAssignments: 0, continuingEmployments: 0 }),
    changes: vi.fn().mockResolvedValue([]),
    createUnit: vi.fn(),
    maintainUnit: vi.fn(),
    changeUnitStatus: vi.fn(),
    ...overrides,
  }
  const identityAccess = {
    departmentDefaultRoles: vi.fn().mockResolvedValue({ organizationId: 'org-1', departmentId: 'dept-1', manageable: true, roles: [defaultRole], grantedCount: 0 }),
    replaceDepartmentDefaultRoles: vi.fn().mockImplementation(async (_id: string, input: { roleIds: string[] }) => ({ organizationId: 'org-1',
      departmentId: 'dept-1', manageable: true, grantedCount: 2, roles: input.roleIds.map(roleId => ({ ...defaultRole, id: `d-${roleId}`, roleId,
        roleCode: accessRoles.find(role => role.id === roleId)!.code, roleName: accessRoles.find(role => role.id === roleId)!.name })) })),
    roles: vi.fn().mockResolvedValue(accessRoles),
  }
  const api = {
    organization, identityAccess,
    dictionaries: { systemEnums: vi.fn().mockResolvedValue(enums), resolve: vi.fn().mockImplementation(async (code: string) => dictionary(code)) },
    gridAddresses: { list: vi.fn().mockResolvedValue([]) },
  } as unknown as RhnApi
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/settings/organizations']}><Routes>
    <Route path="/settings/organizations" element={<OrganizationsPage api={api} canManage={canManage} />} />
    <Route path="/settings/personnel" element={<LocationProbe />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return { organization, identityAccess }
}
const detail = () => within(screen.getByRole('region', { name: '组织详情内容' }))
async function selectDepartment() {
  await userEvent.click(await within(await screen.findByRole('tree', { name: '组织树' })).findByText('全科门诊'))
  await screen.findByRole('heading', { name: '全科门诊' })
}

describe('OrganizationsPage', () => {
  it('shows a read-only organization detail with profile cards and staff counts', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: '青禾镇中心卫生院' })).toBeInTheDocument()
    expect(await detail().findByText('Asia/Shanghai')).toBeInTheDocument()
    expect(detail().queryAllByRole('textbox')).toHaveLength(0)
    for (const name of ['机构标识', '地址', '联系方式', '负责人', '服务能力']) expect(detail().getByRole('group', { name })).toBeInTheDocument()
    expect(detail().queryByRole('group', { name: '协作关系' })).not.toBeInTheDocument()
    expect(await detail().findByText('在岗 2 人，其中主任职 2 人')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('explains department runtime properties and links to personnel management', async () => {
    setup()
    await selectDepartment()
    expect(detail().getByRole('region', { name: '运行属性' })).toHaveTextContent('其他自定义科室')
    expect(await detail().findByText('门诊排班')).toBeInTheDocument()
    expect(detail().queryByRole('group', { name: '机构标识' })).not.toBeInTheDocument()
    await userEvent.click(detail().getByRole('button', { name: '在人员管理中查看' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/personnel?departmentId=dept-1')
  })

  it('sets department default roles and optionally grants them to current staff', async () => {
    const { identityAccess } = setup()
    await selectDepartment()
    const section = within(detail().getByRole('region', { name: '默认角色' }))
    expect(await section.findByText('全科医生')).toBeInTheDocument()
    await userEvent.click(section.getByRole('button', { name: '设置默认角色' }))
    const dialog = within(await screen.findByRole('dialog', { name: '设置默认角色' }))
    await userEvent.click(dialog.getByRole('combobox', { name: /默认角色/ })); await userEvent.click(await screen.findByRole('option', { name: /分诊护士/ }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(dialog.getByRole('switch', { name: '同时授予科室现有人员' }))
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(identityAccess.replaceDepartmentDefaultRoles).toHaveBeenCalledWith('dept-1', { roleIds: ['r-1', 'r-2'], applyToCurrentStaff: true }))
    expect(await screen.findByText('已保存全科门诊的默认角色，为现有人员新增 2 项授权')).toBeInTheDocument()
  })

  it('edits basic information in a dialog with validity dates under more settings', async () => {
    const maintainUnit = vi.fn().mockImplementation(async (_unit, command) => profileFor({ ...org, ...command.details, revision: 2, updatedAt: '2026-10-19T00:00:00Z' }))
    setup({ maintainUnit })
    await screen.findByRole('heading', { name: '青禾镇中心卫生院' })
    await userEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog', { name: '编辑机构' }))
    expect(dialog.queryByLabelText(/生效日期/)).not.toBeInTheDocument()
    expect(dialog.queryByRole('textbox', { name: /组织代码/ })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: /更多设置/ }))
    expect(dialog.getByLabelText(/生效日期/)).toBeInTheDocument()
    await userEvent.clear(dialog.getByLabelText(/名称/)); await userEvent.type(dialog.getByLabelText(/名称/), '青禾镇卫生院')
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(maintainUnit).toHaveBeenCalledWith(expect.objectContaining({ id: 'org-1' }), expect.objectContaining({ expectedRevision: 1, changes: [],
      details: expect.objectContaining({ name: '青禾镇卫生院', timezoneCode: 'Asia/Shanghai' }) }))
  })

  it('keeps the dialog and input when saving fails', async () => {
    setup({ maintainUnit: vi.fn().mockRejectedValue(new Error('版本冲突')) })
    await userEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const dialog = within(screen.getByRole('dialog', { name: '编辑机构' }))
    await userEvent.type(dialog.getByLabelText(/名称/), '草稿')
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    expect(await dialog.findByText(/保存未完成：版本冲突/)).toBeInTheDocument()
    expect(dialog.getByLabelText(/名称/)).toHaveValue('青禾镇中心卫生院草稿')
  })

  it('creates a sub-department with required runtime properties', async () => {
    const createUnit = vi.fn().mockImplementation(async input => ({ ...dept, ...input, id: 'dept-new', code: input.code.toUpperCase(), revision: 0,
      sdOrgType: 'CLINICAL_DEPARTMENT', parentId: 'org-1' }))
    setup({ createUnit })
    await screen.findByRole('heading', { name: '青禾镇中心卫生院' })
    await userEvent.click(screen.getByRole('button', { name: '新增下级科室' }))
    const dialog = within(screen.getByRole('dialog', { name: '新增下级科室' }))
    await userEvent.type(dialog.getByRole('textbox', { name: /组织代码/ }), 'NEW_DEPT')
    await userEvent.type(dialog.getByLabelText(/名称/), '新科室')
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    expect(await dialog.findByText('请选择业务属性')).toBeInTheDocument()
    expect(createUnit).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('combobox', { name: /业务属性/ })); await userEvent.click(await screen.findByRole('option', { name: '临床' }))
    await userEvent.click(dialog.getByRole('combobox', { name: /具体科室类型/ })); await userEvent.click(await screen.findByRole('option', { name: '其他自定义科室' }))
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(createUnit).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEW_DEPT', sdOrgKind: 'ORG_UNIT', parentId: 'org-1',
      sdDepartmentProperty: 'CLINICAL', sdDepartmentType: 'CUSTOM_OTHER' })))
  })

  it('maintains one profile section with defaults and unchanged basic data, never resubmitting relations', async () => {
    const relation = { id: 'rel-1', targetOrganizationId: 'org-2', targetOrganizationName: '协作机构', sdRelationType: 'PARTNER', sdRelationTypeText: '协作',
      primaryRelation: false, description: null, validFrom: '2026-01-01', validTo: null, sdDetailStatus: 'ACTIVE', sdDetailStatusText: '启用' }
    const maintainUnit = vi.fn().mockImplementation(async (_unit, command) => profileFor({ ...org, revision: 2, updatedAt: '2026-10-19T00:00:00Z' }, {
      relations: [relation],
      contacts: command.changes.map((change: { values: Record<string, unknown> }) => ({ ...change.values, id: 'contact-new', validTo: null,
        sdContactTypeText: '电话', sdContactUseText: '工作', sdDetailStatusText: '启用' })) }))
    setup({ maintainUnit, profile: vi.fn().mockResolvedValue(profileFor(org, { relations: [relation] })) })
    await userEvent.click(await within(await screen.findByRole('group', { name: '联系方式' })).findByRole('button', { name: '维护' }))
    const dialog = within(screen.getByRole('dialog', { name: '维护联系方式' }))
    expect(dialog.queryByText('生效日期')).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '新增联系方式' }))
    await userEvent.type(dialog.getByLabelText('联系方式'), '0571-1234567')
    await userEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(maintainUnit).toHaveBeenCalled())
    const command = maintainUnit.mock.calls[0][1]
    expect(command.details).toMatchObject({ name: org.name, validFrom: org.validFrom })
    expect(command.changes).toEqual([expect.objectContaining({ section: 'contact', values: expect.objectContaining({ sdContactType: 'PHONE', sdContactUse: 'WORK',
      contactValue: '0571-1234567', validFrom: new Date().toLocaleDateString('sv-SE'), sdDetailStatus: 'ACTIVE' }) })])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('blocks deactivation while dependencies remain', async () => {
    const { organization } = setup()
    await screen.findByRole('heading', { name: '青禾镇中心卫生院' })
    await userEvent.click(screen.getByRole('button', { name: '更多' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '停用' }))
    const dialog = within(screen.getByRole('dialog', { name: '停用青禾镇中心卫生院' }))
    expect(await dialog.findByText(/启用中的下级组织 1 个/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: '确认停用' })).toBeDisabled()
    expect(organization.changeUnitStatus).not.toHaveBeenCalled()
  })

  it('is read-only without management permission', async () => {
    setup({}, false)
    await screen.findByRole('heading', { name: '青禾镇中心卫生院' })
    for (const name of ['编辑', '新增下级科室', '新建机构', '维护', '更多']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
})
