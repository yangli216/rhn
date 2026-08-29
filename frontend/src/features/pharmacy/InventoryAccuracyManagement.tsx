import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { InventoryOpenPackage, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, Select, StatusBadge } from '../../shared/ui'

const issueText: Record<string, string> = {
  LEDGER_BALANCE: '流水与余额', RESERVATION_BALANCE: '预留量',
  OPEN_PACKAGE_BALANCE: '拆零余量', TRACE_BALANCE: '追溯码数量',
}
const packageStatusText: Record<string, string> = { OPEN: '使用中', CONSUMED: '已用完', VOID: '已作废' }

export function InventoryAccuracyManagement({ api, siteId, items, bins }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]
}) {
  const queryClient = useQueryClient()
  const [openDialog, setOpenDialog] = useState(false)
  const latest = useQuery({
    queryKey: ['warehouse-reconciliation-latest', siteId],
    queryFn: async () => (await api.pharmacy.latestInventoryReconciliation(siteId)) ?? null,
    enabled: Boolean(siteId),
  })
  const packages = useQuery({
    queryKey: ['warehouse-open-packages', siteId],
    queryFn: () => api.pharmacy.openPackages(siteId), enabled: Boolean(siteId),
  })
  const packageItemIds = [...new Set((packages.data ?? []).map(value => value.stockItemId))]
  const lots = useQuery({ queryKey: ['warehouse-open-package-lots', siteId, packageItemIds.join(',')],
    queryFn: async () => (await Promise.all(packageItemIds.map(itemId => api.pharmacy.lots(itemId)))).flat(), enabled: Boolean(packageItemIds.length) })
  const reconcile = useMutation({
    mutationFn: () => api.pharmacy.reconcileInventory(siteId),
    onSuccess: (value) => queryClient.setQueryData(['warehouse-reconciliation-latest', siteId], value),
  })
  const activePackages = packages.data?.filter(value => value.status === 'OPEN') ?? []
  const remaining = activePackages.reduce((sum, value) => sum + value.remainingBaseQuantity, 0)
  const last = latest.data
  const error = latest.error || packages.error || lots.error || reconcile.error

  return <section className="warehouse-section warehouse-accuracy">
    <header className="warehouse-section__toolbar"><div><strong>库存准确性控制</strong>
      <span>核对不可变流水、库存余额、有效预留、拆零余量和追溯码数量</span></div>
      <div className="warehouse-accuracy__actions">
        <Button size="sm" variant="secondary" onClick={() => setOpenDialog(true)}>登记拆零</Button>
        <Button size="sm" busy={reconcile.isPending} onClick={() => reconcile.mutate()}>立即校验</Button>
      </div></header>
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    {latest.isPending || packages.isPending ? <LoadingState label="正在读取账目校验结果…" /> : <>
      <div className="warehouse-metrics warehouse-accuracy__metrics">
        <div><span>最近校验</span><strong className="warehouse-accuracy__metric-text">{last ? statusLabel(last.status) : '尚未执行'}</strong>
          <small>{last ? formatTime(last.completedAt ?? last.startedAt) : '建议首次启用后立即校验'}</small></div>
        <div><span>校验维度</span><strong>{last?.dimensionCount ?? 0}</strong><small>库存余额组合</small></div>
        <div><span>差异项</span><strong>{last?.issueCount ?? 0}</strong><small>{last?.issueCount ? '请逐项核查' : '未发现账目差异'}</small></div>
        <div><span>在用拆零包装</span><strong>{activePackages.length}</strong><small>剩余 {formatQuantity(remaining)} 基本单位</small></div>
      </div>
      <div className="warehouse-accuracy__grid">
        <article className="warehouse-accuracy__card"><header><div><strong>账目校验结果</strong>
          <span>{last?.runNo ?? '尚无校验记录'}</span></div>
          {last && <StatusBadge tone={last.status === 'PASSED' ? 'success' : last.status === 'ISSUES' ? 'warning' : 'danger'}>
            {statusLabel(last.status)}</StatusBadge>}</header>
          {last && <dl className="warehouse-reconciliation-facts"><div><dt>运行方式</dt><dd>{last.runType === 'MANUAL' ? '人工执行' : '定时任务'}</dd></div>
            <div><dt>业务日期</dt><dd>{last.businessDate}</dd></div><div><dt>执行人</dt><dd>{last.runBy ?? '系统任务'}</dd></div>
            <div><dt>耗时</dt><dd>{last.completedAt ? formatDuration(last.startedAt, last.completedAt) : '执行中'}</dd></div></dl>}
          {!last ? <EmptyState icon="pharmacy" title="尚未执行库存校验" copy="点击“立即校验”，系统将自动比对四类库存账目。" />
            : !last.lines.length ? <div className="warehouse-accuracy__passed"><span aria-hidden="true">✓</span>
              <div><strong>账实关系一致</strong><p>流水、余额、预留、拆零与追溯账目未发现差异。</p></div></div>
              : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-accuracy__table"><thead><tr>
                <th>校验项</th><th>经营项目 / 库位</th><th>期望</th><th>实际</th><th>差异</th><th>级别</th>
              </tr></thead><tbody>{last.lines.map(line => <tr key={line.id}>
                <td><strong>{issueText[line.issueType] ?? line.issueType}</strong><small>{line.description}</small></td>
                <td><strong>{itemName(items, line.stockItemId)}</strong><small>{binName(bins, line.stockBinId)}</small></td>
                <td>{formatQuantity(line.expectedQuantity)}</td><td>{formatQuantity(line.actualQuantity)}</td>
                <td><strong>{formatQuantity(line.differenceQuantity)}</strong></td>
                <td><StatusBadge tone={line.severity === 'ERROR' ? 'danger' : 'warning'}>
                  {line.severity === 'ERROR' ? '错误' : '预警'}</StatusBadge></td>
              </tr>)}</tbody></table></div>}
        </article>
        <article className="warehouse-accuracy__card"><header><div><strong>拆零包装台账</strong>
          <span>每次开包、消耗和退回均保留余额轨迹</span></div><StatusBadge tone="info">{packages.data?.length ?? 0} 条</StatusBadge></header>
          {!packages.data?.length ? <EmptyState icon="pharmacy" title="暂无拆零包装" copy="发生拆零发药时系统会自动建账，也可人工登记已开包装。" />
            : <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-accuracy__table"><thead><tr>
              <th>药品 / 开包时间</th><th>批号 / 追溯</th><th>库位</th><th>开包数量</th><th>当前余量</th><th>状态</th>
            </tr></thead><tbody>{packages.data.map(value => <PackageRow key={value.id} value={value} items={items} bins={bins}
              lot={lots.data?.find(lot => lot.id === value.stockLotId)} />)}</tbody></table></div>}
        </article>
      </div>
    </>}
    {openDialog && <OpenPackageDialog api={api} siteId={siteId} items={items} bins={bins}
      onClose={() => setOpenDialog(false)} onDone={async () => {
        await queryClient.invalidateQueries({ queryKey: ['warehouse-open-packages', siteId] })
        setOpenDialog(false)
      }} />}
  </section>
}

function PackageRow({ value, items, bins, lot }: { value: InventoryOpenPackage; items: StockItem[]; bins: StockBin[]; lot?: Awaited<ReturnType<RhnApi['pharmacy']['lots']>>[number] }) {
  return <tr><td><strong>{itemName(items, value.stockItemId)}</strong><small>{formatTime(value.openedAt)}{value.traceCodeId ? ' · 已绑定追溯码' : ''}</small></td>
    <td><strong>{lot?.lotNo ?? '批次资料缺失'}</strong><small>{lot?.expiryDate ?? '无效期'} · {value.traceCodeId ? `追溯 …${value.traceCodeId.slice(-6)}` : '无追溯码'}</small></td>
    <td>{binName(bins, value.stockBinId)}</td><td>{formatQuantity(value.openedBaseQuantity)} {value.baseUnitCode}</td>
    <td><strong>{formatQuantity(value.remainingBaseQuantity)} {value.baseUnitCode}</strong></td>
    <td><StatusBadge tone={value.status === 'OPEN' ? 'info' : value.status === 'CONSUMED' ? 'success' : 'neutral'}>
      {packageStatusText[value.status] ?? value.status}</StatusBadge></td></tr>
}

function OpenPackageDialog({ api, siteId, items, bins, onClose, onDone }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]; onClose: () => void; onDone: () => void
}) {
  const eligibleItems = useMemo(() => items.filter(value => value.splitAllowed), [items])
  const [itemId, setItemId] = useState(eligibleItems[0]?.id ?? '')
  const [dimension, setDimension] = useState('')
  const [description, setDescription] = useState('')
  const balances = useQuery({ queryKey: ['warehouse-open-package-balances', siteId, itemId],
    queryFn: () => api.pharmacy.balances(siteId, itemId), enabled: Boolean(itemId) })
  const available = balances.data?.filter(value => value.stockStatus === 'AVAILABLE' && value.quantityOnHand > 0) ?? []
  useEffect(() => { setDimension(available[0] ? `${available[0].stockBinId}:${available[0].stockLotId}` : '') }, [itemId, balances.data])
  const mutation = useMutation({ mutationFn: () => {
    const [stockBinId, stockLotId] = dimension.split(':')
    return api.pharmacy.openPackage({ requestCode: `OPEN-${Date.now()}`, stockSiteId: siteId,
      stockBinId, stockItemId: itemId, stockLotId, occurredAt: new Date().toISOString(),
      description: description.trim() || undefined })
  }, onSuccess: onDone })
  return <Dialog title="登记拆零包装" eyebrow="拆零余量台账" size="wide"
    description="登记后将从整包装可用量中锁定一包装，并按基本单位持续记录消耗与退回；追溯药品会同步绑定完整追溯码。"
    onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!itemId || !dimension} onClick={() => mutation.mutate()}>确认开包</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    {!eligibleItems.length ? <Alert>当前没有已启用拆零管理的经营项目。</Alert>
      : <div className="warehouse-form-grid"><FormField label="经营项目" required><Select searchable showValue
        value={itemId} onChange={setItemId} options={eligibleItems.map(value => ({ value: value.id,
          label: value.productName, secondaryText: value.productCode }))} /></FormField>
        <FormField label="库存批次与库位" required><Select searchable showValue value={dimension} onChange={setDimension}
          placeholder={balances.isPending ? '正在加载库存…' : '选择有库存的批次'} options={available.map(value => ({
            value: `${value.stockBinId}:${value.stockLotId}`, label: `${value.lotNo} · ${binName(bins, value.stockBinId)}`,
            secondaryText: `可用 ${formatQuantity(value.quantityAvailable)} ${value.baseUnitCode}` }))} /></FormField>
        <FormField className="warehouse-form-grid__full" label="开包说明"><input className="ui-field__control"
          value={description} onChange={event => setDescription(event.target.value)} placeholder="如窗口拆零备用" /></FormField></div>}
  </Dialog>
}

function itemName(items: StockItem[], id?: string) { return items.find(value => value.id === id)?.productName ?? '未知经营项目' }
function binName(bins: StockBin[], id?: string) { return bins.find(value => value.id === id)?.name ?? '未知库位' }
function formatQuantity(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value) }
function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function formatDuration(startedAt: string, completedAt: string) {
  const seconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}
function statusLabel(status: string) { return ({ PASSED: '校验通过', ISSUES: '发现差异', RUNNING: '校验中', FAILED: '校验失败' }[status] ?? status) }
