import type { HistoricalPlanComparison, HistoricalStablePlan } from '../../../shared/api/outpatientPlanTemplatesApi'

export function hasHistoricalReviewEvidence(plan?: HistoricalStablePlan | null): boolean {
  const categories = ['DIAGNOSIS', 'MEDICATION', 'SERVICE']
  return Boolean(plan && Array.isArray(plan.reviewItems) && Array.isArray(plan.assessedCategories)
    && plan.assessedCategories.every(category => categories.includes(category))
    && plan.reviewItems.every(item => item && categories.includes(item.category)
      && typeof item.reason === 'string' && item.reason.trim().length > 0))
}

export function canSelectHistoricalPlanDifference(status: string): boolean {
  return ['CONSISTENT', 'CONFLICT', 'MISSING_IN_HISTORY', 'MISSING_IN_STANDARD'].includes(status)
}

export function selectHistoricalPlanDifferences(comparison: HistoricalPlanComparison, encounterId: string, standardId: string,
  keys: Set<string>, sources: Map<string, 'HISTORICAL' | 'STANDARD'>): HistoricalStablePlan {
  const fail = (): never => { throw new Error('方案差异或所选来源未确认，本次未带入，请重新加载比较结果。') }
  if (!hasHistoricalReviewEvidence(comparison.historicalPlan) || comparison.historicalPlan.encounterId !== encounterId || comparison.standardPlan.id !== standardId
    || !keys.size || !Array.isArray(comparison.differences)
    || new Set(comparison.differences.map(item => item.key)).size !== comparison.differences.length) return fail()
  const selected = comparison.differences.filter(item => keys.has(item.key))
  if (selected.length !== keys.size) return fail()
  const diagnoses: HistoricalStablePlan['diagnoses'] = [], medications: HistoricalStablePlan['medications'] = [], services: HistoricalStablePlan['services'] = []
  const positions = new Set<string>()
  for (const item of selected) {
    if (!canSelectHistoricalPlanDifference(item.status) || !comparison.historicalPlan.assessedCategories.includes(item.category)
      || (item.status === 'MISSING_IN_HISTORY' && comparison.historicalPlan.reviewItems.some(review => review.category === item.category))) return fail()
    const source = sources.get(item.key)
    if (source !== 'HISTORICAL' && source !== 'STANDARD') return fail()
    const index = source === 'HISTORICAL' ? item.historicalIndex : item.standardIndex
    if (index == null || !Number.isSafeInteger(index) || index < 0) return fail()
    const position = `${source}:${item.category}:${index}`
    if (positions.has(position)) return fail()
    positions.add(position)
    const plan = source === 'HISTORICAL' ? comparison.historicalPlan : comparison.standardPlan
    if (item.category === 'DIAGNOSIS') {
      if (!plan.diagnoses[index]) return fail()
      diagnoses.push(plan.diagnoses[index])
    } else if (item.category === 'MEDICATION') {
      if (!plan.medications[index]) return fail()
      medications.push(plan.medications[index])
    } else if (item.category === 'SERVICE') {
      if (!plan.services[index]) return fail()
      services.push(plan.services[index])
    } else return fail()
  }
  return { ...comparison.historicalPlan, conditionTitle: `${comparison.historicalPlan.conditionTitle} + ${comparison.standardPlan.name}`,
    summary: `已逐项比较历史稳定方案与“${comparison.standardPlan.name}”，仅带入医生勾选的项目。`, diagnoses, medications, services }
}
