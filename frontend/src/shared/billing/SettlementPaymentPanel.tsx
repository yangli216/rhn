import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentOrder } from '../api/billingApi'
import { Button, FormField, Select, StatusBadge } from '../ui'

export interface SettlementOption {
  id: string
  code: string
  outstandingAmount: number
  currencyCode: string
  insuranceReady?: boolean
  insurancePreparationAllowed?: boolean
  insuranceAmount?: number
  personalAccountAmount?: number
  otherFundAmount?: number
}

export interface PaymentMethodOption {
  code: string
  name: string
}

export interface SettlementPaymentCommand {
  settlementId: string
  settlementModeCode?: SettlementModeCode
  paymentMethodCode: string
  amount: number
  idempotencyKey: string
}

export type SettlementModeCode = 'SELF_PAY' | 'MEDICAL_INSURANCE'

export function SettlementPaymentPanel({ settlements, methods, orders, busy, recoveringOrderId,
  sceneLabel = '收款', targetLabel = '待支付结算单', actionLabel, busyLabel,
  showSettlementMode = false, settlementModeCode, onSettlementModeChange, onSubmit, onRecoverOrder }: {
  settlements: SettlementOption[]
  methods: PaymentMethodOption[]
  orders: PaymentOrder[]
  busy?: boolean
  recoveringOrderId?: string
  sceneLabel?: string
  targetLabel?: string
  actionLabel?: string
  busyLabel?: string
  showSettlementMode?: boolean
  settlementModeCode?: SettlementModeCode
  onSettlementModeChange?: (value: SettlementModeCode) => void
  onSubmit: (command: SettlementPaymentCommand) => Promise<unknown>
  onRecoverOrder?: (order: PaymentOrder) => Promise<unknown>
}) {
  const [settlementId, setSettlementId] = useState('')
  const [internalSettlementMode, setInternalSettlementMode] = useState<SettlementModeCode>('SELF_PAY')
  const [methodCode, setMethodCode] = useState('')
  const [amount, setAmount] = useState('')
  const submissionKey = useRef<string | null>(null)
  const activeSettlementMode = settlementModeCode ?? internalSettlementMode
  const monetaryMethods = useMemo(() => methods.filter((value) => value.code !== 'MEDICAL_INSURANCE'), [methods])
  useEffect(() => {
    if (!settlements.some((value) => value.id === settlementId)) setSettlementId(settlements[0]?.id ?? '')
  }, [settlementId, settlements])
  useEffect(() => {
    if (!monetaryMethods.some((value) => value.code === methodCode)) setMethodCode(monetaryMethods[0]?.code ?? '')
  }, [methodCode, monetaryMethods])
  const settlement = settlements.find((value) => value.id === settlementId)
  const insuranceMode = activeSettlementMode === 'MEDICAL_INSURANCE'
  const insurancePending = Boolean(insuranceMode && settlement && !settlement.insuranceReady)
  const insurancePreparationAllowed = Boolean(insurancePending && settlement?.insurancePreparationAllowed)
  useEffect(() => {
    setAmount(settlement && !insurancePending ? String(settlement.outstandingAmount) : '')
  }, [insurancePending, settlement?.id, settlement?.outstandingAmount])
  useEffect(() => { submissionKey.current = null }, [settlementId, activeSettlementMode, methodCode, amount])
  const activeOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId
    && ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)), [orders, settlementId])
  const latestOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId), [orders, settlementId])
  const numericAmount = Number(amount)
  const paymentRequired = !insurancePending && (settlement?.outstandingAmount ?? 0) > 0
  const disabled = !settlement || (insurancePending && !insurancePreparationAllowed)
    || (paymentRequired && (!methodCode || numericAmount <= 0
    || numericAmount > (settlement?.outstandingAmount ?? 0))) || Boolean(activeOrder)

  return <div className="settlement-payment-panel">
    <div className="settlement-payment-panel__grid">
      {showSettlementMode && <FormField label="结算类型"><Select value={activeSettlementMode}
        searchable={false} clearable={false} onChange={(value) => {
          const next = value as SettlementModeCode
          if (settlementModeCode === undefined) setInternalSettlementMode(next)
          onSettlementModeChange?.(next)
        }} options={[
          { value: 'SELF_PAY', label: '自费结算' },
          { value: 'MEDICAL_INSURANCE', label: '医保结算' },
        ]} /></FormField>}
      <FormField label={targetLabel}><Select value={settlementId} onChange={setSettlementId} showValue
        placeholder="暂无待支付结算单" options={settlements.map((value) => ({ value: value.id,
          label: value.code, secondaryText: money(value.outstandingAmount, value.currencyCode) }))} /></FormField>
      {paymentRequired && <FormField label={insuranceMode ? '个人自付支付方式' : '支付方式'}><Select
        value={methodCode} onChange={setMethodCode} showValue placeholder="当前场景无可用方式"
        options={monetaryMethods.map((value) => ({ value: value.code,
          label: value.name, secondaryText: value.code }))} /></FormField>}
      {paymentRequired && <FormField label={insuranceMode ? '个人自付金额' : '本次支付金额'}><input
        className="ui-field__control" type="number" min="0.01" step="0.01"
        value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField>}
    </div>
    {insurancePending && <div className="settlement-payment-panel__notice">
      <div className="settlement-payment-panel__notice-copy"><StatusBadge tone="warning">待医保结算</StatusBadge>
        <span>{insurancePreparationAllowed
          ? '结算后先进入医保预结算，医保返回个人自付金额后再选择支付方式。'
          : '医保预结算尚未返回，当前不能按患者全额发起收款。'}</span></div>
    </div>}
    {insuranceMode && settlement?.insuranceReady && <div className="settlement-payment-panel__waived">
      <strong>医保结算已完成</strong><span>医保基金 {money(settlement.insuranceAmount ?? 0, settlement.currencyCode)}
        {' · '}个人账户 {money(settlement.personalAccountAmount ?? 0, settlement.currencyCode)}
        {' · '}个人自付待收 {money(settlement.outstandingAmount, settlement.currencyCode)}</span>
    </div>}
    {settlement && !insurancePending && !paymentRequired && <div className="settlement-payment-panel__waived">
      <strong>本次无需收款</strong><span>{insuranceMode ? '医保结算后无个人自付金额。' : '费用已冲抵，结算后直接完成记账。'}</span>
    </div>}
    {activeOrder && <div className="settlement-payment-panel__notice">
      <div className="settlement-payment-panel__notice-copy">
        <StatusBadge tone="warning">{paymentOrderStatus(activeOrder.status)}</StatusBadge>
        <span>支付指令 {activeOrder.orderNo} 已预占 {money(activeOrder.requestedAmount, activeOrder.currencyCode)}，
          请先查询并恢复，不要重复收款。</span>
      </div>
      {onRecoverOrder && <Button size="sm" variant="secondary" busy={recoveringOrderId === activeOrder.id}
        busyLabel="正在查询" onClick={() => { void onRecoverOrder(activeOrder).catch(() => undefined) }}>
        {activeOrder.paymentMethodCode === 'CASH' ? '查询并恢复' : '查询支付结果'}
      </Button>}
    </div>}
    {!activeOrder && latestOrder && <div className="settlement-payment-panel__notice">
      <div className="settlement-payment-panel__notice-copy">
        <StatusBadge tone={latestOrder.status === 'SUCCEEDED' ? 'success' : latestOrder.status === 'FAILED' ? 'danger' : 'neutral'}>
          {paymentOrderStatus(latestOrder.status)}</StatusBadge>
        <span>最近支付指令 {latestOrder.orderNo}</span>
      </div>
    </div>}
    <Button disabled={disabled} busy={busy} busyLabel={busyLabel} onClick={async () => {
      if (!settlement) return
      submissionKey.current ??= `PAY-${crypto.randomUUID()}`
      try {
        await onSubmit({ settlementId: settlement.id,
          settlementModeCode: showSettlementMode ? activeSettlementMode : undefined,
          paymentMethodCode: paymentRequired ? methodCode : '', amount: paymentRequired ? numericAmount : 0,
          idempotencyKey: submissionKey.current })
        submissionKey.current = null
      } catch {
        // Keep the key so an operator retry cannot create a second channel instruction.
      }
    }}>{actionLabel ?? (methodCode === 'CASH' ? `确认${sceneLabel}并记账` : `发起${sceneLabel}`)}</Button>
  </div>
}

function paymentOrderStatus(status: PaymentOrder['status']) {
  return ({
    CREATED: '已创建', PENDING: '待通道确认', PROCESSING: '处理中', PARTIAL: '部分成功',
    SUCCEEDED: '支付成功', FAILED: '支付失败', CANCELLED: '已取消', EXPIRED: '已过期',
    REFUNDING: '退款中', REFUNDED: '已退款',
  } as Record<PaymentOrder['status'], string>)[status]
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}
