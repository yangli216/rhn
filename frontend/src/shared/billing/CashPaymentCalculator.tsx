import { useMemo, type RefObject } from 'react'
import '../../styles/cashier-controls.css'

export interface CashPaymentCalculatorProps {
  payableAmount: number
  tendered: string
  onTenderedChange: (value: string) => void
  onEnter?: () => void
  label?: string
  currencySymbol?: string
  disabled?: boolean
  autoFocus?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  maxPresets?: number
  className?: string
  precision?: string
}

/**
 * 现金面额快捷按钮算法：
 * 1. 严格排除刚好项（候选值必须严格大于应收金额 amount）
 * 2. 包含向上取整到最近10元（例如 37元 -> 40元，23元 -> 30元，8.5元 -> 10元）
 * 3. 包含向上取整到最近50元、100元（例如 37元 -> 50元，75元 -> 100元）
 * 4. 包含标准纸币面值（10, 20, 50, 100）中严格大于当前应收的项（排除200，人民币无200元纸币）
 */
export function getCashPresets(amount: number, maxCount = 3): number[] {
  if (amount <= 0) return []
  const candidates = new Set<number>()

  // 向上取整到最近的 10 元 (如 37 -> 40, 23 -> 30, 8.5 -> 10)
  const nextTen = Math.ceil(amount / 10) * 10
  if (nextTen > amount) candidates.add(nextTen)

  // 向上取整到最近的 50 元 (如 37 -> 50, 75 -> 100)
  const nextFifty = Math.ceil(amount / 50) * 50
  if (nextFifty > amount) candidates.add(nextFifty)

  // 向上取整到最近的 100 元 (如 37 -> 100, 137 -> 200)
  const nextHundred = Math.ceil(amount / 100) * 100
  if (nextHundred > amount) candidates.add(nextHundred)

  // 常见标准大额纸币面值（人民币最大纸币面值为 100 元，无 200 元纸币）
  const standardDenominations = [10, 20, 50, 100]
  for (const d of standardDenominations) {
    if (d > amount) candidates.add(d)
  }

  return Array.from(candidates).sort((a, b) => a - b).slice(0, maxCount)
}

/** 金额输入：¥ 前缀 + 右对齐，缴款与减免核定等收银场景共用同一外观。 */
export function CashAmountInput({
  value, onChange, onEnter, disabled = false, inputRef, precision = '0.01', currencySymbol = '¥',
  placeholder, id, ariaLabel, invalid = false, describedBy,
}: {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  precision?: string
  currencySymbol?: string
  placeholder?: string
  id?: string
  ariaLabel?: string
  invalid?: boolean
  describedBy?: string
}) {
  return (
    <div className={`cash-payment-input-wrap ${invalid ? 'is-invalid' : ''}`}>
      <span className="cash-payment-symbol">{currencySymbol}</span>
      <input
        ref={inputRef}
        id={id}
        data-barcode-scan="ignore"
        type="number"
        step={precision === '0.1' ? '0.1' : '0.01'}
        min={0}
        className="cash-payment-input"
        value={value}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter && !disabled) {
            e.preventDefault()
            onEnter()
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

/** 与金额输入同外观的只读展示（非输入控件）。 */
export function CashReadonlyAmount({ text, currencySymbol = '¥', valueClassName = '' }: {
  text: string
  currencySymbol?: string
  valueClassName?: string
}) {
  return (
    <div className="cash-payment-input-wrap is-readonly">
      {currencySymbol && <span className="cash-payment-symbol">{currencySymbol}</span>}
      <span className={`cash-payment-value ${valueClassName}`}>{text}</span>
    </div>
  )
}

export interface CashPresetChip {
  key: string
  label: string
  active?: boolean
  onClick: () => void
}

/** 快捷金额 chip 组（缴款快捷面额、减免“上限/减半”共用）。 */
export function CashPresetChips({ chips, disabled = false }: { chips: CashPresetChip[]; disabled?: boolean }) {
  if (chips.length === 0) return null
  return (
    <div className="cash-payment-presets">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`cash-payment-preset-link ${chip.active ? 'is-active' : ''}`}
          onClick={chip.onClick}
          disabled={disabled}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

/** 非现金支付方式的只读“付款金额”行：标签 + 只读金额，与缴款金额行同一网格。 */
export function PaymentAmountReadonlyRow({ label = '付款金额：', amount, currencySymbol = '¥', className = '' }: {
  label?: string
  amount: number
  currencySymbol?: string
  className?: string
}) {
  return (
    <div className={`cash-payment-calc ${className}`}>
      <div className="cash-payment-row">
        <span className="cash-payment-label">{label}</span>
        <CashReadonlyAmount text={amount.toFixed(2)} currencySymbol={currencySymbol} />
      </div>
    </div>
  )
}

export function CashPaymentCalculator({
  payableAmount,
  tendered,
  onTenderedChange,
  onEnter,
  label = '缴款金额：',
  currencySymbol = '¥',
  disabled = false,
  inputRef,
  maxPresets = 3,
  className = '',
  precision = '0.01',
}: CashPaymentCalculatorProps) {
  const numericTendered = Number(tendered)
  const cashChange = numericTendered >= payableAmount ? Math.round((numericTendered - payableAmount) * 100) / 100 : 0
  const isCashShort = payableAmount > 0 && (!tendered || !Number.isFinite(numericTendered) || numericTendered < payableAmount)

  const presets = useMemo(() => {
    return getCashPresets(payableAmount, maxPresets)
  }, [payableAmount, maxPresets])

  return (
    <div className={`cash-payment-calc ${className}`}>
      <div className="cash-payment-row">
        <span className="cash-payment-label">{label}</span>
        <CashAmountInput
          value={tendered}
          onChange={onTenderedChange}
          onEnter={onEnter}
          inputRef={inputRef}
          precision={precision}
          currencySymbol={currencySymbol}
          placeholder={String(payableAmount)}
          disabled={disabled}
        />
        <CashPresetChips
          disabled={disabled}
          chips={presets.map((preset) => ({
            key: String(preset),
            label: `${currencySymbol}${preset}`,
            active: numericTendered === preset,
            onClick: () => onTenderedChange(String(preset)),
          }))}
        />
      </div>

      <div className={`cash-payment-change ${isCashShort ? 'is-short' : 'is-sufficient'}`}>
        <span>找零金额：</span>
        <strong>{currencySymbol}{isCashShort ? '0.00' : cashChange.toFixed(2)}</strong>
        {isCashShort ? (
          <small className="cash-payment-short-tip">
            （缴款不足，还差 {currencySymbol}{(payableAmount - numericTendered).toFixed(2)}）
          </small>
        ) : cashChange > 0 ? (
          <small className="cash-payment-change-tip">
            （应找零给患者 {currencySymbol}{cashChange.toFixed(2)}）
          </small>
        ) : null}
      </div>
    </div>
  )
}
