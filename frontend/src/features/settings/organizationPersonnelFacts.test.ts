import { describe, expect, it } from 'vitest'
import { onlyPrimary, requireOrganizationUnits, requirePersonnelAssignments, requirePositions, requirePractitionerDetail, requirePractitioners } from './organizationPersonnelFacts'

const person = { id: 'person', revision: 1, code: 'P001', fullName: '测试医生', sdPractGender: 'MALE', sdPractGenderText: '男',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const employment = { id: 'employment', revision: 1, code: 'E001', practitionerId: 'person', organizationId: 'org', organizationName: '机构',
  sdEmploymentType: 'PERMANENT', sdEmploymentTypeText: '正式', primaryEmployment: true, hireDate: '2026-01-01',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
const assignment = { id: 'assignment', revision: 1, code: 'A001', employmentId: 'employment', practitionerId: 'person', practitionerCode: 'P001',
  practitionerName: '测试医生', sdPractGender: 'MALE', organizationId: 'org', organizationName: '机构', departmentId: 'dept', departmentName: '科室',
  positionId: 'position', positionName: '岗位', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', sdAssignmentType: 'PRIMARY',
  sdAssignmentTypeText: '主任职', primaryAssignment: true, workloadPercent: 100, sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', validFrom: '2026-01-01' }
const position = { id: 'position', revision: 1, code: 'POS', name: '岗位', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
const org = { id: 'org', revision: 1, code: 'ORG', name: '机构', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgKindText: '机构',
  sdOrgType: 'HOSPITAL', sdOrgTypeText: '医院', sdOrgStatus: 'ACTIVE', sdOrgStatusText: '正常', virtual: false, sortOrder: 1,
  validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const dept = { ...org, id: 'dept', parentId: 'org', sdOrgKind: 'ORG_UNIT', sdOrgKindText: '科室' }
const detail = { practitioner: person, employments: [employment], assignments: [assignment] }

describe('organization personnel authoritative reads', () => {
  it.each([
    [requirePractitioners, person], [requirePersonnelAssignments, assignment], [requirePositions, position], [requireOrganizationUnits, org],
  ] as const)('distinguishes a confirmed empty catalog from missing, partial or duplicate data', (read, row) => {
    expect(read([])).toEqual([])
    expect(read([row])).toEqual([row])
    for (const value of [null, {}, [null], [row, row], [{ ...row, id: '' }], [{ ...row, revision: '1' }], [{ ...row, revision: -1 }]]) {
      expect(() => read(value)).toThrow(/返回不完整/)
    }
  })
  it.each([{ sdPersonnelStatus: 'OTHER' }, { sdPractGender: 'OTHER' }, { fullName: '' }, { sdPersonnelStatusText: undefined },
    { createdAt: '2026-02-30T00:00:00Z' }, { updatedAt: null }])('rejects invented or incomplete personnel facts %j', patch => {
    expect(() => requirePractitioners([{ ...person, ...patch }])).toThrow()
  })
  it.each([{ primaryAssignment: undefined }, { primaryAssignment: 'false' }, { workloadPercent: '100' }, { workloadPercent: 101 },
    { sdPositionType: 'OTHER' }, { sdAssignmentType: 'OTHER' }, { sdPersonnelStatus: 'OTHER' }, { practitionerId: null },
    { departmentId: '' }, { employmentId: undefined }, { validFrom: '2026-02-30' }, { validTo: '2025-01-01' },
  ])('does not repair incomplete assignment facts %j', patch => {
    expect(() => requirePersonnelAssignments([{ ...assignment, ...patch }])).toThrow()
  })
  it('accepts zero workload and an explicitly unspecified workload without rewriting either', () => {
    expect(requirePersonnelAssignments([{ ...assignment, workloadPercent: 0 }])[0].workloadPercent).toBe(0)
    expect(requirePersonnelAssignments([{ ...assignment, workloadPercent: null }])[0].workloadPercent).toBeNull()
  })
  it.each([[dept], [org, { ...dept, parentId: 'missing' }], [{ ...org, parentId: 'dept' }, dept],
    [org, { ...dept, parentId: 'dept' }], [{ ...org, sdOrgStatus: 'OTHER' }],
  ].map(nodes => ({ nodes })))('rejects incomplete or cyclic organization hierarchies %j', ({ nodes }) => {
    expect(() => requireOrganizationUnits(nodes)).toThrow()
  })
  it('accepts a complete nested department tree', () => {
    const nodes = [org, dept, { ...dept, id: 'child', parentId: 'dept' }]
    expect(requireOrganizationUnits(nodes)).toEqual(nodes)
  })
  it('accepts an intact detail and genuinely empty relationships', () => {
    expect(requirePractitionerDetail(detail, 'person')).toEqual(detail)
    expect(requirePractitionerDetail({ practitioner: person, employments: [], assignments: [] }, 'person').assignments).toEqual([])
  })
  it.each([null, {}, { ...detail, employments: undefined }, { ...detail, assignments: undefined },
    { ...detail, practitioner: { ...person, id: 'other' } }, { ...detail, employments: [] },
    { ...detail, employments: [employment, employment] }, { ...detail, assignments: [assignment, assignment] },
    { ...detail, employments: [{ ...employment, practitionerId: 'other' }] },
    { ...detail, employments: [{ ...employment, primaryEmployment: null }] },
    { ...detail, employments: [{ ...employment, leaveDate: '2026-06-01' }] },
  ])('refuses to manufacture empty relationships or use another person detail %j', source => {
    expect(() => requirePractitionerDetail(source, 'person')).toThrow(/人员档案/)
  })
  it.each([{ employmentId: 'other' }, { practitionerId: 'other' }, { practitionerCode: 'OTHER' }, { practitionerName: '其他人' },
    { sdPractGender: 'FEMALE' }, { organizationId: 'other' }, { validFrom: '2025-01-01' },
  ])('verifies detail relationship ownership and effective dates %j', patch => {
    expect(() => requirePractitionerDetail({ ...detail, assignments: [{ ...assignment, ...patch }] }, 'person')).toThrow()
  })
  it('never promotes the first secondary relationship or arbitrarily selects one of several main relationships', () => {
    const secondary = requirePersonnelAssignments([{ ...assignment, primaryAssignment: false }])
    expect(onlyPrimary(secondary, 'assignment')).toBeUndefined()
    const main = requirePersonnelAssignments([assignment])
    expect(onlyPrimary(main, 'assignment')).toEqual(main[0])
    expect(onlyPrimary([...main, ...main], 'assignment')).toBeUndefined()
    const employments = requirePractitionerDetail(detail, 'person').employments
    expect(onlyPrimary(employments, 'employment')).toEqual(employments[0])
    expect(onlyPrimary([{ ...employments[0], primaryEmployment: false }], 'employment')).toBeUndefined()
  })
})
