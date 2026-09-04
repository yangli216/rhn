import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentMethodSelector, type PaymentMethodOption } from './PaymentMethodSelector'

const mockMethods: PaymentMethodOption[] = [
  { code: 'CASH', name: '现金收款', sortOrder: 10 },
  { code: 'WECHAT', name: '微信支付', sortOrder: 20 },
  { code: 'ALIPAY', name: '支付宝', sortOrder: 30 },
  { code: 'BANK_CARD', name: '银行卡', sortOrder: 40 },
  { code: 'DIGITAL_CNY', name: '数字人民币', sortOrder: 50 },
  { code: 'OTHER', name: '其它款项', sortOrder: 90 },
]

describe('PaymentMethodSelector component', () => {
  it('displays top 4 sorted methods directly as buttons and places the rest in 其它方式 dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <PaymentMethodSelector
        value="CASH"
        onChange={onChange}
        methods={mockMethods}
        maxDirectVisible={4}
        showShortcuts
      />
    )

    // 前 4 项应作为直接按钮展示
    expect(screen.getByRole('button', { name: /现金收款/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /微信支付/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /支付宝/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /银行卡/ })).toBeInTheDocument()

    // 快捷键提示
    expect(screen.getByText('1')).toBeInTheDocument()

    // 后续项不应作为独立直接按钮展示，而是在自定义下拉菜单中
    expect(screen.queryByRole('button', { name: /^数字人民币$/ })).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /其它方式/ })
    expect(trigger).toBeInTheDocument()

    // 打开下拉菜单并选择数字人民币
    await user.click(trigger)
    const option = screen.getByRole('option', { name: /数字人民币/ })
    expect(option).toBeInTheDocument()
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith('DIGITAL_CNY')

    // 点击直接展示的按钮
    await user.click(screen.getByRole('button', { name: /微信支付/ }))
    expect(onChange).toHaveBeenCalledWith('WECHAT')
  })

  it('renders without dropdown when total methods do not exceed maxDirectVisible', () => {
    render(
      <PaymentMethodSelector
        value="CASH"
        onChange={vi.fn()}
        methods={[
          { code: 'CASH', name: '现金' },
          { code: 'WECHAT', name: '微信' },
        ]}
        maxDirectVisible={4}
      />
    )

    expect(screen.getByRole('button', { name: '现金' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '微信' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /其它/ })).not.toBeInTheDocument()
  })

  it('highlights the dropdown container when an otherMethod is selected and shows its name', () => {
    const { container } = render(
      <PaymentMethodSelector
        value="DIGITAL_CNY"
        onChange={vi.fn()}
        methods={mockMethods}
        maxDirectVisible={4}
      />
    )

    const otherWrap = container.querySelector('.payment-method-other-container')
    expect(otherWrap).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: /数字人民币/ })).toBeInTheDocument()
  })
})
