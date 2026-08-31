import type { ApiClient } from './httpClient'

export type OutpatientReferralType = 'INTERNAL_CONSULT' | 'DEPARTMENT_TRANSFER'
export type OutpatientReferralUrgency = 'ROUTINE' | 'URGENT'
export type OutpatientReferralStatus = 'REQUESTED' | 'ACCEPTED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'

export interface OutpatientReferral {
  id: string
  revision: number
  requestNo: string
  encounterId: string
  encounterNo: string
  sourceEncounterStatus: string
  residentId: string
  residentName: string
  healthRecordNo: string
  sourceOrganizationId: string
  sourceOrganizationName: string
  sourceDepartmentId: string
  sourceDepartmentName: string
  referralType: OutpatientReferralType
  targetOrganizationId: string
  targetOrganizationName: string
  targetDepartmentId: string
  targetDepartmentName: string
  targetPractitionerId?: string
  urgency: OutpatientReferralUrgency
  referralReason: string
  clinicalSummary: string
  expectedAt?: string
  status: OutpatientReferralStatus
  targetRegistrationId?: string
  targetEncounterId?: string
  requestedBy: string
  requestedAt: string
  acceptedBy?: string
  acceptedAt?: string
  completedBy?: string
  completedAt?: string
  outcomeText?: string
  rejectionReason?: string
}

export interface CreateOutpatientReferralInput {
  referralType: OutpatientReferralType
  targetOrganizationId: string
  targetDepartmentId: string
  targetPractitionerId?: string
  urgency: OutpatientReferralUrgency
  referralReason: string
  clinicalSummary: string
  expectedAt?: string
  commandCode: string
}

export function createOutpatientReferralsApi(client: ApiClient) {
  return {
    byEncounter: (encounterId: string) => client.request<OutpatientReferral[]>(
      `/api/outpatient/referrals/encounters/${encounterId}`,
    ),
    inbox: () => client.request<OutpatientReferral[]>('/api/outpatient/referrals/inbox'),
    create: (encounterId: string, input: CreateOutpatientReferralInput) => client.request<OutpatientReferral>(
      `/api/outpatient/referrals/encounters/${encounterId}`, {
        method: 'POST', body: JSON.stringify(input),
      },
    ),
    accept: (requestId: string, commandCode: string) => client.request<OutpatientReferral>(
      `/api/outpatient/referrals/${requestId}/accept`, {
        method: 'POST', body: JSON.stringify({ commandCode }),
      },
    ),
    complete: (requestId: string, commandCode: string, opinion: string) => client.request<OutpatientReferral>(
      `/api/outpatient/referrals/${requestId}/complete`, {
        method: 'POST', body: JSON.stringify({ commandCode, opinion }),
      },
    ),
    reject: (requestId: string, commandCode: string, reason: string) => client.request<OutpatientReferral>(
      `/api/outpatient/referrals/${requestId}/reject`, {
        method: 'POST', body: JSON.stringify({ commandCode, reason }),
      },
    ),
    cancel: (requestId: string, commandCode: string, reason: string) => client.request<OutpatientReferral>(
      `/api/outpatient/referrals/${requestId}/cancel`, {
        method: 'POST', body: JSON.stringify({ commandCode, reason }),
      },
    ),
  }
}
