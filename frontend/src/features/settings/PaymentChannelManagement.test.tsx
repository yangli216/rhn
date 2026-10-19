import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentConfigurationCatalog, PaymentMerchantConfiguration, RhnApi } from '../../shared/rhnApi'
import { PaymentChannelManagement } from './PaymentChannelManagement'

const channel: PaymentConfigurationCatalog['channels'][number] = {
  paymentMethodCode: 'NEW_CARD_PROVIDER', adapterCode: 'NEW_CARD', name: '新增卡渠道', fields: [
    { key: 'appId', label: '应用标识', control: 'TEXT', required: true, secret: false, identity: true, options: [] },
    { key: 'merchantId', label: '商户标识', control: 'TEXT', required: true, secret: false, identity: true, options: [] },
    { key: 'apiSecret', label: '渠道密钥', control: 'PASSWORD', required: true, secret: true, identity: false, options: [] },
  ],
}
const config: PaymentMerchantConfiguration = {
  organizationId: 'org1', paymentMethodCode: channel.paymentMethodCode, revision: -1, enabled: false,
  identityLocked: false, source: 'UNCONFIGURED', encryptionAvailable: true, values: {}, configuredSecrets: { apiSecret: false },
}
const catalog: PaymentConfigurationCatalog = {
  encryptionAvailable: true, organizations: [{ id: 'org1', name: '第一医院' }, { id: 'org2', name: '第二医院' }],
  channels: [channel, { ...channel, paymentMethodCode: 'ANOTHER_PROVIDER', adapterCode: 'ANOTHER', name: '其他渠道' }],
}
function setup(options: { initial?: PaymentMerchantConfiguration; catalog?: PaymentConfigurationCatalog; canManage?: boolean; reconciliationAuthorities?: string[]; reconciliationMethods?: string[]; reconciliationError?: boolean } = {}) {
  const billing = {
    reconciliationChannels: vi.fn().mockResolvedValue((options.reconciliationMethods || []).map(paymentMethodCode => ({ capability: { paymentMethodCode } }))),
    reconciliationPolicy: vi.fn().mockResolvedValue({ revision: -1, autoEnabled: false, fetchTime: '11:00', backfillDays: 7, zoneId: 'Asia/Shanghai', availableAfter: '10:00', maximumBackfillDays: 90 }),
    paymentConfigurationCatalog: vi.fn().mockResolvedValue(options.catalog || catalog),
    paymentMerchantConfiguration: vi.fn().mockImplementation((organizationId: string, method: string) => Promise.resolve({ ...(options.initial || config), organizationId, paymentMethodCode: method })),
    savePaymentMerchantConfiguration: vi.fn().mockResolvedValue({ ...config, revision: 0, enabled: true, identityLocked: true,
      source: 'MANAGED', values: { appId: 'APP', merchantId: 'MERCHANT' }, configuredSecrets: { apiSecret: true } }),
    checkPaymentMerchantConfiguration: vi.fn().mockResolvedValue({ success: true, message: '仅本地检测通过，需线上联调', checkedAt: '' }),
  }
  if (options.reconciliationError) billing.reconciliationChannels.mockRejectedValueOnce(new Error('渠道能力暂不可用'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const props = { api: { billing } as unknown as RhnApi, contextKey: 'tenant1:context1', canManage: options.canManage ?? true, reconciliationAuthorities: options.reconciliationAuthorities || [] }
  const view = render(<QueryClientProvider client={queryClient}><PaymentChannelManagement {...props} /></QueryClientProvider>)
  const user = userEvent.setup()
  const fill = async () => {
    await user.type(await screen.findByLabelText(/^应用标识/), 'APP')
    await user.type(screen.getByLabelText(/^商户标识/), 'MERCHANT')
    await user.type(screen.getByLabelText(/^渠道密钥/), 'do-not-cache-secret')
  }
  return { ...view, props, billing, queryClient, user, fill }
}

describe('PaymentChannelManagement', () => {
  it('shows a retriable error when reconciliation capabilities fail to load', async () => {
    const { user, billing } = setup({ reconciliationAuthorities: ['PAYMENT_RECONCILIATION.READ'], reconciliationMethods: [channel.paymentMethodCode], reconciliationError: true })
    expect(await screen.findByText(/对账能力加载失败/)).toHaveTextContent('渠道能力暂不可用')
    await user.click(screen.getByRole('button', { name: '重试加载对账能力' }))
    await screen.findByRole('button', { name: '对账策略' })
    expect(billing.reconciliationChannels).toHaveBeenCalledTimes(2)
  })
  it('shows reconciliation policy only when the selected provider declares statement capabilities', async () => {
    const { user, billing } = setup({ reconciliationAuthorities: ['PAYMENT_RECONCILIATION.READ'], reconciliationMethods: [channel.paymentMethodCode] })
    await user.click(await screen.findByRole('button', { name: '对账策略' }))
    await screen.findByRole('switch', { name: '自动拉取并核对历史交易账单' })
    expect(billing.reconciliationPolicy).toHaveBeenCalledWith(channel.paymentMethodCode, 'org1')
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await user.click(screen.getByRole('button', { name: '其他渠道' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '对账策略' })).not.toBeInTheDocument())
  })
  it('renders provider-owned fields, confirms institution and saves secrets without query or mutation caching', async () => {
    const { billing, queryClient, user, fill } = setup()
    await fill()
    await user.click(screen.getByRole('switch', { name: '允许此机构发起新收款' }))
    await user.click(screen.getByRole('button', { name: '保存配置' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('第一医院')
    expect(screen.getByRole('dialog')).toHaveTextContent('MERCHANT')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('do-not-cache-secret')
    expect(billing.savePaymentMerchantConfiguration).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(billing.savePaymentMerchantConfiguration).toHaveBeenCalledWith('org1', channel.paymentMethodCode, {
      expectedRevision: -1, enabled: true, values: { appId: 'APP', merchantId: 'MERCHANT', apiSecret: 'do-not-cache-secret' }, clearSecrets: [],
    }))
    await waitFor(() => expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue(''))
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map(query => query.state.data))).not.toContain('do-not-cache-secret')
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })
  it('uses the payment dictionary display name supplied by the server', async () => {
    setup({ catalog: { ...catalog, channels: [{ ...channel, paymentMethodCodeText: '字典渠道名称' }] } })
    expect(await screen.findByRole('button', { name: '字典渠道名称' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('字典渠道名称')
  })
  it('focuses the first missing required field without sending a check request', async () => {
    const { billing, user } = setup()
    const application = await screen.findByLabelText(/^应用标识/)
    await user.click(screen.getByRole('button', { name: '检测配置' }))
    expect(application).toHaveFocus()
    expect(billing.checkPaymentMerchantConfiguration).not.toHaveBeenCalled()
  })
  it('checks the draft without saving or enabling the channel', async () => {
    const { billing, user, fill } = setup()
    await fill(); await user.click(screen.getByRole('button', { name: '检测配置' }))
    await screen.findByText('本地检测通过')
    expect(billing.checkPaymentMerchantConfiguration).toHaveBeenCalledWith('org1', channel.paymentMethodCode, expect.objectContaining({ enabled: false }))
    expect(billing.savePaymentMerchantConfiguration).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('do-not-cache-secret')
  })
  it('keeps configured secrets when left blank and locks an activated merchant identity', async () => {
    const initial = { ...config, revision: 2, enabled: true, identityLocked: true, source: 'MANAGED', values: { appId: 'APP', merchantId: 'MERCHANT' }, configuredSecrets: { apiSecret: true } }
    const { billing, user } = setup({ initial })
    expect(await screen.findByLabelText(/^应用标识/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('')
    await user.click(screen.getByRole('switch', { name: '允许此机构发起新收款' }))
    await user.click(screen.getByRole('button', { name: '保存配置' })); await user.click(screen.getByRole('button', { name: '确认' }))
    expect(billing.savePaymentMerchantConfiguration).toHaveBeenCalledWith('org1', channel.paymentMethodCode, {
      expectedRevision: 2, enabled: false, values: initial.values, clearSecrets: [],
    })
  })
  it('asks before switching with unsaved credentials and clears them on the next channel', async () => {
    const { user, fill } = setup(); await fill()
    await user.click(screen.getByRole('button', { name: '其他渠道' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('尚未保存')
    await user.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('do-not-cache-secret')
    await user.click(screen.getByRole('button', { name: '其他渠道' })); await user.click(screen.getByRole('button', { name: '放弃并切换' }))
    await waitFor(() => expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue(''))
  })
  it('discards a draft when reloading even when the saved revision has not changed', async () => {
    const { user, fill } = setup(); await fill()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue(''))
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
  })
  it('blocks edits and target changes while a reload is pending', async () => {
    const { billing, user, fill } = setup(); await fill()
    let resolve!: (value: PaymentMerchantConfiguration) => void
    billing.paymentMerchantConfiguration.mockReturnValueOnce(new Promise(r => { resolve = r }))
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByLabelText(/^渠道密钥/)).toBeDisabled()
    expect(screen.getByRole('button', { name: '其他渠道' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeDisabled()
    expect(billing.paymentMerchantConfiguration).toHaveBeenCalledTimes(2)
    await act(async () => resolve(config))
    await waitFor(() => expect(screen.getByLabelText(/^渠道密钥/)).toBeEnabled())
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('')
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
  })
  it('ignores a late check response after institution work context changes', async () => {
    const { props, rerender, queryClient, billing, user, fill } = setup()
    let resolve!: (value: unknown) => void
    billing.checkPaymentMerchantConfiguration.mockReturnValue(new Promise(r => { resolve = r }))
    await fill(); await user.click(screen.getByRole('button', { name: '检测配置' }))
    rerender(<QueryClientProvider client={queryClient}><PaymentChannelManagement {...props} contextKey="tenant1:context2" /></QueryClientProvider>)
    await screen.findByLabelText(/^渠道密钥/)
    await act(async () => resolve({ success: true, message: 'OLD-INSTITUTION-RESULT', checkedAt: '' }))
    expect(screen.queryByText('OLD-INSTITUTION-RESULT')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('')
  })
  it('preserves drafts after save failure and prevents duplicate submissions', async () => {
    const { billing, user, fill } = setup()
    let reject!: (error: Error) => void
    billing.savePaymentMerchantConfiguration.mockReturnValue(new Promise((_resolve, r) => { reject = r }))
    await fill(); await user.click(screen.getByRole('button', { name: '保存配置' })); await user.click(screen.getByRole('button', { name: '确认' }))
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled()
    expect(billing.savePaymentMerchantConfiguration).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('revision conflict')))
    expect(screen.getByLabelText(/^渠道密钥/)).toHaveValue('do-not-cache-secret')
    expect(await screen.findByText('revision conflict')).toBeInTheDocument()
  })
  it('blocks writes without the encryption key and blocks unauthorized reads', async () => {
    const blocked = setup({ catalog: { ...catalog, encryptionAvailable: false } })
    await blocked.fill()
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
    blocked.unmount()
    const denied = setup({ canManage: false })
    expect(screen.getByText('当前账号无权维护支付渠道。')).toBeInTheDocument()
    expect(denied.billing.paymentConfigurationCatalog).not.toHaveBeenCalled()
  })
  it('selects an institution and loads only that institutions merchant configuration', async () => {
    const { billing, user, fill } = setup(); await fill()
    await user.click(screen.getByRole('combobox', { name: '配置机构' }))
    await user.click(screen.getByRole('option', { name: /第二医院/ }))
    await user.click(screen.getByRole('button', { name: '放弃并切换' }))
    await waitFor(() => expect(billing.paymentMerchantConfiguration).toHaveBeenCalledWith('org2', channel.paymentMethodCode))
    expect(await screen.findByLabelText(/^渠道密钥/)).toHaveValue('')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('第二医院')
  })
  it('does not restore a late credential file after switching work context', async () => {
    const fileField = { ...channel.fields[2], control: 'FILE', accept: '.pem', encoding: 'UTF8' }
    const { props, rerender, queryClient, user } = setup({ catalog: { ...catalog, channels: [{ ...channel, fields: [...channel.fields.slice(0, 2), fileField] }] } })
    let resolve!: (value: string) => void
    const file = new File(['private-key-content'], 'test.pem', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: () => new Promise<string>(r => { resolve = r }) })
    await user.upload(await screen.findByLabelText(/^渠道密钥/), file)
    expect(screen.getByRole('button', { name: '检测配置' })).toBeDisabled()
    rerender(<QueryClientProvider client={queryClient}><PaymentChannelManagement {...props} contextKey="another-context" /></QueryClientProvider>)
    await screen.findByLabelText(/^渠道密钥/)
    await act(async () => resolve('OLD-PRIVATE-KEY'))
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '清除渠道密钥' })).not.toBeInTheDocument()
  })
  it('uploads declared credential files securely and can explicitly clear a disabled draft secret', async () => {
    const fileField = { ...channel.fields[2], control: 'FILE', accept: '.pem', encoding: 'UTF8' }
    const { user, billing } = setup({ catalog: { ...catalog, channels: [{ ...channel, fields: [...channel.fields.slice(0, 2), fileField] }] } })
    const input = await screen.findByLabelText(/^渠道密钥/)
    const file = new File(['private-key-content'], 'test.pem', { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('private-key-content') })
    await user.upload(input, file)
    await waitFor(() => expect(screen.getByRole('button', { name: '清除渠道密钥' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '清除渠道密钥' }))
    await user.click(screen.getByRole('button', { name: '保存配置' })); await user.click(screen.getByRole('button', { name: '确认' }))
    expect(billing.savePaymentMerchantConfiguration).toHaveBeenCalledWith('org1', channel.paymentMethodCode, {
      expectedRevision: -1, enabled: false, values: {}, clearSecrets: ['apiSecret'],
    })
    expect(screen.queryByText('private-key-content')).not.toBeInTheDocument()
  })
})
