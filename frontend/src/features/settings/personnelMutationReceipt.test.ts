import { describe, expect, it } from 'vitest'
import type { AssignmentInput, EmploymentInput } from '../../shared/rhnApi'
import { requireEmployments, requirePersonnelAssignments, requirePositions, requirePractitioners } from './organizationPersonnelFacts'
import { requireCreatedAssignment, requireCreatedEmployment, requireCreatedPosition, requirePractitionerStatus, requireUpdatedPractitioner } from './personnelMutationReceipt'

const before = requirePractitioners([{ id: 'person', revision: 1, code: 'P001', fullName: '医生', sdPractGender: 'MALE', sdPractGenderText: '男',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }])[0]
const edited = { ...before, revision: 2, fullName: '新姓名', sdPractGender: 'FEMALE', sdPractGenderText: '女' }
const edit = { fullName: ' 新姓名 ', sdPractGender: 'FEMALE' as const }
const stopped = { ...before, revision: 2, sdPersonnelStatus: 'INACTIVE', sdPersonnelStatusText: '停用' }
const positionInput = { code: 'pos_new', name: ' 新岗位 ', sdPositionType: 'CLINICAL' as const, dutyDescription: ' 岗位职责 ' }
const position = { id: 'new-position', revision: 0, code: 'POS_NEW', name: '新岗位', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常', dutyDescription: '岗位职责' }
const employmentInput: EmploymentInput = { practitionerId: 'person', organizationId: 'org', code: 'emp_new', sdEmploymentType: 'CONTRACT',
  primaryEmployment: false, hireDate: '2026-01-01', leaveDate: '2027-01-01' }
const employment = { ...employmentInput, code: 'EMP_NEW', id: 'new-employment', revision: 0, organizationName: '机构',
  sdEmploymentTypeText: '合同', sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }
const assignmentInput: AssignmentInput = { employmentId: 'employment', organizationId: 'org', departmentId: 'dept', positionId: 'pos',
  code: 'asg_new', sdAssignmentType: 'PART_TIME', specialtyCode: ' SPECIAL ', primaryAssignment: false, workloadPercent: 0,
  validFrom: '2026-01-01', validTo: '2027-01-01' }
const assignment = { ...assignmentInput, code: 'ASG_NEW', specialtyCode: 'SPECIAL', id: 'new-assignment', revision: 0,
  practitionerId: 'person', practitionerName: '医生', practitionerCode: 'P001', sdPractGender: 'MALE', organizationName: '机构',
  departmentName: '科室', positionName: '岗位', sdPositionType: 'CLINICAL', sdPositionTypeText: '临床', sdAssignmentTypeText: '兼职',
  sdPersonnelStatus: 'ACTIVE', sdPersonnelStatusText: '正常' }

describe('personnel mutation receipts', () => {
  it('accepts only the requested edits and status transition with a newer revision', () => {
    expect(requireUpdatedPractitioner(edited, before, edit)).toEqual(edited)
    expect(requirePractitionerStatus(stopped, before, 'INACTIVE')).toEqual(stopped)
  })
  it.each([{ id: 'other' }, { code: 'OTHER' }, { revision: 1 }, { revision: '2' }, { fullName: '旧名称' },
    { sdPractGender: 'MALE' }, { sdPersonnelStatus: 'INACTIVE' }, { createdAt: '2026-01-02T00:00:00Z' }, { updatedAt: '2025-01-01T00:00:00Z' },
  ])('refuses unrelated or unpersisted edits %j', patch => {
    expect(() => requireUpdatedPractitioner({ ...edited, ...patch }, before, edit)).toThrow()
  })
  it.each([{ id: 'other' }, { code: 'OTHER' }, { revision: 1 }, { fullName: '其他人' }, { sdPractGender: 'FEMALE' },
    { sdPersonnelStatus: 'ACTIVE' }, { createdAt: '2026-01-02T00:00:00Z' },
  ])('refuses a status receipt that changes identity or does not reach the target %j', patch => {
    expect(() => requirePractitionerStatus({ ...stopped, ...patch }, before, 'INACTIVE')).toThrow()
  })
  it('confirms complete new records, preserving false flags and zero workload', () => {
    expect(requireCreatedPosition(position, positionInput, [])).toEqual(position)
    expect(requireCreatedEmployment(employment, employmentInput, [])).toEqual(employment)
    expect(requireCreatedAssignment(assignment, assignmentInput, 'person', [])).toEqual(assignment)
  })
  it.each([{ id: undefined }, { code: 'OTHER' }, { name: '其他岗位' }, { sdPositionType: 'NURSING' },
    { dutyDescription: null }, { sdPersonnelStatus: 'INACTIVE' }, { revision: -1 },
  ])('rejects a mismatched position %j', patch => {
    expect(() => requireCreatedPosition({ ...position, ...patch }, positionInput, [])).toThrow()
  })
  it.each([{ practitionerId: 'other' }, { organizationId: 'other' }, { code: 'OTHER' }, { sdEmploymentType: 'PERMANENT' },
    { primaryEmployment: true }, { hireDate: '2026-02-01' }, { leaveDate: null }, { sdPersonnelStatus: 'INACTIVE' },
  ])('rejects a mismatched employment %j', patch => {
    expect(() => requireCreatedEmployment({ ...employment, ...patch }, employmentInput, [])).toThrow()
  })
  it.each([{ practitionerId: 'other' }, { employmentId: 'other' }, { organizationId: 'other' }, { departmentId: 'other' },
    { positionId: 'other' }, { code: 'OTHER' }, { sdAssignmentType: 'PRIMARY' }, { specialtyCode: null }, { primaryAssignment: true },
    { workloadPercent: null }, { workloadPercent: 100 }, { validFrom: '2026-02-01' }, { validTo: null }, { sdPersonnelStatus: 'INACTIVE' },
  ])('rejects a mismatched assignment %j', patch => {
    expect(() => requireCreatedAssignment({ ...assignment, ...patch }, assignmentInput, 'person', [])).toThrow()
  })
  it('cannot report an already-known record as newly created', () => {
    expect(() => requireCreatedPosition(position, positionInput, requirePositions([position]))).toThrow()
    expect(() => requireCreatedEmployment(employment, employmentInput, requireEmployments([employment]))).toThrow()
    expect(() => requireCreatedAssignment(assignment, assignmentInput, 'person', requirePersonnelAssignments([assignment]))).toThrow()
  })
  it('accepts a reported null only for fields left unspecified, without filling a business default', () => {
    expect(requireCreatedAssignment({ ...assignment, specialtyCode: null, workloadPercent: null, validTo: null },
      { ...assignmentInput, specialtyCode: undefined, workloadPercent: undefined, validTo: undefined }, 'person', []).workloadPercent).toBeNull()
    expect(requireCreatedEmployment({ ...employment, leaveDate: null }, { ...employmentInput, leaveDate: undefined }, []).leaveDate).toBeNull()
  })
  it.each([null, {}, { id: 'unconfirmed' }])('does not synthesize a success result from partial receipts %j', source => {
    expect(() => requireUpdatedPractitioner(source, before, edit)).toThrow()
    expect(() => requirePractitionerStatus(source, before, 'INACTIVE')).toThrow()
    expect(() => requireCreatedPosition(source, positionInput, [])).toThrow()
    expect(() => requireCreatedEmployment(source, employmentInput, [])).toThrow()
    expect(() => requireCreatedAssignment(source, assignmentInput, 'person', [])).toThrow()
  })
})
