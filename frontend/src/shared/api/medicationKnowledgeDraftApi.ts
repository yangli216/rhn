import type { PharmacyReview } from './pharmacyApi'
import type { MedicationSafetyFinding } from './encountersApi'
import type { RuleDeployment } from './medicationWorkbenchApi'
import type { ApiClient } from './httpClient'
export interface KnowledgeTarget { level: string; specificationId: string; catalogId: string; catalogVersion: string; contentHash: string }
export interface KnowledgeRoutes { mode: string; codes: string[] }
export interface KnowledgeConditions { ageMode: string; ageUnit: string | null; minimumAgeInclusive: number | null; maximumAgeExclusive: number | null; groupARoutes: KnowledgeRoutes; groupBRoutes: KnowledgeRoutes; additionalConditions: string }
export interface KnowledgeEvidence { sourceType: string; title: string; publisher: string; edition: string; locator: string; excerpt: string; documentHash: string; effectiveFrom: string | null; effectiveTo: string | null }
export interface KnowledgeBody { title: string; kind: string; matchMode: string; groupA: KnowledgeTarget[]; groupB: KnowledgeTarget[]; minimumOrders: number | null; exposureScope: string; conditions: KnowledgeConditions; evidence: KnowledgeEvidence; clinicalMeaning: string; severity: string; proposedAction: string }
export interface KnowledgeReference { catalogId: string; catalogVersion: string; contentHash: string; sourceHash: string; entryId: string; specificationId: string; name: string; doseForm: string; preparationSpec: string }
export interface KnowledgeAssessment { structureComplete: boolean; issues: { field: string; code: string; message: string }[]; ruleDescription: string; groupA: { level: string; reference: KnowledgeReference }[]; groupB: { level: string; reference: KnowledgeReference }[]; groupARoutes: { code: string; name: string; systemVersion: string }[]; groupBRoutes: { code: string; name: string; systemVersion: string }[] }
export interface KnowledgeVersion { id: string; version: number; status: 'DRAFT'; body: KnowledgeBody; assessment: KnowledgeAssessment; actor: string; savedAt: string; changeReason: string; extractionId?: string | null }
export interface KnowledgeCase { name: string; input: { age: number | null; ageUnit: string | null; date: string; medications: { orderId: string; entryId: string; specificationId: string; routeCode: string | null; status: string }[] }; expected: string; actual: { outcome: string; reasons: string[]; matchedOrderIds: string[] }; passed: boolean }
export interface KnowledgeDetail { intakeId?: string | null; saved: KnowledgeVersion; currentAssessment: KnowledgeAssessment; possibleConflicts: { id: string; version: number; title: string; reason: string }[]; cases: KnowledgeCase[] }
export interface KnowledgePage { content: { id: string; version: number; title: string; kind: string; structureComplete: boolean; savedAt: string }[]; totalElements: number; totalPages: number; page: number; size: number }
export interface KnowledgeExample { id: string; purpose: string; notes: string[]; sourceUrl: string; sourceMaterial: string; body: KnowledgeBody; assessment: KnowledgeAssessment; medicationLabels: Record<string, string>; manualCases: KnowledgeTestCase[]; results: KnowledgeCase[] }
export function createMedicationKnowledgeDraftApi(client: ApiClient) {
  const root = '/api/quality/medication-knowledge-drafts'
  const post = <T,>(path: string, body: unknown) => client.request<T>(root + path, { method: 'POST', body: JSON.stringify(body) })
  const testsRoot = (id: string) => `/api/quality/medication-knowledge-rule-candidates/${encodeURIComponent(id)}/tests`
  const extractionRoot = '/api/quality/medication-knowledge-extractions'
  const reviewRoot = (id: string) => `/api/quality/medication-knowledge-rule-candidates/${encodeURIComponent(id)}/review`
  const deploymentRoot = (id: string) => `/api/quality/medication-knowledge-rule-candidates/${encodeURIComponent(id)}/deployments`
  const feedbackRoot = (candidate: string, deployment: string, run: string) => `${deploymentRoot(candidate)}/${encodeURIComponent(deployment)}/observations/${encodeURIComponent(run)}/feedback`
  const intakeRoot = '/api/quality/medication-rule-intakes'
  const pharmacyRoot = (task: string, review: string) => `/api/quality/pharmacy-tasks/${encodeURIComponent(task)}/reviews/${encodeURIComponent(review)}/improvement-intakes`
  const improvementRoot = (origin: IntakeImprovementOrigin) => origin.pharmacy ? pharmacyRoot(origin.pharmacy.taskId, origin.pharmacy.review.id) : `${feedbackRoot(origin.feedback.basis.candidateId, origin.feedback.basis.deploymentId, origin.feedback.basis.runId)}/improvement-intakes`
  return {
    examples: () => client.request<KnowledgeExample[]>(`${root}/examples`),
    intakeFeedbackOrigin: (id: string) => client.request<IntakeImprovementOrigin | null>(`${intakeRoot}/${encodeURIComponent(id)}/feedback-origin`),
    feedbackImprovementHistory: (origin: IntakeImprovementOrigin, page = 0) => client.request<KnowledgeReplayPage<{ id: string; parentId: string | null; requirement: string; status: string; actor: string; createdAt: string }>>(`${improvementRoot(origin)}?page=${page}`),
    analyzeFeedbackImprovement: (origin: IntakeImprovementOrigin, input: { requirement: string; parentId?: string; answers: { questionId: string; value: string }[] }) => client.request<RuleIntakeRun>(improvementRoot(origin), { method: 'POST', body: JSON.stringify(origin.pharmacy ? { intake: input, findingId: origin.pharmacy.finding?.findingId ?? null, confirmed: true } : { intake: input, feedbackId: origin.feedback.id, expectedBasisHash: origin.feedback.basis.fingerprint, confirmed: true }) }),
    pharmacyImprovementSource: (task: string, review: string, finding?: string) => client.request<PharmacyIntakeOrigin>(`${pharmacyRoot(task, review)}/source${finding ? `?findingId=${encodeURIComponent(finding)}` : ''}`),
    intakeCapabilities: () => client.request<RuleIntakeCapability[]>(`${intakeRoot}/capabilities`),
    analyzeIntake: (input: { requirement: string; parentId?: string; answers: { questionId: string; value: string }[] }) => client.request<RuleIntakeRun>(intakeRoot, { method: 'POST', body: JSON.stringify(input) }),
    intake: (id: string) => client.request<RuleIntakeRun>(`${intakeRoot}/${encodeURIComponent(id)}`),
    intakeHistory: (page = 0) => client.request<KnowledgeReplayPage<{ id: string; parentId: string | null; requirement: string; status: string; actor: string; createdAt: string }>>(`${intakeRoot}?page=${page}`),
    intakeOrigin: (id: string, version: number) => client.request<RuleIntakeRun | null>(`${root}/${encodeURIComponent(id)}/versions/${version}/intake-origin`),
    deploymentPreview: (id: string) => client.request<KnowledgeDeploymentPreview>(deploymentRoot(id)),
    deploymentCommand: (id: string, command: KnowledgeDeploymentCommand) => client.request<RuleDeployment>(`${deploymentRoot(id)}/commands`, { method: 'POST', body: JSON.stringify(command) }),
    publicationPreview: (candidate: string, sourceDeploymentId: string, operation: string) => client.request<KnowledgePublicationPreview>(`${deploymentRoot(candidate)}/formal-preview?${new URLSearchParams({ sourceDeploymentId, operation })}`),
    publicationCommand: (candidate: string, command: KnowledgePublicationCommand) => client.request<RuleDeployment>(`${deploymentRoot(candidate)}/formal-commands`, { method: 'POST', body: JSON.stringify(command) }),
    publicationMaterial: (candidate: string, deployment: string) => client.request<KnowledgePublicationAuthorization>(`${deploymentRoot(candidate)}/${encodeURIComponent(deployment)}/formal-material`),
    observations: (id: string, deploymentId: string, page = 0) => client.request<KnowledgeObservations>(`${deploymentRoot(id)}/${encodeURIComponent(deploymentId)}/observations?page=${page}`),
    observationFeedback: (candidate: string, deployment: string, run: string, page = 0) => client.request<KnowledgeFeedbackDetail>(`${feedbackRoot(candidate, deployment, run)}?page=${page}`),
    recordObservationFeedback: (candidate: string, deployment: string, run: string, command: KnowledgeFeedbackCommand) => client.request<KnowledgeFeedbackDetail>(feedbackRoot(candidate, deployment, run), { method: 'POST', body: JSON.stringify(command) }),
    reviewPreview: (id: string) => client.request<KnowledgeReviewPreview>(reviewRoot(id)),
    reviewCommand: (id: string, command: KnowledgeReviewCommand) => client.request<KnowledgeReviewEvent>(`${reviewRoot(id)}/commands`, { method: 'POST', body: JSON.stringify(command) }),
    reviewHistory: (id: string, page = 0) => client.request<KnowledgeReplayPage<KnowledgeReviewSummary>>(`${reviewRoot(id)}/history?page=${page}`),
    reviewEvent: (id: string, eventId: string) => client.request<KnowledgeReviewEvent>(`${reviewRoot(id)}/history/${encodeURIComponent(eventId)}`),
    testSuites: (id: string, page = 0) => client.request<KnowledgeReplayPage<KnowledgeTestSuiteSummary>>(`${testsRoot(id)}/suites?page=${page}`),
    testSuite: (id: string, version: number) => client.request<KnowledgeTestSuiteDetail>(`${testsRoot(id)}/suites/${version}`),
    saveTestSuite: (id: string, input: { expectedVersion: number; programHash: string; reason: string; cases: KnowledgeTestCase[] }) => client.request<KnowledgeTestSuiteDetail>(`${testsRoot(id)}/suites`, { method: 'POST', body: JSON.stringify(input) }),
    testRuns: (id: string, page = 0) => client.request<KnowledgeReplayPage<KnowledgeTestRunSummary>>(`${testsRoot(id)}/runs?page=${page}`),
    testRun: (id: string, runId: string) => client.request<KnowledgeTestRun>(`${testsRoot(id)}/runs/${encodeURIComponent(runId)}`),
    executeTests: (id: string, suiteVersion: number, suiteHash: string, reason: string) => client.request<KnowledgeTestRun>(`${testsRoot(id)}/runs`, { method: 'POST', body: JSON.stringify({ suiteVersion, suiteHash, reason }) }),
    previewRuleCandidate: (id: string, expectedVersion: number) => client.request<KnowledgeRulePreview>(`${root}/${encodeURIComponent(id)}/rule-candidates/preview?expectedVersion=${expectedVersion}`),
    createRuleCandidate: (id: string, expectedKnowledgeVersion: number, expectedProgramHash: string, reason: string) => post<KnowledgeRuleCandidate>(`/${encodeURIComponent(id)}/rule-candidates`, { expectedKnowledgeVersion, expectedProgramHash, reason }),
    replaySources: (page = 0) => client.request<KnowledgeReplayPage<KnowledgeReplaySource>>(`${root}/replay-sources?page=${page}`),
    replay: (id: string, expectedVersion: number, evaluationId: string) => post<KnowledgeReplayRun>(`/${encodeURIComponent(id)}/replays`, { expectedVersion, evaluationId }),
    replays: (id: string, page = 0) => client.request<KnowledgeReplayPage<KnowledgeReplaySummary>>(`${root}/${encodeURIComponent(id)}/replays?page=${page}`),
    replayDetail: (id: string, runId: string) => client.request<KnowledgeReplayRun>(`${root}/${encodeURIComponent(id)}/replays/${encodeURIComponent(runId)}`),
    extractionStatus: () => client.request<{ available: boolean; model: string; message: string }>(`${extractionRoot}/status`),
    extract: (input: KnowledgeExtractionRequest) => client.request<KnowledgeExtractionRun>(extractionRoot, { method: 'POST', body: JSON.stringify(input) }),
    extraction: (id: string) => client.request<KnowledgeExtractionRun>(`${extractionRoot}/${encodeURIComponent(id)}`),
    extractions: (page = 0) => client.request<KnowledgeExtractionSummary[]>(`${extractionRoot}?page=${page}`),
    list: (query = '', page = 0) => client.request<KnowledgePage>(`${root}?query=${encodeURIComponent(query)}&page=${page}&size=20`),
    detail: (id: string) => client.request<KnowledgeDetail>(`${root}/${encodeURIComponent(id)}`),
    history: (id: string, page = 0) => client.request<KnowledgeVersion[]>(`${root}/${encodeURIComponent(id)}/history?page=${page}`),
    save: (id: string | undefined, expectedVersion: number, body: KnowledgeBody, changeReason: string, extractionId?: string, intakeId?: string) => post<KnowledgeDetail>(id ? `/${encodeURIComponent(id)}/versions` : '', { expectedVersion, body, changeReason, extractionId, intakeId }),
    validate: (body: KnowledgeBody) => post<KnowledgeAssessment>('/validate', body),
    preview: (body: KnowledgeBody) => post<KnowledgeCase[]>('/preview', body),
  }
}

export interface KnowledgeExtractionRequest { evidence: KnowledgeEvidence; requirement: string }
export interface KnowledgeExtractionRun {
  id: string; input: KnowledgeExtractionRequest; sourceTextHash: string; model: string; promptVersion: string; actor: string; createdAt: string; rawOutput: string; rawOutputTruncated?: boolean
  result: { adoptable: boolean; suggestedBody: KnowledgeBody | null; citations: { field: string; value: string; quote: string; start: number; end: number }[];
    medications: { mention: { group: string; name: string; level: string; specificationText: string; quote: string }; start: number; end: number; candidates: KnowledgeReference[] }[];
    questions: string[]; assessment: KnowledgeAssessment | null }
}
export interface KnowledgeExtractionSummary { id: string; title: string; model: string; createdAt: string; adoptable: boolean }

export interface KnowledgeReplaySource { evaluationId: string; prescriptionId: string; encounterId: string; prescriptionRevision: number; organizationId: string; departmentId: string; evaluatedAt: string | null; inputHash: string; originalMode: string }
export interface KnowledgeReplayRun {
  id: string; engineVersion: string; knowledge: KnowledgeVersion; knowledgeHash: string; source: KnowledgeReplaySource;
  input: { facts: { age: number | null; ageUnit: string; date: string | null }; dateBasis: string; gaps: string[]; items: { orderId: string; revision: number; originalStatus: string; medicationName: string; semanticVersion: string | null; fact: { catalogId: string | null; catalogVersion: string | null; contentHash: string | null; entryId: string | null; specificationId: string | null; routeCode: string | null }; route: { conceptId: string | null; code: string | null; system: string | null; version: string | null } | null; gaps: string[] }[] };
  inputHash: string; result: { outcome: string; reasons: string[]; matchedOrderIds: string[] }; currentKnowledgeIssues: KnowledgeAssessment['issues']; actor: string; createdAt: string
}
export interface KnowledgeReplaySummary { id: string; knowledgeVersion: number; evaluationId: string; prescriptionId: string; outcome: string; actor: string; createdAt: string }
export interface KnowledgeReplayPage<T> { content: T[]; totalElements: number; totalPages: number; page: number; size: number }

export interface KnowledgeRuleGroup { targets: KnowledgeAssessment['groupA']; routeMode: 'ALL' | 'LIST'; routes: { id: string; code: string; name: string; systemCode: string; systemVersion: string }[] }
export interface KnowledgeRuleProgram {
  schemaVersion: string; operator: 'SAME_STANDARD_ENTRY' | 'EXPLICIT_GROUP' | 'GROUP_PAIR'; exposureScope: string;
  groupA: KnowledgeRuleGroup; groupB: KnowledgeRuleGroup; minimumOrders: number | null;
  age: { mode: 'ALL' | 'RANGE'; unit: string | null; minimumInclusive: number | null; maximumExclusive: number | null };
  effectiveFrom: string | null; effectiveTo: string | null; proposedAction: string; requiredFacts: string[]
}
export interface KnowledgeRulePreview { ready: boolean; knowledge: KnowledgeVersion; knowledgeHash: string; program: KnowledgeRuleProgram | null; programHash: string | null; issues: KnowledgeAssessment['issues']; cases: KnowledgeCase[] }
export interface KnowledgeRuleCandidate { id: string; knowledgeId: string; version: number; knowledge: KnowledgeVersion; knowledgeHash: string; program: KnowledgeRuleProgram; programHash: string; cases: KnowledgeCase[]; actorId: string; actor: string; createdAt: string; reason: string }

export interface KnowledgeTestRow { orderId: string; catalogId: string | null; catalogVersion: string | null; contentHash: string | null; entryId: string | null; specificationId: string | null; routeCode: string | null; status: string }
export interface KnowledgeTestCase { medicationLabels?: Record<string, string>; title: string; rationale: string; input: { age: number | null; ageUnit: string | null; date: string | null; medications: (KnowledgeTestRow | null)[] }; expectedOutcome: string; expectedOrderIds: string[] }
export interface KnowledgeTestSuite { candidateId: string; version: number; programHash: string; knowledgeHash: string; cases: KnowledgeTestCase[]; actorId: string; actor: string; createdAt: string; reason: string }
export interface KnowledgeTestSuiteDetail { suite: KnowledgeTestSuite; suiteHash: string }
export interface KnowledgeTestSuiteSummary { version: number; caseCount: number; actor: string; createdAt: string; reason: string }
export interface KnowledgeTestRun { id: string; candidateId: string; programHash: string; knowledgeHash: string; engineVersion: string; suite: KnowledgeTestSuite; suiteHash: string; results: { index: number; actual: { outcome: string; reasons: string[]; matchedOrderIds: string[] }; passed: boolean }[]; allPassed: boolean; missingOutcomeKinds: string[]; actorId: string; actor: string; createdAt: string; reason: string }
export interface KnowledgeTestRunSummary { id: string; suiteVersion: number; caseCount: number; passedCount: number; allPassed: boolean; actor: string; createdAt: string }

export interface KnowledgeReviewBasis { candidate: KnowledgeRuleCandidate; validation: KnowledgeTestRun | null; possibleConflicts: KnowledgeDetail['possibleConflicts']; fingerprint: string }
export interface KnowledgeReviewEvent { id: string; candidateId: string; operation: string; submissionId: string | null; basis: KnowledgeReviewBasis; action: string | null; unavailableAction: string | null; standardVerified: boolean; evidenceVerified: boolean; testsVerified: boolean; assessment: string | null; actorId: string; actor: string; time: string; reason: string }
export interface KnowledgeReviewPreview { revision: number; status: string; current: KnowledgeReviewBasis; issues: KnowledgeAssessment['issues']; gaps: string[]; submission: KnowledgeReviewEvent | null; latest: KnowledgeReviewEvent | null; basisUnchanged: boolean; allowedOperations: string[]; reviewerRestrictions: string[] }
export interface KnowledgeReviewCommand { expectedRevision: number; operation: string; expectedBasisHash: string; reason: string; action?: string; unavailableAction?: string; standardVerified?: boolean; evidenceVerified?: boolean; testsVerified?: boolean; assessment?: string }
export interface KnowledgeReviewSummary { id: string; operation: string; submissionId: string | null; actor: string; time: string; reason: string }

export interface KnowledgeDeploymentPreview { revision: number; organizationId: string; departmentId: string; approval: KnowledgeReviewEvent | null; gaps: string[]; deployments: RuleDeployment[] }
export interface KnowledgeDeploymentCommand { expectedRevision: number; operation: 'DEPLOY' | 'PAUSE'; mode: 'SHADOW' | 'ENFORCED'; expectedBasisHash?: string; deploymentId?: string; effectiveTo?: string; reason: string }
export interface KnowledgeFeedbackState { id: string; revision: number; operation: string; verdict: string | null; actor: string; time: string }
export interface KnowledgeObservation { id: string; deploymentId: string; prescriptionId: string; time: string; outcome: string; reasons: string[]; matchedOrderIds: string[]; feedback?: KnowledgeFeedbackState | null }
export interface KnowledgeObservations { organizationId: string; departmentId: string; counts: Record<string, number>; records: KnowledgeReplayPage<KnowledgeObservation>; feedback?: { recorded: number; pending: number; verdicts: Record<string, number> } }
export interface KnowledgeFeedbackBasis { candidateId: string; deploymentId: string; runId: string; organizationId: string; departmentId: string; outcome: string; runHash: string; releaseFingerprint: string | null; programHash: string | null; knowledgeHash: string | null; fingerprint: string }
export interface KnowledgeFeedbackEvent extends KnowledgeFeedbackState { assessment: string | null; evidence: string | null; suggestion: string | null; reason: string; basis: KnowledgeFeedbackBasis; actorId: string }
export interface KnowledgeFeedbackDetail { basis: KnowledgeFeedbackBasis; observation: KnowledgeObservation; input: KnowledgeReplayRun['input'] | null; frozenCandidate: KnowledgeRuleCandidate | null; gaps: string[]; allowedVerdicts: string[]; latest: KnowledgeFeedbackEvent | null; canWithdraw: boolean; history: KnowledgeReplayPage<KnowledgeFeedbackEvent> }
export interface KnowledgeFeedbackCommand { expectedRevision: number; expectedBasisHash: string; operation: 'RECORD' | 'WITHDRAW'; verdict?: string; assessment?: string; evidence?: string; suggestion?: string; reason: string }

export interface RuleIntakeCapability { kind: string; name: string; knowledgeWorkflow: boolean; prerequisites: string[]; boundary: string }
export interface RuleIntakeCitation { source: string; quote: string; start: number; end: number }
export interface RuleIntakeRun {
  id: string; parentId: string | null; input: { requirement: string; clarifications: { analysisId: string; questionId: string; question: string; answer: string }[] }; inputHash: string; model: string; promptVersion: string; capabilityVersion: string;
  result: { status: string; intents: { kind: string; name: string; citation: RuleIntakeCitation; scope: string; scopeCitation: RuleIntakeCitation | null; conditions: { dimension: string; citation: RuleIntakeCitation }[]; capability: RuleIntakeCapability }[]; questions: { id: string; text: string; origin: string }[]; notes: string[] };
  resultHash: string; rawOutput: string; rawTruncated: boolean; actorId: string; actor: string; createdAt: string
}

export interface KnowledgePublicationBasis { operation: string; sourceDeploymentId: string; shadowDeploymentId: string; throughRunId: string; approval: KnowledgeReviewEvent; observations: { runId: string; runHash: string; outcome: string; time: string; feedback: KnowledgeFeedbackEvent | null }[]; outcomes: Record<string, number>; fingerprint: string }
export interface KnowledgePublicationPreview { revision: number; candidateId: string; organizationId: string; departmentId: string; basis: KnowledgePublicationBasis; gaps: string[]; notices: string[]; formalDeployments: RuleDeployment[] }
export interface KnowledgePublicationCommand { expectedRevision: number; operation: 'PROMOTE' | 'ROLLBACK'; sourceDeploymentId: string; throughRunId: string; expectedFingerprint: string; effectiveTo?: string; assessment: string; rollbackPlan: string; reason: string; observationsConfirmed: boolean; actionsConfirmed: boolean; rollbackConfirmed: boolean }
export interface KnowledgePublicationAuthorization { id: string; tenantId: string; deploymentId: string; candidateId: string; organizationId: string; departmentId: string; basis: KnowledgePublicationBasis; assessment: string; rollbackPlan: string; reason: string; actorId: string; actor: string; time: string }

export interface IntakeFeedbackOrigin { pharmacy?: null; feedback: KnowledgeFeedbackEvent; knowledgeId: string; knowledgeVersion: number; title: string }

export interface PharmacyIntakeOrigin { feedback: null; knowledgeId: string | null; knowledgeVersion: number; title: string; pharmacy: { organizationId: string; departmentId: string; taskId: string; review: PharmacyReview; finding: MedicationSafetyFinding | null } }
export type IntakeImprovementOrigin = IntakeFeedbackOrigin | PharmacyIntakeOrigin
