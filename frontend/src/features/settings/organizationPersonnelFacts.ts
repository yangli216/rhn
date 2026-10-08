import { z } from 'zod'
import type { Employment, OrganizationUnit, PersonnelAssignment, Position, Practitioner, PractitionerDetail } from '../../shared/rhnApi'
import { isIsoInstant } from '../../shared/validation/instant'

const text = z.string().refine(value => value.trim().length > 0)
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const date = z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
const status = z.enum(['ACTIVE', 'INACTIVE'])
const gender = z.enum(['MALE', 'FEMALE', 'UNKNOWN'])
const positionType = z.enum(['CLINICAL', 'NURSING', 'PHARMACY', 'MEDICAL_TECHNOLOGY', 'ADMINISTRATIVE'])
const identity = { id: text, revision, code: text }
const practitionerSchema = z.object({ ...identity, fullName: text, sdPractGender: gender, sdPractGenderText: text,
  sdPersonnelStatus: status, sdPersonnelStatusText: text, createdAt: z.string().refine(isIsoInstant), updatedAt: z.string().refine(isIsoInstant),
}).passthrough()
const employmentSchema = z.object({ ...identity, practitionerId: text, organizationId: text, organizationName: text,
  sdEmploymentType: z.enum(['PERMANENT', 'CONTRACT', 'DISPATCHED', 'TEMPORARY']), sdEmploymentTypeText: text,
  primaryEmployment: z.boolean(), hireDate: date, leaveDate: date.nullish(), sdPersonnelStatus: status, sdPersonnelStatusText: text,
}).passthrough().refine(value => !value.leaveDate || value.leaveDate >= value.hireDate)
const assignmentSchema = z.object({ ...identity, employmentId: text, practitionerId: text, practitionerCode: text,
  practitionerName: text, sdPractGender: gender, organizationId: text, organizationName: text, departmentId: text, departmentName: text,
  positionId: text, positionName: text, sdPositionType: positionType, sdPositionTypeText: text,
  sdAssignmentType: z.enum(['PRIMARY', 'PART_TIME', 'SECONDMENT', 'ROTATION']), sdAssignmentTypeText: text,
  primaryAssignment: z.boolean(), workloadPercent: z.number().min(0).max(100).nullish(),
  sdPersonnelStatus: status, sdPersonnelStatusText: text, validFrom: date, validTo: date.nullish(),
}).passthrough().refine(value => !value.validTo || value.validTo >= value.validFrom)
const positionSchema = z.object({ ...identity, name: text, sdPositionType: positionType, sdPositionTypeText: text,
  sdPersonnelStatus: status, sdPersonnelStatusText: text,
}).passthrough()
const unitSchema = z.object({ ...identity, name: text, parentId: text.nullish(),
  sdOrgKind: z.enum(['LEGAL_ORGANIZATION', 'ORG_UNIT']), sdOrgKindText: text,
  sdOrgType: z.enum(['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC', 'CAMPUS',
    'CLINICAL_DEPARTMENT', 'ADMINISTRATIVE_DEPARTMENT', 'MEDICAL_TECHNOLOGY_DEPARTMENT', 'NURSING_UNIT']), sdOrgTypeText: text,
  sdOrgStatus: z.enum(['DRAFT', 'PENDING_ACTIVE', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'MERGED']), sdOrgStatusText: text,
  virtual: z.boolean(), sortOrder: z.number().int().nonnegative(), validFrom: date, validTo: date.nullish(),
  createdAt: z.string().refine(isIsoInstant), updatedAt: z.string().refine(isIsoInstant),
}).passthrough().refine(value => !value.validTo || value.validTo >= value.validFrom)

const fail = (name: string): never => { throw new Error(`${name}返回不完整或关联不一致，请重新加载核实`) }
function list<T extends { id: string }>(source: unknown, schema: z.ZodType<T>, name: string): T[] {
  const result = z.array(schema).safeParse(source)
  if (!result.success || new Set(result.data.map(value => value.id)).size !== result.data.length) return fail(name)
  return result.data
}
export const requirePractitioners = (source: unknown): Practitioner[] => list(source, practitionerSchema, '人员目录')
export const requirePersonnelAssignments = (source: unknown): PersonnelAssignment[] => list(source, assignmentSchema, '任职目录')
export const requirePositions = (source: unknown): Position[] => list(source, positionSchema, '岗位目录')
export const requireEmployments = (source: unknown): Employment[] => list(source, employmentSchema, '聘用目录')
export const requireOrganizationUnit = (source: unknown): OrganizationUnit => list([source], unitSchema, '组织档案')[0]
export function requireOrganizationUnits(source: unknown): OrganizationUnit[] {
  const units = list(source, unitSchema, '组织目录'), byId = new Map(units.map(unit => [unit.id, unit]))
  for (const unit of units) {
    const seen = new Set([unit.id])
    let current = unit
    while (current.parentId) {
      const parent = byId.get(current.parentId)
      if (!parent || seen.has(parent.id) || (current.sdOrgKind === 'LEGAL_ORGANIZATION' && parent.sdOrgKind !== 'LEGAL_ORGANIZATION')) return fail('组织目录')
      seen.add(parent.id); current = parent
    }
    if (current.sdOrgKind !== 'LEGAL_ORGANIZATION') return fail('组织目录')
  }
  return units
}
export function requirePractitionerDetail(source: unknown, id: string): PractitionerDetail {
  const result = z.object({ practitioner: practitionerSchema, employments: z.array(employmentSchema), assignments: z.array(assignmentSchema) }).safeParse(source)
  if (!result.success || result.data.practitioner.id !== id) return fail('人员档案')
  const { practitioner, employments, assignments } = result.data
  if (new Set(employments.map(item => item.id)).size !== employments.length || new Set(assignments.map(item => item.id)).size !== assignments.length
    || employments.some(item => item.practitionerId !== id)) return fail('人员档案')
  for (const item of assignments) {
    const employment = employments.find(value => value.id === item.employmentId)
    if (!employment || item.practitionerId !== id || item.practitionerCode !== practitioner.code || item.practitionerName !== practitioner.fullName
      || item.sdPractGender !== practitioner.sdPractGender || item.organizationId !== employment.organizationId
      || item.validFrom < employment.hireDate || (employment.leaveDate && (!item.validTo || item.validTo > employment.leaveDate))) return fail('人员档案')
  }
  return result.data
}

/** Multiple main relationships can exist over time or across departments; never pick an arbitrary first record. */
export function onlyPrimary<T extends Employment | PersonnelAssignment>(values: T[], kind: 'employment' | 'assignment'): T | undefined {
  const matches = values.filter(value => kind === 'employment' ? (value as Employment).primaryEmployment : (value as PersonnelAssignment).primaryAssignment)
  return matches.length === 1 ? matches[0] : undefined
}
