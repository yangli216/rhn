import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { GoodsReceipt, PurchaseOrder, StockBin, StockCount, StockItem, StockSite, StockTransfer } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, Select, StatusBadge } from '../../shared/ui'

export type OperationTab = 'purchase' | 'requisition' | 'transfer' | 'count'

const statusText: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '待审核', APPROVED: '已审核', PARTIALLY_RECEIVED: '部分入库',
  COMPLETED: '已完成', RECEIVED: '待验收', INSPECTING: '验收中', ACCEPTED: '验收合格',
  PARTIALLY_ACCEPTED: '部分合格', POSTED: '已记账', PICKING: '拣货中', ISSUED: '已出库',
  IN_TRANSIT: '在途', COUNTING: '盘点中', REJECTED: '已驳回', CANCELLED: '已取消',
}
const statusTone = (status: string): 'success' | 'danger' | 'info' => status === 'COMPLETED' || status === 'POSTED' || status === 'ISSUED'
  ? 'success' : status === 'REJECTED' || status === 'CANCELLED' ? 'danger' : 'info'

export function WarehouseOperations({ tab, api, site, sites, items, bins }: {
  tab: OperationTab; api: RhnApi; site: StockSite; sites: StockSite[]; items: StockItem[]; bins: StockBin[]
}) {
  if (tab === 'purchase') return <PurchaseWorkbench api={api} site={site} items={items} bins={bins} />
  if (tab === 'requisition') return <RequisitionWorkbench api={api} site={site} items={items} />
  if (tab === 'transfer') return <TransferWorkbench api={api} site={site} sites={sites} items={items} bins={bins} />
  return <CountWorkbench api={api} site={site} items={items} bins={bins} />
}

function Worklist({ title, copy, action, loading, empty, children }: {
  title: string; copy: string; action?: ReactNode; loading: boolean; empty: boolean; children: ReactNode
}) {
  return <section className="warehouse-section warehouse-operation">
    <header className="warehouse-section__toolbar"><div><strong>{title}</strong><span>{copy}</span></div>{action}</header>
    {loading ? <LoadingState label="正在加载作业单据…" /> : empty
      ? <EmptyState icon="pharmacy" title="暂无作业单据" copy="可从右上角发起新的业务单据。" /> : children}
  </section>
}

function PurchaseWorkbench({ api, site, items, bins }: { api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[] }) {
  const queryClient = useQueryClient(); const [dialog, setDialog] = useState<'supplier' | 'order' | 'receipt'>()
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder>()
  const [inspection, setInspection] = useState<GoodsReceipt>()
  const [traceReceipt, setTraceReceipt] = useState<GoodsReceipt>()
  const suppliers = useQuery({ queryKey: ['warehouse-suppliers', site.organizationId], queryFn: () => api.pharmacy.suppliers(site.organizationId) })
  const orders = useQuery({ queryKey: ['warehouse-purchase-orders', site.id], queryFn: () => api.pharmacy.purchaseOrders(site.id) })
  const receipts = useQuery({ queryKey: ['warehouse-goods-receipts', site.id], queryFn: () => api.pharmacy.goodsReceipts(site.id) })
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['warehouse-purchase-orders', site.id] }), queryClient.invalidateQueries({ queryKey: ['warehouse-goods-receipts', site.id] }), queryClient.invalidateQueries({ queryKey: ['warehouse-balances', site.id] })])
  const action = useMutation({ mutationFn: async ({ kind, value }: { kind: string; value: PurchaseOrder | GoodsReceipt }) => {
    if (kind === 'submit') return api.pharmacy.submitPurchaseOrder(value.id)
    if (kind === 'approve') return api.pharmacy.approvePurchaseOrder(value.id)
    return api.pharmacy.postGoodsReceipt(value.id)
  }, onSuccess: refresh })
  const error = suppliers.error || orders.error || receipts.error || action.error
  return <>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <Worklist title="采购与验收入库" copy="采购审批、到货逐批验收和整单原子入库" loading={orders.isPending || receipts.isPending}
      empty={!orders.data?.length && !receipts.data?.length} action={<div className="warehouse-operation-actions">
        <Button variant="secondary" size="sm" onClick={() => setDialog('supplier')}>供应商</Button>
        <Button size="sm" onClick={() => setDialog('order')}>新建采购单</Button></div>}>
      <OperationTable headers={['单据', '供应商 / 来源', '明细', '状态', '操作']}>
        {(orders.data ?? []).map(order => <tr key={order.id}><td><strong>{order.orderNo}</strong><small>{order.orderDate}</small></td>
          <td>{suppliers.data?.find(v => v.id === order.supplierId)?.name ?? order.supplierId}</td><td>{order.lines.length} 项</td>
          <td><StatusBadge tone={statusTone(order.status)}>{statusText[order.status] ?? order.status}</StatusBadge></td><td>
            {order.status === 'DRAFT' && <Button size="sm" variant="text" busy={action.isPending} onClick={() => action.mutate({ kind: 'submit', value: order })}>提交</Button>}
            {order.status === 'SUBMITTED' && <Button size="sm" variant="text" busy={action.isPending} onClick={() => action.mutate({ kind: 'approve', value: order })}>审核通过</Button>}
            {['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) && <Button size="sm" variant="text" onClick={() => { setSelectedOrder(order); setDialog('receipt') }}>登记到货</Button>}
          </td></tr>)}
        {(receipts.data ?? []).map(receipt => <tr key={receipt.id}><td><strong>{receipt.receiptNo}</strong><small>到货验收单</small></td>
          <td>{orders.data?.find(v => v.id === receipt.purchaseOrderId)?.orderNo ?? receipt.purchaseOrderId}</td><td>{receipt.lines.length} 批</td>
          <td><StatusBadge tone={statusTone(receipt.status)}>{statusText[receipt.status] ?? receipt.status}</StatusBadge></td><td>
            {receipt.status === 'RECEIVED' && <Button size="sm" variant="text" onClick={() => setInspection(receipt)}>逐批验收</Button>}
            {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && receipt.lines.some(line =>
              items.find(item => item.id === line.stockItemId)?.traceRequired && Number(line.acceptedQuantity) > 0)
              && <Button size="sm" variant="text" onClick={() => setTraceReceipt(receipt)}>登记追溯码</Button>}
            {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && <Button size="sm" variant="text" busy={action.isPending}
              onClick={() => action.mutate({ kind: 'post', value: receipt })}>批量入库</Button>}
          </td></tr>)}
      </OperationTable>
    </Worklist>
    {dialog === 'supplier' && <SupplierDialog api={api} site={site} onClose={() => setDialog(undefined)} onDone={() => { void queryClient.invalidateQueries({ queryKey: ['warehouse-suppliers', site.organizationId] }); setDialog(undefined) }} />}
    {dialog === 'order' && <PurchaseDialog api={api} site={site} suppliers={suppliers.data ?? []} items={items} onClose={() => setDialog(undefined)} onDone={() => { void refresh(); setDialog(undefined) }} />}
    {dialog === 'receipt' && selectedOrder && <GoodsReceiptDialog api={api} order={selectedOrder} items={items} bins={bins} onClose={() => setDialog(undefined)} onDone={() => { void refresh(); setDialog(undefined) }} />}
    {inspection && <GoodsInspectionDialog api={api} receipt={inspection} items={items} onClose={() => setInspection(undefined)} onDone={() => { void refresh(); setInspection(undefined) }} />}
    {traceReceipt && <TraceRegistrationDialog api={api} receipt={traceReceipt} items={items}
      onClose={() => setTraceReceipt(undefined)} onDone={() => { void refresh(); setTraceReceipt(undefined) }} />}
  </>
}

function RequisitionWorkbench({ api, site, items }: { api: RhnApi; site: StockSite; items: StockItem[] }) {
  const client = useQueryClient(); const [open, setOpen] = useState(false)
  const values = useQuery({ queryKey: ['warehouse-requisitions', site.id], queryFn: () => api.pharmacy.requisitions(site.id) })
  const refresh = () => client.invalidateQueries({ queryKey: ['warehouse-requisitions', site.id] })
  const action = useMutation({ mutationFn: async ({ id, status, lines }: { id: string; status: string; lines: Array<{ id: string; requestedQuantity: number }> }) => {
    if (status === 'DRAFT') return api.pharmacy.submitRequisition(id)
    if (status === 'SUBMITTED') return api.pharmacy.approveRequisition(id, lines.map(v => ({ requisitionLineId: v.id, approvedQuantity: v.requestedQuantity })))
    if (status === 'APPROVED') return api.pharmacy.pickRequisition(id)
    return api.pharmacy.issueRequisition(id)
  }, onSuccess: refresh })
  return <>{Boolean(values.error || action.error) && <Alert>{errorMessage(values.error || action.error)}</Alert>}
    <Worklist title="科室请领" copy="申请、审核、按效期自动拣货并出库" loading={values.isPending} empty={!values.data?.length}
      action={<Button size="sm" onClick={() => setOpen(true)}>新建请领单</Button>}>
      <OperationTable headers={['请领单', '用途', '明细', '状态', '操作']}>{(values.data ?? []).map(value => <tr key={value.id}>
        <td><strong>{value.requisitionNo}</strong><small>{formatTime(value.requestedAt)}</small></td><td>{value.reason || '日常领用'}</td>
        <td>{value.lines.length} 项 / {value.lines.reduce((n, row) => n + row.requestedQuantity, 0)} 基本单位</td>
        <td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
          {['DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending}
            onClick={() => action.mutate({ id: value.id, status: value.status, lines: value.lines })}>{({ DRAFT: '提交', SUBMITTED: '审核通过', APPROVED: '开始拣货', PICKING: '确认出库' } as Record<string, string>)[value.status]}</Button>}
        </td></tr>)}</OperationTable>
    </Worklist>
    {open && <MultiItemDialog title="新建科室请领" submitText="创建请领单" items={items} quantityLabel="请领数量（基本单位）" onClose={() => setOpen(false)} onSubmit={async (reason, rows) => {
      await api.pharmacy.createRequisition({ sourceSiteId: site.id, requestCode: `REQ-${crypto.randomUUID()}`, reason, lines: rows.map(row => ({ stockItemId: row.item.id, requestedQuantity: row.quantity })) }); await refresh(); setOpen(false)
    }} />}
  </>
}

function TransferWorkbench({ api, site, sites, items, bins }: { api: RhnApi; site: StockSite; sites: StockSite[]; items: StockItem[]; bins: StockBin[] }) {
  const client = useQueryClient(); const [open, setOpen] = useState(false); const [receiving, setReceiving] = useState<StockTransfer>()
  const source = useQuery({ queryKey: ['warehouse-transfers', site.id, 'SOURCE'], queryFn: () => api.pharmacy.transfers(site.id, 'SOURCE') })
  const incoming = useQuery({ queryKey: ['warehouse-transfers', site.id, 'DESTINATION'], queryFn: () => api.pharmacy.transfers(site.id, 'DESTINATION') })
  const refresh = () => Promise.all(['SOURCE', 'DESTINATION'].map(role => client.invalidateQueries({ queryKey: ['warehouse-transfers', site.id, role] })))
  const action = useMutation({ mutationFn: async (value: StockTransfer) => {
    if (value.status === 'DRAFT') return api.pharmacy.submitTransfer(value.id)
    if (value.status === 'SUBMITTED') return api.pharmacy.approveTransfer(value.id, value.lines.map(v => ({ transferLineId: v.id, approvedQuantity: v.requestedQuantity })))
    if (value.status === 'APPROVED') return api.pharmacy.pickTransfer(value.id)
    if (value.status === 'PICKING') return api.pharmacy.dispatchTransfer(value.id)
    throw new Error('请在调入确认界面完成逐批核对')
  }, onSuccess: refresh })
  const rows = [...(source.data ?? []), ...(incoming.data ?? []).filter(v => !source.data?.some(s => s.id === v.id))]
  return <>{Boolean(source.error || incoming.error || action.error) && <Alert>{errorMessage(source.error || incoming.error || action.error)}</Alert>}
    <Worklist title="库间调拨" copy="调出记账、在途跟踪和调入确认分离" loading={source.isPending || incoming.isPending} empty={!rows.length}
      action={<Button size="sm" onClick={() => setOpen(true)}>新建调拨单</Button>}>
      <OperationTable headers={['调拨单', '方向', '明细', '状态', '操作']}>{rows.map(value => { const inbound = value.destinationSiteId === site.id
        return <tr key={value.id}><td><strong>{value.transferNo}</strong><small>{formatTime(value.requestedAt)}</small></td>
          <td>{inbound ? `调入 · ${sites.find(v => v.id === value.sourceSiteId)?.name ?? '来源库'}` : `调出 · ${sites.find(v => v.id === value.destinationSiteId)?.name ?? '目标库'}`}</td>
          <td>{value.lines.length} 项</td><td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
            {inbound && value.status === 'IN_TRANSIT' && <Button variant="text" size="sm" onClick={() => setReceiving(value)}>调入确认</Button>}
            {!inbound && ['DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending} onClick={() => action.mutate(value)}>{({ DRAFT: '提交', SUBMITTED: '审核', APPROVED: '拣货', PICKING: '确认调出' } as Record<string, string>)[value.status]}</Button>}
          </td></tr>})}</OperationTable>
    </Worklist>
    {open && <TransferDialog api={api} site={site} sites={sites} items={items} onClose={() => setOpen(false)} onDone={() => { void refresh(); setOpen(false) }} />}
    {receiving && <TransferReceiveDialog api={api} value={receiving} items={items} bins={bins} onClose={() => setReceiving(undefined)} onDone={() => { void refresh(); setReceiving(undefined) }} />}
  </>
}

function CountWorkbench({ api, site, items, bins }: { api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[] }) {
  const client = useQueryClient(); const [recording, setRecording] = useState<StockCount>(); const [open, setOpen] = useState(false)
  const values = useQuery({ queryKey: ['warehouse-counts', site.id], queryFn: () => api.pharmacy.stockCounts(site.id) })
  const refresh = () => client.invalidateQueries({ queryKey: ['warehouse-counts', site.id] })
  const action = useMutation({ mutationFn: async (value: StockCount) => {
    if (value.status === 'DRAFT') return api.pharmacy.startStockCount(value.id)
    if (value.status === 'SUBMITTED') return api.pharmacy.approveStockCount(value.id)
    return api.pharmacy.postStockCount(value.id)
  }, onSuccess: refresh })
  return <>{Boolean(values.error || action.error) && <Alert>{errorMessage(values.error || action.error)}</Alert>}
    <Worklist title="库存盘点" copy="冻结快照、差异复核和盈亏调整记账" loading={values.isPending} empty={!values.data?.length}
      action={<Button size="sm" onClick={() => setOpen(true)}>新建盘点</Button>}>
      <OperationTable headers={['盘点单', '范围', '差异', '状态', '操作']}>{(values.data ?? []).map(value => <tr key={value.id}>
        <td><strong>{value.countNo}</strong><small>{formatTime(value.snapshotAt)}</small></td><td>{value.stockBinId ? bins.find(v => v.id === value.stockBinId)?.name : '全库盘点'}</td>
        <td>{value.lines.filter(v => v.varianceQuantity).length} / {value.lines.length}</td><td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
          {value.status === 'COUNTING' ? <Button variant="text" size="sm" onClick={() => setRecording(value)}>录入实盘</Button>
            : ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending} onClick={() => action.mutate(value)}>{({ DRAFT: '开始盘点', SUBMITTED: '审核通过', APPROVED: '盈亏调整' } as Record<string, string>)[value.status]}</Button>}
        </td></tr>)}</OperationTable>
    </Worklist>
    {open && <CountCreateDialog api={api} site={site} bins={bins} onClose={() => setOpen(false)} onDone={() => { void refresh(); setOpen(false) }} />}
    {recording && <CountRecordDialog api={api} value={recording} items={items} bins={bins} onClose={() => setRecording(undefined)} onDone={() => { void refresh(); setRecording(undefined) }} />}
  </>
}

function OperationTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-operation-table"><thead><tr>{headers.map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

function SupplierDialog({ api, site, onClose, onDone }: { api: RhnApi; site: StockSite; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [licenseNo, setLicenseNo] = useState(''); const [validTo, setValidTo] = useState('');
  const mutation = useMutation({ mutationFn: () => api.pharmacy.createSupplier({ organizationId: site.organizationId, code, name, licenseNo: licenseNo || undefined, licenseValidTo: validTo || undefined }), onSuccess: onDone })
  return <Dialog title="新建供应商" eyebrow="采购基础" size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!code.trim() || !name.trim()} onClick={() => mutation.mutate()}>保存供应商</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}<div className="warehouse-form-grid"><FormField label="供应商编码" required><input className="ui-field__control" value={code} onChange={e => setCode(e.target.value)} /></FormField><FormField label="供应商名称" required><input className="ui-field__control" value={name} onChange={e => setName(e.target.value)} /></FormField><FormField label="许可证号"><input className="ui-field__control" value={licenseNo} onChange={e => setLicenseNo(e.target.value)} /></FormField><FormField label="资质有效期"><input className="ui-field__control" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} /></FormField></div>
  </Dialog>
}

type ItemRow = { item: StockItem; quantity: number; price: number }
function MultiItemDialog({ title, submitText, items, quantityLabel, withPrice = false, lead, emptyCopy = '当前没有可选经营项目。', onClose, onSubmit }: { title: string; submitText: string; items: StockItem[]; quantityLabel: string; withPrice?: boolean; lead?: ReactNode; emptyCopy?: string; onClose: () => void; onSubmit: (reason: string, rows: ItemRow[]) => Promise<void> }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({}); const [quantity, setQuantity] = useState<Record<string, string>>({}); const [price, setPrice] = useState<Record<string, string>>({}); const [reason, setReason] = useState(''); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false)
  const rows = items.filter(v => selected[v.id]).map(item => ({ item, quantity: Number(quantity[item.id]), price: Number(price[item.id] || 0) })).filter(v => v.quantity > 0 && (!withPrice || v.price >= 0))
  return <Dialog title={title} eyebrow="批量业务" size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy} disabled={!rows.length} onClick={async () => { setBusy(true); setError(undefined); try { await onSubmit(reason, rows) } catch (e) { setError(e) } finally { setBusy(false) } }}>{submitText}</Button></>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}{lead}<FormField label="用途说明"><input className="ui-field__control" value={reason} onChange={e => setReason(e.target.value)} placeholder="填写本次业务用途" /></FormField>
    <div className="warehouse-batch-table-wrap"><table className="warehouse-table warehouse-batch-table"><thead><tr><th>选择</th><th>药品</th><th>包装</th><th>{quantityLabel}</th>{withPrice && <th>采购单价</th>}</tr></thead><tbody>{!items.length && <tr><td className="warehouse-batch-empty" colSpan={withPrice ? 5 : 4}>{emptyCopy}</td></tr>}{items.map(item => <tr key={item.id} className={selected[item.id] ? 'is-selected' : ''}><td><input type="checkbox" checked={Boolean(selected[item.id])} onChange={e => setSelected(v => ({ ...v, [item.id]: e.target.checked }))} /></td><td><strong>{item.productName}</strong><code>{item.productCode}</code></td><td>{item.packageSpec || item.packageUnitName}</td><td><input className="ui-field__control" type="number" min="0" value={quantity[item.id] ?? ''} onChange={e => setQuantity(v => ({ ...v, [item.id]: e.target.value }))} /></td>{withPrice && <td><input className="ui-field__control" type="number" min="0" value={price[item.id] ?? ''} onChange={e => setPrice(v => ({ ...v, [item.id]: e.target.value }))} /></td>}</tr>)}</tbody></table></div>
  </Dialog>
}

function PurchaseDialog({ api, site, suppliers, items, onClose, onDone }: { api: RhnApi; site: StockSite; suppliers: Awaited<ReturnType<RhnApi['pharmacy']['suppliers']>>; items: StockItem[]; onClose: () => void; onDone: () => void }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  if (!suppliers.length) return <Dialog title="新建采购单" eyebrow="采购作业" onClose={onClose}><EmptyState icon="pharmacy" title="请先维护供应商" copy="关闭后点击“供应商”新增有效供应商，再创建采购单。" /></Dialog>
  return <MultiItemDialog title="新建采购单" submitText="创建采购单" items={items} quantityLabel="采购数量（包装）" withPrice
    lead={<FormField label="供应商" required><Select value={supplierId} onChange={setSupplierId} clearable={false} showValue options={suppliers.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>}
    onClose={onClose} onSubmit={async (description, rows) => {
    for (const row of rows) { try { await api.pharmacy.addSupplierItem(supplierId, { catalogItemId: row.item.catalogItemId, packageId: row.item.packageId, agreementPrice: row.price }) } catch (error) { if ((error as { code?: string }).code !== 'SUPPLIER_ITEM_DUPLICATE') throw error } }
    await api.pharmacy.createPurchaseOrder({ stockSiteId: site.id, supplierId, requestCode: `PO-${crypto.randomUUID()}`, description, lines: rows.map(row => ({ stockItemId: row.item.id, packageId: row.item.packageId, orderedQuantity: row.quantity, unitPrice: row.price })) }); onDone()
  }} />
}

function GoodsReceiptDialog({ api, order, items, bins, onClose, onDone }: { api: RhnApi; order: PurchaseOrder; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const bin = bins.find(v => v.active && v.receiveAllowed); const [lots, setLots] = useState<Record<string, string>>({}); const [quantities, setQuantities] = useState<Record<string, string>>({}); const mutation = useMutation({ mutationFn: () => api.pharmacy.createGoodsReceipt({ purchaseOrderId: order.id, requestCode: `GR-${crypto.randomUUID()}`, lines: order.lines.filter(v => Number(quantities[v.id]) > 0).map(line => ({ purchaseOrderLineId: line.id, destinationBinId: bin!.id, lotNo: lots[line.id], deliveredQuantity: Number(quantities[line.id]), unitCost: line.unitPrice })) }), onSuccess: onDone })
  return <Dialog title="批量登记到货" eyebrow={order.orderNo} size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!bin || !order.lines.some(v => Number(quantities[v.id]) > 0 && lots[v.id])} onClick={() => mutation.mutate()}>登记到货</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}{!bin && <Alert>当前库房没有允许收货的货位。</Alert>}<OperationTable headers={['药品', '剩余可到货', '本次到货', '批号']}>{order.lines.filter(v => v.remainingQuantity > 0).map(line => <tr key={line.id}><td>{items.find(v => v.id === line.stockItemId)?.productName ?? line.stockItemId}</td><td>{line.remainingQuantity}</td><td><input className="ui-field__control" type="number" min="0" max={line.remainingQuantity} value={quantities[line.id] ?? ''} onChange={e => setQuantities(v => ({ ...v, [line.id]: e.target.value }))} /></td><td><input className="ui-field__control" value={lots[line.id] ?? ''} onChange={e => setLots(v => ({ ...v, [line.id]: e.target.value }))} /></td></tr>)}</OperationTable>
  </Dialog>
}

function GoodsInspectionDialog({ api, receipt, items, onClose, onDone }: { api: RhnApi; receipt: GoodsReceipt; items: StockItem[]; onClose: () => void; onDone: () => void }) {
  const [accepted, setAccepted] = useState<Record<string, string>>(Object.fromEntries(receipt.lines.map(line => [line.id, String(line.deliveredQuantity)])))
  const [rejected, setRejected] = useState<Record<string, string>>(Object.fromEntries(receipt.lines.map(line => [line.id, '0'])))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: () => api.pharmacy.inspectGoodsReceipt(receipt.id, receipt.lines.map(line => ({
      goodsReceiptLineId: line.id,
      acceptedQuantity: Number(accepted[line.id]),
      rejectedQuantity: Number(rejected[line.id]),
      rejectionReason: Number(rejected[line.id]) > 0 ? reasons[line.id]?.trim() : undefined,
    }))),
    onSuccess: onDone,
  })
  const valid = receipt.lines.every(line => {
    const acceptedQuantity = Number(accepted[line.id]); const rejectedQuantity = Number(rejected[line.id])
    return acceptedQuantity >= 0 && rejectedQuantity >= 0 && acceptedQuantity + rejectedQuantity === line.deliveredQuantity
      && (rejectedQuantity === 0 || Boolean(reasons[line.id]?.trim()))
  })
  return <Dialog title="逐批到货验收" eyebrow={receipt.receiptNo} size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>确认验收结果</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    <Alert>每批“合格数 + 不合格数”必须等于到货数；存在不合格数量时必须填写原因。</Alert>
    <OperationTable headers={['药品 / 批号', '到货数', '合格数', '不合格数', '不合格原因']}>
      {receipt.lines.map(line => <tr key={line.id}><td><strong>{items.find(v => v.id === line.stockItemId)?.productName ?? line.stockItemId}</strong><small>{line.lotNo}</small></td><td>{line.deliveredQuantity}</td>
        <td><input aria-label={`${line.lotNo}合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={accepted[line.id]} onChange={e => setAccepted(v => ({ ...v, [line.id]: e.target.value }))} /></td>
        <td><input aria-label={`${line.lotNo}不合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={rejected[line.id]} onChange={e => setRejected(v => ({ ...v, [line.id]: e.target.value }))} /></td>
        <td><input aria-label={`${line.lotNo}不合格原因`} className="ui-field__control" disabled={Number(rejected[line.id]) === 0} value={reasons[line.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [line.id]: e.target.value }))} placeholder="存在不合格时必填" /></td></tr>)}
    </OperationTable>
  </Dialog>
}

function TraceRegistrationDialog({ api, receipt, items, onClose, onDone }: {
  api: RhnApi; receipt: GoodsReceipt; items: StockItem[]; onClose: () => void; onDone: () => void
}) {
  const traceLines = receipt.lines.filter(line => items.find(item => item.id === line.stockItemId)?.traceRequired
    && Number(line.acceptedQuantity) > 0)
  const [values, setValues] = useState<Record<string, string>>({})
  const parsed = (lineId: string) => (values[lineId] ?? '').split(/[\n,，;；]+/)
    .map(value => value.trim()).filter(Boolean)
  const valid = traceLines.length > 0 && traceLines.every(line => Number.isInteger(Number(line.acceptedQuantity))
    && parsed(line.id).length === Number(line.acceptedQuantity))
  const mutation = useMutation({
    mutationFn: () => api.pharmacy.registerReceiptTraceCodes(receipt.id, traceLines.map(line => ({
      goodsReceiptLineId: line.id, traceCodes: parsed(line.id),
    }))),
    onSuccess: onDone,
  })
  return <Dialog title="批量登记追溯码" eyebrow={receipt.receiptNo} size="wide"
    description="每个最小追溯包装登记一个码；支持扫码枪连续换行录入，也可用逗号或分号粘贴批量导入。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>保存追溯码</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    <div className="warehouse-trace-entry-list">{traceLines.map(line => {
      const item = items.find(value => value.id === line.stockItemId); const count = parsed(line.id).length
      const expected = Number(line.acceptedQuantity)
      return <section key={line.id} className={count === expected ? 'is-complete' : ''}>
        <header><div><strong>{item?.productName ?? line.stockItemId}</strong>
          <span>{item?.productCode} · 批号 {line.lotNo}</span></div>
          <b>{count} / {expected} 码</b></header>
        <textarea className="ui-field__control" autoFocus={line === traceLines[0]}
          aria-label={`${item?.productName ?? line.stockItemId}追溯码`}
          value={values[line.id] ?? ''} onChange={event => setValues(current => ({ ...current, [line.id]: event.target.value }))}
          placeholder={`请扫描或粘贴 ${expected} 个追溯码，每行一个`} />
        {count !== expected && <small>还需录入 {Math.max(0, expected - count)} 个；多录 {Math.max(0, count - expected)} 个</small>}
      </section>
    })}</div>
  </Dialog>
}

function TransferDialog({ api, site, sites, items, onClose, onDone }: { api: RhnApi; site: StockSite; sites: StockSite[]; items: StockItem[]; onClose: () => void; onDone: () => void }) {
  const destinations = sites.filter(v => v.id !== site.id && v.active); const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? '')
  const destinationItems = useQuery({ queryKey: ['pharmacy-stock-items', destinationId], queryFn: () => api.pharmacy.stockItems(destinationId), enabled: Boolean(destinationId) })
  if (!destinations.length) return <Dialog title="新建库间调拨" eyebrow="调拨作业" onClose={onClose}>
    <EmptyState icon="pharmacy" title="暂无可调入库房" copy="请先在组织与人员中将目标科室启用为库存站点，再为其配置经营项目和收货货位。" />
  </Dialog>
  return <MultiItemDialog title="新建库间调拨" submitText="创建调拨单" items={items.filter(item => destinationItems.data?.some(d => d.catalogItemId === item.catalogItemId && d.packageId === item.packageId))} quantityLabel="调拨数量（基本单位）" emptyCopy="调入站点尚未配置与本库匹配的经营项目，请先在目标科室完成批量调入。"
    lead={<FormField label="调入站点" required><Select value={destinationId} onChange={setDestinationId} clearable={false} showValue options={destinations.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>}
    onClose={onClose} onSubmit={async (reason, rows) => {
    await api.pharmacy.createTransfer({ sourceSiteId: site.id, destinationSiteId: destinationId, requestCode: `TR-${crypto.randomUUID()}`, reason, lines: rows.map(row => ({ sourceStockItemId: row.item.id, destinationStockItemId: destinationItems.data!.find(d => d.catalogItemId === row.item.catalogItemId && d.packageId === row.item.packageId)!.id, requestedQuantity: row.quantity })) }); onDone()
  }} />
}

function TransferReceiveDialog({ api, value, items, bins, onClose, onDone }: { api: RhnApi; value: StockTransfer; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const allocations = value.lines.flatMap(line => line.allocations.map(allocation => ({ line, allocation })))
  const receiveBins = bins.filter(bin => bin.active && bin.receiveAllowed)
  const [binIds, setBinIds] = useState<Record<string, string>>(Object.fromEntries(allocations.map(({ allocation }) => [allocation.id, receiveBins[0]?.id ?? ''])))
  const [received, setReceived] = useState<Record<string, string>>(Object.fromEntries(allocations.map(({ allocation }) => [allocation.id, String(allocation.dispatchedQuantity)])))
  const [damaged, setDamaged] = useState<Record<string, string>>(Object.fromEntries(allocations.map(({ allocation }) => [allocation.id, '0'])))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: () => api.pharmacy.receiveTransfer(value.id, { allocations: allocations.map(({ allocation }) => ({
      transferAllocationId: allocation.id,
      destinationBinId: binIds[allocation.id],
      receivedQuantity: Number(received[allocation.id]),
      damagedQuantity: Number(damaged[allocation.id]),
      discrepancyReason: Number(damaged[allocation.id]) > 0 ? reasons[allocation.id]?.trim() : undefined,
    })) }),
    onSuccess: onDone,
  })
  const valid = allocations.length > 0 && allocations.every(({ allocation }) => {
    const receivedQuantity = Number(received[allocation.id]); const damagedQuantity = Number(damaged[allocation.id])
    return Boolean(binIds[allocation.id]) && receivedQuantity >= 0 && damagedQuantity >= 0
      && receivedQuantity + damagedQuantity === allocation.dispatchedQuantity
      && (damagedQuantity === 0 || Boolean(reasons[allocation.id]?.trim()))
  })
  return <Dialog title="逐批调入确认" eyebrow={value.transferNo} size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>确认调入</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}{!receiveBins.length && <Alert>当前库房没有允许收货的货位，请先维护货位。</Alert>}
    <OperationTable headers={['药品 / 批次', '调出数', '正常入库', '破损入库', '目标货位', '差异原因']}>
      {allocations.map(({ line, allocation }) => <tr key={allocation.id}><td><strong>{items.find(v => v.id === line.destinationStockItemId)?.productName ?? line.destinationStockItemId}</strong><small>{allocation.stockLotId}</small></td><td>{allocation.dispatchedQuantity}</td>
        <td><input aria-label="正常调入数" className="ui-field__control" type="number" min="0" max={allocation.dispatchedQuantity} value={received[allocation.id]} onChange={e => setReceived(v => ({ ...v, [allocation.id]: e.target.value }))} /></td>
        <td><input aria-label="破损调入数" className="ui-field__control" type="number" min="0" max={allocation.dispatchedQuantity} value={damaged[allocation.id]} onChange={e => setDamaged(v => ({ ...v, [allocation.id]: e.target.value }))} /></td>
        <td><Select value={binIds[allocation.id]} onChange={id => setBinIds(v => ({ ...v, [allocation.id]: id }))} clearable={false} options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} /></td>
        <td><input aria-label="调入差异原因" className="ui-field__control" disabled={Number(damaged[allocation.id]) === 0} value={reasons[allocation.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [allocation.id]: e.target.value }))} placeholder="破损时必填" /></td></tr>)}
    </OperationTable>
  </Dialog>
}

function CountCreateDialog({ api, site, bins, onClose, onDone }: { api: RhnApi; site: StockSite; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<'FULL' | 'BIN'>('FULL'); const [binId, setBinId] = useState(''); const mutation = useMutation({ mutationFn: () => api.pharmacy.createStockCount({ stockSiteId: site.id, stockBinId: type === 'BIN' ? binId : undefined, requestCode: `CT-${crypto.randomUUID()}`, countType: type, reason: '日常库存盘点' }), onSuccess: onDone })
  return <Dialog title="新建盘点" eyebrow="库存盘点" size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={type === 'BIN' && !binId} onClick={() => mutation.mutate()}>创建盘点</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}<div className="warehouse-form-grid"><FormField label="盘点范围" required><Select value={type} onChange={v => setType(v as 'FULL' | 'BIN')} clearable={false} options={[{ value: 'FULL', label: '全库盘点' }, { value: 'BIN', label: '按货位盘点' }]} /></FormField>{type === 'BIN' && <FormField label="盘点货位" required><Select value={binId} onChange={setBinId} clearable={false} options={bins.filter(v => v.active && v.countAllowed).map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>}</div>
  </Dialog>
}

function CountRecordDialog({ api, value, items, bins, onClose, onDone }: { api: RhnApi; value: StockCount; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<Record<string, string>>(Object.fromEntries(value.lines.map(v => [v.id, String(v.bookQuantity)]))); const [reasons, setReasons] = useState<Record<string, string>>({}); const mutation = useMutation({ mutationFn: async () => { await api.pharmacy.recordStockCount(value.id, value.lines.map(line => ({ countLineId: line.id, countedQuantity: Number(counts[line.id]), varianceReason: Number(counts[line.id]) === line.bookQuantity ? undefined : reasons[line.id] }))); return api.pharmacy.submitStockCount(value.id) }, onSuccess: onDone })
  const valid = value.lines.every(line => Number(counts[line.id]) >= 0 && (Number(counts[line.id]) === line.bookQuantity || reasons[line.id]?.trim()))
  return <Dialog title="录入实盘数量" eyebrow={value.countNo} size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>保存并提交审核</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}<OperationTable headers={['药品 / 库位', '账面数量', '实盘数量', '差异原因']}>{value.lines.map(line => <tr key={line.id}><td><strong>{items.find(item => item.id === line.stockItemId)?.productName ?? line.stockItemId}</strong><small>{bins.find(bin => bin.id === line.stockBinId)?.code ?? line.stockBinId} · 批次 …{line.stockLotId.slice(-6)}</small></td><td>{line.bookQuantity}</td><td><input aria-label={`${line.id}实盘数量`} className="ui-field__control" type="number" min="0" value={counts[line.id]} onChange={e => setCounts(v => ({ ...v, [line.id]: e.target.value }))} /></td><td><input aria-label={`${line.id}差异原因`} className="ui-field__control" disabled={Number(counts[line.id]) === line.bookQuantity} value={reasons[line.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [line.id]: e.target.value }))} placeholder="有差异时必填" /></td></tr>)}</OperationTable>
  </Dialog>
}

function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
