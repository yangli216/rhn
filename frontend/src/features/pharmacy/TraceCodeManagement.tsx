import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { InventoryTraceCode, StockBin, StockItem } from '../../shared/api'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, LoadingState, Pagination, SearchField, Select, StatusBadge,
} from '../../shared/ui'

const statusText: Record<string, string> = {
  PENDING_RECEIPT: '待入库', AVAILABLE: '在库可用', OPENED: '已开包', PARTIALLY_ISSUED: '部分发出',
  RESERVED: '已预留', IN_TRANSIT: '调拨在途',
  ISSUED: '已出库', RETURNED: '已退回', QUARANTINED: '隔离', DAMAGED: '破损',
  RECALLED: '召回', VOID: '作废',
}
const eventText: Record<string, string> = {
  RECEIVED: '验收入库', ISSUED: '出库核销', TRANSFER_OUT: '调拨出库',
  TRANSFER_IN: '调拨入库', TRANSFER_DAMAGED: '调拨破损',
  SPLIT_OPEN: '追溯开包', PARTIAL_ISSUE: '拆零发药', PARTIAL_RETURN: '拆零退药',
}
const tone = (status: string): 'success' | 'danger' | 'info' => ['AVAILABLE', 'OPENED', 'PARTIALLY_ISSUED'].includes(status)
  ? 'success' : ['DAMAGED', 'RECALLED', 'VOID'].includes(status) ? 'danger' : 'info'

export function TraceCodeManagement({ api, siteId, items, bins }: {
  api: RhnApi; siteId: string; items: StockItem[]; bins: StockBin[]
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<InventoryTraceCode>()

  const values = useQuery({
    queryKey: ['warehouse-trace-codes', siteId, status, query],
    queryFn: () => api.pharmacy.traceCodes(siteId, status, query.trim()),
    enabled: Boolean(siteId),
  })
  const allValues = useQuery({
    queryKey: ['warehouse-trace-codes', siteId, 'ALL'],
    queryFn: () => api.pharmacy.traceCodes(siteId),
    enabled: Boolean(siteId),
  })
  const traceItemIds = [...new Set((allValues.data ?? values.data ?? []).map(value => value.stockItemId))]
  const lots = useQuery({
    queryKey: ['warehouse-trace-lots', siteId, traceItemIds.join(',')],
    queryFn: async () => (await Promise.all(traceItemIds.map(itemId => api.pharmacy.lots(itemId)))).flat(),
    enabled: Boolean(traceItemIds.length),
  })
  const detail = useQuery({
    queryKey: ['warehouse-trace-code', selected?.id],
    queryFn: () => api.pharmacy.traceCode(selected!.id),
    enabled: Boolean(selected),
  })
  const metrics = useMemo(() => ({
    total: allValues.data?.length ?? 0,
    available: allValues.data?.filter(value => ['AVAILABLE', 'OPENED', 'PARTIALLY_ISSUED'].includes(value.status)).length ?? 0,
    transit: allValues.data?.filter(value => value.status === 'IN_TRANSIT').length ?? 0,
    exceptions: allValues.data?.filter(value => ['DAMAGED', 'RECALLED', 'QUARANTINED'].includes(value.status)).length ?? 0,
  }), [allValues.data])

  const list = values.data ?? []
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedList = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return list.slice(start, start + pageSize)
  }, [list, safePage, pageSize])

  return <section className="warehouse-section warehouse-trace">
    <div className="warehouse-inventory-filters">
      <div className="warehouse-inventory-filters__left">
        <SearchField
          label="搜索追溯码台账"
          value={query}
          onChange={(val) => { setQuery(val); setPage(1) }}
          placeholder="搜索追溯码、药品编码、名称或批号"
        />
        <Select
          value={status}
          onChange={(val) => { setStatus(val); setPage(1) }}
          placeholder="全部状态"
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusText).map(([value, label]) => ({ value, label, secondaryText: value })),
          ]}
        />
      </div>
      <div className="warehouse-metrics-inline">
        <span className="warehouse-metric-chip">全库 <strong>{metrics.total}</strong></span>
        <span className="warehouse-metric-chip">在库/已开包 <strong>{metrics.available}</strong></span>
        <span className="warehouse-metric-chip">调拨在途 <strong>{metrics.transit}</strong></span>
        <span className="warehouse-metric-chip">异常状态 <strong>{metrics.exceptions}</strong></span>
      </div>
    </div>
    {Boolean(values.error || allValues.error || lots.error) && <Alert>{errorMessage(values.error || allValues.error || lots.error)}</Alert>}
    {values.isPending ? <LoadingState label="正在读取追溯码台账…" /> : !list.length
      ? <EmptyState icon="pharmacy" title="暂无符合条件的追溯码"
        copy="启用追溯的药品完成到货验收后，先登记追溯码，再批量入库形成台账。" />
      : <>
        <div className="warehouse-table-wrap"><table className="warehouse-table warehouse-trace-table"><thead><tr>
          <th>追溯码</th><th>药品</th><th>批号 / 数量</th><th>当前位置</th><th>状态</th><th>最近业务</th><th aria-label="操作">操作</th>
        </tr></thead><tbody>{paginatedList.map(value => {
          const item = items.find(item => item.id === value.stockItemId)
          const lot = lots.data?.find(lot => lot.id === value.stockLotId)
          return <tr key={value.id}>
            <td><strong className="warehouse-trace-code">{value.traceCode}</strong></td>
            <td><strong>{value.productName}</strong><code>{value.productCode}</code></td>
            <td><strong>{value.lotNo}</strong><small>效期 {lot?.expiryDate ?? '未记录'} · 余 {value.remainingBaseQuantity} / {value.baseQuantity} {item?.baseUnitCode ?? '基本单位'}</small>
              <small>包装 {item?.packageSpec || item?.packageUnitName} · 换算 {item?.packageFactor ?? '—'}</small></td>
            <td>{value.stockBinId ? bins.find(bin => bin.id === value.stockBinId)?.name ?? '未知货位' : '—'}</td>
            <td><StatusBadge tone={tone(value.status)}>{statusText[value.status] ?? value.status}</StatusBadge></td>
            <td><strong>{value.currentDocumentNo ?? '待登记'}</strong><small>{value.updatedAt ? formatTime(value.updatedAt) : '—'}</small></td>
            <td><Button variant="text" size="sm" onClick={() => setSelected(value)}>查看轨迹</Button></td>
          </tr>
        })}</tbody></table></div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
          onChange={setPage}
          label="追溯码台账分页"
        />
      </>}
    {selected && <Dialog title="追溯码全链路" eyebrow={selected.productName} size="wide"
      description={selected.traceCode} onClose={() => setSelected(undefined)}
      footer={<Button variant="secondary" onClick={() => setSelected(undefined)}>关闭</Button>}>
      {Boolean(detail.error) && <Alert>{errorMessage(detail.error)}</Alert>}
      {detail.isPending ? <LoadingState label="正在加载流转轨迹…" /> : <>
        <div className="warehouse-trace-summary"><div><span>当前状态</span><StatusBadge tone={tone(selected.status)}>{statusText[selected.status]}</StatusBadge></div>
          <div><span>药品 / 批号</span><strong>{selected.productName} · {selected.lotNo}</strong><small>效期 {lots.data?.find(lot => lot.id === selected.stockLotId)?.expiryDate ?? '未记录'}</small></div>
          <div><span>追溯余量</span><strong>{detail.data?.code.remainingBaseQuantity ?? selected.remainingBaseQuantity} / {selected.baseQuantity}</strong></div>
          <div><span>当前单据</span><strong>{selected.currentDocumentNo ?? '—'}</strong></div></div>
        <ol className="warehouse-trace-timeline">{detail.data?.events.map(event => <li key={event.id}>
          <div><strong>{eventText[event.eventType] ?? event.eventType}</strong><time>{formatTime(event.occurredAt)}</time></div>
          <p>{event.documentNo} · {statusText[event.fromStatus ?? ''] ?? event.fromStatus ?? '登记'} → {statusText[event.toStatus] ?? event.toStatus}
            {event.quantityDelta !== 0 ? ` · ${event.quantityDelta > 0 ? '+' : ''}${event.quantityDelta}，余 ${event.balanceAfter}` : ''}
            {' · '}操作人 {event.occurredBy}{event.fromBinId || event.toBinId ? ` · ${bins.find(bin => bin.id === event.fromBinId)?.name ?? '—'} → ${bins.find(bin => bin.id === event.toBinId)?.name ?? '—'}` : ''}</p>
        </li>)}</ol>
      </>}
    </Dialog>}
  </section>
}

function formatTime(value: string) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
