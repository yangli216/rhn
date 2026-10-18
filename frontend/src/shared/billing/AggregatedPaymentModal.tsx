import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaymentOrder, PaymentChannelCapability } from '../api/billingApi'
import { Button, Dialog, FormField, StatusBadge } from '../ui'

export interface AggregatedPaymentModalProps {
  open: boolean
  onClose: () => void
  paymentMethodCode: string
  paymentMethodName: string
  amount: number
  currencyCode?: string
  settlementId: string
  settlementCode?: string
  contextKey?: string
  onPaymentSuccess: (order: PaymentOrder) => void
  api: {
    billing: {
      paymentChannelCapabilities: (paymentMethodCode: string) => Promise<PaymentChannelCapability>
      createPaymentOrder: (settlementId: string, command: {
        idempotencyKey: string
        businessScene: PaymentOrder['businessScene']
        paymentSceneCode: string
        paymentMethodCode: string
        amount: number
        authorizationCode?: string
        terminalCode?: string
      }) => Promise<PaymentOrder>
      queryPaymentOrder: (orderId: string) => Promise<PaymentOrder>
      cancelPaymentOrder: (orderId: string) => Promise<PaymentOrder>
    }
  }
}

const waiting = (order: PaymentOrder) => ['CREATED', 'PROCESSING', 'PENDING', 'PARTIAL'].includes(order.status)

export function AggregatedPaymentModal({
  open, onClose, paymentMethodCode, paymentMethodName, amount, currencyCode = 'CNY',
  settlementId, settlementCode, contextKey, onPaymentSuccess, api,
}: AggregatedPaymentModalProps) {
  const [channel, setChannel] = useState<PaymentChannelCapability | null>(null)
  const [barcode, setBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null)
  const [polling, setPolling] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const queryInFlight = useRef(false)
  const delivered = useRef(false)
  const idempotencyKey = useRef('')
  const callbacks = useRef({ onClose, onPaymentSuccess, api })
  callbacks.current = { onClose, onPaymentSuccess, api }

  useEffect(() => {
    generation.current += 1
    inFlight.current = false
    queryInFlight.current = false
    delivered.current = false
    idempotencyKey.current = `PAY-${crypto.randomUUID()}`
    setChannel(null); setBarcode(''); setLoading(false); setError(null); setActiveOrder(null); setPolling(false)
    if (open) inputRef.current?.focus()
    return () => { generation.current += 1 }
  }, [open, settlementId, paymentMethodCode, amount, currencyCode, contextKey])

  useEffect(() => {
    if (!open) return
    const version = generation.current
    void callbacks.current.api.billing.paymentChannelCapabilities(paymentMethodCode).then(value => {
      if (version !== generation.current) return
      const capability = value?.capabilities
      if (value?.paymentMethodCode !== paymentMethodCode || typeof value.available !== 'boolean') throw new Error('渠道能力数据无效')
      if (!value.available) { setChannel(value); setError(value.unavailableReason || '当前机构支付渠道不可用'); return }
      if (!capability || !['DIRECT', 'AUTHORIZATION_CODE'].includes(capability.interaction)
        || typeof capability.querySupported !== 'boolean' || typeof capability.refundSupported !== 'boolean'
        || typeof capability.confirmBeforeCancel !== 'boolean' || typeof capability.adapterCode !== 'string' || !capability.adapterCode) throw new Error('渠道交互尚不支持')
      if (capability.interaction === 'AUTHORIZATION_CODE') {
        const rule = capability.authorizationCodeRule
        if (!rule || typeof rule.pattern !== 'string' || !rule.pattern || rule.pattern.length > 256 || !Number.isInteger(rule.minLength) || !Number.isInteger(rule.maxLength)
          || rule.minLength < 1 || rule.maxLength < rule.minLength || rule.maxLength > 32) throw new Error('付款码规则无效')
        new RegExp(`^(?:${rule.pattern})$`)
      }
      setChannel(value)
    }).catch(() => {
      if (version === generation.current) { setChannel(null); setError('支付渠道能力加载失败，请关闭后重试或联系管理员') }
    })
  }, [open, paymentMethodCode, settlementId, amount, currencyCode, contextKey])

  const accept = useCallback((order: PaymentOrder) => {
    setActiveOrder(order)
    if (order.status === 'SUCCEEDED') {
      setPolling(false)
      if (!delivered.current) {
        delivered.current = true
        callbacks.current.onPaymentSuccess(order)
        callbacks.current.onClose()
      }
    } else if (!waiting(order)) {
      setPolling(false)
      setError(order.errorMessage || '渠道确认本次支付未成功，可重新扫描付款码')
    }
  }, [])

  const query = useCallback(async (orderId: string, version: number) => {
    if (queryInFlight.current) return
    queryInFlight.current = true
    try {
      const order = await callbacks.current.api.billing.queryPaymentOrder(orderId)
      if (version === generation.current) { setError(null); accept(order) }
    } catch {
      if (version === generation.current) setError('查单暂未完成，请继续核验原支付单，勿重复收款')
    } finally {
      if (version === generation.current) queryInFlight.current = false
    }
  }, [accept])

  const activeOrderId = activeOrder?.id
  const isPending = activeOrder != null && waiting(activeOrder)
  useEffect(() => {
    if (!open || !polling || !activeOrderId || !isPending || !channel?.capabilities?.querySupported) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const version = generation.current
    const deadline = Date.now() + 60_000
    const poll = async () => {
      await query(activeOrderId, version)
      if (disposed) return
      if (Date.now() >= deadline) {
        setPolling(false)
        setError('支付结果仍待确认，请核验原支付单或在支付恢复工作台继续查询，勿重复收款')
      } else timer = setTimeout(() => { void poll() }, 2000)
    }
    timer = setTimeout(() => { void poll() }, 2000)
    return () => { disposed = true; clearTimeout(timer) }
  }, [open, polling, activeOrderId, isPending, query, channel?.capabilities?.querySupported])

  const submit = async () => {
    if (inFlight.current || !channel?.available || !channel.capabilities || (activeOrder && waiting(activeOrder))) return
    const needsCode = channel.capabilities.interaction === 'AUTHORIZATION_CODE'
    const authorizationCode = needsCode ? barcode.trim() : undefined
    const rule = channel.capabilities.authorizationCodeRule
    if (needsCode && (!authorizationCode || !rule || authorizationCode.length < rule.minLength
      || authorizationCode.length > rule.maxLength || !new RegExp(`^(?:${rule.pattern})$`).test(authorizationCode))) {
      setError('请扫描所选支付方式的有效患者付款码')
      return
    }
    if (activeOrder && !waiting(activeOrder)) idempotencyKey.current = `PAY-${crypto.randomUUID()}`
    const version = generation.current
    inFlight.current = true; setLoading(true); setError(null); setBarcode('')
    try {
      const order = await api.billing.createPaymentOrder(settlementId, {
        idempotencyKey: idempotencyKey.current,
        businessScene: 'OUTPATIENT', paymentSceneCode: 'CASHIER', paymentMethodCode,
        amount, authorizationCode, terminalCode: needsCode ? 'CASHIER-BARCODE' : 'CASHIER-CHANNEL',
      })
      if (version !== generation.current) return
      accept(order)
      if (waiting(order)) setPolling(true)
    } catch {
      if (version === generation.current) setError('提交结果暂未确认；再次核验使用同一支付请求，请勿另建收款')
    } finally {
      if (version === generation.current) { inFlight.current = false; setLoading(false) }
    }
  }

  const close = () => {
    if (inFlight.current) return
    generation.current += 1
    setBarcode(''); setPolling(false)
    onClose()
  }
  if (!open) return null
  const pending = activeOrder != null && waiting(activeOrder)
  const needsCode = channel?.available && channel.capabilities?.interaction === 'AUTHORIZATION_CODE'
  return <Dialog
    title={`渠道收款 · ${paymentMethodName}`}
    description={`结算单：${settlementCode || settlementId} · 应付：${amount.toFixed(2)} ${currencyCode}`}
    onClose={close}
    size="default"
    footer={<>
      <Button variant="secondary" onClick={close} disabled={loading}>关闭</Button>
      {pending && channel?.capabilities?.querySupported
        ? <Button onClick={() => { void query(activeOrder.id, generation.current) }}>核验支付结果</Button>
        : <Button onClick={() => { void submit() }} disabled={loading || pending || !channel?.available}>{loading ? '正在提交…' : '确认收款'}</Button>}
    </>}
  >
    {!channel && !error && <p role="status">正在加载支付渠道能力…</p>}
    {needsCode && <FormField label="患者付款码" required hint="使用扫码枪扫描患者手机付款码，按 Enter 提交；付款码不会保存。">
      <input ref={inputRef} autoFocus type="password" inputMode="text" autoComplete="off" maxLength={channel?.capabilities?.authorizationCodeRule?.maxLength}
        value={barcode} disabled={loading || pending}
        onChange={event => setBarcode(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }} />
    </FormField>}
    {channel?.available && !needsCode && <p>确认金额后发起渠道收款。</p>}
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status"><StatusBadge tone="warning">待确认</StatusBadge> 请勿重复收款。关闭窗口后仍可在支付恢复工作台查询。</p>}
  </Dialog>
}
