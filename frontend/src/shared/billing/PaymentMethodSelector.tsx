import { useState, useRef, useEffect, useMemo } from 'react'

export interface PaymentMethodOption {
  code: string
  name: string
  sortOrder?: number
  precision?: string
  roundingMode?: string
}

export interface PaymentMethodSelectorProps {
  id?: string
  value: string
  onChange: (value: string) => void
  methods: PaymentMethodOption[]
  maxDirectVisible?: number
  showShortcuts?: boolean
  disabled?: boolean
  className?: string
  otherLabel?: string
}

export const DEFAULT_FALLBACK_PAYMENT_METHODS: PaymentMethodOption[] = [
  { code: 'WECHAT', name: '微信支付', sortOrder: 10, precision: '0.01', roundingMode: 'HALF_UP' },
  { code: 'ALIPAY', name: '支付宝', sortOrder: 20, precision: '0.01', roundingMode: 'HALF_UP' },
  { code: 'CASH', name: '现金收款', sortOrder: 30, precision: '0.1', roundingMode: 'FLOOR' },
  { code: 'BANK_CARD', name: '银行卡', sortOrder: 40, precision: '0.01', roundingMode: 'HALF_UP' },
]

export function PaymentMethodSelector({
  id,
  value,
  onChange,
  methods,
  maxDirectVisible = 4,
  showShortcuts = false,
  disabled = false,
  className = '',
  otherLabel = '其它方式',
}: PaymentMethodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 1. 过滤掉非货币通道（如医保统筹扣缴，医保由医保结算模式处理）
  const monetaryMethods = useMemo(() => {
    const list = methods && methods.length > 0 ? methods : DEFAULT_FALLBACK_PAYMENT_METHODS
    return list.filter((m) => m.code !== 'MEDICAL_INSURANCE')
  }, [methods])

  // 2. 严格按字典排序字段 sortOrder 升序排列
  const sortedMethods = useMemo(() => {
    return [...monetaryMethods].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [monetaryMethods])

  // 3. 根据默认展示数量拆分：前 maxDirectVisible 项直接平铺，其余放入“其它”下拉框
  const directMethods = useMemo(() => {
    return sortedMethods.slice(0, maxDirectVisible)
  }, [sortedMethods, maxDirectVisible])

  const otherMethods = useMemo(() => {
    return sortedMethods.slice(maxDirectVisible)
  }, [sortedMethods, maxDirectVisible])

  const isOtherSelected = useMemo(() => {
    return otherMethods.some((m) => m.code === value)
  }, [otherMethods, value])

  const selectedOtherName = useMemo(() => {
    return otherMethods.find((m) => m.code === value)?.name
  }, [otherMethods, value])

  // 点击外部收起下拉框
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className={`payment-method-selector ${className}`}>
      {directMethods.map((method, index) => {
        const isActive = value === method.code
        return (
          <button
            key={method.code}
            id={index === 0 ? id : undefined}
            type="button"
            className={`payment-method-chip ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              onChange(method.code)
              setIsOpen(false)
            }}
            disabled={disabled}
            title={method.name}
          >
            <span className="payment-method-chip__name">{method.name}</span>
            {showShortcuts && index < 4 && (
              <kbd className="payment-method-chip__shortcut">{index + 1}</kbd>
            )}
          </button>
        )
      })}

      {otherMethods.length > 0 && (
        <div
          ref={dropdownRef}
          className={`payment-method-other-container ${isOtherSelected ? 'is-active' : ''}`}
        >
          <button
            id={directMethods.length === 0 ? id : undefined}
            type="button"
            className={`payment-method-chip payment-method-other-trigger ${isOtherSelected ? 'is-active' : ''}`}
            onClick={() => !disabled && setIsOpen((prev) => !prev)}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            title={isOtherSelected ? selectedOtherName : otherLabel}
          >
            <span className="payment-method-chip__name">
              {isOtherSelected ? (selectedOtherName ?? otherLabel) : otherLabel}
            </span>
            <span className={`payment-method-other-arrow ${isOpen ? 'is-open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>

          {isOpen && (
            <div
              className="payment-method-dropdown-menu"
              role="listbox"
              aria-label="其它支付方式列表"
            >
              {otherMethods.map((method) => {
                const isSelected = method.code === value
                return (
                  <button
                    key={method.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`payment-method-dropdown-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      onChange(method.code)
                      setIsOpen(false)
                    }}
                  >
                    <span>{method.name}</span>
                    {isSelected && <span className="payment-method-dropdown-check">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
