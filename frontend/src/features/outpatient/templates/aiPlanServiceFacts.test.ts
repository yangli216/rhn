import { describe, expect, it } from 'vitest'
import { aiServiceValidation, serviceCandidateDraft } from './aiPlanServiceFacts'

const candidate = { id: 'service', name: '检查', code: 'S', unitCode: '次', organizationId: 'org', chargeable: true, serviceType: 'EXAMINATION' as const }
describe('AI plan service draft facts', () => {
  it('defaults a uniquely selected project to one and preserves explicit directory chargeability', () => {
    const draft = serviceCandidateDraft(candidate)
    expect(draft.quantity).toBe(1)
    expect(aiServiceValidation(draft)).toBe('')
    expect(serviceCandidateDraft({ ...candidate, chargeable: false }).pricingRequired).toBe(false)
    expect(aiServiceValidation({ ...draft, quantity: 2 })).toBe('')
  })
  it.each([NaN, Infinity, -1, 0])('rejects invalid quantity %s', quantity => {
    expect(aiServiceValidation({ ...serviceCandidateDraft(candidate), quantity })).not.toBe('')
  })
  it('does not default missing identity or units', () => {
    expect(aiServiceValidation({ ...serviceCandidateDraft(candidate), quantity: 2, catalogItemId: '' })).not.toBe('')
    expect(aiServiceValidation({ ...serviceCandidateDraft(candidate), quantity: 2, unitCode: '' })).not.toBe('')
  })
})
