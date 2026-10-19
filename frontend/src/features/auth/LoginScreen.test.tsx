import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CaLoginApi } from '../../shared/rhnApi'
import { LoginScreen } from './LoginScreen'

function caLoginApi(overrides: Partial<CaLoginApi> = {}, development: Partial<CaLoginApi['development']> = {}): CaLoginApi {
  return {
    options: vi.fn().mockResolvedValue({ mobile: true, certificate: true, vendorCode: 'development-ca' }),
    startMobile: vi.fn().mockResolvedValue({
      loginRequestId: 'login-1', qrContent: 'rhn-dev-ca://login/dev-login-1',
      expiresAt: new Date(Date.now() + 120_000).toISOString(), pollIntervalSeconds: 0,
    }),
    pollMobile: vi.fn().mockResolvedValue({ state: 'CONFIRMED' }),
    certificateChallenge: vi.fn().mockResolvedValue({ challengeId: 'challenge-1', toBeSigned: 'UkhOLUNBLUxPR0lOLTE=' }),
    completeCertificate: vi.fn().mockResolvedValue({ state: 'CONFIRMED' }),
    ...overrides,
    development: {
      confirmMobile: vi.fn().mockResolvedValue(undefined),
      rejectMobile: vi.fn().mockResolvedValue(undefined),
      signToken: vi.fn().mockResolvedValue({ signatureValue: 'c2ln', certificate: 'Y2VydA==' }),
      ...development,
    },
  }
}

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

  it('offers QR login when the tenant has CA login and loads the session once confirmed', async () => {
    const user = userEvent.setup()
    const api = caLoginApi()
    const confirmed = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onLogin={vi.fn()} error="" caLogin={() => api} onCaLoginConfirmed={confirmed} />)

    await user.click(await screen.findByRole('tab', { name: '扫码登录' }))

    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
    expect(await screen.findByText('rhn-dev-ca://login/dev-login-1')).toBeInTheDocument()
    await waitFor(() => expect(confirmed).toHaveBeenCalledWith('362387869790209'))
    expect(api.pollMobile).toHaveBeenCalledWith('login-1')
  })

  it('shows rejection from the phone app and keeps the page usable', async () => {
    const user = userEvent.setup()
    const api = caLoginApi({ pollMobile: vi.fn().mockResolvedValue({ state: 'REJECTED', failureMessage: '已在手机端拒绝登录' }) })
    const confirmed = vi.fn()
    render(<LoginScreen onLogin={vi.fn()} error="" caLogin={() => api} onCaLoginConfirmed={confirmed} />)

    await user.click(await screen.findByRole('tab', { name: '扫码登录' }))

    expect(await screen.findByText('已在手机端拒绝登录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新二维码' })).toBeInTheDocument()
    expect(confirmed).not.toHaveBeenCalled()
  })

  it('keeps password login only when CA login is unavailable', async () => {
    const api = caLoginApi({ options: vi.fn().mockResolvedValue({ mobile: false, certificate: false }) })
    render(<LoginScreen onLogin={vi.fn()} error="" caLogin={() => api} onCaLoginConfirmed={vi.fn()} />)

    await waitFor(() => expect(api.options).toHaveBeenCalled())
    expect(screen.queryByRole('tab', { name: '扫码登录' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '进入工作台' })).toBeInTheDocument()
  })

  it('completes the second factor with the development UKey for the password account', async () => {
    const user = userEvent.setup()
    const api = caLoginApi({ options: vi.fn().mockResolvedValue({ mobile: false, certificate: true, vendorCode: 'development-ca' }) })
    const confirmed = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn()
    render(<LoginScreen onLogin={vi.fn()} error="" secondFactor={{
      username: 'doctor', api, onConfirmed: confirmed, onCancel: cancel,
    }} />)

    await user.click(await screen.findByRole('button', { name: '读取 UKey 并验证' }))

    await waitFor(() => expect(confirmed).toHaveBeenCalled())
    expect(api.development.signToken).toHaveBeenCalledWith('doctor', 'UkhOLUNBLUxPR0lOLTE=')
    expect(api.completeCertificate).toHaveBeenCalledWith({
      challengeId: 'challenge-1', signatureValue: 'c2ln', certificate: 'Y2VydA==',
    })
    await user.click(screen.getByRole('button', { name: '返回口令登录' }))
    expect(cancel).toHaveBeenCalled()
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
