import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import type { ManualReliefInput, ReliefOutcome, SettlementRelief } from '../../../shared/api/reliefApi'
import { Alert, Button, FormField, LoadingState, StatusBadge } from '../../../shared/ui'
import { CashAmountInput, CashPresetChips, CashReadonlyAmount } from '../../../shared/billing/CashPaymentCalculator'
import { money } from '../BillingShared'
import './billing-relief.css'

export interface ReliefSettlementTarget {
  id: string
  settlementNo: string
  currencyCode: string
  /** 医保已正式结算；医保后减免据此按医保患者计算。 */
  insuranceSettled: boolean
  /** 医保已预结算（试算完成、尚未正式结算）：个人现金自付已知，可预估并预先核定减免。 */
  insurancePreSettled?: boolean
}

/** 预结算后的减免计划：已加入核定的人工项与预估金额，由收费工作台在医保正式结算时一并提交。 */
export interface SettlementReliefPlan {
  manual: ManualReliefInput[]
  autoEstimate: number
  manualEstimate: number
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
 * 收费结算的减免块（无标题；嵌入结算面板的医保信息之后、支付方式之前）：每项减免一行「名称 + 金额」。
 * 自动计算的减免只读显示金额；人工核定类直接在金额框输入（或点“上限/减半”快捷填入）即视为核定（原因统一为默认值）。
 * 医保方式下，医保后减免在医保正式结算后自动执行；预结算后的核定金额随医保正式结算一并提交。
 */
export function SettlementReliefPanel({ api, settlements, settlementMode, rights, onChanged, onPlanChange }: {
  api: RhnApi
  settlements: ReliefSettlementTarget[]
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  rights: ReliefDecisionRights
  onChanged: () => Promise<unknown>
  onPlanChange?: (settlementId: string, plan: SettlementReliefPlan) => void
}) {
  if (!settlements.length) return null
  // 各结算单无减免时卡片返回 null，容器为空，由 CSS :empty 隐藏，避免在结算面板里留下空白间距。
  return <section className="relief-cashier" aria-label="减免">
    {settlements.map((settlement) => <SettlementReliefCard key={settlement.id} api={api} settlement={settlement}
      showNo={settlements.length > 1} settlementMode={settlementMode} rights={rights} onChanged={onChanged}
      onPlanChange={onPlanChange} />)}
  </section>
}

/** 核定金额的校验：必须为正数、不超过本次可核定上限；超过审批阈值时需审批权限。 */
export function manualAmountError(value: ReliefOutcome, amountText: string, canApprove: boolean): string | undefined {
  if (!amountText.trim()) return undefined
  const amount = Number(amountText)
  if (Number.isFinite(amount) && amount === 0) return undefined // 0 表示不核定
  if (!Number.isFinite(amount) || amount < 0) return '请输入大于零的金额'
  if (!/^\d+(\.\d{1,2})?$/.test(amountText.trim())) return '金额最多两位小数'
  if (value.manualMaxAmount != null && amount > value.manualMaxAmount) return `不能超过本次可核定金额 ${value.manualMaxAmount.toFixed(2)} 元`
  if (!canApprove && value.manualApprovalAmount != null && amount > value.manualApprovalAmount) {
    return `超过审批阈值 ${value.manualApprovalAmount.toFixed(2)} 元，需由有审批权限的人员核定`
  }
  return undefined
}

/** 人工核定统一使用的默认原因（后端要求原因非空；收费窗口不再录入原因与依据）。 */
export const DEFAULT_MANUAL_REASON = '收费窗口人工核定'

function SettlementReliefCard({ api, settlement, showNo, settlementMode, rights, onChanged, onPlanChange }: {
  api: RhnApi
  settlement: ReliefSettlementTarget
  showNo: boolean
  settlementMode: 'SELF_PAY' | 'MEDICAL_INSURANCE'
  rights: ReliefDecisionRights
  onChanged: () => Promise<unknown>
  onPlanChange?: (settlementId: string, plan: SettlementReliefPlan) => void
}) {
  const [manual, setManual] = useState<Record<string, string>>({})
  const planCallback = useRef(onPlanChange)
  planCallback.current = onPlanChange
  const wasPreSettled = useRef(false)
  const preSettled = settlementMode === 'MEDICAL_INSURANCE' && Boolean(settlement.insurancePreSettled) && !settlement.insuranceSettled
  const relief = useQuery({
    queryKey: ['settlement-relief', settlement.id, preSettled],
    queryFn: () => api.relief.settlementRelief(settlement.id),
  })
  const currency = settlement.currencyCode
  const applied = (relief.data?.applications ?? []).filter((value) => value.status !== 'REVERSED')
  const pending = relief.data?.pending ?? []
  const automatic = pending.filter((value) => value.status === 'APPLIED')
  const awaiting = useMemo(() => (relief.data?.pending ?? []).filter((value) => value.status === 'AWAITING_MANUAL'), [relief.data])
  // 不适用（SKIPPED）的政策对收费员无可操作内容，不展示；原因仅在政策管理与减免记录中查看。
  // 医保方式且尚未医保结算时，按自费确认会阻止后续医保结算，因此只展示预估。
  const waitingInsurance = settlementMode === 'MEDICAL_INSURANCE' && !settlement.insuranceSettled && !preSettled
  const canDecide = rights.canDecide || rights.canApprove
  const editable = canDecide && !waitingInsurance
  const { canApprove } = rights

  // 已填写且通过校验的人工核定项；校验失败的项只显示错误，不计入。
  const filled = useMemo(() => awaiting.flatMap((value) => {
    const text = value.policyId ? manual[value.policyId] ?? '' : ''
    if (!editable || !value.policyId || !text.trim()) return []
    const amount = Number(text)
    if (!(amount > 0)) return []
    return [{ value, amount, invalid: Boolean(manualAmountError(value, text, canApprove)) }]
  }), [awaiting, manual, editable, canApprove])
  const manualInputs = useMemo<ManualReliefInput[]>(() => filled.filter((item) => !item.invalid).map((item) => ({
    policyId: item.value.policyId!, amount: item.amount, reason: DEFAULT_MANUAL_REASON })), [filled])
  const hasInvalid = awaiting.some((value) => value.policyId && manualAmountError(value, manual[value.policyId] ?? '', canApprove))

  const confirm = useMutation({
    mutationFn: (items: ManualReliefInput[]) => api.relief.confirmSettlementRelief(settlement.id, items),
    onSuccess: async () => {
      setManual({})
      await Promise.all([relief.refetch(), onChanged()])
    },
  })
  const autoEstimate = preSettled ? Number(automatic.reduce((sum, value) => sum + (value.reliefAmount ?? 0), 0).toFixed(2)) : 0
  const manualEstimate = Number(manualInputs.reduce((sum, value) => sum + value.amount, 0).toFixed(2))
  // 预结算期间向收费工作台汇报当前计划；取消试算或医保正式结算后清空本地输入。
  useEffect(() => {
    if (!preSettled) {
      if (wasPreSettled.current) setManual((current) => Object.keys(current).length ? {} : current)
      wasPreSettled.current = false
      return
    }
    wasPreSettled.current = true
    planCallback.current?.(settlement.id, { manual: manualInputs, autoEstimate, manualEstimate })
  }, [preSettled, settlement.id, manualInputs, autoEstimate, manualEstimate])

  if (relief.isPending) return <div className="relief-cashier__settlement"><LoadingState label="正在核对减免" /></div>
  if (relief.isError) return <div className="relief-cashier__settlement">
    <Alert tone="warning" placement="inline">减免核对失败：{errorMessage(relief.error)}</Alert>
    <Button size="sm" variant="secondary" onClick={() => void relief.refetch()}>重新核对</Button>
  </div>
  if (!applied.length && !automatic.length && !awaiting.length) return null

  const showConfirm = !waitingInsurance && !preSettled && (automatic.length > 0 || filled.length > 0)
  return <div className="relief-cashier__settlement">
    {showNo && <div className="relief-cashier__no">{settlement.settlementNo}</div>}
    {confirm.isError && <Alert placement="inline" duration={null}>{errorMessage(confirm.error)}</Alert>}
    <ul className="relief-cashier__list">
      {applied.map((value) => <li key={value.id} className="relief-cashier__row">
        <span className="relief-cashier__name">{value.policyName}</span>
        <CashReadonlyAmount currencySymbol="" valueClassName="relief-cashier__amount" text={`-${money(value.reliefAmount, currency)}`} />
      </li>)}
      {automatic.map((value) => <li key={`auto-${value.policyId}`} className="relief-cashier__row">
        <span className="relief-cashier__name">{value.policyName}</span>
        <CashReadonlyAmount currencySymbol="" valueClassName="relief-cashier__amount" text={`-${money(value.reliefAmount, currency)}`} />
        {(preSettled || waitingInsurance) && <span className="relief-cashier__tag">预估</span>}
      </li>)}
      {awaiting.map((value) => <ManualReliefRow key={value.policyId} value={value} editable={editable && Boolean(value.policyId)}
        lockedReason={waitingInsurance ? '医保结算后核定' : !canDecide ? '无核定权限' : undefined} canApprove={canApprove}
        disabled={confirm.isPending} text={value.policyId ? manual[value.policyId] ?? '' : ''}
        onChange={(text) => setManual((current) => ({ ...current, [value.policyId!]: text }))} />)}
    </ul>
    {showConfirm && <div className="relief-cashier__actions">
      <Button size="sm" variant="secondary" busy={confirm.isPending} disabled={hasInvalid || confirm.isPending}
        onClick={() => confirm.mutate(manualInputs)}>确认减免</Button>
    </div>}
  </div>
}

function ManualReliefRow({ value, editable, lockedReason, canApprove, disabled, text, onChange }: {
  value: ReliefOutcome
  editable: boolean
  lockedReason?: string
  canApprove: boolean
  disabled: boolean
  text: string
  onChange: (text: string) => void
}) {
  const inputId = useId()
  const max = value.manualMaxAmount
  if (max != null && max <= 0) return <li className="relief-cashier__row">
    <span className="relief-cashier__name">{value.policyName}</span>
    <span className="relief-cashier__note relief-cashier__tag">本次已无可核定金额</span>
  </li>
  if (!editable) return <li className="relief-cashier__row">
    <span className="relief-cashier__name">{value.policyName}</span>
    {lockedReason && <span className="relief-cashier__note"><StatusBadge tone="neutral">{lockedReason}</StatusBadge></span>}
  </li>
  const error = manualAmountError(value, text, canApprove)
  const errorId = `${inputId}-error`
  // 快捷核定：上限 = 本次可核定上限，减半 = 上限的一半（两位小数）；点击即填入。
  const presets = max != null ? [
    { key: 'max', label: '上限', amount: max.toFixed(2) },
    { key: 'half', label: '减半', amount: (max / 2).toFixed(2) },
  ] : []
  return <li className="relief-cashier__row">
    <label className="relief-cashier__name" htmlFor={inputId}>{value.policyName}</label>
    <CashAmountInput id={inputId} value={text} disabled={disabled} invalid={Boolean(error)} describedBy={error ? errorId : undefined}
      placeholder={max != null ? `≤${max.toFixed(2)}` : '核定金额'} onChange={onChange} />
    <CashPresetChips disabled={disabled} chips={presets.map((preset) => ({
      key: preset.key, label: preset.label, active: text.trim() !== '' && Number(text) === Number(preset.amount),
      onClick: () => onChange(preset.amount),
    }))} />
    {error && <small id={errorId} className="relief-cashier__error">{error}</small>}
  </li>
}
