import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import { BillingQueue, BillingTimeline, money } from './BillingShared'

export function RefundManagementWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [encounterId, setEncounterId] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('退药或退费审核通过')
  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
  const refundItems = useMemo(() => (worklist.data ?? []).filter((item) => item.status === 'PENDING_REFUND'),
    [worklist.data])
  useEffect(() => {
    if (!linkedEncounterId || !worklist.data) return
    const target = worklist.data.find((item) => item.encounterId === linkedEncounterId)
    if (target) setEncounterId(target.encounterId)
    const next = new URLSearchParams(searchParams); next.delete('encounterId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, searchParams, setSearchParams, worklist.data])
  useEffect(() => {
    if (linkedEncounterId) return
    if (!encounterId && refundItems.length) setEncounterId(refundItems[0].encounterId)
    if (encounterId && refundItems.length && !refundItems.some((item) => item.encounterId === encounterId)) {
      setEncounterId(refundItems[0].encounterId)
    }
  }, [encounterId, linkedEncounterId, refundItems])
  const selected = worklist.data?.find((item) => item.encounterId === encounterId)
  const statement = useQuery({ queryKey: ['billing-statement', encounterId],
    queryFn: () => api.billing.statement(encounterId), enabled: Boolean(encounterId && selected?.accountId) })
  const refundablePayments = useMemo(() => statement.data?.payments.filter((item) => item.paymentType === 'PAYMENT') ?? [],
    [statement.data])
  useEffect(() => {
    if (paymentId && !refundablePayments.some((item) => item.id === paymentId)) setPaymentId('')
    if (!paymentId && refundablePayments.length) setPaymentId(refundablePayments[0].id)
  }, [paymentId, refundablePayments])
  useEffect(() => {
    const balance = statement.data?.accountBalance ?? 0
    setAmount(balance < 0 ? String(Math.abs(balance)) : '')
  }, [statement.data?.accountBalance])
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId] }),
    ])
  }
  const refund = useMutation({
    mutationFn: () => api.billing.createRefundOrder(paymentId, {
      idempotencyKey: `REFUND-${crypto.randomUUID()}`, amount: Number(amount), reason: reason.trim(),
      terminalCode: 'CASHIER-WEB',
    }),
    onSuccess: async () => { setAmount(''); await refresh() },
  })
  const error = worklist.error || statement.error || refund.error
  const currency = statement.data?.currencyCode ?? selected?.currencyCode ?? 'CNY'
  const selectedPayment = refundablePayments.find((item) => item.id === paymentId)
  const maximumRefund = Math.abs(Math.min(statement.data?.accountBalance ?? 0, 0))
  const validAmount = Number(amount) > 0 && Number(amount) <= maximumRefund

  return <>
    <PageHeader eyebrow="收费管理" title="退费管理" description="核对原支付记录并完成退款冲正。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="billing-context-bar billing-context-bar--compact">
      <div><span>当前收费机构</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong></div>
      <div><span>待退费</span><strong>{refundItems.length}</strong></div>
      <div><span>当前待退金额</span><strong>{money(maximumRefund, currency)}</strong></div>
    </div>
    {worklist.isPending ? <LoadingState label="正在加载退费队列…" /> : <div className="billing-refund-workspace">
      <BillingQueue title="待退费患者" items={refundItems} selectedId={encounterId} onSelect={setEncounterId}
        emptyTitle="暂无待退费业务" emptyCopy="退药或费用冲正形成负余额后会进入此处。" />
      <Panel className="billing-refund-detail">
        <header className="billing-section-head"><div><h2>原收费记录</h2>
          <span>{selected ? `就诊 ${selected.encounterId}` : '请选择待退费患者'}</span></div></header>
        {statement.isPending && <LoadingState label="正在加载原支付记录…" />}
        {selected && !statement.isPending && !statement.data && <EmptyState icon="billing" title="暂无费用账户"
          copy="当前就诊未形成可退费用。" />}
        {statement.data && <>
          <div className="billing-metrics">
            <div><span>原收费</span><strong>{money(statement.data.chargeAmount, currency)}</strong></div>
            <div><span>原实收</span><strong>{money(statement.data.paymentAmount, currency)}</strong></div>
            <div><span>已退款</span><strong>{money(statement.data.refundAmount, currency)}</strong></div>
            <div className="is-open"><span>本次待退</span><strong>{money(maximumRefund, currency)}</strong></div>
          </div>
          <section className="billing-table-section"><header><div><h3>可关联支付</h3>
            <span>{refundablePayments.length} 笔</span></div></header>
            <div className="billing-table-wrap"><table className="billing-table billing-table--payments"><thead><tr>
              <th>支付单号</th><th>支付方式</th><th>金额</th><th>支付时间</th><th>状态</th>
            </tr></thead><tbody>{refundablePayments.map((item) => <tr key={item.id}
              className={item.id === paymentId ? 'is-selected' : ''} onClick={() => setPaymentId(item.id)}>
              <td><strong>{item.paymentNo}</strong><code>{item.externalTransactionNo || item.id}</code></td>
              <td>{item.paymentMethodCode}</td><td>{money(item.amount, item.currencyCode)}</td>
              <td>{new Date(item.paidAt).toLocaleString('zh-CN')}</td><td><StatusBadge tone="success">已支付</StatusBadge></td>
            </tr>)}</tbody></table></div>
          </section>
          <BillingTimeline invoices={statement.data.invoices} payments={statement.data.payments} currency={currency} />
        </>}
      </Panel>
      <Panel className="billing-refund-action">
        <header className="billing-section-head"><div><h2>退款办理</h2><span>原路退款</span></div></header>
        <div className="billing-action-form billing-action-form--refund">
          <FormField label="原支付记录"><Select value={paymentId} onChange={setPaymentId} showValue
            placeholder="暂无可选原支付" options={refundablePayments.map((item) => ({ value: item.id,
              label: item.paymentNo, secondaryText: money(item.amount, item.currencyCode) }))} /></FormField>
          {selectedPayment && <div className="billing-refund-origin"><span>原支付金额</span>
            <strong>{money(selectedPayment.amount, selectedPayment.currencyCode)}</strong></div>}
          <FormField label="退款金额"><input className="ui-field__control" type="number" min="0.01"
            max={maximumRefund} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField>
          <FormField label="退款原因"><textarea className="ui-field__control" value={reason}
            onChange={(event) => setReason(event.target.value)} /></FormField>
          <Button variant="danger" disabled={!paymentId || !validAmount || !reason.trim()} busy={refund.isPending}
            onClick={() => refund.mutate()}>确认退款</Button>
        </div>
      </Panel>
    </div>}
  </>
}
