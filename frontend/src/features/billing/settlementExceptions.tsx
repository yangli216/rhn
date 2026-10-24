import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { SettlementException, SettlementExceptionAction } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, StatusBadge } from '../../shared/ui'
import { formatDateTimeParts } from '../../shared/format'
import { money } from './BillingShared'
import './settlement-exceptions.css'

export const SETTLEMENT_EXCEPTIONS_KEY = 'billing-settlement-exceptions'
const REFRESH_MS = 30_000

/** 异常结算待办：每 30 秒刷新一次，收费员无需手动查询即可发现单边账。 */
export function useSettlementExceptions(api: RhnApi, enabled = true, contextKey = '') {
  return useQuery({
    queryKey: [SETTLEMENT_EXCEPTIONS_KEY, contextKey],
    queryFn: () => api.billing.settlementExceptions(),
    enabled, refetchInterval: REFRESH_MS, staleTime: 10_000,
  })
}

// 左侧导航角标：监视组件把最新数量写入模块级存储，导航项只订阅数量，不需要穿透 AppShell 的 props。
type Summary = { count: number; critical: number }
let summary: Summary = { count: 0, critical: 0 }
const listeners = new Set<() => void>()
function publish(next: Summary) {
  if (next.count === summary.count && next.critical === summary.critical) return
  summary = next
  listeners.forEach(listener => listener())
}
function useSummary() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => summary, () => summary)
}

/** 挂在应用外壳里，只负责轮询并发布数量；无收费权限或无工作上下文时不请求。 */
export function BillingExceptionMonitor({ api, enabled, contextKey }: { api: RhnApi; enabled: boolean; contextKey: string }) {
  const query = useSettlementExceptions(api, enabled, contextKey)
  const items = enabled && query.isSuccess ? query.data : undefined
  const count = items?.length ?? 0
  const critical = items?.filter(item => item.severity === 'CRITICAL').length ?? 0
  useEffect(() => { publish({ count, critical }) }, [count, critical])
  useEffect(() => () => publish({ count: 0, critical: 0 }), [])
  return null
}

export function BillingExceptionNavBadge() {
  const { count, critical } = useSummary()
  if (!count) return null
  return <span className={`nav-exception-badge${critical ? ' is-critical' : ''}`} role="status"
    aria-label={`${count} 笔异常结算待处理`}>{count > 99 ? '99+' : count}</span>
}

export function SettlementExceptionBanner({ items, onOpen }: { items: SettlementException[]; onOpen?: () => void }) {
  if (!items.length) return null
  const critical = items.filter(item => item.severity === 'CRITICAL')
  const total = items.reduce((sum, item) => sum + item.outstandingAmount, 0)
  return <div className={`settlement-exception-banner${critical.length ? ' is-critical' : ''}`} role="alert">
    <strong>{critical.length ? `有 ${critical.length} 笔单边账待处理` : `有 ${items.length} 笔异常结算待处理`}</strong>
    <span>共 {items.length} 笔，未收金额合计 {money(total)}。患者离开后更难追回，请尽快处理。</span>
    {onOpen && <Button variant="secondary" onClick={onOpen}>去处理</Button>}
  </div>
}

const ACTION_LABEL: Record<SettlementExceptionAction, string> = {
  COLLECT: '去收款', QUERY_PAYMENT: '查询支付结果', RETRY_COMPLETION: '业务完成重试',
  QUERY_INSURANCE: '查询医保结果', CANCEL: '取消结算单', CANCEL_AND_REVERSE: '撤销医保结算',
}

export function SettlementExceptionList({ api, items, loading, error, onChanged }: {
  api: RhnApi; items: SettlementException[]; loading?: boolean; error?: unknown; onChanged: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<{ item: SettlementException; action: 'CANCEL' | 'CANCEL_AND_REVERSE' } | null>(null)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [SETTLEMENT_EXCEPTIONS_KEY] })
    void queryClient.invalidateQueries({ queryKey: ['billing-settlement-records'] })
    onChanged()
  }
  const run = useMutation({
    mutationFn: async ({ item, action }: { item: SettlementException; action: SettlementExceptionAction }) => {
      switch (action) {
        case 'QUERY_PAYMENT': return api.billing.queryPaymentOrder(item.paymentOrderId!)
        case 'RETRY_COMPLETION': return api.billing.retryBusinessCompletion(item.paymentOrderId!)
        case 'QUERY_INSURANCE': return api.billing.queryInsurance(item.claimId!, `EXC-QRY-${crypto.randomUUID()}`)
        case 'CANCEL_AND_REVERSE':
          return api.billing.reverseInsurance(item.claimId!, { commandCode: `EXC-REV-${item.claimId}`, reason: reason.trim() })
        case 'CANCEL': return api.billing.cancelSettlement(item.settlement.id, reason.trim())
        default: return undefined
      }
    },
    onSuccess: (_value, { action }) => {
      setConfirm(null); setReason('')
      setNotice({ tone: 'success', text: action === 'CANCEL_AND_REVERSE'
        ? '已提交医保撤销。撤销完成后结算单回到待收款，可重新收款或取消结算单。' : '操作已完成，列表已刷新。' })
      refresh()
    },
    onError: (failure) => setNotice({ tone: 'error', text: errorMessage(failure) }),
  })
  const act = (item: SettlementException, action: SettlementExceptionAction) => {
    if (action === 'COLLECT') {
      const query = new URLSearchParams({ encounterId: String(item.settlement.encounterId ?? ''), residentId: item.settlement.residentId })
      navigate(`/billing/settlement?${query}`)
    } else if (action === 'CANCEL' || action === 'CANCEL_AND_REVERSE') { setReason(''); setConfirm({ item, action }) }
    else run.mutate({ item, action })
  }

  if (loading) return <p className="settlement-exception-empty">正在加载异常结算…</p>
  if (error) return <Alert tone="error" placement="inline">{errorMessage(error)}</Alert>
  if (!items.length) return <EmptyState icon="check" title="没有异常结算" copy="单边账、支付未完成和超时未付款的结算单会在这里出现，处理完成后自动消失。" />
  return <div className="settlement-exception-list">
    {notice && <Alert tone={notice.tone === 'error' ? 'error' : 'success'} placement="inline" dismissible onDismiss={() => setNotice(null)}>{notice.text}</Alert>}
    {items.map(item => <article key={item.settlement.id} className={`settlement-exception-card is-${item.severity.toLowerCase()}`}>
      <header>
        <StatusBadge tone={item.severity === 'CRITICAL' ? 'danger' : 'warning'}>{item.exceptionText}</StatusBadge>
        <strong>{item.settlement.residentName}</strong>
        <span>{item.settlement.healthRecordNo}</span>
        <span className="settlement-exception-card__no">{item.settlement.settlementNo}</span>
      </header>
      <dl>
        <div><dt>结算金额</dt><dd>{money(item.settlement.netAmount, item.settlement.currencyCode)}</dd></div>
        <div><dt>医保支付</dt><dd>{money(item.settlement.insuranceAmount, item.settlement.currencyCode)}</dd></div>
        <div><dt>未收金额</dt><dd className="is-due">{money(item.outstandingAmount, item.settlement.currencyCode)}</dd></div>
        <div><dt>结算时间</dt><dd>{formatDateTimeParts(new Date(item.settlement.createdAt), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}（已 {item.ageMinutes} 分钟）</dd></div>
        <div><dt>医保/支付</dt><dd>{item.claimStatus ?? '无医保'} / {item.paymentOrderStatus ?? '无支付指令'}</dd></div>
      </dl>
      <p className="settlement-exception-card__hint">{item.suggestion}</p>
      <footer>
        {item.actions.map(action => <Button key={action} variant={action === 'COLLECT' ? 'primary' : 'secondary'}
          disabled={run.isPending} onClick={() => act(item, action)}>{ACTION_LABEL[action]}</Button>)}
      </footer>
    </article>)}
    {confirm && <Dialog title={confirm.action === 'CANCEL_AND_REVERSE' ? '撤销医保结算' : '取消结算单'}
      onClose={() => { if (!run.isPending) setConfirm(null) }}
      footer={<><Button variant="secondary" disabled={run.isPending} onClick={() => setConfirm(null)}>返回</Button>
        <Button disabled={!reason.trim() || run.isPending} busy={run.isPending}
          onClick={() => run.mutate({ item: confirm.item, action: confirm.action })}>确认</Button></>}>
      <p>{confirm.action === 'CANCEL_AND_REVERSE'
        ? `将向医保平台冲正 ${confirm.item.settlement.residentName} 已结算的医保部分（医保支付 ${money(confirm.item.settlement.insuranceAmount)}），冲正后该笔回到待收款。`
        : `将取消 ${confirm.item.settlement.settlementNo}，费用回到待结算。`}</p>
      <label className="settlement-exception-reason">处理原因（必填）
        <input value={reason} maxLength={200} onChange={event => setReason(event.target.value)} placeholder="例如：患者已离院，无法补收" />
      </label>
    </Dialog>}
  </div>
}
