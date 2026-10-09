import { describe, expect, it } from 'vitest'
import { aiMedicationValidation, medicationCandidateDraft } from './aiPlanMedicationFacts'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

describe('AI medication confirmation facts', () => {
  const candidate = { key: 'product:1', id: '1', medicationId: 'med', name: '药品', isGenericOnly: false,
    quantityUnit: '盒', defaultDose: 10, doseUnit: 'g', defaultRoute: 'PO', defaultFrequency: 'BID' }
  const complete = { ...medicationCandidateDraft(candidate), doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID', quantity: 2 }
  it('prefills confirmed catalog defaults and a single package without inventing a course', () => {
    expect(medicationCandidateDraft(candidate)).toMatchObject({ medicationId: 'med', catalogItemId: '1', quantity: 1,
      quantityUnit: '盒', doseValue: 10, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'BID' })
    expect(medicationCandidateDraft(candidate).durationValue).toBeUndefined()
  })
  it('prefers dosage and course extracted from the reviewed recommendation', () => {
    expect(medicationCandidateDraft(candidate, '常规用法：每次0.5g 口服 tid 疗程7天')).toMatchObject({
      doseValue: 0.5, doseUnit: 'g', routeCode: 'PO', frequencyCode: 'TID', durationValue: 7, durationUnit: '天', quantity: 1,
    })
  })
  it.each([{}, { quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { quantityUnit: '' }, { doseValue: 0 },
    { doseUnit: 'unknown' }, { routeCode: 'ORAL' }, { frequencyCode: 'QD' }, { durationValue: 3 },
    { durationValue: -1, durationUnit: 'd' }, { durationValue: 3, durationUnit: 'unknown' }])('rejects missing or unconfirmed fields: %o', patch => {
    const item = Object.keys(patch).length ? { ...complete, ...patch } : { ...medicationCandidateDraft(candidate), quantity: Number.NaN }
    expect(aiMedicationValidation(item, editorStandardsFixture(), true)).not.toBe('')
  })
  it('requires live standards even when all values look familiar', () => {
    expect(aiMedicationValidation(complete, undefined)).not.toBe('')
    expect(aiMedicationValidation(complete, editorStandardsFixture(), true)).toBe('')
  })
  it('allows catalog defaults for a manual addition and requires complete directions for an aligned recommendation', () => {
    const partial = { ...medicationCandidateDraft({ ...candidate, defaultDose: null, doseUnit: null, defaultRoute: null, defaultFrequency: null }), quantity: 2 }
    expect(aiMedicationValidation(partial, editorStandardsFixture())).toBe('')
    expect(aiMedicationValidation(partial, editorStandardsFixture(), true)).not.toBe('')
  })
})
