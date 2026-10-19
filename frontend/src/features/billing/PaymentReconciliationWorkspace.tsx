import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { errorMessage, type ReconciliationChannel, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, EmptyState, FormField, LoadingState, Pagination, Select, StatusBadge, tableCellClass } from '../../shared/ui'
import { DatePicker } from '../../shared/ui/DatePicker'
import { DateRangePicker } from '../../shared/ui/DateRangePicker'
import { ListPage } from '../../shared/ui/templates/PageTemplates'
import { ReconciliationPolicyDialog } from '../../shared/billing/ReconciliationPolicyDialog'
import { money } from './BillingShared'
import { PaymentReconciliationDetail } from './reconciliation/PaymentReconciliationDetail'
import { accountDate, reconPermission } from './reconciliation/reconciliationUi'
import { useSystemEnum } from '../../shared/ui/useSystemEnum'
import './reconciliation/payment-reconciliation.css'

type Props = { api: RhnApi; contextKey: string; organizationId: string; organizationName: string; authorities: string[] }
export function PaymentReconciliationWorkspace(props: Props) { return <ReconciliationWorkspace key={props.contextKey} {...props} /> }
function ReconciliationWorkspace(props: Props) {
  const { api, contextKey, authorities } = props
  const canRead = reconPermission(authorities, 'READ')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const taskStatuses = useSystemEnum(api.dictionaries, 'BIL_RECON_TASK_STATUS')
  const [selectedId, setSelectedId] = useState('')
  const [page, setPage] = useState(0)
  const [range, setRange] = useState({ from: accountDate('Asia/Shanghai', -7), to: accountDate('Asia/Shanghai', -1) })
  const [appliedRange, setAppliedRange] = useState(range)
  const [createOpen, setCreateOpen] = useState(false)
  const catalog = useQuery({ queryKey: ['payment-reconciliation-channels', contextKey], queryFn: () => api.billing.reconciliationChannels(), enabled: canRead, retry: false })
  const channel = catalog.data?.find(value => value.capability.paymentMethodCode === method) || catalog.data?.[0]
  const effectiveMethod = channel?.capability.paymentMethodCode || ''
  const tasks = useQuery({ queryKey: ['payment-reconciliation-tasks', contextKey, effectiveMethod, appliedRange, page, status],
    queryFn: () => api.billing.reconciliationTasks(effectiveMethod, appliedRange.from, appliedRange.to, page, status), enabled: canRead && Boolean(channel?.configured), retry: false,
    refetchInterval: query => query.state.data?.content.some(task => ['QUEUED', 'RUNNING', 'RETRY_WAIT', 'WAITING_STATEMENT'].includes(task.status)) ? 5000 : false })
  if (!canRead) return <ListPage title="支付对账" filters={<p>当前账号无支付对账查看权限。</p>}><EmptyState icon="billing" title="无权查看支付对账" copy="请联系管理员授予当前机构的财务对账权限。" /></ListPage>
  if (selectedId) return <PaymentReconciliationDetail {...props} taskId={selectedId} onReturn={() => setSelectedId('')} />
  const error = catalog.error || tasks.error
  return <>
    <ListPage title="支付对账" description={`${props.organizationName} · 先取得商户账单，再核对本机构交易；交易对平不代表银行到账。`}
      actions={<Button disabled={!reconPermission(authorities, 'RUN') || !channel?.configured} onClick={() => setCreateOpen(true)}>拉取并核对</Button>}
      feedback={error && <Alert duration={null}>{errorMessage(error)}<Button variant="secondary" onClick={() => { void catalog.refetch(); if (channel?.configured) void tasks.refetch() }}>重新加载</Button></Alert>}
      filters={<>
        <FormField label="支付渠道"><Select value={effectiveMethod} options={(catalog.data || []).map(value => ({ value: value.capability.paymentMethodCode, label: value.capability.paymentMethodCodeText || value.capability.name }))}
          onChange={value => { setMethod(value); setPage(0) }} /></FormField>
        <FormField label="任务状态"><Select value={status} options={[{ value: '', label: '全部状态' }, ...taskStatuses.options.filter(value => !['NO_CHANGE', 'SUPERSEDED'].includes(value.value))]} onChange={value => { setStatus(value); setPage(0) }} /></FormField>
        <FormField label="账单日期"><DateRangePicker value={range} onChange={setRange} /></FormField>
        <div className="ui-query-filters__actions"><Button variant="secondary" onClick={() => { setAppliedRange(range); setPage(0) }}>查询</Button>
          {channel && <ReconciliationPolicyDialog api={api} contextKey={contextKey} organizationId={props.organizationId} method={effectiveMethod} channelName={channel.capability.name}
            canRead={canRead} canRun={reconPermission(authorities, 'RUN')} configured={channel.configured} />}
        </div>
      </>}
      footer={tasks.data && <Pagination label="支付对账任务分页" page={page} totalPages={tasks.data.totalPages} total={tasks.data.totalElements} onChange={setPage} />}>
      {catalog.isPending || tasks.isPending && channel?.configured ? <LoadingState label="正在读取对账任务…" />
        : !channel ? <EmptyState icon="billing" title="当前部署没有交易账单适配器" copy="启用具备账单能力的支付渠道后重试。" />
          : !channel.configured ? <EmptyState icon="billing" title="当前机构尚未配置对账商户" copy={channel.unavailableReason || '请在系统设置 → 支付渠道中保存商户身份及凭证。'} />
            : !tasks.data?.content.length ? <EmptyState icon="billing" title="暂无该账期的对账任务" copy="可以手动拉取历史账单，或配置次日自动对账。" />
              : <DataTable aria-label="支付对账任务"><thead><tr><th>账单日</th><th>任务状态</th><th>本机构核对结果</th><th className={tableCellClass('numeric')}>渠道收款</th><th className={tableCellClass('numeric')}>退款完成</th><th className={tableCellClass('numeric')}>差异笔数</th><th>操作</th></tr></thead>
                <tbody>{tasks.data.content.map(task => <tr key={task.id}><td>{task.businessDate}</td><td><StatusBadge tone={task.status === 'FAILED' ? 'warning' : 'neutral'}>{task.statusText || task.status}</StatusBadge>{task.errorMessage && <p>{task.errorMessage}</p>}</td>
                  <td>{task.latestBatch?.statusText || (task.latestBatch ? task.latestBatch.status : '尚无核对结果')}</td>
                  <td className={tableCellClass('numeric')}>{task.latestBatch ? money(task.latestBatch.externalPayments) : '—'}</td><td className={tableCellClass('numeric')}>{task.latestBatch ? money(task.latestBatch.finalRefunds) : '—'}</td>
                  <td className={tableCellClass('numeric')}>{task.latestBatch?.differenceCount ?? '—'}</td><td><Button variant="secondary" size="sm" onClick={() => setSelectedId(task.id)}>查看核对</Button></td></tr>)}</tbody>
              </DataTable>}
    </ListPage>
    {createOpen && channel && <CreateTaskDialog api={api} contextKey={contextKey} channel={channel} onClose={() => setCreateOpen(false)} onCreated={id => { setCreateOpen(false); setSelectedId(id) }} />}
  </>
}
function CreateTaskDialog({ api, contextKey, channel, onClose, onCreated }: { api: RhnApi; contextKey: string; channel: ReconciliationChannel; onClose: () => void; onCreated: (id: string) => void }) {
  const cache = useQueryClient()
  const [date, setDate] = useState(accountDate(channel.capability.zoneId, -1))
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(false)
  const command = useRef(crypto.randomUUID())
  const live = useRef(true)
  const formId = useId()
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  // The parent is keyed by work context; a late response must never open a task in a new context.
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (request.current) return
    request.current = true; setBusy(true); setFailure('')
    try { const task = await api.billing.createReconciliationTask(channel.capability.paymentMethodCode, date, command.current)
      if (!live.current) return
      await cache.invalidateQueries({ queryKey: ['payment-reconciliation-tasks', contextKey] }); onCreated(task.id)
    } catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) { request.current = false; setBusy(false) } }
  }
  return <Dialog title={`拉取${channel.capability.name}交易账单`} description="任务会保存账单证据和逐笔核对版本；不会重新发起收款或退款。" onClose={() => { if (!busy) { live.current = false; onClose() } }}
    footer={<><Button variant="secondary" disabled={busy} onClick={() => { live.current = false; onClose() }}>取消</Button><Button form={formId} type="submit" disabled={busy}>{busy ? '正在创建…' : '确认拉取并核对'}</Button></>}>
    {failure && <Alert duration={null}>{failure}</Alert>}
    <form id={formId} onSubmit={event => { void submit(event) }}><FormField label="账单日" required hint={`渠道时区 ${channel.capability.zoneId}，历史窗口 ${channel.capability.historyDays} 天`}>
      <DatePicker value={date} disabled={busy} required min={accountDate(channel.capability.zoneId, -channel.capability.historyDays)} max={accountDate(channel.capability.zoneId, -1)} onChange={value => { setDate(value); command.current = crypto.randomUUID() }} /></FormField></form>
  </Dialog>
}
