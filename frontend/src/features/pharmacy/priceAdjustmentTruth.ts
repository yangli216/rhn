import type { InventoryPriceAdjustment, InventoryPriceAdjustmentLine } from '../../shared/api'
import { knownInventoryNumber, requireInventoryList } from './inventoryLedgerTruth'

export function hasAdjustmentSnapshot(line: InventoryPriceAdjustmentLine): boolean {
  return line.lineStatus === 'READY' || line.lineStatus === 'POSTED'
}

export function hasAdjustmentTotals(value: InventoryPriceAdjustment): boolean {
  return value.status !== 'DRAFT' && value.lines.length > 0 && value.lines.every(hasAdjustmentSnapshot)
}

const nonnegative = (value: unknown) => knownInventoryNumber(value) !== undefined && (value as number) >= 0
const close = (left: number, right: number) => Math.abs(left - right) <= Math.max(0.000001, Math.max(Math.abs(left), Math.abs(right)) * Number.EPSILON * 8)

export function requirePriceAdjustment(value: InventoryPriceAdjustment, siteId: string,
  expected?: { id?: string; status: InventoryPriceAdjustment['status']; requestCode?: string }): InventoryPriceAdjustment {
  const fail = () => { throw new Error('调价结果未完整返回或与当前操作不一致，请重新读取确认。') }
  if (!value || !value.id || value.stockSiteId !== siteId || !value.adjustmentNo
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !['COST_REVALUE', 'SALE_PRICE'].includes(value.adjustmentType)
    || !['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTING', 'POSTED', 'CANCELLED'].includes(value.status)
    || !/^[A-Z]{3}$/.test(value.currencyCode ?? '') || !value.businessDate
    || !Array.isArray(value.lines) || !value.lines.length || value.lineCount !== value.lines.length
    || (expected && (value.status !== expected.status || (expected.id && value.id !== expected.id)
      || (expected.requestCode && value.requestCode !== expected.requestCode)))) fail()
  for (const line of value.lines) {
    if (!line || !line.id || !line.stockItemId || !Array.isArray(line.details)
      || !nonnegative(value.adjustmentType === 'COST_REVALUE' ? line.newUnitCost : line.newSalePrice)) fail()
    const snapshot = hasAdjustmentSnapshot(line)
    if ((value.status === 'DRAFT' && line.lineStatus !== 'PENDING')
      || (value.status === 'CANCELLED' && !['PENDING', 'READY'].includes(line.lineStatus))
      || (['SUBMITTED', 'APPROVED', 'POSTING'].includes(value.status) && line.lineStatus !== 'READY')
      || (value.status === 'POSTED' && line.lineStatus !== 'POSTED')) fail()
    if (!snapshot) continue
    if (![line.quantitySnapshot, line.valueBefore, line.valueAfter,
      value.adjustmentType === 'COST_REVALUE' ? line.oldUnitCost : line.oldSalePrice].every(nonnegative)
      || knownInventoryNumber(line.adjustmentAmount) === undefined
      || !close(line.valueAfter - line.valueBefore, line.adjustmentAmount)) fail()
    for (const detail of line.details) {
      if (!detail || !detail.id || !detail.stockBinId || !detail.inventoryBalanceId
        || ![detail.quantitySnapshot, detail.unitPriceBefore, detail.unitPriceAfter, detail.valueBefore, detail.valueAfter].every(nonnegative)
        || knownInventoryNumber(detail.adjustmentAmount) === undefined
        || !close(detail.valueAfter - detail.valueBefore, detail.adjustmentAmount)
        || (value.status === 'POSTED' && !detail.valuationEntryId)) fail()
    }
    for (const key of ['quantitySnapshot', 'valueBefore', 'valueAfter', 'adjustmentAmount'] as const) {
      if (!close(line[key], line.details.reduce((sum, detail) => sum + detail[key], 0))) fail()
    }
  }
  if (hasAdjustmentTotals(value)) {
    if (![value.totalValueBefore, value.totalValueAfter].every(nonnegative)
      || knownInventoryNumber(value.totalAdjustmentAmount) === undefined
      || !close(value.totalValueBefore, value.lines.reduce((sum, line) => sum + line.valueBefore, 0))
      || !close(value.totalValueAfter, value.lines.reduce((sum, line) => sum + line.valueAfter, 0))
      || !close(value.totalAdjustmentAmount, value.lines.reduce((sum, line) => sum + line.adjustmentAmount, 0))) fail()
  }
  return value
}

export function requirePriceAdjustments(values: InventoryPriceAdjustment[], siteId: string) {
  return requireInventoryList(values).map(value => requirePriceAdjustment(value, siteId))
}

export function validAdjustmentTargets(targets: Record<string, string>): boolean {
  return Object.keys(targets).length > 0 && Object.values(targets).every(value =>
    value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0)
}
