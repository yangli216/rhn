import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage, type ReconciliationBatch, type ReconciliationItem, type ReconciliationTaskDetail, type RhnApi } from '../../../shared/rhnApi'
import { formatTime } from '../../../shared/format'
import { Alert, Button, DataTable, EmptyState, FormField, LoadingState, Pagination, Select, StatusBadge, Switch, Tabs, tableCellClass } from '../../../shared/ui'
import { ListPage, MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { money } from '../BillingShared'
import { ReconciliationActionDialog, type ReconciliationAction } from './ReconciliationActionDialog'
import { reconPermission, saveReconciliationFile } from './reconciliationUi'

type Props = { api: RhnApi; contextKey: string; organizationId: string; organizationName: string; authorities: string[]; taskId: string; onReturn: () => void }
export function PaymentReconciliationDetail(props: Props) {
  const { api, contextKey, taskId, authorities } = props
  const cache = useQueryClient()
  const [versionId, setVersionId] = useState('')
  const [tab, setTab] = useState<'institution' | 'merchant' | 'evidence'>('institution')
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(false)
  const live = useRef(true)
  const retryCommand = useRef(crypto.randomUUID())
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const detail = useQuery({ queryKey: ['payment-reconciliation-task', contextKey, taskId], queryFn: () => api.billing.reconciliationTask(taskId), retry: false,
    refetchInterval: query => query.state.data && ['QUEUED', 'RUNNING', 'RETRY_WAIT', 'WAITING_STATEMENT'].includes(query.state.data.task.status) ? 5000 : false })
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['payment-reconciliation-task', contextKey, taskId] }); await cache.invalidateQueries({ queryKey: ['payment-reconciliation-items', contextKey] }); await cache.invalidateQueries({ queryKey: ['payment-reconciliation-unallocated', contextKey, taskId] }); await cache.invalidateQueries({ queryKey: ['payment-reconciliation-events', contextKey] }) }
  const retry = async () => {
    if (!detail.data || request.current) return
    request.current = true; setBusy(true); setFailure('')
    try { await api.billing.retryReconciliationTask(taskId, { expectedRevision: detail.data.task.revision, commandCode: retryCommand.current }); if (!live.current) return; retryCommand.current = crypto.randomUUID(); setNotice('已排队重新拉取并核对，原结果继续保留'); await refresh() }
    catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) { request.current = false; setBusy(false) } }
  }
  if (detail.isPending) return <ListPage title="支付对账详情" actions={<Button variant="secondary" onClick={props.onReturn}>返回任务列表</Button>} filters={<p>正在读取账单证据与结果</p>}><LoadingState /></ListPage>
  if (detail.isError) return <ListPage title="支付对账详情" actions={<Button variant="secondary" onClick={props.onReturn}>返回任务列表</Button>} filters={<Alert duration={null}>{errorMessage(detail.error)}<Button onClick={() => { void detail.refetch() }}>重新加载</Button></Alert>}><EmptyState icon="billing" title="任务读取失败" copy="不能根据加载失败判断对账状态。" /></ListPage>
  const data = detail.data
  const batch = data.versions.find(value => value.id === versionId) || data.versions[0]
  const current = Boolean(data.task.status === 'COMPLETED' && batch && batch.statementFileId === data.task.latestFileId && batch.closure === 'OPEN')
  const header = <>
    <div className="payment-reconciliation-actions"><Button variant="secondary" onClick={props.onReturn}>返回任务列表</Button>
      <Button disabled={busy || !reconPermission(authorities, 'RUN') || ['QUEUED', 'RUNNING'].includes(data.task.status)} onClick={() => { void retry() }}>{busy ? '正在排队…' : '重新拉取并核对'}</Button>
      <Button variant="secondary" onClick={() => { void refresh() }}>刷新结果</Button></div>
    <p>{props.organizationName} · {data.task.businessDate} · {data.task.paymentMethodCodeText || data.task.paymentMethodCode} · <StatusBadge>{data.task.statusText || data.task.status}</StatusBadge></p>
    {notice && <p role="status">{notice}</p>}{(failure || data.task.errorMessage) && <Alert duration={null}>{failure || data.task.errorMessage}</Alert>}
    {!data.task.merchantAllocationComplete && data.task.latestFileId && <Alert tone="warning" placement="inline">此商户账单仍有待归属或待复核流水；以下结果仅针对本机构，不能视为商户全账对平。</Alert>}
    <Tabs label="对账资料" value={tab} onChange={setTab} items={[{ value: 'institution', label: '本机构交易' }, ...(reconPermission(authorities, 'MERCHANT_READ') ? [{ value: 'merchant' as const, label: '商户待归属' }] : []), { value: 'evidence', label: '账单证据与执行尝试' }]} />
    {tab === 'institution' && batch && <FormField label="核对版本"><Select value={batch.id} options={data.versions.map(value => ({ value: value.id, label: `第 ${value.executionNumber} 版 · ${value.statusText || value.status}${value.statementFileId === data.task.latestFileId ? ' · 最新' : ' · 历史'}` }))} onChange={setVersionId} /></FormField>}
  </>
  if (tab === 'evidence') return <EvidencePage {...props} data={data} header={header} />
  if (tab === 'merchant') return <MerchantQueue {...props} current={Boolean(data.task.status === 'COMPLETED' && data.task.latestFileId)} header={header} refresh={refresh} onNotice={setNotice} />
  if (!batch) return <ListPage title="支付对账详情" filters={header}><EmptyState icon="billing" title="尚无可用核对版本" copy="未出账、文件校验失败或任务仍在处理时，不会发布空白对平结果。" /></ListPage>
  return <BatchComparison key={batch.id} {...props} batch={batch} current={current} header={header} refresh={refresh} onNotice={setNotice} />
}
function BatchComparison({ api, contextKey, authorities, batch, current, header, refresh, onNotice }: Props & { batch: ReconciliationBatch; current: boolean; header: ReactNode; refresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const [page, setPage] = useState(0)
  const [differencesOnly, setDifferencesOnly] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [action, setAction] = useState<ReconciliationAction>()
  const [failure, setFailure] = useState('')
  const entries = useQuery({ queryKey: ['payment-reconciliation-items', contextKey, batch.id, differencesOnly, page], queryFn: () => api.billing.reconciliationItems(batch.id, differencesOnly, page), retry: false })
  const selected = entries.data?.content.find(item => item.id === selectedId) || entries.data?.content[0]
  const events = useQuery({ queryKey: ['payment-reconciliation-events', contextKey, selected?.id], queryFn: () => api.billing.reconciliationItemEvents(selected!.id), enabled: Boolean(selected), retry: false })
  const live = useRef(true)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const exportBatch = async () => {
    if (exporting) return
    setExporting(true)
    try { const blob = await api.billing.exportReconciliationBatch(batch.id); if (live.current) saveReconciliationFile(blob, `支付对账-${batch.batchNo}.csv`) }
    catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) setExporting(false) }
  }
  return <>
    <MasterDetailPage title="支付对账详情" description="本机构核对结果与财务结案分别展示，历史版本保持只读。" feedback={<>{failure && <Alert duration={null}>{failure}</Alert>}<div className="payment-reconciliation-toolbar">{header}</div></>}
      navigationLabel="对账逐笔清单" navigationHeader={<><Switch checked={differencesOnly} onChange={value => { setDifferencesOnly(value); setPage(0); setSelectedId('') }} label="仅查看未对平交易" /></>}
      navigationResetScrollKey={`${differencesOnly}:${page}`} navigationFooter={entries.data && <Pagination label="逐笔核对分页" page={page} totalPages={entries.data.totalPages} total={entries.data.totalElements} onChange={value => { setPage(value); setSelectedId('') }} />}
      navigation={entries.isPending ? <LoadingState /> : entries.isError ? <Alert duration={null}>{errorMessage(entries.error)}</Alert> : !entries.data.content.length ? <p>本页没有待展示的交易；可关闭“仅查看未对平交易”查看一致明细。</p>
        : <div className="payment-reconciliation-list">{entries.data.content.map(item => <Button key={item.id} variant="secondary" aria-pressed={item.id === selected?.id} onClick={() => setSelectedId(item.id)}>
          <span>{item.transactionTypeText || item.transactionType} · {item.comparisonResultText || item.comparisonResult}</span><span>{money(item.externalAmount)} / {money(item.localAmount)} · {item.statusText || item.status}</span>
        </Button>)}</div>}
      detailLabel="双边交易及核查证据" detailHeader={<><h2>{batch.batchNo} · 第 {batch.executionNumber} 版</h2><p>{batch.statusText || batch.status} · {batch.closureText || batch.closure}</p></>}
      detailFooter={<div className="payment-reconciliation-actions">
        <Button variant="secondary" disabled={exporting || !reconPermission(authorities, 'EXPORT')} onClick={() => { void exportBatch() }}>导出本机构明细</Button>
        <Button disabled={!current || !reconPermission(authorities, 'REVIEW')} onClick={() => setAction({ kind: 'close', batch })}>财务复核结案</Button>
      </div>}>
      <BatchSummary batch={batch} />
      {!current && <Alert tone="warning" placement="inline">此版本为历史结果、已结案或当前任务尚未成功，不能继续处置；请等待最新任务成功后核查。</Alert>}
      {selected ? <>
        <Comparison item={selected} />
        <div className="payment-reconciliation-actions">
          <Button variant="secondary" disabled={!current || !selected.paymentOrderId || !reconPermission(authorities, 'HANDLE')} onClick={() => setAction({ kind: 'query', item: selected })}>查询原单并尝试恢复</Button>
          <Button disabled={!current || selected.status !== 'OPEN' || !reconPermission(authorities, 'HANDLE')} onClick={() => setAction({ kind: 'propose', item: selected })}>提交例外依据</Button>
          <Button disabled={!current || selected.status !== 'REVIEW_PENDING' || !reconPermission(authorities, 'REVIEW')} onClick={() => setAction({ kind: 'approve', item: selected })}>复核接受例外</Button>
          <Button variant="secondary" disabled={!current || selected.status !== 'REVIEW_PENDING' || !reconPermission(authorities, 'REVIEW')} onClick={() => setAction({ kind: 'reject', item: selected })}>退回核查</Button>
        </div>
        <h2>核查与复核记录</h2>
        {events.isPending ? <LoadingState /> : events.isError ? <Alert duration={null}>{errorMessage(events.error)}</Alert> : <ol>{events.data.map((event, index) => <li key={`${event.occurredAt}-${index}`}>{formatTime(event.occurredAt)} · {event.eventTypeText || event.eventType} · {event.statusToText || event.statusTo} · {event.reason || '已记录'}</li>)}</ol>}
      </> : <p>请选择一笔交易查看双边记录。</p>}
    </MasterDetailPage>
    {action && <ReconciliationActionDialog api={api} action={action} current={current} onClose={() => setAction(undefined)} onCompleted={message => { setAction(undefined); onNotice(message); void refresh() }} />}
  </>
}
function BatchSummary({ batch }: { batch: ReconciliationBatch }) {
  return <><dl className="payment-reconciliation-summary">{[
    ['渠道收款', money(batch.externalPayments)], ['退款已受理', money(batch.acceptedRefunds)], ['退款已完成', money(batch.finalRefunds)],
    ['本地收退净额', money(batch.localAmount)], ['渠道确认净额', money(batch.externalAmount)], ['未对平笔数', String(batch.differenceCount)],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>本地快照：{batch.snapshotAt ? formatTime(batch.snapshotAt) : '历史快照'}。手续费 {money(batch.fees)} 仅展示账单信息，本期没有核验商户余额或银行到账。</p></>
}
function Comparison({ item }: { item: ReconciliationItem }) {
  return <DataTable aria-label="本地与渠道双边记录"><thead><tr><th>核对项目</th><th>本地记录</th><th>渠道账单</th></tr></thead><tbody>
    <tr><th>原指令／流水</th><td>{item.paymentOrderId || '没有可信原指令'}</td><td>{item.externalTransactionNo || '账单未见'}</td></tr>
    <tr><th>商户订单／退款请求</th><td>{item.paymentOrderId || '—'}</td><td>{item.merchantOrderNo || '—'} / {item.refundRequestNo || '—'}</td></tr>
    <tr><th>渠道退款流水</th><td>—</td><td>{item.externalRefundNo || '—'}</td></tr>
    <tr><th>收退金额</th><td className={tableCellClass('numeric')}>{money(item.localAmount)}</td><td className={tableCellClass('numeric')}>{money(item.externalAmount)}</td></tr>
    <tr><th>结果／状态</th><td>{item.comparisonResultText || item.comparisonResult}</td><td>{item.channelStatusText || item.channelStatus || '—'}</td></tr>
    <tr><th>记账／渠道时间</th><td>{item.localPostedAt ? formatTime(item.localPostedAt) : '未形成成功资金事实'}</td><td>{item.channelOccurredAt ? formatTime(item.channelOccurredAt) : '—'}</td></tr>
    <tr><th>核查依据</th><td colSpan={2}>{item.resolution || '尚未提交例外说明'}</td></tr>
  </tbody></DataTable>
}
function MerchantQueue({ api, contextKey, taskId, authorities, header, current, refresh, onNotice }: Props & { header: ReactNode; current: boolean; refresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState<ReconciliationAction>()
  const rows = useQuery({ queryKey: ['payment-reconciliation-unallocated', contextKey, taskId, page], queryFn: () => api.billing.unallocatedReconciliationRows(taskId, page), retry: false })
  return <>
    <ListPage title="商户账单待归属" description="仅财务商户范围授权可见。无法找到可信原指令的流水不会自动挂到患者账单，也不能一键强制入账。" filters={<div className="payment-reconciliation-toolbar">{header}</div>}
      footer={rows.data && <Pagination label="商户待归属分页" page={page} totalPages={rows.data.totalPages} total={rows.data.totalElements} onChange={setPage} />}>
      {rows.isPending ? <LoadingState /> : rows.isError ? <Alert duration={null}>{errorMessage(rows.error)}</Alert> : !rows.data.content.length ? <EmptyState icon="billing" title="没有待归属账单行" copy="该结论仅针对最新已发布账单版本。" />
        : <DataTable aria-label="商户待归属流水"><thead><tr><th>账单行</th><th>商户支付／退款请求</th><th>交易类型</th><th className={tableCellClass('numeric')}>金额</th><th>处置状态</th><th>依据</th><th>操作</th></tr></thead><tbody>
          {rows.data.content.map(row => <tr key={row.id}><td>{row.lineNumber}</td><td>{row.refundRequestNo || row.merchantOrderNo || row.externalTransactionNo}</td><td>{row.transactionTypeText || row.transactionType}</td><td className={tableCellClass('numeric')}>{money(row.amount)}</td><td>{row.statusText || row.status}</td><td>{row.reason || '尚未核查'}</td><td><div className="payment-reconciliation-actions">
            <Button size="sm" variant="secondary" disabled={!current || row.status !== 'OPEN' || !reconPermission(authorities, 'HANDLE')} onClick={() => setAction({ kind: 'merchantPropose', row })}>提交例外依据</Button>
            <Button size="sm" disabled={!current || row.status !== 'REVIEW_PENDING' || !reconPermission(authorities, 'REVIEW')} onClick={() => setAction({ kind: 'merchantApprove', row })}>复核接受</Button>
            <Button size="sm" variant="secondary" disabled={!current || row.status !== 'REVIEW_PENDING' || !reconPermission(authorities, 'REVIEW')} onClick={() => setAction({ kind: 'merchantReject', row })}>退回</Button>
          </div></td></tr>)}</tbody></DataTable>}
    </ListPage>
    {action && <ReconciliationActionDialog api={api} action={action} current={current} onClose={() => setAction(undefined)} onCompleted={message => { setAction(undefined); onNotice(message); void refresh() }} />}
  </>
}
function EvidencePage({ api, taskId, authorities, header, data }: Props & { header: ReactNode; data: ReconciliationTaskDetail }) {
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const download = async (fileId: string) => {
    if (busy) return
    setBusy(true); setFailure('')
    try { const blob = await api.billing.exportReconciliationEvidence(taskId, fileId); if (live.current) saveReconciliationFile(blob, `支付账单证据-${data.task.businessDate}-${fileId}.zip`) }
    catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) setBusy(false) }
  }
  return <ListPage title="账单证据与执行尝试" description="保留原始文件密文、摘要和每次拉取结果。只有商户范围财务人员可导出完整原账单。" filters={<div className="payment-reconciliation-toolbar">{header}</div>} feedback={failure && <Alert duration={null}>{failure}</Alert>}>
    <div className="payment-reconciliation-evidence"><h2>账单原始证据</h2>
      {!data.files.length ? <p>尚未取得账单文件。</p> : <DataTable aria-label="账单证据版本"><thead><tr><th>版本</th><th>取得时间</th><th>文件摘要</th><th>操作</th></tr></thead><tbody>{data.files.map(file => <tr key={file.id}><td>尝试 {file.attempt}{file.latest ? ' · 最新发布' : file.validated ? ' · 历史发布' : ' · 未发布（查看尝试）'}</td><td>{formatTime(file.createdAt)}</td><td className="payment-reconciliation-digest"><code>{file.sha256}</code></td><td><Button variant="secondary" size="sm" disabled={busy || !reconPermission(authorities, 'EXPORT') || !reconPermission(authorities, 'MERCHANT_READ')} onClick={() => { void download(file.id) }}>导出原始证据</Button></td></tr>)}</tbody></DataTable>}
      <h2>最近执行尝试（最多 50 次）</h2>
      <DataTable aria-label="对账执行尝试"><thead><tr><th>尝试</th><th>状态</th><th>开始时间</th><th>完成时间</th><th>处理说明</th></tr></thead><tbody>{data.attempts.map(attempt => <tr key={attempt.attempt}><td>{attempt.attempt}</td><td>{attempt.statusText || attempt.status}</td><td>{formatTime(attempt.startedAt)}</td><td>{attempt.finishedAt ? formatTime(attempt.finishedAt) : '尚未结束'}</td><td>{attempt.errorMessage || (attempt.fileId ? '已保留原始证据，发布状态见证据列表' : '没有发布新结果')}</td></tr>)}</tbody></DataTable>
    </div>
  </ListPage>
}
