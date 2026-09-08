import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { PersonnelAssignment, Practitioner } from '../../shared/api/organizationApi'
import type {
  WardMedicationReturnDisposition,
  WardMedicationReturnRequest,
  WardMedicationReturnStatus,
} from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, FormField, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'
import './ward-medication-return-inbox.css'

const statusText: Record<WardMedicationReturnStatus, string> = {
  REQUESTED: '病区待交出', IN_TRANSIT: '待药房接收', RECEIVED: '已接收',
}

const dispositionOptions = [
  { value: 'RESTOCK', label: '验收合格，重新入库' },
  { value: 'QUARANTINE', label: '隔离待质量处理' },
  { value: 'DESTROY', label: '进入待销毁区' },
]

export function WardMedicationReturnInbox({ api, practitioners, assignments, practitionerId, assignmentId,
  onPractitionerChange, onAssignmentChange }: {
  api: RhnApi
  practitioners: Practitioner[]
  assignments: PersonnelAssignment[]
  practitionerId: string
  assignmentId: string
  onPractitionerChange: (value: string) => void
  onAssignmentChange: (value: string) => void
}) {
  const queryClient = useQueryClient()
  const [dispositions, setDispositions] = useState<Record<string, WardMedicationReturnDisposition>>({})
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({})
  const requestsKey = ['ward-medication-return-inbox'] as const
  const requests = useQuery({
    queryKey: requestsKey,
    queryFn: () => api.pharmacy.wardMedicationReturns({ status: 'ALL' }),
  })
  const updateRequest = (value: WardMedicationReturnRequest) => queryClient
    .setQueryData<WardMedicationReturnRequest[]>(requestsKey, (current = []) => [value,
      ...current.filter((item) => item.id !== value.id)])
  const receive = useMutation({
    mutationFn: (request: WardMedicationReturnRequest) => api.pharmacy.receiveWardMedicationReturn(request.id, {
      expectedRevision: request.revision,
      commandCode: `WARD-RETURN-RECEIVE-${request.id}-${crypto.randomUUID()}`,
      processorPractitionerId: practitionerId,
      processorAssignmentId: assignmentId,
      note: receiptNotes[request.id]?.trim() || undefined,
      lines: request.lines.map((line) => {
        const disposition = dispositions[line.id] ?? 'RESTOCK'
        return {
          returnRequestLineId: line.id,
          disposition,
          ...(disposition !== 'RESTOCK' && receiptNotes[request.id]?.trim()
            ? { exceptionDescription: receiptNotes[request.id].trim() } : {}),
        }
      }),
    }),
    onSuccess: async (value) => {
      updateRequest(value)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pharmacy-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-task'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-dispense-trace'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-inventory-balances'] }),
        queryClient.invalidateQueries({ queryKey: ['ward-medication-returnable'] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-discharge-readiness'] }),
      ])
    },
  })
  const values = requests.data ?? []
  const pendingCount = values.filter((value) => value.status === 'IN_TRANSIT').length

  return <Panel className={`pharmacy-ward-return-inbox${!requests.isPending && values.length === 0 ? ' is-empty' : ''}`}
    aria-label="病区退药接收">
    <header><div><h2>病区退药接收</h2>
      <p>{pendingCount ? `${pendingCount} 单已由病区交出，等待逐项验收` : '当前没有待接收退药'}</p></div>
      <Button size="sm" variant="secondary" onClick={() => void requests.refetch()}>刷新退药状态</Button></header>
    {requests.error && <Alert>{errorMessage(requests.error)}</Alert>}
    {receive.error && <Alert>{errorMessage(receive.error)}</Alert>}
    {requests.isPending ? <LoadingState label="正在加载病区退药交接…" /> : values.length > 0
      && <div className="pharmacy-ward-return-inbox__list">{values.map((request) => <article key={request.id}
          className={`is-${request.status.toLowerCase()}`} aria-label={`病区退药 ${request.requestNo}`}>
        <header><div><strong>{request.requestNo}</strong><small>{formatTime(request.requestedAt)} 申请</small></div>
          <StatusBadge tone={statusTone(request.status)}>{statusText[request.status]}</StatusBadge></header>
        <div className="pharmacy-ward-return-inbox__lines">{request.lines.map((line) => <div key={line.id}>
          <span><strong>{line.medicationName}</strong><small>{formatQuantity(line.requestedQuantity)} {line.unitCode}</small></span>
          {request.status === 'IN_TRANSIT' ? <Select aria-label={`退药处置 ${line.medicationName}`}
            value={dispositions[line.id] ?? 'RESTOCK'} options={dispositionOptions}
            onChange={(value) => setDispositions((current) => ({ ...current,
              [line.id]: value as WardMedicationReturnDisposition }))} />
            : <small>{line.disposition ? dispositionText(line.disposition) : '尚未验收'}</small>}
        </div>)}</div>
        {request.requestNote && <p>病区说明：{request.requestNote}</p>}
        {request.status === 'REQUESTED' && <small className="pharmacy-ward-return-inbox__hint">等待病区确认实物交出。</small>}
        {request.status === 'IN_TRANSIT' && <div className="pharmacy-ward-return-inbox__receive">
          <FormField label="接收药师" required><Select value={practitionerId} onChange={onPractitionerChange}
            placeholder="请选择接收药师" searchable showValue options={practitioners
              .filter((value) => value.sdPersonnelStatus === 'ACTIVE')
              .map((value) => ({ value: value.id, label: value.fullName, secondaryText: value.code }))} /></FormField>
          <FormField label="当前任职" required><Select value={assignmentId} onChange={onAssignmentChange}
            placeholder="请选择当前药房任职" options={assignments.map(assignmentOption)} /></FormField>
          <FormField label="验收说明"><input value={receiptNotes[request.id] ?? ''} maxLength={1000}
            placeholder="隔离或销毁时请说明异常情况"
            onChange={(event) => setReceiptNotes((current) => ({ ...current, [request.id]: event.target.value }))} /></FormField>
          <Button busy={receive.isPending} disabled={!practitionerId || !assignmentId}
            onClick={() => receive.mutate(request)}>逐项验收并接收</Button></div>}
        {request.status === 'RECEIVED' && <small className="pharmacy-ward-return-inbox__hint">
          {request.receivedAt ? `${formatTime(request.receivedAt)} 已接收` : '已接收'}
          {request.receiptNote ? ` · ${request.receiptNote}` : ''}</small>}
      </article>)}</div>}
  </Panel>
}

function statusTone(status: WardMedicationReturnStatus) {
  if (status === 'RECEIVED') return 'success' as const
  if (status === 'IN_TRANSIT') return 'warning' as const
  return 'neutral' as const
}

function assignmentOption(value: PersonnelAssignment) {
  return { value: value.id, label: `${value.positionName} · ${value.departmentName}`, secondaryText: value.code }
}

function dispositionText(value: string) {
  return ({ RESTOCK: '验收合格入库', QUARANTINE: '隔离待处理', DESTROY: '待销毁' } as Record<string, string>)[value] ?? value
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)
}
