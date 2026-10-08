import { expect, it } from 'vitest'
import type { GoodsReceiptLine, StockItem } from '../../shared/api'
import { procurementPackage, receiptAcceptedAmount } from './procurementTruth'

it.each([undefined, null])('does not use delivered quantity for missing acceptance: %s', acceptedQuantity => {
  expect(receiptAcceptedAmount({ deliveredQuantity: 12, acceptedQuantity, unitCost: 4 } as GoodsReceiptLine)).toBeUndefined()
})

it.each([undefined, null, '', NaN, Infinity])('does not invent a zero purchase cost: %s', unitCost => {
  expect(receiptAcceptedAmount({ deliveredQuantity: 12, acceptedQuantity: 12, unitCost } as GoodsReceiptLine)).toBeUndefined()
})

it('preserves actual zero acceptance and zero cost', () => {
  expect(receiptAcceptedAmount({ deliveredQuantity: 12, acceptedQuantity: 0 } as GoodsReceiptLine)).toBe(0)
  expect(receiptAcceptedAmount({ deliveredQuantity: 12, acceptedQuantity: 12, unitCost: 0 } as GoodsReceiptLine)).toBe(0)
  expect(receiptAcceptedAmount({ deliveredQuantity: 12, acceptedQuantity: 5, unitCost: 4 } as GoodsReceiptLine)).toBe(20)
})

it('uses only recorded conversion facts for the matching package', () => {
  expect(procurementPackage(undefined, 'box').conversion).toBe('包装换算未取得')
  const item = { packageId: 'box', packageFactor: 24, packageUnitName: '盒', baseUnitCode: 'TAB' } as StockItem
  expect(procurementPackage(item, 'box').conversion).toBe('1盒=24TAB')
  expect(procurementPackage(item, 'bottle').conversion).toBe('包装换算未取得')
  expect(procurementPackage({ ...item, packageFactor: 0 }, 'box').conversion).toBe('包装换算未取得')
})
