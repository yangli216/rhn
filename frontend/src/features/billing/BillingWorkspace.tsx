import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { Invoice, Payment } from '../../shared/api/billingApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'

const workStatusText: Record<string, string> = {
  PENDING_CHARGE: '待计费', PENDING_INVOICE: '待结算', PENDING_PAYMENT: '待收款',
  PENDING_REFUND: '待退款', SETTLED: '已平账',
}

function tone(status?: string) {
  if (status === 'SETTLED' || status === 'MATCHED') return 'success' as const
  if (status === 'PENDING_REFUND' || status === 'MISMATCH' || status === 'ORPHAN_CHARGE') return 'danger' as const
  if (status === 'PENDING_PAYMENT' || status === 'PENDING_INVOICE' || status === 'UNCHARGED') return 'warning' as const
  return 'info' as const
}

function money(value?: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value ?? 0)
}

export function BillingWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [encounterId, setEncounterId] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [refundPaymentId, setRefundPaymentId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('患者退药后原路退款')
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10))

  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
  const paymentMethods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'),
  })
  useEffect(() => {
    if (paymentMethods.data?.length && !paymentMethods.data.some((item) => item.code === paymentMethod)) {
      setPaymentMethod(paymentMethods.data[0].code)
    }
  }, [paymentMethod, paymentMethods.data])
  useEffect(() => {
    if (!encounterId && worklist.data?.length) setEncounterId(worklist.data[0].encounterId)
    if (encounterId && worklist.data && !worklist.data.some((item) => item.encounterId === encounterId)) {
      setEncounterId(worklist.data[0]?.encounterId ?? '')
    }
  }, [encounterId, worklist.data])
  const selected = worklist.data?.find((item) => item.encounterId === encounterId)
  const statement = useQuery({
    queryKey: ['billing-statement', encounterId], queryFn: () => api.billing.statement(encounterId),
    enabled: Boolean(encounterId && selected?.accountId),
  })
  const reconciliation = useQuery({
    queryKey: ['billing-reconciliation', businessDate],
    queryFn: () => api.billing.dailyReconciliation(businessDate), enabled: Boolean(businessDate),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['billing-reconciliation'] }),
    ])
  }
  const synchronize = useMutation({
    mutationFn: () => api.billing.synchronize(encounterId, `BIL-SYNC-${encounterId}-${Date.now()}`),
    onSuccess: refresh,
  })
  const issueInvoice = useMutation({
    mutationFn: () => api.billing.issueInvoice(statement.data!.accountId, `INV-${encounterId}-${Date.now()}`),
    onSuccess: refresh,
  })
  const payableInvoices = useMemo(() => statement.data?.invoices.filter((invoice) =>
    invoice.invoiceType === 'STANDARD' && invoice.outstandingAmount > 0) ?? [], [statement.data])
  useEffect(() => {
    if (paymentInvoiceId && !payableInvoices.some((invoice) => invoice.id === paymentInvoiceId)) setPaymentInvoiceId('')
    if (!paymentInvoiceId && payableInvoices.length) setPaymentInvoiceId(payableInvoices[0].id)
  }, [payableInvoices, paymentInvoiceId])
  const selectedInvoice = payableInvoices.find((invoice) => invoice.id === paymentInvoiceId)
  useEffect(() => {
    if (selectedInvoice) setPaymentAmount(String(selectedInvoice.outstandingAmount))
  }, [selectedInvoice])
  const collect = useMutation({
    mutationFn: () => api.billing.collect(paymentInvoiceId, {
      paymentNo: `PAY-${encounterId}-${Date.now()}`, paymentMethodCode: paymentMethod,
      paymentSceneCode: 'CASHIER',
      amount: Number(paymentAmount), description: '门诊窗口收款',
    }),
    onSuccess: async () => { setPaymentAmount(''); await refresh() },
  })
  const refundablePayments = useMemo(() => statement.data?.payments.filter((payment) =>
    payment.paymentType === 'PAYMENT') ?? [], [statement.data])
  useEffect(() => {
    if (refundPaymentId && !refundablePayments.some((payment) => payment.id === refundPaymentId)) setRefundPaymentId('')
    if (!refundPaymentId && refundablePayments.length) setRefundPaymentId(refundablePayments[0].id)
  }, [refundPaymentId, refundablePayments])
  useEffect(() => {
    if ((statement.data?.accountBalance ?? 0) < 0) setRefundAmount(String(Math.abs(statement.data!.accountBalance)))
  }, [statement.data?.accountBalance])
  const refund = useMutation({
    mutationFn: () => api.billing.refund(refundPaymentId, {
      refundNo: `RF-${encounterId}-${Date.now()}`, amount: Number(refundAmount), reason: refundReason,
    }),
    onSuccess: async () => { setRefundAmount(''); await refresh() },
  })

  const error = worklist.error || paymentMethods.error || statement.error || reconciliation.error || synchronize.error
    || issueInvoice.error || collect.error || refund.error
  const currency = statement.data?.currencyCode ?? selected?.currencyCode ?? 'CNY'
  const canInvoice = Boolean(statement.data && statement.data.charges.some((charge) =>
    !statement.data!.invoices.some((invoice) => invoice.lines.some((line) => line.chargeItemId === charge.id))))

  return <>
    <PageHeader eyebrow="费用结算 · M3.4" title="门诊收费与对账工作台"
      description="按实际发退药事实生成不可变收费事项，以结算凭证归集费用，并用追加式支付、退款和借贷分录完成平账。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新工作台</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="billing-context-bar">
      <div><span>当前工作机构</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong></div>
      <div><span>待计费</span><strong>{worklist.data?.filter((item) => item.status === 'PENDING_CHARGE').length ?? 0}</strong></div>
      <div><span>待收/退款</span><strong>{worklist.data?.filter((item) => item.status === 'PENDING_PAYMENT'
        || item.status === 'PENDING_REFUND').length ?? 0}</strong></div>
      <FormField label="对账业务日">
        <input className="ui-field__control" type="date" value={businessDate}
          onChange={(event) => setBusinessDate(event.target.value)} />
      </FormField>
    </div>
    <div className="billing-workspace">
      <Panel className="billing-queue">
        <header className="billing-section-head"><div><h2>收费队列</h2><span>{worklist.data?.length ?? 0} 条</span></div></header>
        {worklist.isPending && <LoadingState label="正在加载收费队列…" />}
        {!worklist.isPending && !worklist.data?.length && <EmptyState icon="billing" title="暂无发退药待结算"
          copy="药房形成实际发药或退药事实后会进入收费队列。" />}
        <div className="billing-queue-list">
          {worklist.data?.map((item) => <button key={item.encounterId} type="button"
            className={item.encounterId === encounterId ? 'is-active' : ''}
            onClick={() => setEncounterId(item.encounterId)}>
            <div><strong>就诊 {item.encounterId}</strong><StatusBadge tone={tone(item.status)}>{workStatusText[item.status]}</StatusBadge></div>
            <span>居民 {item.residentId}</span>
            <small>{item.chargedEventCount}/{item.sourceEventCount} 条已计费 · {formatTime(item.latestOccurredAt)}</small>
            <b>{money(item.accountBalance, item.currencyCode)}</b>
          </button>)}
        </div>
      </Panel>

      <Panel className="billing-statement">
        <header className="billing-section-head">
          <div><h2>费用账户</h2><span>{selected ? `就诊 ${selected.encounterId}` : '请选择收费队列'}</span></div>
          {selected && <Button onClick={() => synchronize.mutate()} busy={synchronize.isPending}>同步发退药计费</Button>}
        </header>
        {statement.isPending && <LoadingState label="正在加载费用账户…" />}
        {selected && !selected.accountId && !statement.isPending && <EmptyState icon="billing" title="尚未形成费用账户"
          copy="执行计费同步后，将按价格快照形成应收及账务分录。"
          action={<Button onClick={() => synchronize.mutate()}>生成收费事项</Button>} />}
        {statement.data && <>
          <div className="billing-metrics">
            <div><span>收费净额</span><strong>{money(statement.data.chargeAmount, currency)}</strong></div>
            <div><span>已结算</span><strong>{money(statement.data.invoicedAmount, currency)}</strong></div>
            <div><span>实收 / 退款</span><strong>{money(statement.data.paymentAmount, currency)} / {money(statement.data.refundAmount, currency)}</strong></div>
            <div className={statement.data.accountBalance === 0 ? 'is-balanced' : 'is-open'}>
              <span>账户余额</span><strong>{money(statement.data.accountBalance, currency)}</strong>
            </div>
          </div>
          <section className="billing-table-section">
            <header><div><h3>收费事项</h3><span>逐笔对应实际发药或退药来源</span></div>
              <Button variant="secondary" disabled={!canInvoice} onClick={() => issueInvoice.mutate()}
                busy={issueInvoice.isPending}>生成结算凭证</Button></header>
            <div className="billing-table-wrap"><table className="billing-table"><thead><tr>
              <th>项目</th><th>来源</th><th>数量</th><th>单价</th><th>金额</th><th>发生时间</th>
            </tr></thead><tbody>{statement.data.charges.map((charge) => <tr key={charge.id}>
              <td><strong>{charge.itemName}</strong><code>{charge.itemCode}</code></td>
              <td><StatusBadge tone={charge.sourceType === 'MEDICATION_RETURN' ? 'warning' : 'info'}>
                {charge.sourceType === 'MEDICATION_RETURN' ? '退药冲正' : '实际发药'}</StatusBadge><code>{charge.sourceId}</code></td>
              <td>{charge.quantity} {charge.unitCode}</td><td>{money(charge.unitPrice, charge.currencyCode)}</td>
              <td className={charge.totalAmount < 0 ? 'is-negative' : ''}>{money(charge.totalAmount, charge.currencyCode)}</td>
              <td>{formatTime(charge.occurredAt)}</td>
            </tr>)}</tbody></table></div>
          </section>
          <BillingTimeline invoices={statement.data.invoices} payments={statement.data.payments} currency={currency} />
        </>}
      </Panel>

      <div className="billing-side">
        <Panel>
          <header className="billing-section-head"><div><h2>收退操作</h2><span>账户锁定后记账</span></div></header>
          <div className="billing-action-form">
            <h3>收款</h3>
            <FormField label="待支付结算凭证"><Select value={paymentInvoiceId} onChange={setPaymentInvoiceId} showValue
              placeholder="暂无待支付凭证" options={payableInvoices.map((invoice) => ({ value: invoice.id,
                label: invoice.invoiceNo, secondaryText: money(invoice.outstandingAmount, invoice.currencyCode) }))} /></FormField>
            <div className="billing-action-grid"><FormField label="支付方式"><Select value={paymentMethod} onChange={setPaymentMethod} showValue
              placeholder={paymentMethods.isPending ? '正在加载支付方式' : '当前场景无可用支付方式'}
              options={(paymentMethods.data ?? []).map((item) => ({ value: item.code, label: item.name,
                secondaryText: item.code }))} /></FormField>
              <FormField label="收款金额"><input className="ui-field__control" type="number" min="0.01" step="0.01"
                value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></FormField></div>
            <Button disabled={!paymentInvoiceId || Number(paymentAmount) <= 0} onClick={() => collect.mutate()}
              busy={collect.isPending}>确认收款并记账</Button>
          </div>
          <div className="billing-action-form billing-action-form--refund">
            <h3>退款</h3>
            <FormField label="原支付事实"><Select value={refundPaymentId} onChange={setRefundPaymentId} showValue
              placeholder="暂无可选原支付" options={refundablePayments.map((payment) => ({ value: payment.id,
                label: payment.paymentNo, secondaryText: money(payment.amount, payment.currencyCode) }))} /></FormField>
            <FormField label="退款金额"><input className="ui-field__control" type="number" min="0.01" step="0.01"
              value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></FormField>
            <FormField label="退款原因"><input className="ui-field__control" value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)} /></FormField>
            <Button variant="danger" disabled={!refundPaymentId || Number(refundAmount) <= 0 || !refundReason.trim()
              || (statement.data?.accountBalance ?? 0) >= 0} onClick={() => refund.mutate()} busy={refund.isPending}>
              确认退款并冲正</Button>
          </div>
        </Panel>
        <Panel className="billing-reconciliation">
          <header className="billing-section-head"><div><h2>日对账</h2><span>{businessDate}</span></div></header>
          {reconciliation.isPending && <LoadingState label="正在核对库存与收费…" />}
          {reconciliation.data && <>
            <div className="billing-recon-summary">
              <div><span>来源 / 已计费</span><strong>{reconciliation.data.sourceEventCount} / {reconciliation.data.chargedEventCount}</strong></div>
              <div><span>差异</span><strong>{reconciliation.data.discrepancyCount}</strong></div>
              <div><span>借 / 贷</span><strong>{money(reconciliation.data.ledgerDebit, currency)} / {money(reconciliation.data.ledgerCredit, currency)}</strong></div>
            </div>
            <ul className="billing-recon-list">{reconciliation.data.lines.slice(0, 8).map((line) => <li key={`${line.sourceType}-${line.sourceId}`}>
              <div><code>{line.sourceNo ?? line.sourceId}</code><StatusBadge tone={tone(line.status)}>{line.status}</StatusBadge></div>
              <span>{line.description}</span>
            </li>)}</ul>
            {!reconciliation.data.lines.length && <EmptyState icon="billing" title="当日暂无账务来源" copy="选择有发退药业务的日期查看逐笔对账。" />}
          </>}
        </Panel>
      </div>
    </div>
  </>
}

function BillingTimeline({ invoices, payments, currency }: { invoices: Invoice[]; payments: Payment[]; currency: string }) {
  const items = [...invoices.map((invoice) => ({ id: `I-${invoice.id}`, at: invoice.issuedAt,
    type: invoice.invoiceType === 'CREDIT' ? '贷项凭证' : '结算凭证', code: invoice.invoiceNo,
    amount: invoice.netAmount, tone: invoice.invoiceType === 'CREDIT' ? 'warning' as const : 'info' as const })),
  ...payments.map((payment) => ({ id: `P-${payment.id}`, at: payment.paidAt,
    type: payment.paymentType === 'REFUND' ? '退款冲正' : '支付完成', code: payment.paymentNo,
    amount: payment.paymentType === 'REFUND' ? -payment.amount : payment.amount,
    tone: payment.paymentType === 'REFUND' ? 'danger' as const : 'success' as const }))]
    .sort((a, b) => a.at.localeCompare(b.at))
  return <section className="billing-timeline"><header><h3>结算与支付轨迹</h3><span>{items.length} 条不可变事实</span></header>
    {!items.length ? <p>收费事项尚未形成结算凭证。</p> : <ol>{items.map((item) => <li key={item.id}>
      <span className={`billing-timeline__dot is-${item.tone}`} /><div><strong>{item.type}</strong><code>{item.code}</code>
        <small>{formatTime(item.at)}</small></div><b>{money(item.amount, currency)}</b>
    </li>)}</ol>}
  </section>
}
