import type { KnowledgeBody, KnowledgeEvidence, KnowledgeRoutes, KnowledgeTarget, RuleCard } from '../../shared/api/medicationKnowledgeDraftApi'

export const cardActionNames: Record<string, string> = { WARN: '警告提示', REQUIRE_OVERRIDE: '需理由后继续', BLOCK: '阻断' }
const ageText = (c: RuleCard) => {
  if (c.ageMode === 'ALL') return '不限年龄'
  if (c.ageMode !== 'RANGE') return ''
  const unit = c.ageUnit === 'MONTH' ? '月龄' : c.ageUnit === 'DAY' ? '日龄' : '岁'
  const min = c.minimumAgeInclusive, max = c.maximumAgeExclusive
  if (min != null && max != null) return `${min}${unit}（含）至 ${max}${unit}（不含）`
  if (min != null) return `${min}${unit}及以上`
  if (max != null) return `${max}${unit}以下`
  return ''
}
const join = (names: string[]) => names.join('、')

/** The plain-language sentence a maintainer reads and confirms. Built from slots only, never from model prose. */
export function cardSentence(c: RuleCard): string {
  if (c.kind === 'DRUG_INTERACTION') {
    const age = ageText(c), route = c.routesA.length ? `（${join(c.routesA)}）` : ''
    return `${age ? `${age}患者，` : ''}同一处方中，${c.groupA.length ? join(c.groupA) : '【A 组药品待补充】'}${route} 与 ${c.groupB.length ? join(c.groupB) : '【B 组药品待补充】'} 同时开立时，${c.proposedAction ? cardActionNames[c.proposedAction] : '【处置方式待确认】'}。`
  }
  if (c.kind === 'DUPLICATE_THERAPY') {
    const age = ageText(c), scope = c.matchMode === 'EXPLICIT_GROUP' ? (c.groupA.length ? join(c.groupA) : '【药品待补充】') : '同一标准药品'
    return `${age ? `${age}患者，` : ''}同一处方中，${scope}重复开立达 ${c.minimumOrders ?? 2} 条医嘱时，${c.proposedAction ? cardActionNames[c.proposedAction] : '【处置方式待确认】'}。`
  }
  return c.quote || c.title
}

const resolveRoutes = (names: string[], routes: { code: string; name: string }[]): { value: KnowledgeRoutes; unresolved: string[] } => {
  if (!names.length) return { value: { mode: 'UNSPECIFIED', codes: [] }, unresolved: [] }
  const codes: string[] = [], unresolved: string[] = []
  for (const name of names) { const hit = routes.find(r => r.name === name); if (hit) { if (!codes.includes(hit.code)) codes.push(hit.code) } else unresolved.push(name) }
  // A partial list would silently narrow applicability, so any unknown name leaves the whole condition undecided.
  return unresolved.length ? { value: { mode: 'UNSPECIFIED', codes: [] }, unresolved } : { value: { mode: 'LIST', codes }, unresolved }
}

/** Deterministic card → knowledge draft compilation. Anything not expressible is kept in additionalConditions, never dropped. */
export function compileCard(card: RuleCard, evidence: KnowledgeEvidence, targets: { A: KnowledgeTarget[]; B: KnowledgeTarget[] }, routes: { code: string; name: string }[]): KnowledgeBody {
  const interaction = card.kind === 'DRUG_INTERACTION'
  const a = resolveRoutes(card.routesA, routes), b = resolveRoutes(card.routesB, routes)
  const notes: string[] = []
  if (card.boundaryNote) notes.push(card.boundaryNote)
  if (card.otherConditions) notes.push(card.otherConditions)
  const free = (names: string[], picked: KnowledgeTarget[], label: string) => { if (names.length && !picked.length) notes.push(`${label}尚未关联标准药品：${join(names)}`) }
  free(card.groupA, targets.A, interaction ? 'A 组' : '药品组'); if (interaction) free(card.groupB, targets.B, 'B 组')
  const unresolved = [...a.unresolved, ...b.unresolved]
  if (unresolved.length) notes.push(`给药途径尚未标准化：${unresolved.join('、')}`)
  const range = card.ageMode === 'RANGE'
  return {
    title: card.title, kind: card.kind, matchMode: card.matchMode ?? (interaction ? 'GROUP_PAIR' : 'SAME_STANDARD_ENTRY'), groupA: targets.A, groupB: interaction ? targets.B : [],
    minimumOrders: interaction ? null : card.minimumOrders ?? 2, exposureScope: card.exposureScope ?? 'SAME_PRESCRIPTION',
    conditions: { ageMode: card.ageMode ?? 'UNSPECIFIED', ageUnit: range ? card.ageUnit ?? 'YEAR' : 'YEAR', minimumAgeInclusive: range ? card.minimumAgeInclusive : null, maximumAgeExclusive: range ? card.maximumAgeExclusive : null,
      groupARoutes: a.value, groupBRoutes: interaction ? b.value : { mode: 'ALL', codes: [] }, additionalConditions: notes.join('\n') },
    evidence: { ...evidence, excerpt: evidence.excerpt }, clinicalMeaning: card.clinicalMeaning, severity: card.severity ?? '', proposedAction: card.proposedAction ?? '',
  }
}
