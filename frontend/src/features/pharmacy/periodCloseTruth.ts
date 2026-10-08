import type { InventoryPeriod, PeriodCloseRun, PeriodCloseDifference } from '../../shared/api'
import { knownInventoryNumber, requireInventoryList } from './inventoryLedgerTruth'

export function requirePeriods(value: InventoryPeriod[], siteId: string): InventoryPeriod[] {
  requireInventoryList(value)
  if (value.some(period => period.stockSiteId !== siteId || !period.periodCode || !period.periodFrom || !period.periodTo || !period.status)) {
    throw new Error('库存期间资料不完整或不属于当前库房，请重新读取。')
  }
  return value
}

export function requireCloseRun(run: PeriodCloseRun, siteId: string, periodId: string): PeriodCloseRun {
  if (!run || !run.id || run.stockSiteId !== siteId || run.inventoryPeriodId !== periodId || !run.status
    || !run.runNo || !run.startedAt || !Array.isArray(run.totals)
    || [run.dimensionCount, run.differenceCount].some(count => !Number.isSafeInteger(count) || count < 0)
    || run.differenceCount > run.dimensionCount) {
    throw new Error('月结预检记录不完整，无法确认预检结论。')
  }
  if (run.totals.some(total => !total || typeof total.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(total.currencyCode) || [total.openingValue, total.movementAmount,
    total.valuationAdjustmentAmount, total.roundingAdjustmentAmount, total.closingValue, total.balanceValue,
    total.valueDifference].some(value => knownInventoryNumber(value) === undefined))) {
    throw new Error('月结金额汇总不完整，不能按零金额确认。')
  }
  if (run.status === 'VALIDATED' || run.status === 'POSTED') {
    const costs = run.totals.filter(total => total.valuationBasis === 'COST')
    if (costs.length !== 1 || (run.differenceCount === 0 && costs[0]!.valueDifference !== 0)
      || (run.status === 'POSTED' && run.differenceCount !== 0)) {
      throw new Error('月结状态与成本汇总不一致，不能确认关账。')
    }
    const cost = costs[0]!
    const near = (left: number, right: number) => Math.abs(left - right) <= Math.max(0.000001, Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)) * 8)
    if (!near(cost.openingValue + cost.movementAmount + cost.valuationAdjustmentAmount + cost.roundingAdjustmentAmount, cost.closingValue)
      || !near(cost.balanceValue - cost.closingValue, cost.valueDifference)) {
      throw new Error('月结金额勾稽不一致，不能确认关账。')
    }
  }
  return run
}

export function requireCloseRuns(value: PeriodCloseRun[], siteId: string, periodId: string) {
  requireInventoryList(value)
  return value.map(run => requireCloseRun(run, siteId, periodId))
}

export function requireCloseDifferences(value: PeriodCloseDifference[]) {
  if (!Array.isArray(value) || value.some(row => !row || !row.snapshotId || !row.stockItemId || !row.stockBinId
    || [row.openingQuantity, row.movementQuantity, row.closingQuantity, row.balanceQuantity,
      row.quantityDifference, row.valueDifference].some(amount => knownInventoryNumber(amount) === undefined))) {
    throw new Error('月结差异明细未完整返回，请重新读取。')
  }
  return value
}
