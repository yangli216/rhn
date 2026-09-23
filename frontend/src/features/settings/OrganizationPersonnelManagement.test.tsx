import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { OrganizationUnit, PersonnelAssignment, Practitioner, RhnApi } from '../../shared/rhnApi'
import { OrganizationPersonnelManagement } from './OrganizationPersonnelManagement'

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

function renderComponent(people: Practitioner[] = mockPractitioners, assignmentsList: PersonnelAssignment[] = mockAssignments) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  const api = {
    organization: {
      tree: vi.fn().mockResolvedValue(mockUnits),
      profile: vi.fn().mockResolvedValue({
        organization: mockUnits[0],
        identifiers: [],
        contacts: [],
        addresses: [],
        relations: [],
        capabilities: [],
        responsibilities: [],
      }),
      practitioners: vi.fn().mockResolvedValue(people),
      practitioner: vi.fn().mockImplementation((id: string) => {
        const practitioner = people.find((p) => p.id === id) || people[0]
        const assignments = assignmentsList.filter((a) => a.practitionerId === practitioner.id)
        return Promise.resolve({
          practitioner,
          employments: [],
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
      createEmployment: vi.fn().mockResolvedValue({ id: 'emp-new' }),
      createAssignment: vi.fn().mockResolvedValue({ id: 'assign-new' }),
      positions: vi.fn().mockResolvedValue([
        { id: 'pos-1', code: 'POS01', name: '中医科主任医师', sdPositionType: 'CLINICAL', sdPersonnelStatus: 'ACTIVE' },
        { id: 'pos-2', code: 'POS02', name: '全科主治医师', sdPositionType: 'CLINICAL', sdPersonnelStatus: 'ACTIVE' },
      ]),
      assignments: vi.fn().mockResolvedValue(assignmentsList),
    },
    dictionaries: {
      systemEnums: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue([]),
    },
  } as unknown as RhnApi

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrganizationPersonnelManagement api={api} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...utils, api }
}

describe('OrganizationPersonnelManagement Department Staff Query & Cross-linking', () => {
  it('displays department staff list when selecting a department node and supports cross-link jump', async () => {
    renderComponent()

    // 1. Wait for tree to render
    await waitFor(() => {
      expect(screen.getByText('青禾镇中心卫生院')).toBeInTheDocument()
    })

    // 2. Click on "中医科" department node
    const tcmNode = screen.getByText('中医科')
    await userEvent.click(tcmNode)

    // 3. Right detail panel should display "科室在任人员" and list 陈国华
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '科室在任人员' })).toBeInTheDocument()
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
      expect(screen.getByRole('heading', { name: '科室在任人员' })).toBeInTheDocument()
    })
    const populatedContainer = screen.getByRole('table', { name: '组织在任人员' }).closest('.master-table-wrap--staff')
    expect(populatedContainer).toBeInTheDocument()
    expect(populatedContainer).not.toHaveClass('is-empty')

    // 2. Check department without staff (空置科室)
    const emptyNode = await within(tree).findByText('空置科室')
    await user.click(emptyNode)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '科室在任人员' })).toBeInTheDocument()
    })
    const emptyContainer = screen.getByText('当前组织节点暂无任职人员').closest('.master-table-wrap--staff')
    expect(emptyContainer).toBeInTheDocument()
    expect(emptyContainer).toHaveClass('is-empty')
  })

  it('renders split workbench layout with HIS control switches and clinical qualification badges', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })

    const tcmNode = await within(tree).findByText('中医科')
    await user.click(tcmNode)

    // 1. Verify facts bar
    await waitFor(() => {
      expect(screen.getByText('组织类型')).toBeInTheDocument()
      expect(screen.getByText('在任总人数')).toBeInTheDocument()
    })

    // 2. Verify split workbench regions
    expect(screen.getByRole('region', { name: '在任人员工作区' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '科室业务属性与档案治理' })).toBeInTheDocument()

    // 3. Verify HIS control switches and Insurance standard codes
    expect(screen.getByRole('heading', { name: '科室业务属性与 HIS 管控' })).toBeInTheDocument()
    expect(screen.getByText('门诊挂号与接诊开单')).toBeInTheDocument()
    expect(screen.getByText('住院收治与开立医嘱')).toBeInTheDocument()
    expect(screen.getByText('门诊排班与号源预约')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '医保对照与法定标识' })).toBeInTheDocument()
    expect(screen.getByText('01.01 (中医内科专业)')).toBeInTheDocument()

    // 4. Verify clinical qualification badges in staff table
    expect(screen.getByText('普通处方')).toBeInTheDocument()
    expect(screen.getByText('麻精/抗菌')).toBeInTheDocument()
  })

  it('resolves General Practice department type and default description when unit is GENERAL or has custom other type', async () => {
    const user = userEvent.setup()
    renderComponent()
    const tree = await screen.findByRole('tree', { name: '组织节点' })

    const generalNode = await within(tree).findByText('全科诊室')
    await user.click(generalNode)

    // 1. Facts bar displays "全科医疗科" instead of "其他自定义科室"
    await waitFor(() => {
      expect(screen.getByText('全科医疗科')).toBeInTheDocument()
    })

    // 2. Note displays standard primary care description
    expect(screen.getByText('承担辖区居民常见病、多发病门诊首诊、慢性病（高血压/糖尿病）规范化管理、健康档案建立与分级诊疗双向转诊。')).toBeInTheDocument()

    // 3. Regulatory standard code displays "01.04 (全科医疗科)"
    expect(screen.getByText('01.04 (全科医疗科)')).toBeInTheDocument()
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
      expect(screen.getByRole('navigation', { name: '组织在任人员分页' })).toHaveTextContent('1 / 2')
    })

    // 2. Page 1 displays first 10 items
    expect(screen.getByText('中医医师_1')).toBeInTheDocument()
    expect(screen.getByText('中医医师_10')).toBeInTheDocument()
    expect(screen.queryByText('中医医师_11')).not.toBeInTheDocument()

    // 3. Click next page
    const staffPagination = screen.getByRole('navigation', { name: '组织在任人员分页' })
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
      expect(screen.getByText('专业职务 / 职称')).toBeInTheDocument()
      expect(screen.getByText('核心处方准入')).toBeInTheDocument()
      expect(screen.getByText('卫健注册 · 医保定点')).toBeInTheDocument()
      expect(screen.getByText('数字证书已认证')).toBeInTheDocument()
    })

    // 4. Verify left column: HIS clinical access & prescribing matrix
    expect(screen.getByRole('region', { name: '临床资质与任职工作区' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'HIS 临床准入与处方权限管控' })).toBeInTheDocument()
    expect(screen.getByText('门诊与住院普通处方开立权')).toBeInTheDocument()
    expect(screen.getByText('麻醉药品与第一类精神药品处方权（红处方）')).toBeInTheDocument()
    expect(screen.getByText('抗菌药物临床应用分级处方权')).toBeInTheDocument()
    expect(screen.getByText('中药饮片与中医适宜技术开具权')).toBeInTheDocument()
    expect(screen.getByText('门诊排班出诊与号源预约池准入')).toBeInTheDocument()

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
    expect(screen.getByText('新增人员时指定聘用机构、科室与岗位，系统将自动建立劳动聘用与科室任职关系，无需多步跳转配置。')).toBeInTheDocument()

    // 6. Verify HIS fields are present
    expect(screen.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/姓名/)).toBeInTheDocument()
    expect(screen.getByLabelText(/居民身份证号/)).toBeInTheDocument()
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
    expect(screen.getByLabelText(/CA 数字证书 Key ID/, { selector: 'input' })).toBeInTheDocument()

    // 7. Fill required fields and submit
    await user.type(screen.getByLabelText(/人员代码 \/ 工号/, { selector: 'input' }), 'DOC888')
    await user.type(screen.getByLabelText(/姓名/), '赵医生')

    const submitBtn = screen.getByRole('button', { name: '保存并完成入职配置' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(api.organization.createPractitioner).toHaveBeenCalledWith(
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
