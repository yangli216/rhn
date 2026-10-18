import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import type { ManualReliefInput, ReliefOutcome, SettlementRelief } from '../../../shared/api/reliefApi'
import { reliefStatusTone } from '../../../shared/presentation'
import { Alert, Button, FormField, LoadingState, StatusBadge } from '../../../shared/ui'
import { money } from '../BillingShared'
import './billing-relief.css'

export interface ReliefSettlementTarget {
  id: string
  settlementNo: string
  currencyCode: string
  /** 医保已正式结算；医保后减免据此按医保患者计算。 */
  insuranceSettled: boolean
}

/** 预览中尚待执行的政策：自动可减免或待人工核准。 */
export function actionableRelief(relief: Pick<SettlementRelief, 'pending'> | undefined): ReliefOutcome[] {
  return (relief?.pending ?? []).filter((value) => value.status === 'APPLIED' || value.status === 'AWAITING_MANUAL')
}

/**
 * 收费结算的惠民减免块：列出待收结算单已执行的减免与可享受的医保后减免，由收费员确认；
 * 人工核准项需 BILLING_RELIEF.APPROVE 权限并填写金额与原因。医保结算方式下，医保后减免在医保正式结算后自动执行。
 */
export function SettlementReliefPanel({ api, settlements, settlementMode, canApprove, onChanged }: {
  api: RhnApi
  settlements: ReliefSettlementTarget[]
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  canApprove: boolean
  onChanged: () => Promise<unknown>
}) {
  if (!settlements.length) return null
  return <section className="relief-cashier" aria-label="惠民减免">
    {settlements.map((settlement) => <SettlementReliefCard key={settlement.id} api={api} settlement={settlement}
      settlementMode={settlementMode} canApprove={canApprove} onChanged={onChanged} />)}
  </section>
}

type ManualDraft = { amount: string; reason: string; evidence: string }

function SettlementReliefCard({ api, settlement, settlementMode, canApprove, onChanged }: {
  api: RhnApi
  settlement: ReliefSettlementTarget
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  canApprove: boolean
  onChanged: () => Promise<unknown>
}) {
  const [manual, setManual] = useState<Record<string, ManualDraft>>({})
  const relief = useQuery({
    queryKey: ['settlement-relief', settlement.id],
    queryFn: () => api.relief.settlementRelief(settlement.id),
  })
  const confirm = useMutation({
    mutationFn: (items: ManualReliefInput[]) => api.relief.confirmSettlementRelief(settlement.id, items),
    onSuccess: async () => {
      setManual({})
      await Promise.all([relief.refetch(), onChanged()])
    },
  })
  const currency = settlement.currencyCode
  const applied = (relief.data?.applications ?? []).filter((value) => value.status !== 'REVERSED')
  const pending = relief.data?.pending ?? []
  const automatic = pending.filter((value) => value.status === 'APPLIED')
  const awaiting = pending.filter((value) => value.status === 'AWAITING_MANUAL')
  const skipped = pending.filter((value) => value.status === 'SKIPPED')
  // 医保方式且尚未医保结算时，按自费确认会阻止后续医保结算，因此只展示预估。
  const waitingInsurance = settlementMode === 'MEDICAL_INSURANCE' && !settlement.insuranceSettled
  const manualInputs: ManualReliefInput[] = awaiting.flatMap((value) => {
    const draft = value.policyId ? manual[value.policyId] : undefined
    const amount = Number(draft?.amount)
    return draft && draft.amount.trim() && Number.isFinite(amount) && amount > 0 && draft.reason.trim()
      ? [{ policyId: value.policyId!, amount, reason: draft.reason.trim(), evidence: draft.evidence.trim() || undefined }] : []
  })
  const canConfirm = !waitingInsurance && (automatic.length > 0 || manualInputs.length > 0)

  if (relief.isPending) return <div className="relief-cashier__settlement"><LoadingState label="正在核对惠民减免" /></div>
  if (relief.isError) return <div className="relief-cashier__settlement">
    <Alert tone="warning" placement="inline">惠民减免核对失败：{errorMessage(relief.error)}</Alert>
    <Button size="sm" variant="secondary" onClick={() => void relief.refetch()}>重新核对</Button>
  </div>
  if (!applied.length && !pending.length) return null

  const setDraft = (policyId: string, patch: Partial<ManualDraft>) => setManual((current) => ({
    ...current, [policyId]: { ...(current[policyId] ?? { amount: '', reason: '', evidence: '' }), ...patch },
  }))

  return <div className="relief-cashier__settlement">
    <div className="relief-cashier__head">
      <strong>惠民减免 · {settlement.settlementNo}</strong>
      <span className="relief-cashier__totals">
        <span>优惠 {money(relief.data?.discountAmount, currency)}</span>
        <span>医保后减免 {money(relief.data?.reliefAmount, currency)}</span>
        <span>待收 {money(relief.data?.outstandingAmount, currency)}</span>
      </span>
    </div>
    {confirm.isError && <Alert placement="inline" duration={null}>{errorMessage(confirm.error)}</Alert>}
    <ul className="relief-cashier__list">
      {applied.map((value) => <li key={value.id} className="relief-cashier__item">
        <span className="relief-cashier__item-name">{value.policyName} · {value.timingText ?? value.timing}</span>
        <StatusBadge tone={reliefStatusTone(value.status)}>{value.statusText ?? value.status}</StatusBadge>
        <strong>-{money(value.reliefAmount, currency)}</strong>
        {value.manualReason && <span className="relief-cashier__item-reason">核准原因：{value.manualReason}</span>}
      </li>)}
      {automatic.map((value) => <li key={`auto-${value.policyId}`} className="relief-cashier__item">
        <span className="relief-cashier__item-name">{value.policyName} · {value.timingText ?? value.timing}</span>
        <StatusBadge tone="info">{waitingInsurance ? '医保结算后执行' : '待确认'}</StatusBadge>
        <strong>-{money(value.reliefAmount, currency)}</strong>
        {value.message && <span className="relief-cashier__item-reason">{value.message}</span>}
      </li>)}
      {awaiting.map((value) => {
        const draft = value.policyId ? manual[value.policyId] : undefined
        return <li key={`manual-${value.policyId}`} className="relief-cashier__item">
          <span className="relief-cashier__item-name">{value.policyName} · 基数 {money(value.baseAmount, currency)}</span>
          <StatusBadge tone={reliefStatusTone(value.status)}>{value.statusText ?? value.status}</StatusBadge>
          <span />
          {value.message && <span className="relief-cashier__item-reason">{value.message}</span>}
          {canApprove && !waitingInsurance && value.policyId ? <div className="relief-cashier__item-reason relief-dialog-fields">
            <FormField label="核准金额（元）" required>
              <input inputMode="decimal" value={draft?.amount ?? ''} disabled={confirm.isPending}
                onChange={(event) => setDraft(value.policyId!, { amount: event.target.value })} />
            </FormField>
            <FormField label="核准原因" required>
              <input value={draft?.reason ?? ''} maxLength={256} disabled={confirm.isPending}
                onChange={(event) => setDraft(value.policyId!, { reason: event.target.value })} />
            </FormField>
            <FormField label="依据" className="is-wide">
              <input value={draft?.evidence ?? ''} maxLength={512} disabled={confirm.isPending}
                onChange={(event) => setDraft(value.policyId!, { evidence: event.target.value })} />
            </FormField>
          </div> : <span className="relief-cashier__item-reason">
            {waitingInsurance ? '医保结算完成后再核准。' : '需有惠民减免核准权限的人员录入金额。'}
          </span>}
        </li>
      })}
      {skipped.map((value) => <li key={`skip-${value.policyId}`} className="relief-cashier__item">
        <span className="relief-cashier__item-name">{value.policyName}</span>
        <StatusBadge tone="neutral">{value.statusText ?? value.status}</StatusBadge>
        <span />
        {value.message && <span className="relief-cashier__item-reason">{value.message}</span>}
      </li>)}
    </ul>
    {(automatic.length > 0 || awaiting.length > 0) && <div className="relief-cashier__actions">
      {waitingInsurance && <span className="relief-cashier__totals">医保结算方式下，医保后减免在医保正式结算后自动执行。</span>}
      {!waitingInsurance && <Button size="sm" busy={confirm.isPending} disabled={!canConfirm || confirm.isPending}
        onClick={() => confirm.mutate(manualInputs)}>确认减免</Button>}
    </div>}
  </div>
}
