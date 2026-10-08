import type { AssignmentInput, Employment, EmploymentInput, PersonnelAssignment, PersonnelStatus, Position, Practitioner, PractitionerGender, RhnApi } from '../../shared/rhnApi'
import { requireEmployments, requirePersonnelAssignments, requirePositions, requirePractitioners } from './organizationPersonnelFacts'

export type PositionInput = Parameters<RhnApi['organization']['createPosition']>[0]
const fail = (): never => { throw new Error('人员维护结果未确认：返回记录与本次提交不一致，请重新加载核实') }
const optional = (value: unknown) => value == null ? null : value
const normalizedText = (value?: string) => value?.trim() || null
const newIdentity = (id: string, existing: Array<{ id: string }>) => !existing.some(item => item.id === id)

function unchangedIdentity(next: Practitioner, before: Practitioner) {
  return next.id === before.id && next.code === before.code && next.createdAt === before.createdAt
    && next.revision > before.revision && Date.parse(next.updatedAt) >= Date.parse(before.updatedAt)
}
export function requireUpdatedPractitioner(source: unknown, before: Practitioner, input: { fullName: string; sdPractGender: PractitionerGender }): Practitioner {
  const next = requirePractitioners([source])[0]
  if (!unchangedIdentity(next, before) || next.fullName !== input.fullName.trim() || next.sdPractGender !== input.sdPractGender
    || next.sdPersonnelStatus !== before.sdPersonnelStatus) return fail()
  return next
}
export function requirePractitionerStatus(source: unknown, before: Practitioner, target: PersonnelStatus): Practitioner {
  const next = requirePractitioners([source])[0]
  if (!unchangedIdentity(next, before) || next.fullName !== before.fullName || next.sdPractGender !== before.sdPractGender
    || next.sdPersonnelStatus !== target) return fail()
  return next
}
export function requireCreatedPosition(source: unknown, input: PositionInput, existing: Position[]): Position {
  const next = requirePositions([source])[0]
  if (!newIdentity(next.id, existing) || next.code !== input.code.trim().toUpperCase() || next.name !== input.name.trim()
    || next.sdPositionType !== input.sdPositionType || optional(next.dutyDescription) !== normalizedText(input.dutyDescription)
    || next.sdPersonnelStatus !== 'ACTIVE') return fail()
  return next
}
export function requireCreatedEmployment(source: unknown, input: EmploymentInput, existing: Employment[]): Employment {
  const next = requireEmployments([source])[0]
  if (!newIdentity(next.id, existing) || next.practitionerId !== input.practitionerId || next.organizationId !== input.organizationId
    || next.code !== input.code.trim().toUpperCase() || next.sdEmploymentType !== input.sdEmploymentType
    || next.primaryEmployment !== input.primaryEmployment || next.hireDate !== input.hireDate
    || optional(next.leaveDate) !== optional(input.leaveDate) || next.sdPersonnelStatus !== 'ACTIVE') return fail()
  return next
}
export function requireCreatedAssignment(source: unknown, input: AssignmentInput, practitionerId: string, existing: PersonnelAssignment[]): PersonnelAssignment {
  const next = requirePersonnelAssignments([source])[0]
  if (!newIdentity(next.id, existing) || next.practitionerId !== practitionerId || next.employmentId !== input.employmentId
    || next.organizationId !== input.organizationId || next.departmentId !== input.departmentId || next.positionId !== input.positionId
    || next.code !== input.code.trim().toUpperCase() || next.sdAssignmentType !== input.sdAssignmentType
    || optional(next.specialtyCode) !== normalizedText(input.specialtyCode) || next.primaryAssignment !== input.primaryAssignment
    || optional(next.workloadPercent) !== optional(input.workloadPercent) || next.validFrom !== input.validFrom
    || optional(next.validTo) !== optional(input.validTo) || next.sdPersonnelStatus !== 'ACTIVE') return fail()
  return next
}
