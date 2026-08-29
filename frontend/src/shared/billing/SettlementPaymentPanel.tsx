import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentOrder } from '../api/billingApi'
import { Button, FormField, Select, StatusBadge } from '../ui'

export interface SettlementOption {
  id: string
  code: string
  outstandingAmount: number
  currencyCode: string
}

export interface PaymentMethodOption {
  code: string
  name: string
}

export interface SettlementPaymentCommand {
  settlementId: string
  paymentMethodCode: string
  amount: number
  idempotencyKey: string
}

export function SettlementPaymentPanel({ settlements, methods, orders, busy, sceneLabel = '收款', onSubmit }: {
  settlements: SettlementOption[]
  methods: PaymentMethodOption[]
  orders: PaymentOrder[]
  busy?: boolean
  sceneLabel?: string
  onSubmit: (command: SettlementPaymentCommand) => Promise<unknown>
}) {
  const [settlementId, setSettlementId] = useState('')
  const [methodCode, setMethodCode] = useState('')
  const [amount, setAmount] = useState('')
  const submissionKey = useRef<string | null>(null)
  useEffect(() => {
    if (!settlements.some((value) => value.id === settlementId)) setSettlementId(settlements[0]?.id ?? '')
  }, [settlementId, settlements])
  useEffect(() => {
    if (!methods.some((value) => value.code === methodCode)) setMethodCode(methods[0]?.code ?? '')
  }, [methodCode, methods])
  const settlement = settlements.find((value) => value.id === settlementId)
  useEffect(() => {
    setAmount(settlement ? String(settlement.outstandingAmount) : '')
  }, [settlement?.id, settlement?.outstandingAmount])
  useEffect(() => { submissionKey.current = null }, [settlementId, methodCode, amount])
  const activeOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId
    && ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)), [orders, settlementId])
  const latestOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId), [orders, settlementId])
  const numericAmount = Number(amount)
  const disabled = !settlement || !methodCode || numericAmount <= 0
    || numericAmount > (settlement?.outstandingAmount ?? 0) || Boolean(activeOrder)

  return <div className="settlement-payment-panel">
    <div className="settlement-payment-panel__grid">
      <FormField label="待支付结算单"><Select value={settlementId} onChange={setSettlementId} showValue
        placeholder="暂无待支付结算单" options={settlements.map((value) => ({ value: value.id,
          label: value.code, secondaryText: money(value.outstandingAmount, value.currencyCode) }))} /></FormField>
      <FormField label="支付方式"><Select value={methodCode} onChange={setMethodCode} showValue
        placeholder="当前场景无可用方式" options={methods.map((value) => ({ value: value.code,
          label: value.name, secondaryText: value.code }))} /></FormField>
      <FormField label="本次支付金额"><input className="ui-field__control" type="number" min="0.01" step="0.01"
        value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField>
    </div>
    {activeOrder && <div className="settlement-payment-panel__notice">
      <StatusBadge tone="warning">{paymentOrderStatus(activeOrder.status)}</StatusBadge>
      <span>支付指令 {activeOrder.orderNo} 正在处理，已预占 {money(activeOrder.requestedAmount, activeOrder.currencyCode)}，请勿重复收款。</span>
    </div>}
    {!activeOrder && latestOrder && <div className="settlement-payment-panel__notice">
      <StatusBadge tone={latestOrder.status === 'SUCCEEDED' ? 'success' : latestOrder.status === 'FAILED' ? 'danger' : 'neutral'}>
        {paymentOrderStatus(latestOrder.status)}</StatusBadge>
      <span>最近支付指令 {latestOrder.orderNo}</span>
    </div>}
    <Button disabled={disabled} busy={busy} onClick={async () => {
      if (!settlement) return
      submissionKey.current ??= `PAY-${crypto.randomUUID()}`
      try {
        await onSubmit({ settlementId: settlement.id, paymentMethodCode: methodCode, amount: numericAmount,
          idempotencyKey: submissionKey.current })
        submissionKey.current = null
      } catch {
        // Keep the key so an operator retry cannot create a second channel instruction.
      }
    }}>{methodCode === 'CASH' ? `确认${sceneLabel}并记账` : `发起${sceneLabel}`}</Button>
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
