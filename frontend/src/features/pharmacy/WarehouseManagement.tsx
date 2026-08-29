import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, LoadingState, PageHeader, Panel,
  Select, StatusBadge, TreePanel,
} from '../../shared/ui'
import { WarehouseOperations, type OperationTab } from './WarehouseOperations'
import { TraceCodeManagement } from './TraceCodeManagement'
import { InventoryAccuracyManagement } from './InventoryAccuracyManagement'

const siteTypeText: Record<string, string> = {
  WAREHOUSE: '药库', PHARMACY: '药房', DEPARTMENT_STORE: '科室库', VIRTUAL: '虚拟库',
}
const serviceScopeText: Record<string, string> = {
  OUTPATIENT: '门诊', INPATIENT: '住院', EMERGENCY: '急诊', COMMUNITY: '基层', MIXED: '综合',
}
const binTypeText: Record<string, string> = {
  ZONE: '库区', RACK: '货架', BIN: '货位', COUNTER: '柜台', TRANSIT: '在途位',
}
const stockStatusText: Record<string, string> = {
  AVAILABLE: '可用', PENDING: '待验', QUARANTINE: '隔离', DAMAGED: '破损', EXPIRED: '过期',
}
const issuePolicyText: Record<string, string> = { FEFO: '近效期先出', FIFO: '先进先出', MANUAL: '人工指定' }

type ActiveTab = 'bins' | 'items' | 'inventory' | 'trace' | 'accuracy' | OperationTab
type BinInput = Parameters<RhnApi['pharmacy']['createStockBin']>[1]
type ItemInput = Parameters<RhnApi['pharmacy']['createStockItem']>[1]
type ReceiptDraft = {
  stockItemId: string; stockBinId: string; lotNo: string; expiryDate?: string
  operationQuantity: number; unitCost?: number; sourceCode: string; description?: string
}

export function WarehouseManagement({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const organizationId = clinicalContext.organization.id
  const departmentId = clinicalContext.department.id
  const [tab, setTab] = useState<ActiveTab>('purchase')
  const [selectedBinId, setSelectedBinId] = useState<string>()
  const [inventoryItemId, setInventoryItemId] = useState('')
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
    queryKey: ['warehouse-balances', siteId, inventoryItemId],
    queryFn: () => api.pharmacy.balances(siteId, inventoryItemId),
    enabled: tab === 'inventory' && Boolean(siteId && inventoryItemId),
  })
  const transactions = useQuery({
    queryKey: ['warehouse-transactions', siteId], queryFn: () => api.pharmacy.transactions(siteId),
    enabled: tab === 'inventory' && Boolean(siteId),
  })

  useEffect(() => {
    setSelectedBinId(undefined); setInventoryItemId('')
  }, [siteId])
  useEffect(() => {
    if (items.data?.length && !items.data.some((item) => item.id === inventoryItemId)) {
      setInventoryItemId(items.data[0].id)
    }
    if (!items.data?.length) setInventoryItemId('')
  }, [inventoryItemId, items.data])

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
      setInventoryItemId(values[0]?.id ?? ''); setItemDialogOpen(false)
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
  const selectedInventoryItem = items.data?.find((item) => item.id === inventoryItemId)
  const totalOnHand = balances.data?.reduce((sum, row) => sum + row.quantityOnHand, 0) ?? 0
  const totalAvailable = balances.data?.reduce((sum, row) => sum + row.quantityAvailable, 0) ?? 0
  const expiringCount = balances.data?.filter((row) => row.expiryDate
    && new Date(row.expiryDate).getTime() <= Date.now() + 90 * 86400000).length ?? 0
  const error = sites.error || bins.error || items.error || balances.error || transactions.error

  return <>
    <PageHeader eyebrow="药事管理 · 库房作业" title="库房管理"
      description="在科室库存基础上完成采购、请领、调拨、盘点与不可变库存记账。" />
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <div className="warehouse-context-strip">
      <div><span>当前机构</span><strong>{clinicalContext.organization.name}</strong></div>
      <div><span>当前科室</span><strong>{clinicalContext.department.name}</strong></div>
      <div><span>科室类型</span><strong>{clinicalContext.department.sdDepartmentTypeText}</strong></div>
    </div>

    <div className="warehouse-workspace warehouse-workspace--department">
      <Panel className="warehouse-detail">
        {sites.isPending ? <LoadingState label="正在加载科室库存配置…" /> : !selectedSite
          ? <EmptyState icon="pharmacy" title="当前科室未启用库存能力"
            copy="库房不在此单独新建。请在组织与人员中维护科室类型，库存配置将随科室建立。" /> : <>
          <header className="warehouse-detail__head">
            <div><span className="ui-eyebrow">{clinicalContext.department.code}</span><h2>{clinicalContext.department.name}</h2>
              <p>{siteTypeText[selectedSite.siteType]} · {serviceScopeText[selectedSite.serviceScope]}
                {' · '}科室库存配置</p></div>
            <StatusBadge tone={selectedSite.active ? 'success' : 'neutral'}>{selectedSite.active ? '当前有效' : '已停用'}</StatusBadge>
          </header>
          <nav className="warehouse-tabs" aria-label="库房管理内容">
            {([['purchase', '采购验收', undefined], ['requisition', '科室请领', undefined],
              ['transfer', '库间调拨', undefined], ['count', '库存盘点', undefined],
              ['trace', '追溯码', undefined], ['accuracy', '账目校验', undefined],
              ['inventory', '库存查询', balances.data?.length ?? 0], ['bins', '库位', bins.data?.length ?? 0],
              ['items', '经营项目', items.data?.length ?? 0]] as const).map(([value, label, count]) =>
              <button type="button" className={tab === value ? 'is-active' : ''} key={value}
                onClick={() => setTab(value)}>{label}{count !== undefined && <span>{count}</span>}</button>)}
          </nav>
          {tab === 'bins' && <BinSection bins={bins.data ?? []} selected={selectedBin}
            selectedId={selectedBinId} loading={bins.isPending} onSelect={setSelectedBinId}
            onAdd={(parentId) => setBinDialogParentId(parentId ?? null)} />}
          {tab === 'items' && <ItemSection items={items.data ?? []} loading={items.isPending}
            onAdd={() => setItemDialogOpen(true)} onInspect={(id) => { setInventoryItemId(id); setTab('inventory') }} />}
          {tab === 'inventory' && <InventorySection items={items.data ?? []} itemId={inventoryItemId}
            onItemChange={setInventoryItemId} item={selectedInventoryItem} loading={balances.isPending}
            balances={balances.data ?? []} transactions={transactions.data ?? []}
            totals={{ onHand: totalOnHand, available: totalAvailable, expiring: expiringCount }}
            canReceive={Boolean(selectedInventoryItem && !selectedInventoryItem.traceRequired
              && bins.data?.some((bin) => bin.active && bin.receiveAllowed))}
            onReceive={() => setReceiptDialogOpen(true)} />}
          {tab === 'trace' && <TraceCodeManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} />}
          {tab === 'accuracy' && <InventoryAccuracyManagement api={api} siteId={siteId}
            items={items.data ?? []} bins={bins.data ?? []} />}
          {(['purchase', 'requisition', 'transfer', 'count'] as ActiveTab[]).includes(tab) &&
            <WarehouseOperations tab={tab as OperationTab} api={api} site={selectedSite}
              sites={sites.data ?? []} items={items.data ?? []} bins={bins.data ?? []} />}
        </>}
      </Panel>
    </div>

    {binDialogParentId !== undefined && selectedSite && <BinDialog parent={bins.data?.find((bin) => bin.id === binDialogParentId)}
      busy={createBin.isPending} error={createBin.error}
      onClose={() => { createBin.reset(); setBinDialogParentId(undefined) }} onSubmit={(input) => createBin.mutate(input)} />}
    {itemDialogOpen && selectedSite && <ItemDialog api={api} organizationId={organizationId} stockSiteType={selectedSite.siteType}
      existingItems={items.data ?? []} busy={createItems.isPending} error={createItems.error}
      onClose={() => { createItems.reset(); setItemDialogOpen(false) }} onSubmit={(input) => createItems.mutate(input)} />}
    {receiptDialogOpen && selectedInventoryItem && <ReceiptDialog item={selectedInventoryItem} bins={bins.data ?? []}
      busy={receive.isPending} error={receive.error}
      onClose={() => { receive.reset(); setReceiptDialogOpen(false) }} onSubmit={(input) => receive.mutate(input)} />}
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
    <header className="warehouse-section__toolbar"><div><strong>库房经营目录</strong><span>控制当前库房可收、可存、可发的药品包装</span></div>
      <Button size="sm" onClick={onAdd}>批量调入</Button></header>
    {loading ? <LoadingState label="正在加载经营项目…" /> : !items.length
      ? <EmptyState icon="pharmacy" title="尚未配置经营项目" copy="从机构已启用的药品产品中批量选择包装调入当前科室。"
        action={<Button size="sm" onClick={onAdd}>批量调入</Button>} />
      : <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr>
        <th>药品产品</th><th>包装</th><th>出库策略</th><th>管控属性</th><th>状态</th><th aria-label="操作" />
      </tr></thead><tbody>{items.map((item) => <tr key={item.id}>
        <td><strong>{item.productName}</strong><code>{item.productCode}</code></td>
        <td>{item.packageSpec || item.packageUnitName}<small>1 {item.packageUnitName} = {item.packageFactor} {item.baseUnitCode}</small></td>
        <td>{issuePolicyText[item.issuePolicy]}</td>
        <td><div className="warehouse-tags">{item.lotRequired && <span>批号</span>}{item.traceRequired && <span>追溯</span>}
          {item.coldChain && <span>冷链</span>}{item.controlled && <span>受控</span>}{item.highAlert && <span>高警示</span>}</div></td>
        <td><StatusBadge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>{item.status === 'ACTIVE' ? '启用' : item.status}</StatusBadge></td>
        <td><Button variant="text" size="sm" onClick={() => onInspect(item.id)}>看库存</Button></td>
      </tr>)}</tbody></table></div>}
  </section>
}

function InventorySection({ items, itemId, onItemChange, item, loading, balances, transactions, totals,
  canReceive, onReceive }: {
  items: StockItem[]; itemId: string; onItemChange: (id: string) => void; item?: StockItem; loading: boolean
  balances: Awaited<ReturnType<RhnApi['pharmacy']['balances']>>
  transactions: Awaited<ReturnType<RhnApi['pharmacy']['transactions']>>
  totals: { onHand: number; available: number; expiring: number }
  canReceive: boolean; onReceive: () => void
}) {
  return <section className="warehouse-section">
    <header className="warehouse-inventory-toolbar"><div><strong>实时库存</strong><span>按经营项目聚合至批次和库位</span></div>
      <div className="warehouse-inventory-actions"><Select value={itemId} onChange={onItemChange} searchable showValue placeholder="选择经营项目"
        options={items.map((value) => ({ value: value.id, label: value.productName, secondaryText: value.productCode }))} />
        <Button size="sm" disabled={!canReceive} onClick={onReceive}>入库记账</Button></div></header>
    {!items.length ? <EmptyState icon="pharmacy" title="没有可查询的经营项目" copy="请先维护库房经营项目。" /> : <>
      <div className="warehouse-metrics"><div><span>账面数量</span><strong>{totals.onHand}</strong><small>{item?.baseUnitCode}</small></div>
        <div><span>可用数量</span><strong>{totals.available}</strong><small>{item?.baseUnitCode}</small></div>
        <div><span>90 天内到期批次</span><strong>{totals.expiring}</strong><small>批</small></div>
        <div><span>本期流水</span><strong>{transactions.length}</strong><small>笔</small></div></div>
      {loading ? <LoadingState label="正在汇总库存…" /> : !balances.length
        ? <EmptyState icon="pharmacy" title="尚无库存余额" copy="该经营项目完成首次入库记账后，将在这里按批次和库位展示。" />
        : <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr>
          <th>库位</th><th>批号 / 效期</th><th>库存状态</th><th>账面</th><th>预留</th><th>冻结</th><th>可用</th>
        </tr></thead><tbody>{balances.map((row) => <tr key={row.id}><td><code>{row.stockBinCode}</code></td>
          <td><strong>{row.lotNo}</strong><small>{row.expiryDate || '无效期'}</small></td>
          <td>{stockStatusText[row.stockStatus] ?? row.stockStatus}</td><td>{row.quantityOnHand}</td>
          <td>{row.quantityReserved}</td><td>{row.quantityFrozen}</td><td><strong>{row.quantityAvailable}</strong></td>
        </tr>)}</tbody></table></div>}
    </>}
  </section>
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
    <div className="warehouse-receipt-product"><div><span>经营项目</span><strong>{item.productName}</strong><code>{item.productCode}</code></div>
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
