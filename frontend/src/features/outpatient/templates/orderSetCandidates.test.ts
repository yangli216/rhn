import { describe, expect, it } from 'vitest'
import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { buildOrderSetCandidates, selectableCandidates } from './orderSetCandidates'

const medDraft = (id: string, medicationId: string, catalogItemId: string, doseValue = 1, herbal = false): MedicationPlanDraft => ({
  id, editorMode: herbal ? 'herbal' : 'regular', categoryCode: herbal ? 'HERBAL' : 'WESTERN', medicationName: `药${medicationId}`, medicationCode: 'C',
  productName: 'p', request: { medicationId, catalogItemId, doseValue, quantity: 1, quantityUnit: '盒', substitutionAllowed: true, selfProvided: false } })
const svcDraft = (id: string, catalogItemId: string): ServicePlanDraft => ({ id, catalogItemId, itemCode: `C${catalogItemId}`, itemName: `项${catalogItemId}`,
  serviceType: 'LABORATORY', quantity: 1, unitCode: '次' })
const medReq = (id: string, over: Partial<MedicationRequest> = {}) => ({ id, revision: 1, status: 'ACTIVE', medicationId: 'm1', catalogItemId: 'c1',
  medicationName: '药m1', medicationCode: 'C', medicationType: 'WESTERN', itemName: 'p', quantity: 1, quantityUnit: '盒', doseValue: 5,
  substitutionAllowed: true, selfProvided: false, authoredAt: '2026-01-01T00:00:00Z', ...over }) as MedicationRequest
const svcReq = (id: string, over: Partial<ServiceRequest> = {}) => ({ id, revision: 1, status: 'ACTIVE', catalogItemId: 's1', itemCode: 'S1', itemName: '项s1',
  serviceType: 'LABORATORY', quantity: 1, unitCode: '次', authoredAt: '2026-01-01T00:00:00Z', ...over }) as ServiceRequest
const none = { medicationDrafts: [], serviceDrafts: [], medications: [], services: [] }

describe('buildOrderSetCandidates', () => {
  it('collects the three sources in priority order', () => {
    const result = buildOrderSetCandidates({ medicationDrafts: [medDraft('d1', 'a', 'a1')], serviceDrafts: [svcDraft('d2', 's9')],
      medications: [medReq('r1', { status: 'DRAFT', medicationId: 'b', catalogItemId: 'b1' }), medReq('r2', { medicationId: 'c', catalogItemId: 'c1' })],
      services: [svcReq('r3', { status: 'DRAFT', catalogItemId: 's2' }), svcReq('r4', { catalogItemId: 's3' })] })
    expect(result.map(item => item.source)).toEqual(['PENDING', 'PENDING', 'SAVED_DRAFT', 'SAVED_DRAFT', 'ISSUED', 'ISSUED'])
  })

  it('excludes cancelled orders', () => {
    const result = buildOrderSetCandidates({ ...none, medications: [medReq('r1', { status: 'CANCELLED' })], services: [svcReq('r2', { status: 'CANCELLED' })] })
    expect(result).toEqual([])
  })

  it('lists a duplicate medication or service once, preferring the newest source and its dose', () => {
    const result = buildOrderSetCandidates({ medicationDrafts: [medDraft('d1', 'm1', 'c1', 9)], serviceDrafts: [svcDraft('d2', 's1')],
      medications: [medReq('r1', { status: 'DRAFT', doseValue: 7 }), medReq('r2', { doseValue: 5 })], services: [svcReq('r3'), svcReq('r4', { status: 'DRAFT' })] })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ source: 'PENDING', medication: { request: { doseValue: 9 } } })
    expect(result[1]).toMatchObject({ source: 'PENDING', kind: 'service' })
    const persisted = buildOrderSetCandidates({ ...none, medications: [medReq('old', { authoredAt: '2026-01-01T00:00:00Z', doseValue: 1 }),
      medReq('new', { authoredAt: '2026-02-01T00:00:00Z', doseValue: 2 }), medReq('draft', { status: 'DRAFT', doseValue: 3 })] })
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({ source: 'SAVED_DRAFT', medication: { request: { doseValue: 3 } } })
  })

  it('keeps different packages of one medication apart', () => {
    expect(buildOrderSetCandidates({ ...none, medications: [medReq('r1'), medReq('r2', { catalogItemId: 'c2' })] })).toHaveLength(2)
  })

  it('greys out herbal rows without deduplicating them and flags infusion groups', () => {
    const result = buildOrderSetCandidates({ ...none, medications: [medReq('h1', { medicationType: 'HERBAL' }), medReq('h2', { medicationType: 'HERBAL' }),
      medReq('p', { medicationId: 'x', catalogItemId: 'x1' }), medReq('k', { medicationId: 'y', catalogItemId: 'y1', parentRequestId: 'p' })] })
    expect(result.filter(item => item.disabledReason)).toHaveLength(2)
    expect(selectableCandidates(result).every(item => item.grouped)).toBe(true)
    expect(selectableCandidates(result)).toHaveLength(2)
  })
})
