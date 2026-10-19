import type { ApiClient } from './httpClient'
import type { components } from './generated'

type Schemas = components['schemas']
type RequiredWireView<Wire, Keys extends keyof Wire> = Omit<Wire, Keys> & { [Key in Keys]-?: NonNullable<Wire[Key]> }

export type ReliefTiming = 'PRE_INSURANCE' | 'POST_INSURANCE'
export type ReliefPolicyStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
export type ReliefDraftInput = Schemas['ReliefDraftInput']
export type ReliefRuleInput = Schemas['ReliefRuleInput']
export type ReliefQualificationInput = Schemas['ReliefQualificationInput']
export type ReliefAttributeConditions = Schemas['ReliefAttributeConditions']

export type ReliefPolicySummary = RequiredWireView<Schemas['ReliefPolicySummaryView'], 'id' | 'revision' | 'code' | 'name' | 'status'>
export type ReliefRuleView = Schemas['ReliefRuleView']
export type ReliefQualificationView = Schemas['ReliefQualificationView']
export type ReliefVersionView = RequiredWireView<Schemas['ReliefVersionView'], 'id' | 'versionNo' | 'status'>
export type ReliefVersionSummary = RequiredWireView<Schemas['ReliefVersionSummaryView'], 'id' | 'versionNo' | 'status'>
export type ReliefPolicy = Omit<RequiredWireView<Schemas['ReliefPolicyView'], 'id' | 'revision' | 'code' | 'name' | 'status'>,
  'current' | 'draft' | 'versions'> & {
  current?: ReliefVersionView
  draft?: ReliefVersionView
  versions?: ReliefVersionSummary[]
}

export type ReliefRosterEntry = RequiredWireView<Schemas['ReliefRosterEntryView'], 'id' | 'revision' | 'qualificationType' | 'residentId' | 'effectiveFrom' | 'status'>
export type ReliefRosterImportRow = Schemas['ReliefRosterImportRow']
export type ReliefRosterImportResult = Schemas['ReliefRosterImportResultView']

export type ReliefOutcome = Schemas['ReliefOutcomeView']
export type ReliefApplication = Schemas['ReliefApplicationView']
export type SettlementRelief = Schemas['SettlementReliefView']
export type ManualReliefInput = Schemas['ManualReliefRequest']

export type ReliefRecord = RequiredWireView<Schemas['ReliefRecordView'], 'id' | 'reliefAmount' | 'baseAmount' | 'reversal' | 'manual'>
export type ReliefRecordSummary = RequiredWireView<Schemas['ReliefRecordSummaryView'], 'reliefCount' | 'reversalCount' | 'patientCount' | 'reliefAmount' | 'reversalAmount' | 'netAmount'>
export type ReliefRecordPage = Omit<Schemas['ReliefRecordPage'], 'items' | 'summary'> & {
  items: ReliefRecord[]
  summary: ReliefRecordSummary[]
  total: number
}

/** 减免明细查询条件；日期按减免记录时间，page 从 0 开始。 */
export interface ReliefRecordFilter {
  from: string
  to: string
  policyId?: string
  sponsor?: string
  timing?: string
  manualOnly?: boolean
  settledOnly?: boolean
  keyword?: string
  page?: number
  size?: number
}

export interface ReliefRosterFilter {
  qualificationType?: string
  residentId?: string
  status?: 'ACTIVE' | 'REVOKED'
  importBatch?: string
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export function createReliefApi(client: ApiClient) {
  const base = '/api/billing/relief'
  return {
    policies: () => client.request<ReliefPolicySummary[]>(`${base}/policies`),
    policy: (policyId: string) => client.request<ReliefPolicy>(`${base}/policies/${policyId}`),
    createPolicy: (input: { code: string; name: string; description?: string; draft: ReliefDraftInput }) =>
      client.request<ReliefPolicy>(`${base}/policies`, json('POST', input)),
    updateDraft: (policyId: string, input: { expectedRevision: string; name: string; description?: string; draft: ReliefDraftInput }) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/draft`, json('PUT', input)),
    discardDraft: (policyId: string, expectedRevision: string) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/draft/discard`, json('POST', { expectedRevision })),
    publish: (policyId: string, expectedRevision: string) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/publish`, json('POST', { expectedRevision })),
    suspend: (policyId: string, expectedRevision: string) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/suspend`, json('POST', { expectedRevision })),
    resume: (policyId: string, expectedRevision: string) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/resume`, json('POST', { expectedRevision })),
    retire: (policyId: string, expectedRevision: string) =>
      client.request<ReliefPolicy>(`${base}/policies/${policyId}/retire`, json('POST', { expectedRevision })),

    roster: (filter: ReliefRosterFilter = {}) => {
      const params = new URLSearchParams()
      Object.entries(filter).forEach(([key, value]) => { if (value) params.set(key, value) })
      const query = params.toString()
      return client.request<ReliefRosterEntry[]>(`${base}/roster${query ? `?${query}` : ''}`)
    },
    addRoster: (input: { qualificationType: string; residentId: string; effectiveFrom: string; effectiveTo?: string; evidenceNo?: string; evidence?: string }) =>
      client.request<ReliefRosterEntry>(`${base}/roster`, json('POST', input)),
    updateRoster: (entryId: string, input: { expectedRevision: string; effectiveFrom: string; effectiveTo?: string; evidenceNo?: string; evidence?: string }) =>
      client.request<ReliefRosterEntry>(`${base}/roster/${entryId}`, json('PUT', input)),
    revokeRoster: (entryId: string, input: { expectedRevision: string; reason: string }) =>
      client.request<ReliefRosterEntry>(`${base}/roster/${entryId}/revoke`, json('POST', input)),
    importRoster: (input: { batchCode: string; qualificationType: string; dryRun: boolean; rows: ReliefRosterImportRow[] }) =>
      client.request<ReliefRosterImportResult>(`${base}/roster/import`, json('POST', input)),

    records: (filter: ReliefRecordFilter) => {
      const params = new URLSearchParams()
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== false) params.set(key, String(value))
      })
      return client.request<ReliefRecordPage>(`${base}/records?${params.toString()}`)
    },

    settlementRelief: (settlementId: string) =>
      client.request<SettlementRelief>(`/api/billing/settlements/${settlementId}/relief`),
    confirmSettlementRelief: (settlementId: string, manual: ManualReliefInput[] = []) =>
      client.request<SettlementRelief>(`/api/billing/settlements/${settlementId}/relief/confirm`, json('POST', { manual })),
  }
}

export type ReliefApi = ReturnType<typeof createReliefApi>
