import type { GroupingComposerTarget } from './orderListTypes'
import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'

export type SavedOrderEntry = { kind: 'service'; value: ServiceRequest } | { kind: 'medication'; value: MedicationRequest }
export type DraftOrderEntry = { kind: 'service'; value: ServicePlanDraft } | { kind: 'medication'; value: MedicationPlanDraft }

export function savedOrderEntries(services: ServiceRequest[], medications: MedicationRequest[]): SavedOrderEntry[] {
  const raw = [
    ...services.map((value) => ({ kind: 'service' as const, value })),
    ...medications.map((value) => ({ kind: 'medication' as const, value })),
  ]
  const docKeyOf = (entry: typeof raw[0]) =>
    entry.kind === 'service' ? `service:${entry.value.id}` : `prescription:${entry.value.prescriptionId || entry.value.id}`

  const docFirstAuthoredAt = new Map<string, string>()
  for (const item of raw) {
    const k = docKeyOf(item)
    const current = docFirstAuthoredAt.get(k)
    if (!current || (item.value.authoredAt && item.value.authoredAt < current)) {
      docFirstAuthoredAt.set(k, item.value.authoredAt || '')
    }
  }
  return raw.sort((left, right) => {
    const leftDoc = docKeyOf(left)
    const rightDoc = docKeyOf(right)
    if (leftDoc !== rightDoc) {
      const leftDocTime = docFirstAuthoredAt.get(leftDoc) || ''
      const rightDocTime = docFirstAuthoredAt.get(rightDoc) || ''
      return leftDocTime.localeCompare(rightDocTime) || leftDoc.localeCompare(rightDoc)
    }
    return byAuthoredAt(left.value, right.value)
  })
}

// Pending rows are category groups, not the backend's final split documents.
export function draftCategoryOf(entry: DraftOrderEntry) {
  if (entry.kind === 'medication') {
    return entry.value.categoryCode === 'HERBAL' || entry.value.editorMode === 'herbal' ? 'herbal' : 'regular-med'
  }
  if (entry.value.serviceType === 'LABORATORY') return 'lab'
  if (entry.value.serviceType === 'EXAMINATION') return 'exam'
  return 'other-service'
}

export function draftOrderEntries(serviceDrafts: ServicePlanDraft[], medicationDrafts: MedicationPlanDraft[]): DraftOrderEntry[] {
  const rawEntries: Array<
    { kind: 'service'; value: ServicePlanDraft } | { kind: 'medication'; value: MedicationPlanDraft }
  > = [
    ...serviceDrafts.map((value) => ({ kind: 'service' as const, value })),
    ...medicationDrafts.map((value) => ({ kind: 'medication' as const, value })),
  ]

  const groupMinSeqMap = new Map<string, number>()
  for (const item of rawEntries) {
    if (item.kind === 'medication' && item.value.administrationGroupKey) {
      const key = item.value.administrationGroupKey
      const itemSeq = item.value.sequence ?? 0
      const prevMin = groupMinSeqMap.get(key)
      if (prevMin === undefined || itemSeq < prevMin) {
        groupMinSeqMap.set(key, itemSeq)
      }
    }
  }

  // Keep each category contiguous; preserve first-appearance order and infusion order within it.
  const categoryMinSequence = new Map<string, number>()
  for (const entry of rawEntries) {
    const category = draftCategoryOf(entry)
    categoryMinSequence.set(category, Math.min(categoryMinSequence.get(category) ?? Infinity, entry.value.sequence ?? 0))
  }
  const categories = [...categoryMinSequence.keys()].sort((left, right) =>
    categoryMinSequence.get(left)! - categoryMinSequence.get(right)!)

  return rawEntries.sort((left, right) => {
    const categoryOrder = categories.indexOf(draftCategoryOf(left)) - categories.indexOf(draftCategoryOf(right))
    if (categoryOrder) return categoryOrder
    const leftGroup = left.kind === 'medication' ? left.value.administrationGroupKey : undefined
    const rightGroup = right.kind === 'medication' ? right.value.administrationGroupKey : undefined

    if (leftGroup && rightGroup && leftGroup === rightGroup) {
      return bySequence(left.value, right.value)
    }

    const leftBaseSeq = leftGroup ? (groupMinSeqMap.get(leftGroup) ?? 0) : (left.value.sequence ?? 0)
    const rightBaseSeq = rightGroup ? (groupMinSeqMap.get(rightGroup) ?? 0) : (right.value.sequence ?? 0)

    if (leftBaseSeq !== rightBaseSeq) {
      return leftBaseSeq - rightBaseSeq
    }
    return bySequence(left.value, right.value)
  })
}

function byAuthoredAt(left: { authoredAt: string }, right: { authoredAt: string }) {
  return left.authoredAt.localeCompare(right.authoredAt)
}

function bySequence(left: { sequence?: number }, right: { sequence?: number }) {
  return (left.sequence ?? 0) - (right.sequence ?? 0)
}

export function findGroupingComposerTarget(savedEntries: SavedOrderEntry[], draftEntries: DraftOrderEntry[],
  groupKey: string | undefined, isComposerActive: boolean): GroupingComposerTarget {
  if (!isComposerActive || groupKey === undefined) return null
  for (let i = draftEntries.length - 1; i >= 0; i--) {
    const d = draftEntries[i]
    if (d.kind === 'medication' && d.value.administrationGroupKey === groupKey) {
      return { type: 'draft' as const, index: i }
    }
  }
  for (let i = savedEntries.length - 1; i >= 0; i--) {
    const s = savedEntries[i]
    if (s.kind === 'medication' && (
      s.value.id === groupKey ||
      s.value.parentRequestId === groupKey ||
      `request:${s.value.id}` === groupKey ||
      `request:${s.value.parentRequestId}` === groupKey
    )) {
      return { type: 'saved' as const, index: i }
    }
  }
  return null
}
