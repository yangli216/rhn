import { useEffect, useRef, useState } from 'react'
import {
  DEVELOPMENT_CA_VENDOR, errorMessage, type CaLoginApi, type CaLoginOptions, type CaLoginResult, type CaMobileChallenge,
} from '../../shared/rhnApi'
import { Alert, Button, FormField } from '../../shared/ui'
import { developmentTokenDriver, tokenDriverAvailable } from './clientTokenDriver'

export type CaLoginMethod = 'MOBILE' | 'CERTIFICATE'

/**
 * 扫码或证书（UKey）认证。用于直接登录时 api 不带口令凭据；用于口令后的第二步时 api 带口令凭据，
 * 后端会校验 CA 对应账号与口令账号一致。确认后会话 Cookie 已由服务端写入，再由 onConfirmed 加载会话。
 */
export function CaLoginPanel({ api, options, method, defaultUsername = '', onConfirmed }: {
  api: CaLoginApi
  options: CaLoginOptions
  method: CaLoginMethod
  defaultUsername?: string
  onConfirmed: () => Promise<void>
}) {
  const development = options.vendorCode === DEVELOPMENT_CA_VENDOR
  const [developmentUsername, setDevelopmentUsername] = useState(defaultUsername)
  const [error, setError] = useState('')

  async function finish(result: CaLoginResult) {
    if (result.state === 'CONFIRMED') {
      await onConfirmed()
      return true
    }
    if (result.state !== 'PENDING') setError(result.failureMessage || resultMessage(result))
    return false
  }

  return <div className="ca-login-panel">
    {development && <FormField label="开发模拟账号" hint="开发 CA 用该账号的模拟证书代替手机 App 或 UKey">
      <input value={developmentUsername} maxLength={100} autoComplete="off"
        onChange={(event) => setDevelopmentUsername(event.target.value)} />
    </FormField>}
    {method === 'MOBILE'
      ? <MobileLogin api={api} development={development} developmentUsername={developmentUsername}
        onResult={finish} onError={setError} clearError={() => setError('')} />
      : <CertificateLogin api={api} vendorCode={options.vendorCode} developmentUsername={developmentUsername}
        onResult={finish} onError={setError} clearError={() => setError('')} />}
    {error && <Alert placement="inline">{error}</Alert>}
  </div>
}

function MobileLogin({ api, development, developmentUsername, onResult, onError, clearError }: {
  api: CaLoginApi; development: boolean; developmentUsername: string
  onResult: (result: CaLoginResult) => Promise<boolean>; onError: (message: string) => void; clearError: () => void
}) {
  const [challenge, setChallenge] = useState<CaMobileChallenge | null>(null)
  const [state, setState] = useState<'idle' | 'waiting' | 'ended'>('idle')
  const [simulating, setSimulating] = useState(false)
  const callbacks = useRef({ onResult, onError })
  callbacks.current = { onResult, onError }

  async function start() {
    clearError()
    setState('waiting')
    try {
      setChallenge(await api.startMobile())
    } catch (error) {
      setState('ended')
      onError(errorMessage(error))
    }
  }

  const startRef = useRef(start)
  startRef.current = start
  const autoStarted = useRef(false)
  useEffect(() => {
    // 只在进入扫码方式时自动取一次二维码（开发模式的重复挂载也不重复申请）；之后由“刷新二维码”重新发起。
    if (autoStarted.current) return
    autoStarted.current = true
    void startRef.current()
  }, [])

  useEffect(() => {
    if (!challenge?.loginRequestId || state !== 'waiting') return
    let cancelled = false
    let timer: number | undefined
    const deadline = challenge.expiresAt ? Date.parse(challenge.expiresAt) : Date.now() + 120_000
    const poll = async () => {
      if (cancelled) return
      if (Date.now() > deadline) {
        setState('ended')
        callbacks.current.onError('二维码已过期，请刷新后重新扫码')
        return
      }
      try {
        const result = await api.pollMobile(challenge.loginRequestId!)
        if (cancelled) return
        if (result.state === 'PENDING') {
          timer = window.setTimeout(() => void poll(), (challenge.pollIntervalSeconds ?? 2) * 1000)
          return
        }
        setState('ended')
        await callbacks.current.onResult(result)
      } catch (error) {
        if (cancelled) return
        setState('ended')
        callbacks.current.onError(errorMessage(error))
      }
    }
    timer = window.setTimeout(() => void poll(), (challenge.pollIntervalSeconds ?? 2) * 1000)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [api, challenge, state])

  async function simulate(confirm: boolean) {
    if (!challenge?.qrContent) return
    setSimulating(true)
    clearError()
    try {
      if (confirm) await api.development.confirmMobile(challenge.qrContent, developmentUsername.trim())
      else await api.development.rejectMobile(challenge.qrContent)
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setSimulating(false)
    }
  }

  const qr = challenge?.qrContent
  return <div className="ca-login-mobile">
    <div className="ca-login-mobile__code" aria-live="polite">
      {qr?.startsWith('data:image/')
        ? <img src={qr} alt="扫码登录二维码" />
        : qr ? <code title="二维码内容">{qr}</code> : <span>{state === 'waiting' ? '正在获取二维码…' : '未获取二维码'}</span>}
    </div>
    <p className="subtle">{state === 'waiting' && qr
      ? '请使用 CA 手机应用扫码，并在手机上确认登录'
      : '二维码有效期 2 分钟，过期后请刷新'}</p>
    <div className="ca-login-actions">
      {state === 'ended' && <Button variant="secondary" onClick={() => void start()}>刷新二维码</Button>}
      {development && state === 'waiting' && qr && <>
        <Button busy={simulating} disabled={!developmentUsername.trim()} onClick={() => void simulate(true)}>模拟手机确认</Button>
        <Button variant="secondary" disabled={simulating} onClick={() => void simulate(false)}>模拟拒绝</Button>
      </>}
    </div>
  </div>
}

function CertificateLogin({ api, vendorCode, developmentUsername, onResult, onError, clearError }: {
  api: CaLoginApi; vendorCode?: string; developmentUsername: string
  onResult: (result: CaLoginResult) => Promise<boolean>; onError: (message: string) => void; clearError: () => void
}) {
  const [busy, setBusy] = useState(false)
  const driverAvailable = tokenDriverAvailable(vendorCode)

  async function signIn() {
    clearError()
    setBusy(true)
    try {
      const driver = developmentTokenDriver(api, developmentUsername)
      const challenge = await api.certificateChallenge()
      const signed = await driver.sign(challenge.toBeSigned!)
      await onResult(await api.completeCertificate({
        challengeId: challenge.challengeId!, signatureValue: signed.signatureValue, certificate: signed.certificate,
      }))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!driverAvailable) {
    return <Alert placement="inline" tone="warning">未检测到 UKey 证书驱动，请安装 CA 厂商的证书助手并插入 UKey 后刷新页面。</Alert>
  }
  return <div className="ca-login-actions">
    <Button className="ui-wide" busy={busy} busyLabel="正在验证证书" disabled={!developmentUsername.trim()}
      onClick={() => void signIn()}>读取 UKey 并验证</Button>
  </div>
}

function resultMessage(result: CaLoginResult) {
  switch (result.state) {
    case 'REJECTED': return '已在手机端拒绝登录'
    case 'EXPIRED': return '登录请求已失效，请重新发起'
    default: return '认证失败，请重试'
  }
}
