import type { ApiClient } from './httpClient'

export type OrganizationKind = 'LEGAL_ORGANIZATION' | 'ORG_UNIT'
export type OrganizationType = 'TOWNSHIP_HEALTH_CENTER' | 'COMMUNITY_HEALTH_CENTER' | 'HOSPITAL' | 'CLINIC'
  | 'CAMPUS' | 'CLINICAL_DEPARTMENT' | 'ADMINISTRATIVE_DEPARTMENT'
  | 'MEDICAL_TECHNOLOGY_DEPARTMENT' | 'NURSING_UNIT'
export type OrganizationStatus = 'DRAFT' | 'PENDING_ACTIVE' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'MERGED'
export type PractitionerGender = 'MALE' | 'FEMALE' | 'UNKNOWN'
export type PersonnelStatus = 'ACTIVE' | 'INACTIVE'
export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'DISPATCHED' | 'TEMPORARY'
export type PositionType = 'CLINICAL' | 'NURSING' | 'PHARMACY' | 'MEDICAL_TECHNOLOGY' | 'ADMINISTRATIVE'
export type AssignmentType = 'PRIMARY' | 'PART_TIME' | 'SECONDMENT' | 'ROTATION'

export const ORGANIZATION_SYSTEM_ENUM = {
  kind: 'ORG_KIND', type: 'ORG_TYPE', status: 'ORG_STATUS', gender: 'PRACT_GENDER',
  personnelStatus: 'PERSONNEL_STATUS', employmentType: 'EMPLOYMENT_TYPE',
  positionType: 'POSITION_TYPE', assignmentType: 'ASSIGNMENT_TYPE',
} as const

export const ORGANIZATION_DICTIONARY = {
  property: 'ORG_PROPERTY', departmentType: 'DEPT_TYPE', departmentProperty: 'DEPT_PROPERTY',
  identifierType: 'ORG_IDENTIFIER_TYPE',
  contactType: 'ORG_CONTACT_TYPE', contactUse: 'ORG_CONTACT_USE', addressType: 'ORG_ADDRESS_TYPE',
  relationType: 'ORG_RELATION_TYPE', capabilityType: 'ORG_CAPABILITY_TYPE',
  responsibilityType: 'ORG_RESPONSIBILITY_TYPE', verifyStatus: 'ORG_VERIFY_STATUS',
  departmentRelationType: 'DEPT_RELATION_TYPE', departmentCapabilityType: 'DEPT_CAPABILITY_TYPE',
  departmentResponsibilityType: 'DEPT_RESPONSIBILITY_TYPE',
} as const

export interface OrganizationUnit {
  id: string
  revision: number
  parentId?: string | null
  mergedToId?: string | null
  code: string
  name: string
  shortName?: string | null
  description?: string | null
  sdOrgKind: OrganizationKind
  sdOrgKindText: string
  sdOrgType: OrganizationType
  sdOrgTypeText: string
  sdOrgStatus: OrganizationStatus
  sdOrgStatusText: string
  sdOrgProperty?: string | null
  sdOrgPropertyText?: string | null
  virtual: boolean
  sortOrder: number
  timezoneCode?: string | null
  sdDepartmentType?: string | null
  sdDepartmentTypeText?: string | null
  sdDepartmentProperty?: string | null
  sdDepartmentPropertyText?: string | null
  validFrom: string
  validTo?: string | null
  createdAt: string
  updatedAt: string
}

export interface Department {
  id: string
  revision: number
  organizationId: string
  parentId?: string | null
  mergedToId?: string | null
  code: string
  name: string
  shortName?: string | null
  description?: string | null
  sdDepartmentType: string
  sdDepartmentTypeText: string
  sdDepartmentProperty: string
  sdDepartmentPropertyText: string
  sdOrgType: OrganizationType
  sdOrgTypeText: string
  virtual: boolean
  sortOrder: number
  sdOrgStatus: OrganizationStatus
  sdOrgStatusText: string
  validFrom: string
  validTo?: string | null
  createdAt: string
  updatedAt: string
}

export interface Practitioner {
  id: string
  revision: number
  code: string
  fullName: string
  sdPractGender: PractitionerGender
  sdPractGenderText: string
  sdPersonnelStatus: PersonnelStatus
  sdPersonnelStatusText: string
  createdAt: string
  updatedAt: string
}

export interface Employment {
  id: string
  revision: number
  practitionerId: string
  organizationId: string
  organizationName: string
  code: string
  sdEmploymentType: EmploymentType
  sdEmploymentTypeText: string
  primaryEmployment: boolean
  hireDate: string
  leaveDate?: string | null
  sdPersonnelStatus: PersonnelStatus
  sdPersonnelStatusText: string
}

export interface Position {
  id: string
  revision: number
  code: string
  name: string
  sdPositionType: PositionType
  sdPositionTypeText: string
  dutyDescription?: string | null
  sdPersonnelStatus: PersonnelStatus
  sdPersonnelStatusText: string
}

export interface PersonnelAssignment {
  id: string
  revision: number
  employmentId: string
  organizationId: string
  organizationName: string
  departmentId: string
  departmentName: string
  positionId: string
  positionName: string
  sdPositionType: PositionType
  sdPositionTypeText: string
  code: string
  sdAssignmentType: AssignmentType
  sdAssignmentTypeText: string
  specialtyCode?: string | null
  primaryAssignment: boolean
  workloadPercent?: number | null
  sdPersonnelStatus: PersonnelStatus
  sdPersonnelStatusText: string
  validFrom: string
  validTo?: string | null
}

export interface PractitionerDetail {
  practitioner: Practitioner
  employments: Employment[]
  assignments: PersonnelAssignment[]
}

export interface OrganizationUnitInput {
  organizationId?: string
  parentId?: string
  code: string
  name: string
  shortName?: string
  description?: string
  sdOrgKind: OrganizationKind
  sdOrgType: OrganizationType
  sdOrgProperty?: string
  sdDepartmentProperty?: string
  virtual: boolean
  sortOrder: number
  timezoneCode?: string
  sdDepartmentType?: string
  validFrom: string
  validTo?: string
}

export interface OrganizationProfile {
  organization: OrganizationUnit
  identifiers: OrganizationIdentifier[]
  contacts: OrganizationContact[]
  addresses: OrganizationAddress[]
  relations: OrganizationRelation[]
  capabilities: OrganizationCapability[]
  responsibilities: OrganizationResponsibility[]
}

export interface DepartmentProfile {
  department: Department
  contacts: OrganizationContact[]
  relations: DepartmentRelation[]
  capabilities: OrganizationCapability[]
  responsibilities: OrganizationResponsibility[]
}

export type OrganizationProfileResult = OrganizationProfile | DepartmentProfile

export interface OrganizationIdentifier {
  id: string; identifierSystem: string; identifierCode: string; sdIdentifierType: string
  sdIdentifierTypeText: string; issuerOrganizationId?: string | null; primaryIdentifier: boolean
  validFrom: string; validTo?: string | null; sdVerifyStatus: string; sdVerifyStatusText: string
  sdDetailStatus: string; sdDetailStatusText: string
}

export interface OrganizationContact {
  id: string; sdContactType: string; sdContactTypeText: string; contactValue: string
  sdContactUse: string; sdContactUseText: string; primaryContact: boolean; sortOrder: number
  validFrom: string; validTo?: string | null; sdDetailStatus: string; sdDetailStatusText: string
}

export interface OrganizationAddress {
  id: string; sdAddressType: string; sdAddressTypeText: string; countryCode: string
  provinceCode?: string | null; cityCode?: string | null; districtCode?: string | null
  streetAddress: string; postalCode?: string | null; validFrom: string; validTo?: string | null
  sdDetailStatus: string; sdDetailStatusText: string
}

export interface OrganizationRelation {
  id: string; targetOrganizationId: string; targetOrganizationName: string
  sdRelationType: string; sdRelationTypeText: string; primaryRelation: boolean
  description?: string | null; validFrom: string; validTo?: string | null
  sdDetailStatus: string; sdDetailStatusText: string
}

export interface DepartmentRelation {
  id: string; targetDepartmentId: string; targetDepartmentName: string
  sdRelationType: string; sdRelationTypeText: string; primaryRelation: boolean
  description?: string | null; validFrom: string; validTo?: string | null
  sdDetailStatus: string; sdDetailStatusText: string
}

export interface OrganizationCapability {
  id: string; sdCapabilityType: string; sdCapabilityTypeText: string
  qualificationBasisCode?: string | null; capabilityScope?: string | null
  validFrom: string; validTo?: string | null; sdVerifyStatus: string; sdVerifyStatusText: string
  sdDetailStatus: string; sdDetailStatusText: string
}

export interface OrganizationResponsibility {
  id: string; assignmentId?: string | null; responsibleName: string
  sdResponsibilityType: string; sdResponsibilityTypeText: string; primaryResponsibility: boolean
  validFrom: string; validTo?: string | null; sdDetailStatus: string; sdDetailStatusText: string
}

export type OrganizationProfileSection = 'identifier' | 'contact' | 'address' | 'relation' | 'capability' | 'responsibility'

export type OrganizationProfileInput =
  | { section: 'identifier'; identifierSystem: string; identifierCode: string; sdIdentifierType: string; issuerOrganizationId?: string; primaryIdentifier: boolean; validFrom: string; validTo?: string; sdVerifyStatus: string }
  | { section: 'contact'; sdContactType: string; contactValue: string; sdContactUse: string; primaryContact: boolean; sortOrder: number; validFrom: string; validTo?: string }
  | { section: 'address'; sdAddressType: string; countryCode: string; provinceCode?: string; cityCode?: string; districtCode?: string; streetAddress: string; postalCode?: string; validFrom: string; validTo?: string }
  | { section: 'relation'; targetOrganizationId: string; sdRelationType: string; primaryRelation: boolean; description?: string; validFrom: string; validTo?: string }
  | { section: 'capability'; sdCapabilityType: string; qualificationBasisCode?: string; capabilityScope?: string; validFrom: string; validTo?: string; sdVerifyStatus: string }
  | { section: 'responsibility'; assignmentId?: string; externalResponsibleName?: string; sdResponsibilityType: string; primaryResponsibility: boolean; validFrom: string; validTo?: string }

export interface EmploymentInput {
  practitionerId: string
  organizationId: string
  code: string
  sdEmploymentType: EmploymentType
  primaryEmployment: boolean
  hireDate: string
  leaveDate?: string
}

export interface AssignmentInput {
  employmentId: string
  organizationId: string
  departmentId: string
  positionId: string
  code: string
  sdAssignmentType: AssignmentType
  specialtyCode?: string
  primaryAssignment: boolean
  workloadPercent?: number
  validFrom: string
  validTo?: string
}

export function createOrganizationApi(client: ApiClient) {
  return {
    tree: () => client.request<OrganizationUnit[]>('/api/platform/organization-units'),
    profile: async (unit: Pick<OrganizationUnit, 'id' | 'sdOrgKind'>): Promise<OrganizationProfileResult> => unit.sdOrgKind === 'ORG_UNIT'
      ? client.request<DepartmentProfile>(`/api/platform/departments/${unit.id}`)
      : client.request<OrganizationProfile>(`/api/platform/organization-units/${unit.id}`),
    list: () => client.request<OrganizationUnit[]>('/api/platform/organizations'),
    departments: (organizationId: string) => client.request<Department[]>(
      `/api/platform/departments?organizationId=${encodeURIComponent(organizationId)}`,
    ),
    createUnit: (input: OrganizationUnitInput) => client.request<OrganizationUnit>(
      '/api/platform/organization-units', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateUnit: (id: string, input: Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'> & { expectedRevision: number }) =>
      client.request<OrganizationUnit>(`/api/platform/organization-units/${id}`,
        { method: 'PUT', body: JSON.stringify(input) }),
    changeUnitStatus: (id: string, expectedRevision: number, sdOrgStatus: OrganizationStatus) =>
      client.request<OrganizationUnit>(`/api/platform/organization-units/${id}/status`,
        { method: 'POST', body: JSON.stringify({ expectedRevision, sdOrgStatus }) }),
    addProfileItem: (unit: Pick<OrganizationUnit, 'id' | 'sdOrgKind'>, input: OrganizationProfileInput) => {
      const paths: Record<OrganizationProfileSection, string> = {
        identifier: 'identifiers', contact: 'contacts', address: 'addresses', relation: 'relations',
        capability: 'capabilities', responsibility: 'responsibilities',
      }
      const { section, ...plainBody } = input
      const department = unit.sdOrgKind === 'ORG_UNIT'
      if (department && (section === 'identifier' || section === 'address')) {
        throw new Error('科室不维护机构标识或机构地址')
      }
      const body = department && input.section === 'relation'
        ? { ...plainBody, targetDepartmentId: input.targetOrganizationId, targetOrganizationId: undefined }
        : plainBody
      const base = department ? `/api/platform/departments/${unit.id}`
        : `/api/platform/organization-units/${unit.id}`
      return client.request<OrganizationProfileResult>(`${base}/${paths[section]}`,
        { method: 'POST', body: JSON.stringify(body) })
    },
    practitioners: () => client.request<Practitioner[]>('/api/platform/practitioners'),
    practitioner: (id: string) => client.request<PractitionerDetail>(`/api/platform/practitioners/${id}`),
    createPractitioner: (input: { code: string; fullName: string; sdPractGender: PractitionerGender }) =>
      client.request<Practitioner>('/api/platform/practitioners',
        { method: 'POST', body: JSON.stringify(input) }),
    updatePractitioner: (id: string, input: { expectedRevision: number; fullName: string; sdPractGender: PractitionerGender }) =>
      client.request<Practitioner>(`/api/platform/practitioners/${id}`,
        { method: 'PUT', body: JSON.stringify(input) }),
    changePractitionerStatus: (id: string, expectedRevision: number, sdPersonnelStatus: PersonnelStatus) =>
      client.request<Practitioner>(`/api/platform/practitioners/${id}/status`,
        { method: 'POST', body: JSON.stringify({ expectedRevision, sdPersonnelStatus }) }),
    positions: () => client.request<Position[]>('/api/platform/positions'),
    createPosition: (input: { code: string; name: string; sdPositionType: PositionType; dutyDescription?: string }) =>
      client.request<Position>('/api/platform/positions', { method: 'POST', body: JSON.stringify(input) }),
    createEmployment: (input: EmploymentInput) => client.request<Employment>(
      '/api/platform/employments', { method: 'POST', body: JSON.stringify(input) },
    ),
    createAssignment: (input: AssignmentInput) => client.request<PersonnelAssignment>(
      '/api/platform/assignments', { method: 'POST', body: JSON.stringify(input) },
    ),
  }
}
