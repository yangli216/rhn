import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { AccountStatement, CancelledSettlement } from '../../shared/api/billingApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Select } from '../../shared/ui'
import { money } from './BillingShared'

type SettlementRow = AccountStatement['settlements'][number]

const REASONS = ['患者暂不结算', '项目有误，需医生调整', '结算类型选错，需重新结算']
const OTHER = '__OTHER__'

/** 已生成但没有任何收款、医保未正式结算的结算单，可以取消，所含收费回到待结算。 */
export function cancellableSettlements(statement: AccountStatement | undefined): SettlementRow[] {
  return statement?.settlements.filter(row => row.settlementType === 'NORMAL' && row.settlementScene !== 'REGISTRATION'
    && row.status === 'PRICED' && row.tenderedAmount === 0) ?? []
}

/** 收费处的未付款结算单：调入后不想结算或发现问题时取消，费用回到待结算，医生也可以继续修改医嘱。 */
export function UnpaidSettlementList({ api, settlements, disabled, onCancelled }: {
  api: RhnApi; settlements: SettlementRow[]; disabled?: boolean
  onCancelled: (result: CancelledSettlement) => void
}) {
  const [target, setTarget] = useState<SettlementRow | null>(null)
  const [reason, setReason] = useState(REASONS[0])
  const cancel = useMutation({
    mutationFn: (row: SettlementRow) => api.billing.cancelSettlement(row.id, reason.trim()),
    onSuccess: (result) => { setTarget(null); onCancelled(result) },
  })
  if (!settlements.length) return null
  const open = (row: SettlementRow) => { cancel.reset(); setReason(REASONS[0]); setTarget(row) }
  return <div className="billing-unpaid-settlements" aria-label="未付款结算单">
    {settlements.map(row => <div key={row.id} className="billing-unpaid-settlements__row">
      <span className="billing-unpaid-settlements__label">
        未付款结算单 <strong>{row.settlementNo}</strong>
        <small>{row.terminalScene === 'DOCTOR_STATION' ? '诊间生成' : '收费处生成'}</small>
      </span>
      <span className="billing-unpaid-settlements__amount">{money(row.netAmount, row.currencyCode)}</span>
      <Button size="sm" variant="secondary" disabled={disabled || cancel.isPending} onClick={() => open(row)}>取消结算单</Button>
    </div>)}
    {target && <Dialog title="取消结算单" closeOnBackdrop={false} onClose={() => !cancel.isPending && setTarget(null)}
      description={`结算单 ${target.settlementNo}（${money(target.netAmount, target.currencyCode)}）取消后，所含费用回到待结算，可重新勾选结算；已做医保试算的同时撤销医保费用明细。`}
      footer={<>
        <Button variant="secondary" disabled={cancel.isPending} onClick={() => setTarget(null)}>返回</Button>
        <Button variant="danger" busy={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate(target)}>确认取消</Button>
      </>}>
      <FormField label="取消原因" required>
        <Select aria-label="取消原因" value={REASONS.includes(reason) ? reason : OTHER} searchable={false} clearable={false}
          options={[...REASONS.map(value => ({ value, label: value })), { value: OTHER, label: '其他原因…' }]}
          onChange={(value) => setReason(value === OTHER ? '' : value)} />
      </FormField>
      {!REASONS.includes(reason) && <FormField label="原因说明" required>
        <input aria-label="原因说明" value={reason} maxLength={200} autoFocus onChange={(event) => setReason(event.target.value)} />
      </FormField>}
      {cancel.error && <Alert placement="inline" duration={null}>{errorMessage(cancel.error)}</Alert>}
    </Dialog>}
  </div>
}
