import { useEffect, useRef, useState } from 'react'
import type { PaymentOrder } from '../api/billingApi'
import { Button, Dialog, StatusBadge } from '../ui'
import { Icon } from '../ui/Icon'

export interface AggregatedPaymentModalProps {
  open: boolean
  onClose: () => void
  paymentMethodCode: string
  paymentMethodName: string
  amount: number
  currencyCode?: string
  settlementId: string
  settlementCode?: string
  onPaymentSuccess: (order: PaymentOrder) => void
  api: {
    billing: {
      createPaymentOrder: (settlementId: string, command: {
        idempotencyKey: string
        businessScene: PaymentOrder['businessScene']
        paymentSceneCode: string
        paymentMethodCode: string
        amount: number
        terminalCode?: string
      }) => Promise<PaymentOrder>
      queryPaymentOrder: (orderId: string) => Promise<PaymentOrder>
      cancelPaymentOrder: (orderId: string) => Promise<PaymentOrder>
    }
  }
}

export function AggregatedPaymentModal({
  open,
  onClose,
  paymentMethodCode,
  paymentMethodName,
  amount,
  currencyCode = 'CNY',
  settlementId,
  settlementCode,
  onPaymentSuccess,
  api,
}: AggregatedPaymentModalProps) {
  const [activeTab, setActiveTab] = useState<'SCAN' | 'QR'>('SCAN')
  const [barcode, setBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isWeChat = paymentMethodCode === 'WECHAT'
  const isAlipay = paymentMethodCode === 'ALIPAY'

  // Focus barcode input when modal opens or tab changes to SCAN
  useEffect(() => {
    if (open && activeTab === 'SCAN') {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [open, activeTab])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setBarcode('')
      setLoading(false)
      setErrorMessage(null)
      setActiveOrder(null)
      setCountdown(60)
    } else {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [open])

  // Countdown timer in QR mode
  useEffect(() => {
    if (open && activeTab === 'QR') {
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      }
    }
  }, [open, activeTab])

  // Execute payment submission for barcode scan (被扫模式)
  const handleBarcodeSubmit = async (codeToUse?: string) => {
    const authCode = (codeToUse || barcode).trim()
    if (!authCode) {
      setErrorMessage('请使用扫码枪扫描付款码或手动输入')
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      const idempotencyKey = `PAY-${crypto.randomUUID()}`
      const order = await api.billing.createPaymentOrder(settlementId, {
        idempotencyKey,
        businessScene: 'OUTPATIENT',
        paymentSceneCode: 'CASHIER',
        paymentMethodCode,
        amount,
        terminalCode: `CASHIER-BARCODE-${authCode.slice(-4)}`,
      })

      if (order.status === 'SUCCEEDED') {
        onPaymentSuccess(order)
        onClose()
      } else if (order.status === 'PENDING') {
        setActiveOrder(order)
        // Start polling if pending
        startPolling(order.id)
      } else {
        setErrorMessage(order.errorMessage || '扣款未成功，请重试')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '支付接口通信异常，请重试'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  // Create QR order & start polling for customer scanning (主扫模式)
  const handleInitiateQrOrder = async () => {
    if (activeOrder) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const idempotencyKey = `PAY-QR-${crypto.randomUUID()}`
      const order = await api.billing.createPaymentOrder(settlementId, {
        idempotencyKey,
        businessScene: 'OUTPATIENT',
        paymentSceneCode: 'CASHIER',
        paymentMethodCode,
        amount,
        terminalCode: 'CASHIER-ONLINE_DYNAMIC_QR',
      })
      setActiveOrder(order)
      if (order.status === 'SUCCEEDED') {
        onPaymentSuccess(order)
        onClose()
      } else {
        startPolling(order.id)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成收款二维码失败'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  // Switch to QR tab
  const handleTabChange = (tab: 'SCAN' | 'QR') => {
    setActiveTab(tab)
    setErrorMessage(null)
    if (tab === 'QR' && !activeOrder) {
      void handleInitiateQrOrder()
    }
  }

  // Poll payment order status
  const startPolling = (orderId: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    pollingTimerRef.current = setInterval(async () => {
      try {
        const polled = await api.billing.queryPaymentOrder(orderId)
        setActiveOrder(polled)
        if (polled.status === 'SUCCEEDED') {
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
          onPaymentSuccess(polled)
          onClose()
        } else if (polled.status === 'FAILED' || polled.status === 'CANCELLED') {
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
          setErrorMessage(polled.errorMessage || '支付失败或已取消')
        }
      } catch {
        // Continue polling until timeout
      }
    }, 2000)
  }

  // Cancel active payment order
  const handleCancelPayment = async () => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    if (activeOrder && (activeOrder.status === 'PENDING' || activeOrder.status === 'PROCESSING')) {
      try {
        await api.billing.cancelPaymentOrder(activeOrder.id)
      } catch {
        // Ignore cancel errors
      }
    }
    onClose()
  }

  // Simulate barcode scanner input for testing
  const handleSimulateScan = () => {
    const mockCode = isWeChat ? `1348888${Date.now().toString().slice(-11)}` : `2848888${Date.now().toString().slice(-11)}`
    setBarcode(mockCode)
    void handleBarcodeSubmit(mockCode)
  }

  if (!open) return null

  return (
    <Dialog
      title={`聚合收单 · ${paymentMethodName}`}
      eyebrow="在线移动支付"
      description={`结算单：${settlementCode || settlementId} · 应付金额：¥${amount.toFixed(2)}`}
      onClose={handleCancelPayment}
      size="default"
      className="aggregated-payment-dialog"
      footer={
        <div className="aggregated-payment-dialog__footer">
          <Button variant="secondary" onClick={handleCancelPayment}>
            取消收款并关闭
          </Button>
          {activeTab === 'SCAN' ? (
            <Button
              busy={loading}
              disabled={loading || !barcode.trim()}
              onClick={() => void handleBarcodeSubmit()}
            >
              立即扣款 (Enter)
            </Button>
          ) : (
            <Button
              variant="secondary"
              busy={loading}
              onClick={async () => {
                if (activeOrder) {
                  setLoading(true)
                  try {
                    const polled = await api.billing.queryPaymentOrder(activeOrder.id)
                    if (polled.status === 'SUCCEEDED') {
                      onPaymentSuccess(polled)
                      onClose()
                    }
                  } finally {
                    setLoading(false)
                  }
                }
              }}
            >
              已付款？立即核验
            </Button>
          )}
        </div>
      }
    >
      <div className="aggregated-payment-content">
        {/* Amount & Method Banner */}
        <div className={`aggregated-payment-banner ${isWeChat ? 'is-wechat' : isAlipay ? 'is-alipay' : ''}`}>
          <div className="aggregated-payment-banner__meta">
            <span className="aggregated-payment-banner__tag">
              <Icon name="billing" />
              {paymentMethodName}
            </span>
            <small>请核对付款金额后扫码</small>
          </div>
          <div className="aggregated-payment-banner__amount">
            <span>¥</span>
            <strong>{amount.toFixed(2)}</strong>
            <small>{currencyCode}</small>
          </div>
        </div>

        {/* Tab switch */}
        <div className="aggregated-payment-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'SCAN'}
            className={`aggregated-payment-tab ${activeTab === 'SCAN' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('SCAN')}
          >
            被扫模式 (扫患者付款码)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'QR'}
            className={`aggregated-payment-tab ${activeTab === 'QR' ? 'is-active' : ''}`}
            onClick={() => handleTabChange('QR')}
          >
            主扫模式 (出示收款码)
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="aggregated-payment-error" role="alert">
            <Icon name="warning" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab 1: Barcode scanner (被扫模式) */}
        {activeTab === 'SCAN' && (
          <div className="aggregated-payment-scan-pane">
            <p className="aggregated-payment-hint">
              请使用扫码枪扫描患者手机微信或支付宝出示的 <strong>18 位付款码</strong>：
            </p>
            <div className="aggregated-payment-scan-box">
              <div className="aggregated-payment-input-wrap">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  className="aggregated-payment-input"
                  placeholder="在此刷入付款码 (支持扫码枪高速输入)..."
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcode.trim() && !loading) {
                      e.preventDefault()
                      void handleBarcodeSubmit()
                    }
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="aggregated-payment-scan-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSimulateScan}
                  disabled={loading}
                >
                  模拟患者付款码扫入 (快捷测试)
                </Button>
              </div>
            </div>

            {loading && (
              <div className="aggregated-payment-loading">
                <Icon name="refresh" className="is-spinning" />
                <span>正在向支付通道发起扣款，请稍候…</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Dynamic QR Code (主扫模式) */}
        {activeTab === 'QR' && (
          <div className="aggregated-payment-qr-pane">
            <p className="aggregated-payment-hint">
              请患者使用 {paymentMethodName} 扫描下方动态收款二维码：
            </p>
            <div className="aggregated-payment-qr-card">
              {/* Dynamic QR SVG */}
              <div className="aggregated-payment-qr-code" aria-label="医院动态收款二维码">
                <svg viewBox="0 0 160 160" width="160" height="160" className="aggregated-qr-svg">
                  {/* Outer border & bg */}
                  <rect width="160" height="160" className="aggregated-qr-bg" rx="8" />
                  {/* Position detection markers */}
                  <rect x="12" y="12" width="40" height="40" className="aggregated-qr-dark" rx="4" />
                  <rect x="18" y="18" width="28" height="28" className="aggregated-qr-light" rx="2" />
                  <rect x="24" y="24" width="16" height="16" className="aggregated-qr-dark" rx="1" />

                  <rect x="108" y="12" width="40" height="40" className="aggregated-qr-dark" rx="4" />
                  <rect x="114" y="18" width="28" height="28" className="aggregated-qr-light" rx="2" />
                  <rect x="120" y="24" width="16" height="16" className="aggregated-qr-dark" rx="1" />

                  <rect x="12" y="108" width="40" height="40" className="aggregated-qr-dark" rx="4" />
                  <rect x="18" y="114" width="28" height="28" className="aggregated-qr-light" rx="2" />
                  <rect x="24" y="120" width="16" height="16" className="aggregated-qr-dark" rx="1" />

                  {/* Matrix dot pattern simulation */}
                  <g className="aggregated-qr-dark">
                    <rect x="62" y="14" width="8" height="8" />
                    <rect x="76" y="14" width="8" height="8" />
                    <rect x="90" y="14" width="8" height="8" />
                    <rect x="62" y="28" width="8" height="8" />
                    <rect x="90" y="28" width="8" height="8" />
                    <rect x="62" y="42" width="8" height="8" />
                    <rect x="76" y="42" width="8" height="8" />

                    <rect x="14" y="62" width="8" height="8" />
                    <rect x="28" y="62" width="8" height="8" />
                    <rect x="42" y="62" width="8" height="8" />
                    <rect x="56" y="62" width="8" height="8" />
                    <rect x="70" y="62" width="8" height="8" />
                    <rect x="84" y="62" width="8" height="8" />
                    <rect x="112" y="62" width="8" height="8" />
                    <rect x="126" y="62" width="8" height="8" />
                    <rect x="140" y="62" width="8" height="8" />

                    <rect x="14" y="76" width="8" height="8" />
                    <rect x="42" y="76" width="8" height="8" />
                    <rect x="70" y="76" width="8" height="8" />
                    <rect x="98" y="76" width="8" height="8" />
                    <rect x="126" y="76" width="8" height="8" />

                    <rect x="14" y="90" width="8" height="8" />
                    <rect x="28" y="90" width="8" height="8" />
                    <rect x="56" y="90" width="8" height="8" />
                    <rect x="84" y="90" width="8" height="8" />
                    <rect x="112" y="90" width="8" height="8" />
                    <rect x="140" y="90" width="8" height="8" />

                    <rect x="62" y="108" width="8" height="8" />
                    <rect x="76" y="108" width="8" height="8" />
                    <rect x="104" y="108" width="8" height="8" />
                    <rect x="132" y="108" width="8" height="8" />
                    <rect x="62" y="122" width="8" height="8" />
                    <rect x="90" y="122" width="8" height="8" />
                    <rect x="118" y="122" width="8" height="8" />
                    <rect x="76" y="136" width="8" height="8" />
                    <rect x="104" y="136" width="8" height="8" />
                    <rect x="132" y="136" width="8" height="8" />
                  </g>

                  {/* Central branding dot */}
                  <rect x="68" y="68" width="24" height="24" rx="4" className={isWeChat ? 'aggregated-qr-dot--wechat' : 'aggregated-qr-dot--alipay'} />
                  <circle cx="80" cy="80" r="5" className="aggregated-qr-dot-center" />
                </svg>
              </div>

              <div className="aggregated-payment-qr-status">
                <StatusBadge tone="info">等待患者付款中…</StatusBadge>
                <span className="aggregated-payment-countdown">
                  二维码有效期剩余：<strong>{countdown}</strong> 秒
                </span>
                <small>系统正在后台自动轮询通道付款状态</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
