import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { InventoryBalance, StockBin, StockItem } from '../../shared/api'
import type { RhnApi, MedicationProduct } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, LoadingState, PageHeader, Panel,
  Pagination, SearchField, Select, StatusBadge, TableShell, TreePanel, tableCellClass,
} from '../../shared/ui'
import { WarehouseOperations, type OperationTab } from './WarehouseOperations'
import '../../styles/features/pharmacy-warehouse.css'

const TraceCodeManagement = lazy(() => import('./TraceCodeManagement')
  .then((module) => ({ default: module.TraceCodeManagement })))
const InventoryAccuracyManagement = lazy(() => import('./InventoryAccuracyManagement')
  .then((module) => ({ default: module.InventoryAccuracyManagement })))
const InventoryPeriodManagement = lazy(() => import('./InventoryPeriodManagement')
  .then((module) => ({ default: module.InventoryPeriodManagement })))
const InventoryPriceAdjustmentManagement = lazy(() => import('./InventoryPriceAdjustmentManagement')
  .then((module) => ({ default: module.InventoryPriceAdjustmentManagement })))

const binTypeText: Record<string, string> = {
  ZONE: '库区', RACK: '货架', BIN: '货位', COUNTER: '柜台', TRANSIT: '在途位',
}
const stockStatusText: Record<string, string> = {
  AVAILABLE: '可用', PENDING: '待验', QUARANTINE: '隔离', DAMAGED: '破损', EXPIRED: '过期',
}
const issuePolicyText: Record<string, string> = { FEFO: '近效期先出', FIFO: '先进先出', MANUAL: '人工指定' }
const transactionTypeText: Record<string, string> = {
  RECEIPT: '验收入库', ISSUE: '请领出库', TRANSFER: '库间调拨', TRANSFER_OUT: '调拨出库', TRANSFER_IN: '调拨入库',
  RETURN: '退回入库', DISPENSE: '发药出库', COUNT: '盘点调整', ADJUST: '库存调整',
}

type ActiveTab = 'bins' | 'items' | 'inventory' | 'trace' | 'accuracy' | 'period' | 'price' | OperationTab
type BinInput = Parameters<RhnApi['pharmacy']['createStockBin']>[1]
type ItemInput = Parameters<RhnApi['pharmacy']['createStockItem']>[1]
type ReceiptDraft = {
  stockItemId: string; stockBinId: string; lotNo: string; expiryDate?: string
  operationQuantity: number; unitCost?: number; sourceCode: string; description?: string
}
type InventorySummary = {
  item: StockItem
  balances: InventoryBalance[]
  onHand: number
  available: number
  reserved: number
  frozen: number
  activeLots: number
  binCount: number
  expiringLots: number
  earliestExpiry?: string
  averageUnitCost?: number
  latestProjectedAt?: string
}

export function WarehouseManagement({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const organizationId = clinicalContext.organization.id
  const departmentId = clinicalContext.department.id
  const [tab, setTab] = useState<ActiveTab>('purchase')
  const [selectedBinId, setSelectedBinId] = useState<string>()
  const [ledgerItemId, setLedgerItemId] = useState('')
  const [receiptItemId, setReceiptItemId] = useState('')
  const [binDialogParentId, setBinDialogParentId] = useState<string | null>()
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)

  const sites = useQuery({
    queryKey: ['pharmacy-sites', organizationId], queryFn: () => api.pharmacy.sites(organizationId),
  })
  const allSites = useMemo(() => sites.data ?? [], [sites.data])
  const selectedSite = allSites.find((site) => site.active && site.departmentId === departmentId)
  const siteId = selectedSite?.id ?? ''

  const bins = useQuery({
    queryKey: ['pharmacy-stock-bins', siteId], queryFn: () => api.pharmacy.stockBins(siteId), enabled: Boolean(siteId),
  })
  const items = useQuery({
    queryKey: ['pharmacy-stock-items', siteId], queryFn: () => api.pharmacy.stockItems(siteId), enabled: Boolean(siteId),
  })
  const balances = useQuery({
    queryKey: ['warehouse-balances', siteId],
    queryFn: () => api.pharmacy.balances(siteId),
    enabled: Boolean(siteId),
  })
  const transactionSummary = useQuery({
    queryKey: ['warehouse-transaction-summary', siteId],
    queryFn: () => api.pharmacy.transactionPage(siteId, { page: 0, size: 1 }),
    enabled: tab === 'inventory' && Boolean(siteId),
  })

  useEffect(() => {
    setSelectedBinId(undefined); setLedgerItemId(''); setReceiptItemId('')
  }, [siteId])
  useEffect(() => {
    if (ledgerItemId && items.data && !items.data.some((item) => item.id === ledgerItemId)) {
      setLedgerItemId('')
    }
  }, [ledgerItemId, items.data])

  const createBin = useMutation({
    mutationFn: (input: BinInput) => api.pharmacy.createStockBin(siteId, input),
    onSuccess: async (value) => {
      await queryClient.invalidateQueries({ queryKey: ['pharmacy-stock-bins', siteId] })
      setSelectedBinId(value.id); setBinDialogParentId(undefined)
    },
  })
  const createItems = useMutation({
    mutationFn: (input: ItemInput[]) => api.pharmacy.createStockItems(siteId, input),
    onSuccess: async (values) => {
      await queryClient.invalidateQueries({ queryKey: ['pharmacy-stock-items', siteId] })
      setLedgerItemId(values[0]?.id ?? ''); setItemDialogOpen(false)
    },
  })
  const receive = useMutation({
    mutationFn: async (input: ReceiptDraft) => {
      const lot = await api.pharmacy.createLot(input.stockItemId, {
        lotNo: input.lotNo, expiryDate: input.expiryDate, qualityStatus: 'QUALIFIED',
      })
      return api.pharmacy.receive({
        requestCode: `WH-RCP-${Date.now()}`, sourceCode: input.sourceCode,
        stockItemId: input.stockItemId, stockBinId: input.stockBinId, stockLotId: lot.id,
        operationQuantity: input.operationQuantity, unitCost: input.unitCost,
        occurredAt: new Date().toISOString(), description: input.description,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['warehouse-balances', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-transaction-summary', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-item-ledger', siteId] }),
      ])
      setReceiptDialogOpen(false)
    },
  })

  const selectedBin = bins.data?.find((bin) => bin.id === selectedBinId)
  const selectedReceiptItem = items.data?.find((item) => item.id === receiptItemId)
  const inventoryVarietyCount = new Set((balances.data ?? []).filter(row => row.quantityOnHand !== 0)
    .map(row => row.stockItemId)).size
  const error = sites.error || bins.error || items.error || balances.error || transactionSummary.error

  return <>
    <PageHeader title="库房管理" compact />
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}

    {sites.isPending ? <LoadingState label="正在加载库存站点与配置…" /> : !allSites.length
      ? <EmptyState icon="pharmacy" title="机构未配置任何库存站点"
          copy="库房不在此单独新建。请在组织与人员中维护科室类型，库存配置将随科室建立。" />
      : !selectedSite
        ? <EmptyState icon="pharmacy" title="当前工作上下文未配置库存站点"
            copy="请使用顶部栏切换到已配置药库、药房或科室库的工作上下文。" />
        : <div className="warehouse-workspace warehouse-workspace--single">
            <Panel className="warehouse-detail">
              <nav className="warehouse-tabs" aria-label="库房管理内容">
                {([['purchase', '采购验收', undefined], ['requisition', '科室请领', undefined],
                  ['transfer', '库间调拨', undefined], ['count', '库存盘点', undefined],
                  ['trace', '追溯码', undefined], ['accuracy', '账目校验', undefined],
                  ['price', '库存调价', undefined],
                  ['period', '库存月结', undefined],
                  ['inventory', '库存查询', inventoryVarietyCount], ['bins', '库位', bins.data?.length ?? 0],
                  ['items', '经营项目', items.data?.length ?? 0]] as const).map(([value, label, count]) =>
                  <button type="button" className={tab === value ? 'is-active' : ''} key={value}
                    onClick={() => setTab(value)}>{label}{count !== undefined && <span>{count}</span>}</button>)}
              </nav>

              {tab === 'bins' && <BinSection bins={bins.data ?? []} selected={selectedBin}
                selectedId={selectedBinId} loading={bins.isPending} onSelect={setSelectedBinId}
                onAdd={(parentId) => setBinDialogParentId(parentId ?? null)} isOperator={true} />}
              {tab === 'items' && <ItemSection items={items.data ?? []} loading={items.isPending}
                onAdd={() => setItemDialogOpen(true)} onInspect={(id) => { setLedgerItemId(id); setTab('inventory') }} isOperator={true} />}
              {tab === 'inventory' && <InventorySection api={api} siteId={siteId} items={items.data ?? []}
                bins={bins.data ?? []} selectedItemId={ledgerItemId} onInspect={setLedgerItemId}
                loading={balances.isPending || transactionSummary.isPending} balances={balances.data ?? []}
                transactionCount={transactionSummary.data?.totalElements ?? 0} onReceive={(itemId) => {
                  setReceiptItemId(itemId); setReceiptDialogOpen(true)
                }} isOperator={true} />}
              {tab === 'trace' && (
                <Suspense fallback={<LoadingState label="正在加载追溯码管理…" />}>
                  <TraceCodeManagement api={api} siteId={siteId} items={items.data ?? []} bins={bins.data ?? []} />
                </Suspense>
              )}
              {tab === 'accuracy' && (
                <Suspense fallback={<LoadingState label="正在加载账目校验…" />}>
                  <InventoryAccuracyManagement api={api} siteId={siteId} items={items.data ?? []} bins={bins.data ?? []} />
                </Suspense>
              )}
              {tab === 'period' && (
                <Suspense fallback={<LoadingState label="正在加载库存月结…" />}>
                  <InventoryPeriodManagement api={api} siteId={siteId} items={items.data ?? []} bins={bins.data ?? []} />
                </Suspense>
              )}
              {tab === 'price' && (
                <Suspense fallback={<LoadingState label="正在加载库存调价…" />}>
                  <InventoryPriceAdjustmentManagement api={api} siteId={siteId} items={items.data ?? []} bins={bins.data ?? []} balances={balances.data ?? []} />
                </Suspense>
              )}
              {(['purchase', 'requisition', 'transfer', 'count'] as ActiveTab[]).includes(tab) && selectedSite &&
                <WarehouseOperations tab={tab as OperationTab} api={api} site={selectedSite}
                  sites={allSites} items={items.data ?? []} bins={bins.data ?? []} onNavigate={onNavigate} isOperator={true} />}
            </Panel>
          </div>}

    {binDialogParentId !== undefined && selectedSite && <BinDialog parent={bins.data?.find((bin) => bin.id === binDialogParentId)}
      busy={createBin.isPending} error={createBin.error}
      onClose={() => { createBin.reset(); setBinDialogParentId(undefined) }} onSubmit={(input) => createBin.mutate(input)} />}
    {itemDialogOpen && selectedSite && <ItemDialog api={api} organizationId={organizationId} stockSiteType={selectedSite.siteType}
      existingItems={items.data ?? []} busy={createItems.isPending} error={createItems.error}
      onClose={() => { createItems.reset(); setItemDialogOpen(false) }} onSubmit={(input) => createItems.mutate(input)} />}
    {receiptDialogOpen && selectedReceiptItem && <ReceiptDialog item={selectedReceiptItem} bins={bins.data ?? []}
      busy={receive.isPending} error={receive.error}
      onClose={() => { receive.reset(); setReceiptDialogOpen(false); setReceiptItemId('') }} onSubmit={(input) => receive.mutate(input)} />}
  </>
}

function BinSection({ bins, selected, selectedId, loading, onSelect, onAdd, isOperator = true }: {
  bins: StockBin[]; selected?: StockBin; selectedId?: string; loading: boolean
  onSelect: (id?: string) => void; onAdd: (parentId?: string) => void; isOperator?: boolean
}) {
  return <div className="warehouse-bin-layout">
    <TreePanel title="库位结构" rootLabel="全部库位" searchPlaceholder="搜索库位名称或编码" busy={loading}
      nodes={bins.map((bin) => ({ id: bin.id, parentId: bin.parentBinId, label: bin.name,
        secondaryText: bin.code, keywords: [bin.code, binTypeText[bin.binType]], inactive: !bin.active }))}
      selectedId={selectedId} onSelect={onSelect} onAdd={isOperator ? onAdd : undefined} emptyText="尚未配置库位" />
    <div className="warehouse-bin-detail">{!selected ? <EmptyState icon="pharmacy" title="选择一个库位"
      copy="查看库位用途和作业权限；也可以从左侧新增根库区或下级货位。" /> : <>
      <header><div><span>{binTypeText[selected.binType]}</span><h3>{selected.name}</h3><code>{selected.code}</code></div>
        <StatusBadge tone={selected.active ? 'success' : 'neutral'}>{selected.active ? '启用' : '停用'}</StatusBadge></header>
      <dl className="warehouse-facts">
        <div><dt>默认库存状态</dt><dd>{stockStatusText[selected.stockDefault]}</dd></div>
        <div><dt>同级排序</dt><dd>{selected.sortOrder}</dd></div>
        <div><dt>允许收货</dt><dd>{selected.receiveAllowed ? '是' : '否'}</dd></div>
        <div><dt>允许拣货</dt><dd>{selected.pickAllowed ? '是' : '否'}</dd></div>
        <div><dt>允许盘点</dt><dd>{selected.countAllowed ? '是' : '否'}</dd></div>
      </dl>
      <Button variant="secondary" size="sm" disabled={!isOperator} title={!isOperator ? '非管辖库房，仅供查阅' : undefined} onClick={() => onAdd(selected.id)}>新增下级库位</Button>
    </>}</div>
  </div>
}

function ItemSection({ items, loading, onAdd, onInspect, isOperator = true }: {
  items: StockItem[]; loading: boolean; onAdd: () => void; onInspect: (id: string) => void; isOperator?: boolean
}) {
  return <section className="warehouse-section">
    <header className="warehouse-section__toolbar"><strong>库房经营目录</strong>
      <Button size="sm" disabled={!isOperator} title={!isOperator ? '非管辖库房，仅供查阅' : undefined} onClick={onAdd}>批量调入</Button></header>
    {loading ? <LoadingState label="正在加载经营项目…" /> : !items.length
      ? <EmptyState icon="pharmacy" title="尚未配置经营项目" copy="从机构已启用的药品产品中批量选择包装调入当前科室。"
        action={<Button size="sm" disabled={!isOperator} title={!isOperator ? '非管辖库房，仅供查阅' : undefined} onClick={onAdd}>批量调入</Button>} />
      : <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr>
        <th>药品产品</th><th>包装</th><th>出库策略</th><th>管控属性</th><th>状态</th><th aria-label="操作">操作</th>
      </tr></thead><tbody>{items.map((item) => <tr key={item.id}>
        <td><strong>{item.productName}</strong><code>{item.productCode}</code></td>
        <td>{item.packageSpec || item.packageUnitName}<small>1 {item.packageUnitName} = {item.packageFactor} {item.baseUnitCode}</small></td>
        <td>{issuePolicyText[item.issuePolicy]}</td>
        <td><div className="warehouse-tags">{item.lotRequired && <span>批号</span>}{item.traceRequired && <span>追溯</span>}
          {item.splitAllowed && <span>可拆零</span>}{item.coldChain && <span>冷链</span>}{item.controlled && <span>受控</span>}
          {item.highAlert && <span>高警示</span>}</div></td>
        <td><StatusBadge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>{item.status === 'ACTIVE' ? '启用' : item.status}</StatusBadge></td>
        <td><Button variant="text" size="sm" onClick={() => onInspect(item.id)}>看库存</Button></td>
      </tr>)}</tbody></table></div>}
  </section>
}

function InventorySection({ api, siteId, items, bins, selectedItemId, onInspect, loading, balances,
  transactionCount, onReceive, isOperator = true }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]; selectedItemId: string
  onInspect: (id: string) => void; loading: boolean; balances: InventoryBalance[]
  transactionCount: number; onReceive: (itemId: string) => void; isOperator?: boolean
}) {
  const [query, setQuery] = useState('')
  const [stockFilter, setStockFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const selectedItem = items.find(item => item.id === selectedItemId)
  const summaries = useMemo<InventorySummary[]>(() => {
    const now = Date.now(); const expiryLimit = now + 90 * 86400000
    return items.map(item => {
      const rows = balances.filter(row => row.stockItemId === item.id)
      const onHand = rows.reduce((sum, row) => sum + Number(row.quantityOnHand), 0)
      const available = rows.reduce((sum, row) => sum + Number(row.quantityAvailable), 0)
      const reserved = rows.reduce((sum, row) => sum + Number(row.quantityReserved), 0)
      const frozen = rows.reduce((sum, row) => sum + Number(row.quantityFrozen), 0)
      const activeRows = rows.filter(row => Number(row.quantityOnHand) !== 0)
      const expiringRows = activeRows.filter(row => row.expiryDate
        && new Date(row.expiryDate).getTime() >= now && new Date(row.expiryDate).getTime() <= expiryLimit)
      const expiryDates = activeRows.map(row => row.expiryDate).filter((value): value is string => Boolean(value)).sort()
      const valueTotal = rows.reduce((sum, row) => sum + Number(row.quantityOnHand) * Number(row.averageUnitCost ?? 0), 0)
      const latestProjectedAt = rows.map(row => row.projectedAt).filter(Boolean).sort().at(-1)
      return {
        item, balances: rows, onHand, available, reserved, frozen,
        activeLots: new Set(activeRows.map(row => row.stockLotId)).size,
        binCount: new Set(activeRows.map(row => row.stockBinId)).size,
        expiringLots: new Set(expiringRows.map(row => row.stockLotId)).size,
        earliestExpiry: expiryDates[0], averageUnitCost: onHand ? valueTotal / onHand : undefined,
        latestProjectedAt,
      }
    }).sort((left, right) => Number(right.onHand !== 0) - Number(left.onHand !== 0)
      || left.item.productName.localeCompare(right.item.productName, 'zh-CN'))
  }, [balances, items])
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = summaries.filter(summary => {
    const matchesQuery = !normalizedQuery || [summary.item.productName, summary.item.productCode,
      summary.item.packageSpec, summary.item.manufacturerName, ...summary.balances.map(row => row.lotNo)]
      .some(value => value?.toLowerCase().includes(normalizedQuery))
    const matchesStock = stockFilter === 'ALL'
      || stockFilter === 'IN_STOCK' && summary.onHand !== 0
      || stockFilter === 'ZERO' && summary.onHand === 0
      || stockFilter === 'ATTENTION' && (summary.available <= 0 || summary.expiringLots > 0
        || summary.reserved > 0 || summary.frozen > 0)
    return matchesQuery && matchesStock
  })
  const inStockCount = summaries.filter(summary => summary.onHand !== 0).length
  const activeLotCount = balances.filter(row => Number(row.quantityOnHand) !== 0).length
  const expiringCount = summaries.reduce((sum, row) => sum + row.expiringLots, 0)
  const hasReceiveBin = bins.some(bin => bin.active && bin.receiveAllowed)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize)
  useEffect(() => { setPage(0) }, [query, siteId, stockFilter])
  useEffect(() => {
    if (page >= totalPages) setPage(totalPages - 1)
  }, [page, totalPages])
  return <section className="warehouse-section warehouse-inventory-list">
    <div className="warehouse-inventory-filters">
      <div className="warehouse-inventory-filters__left">
        <SearchField label="搜索库存" value={query} onChange={setQuery} placeholder="搜索药品名称、编码或批号" />
        <Select value={stockFilter} onChange={setStockFilter} showValue options={[
          { value: 'ALL', label: '全部库存' }, { value: 'IN_STOCK', label: '有库存' },
          { value: 'ZERO', label: '零库存' }, { value: 'ATTENTION', label: '需关注' },
        ]} />
      </div>
      <div className="warehouse-metrics-inline">
        <span className="warehouse-metric-chip">品种 <strong>{items.length}</strong></span>
        <span className="warehouse-metric-chip">在库 <strong>{inStockCount}</strong></span>
        <span className="warehouse-metric-chip">批次 <strong>{activeLotCount}</strong>{expiringCount > 0 && <small className="warehouse-metric-chip__warn">（临期 {expiringCount}）</small>}</span>
        <span className="warehouse-metric-chip">本期记账 <strong>{transactionCount}</strong></span>
      </div>
    </div>
    {!items.length ? <EmptyState icon="pharmacy" title="没有可查询的经营项目" copy="请先维护库房经营项目。" />
      : loading ? <LoadingState label="正在汇总全库库存…" /> : !filtered.length
        ? <EmptyState icon="pharmacy" title="没有符合条件的库存" copy="请调整搜索词或库存状态筛选。" />
        : <TableShell className="warehouse-inventory-table-shell" scrollLabel="库存查询结果"
            resetScrollKey={`${query}:${stockFilter}:${page}:${pageSize}`}
            footer={<Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={pageSize}
              pageSizeOptions={[20, 50, 100]} onChange={setPage} onPageSizeChange={(size) => {
                setPageSize(size); setPage(0)
              }} label="库存列表分页" />}>
          <DataTable className="warehouse-inventory-summary-table" aria-label="库存查询结果"><thead><tr>
          <th>药品</th><th className={tableCellClass('status')}>库存状态</th>
          <th className={tableCellClass('numeric')}>批次 / 库位</th>
          <th className={tableCellClass('numeric')}>账面库存</th>
          <th className={tableCellClass('numeric')}>可用库存</th>
          <th className={tableCellClass('numeric')}>预留 / 冻结</th>
          <th className={tableCellClass('numeric')}>平均成本</th><th>最近变动</th>
          <th className={tableCellClass('actions')} aria-label="操作">操作</th>
        </tr></thead><tbody>{visible.map(summary => {
          const item = summary.item
          const canReceive = hasReceiveBin && !item.traceRequired
          const status = summary.onHand === 0
            ? <StatusBadge tone="neutral">零库存</StatusBadge>
            : summary.available <= 0 ? <StatusBadge tone="warning">暂无可用</StatusBadge>
              : summary.expiringLots > 0 ? <StatusBadge tone="warning">存在临期</StatusBadge>
                : <StatusBadge tone="success">库存正常</StatusBadge>
          return <tr key={item.id}>
            <td><strong>{item.productName}</strong><code>{item.productCode}</code><small>{[item.packageSpec || item.packageUnitName, item.manufacturerName].filter(Boolean).join(' · ')}</small></td>
            <td className={tableCellClass('status')}>{status}{summary.earliestExpiry && <small>最近效期 {summary.earliestExpiry}</small>}</td>
            <td className={tableCellClass('numeric')}><strong>{summary.activeLots} 批</strong><small>{summary.binCount} 个库位</small></td>
            <td className={tableCellClass('numeric')}><strong>{formatWarehouseQuantity(summary.onHand)} {item.baseUnitCode}</strong>
              <small>≈ {item.packageFactor ? formatWarehousePackageQuantity(summary.onHand / item.packageFactor) : '—'} {item.packageUnitName}</small></td>
            <td className={tableCellClass('numeric')}><strong>{formatWarehouseQuantity(summary.available)} {item.baseUnitCode}</strong></td>
            <td className={tableCellClass('numeric')}><strong>{formatWarehouseQuantity(summary.reserved)} / {formatWarehouseQuantity(summary.frozen)}</strong></td>
            <td className={tableCellClass('numeric')}>{summary.averageUnitCost === undefined ? '—' : formatWarehouseMoney(summary.averageUnitCost)}</td>
            <td>{summary.latestProjectedAt ? formatWarehouseTime(summary.latestProjectedAt) : '尚未记账'}</td>
            <td className={tableCellClass('actions')}><div className="warehouse-row-actions"><Button variant="text" size="sm" onClick={() => onInspect(item.id)}>查看流水</Button>
              <Button variant="text" size="sm" disabled={!canReceive || !isOperator} title={!isOperator ? '非管辖库房，仅供查阅' : undefined} onClick={() => onReceive(item.id)}>入库</Button></div></td>
          </tr>
        })}</tbody></DataTable>
        </TableShell>}
    {selectedItem && <InventoryLedgerDialog api={api} siteId={siteId} item={selectedItem}
      summary={summaries.find(value => value.item.id === selectedItem.id)} bins={bins}
      onClose={() => onInspect('')} />}
  </section>
}

function InventoryLedgerDialog({ api, siteId, item, summary, bins, onClose }: {
  api: RhnApi; siteId: string; item: StockItem; summary?: InventorySummary; bins: StockBin[]
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => { setPage(0) }, [query])
  const history = useQuery({
    queryKey: ['warehouse-item-ledger', siteId, item.id, debouncedQuery, page, pageSize],
    queryFn: () => api.pharmacy.transactionPage(siteId, {
      stockItemId: item.id, allPeriods: true, page, size: pageSize,
      ...(debouncedQuery ? { query: debouncedQuery } : {}),
    }),
  })
  const transactions = history.data?.content ?? []
  const entries = useMemo(() => {
    let quantityAfter = Number(history.data?.firstEntryQuantityAfter ?? summary?.onHand ?? 0)
    return transactions.map(transaction => {
      const lines = transaction.lines.filter(line => line.stockItemId === item.id)
      const delta = lines.reduce((sum, line) => sum + Number(line.quantityDelta), 0)
      const before = quantityAfter - delta
      const dimensions = lines.map(line => {
        const balance = summary?.balances.find(row => row.stockLotId === line.stockLotId
          && row.stockBinId === line.stockBinId && row.stockStatus === line.stockStatus)
        const bin = bins.find(candidate => candidate.id === line.stockBinId)
        return { id: line.id,
          bin: bin ? `${bin.name}（${bin.code}）` : balance?.stockBinCode ?? '库位未登记',
          lot: balance?.lotNo ?? '批号未登记' }
      })
      const amount = lines.reduce((sum, line) => sum + Number(line.amountDelta ?? 0), 0)
      const unitCosts = [...new Set(lines.map(line => line.unitCost).filter((cost): cost is number => cost !== undefined))]
      const entry = { transaction, lines, delta, before, after: quantityAfter, dimensions, amount,
        unitCost: unitCosts.length === 1 ? unitCosts[0] : undefined }
      quantityAfter = before
      return entry
    }).filter(value => value.lines.length)
  }, [bins, history.data?.firstEntryQuantityAfter, item.id, summary, transactions])
  const totalElements = history.data?.totalElements ?? 0
  const totalPages = history.data?.totalPages ?? 0
  const description = [item.packageSpec || item.packageUnitName, item.manufacturerName, '全部库存期间']
    .filter(Boolean).join(' · ')
  return <Dialog title="库存变动流水" eyebrow={item.productName} description={description}
    size="xwide" className="warehouse-ledger-dialog" onClose={onClose}
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    <div className="warehouse-ledger-summary"><div><span>当前账面</span><strong>{formatWarehouseQuantity(summary?.onHand ?? 0)}</strong><small>{item.baseUnitCode}</small></div>
      <div><span>当前可用</span><strong>{formatWarehouseQuantity(summary?.available ?? 0)}</strong><small>{item.baseUnitCode}</small></div>
      <div><span>批次 / 库位</span><strong>{summary?.activeLots ?? 0} / {summary?.binCount ?? 0}</strong><small>当前有效</small></div>
      <div><span>{debouncedQuery ? '查询结果' : '历史记账'}</span><strong>{totalElements}</strong><small>笔</small></div></div>
    <div className="warehouse-ledger-filters">
      <SearchField label="查询库存流水" value={query} onChange={setQuery}
        placeholder="搜索来源单据、流水号、批号、库位或备注" />
    </div>
    {history.error ? <Alert>{errorMessage(history.error)}</Alert>
      : history.isPending ? <LoadingState label="正在加载账目流水…" /> : !entries.length
      ? <EmptyState icon="pharmacy" title={debouncedQuery ? '没有符合条件的库存流水' : '暂无库存流水'}
          copy={debouncedQuery ? '请调整查询关键词。' : '该药品完成首次库存记账后，将在这里显示每次库存变动。'} />
      : <TableShell className="warehouse-ledger-table-shell" scrollLabel="药品库存变动流水"
          resetScrollKey={`${item.id}:${debouncedQuery}:${page}:${pageSize}`}
          footer={<Pagination page={page} totalPages={totalPages} total={totalElements} pageSize={pageSize}
            pageSizeOptions={[20, 50, 100]} onChange={setPage} onPageSizeChange={(size) => {
              setPageSize(size); setPage(0)
            }} label="药品流水分页" />}>
        <DataTable compact className="warehouse-ledger-table" aria-label="药品库存变动流水"><thead><tr>
        <th>业务时间</th><th>来源单据</th><th>业务类型</th><th>批号 / 库位</th>
        <th className={tableCellClass('numeric')}>变动数量</th>
        <th className={tableCellClass('numeric')}>结存变化</th>
        <th className={tableCellClass('numeric')}>成本</th>
      </tr></thead><tbody>{entries.map(entry => <tr key={entry.transaction.id}>
        <td><strong>{formatWarehouseTime(entry.transaction.occurredAt)}</strong></td>
        <td><strong>{entry.transaction.sourceCode || '未关联来源单据'}</strong>
          {entry.transaction.description && <small>{entry.transaction.description}</small>}</td>
        <td><strong>{transactionTypeText[entry.transaction.transactionType] ?? entry.transaction.transactionType}</strong></td>
        <td>{entry.dimensions.map(value => <small className="warehouse-ledger-dimension" key={value.id}>
          {value.lot} · {value.bin}
        </small>)}</td>
        <td className={tableCellClass('numeric')}><strong className={`warehouse-ledger-delta ${entry.delta >= 0 ? 'is-positive' : 'is-negative'}`}>
          {entry.delta > 0 ? '+' : ''}{formatWarehouseQuantity(entry.delta)} {item.baseUnitCode}</strong></td>
        <td className={tableCellClass('numeric')}><strong>{formatWarehouseQuantity(entry.before)} → {formatWarehouseQuantity(entry.after)}</strong></td>
        <td className={tableCellClass('numeric')}>{entry.unitCost === undefined ? '—' : formatWarehouseMoney(entry.unitCost)}
          {entry.amount !== 0 && <small>金额 {formatWarehouseMoney(entry.amount)}</small>}</td>
      </tr>)}</tbody></DataTable>
      </TableShell>}
  </Dialog>
}

function ReceiptDialog({ item, bins, busy, error, onClose, onSubmit }: {
  item: StockItem; bins: StockBin[]; busy: boolean; error: unknown
  onClose: () => void; onSubmit: (input: ReceiptDraft) => void
}) {
  const receivableBins = bins.filter((bin) => bin.active && bin.receiveAllowed)
  const [stockBinId, setStockBinId] = useState(receivableBins[0]?.id ?? '')
  const [lotNo, setLotNo] = useState(''); const [expiryDate, setExpiryDate] = useState('')
  const [quantity, setQuantity] = useState(''); const [unitCost, setUnitCost] = useState('')
  const [sourceCode, setSourceCode] = useState(''); const [description, setDescription] = useState('')
  const quantityValue = Number(quantity); const costValue = unitCost ? Number(unitCost) : undefined
  const valid = stockBinId && lotNo.trim() && sourceCode.trim() && quantityValue > 0
    && (costValue === undefined || costValue >= 0)
  return <Dialog title="入库记账" eyebrow="库存收货" size="wide"
    description={`按“${item.packageSpec || item.packageUnitName}”录入，系统自动换算为 ${item.baseUnitCode} 并形成不可变库存流水。`}
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={!valid} onClick={() => onSubmit({ stockItemId: item.id, stockBinId,
        lotNo: lotNo.trim(), expiryDate: expiryDate || undefined, operationQuantity: quantityValue,
        unitCost: costValue, sourceCode: sourceCode.trim(), description: description.trim() || undefined })}>确认入库</Button></>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <div className="warehouse-receipt-product"><div><span>经营项目</span><strong>{item.productName}</strong><code>{item.productCode}</code>{item.manufacturerName && <small>{item.manufacturerName}</small>}</div>
      <div><span>库存包装</span><strong>{item.packageSpec || item.packageUnitName}</strong><small>换算系数 {item.packageFactor}</small></div></div>
    <div className="warehouse-form-grid"><FormField label="收货库位" required><Select value={stockBinId}
      onChange={setStockBinId} showValue clearable={false} options={receivableBins.map((bin) => ({ value: bin.id,
        label: bin.name, secondaryText: bin.code }))} /></FormField>
      <FormField label="来源单号" required><input className="ui-field__control" value={sourceCode}
        onChange={(event) => setSourceCode(event.target.value)} placeholder="采购入库单或外部凭证号" /></FormField>
      <FormField label="批号" required><input autoFocus className="ui-field__control" value={lotNo}
        onChange={(event) => setLotNo(event.target.value)} /></FormField>
      <FormField label="有效期"><input className="ui-field__control" type="date" value={expiryDate}
        onChange={(event) => setExpiryDate(event.target.value)} /></FormField>
      <FormField label={`入库数量（${item.packageUnitName}）`} required><input className="ui-field__control"
        type="number" min="0.00000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></FormField>
      <FormField label="包装单位成本"><input className="ui-field__control" type="number" min="0" step="0.000001"
        value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="可不填" /></FormField>
      <FormField className="warehouse-form-grid__full" label="备注"><input className="ui-field__control" value={description}
        onChange={(event) => setDescription(event.target.value)} placeholder="验收情况或其他说明" /></FormField></div>
  </Dialog>
}

function BinDialog({ parent, busy, error, onClose, onSubmit }: {
  parent?: StockBin; busy: boolean; error: unknown; onClose: () => void; onSubmit: (input: BinInput) => void
}) {
  const [code, setCode] = useState(''); const [name, setName] = useState('')
  const [binType, setBinType] = useState<BinInput['binType']>(parent ? 'BIN' : 'ZONE')
  const [stockDefault, setStockDefault] = useState<BinInput['stockDefault']>('AVAILABLE')
  const [sortOrder, setSortOrder] = useState('0'); const [receiveAllowed, setReceiveAllowed] = useState(true)
  const [pickAllowed, setPickAllowed] = useState(true); const [countAllowed, setCountAllowed] = useState(true)
  return <Dialog title={parent ? `新增“${parent.name}”下级库位` : '新增根库区'} eyebrow="库位维护" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy} disabled={!code.trim() || !name.trim()}
      onClick={() => onSubmit({ parentBinId: parent?.id, code: code.trim(), name: name.trim(), binType, stockDefault,
        receiveAllowed, pickAllowed, countAllowed, sortOrder: Number(sortOrder) || 0 })}>保存库位</Button></>}>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <div className="warehouse-form-grid"><FormField label="库位编码" required><input autoFocus className="ui-field__control"
      value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
      <FormField label="库位名称" required><input className="ui-field__control" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
      <FormField label="库位类型" required><Select value={binType} clearable={false} showValue onChange={(value) => setBinType(value as BinInput['binType'])}
        options={Object.entries(binTypeText).map(([value, label]) => ({ value, label }))} /></FormField>
      <FormField label="默认库存状态" required><Select value={stockDefault} clearable={false} showValue
        onChange={(value) => setStockDefault(value as BinInput['stockDefault'])}
        options={Object.entries(stockStatusText).map(([value, label]) => ({ value, label }))} /></FormField>
      <FormField label="同级排序"><input className="ui-field__control" type="number" min="0" value={sortOrder}
        onChange={(event) => setSortOrder(event.target.value)} /></FormField></div>
    <div className="warehouse-check-grid">{[[receiveAllowed, setReceiveAllowed, '允许收货'], [pickAllowed, setPickAllowed, '允许拣货'],
      [countAllowed, setCountAllowed, '允许盘点']] .map(([checked, setter, label]) => <label key={String(label)}>
      <input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
      <span>{label as string}</span></label>)}</div>
  </Dialog>
}

export function ItemDialog({ api, organizationId, stockSiteType, existingItems, busy, error, onClose, onSubmit }: {
  api: RhnApi; organizationId: string; stockSiteType: string; existingItems: StockItem[]; busy: boolean; error: unknown
  onClose: () => void; onSubmit: (input: ItemInput[]) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Record<string, MedicationProduct>>({})
  const selectedIds = Object.keys(selected)
  const [packageIds, setPackageIds] = useState<Record<string, string>>({})
  const productsQuery = useQuery({ queryKey: ['warehouse-catalog-products', organizationId, stockSiteType, query, page],
    queryFn: () => api.masterData.searchMedicationProducts(query, '', 'ACTIVE', organizationId, page, 20, true, stockSiteType === 'PHARMACY') })
  const today = new Date().toLocaleDateString('sv-SE')
  const products = (productsQuery.data?.content ?? []).map(({ product }) => ({ ...product,
    packages: product.packages.filter(pkg => pkg.sdStatus === 'ACTIVE' && pkg.validFrom <= today && (!pkg.validTo || pkg.validTo >= today)),
  })).filter(product => !existingItems.some(item => item.catalogItemId === product.id))
  useEffect(() => { setPage(0) }, [query])
  const [issuePolicy, setIssuePolicy] = useState<ItemInput['issuePolicy']>('FEFO')
  const [lotRequired, setLotRequired] = useState(true); const [traceRequired, setTraceRequired] = useState(true)
  const [splitAllowed, setSplitAllowed] = useState(false); const [coldChain, setColdChain] = useState(false)
  const [controlled, setControlled] = useState(false); const [highAlert, setHighAlert] = useState(false)
  const visibleProducts = products
  const selectedProducts = Object.values(selected)
  const allVisibleSelected = Boolean(visibleProducts.length)
    && visibleProducts.every((product) => selectedIds.includes(product.id))
  const defaultPackageId = (product: (typeof products)[number]) => {
    const packages = product.packages.filter((value) => value.sdStatus === 'ACTIVE')
    return packages.find((value) => value.defaultDispense)?.id ?? packages[0]?.id ?? ''
  }
  const setProductSelected = (product: (typeof products)[number], selected: boolean) => {
    setSelected(current => {
      const next = { ...current }
      if (selected) next[product.id] = product
      else delete next[product.id]
      return next
    })
    if (selected && !packageIds[product.id]) {
      setPackageIds((current) => ({ ...current, [product.id]: defaultPackageId(product) }))
    }
  }
  const toggleVisible = (selected: boolean) => {
    setSelected(current => {
      const next = { ...current }
      visibleProducts.forEach(product => { if (selected) next[product.id] = product; else delete next[product.id] })
      return next
    })
    if (selected) setPackageIds((current) => Object.fromEntries([
      ...Object.entries(current), ...visibleProducts.map((product) => [product.id, current[product.id] || defaultPackageId(product)]),
    ]))
  }
  const ready = selectedProducts.length > 0 && selectedProducts.length <= 200 && selectedProducts.every((product) => packageIds[product.id])
  const submit = () => onSubmit(selectedProducts.map((product) => ({ catalogItemId: product.id,
    packageId: packageIds[product.id], issuePolicy, negativeAllowed: false, lotRequired, traceRequired,
    splitAllowed, coldChain, controlled, controlLevel: controlled ? 'CONTROLLED' : undefined, highAlert })))
  return <Dialog title="批量调入经营项目" eyebrow="科室经营目录" size="xwide"
    description={`从机构已启用且可库存的药品中多选调入${stockSiteType === 'PHARMACY' ? '；药房仅显示已开放发药的产品' : ''}。整批校验通过后一次生效。`} onClose={onClose}
    footer={<><span className="warehouse-batch-footer-summary">已选择 <strong>{selectedProducts.length}</strong> 项</span>
      <Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy} disabled={!ready} onClick={submit}>
      批量调入{selectedProducts.length ? `（${selectedProducts.length}）` : ''}</Button></>}>
    {(error || productsQuery.error) && <Alert>{errorMessage(error || productsQuery.error)}</Alert>}
    <div className="warehouse-batch-toolbar"><label><span>检索药品</span><input autoFocus className="ui-field__control"
      value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、编码、生产厂家或批准文号" /></label>
      <label className="warehouse-batch-select-all"><input type="checkbox" checked={allVisibleSelected}
        onChange={(event) => toggleVisible(event.target.checked)} disabled={!visibleProducts.length} />
        <span>选择当前结果</span></label><span>可调入 {visibleProducts.length} 项</span></div>
    <div className="warehouse-batch-table-wrap"><table className="warehouse-table warehouse-batch-table"><thead><tr>
      <th aria-label="选择" /><th>药品产品</th><th>生产厂家</th><th>库存包装</th>
    </tr></thead><tbody>{visibleProducts.map((product) => {
      const selected = selectedIds.includes(product.id)
      const packages = product.packages.filter((value) => value.sdStatus === 'ACTIVE')
      return <tr key={product.id} className={selected ? 'is-selected' : ''}><td><input type="checkbox" checked={selected}
        aria-label={`选择${product.name}`} onChange={(event) => setProductSelected(product, event.target.checked)} /></td>
        <td><strong>{product.name}</strong><code>{product.code}</code></td><td>{product.manufacturerName}</td>
        <td><Select value={packageIds[product.id] ?? ''} disabled={!selected} clearable={false} showValue
          onChange={(value) => setPackageIds((current) => ({ ...current, [product.id]: value }))}
          options={packages.map((value) => ({ value: value.id, label: value.packageSpec || value.unitName,
            secondaryText: value.unitCode }))} /></td></tr>
    })}{!productsQuery.isPending && !visibleProducts.length && <tr><td colSpan={4} className="warehouse-batch-empty">
      {products.length ? '没有匹配的药品' : '没有可调入的药品产品'}</td></tr>}</tbody></table></div>
    {productsQuery.isFetching && <LoadingState label="正在加载候选产品…" />}
    <Pagination page={page} totalPages={Math.max(1, productsQuery.data?.totalPages ?? 1)}
      total={productsQuery.data?.totalElements ?? 0} pageSize={20} onChange={setPage} label="调入候选产品分页" />
    {selectedProducts.length > 200 && <Alert>单次最多调入 200 个产品，请减少选择。</Alert>}
    <section className="warehouse-batch-settings"><header><div><strong>本批次统一设置</strong>
      <span>应用于本次选中的全部药品，调入后仍可在经营目录中查看。</span></div>
      <FormField label="出库策略" required><Select value={issuePolicy} clearable={false} showValue
        onChange={(value) => setIssuePolicy(value as ItemInput['issuePolicy'])}
        options={Object.entries(issuePolicyText).map(([value, label]) => ({ value, label }))} /></FormField></header>
    <div className="warehouse-check-grid warehouse-check-grid--wide">{[
      [lotRequired, setLotRequired, '批号管理'], [traceRequired, setTraceRequired, '全程追溯'],
      [splitAllowed, setSplitAllowed, '允许拆零'], [coldChain, setColdChain, '冷链药品'],
      [controlled, setControlled, '受控药品'], [highAlert, setHighAlert, '高警示药品'],
    ].map(([checked, setter, label]) => <label key={String(label)}><input type="checkbox" checked={checked as boolean}
      onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} /><span>{label as string}</span></label>)}</div></section>
  </Dialog>
}

function formatWarehouseQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(Number(value))
}

function formatWarehousePackageQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value))
}

function formatWarehouseMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 6 }).format(Number(value))
}

function formatWarehouseTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
