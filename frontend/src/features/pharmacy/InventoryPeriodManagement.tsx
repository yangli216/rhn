import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { InventoryPeriod, PeriodCloseRun, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { inventoryPeriodClosePresentation } from '../../shared/presentation'
import { inventoryKnownTotal, knownInventoryNumber } from './inventoryLedgerTruth'
import { requireCloseDifferences, requireCloseRun, requireCloseRuns, requirePeriods } from './periodCloseTruth'
import { Alert, Button, Dialog, EmptyState, LoadingState, StatusBadge } from '../../shared/ui'

const periodStatusText: Record<string, string> = { OPEN: '开放', CLOSING: '结账中', CLOSED: '已月结' }

export function InventoryPeriodManagement({ api, siteId, items, bins }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]
}) {
  const queryClient = useQueryClient()
  const [periodId, setPeriodId] = useState('')
  const [runId, setRunId] = useState('')
  const [confirmRun, setConfirmRun] = useState<PeriodCloseRun>()
  const periods = useQuery({
    queryKey: ['warehouse-periods', siteId], queryFn: async () => requirePeriods(await api.pharmacy.inventoryPeriods(siteId), siteId),
    enabled: Boolean(siteId),
  })
  const selectedPeriod = periods.isSuccess ? periods.data.find(value => value.id === periodId) : undefined
  const runs = useQuery({
    queryKey: ['warehouse-period-close-runs', periodId],
    queryFn: async () => requireCloseRuns(await api.pharmacy.periodCloseRuns(periodId), siteId, periodId), enabled: Boolean(selectedPeriod),
  })
  const candidateRun = selectedPeriod && runs.isSuccess ? (runs.data.find(value => value.id === runId) ?? runs.data[0]) : undefined
  const differences = useQuery({
    queryKey: ['warehouse-period-close-differences', candidateRun?.id],
    queryFn: async () => requireCloseDifferences(await api.pharmacy.periodCloseDifferences(candidateRun!.id)),
    enabled: Boolean(candidateRun?.id && candidateRun.differenceCount),
  })

  useEffect(() => {
    if (!periods.data?.length) { setPeriodId(''); return }
    if (!periods.data.some(value => value.id === periodId)) {
      setPeriodId((periods.data.find(value => value.status === 'OPEN') ?? periods.data[0]).id)
    }
  }, [periodId, periods.data])
  useEffect(() => {
    if (!runs.data?.some(value => value.id === runId)) setRunId(runs.data?.[0]?.id ?? '')
  }, [periodId, runId, runs.data])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['warehouse-periods', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-period-close-runs', periodId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-balances', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-transactions', siteId] }),
    ])
  }
  const createPeriod = useMutation({
    mutationFn: async () => requirePeriods([await api.pharmacy.createInventoryPeriod(siteId, currentYearMonth())], siteId)[0]!,
    onSuccess: async value => { await refresh(); setPeriodId(value.id) },
  })
  const prepare = useMutation({
    mutationFn: async () => requireCloseRun(await api.pharmacy.preparePeriodClose(
      periodId, `PC-${selectedPeriod?.periodCode}-${Date.now()}`, 'CNY',
    ), siteId, periodId),
    onSuccess: async value => {
      await queryClient.invalidateQueries({ queryKey: ['warehouse-period-close-runs', periodId] })
      setRunId(value.id)
    },
  })
  const post = useMutation({
    mutationFn: async (closeRunId: string) => {
      if (!canPost || selectedRun?.id !== closeRunId) throw new Error('当前预检结果不可用，请重新读取后确认。')
      const value = requireCloseRun(await api.pharmacy.postPeriodClose(closeRunId), siteId, periodId)
      if (value.id !== closeRunId || value.status !== 'POSTED') throw new Error('未取得正式月结结果，请重新读取批次状态。')
      return value
    },
    onSuccess: async () => { setConfirmRun(undefined); await refresh() },
  })
  const selectedRun: PeriodCloseRun | undefined = !prepare.isPending && !prepare.isError && !post.isPending && !post.isError
    && !runs.isFetching && !periods.isFetching ? candidateRun : undefined
  const total = selectedRun?.totals.find(value => value.valuationBasis === 'COST')
  const error = createPeriod.error
  const runError = runs.error || prepare.error || post.error
  const adjustment = total ? inventoryKnownTotal([total.valuationAdjustmentAmount, total.roundingAdjustmentAmount]) : undefined
  const retryRuns = () => { prepare.reset(); post.reset(); void runs.refetch() }
  const canPost: boolean = selectedPeriod?.status === 'OPEN' && selectedRun?.status === 'VALIDATED'
    && selectedRun.differenceCount === 0

  return <section className="warehouse-section warehouse-period">
    <header className="warehouse-section__toolbar"><div><strong>库存月结</strong>
      <span>按会计期间固化数量与成本，形成“期初 + 业务变动 + 调整 = 期末 = 实时库存”的可追溯账链</span></div>
      <div className="warehouse-period__actions">
        {periods.isSuccess && !periods.data.length && <Button size="sm" variant="secondary" busy={createPeriod.isPending}
          onClick={() => createPeriod.mutate()}>启用本月期间</Button>}
        <Button size="sm" busy={prepare.isPending} disabled={!selectedPeriod || selectedPeriod.status !== 'OPEN' || periods.isFetching || runs.isFetching}
          onClick={() => prepare.mutate()}>{runs.data?.length ? '重新预检' : '执行月结预检'}</Button>
      </div></header>
    {Boolean(error) && <Alert duration={null}>{errorMessage(error)}</Alert>}
    {periods.isError ? <EmptyState icon="pharmacy" title="库存期间读取失败" copy={errorMessage(periods.error)}
      action={<Button variant="secondary" onClick={() => void periods.refetch()}>重新读取库存期间</Button>} /> : periods.isPending ? <LoadingState label="正在读取库存期间…" /> : !periods.data?.length
      ? <EmptyState icon="pharmacy" title="尚未启用库存期间"
        copy="启用本月期间后，库存流水会归集到对应月份，并可在月末执行预检和正式月结。" />
      : <div className="warehouse-period__workspace">
        <aside className="warehouse-period__timeline" aria-label="库存期间">
          <header><strong>会计期间</strong><span>{periods.data.length} 期</span></header>
          <div>{periods.data.map(period => <button type="button" key={period.id}
            className={period.id === periodId ? 'is-selected' : ''} onClick={() => setPeriodId(period.id)}>
            <span><strong>{formatPeriod(period)}</strong><small>{period.periodFrom} 至 {period.periodTo}</small></span>
            <StatusBadge tone={period.status === 'CLOSED' ? 'success' : period.status === 'OPEN' ? 'info' : 'warning'}>
              {periodStatusText[period.status] ?? period.status}</StatusBadge>
          </button>)}</div>
        </aside>
        <div className="warehouse-period__detail">
          <PeriodHeading period={selectedPeriod} run={selectedRun} canPost={Boolean(canPost)}
            busy={post.isPending} onPost={() => selectedRun && setConfirmRun(selectedRun)} />
          {prepare.isPending || post.isPending || runs.isPending || runs.isFetching || periods.isFetching ? <LoadingState label="正在读取或执行月结…" />
            : runError ? <EmptyState icon="pharmacy" title="月结预检结果不可用" copy={errorMessage(runError)}
                action={<Button variant="secondary" onClick={retryRuns}>重新读取月结批次</Button>} /> : !selectedRun
            ? <EmptyState icon="pharmacy" title="本期尚未执行月结预检"
              copy="预检会锁定一份只读快照，核对每个药品、批次、库位的数量和成本，但不会立即关账。" />
            : <>
              <div className="warehouse-period__metrics">
                <Metric label="期初成本" value={money(total?.openingValue, total?.currencyCode)} note={total?.currencyCode ?? '币种未取得'} />
                <Metric label="本期业务变动" value={signedMoney(total?.movementAmount, total?.currencyCode)} note="入库、出库及盘点" />
                <Metric label="调价与尾差" value={signedMoney(adjustment, total?.currencyCode)}
                  note="独立价值调整" />
                <Metric label="计算期末" value={money(total?.closingValue, total?.currencyCode)} note="期间账面结果" />
                <Metric label="实时库存" value={money(total?.balanceValue, total?.currencyCode)} note="余额 × 平均成本" />
                <Metric label="账面差异" value={signedMoney(total?.valueDifference, total?.currencyCode)} note={`${selectedRun.differenceCount} 个异常维度`}
                  warning={selectedRun.differenceCount > 0} />
              </div>
              <div className="warehouse-period__formula" aria-label="月结勾稽关系">
                <span>期初 <strong>{money(total?.openingValue, total?.currencyCode)}</strong></span><b>+</b>
                <span>业务变动 <strong>{signedMoney(total?.movementAmount, total?.currencyCode)}</strong></span><b>+</b>
                <span>价值调整 <strong>{signedMoney(adjustment, total?.currencyCode)}</strong></span><b>=</b>
                <span>期末 <strong>{money(total?.closingValue, total?.currencyCode)}</strong></span><b>=</b>
                <span>实时库存 <strong>{money(total?.balanceValue, total?.currencyCode)}</strong></span>
              </div>
              <RunHistory runs={runs.data ?? []} selectedId={selectedRun.id} onSelect={setRunId} />
              <DifferenceTable run={selectedRun} canPost={Boolean(canPost)} loading={differences.isPending} error={differences.error}
                onRetry={() => void differences.refetch()} rows={differences.isSuccess ? differences.data : []}
                items={items} bins={bins} />
            </>}
        </div>
      </div>}
    {confirmRun && <Dialog eyebrow="库存月结" title={`确认月结批次 ${confirmRun.runNo}？`} size="wide"
      description="正式月结后，本期间不再允许补录或修改库存流水；系统会自动建立下一连续期间。"
      onClose={() => setConfirmRun(undefined)} footer={<><Button variant="secondary" onClick={() => setConfirmRun(undefined)}>取消</Button>
        <Button busy={post.isPending} disabled={!canPost || selectedRun?.id !== confirmRun.id} onClick={() => post.mutate(confirmRun.id)}>确认正式月结</Button></>}>
      {post.isPending ? <LoadingState label="正在提交正式月结…" /> : !canPost || selectedRun?.id !== confirmRun.id ? <EmptyState icon="pharmacy" title="当前预检结果不可用" copy="期间或批次状态已变化，请重新读取后再确认。" />
        : <div className="warehouse-period__confirm"><strong>关账前最后确认</strong>
        <ul><li>预检差异为 0，数量账与成本账均已勾稽。</li><li>预检后若发生任何库存变动，系统会拒绝本次月结并要求重新预检。</li>
          <li>本操作不会删除或改写历史流水。</li></ul></div>}
    </Dialog>}
  </section>
}

function PeriodHeading({ period, run, canPost, busy, onPost }: {
  period?: InventoryPeriod; run?: PeriodCloseRun; canPost: boolean; busy: boolean; onPost: () => void
}) {
  return <header className="warehouse-period__heading"><div><span className="ui-eyebrow">{period?.periodCode ?? '—'}</span>
    <h3>{formatPeriod(period)}库存账</h3><p>{run ? `最近批次 ${run.runNo} · ${formatTime(run.startedAt)}` : '等待月结预检'}</p></div>
    <div>{run && <StatusBadge tone={inventoryPeriodClosePresentation(run.status).tone}>
      {inventoryPeriodClosePresentation(run.status).label}</StatusBadge>}
      <Button size="sm" disabled={!canPost} busy={busy} onClick={onPost}>正式月结</Button></div></header>
}

function Metric({ label, value, note, warning = false }: { label: string; value: string; note: string; warning?: boolean }) {
  return <div className={warning ? 'is-warning' : ''}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function RunHistory({ runs, selectedId, onSelect }: { runs: PeriodCloseRun[]; selectedId: string; onSelect: (id: string) => void }) {
  return <section className="warehouse-period__runs"><header><strong>预检与关账记录</strong><span>每次预检均保留独立快照</span></header>
    <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr><th>批次</th><th>执行时间</th><th>核对维度</th><th>差异</th><th>状态</th></tr></thead>
      <tbody>{runs.map(run => <tr key={run.id} className={run.id === selectedId ? 'is-selected' : undefined}
        onClick={() => onSelect(run.id)}><td><button className="warehouse-inline-action" type="button" onClick={() => onSelect(run.id)}>{run.runNo}</button></td>
        <td>{formatTime(run.startedAt)}</td><td>{run.dimensionCount}</td><td>{run.differenceCount}</td>
        <td><StatusBadge tone={inventoryPeriodClosePresentation(run.status).tone}>
          {inventoryPeriodClosePresentation(run.status).label}</StatusBadge></td></tr>)}</tbody></table></div>
  </section>
}

function DifferenceTable({ run, canPost, loading, error, onRetry, rows, items, bins }: {
  run: PeriodCloseRun; canPost: boolean; loading: boolean; error: unknown; onRetry: () => void; rows: Awaited<ReturnType<RhnApi['pharmacy']['periodCloseDifferences']>>
  items: StockItem[]; bins: StockBin[]
}) {
  if (run.status === 'FAILED') return <EmptyState icon="pharmacy" title="月结预检执行失败" copy={run.failureMessage || '本批次未成功完成，不能确认关账。'} />
  if (run.status === 'RUNNING') return <LoadingState label="月结预检尚未完成，暂不能确认结论。" />
  if (run.status === 'POSTED') return <EmptyState icon="pharmacy" title="本批次已正式月结" copy="本批次月结结果已保存。" />
  if (run.status !== 'VALIDATED') return <EmptyState icon="pharmacy" title="无法确认月结状态" copy={`返回状态：${run.status}`} />
  if (run.differenceCount === 0) return <div className="warehouse-period__passed"><span aria-hidden="true">✓</span><div>
    <strong>本次预检未发现差异</strong><p>{canPost ? '当前期间允许正式月结，提交时会再次核对库存版本。' : '这是已保存的预检结果；当前期间不允许正式月结。'}</p></div></div>
  if (loading) return <LoadingState label="正在读取差异明细…" />
  if (error) return <EmptyState icon="pharmacy" title="月结差异明细读取失败" copy={errorMessage(error)}
    action={<Button variant="secondary" onClick={onRetry}>重新读取月结差异</Button>} />
  if (!rows.length) return <EmptyState icon="pharmacy" title="差异明细未取得" copy={`本批次记录了 ${run.differenceCount} 个差异维度，不能据此确认无差异。`} />
  return <section className="warehouse-period__differences"><header><strong>差异明细</strong><span>处理差异后需重新执行预检</span></header>
    <div className="warehouse-table-wrap"><table className="warehouse-table"><thead><tr><th>药品 / 库位</th><th>状态 / 批次</th><th>期初数量</th><th>业务变动</th><th>计算期末</th><th>实时库存</th><th>数量差异</th><th>价值差异</th></tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.snapshotId}-${row.valuationBasis}`}><td><strong>{itemName(items, row.stockItemId)}</strong><small>{binName(bins, row.stockBinId)}</small></td>
        <td><strong>{stockStatusLabel(row.stockStatus)}</strong><small>批号 {row.lotNo}</small></td>
        <td>{quantity(row.openingQuantity)}</td><td>{signedQuantity(row.movementQuantity)}</td><td>{quantity(row.closingQuantity)}</td>
        <td>{quantity(row.balanceQuantity)}</td><td><strong>{signedQuantity(row.quantityDifference)} {row.baseUnitCode}</strong></td>
        <td><strong>{signedMoney(row.valueDifference, row.currencyCode)}</strong><small>{row.valuationBasis === 'COST' ? '成本口径' : row.valuationBasis === 'RETAIL' ? '零售价口径' : '估值口径未知'}</small></td></tr>)}</tbody></table></div>
  </section>
}

function formatPeriod(value?: InventoryPeriod) {
  if (!value) return '当前期间'
  return `${value.periodFrom.slice(0, 4)}年${Number(value.periodFrom.slice(5, 7))}月`
}
function currentYearMonth() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7) }
function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function money(value?: number, currency?: string) {
  return knownInventoryNumber(value) === undefined ? '金额未取得'
    : `${currency || '币种未取得'} ${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value!)}`
}
function signedMoney(value?: number, currency?: string) {
  if (knownInventoryNumber(value) === undefined) return '金额未取得'
  return value === 0 ? money(0, currency) : `${value! > 0 ? '+' : '-'}${money(Math.abs(value!), currency)}`
}
function quantity(value: number) { return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value) }
function signedQuantity(value: number) { return `${value > 0 ? '+' : ''}${quantity(value)}` }
function itemName(items: StockItem[], id: string) { return items.find(value => value.id === id)?.productName ?? `经营项目 …${id.slice(-6)}` }
function binName(bins: StockBin[], id: string) { return bins.find(value => value.id === id)?.name ?? `库位 …${id.slice(-6)}` }
function stockStatusLabel(value: string) { return ({ AVAILABLE: '可用', PENDING: '待验', QUARANTINE: '隔离', DAMAGED: '破损', EXPIRED: '过期' }[value] ?? value) }
