import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import type {
  ReturnableWardMedicationLine,
  WardMedicationReturnRequest,
  WardMedicationReturnStatus,
} from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, StatusBadge } from '../../shared/ui'
import './ward-medication-returns.css'

const statusText: Record<WardMedicationReturnStatus, string> = {
  REQUESTED: '待交出', IN_TRANSIT: '已交出', RECEIVED: '药房已接收',
}

export function WardMedicationReturnPanel({ api, episode, readOnly }: {
  api: RhnApi
  episode: InpatientEpisode
  readOnly: boolean
}) {
  const queryClient = useQueryClient()
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [requestNote, setRequestNote] = useState('停嘱后未使用，申请退回药房')
  const [handoverNotes, setHandoverNotes] = useState<Record<string, string>>({})
  const balancesKey = ['ward-medication-returnable', episode.encounterId] as const
  const requestsKey = ['ward-medication-return-requests', episode.encounterId] as const
  const balances = useQuery({
    queryKey: balancesKey,
    queryFn: () => api.pharmacy.returnableWardMedications(episode.encounterId),
  })
  const requests = useQuery({
    queryKey: requestsKey,
    queryFn: () => api.pharmacy.wardMedicationReturns({ status: 'ALL', encounterId: episode.encounterId }),
  })
  const updateRequest = (value: WardMedicationReturnRequest) => queryClient
    .setQueryData<WardMedicationReturnRequest[]>(requestsKey, (current = []) => [value,
      ...current.filter((item) => item.id !== value.id)])
  const refreshClinicalFacts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: balancesKey }),
      queryClient.invalidateQueries({ queryKey: ['inpatient-orders', episode.id] }),
      queryClient.invalidateQueries({ queryKey: ['inpatient-order-tasks', episode.id] }),
      queryClient.invalidateQueries({ queryKey: ['inpatient-discharge-readiness', episode.id] }),
    ])
  }
  const create = useMutation({
    mutationFn: ({ line, quantity }: { line: ReturnableWardMedicationLine; quantity: number }) =>
      api.pharmacy.createWardMedicationReturn({
        encounterId: episode.encounterId,
        commandCode: `WARD-RETURN-CREATE-${line.originalDispenseLineId}-${crypto.randomUUID()}`,
        note: requestNote.trim() || undefined,
        lines: [{ originalDispenseLineId: line.originalDispenseLineId, quantity }],
      }),
    onSuccess: async (value) => { updateRequest(value); await refreshClinicalFacts() },
  })
  const handOver = useMutation({
    mutationFn: (request: WardMedicationReturnRequest) => api.pharmacy.handOverWardMedicationReturn(request.id, {
      expectedRevision: request.revision,
      commandCode: `WARD-RETURN-HANDOVER-${request.id}-${crypto.randomUUID()}`,
      note: handoverNotes[request.id]?.trim() || undefined,
    }),
    onSuccess: async (value) => { updateRequest(value); await refreshClinicalFacts() },
  })
  const refresh = async () => {
    await Promise.all([balances.refetch(), requests.refetch()])
  }
  const error = balances.error || requests.error || create.error || handOver.error
  const visibleRequests = requests.data ?? []

  return <section className="ward-medication-returns" aria-label="病区余药退回">
    <header className="inpatient-order-section-head"><div><strong>病区余药退回</strong>
      <span>申请后锁定余量；实物交出并由药房逐项验收后，才形成正式退药与库存事实。</span></div>
      <Button size="sm" variant="secondary" onClick={() => void refresh()}>刷新状态</Button></header>
    {error && <Alert className="ward-medication-returns__alert">{errorMessage(error)}</Alert>}
    {(balances.isPending || requests.isPending) ? <LoadingState label="正在核对病区余药…" /> : <>
      {!readOnly && (balances.data?.length ?? 0) > 0 && <div className="ward-medication-returnable">
        <label className="ward-medication-returnable__note"><span>退药原因</span><input aria-label="病区退药原因"
          value={requestNote} maxLength={1000} onChange={(event) => setRequestNote(event.target.value)} /></label>
        {balances.data!.map((line) => {
          const rawQuantity = quantities[line.originalDispenseLineId] ?? String(line.returnableQuantity)
          const quantity = Number(rawQuantity)
          const valid = Number.isFinite(quantity) && quantity > 0 && quantity <= line.returnableQuantity
          return <article key={line.originalDispenseLineId}>
            <div><strong>{line.medicationName}</strong><small>原发药明细 {line.originalDispenseLineId}</small></div>
            <dl><div><dt>病区实收</dt><dd>{formatQuantity(line.issuedQuantity)} {line.unitCode}</dd></div>
              <div><dt>已给药</dt><dd>{formatQuantity(line.consumedQuantity)} {line.unitCode}</dd></div>
              <div><dt>已退/申请中</dt><dd>{formatQuantity(line.returnedQuantity)} / {formatQuantity(line.pendingReturnQuantity)} {line.unitCode}</dd></div>
              <div><dt>当前可退</dt><dd>{formatQuantity(line.returnableQuantity)} {line.unitCode}</dd></div></dl>
            <label><span>本次退回</span><input aria-label={`退回数量 ${line.medicationName}`} type="number" min="0.00000001"
              max={line.returnableQuantity} step="any" value={rawQuantity}
              onChange={(event) => setQuantities((current) => ({ ...current,
                [line.originalDispenseLineId]: event.target.value }))} /></label>
            <Button size="sm" busy={create.isPending} disabled={!valid}
              onClick={() => create.mutate({ line, quantity })}>创建退药申请</Button>
          </article>
        })}
      </div>}
      {(balances.data?.length ?? 0) === 0 && visibleRequests.length === 0
        && <EmptyState icon="pharmacy" title="暂无可退病区余药" copy="只有已完成病区签收且尚未给药、未被其他退药申请占用的药品才会出现在这里。" />}
      {visibleRequests.length > 0 && <div className="ward-medication-return-requests">
        {visibleRequests.map((request) => <article key={request.id} aria-label={`退药申请 ${request.requestNo}`}>
          <header><div><strong>{request.requestNo}</strong><small>{formatTime(request.requestedAt)} 申请</small></div>
            <StatusBadge tone={returnStatusTone(request.status)}>{statusText[request.status]}</StatusBadge></header>
          <div className="ward-medication-return-requests__lines">{request.lines.map((line) => <span key={line.id}>
            <strong>{line.medicationName}</strong><small>{formatQuantity(line.requestedQuantity)} {line.unitCode}
              {line.disposition ? ` · ${dispositionText(line.disposition)}` : ''}</small></span>)}</div>
          {request.requestNote && <p>{request.requestNote}</p>}
          {request.status === 'REQUESTED' && !readOnly && <div className="ward-medication-return-requests__handover">
            <input aria-label={`交出备注 ${request.requestNo}`} value={handoverNotes[request.id] ?? ''} maxLength={1000}
              placeholder="例如：护士与配送员当面核对交出"
              onChange={(event) => setHandoverNotes((current) => ({ ...current, [request.id]: event.target.value }))} />
            <Button size="sm" busy={handOver.isPending} onClick={() => handOver.mutate(request)}>确认交出</Button></div>}
          {request.status === 'IN_TRANSIT' && <small className="ward-medication-return-requests__hint">
            {request.handedOverAt ? `${formatTime(request.handedOverAt)} 已交出，` : ''}等待药房逐项验收。</small>}
          {request.status === 'RECEIVED' && <small className="ward-medication-return-requests__hint">
            {request.receivedAt ? `${formatTime(request.receivedAt)} 药房已接收` : '药房已接收'}
            {request.receiptNote ? ` · ${request.receiptNote}` : ''}</small>}
        </article>)}
      </div>}
    </>}
  </section>
}

function returnStatusTone(status: WardMedicationReturnStatus) {
  if (status === 'RECEIVED') return 'success' as const
  if (status === 'IN_TRANSIT') return 'info' as const
  return 'warning' as const
}

function dispositionText(value: string) {
  return ({ RESTOCK: '验收合格入库', QUARANTINE: '隔离待处理', DESTROY: '待销毁' } as Record<string, string>)[value] ?? value
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)
}
