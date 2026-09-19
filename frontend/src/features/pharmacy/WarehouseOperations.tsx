import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GoodsReceipt, MedicationProduct, PurchaseOrder, Requisition, StockBin, StockCount, StockItem, StockSite, StockTransfer } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, DatePicker, Dialog, EditableCell, EditableRow, EditableTable, EmptyState, FormField, LoadingState, Select, StatusBadge, UnitNumberInput, tableCellClass } from '../../shared/ui'
import {
  IconBolt,
  IconBuildingStore,
  IconChecklist,
  IconClipboardList,
  IconFileText,
  IconInfoCircle,
  IconPlus,
  IconPrinter,
  IconTrash,
  IconTruckDelivery,
} from '@tabler/icons-react'

export function resolveItemDefaultPrices(
  item: StockItem | undefined,
  orders: PurchaseOrder[] = [],
  products: MedicationProduct[] = [],
  supplierItems?: Array<{ catalogItemId?: string; packageId?: string; agreementPrice?: number }>,
): { purchasePrice?: string; salePrice?: string } {
  if (!item) return {}

  // 1. 最近一次采购单价（从历史 orders 中倒序查找）
  let recentPurchasePrice: number | undefined
  for (const o of orders) {
    const line = o.lines?.find(l => String(l.stockItemId) === String(item.id) && Number(l.unitPrice) > 0)
    if (line) {
      recentPurchasePrice = Number(line.unitPrice)
      break
    }
  }

  // 2. 供应商协议价
  const targetCatalogId = item.catalogItemId || item.id
  const supply = supplierItems?.find(s => String(s.catalogItemId) === String(targetCatalogId) && (!s.packageId || !item.packageId || String(s.packageId) === String(item.packageId)))
  const agreementPrice = supply && Number(supply.agreementPrice) > 0 ? Number(supply.agreementPrice) : undefined

  // 3. 药品主数据标准价格
  const product = products.find(p => String(p.id) === String(targetCatalogId))
  const today = new Date().toISOString().slice(0, 10)
  const activePrices = product?.prices?.filter(p => p.sdStatus === 'ACTIVE' && p.validFrom <= today && (!p.validTo || p.validTo >= today)) ?? product?.prices ?? []
  const purchasePriceObj = activePrices.find(p => p.sdPriceType === 'PURCHASE' && (!p.packageId || !item.packageId || String(p.packageId) === String(item.packageId)))
  const salePriceObj = activePrices.find(p => p.sdPriceType === 'SALE' && (!p.packageId || !item.packageId || String(p.packageId) === String(item.packageId)))

  const standardPurchasePrice = purchasePriceObj ? Number(purchasePriceObj.price) : undefined
  const standardSalePrice = salePriceObj ? Number(salePriceObj.price) : undefined

  const finalPurchasePrice = recentPurchasePrice ?? agreementPrice ?? standardPurchasePrice

  return {
    purchasePrice: finalPurchasePrice !== undefined ? String(finalPurchasePrice) : undefined,
    salePrice: standardSalePrice !== undefined ? String(standardSalePrice) : undefined,
  }
}

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

export function PurchaseWorkbench({ api, site, items, bins, onNavigate, isOperator = true }: {
  api: RhnApi; site: StockSite; items: StockItem[]; bins: StockBin[]; onNavigate: (path: string) => void
  isOperator?: boolean
}) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<'order' | 'receipt'>()
  const [purchaseMode, setPurchaseMode] = useState<'plan' | 'direct'>('plan')
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder>()
  const [inspection, setInspection] = useState<GoodsReceipt>()
  const [traceReceipt, setTraceReceipt] = useState<GoodsReceipt>()
  const [stage, setStage] = useState('all')
  const [docType, setDocType] = useState<'all' | 'orders' | 'receipts'>('all')
  const [selectedDocId, setSelectedDocId] = useState<string>()
  const [selectedDocKind, setSelectedDocKind] = useState<'order' | 'receipt'>('order')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')

  const suppliers = useQuery({ queryKey: ['warehouse-suppliers', site.organizationId], queryFn: () => api.pharmacy.suppliers(site.organizationId) })
  const orders = useQuery({ queryKey: ['warehouse-purchase-orders', site.id], queryFn: () => api.pharmacy.purchaseOrders(site.id) })
  const receipts = useQuery({ queryKey: ['warehouse-goods-receipts', site.id], queryFn: () => api.pharmacy.goodsReceipts(site.id) })
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['warehouse-purchase-orders', site.id] }),
    queryClient.invalidateQueries({ queryKey: ['warehouse-goods-receipts', site.id] }),
    queryClient.invalidateQueries({ queryKey: ['warehouse-balances', site.id] }),
  ])

  const action = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: PurchaseOrder | GoodsReceipt }) => {
      if (kind === 'submit') return api.pharmacy.submitPurchaseOrder(value.id)
      if (kind === 'approve') return api.pharmacy.approvePurchaseOrder(value.id)
      return api.pharmacy.postGoodsReceipt(value.id)
    },
    onSuccess: refresh,
  })

  const error = suppliers.error || orders.error || receipts.error || action.error

  const medProducts = useQuery({
    queryKey: ['warehouse-med-products', site.organizationId],
    queryFn: () => api.masterData.searchMedicationProducts('', '', 'ACTIVE', site.organizationId, 0, 100),
    enabled: Boolean(site.organizationId),
  })
  const productsList = useMemo(() => (medProducts.data?.content ?? []).map(entry => entry.product), [medProducts.data])

  const ordersList = orders.data ?? []
  const receiptsList = receipts.data ?? []

  // KPI Metrics calculation
  const pendingApprovalCount = ordersList.filter(o => ['DRAFT', 'SUBMITTED'].includes(o.status)).length
  const pendingArrivalCount = ordersList.filter(o => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(o.status)).length
  const pendingInspectionCount = receiptsList.filter(r => ['RECEIVED', 'INSPECTING'].includes(r.status)).length
  const pendingPostingCount = receiptsList.filter(r => ['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(r.status)).length
  const postedReceipts = receiptsList.filter(r => r.status === 'POSTED')
  const totalPostedAmount = postedReceipts.reduce((sum, r) => sum + r.lines.reduce((sub, l) => sub + (Number(l.acceptedQuantity ?? l.deliveredQuantity) * Number(l.unitCost ?? 0)), 0), 0)

  const matches = (...values: (string | undefined)[]) => values.join(' ').toLowerCase().includes(search.trim().toLowerCase())

  // Unified Queue construction
  interface QueueItem {
    kind: 'order' | 'receipt'
    id: string
    docNo: string
    supplierName: string
    date: string
    status: string
    amount: number
    countText: string
    rawOrder?: PurchaseOrder
    rawReceipt?: GoodsReceipt
  }

  const queueItems = useMemo<QueueItem[]>(() => {
    const list: QueueItem[] = []

    if (docType === 'all' || docType === 'orders') {
      for (const order of ordersList) {
        const sup = suppliers.data?.find(v => v.id === order.supplierId)?.name ?? order.supplierId
        const medNames = order.lines.map(l => items.find(i => i.id === l.stockItemId)?.productName)
        if (search.trim() && !matches(order.orderNo, sup, ...medNames)) continue

        // Stage filter for order
        if (stage === 'pending' && ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status)) continue
        if (stage === 'approval' && !['DRAFT', 'SUBMITTED'].includes(order.status)) continue
        if (stage === 'arrival' && !['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)) continue
        if (stage === 'inspection' || stage === 'posting') continue // Receipts only stages

        const amount = order.lines.reduce((sum, l) => sum + Number(l.orderedQuantity) * Number(l.unitPrice), 0)
        list.push({
          kind: 'order',
          id: order.id,
          docNo: order.orderNo,
          supplierName: sup,
          date: order.orderDate,
          status: order.status,
          amount,
          countText: `${order.lines.length} 种药品`,
          rawOrder: order,
        })
      }
    }

    if (docType === 'all' || docType === 'receipts') {
      for (const receipt of receiptsList) {
        const sup = suppliers.data?.find(v => v.id === receipt.supplierId)?.name ?? receipt.supplierId
        const poNo = ordersList.find(o => o.id === receipt.purchaseOrderId)?.orderNo
        const medNames = receipt.lines.map(l => items.find(i => i.id === l.stockItemId)?.productName)
        if (search.trim() && !matches(receipt.receiptNo, receipt.deliveryNoteNo, sup, poNo, ...medNames)) continue

        // Stage filter for receipt
        if (stage === 'pending' && !['RECEIVED', 'INSPECTING', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status)) continue
        if (stage === 'approval' || stage === 'arrival') continue // Orders only stages
        if (stage === 'inspection' && !['RECEIVED', 'INSPECTING'].includes(receipt.status)) continue
        if (stage === 'posting' && !['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status)) continue

        const amount = receipt.lines.reduce((sum, l) => sum + Number(l.acceptedQuantity ?? l.deliveredQuantity) * Number(l.unitCost ?? 0), 0)
        list.push({
          kind: 'receipt',
          id: receipt.id,
          docNo: receipt.receiptNo,
          supplierName: sup,
          date: receipt.receivedAt ? formatTime(receipt.receivedAt) : '',
          status: receipt.status,
          amount,
          countText: `${receipt.lines.length} 个批次`,
          rawReceipt: receipt,
        })
      }
    }

    return list
  }, [docType, stage, search, ordersList, receiptsList, suppliers.data, items])

  // Keep selection valid
  const activeItem = useMemo(() => {
    if (selectedDocId) {
      const found = queueItems.find(it => it.id === selectedDocId && it.kind === selectedDocKind)
      if (found) return found
    }
    return queueItems[0]
  }, [queueItems, selectedDocId, selectedDocKind])

  useEffect(() => {
    if (activeItem && (activeItem.id !== selectedDocId || activeItem.kind !== selectedDocKind)) {
      setSelectedDocId(activeItem.id)
      setSelectedDocKind(activeItem.kind)
    }
  }, [activeItem, selectedDocId, selectedDocKind])

  return <>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {notice && <Alert>{notice}</Alert>}

    <Worklist
      title="采购与验收入库"
      copy="采购计划编制、审批流转、逐批质量验收与库存记账"
      loading={orders.isPending || receipts.isPending}
      empty={!ordersList.length && !receiptsList.length}
      action={<div className="warehouse-operation-actions">
        {site.siteType === 'PHARMACY' && (
          <span className="warehouse-guide-toggle-pill" title="门诊/住院等调剂药房日常药品补货主要通过【库间调拨】从中心药库调入；若有中药饮片、急救抢救药或特殊专病药品直采需求，亦可在此向供货商建单采购与到货验收。">
            <IconInfoCircle size={14} /> 药房补货指引
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={() => onNavigate('/settings/partners?tab=suppliers')}>供应商档案</Button>
        <Button size="sm" variant="secondary" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => { setPurchaseMode('plan'); setDialog('order') }}>
          <IconPlus size={14} /> 新建采购计划
        </Button>
        <Button size="sm" variant="primary" disabled={!isOperator} title={!isOperator ? '当前非管辖库房，仅供查阅' : undefined} onClick={() => { setPurchaseMode('direct'); setDialog('order') }}>
          <IconBolt size={14} /> 直接采购入库
        </Button>
      </div>}
    >
      {/* 顶部 KPI 业务指标看板 */}
      <div className="warehouse-kpi-strip">
        <div
          className={`warehouse-kpi-card ${stage === 'approval' && docType === 'orders' ? 'is-active' : ''}`}
          onClick={() => { setDocType('orders'); setStage(stage === 'approval' && docType === 'orders' ? 'all' : 'approval') }}
          role="button"
          tabIndex={0}
        >
          <div className="warehouse-kpi-icon warehouse-kpi-icon--blue"><IconFileText size={20} /></div>
          <div className="warehouse-kpi-content">
            <div className="warehouse-kpi-label">待审核采购计划</div>
            <div className="warehouse-kpi-value">{pendingApprovalCount} 单</div>
            <div className="warehouse-kpi-sub">待提交与领导审批</div>
          </div>
        </div>

        <div
          className={`warehouse-kpi-card ${stage === 'arrival' && docType === 'orders' ? 'is-active' : ''}`}
          onClick={() => { setDocType('orders'); setStage(stage === 'arrival' && docType === 'orders' ? 'all' : 'arrival') }}
          role="button"
          tabIndex={0}
        >
          <div className="warehouse-kpi-icon warehouse-kpi-icon--amber"><IconTruckDelivery size={20} /></div>
          <div className="warehouse-kpi-content">
            <div className="warehouse-kpi-label">在途待到货单</div>
            <div className="warehouse-kpi-value">{pendingArrivalCount} 单</div>
            <div className="warehouse-kpi-sub">已审批等待供货商送达</div>
          </div>
        </div>

        <div
          className={`warehouse-kpi-card ${stage === 'inspection' && docType === 'receipts' ? 'is-active' : ''}`}
          onClick={() => { setDocType('receipts'); setStage(stage === 'inspection' && docType === 'receipts' ? 'all' : 'inspection') }}
          role="button"
          tabIndex={0}
        >
          <div className="warehouse-kpi-icon warehouse-kpi-icon--purple"><IconChecklist size={20} /></div>
          <div className="warehouse-kpi-content">
            <div className="warehouse-kpi-label">待质量检验验收</div>
            <div className="warehouse-kpi-value">{pendingInspectionCount} 批</div>
            <div className="warehouse-kpi-sub">
              {pendingPostingCount > 0 ? `待质检 ${pendingInspectionCount} 批 · 待记账 ${pendingPostingCount} 批` : '货品已到库，等待药检'}
            </div>
          </div>
        </div>

        <div
          className={`warehouse-kpi-card ${stage === 'all' && docType === 'receipts' ? 'is-active' : ''}`}
          onClick={() => { setDocType('receipts'); setStage('all') }}
          role="button"
          tabIndex={0}
        >
          <div className="warehouse-kpi-icon warehouse-kpi-icon--emerald"><IconBuildingStore size={20} /></div>
          <div className="warehouse-kpi-content">
            <div className="warehouse-kpi-label">累计入库总额</div>
            <div className="warehouse-kpi-value">{postedReceipts.length > 0 ? formatMoney(totalPostedAmount) : '¥0.00'}</div>
            <div className="warehouse-kpi-sub">已记账入库 {postedReceipts.length} 笔</div>
          </div>
        </div>
      </div>

      {/* 左右分栏工作台 */}
      <div className="warehouse-purchase-workbench">
        {/* 左栏：单据队列与过滤器 */}
        <div className="warehouse-queue-pane">
          <div className="warehouse-queue-header">
            <div className="warehouse-queue-tabs" role="tablist">
              <button
                type="button"
                className={`warehouse-queue-tab ${docType === 'all' ? 'is-active' : ''}`}
                onClick={() => setDocType('all')}
              >
                全部单据 ({ordersList.length + receiptsList.length})
              </button>
              <button
                type="button"
                className={`warehouse-queue-tab ${docType === 'orders' ? 'is-active' : ''}`}
                onClick={() => setDocType('orders')}
              >
                采购计划 ({ordersList.length})
              </button>
              <button
                type="button"
                className={`warehouse-queue-tab ${docType === 'receipts' ? 'is-active' : ''}`}
                onClick={() => setDocType('receipts')}
              >
                验收入库单 ({receiptsList.length})
              </button>
            </div>

            <div className="warehouse-queue-stages" aria-label="单据阶段过滤">
              {[
                ['all', '全部'],
                ['pending', '待办'],
                ['approval', '待审核'],
                ['arrival', '待到货'],
                ['inspection', '待验收'],
                ['posting', '待入库'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  className={`warehouse-queue-stage-btn ${stage === val ? 'is-active' : ''}`}
                  onClick={() => setStage(val)}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="warehouse-queue-search">
              <input
                className="ui-field__control"
                aria-label="搜索采购入库单据"
                placeholder="单号、供应商、药品名称搜索..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="warehouse-queue-list">
            {!queueItems.length && (
              <p className="warehouse-entry-tip" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                当前筛选条件下暂无单据，请切换过滤或搜索条件。
              </p>
            )}
            {queueItems.map(item => {
              const isSelected = activeItem?.id === item.id && activeItem?.kind === item.kind
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  className={`warehouse-doc-card ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => { setSelectedDocId(item.id); setSelectedDocKind(item.kind); }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="warehouse-doc-card__top">
                    <span className={`warehouse-doc-card__type ${item.kind === 'order' ? 'warehouse-doc-card__type--po' : 'warehouse-doc-card__type--gr'}`}>
                      {item.kind === 'order' ? '采购单' : '验收单'}
                    </span>
                    <span className="warehouse-doc-card__no" title={item.docNo}>{item.docNo}</span>
                    <StatusBadge tone={statusTone(item.status)}>{statusText[item.status] ?? item.status}</StatusBadge>
                  </div>
                  <div className="warehouse-doc-card__body">
                    <span className="warehouse-doc-card__supplier" title={item.supplierName}>{item.supplierName}</span>
                    <span className="warehouse-doc-card__items">{item.countText}</span>
                  </div>
                  <div className="warehouse-doc-card__foot">
                    <span>{item.date}</span>
                    <strong className="warehouse-doc-card__amount">{formatMoney(item.amount)}</strong>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右栏：单据全景详情与就地作业台 */}
        {activeItem?.kind === 'order' && activeItem.rawOrder && (() => {
          const order = activeItem.rawOrder
          const completedLines = order.lines.filter(l => Number(l.remainingQuantity) === 0).length
          const totalAmount = order.lines.reduce((sum, l) => sum + Number(l.orderedQuantity) * Number(l.unitPrice), 0)
          const relatedReceipts = receiptsList.filter(r => r.purchaseOrderId === order.id)

          const isStep1 = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'COMPLETED'].includes(order.status)
          const isStep2 = ['APPROVED', 'PARTIALLY_RECEIVED', 'COMPLETED'].includes(order.status)
          const isStep3 = ['PARTIALLY_RECEIVED', 'COMPLETED'].includes(order.status)
          const isStep4 = order.status === 'COMPLETED'

          return <div className="warehouse-detail-pane">
            <div className="warehouse-detail-pane__head">
              <div className="warehouse-detail-pane__title">
                <span className="warehouse-doc-card__type warehouse-doc-card__type--po">采购订单</span>
                <h3>{order.orderNo}</h3>
                <StatusBadge tone={statusTone(order.status)}>{statusText[order.status] ?? order.status}</StatusBadge>
              </div>
              <div className="warehouse-detail-pane__actions">
                {order.status === 'DRAFT' && (
                  <Button size="sm" variant="primary" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate({ kind: 'submit', value: order })}>
                    提交审核
                  </Button>
                )}
                {order.status === 'SUBMITTED' && (
                  <Button size="sm" variant="primary" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate({ kind: 'approve', value: order })}>
                    审核通过
                  </Button>
                )}
                {['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status) && (
                  <Button size="sm" variant="primary" disabled={!isOperator} onClick={() => { setSelectedOrder(order); setDialog('receipt') }}>
                    登记到货
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => window.print()} title="打印该采购单">
                  <IconPrinter size={14} /> 打印采购单
                </Button>
              </div>
            </div>

            <div className="warehouse-meta-strip">
              <div className="warehouse-meta-item">
                <span>供应商</span>
                <strong>{activeItem.supplierName}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>下单日期</span>
                <strong>{order.orderDate}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>预计到货日期</span>
                <strong>{order.expectedDate || '未约定'}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>采购用途 / 说明</span>
                <strong>{order.description || '常规备药采购'}</strong>
              </div>
            </div>

            <div className="warehouse-doc-timeline" aria-label="采购订单业务流程">
              <div className={`warehouse-doc-timeline-step ${isStep1 ? (order.status === 'DRAFT' ? 'is-current' : 'is-done') : ''}`}>
                <div className="warehouse-doc-timeline-dot">1</div>
                <span>编制计划</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep2 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep2 ? (order.status === 'APPROVED' ? 'is-current' : 'is-done') : (order.status === 'SUBMITTED' ? 'is-current' : '')}`}>
                <div className="warehouse-doc-timeline-dot">2</div>
                <span>审核批准</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep3 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep3 ? (order.status === 'PARTIALLY_RECEIVED' ? 'is-current' : 'is-done') : ''}`}>
                <div className="warehouse-doc-timeline-dot">3</div>
                <span>供货到库</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep4 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep4 ? 'is-done' : ''}`}>
                <div className="warehouse-doc-timeline-dot">4</div>
                <span>全部验收入库</span>
              </div>
            </div>

            {relatedReceipts.length > 0 && <div className="warehouse-associated-bar">
              <span>已生成 {relatedReceipts.length} 笔关联到货验收单：</span>
              <div className="warehouse-operation-actions">
                {relatedReceipts.map(r => (
                  <Button key={r.id} size="sm" variant="text" onClick={() => { setDocType('receipts'); setSelectedDocId(r.id); setSelectedDocKind('receipt'); }}>
                    {r.receiptNo} ({statusText[r.status] ?? r.status})
                  </Button>
                ))}
              </div>
            </div>}

            <div className="warehouse-detail-table-wrap">
              <table className="warehouse-table">
                <thead>
                  <tr>
                    <th style={{ width: '3rem', textAlign: 'center' }}>#</th>
                    <th>药品品名与包装规格</th>
                    <th>生产厂家</th>
                    <th className={tableCellClass('numeric')}>计划采购量</th>
                    <th className={tableCellClass('numeric')}>采购单价</th>
                    <th className={tableCellClass('numeric')}>采购小计</th>
                    <th>到货状态</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line, idx) => {
                    const itm = items.find(i => i.id === line.stockItemId)
                    const lineTotal = Number(line.orderedQuantity) * Number(line.unitPrice)
                    const isFinished = Number(line.remainingQuantity) === 0
                    return <tr key={line.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <strong>{itm?.productName ?? line.stockItemId}</strong>
                        <small className="warehouse-entry-spec-inline">
                          <span>{itm?.packageSpec || '通用规格'}</span>
                          <span>1{itm?.packageUnitName || '盒'}={itm?.packageFactor || 1}{itm?.baseUnitCode || '粒'}</span>
                        </small>
                      </td>
                      <td>{itm?.manufacturerName || '—'}</td>
                      <td className={tableCellClass('numeric')}>
                        <strong>{formatQuantity(line.orderedQuantity)} {itm?.packageUnitName || '盒'}</strong>
                      </td>
                      <td className={tableCellClass('numeric')}>{formatMoney(line.unitPrice)}</td>
                      <td className={`${tableCellClass('numeric')} warehouse-entry-amount`}><strong>{formatMoney(lineTotal)}</strong></td>
                      <td>
                        <StatusBadge tone={isFinished ? 'success' : 'info'}>
                          {isFinished ? '全部已到货' : `剩余待收 ${formatQuantity(line.remainingQuantity)} ${itm?.packageUnitName || '盒'}`}
                        </StatusBadge>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>

            <div className="warehouse-detail-footer">
              <div>共 <strong>{order.lines.length}</strong> 个品规</div>
              <div className="warehouse-detail-footer__metrics">
                <span>已入库完成：<strong>{completedLines} / {order.lines.length}</strong> 项</span>
                <span>采购总额：<strong>{formatMoney(totalAmount)}</strong></span>
              </div>
            </div>
          </div>
        })()}

        {activeItem?.kind === 'receipt' && activeItem.rawReceipt && (() => {
          const receipt = activeItem.rawReceipt
          const sourceOrder = ordersList.find(o => o.id === receipt.purchaseOrderId)
          const totalCost = receipt.lines.reduce((sum, l) => sum + Number(l.acceptedQuantity ?? l.deliveredQuantity) * Number(l.unitCost ?? 0), 0)
          const totalDelivered = receipt.lines.reduce((sum, l) => sum + Number(l.deliveredQuantity), 0)
          const totalAccepted = receipt.lines.reduce((sum, l) => sum + Number(l.acceptedQuantity ?? 0), 0)
          const totalRejected = receipt.lines.reduce((sum, l) => sum + Number(l.rejectedQuantity ?? 0), 0)
          const hasTraceRequired = receipt.lines.some(l => items.find(i => i.id === l.stockItemId)?.traceRequired && Number(l.acceptedQuantity) > 0)

          const isStep1 = true
          const isStep2 = ['INSPECTING', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'POSTED'].includes(receipt.status)
          const isStep3 = ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'POSTED'].includes(receipt.status)
          const isStep4 = receipt.status === 'POSTED'

          return <div className="warehouse-detail-pane">
            <div className="warehouse-detail-pane__head">
              <div className="warehouse-detail-pane__title">
                <span className="warehouse-doc-card__type warehouse-doc-card__type--gr">到货验收单</span>
                <h3>{receipt.receiptNo}</h3>
                <StatusBadge tone={statusTone(receipt.status)}>{statusText[receipt.status] ?? receipt.status}</StatusBadge>
              </div>
              <div className="warehouse-detail-pane__actions">
                {receipt.status === 'RECEIVED' && (
                  <Button size="sm" variant="primary" disabled={!isOperator} onClick={() => setInspection(receipt)}>
                    逐批质量验收
                  </Button>
                )}
                {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && hasTraceRequired && (
                  <Button size="sm" variant="secondary" disabled={!isOperator} onClick={() => setTraceReceipt(receipt)}>
                    登记追溯码
                  </Button>
                )}
                {['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) && (
                  <Button size="sm" variant="primary" busy={action.isPending} disabled={!isOperator} onClick={() => action.mutate({ kind: 'post', value: receipt })}>
                    批量入库记账
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => window.print()} title="打印验收凭证">
                  <IconPrinter size={14} /> 打印入库单
                </Button>
              </div>
            </div>

            <div className="warehouse-meta-strip">
              <div className="warehouse-meta-item">
                <span>供货商</span>
                <strong>{activeItem.supplierName}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>到货时间</span>
                <strong>{formatTime(receipt.receivedAt)}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>随货送货单号</span>
                <strong>{receipt.deliveryNoteNo || '未填写'}</strong>
              </div>
              <div className="warehouse-meta-item">
                <span>来源采购计划</span>
                {sourceOrder ? (
                  <button className="warehouse-inline-action" onClick={() => { setDocType('orders'); setSelectedDocId(sourceOrder.id); setSelectedDocKind('order'); }}>
                    {sourceOrder.orderNo}
                  </button>
                ) : (
                  <strong>{receipt.purchaseOrderId || '直接采购入库'}</strong>
                )}
              </div>
            </div>

            <div className="warehouse-doc-timeline" aria-label="验收入库业务流程">
              <div className={`warehouse-doc-timeline-step ${isStep1 ? (receipt.status === 'RECEIVED' ? 'is-current' : 'is-done') : ''}`}>
                <div className="warehouse-doc-timeline-dot">1</div>
                <span>到货登记</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep2 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep2 ? (receipt.status === 'INSPECTING' ? 'is-current' : 'is-done') : ''}`}>
                <div className="warehouse-doc-timeline-dot">2</div>
                <span>逐批质量验收</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep3 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep3 ? (['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status) ? 'is-current' : 'is-done') : ''}`}>
                <div className="warehouse-doc-timeline-dot">3</div>
                <span>追溯码采集</span>
              </div>
              <div className={`warehouse-doc-timeline-line ${isStep4 ? 'is-done' : ''}`} />
              <div className={`warehouse-doc-timeline-step ${isStep4 ? 'is-done' : ''}`}>
                <div className="warehouse-doc-timeline-dot">4</div>
                <span>已入库记账</span>
              </div>
            </div>

            <div className="warehouse-detail-table-wrap">
              <table className="warehouse-table">
                <thead>
                  <tr>
                    <th style={{ width: '3rem', textAlign: 'center' }}>#</th>
                    <th>药品品名与规格</th>
                    <th>批号 / 效期</th>
                    <th className={tableCellClass('numeric')}>到货数</th>
                    <th className={tableCellClass('numeric')}>合格 / 拒收</th>
                    <th>存放货位</th>
                    <th className={tableCellClass('numeric')}>采购进价</th>
                    <th className={tableCellClass('numeric')}>入库金额</th>
                    <th>质量状态</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((line, idx) => {
                    const itm = items.find(i => i.id === line.stockItemId)
                    const bin = bins.find(b => b.id === line.destinationBinId)
                    const acceptedQty = line.acceptedQuantity ?? line.deliveredQuantity
                    const lineCost = acceptedQty * Number(line.unitCost ?? 0)
                    return <tr key={line.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <strong>{itm?.productName ?? line.stockItemId}</strong>
                        <small className="warehouse-entry-spec-inline">
                          <span>{itm?.packageSpec || '通用规格'}</span>
                          <span>{itm?.manufacturerName || ''}</span>
                        </small>
                      </td>
                      <td>
                        <code>{line.lotNo}</code>
                        <small>效期至：{line.expiryDate || '未维护'}</small>
                      </td>
                      <td className={tableCellClass('numeric')}>
                        <strong>{formatQuantity(line.deliveredQuantity)} {itm?.packageUnitName || '盒'}</strong>
                      </td>
                      <td className={tableCellClass('numeric')}>
                        <span style={{ color: '#059669', fontWeight: 600 }}>{formatQuantity(line.acceptedQuantity ?? line.deliveredQuantity)}</span>
                        {Boolean(line.rejectedQuantity && line.rejectedQuantity > 0) && (
                          <small style={{ color: 'var(--color-danger)' }}>
                            拒收 {line.rejectedQuantity} ({line.rejectionReason || '破损'})
                          </small>
                        )}
                      </td>
                      <td>{bin?.name || '中心合格品库'}</td>
                      <td className={tableCellClass('numeric')}>{line.unitCost ? formatMoney(line.unitCost) : '—'}</td>
                      <td className={`${tableCellClass('numeric')} warehouse-entry-amount`}><strong>{formatMoney(lineCost)}</strong></td>
                      <td>
                        <StatusBadge tone={statusTone(line.qualityStatus)}>{statusText[line.qualityStatus] ?? line.qualityStatus}</StatusBadge>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>

            <div className="warehouse-detail-footer">
              <div>共 <strong>{receipt.lines.length}</strong> 批次</div>
              <div className="warehouse-detail-footer__metrics">
                <span>实收总数：<strong>{formatQuantity(totalDelivered)}</strong></span>
                <span>合格总数：<strong style={{ color: '#059669' }}>{formatQuantity(totalAccepted || totalDelivered)}</strong></span>
                {totalRejected > 0 && <span>拒收总数：<strong style={{ color: 'var(--color-danger)' }}>{formatQuantity(totalRejected)}</strong></span>}
                <span>入库采购总额：<strong>{formatMoney(totalCost)}</strong></span>
              </div>
            </div>
          </div>
        })()}

        {!activeItem && (
          <div className="warehouse-detail-pane" style={{ alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem' }}>
            <EmptyState icon="pharmacy" title="未选中任何单据" copy="请从左侧单据队列中选择采购计划单或到货验收单查看明细。" />
          </div>
        )}
      </div>
    </Worklist>

    {dialog === 'order' && <PurchaseDialog api={api} site={site} suppliers={(suppliers.data ?? []).filter(supplierEffective)} items={items} bins={bins}
      orders={orders.data ?? []} products={productsList}
      initialMode={purchaseMode}
      onNavigate={onNavigate} onClose={() => setDialog(undefined)} onDone={message => { setNotice(message ?? ''); void refresh(); setDialog(undefined); setStage(purchaseMode === 'direct' ? 'posting' : 'approval') }} />}
    {dialog === 'receipt' && selectedOrder && <GoodsReceiptDialog api={api} order={selectedOrder} receipts={receipts.data ?? []} items={items} bins={bins} onClose={() => setDialog(undefined)} onDone={receipt => { void refresh(); setDialog(undefined); setInspection(receipt) }} />}
    {inspection && <GoodsInspectionDialog api={api} receipt={inspection} items={items} onClose={() => setInspection(undefined)} onDone={() => { void refresh(); setInspection(undefined); setStage('posting') }} />}
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

export function MultiItemDialog({
  title, submitText, items, quantityLabel, withPrice = false, showBaseConversion = false,
  orders = [], products = [], supplierItems,
  lead, emptyCopy = '当前没有可选经营项目。', hideReason = false, onClose, onSubmit,
}: {
  title: string; submitText: string; items: StockItem[]; quantityLabel: string; withPrice?: boolean
  orders?: PurchaseOrder[]; products?: MedicationProduct[]
  supplierItems?: Array<{ catalogItemId?: string; packageId?: string; agreementPrice?: number }>
  showBaseConversion?: boolean; lead?: ReactNode; emptyCopy?: string; hideReason?: boolean; onClose: () => void
  onSubmit: (reason: string, rows: ItemRow[]) => Promise<void>
}) {
  const [rows, setRows] = useState<EntryRow[]>([
    { key: 'row-0', stockItemId: '', quantity: '1', price: '' },
  ])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

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
    const selectedItem = itemMap.get(val)
    let defaultPrice: string | undefined
    if (withPrice && selectedItem) {
      const prices = resolveItemDefaultPrices(selectedItem, orders, products, supplierItems)
      defaultPrice = prices.purchasePrice
    }
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      return {
        ...row,
        stockItemId: val,
        price: defaultPrice !== undefined ? defaultPrice : row.price,
      }
    }))
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
    const isValid = Boolean(item && Number.isFinite(qty) && qty > 0 && (!withPrice || (Number.isFinite(prc) && prc >= 0 && row.price.trim() !== '')))
    return { item, quantity: qty, price: prc, isValid }
  }).filter((v): v is { item: StockItem; quantity: number; price: number; isValid: true } => v.isValid)

  const enteredRows = rows.filter(row => row.stockItemId || row.price.trim() || !['', '1'].includes(row.quantity))
  const incomplete = enteredRows.length !== validRows.length
  const duplicate = new Set(validRows.map(row => row.item.id)).size !== validRows.length
  const totalAmount = validRows.reduce((sum, r) => sum + r.quantity * r.price, 0)
  const canSubmit = validRows.length > 0 && !incomplete && !duplicate && !busy

  const triggerSubmit = async () => {
    setHasAttemptedSubmit(true)
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

  return <Dialog title={title} eyebrow="批量业务" size="xwide" className="warehouse-purchase-dialog" onClose={busy ? () => {} : onClose} closeOnBackdrop={!busy} footer={<div className="warehouse-entry-dialog-footer">
    <div className="warehouse-entry-summary">
      <span>已录入 <strong>{validRows.length}</strong> 个品种</span>
      <span>按包装单位计算</span>
      {withPrice && <span>预估总金额 <strong className="warehouse-entry-total">{formatMoney(totalAmount)}</strong></span>}
    </div>
    <div className="warehouse-entry-actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!canSubmit} onClick={triggerSubmit}>{submitText}</Button>
    </div>
  </div>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {lead}
    {hasAttemptedSubmit && incomplete && <p role="status" className="warehouse-receipt-error">请补全已填写行的药品、正数数量{withPrice ? '和非负单价' : ''}，或删除该行。</p>}
    {hasAttemptedSubmit && duplicate && <p role="status" className="warehouse-receipt-error">同一药品包装重复，请合并数量后提交。</p>}
    {!hideReason && <FormField label="用途说明">
      <input className="ui-field__control" value={reason} onChange={e => setReason(e.target.value)} placeholder="填写本次业务用途（选填）" />
    </FormField>}

    {!items.length ? <EmptyState icon="pharmacy" title="暂无可选择的经营项目" copy={emptyCopy} />
      : <div className="warehouse-entry-table-container">
        <div className="warehouse-entry-table-wrap">
          <EditableTable className="warehouse-entry-table" aria-label="药品连续录入" onAppendRow={() => addRow(true)}>
            <thead>
              <tr>
                <th style={{ width: '3rem', textAlign: 'center' }}>#</th>
                <th style={{ minWidth: '16rem' }}>选择药品</th>
                <th style={{ width: '14rem' }}>包装规格 / 厂家</th>
                <th className={tableCellClass('numeric')} style={{ width: '10rem' }}>{quantityLabel}</th>
                {withPrice && <th className={tableCellClass('numeric')} style={{ width: '10rem' }}>采购单价</th>}
                {withPrice && <th className={tableCellClass('numeric')} style={{ width: '9rem' }}>金额小计</th>}
                <th style={{ width: '4.5rem', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const item = itemMap.get(row.stockItemId)
                const lineTotal = item && withPrice && Number(row.quantity) > 0 && Number(row.price) >= 0
                  ? Number(row.quantity) * Number(row.price)
                  : 0
                return <EditableRow key={row.key}>
                  <td className="warehouse-entry-index">{index + 1}</td>
                  <EditableCell display={item?.productName} placeholder="输入药品名称、拼音或编码搜索">
                    <div ref={el => { selectWrapperRefs.current[row.key] = el }}>
                      <Select searchable showValue popoverMinWidth={520} value={row.stockItemId}
                        aria-label={`第${index + 1}行药品`}
                        onChange={(val) => handleItemSelect(index, val)}
                        placeholder="输入药品名称、拼音或编码搜索"
                        options={itemOptions} />
                    </div>
                  </EditableCell>
                  <td>
                    {item ? <div className="warehouse-entry-spec-inline" title={`换算比: 1 ${item.packageUnitName} = ${formatQuantity(item.packageFactor)} ${displayUnitName(item.baseUnitCode)}`}>
                      <strong>{item.packageSpec || item.packageUnitName}</strong>
                      <small>{[item.manufacturerName, `1${item.packageUnitName}=${formatQuantity(item.packageFactor)}${displayUnitName(item.baseUnitCode)}`].filter(Boolean).join(' · ')}</small>
                      {showBaseConversion && Number(row.quantity) > 0 && <span className="warehouse-entry-conv">折合 {formatQuantity(Number(row.quantity) * item.packageFactor)} {displayUnitName(item.baseUnitCode)}</span>}
                    </div> : <span className="warehouse-entry-placeholder">自动带入</span>}
                  </td>
                  <EditableCell className={tableCellClass('numeric')} display={`${row.quantity || '—'} ${item?.packageUnitName ?? ''}`}>
                      <UnitNumberInput
                        inputRef={el => { quantityInputRefs.current[row.key] = el }}
                        unit={item?.packageUnitName ?? ''} unitReadOnly
                        min="0.0001"
                        step="any"
                        value={row.quantity}
                        onValueChange={(value) => updateRow(index, 'quantity', value)}
                        onKeyDown={(e) => handleQuantityKeyDown(e, index)}
                        aria-label={`第${index + 1}行数量`}
                        placeholder="数量"
                      />
                  </EditableCell>
                  {withPrice && <EditableCell className={tableCellClass('numeric')} display={row.price ? `${formatQuantity(Number(row.price))} 元` : undefined}>
                      <UnitNumberInput
                        inputRef={el => { priceInputRefs.current[row.key] = el }}
                        unit="元" unitReadOnly
                        min="0"
                        step="0.01"
                        value={row.price}
                        onValueChange={(value) => updateRow(index, 'price', value)}
                        onKeyDown={(e) => handlePriceKeyDown(e, index)}
                        aria-label={`第${index + 1}行采购单价`}
                        placeholder="0.00"
                      />
                  </EditableCell>}
                  {withPrice && <td className={`${tableCellClass('numeric')} warehouse-entry-amount`}>
                    {lineTotal > 0 ? formatMoney(lineTotal) : '—'}
                  </td>}
                  <td style={{ textAlign: 'center' }}>
                    <Button variant="text" size="sm" onClick={() => removeRow(index)} title="删除此行"><IconTrash size={14} /> 删除</Button>
                  </td>
                </EditableRow>
              })}
            </tbody>
          </EditableTable>
        </div>
        <div className="warehouse-entry-add-bar">
          <Button size="sm" variant="secondary" onClick={() => addRow(true)}><IconPlus size={15} /> 添加一行药品 (Enter)</Button>
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

export function DirectPurchaseReceiptDialog({
  api, site, suppliers, items, bins = [],
  orders = [], products = [], supplierItems,
  onNavigate, onClose, onDone, onSwitchMode,
}: {
  api: RhnApi; site: StockSite; suppliers: Awaited<ReturnType<RhnApi['pharmacy']['suppliers']>>; items: StockItem[]
  orders?: PurchaseOrder[]; products?: MedicationProduct[]
  supplierItems?: Array<{ catalogItemId?: string; packageId?: string; agreementPrice?: number }>
  bins?: StockBin[]; onNavigate: (path: string) => void; onClose: () => void; onDone: (message?: string) => void
  onSwitchMode?: (mode: 'plan' | 'direct') => void
}) {
  const receiveBins = bins.filter(v => v.active && v.receiveAllowed)
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16)
  })
  const [commonBin, setCommonBin] = useState(receiveBins[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  type DirectRow = {
    key: string; stockItemId: string; quantity: string; price: string; salePrice?: string
    lotNo: string; productionDate: string; expiryDate: string; binId: string
  }
  const [rows, setRows] = useState<DirectRow[]>([
    { key: 'row-0', stockItemId: '', quantity: '1', price: '', salePrice: '', lotNo: '', productionDate: '', expiryDate: '', binId: '' },
  ])

  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const itemOptions = useMemo(() => items.map(item => ({
    value: item.id,
    label: item.productName,
    secondaryText: [item.packageSpec || item.packageUnitName, item.manufacturerName].filter(Boolean).join(' · '),
    searchKeywords: [item.productCode, item.manufacturerName ?? '', item.packageSpec ?? ''].filter(Boolean),
  })), [items])

  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const selectWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const focusSelect = (key: string) => {
    setTimeout(() => {
      const btn = selectWrapperRefs.current[key]?.querySelector<HTMLButtonElement>('button[role="combobox"]')
      if (btn) { btn.focus(); btn.click() }
    }, 60)
  }

  const focusField = (refMap: React.MutableRefObject<Record<string, HTMLInputElement | null>>, key: string) => {
    setTimeout(() => {
      const input = refMap.current[key]
      if (input) { input.focus(); input.select() }
    }, 60)
  }

  const addRow = (autoFocus = true) => {
    const newKey = `row-${Date.now()}-${Math.random()}`
    setRows(prev => [...prev, { key: newKey, stockItemId: '', quantity: '1', price: '', salePrice: '', lotNo: '', productionDate: '', expiryDate: '', binId: '' }])
    if (autoFocus) focusSelect(newKey)
    return newKey
  }

  const removeRow = (index: number) => {
    setRows(prev => {
      if (prev.length <= 1) {
        const resetKey = `row-${Date.now()}`
        focusSelect(resetKey)
        return [{ key: resetKey, stockItemId: '', quantity: '1', price: '', salePrice: '', lotNo: '', productionDate: '', expiryDate: '', binId: '' }]
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const updateRow = (index: number, field: keyof DirectRow, value: string) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  const handleItemSelect = (index: number, val: string) => {
    const selectedItem = itemMap.get(val)
    const defaultPrices = resolveItemDefaultPrices(selectedItem, orders, products, supplierItems)
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      return {
        ...row,
        stockItemId: val,
        price: defaultPrices.purchasePrice !== undefined ? defaultPrices.purchasePrice : row.price,
        salePrice: defaultPrices.salePrice !== undefined ? defaultPrices.salePrice : (row.salePrice ?? ''),
      }
    }))
    const currentRow = rows[index]
    if (currentRow) focusField(quantityInputRefs, currentRow.key)
  }

  const validRows = rows.map(row => {
    const item = itemMap.get(row.stockItemId)
    const qty = Number(row.quantity)
    const prc = Number(row.price)
    const hasItem = Boolean(item)
    const hasQty = Number.isFinite(qty) && qty > 0
    const hasPrc = Number.isFinite(prc) && prc >= 0 && row.price.trim() !== ''
    const hasLot = !item?.lotRequired || Boolean(row.lotNo.trim())
    const hasExpiry = !item?.lotRequired || Boolean(row.expiryDate)
    const dateValid = !row.productionDate || !row.expiryDate || row.productionDate <= row.expiryDate
    const hasBin = Boolean(row.binId || commonBin)
    const isValid = Boolean(hasItem && hasQty && hasPrc && hasLot && hasExpiry && dateValid && hasBin)
    return { item, quantity: qty, price: prc, salePrice: row.salePrice, lotNo: row.lotNo, productionDate: row.productionDate, expiryDate: row.expiryDate, binId: row.binId, isValid }
  }).filter((v): v is { item: StockItem; quantity: number; price: number; salePrice: string | undefined; lotNo: string; productionDate: string; expiryDate: string; binId: string; isValid: true } => Boolean(v.isValid && v.item))

  const enteredRows = rows.filter(r => r.stockItemId || r.price.trim() || r.lotNo.trim() || !['', '1'].includes(r.quantity))
  const incomplete = enteredRows.length !== validRows.length
  const totalAmount = validRows.reduce((sum, r) => sum + r.quantity * r.price, 0)
  const totalSaleAmount = validRows.reduce((sum, r) => sum + r.quantity * (Number(r.salePrice) || 0), 0)
  const canSubmit = validRows.length > 0 && !incomplete && Boolean(supplierId) && Boolean(commonBin || validRows.every(r => r.binId)) && !busy

  const triggerSubmit = async () => {
    setHasAttemptedSubmit(true)
    if (!canSubmit) return
    setBusy(true); setError(undefined)
    try {
      await api.pharmacy.directGoodsReceipt({
        stockSiteId: site.id,
        supplierId,
        requestCode: `DIR-GR-${crypto.randomUUID()}`,
        deliveryNoteNo: deliveryNoteNo.trim() || undefined,
        receivedAt: new Date(receivedAt).toISOString(),
        description: reason.trim() || undefined,
        lines: validRows.map(r => ({
          stockItemId: r.item.id,
          packageId: r.item.packageId,
          destinationBinId: r.binId || commonBin,
          lotNo: r.lotNo.trim() || 'NO-LOT',
          productionDate: r.productionDate || undefined,
          expiryDate: r.expiryDate || undefined,
          quantity: r.quantity,
          unitPrice: r.price,
        })),
      })
      onDone('直接采购入库完成：已生成采购凭证并一步完成质量验收与库存记账')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!suppliers.length) return <Dialog title="采购直接入库" eyebrow="现购随到即入" onClose={onClose}><EmptyState icon="pharmacy"
    title="请先维护供应商" copy="当前机构没有可用供应商，请先前往基础档案维护。"
    action={<Button onClick={() => { onClose(); onNavigate('/settings/partners?tab=suppliers') }}>前往供应商档案</Button>} /></Dialog>

  return <Dialog title="直接采购入库" eyebrow="现购入库 · 免审直通" size="xwide" className="warehouse-purchase-dialog" onClose={busy ? () => {} : onClose} closeOnBackdrop={!busy} footer={<div className="warehouse-entry-dialog-footer">
    <div className="warehouse-entry-summary">
      <span>已录入 <strong>{validRows.length}</strong> 个品种</span>
      <span>直接记账入库</span>
      <span>进价总额 <strong className="warehouse-entry-total">{formatMoney(totalAmount)}</strong></span>
      {totalSaleAmount > 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-small)' }}>售价总额 <strong>{formatMoney(totalSaleAmount)}</strong></span>}
    </div>
    <div className="warehouse-entry-actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!canSubmit} onClick={triggerSubmit}>直接验收入库并记账</Button>
    </div>
  </div>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <div className="warehouse-purchase-mode-tabs" role="tablist" aria-label="采购场景模式">
      <button type="button" role="tab" aria-selected={false} className="warehouse-purchase-mode-tab" onClick={() => onSwitchMode?.('plan')}>
        <IconClipboardList size={15} /> 采购计划（报审流）
      </button>
      <button type="button" role="tab" aria-selected={true} className="warehouse-purchase-mode-tab is-active" onClick={() => onSwitchMode?.('direct')}>
        <IconBolt size={15} /> 直接入库（现购免审）
      </button>
    </div>
    <div className="warehouse-header-grid">
      <FormField label="供应商" required>
        <Select value={supplierId} onChange={setSupplierId} clearable={false} showValue options={suppliers.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} />
      </FormField>
      <FormField label="送货单号">
        <input className="ui-field__control" value={deliveryNoteNo} onChange={e => setDeliveryNoteNo(e.target.value)} placeholder="随货凭单号（选填）" />
      </FormField>
      <FormField label="统一收货货位" required={!receiveBins.length}>
        <Select value={commonBin} onChange={setCommonBin} clearable={false} showValue
          placeholder={receiveBins.length ? '应用于未单独指定行' : '请先维护合格货位'}
          options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} />
      </FormField>
      <FormField label="入库时间">
        <input type="datetime-local" className="ui-field__control" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} />
      </FormField>
      <FormField label="入库用途说明">
        <input className="ui-field__control" value={reason} onChange={e => setReason(e.target.value)} placeholder="如：紧急现购、特需调入（选填）" />
      </FormField>
    </div>

    {hasAttemptedSubmit && incomplete && <p role="status" className="warehouse-receipt-error">请补全已录入行的药品、正数数量、单价、批号与有效期，或删除未填完行。</p>}
    {!receiveBins.length && <p role="status" className="warehouse-receipt-error">当前库房没有允许收货的货位，请先维护货位。</p>}

    {!items.length ? <EmptyState icon="pharmacy" title="暂无可选择的经营项目" copy="当前没有可选药品" />
      : <div className="warehouse-entry-table-container">
        <div className="warehouse-entry-table-wrap">
          <EditableTable className="warehouse-entry-table warehouse-entry-table--receipt" aria-label="直接入库药品连续录入" onAppendRow={() => addRow(true)}>
            <thead>
              <tr>
                <th style={{ width: '2.5rem', textAlign: 'center' }}>#</th>
                <th style={{ minWidth: '12rem' }}>药品</th>
                <th style={{ width: '10.5rem' }}>包装规格 / 厂家</th>
                <th className={tableCellClass('numeric')} style={{ width: '7.5rem' }}>入库数量</th>
                <th className={tableCellClass('numeric')} style={{ width: '7.5rem' }}>采购单价</th>
                <th className={tableCellClass('numeric')} style={{ width: '7.5rem' }}>零售单价</th>
                <th style={{ width: '8rem' }}>批号</th>
                <th style={{ width: '11rem' }}>有效期至</th>
                <th style={{ width: '8.5rem' }}>货位</th>
                <th className={tableCellClass('numeric')} style={{ width: '7rem' }}>小计</th>
                <th style={{ width: '3.5rem', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const item = itemMap.get(row.stockItemId)
                const lineTotal = item && Number(row.quantity) > 0 && Number(row.price) >= 0
                  ? Number(row.quantity) * Number(row.price)
                  : 0
                return <EditableRow key={row.key}>
                  <td className="warehouse-entry-index">{index + 1}</td>
                  <EditableCell display={item?.productName} placeholder="拼音/名称搜索药品">
                    <div ref={el => { selectWrapperRefs.current[row.key] = el }}>
                      <Select searchable showValue popoverMinWidth={480} value={row.stockItemId}
                        aria-label={`第${index + 1}行药品`}
                        onChange={val => handleItemSelect(index, val)}
                        placeholder="拼音/名称搜索药品" options={itemOptions} />
                    </div>
                  </EditableCell>
                  <td>
                    {item ? <div className="warehouse-entry-spec-inline" title={`1 ${item.packageUnitName} = ${formatQuantity(item.packageFactor)} ${displayUnitName(item.baseUnitCode)}`}>
                      <strong>{item.packageSpec || item.packageUnitName}</strong>
                      <small>{[item.manufacturerName, `1${item.packageUnitName}=${formatQuantity(item.packageFactor)}${displayUnitName(item.baseUnitCode)}`].filter(Boolean).join(' · ')}</small>
                    </div> : <span className="warehouse-entry-placeholder">自动带入</span>}
                  </td>
                  <EditableCell className={tableCellClass('numeric')} display={`${row.quantity || '—'} ${item?.packageUnitName ?? ''}`}>
                    <UnitNumberInput inputRef={el => { quantityInputRefs.current[row.key] = el }}
                      unit={item?.packageUnitName ?? ''} unitReadOnly min="0.0001" step="any"
                      value={row.quantity} onValueChange={value => updateRow(index, 'quantity', value)}
                      aria-label={`第${index + 1}行数量`} placeholder="数量" />
                  </EditableCell>
                  <EditableCell className={tableCellClass('numeric')} display={row.price ? `${formatQuantity(Number(row.price))} 元` : undefined}>
                    <UnitNumberInput unit="元" unitReadOnly min="0" step="0.01"
                      value={row.price} onValueChange={value => updateRow(index, 'price', value)}
                      aria-label={`第${index + 1}行采购单价`} placeholder="0.00" />
                  </EditableCell>
                  <EditableCell className={tableCellClass('numeric')} display={row.salePrice ? `${formatQuantity(Number(row.salePrice))} 元` : undefined}>
                    <UnitNumberInput unit="元" unitReadOnly min="0" step="0.01"
                      value={row.salePrice ?? ''} onValueChange={value => updateRow(index, 'salePrice', value)}
                      aria-label={`第${index + 1}行零售单价`} placeholder="0.00" />
                  </EditableCell>
                  <EditableCell display={row.lotNo} placeholder={item?.lotRequired ? '必填批号' : '批号'}>
                    <input
                      className="ui-field__control" value={row.lotNo}
                      onChange={e => updateRow(index, 'lotNo', e.target.value)}
                      aria-label={`第${index + 1}行批号`} placeholder={item?.lotRequired ? '必填批号' : '批号'} />
                  </EditableCell>
                  <EditableCell display={row.expiryDate} placeholder="YYYY-MM-DD">
                    <DatePicker
                      value={row.expiryDate}
                      onChange={val => updateRow(index, 'expiryDate', val)}
                      aria-label={`第${index + 1}行有效期至`}
                      placeholder="YYYY-MM-DD"
                    />
                  </EditableCell>
                  <EditableCell display={receiveBins.find(bin => bin.id === (row.binId || commonBin))?.name}>
                    <Select value={row.binId || commonBin} clearable={false} searchable={false} openOnFocus={false} popoverMinWidth={220}
                      onChange={value => updateRow(index, 'binId', value)} aria-label={`第${index + 1}行货位`}
                      options={receiveBins.map(bin => ({ value: bin.id, label: bin.name }))} />
                  </EditableCell>
                  <td className={`${tableCellClass('numeric')} warehouse-entry-amount`}>{lineTotal > 0 ? formatMoney(lineTotal) : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Button variant="text" size="sm" onClick={() => removeRow(index)} title="删除行"><IconTrash size={14} /> 删除</Button>
                  </td>
                </EditableRow>
              })}
            </tbody>
          </EditableTable>
        </div>
        <div className="warehouse-entry-add-bar">
          <Button size="sm" variant="secondary" onClick={() => addRow(true)}><IconPlus size={15} /> 添加一行药品 (Enter)</Button>
        </div>
      </div>}
  </Dialog>
}

export function PurchaseDialog({
  api, site, suppliers, items, bins = [], initialMode = 'plan',
  orders = [], products = [],
  onNavigate, onClose, onDone,
}: {
  api: RhnApi; site: StockSite; suppliers: Awaited<ReturnType<RhnApi['pharmacy']['suppliers']>>; items: StockItem[]
  bins?: StockBin[]; initialMode?: 'plan' | 'direct'
  orders?: PurchaseOrder[]; products?: MedicationProduct[]
  onNavigate: (path: string) => void; onClose: () => void; onDone: (message?: string) => void
}) {
  const [mode, setMode] = useState<'plan' | 'direct'>(initialMode)
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [expectedDate, setExpectedDate] = useState('')
  const [submitNow, setSubmitNow] = useState(true)
  const [reason, setReason] = useState('')
  const [supplierItems, setSupplierItems] = useState<Array<{ catalogItemId?: string; packageId?: string; agreementPrice?: number }>>([])
  useEffect(() => {
    if (!supplierId || !api.pharmacy?.supplyItems) return
    let cancelled = false
    api.pharmacy.supplyItems(supplierId).then(list => {
      if (!cancelled && Array.isArray(list)) setSupplierItems(list)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [api.pharmacy, supplierId])

  const [requestCode] = useState(() => `PO-${crypto.randomUUID()}`)

  if (!suppliers.length) return <Dialog title="新建采购单" eyebrow="采购作业" onClose={onClose}><EmptyState icon="pharmacy"
    title="请先维护供应商" copy="当前机构没有可用供应商，请先前往基础档案维护。"
    action={<Button onClick={() => { onClose(); onNavigate('/settings/partners?tab=suppliers') }}>前往供应商档案</Button>} /></Dialog>

  if (mode === 'direct') {
    return <DirectPurchaseReceiptDialog api={api} site={site} suppliers={suppliers} items={items} bins={bins}
      orders={orders} products={products} supplierItems={supplierItems}
      onNavigate={onNavigate} onClose={onClose} onDone={onDone} onSwitchMode={setMode} />
  }

  return <MultiItemDialog title="新建采购计划" submitText={submitNow ? '保存并提交审核' : '保存草稿'} items={items} quantityLabel="采购数量（包装）" withPrice
    hideReason={true} orders={orders} products={products} supplierItems={supplierItems}
    lead={<>
      <div className="warehouse-purchase-mode-tabs" role="tablist" aria-label="采购场景模式">
        <button type="button" role="tab" aria-selected={true} className="warehouse-purchase-mode-tab is-active" onClick={() => setMode('plan')}>
          <IconClipboardList size={15} /> 采购计划（报审流）
        </button>
        <button type="button" role="tab" aria-selected={false} className="warehouse-purchase-mode-tab" onClick={() => setMode('direct')}>
          <IconBolt size={15} /> 直接入库（现购免审）
        </button>
      </div>
      <div className="warehouse-header-grid">
        <FormField label="供应商" required>
          <Select value={supplierId} onChange={setSupplierId} clearable={false} showValue options={suppliers.map(v => ({ value: v.id, label: v.name, secondaryText: v.code }))} />
        </FormField>
        <FormField label="预计到货日期">
          <DatePicker value={expectedDate}
            min={new Date().toISOString().slice(0, 10)} onChange={val => setExpectedDate(val)} placeholder="YYYY-MM-DD" />
        </FormField>
        <FormField label="计划用途说明">
          <input className="ui-field__control" value={reason} onChange={event => setReason(event.target.value)} placeholder="如：常规月度补货（选填）" />
        </FormField>
        <label className="warehouse-purchase-submit-option" style={{ alignSelf: 'center', margin: 0, padding: '0.4rem 0' }}>
          <input type="checkbox" checked={submitNow} onChange={event => setSubmitNow(event.target.checked)} /> 保存后提交审核
        </label>
      </div>
    </>}
    onClose={onClose} onSubmit={async (description, rows) => {
    for (const row of rows) { try { await api.pharmacy.addSupplierItem(supplierId, { catalogItemId: row.item.catalogItemId, packageId: row.item.packageId, agreementPrice: row.price }) } catch (error) { if ((error as { code?: string }).code !== 'SUPPLIER_ITEM_DUPLICATE') throw error } }
    const order = await api.pharmacy.createPurchaseOrder({ stockSiteId: site.id, supplierId, requestCode,
      expectedDate: expectedDate || undefined, description: reason || description || undefined, lines: rows.map(row => ({ stockItemId: row.item.id,
        packageId: row.item.packageId, orderedQuantity: row.quantity, unitPrice: row.price })) })
    if (submitNow) {
      try { await api.pharmacy.submitPurchaseOrder(order.id) }
      catch (error) { onDone(`采购单 ${order.orderNo} 已保存，提交结果待确认：${errorMessage(error)}。请查看单据状态后继续办理。`); return }
    }
    onDone()
  }} />
}

export function purchaseReceivable(order: PurchaseOrder, receipts: GoodsReceipt[]) {
  const outstanding = new Map<string, number>()
  receipts.filter(receipt => receipt.purchaseOrderId === order.id
    && ['RECEIVED', 'INSPECTING', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status))
    .forEach(receipt => receipt.lines.forEach(line => outstanding.set(line.purchaseOrderLineId,
      (outstanding.get(line.purchaseOrderLineId) ?? 0) + Number(line.deliveredQuantity))))
  return order.lines.map(line => ({ ...line, availableQuantity: Math.max(0,
    Number(line.remainingQuantity) - (outstanding.get(line.id) ?? 0)) }))
}

export function GoodsReceiptDialog({ api, order, receipts = [], items, bins, onClose, onDone }: {
  api: RhnApi; order: PurchaseOrder; receipts?: GoodsReceipt[]; items: StockItem[]; bins: StockBin[]
  onClose: () => void; onDone: (receipt: GoodsReceipt) => void
}) {
  const receiveBins = bins.filter(value => value.active && value.receiveAllowed)
  const availableLines = purchaseReceivable(order, receipts).filter(line => line.availableQuantity > 0)
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16)
  })
  const [commonBin, setCommonBin] = useState(receiveBins.length === 1 ? receiveBins[0].id : '')
  const [binIds, setBinIds] = useState<Record<string, string>>({})
  const [lots, setLots] = useState<Record<string, string>>({})
  const [productionDates, setProductionDates] = useState<Record<string, string>>({})
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(availableLines.map(line => [line.id, String(line.availableQuantity)])))
  const [requestCode] = useState(() => `GR-${crypto.randomUUID()}`)
  const submitted = useRef<Parameters<RhnApi['pharmacy']['createGoodsReceipt']>[0] | null>(null)
  const selectedLines = availableLines.filter(line => quantities[line.id]?.trim() && Number(quantities[line.id]) !== 0)
  const rowErrors = (line: typeof availableLines[number]) => {
    if (!selectedLines.includes(line)) return []
    const item = items.find(value => value.id === line.stockItemId)
    const qty = Number(quantities[line.id]); const errors: string[] = []
    if (!Number.isFinite(qty) || qty <= 0) errors.push('数量须大于 0')
    if (qty > line.availableQuantity) errors.push(`超出可收数量 ${formatQuantity(line.availableQuantity)}${item?.packageUnitName ?? ''}`)
    if (!(binIds[line.id] || commonBin)) errors.push('请选择收货货位')
    if (item?.lotRequired && !lots[line.id]?.trim()) errors.push('请填写批号')
    if (item?.lotRequired && !expiryDates[line.id]) errors.push('请填写有效期')
    if (productionDates[line.id] && expiryDates[line.id] && productionDates[line.id] > expiryDates[line.id]) errors.push('有效期不能早于生产日期')
    return errors
  }
  const valid = selectedLines.length > 0 && Number.isFinite(new Date(receivedAt).getTime())
    && selectedLines.every(line => !rowErrors(line).length)
  const mutation = useMutation({ mutationFn: () => {
    // Keep an uncertain request immutable so retry cannot create a second receipt or silently change its contents.
    submitted.current ??= { purchaseOrderId: order.id, requestCode, deliveryNoteNo: deliveryNoteNo.trim() || undefined,
      receivedAt: new Date(receivedAt).toISOString(), lines: selectedLines.map(line => ({
        purchaseOrderLineId: line.id, destinationBinId: binIds[line.id] || commonBin,
        lotNo: lots[line.id]?.trim() || 'NO-LOT', productionDate: productionDates[line.id] || undefined,
        expiryDate: expiryDates[line.id] || undefined, deliveredQuantity: Number(quantities[line.id]), unitCost: line.unitPrice,
      })) }
    return api.pharmacy.createGoodsReceipt(submitted.current)
  }, onSuccess: result => onDone(result), onError: (error: unknown) => {
    // A business rejection did not create a receipt; allow corrections. Network failures retain the original request.
    if ((error as { code?: string }).code) submitted.current = null
  } })
  return <Dialog title="登记到货 · 核对批次" eyebrow={order.orderNo} size="xwide" className="warehouse-purchase-dialog"
    description="已带入可收数量；部分到货可直接改数，未到货填 0。登记后继续验收，验收合格后再入库。"
    onClose={mutation.isPending ? () => {} : onClose} closeOnBackdrop={!mutation.isPending}
    footer={<div className="warehouse-entry-dialog-footer"><span className="warehouse-entry-tip">本次 {selectedLines.length} 项 · 数量按各药品包装单位计算</span>
      <div className="warehouse-entry-actions"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
        <Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>登记并继续验收</Button></div></div>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}{submitted.current && '；本次内容已锁定，请重试以确认登记结果。'}</Alert>}
    {!receiveBins.length && <p role="status" className="warehouse-receipt-error">当前库房没有允许收货的货位，请先维护货位。</p>}
    {!availableLines.length && <Alert>该采购单已全部登记到货，请先处理待验收或待入库单据。</Alert>}
    <fieldset className="warehouse-receipt-fields" disabled={mutation.isPending || Boolean(submitted.current)}>
      <div className="warehouse-form-grid warehouse-form-grid--item warehouse-form-grid--compact">
        <FormField label="送货单号"><input autoFocus className="ui-field__control" value={deliveryNoteNo}
          onChange={event => setDeliveryNoteNo(event.target.value)} placeholder="供应商送货凭证号（选填）" /></FormField>
        <FormField label="实际到货时间" required><input className="ui-field__control" type="datetime-local" value={receivedAt}
          onChange={event => setReceivedAt(event.target.value)} /></FormField>
        <FormField label="统一收货货位"><Select disabled={mutation.isPending || Boolean(submitted.current)} value={commonBin} onChange={setCommonBin} clearable={false} showValue
          placeholder="应用于未单独指定的行" options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} /></FormField>
      </div>
      <div className="warehouse-receipt-grid"><OperationTable headers={['药品 / 规格 / 厂家', '可收 / 本次到货', '批号', '生产日期', '有效期至', '收货货位']}>
        {availableLines.map(line => {
          const item = items.find(value => value.id === line.stockItemId)
          const selected = selectedLines.includes(line); const errors = rowErrors(line)
          return <tr key={line.id} className={selected ? 'is-selected' : ''}>
            <td><strong>{item?.productName ?? line.stockItemId}</strong><small>{item?.packageSpec}</small><small>{item?.manufacturerName}</small>
              <small>采购价 {formatMoney(line.unitPrice)} / {item?.packageUnitName}</small>
              {errors.length > 0 && <span className="warehouse-receipt-error" role="status">{errors.join('；')}</span>}</td>
            <td><small>可收 {formatQuantity(line.availableQuantity)} {item?.packageUnitName}</small>
              <input aria-label="本次到货数量" aria-invalid={Number(quantities[line.id]) > line.availableQuantity || Number(quantities[line.id]) < 0}
                className="ui-field__control" type="number" min="0" step="any" max={line.availableQuantity}
                value={quantities[line.id] ?? ''} onChange={event => setQuantities(current => ({ ...current, [line.id]: event.target.value }))} />
              <small>{item?.packageUnitName} · 0 表示本次未到</small></td>
            <td><input aria-label="批号" className="ui-field__control" disabled={!selected} value={lots[line.id] ?? ''}
              onChange={event => setLots(current => ({ ...current, [line.id]: event.target.value }))} placeholder={item?.lotRequired ? '必填' : '选填'} /></td>
            <td><DatePicker aria-label="生产日期" disabled={!selected} value={productionDates[line.id] ?? ''}
              onChange={val => setProductionDates(current => ({ ...current, [line.id]: val }))} placeholder="YYYY-MM-DD" /></td>
            <td><DatePicker aria-label="有效期" disabled={!selected} min={productionDates[line.id]}
              value={expiryDates[line.id] ?? ''} onChange={val => setExpiryDates(current => ({ ...current, [line.id]: val }))} placeholder="YYYY-MM-DD" /></td>
            <td><Select value={binIds[line.id] || commonBin} disabled={!selected || mutation.isPending || Boolean(submitted.current)}
              onChange={id => setBinIds(current => ({ ...current, [line.id]: id }))} clearable showValue placeholder="沿用统一货位"
              options={receiveBins.map(bin => ({ value: bin.id, label: bin.name, secondaryText: bin.code }))} /></td>
          </tr>
        })}
      </OperationTable></div>
    </fieldset>
    {!selectedLines.length && availableLines.length > 0 && <Alert>请至少填写一项本次到货数量。</Alert>}
    {!receivedAt && <Alert>请填写实际到货时间。</Alert>}
  </Dialog>
}

export function GoodsInspectionDialog({ api, receipt, items, onClose, onDone }: { api: RhnApi; receipt: GoodsReceipt; items: StockItem[]; onClose: () => void; onDone: () => void }) {
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
  return <Dialog title="到货质量验收" eyebrow={receipt.receiptNo} size="xwide" className="warehouse-purchase-dialog" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>确认验收结果</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    <Alert>默认按全部合格带入，请核对实物、批号、效期和质量后确认。填写不合格数会自动扣减合格数，并须填写原因；验收后仍需办理入库。</Alert>
    <OperationTable headers={['药品 / 批号', '生产 / 有效期', '到货数', '合格数', '不合格数', '不合格原因']}>
      {receipt.lines.map(line => {
        const item = items.find(v => v.id === line.stockItemId)
        return <tr key={line.id}><td><strong>{item?.productName ?? line.stockItemId}</strong><small>{[item?.manufacturerName, `批号 ${line.lotNo}`].filter(Boolean).join(' · ')}</small></td>
          <td><strong>{line.expiryDate ?? '无效期'}</strong><small>生产 {line.productionDate ?? '未记录'}</small></td><td>{line.deliveredQuantity} {item?.packageUnitName}</td>
          <td><input aria-label={`${line.lotNo}合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={accepted[line.id]} onChange={e => setAccepted(v => ({ ...v, [line.id]: e.target.value }))} /></td>
          <td><input aria-label={`${line.lotNo}不合格数`} className="ui-field__control" type="number" min="0" max={line.deliveredQuantity} value={rejected[line.id]} onChange={e => { const value = e.target.value; setRejected(v => ({ ...v, [line.id]: value })); setAccepted(v => ({ ...v, [line.id]: String(Math.max(0, Number(line.deliveredQuantity) - Number(value))) })) }} /></td>
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
