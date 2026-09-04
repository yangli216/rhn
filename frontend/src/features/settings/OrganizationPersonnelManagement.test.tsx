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
    code: 'DEPT02',
    name: '全科诊室',
    sdOrgKind: 'ORG_UNIT',
    sdOrgKindText: '科室/业务单元',
    sdOrgType: 'TOWNSHIP_HEALTH_CENTER',
    sdOrgTypeText: '乡镇卫生院',
    sdOrgStatus: 'ACTIVE',
    sdOrgStatusText: '正常',
    validFrom: '2026-01-01',
    sortOrder: 2,
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

function renderComponent() {
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
      practitioners: vi.fn().mockResolvedValue(mockPractitioners),
      practitioner: vi.fn().mockImplementation((id: string) => {
        const practitioner = mockPractitioners.find((p) => p.id === id) || mockPractitioners[0]
        const assignments = mockAssignments.filter((a) => a.practitionerId === practitioner.id)
        return Promise.resolve({
          practitioner,
          employments: [],
          assignments,
        })
      }),
      positions: vi.fn().mockResolvedValue([]),
      assignments: vi.fn().mockResolvedValue(mockAssignments),
    },
    dictionaries: {
      systemEnums: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue([]),
    },
  } as unknown as RhnApi

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrganizationPersonnelManagement api={api} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
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
