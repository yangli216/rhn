import type { AccountStatement } from '../../shared/api/billingApi'
import { money } from './BillingShared'

type SettlementRow = AccountStatement['settlements'][number]

/** 已生成但没有任何收款、医保未正式结算的结算单，可以随“放弃结算并重选”取消，所含收费回到待结算。 */
export function cancellableSettlements(statement: AccountStatement | undefined): SettlementRow[] {
  return statement?.settlements.filter(row => row.settlementType === 'NORMAL' && row.settlementScene !== 'REGISTRATION'
    && row.status === 'PRICED' && row.tenderedAmount === 0) ?? []
}

/** 锁定标记的悬浮说明：未付款结算单明细与撤销方式，不在收费面板常驻显示。 */
export function lockedSettlementHint(settlements: SettlementRow[], currency?: string): string {
  const rows = settlements.map(row => `未付款结算单 ${row.settlementNo}（${row.terminalScene === 'DOCTOR_STATION' ? '诊间生成' : '收费处生成'}）${money(row.netAmount, row.currencyCode ?? currency)}`)
  return ['单据已锁定，结算期间费用数据不允许变更', ...rows, '暂不结算或需调整时，点上方“放弃结算并重选”即可撤销，费用回到待结算。'].join('\n')
}
