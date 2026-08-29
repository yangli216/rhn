import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { defaultCredentials, type Credentials } from '../../shared/rhnApi'
import { Alert, Button, FormField, Icon } from '../../shared/ui'

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  tenantId: z.string().regex(/^[1-9][0-9]{0,18}$/, '请输入1至19位数字医共体租户标识'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginScreen({ onLogin, error }: {
  onLogin: (credentials: Credentials) => Promise<void>; error: string
}) {
  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema), defaultValues: defaultCredentials(),
  })

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
        <form className="login-card" onSubmit={handleSubmit(onLogin)} noValidate>
          <div className="mobile-brand"><div className="brand-mark">R</div> 健域智枢</div>
          <span className="ui-eyebrow">欢迎使用</span>
          <h2>登录统一工作门户</h2>
          <p className="subtle">本页面连接阶段 1 本地开发环境</p>
          <FormField label="用户名" error={formState.errors.username?.message}>
            <input {...register('username')} autoComplete="username" />
          </FormField>
          <FormField label="密码" error={formState.errors.password?.message}>
            <input type="password" {...register('password')} autoComplete="current-password" />
          </FormField>
          <FormField label="医共体租户" error={formState.errors.tenantId?.message}>
            <input {...register('tenantId')} />
          </FormField>
          {error && <Alert>{error}</Alert>}
          <Button className="ui-wide" type="submit" busy={formState.isSubmitting}>进入工作台</Button>
          <p className="security-note"><Icon name="info" />开发账号仅用于本地演示，禁止承载真实医疗数据</p>
        </form>
      </div>
    </div>
  )
}

function FlowNode({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}
