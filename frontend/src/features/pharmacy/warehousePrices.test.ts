import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MedicationProduct, PurchaseOrder, StockItem } from '../../shared/api'
import { resolveItemDefaultPrices } from './WarehouseOperations'

const item = { id: 'stock', catalogItemId: 'catalog', packageId: 'box' } as StockItem
const product = (price: unknown, packageId = 'box', sdStatus = 'ACTIVE') => ({
  id: 'catalog', prices: [{ packageId, sdStatus, sdPriceType: 'PURCHASE', price, validFrom: '2020-01-01' }],
}) as MedicationProduct
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T10:00:00+08:00')) })
afterEach(() => vi.useRealTimers())

it.each([null, undefined, '', ' ', NaN, Infinity, -1, true])('does not invent a zero price from %s', value => {
  expect(resolveItemDefaultPrices({ ...item, agreementPrice: value } as StockItem, [], [product(value)],
    [{ catalogItemId: 'catalog', packageId: 'box', agreementPrice: value as number }]).purchasePrice).toBeUndefined()
})
it('preserves a recorded zero agreement price', () => {
  expect(resolveItemDefaultPrices(item, [], [], [{ catalogItemId: 'catalog', packageId: 'box', agreementPrice: 0 }]).purchasePrice).toBe('0')
})
it('does not copy another package price or an inactive catalog price', () => {
  expect(resolveItemDefaultPrices(item, [], [product(8, 'tablet')],
    [{ catalogItemId: 'catalog', packageId: 'tablet', agreementPrice: 2 }]).purchasePrice).toBeUndefined()
  expect(resolveItemDefaultPrices(item, [], [product(8, 'box', 'INACTIVE')]).purchasePrice).toBeUndefined()
  expect(resolveItemDefaultPrices({ ...item, packageId: undefined } as unknown as StockItem, [], [product(8)]).purchasePrice).toBeUndefined()
})
it('does not treat a stock item id as a catalog id', () => {
  expect(resolveItemDefaultPrices({ id: 'catalog', packageId: 'box' } as StockItem, [], [product(8)]).purchasePrice).toBeUndefined()
})
it('uses the latest approved matching purchase without reusing draft or different-package prices', () => {
  const order = (date: string, price: number, status = 'COMPLETED', packageId = 'box') => ({
    orderDate: date, status, lines: [{ stockItemId: 'stock', packageId, unitPrice: price }],
  }) as PurchaseOrder
  expect(resolveItemDefaultPrices(item, [order('2026-01-01', 4), order('2026-09-01', 0),
    order('2026-09-30', 55, 'DRAFT'), order('2026-09-29', 66, 'COMPLETED', 'tablet')]).purchasePrice).toBe('0')
})
it('excludes expired or disabled supplier agreements', () => {
  for (const extra of [{ purchaseEnabled: false }, { validTo: '2020-01-01' }, { validFrom: '2099-01-01' }]) {
    expect(resolveItemDefaultPrices(item, [], [], [{ catalogItemId: 'catalog', packageId: 'box', agreementPrice: 7, ...extra }]).purchasePrice).toBeUndefined()
  }
})
