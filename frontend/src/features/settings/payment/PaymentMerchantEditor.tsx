import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  errorMessage, type PaymentConfigurationCheckResult, type PaymentConfigurationDescriptor,
  type PaymentConfigurationField, type PaymentConfigurationOrganization, type PaymentMerchantConfiguration,
  type PaymentMerchantConfigurationUpdate, type RhnApi,
} from '../../../shared/rhnApi'
import { paymentChannelLabel } from './paymentChannelLabel'
import { formatTime } from '../../../shared/format'
import { Alert, Button, Dialog, FormField, LoadingState, Select, StatusBadge, Switch } from '../../../shared/ui'

type EditorState = { dirty: boolean; busy: boolean; ready: boolean }
type Props = {
  api: RhnApi; contextKey: string; organization: PaymentConfigurationOrganization; channel: PaymentConfigurationDescriptor
  formId: string; onState: (state: EditorState) => void
}

export function PaymentMerchantEditor(props: Props) {
  const { api, contextKey, organization, channel, onState } = props
  const queryKey = ['payment-merchant-configuration', contextKey, organization.id, channel.paymentMethodCode]
  const [reloadGeneration, setReloadGeneration] = useState(0)
  const query = useQuery({ queryKey, queryFn: () => api.billing.paymentMerchantConfiguration(organization.id, channel.paymentMethodCode),
    gcTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  useEffect(() => { if (!query.isSuccess) onState({ dirty: false, busy: false, ready: false }) }, [onState, query.isSuccess])
  if (query.isPending) return <LoadingState label="正在读取机构商户配置…" />
  if (query.isError) return <Alert duration={null}>{errorMessage(query.error)}<Button variant="secondary" onClick={() => { void query.refetch() }}>重新加载</Button></Alert>
  if (query.data.organizationId !== organization.id || query.data.paymentMethodCode !== channel.paymentMethodCode) return <Alert duration={null}>渠道配置与当前机构不一致，请重新进入页面。</Alert>
  if (channel.fields.some(field => !['TEXT', 'CHOICE', 'PASSWORD', 'FILE'].includes(field.control)
    || field.secret && !['PASSWORD', 'FILE'].includes(field.control))) return <Alert duration={null}>当前客户端尚不支持此渠道的配置表单，请联系管理员升级。</Alert>
  return <MerchantConfigurationForm key={`${query.data.revision}:${reloadGeneration}`} {...props} initial={query.data} queryKey={queryKey} reload={async () => { const result = await query.refetch(); if (result.isSuccess) setReloadGeneration(value => value + 1) }} />
}

function MerchantConfigurationForm({ api, organization, channel, formId, onState, initial, queryKey, reload }: Props & {
  initial: PaymentMerchantConfiguration; queryKey: string[]; reload: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const channelName = paymentChannelLabel(channel)
  const [values, setValues] = useState<Record<string, string>>(initial.values)
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [clearSecrets, setClearSecrets] = useState<string[]>([])
  const [enabled, setEnabled] = useState(initial.enabled)
  const [working, setWorking] = useState(false)
  const [reading, setReading] = useState(false)
  const pendingUpload = useRef(false)
  const [confirmation, setConfirmation] = useState<'save' | 'reload'>()
  const [error, setError] = useState('')
  const [checkResult, setCheckResult] = useState<PaymentConfigurationCheckResult>()
  const alive = useRef(true)
  const requestInFlight = useRef(false)
  const uploads = useRef<Record<string, number>>({})
  const visible = channel.fields.filter(field => !field.visibleWhenField || values[field.visibleWhenField] === field.visibleWhenValue)
  const dirty = enabled !== initial.enabled || Object.keys(secrets).length > 0 || clearSecrets.length > 0
    || Object.entries(values).some(([key, value]) => value !== (initial.values[key] || ''))
  useEffect(() => { onState({ dirty, busy: working || reading, ready: true }) }, [onState, dirty, working, reading])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const edit = (field: PaymentConfigurationField, value: string) => {
    setError(''); setCheckResult(undefined)
    if (field.secret) {
      setSecrets(current => {
        const next = { ...current }
        if (value) next[field.key] = value
        else delete next[field.key]
        return next
      })
      setClearSecrets(current => current.filter(key => key !== field.key))
    } else setValues(current => ({ ...current, [field.key]: value }))
  }
  const upload = async (field: PaymentConfigurationField, file?: File) => {
    if (!file || working || pendingUpload.current) return
    const version = (uploads.current[field.key] || 0) + 1
    uploads.current[field.key] = version
    if (file.size === 0) { setError('凭证文件不能为空，请重新选择。'); return }
    if (file.size > 131072) { setError('凭证文件不能超过 128 KiB，请选择正确的商户凭证文件。'); return }
    pendingUpload.current = true; setReading(true)
    try {
      let value: string
      if (field.encoding === 'BASE64') {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
        value = btoa(binary)
      } else value = await file.text()
      if (alive.current && uploads.current[field.key] === version) edit(field, value)
    } catch { if (alive.current) setError('凭证文件读取失败，请重新选择。') }
    finally { pendingUpload.current = false; if (alive.current) setReading(false) }
  }
  const command = (): PaymentMerchantConfigurationUpdate => ({ expectedRevision: initial.revision, enabled,
    values: { ...values, ...secrets }, clearSecrets })
  const validate = () => {
    const missing = visible.find(field => field.required && !(field.secret
      ? secrets[field.key]?.trim() || initial.configuredSecrets[field.key] && !clearSecrets.includes(field.key)
      : values[field.key]?.trim()))
    if (!missing) return true
    setError(`请填写或上传：${missing.label}`)
    document.getElementById(`${formId}-${missing.key}`)?.focus()
    return false
  }
  const run = async (operation: 'save' | 'check') => {
    if (requestInFlight.current || pendingUpload.current) return
    const credentialsChanged = Object.keys(secrets).length > 0 || clearSecrets.length > 0
      || Object.entries(values).some(([key, value]) => value !== (initial.values[key] || ''))
    if ((operation === 'check' || enabled || initial.identityLocked && credentialsChanged) && !validate()) return
    requestInFlight.current = true; setWorking(true); setError('')
    try {
      // Write-only credentials stay in this form and the request; they never enter a mutation cache.
      const result = operation === 'save'
        ? await api.billing.savePaymentMerchantConfiguration(organization.id, channel.paymentMethodCode, command())
        : await api.billing.checkPaymentMerchantConfiguration(organization.id, channel.paymentMethodCode, command())
      if (!alive.current) return
      if (operation === 'save') {
        const saved = result as PaymentMerchantConfiguration
        if (saved.organizationId !== organization.id || saved.paymentMethodCode !== channel.paymentMethodCode) throw new Error('保存结果与当前机构不一致，请重新加载')
        setSecrets({}); setClearSecrets([])
        queryClient.setQueryData(queryKey, saved)
      } else setCheckResult(result as PaymentConfigurationCheckResult)
    } catch (failure) { if (alive.current) setError(errorMessage(failure)) }
    finally { if (alive.current) { requestInFlight.current = false; setWorking(false); setConfirmation(undefined) } }
  }
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (working || pendingUpload.current) return
    const operation = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value || 'save'
    if (operation === 'check') { void run('check'); return }
    if (operation === 'reload') {
      if (dirty) setConfirmation('reload')
      else void reloadConfiguration()
      return
    }
    if (enabled && !validate()) return
    setConfirmation('save')
  }
  const reloadConfiguration = async () => {
    if (requestInFlight.current || pendingUpload.current) return
    requestInFlight.current = true; setWorking(true)
    try { await reload() }
    finally { if (alive.current) { requestInFlight.current = false; setWorking(false) } }
  }
  return <>
    {error && <Alert duration={null}>{error}</Alert>}
    <form id={formId} onSubmit={onSubmit} className="payment-channel-form" method="post" autoComplete="off">
      <div className="payment-channel-actions">
        <StatusBadge tone={initial.enabled ? 'success' : 'neutral'}>{initial.enabled ? '允许新收款' : '新收款已停用'}</StatusBadge>
        <span>{initial.source === 'MANAGED' ? '已保存的机构配置' : initial.source === 'DEPLOYMENT' ? '来自部署配置' : '尚未配置'}</span>
        {initial.updatedAt && <span>最近保存：{formatTime(initial.updatedAt)}</span>}
        {dirty && <StatusBadge tone="warning">有未保存修改</StatusBadge>}
      </div>
      <Switch checked={enabled} onChange={value => { setEnabled(value); setCheckResult(undefined) }} disabled={working || reading} label="允许此机构发起新收款" />
      <p>停用后停止新收款，原支付单仍可查询和退款。必填项已标记；凭证留空会保留已保存的值。</p>
      {initial.identityLocked && <p>商户身份已锁定，保留原应用、商户号和支付环境；可替换同一商户的有效凭证。</p>}
      <div className="payment-channel-fields">
        {visible.map(field => <div key={field.key}><FormField label={field.label} required={field.required}
          hint={field.secret ? secrets[field.key] ? '已录入新凭证，保存后生效' : clearSecrets.includes(field.key) ? '保存时清除该凭证' : initial.configuredSecrets[field.key] ? '已配置，留空保留；如需替换请重新录入或上传' : '尚未配置' : undefined}>
          {field.control === 'CHOICE'
            ? initial.identityLocked && field.identity
              ? <p>{field.options.find(option => option.value === values[field.key])?.label || values[field.key] || '—'}</p>
              : <Select id={`${formId}-${field.key}`} value={values[field.key] || ''} options={field.options} disabled={working || reading} onChange={value => edit(field, value)} />
            : field.control === 'FILE'
              ? <input id={`${formId}-${field.key}`} type="file" accept={field.accept} disabled={working || reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(field, file) }} />
              : <input id={`${formId}-${field.key}`} type={field.secret ? 'password' : 'text'} autoComplete={field.secret ? 'new-password' : 'off'} spellCheck={false}
                value={(field.secret ? secrets[field.key] : values[field.key]) || ''} disabled={working || reading} readOnly={initial.identityLocked && field.identity}
                onChange={event => edit(field, event.target.value)} maxLength={field.secret ? 180000 : 128} />}
        </FormField>
          {field.secret && !initial.identityLocked && (initial.configuredSecrets[field.key] || secrets[field.key]) && <Button variant="secondary" size="sm" disabled={working || reading}
            onClick={() => { setSecrets(current => { const next = { ...current }; delete next[field.key]; return next }); setClearSecrets(current => [...new Set([...current, field.key])]); setCheckResult(undefined) }}>清除{field.label}</Button>}
        </div>)}
      </div>
      {checkResult && <p role="status"><StatusBadge tone={checkResult.success ? 'success' : 'warning'}>{checkResult.success ? '本地检测通过' : '检测未通过'}</StatusBadge> {checkResult.message}</p>}
      <p>检测不发起收退款。它检查必填项、密钥和证书；正式使用前仍需完成商户签约及线上收退款联调。</p>
    </form>
    {confirmation && <Dialog title={confirmation === 'save' ? `确认保存${organization.name}的${channelName}配置？` : '重新加载并放弃当前修改？'}
      description={confirmation === 'reload' ? '未保存的凭证输入将被清除。' : enabled ? '保存后此机构可使用该商户发起新收款，凭证更新同时用于原单查询和退款。' : '保存后此机构将停止新收款，保留原单查询和退款。'}
      onClose={() => { if (!working) setConfirmation(undefined) }} footer={<><Button variant="secondary" disabled={working || reading} onClick={() => setConfirmation(undefined)}>继续编辑</Button>
        <Button disabled={working || reading} onClick={() => { if (confirmation === 'save') void run('save'); else { setConfirmation(undefined); void reloadConfiguration() } }}>{working ? '正在保存…' : '确认'}</Button></>}>
      <p>{organization.name} · {channelName}</p>
      {confirmation === 'save' && <dl className="payment-channel-identities">{visible.filter(field => field.identity && !field.secret).map(field =>
        <div key={field.key}><dt>{field.label}</dt><dd>{field.options.find(option => option.value === values[field.key])?.label || values[field.key] || '—'}</dd></div>)}</dl>}
    </Dialog>}
  </>
}
