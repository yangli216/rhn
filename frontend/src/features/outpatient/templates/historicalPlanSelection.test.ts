import { describe, expect, it } from 'vitest'
import type { HistoricalPlanComparison } from '../../../shared/api/outpatientPlanTemplatesApi'
import { selectHistoricalPlanDifferences } from './historicalPlanSelection'

function fixture(): HistoricalPlanComparison {
  return { historicalPlan: { encounterId: 'current', sourceEncounterId: 'history', conditionTitle: '既往方案', summary: '',
    guidanceNotes: [], reviewItems: [], assessedCategories: ['DIAGNOSIS', 'MEDICATION', 'SERVICE'], diagnoses: [], medications: [], services: [] }, standardPlan: { id: 'standard', revision: 1, name: '标准方案',
    diagnoses: [], services: [], medications: [
      { medicationId: 'med', catalogItemId: 'product', quantity: 1, doseValue: 5, substitutionAllowed: false, selfProvided: false },
      { medicationId: 'med', catalogItemId: 'product', quantity: 2, doseValue: 10, substitutionAllowed: false, selfProvided: false },
    ] }, differences: [
      { key: 'one', category: 'MEDICATION', status: 'MISSING_IN_HISTORY', standardIndex: 0, reason: '' },
      { key: 'two', category: 'MEDICATION', status: 'MISSING_IN_HISTORY', standardIndex: 1, reason: '' },
    ] }
}
describe('historical plan selection', () => {
  it('preserves both explicitly selected regimens without deduplicating by product', () => {
    const result = selectHistoricalPlanDifferences(fixture(), 'current', 'standard', new Set(['one', 'two']), new Map([['one', 'STANDARD'], ['two', 'STANDARD']]))
    expect(result.medications.map(item => item.doseValue)).toEqual([5, 10])
  })
  it.each(['missing-index', 'null-index', 'out-of-range', 'negative', 'unknown-source', 'missing-key', 'duplicate-key', 'duplicate-position', 'wrong-encounter', 'wrong-template', 'unconfirmed-status', 'unknown-status', 'missing-coverage', 'unassessed-category', 'unverified-history-absence'])(
    'rejects unconfirmed selected differences: %s', failure => {
      const comparison = fixture(), keys = new Set(['one', 'two']), sources = new Map<'one' | 'two', 'STANDARD'>([['one', 'STANDARD'], ['two', 'STANDARD']])
      if (failure === 'unconfirmed-status') comparison.differences[1].status = 'NEEDS_REVIEW'
      if (failure === 'unknown-status') comparison.differences[1].status = 'UNKNOWN' as typeof comparison.differences[1]['status']
      if (failure === 'missing-coverage') Object.assign(comparison.historicalPlan, { assessedCategories: undefined })
      if (failure === 'unassessed-category') comparison.historicalPlan.assessedCategories = ['DIAGNOSIS']
      if (failure === 'unverified-history-absence') comparison.historicalPlan.reviewItems = [
        { category: 'MEDICATION', sourceId: 'original', reason: '用法待核对' },
      ]
      if (failure === 'null-index') comparison.differences[1].standardIndex = null
      if (failure === 'missing-index') comparison.differences[1].standardIndex = undefined
      if (failure === 'out-of-range') comparison.differences[1].standardIndex = 99
      if (failure === 'negative') comparison.differences[1].standardIndex = -1
      if (failure === 'unknown-source') sources.delete('two')
      if (failure === 'missing-key') keys.add('missing')
      if (failure === 'duplicate-key') comparison.differences[1].key = 'one'
      if (failure === 'duplicate-position') comparison.differences[1].standardIndex = 0
      if (failure === 'wrong-encounter') comparison.historicalPlan.encounterId = 'other'
      if (failure === 'wrong-template') comparison.standardPlan.id = 'other'
      expect(() => selectHistoricalPlanDifferences(comparison, 'current', 'standard', keys, sources)).toThrow(/本次未带入/)
    })
})
