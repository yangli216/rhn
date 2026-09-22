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
  patientContext: PatientSimulationContext
  items: Array<MedicationTrialItem & {
    medicationName: string
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
  }
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
