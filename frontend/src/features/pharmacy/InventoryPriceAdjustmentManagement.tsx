import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type {
  InventoryBalance, InventoryPriceAdjustment, InventoryPriceAdjustmentLine, StockBin, StockItem,
} from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, Select, StatusBadge } from '../../shared/ui'

const statusText: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '待审核', APPROVED: '已审核', POSTING: '记账中', POSTED: '已记账', CANCELLED: '已取消',
}
const typeText: Record<string, string> = { COST_REVALUE: '成本重估', SALE_PRICE: '销售调价' }

export function InventoryPriceAdjustmentManagement({ api, siteId, items, bins, balances }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]; balances: InventoryBalance[]
}) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [postTarget, setPostTarget] = useState<InventoryPriceAdjustment>()
  const adjustments = useQuery({
    queryKey: ['warehouse-price-adjustments', siteId],
    queryFn: () => api.pharmacy.priceAdjustments(siteId), enabled: Boolean(siteId),
  })
  const selected = adjustments.data?.find(value => value.id === selectedId) ?? adjustments.data?.[0]

  useEffect(() => {
    if (!adjustments.data?.length) { setSelectedId(''); return }
    if (!adjustments.data.some(value => value.id === selectedId)) setSelectedId(adjustments.data[0].id)
  }, [adjustments.data, selectedId])

  const refresh = async (value?: InventoryPriceAdjustment) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['warehouse-price-adjustments', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-balances', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-period-close-runs'] }),
    ])
    if (value) setSelectedId(value.id)
  }
  const create = useMutation({
    mutationFn: (input: Parameters<RhnApi['pharmacy']['createPriceAdjustment']>[0]) => api.pharmacy.createPriceAdjustment(input),
    onSuccess: async value => { setCreateOpen(false); await refresh(value) },
  })
  const submit = useMutation({ mutationFn: api.pharmacy.submitPriceAdjustment, onSuccess: refresh })
  const approve = useMutation({ mutationFn: api.pharmacy.approvePriceAdjustment, onSuccess: refresh })
  const post = useMutation({
    mutationFn: api.pharmacy.postPriceAdjustment,
    onSuccess: async value => { setPostTarget(undefined); await refresh(value) },
  })
  const cancel = useMutation({ mutationFn: api.pharmacy.cancelPriceAdjustment, onSuccess: refresh })
  const error = adjustments.error || create.error || submit.error || approve.error || post.error || cancel.error

  return <section className="warehouse-section warehouse-price">
    <header className="warehouse-section__toolbar"><div><strong>库存调价</strong>
      <span>销售调价与成本重估分单管理；预检锁定库存快照，正式记账不改库存数量</span></div>
      <Button size="sm" onClick={() => { create.reset(); setCreateOpen(true) }}>新建调价单</Button></header>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {adjustments.isPending ? <LoadingState label="正在读取库存调价单…" /> : !adjustments.data?.length
      ? <EmptyState icon="pharmacy" title="尚无库存调价单" copy="可批量选择经营项目发起成本重估或销售调价，系统将完整保留调前、调后和差额。"
        action={<Button size="sm" onClick={() => setCreateOpen(true)}>新建调价单</Button>} />
      : <div className="warehouse-price__workspace">
        <AdjustmentList rows={adjustments.data} selectedId={selected?.id} onSelect={setSelectedId} />
        {selected && <AdjustmentDetail value={selected} items={items} bins={bins}
          busy={submit.isPending || approve.isPending || post.isPending || cancel.isPending}
          onSubmit={() => submit.mutate(selected.id)} onApprove={() => approve.mutate(selected.id)}
          onPost={() => setPostTarget(selected)} onCancel={() => cancel.mutate(selected.id)} />}
      </div>}
    {createOpen && <CreateAdjustmentDialog items={items} balances={balances} siteId={siteId}
      busy={create.isPending} error={create.error} onClose={() => setCreateOpen(false)} onSubmit={input => create.mutate(input)} />}
    {postTarget && <Dialog eyebrow="库存调价" title={`确认记账 ${postTarget.adjustmentNo}？`} size="wide"
      description="系统将再次核对预检时的库存版本；库存发生变化时会拒绝记账并要求重新建单。"
      onClose={() => setPostTarget(undefined)} footer={<><Button variant="secondary" onClick={() => setPostTarget(undefined)}>取消</Button>
        <Button busy={post.isPending} onClick={() => post.mutate(postTarget.id)}>确认正式记账</Button></>}>
      <div className="warehouse-period__confirm"><strong>记账影响</strong><ul>
        <li>{postTarget.adjustmentType === 'COST_REVALUE' ? '更新现存批次的单位成本，并写入独立价值调整流水。' : '生成新的目录销售价格版本，并写入零售价价值流水。'}</li>
        <li>库存数量、业务收发流水和历史价格记录均不会被改写。</li>
        <li>调价金额将归集到业务日期所属开放库存期间。</li>
      </ul></div>
    </Dialog>}
  </section>
}

function AdjustmentList({ rows, selectedId, onSelect }: {
  rows: InventoryPriceAdjustment[]; selectedId?: string; onSelect: (id: string) => void
}) {
  return <aside className="warehouse-price__list"><header><strong>调价单据</strong><span>{rows.length} 单</span></header>
    <div>{rows.map(row => <button type="button" key={row.id} className={row.id === selectedId ? 'is-selected' : ''}
      onClick={() => onSelect(row.id)}><span className="warehouse-price__list-main"><span><strong title={row.adjustmentNo}>{row.adjustmentNo}</strong>
        <StatusBadge tone={statusTone(row.status)}>{statusText[row.status] ?? row.status}</StatusBadge></span>
        <small>{typeText[row.adjustmentType]} · {row.businessDate}</small></span>
      <span className="warehouse-price__list-summary"><small>{row.lineCount} 个经营项目</small>
        <strong className={row.totalAdjustmentAmount < 0 ? 'is-negative' : ''}>{signedMoney(row.totalAdjustmentAmount)}</strong></span>
    </button>)}</div></aside>
}

function AdjustmentDetail({ value, items, bins, busy, onSubmit, onApprove, onPost, onCancel }: {
  value: InventoryPriceAdjustment; items: StockItem[]; bins: StockBin[]; busy: boolean
  onSubmit: () => void; onApprove: () => void; onPost: () => void; onCancel: () => void
}) {
  return <div className="warehouse-price__detail"><header className="warehouse-price__heading"><div>
    <span className="ui-eyebrow">{typeText[value.adjustmentType]}</span><h3>{value.adjustmentNo}</h3>
    <p>{value.businessDate} · {value.reason}{value.priceDocumentCode ? ` · 依据 ${value.priceDocumentCode}` : ''}</p></div>
    <div><StatusBadge tone={statusTone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge>
      {value.status === 'DRAFT' && <><Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>取消</Button>
        <Button size="sm" busy={busy} onClick={onSubmit}>提交预检</Button></>}
      {value.status === 'SUBMITTED' && <><Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>取消</Button>
        <Button size="sm" busy={busy} onClick={onApprove}>审核通过</Button></>}
      {value.status === 'APPROVED' && <Button size="sm" busy={busy} onClick={onPost}>正式记账</Button>}
    </div></header>
    <div className="warehouse-price__metrics"><Metric label="调前库存价值" value={money(value.totalValueBefore)} />
      <Metric label="调后库存价值" value={money(value.totalValueAfter)} />
      <Metric label="价值调整" value={signedMoney(value.totalAdjustmentAmount)} emphatic />
      <Metric label="影响范围" value={`${value.lineCount} 个经营项目`} />
    </div>
    <section className="warehouse-price__lines"><header><strong>调价明细</strong><span>数量统一按基本单位展示</span></header>
      <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr><th>经营项目</th><th>现存数量</th>
        <th>调前价格</th><th>调后价格</th><th>调前价值</th><th>调后价值</th><th>调整金额</th><th>批次 / 库位</th></tr></thead>
        <tbody>{value.lines.map(line => <LineRow key={line.id} line={line} type={value.adjustmentType} items={items} bins={bins} />)}</tbody>
      </table></div></section>
  </div>
}

function LineRow({ line, type, items, bins }: {
  line: InventoryPriceAdjustmentLine; type: InventoryPriceAdjustment['adjustmentType']; items: StockItem[]; bins: StockBin[]
}) {
  const item = items.find(value => value.id === line.stockItemId)
  const before = type === 'COST_REVALUE' ? line.oldUnitCost : line.oldSalePrice
  const after = type === 'COST_REVALUE' ? line.newUnitCost : line.newSalePrice
  const details = line.details ?? []
  const binCount = new Set(details.map(value => value.stockBinId)).size
  return <tr><td><strong>{item?.productName ?? `经营项目 …${line.stockItemId.slice(-6)}`}</strong>
    <small>{item?.productCode ?? line.stockItemId} · {item?.packageSpec ?? item?.packageUnitName}</small></td>
    <td><strong>{quantity(line.quantitySnapshot)} {item?.baseUnitCode ?? ''}</strong><small>{details.length} 个库存维度</small></td>
    <td>{before === undefined || before === null ? '预检后确认' : money(before)}</td><td><strong>{money(after)}</strong></td>
    <td>{money(line.valueBefore)}</td><td>{money(line.valueAfter)}</td><td><strong>{signedMoney(line.adjustmentAmount)}</strong></td>
    <td><strong>{details.length} 批次维度</strong><small>{binCount} 个库位{details[0] ? ` · ${binName(bins, details[0].stockBinId)}` : ''}</small></td></tr>
}

function CreateAdjustmentDialog({ items, balances, siteId, busy, error, onClose, onSubmit }: {
  items: StockItem[]; balances: InventoryBalance[]; siteId: string; busy: boolean; error: unknown; onClose: () => void
  onSubmit: (input: Parameters<RhnApi['pharmacy']['createPriceAdjustment']>[0]) => void
}) {
  const [type, setType] = useState<'COST_REVALUE' | 'SALE_PRICE'>('COST_REVALUE')
  const [businessDate, setBusinessDate] = useState(today())
  const [documentCode, setDocumentCode] = useState('')
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [targets, setTargets] = useState<Record<string, string>>({})
  const stockedItems = useMemo(() => items.filter(item => balances.some(row => row.stockItemId === item.id && row.quantityOnHand > 0)), [items, balances])
  const visible = stockedItems.filter(item => `${item.productName} ${item.productCode}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selectedCount = Object.values(targets).filter(value => value !== '').length
  const invalid = !reason.trim() || selectedCount === 0 || Object.values(targets).some(value => value !== '' && Number(value) < 0)
  const submit = () => onSubmit({ stockSiteId: siteId, requestCode: `PA-${Date.now()}`, adjustmentType: type,
    priceType: type === 'SALE_PRICE' ? 'SALE' : undefined, businessDate, currencyCode: 'CNY',
    priceDocumentCode: documentCode.trim() || undefined, reason: reason.trim(), lines: Object.entries(targets)
      .filter(([, value]) => value !== '').map(([stockItemId, value]) => type === 'COST_REVALUE'
        ? { stockItemId, newUnitCost: Number(value) } : { stockItemId, newSalePrice: Number(value) }),
  })

  return <Dialog eyebrow="库存调价" title="新建调价单" size="xwide"
    description="一次可选择多个经营项目。创建草稿后需经过预检、审核和正式记账。" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button busy={busy} disabled={invalid} onClick={submit}>创建调价单</Button></>}>
    <div className="warehouse-price-form">
      {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
      <div className="warehouse-price-form__meta">
        <FormField label="调价类型" required><Select value={type} clearable={false} searchable={false}
          options={[{ value: 'COST_REVALUE', label: '成本重估' }, { value: 'SALE_PRICE', label: '销售调价' }]}
          onChange={value => { setType(value as typeof type); setTargets({}) }} /></FormField>
        <FormField label="业务日期" required><input type="date" value={businessDate} onChange={event => setBusinessDate(event.target.value)} /></FormField>
        <FormField label="依据单号"><input value={documentCode} maxLength={128} placeholder="如价格通知单号" onChange={event => setDocumentCode(event.target.value)} /></FormField>
        <FormField label="调价原因" required><input value={reason} maxLength={1000} placeholder="说明调价依据和原因" onChange={event => setReason(event.target.value)} /></FormField>
      </div>
      <div className="warehouse-price-form__catalog"><header><div><strong>选择经营项目</strong><span>仅显示当前有库存的项目</span></div>
        <div><input aria-label="搜索经营项目" placeholder="搜索药品名称或编码" value={query} onChange={event => setQuery(event.target.value)} />
          <span>已选 {selectedCount} 项</span></div></header>
        <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr><th>选择</th><th>经营项目</th><th>现存数量</th>
          <th>当前加权成本</th><th>{type === 'COST_REVALUE' ? '新基本单位成本' : '新包装销售价'}</th></tr></thead>
          <tbody>{visible.map(item => { const summary = itemBalance(item.id, balances); const selected = targets[item.id] !== undefined
            return <tr key={item.id}><td><input type="checkbox" aria-label={`选择${item.productName}`} checked={selected}
              onChange={event => setTargets(current => { const next = { ...current }; if (event.target.checked) next[item.id] = ''; else delete next[item.id]; return next })} /></td>
              <td><strong>{item.productName}</strong><small>{item.productCode} · {item.packageSpec ?? item.packageUnitName}</small></td>
              <td><strong>{quantity(summary.quantity)} {item.baseUnitCode}</strong><small>约 {quantity(summary.quantity / item.packageFactor)} {item.packageUnitName}</small></td>
              <td>{summary.cost === undefined ? '—' : money(summary.cost)}</td><td><input className="warehouse-price-form__price" type="number" min="0" step="0.000001"
                disabled={!selected} value={targets[item.id] ?? ''} placeholder="0.000000"
                onChange={event => setTargets(current => ({ ...current, [item.id]: event.target.value }))} /></td></tr> })}</tbody></table></div>
      </div>
      <Alert tone="info">{type === 'COST_REVALUE'
        ? '成本重估价按基本单位填写；包装换算后的库存数量不会发生变化。'
        : '销售调价按当前经营包装填写，提交预检时系统会读取有效目录售价并换算到基本单位价值。'}</Alert>
    </div>
  </Dialog>
}

function Metric({ label, value, emphatic = false }: { label: string; value: string; emphatic?: boolean }) {
  return <div className={emphatic ? 'is-emphatic' : ''}><span>{label}</span><strong>{value}</strong></div>
}
function itemBalance(itemId: string, balances: InventoryBalance[]) {
  const rows = balances.filter(value => value.stockItemId === itemId && value.quantityOnHand > 0)
  const quantityValue = rows.reduce((sum, value) => sum + value.quantityOnHand, 0)
  const value = rows.reduce((sum, row) => sum + row.quantityOnHand * (row.averageUnitCost ?? 0), 0)
  return { quantity: quantityValue, cost: rows.some(row => row.averageUnitCost === undefined) || !quantityValue ? undefined : value / quantityValue }
}
function statusTone(value: string): 'neutral' | 'info' | 'warning' | 'success' {
  if (value === 'POSTED') return 'success'; if (value === 'SUBMITTED' || value === 'APPROVED') return 'warning'
  if (value === 'DRAFT') return 'info'; return 'neutral'
}
function money(value?: number) { return `¥ ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value ?? 0)}` }
function signedMoney(value?: number) { const amount = value ?? 0; return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${money(Math.abs(amount))}` }
function quantity(value?: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value ?? 0) }
function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) }
function binName(bins: StockBin[], id: string) { return bins.find(value => value.id === id)?.name ?? `库位 …${id.slice(-6)}` }
