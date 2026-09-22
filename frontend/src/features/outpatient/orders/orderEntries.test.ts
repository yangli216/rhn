import { describe, expect, it } from 'vitest'
import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'
import { buildAdministrationGroups } from './administrationGroups'
import { draftOrderEntries, savedOrderEntries, findGroupingComposerTarget } from './orderEntries'

const medication = (id: string, group: string | undefined, sequence: number): MedicationPlanDraft => ({
  id, sequence, administrationGroupKey: group, editorMode: 'regular', categoryCode: 'WESTERN',
  medicationName: id, medicationCode: id, productName: id, routeExecutionType: 'INFUSION',
  request: { medicationId: id, routeCode: 'IV', frequencyCode: 'QD', durationValue: 3, quantity: 1,
    substitutionAllowed: true, selfProvided: false },
})

describe('order list projections', () => {
  it('places the shared composer after the last draft in its group, ahead of unrelated rows', () => {
    const drafts = draftOrderEntries([], [medication('head', 'request:saved', 1),
      medication('tail', 'request:saved', 2), medication('other', 'g2', 3)])
    const saved = savedOrderEntries([], [{ id: 'saved', authoredAt: '' }] as MedicationRequest[])
    expect(findGroupingComposerTarget(saved, drafts, 'request:saved', true)).toEqual({ type: 'draft', index: 1 })
  })

  it.each(['saved', 'request:saved'])('finds a saved infusion group through head or parent key %s', (key) => {
    const saved = savedOrderEntries([], [{ id: 'saved', prescriptionId: 'rx', authoredAt: '1' },
      { id: 'child', parentRequestId: 'saved', prescriptionId: 'rx', authoredAt: '2' }] as MedicationRequest[])
    expect(findGroupingComposerTarget(saved, [], key, true)).toEqual({ type: 'saved', index: 1 })
  })

  it('does not insert a grouped composer when closed or the group is missing', () => {
    const drafts = draftOrderEntries([], [medication('head', 'g1', 1)])
    expect(findGroupingComposerTarget([], drafts, 'g1', false)).toBeNull()
    expect(findGroupingComposerTarget([], drafts, undefined, true)).toBeNull()
    expect(findGroupingComposerTarget([], drafts, 'missing', true)).toBeNull()
  })

  it('keeps infusion members together using the first member sequence without mutating input', () => {
    const medications = [medication('tail', 'g1', 4), medication('single', undefined, 3), medication('head', 'g1', 1)]
    const services: ServicePlanDraft[] = [{ id: 'lab', sequence: 2, catalogItemId: 'lab', itemCode: 'LAB', itemName: '检验', quantity: 1 }]
    expect(draftOrderEntries(services, medications).map((item) => item.value.id)).toEqual(['head', 'tail', 'lab', 'single'])
    expect(medications.map((item) => item.id)).toEqual(['tail', 'single', 'head'])
  })

  it('keeps saved prescription rows adjacent while ordering documents by first authored time', () => {
    const medications = [
      { id: 'tail', prescriptionId: 'rx1', authoredAt: '2026-09-22T10:00:00Z' },
      { id: 'head', prescriptionId: 'rx1', authoredAt: '2026-09-22T08:00:00Z' },
    ] as MedicationRequest[]
    const services = [{ id: 'lab', authoredAt: '2026-09-22T09:00:00Z' }] as ServiceRequest[]
    expect(savedOrderEntries(services, medications).map((item) => item.value.id)).toEqual(['head', 'tail', 'lab'])
    expect(medications.map((item) => item.id)).toEqual(['tail', 'head'])
  })

  it('joins draft members to a saved infusion group and excludes cancelled and non-infusion requests', () => {
    const medications = [
      { id: 'head', medicationName: '组头', status: 'ACTIVE', routeExecutionType: 'INFUSION', routeCode: 'IV', frequencyCode: 'QD' },
      { id: 'tail', parentRequestId: 'head', medicationName: '同组药', status: 'ACTIVE', routeExecutionType: 'INFUSION' },
      { id: 'cancelled', status: 'CANCELLED', routeExecutionType: 'INFUSION' },
      { id: 'oral', status: 'ACTIVE', routeExecutionType: 'NONE' },
    ] as MedicationRequest[]
    const groups = buildAdministrationGroups(medications, [medication('new', 'request:head', 1)], 'draft:empty')
    expect(groups.requestLabels.get('head')).toBe(groups.draftLabels.get('new'))
    expect(groups.existingGroups).toEqual([expect.objectContaining({ key: 'request:head', isRequest: true,
      medicationNames: ['组头', '同组药', 'new'], routeCode: 'IV', frequencyCode: 'QD' })])
    expect(groups.requestLabels.has('cancelled')).toBe(false)
    expect(groups.requestLabels.has('oral')).toBe(false)
    expect(groups.options).toHaveLength(2)
    expect(groups.currentLabel).toBe('IV-02')
  })
})
