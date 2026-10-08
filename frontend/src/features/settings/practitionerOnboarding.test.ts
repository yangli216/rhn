import { describe, expect, it } from 'vitest'
import type { PractitionerOnboardingInput } from '../../shared/api/organizationApi'
import { requireOnboardedPractitioner } from './practitionerOnboarding'

const input: PractitionerOnboardingInput = { code: ' p001 ', fullName: ' 新医生 ', sdPractGender: 'UNKNOWN',
  organizationId: 'org', departmentId: 'dept', positionId: 'position', hireDate: '2026-10-03' }
const result = {
  practitioner: { id: 'person', revision: 0, code: 'P001', fullName: '新医生', sdPractGender: 'UNKNOWN', sdPersonnelStatus: 'ACTIVE' },
  employments: [{ id: 'employment', revision: 0, practitionerId: 'person', organizationId: 'org', code: 'EMP_person',
    sdEmploymentType: 'PERMANENT', primaryEmployment: true, hireDate: input.hireDate, sdPersonnelStatus: 'ACTIVE' }],
  assignments: [{ id: 'assignment', revision: 0, practitionerId: 'person', employmentId: 'employment', organizationId: 'org',
    departmentId: 'dept', positionId: 'position', code: 'ASN_person', sdAssignmentType: 'PRIMARY', primaryAssignment: true,
    workloadPercent: 100, validFrom: input.hireDate, sdPersonnelStatus: 'ACTIVE' }],
}

describe('atomic practitioner onboarding receipt', () => {
  it('accepts the exact persisted links without synthesizing missing records', () => {
    expect(requireOnboardedPractitioner(result, input)).toBe(result.practitioner)
  })
  it.each([null, {}, { ...result, employments: undefined }, { ...result, assignments: [] },
    { ...result, employments: [result.employments[0], result.employments[0]] },
  ])('rejects incomplete receipts %j', source => expect(() => requireOnboardedPractitioner(source, input)).toThrow(/未确认/))
  it.each([{ id: undefined }, { revision: '0' }, { code: 'OTHER' }, { fullName: '旧名称' },
    { sdPractGender: 'MALE' }, { sdPersonnelStatus: 'INACTIVE' }])('checks the practitioner %j', patch => {
    expect(() => requireOnboardedPractitioner({ ...result, practitioner: { ...result.practitioner, ...patch } }, input)).toThrow()
  })
  it.each([{ practitionerId: 'other' }, { organizationId: 'other' }, { code: 'other' }, { sdEmploymentType: 'CONTRACT' },
    { primaryEmployment: false }, { hireDate: '2026-10-04' }, { leaveDate: '2026-10-05' }, { sdPersonnelStatus: 'INACTIVE' }, { revision: -1 },
  ])('checks the employment %j', patch => {
    expect(() => requireOnboardedPractitioner({ ...result, employments: [{ ...result.employments[0], ...patch }] }, input)).toThrow()
  })
  it.each([{ employmentId: 'other' }, { practitionerId: 'other' }, { organizationId: 'other' }, { departmentId: 'other' },
    { positionId: 'other' }, { code: 'other' }, { sdAssignmentType: 'SECONDARY' }, { primaryAssignment: false },
    { workloadPercent: '100' }, { workloadPercent: 0 }, { validFrom: '2026-10-04' }, { validTo: '2026-10-05' },
    { sdPersonnelStatus: 'INACTIVE' }, { id: undefined },
  ])('checks the assignment %j', patch => {
    expect(() => requireOnboardedPractitioner({ ...result, assignments: [{ ...result.assignments[0], ...patch }] }, input)).toThrow()
  })
})
