import type { KnowledgeRuleCandidate } from './medicationKnowledgeDraftApi'
import type { MedicationStandardReference } from './masterDataApi'
import type { ApiClient } from './httpClient'
export interface MedicationKnowledge {
  standardReference?: MedicationStandardReference
  medication: { id:string; code:string; name:string; doseForm:string|null; preparationSpec:string|null; strengthValue:number|null; strengthUnit:string|null; defaultDose:number|null; defaultDoseUnit:string|null; defaultRoute:string|null; defaultFrequency:string|null; antimicrobial:boolean; antimicrobialMaxDays:number|null; skinTestRequired:boolean }
  revision:number; semanticStatus:string; capturedAt:string
  classifications: { systemCode:string; systemVersion:string; display:string; code:string }[]
  allergens: { id:string; display:string }[]
  standardMappings: { id:string; systemName:string; systemVersion:string; termCode:string; termDisplay:string }[]
}
export interface MedicationCandidate {
  id:string; parentId:string|null; version:number; requirement:string; source:string; model:string; createdAt:string; status:string
  rule: {
    template:string
    name:string
    explanation:string
    duplicateCount:number
    message:string
    decision:string
    ruleExpression?:string
    categoryName?:string
    minAge?:number
    maxAge?:number
  }
  medications:MedicationKnowledge[]
}
export interface PatientSimulationContext {
  patientAgeYears: number | null
  gender?: string | null
  activeAllergies?: string[]
}
export interface MedicationTrialItem { medicationId:string|null; status:string; durationDays:number|null; routeCode:string|null; frequencyCode?:string|null; name?:string; spec?:string }
export interface MedicationTrialRun {
  id:string; candidateId:string; mode:string; createdAt:string; prescriptionId:string|null; inputHash:string
  cases:{ name:string; expected:string|null; actual:string; passed:boolean; matchedRows:number[]; reasons:string[]; input:MedicationTrialItem[] }[]
}
export interface ActiveRuleTrialRun {
  mode: 'ACTIVE_RULE_SANDBOX'
  scope: 'ALL' | 'SELECTED'
  createdAt: string
  ruleSetVersion: string
  decision: string
  cases: Array<{
    ruleCode: string
    ruleName: string
    version: number
    outcome: string
    failureCode: string | null
    decision: string
    matchedRows: number[]
    reasons: string[]
  }>
}
export interface PrescriptionPreview {
  encounterId: string
  prescriptionId: string
  residentId: string
  departmentId: string
  prescriptionStatus: string
  patientContext: PatientSimulationContext | null
  items: Array<MedicationTrialItem & {
    medicationName: string | null
    preparationSpec: string | null
    historicalSnapshotAvailable: boolean
  }>
}
export interface RuleEvidence {
  sourceType: string
  sourceTitle: string
  sourceVersion: string
  sourceLocator: string
  section: string
  excerpt: string
  usageScope: string
}
export interface ActiveRuleView {
  ruleId: string
  ruleVersionId: string
  ruleCode: string
  category: string
  ruleName: string
  version: number
  ruleSetVersion: string
  implementation: string
  status: string
  severity: string
  decision: string
  overridePolicy: string
  effectiveFrom: string
  effectiveTo: string | null
  evidence: RuleEvidence[]
}
export interface EvaluationSummary {
  evaluationId: string
  prescriptionId: string
  encounterId: string
  patientId: string
  organizationId: string
  departmentId: string
  ruleSetVersion: string
  mode: string
  decision: string
  completedAt: string
  findingCount: number
}
export function createMedicationWorkbenchApi(client:ApiClient) {
  const root='/api/quality/medication-workbench'
  const post=<T,>(path:string,body:unknown={})=>client.request<T>(root+path,{method:'POST',body:JSON.stringify(body)})
  return {
    catalog:()=>client.request<RuleCatalog>('/api/quality/medication-rule-catalog'),
    catalogCommand:(key:string,body:RuleCatalogCommand)=>client.request<RuleCatalogEntry>('/api/quality/medication-rule-catalog/'+encodeURIComponent(key)+'/commands',{method:'POST',body:JSON.stringify(body)}),
    catalogRuns:(key:string)=>client.request<RuleRuntimeRecord[]>('/api/quality/medication-rule-catalog/'+encodeURIComponent(key)+'/runs'),
    createDraft:(body:RuleDraftInput)=>client.request<MedicationCandidate>('/api/quality/medication-rule-catalog/drafts',{method:'POST',body:JSON.stringify(body)}),
    status:()=>client.request<{available:boolean;model:string|null;message:string}>(root+'/ai-status'),
    medications:(query='')=>client.request<MedicationKnowledge[]>(root+'/medications?query='+encodeURIComponent(query)),
    candidates:()=>client.request<MedicationCandidate[]>(root+'/candidates'),
    activeRules:()=>client.request<ActiveRuleView[]>(root+'/active-rules'),
    activeRuleTrial:(ruleCodes:string[],items:MedicationTrialItem[],patientContext?:PatientSimulationContext)=>post<ActiveRuleTrialRun>('/active-rules/trial',{ruleCodes,items,patientContext}),
    evaluations:()=>client.request<EvaluationSummary[]>(root+'/evaluations'),
    approve:(id:string)=>post<MedicationCandidate>('/candidates/'+id+'/approve'),
    generate:(requirement:string,source:string,medicationIds?:string[],parentId?:string|null)=>post<{status:string;message:string;candidate:MedicationCandidate|null}>('/generate',{requirement,source,medicationIds: medicationIds || [],parentId: parentId || null}),
    suite:(id:string)=>post<MedicationTrialRun>('/candidates/'+id+'/suite'),
    trial:(id:string,items:MedicationTrialItem[],patientContext?:PatientSimulationContext)=>post<MedicationTrialRun>('/candidates/'+id+'/trial',{items,patientContext}),
    shadow:(id:string,encounterId:string,prescriptionId:string)=>post<MedicationTrialRun>('/candidates/'+id+'/shadow',{encounterId,prescriptionId}),
    prescriptionPreview:(encounterId:string,prescriptionId:string)=>post<PrescriptionPreview>('/prescription-preview',{encounterId,prescriptionId}),
    runs:(id:string)=>client.request<MedicationTrialRun[]>(root+'/candidates/'+id+'/runs'),
    listSafetyCategories: (query = '', ruleKind = '') => {
      const params = new URLSearchParams()
      if (query) params.set('query', query)
      if (ruleKind) params.set('ruleKind', ruleKind)
      const q = params.toString() ? `?${params.toString()}` : ''
      return client.request<MedicationSafetyCategoryView[]>('/api/quality/medication-safety/categories' + q)
    },
    getSafetyCategory: (id: string | number) => client.request<MedicationSafetyCategoryView>(`/api/quality/medication-safety/categories/${id}`),
    createSafetyCategory: (body: CreateSafetyCategoryRequest) => client.request<MedicationSafetyCategoryView>('/api/quality/medication-safety/categories', { method: 'POST', body: JSON.stringify(body) }),
    updateSafetyCategory: (id: string | number, body: UpdateSafetyCategoryRequest) => client.request<MedicationSafetyCategoryView>(`/api/quality/medication-safety/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteSafetyCategory: (id: string | number) => client.request<void>(`/api/quality/medication-safety/categories/${id}`, { method: 'DELETE' }),
    listSafetyCategoryMembers: (id: string | number, query = '') => client.request<SafetyCategoryMemberView[]>(`/api/quality/medication-safety/categories/${id}/members${query ? `?query=${encodeURIComponent(query)}` : ''}`),
    addSafetyCategoryMembers: (id: string | number, items: SafetyCategoryMemberItem[]) => client.request<number>(`/api/quality/medication-safety/categories/${id}/members`, { method: 'POST', body: JSON.stringify({ items }) }),
    removeSafetyCategoryMember: (id: string | number, memberId: string | number) => client.request<void>(`/api/quality/medication-safety/categories/${id}/members/${memberId}`, { method: 'DELETE' }),
    listSafetyTagsForMedication: (medicationId?: string | number, name?: string) => {
      const params = new URLSearchParams()
      if (medicationId) params.set('medicationId', String(medicationId))
      if (name) params.set('name', name)
      const q = params.toString() ? `?${params.toString()}` : ''
      return client.request<MedicationSafetyTagView[]>(`/api/quality/medication-safety/categories/by-medication${q}`)
    },
    listStandardCatalogCategories: () =>
      client.request<StandardCatalogCategorySummary[]>('/api/quality/medication-safety/categories/standard-catalog-categories'),
    searchStandardCatalogCandidates: (params: { major?: string; sub: string; systemicOnly?: boolean; excludeCategoryId?: string | number }) => {
      const p = new URLSearchParams()
      if (params.major) p.set('major', params.major)
      p.set('sub', params.sub)
      if (params.systemicOnly !== undefined) p.set('systemicOnly', String(params.systemicOnly))
      if (params.excludeCategoryId) p.set('excludeCategoryId', String(params.excludeCategoryId))
      return client.request<SafetyCategoryMemberItem[]>(`/api/quality/medication-safety/categories/standard-catalog-candidates?${p.toString()}`)
    },
    importSafetyCategoryMembersFromCatalog: (id: string | number, body: CatalogImportRequest) =>
      client.request<CatalogImportResult>(`/api/quality/medication-safety/categories/${id}/import-from-catalog`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  }
}

export interface MedicationSafetyCategoryView {
  id: string
  code: string
  name: string
  ruleKind: string
  rationale: string
  isSystem: boolean
  status: string
  memberCount: number
  revision: number
  createdAt: string
  updatedAt: string
  catalogMajor?: string | null
  catalogSub?: string | null
  systemicOnly?: boolean
}

export interface CreateSafetyCategoryRequest {
  code: string
  name: string
  ruleKind: string
  rationale: string
  catalogMajor?: string | null
  catalogSub?: string | null
  systemicOnly?: boolean
}

export interface UpdateSafetyCategoryRequest {
  expectedRevision: number
  name: string
  rationale: string
  status: string
  catalogMajor?: string | null
  catalogSub?: string | null
  systemicOnly?: boolean
}

export interface SafetyCategoryMemberView {
  id: string
  categoryId: string
  medicationId: string
  medicationCode: string
  medicationName: string
  preparationSpec: string
  doseForm: string
  createdAt: string
  inherited?: boolean
}

export interface SafetyCategoryMemberItem {
  medicationId: string | number
  medicationCode: string
  medicationName: string
  preparationSpec?: string
  doseForm?: string
}

export interface StandardCatalogCategorySummary {
  major: string
  sub: string
  entryCount: number
  entryNames: string[]
}

export interface CatalogImportRequest {
  catalogMajor?: string | null
  catalogSub: string
  systemicOnly?: boolean
}

export interface CatalogImportResult {
  importedCount: number
  skippedCount: number
  totalCount: number
}

export interface MedicationSafetyTagView {
  categoryId: string
  categoryCode: string
  categoryName: string
  ruleKind: string
  rationale: string
}

export interface CatalogEvidence { sourceType:string; sourceTitle:string; sourceVersion:string; sourceLocator:string; section:string; excerpt:string; usageScope:string }
export interface CatalogReview { versionId:string; status:string; action:string|null; evidence:CatalogEvidence[]; actorId:string; recordedAt:string; reason:string }
export interface CatalogBuiltin { id:string; version:number; ruleSetVersion:string; implementationKey:string; decision:string; severity:string; definition:{id:string;code:string;category:string;title:string}; evidence:CatalogEvidence[] }
export interface CatalogVersion { id:string; version:number; name:string; reviewStatus:string; testsPassed:boolean; origin:string; candidate:MedicationCandidate|null; builtin:CatalogBuiltin|null; review:CatalogReview|null; knowledgeCandidate?:KnowledgeRuleCandidate|null; manualValidation?:{status:string;suiteVersion:number;runId:string|null;caseCount:number;passedCount:number}|null }
export interface RuleDeployment { id:string; versionId:string; version:number; mode:string; status:string; action:string; organizationId:string; departmentId:string|null; effectiveFrom:string; effectiveTo:string|null; actorId:string; createdAt:string; reason:string }
export interface RuleCatalogEntry { key:string; code:string; name:string; origin:string; revision:number; versions:CatalogVersion[]; deployments:RuleDeployment[]; history:{id:string;operation:string;versionId:string;actorId:string;time:string;reason:string}[] }
export interface RuleCatalog { organizationId:string|null; departmentId:string|null; rules:RuleCatalogEntry[] }
export interface RuleCatalogCommand { expectedRevision:number;operation:string;versionId:string;deploymentId?:string;reason:string;action?:string;evidence?:CatalogEvidence[];standardVerified?:boolean;evidenceVerified?:boolean;mode?:string;organizationId?:string;departmentId?:string|null;effectiveFrom?:string|null;effectiveTo?:string|null }
export interface RuleRuntimeRecord { id:string;ruleKey:string;versionId:string;deploymentId:string;prescriptionId:string;mode:string;decision:string;time:string;details:string }
export interface RuleDraftInput { parentId?:string;requirement:string;source:string;rule:MedicationCandidate['rule'];medicationIds:string[] }
