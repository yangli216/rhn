import { describe, expect, it } from 'vitest'
import { aiMedicationValidation, medicationCandidateDraft } from './aiPlanMedicationFacts'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

describe('AI medication confirmation facts', () => {
  const candidate = { key: 'product:1', id: '1', medicationId: 'med', name: '药品', isGenericOnly: false,
    quantityUnit: '盒', defaultDose: 10, doseUnit: 'g', defaultRoute: 'PO', defaultFrequency: 'BID' }
  const complete = { ...medicationCandidateDraft(candidate), doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID', quantity: 2 }
  it('does not adopt directory defaults or invent quantity and course', () => {
    expect(medicationCandidateDraft(candidate)).toMatchObject({ medicationId: 'med', catalogItemId: '1', quantity: NaN, quantityUnit: '盒' })
    expect(medicationCandidateDraft(candidate)).not.toHaveProperty('doseValue')
    expect(medicationCandidateDraft(candidate)).not.toHaveProperty('routeCode')
    expect(medicationCandidateDraft(candidate)).not.toHaveProperty('frequencyCode')
    expect(medicationCandidateDraft(candidate)).not.toHaveProperty('durationValue')
  })
  it.each([{}, { quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { quantityUnit: '' }, { doseValue: 0 },
    { doseUnit: 'unknown' }, { routeCode: 'ORAL' }, { frequencyCode: 'QD' }, { durationValue: 3 },
    { durationValue: -1, durationUnit: 'd' }, { durationValue: 3, durationUnit: 'unknown' }])('rejects missing or unconfirmed fields: %o', patch => {
    const item = Object.keys(patch).length ? { ...complete, ...patch } : medicationCandidateDraft(candidate)
    expect(aiMedicationValidation(item, editorStandardsFixture(), true)).not.toBe('')
  })
  it('requires live standards even when all values look familiar', () => {
    expect(aiMedicationValidation(complete, undefined)).not.toBe('')
    expect(aiMedicationValidation(complete, editorStandardsFixture(), true)).toBe('')
  })
  it('keeps optional fields empty for a manually confirmed partial template but not an aligned recommendation', () => {
    const partial = { ...medicationCandidateDraft(candidate), quantity: 2 }
    expect(aiMedicationValidation(partial, editorStandardsFixture())).toBe('')
    expect(aiMedicationValidation(partial, editorStandardsFixture(), true)).not.toBe('')
  })
})
