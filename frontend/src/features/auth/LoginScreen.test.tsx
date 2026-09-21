import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  it('renders default credentials and submits properly', async () => {
    const user = userEvent.setup()
    const handleLogin = vi.fn().mockResolvedValue(undefined)

    render(<LoginScreen onLogin={handleLogin} error="" />)

    const usernameInput = screen.getByLabelText('用户名') as HTMLInputElement
    const passwordInput = screen.getByLabelText('密码') as HTMLInputElement
    const tenantIdInput = screen.getByLabelText('医共体租户') as HTMLInputElement

    expect(usernameInput.value).toBe('doctor')
    expect(passwordInput.value).toBe('rhn-dev-2026')
    expect(tenantIdInput.value).toBe('362387869790209')

    const submitButton = screen.getByRole('button', { name: '进入工作台' })
    await user.click(submitButton)

    expect(handleLogin).toHaveBeenCalledWith({
      username: 'doctor',
      password: 'rhn-dev-2026',
      tenantId: '362387869790209',
    })
  })

  it('displays error message when error prop is provided', () => {
    render(<LoginScreen onLogin={vi.fn()} error="用户名或密码错误" />)

    expect(screen.getByText('用户名或密码错误')).toBeInTheDocument()
  })

  it('validates empty username and password', async () => {
    const user = userEvent.setup()
    const handleLogin = vi.fn()

    render(<LoginScreen onLogin={handleLogin} error="" />)

    const usernameInput = screen.getByLabelText('用户名')
    const passwordInput = screen.getByLabelText('密码')

    await user.clear(usernameInput)
    await user.clear(passwordInput)

    const submitButton = screen.getByRole('button', { name: '进入工作台' })
    await user.click(submitButton)

    expect(await screen.findByText('请输入用户名')).toBeInTheDocument()
    expect(await screen.findByText('请输入密码')).toBeInTheDocument()
    expect(handleLogin).not.toHaveBeenCalled()
  })
})
