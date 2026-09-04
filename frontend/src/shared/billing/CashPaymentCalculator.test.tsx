import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CashPaymentCalculator, getCashPresets } from './CashPaymentCalculator'

describe('getCashPresets algorithm', () => {
  it('generates next ten rounded preset for non-round amounts like 37 -> 40 without 200', () => {
    const presets = getCashPresets(37)
    // 37 向上取整应包含 40，且绝不能有 37 (刚好)，更不能有 200
    expect(presets).toContain(40)
    expect(presets).not.toContain(37)
    expect(presets).not.toContain(200)
    expect(presets).toEqual([40, 50, 100])
  })

  it('generates strictly greater denominations for 10 and removes exact match (刚好) without 200', () => {
    const presets = getCashPresets(10)
    expect(presets).not.toContain(10)
    expect(presets).not.toContain(200)
    expect(presets).toEqual([20, 50, 100])
  })

  it('handles decimal amounts like 28.6 -> 30 without 200', () => {
    const presets = getCashPresets(28.6)
    expect(presets[0]).toBe(30)
    expect(presets).not.toContain(200)
    expect(presets).toEqual([30, 50, 100])
  })

  it('returns empty array for zero or negative amount', () => {
    expect(getCashPresets(0)).toEqual([])
    expect(getCashPresets(-5)).toEqual([])
  })
})

describe('CashPaymentCalculator component', () => {
  it('renders unified 缴款金额 label, input and presets on the same row without 开钱箱 button', async () => {
    const user = userEvent.setup()
    const onTenderedChange = vi.fn()

    render(
      <CashPaymentCalculator
        payableAmount={37}
        tendered="37"
        onTenderedChange={onTenderedChange}
      />
    )

    // 1. 验证标签为 缴款金额：
    expect(screen.getByText('缴款金额：')).toBeInTheDocument()

    // 2. 验证开钱箱按钮彻底不存在
    expect(screen.queryByRole('button', { name: /开钱箱/ })).not.toBeInTheDocument()

    // 3. 验证快捷金额包含 40 且没有 37
    const btn40 = screen.getByRole('button', { name: '¥40' })
    expect(btn40).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /¥37/ })).not.toBeInTheDocument()

    // 4. 点击 40
    await user.click(btn40)
    expect(onTenderedChange).toHaveBeenCalledWith('40')

    // 5. 找零展示
    expect(screen.getByText('找零金额：')).toBeInTheDocument()
    expect(screen.getByText('¥0.00')).toBeInTheDocument()
  })

  it('displays short payment warning when tendered is less than payable amount', () => {
    render(
      <CashPaymentCalculator
        payableAmount={50}
        tendered="30"
        onTenderedChange={vi.fn()}
      />
    )

    expect(screen.getByText(/缴款不足，还差 ¥20.00/)).toBeInTheDocument()
  })
})
