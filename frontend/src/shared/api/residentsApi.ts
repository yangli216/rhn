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

export interface AllergyIntolerance {
  id: string
  revision: number
  residentId: string
  encounterId?: string
  assertionType: 'ALLERGY' | 'NO_KNOWN_ALLERGY' | 'NO_KNOWN_DRUG_ALLERGY'
  categoryCode?: 'DRUG' | 'FOOD' | 'ENVIRONMENT' | 'BIOLOGIC' | 'OTHER'
  clinicalStatus: 'ACTIVE' | 'INACTIVE'
  verificationStatus: 'UNCONFIRMED' | 'CONFIRMED' | 'REFUTED' | 'ENTERED_IN_ERROR'
  criticalityCode?: 'LOW' | 'HIGH' | 'UNABLE_TO_ASSESS'
  reactionSeverity?: 'MILD' | 'MODERATE' | 'SEVERE'
  informationSource: 'PATIENT' | 'FAMILY' | 'MEDICAL_RECORD' | 'CLINICIAN'
  substanceCodeSystemUri?: string
  substanceCode?: string
  substanceDisplay?: string
  reactionText?: string
  onsetAt?: string
  recordedAt: string
  verifiedAt?: string
  inactivatedAt?: string
  inactivationReason?: string
}

export interface RecordAllergyInput {
  encounterId?: string
  assertionType: AllergyIntolerance['assertionType']
  categoryCode?: AllergyIntolerance['categoryCode']
  criticalityCode?: AllergyIntolerance['criticalityCode']
  reactionSeverity?: AllergyIntolerance['reactionSeverity']
  informationSource: AllergyIntolerance['informationSource']
  substanceCodeSystemUri?: string
  substanceCode?: string
  substanceDisplay?: string
  reactionText?: string
  onsetAt?: string
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

export interface ResidentPageView {
  content: Resident[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface ResidentPageParams {
  query?: string
  gender?: string
  status?: string
  deceased?: boolean
  page?: number
  size?: number
}

export function createResidentsApi(client: ApiClient) {
  return {
    get: (residentId: string) => client.request<Resident>(`/api/residents/${encodeURIComponent(residentId)}`),
    profile: (residentId: string) => client.request<ResidentProfile>(
      `/api/residents/${encodeURIComponent(residentId)}/profile`,
    ),
    allergies: (residentId: string, activeOnly = true) => client.request<AllergyIntolerance[]>(
      `/api/residents/${encodeURIComponent(residentId)}/allergies?activeOnly=${activeOnly}`,
    ),
    recordAllergy: (residentId: string, input: RecordAllergyInput) => client.request<AllergyIntolerance>(
      `/api/residents/${encodeURIComponent(residentId)}/allergies`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    inactivateAllergy: (residentId: string, allergyId: string, expectedRevision: number, reason: string) =>
      client.request<AllergyIntolerance>(
        `/api/residents/${encodeURIComponent(residentId)}/allergies/${encodeURIComponent(allergyId)}/inactivate`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, reason }),
        },
      ),
    search: (query: string) => client.request<Resident[]>(
      `/api/residents?query=${encodeURIComponent(query)}`,
    ),
    page: (params: ResidentPageParams = {}) => {
      const searchParams = new URLSearchParams()
      if (params.query?.trim()) searchParams.set('query', params.query.trim())
      if (params.gender) searchParams.set('gender', params.gender)
      if (params.status) searchParams.set('status', params.status)
      if (params.deceased !== undefined) searchParams.set('deceased', String(params.deceased))
      if (params.page !== undefined) searchParams.set('page', String(params.page))
      if (params.size !== undefined) searchParams.set('size', String(params.size))
      const qs = searchParams.toString()
      return client.request<ResidentPageView>(`/api/residents/page${qs ? `?${qs}` : ''}`)
    },
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
