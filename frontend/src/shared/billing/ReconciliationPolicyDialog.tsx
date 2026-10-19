import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { errorMessage, type ReconciliationPolicy, type RhnApi } from '../rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, Switch } from '../ui'
import './reconciliation-policy.css'

type Props = { api: RhnApi; contextKey: string; organizationId?: string; method: string; channelName: string; canRead: boolean; canRun: boolean; configured: boolean; onOpenChange?: (open: boolean) => void }
export function ReconciliationPolicyDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ dirty: false, busy: false })
  const [discard, setDiscard] = useState(false)
  const [notice, setNotice] = useState('')
  const formId = useId()
  const { onOpenChange } = props
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false) }, [onOpenChange, open])
  const close = () => { if (state.busy) return; if (state.dirty) setDiscard(true); else setOpen(false) }
  return <>
    <Button variant="secondary" disabled={!props.canRead} onClick={() => { setState({ dirty: false, busy: false }); setNotice(''); setDiscard(false); setOpen(true) }}>对账策略</Button>
    {open && <Dialog title={`${props.channelName} · 自动交易对账策略`} description="按所选机构保存。账单使用现有商户凭证；停用新收款不会自动停止历史交易对账。" onClose={close}
      footer={discard ? <><Button variant="secondary" onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={() => setOpen(false)}>放弃修改并关闭</Button></>
        : <><Button variant="secondary" disabled={state.busy} onClick={close}>关闭</Button><Button form={formId} type="submit" disabled={!props.canRun || !props.configured || !state.dirty || state.busy}>{state.busy ? '正在保存…' : '保存策略'}</Button></>}>
      {discard && <Alert tone="warning" placement="inline">关闭将丢弃尚未保存的对账策略。</Alert>}
      {notice && <p role="status">{notice}</p>}
      {!props.configured && <Alert tone="warning" placement="inline">请先保存此机构的渠道商户身份和凭证，再启用自动对账。</Alert>}
      {!props.canRun && <p>当前账号只能查看策略；维护需要支付对账执行权限。</p>}
      <PolicyLoader {...props} formId={formId} onState={setState} onSaved={() => setNotice('对账策略已保存')} />
    </Dialog>}
  </>
}
function PolicyLoader({ formId, onState, onSaved, ...props }: Props & { formId: string; onState: (state: { dirty: boolean; busy: boolean }) => void; onSaved: () => void }) {
  const key = ['payment-reconciliation-policy', props.contextKey, props.organizationId || '', props.method]
  const policy = useQuery({ queryKey: key, queryFn: () => props.api.billing.reconciliationPolicy(props.method, props.organizationId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  if (policy.isPending) return <LoadingState label="正在加载对账策略…" />
  if (policy.isError) return <Alert duration={null}>{errorMessage(policy.error)}<Button variant="secondary" onClick={() => { void policy.refetch() }}>重新加载策略</Button></Alert>
  return <PolicyForm key={`${props.contextKey}:${props.method}:${policy.data.revision}`} {...props} formId={formId} onState={onState} onSaved={onSaved} initial={policy.data} queryKey={key} />
}
function PolicyForm({ api, method, organizationId, canRun, configured, formId, onState, onSaved, initial, queryKey }: Props & {
  formId: string; onState: (state: { dirty: boolean; busy: boolean }) => void; onSaved: () => void; initial: ReconciliationPolicy; queryKey: string[]
}) {
  const cache = useQueryClient()
  const [auto, setAuto] = useState(initial.autoEnabled)
  const [time, setTime] = useState(initial.fetchTime)
  const [days, setDays] = useState(initial.backfillDays)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const live = useRef(true)
  const pending = useRef(false)
  const dirty = auto !== initial.autoEnabled || time !== initial.fetchTime || days !== initial.backfillDays
  useEffect(() => { onState({ dirty, busy }) }, [onState, dirty, busy])
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current || !canRun || !configured || !dirty) return
    pending.current = true; setBusy(true); setFailure('')
    try {
      const saved = await api.billing.saveReconciliationPolicy(method, { expectedRevision: initial.revision, autoEnabled: auto, fetchTime: time, backfillDays: days }, organizationId)
      if (!live.current) return
      cache.setQueryData(queryKey, saved); onSaved()
    } catch (error) { if (live.current) setFailure(errorMessage(error)) }
    finally { if (live.current) { pending.current = false; setBusy(false) } }
  }
  return <form id={formId} onSubmit={event => { void save(event) }} className="reconciliation-policy-form">
    {failure && <Alert duration={null}>{failure}</Alert>}
    {initial.scheduleError && <Alert tone="warning" duration={null}>{initial.scheduleError}</Alert>}
    <Switch checked={auto} onChange={setAuto} label="自动拉取并核对历史交易账单" disabled={busy || !canRun || !configured} />
    <div className="reconciliation-policy-fields">
      <FormField label="每日首次拉取时刻" required hint={`账单时区 ${initial.zoneId}，不得早于 ${initial.availableAfter}`}><input type="time" required value={time} min={initial.availableAfter} disabled={busy || !canRun} onChange={event => setTime(event.target.value)} /></FormField>
      <FormField label="历史补拉天数" required hint={`最多 ${initial.maximumBackfillDays} 天，未出账不会当作零交易`}><input type="number" required min={1} max={initial.maximumBackfillDays} value={days} disabled={busy || !canRun} onChange={event => setDays(Number(event.target.value))} /></FormField>
    </div>
    <p>系统按商户账单范围复用任务，保留下载证据和每次核对版本。处理完成只表示本次任务完成；差异仍需核查和财务复核。</p>
  </form>
}
