import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { defaultCredentials, type CaLoginApi, type CaLoginOptions, type Credentials } from '../../shared/rhnApi'
import { Alert, Button, FormField, Icon, Tabs } from '../../shared/ui'
import { CaLoginPanel, type CaLoginMethod } from './CaLoginPanel'

type LoginForm = Credentials
type LoginMode = 'PASSWORD' | CaLoginMethod

const TENANT_PATTERN = /^[1-9][0-9]{0,18}$/

/** 口令登录之后，账号需再完成扫码或证书认证。api 带口令凭据。 */
export interface SecondFactorStep {
  username: string
  api: CaLoginApi
  onConfirmed: () => Promise<void>
  onCancel: () => void
}

export function LoginScreen({ onLogin, error, caLogin, onCaLoginConfirmed, secondFactor }: {
  onLogin: (credentials: Credentials) => Promise<void>
  error: string
  /** 按租户创建不带口令的 CA 登录客户端；缺省时只提供口令登录。 */
  caLogin?: (tenantId: string) => CaLoginApi
  onCaLoginConfirmed?: (tenantId: string) => Promise<void>
  secondFactor?: SecondFactorStep | null
}) {
  const { register, handleSubmit, formState, watch } = useForm<LoginForm>({
    defaultValues: defaultCredentials(),
  })
  const [mode, setMode] = useState<LoginMode>('PASSWORD')
  const tenantId = watch('tenantId')
  // 按租户记忆客户端，避免输入引起的重新渲染打断扫码轮询；caLogin 需由调用方保持稳定。
  const caApi = useMemo(() => caLogin && TENANT_PATTERN.test(tenantId ?? '') ? caLogin(tenantId) : null,
    [caLogin, tenantId])
  const caOptions = useCaLoginOptions(caApi)
  const caMode = mode !== 'PASSWORD' && caOptions && caApi && onCaLoginConfirmed

  const handleFormSubmit = (data: LoginForm) => {
    return onLogin({
      ...data,
      username: data.username.trim(),
    })
  }

  const tabs = [
    { value: 'PASSWORD' as const, label: '口令登录' },
    ...(caOptions?.mobile ? [{ value: 'MOBILE' as const, label: '扫码登录' }] : []),
    ...(caOptions?.certificate ? [{ value: 'CERTIFICATE' as const, label: '证书登录' }] : []),
  ]

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="visual-grid" />
        <div className="visual-content">
          <div className="visual-brand"><div className="brand-mark light">R</div> RHN</div>
          <h1>让每一次医疗服务<br />连接为连续健康照护</h1>
          <p>县域医共体医疗与公共卫生一体化平台</p>
          <div className="visual-flow">
            <FlowNode label="统一居民" value="MPI" /><i />
            <FlowNode label="医疗服务" value="Clinic" /><i />
            <FlowNode label="健康事件" value="Timeline" />
          </div>
        </div>
      </div>
      <div className="login-panel">
        {secondFactor
          ? <SecondFactorCard step={secondFactor} error={error} />
          : <form className="login-card" onSubmit={handleSubmit(handleFormSubmit)} noValidate>
            <div className="mobile-brand"><div className="brand-mark">R</div> 健域智枢</div>
            <span className="ui-eyebrow">欢迎使用</span>
            <h2>登录统一工作门户</h2>
            <p className="subtle">本页面连接阶段 1 本地开发环境</p>
            {tabs.length > 1 && <Tabs label="登录方式" value={caOptions ? mode : 'PASSWORD'} items={tabs} onChange={setMode} />}
            {!caMode && <>
              <FormField label="用户名" error={formState.errors.username?.message}>
                <input
                  {...register('username', {
                    validate: (val) => Boolean(val && val.trim().length > 0) || '请输入用户名',
                  })}
                  autoComplete="username"
                />
              </FormField>
              <FormField label="密码" error={formState.errors.password?.message}>
                <input
                  type="password"
                  {...register('password', {
                    required: '请输入密码',
                  })}
                  autoComplete="current-password"
                />
              </FormField>
            </>}
            <FormField label="医共体租户" error={formState.errors.tenantId?.message}>
              <input
                {...register('tenantId', {
                  required: '请输入1至19位数字医共体租户标识',
                  pattern: {
                    value: TENANT_PATTERN,
                    message: '请输入1至19位数字医共体租户标识',
                  },
                })}
              />
            </FormField>
            {caMode
              ? <CaLoginPanel key={`${mode}:${tenantId}`} api={caApi} options={caOptions}
                method={mode} defaultUsername={defaultCredentials().username}
                onConfirmed={() => onCaLoginConfirmed(tenantId)} />
              : <Button className="ui-wide" type="submit" busy={formState.isSubmitting}>进入工作台</Button>}
            {error && <Alert>{error}</Alert>}
            <p className="security-note"><Icon name="info" />开发账号仅用于本地演示，禁止承载真实医疗数据</p>
          </form>}
      </div>
    </div>
  )
}

function SecondFactorCard({ step, error }: { step: SecondFactorStep; error: string }) {
  const options = useCaLoginOptions(step.api)
  const methods: CaLoginMethod[] = [
    ...(options?.mobile ? ['MOBILE' as const] : []),
    ...(options?.certificate ? ['CERTIFICATE' as const] : []),
  ]
  const [method, setMethod] = useState<CaLoginMethod | null>(null)
  const active = method && methods.includes(method) ? method : methods[0]

  return <div className="login-card">
    <span className="ui-eyebrow">第二步</span>
    <h2>确认登录身份</h2>
    <p className="subtle">账号 {step.username} 需要再用手机扫码或证书（UKey）完成认证</p>
    {options && methods.length === 0 && <Alert placement="inline" tone="warning">
      当前租户没有可用的扫码或证书认证方式，请联系管理员。
    </Alert>}
    {methods.length > 1 && <Tabs label="认证方式" value={active!} onChange={setMethod}
      items={methods.map((value) => ({ value, label: value === 'MOBILE' ? '扫码认证' : '证书认证' }))} />}
    {options && active && <CaLoginPanel key={active} api={step.api} options={options} method={active}
      defaultUsername={step.username} onConfirmed={step.onConfirmed} />}
    {error && <Alert>{error}</Alert>}
    <Button className="ui-wide" variant="secondary" onClick={step.onCancel}>返回口令登录</Button>
  </div>
}

/** 读取租户可用的 CA 登录方式；失败或不可用时返回 null，只保留口令登录。 */
function useCaLoginOptions(api: CaLoginApi | null): CaLoginOptions | null {
  const [options, setOptions] = useState<CaLoginOptions | null>(null)
  useEffect(() => {
    if (!api) {
      setOptions(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      api.options()
        .then((value) => { if (!cancelled) setOptions(value.mobile || value.certificate ? value : null) })
        .catch(() => { if (!cancelled) setOptions(null) })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [api])
  return options
}

function FlowNode({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}
