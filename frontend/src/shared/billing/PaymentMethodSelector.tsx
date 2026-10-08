import { useState, useRef, useEffect, useMemo } from 'react'
import { Button, EmptyState, LoadingState } from '../ui'
import '../../styles/cashier-controls.css'

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
  status?: 'ready' | 'loading' | 'error'
  onRetry?: () => void
  otherLabel?: string
}

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
  status = 'ready',
  onRetry,
}: PaymentMethodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 1. 过滤掉非货币通道（如医保统筹扣缴，医保由医保结算模式处理）
  const monetaryMethods = useMemo(() => {
    return methods.filter((m) => m.code !== 'MEDICAL_INSURANCE')
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

  if (status === 'loading') return <LoadingState label="正在加载支付方式…" />
  if (status === 'error' || monetaryMethods.length === 0) return <EmptyState icon="billing"
    title={status === 'error' ? '支付方式加载失败' : '未配置可用支付方式'}
    copy="请重新加载或联系管理员维护收银支付方式后再收款。"
    action={onRetry && <Button onClick={onRetry}>重新加载支付方式</Button>} />

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
                    disabled={disabled}
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
