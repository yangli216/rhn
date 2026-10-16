import { describe, expect, it } from 'vitest'
import type { RuleCard } from '../../shared/api/medicationKnowledgeDraftApi'
import { cardSentence, compileCard } from './ruleCards'

const base: RuleCard = { id: 'c1', kind: 'DRUG_INTERACTION', title: '甲与乙', quote: '甲与乙不得合用', groupA: ['甲'], groupB: ['乙'], matchMode: 'GROUP_PAIR', exposureScope: 'SAME_PRESCRIPTION', minimumOrders: null,
  ageMode: 'RANGE', ageUnit: 'YEAR', minimumAgeInclusive: 0, maximumAgeExclusive: 18, routesA: ['口服', '雾化'], routesB: [], proposedAction: 'BLOCK', severity: 'HIGH', clinicalMeaning: '风险', otherConditions: '', questions: [], boundaryNote: null }
const evidence = { sourceType: 'INSTITUTION_POLICY', title: '制度', publisher: '', edition: '', locator: '', excerpt: '甲与乙不得合用', documentHash: '', effectiveFrom: null, effectiveTo: null }
const routes = [{ code: 'PO', name: '口服' }]

describe('rule cards', () => {
  it('describes the rule in plain language and marks missing slots', () => {
    expect(cardSentence(base)).toBe('0岁（含）至 18岁（不含）患者，同一处方中，甲（口服、雾化） 与 乙 同时开立时，阻断。')
    expect(cardSentence({ ...base, groupB: [], proposedAction: null })).toContain('【B 组药品待补充】')
    expect(cardSentence({ ...base, groupB: [], proposedAction: null })).toContain('【处置方式待确认】')
  })
  it('keeps the boundary note in the draft so the limit stays visible after confirmation', () => {
    expect(compileCard({ ...base, boundaryNote: '只能按同一处方同时开立判断' }, evidence, { A: [], B: [] }, routes).conditions.additionalConditions).toContain('只能按同一处方同时开立判断')
  })
  it('compiles deterministically and keeps what cannot be expressed instead of dropping or widening it', () => {
    const body = compileCard(base, evidence, { A: [], B: [] }, routes)
    expect(body.conditions.groupARoutes).toEqual({ mode: 'UNSPECIFIED', codes: [] })
    expect(body.conditions.additionalConditions).toContain('A 组尚未关联标准药品：甲')
    expect(body.conditions.additionalConditions).toContain('给药途径尚未标准化：雾化')
    expect(body.conditions.maximumAgeExclusive).toBe(18)
    const resolved = compileCard({ ...base, routesA: ['口服'] }, evidence, { A: [], B: [] }, routes)
    expect(resolved.conditions.groupARoutes).toEqual({ mode: 'LIST', codes: ['PO'] })
    expect(compileCard({ ...base, ageMode: null, routesA: [] }, evidence, { A: [], B: [] }, routes).conditions).toMatchObject({ ageMode: 'UNSPECIFIED', groupARoutes: { mode: 'UNSPECIFIED' } })
  })
})
