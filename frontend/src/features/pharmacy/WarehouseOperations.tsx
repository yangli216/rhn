import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GoodsReceipt, PurchaseOrder, Requisition, StockBin, StockCount, StockItem, StockSite, StockTransfer } from '../../shared/api'
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
const stockStatusText: Record<string, string> = {
  AVAILABLE: '可用', PENDING: '待验', QUARANTINE: '隔离', DAMAGED: '破损', EXPIRED: '过期',
}
const statusTone = (status: string): 'success' | 'danger' | 'info' => status === 'COMPLETED' || status === 'POSTED' || status === 'ISSUED'
  ? 'success' : status === 'REJECTED' || status === 'CANCELLED' ? 'danger' : 'info'
const supplierEffective = (value: Awaited<ReturnType<RhnApi['pharmacy']['suppliers']>>[number]) => {
  const date = new Date().toISOString().slice(0, 10)
  return value.status === 'ACTIVE' && value.validFrom <= date && (!value.validTo || value.validTo >= date)
    && (!value.licenseValidTo || value.licenseValidTo >= date)
}

export function WarehouseOperations({ tab, api, site, sites, items, bins, onNavigate, isOperator = true }: {
  tab: OperationTab; api: RhnApi; site: StockSite; sites: StockSite[]; items: StockItem[]; bins: StockBin[]
  onNavigate: (path: string) => void
  isOperator?: boolean
}) {
  if (tab === 'purchase') return <PurchaseWorkbench api={api} site={site} items={items} bins={bins} onNavigate={onNavigate} isOperator={isOperator} />
  if (tab === 'requisition') return <RequisitionWorkbench api={api} site={site} items={items} isOperator={isOperator} />
  if (tab === 'transfer') return <TransferWorkbench api={api} site={site} sites={sites} items={items} bins={bins} isOperator={isOperator} />
  return <CountWorkbench api={api} site={site} items={items} bins={bins} isOperator={isOperator} />
}

function Worklist({ title, action, loading, empty, children }: {
  title: string; copy?: string; action?: ReactNode; loading: boolean; empty: boolean; children: ReactNode
}) {
  return <section className="warehouse-section warehouse-operation">
    <header className="warehouse-section__toolbar"><strong>{title}</strong>{action}</header>
    {loading ? <LoadingState label="正在加载作业单据…" /> : empty
      ? <EmptyState icon="pharmacy" title="暂无作业单据" copy="可从右上角发起新的业务单据。" /> : children}
  </section>
}

function PurchaseWorkbench({ api, site, items, bins, onNavigate, isOperator = true }: {
  api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[]; onNavigate: (path: string) => void
  isOperator?: boolean
}) {
  const queryClient = useQueryClient(); const [dialog, setDialog] = useState<'order' | 'receipt'>()
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
    {site.siteType === 'PHARMACY' && <div className="warehouse-scenario-banner">
      <span className="warehouse-scenario-banner__icon">💡</span>
      <div>
        <strong>药房业务指引</strong>
        <span>门诊/住院等调剂药房日常药品补货主要通过【库间调拨】从中心药库调入；若有中药饮片、急救抢救药或特殊专病药品直采需求，亦可在此向供应商建单采购与到货验收。</span>
      </div>
    </div>}
    <Worklist title="采购与验收入库" copy="采购审批、到货逐批验收和整单原子入库" loading={orders.isPending || receipts.isPending}
      empty={!orders.data?.length && !receipts.data?.length} action={<div className="warehouse-operation-actions">
        <Button variant="secondary" size="sm" onClick={() => onNavigate('/settings/partners?tab=suppliers')}>供应商档案</Button>
        <Button size="sm" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => setDialog('order')}>新建采购单</Button></div>}>
      <div className="warehouse-document-groups">
        <section><header className="warehouse-subsection-title"><div><strong>采购单</strong><span>审批与到货进度</span></div>
          <StatusBadge tone="info">{orders.data?.length ?? 0} 单</StatusBadge></header>
          <OperationTable headers={['采购单 / 下单日', '供应商', '预计到货', '金额 / 到货进度', '状态', '操作']}>
            {(orders.data ?? []).map(order => {
              const ordered = order.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0)
              const received = order.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0)
              const amount = order.lines.reduce((sum, line) => sum + Number(line.orderedQuantity) * Number(line.unitPrice), 0)
              return <tr key={order.id}><td><strong>{order.orderNo}</strong><small>{order.orderDate}</small></td>
                <td>{suppliers.data?.find(v => v.id === order.supplierId)?.name ?? order.supplierId}</td>
                <td>{order.expectedDate ?? '未约定'}</td><td><strong>{formatMoney(amount)}</strong>
                  <small>已到 {formatQuantity(received)} / {formatQuantity(ordered)} 包装</small></td>
                <td><StatusBadge tone={statusTone(order.status)}>{statusText[order.status] ?? order.status}</StatusBadge></td><td>
                  {order.status === 'DRAFT' && <Button size="sm" variant="text" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate({ kind: 'submit', value: order })}>提交</Button>}
                  {order.status === 'SUBMITTED' && <Button size="sm" variant="text" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate({ kind: 'approve', value: order })}>审核通过</Button>}
                  {['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) && <Button size="sm" variant="text" disabled={!isOperator} onClick={() => { setSelectedOrder(order); setDialog('receipt') }}>登记到货</Button>}
                </td></tr>
            })}
          </OperationTable></section>
        <section><header className="warehouse-subsection-title"><div><strong>到货验收单</strong><span>送货凭证、逐批质量验收与入库</span></div>
          <StatusBadge tone="info">{receipts.data?.length ?? 0} 单</StatusBadge></header>
          <OperationTable headers={['验收单 / 到货时间', '送货单号', '来源采购单', '批次 / 数量', '状态', '操作']}>
            {(receipts.data ?? []).map(receipt => <tr key={receipt.id}><td><strong>{receipt.receiptNo}</strong><small>{formatTime(receipt.receivedAt)}</small></td>
              <td>{receipt.deliveryNoteNo || '未填写'}</td>
              <td>{orders.data?.find(v => v.id === receipt.purchaseOrderId)?.orderNo ?? receipt.purchaseOrderId}</td>
              <td>{receipt.lines.length} 批<small>到货 {formatQuantity(receipt.lines.reduce((sum, line) => sum + Number(line.deliveredQuantity), 0))}</small></td>
              <td><StatusBadge tone={statusTone(receipt.status)}>{statusText[receipt.status] ?? receipt.status}</StatusBadge></td><td>
                {receipt.status === 'RECEIVED' && <Button size="sm" variant="text" disabled={!isOperator} onClick={() => setInspection(receipt)}>逐批验收</Button>}
                {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && receipt.lines.some(line =>
                  items.find(item => item.id === line.stockItemId)?.traceRequired && Number(line.acceptedQuantity) > 0)
                  && <Button size="sm" variant="text" disabled={!isOperator} onClick={() => setTraceReceipt(receipt)}>登记追溯码</Button>}
                {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && <Button size="sm" variant="text" busy={action.isPending} disabled={!isOperator}
                  onClick={() => action.mutate({ kind: 'post', value: receipt })}>批量入库</Button>}
              </td></tr>)}
          </OperationTable></section>
      </div>
    </Worklist>
    {dialog === 'order' && <PurchaseDialog api={api} site={site} suppliers={(suppliers.data ?? []).filter(supplierEffective)} items={items}
      onNavigate={onNavigate} onClose={() => setDialog(undefined)} onDone={() => { void refresh(); setDialog(undefined) }} />}
    {dialog === 'receipt' && selectedOrder && <GoodsReceiptDialog api={api} order={selectedOrder} items={items} bins={bins} onClose={() => setDialog(undefined)} onDone={() => { void refresh(); setDialog(undefined) }} />}
    {inspection && <GoodsInspectionDialog api={api} receipt={inspection} items={items} onClose={() => setInspection(undefined)} onDone={() => { void refresh(); setInspection(undefined) }} />}
    {traceReceipt && <TraceRegistrationDialog api={api} receipt={traceReceipt} items={items}
      onClose={() => setTraceReceipt(undefined)} onDone={() => { void refresh(); setTraceReceipt(undefined) }} />}
  </>
}

function RequisitionWorkbench({ api, site, items, isOperator = true }: { api: RhnApi; site: StockSite; items: StockItem[]; isOperator?: boolean }) {
  const client = useQueryClient(); const [open, setOpen] = useState(false); const [approving, setApproving] = useState<Requisition>()
  const values = useQuery({ queryKey: ['warehouse-requisitions', site.id], queryFn: () => api.pharmacy.requisitions(site.id) })
  const departments = useQuery({ queryKey: ['warehouse-departments', site.organizationId], queryFn: () => api.organization.departments(site.organizationId) })
  const refresh = () => client.invalidateQueries({ queryKey: ['warehouse-requisitions', site.id] })
  const action = useMutation({ mutationFn: async ({ id, status }: { id: string; status: string }) => {
    if (status === 'DRAFT') return api.pharmacy.submitRequisition(id)
    if (status === 'APPROVED') return api.pharmacy.pickRequisition(id)
    return api.pharmacy.issueRequisition(id)
  }, onSuccess: refresh })
  const departmentName = (id: string) => departments.data?.find(value => value.id === id)?.name ?? `科室 …${id.slice(-6)}`
  return <>{Boolean(values.error || departments.error || action.error) && <Alert>{errorMessage(values.error || departments.error || action.error)}</Alert>}
    <Worklist title="科室请领" copy="申请、审核、按效期自动拣货并出库" loading={values.isPending} empty={!values.data?.length}
      action={<Button size="sm" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => setOpen(true)}>新建请领单</Button>}>
      <OperationTable headers={['请领单', '申请科室', '用途 / 申请时间', '数量进度', '状态', '操作']}>{(values.data ?? []).map(value => <tr key={value.id}>
        <td><strong>{value.requisitionNo}</strong><small>{value.lines.length} 项</small></td><td>{departmentName(value.requestingDepartmentId)}</td>
        <td>{value.reason || '日常领用'}<small>{formatTime(value.requestedAt)}</small></td>
        <td><strong>申请 {formatQuantity(value.lines.reduce((n, row) => n + Number(row.requestedQuantity), 0))}</strong>
          <small>批准 {formatQuantity(value.lines.reduce((n, row) => n + Number(row.approvedQuantity ?? 0), 0))} · 实发 {formatQuantity(value.lines.reduce((n, row) => n + Number(row.issuedQuantity), 0))}</small></td>
        <td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
          {value.status === 'SUBMITTED' && <Button variant="text" size="sm" disabled={!isOperator} onClick={() => setApproving(value)}>审核明细</Button>}
          {['DRAFT', 'APPROVED', 'PICKING'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending} disabled={!isOperator}
            onClick={() => action.mutate({ id: value.id, status: value.status })}>{({ DRAFT: '提交', APPROVED: '开始拣货', PICKING: '确认出库' } as Record<string, string>)[value.status]}</Button>}
        </td></tr>)}</OperationTable>
    </Worklist>
    {open && <RequisitionCreateDialog api={api} site={site} departmentName={site.departmentId ? departmentName(site.departmentId) : '当前工作科室'}
      items={items} onClose={() => setOpen(false)} onDone={async () => { await refresh(); setOpen(false) }} />}
    {approving && <RequisitionApprovalDialog api={api} value={approving} items={items}
      onClose={() => setApproving(undefined)} onDone={async () => { await refresh(); setApproving(undefined) }} />}
  </>
}

function TransferWorkbench({ api, site, sites, items, bins, isOperator = true }: { api: RhnApi; site: StockSite; sites: StockSite[]; items: StockItem[]; bins: StockBin[]; isOperator?: boolean }) {
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
    {site.siteType === 'PHARMACY' && <div className="warehouse-scenario-banner">
      <span className="warehouse-scenario-banner__icon">💡</span>
      <div>
        <strong>药房调拨协同</strong>
        <span>向中心药库申请调入补货（以当前药房为目标库）；在中心药库拣货发运后，可在途进行【调入确认】逐批核验入库。亦支持药房之间相互借调。</span>
      </div>
    </div>}
    <Worklist title="库间调拨" copy="调出记账、在途跟踪和调入确认分离" loading={source.isPending || incoming.isPending} empty={!rows.length}
      action={<Button size="sm" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => setOpen(true)}>新建调拨单</Button>}>
      <OperationTable headers={['调拨单', '方向', '数量进度', '差异', '状态', '操作']}>{rows.map(value => { const inbound = value.destinationSiteId === site.id
        return <tr key={value.id}><td><strong>{value.transferNo}</strong><small>{formatTime(value.requestedAt)}</small></td>
          <td>{inbound ? `调入 · ${sites.find(v => v.id === value.sourceSiteId)?.name ?? '来源库'}` : `调出 · ${sites.find(v => v.id === value.destinationSiteId)?.name ?? '目标库'}`}</td>
          <td><strong>{transferRequestSummary(value, items)}</strong>
            <small>已调出 {value.lines.filter(line => Number(line.dispatchedQuantity) > 0).length}/{value.lines.length} 项 · 已调入 {value.lines.filter(line => Number(line.receivedQuantity) > 0).length}/{value.lines.length} 项</small></td>
          <td>{value.lines.filter(line => Number(line.damagedQuantity) > 0).length} 项<small>破损 / 短少</small></td>
          <td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
            {inbound && value.status === 'IN_TRANSIT' && <Button variant="text" size="sm" disabled={!isOperator} onClick={() => setReceiving(value)}>调入确认</Button>}
            {!inbound && ['DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate(value)}>{({ DRAFT: '提交', SUBMITTED: '审核', APPROVED: '拣货', PICKING: '确认调出' } as Record<string, string>)[value.status]}</Button>}
          </td></tr>})}</OperationTable>
    </Worklist>
    {open && <TransferDialog api={api} site={site} sites={sites} items={items} onClose={() => setOpen(false)} onDone={() => { void refresh(); setOpen(false) }} />}
    {receiving && <TransferReceiveDialog api={api} value={receiving} items={items} bins={bins} onClose={() => setReceiving(undefined)} onDone={() => { void refresh(); setReceiving(undefined) }} />}
  </>
}

function CountWorkbench({ api, site, items, bins, isOperator = true }: { api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[]; isOperator?: boolean }) {
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
      action={<Button size="sm" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => setOpen(true)}>新建盘点</Button>}>
      <OperationTable headers={['盘点单', '范围', '差异', '状态', '操作']}>{(values.data ?? []).map(value => <tr key={value.id}>
        <td><strong>{value.countNo}</strong><small>{formatTime(value.snapshotAt)}</small></td><td>{value.countType === 'BIN'
          ? bins.find(v => v.id === value.stockBinId)?.name ?? '指定货位'
          : value.countType === 'ITEM' ? `指定项目 · ${new Set(value.lines.map(line => line.stockItemId)).size} 项`
            : value.countType === 'CYCLE' ? `循环盘点 · ${new Set(value.lines.map(line => line.stockItemId)).size} 项` : '全库盘点'}</td>
        <td>{value.lines.filter(v => v.varianceQuantity).length} / {value.lines.length}</td><td><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td><td>
          {value.status === 'COUNTING' ? <Button variant="text" size="sm" disabled={!isOperator} onClick={() => setRecording(value)}>录入实盘</Button>
            : ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(value.status) && <Button variant="text" size="sm" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate(value)}>{({ DRAFT: '开始盘点', SUBMITTED: '审核通过', APPROVED: '盈亏调整' } as Record<string, string>)[value.status]}</Button>}
        </td></tr>)}</OperationTable>
    </Worklist>
    {open && <CountCreateDialog api={api} site={site} items={items} bins={bins} onClose={() => setOpen(false)} onDone={() => { void refresh(); setOpen(false) }} />}
    {recording && <CountRecordDialog api={api} value={recording} items={items} bins={bins} onClose={() => setRecording(undefined)} onDone={() => { void refresh(); setRecording(undefined) }} />}
  </>
}

function OperationTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-operation-table"><thead><tr>{headers.map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

type ItemRow = { item: StockItem; quantity: number; price: number }
type EntryRow = { key: string; stockItemId: string; quantity: string; price: string }

function MultiItemDialog({
  title, submitText, items, quantityLabel, withPrice = false, showBaseConversion = false,
  lead, emptyCopy = '当前没有可选经营项目。', onClose, onSubmit,
}: {
  title: string; submitText: string; items: StockItem[]; quantityLabel: string; withPrice?: boolean
  showBaseConversion?: boolean; lead?: ReactNode; emptyCopy?: string; onClose: () => void
  onSubmit: (reason: string, rows: ItemRow[]) => Promise<void>
}) {
  const [rows, setRows] = useState<EntryRow[]>([
    { key: 'row-0', stockItemId: '', quantity: '1', price: '' },
  ])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const selectWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const itemOptions = useMemo(() => items.map(item => ({
    value: item.id,
    label: item.productName,
    secondaryText: [item.packageSpec || item.packageUnitName, item.manufacturerName].filter(Boolean).join(' · '),
    searchKeywords: [item.productCode, item.manufacturerName ?? '', item.packageSpec ?? ''].filter(Boolean),
  })), [items])

  const focusSelect = (key: string) => {
    setTimeout(() => {
      const btn = selectWrapperRefs.current[key]?.querySelector<HTMLButtonElement>('button[role="combobox"]')
      if (btn) {
        btn.focus()
        btn.click()
      }
    }, 60)
  }

  const focusQuantity = (key: string) => {
    setTimeout(() => {
      const input = quantityInputRefs.current[key]
      if (input) {
        input.focus()
        input.select()
      }
    }, 60)
  }

  const focusPrice = (key: string) => {
    setTimeout(() => {
      const input = priceInputRefs.current[key]
      if (input) {
        input.focus()
        input.select()
      }
    }, 60)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      focusSelect('row-0')
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  const addRow = (autoFocus = true) => {
    const newKey = `row-${Date.now()}-${Math.random()}`
    setRows(prev => [...prev, { key: newKey, stockItemId: '', quantity: '1', price: '' }])
    if (autoFocus) {
      focusSelect(newKey)
    }
    return newKey
  }

  const removeRow = (index: number) => {
    setRows(prev => {
      if (prev.length <= 1) {
        const resetKey = `row-${Date.now()}`
        focusSelect(resetKey)
        return [{ key: resetKey, stockItemId: '', quantity: '1', price: '' }]
      }
      const next = prev.filter((_, i) => i !== index)
      const targetIndex = Math.max(0, index - 1)
      if (next[targetIndex]) {
        focusQuantity(next[targetIndex].key)
      }
      return next
    })
  }

  const updateRow = (index: number, field: keyof EntryRow, value: string) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      return { ...row, [field]: value }
    }))
  }

  const handleItemSelect = (index: number, val: string) => {
    updateRow(index, 'stockItemId', val)
    const currentRow = rows[index]
    if (currentRow) {
      focusQuantity(currentRow.key)
    }
  }

  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void triggerSubmit()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const currentRow = rows[index]
      if (!currentRow) return
      if (withPrice) {
        focusPrice(currentRow.key)
      } else {
        if (index === rows.length - 1) {
          addRow(true)
        } else {
          focusSelect(rows[index + 1].key)
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (index < rows.length - 1) {
        e.preventDefault()
        focusQuantity(rows[index + 1].key)
      }
    } else if (e.key === 'ArrowUp') {
      if (index > 0) {
        e.preventDefault()
        focusQuantity(rows[index - 1].key)
      }
    }
  }

  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void triggerSubmit()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (index === rows.length - 1) {
        addRow(true)
      } else {
        focusSelect(rows[index + 1].key)
      }
    } else if (e.key === 'ArrowDown') {
      if (index < rows.length - 1) {
        e.preventDefault()
        focusPrice(rows[index + 1].key)
      }
    } else if (e.key === 'ArrowUp') {
      if (index > 0) {
        e.preventDefault()
        focusPrice(rows[index - 1].key)
      }
    }
  }

  const validRows = rows.map(row => {
    const item = itemMap.get(row.stockItemId)
    const qty = Number(row.quantity)
    const prc = withPrice ? Number(row.price) : 0
    const isValid = Boolean(item && qty > 0 && (!withPrice || (!isNaN(prc) && prc >= 0 && row.price.trim() !== '')))
    return { item, quantity: qty, price: prc, isValid }
  }).filter((v): v is { item: StockItem; quantity: number; price: number; isValid: true } => v.isValid)

  const totalQuantity = validRows.reduce((sum, r) => sum + r.quantity, 0)
  const totalAmount = validRows.reduce((sum, r) => sum + r.quantity * r.price, 0)
  const canSubmit = validRows.length > 0 && !busy

  const triggerSubmit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(undefined)
    try {
      await onSubmit(reason, validRows.map(r => ({ item: r.item, quantity: r.quantity, price: r.price })))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return <Dialog title={title} eyebrow="批量业务" size="xwide" onClose={onClose} footer={<div className="warehouse-entry-dialog-footer">
    <div className="warehouse-entry-summary">
      <span>已录入 <strong>{validRows.length}</strong> 个品种</span>
      <span>合计数量 <strong>{formatQuantity(totalQuantity)}</strong></span>
      {withPrice && <span>预估总金额 <strong className="warehouse-entry-total">{formatMoney(totalAmount)}</strong></span>}
    </div>
    <div className="warehouse-entry-actions">
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!canSubmit} onClick={triggerSubmit}>{submitText}</Button>
    </div>
  </div>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {lead}
    <FormField label="用途说明">
      <input className="ui-field__control" value={reason} onChange={e => setReason(e.target.value)} placeholder="填写本次业务用途（选填）" />
    </FormField>

    {!items.length ? <EmptyState icon="pharmacy" title="暂无可选择的经营项目" copy={emptyCopy} />
      : <div className="warehouse-entry-table-container">
        <div className="warehouse-entry-kbd-hint">
          <span className="warehouse-entry-kbd-badge">⌨️ 全键盘连续录入</span>
          <span>按 <code>Enter</code> 确认并跳转下个字段 / 自动增行</span>
          <span>按 <code>↑</code> / <code>↓</code> 跨行切换</span>
          <span>按 <code>Ctrl+Enter</code> 直接提交</span>
        </div>
        <table className="warehouse-table warehouse-entry-table">
          <thead>
            <tr>
              <th style={{ width: '3rem', textAlign: 'center' }}>#</th>
              <th style={{ minWidth: '16rem' }}>选择药品</th>
              <th style={{ width: '13rem' }}>包装规格</th>
              <th style={{ width: '10rem' }}>{quantityLabel}</th>
              {withPrice && <th style={{ width: '10rem' }}>采购单价</th>}
              {withPrice && <th style={{ width: '9rem' }}>金额小计</th>}
              <th style={{ width: '4.5rem', textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const item = itemMap.get(row.stockItemId)
              const lineTotal = item && withPrice && Number(row.quantity) > 0 && Number(row.price) >= 0
                ? Number(row.quantity) * Number(row.price)
                : 0
              const isActiveRow = focusedIndex === index
              return <tr key={row.key} className={isActiveRow ? 'is-active-entry-row' : ''} onFocus={() => setFocusedIndex(index)}>
                <td className="warehouse-entry-index">{index + 1}</td>
                <td>
                  <div ref={el => { selectWrapperRefs.current[row.key] = el }}>
                    <Select searchable showValue popoverMinWidth={520} value={row.stockItemId}
                      onChange={(val) => handleItemSelect(index, val)}
                      placeholder="输入药品名称、拼音或编码搜索"
                      options={itemOptions} />
                  </div>
                </td>
                <td>
                  {item ? <div className="warehouse-entry-spec">
                    <strong>{item.productName}</strong>
                    <small>{[item.packageSpec || item.packageUnitName, item.manufacturerName].filter(Boolean).join(' · ')}</small>
                    <small>1 {item.packageUnitName} = {formatQuantity(item.packageFactor)} {displayUnitName(item.baseUnitCode)}</small>
                  </div> : <span className="warehouse-entry-placeholder">选择药品后自动带入</span>}
                </td>
                <td>
                  <input
                    ref={el => { quantityInputRefs.current[row.key] = el }}
                    className="ui-field__control warehouse-entry-input"
                    type="number"
                    min="0.0001"
                    step="any"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                    onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                    placeholder="数量"
                  />
                  {showBaseConversion && item && Number(row.quantity) > 0 && <small className="warehouse-entry-conv">
                    = {formatQuantity(Number(row.quantity) * Number(item.packageFactor))} {displayUnitName(item.baseUnitCode)}
                  </small>}
                </td>
                {withPrice && <td>
                  <input
                    ref={el => { priceInputRefs.current[row.key] = el }}
                    className="ui-field__control warehouse-entry-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.price}
                    onChange={(e) => updateRow(index, 'price', e.target.value)}
                    onKeyDown={(e) => handlePriceKeyDown(e, index)}
                    placeholder="0.00"
                  />
                </td>}
                {withPrice && <td className="warehouse-entry-amount">
                  {lineTotal > 0 ? formatMoney(lineTotal) : '—'}
                </td>}
                <td style={{ textAlign: 'center' }}>
                  <Button variant="text" size="sm" onClick={() => removeRow(index)} title="删除此行">删除</Button>
                </td>
              </tr>
            })}
          </tbody>
        </table>
        <div className="warehouse-entry-add-bar">
          <Button size="sm" variant="secondary" onClick={() => addRow(true)}>+ 添加一行药品 (Enter)</Button>
        </div>
      </div>}
  </Dialog>
}

function RequisitionCreateDialog({ api, site, departmentName, items, onClose, onDone }: {
  api: RhnApi; site: StockSite; departmentName: string; items: StockItem[]; onClose: () => void; onDone: () => Promise<void>
}) {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  const [requestedAt, setRequestedAt] = useState(now.toISOString().slice(0, 16))
  return <MultiItemDialog title="新建科室请领" submitText="创建请领单" items={items} quantityLabel="请领数量（基本单位）"
    lead={<div className="warehouse-form-grid warehouse-form-grid--compact">
      <FormField label="申请科室" required><input className="ui-field__control" value={departmentName} readOnly /></FormField>
      <FormField label="申请时间" required><input className="ui-field__control" type="datetime-local" value={requestedAt}
        onChange={event => setRequestedAt(event.target.value)} /></FormField>
    </div>}
    onClose={onClose} onSubmit={async (reason, rows) => {
      await api.pharmacy.createRequisition({ sourceSiteId: site.id, requestingDepartmentId: site.departmentId,
        requestCode: `REQ-${crypto.randomUUID()}`, requestedAt: new Date(requestedAt).toISOString(), reason,
        lines: rows.map(row => ({ stockItemId: row.item.id, requestedQuantity: row.quantity })) })
      await onDone()
    }} />
}

function RequisitionApprovalDialog({ api, value, items, onClose, onDone }: {
  api: RhnApi; value: Requisition; items: StockItem[]; onClose: () => void; onDone: () => Promise<void>
}) {
  const [approved, setApproved] = useState<Record<string, string>>(Object.fromEntries(
    value.lines.map(line => [line.id, String(line.approvedQuantity ?? line.requestedQuantity)]),
  ))
  const [reason, setReason] = useState(''); const mutation = useMutation({
    mutationFn: () => api.pharmacy.approveRequisition(value.id, value.lines.map(line => ({
      requisitionLineId: line.id, approvedQuantity: Number(approved[line.id]),
    })), reason.trim() || undefined), onSuccess: onDone,
  })
  const valid = value.lines.every(line => approved[line.id] !== '' && Number(approved[line.id]) >= 0
    && Number(approved[line.id]) <= Number(line.requestedQuantity))
  return <Dialog title="审核请领明细" eyebrow={value.requisitionNo} size="wide"
    description="逐项核对并调整批准数量；不批准的项目可填 0，批准后系统再按 FEFO 分配批次和货位。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>确认审核</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    <OperationTable headers={['药品', '申请数量', '批准数量', '单位', '当前分配']}>
      {value.lines.map(line => {
        const item = items.find(v => v.id === line.stockItemId)
        return <tr key={line.id}><td><strong>{item?.productName ?? line.stockItemId}</strong>
          <small>{[item?.productCode, item?.packageSpec || item?.packageUnitName, item?.manufacturerName].filter(Boolean).join(' · ')}</small></td><td>{formatQuantity(line.requestedQuantity)}</td>
          <td><input aria-label="批准数量" className="ui-field__control" type="number" min="0" max={line.requestedQuantity}
            value={approved[line.id]} onChange={event => setApproved(current => ({ ...current, [line.id]: event.target.value }))} /></td>
          <td>{line.baseUnitCode}</td><td>{line.allocations.length ? `${line.allocations.length} 个批次` : '批准后自动分配'}</td></tr>
      })}
    </OperationTable>
    <FormField label="审核说明"><input className="ui-field__control" value={reason}
      onChange={event => setReason(event.target.value)} placeholder="可填写调整原因；审核记录保留数量明细" /></FormField>
  </Dialog>
}

function PurchaseDialog({ api, site, suppliers, items, onNavigate, onClose, onDone }: { api: RhnApi; site: StockSite; suppliers: Awaited<ReturnType<RhnApi['pharmacy']['suppliers']>>; items: StockItem[]; onNavigate: (path: string) => void; onClose: () => void; onDone: () => void }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [expectedDate, setExpectedDate] = useState('')
  if (!suppliers.length) return <Dialog title="新建采购单" eyebrow="采购作业" onClose={onClose}><EmptyState icon="pharmacy"
    title="请先维护供应商" copy="当前机构没有可用供应商，请先前往基础档案维护。"
    action={<Button onClick={() => { onClose(); onNavigate('/settings/partners?tab=suppliers') }}>前往供应商档案</Button>} /></Dialog>
  return <MultiItemDialog title="新建采购单" submitText="创建采购单" items={items} quantityLabel="采购数量（包装）" withPrice
    lead={<div className="warehouse-form-grid warehouse-form-grid--compact"><FormField label="供应商" required><Select value={supplierId} onChange={setSupplierId} clearable={false} showValue options={suppliers.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
      <FormField label="预计到货日期"><input className="ui-field__control" type="date" value={expectedDate}
        min={new Date().toISOString().slice(0, 10)} onChange={event => setExpectedDate(event.target.value)} /></FormField></div>}
    onClose={onClose} onSubmit={async (description, rows) => {
    for (const row of rows) { try { await api.pharmacy.addSupplierItem(supplierId, { catalogItemId: row.item.catalogItemId, packageId: row.item.packageId, agreementPrice: row.price }) } catch (error) { if ((error as { code?: string }).code !== 'SUPPLIER_ITEM_DUPLICATE') throw error } }
    await api.pharmacy.createPurchaseOrder({ stockSiteId: site.id, supplierId, requestCode: `PO-${crypto.randomUUID()}`,
      expectedDate: expectedDate || undefined, description, lines: rows.map(row => ({ stockItemId: row.item.id,
        packageId: row.item.packageId, orderedQuantity: row.quantity, unitPrice: row.price })) }); onDone()
  }} />
}

function GoodsReceiptDialog({ api, order, items, bins, onClose, onDone }: { api: RhnApi; order: PurchaseOrder; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const receiveBins = bins.filter(value => value.active && value.receiveAllowed)
  const [deliveryNoteNo, setDeliveryNoteNo] = useState(''); const [receivedAt, setReceivedAt] = useState(() => {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16)
  })
  const [binIds, setBinIds] = useState<Record<string, string>>({}); const [lots, setLots] = useState<Record<string, string>>({})
  const [productionDates, setProductionDates] = useState<Record<string, string>>({}); const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>({}); const availableLines = order.lines.filter(value => value.remainingQuantity > 0)
  const selectedLines = availableLines.filter(value => Number(quantities[value.id]) > 0)
  const valid = Boolean(deliveryNoteNo.trim()) && selectedLines.length > 0 && selectedLines.every(line => {
    const item = items.find(value => value.id === line.stockItemId); const quantity = Number(quantities[line.id])
    const datesValid = !productionDates[line.id] || !expiryDates[line.id] || productionDates[line.id] <= expiryDates[line.id]
    return quantity > 0 && quantity <= Number(line.remainingQuantity) && Boolean(binIds[line.id])
      && (!item?.lotRequired || Boolean(lots[line.id]?.trim() && expiryDates[line.id])) && datesValid
  })
  const mutation = useMutation({ mutationFn: () => api.pharmacy.createGoodsReceipt({ purchaseOrderId: order.id,
    requestCode: `GR-${crypto.randomUUID()}`, deliveryNoteNo: deliveryNoteNo.trim(), receivedAt: new Date(receivedAt).toISOString(),
    lines: selectedLines.map(line => ({ purchaseOrderLineId: line.id, destinationBinId: binIds[line.id],
      lotNo: lots[line.id]?.trim() || 'NO-LOT', productionDate: productionDates[line.id] || undefined,
      expiryDate: expiryDates[line.id] || undefined, deliveredQuantity: Number(quantities[line.id]), unitCost: line.unitPrice })) }),
    onSuccess: onDone })
  return <Dialog title="批量登记到货" eyebrow={order.orderNo} size="xwide"
    description="逐行确认包装、数量、批号、效期和实际收货货位；未填写到货数量的行不会提交。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>登记 {selectedLines.length} 批到货</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}{!receiveBins.length && <Alert>当前库房没有允许收货的货位。</Alert>}
    <div className="warehouse-form-grid warehouse-form-grid--compact"><FormField label="送货单号" required>
      <input autoFocus className="ui-field__control" value={deliveryNoteNo} onChange={event => setDeliveryNoteNo(event.target.value)}
        placeholder="供应商送货凭证号" /></FormField><FormField label="实际到货时间" required>
      <input className="ui-field__control" type="datetime-local" value={receivedAt} onChange={event => setReceivedAt(event.target.value)} /></FormField></div>
    <OperationTable headers={['药品 / 包装', '剩余', '本次到货', '批号', '生产日期', '有效期', '收货货位']}>
      {availableLines.map(line => { const item = items.find(value => value.id === line.stockItemId); const selected = Number(quantities[line.id]) > 0
        return <tr key={line.id} className={selected ? 'is-selected' : ''}><td><strong>{item?.productName ?? line.stockItemId}</strong>
          <small>{[item?.packageSpec || item?.packageUnitName, item?.manufacturerName, `单价 ${formatMoney(line.unitPrice)}`].filter(Boolean).join(' · ')}</small></td><td>{formatQuantity(line.remainingQuantity)}</td>
          <td><input aria-label="本次到货数量" className="ui-field__control" type="number" min="0" max={line.remainingQuantity}
            value={quantities[line.id] ?? ''} onChange={event => setQuantities(current => ({ ...current, [line.id]: event.target.value }))} /></td>
          <td><input aria-label="批号" className="ui-field__control" disabled={!selected} value={lots[line.id] ?? ''}
            onChange={event => setLots(current => ({ ...current, [line.id]: event.target.value }))}
            placeholder={item?.lotRequired ? '必填' : '无批号可留空'} /></td>
          <td><input aria-label="生产日期" className="ui-field__control" disabled={!selected} type="date" value={productionDates[line.id] ?? ''}
            onChange={event => setProductionDates(current => ({ ...current, [line.id]: event.target.value }))} /></td>
          <td><input aria-label="有效期" className="ui-field__control" disabled={!selected} type="date" min={productionDates[line.id]}
            value={expiryDates[line.id] ?? ''} onChange={event => setExpiryDates(current => ({ ...current, [line.id]: event.target.value }))} /></td>
          <td><Select value={binIds[line.id] ?? ''} disabled={!selected} onChange={id => setBinIds(current => ({ ...current, [line.id]: id }))}
            clearable={false} showValue placeholder="选择实际货位" options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} /></td></tr> })}
    </OperationTable>
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
    <OperationTable headers={['药品 / 批号', '生产 / 有效期', '到货数', '合格数', '不合格数', '不合格原因']}>
      {receipt.lines.map(line => {
        const item = items.find(v => v.id === line.stockItemId)
        return <tr key={line.id}><td><strong>{item?.productName ?? line.stockItemId}</strong><small>{[item?.manufacturerName, `批号 ${line.lotNo}`].filter(Boolean).join(' · ')}</small></td>
          <td><strong>{line.expiryDate ?? '无效期'}</strong><small>生产 {line.productionDate ?? '未记录'}</small></td><td>{line.deliveredQuantity}</td>
          <td><input aria-label={`${line.lotNo}合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={accepted[line.id]} onChange={e => setAccepted(v => ({ ...v, [line.id]: e.target.value }))} /></td>
          <td><input aria-label={`${line.lotNo}不合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={rejected[line.id]} onChange={e => setRejected(v => ({ ...v, [line.id]: e.target.value }))} /></td>
          <td><input aria-label={`${line.lotNo}不合格原因`} className="ui-field__control" disabled={Number(rejected[line.id]) === 0} value={reasons[line.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [line.id]: e.target.value }))} placeholder="存在不合格时必填" /></td></tr>
      })}
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
          <span>{[item?.productCode, item?.manufacturerName, `批号 ${line.lotNo}`].filter(Boolean).join(' · ')}</span></div>
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
  return <MultiItemDialog title="新建库间调拨" submitText="创建调拨单" items={items.filter(item => destinationItems.data?.some(d => d.catalogItemId === item.catalogItemId && d.packageId === item.packageId))} quantityLabel="调拨数量（包装单位）" showBaseConversion emptyCopy="调入站点尚未配置与本库匹配的经营项目，请先在目标科室完成批量调入。"
    lead={<FormField label="调入站点" required><Select value={destinationId} onChange={setDestinationId} clearable={false} showValue options={destinations.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>}
    onClose={onClose} onSubmit={async (reason, rows) => {
    await api.pharmacy.createTransfer({ sourceSiteId: site.id, destinationSiteId: destinationId, requestCode: `TR-${crypto.randomUUID()}`, reason, lines: rows.map(row => ({ sourceStockItemId: row.item.id, destinationStockItemId: destinationItems.data!.find(d => d.catalogItemId === row.item.catalogItemId && d.packageId === row.item.packageId)!.id, requestedQuantity: row.quantity, operationUnitCode: row.item.packageUnitCode, baseQuantityFactor: row.item.packageFactor })) }); onDone()
  }} />
}

function TransferReceiveDialog({ api, value, items, bins, onClose, onDone }: { api: RhnApi; value: StockTransfer; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const allocations = value.lines.flatMap(line => line.allocations.map(allocation => ({ line, allocation })))
  const receiveBins = bins.filter(bin => bin.active && bin.receiveAllowed)
  const lotItemIds = [...new Set(value.lines.map(line => line.sourceStockItemId))]
  const lots = useQuery({ queryKey: ['warehouse-transfer-lots', value.id, lotItemIds.join(',')],
    queryFn: async () => (await Promise.all(lotItemIds.map(itemId => api.pharmacy.lots(itemId)))).flat(), enabled: Boolean(lotItemIds.length) })
  const [binIds, setBinIds] = useState<Record<string, string>>({})
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
    {Boolean(mutation.error || lots.error) && <Alert>{errorMessage(mutation.error || lots.error)}</Alert>}{!receiveBins.length && <Alert>当前库房没有允许收货的货位，请先维护货位。</Alert>}
    <OperationTable headers={['药品 / 批号 / 效期', '调出数', '正常入库', '破损 / 短少', '目标货位', '差异原因']}>
      {allocations.map(({ line, allocation }) => { const lot = lots.data?.find(value => value.id === allocation.stockLotId)
        const item = items.find(v => v.id === line.destinationStockItemId)
        const operationUnitName = item?.packageUnitName ?? line.operationUnitCode
        const baseUnitName = displayUnitName(line.baseUnitCode)
        return <tr key={allocation.id}><td><strong>{item?.productName ?? line.destinationStockItemId}</strong>
          <small>{[lot ? `批号 ${lot.lotNo} · 效期 ${lot.expiryDate ?? '无效期'}` : lots.isPending ? '正在读取批次…' : '批次资料缺失', item?.manufacturerName].filter(Boolean).join(' · ')}</small></td><td>{formatQuantity(allocation.dispatchedQuantity)}{baseUnitName}
          <small>申请 {formatQuantity(line.requestedOperationQuantity)}{operationUnitName} · 1{operationUnitName} = {formatQuantity(line.baseQuantityFactor)}{baseUnitName}</small></td>
        <td><input aria-label="正常调入数" className="ui-field__control" type="number" min="0" max={allocation.dispatchedQuantity} value={received[allocation.id]} onChange={e => setReceived(v => ({ ...v, [allocation.id]: e.target.value }))} /></td>
        <td><input aria-label="破损调入数" className="ui-field__control" type="number" min="0" max={allocation.dispatchedQuantity} value={damaged[allocation.id]} onChange={e => setDamaged(v => ({ ...v, [allocation.id]: e.target.value }))} /></td>
        <td><Select value={binIds[allocation.id]} onChange={id => setBinIds(v => ({ ...v, [allocation.id]: id }))} clearable={false} options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} /></td>
        <td><input aria-label="调入差异原因" className="ui-field__control" disabled={Number(damaged[allocation.id]) === 0} value={reasons[allocation.id] ?? ''} onChange={e => setReasons(v => ({ ...v, [allocation.id]: e.target.value }))} placeholder="破损或短少时必填" /></td></tr>})}
    </OperationTable>
  </Dialog>
}

function CountCreateDialog({ api, site, items, bins, onClose, onDone }: { api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<'FULL' | 'BIN' | 'ITEM' | 'CYCLE'>('FULL'); const [binId, setBinId] = useState('')
  const [itemIds, setItemIds] = useState<string[]>([]); const [reason, setReason] = useState('日常库存盘点')
  const itemScoped = type === 'ITEM' || type === 'CYCLE'
  const valid = type === 'FULL' || (type === 'BIN' ? Boolean(binId) : itemIds.length > 0)
  const mutation = useMutation({ mutationFn: () => api.pharmacy.createStockCount({ stockSiteId: site.id,
    stockBinId: type === 'BIN' ? binId : undefined, stockItemIds: itemScoped ? itemIds : undefined,
    requestCode: `CT-${crypto.randomUUID()}`, countType: type, reason: reason.trim() || '库存盘点' }), onSuccess: onDone })
  return <Dialog title="新建盘点" eyebrow="库存盘点" size="wide"
    description="按业务目的选择盘点范围；录入实盘时默认留空，并可使用盲盘避免账面数量干扰。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>创建盘点</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}<div className="warehouse-form-grid">
      <FormField label="盘点范围" required><Select value={type} onChange={value => { setType(value as typeof type); setBinId(''); setItemIds([]) }} clearable={false} showValue
        options={[{ value: 'FULL', label: '全库盘点', secondaryText: 'FULL' }, { value: 'BIN', label: '按货位盘点', secondaryText: 'BIN' },
          { value: 'ITEM', label: '按经营项目盘点', secondaryText: 'ITEM' }, { value: 'CYCLE', label: '循环盘点', secondaryText: 'CYCLE' }]} /></FormField>
      {type === 'BIN' && <FormField label="盘点货位" required><Select value={binId} onChange={setBinId} clearable={false} showValue
        options={bins.filter(v => v.active && v.countAllowed).map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>}
      {itemScoped && <FormField label={type === 'CYCLE' ? '本次循环盘点项目' : '盘点经营项目'} required><Select multiple searchable showValue
        value={itemIds} onChange={setItemIds} placeholder="可多选经营项目" options={items.map(item => ({ value: item.id,
          label: item.productName, secondaryText: [item.productCode, item.manufacturerName].filter(Boolean).join(' · ') }))} /></FormField>}
      <FormField className="warehouse-form-grid__full" label="盘点原因" required><input className="ui-field__control" value={reason}
        onChange={event => setReason(event.target.value)} placeholder="说明本次盘点目的" /></FormField></div>
  </Dialog>
}

function CountRecordDialog({ api, value, items, bins, onClose, onDone }: { api: RhnApi; value: StockCount; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void }) {
  const lotItemIds = [...new Set(value.lines.map(line => line.stockItemId))]
  const lots = useQuery({ queryKey: ['warehouse-count-lots', value.id, lotItemIds.join(',')],
    queryFn: async () => (await Promise.all(lotItemIds.map(itemId => api.pharmacy.lots(itemId)))).flat(), enabled: Boolean(lotItemIds.length) })
  const [blind, setBlind] = useState(true); const [counts, setCounts] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({}); const mutation = useMutation({ mutationFn: async () => {
    await api.pharmacy.recordStockCount(value.id, value.lines.map(line => ({ countLineId: line.id,
      countedQuantity: Number(counts[line.id]), varianceReason: Number(counts[line.id]) === Number(line.bookQuantity)
        ? undefined : reasons[line.id]?.trim() }))); return api.pharmacy.submitStockCount(value.id) }, onSuccess: onDone })
  const valid = value.lines.every(line => counts[line.id] !== '' && counts[line.id] !== undefined
    && Number(counts[line.id]) >= 0 && (Number(counts[line.id]) === Number(line.bookQuantity) || Boolean(reasons[line.id]?.trim())))
  return <Dialog title="录入实盘数量" eyebrow={value.countNo} size="wide" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>保存并提交审核</Button></>}>
    {Boolean(mutation.error || lots.error) && <Alert>{errorMessage(mutation.error || lots.error)}</Alert>}
    <div className="warehouse-count-mode"><div><strong>录入策略</strong><span>默认不带入账面数量，避免未清点直接提交。</span></div>
      <Select value={blind ? 'BLIND' : 'OPEN'} onChange={value => setBlind(value === 'BLIND')} clearable={false} showValue
        options={[{ value: 'BLIND', label: '盲盘', secondaryText: '隐藏账面数' }, { value: 'OPEN', label: '明盘', secondaryText: '显示账面数' }]} /></div>
    <OperationTable headers={['药品 / 库位', '批号 / 效期 / 状态', '账面数量', '实盘数量', '差异原因']}>{value.lines.map(line => {
      const lot = lots.data?.find(item => item.id === line.stockLotId)
      const item = items.find(v => v.id === line.stockItemId)
      return <tr key={line.id}><td><strong>{item?.productName ?? line.stockItemId}</strong>
        <small>{[bins.find(bin => bin.id === line.stockBinId)?.name ?? line.stockBinId, item?.manufacturerName].filter(Boolean).join(' · ')}</small></td>
        <td><strong>{lot?.lotNo ?? (lots.isPending ? '正在读取…' : '批次资料缺失')}</strong>
          <small>{lot?.expiryDate ?? '无效期'} · {stockStatusText[line.stockStatus] ?? line.stockStatus}</small></td>
        <td>{blind ? '盲盘隐藏' : formatQuantity(line.bookQuantity)}</td><td><input aria-label={`${line.id}实盘数量`} className="ui-field__control"
          type="number" min="0" placeholder="清点后录入" value={counts[line.id] ?? ''}
          onChange={event => setCounts(current => ({ ...current, [line.id]: event.target.value }))} /></td>
        <td><input aria-label={`${line.id}差异原因`} className="ui-field__control"
          disabled={counts[line.id] === undefined || counts[line.id] === '' || Number(counts[line.id]) === Number(line.bookQuantity)}
          value={reasons[line.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [line.id]: event.target.value }))}
          placeholder="有差异时必填" /></td></tr>})}</OperationTable>
  </Dialog>
}

function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function displayUnitName(value: string) {
  return ({ BOX: '盒', BOTTLE: '瓶', BAG: '袋', PACK: '包', VIAL: '瓶', AMP: '支', AMPOULE: '支',
    TABLET: '片', TAB: '片', CAPSULE: '粒', CAP: '粒', PIECE: '个', PCS: '个', ML: '毫升', G: '克' } as Record<string, string>)[value] ?? value
}
function transferRequestSummary(value: StockTransfer, items: StockItem[]) {
  if (value.lines.length !== 1) return `申请 ${value.lines.length} 项包装明细`
  const line = value.lines[0]
  const item = items.find(candidate => candidate.id === line.sourceStockItemId || candidate.id === line.destinationStockItemId)
  return `申请 ${formatQuantity(line.requestedOperationQuantity)}${item?.packageUnitName ?? line.operationUnitCode}`
}
function formatQuantity(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(Number(value)) }
function formatMoney(value: number) { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(value) }
