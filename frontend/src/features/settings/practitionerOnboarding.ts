import type { Practitioner, PractitionerOnboardingInput } from '../../shared/api/organizationApi'

const fail = (): never => { throw new Error('人员入职结果未确认：人员、聘用或任职与提交内容不一致，请刷新目录核实') }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail()
const identity = (value: Record<string, unknown>) => typeof value.id === 'string' && value.id.trim()
  && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0

export function requireOnboardedPractitioner(source: unknown, input: PractitionerOnboardingInput): Practitioner {
  const result = record(source), person = record(result.practitioner)
  if (!identity(person) || person.code !== input.code.trim().toUpperCase() || person.fullName !== input.fullName.trim()
    || person.sdPractGender !== input.sdPractGender || person.sdPersonnelStatus !== 'ACTIVE'
    || !Array.isArray(result.employments) || result.employments.length !== 1
    || !Array.isArray(result.assignments) || result.assignments.length !== 1) return fail()
  const employment = record(result.employments[0]), assignment = record(result.assignments[0])
  if (!identity(employment) || employment.practitionerId !== person.id || employment.organizationId !== input.organizationId
    || employment.code !== `EMP_${person.id}` || employment.sdEmploymentType !== 'PERMANENT' || employment.primaryEmployment !== true
    || employment.hireDate !== input.hireDate || employment.leaveDate != null || employment.sdPersonnelStatus !== 'ACTIVE') return fail()
  if (!identity(assignment) || assignment.employmentId !== employment.id || assignment.practitionerId !== person.id
    || assignment.organizationId !== input.organizationId || assignment.departmentId !== input.departmentId || assignment.positionId !== input.positionId
    || assignment.code !== `ASN_${person.id}` || assignment.sdAssignmentType !== 'PRIMARY' || assignment.primaryAssignment !== true
    || assignment.workloadPercent !== 100 || assignment.validFrom !== input.hireDate || assignment.validTo != null
    || assignment.sdPersonnelStatus !== 'ACTIVE') return fail()
  return person as unknown as Practitioner
}
