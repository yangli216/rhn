import type { OrganizationStatus, OrganizationUnit, OrganizationUnitInput } from '../../shared/rhnApi'
import { requireOrganizationUnit, requireOrganizationUnits } from './organizationPersonnelFacts'

export type UnitUpdate = Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'>
const optional = (value: unknown) => value == null ? null : value
const text = (value?: string | null) => value?.trim() || null
const fail = (): never => { throw new Error('组织保存结果未确认：返回节点与本次提交不一致，请重新加载核实') }

/** Compatibility projection used by Department.structuralType; this is not a department type default. */
export function departmentStructure(property?: string | null): OrganizationUnit['sdOrgType'] {
  switch (property) {
    case 'ADMINISTRATIVE': return 'ADMINISTRATIVE_DEPARTMENT'
    case 'MEDICAL_TECHNOLOGY': return 'MEDICAL_TECHNOLOGY_DEPARTMENT'
    case 'NURSING': return 'NURSING_UNIT'
    default: return 'CLINICAL_DEPARTMENT'
  }
}
export function departmentOwner(id: string | undefined, units: OrganizationUnit[]): string | undefined {
  let node = units.find(item => item.id === id)
  const seen = new Set<string>()
  while (node && node.sdOrgKind !== 'LEGAL_ORGANIZATION') {
    if (seen.has(node.id)) return undefined
    seen.add(node.id); node = units.find(item => item.id === node?.parentId)
  }
  return node?.id
}
export function unitUpdateCommand(before: OrganizationUnit, input: UnitUpdate, units: OrganizationUnit[]): UnitUpdate & { expectedRevision: number } {
  if (before.sdOrgKind === 'ORG_UNIT') {
    const owner = departmentOwner(before.id, units)
    if (!owner || departmentOwner(input.parentId, units) !== owner) throw new Error('科室上级必须属于原机构，请重新核实组织目录')
    return { ...input, parentId: input.parentId === owner ? undefined : input.parentId, expectedRevision: before.revision }
  }
  return { ...input, expectedRevision: before.revision }
}
function matches(next: OrganizationUnit, input: UnitUpdate, kind: OrganizationUnit['sdOrgKind']) {
  return optional(next.parentId) === optional(input.parentId) && next.name === input.name.trim()
    && optional(next.shortName) === text(input.shortName) && optional(next.description) === text(input.description)
    && next.sdOrgType === input.sdOrgType && next.virtual === input.virtual && next.sortOrder === input.sortOrder
    && next.validFrom === input.validFrom && optional(next.validTo) === optional(input.validTo)
    && (kind === 'LEGAL_ORGANIZATION'
      ? optional(next.sdOrgProperty) === text(input.sdOrgProperty) && optional(next.timezoneCode) === text(input.timezoneCode)
      : optional(next.sdDepartmentProperty) === text(input.sdDepartmentProperty) && optional(next.sdDepartmentType) === text(input.sdDepartmentType))
}
function identity(next: OrganizationUnit, before: OrganizationUnit) {
  return next.id === before.id && next.code === before.code && next.sdOrgKind === before.sdOrgKind
    && next.createdAt === before.createdAt && next.revision > before.revision
    && Date.parse(next.updatedAt) >= Date.parse(before.updatedAt) && optional(next.mergedToId) === optional(before.mergedToId)
}
function validTree(next: OrganizationUnit, existing: OrganizationUnit[]) {
  requireOrganizationUnits([...existing.filter(item => item.id !== next.id), next])
  return next
}
export function requireCreatedUnit(source: unknown, input: OrganizationUnitInput, existing: OrganizationUnit[]): OrganizationUnit {
  const next = requireOrganizationUnit(source)
  if (existing.some(item => item.id === next.id) || next.code !== input.code.trim().toUpperCase()
    || next.sdOrgKind !== input.sdOrgKind || next.sdOrgStatus !== 'ACTIVE' || next.mergedToId
    || !matches(next, input, input.sdOrgKind)) return fail()
  return validTree(next, existing)
}
export function requireUpdatedUnit(source: unknown, before: OrganizationUnit, input: UnitUpdate, existing: OrganizationUnit[]): OrganizationUnit {
  const next = requireOrganizationUnit(source)
  if (!identity(next, before) || next.sdOrgStatus !== before.sdOrgStatus || !matches(next, input, before.sdOrgKind)) return fail()
  return validTree(next, existing)
}
export function requireUnitStatus(source: unknown, before: OrganizationUnit, target: OrganizationStatus): OrganizationUnit {
  const next = requireOrganizationUnit(source)
  const fields = ['parentId', 'name', 'shortName', 'description', 'sdOrgType', 'sdOrgProperty', 'sdDepartmentProperty',
    'sdDepartmentType', 'timezoneCode', 'virtual', 'sortOrder', 'validFrom', 'validTo'] as const
  if (!identity(next, before) || next.sdOrgStatus !== target || fields.some(key => optional(next[key]) !== optional(before[key]))) return fail()
  return next
}
