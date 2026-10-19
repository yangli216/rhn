import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { errorMessage, type ReconciliationBatch, type ReconciliationItem, type ReconciliationUnallocated, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField } from '../../../shared/ui'

export type ReconciliationAction = { kind: 'query' | 'propose' | 'approve' | 'reject'; item: ReconciliationItem }
  | { kind: 'close'; batch: ReconciliationBatch }
  | { kind: 'merchantPropose' | 'merchantApprove' | 'merchantReject'; row: ReconciliationUnallocated }
export function ReconciliationActionDialog({ api, action, current, onClose, onCompleted }: {
  api: RhnApi; action: ReconciliationAction; current: boolean; onClose: () => void; onCompleted: (message: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const pending = useRef(false)
  const live = useRef(true)
  const command = useRef(crypto.randomUUID())
  const formId = useId()
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const query = action.kind === 'query'
  const close = action.kind === 'close'
  const title = query ? '查询原支付／退款指令' : close ? '财务复核并结案' : ['approve', 'merchantApprove'].includes(action.kind) ? '复核接受例外' : ['reject', 'merchantReject'].includes(action.kind) ? '复核退回' : '提交例外核查依据'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !current || !query && !reason.trim()) return
    pending.current = true; setBusy(true); setFailure('')
    try {
      let message = '操作已记录；匹配结果和原资金事实保持原样。'
      if ('item' in action) {
        const input = { expectedRevision: action.item.revision, commandCode: command.current }
        if (action.kind === 'query') { const result = await api.billing.queryReconciliationItem(action.item.id, input); message = `${result.outcomeText || result.outcome}：${result.message}` }
        else if (action.kind === 'propose') await api.billing.proposeReconciliationItem(action.item.id, { ...input, reason: reason.trim() })
        else await api.billing.reviewReconciliationItem(action.item.id, { ...input, reason: reason.trim(), approve: action.kind === 'approve' })
      } else if ('batch' in action) await api.billing.closeReconciliationBatch(action.batch.id, { expectedRevision: action.batch.revision, commandCode: command.current, reason: reason.trim() })
      else {
        const input = { expectedRevision: action.row.revision, commandCode: command.current, reason: reason.trim() }
        if (action.kind === 'merchantPropose') await api.billing.proposeUnallocatedReconciliationRow(action.row.id, input)
        else await api.billing.reviewUnallocatedReconciliationRow(action.row.id, { ...input, approve: action.kind === 'merchantApprove' })
      }
      if (live.current) onCompleted(message)
    } catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) { pending.current = false; setBusy(false) } }
  }
  return <Dialog title={title} description={query ? '仅查询可信原指令；在途交易通过既有流程恢复。不会重新下单、扫描付款码或再次发起退款。' : '例外接受不会把差异改成对平；需要其他财务人员复核。请保留可追溯的核查依据。'}
    onClose={() => { if (!busy) onClose() }} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form={formId} disabled={busy || !current || !query && !reason.trim()}>{busy ? '正在处理…' : '确认'}</Button></>}>
    {failure && <Alert duration={null}>{failure}</Alert>}
    {!current && <Alert tone="warning" placement="inline">当前版本已被替代或已结案，请返回最新版本处理。</Alert>}
    {'item' in action && <p>原指令：{action.item.paymentOrderId || '尚未找到可信原指令'}；核对结果：{action.item.comparisonResultText || action.item.comparisonResult}</p>}
    {close && <p>结案保留本版本的全部差异及例外记录，不代表资金账单或银行到账已核验。</p>}
    <form id={formId} onSubmit={event => { void submit(event) }}>{!query && <FormField label="核查／复核依据" required><textarea value={reason} disabled={busy} maxLength={2000} required rows={5} onChange={event => { setReason(event.target.value); command.current = crypto.randomUUID() }} /></FormField>}</form>
  </Dialog>
}
