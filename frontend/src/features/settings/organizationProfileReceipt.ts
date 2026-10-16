import type { OrganizationProfileInput, OrganizationProfileResult, OrganizationProfileSection, OrganizationUnit } from '../../shared/rhnApi'
import { requireOrganizationProfile } from './organizationProfileFacts'

const fail = (): never => { throw new Error('资料保存结果未确认：返回记录与本次提交不一致，请重新加载核实') }
const optional = (value?: string | null) => value?.trim() || null
function collections(profile: OrganizationProfileResult): Partial<Record<OrganizationProfileSection, ReadonlyArray<{ id: string }>>> {
  const shared = { contact: profile.contacts, relation: profile.relations, capability: profile.capabilities, responsibility: profile.responsibilities }
  return 'organization' in profile ? { ...shared, identifier: profile.identifiers, address: profile.addresses } : shared
}

function expectedRecord(input: OrganizationProfileInput, department: boolean): Record<string, unknown> {
  const common = { validFrom: input.validFrom, validTo: input.validTo ?? null, sdDetailStatus: 'ACTIVE' }
  switch (input.section) {
    case 'identifier':
      if (department) return fail()
      return { ...common, identifierSystem: input.identifierSystem.trim(), identifierCode: input.identifierCode.trim(),
        sdIdentifierType: input.sdIdentifierType.trim(), issuerOrganizationId: input.issuerOrganizationId ?? null,
        primaryIdentifier: input.primaryIdentifier, sdVerifyStatus: input.sdVerifyStatus.trim() }
    case 'contact': return { ...common, sdContactType: input.sdContactType.trim(), contactValue: input.contactValue.trim(),
      sdContactUse: input.sdContactUse.trim(), primaryContact: input.primaryContact, sortOrder: input.sortOrder }
    case 'address':
      if (department) return fail()
      return { ...common, sdAddressType: input.sdAddressType.trim(), countryCode: input.countryCode.trim(),
        provinceCode: optional(input.provinceCode), cityCode: optional(input.cityCode), districtCode: optional(input.districtCode),
        streetAddress: input.streetAddress.trim(), postalCode: optional(input.postalCode) }
    case 'relation': return { ...common, [department ? 'targetDepartmentId' : 'targetOrganizationId']: input.targetOrganizationId,
      sdRelationType: input.sdRelationType.trim(), primaryRelation: input.primaryRelation, description: optional(input.description) }
    case 'capability': return { ...common, sdCapabilityType: input.sdCapabilityType.trim(), qualificationBasisCode: optional(input.qualificationBasisCode),
      capabilityScope: optional(input.capabilityScope), sdVerifyStatus: input.sdVerifyStatus.trim() }
    case 'responsibility': {
      const name = optional(input.externalResponsibleName)
      if (Boolean(input.assignmentId) === Boolean(name)) return fail()
      return { ...common, assignmentId: input.assignmentId ?? null, ...(name ? { responsibleName: name } : {}),
        sdResponsibilityType: input.sdResponsibilityType.trim(), primaryResponsibility: input.primaryResponsibility }
    }
  }
}

function matches(item: { id: string }, expected: Record<string, unknown>) {
  const row = item as unknown as Record<string, unknown>
  return Object.entries(expected).every(([key, value]) => (row[key] ?? null) === value)
}

export function assertNewProfileItem(before: OrganizationProfileResult, unit: OrganizationUnit, input: OrganizationProfileInput): void {
  const current = collections(requireOrganizationProfile(before, unit)), expected = expectedRecord(input, unit.sdOrgKind === 'ORG_UNIT')
  if (current[input.section]?.some(item => matches(item, expected))) {
    throw new Error('档案中已有与本次输入一致的记录，请核实保存结果，未重复提交')
  }
}

export function requireCreatedProfileItem(source: unknown, unit: OrganizationUnit, before: OrganizationProfileResult,
  input: OrganizationProfileInput): OrganizationProfileResult {
  const previous = collections(requireOrganizationProfile(before, unit))
  const next = requireOrganizationProfile(source, unit), after = collections(next)
  // A response containing a new entry must not silently discard the previously confirmed records.
  for (const section of Object.keys(previous) as OrganizationProfileSection[]) {
    const ids = new Set(after[section]?.map(item => item.id))
    if (previous[section]!.some(item => !ids.has(item.id))) return fail()
  }
  const expected = expectedRecord(input, unit.sdOrgKind === 'ORG_UNIT')
  const oldIds = new Set(previous[input.section]?.map(item => item.id))
  const matching = after[input.section]?.filter(item => {
    if (oldIds.has(item.id)) return false
    return matches(item, expected)
  })
  if (matching?.length !== 1) return fail()
  return next
}

export function requireUpdatedProfileItem(source: unknown, unit: OrganizationUnit, before: OrganizationProfileResult,
  id: string, input: OrganizationProfileInput, status: string, expectedRevision: number): OrganizationProfileResult {
  const previous = collections(requireOrganizationProfile(before, unit))
  const next = requireOrganizationProfile(source, unit), after = collections(next)
  const owner = 'department' in next ? next.department : next.organization
  if (owner.revision <= expectedRevision) return fail()
  for (const section of Object.keys(previous) as OrganizationProfileSection[]) {
    if (after[section]?.length !== previous[section]?.length || previous[section]!.some(item => !after[section]?.some(row => row.id === item.id))) return fail()
  }
  const record = after[input.section]?.find(item => item.id === id)
  if (!record || !matches(record, { ...expectedRecord(input, unit.sdOrgKind === 'ORG_UNIT'), sdDetailStatus: status })) return fail()
  return next
}

export function requireMaintainedProfile(source: unknown, unit: OrganizationUnit, before: OrganizationProfileResult,
  changes: Array<{ id?: string; input: OrganizationProfileInput; status: string }>): OrganizationProfileResult {
  const previous = collections(requireOrganizationProfile(before, unit))
  const next = requireOrganizationProfile(source, unit), after = collections(next)
  const owner = 'department' in next ? next.department : next.organization
  if (owner.revision <= unit.revision) return fail()
  for (const section of Object.keys(previous) as OrganizationProfileSection[]) {
    const newCount = changes.filter(row => row.input.section === section && !row.id).length
    if (after[section]?.length !== previous[section]!.length + newCount
      || previous[section]!.some(item => !after[section]?.some(row => row.id === item.id))) return fail()
  }
  const matched = new Set<string>()
  for (const change of changes) {
    const oldIds = new Set(previous[change.input.section]?.map(item => item.id))
    const candidates = after[change.input.section]?.filter(row => change.id ? row.id === change.id : !oldIds.has(row.id) && !matched.has(`${change.input.section}:${row.id}`))
      .filter(row => matches(row, { ...expectedRecord(change.input, unit.sdOrgKind === 'ORG_UNIT'), sdDetailStatus: change.status }))
    if (candidates?.length !== 1) return fail()
    matched.add(`${change.input.section}:${candidates[0].id}`)
  }
  return next
}
