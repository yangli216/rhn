import type { OrganizationProfileInput, OrganizationProfileResult, OrganizationProfileSection } from '../../shared/rhnApi'
export type ProfileRecordEdit = { id: string; input: OrganizationProfileInput; status: string }
export const PROFILE_SECTIONS: Record<OrganizationProfileSection, string> = { contact: '联系方式', responsibility: '负责人',
  address: '地址', identifier: '机构标识', capability: '服务能力', relation: '协作关系' }
export function profileRecords(profile: OrganizationProfileResult): Array<ProfileRecordEdit & { summary: string; type: string }> {
  const common = (r: { id: string; sdDetailStatus: string }) => ({ id: r.id, status: r.sdDetailStatus })
  return [
    ...profile.contacts.map(r => ({ ...common(r), summary: r.contactValue, type: `${r.sdContactTypeText} · ${r.sdContactUseText}${r.primaryContact ? ' · 主要' : ''}`,
      input: { section: 'contact' as const, sdContactType: r.sdContactType, contactValue: r.contactValue, sdContactUse: r.sdContactUse,
        primaryContact: r.primaryContact, sortOrder: r.sortOrder, validFrom: r.validFrom, validTo: r.validTo ?? undefined } })),
    ...profile.capabilities.map(r => ({ ...common(r), summary: r.capabilityScope || r.sdCapabilityTypeText, type: `${r.sdCapabilityTypeText} · ${r.sdVerifyStatusText}`,
      input: { section: 'capability' as const, sdCapabilityType: r.sdCapabilityType, qualificationBasisCode: r.qualificationBasisCode ?? undefined,
        capabilityScope: r.capabilityScope ?? undefined, sdVerifyStatus: r.sdVerifyStatus, validFrom: r.validFrom, validTo: r.validTo ?? undefined } })),
    ...profile.responsibilities.map(r => ({ ...common(r), summary: r.responsibleName, type: `${r.sdResponsibilityTypeText}${r.primaryResponsibility ? ' · 主要' : ''}`,
      input: { section: 'responsibility' as const, assignmentId: r.assignmentId ?? undefined,
        externalResponsibleName: r.assignmentId ? undefined : r.responsibleName, sdResponsibilityType: r.sdResponsibilityType,
        primaryResponsibility: r.primaryResponsibility, validFrom: r.validFrom, validTo: r.validTo ?? undefined } })),
    ...profile.relations.map(r => ({ ...common(r), summary: 'targetDepartmentName' in r ? r.targetDepartmentName : r.targetOrganizationName, type: `${r.sdRelationTypeText}${r.primaryRelation ? ' · 主要' : ''}`,
      input: { section: 'relation' as const, targetOrganizationId: 'targetDepartmentId' in r ? r.targetDepartmentId : r.targetOrganizationId,
        sdRelationType: r.sdRelationType, primaryRelation: r.primaryRelation, description: r.description ?? undefined, validFrom: r.validFrom, validTo: r.validTo ?? undefined } })),
    ...('organization' in profile ? profile.identifiers.map(r => ({ ...common(r), summary: r.identifierCode, type: `${r.sdIdentifierTypeText} · ${r.sdVerifyStatusText}${r.primaryIdentifier ? ' · 主要' : ''}`,
      input: { section: 'identifier' as const, identifierSystem: r.identifierSystem, identifierCode: r.identifierCode, sdIdentifierType: r.sdIdentifierType,
        issuerOrganizationId: r.issuerOrganizationId ?? undefined, primaryIdentifier: r.primaryIdentifier, sdVerifyStatus: r.sdVerifyStatus,
        validFrom: r.validFrom, validTo: r.validTo ?? undefined } })) : []),
    ...('organization' in profile ? profile.addresses.map(r => ({ ...common(r), summary: r.streetAddress, type: r.sdAddressTypeText,
      input: { section: 'address' as const, sdAddressType: r.sdAddressType, countryCode: r.countryCode,
        provinceCode: r.provinceCode ?? undefined, cityCode: r.cityCode ?? undefined, districtCode: r.districtCode ?? undefined,
        streetAddress: r.streetAddress, postalCode: r.postalCode ?? undefined, validFrom: r.validFrom, validTo: r.validTo ?? undefined } })) : []),
  ]
}
