import { describe, expect, it } from 'vitest'
import { defaultReferenceNote, evaluateIndicatorValue, findReferenceGuidance, matchApplicableReferenceRule, matchPresetTemplateByTask, nationalTemplateAsVersion, savedReferenceGuidance } from './nationalStandardLabCatalog'
const indicator = (code: string) => matchPresetTemplateByTask({ itemCode: code })!.content.indicators[0]
const conditions = { gender: '2' as const, ageDays: 51 * 365 }
describe('sourced routine biochemistry references', () => {
  it('selects reagent and instrument profiles explicitly', () => {
    const alt = indicator('25030500700')
    expect(matchApplicableReferenceRule(alt.rules, conditions)).toBeUndefined()
    expect(evaluateIndicatorValue(alt, '42', { ...conditions, instrumentCode: 'IFCC_NO_P5P' }).interpretationCode).toBe('H')
    expect(evaluateIndicatorValue(alt, '42', { ...conditions, instrumentCode: 'IFCC_P5P' }).interpretationCode).toBe('N')
    expect(matchApplicableReferenceRule(alt.rules, { ...conditions, instrumentCode: 'OTHER' })).toBeUndefined()
  })
  it('uses the female ALP age split and rejects out-of-scope ages', () => {
    const alp = indicator('25030501100')
    expect(evaluateIndicatorValue(alp, 120, { gender: '2', ageDays: 49 * 365 }).interpretationCode).toBe('H')
    expect(evaluateIndicatorValue(alp, 120, conditions).interpretationCode).toBe('N')
    expect(matchApplicableReferenceRule(alp.rules, { gender: '2', ageDays: 19 * 365 })).toBeUndefined()
    expect(matchApplicableReferenceRule(alp.rules, { gender: '2', ageDays: 80 * 365 })).toBeUndefined()
  })
  it('preserves older adult renal ranges and ID-MS conditions', () => {
    const urea = indicator('25030700100')
    expect(matchApplicableReferenceRule(urea.rules, { gender: '1', ageDays: 59 * 365 })?.referenceHigh).toBe(8)
    expect(matchApplicableReferenceRule(urea.rules, { gender: '1', ageDays: 60 * 365 })?.referenceHigh).toBe(9.5)
    const crea = indicator('25030700200')
    expect(matchApplicableReferenceRule(crea.rules, conditions)).toBeUndefined()
    expect(matchApplicableReferenceRule(crea.rules, { ...conditions, instrumentCode: 'IDMS_TRACEABLE' })?.referenceHigh).toBe(73)
    expect(matchApplicableReferenceRule(crea.rules, { gender: '2', ageDays: 70 * 365, instrumentCode: 'IDMS_TRACEABLE' })?.referenceHigh).toBe(81)
  })
  it.each([['25030400101', 3.5, 5.3], ['25030400201', 137, 147], ['25030400301', 99, 110], ['25030400401', 2.11, 2.52], ['25030400500', 0.85, 1.51], ['25030400600', 0.75, 1.02]])('matches %s without a guessed method threshold', (code, low, high) => {
    expect(matchApplicableReferenceRule(indicator(String(code)).rules, conditions)).toMatchObject({ referenceLow: low, referenceHigh: high })
  })
  it('requires a confirmed fasting nonpregnant condition for glucose', () => {
    const glucose = indicator('25030200100')
    expect(evaluateIndicatorValue(glucose, 5, conditions).interpretationCode).toBeUndefined()
    expect(evaluateIndicatorValue(glucose, 5, { ...conditions, populationCode: 'RANDOM' }).interpretationCode).toBeUndefined()
    expect(evaluateIndicatorValue(glucose, 5, { ...conditions, populationCode: 'FASTING8H_NONPREGNANT' }).interpretationCode).toBe('N')
  })
  it('keeps exact clinical decision guidance separate from numeric normality and freezes it in report notes', () => {
    const preset = matchPresetTemplateByTask({ itemCode: '25030300100' })!
    const rule = matchApplicableReferenceRule(preset.content.indicators[0].rules, { ...conditions, populationCode: 'ASCVD_LOW_RISK_FASTING12H' })!
    expect(rule.referenceHigh).toBeUndefined()
    expect(findReferenceGuidance(rule.code)).toContain('＜5.2')
    expect(evaluateIndicatorValue(preset.content.indicators[0], 5.2, { ...conditions, populationCode: 'ASCVD_LOW_RISK_FASTING12H' }).interpretationCode).toBeUndefined()
    expect(defaultReferenceNote(nationalTemplateAsVersion(preset))).toContain('限ASCVD')
    expect(savedReferenceGuidance(JSON.stringify({ evaluation: { matchedRule: rule } }))).toContain('＜5.2')
    expect(savedReferenceGuidance('{')).toBeUndefined()
  })
  it('does not pick the first of conflicting matches', () => {
    const rules = indicator('25030400101').rules
    expect(matchApplicableReferenceRule([...rules, ...rules], conditions)).toBeUndefined()
  })
})
