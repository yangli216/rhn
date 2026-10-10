import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { WardDelivery } from "../../../shared/api/pharmacyApi";
import { formatTime } from "../../../shared/format";
import type { RhnApi } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, LoadingState, Panel, Select, StatusBadge } from "../../../shared/ui";

export const deliveryStatusText: Record<string, string> = {
  PENDING_DISPATCH: '待送出', IN_TRANSIT: '配送中', RECEIVED: '病区已签收',
  DISCREPANCY: '存在差异', RESOLVED: '差异已处理',
}

export function WardDeliveryQueue({ api, stockSiteId }: { api: RhnApi; stockSiteId: string }) {
  const deliveries = useQuery({
    queryKey: ['ward-deliveries', stockSiteId, 'ALL'],
    queryFn: () => api.pharmacy.wardDeliveries({ status: 'ALL' }),
    select: (values) => values.filter((value) => value.stockSiteId === stockSiteId),
  })
  return <Panel className="pharmacy-ward-delivery-queue" aria-label="配送交接">
    <header className="pharmacy-section-head"><div><h2>配送交接</h2>
      <span>{deliveries.data?.filter((value) => value.status === 'PENDING_DISPATCH'
        || value.status === 'IN_TRANSIT' || value.status === 'DISCREPANCY').length ?? 0} 单待处理</span></div>
      <Button size="sm" variant="secondary" onClick={() => void deliveries.refetch()}>刷新配送状态</Button></header>
    {deliveries.error && <Alert>{errorMessage(deliveries.error)}</Alert>}
    {deliveries.isPending ? <LoadingState label="正在加载配送交接…" /> : !deliveries.data?.length
      ? <EmptyState icon="pharmacy" title="暂无配送交接单" copy="整批发药后，系统会在这里生成病区配送交接单。" />
      : <div className="pharmacy-ward-delivery-queue__list">{deliveries.data.map((delivery) =>
        <WardDeliveryRow key={delivery.id} api={api} delivery={delivery} />)}</div>}
  </Panel>
}

export function WardDeliveryRow({ api, delivery }: { api: RhnApi; delivery: WardDelivery }) {
  const queryClient = useQueryClient()
  const [resolutionCode, setResolutionCode] = useState<'SUPPLEMENTED' | 'RETURNED_TO_PHARMACY' | 'ACCEPTED_VARIANCE'>('SUPPLEMENTED')
  const [resolutionNote, setResolutionNote] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ward-deliveries'] })
  const dispatch = useMutation({
    mutationFn: () => api.pharmacy.dispatchWardDelivery(delivery.id, {
      expectedRevision: delivery.revision, commandCode: `WD-DISPATCH-${delivery.id}`, note: '药房核对后交出',
    }), onSuccess: refresh,
  })
  const resolve = useMutation({
    mutationFn: () => api.pharmacy.resolveWardDelivery(delivery.id, {
      expectedRevision: delivery.revision, commandCode: `WD-RESOLVE-${delivery.id}`,
      resolutionCode, note: resolutionNote.trim(),
    }), onSuccess: async () => { setResolutionNote(''); await refresh() },
  })
  const error = dispatch.error || resolve.error
  return <article className="pharmacy-ward-delivery">
    {error && <Alert>{errorMessage(error)}</Alert>}
    <>
      <div><strong>{delivery.deliveryNo}</strong><span>{delivery.stockSiteName} → {delivery.nursingUnitName}
        · {delivery.lines.length} 项</span></div>
      <StatusBadge tone={delivery.status === 'DISCREPANCY' ? 'warning'
        : delivery.status === 'RECEIVED' || delivery.status === 'RESOLVED' ? 'success' : 'info'}>
        {deliveryStatusText[delivery.status]}</StatusBadge>
      {delivery.status === 'PENDING_DISPATCH' && <Button busy={dispatch.isPending}
        onClick={() => dispatch.mutate()}>确认送出</Button>}
      {delivery.status === 'IN_TRANSIT' && <span>等待病区逐项签收</span>}
      {delivery.status === 'RECEIVED' && <span>{formatTime(delivery.receivedAt!)} 完成签收</span>}
      {delivery.status === 'DISCREPANCY' && <div className="pharmacy-ward-delivery__resolve">
        <Alert tone="warning">{delivery.discrepancyNote}</Alert>
        <Select value={resolutionCode} onChange={(value) => setResolutionCode(value as typeof resolutionCode)} options={[
          { value: 'SUPPLEMENTED', label: '已补送' },
          { value: 'RETURNED_TO_PHARMACY', label: '已退回药房' },
          { value: 'ACCEPTED_VARIANCE', label: '确认接受差异' },
        ]} />
        <input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)}
          placeholder="填写双方确认的处置结果" />
        <Button busy={resolve.isPending} disabled={!resolutionNote.trim()}
          onClick={() => resolve.mutate()}>确认差异处置</Button>
      </div>}
      {delivery.status === 'RESOLVED' && <span>{delivery.resolutionNote}</span>}
    </>
  </article>
}
