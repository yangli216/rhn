import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { InventoryBalance, InventoryTransaction, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, LoadingState, PageHeader, Panel,
  SearchField, Select, StatusBadge, TreePanel,
} from '../../shared/ui'
import { WarehouseOperations, type OperationTab } from './WarehouseOperations'
import { TraceCodeManagement } from './TraceCodeManagement'
import { InventoryAccuracyManagement } from './InventoryAccuracyManagement'
import { InventoryPeriodManagement } from './InventoryPeriodManagement'
import { InventoryPriceAdjustmentManagement } from './InventoryPriceAdjustmentManagement'

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
  currentPeriodTransactions: number
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
  const selectedSite = (sites.data ?? []).find((site) => site.departmentId === departmentId)
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
  const transactions = useQuery({
    queryKey: ['warehouse-transactions', siteId], queryFn: () => api.pharmacy.transactions(siteId),
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
        queryClient.invalidateQueries({ queryKey: ['warehouse-transactions', siteId] }),
      ])
      setReceiptDialogOpen(false)
    },
  })

  const selectedBin = bins.data?.find((bin) => bin.id === selectedBinId)
  const selectedReceiptItem = items.data?.find((item) => item.id === receiptItemId)
  const inventoryVarietyCount = new Set((balances.data ?? []).filter(row => row.quantityOnHand !== 0)
    .map(row => row.stockItemId)).size
  const error = sites.error || bins.error || items.error || balances.error || transactions.error

  return <>
    <PageHeader title="库房管理" compact />
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}

    <div className="warehouse-workspace warehouse-workspace--department">
      <Panel className="warehouse-detail">
        {sites.isPending ? <LoadingState label="正在加载科室库存配置…" /> : !selectedSite
          ? <EmptyState icon="pharmacy" title="当前科室未启用库存能力"
            copy="库房不在此单独新建。请在组织与人员中维护科室类型，库存配置将随科室建立。" /> : <>
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
            onAdd={(parentId) => setBinDialogParentId(parentId ?? null)} />}
          {tab === 'items' && <ItemSection items={items.data ?? []} loading={items.isPending}
            onAdd={() => setItemDialogOpen(true)} onInspect={(id) => { setLedgerItemId(id); setTab('inventory') }} />}
          {tab === 'inventory' && <InventorySection api={api} siteId={siteId} items={items.data ?? []}
            bins={bins.data ?? []} selectedItemId={ledgerItemId} onInspect={setLedgerItemId}
            loading={balances.isPending || transactions.isPending} balances={balances.data ?? []}
            transactions={transactions.data ?? []} onReceive={(itemId) => {
              setReceiptItemId(itemId); setReceiptDialogOpen(true)
            }} />}
          {tab === 'trace' && <TraceCodeManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} />}
          {tab === 'accuracy' && <InventoryAccuracyManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} />}
          {tab === 'period' && <InventoryPeriodManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} />}
          {tab === 'price' && <InventoryPriceAdjustmentManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} balances={balances.data ?? []} />}
          {(['purchase', 'requisition', 'transfer', 'count'] as ActiveTab[]).includes(tab) &&
            <WarehouseOperations tab={tab as OperationTab} api={api} site={selectedSite}
              sites={sites.data ?? []} items={items.data ?? []} bins={bins.data ?? []} onNavigate={onNavigate} />}
        </>}
      </Panel>
    </div>

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

function BinSection({ bins, selected, selectedId, loading, onSelect, onAdd }: {
  bins: StockBin[]; selected?: StockBin; selectedId?: string; loading: boolean
  onSelect: (id?: string) => void; onAdd: (parentId?: string) => void
}) {
  return <div className="warehouse-bin-layout">
    <TreePanel title="库位结构" rootLabel="全部库位" searchPlaceholder="搜索库位名称或编码" busy={loading}
      nodes={bins.map((bin) => ({ id: bin.id, parentId: bin.parentBinId, label: bin.name,
        secondaryText: bin.code, keywords: [bin.code, binTypeText[bin.binType]], inactive: !bin.active }))}
      selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} emptyText="尚未配置库位" />
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
      <Button variant="secondary" size="sm" onClick={() => onAdd(selected.id)}>新增下级库位</Button>
    </>}</div>
  </div>
}

function ItemSection({ items, loading, onAdd, onInspect }: {
  items: StockItem[]; loading: boolean; onAdd: () => void; onInspect: (id: string) => void
}) {
  return <section className="warehouse-section">
    <header className="warehouse-section__toolbar"><strong>库房经营目录</strong>
      <Button size="sm" onClick={onAdd}>批量调入</Button></header>
    {loading ? <LoadingState label="正在加载经营项目…" /> : !items.length
      ? <EmptyState icon="pharmacy" title="尚未配置经营项目" copy="从机构已启用的药品产品中批量选择包装调入当前科室。"
        action={<Button size="sm" onClick={onAdd}>批量调入</Button>} />
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
  transactions, onReceive }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]; selectedItemId: string
  onInspect: (id: string) => void; loading: boolean; balances: InventoryBalance[]
  transactions: InventoryTransaction[]; onReceive: (itemId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [stockFilter, setStockFilter] = useState('ALL')
  const selectedItem = items.find(item => item.id === selectedItemId)
  const history = useQuery({
    queryKey: ['warehouse-item-ledger', siteId, selectedItemId],
    queryFn: () => api.pharmacy.transactions(siteId, { stockItemId: selectedItemId, allPeriods: true }),
    enabled: Boolean(siteId && selectedItemId),
  })
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
        currentPeriodTransactions: transactions.filter(transaction => transaction.lines
          .some(line => line.stockItemId === item.id)).length,
      }
    }).sort((left, right) => Number(right.onHand !== 0) - Number(left.onHand !== 0)
      || left.item.productName.localeCompare(right.item.productName, 'zh-CN'))
  }, [balances, items, transactions])
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
        <span className="warehouse-metric-chip">本期记账 <strong>{transactions.length}</strong></span>
      </div>
    </div>
    {!items.length ? <EmptyState icon="pharmacy" title="没有可查询的经营项目" copy="请先维护库房经营项目。" />
      : loading ? <LoadingState label="正在汇总全库库存…" /> : !filtered.length
        ? <EmptyState icon="pharmacy" title="没有符合条件的库存" copy="请调整搜索词或库存状态筛选。" />
        : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-inventory-summary-table"><thead><tr>
          <th>药品</th><th>库存状态</th><th>批次 / 库位</th><th>账面库存</th><th>可用库存</th>
          <th>预留 / 冻结</th><th>平均成本</th><th>最近变动</th><th aria-label="操作">操作</th>
        </tr></thead><tbody>{filtered.map(summary => {
          const item = summary.item
          const canReceive = hasReceiveBin && !item.traceRequired
          const status = summary.onHand === 0
            ? <StatusBadge tone="neutral">零库存</StatusBadge>
            : summary.available <= 0 ? <StatusBadge tone="warning">暂无可用</StatusBadge>
              : summary.expiringLots > 0 ? <StatusBadge tone="warning">存在临期</StatusBadge>
                : <StatusBadge tone="success">库存正常</StatusBadge>
          return <tr key={item.id}>
            <td><strong>{item.productName}</strong><code>{item.productCode}</code><small>{[item.packageSpec || item.packageUnitName, item.manufacturerName].filter(Boolean).join(' · ')}</small></td>
            <td>{status}{summary.earliestExpiry && <small>最近效期 {summary.earliestExpiry}</small>}</td>
            <td><strong>{summary.activeLots} 批</strong><small>{summary.binCount} 个库位</small></td>
            <td><strong>{formatWarehouseQuantity(summary.onHand)} {item.baseUnitCode}</strong>
              <small>≈ {item.packageFactor ? formatWarehousePackageQuantity(summary.onHand / item.packageFactor) : '—'} {item.packageUnitName}</small></td>
            <td><strong>{formatWarehouseQuantity(summary.available)} {item.baseUnitCode}</strong></td>
            <td><strong>{formatWarehouseQuantity(summary.reserved)} / {formatWarehouseQuantity(summary.frozen)}</strong></td>
            <td>{summary.averageUnitCost === undefined ? '—' : formatWarehouseMoney(summary.averageUnitCost)}</td>
            <td>{summary.latestProjectedAt ? formatWarehouseTime(summary.latestProjectedAt) : '尚未记账'}
              <small>本期 {summary.currentPeriodTransactions} 笔</small></td>
            <td><div className="warehouse-row-actions"><Button variant="text" size="sm" onClick={() => onInspect(item.id)}>查看流水</Button>
              <Button variant="text" size="sm" disabled={!canReceive} onClick={() => onReceive(item.id)}>入库</Button></div></td>
          </tr>
        })}</tbody></table></div>}
    {selectedItem && <InventoryLedgerDialog item={selectedItem}
      summary={summaries.find(value => value.item.id === selectedItem.id)} bins={bins}
      transactions={history.data ?? []} loading={history.isPending} error={history.error}
      onClose={() => onInspect('')} />}
  </section>
}

function InventoryLedgerDialog({ item, summary, bins, transactions, loading, error, onClose }: {
  item: StockItem; summary?: InventorySummary; bins: StockBin[]; transactions: InventoryTransaction[]
  loading: boolean; error: unknown; onClose: () => void
}) {
  const entries = useMemo(() => {
    const values = transactions.map(transaction => {
      const lines = transaction.lines.filter(line => line.stockItemId === item.id)
      return { transaction, lines, delta: lines.reduce((sum, line) => sum + Number(line.quantityDelta), 0) }
    }).filter(value => value.lines.length).sort((left, right) =>
      new Date(left.transaction.postedAt).getTime() - new Date(right.transaction.postedAt).getTime())
    let running = Number(summary?.onHand ?? 0) - values.reduce((sum, value) => sum + value.delta, 0)
    return values.map(value => {
      const before = running; running += value.delta
      const dimensions = value.lines.map(line => {
        const balance = summary?.balances.find(row => row.stockLotId === line.stockLotId
          && row.stockBinId === line.stockBinId && row.stockStatus === line.stockStatus)
        const bin = bins.find(candidate => candidate.id === line.stockBinId)
        return { id: line.id, bin: bin?.code ?? balance?.stockBinCode ?? line.stockBinId,
          lot: balance?.lotNo ?? line.stockLotId, delta: Number(line.quantityDelta) }
      })
      const amount = value.lines.reduce((sum, line) => sum + Number(line.amountDelta ?? 0), 0)
      const unitCosts = [...new Set(value.lines.map(line => line.unitCost).filter((cost): cost is number => cost !== undefined))]
      return { ...value, before, after: running, dimensions, amount, unitCost: unitCosts.length === 1 ? unitCosts[0] : undefined }
    }).reverse()
  }, [bins, item.id, summary, transactions])
  return <Dialog title="库存变动流水" eyebrow={item.productName} description={`${item.productCode} · 全部库存期间`}
    size="xwide" className="warehouse-ledger-dialog" onClose={onClose}
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    <div className="warehouse-ledger-summary"><div><span>当前账面</span><strong>{formatWarehouseQuantity(summary?.onHand ?? 0)}</strong><small>{item.baseUnitCode}</small></div>
      <div><span>当前可用</span><strong>{formatWarehouseQuantity(summary?.available ?? 0)}</strong><small>{item.baseUnitCode}</small></div>
      <div><span>批次 / 库位</span><strong>{summary?.activeLots ?? 0} / {summary?.binCount ?? 0}</strong><small>当前有效</small></div>
      <div><span>历史记账</span><strong>{entries.length}</strong><small>笔</small></div></div>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {loading ? <LoadingState label="正在梳理完整账目流水…" /> : !entries.length
      ? <EmptyState icon="pharmacy" title="暂无库存流水" copy="该药品完成首次库存记账后，将在这里显示每次变动前后的数量。" />
      : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-ledger-table"><thead><tr>
        <th>业务 / 记账时间</th><th>流水号 / 来源单据</th><th>业务类型</th><th>批号 / 库位明细</th>
        <th>本次变动</th><th>变动前 → 变动后</th><th>成本</th><th>记账人</th>
      </tr></thead><tbody>{entries.map(entry => <tr key={entry.transaction.id}>
        <td><strong>{formatWarehouseTime(entry.transaction.occurredAt)}</strong><small>记账 {formatWarehouseTime(entry.transaction.postedAt)}</small></td>
        <td><strong>{entry.transaction.transactionNo}</strong><code>{entry.transaction.sourceCode}</code>
          {entry.transaction.description && <small>{entry.transaction.description}</small>}</td>
        <td><strong>{transactionTypeText[entry.transaction.transactionType] ?? entry.transaction.transactionType}</strong>
          <small>{entry.transaction.sourceType}</small></td>
        <td>{entry.dimensions.map(value => <small className="warehouse-ledger-dimension" key={value.id}>
          {value.lot} · {value.bin} · {value.delta > 0 ? '+' : ''}{formatWarehouseQuantity(value.delta)}
        </small>)}</td>
        <td><strong className={`warehouse-ledger-delta ${entry.delta >= 0 ? 'is-positive' : 'is-negative'}`}>
          {entry.delta > 0 ? '+' : ''}{formatWarehouseQuantity(entry.delta)} {item.baseUnitCode}</strong></td>
        <td><strong>{formatWarehouseQuantity(entry.before)} → {formatWarehouseQuantity(entry.after)}</strong></td>
        <td>{entry.unitCost === undefined ? '—' : formatWarehouseMoney(entry.unitCost)}
          {entry.amount !== 0 && <small>金额 {formatWarehouseMoney(entry.amount)}</small>}</td>
        <td>{entry.transaction.postedBy}</td>
      </tr>)}</tbody></table></div>}
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

function ItemDialog({ api, organizationId, stockSiteType, existingItems, busy, error, onClose, onSubmit }: {
  api: RhnApi; organizationId: string; stockSiteType: string; existingItems: StockItem[]; busy: boolean; error: unknown
  onClose: () => void; onSubmit: (input: ItemInput[]) => void
}) {
  const productsQuery = useQuery({ queryKey: ['warehouse-catalog-products', organizationId],
    queryFn: () => api.masterData.medications('', '', 'ACTIVE', organizationId) })
  const products = useMemo(() => (productsQuery.data ?? []).flatMap((medication) => medication.products)
    .filter((product) => product.sdStatus === 'ACTIVE' && product.stocked
      && product.organizationAdoption?.sdStatus === 'ACTIVE' && product.organizationAdoption.stocked
      && (stockSiteType !== 'PHARMACY' || product.organizationAdoption.dispensable)
      && product.packages.some((itemPackage) => itemPackage.sdStatus === 'ACTIVE')
      && !existingItems.some((item) => item.catalogItemId === product.id)),
  [existingItems, productsQuery.data, stockSiteType])
  const [query, setQuery] = useState(''); const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [packageIds, setPackageIds] = useState<Record<string, string>>({})
  const [issuePolicy, setIssuePolicy] = useState<ItemInput['issuePolicy']>('FEFO')
  const [lotRequired, setLotRequired] = useState(true); const [traceRequired, setTraceRequired] = useState(true)
  const [splitAllowed, setSplitAllowed] = useState(false); const [coldChain, setColdChain] = useState(false)
  const [controlled, setControlled] = useState(false); const [highAlert, setHighAlert] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleProducts = products.filter((product) => !normalizedQuery
    || `${product.name} ${product.code} ${product.manufacturerName}`.toLocaleLowerCase().includes(normalizedQuery))
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id))
  const allVisibleSelected = Boolean(visibleProducts.length)
    && visibleProducts.every((product) => selectedIds.includes(product.id))
  const defaultPackageId = (product: (typeof products)[number]) => {
    const packages = product.packages.filter((value) => value.sdStatus === 'ACTIVE')
    return packages.find((value) => value.defaultDispense)?.id ?? packages[0]?.id ?? ''
  }
  const setProductSelected = (product: (typeof products)[number], selected: boolean) => {
    setSelectedIds((current) => selected
      ? current.includes(product.id) ? current : [...current, product.id]
      : current.filter((id) => id !== product.id))
    if (selected && !packageIds[product.id]) {
      setPackageIds((current) => ({ ...current, [product.id]: defaultPackageId(product) }))
    }
  }
  const toggleVisible = (selected: boolean) => {
    setSelectedIds((current) => selected
      ? [...new Set([...current, ...visibleProducts.map((product) => product.id)])]
      : current.filter((id) => !visibleProducts.some((product) => product.id === id)))
    if (selected) setPackageIds((current) => Object.fromEntries([
      ...Object.entries(current), ...visibleProducts.map((product) => [product.id, current[product.id] || defaultPackageId(product)]),
    ]))
  }
  const ready = selectedProducts.length > 0 && selectedProducts.every((product) => packageIds[product.id])
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
      value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、编码或生产厂家" /></label>
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
