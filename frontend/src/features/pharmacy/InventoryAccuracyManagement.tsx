import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { InventoryOpenPackage, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { inventoryReconciliationPresentation } from '../../shared/presentation'
import { requireOpenPackages, requireReconciliation } from './inventoryAccuracyTruth'
import {
  Alert, Button, Dialog, EmptyState, FormField, LoadingState, Pagination, Select, StatusBadge,
} from '../../shared/ui'

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const latest = useQuery({
    queryKey: ['warehouse-reconciliation-latest', siteId],
    queryFn: async () => {
      const value = await api.pharmacy.latestInventoryReconciliation(siteId)
      return value == null ? null : requireReconciliation(value, siteId)
    },
    enabled: Boolean(siteId),
  })
  const packages = useQuery({
    queryKey: ['warehouse-open-packages', siteId],
    queryFn: async () => requireOpenPackages(await api.pharmacy.openPackages(siteId), siteId), enabled: Boolean(siteId),
  })
  const packageItemIds = [...new Set((packages.isSuccess ? packages.data : []).map(value => value.stockItemId))]
  const lots = useQuery({
    queryKey: ['warehouse-open-package-lots', siteId, packageItemIds.join(',')],
    queryFn: async () => (await Promise.all(packageItemIds.map(itemId => api.pharmacy.lots(itemId)))).flat(),
    enabled: Boolean(packageItemIds.length),
  })
  const reconcile = useMutation({
    mutationFn: async () => requireReconciliation(await api.pharmacy.reconcileInventory(siteId), siteId),
    onMutate: () => queryClient.cancelQueries({ queryKey: ['warehouse-reconciliation-latest', siteId] }),
    onSuccess: (value) => queryClient.setQueryData(['warehouse-reconciliation-latest', value.stockSiteId], value),
  })
  const pkgList = packages.isSuccess ? packages.data : []
  const activePackages = pkgList.filter(value => value.status === 'OPEN')
  const remaining = activePackages.reduce((sum, value) => sum + value.remainingBaseQuantity, 0)
  const resultAvailable = latest.isSuccess && !latest.isFetching && !reconcile.isPending && !reconcile.isError
  const last = resultAvailable ? latest.data : null
  const resultError = reconcile.error || latest.error
  const readingResult = latest.isPending || latest.isFetching || reconcile.isPending
  const retryResult = () => { reconcile.reset(); void latest.refetch() }
  const total = pkgList.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedPackages = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return pkgList.slice(start, start + pageSize)
  }, [pkgList, safePage, pageSize])

  return <section className="warehouse-section warehouse-accuracy">
    <div className="warehouse-inventory-filters">
      <div className="warehouse-metrics-inline">
        <span className="warehouse-metric-chip">
          最近校验 <strong>{readingResult ? '读取中' : resultError ? '读取失败' : last ? inventoryReconciliationPresentation(last.status).label : '尚未执行'}</strong>
          {last && <small>（{formatTime(last.completedAt ?? last.startedAt)}）</small>}
        </span>
        <span className="warehouse-metric-chip">校验维度 <strong>{last?.dimensionCount ?? '—'}</strong></span>
        <span className="warehouse-metric-chip">
          差异项 <strong>{last?.issueCount ?? '—'}</strong>
          {Boolean(last?.issueCount) && <small className="warehouse-metric-chip__warn">（需核查）</small>}
        </span>
        <span className="warehouse-metric-chip">在用拆零 <strong>{packages.isSuccess ? activePackages.length : '—'}</strong>（余 {packages.isSuccess ? formatQuantity(remaining) : '—'}）</span>
      </div>
      <div className="warehouse-accuracy__actions">
        <Button size="sm" variant="secondary" onClick={() => setOpenDialog(true)}>登记拆零</Button>
        <Button size="sm" busy={reconcile.isPending} onClick={() => reconcile.mutate()}>立即校验</Button>
      </div>
    </div>
    {lots.isError && <Alert duration={null}>批次资料读取失败：{errorMessage(lots.error)}</Alert>}
      <div className="warehouse-accuracy__grid">
        <article className="warehouse-accuracy__card">
          <header>
            <div><strong>账目校验结果</strong>{last && <span>单号 {last.runNo}</span>}</div>
            {last && <StatusBadge tone={inventoryReconciliationPresentation(last.status).tone}>
              {inventoryReconciliationPresentation(last.status).label}</StatusBadge>}
          </header>
          {last && <dl className="warehouse-reconciliation-facts">
            <div><dt>运行方式</dt><dd>{last.runType === 'MANUAL' ? '人工执行' : last.runType === 'SCHEDULED' ? '定时任务' : '运行方式未知'}</dd></div>
            <div><dt>业务日期</dt><dd>{last.businessDate}</dd></div>
            <div><dt>执行人</dt><dd>{last.runBy ?? (last.runType === 'SCHEDULED' ? '系统任务' : '未记录')}</dd></div>
            <div><dt>耗时</dt><dd>{last.completedAt ? formatDuration(last.startedAt, last.completedAt) : last.status === 'RUNNING' ? '执行中' : '完成时间未记录'}</dd></div>
          </dl>}
          {readingResult ? <LoadingState label={reconcile.isPending ? '正在执行库存校验…' : '正在读取账目校验结果…'} />
            : resultError ? <EmptyState icon="pharmacy" title="库存校验结果读取失败" copy={errorMessage(resultError)}
                action={<Button variant="secondary" onClick={retryResult}>重新读取校验结果</Button>} />
            : !last ? <EmptyState icon="pharmacy" title="尚未执行库存校验" copy="点击“立即校验”，系统将比对库存账目。" />
            : last.status === 'PASSED' ? last.dimensionCount === 0
              ? <EmptyState icon="pharmacy" title="本次没有可校验的库存维度" copy="本次校验已结束，未返回可比对的库存维度。" />
              : <div className="warehouse-accuracy__passed"><span aria-hidden="true">✓</span>
                  <div><strong>本次账目校验通过</strong><p>本次已校验维度内未发现账目差异，不替代实物盘点。</p></div></div>
            : last.status === 'RUNNING' ? <LoadingState label="库存校验尚在执行，暂不能确认结论。" />
            : last.status === 'FAILED' ? <EmptyState icon="pharmacy" title="库存校验未成功完成" copy="不能据此确认账目一致，请重新执行校验。" />
            : last.status !== 'ISSUES' ? <EmptyState icon="pharmacy" title="无法确认库存校验结论" copy={`返回状态：${last.status}`} />
            : null}
          {last && last.lines.length > 0 && <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-accuracy__table"><thead><tr>
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
        <article className="warehouse-accuracy__card">
          <header>
            <strong>拆零包装台账</strong>
            <StatusBadge tone="info">{packages.isSuccess ? `${total} 条` : '数量未取得'}</StatusBadge>
          </header>
          {packages.isPending ? <LoadingState label="正在读取拆零包装台账…" />
            : packages.isError ? <EmptyState icon="pharmacy" title="拆零包装台账读取失败" copy={errorMessage(packages.error)}
                action={<Button variant="secondary" onClick={() => void packages.refetch()}>重新读取拆零台账</Button>} />
            : !total ? <EmptyState icon="pharmacy" title="暂无拆零包装" copy="发生拆零发药时系统会自动建账，也可人工登记已开包装。" />
            : <>
              <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-accuracy__table"><thead><tr>
                <th>药品 / 开包时间</th><th>批号 / 追溯</th><th>库位</th><th>开包数量</th><th>当前余量</th><th>状态</th>
              </tr></thead><tbody>{paginatedPackages.map(value => <PackageRow key={value.id} value={value} items={items} bins={bins}
                lot={lots.isSuccess ? lots.data.find(lot => lot.id === value.stockLotId) : undefined} />)}</tbody></table></div>
              {totalPages > 1 && <Pagination
                page={safePage}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                onChange={setPage}
                label="拆零包装台账分页"
              />}
            </>}
        </article>
      </div>
    {openDialog && <OpenPackageDialog api={api} siteId={siteId} items={items} bins={bins}
      onClose={() => setOpenDialog(false)} onDone={async () => {
        await queryClient.invalidateQueries({ queryKey: ['warehouse-open-packages', siteId] })
        setOpenDialog(false)
      }} />}
  </section>
}

function PackageRow({ value, items, bins, lot }: { value: InventoryOpenPackage; items: StockItem[]; bins: StockBin[]; lot?: Awaited<ReturnType<RhnApi['pharmacy']['lots']>>[number] }) {
  return <tr><td><strong>{itemName(items, value.stockItemId)}</strong><small>{formatTime(value.openedAt)}{value.traceCodeId ? ' · 已绑定追溯码' : ''}</small></td>
    <td><strong>{lot?.lotNo ?? '批次资料未取得'}</strong><small>{lot?.expiryDate ?? '效期未记录'} · {value.traceCodeId ? `追溯 …${value.traceCodeId.slice(-6)}` : '无追溯码'}</small></td>
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
    queryFn: async () => {
      const values = await api.pharmacy.balances(siteId, itemId)
      if (!Array.isArray(values)) throw new Error('可开包库存返回格式无效，请重新读取。')
      return values
    }, enabled: Boolean(itemId) })
  const available = balances.isSuccess && !balances.isFetching
    ? balances.data.filter(value => value.stockStatus === 'AVAILABLE' && value.quantityOnHand > 0) : []
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
      <Button busy={mutation.isPending} disabled={!itemId || !dimension || !balances.isSuccess || balances.isFetching} onClick={() => mutation.mutate()}>确认开包</Button></>}>
    {Boolean(mutation.error) && <Alert>{errorMessage(mutation.error)}</Alert>}
    {balances.isError && <EmptyState icon="pharmacy" title="可开包库存读取失败" copy={errorMessage(balances.error)}
      action={<Button variant="secondary" onClick={() => void balances.refetch()}>重新读取库存</Button>} />}
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
