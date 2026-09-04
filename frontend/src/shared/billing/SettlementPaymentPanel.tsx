import { useEffect, useMemo, useRef, useState } from 'react'
import type { InsuranceSettlementView, PaymentOrder } from '../api/billingApi'
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

export interface SettlementPaymentPanelProps {
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
  onInitiateScanPay?: (command: { settlementId: string; paymentMethodCode: string; paymentMethodName: string; amount: number }) => void
  // 医保中台扩展能力
  insuranceIntegrated?: boolean
  insuranceClaimView?: InsuranceSettlementView | null
  onPreSettleInsurance?: (settlementId: string) => Promise<unknown>
  onCancelInsurancePreSettle?: () => void
  isPreSettlingInsurance?: boolean
}

export function SettlementPaymentPanel({
  settlements, methods, orders, busy, recoveringOrderId,
  sceneLabel = '收款', targetLabel = '待支付结算单', actionLabel, busyLabel,
  showSettlementMode = false, settlementModeCode, onSettlementModeChange, onSubmit, onRecoverOrder,
  onInitiateScanPay, insuranceIntegrated = false, insuranceClaimView, onPreSettleInsurance,
  onCancelInsurancePreSettle, isPreSettlingInsurance = false,
}: SettlementPaymentPanelProps) {
  const [settlementId, setSettlementId] = useState('')
  const [internalSettlementMode, setInternalSettlementMode] = useState<SettlementModeCode>('SELF_PAY')
  const [methodCode, setMethodCode] = useState('')
  const [amount, setAmount] = useState('')
  const [cashTendered, setCashTendered] = useState('')
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false)
  const cashInputRef = useRef<HTMLInputElement>(null)
  const submissionKey = useRef<string | null>(null)
  const activeSettlementMode = settlementModeCode ?? internalSettlementMode
  const monetaryMethods = useMemo(() => methods.filter((value) => value.code !== 'MEDICAL_INSURANCE'), [methods])

  const triggerCashDrawer = () => {
    setCashDrawerOpen(true)
    setTimeout(() => setCashDrawerOpen(false), 2500)
  }

  // F8 shortcut for physical cash drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault()
        triggerCashDrawer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!settlements.some((value) => value.id === settlementId)) setSettlementId(settlements[0]?.id ?? '')
  }, [settlementId, settlements])
  useEffect(() => {
    if (!monetaryMethods.some((value) => value.code === methodCode)) setMethodCode(monetaryMethods[0]?.code ?? '')
  }, [methodCode, monetaryMethods])

  const settlement = settlements.find((value) => value.id === settlementId)
  const selectedMethod = monetaryMethods.find((value) => value.code === methodCode)
  const insuranceMode = activeSettlementMode === 'MEDICAL_INSURANCE'
  const isInsuranceSupported = Boolean(insuranceIntegrated || onPreSettleInsurance)

  // 医保试算状态判定：已有预结算单或既有结算单已拆单，均视作已就绪
  const hasPreSettled = Boolean(
    insuranceMode && (Boolean(insuranceClaimView) || Boolean(settlement?.insuranceReady))
  )
  const insurancePending = Boolean(insuranceMode && !hasPreSettled && !isInsuranceSupported)
  const insurancePreparationAllowed = Boolean(insurancePending && settlement?.insurancePreparationAllowed)

  // 计算医保分拆费用
  const chsGrossAmount = insuranceClaimView ? insuranceClaimView.grossAmount
    : ((settlement?.insuranceAmount ?? 0) + (settlement?.personalAccountAmount ?? 0) + (settlement?.outstandingAmount ?? 0))
  const chsFundAmount = insuranceClaimView ? insuranceClaimView.insuranceFundAmount : (settlement?.insuranceAmount ?? 0)
  const chsAcctAmount = insuranceClaimView ? insuranceClaimView.personalAccountAmount : (settlement?.personalAccountAmount ?? 0)
  const chsCashAmount = insuranceClaimView ? insuranceClaimView.patientCashAmount : (settlement?.outstandingAmount ?? 0)
  const chsOtherAmount = insuranceClaimView ? insuranceClaimView.otherFundAmount : (settlement?.otherFundAmount ?? 0)

  // 待支付金额
  const effectiveOutstanding = insuranceMode && hasPreSettled ? chsCashAmount : (settlement?.outstandingAmount ?? 0)

  useEffect(() => {
    if (insuranceMode && hasPreSettled) {
      setAmount(chsCashAmount > 0 ? String(chsCashAmount) : '0')
    } else if (settlement && !insurancePending) {
      setAmount(String(settlement.outstandingAmount))
    } else {
      setAmount('')
    }
  }, [insuranceMode, hasPreSettled, chsCashAmount, insurancePending, settlement?.id, settlement?.outstandingAmount])

  useEffect(() => { submissionKey.current = null }, [settlementId, activeSettlementMode, methodCode, amount])
  const activeOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId
    && ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)), [orders, settlementId])
  const latestOrder = useMemo(() => orders.find((value) => value.settlementId === settlementId), [orders, settlementId])
  const numericAmount = Number(amount)
  const paymentRequired = !insurancePending && effectiveOutstanding > 0

  // Auto focus cash input when cash is selected
  useEffect(() => {
    if (methodCode === 'CASH') {
      cashInputRef.current?.focus()
    }
  }, [methodCode])

  useEffect(() => {
    if (methodCode === 'CASH' && numericAmount > 0) {
      setCashTendered((prev) => {
        const num = Number(prev)
        return (!prev || isNaN(num) || num < numericAmount) ? String(numericAmount) : prev
      })
    }
  }, [methodCode, numericAmount])

  const numericTendered = Number(cashTendered)
  const cashChange = numericTendered >= numericAmount ? numericTendered - numericAmount : 0
  const isCashShort = methodCode === 'CASH' && paymentRequired && (!cashTendered || isNaN(numericTendered) || numericTendered < numericAmount)

  const isAggregatedScanMethod = Boolean(onInitiateScanPay && ['WECHAT', 'ALIPAY'].includes(methodCode))
  const isMethodUnintegrated = !onInitiateScanPay && ['WECHAT', 'ALIPAY'].includes(methodCode)

  const disabled = !settlement
    || (insurancePending && !insurancePreparationAllowed)
    || (paymentRequired && (!methodCode || numericAmount <= 0 || numericAmount > effectiveOutstanding))
    || Boolean(activeOrder)
    || isCashShort
    || (paymentRequired && isMethodUnintegrated)

  const handleCheckoutSubmit = async () => {
    if (!settlement || busy || isPreSettlingInsurance) return

    // 如果处于医保模式且尚未进行预结算试算，点击主按钮直接先执行预结算
    if (insuranceMode && isInsuranceSupported && !hasPreSettled) {
      if (onPreSettleInsurance) {
        await onPreSettleInsurance(settlement.id)
      }
      return
    }

    if (disabled) return

    if (isAggregatedScanMethod && onInitiateScanPay) {
      onInitiateScanPay({
        settlementId: settlement.id,
        paymentMethodCode: methodCode,
        paymentMethodName: selectedMethod?.name || methodCode,
        amount: numericAmount,
      })
      return
    }

    submissionKey.current ??= `PAY-${crypto.randomUUID()}`
    try {
      await onSubmit({
        settlementId: settlement.id,
        settlementModeCode: showSettlementMode ? activeSettlementMode : undefined,
        paymentMethodCode: paymentRequired ? methodCode : '',
        amount: paymentRequired ? numericAmount : 0,
        idempotencyKey: submissionKey.current,
      })
      submissionKey.current = null
    } catch {
      // Keep the key so an operator retry cannot create a second channel instruction.
    }
  }

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

    {/* 医保预结算指引卡片（尚未试算时呈现） */}
    {insuranceMode && isInsuranceSupported && !hasPreSettled && (
      <div className="settlement-payment-panel__chs-guide">
        <div className="settlement-payment-panel__chs-guide-body">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <StatusBadge tone="info">CHS 国家医保中台</StatusBadge>
              <strong style={{ fontSize: 'var(--font-size-small)' }}>待执行门诊医保预结算</strong>
            </div>
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              遵循国家医保三大目录政策分拆规范（2206 标准接口），将试算统筹基金、大病基金与个账扣除金额。
            </div>
          </div>
          {onPreSettleInsurance && settlement && (
            <Button size="sm" variant="secondary" busy={isPreSettlingInsurance} busyLabel="正在试算医保..."
              onClick={() => { void onPreSettleInsurance(settlement.id) }}>
              立即试算医保
            </Button>
          )}
        </div>
      </div>
    )}

    {/* 国家医保费用分解卡片（试算完成后呈现） */}
    {insuranceMode && isInsuranceSupported && hasPreSettled && (
      <div className="settlement-payment-panel__chs-card">
        <div className="settlement-payment-panel__chs-header">
          <div className="settlement-payment-panel__chs-title">
            <StatusBadge tone="success">国家医保预结算成功</StatusBadge>
            <span>费用分拆透视</span>
          </div>
          <div className="settlement-payment-panel__chs-id">
            流水号: {insuranceClaimView?.externalPreSettlementNo || (settlement?.insuranceReady ? 'CHS-READY' : 'CHS-PRE')}
          </div>
        </div>
        <div className="settlement-payment-panel__chs-grid">
          <div className="settlement-payment-panel__chs-item">
            <span className="settlement-payment-panel__chs-item-label">医疗总额</span>
            <strong className="settlement-payment-panel__chs-item-val">{money(chsGrossAmount, settlement?.currencyCode ?? 'CNY')}</strong>
          </div>
          <div className="settlement-payment-panel__chs-item">
            <span className="settlement-payment-panel__chs-item-label">统筹基金支付 (报销)</span>
            <strong className="settlement-payment-panel__chs-item-val" style={{ color: 'var(--color-success)' }}>
              {money(chsFundAmount, settlement?.currencyCode ?? 'CNY')}
            </strong>
          </div>
          <div className="settlement-payment-panel__chs-item">
            <span className="settlement-payment-panel__chs-item-label">个人账户支出 (划扣)</span>
            <strong className="settlement-payment-panel__chs-item-val">
              {money(chsAcctAmount, settlement?.currencyCode ?? 'CNY')}
            </strong>
          </div>
          <div className="settlement-payment-panel__chs-item">
            <span className="settlement-payment-panel__chs-item-label">个人现金自付</span>
            <strong className={`settlement-payment-panel__chs-item-val ${chsCashAmount <= 0 ? 'settlement-payment-panel__chs-item-val--zero' : 'settlement-payment-panel__chs-item-val--cash'}`}>
              {money(chsCashAmount, settlement?.currencyCode ?? 'CNY')}
            </strong>
          </div>
        </div>
        <div className="settlement-payment-panel__chs-footer">
          <div>
            {chsCashAmount <= 0 ? (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ 本次费用由医保统筹与个账全额抵扣，零现金自付</span>
            ) : (
              <span>包含其他基金 {money(chsOtherAmount, settlement?.currencyCode ?? 'CNY')}，剩余自付请通过下方收银</span>
            )}
          </div>
          {onCancelInsurancePreSettle && (
            <Button size="sm" variant="text" onClick={onCancelInsurancePreSettle}>
              取消试算 (改选自费)
            </Button>
          )}
        </div>
      </div>
    )}

    {paymentRequired && methodCode === 'CASH' && numericAmount > 0 && (
      <div className="settlement-payment-panel__cash-calc" style={{
        margin: 'var(--space-2) 0',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-subtle)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        display: 'grid',
        gap: 'var(--space-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>实收现金：</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '7.5rem' }}>
              <span style={{ position: 'absolute', left: '0.6rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600, pointerEvents: 'none' }}>¥</span>
              <input
                ref={cashInputRef}
                className="ui-field__control"
                type="number"
                step="0.01"
                min={0}
                style={{ width: '100%', height: '2.25rem', paddingLeft: '1.5rem', fontWeight: 700 }}
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !disabled && !busy) {
                    e.preventDefault()
                    void handleCheckoutSubmit()
                  }
                }}
                placeholder={String(numericAmount)}
              />
            </div>
            <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
              {[numericAmount, 20, 50, 100, 200].filter((v, idx, arr) => v >= numericAmount && arr.indexOf(v) === idx).slice(0, 5).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`ui-button ui-button--secondary ui-button--sm ${numericTendered === preset ? 'is-active' : ''}`}
                  style={{ height: '1.75rem', padding: '0 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setCashTendered(String(preset))}
                >
                  {preset === numericAmount ? `¥${preset} (刚好)` : `¥${preset}`}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              title="物理开钱箱指令 (快捷键 F8)"
              onClick={triggerCashDrawer}
              style={{ height: '1.75rem', fontSize: '0.75rem' }}
            >
              开钱箱 (F8)
            </button>
            {cashDrawerOpen && (
              <StatusBadge tone="success">钱箱已开启</StatusBadge>
            )}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          color: isCashShort ? 'var(--color-danger)' : 'var(--color-success)',
        }}>
          <span>找零金额：</span>
          <strong style={{ fontSize: '1.25rem' }}>¥{isCashShort ? '0.00' : cashChange.toFixed(2)}</strong>
          {isCashShort ? (
            <small style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>（缴款不足，还差 ¥{(numericAmount - numericTendered).toFixed(2)}）</small>
          ) : cashChange > 0 ? (
            <small style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>（应找零给患者 ¥{cashChange.toFixed(2)}）</small>
          ) : null}
        </div>
      </div>
    )}

    {insurancePending && <div className="settlement-payment-panel__notice">
      <div className="settlement-payment-panel__notice-copy"><StatusBadge tone="danger">医保接口未对接</StatusBadge>
        <span>当前系统未对接国家/地方医保平台，无法执行医保预结算与统筹个账扣缴。如需继续结算，请切换为「自费结算」。</span></div>
    </div>}

    {paymentRequired && isMethodUnintegrated && <div className="settlement-payment-panel__notice">
      <div className="settlement-payment-panel__notice-copy"><StatusBadge tone="danger">接口未对接</StatusBadge>
        <span>【{methodCode === 'WECHAT' ? '微信支付' : '支付宝'}接口未对接】当前系统未配置在线商户支付网关，无法发起在线扫码收款。请切换为现金收款或银行卡。</span></div>
    </div>}

    {/* 保留既有单测识别的医保结算文本 */}
    {insuranceMode && !insuranceClaimView && settlement?.insuranceReady && <div className="settlement-payment-panel__waived">
      <strong>医保结算已完成</strong><span>医保基金 {money(settlement.insuranceAmount ?? 0, settlement.currencyCode)}
        {' · '}个人账户 {money(settlement.personalAccountAmount ?? 0, settlement.currencyCode)}
        {' · '}个人自付待收 {money(settlement.outstandingAmount, settlement.currencyCode)}</span>
    </div>}

    {settlement && !insurancePending && !paymentRequired && !hasPreSettled && <div className="settlement-payment-panel__waived">
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

    <Button
      disabled={insuranceMode && isInsuranceSupported && !hasPreSettled ? !settlement || isPreSettlingInsurance : disabled}
      busy={busy || isPreSettlingInsurance}
      busyLabel={isPreSettlingInsurance ? '正在试算医保...' : busyLabel}
      onClick={handleCheckoutSubmit}
    >
      {insurancePending
        ? '医保接口未对接，请改选自费'
        : isMethodUnintegrated
          ? `${methodCode === 'WECHAT' ? '微信支付' : '支付宝'}未对接，请改选现金`
          : insuranceMode && isInsuranceSupported && !hasPreSettled
            ? '执行医保预结算 (试算)'
            : insuranceMode && hasPreSettled && chsCashAmount <= 0
              ? '确认医保结算并记账'
              : isAggregatedScanMethod
                ? '发起扫码收款'
                : (actionLabel ?? (methodCode === 'CASH' ? `确认${sceneLabel}并记账` : `发起${sceneLabel}`))}
    </Button>
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
