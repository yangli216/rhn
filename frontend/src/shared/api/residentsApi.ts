import type { Resident } from '../model'
import type { ApiClient } from './httpClient'

export interface ResidentIdentifierInput {
  system: string
  value: string
  useType: 'OFFICIAL' | 'SECONDARY' | 'TEMP'
}

export interface CreateResidentInput {
  fullName: string
  nationalId: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  phone: string
  identifiers?: ResidentIdentifierInput[]
  demographicProfile?: ResidentDemographicProfile
  addresses?: ResidentAddressInput[]
  relatedPersons?: ResidentRelatedPersonInput[]
  coverages?: ResidentCoverageInput[]
  employments?: ResidentEmploymentInput[]
}

export interface ResidentDemographicProfile {
  nationalityCode?: string
  ethnicityCode?: string
  sdResidencyType?: string
  sdResidencyTypeText?: string
  sdMaritalStatus?: string
  sdMaritalStatusText?: string
  sdEducationLevel?: string
  sdEducationLevelText?: string
  sdOccupationType?: string
  sdOccupationTypeText?: string
  sdBloodType?: string
  sdBloodTypeText?: string
  sdRhType?: string
  sdRhTypeText?: string
}

export interface ResidentAddressInput {
  id?: string
  sdUse: string
  sdUseText?: string
  provinceCode?: string
  cityCode?: string
  districtCode?: string
  streetCode?: string
  communityCode?: string
  addressText: string
  postalCode?: string
  primary: boolean
  validFrom: string
  validTo?: string
}

export interface ResidentRelatedPersonInput {
  id?: string
  fullName: string
  sdRelationship: string
  sdRelationshipText?: string
  phone?: string
  addressText?: string
  guardian: boolean
  emergencyContact: boolean
  validFrom: string
  validTo?: string
}

export interface ResidentCoverageInput {
  id?: string
  sdCoverageType: string
  sdCoverageTypeText?: string
  payerName: string
  memberNo?: string
  primary: boolean
  validFrom: string
  validTo?: string
}

export interface ResidentEmploymentInput {
  id?: string
  employerName: string
  sdOccupationType?: string
  sdOccupationTypeText?: string
  phone?: string
  postalCode?: string
  addressText?: string
  primary: boolean
  validFrom: string
  validTo?: string
}

export interface ResidentProfile {
  resident: Resident
  demographicProfile: ResidentDemographicProfile
  addresses: ResidentAddressInput[]
  relatedPersons: ResidentRelatedPersonInput[]
  coverages: ResidentCoverageInput[]
  employments: ResidentEmploymentInput[]
}

export interface UpdateResidentProfileInput {
  expectedVersion: number
  fullName: string
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  birthDate: string
  phone?: string
  deceased: boolean
  deceasedAt?: string
  demographicProfile: ResidentDemographicProfile
  addresses: ResidentAddressInput[]
  relatedPersons: ResidentRelatedPersonInput[]
  coverages: ResidentCoverageInput[]
  employments: ResidentEmploymentInput[]
}

export function createResidentsApi(client: ApiClient) {
  return {
    get: (residentId: string) => client.request<Resident>(`/api/residents/${encodeURIComponent(residentId)}`),
    profile: (residentId: string) => client.request<ResidentProfile>(
      `/api/residents/${encodeURIComponent(residentId)}/profile`,
    ),
    search: (query: string) => client.request<Resident[]>(
      `/api/residents?query=${encodeURIComponent(query)}`,
    ),
    create: (input: CreateResidentInput) => client.request<Resident>('/api/residents', {
      method: 'POST', body: JSON.stringify(input),
    }),
    updateProfile: (residentId: string, input: UpdateResidentProfileInput) => client.request<ResidentProfile>(
      `/api/residents/${encodeURIComponent(residentId)}/profile`, {
        method: 'PUT', body: JSON.stringify(input),
      },
    ),
  }
}
