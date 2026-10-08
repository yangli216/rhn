import type { InventoryOpenPackage, InventoryReconciliationRun } from '../../shared/api'

const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0
const validQuantity = (value: number) => typeof value === 'number' && Number.isFinite(value)
const validTime = (value: string | undefined) => typeof value === 'string' && Number.isFinite(Date.parse(value))

export function requireReconciliation(value: InventoryReconciliationRun, siteId: string): InventoryReconciliationRun {
  if (!value || !value.id || value.stockSiteId !== siteId || !value.runNo || !value.status
    || !validCount(value.dimensionCount) || !validCount(value.issueCount) || !Array.isArray(value.lines)
    || value.issueCount !== value.lines.length || !validTime(value.startedAt)
    || value.lines.some(line => !line || !line.id || !validQuantity(line.expectedQuantity)
      || !validQuantity(line.actualQuantity) || !validQuantity(line.differenceQuantity)
      || !['ERROR', 'WARNING'].includes(line.severity))) {
    throw new Error('库存校验结果不完整或计数不一致，请重新读取。')
  }
  if (value.completedAt != null && (!validTime(value.completedAt) || Date.parse(value.completedAt) < Date.parse(value.startedAt))) {
    throw new Error('库存校验完成时间无效，请重新读取。')
  }
  if (value.status === 'PASSED' || value.status === 'ISSUES') {
    if (!validTime(value.completedAt) || Date.parse(value.completedAt!) < Date.parse(value.startedAt)
      || (value.status === 'PASSED' && value.issueCount !== 0)
      || (value.status === 'ISSUES' && value.issueCount === 0)) {
      throw new Error('库存校验状态与结果不一致，无法确认校验结论。')
    }
  }
  return value
}

export function requireOpenPackages(value: InventoryOpenPackage[], siteId: string): InventoryOpenPackage[] {
  if (!Array.isArray(value) || value.some(row => !row || !row.id || row.stockSiteId !== siteId
    || !row.stockItemId || !row.stockLotId || !['OPEN', 'CONSUMED', 'VOID'].includes(row.status)
    || !validQuantity(row.remainingBaseQuantity) || row.remainingBaseQuantity < 0
    || !validQuantity(row.openedBaseQuantity) || row.openedBaseQuantity <= 0)) {
    throw new Error('拆零包装台账返回不完整或数量无效，请重新读取。')
  }
  return value
}
