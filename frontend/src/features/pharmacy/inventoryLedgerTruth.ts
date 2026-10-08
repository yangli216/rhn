import type { InventoryBalance, InventoryTransactionPage } from '../../shared/api'

export const knownInventoryNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

export function requireInventoryList<T extends { id: string }>(value: T[]): T[] {
  if (!Array.isArray(value) || value.some(row => !row || !row.id)) {
    throw new Error('库存资料返回格式无效，请重新读取。')
  }
  return value
}

export function requireInventoryBalances(value: InventoryBalance[]): InventoryBalance[] {
  requireInventoryList(value)
  if (value.some(row => [row.quantityOnHand, row.quantityAvailable, row.quantityReserved, row.quantityFrozen]
    .some(quantity => knownInventoryNumber(quantity) === undefined))) {
    throw new Error('库存数量未完整返回，无法确认当前库存。')
  }
  return value
}

export function requireInventoryPage(value: InventoryTransactionPage): InventoryTransactionPage {
  if (!value || !Array.isArray(value.content)
    || [value.page, value.totalPages, value.totalElements].some(count => !Number.isSafeInteger(count) || count < 0)
    || !Number.isSafeInteger(value.size) || value.size <= 0 || value.totalElements < value.content.length
    || value.content.some(row => !row || !row.id || !Array.isArray(row.lines)
      || row.lines.some(line => !line || !line.stockItemId || knownInventoryNumber(line.quantityDelta) === undefined))) {
    throw new Error('库存流水返回不完整，无法展示账目。')
  }
  return value
}

export function inventoryAverageCost(rows: InventoryBalance[]): number | undefined {
  const active = rows.filter(row => row.quantityOnHand !== 0)
  if (active.some(row => knownInventoryNumber(row.quantityOnHand) === undefined
    || knownInventoryNumber(row.averageUnitCost) === undefined || row.averageUnitCost! < 0)) return undefined
  const quantity = active.reduce((sum, row) => sum + row.quantityOnHand, 0)
  if (!quantity) return undefined
  return knownInventoryNumber(active.reduce((sum, row) => sum + row.quantityOnHand * row.averageUnitCost!, 0) / quantity)
}

export function inventoryKnownTotal(values: unknown[]): number | undefined {
  if (values.some(value => knownInventoryNumber(value) === undefined)) return undefined
  return knownInventoryNumber((values as number[]).reduce((sum, value) => sum + value, 0))
}
