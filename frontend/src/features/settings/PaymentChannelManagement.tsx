import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { errorMessage, type PaymentConfigurationCatalog, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, Select } from '../../shared/ui'
import { MasterDetailPage } from '../../shared/ui/templates/PageTemplates'
import { paymentChannelLabel } from './payment/paymentChannelLabel'
import { PaymentMerchantEditor } from './payment/PaymentMerchantEditor'
import './payment/payment-channel-settings.css'

type Target = { organizationId: string; method: string }
type EditorState = { dirty: boolean; busy: boolean; ready: boolean }

export function PaymentChannelManagement(props: { api: RhnApi; contextKey: string; canManage: boolean; preferredOrganizationId?: string; reconciliationAuthorities?: string[] }) {
  return <PaymentChannelWorkspace key={props.contextKey} {...props} />
}

function PaymentChannelWorkspace({ api, contextKey, canManage, preferredOrganizationId, reconciliationAuthorities = [] }: { api: RhnApi; contextKey: string; canManage: boolean; preferredOrganizationId?: string; reconciliationAuthorities?: string[] }) {
  const [target, setTarget] = useState<Target>()
  const catalog = useQuery({ queryKey: ['payment-configuration-catalog', contextKey],
    queryFn: () => api.billing.paymentConfigurationCatalog(), enabled: canManage, gcTime: 0, retry: false, refetchOnWindowFocus: false })
  const canReadReconciliation = reconciliationAuthorities.includes('PAYMENT_RECONCILIATION.READ') || reconciliationAuthorities.includes('ROLE_ADMIN')
  const reconciliation = useQuery({ queryKey: ['payment-reconciliation-channels', contextKey],
    queryFn: () => api.billing.reconciliationChannels(), enabled: canManage && canReadReconciliation, retry: false })
  if (!canManage) return <MasterDetailPage title="支付渠道" navigationLabel="机构与渠道" navigation={<p>当前账号无权维护支付渠道。</p>}><p>请联系管理员授予支付渠道配置权限。</p></MasterDetailPage>
  if (catalog.isPending) return <MasterDetailPage title="支付渠道" navigationLabel="机构与渠道" navigation={<LoadingState />}><LoadingState label="正在加载渠道配置能力…" /></MasterDetailPage>
  if (catalog.isError) return <MasterDetailPage title="支付渠道" feedback={<Alert duration={null}>{errorMessage(catalog.error)}<Button variant="secondary" onClick={() => { void catalog.refetch() }}>重新加载</Button></Alert>}
    navigationLabel="机构与渠道" navigation={<p>渠道目录加载失败</p>}><p>重新加载后选择机构与渠道。</p></MasterDetailPage>
  const data = catalog.data
  const preferred = target?.organizationId || preferredOrganizationId
  const organizationId = data.organizations.some(org => org.id === preferred) ? preferred : data.organizations[0]?.id
  const method = data.channels.some(channel => channel.paymentMethodCode === target?.method) ? target!.method : data.channels[0]?.paymentMethodCode
  return <PaymentChannelPage key={`${contextKey}:${organizationId}:${method}`} api={api} contextKey={contextKey} catalog={data} reconciliationFeedback={reconciliation.isError ? <Alert tone="warning" placement="inline">对账能力加载失败：{errorMessage(reconciliation.error)}<Button variant="secondary" onClick={() => { void reconciliation.refetch() }}>重试加载对账能力</Button></Alert> : undefined} reconciliationAuthorities={reconciliationAuthorities} reconciliationMethods={(reconciliation.data || []).map(value => value.capability.paymentMethodCode)}
    target={{ organizationId: organizationId || '', method: method || '' }} onTarget={setTarget} />
}

function PaymentChannelPage({ api, contextKey, catalog, target, onTarget, reconciliationAuthorities, reconciliationMethods, reconciliationFeedback }: {
  api: RhnApi; contextKey: string; catalog: PaymentConfigurationCatalog; target: Target; onTarget: (target: Target) => void; reconciliationAuthorities: string[]; reconciliationMethods: string[]; reconciliationFeedback?: React.ReactNode
}) {
  const formId = useId()
  const [editor, setEditor] = useState<EditorState>({ dirty: false, busy: false, ready: false })
  const [pendingTarget, setPendingTarget] = useState<Target>()
  const organization = catalog.organizations.find(value => value.id === target.organizationId)
  const channel = catalog.channels.find(value => value.paymentMethodCode === target.method)
  const channelName = channel ? paymentChannelLabel(channel) : ''
  const choose = (value: Target) => {
    if (editor.busy) return
    if (value.method === target.method && value.organizationId === target.organizationId) return
    if (editor.dirty) setPendingTarget(value)
    else onTarget(value)
  }
  return <>
    <MasterDetailPage title="支付渠道" description="按机构配置收款商户与凭证，控制新收款并检测配置。"
      navigationLabel="机构与渠道"
      navigationHeader={<FormField label="配置机构"><Select value={target.organizationId} disabled={editor.busy}
        options={catalog.organizations.map(value => ({ value: value.id, label: value.name }))}
        onChange={organizationId => choose({ ...target, organizationId })} placeholder="无可维护的机构" /></FormField>}
      navigation={<div className="payment-channel-navigation">
        {catalog.channels.map(value => <Button key={value.paymentMethodCode} variant="secondary" disabled={editor.busy}
          aria-pressed={value.paymentMethodCode === target.method} onClick={() => choose({ ...target, method: value.paymentMethodCode })}>{paymentChannelLabel(value)}</Button>)}
        {!catalog.channels.length && <p>当前部署没有提供可配置的支付渠道，请联系部署管理员启用渠道适配器。</p>}
      </div>}
      detailLabel="机构支付配置" detailHeader={<h2>{organization && channel ? `${organization.name} · ${channelName}` : '选择机构和支付渠道'}</h2>}
      detailFooter={organization && channel && <div className="payment-channel-actions">
        <Button type="submit" form={formId} name="operation" value="reload" variant="secondary" disabled={editor.busy || !editor.ready}>重新加载</Button>
        <Button type="submit" form={formId} name="operation" value="check" variant="secondary" disabled={editor.busy || !editor.ready}>检测配置</Button>
        <Button type="submit" form={formId} name="operation" value="save" disabled={editor.busy || !editor.ready || !catalog.encryptionAvailable || !editor.dirty}>{editor.busy ? '正在处理…' : '保存配置'}</Button>
      </div>}
    >
      {reconciliationFeedback}
      {!catalog.encryptionAvailable && <Alert tone="warning" placement="inline">服务器尚未配置凭证加密主密钥，暂不能保存配置。请联系部署管理员完成配置。</Alert>}
      {organization && channel
        ? <PaymentMerchantEditor api={api} contextKey={contextKey} organization={organization} channel={channel} formId={formId} onState={setEditor} reconciliationAuthorities={reconciliationAuthorities} reconciliationSupported={reconciliationMethods.includes(channel.paymentMethodCode)} />
        : <p>请选择有维护权限的机构；渠道启用后可在此配置商户。</p>}
    </MasterDetailPage>
    {pendingTarget && <Dialog title="放弃当前未保存的配置？" description="当前录入的凭证尚未保存。切换后将清除这些输入。"
      onClose={() => setPendingTarget(undefined)} footer={<><Button variant="secondary" onClick={() => setPendingTarget(undefined)}>继续编辑</Button>
        <Button variant="danger" onClick={() => onTarget(pendingTarget)}>放弃并切换</Button></>}><p>{organization?.name} · {channelName}</p></Dialog>}
  </>
}
