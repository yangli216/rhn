import { describe, expect, it } from 'vitest'
import type { ClinicalAiDraftContext, ClinicalAiSuggestion } from '../../../shared/api/clinicalAiApi'
import {
  canApplyClinicalAiSuggestion, clinicalAiContextFingerprint, mergeAiDiagnoses, mergeAiRecordDraft,
} from './aiDraftAdapter'

function makeContext(overrides: Partial<ClinicalAiDraftContext> = {}): ClinicalAiDraftContext {
  return {
    encounterId: 'enc-1', residentId: 'resident-1', encounterStatus: 'IN_PROGRESS',
    documentVersion: 1, documentStatus: 'DRAFT', structuredContextFingerprint: 'structured-1',
    medicationDraftFingerprint: 'medications-1', serviceDraftFingerprint: 'services-1',
    allergyContextFingerprint: 'allergies-1', allergyState: 'READY', busy: false,
    chiefComplaint: '咳嗽', diagnoses: [], ...overrides,
  }
}

function makeSuggestion(context: ClinicalAiDraftContext,
  overrides: Partial<ClinicalAiSuggestion> = {}): ClinicalAiSuggestion {
  return {
    id: '1', status: 'GENERATED', contextHash: 'server-hash',
    clientContextFingerprint: clinicalAiContextFingerprint(context), provider: 'local-assist',
    promptVersion: 'local-assist-v1',
    generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    summary: '', recordDraft: {}, diagnosisCandidates: [], differentialDiagnoses: [],
    missingInformation: [], safetyAlerts: [], recommendedPlans: [], disclaimer: '', ...overrides,
  }
}

describe('clinical AI draft adapter', () => {
  it('fills only empty record sections by default', () => {
    expect(mergeAiRecordDraft({ chiefComplaint: '头晕三天', presentIllness: '' }, {
      chiefComplaint: '不能覆盖', presentIllness: '三天前出现头晕，演变情况待补充。',
    })).toEqual({ chiefComplaint: '头晕三天', presentIllness: '三天前出现头晕，演变情况待补充。' })
  })

  it('deduplicates diagnoses and preserves a single primary diagnosis', () => {
    expect(mergeAiDiagnoses(
      [{ code: 'I10', display: '原发性高血压', type: 'PRIMARY' }],
      [{ code: 'i10', display: '高血压', type: 'PRIMARY' },
        { code: 'R05', display: '咳嗽', type: 'PRIMARY' }],
    )).toEqual([
      { code: 'I10', display: '原发性高血压', type: 'PRIMARY' },
      { code: 'R05', display: '咳嗽', type: 'SECONDARY' },
    ])
  })

  it('creates a stable fingerprint independent of diagnosis order', () => {
    const base = makeContext({ diagnoses: [
      { code: 'R05', display: '咳嗽', type: 'SECONDARY' },
      { code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' },
    ] })
    expect(clinicalAiContextFingerprint(base)).toBe(clinicalAiContextFingerprint({
      ...base, diagnoses: [...base.diagnoses].reverse(),
    }))
    expect(clinicalAiContextFingerprint(base)).not.toBe(clinicalAiContextFingerprint({
      ...base, encounterId: 'enc-2', residentId: 'resident-2',
    }))
    expect(clinicalAiContextFingerprint(base)).toMatch(/^ctx-v2-[0-9a-f]{32}$/)
  })

  it('rejects a suggestion after the clinical context changes', () => {
    const context = makeContext()
    const suggestion = makeSuggestion(context)
    expect(canApplyClinicalAiSuggestion(suggestion, context)).toBe(true)
    expect(canApplyClinicalAiSuggestion(suggestion, { ...context, chiefComplaint: '咳嗽伴发热' })).toBe(false)
  })

  it.each(['IGNORED', 'ADOPTED'] as const)('rejects a %s suggestion', (status) => {
    const context = makeContext()
    expect(canApplyClinicalAiSuggestion(makeSuggestion(context, { status }), context)).toBe(false)
  })

  it('rejects while the current clinical workflow is busy', () => {
    const context = makeContext({ busy: true })
    expect(canApplyClinicalAiSuggestion(makeSuggestion(context), context)).toBe(false)
  })

  it('rejects an expired suggestion by status or timestamp', () => {
    const context = makeContext()
    expect(canApplyClinicalAiSuggestion(makeSuggestion(context, { status: 'EXPIRED' }), context)).toBe(false)
    expect(canApplyClinicalAiSuggestion(makeSuggestion(context, {
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    }), context)).toBe(false)
  })

  it('rejects when either patient anchor changes', () => {
    const context = makeContext()
    const suggestion = makeSuggestion(context)
    expect(canApplyClinicalAiSuggestion(suggestion, { ...context, encounterId: 'enc-2' })).toBe(false)
    expect(canApplyClinicalAiSuggestion(suggestion, { ...context, residentId: 'resident-2' })).toBe(false)
  })

  it('invalidates the suggestion when height or weight changes', () => {
    const context = makeContext({ heightCm: 168, weightKg: 62 })
    const suggestion = makeSuggestion(context)
    expect(canApplyClinicalAiSuggestion(suggestion, { ...context, heightCm: 169 })).toBe(false)
    expect(canApplyClinicalAiSuggestion(suggestion, { ...context, weightKg: 63 })).toBe(false)
  })
})
