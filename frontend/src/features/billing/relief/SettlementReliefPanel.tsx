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

/** 预览中尚待执行的政策：自动可减免或可人工核定。 */
export function actionableRelief(relief: Pick<SettlementRelief, 'pending'> | undefined): ReliefOutcome[] {
  return (relief?.pending ?? []).filter((value) => value.status === 'APPLIED' || value.status === 'AWAITING_MANUAL')
}

/** 收费员的人工核定权限：核定权限可在审批阈值内核定，审批权限不受阈值限制。 */
export interface ReliefDecisionRights {
  canDecide: boolean
  canApprove: boolean
}

/**
 * 收费结算的惠民减免块：列出待收结算单已执行的减免与可享受的医保后减免，由收费员确认；
 * 人工核定类政策由收费员按需展开核定，填写金额、原因与依据。医保结算方式下，医保后减免在医保正式结算后自动执行，
 * 人工核定也在医保正式结算后进行。
 */
export function SettlementReliefPanel({ api, settlements, settlementMode, rights, onChanged }: {
  api: RhnApi
  settlements: ReliefSettlementTarget[]
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  rights: ReliefDecisionRights
  onChanged: () => Promise<unknown>
}) {
  if (!settlements.length) return null
  return <section className="relief-cashier" aria-label="惠民减免">
    {settlements.map((settlement) => <SettlementReliefCard key={settlement.id} api={api} settlement={settlement}
      settlementMode={settlementMode} rights={rights} onChanged={onChanged} />)}
  </section>
}

type ManualDraft = { open: boolean; amount: string; reason: string; evidence: string }
const EMPTY_DRAFT: ManualDraft = { open: false, amount: '', reason: '', evidence: '' }

/** 核定金额的校验：必须为正数、不超过本次可核定上限；超过审批阈值时需审批权限。 */
export function manualAmountError(value: ReliefOutcome, amountText: string, canApprove: boolean): string | undefined {
  if (!amountText.trim()) return undefined
  const amount = Number(amountText)
  if (!Number.isFinite(amount) || amount <= 0) return '请输入大于零的金额'
  if (!/^\d+(\.\d{1,2})?$/.test(amountText.trim())) return '金额最多两位小数'
  if (value.manualMaxAmount != null && amount > value.manualMaxAmount) return `不能超过本次可核定金额 ${value.manualMaxAmount.toFixed(2)} 元`
  if (!canApprove && value.manualApprovalAmount != null && amount > value.manualApprovalAmount) {
    return `超过审批阈值 ${value.manualApprovalAmount.toFixed(2)} 元，需由有审批权限的人员核定`
  }
  return undefined
}

function SettlementReliefCard({ api, settlement, settlementMode, rights, onChanged }: {
  api: RhnApi
  settlement: ReliefSettlementTarget
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  rights: ReliefDecisionRights
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
  const canDecide = rights.canDecide || rights.canApprove
  const openDrafts = awaiting.flatMap((value) => {
    const draft = value.policyId ? manual[value.policyId] : undefined
    return draft?.open ? [{ value, draft }] : []
  })
  const draftInvalid = openDrafts.some(({ value, draft }) => !draft.amount.trim() || !draft.reason.trim()
    || Boolean(manualAmountError(value, draft.amount, rights.canApprove)))
  const manualInputs: ManualReliefInput[] = openDrafts.map(({ value, draft }) => ({
    policyId: value.policyId!, amount: Number(draft.amount), reason: draft.reason.trim(),
    evidence: draft.evidence.trim() || undefined,
  }))
  const canConfirm = !waitingInsurance && !draftInvalid && (automatic.length > 0 || manualInputs.length > 0)

  if (relief.isPending) return <div className="relief-cashier__settlement"><LoadingState label="正在核对惠民减免" /></div>
  if (relief.isError) return <div className="relief-cashier__settlement">
    <Alert tone="warning" placement="inline">惠民减免核对失败：{errorMessage(relief.error)}</Alert>
    <Button size="sm" variant="secondary" onClick={() => void relief.refetch()}>重新核对</Button>
  </div>
  if (!applied.length && !pending.length) return null

  const setDraft = (policyId: string, patch: Partial<ManualDraft>) => setManual((current) => ({
    ...current, [policyId]: { ...(current[policyId] ?? EMPTY_DRAFT), ...patch },
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
        {value.manualReason && <span className="relief-cashier__item-reason">核定原因：{value.manualReason}</span>}
      </li>)}
      {automatic.map((value) => <li key={`auto-${value.policyId}`} className="relief-cashier__item">
        <span className="relief-cashier__item-name">{value.policyName} · {value.timingText ?? value.timing}</span>
        <StatusBadge tone="info">{waitingInsurance ? '医保结算后执行' : '待确认'}</StatusBadge>
        <strong>-{money(value.reliefAmount, currency)}</strong>
        {value.message && <span className="relief-cashier__item-reason">{value.message}</span>}
      </li>)}
      {skipped.map((value) => <li key={`skip-${value.policyId}`} className="relief-cashier__item">
        <span className="relief-cashier__item-name">{value.policyName}</span>
        <StatusBadge tone="neutral">{value.statusText ?? value.status}</StatusBadge>
        <span />
        {value.message && <span className="relief-cashier__item-reason">{value.message}</span>}
      </li>)}
    </ul>
    {awaiting.length > 0 && <div className="relief-manual" aria-label="人工核定">
      <div className="relief-manual__head">
        <strong>人工核定</strong>
        <span className="relief-cashier__totals">
          {waitingInsurance ? '医保正式结算完成后，可按患者实际情况核定减免。'
            : canDecide ? '按患者实际情况选择核定类别，填写金额、原因与依据。' : '需有惠民减免核定权限的人员核定。'}
        </span>
      </div>
      <ul className="relief-cashier__list">
        {awaiting.map((value) => <ManualReliefRow key={value.policyId} value={value} currency={currency}
          draft={value.policyId ? manual[value.policyId] ?? EMPTY_DRAFT : EMPTY_DRAFT}
          editable={canDecide && !waitingInsurance && Boolean(value.policyId)} canApprove={rights.canApprove}
          disabled={confirm.isPending} onChange={(patch) => setDraft(value.policyId!, patch)} />)}
      </ul>
    </div>}
    {(automatic.length > 0 || openDrafts.length > 0 || (waitingInsurance && awaiting.length > 0)) && <div className="relief-cashier__actions">
      {waitingInsurance && <span className="relief-cashier__totals">医保结算方式下，医保后减免在医保正式结算后自动执行。</span>}
      {!waitingInsurance && <Button size="sm" busy={confirm.isPending} disabled={!canConfirm || confirm.isPending}
        onClick={() => confirm.mutate(manualInputs)}>{manualInputs.length ? '确认核定与减免' : '确认减免'}</Button>}
    </div>}
  </div>
}

function ManualReliefRow({ value, currency, draft, editable, canApprove, disabled, onChange }: {
  value: ReliefOutcome
  currency: string
  draft: ManualDraft
  editable: boolean
  canApprove: boolean
  disabled: boolean
  onChange: (patch: Partial<ManualDraft>) => void
}) {
  const max = value.manualMaxAmount
  const exhausted = max != null && max <= 0
  const amountError = manualAmountError(value, draft.amount, canApprove)
  const limits = [max != null ? `最多可核定 ${money(max, currency)}` : `基数 ${money(value.baseAmount, currency)}`,
    value.manualApprovalAmount != null ? `超过 ${money(value.manualApprovalAmount, currency)} 需审批` : ''].filter(Boolean).join(' · ')
  return <li className="relief-cashier__item">
    <span className="relief-cashier__item-name">{value.policyName}<span className="relief-manual__limits"> · {limits}</span></span>
    <span />
    {editable && !exhausted
      ? <Button size="sm" variant={draft.open ? 'text' : 'secondary'} disabled={disabled}
        onClick={() => onChange(draft.open ? EMPTY_DRAFT : { open: true })}>{draft.open ? '取消核定' : '核定'}</Button>
      : <span />}
    {exhausted && <span className="relief-cashier__item-reason">本次已无可核定金额。</span>}
    {editable && draft.open && <div className="relief-cashier__item-reason relief-manual__form">
      <div className="relief-manual__amount">
        <FormField label="核定金额（元）" required error={amountError}>
          <input inputMode="decimal" value={draft.amount} disabled={disabled} autoFocus
            onChange={(event) => onChange({ amount: event.target.value })} />
        </FormField>
        {max != null && <Button size="sm" variant="text" disabled={disabled}
          onClick={() => onChange({ amount: max.toFixed(2) })}>按上限</Button>}
      </div>
      <FormField label="核定原因" required>
        <input value={draft.reason} maxLength={256} disabled={disabled} placeholder="如：家庭困难、突发变故"
          onChange={(event) => onChange({ reason: event.target.value })} />
      </FormField>
      <FormField label="依据" hint="证明材料或审批单编号，供对账报销">
        <input value={draft.evidence} maxLength={512} disabled={disabled}
          onChange={(event) => onChange({ evidence: event.target.value })} />
      </FormField>
    </div>}
  </li>
}
