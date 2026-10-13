export interface DiagnosticReferenceRule {
  code: string; gender?: 'MALE' | 'FEMALE'; minimumAgeDays?: number; maximumAgeDays?: number
  instrumentCode?: string; populationCode?: string; referenceLow?: number; referenceHigh?: number
  criticalLow?: number; criticalHigh?: number; criticalCodes: string[]
}
export interface DiagnosticIndicatorDefinition {
  code: string; name: string; valueType: 'NUMBER' | 'STRING' | 'CODE'; unitCode?: string; precision?: number
  required: boolean; methodCode?: string; specimenType?: string; allowedCodes: string[]; rules: DiagnosticReferenceRule[]
}
export interface DiagnosticPhrase { code: string; title: string; findings: string; conclusion: string }
export interface DiagnosticTemplateContent {
  indicators: DiagnosticIndicatorDefinition[]; phrases: DiagnosticPhrase[]; requiredChecks: string[]; minimumImages: number
}
export interface DiagnosticTemplateVersion {
  id: string; organizationId: string; catalogItemId: string; version: number; serviceType: 'LABORATORY' | 'EXAMINATION'
  effectiveFrom: string; publicationBasis: string; publishedBy: string; publishedAt: string; content: DiagnosticTemplateContent
}
export interface DiagnosticTemplatePublication {
  expectedVersion: number; effectiveFrom: string; publicationBasis: string; content: DiagnosticTemplateContent
}
/** The saved backend snapshot is the source for old drafts and corrections. */
export function readDiagnosticTemplateSnapshot(snapshot?: string): DiagnosticTemplateVersion | undefined {
  if (!snapshot) return undefined
  try {
    const value = JSON.parse(snapshot) as DiagnosticTemplateVersion
    return value && typeof value.id === 'string' && Number.isInteger(value.version)
      && value.content && Array.isArray(value.content.indicators) && Array.isArray(value.content.phrases)
      && Array.isArray(value.content.requiredChecks) ? value : undefined
  } catch { return undefined }
}
