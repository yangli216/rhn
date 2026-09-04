import { useMemo, type RefObject } from 'react'

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
}: CashPaymentCalculatorProps) {
  const numericTendered = Number(tendered)
  const cashChange = numericTendered >= payableAmount ? numericTendered - payableAmount : 0
  const isCashShort = payableAmount > 0 && (!tendered || isNaN(numericTendered) || numericTendered < payableAmount)

  const presets = useMemo(() => {
    return getCashPresets(payableAmount, maxPresets)
  }, [payableAmount, maxPresets])

  return (
    <div className={`cash-payment-calc ${className}`}>
      <div className="cash-payment-row">
        <span className="cash-payment-label">{label}</span>
        <div className="cash-payment-input-wrap">
          <span className="cash-payment-symbol">{currencySymbol}</span>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min={0}
            className="cash-payment-input"
            value={tendered}
            onChange={(e) => onTenderedChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onEnter && !disabled) {
                e.preventDefault()
                onEnter()
              }
            }}
            placeholder={String(payableAmount)}
            disabled={disabled}
          />
        </div>
        {presets.length > 0 && (
          <div className="cash-payment-presets">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`cash-payment-preset-link ${numericTendered === preset ? 'is-active' : ''}`}
                onClick={() => onTenderedChange(String(preset))}
                disabled={disabled}
              >
                {currencySymbol}{preset}
              </button>
            ))}
          </div>
        )}
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
