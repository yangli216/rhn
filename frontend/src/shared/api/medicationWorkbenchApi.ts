import type { ApiClient } from './httpClient'
export interface MedicationKnowledge {
  medication: { id:string; code:string; name:string; doseForm:string|null; preparationSpec:string|null; strengthValue:number|null; strengthUnit:string|null; defaultDose:number|null; defaultDoseUnit:string|null; defaultRoute:string|null; defaultFrequency:string|null; antimicrobial:boolean; antimicrobialMaxDays:number|null; skinTestRequired:boolean }
  revision:number; semanticStatus:string; capturedAt:string
  classifications: { systemCode:string; systemVersion:string; display:string; code:string }[]
  allergens: { id:string; display:string }[]
  standardMappings: { id:string; systemName:string; systemVersion:string; termCode:string; termDisplay:string }[]
}
export interface MedicationCandidate {
  id:string; parentId:string|null; version:number; requirement:string; source:string; model:string; createdAt:string; status:string
  rule: { template:string; name:string; explanation:string; duplicateCount:number; message:string; decision:string }
  medications:MedicationKnowledge[]
}
export interface MedicationTrialItem { medicationId:string|null; status:string; durationDays:number|null; routeCode:string|null }
export interface MedicationTrialRun {
  id:string; candidateId:string; mode:string; createdAt:string; prescriptionId:string|null; inputHash:string
  cases:{ name:string; expected:string|null; actual:string; passed:boolean; matchedRows:number[]; reasons:string[]; input:MedicationTrialItem[] }[]
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
    status:()=>client.request<{available:boolean;model:string|null;message:string}>(root+'/ai-status'),
    medications:(query='')=>client.request<MedicationKnowledge[]>(root+'/medications?query='+encodeURIComponent(query)),
    candidates:()=>client.request<MedicationCandidate[]>(root+'/candidates'),
    activeRules:()=>client.request<ActiveRuleView[]>(root+'/active-rules'),
    evaluations:()=>client.request<EvaluationSummary[]>(root+'/evaluations'),
    approve:(id:string)=>post<MedicationCandidate>('/candidates/'+id+'/approve'),
    generate:(requirement:string,source:string,medicationIds:string[],parentId:string|null)=>post<{status:string;message:string;candidate:MedicationCandidate|null}>('/generate',{requirement,source,medicationIds,parentId}),
    suite:(id:string)=>post<MedicationTrialRun>('/candidates/'+id+'/suite'),
    trial:(id:string,items:MedicationTrialItem[])=>post<MedicationTrialRun>('/candidates/'+id+'/trial',{items}),
    shadow:(id:string,encounterId:string,prescriptionId:string)=>post<MedicationTrialRun>('/candidates/'+id+'/shadow',{encounterId,prescriptionId}),
    runs:(id:string)=>client.request<MedicationTrialRun[]>(root+'/candidates/'+id+'/runs'),
  }
}
