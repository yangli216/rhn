import { expect, it } from 'vitest'
import type { InventoryBalance } from '../../shared/api'
import { inventoryAverageCost, inventoryKnownTotal } from './inventoryLedgerTruth'

const row = (quantityOnHand: number, averageUnitCost: unknown) => ({ quantityOnHand, averageUnitCost }) as InventoryBalance

it.each([undefined, null, '', ' ', NaN, Infinity, true, '3'])('does not convert missing or invalid costs to zero: %s', cost => {
  expect(inventoryAverageCost([row(10, 4), row(10, cost)])).toBeUndefined()
  expect(inventoryKnownTotal([5, cost])).toBeUndefined()
})

it('preserves recorded zero costs and signed zero/negative ledger amounts', () => {
  expect(inventoryAverageCost([row(10, 0), row(10, 4)])).toBe(2)
  expect(inventoryKnownTotal([0, 0])).toBe(0)
  expect(inventoryKnownTotal([3, -7])).toBe(-4)
})

it('does not require a cost for zero inventory or invent an average for an empty position', () => {
  expect(inventoryAverageCost([row(0, null), row(10, 4)])).toBe(4)
  expect(inventoryAverageCost([row(0, 4)])).toBeUndefined()
  expect(inventoryAverageCost([])).toBeUndefined()
})
