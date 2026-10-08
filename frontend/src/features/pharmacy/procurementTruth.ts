import type { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, StockItem } from '../../shared/api'
import { inventoryKnownTotal, knownInventoryNumber, requireInventoryList } from './inventoryLedgerTruth'

export function receiptAcceptedAmount(line: GoodsReceiptLine): number | undefined {
  const accepted = knownInventoryNumber(line.acceptedQuantity)
  const cost = knownInventoryNumber(line.unitCost)
  if (accepted === undefined || accepted < 0) return undefined
  if (accepted === 0) return 0
  return cost === undefined || cost < 0 ? undefined : knownInventoryNumber(accepted * cost)
}

export const receiptAcceptedTotal = (receipt: GoodsReceipt) => inventoryKnownTotal(receipt.lines.map(receiptAcceptedAmount))

export function procurementPackage(item: StockItem | undefined, packageId: string) {
  const matched = Boolean(item?.packageId && item.packageId === packageId)
  const unit = matched && item?.packageUnitName ? item.packageUnitName : '单位未取得'
  const factor = matched ? knownInventoryNumber(item?.packageFactor) : undefined
  return { unit, specification: matched && item?.packageSpec ? item.packageSpec : '规格未取得',
    conversion: matched && item?.packageUnitName && item.baseUnitCode && factor !== undefined && factor > 0
      ? `1${item.packageUnitName}=${factor}${item.baseUnitCode}` : '包装换算未取得' }
}

export function requirePurchaseOrders(value: PurchaseOrder[]): PurchaseOrder[] {
  requireInventoryList(value)
  if (value.some(order => !order.status || !Array.isArray(order.lines)
    || order.lines.some(line => !line || !line.id || [line.orderedQuantity, line.unitPrice, line.remainingQuantity]
      .some(amount => knownInventoryNumber(amount) === undefined || amount < 0)))) {
    throw new Error('采购计划数据不完整，无法确认数量与金额。')
  }
  return value
}

export function requireGoodsReceipts(value: GoodsReceipt[]): GoodsReceipt[] {
  requireInventoryList(value)
  if (value.some(receipt => !receipt.status || !Array.isArray(receipt.lines)
    || receipt.lines.some(line => !line || !line.id || knownInventoryNumber(line.deliveredQuantity) === undefined
      || line.deliveredQuantity < 0 || [line.acceptedQuantity, line.rejectedQuantity, line.unitCost]
        .some(amount => amount != null && (knownInventoryNumber(amount) === undefined || amount < 0))))) {
    throw new Error('到货验收数据不完整或数量、金额无效，请重新读取。')
  }
  return value
}
