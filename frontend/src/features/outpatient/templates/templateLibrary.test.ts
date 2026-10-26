import { describe, expect, it } from 'vitest'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import { groupFixture } from '../orders/orderSetImport.testFixtures'
import {
  defaultKindFilter, defaultSections, draftOrderKeys, initialGroupChecks, initialPlanChecks, kindPreference, kindRelevantTo,
  medicationDuplicateKey, planMedicationKey, planRelevantTo, planServiceKey, rowFailureKey, serviceDuplicateKey,
} from './templateLibrary'

const plan = (): OutpatientPlanTemplate => ({ id: 'p', revision: 3, scopeType: 'PERSONAL', name: '方案', status: 'ACTIVE', sortOrder: 0, useCount: 0,
  createdAt: '', updatedAt: '', tasks: [], noteTemplateId: 'n',
  diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' }, { code: 'E11', display: '糖尿病', type: 'SECONDARY' }],
  medications: [{ lineId: 'm1', medicationId: 'med-1', catalogItemId: 'prod-1' }, { lineId: 'm2', medicationId: 'med-2', catalogItemId: 'prod-2' }] as OutpatientPlanTemplate['medications'],
  services: [{ catalogItemId: 's1', itemCode: 'S1' }, { catalogItemId: 's2', itemCode: 'S2' }] as OutpatientPlanTemplate['services'] })

describe('template library purposes', () => {
  it('opens diagnosis on plans and the other purposes on the filtered all-view', () => {
    expect(defaultKindFilter('DIAGNOSIS')).toBe('PLAN')
    expect(defaultKindFilter('RECORD')).toBe('ALL')
    expect(defaultKindFilter('ORDERS')).toBe('ALL')
    expect(kindPreference('RECORD')[0]).toBe('NOTE')
    expect(kindPreference('ORDERS')[0]).toBe('ORDER_SET')
    expect(kindPreference('DIAGNOSIS')[0]).toBe('PLAN')
  })
  it('keeps only purpose-relevant kinds and plans in the filtered view', () => {
    expect(kindRelevantTo('RECORD', 'ORDER_SET')).toBe(false)
    expect(kindRelevantTo('ORDERS', 'NOTE')).toBe(false)
    expect(planRelevantTo('RECORD', { ...plan(), noteTemplateId: undefined })).toBe(false)
    expect(planRelevantTo('RECORD', plan())).toBe(true)
    expect(planRelevantTo('ORDERS', { ...plan(), medications: [], services: [] })).toBe(false)
    expect(planRelevantTo('ORDERS', plan())).toBe(true)
  })
  it('selects the preview zones each purpose starts with', () => {
    expect(defaultSections('RECORD')).toEqual({ record: true, diagnosis: false, orders: false })
    expect(defaultSections('ORDERS')).toEqual({ record: false, diagnosis: false, orders: true })
    expect(defaultSections('DIAGNOSIS')).toEqual({ record: true, diagnosis: true, orders: true })
  })
})

describe('template library default selection', () => {
  const noFailures = new Map<string, string>()
  it('leaves existing diagnoses, duplicate orders and confirmed failures unchecked', () => {
    const value = plan()
    const drafts = draftOrderKeys([{ request: { medicationId: 'med-1', catalogItemId: 'prod-1' } } as never],
      [{ catalogItemId: 's2' } as never])
    const failures = new Map([[rowFailureKey('PLAN', 'p', 3, planServiceKey(value.services[0], 0)), '价格缺失']])
    const checks = initialPlanChecks(value, 'DIAGNOSIS', [{ code: 'i10', display: '高血压', type: 'PRIMARY' }], drafts, failures)
    expect([...checks.diagnoses]).toEqual(['E11'])
    expect([...checks.medications]).toEqual([planMedicationKey(value.medications[1], 1)])
    expect([...checks.services]).toEqual([])
  })
  it('only checks the zones of the opening purpose', () => {
    const value = plan(), drafts = draftOrderKeys([], [])
    const orders = initialPlanChecks(value, 'ORDERS', [], drafts, noFailures)
    expect(orders.diagnoses.size).toBe(0)
    expect(orders.medications.size + orders.services.size).toBe(4)
    expect(orders.recordSelected).toBe(false)
    const record = initialPlanChecks(value, 'RECORD', [], drafts, noFailures)
    expect(record.diagnoses.size + record.medications.size + record.services.size).toBe(0)
    expect(record.recordSelected).toBe(true)
  })
  it('matches duplicates by product identity, not by route or frequency', () => {
    expect(medicationDuplicateKey({ medicationId: 'a', catalogItemId: 'b' })).toBe(medicationDuplicateKey({ medicationId: 'a', catalogItemId: 'b' }))
    expect(medicationDuplicateKey({ medicationId: 'a', catalogItemId: 'b' })).not.toBe(medicationDuplicateKey({ medicationId: 'a', catalogItemId: 'c' }))
    expect(serviceDuplicateKey({ catalogItemId: 's1' })).not.toBe(medicationDuplicateKey({ medicationId: 's1' }))
  })
  it('leaves duplicate and failed group members unchecked', () => {
    const group = groupFixture()
    const failures = new Map([[rowFailureKey('ORDER_SET', group.id, group.revision, 'm2'), '失效']])
    expect([...initialGroupChecks(group, draftOrderKeys([], [{ catalogItemId: 's1' } as never]), failures)]).toEqual([])
    expect([...initialGroupChecks(group, draftOrderKeys([], []), failures)]).toEqual(['m1'])
  })
})

describe('order set template default selection', () => {
  const orderSet = (): OutpatientPlanTemplate => ({ ...plan(), templateKind: 'ORDER_SET', noteTemplateId: undefined, diagnoses: [],
    medications: [{ lineId: 'm1', medicationId: 'med-1', catalogItemId: 'prod-1' }, { lineId: 'm2', medicationId: 'med-2', catalogItemId: 'prod-2', defaultSelected: false }] as OutpatientPlanTemplate['medications'],
    services: [{ catalogItemId: 's1', itemCode: 'S1' }, { catalogItemId: 's2', itemCode: 'S2', defaultSelected: false }] as OutpatientPlanTemplate['services'] })

  it('leaves rows whose defaultSelected is false unchecked, whatever the purpose', () => {
    for (const purpose of ['ORDERS', 'DIAGNOSIS', 'RECORD'] as const) {
      const initial = initialPlanChecks(orderSet(), purpose, [], new Set(), new Map())
      expect([...initial.medications]).toEqual(['m1'])
      expect([...initial.services]).toEqual(['s1-0'])
    }
  })
  it('keeps the orders zone checked for an order set even when opened for the record purpose', () => {
    expect(initialPlanChecks(orderSet(), 'RECORD', [], new Set(), new Map()).medications.size).toBe(1)
    expect(initialPlanChecks({ ...orderSet(), templateKind: 'PROTOCOL' }, 'RECORD', [], new Set(), new Map()).medications.size).toBe(0)
  })
  it('treats a missing defaultSelected as checked (server default) and still skips duplicates and locked rows', () => {
    const initial = initialPlanChecks(plan(), 'ORDERS', [], new Set([medicationDuplicateKey({ medicationId: 'med-1', catalogItemId: 'prod-1' })]),
      new Map([[rowFailureKey('PLAN', 'p', 3, planServiceKey({ catalogItemId: 's2', itemCode: 'S2' }, 1)), '失效']]))
    expect([...initial.medications]).toEqual(['m2'])
    expect([...initial.services]).toEqual(['s1-0'])
  })
})
