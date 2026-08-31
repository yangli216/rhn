import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { AccountStatement, PaymentOrder } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementModeCode,
  type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { Alert, Button, EmptyState, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'
import { BillingQueue, BillingTimeline, money } from './BillingShared'

const settlementStatuses = new Set(['PENDING_CHARGE', 'PENDING_INVOICE', 'PENDING_PAYMENT'])
const draftSettlementId = '__CURRENT_UNINVOICED_CHARGES__'
type CheckoutStage = 'IDLE' | 'CREATING_SETTLEMENT' | 'CREATING_PAYMENT'

export function BillingWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const linkedResidentId = searchParams.get('residentId')
  const [encounterId, setEncounterId] = useState('')
  const [settlementMode, setSettlementMode] = useState<SettlementModeCode>('SELF_PAY')
  const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>('IDLE')
  const completedPaymentMarker = useRef('')
  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
  const settlementItems = useMemo(() => (worklist.data ?? []).filter((item) => settlementStatuses.has(item.status)),
    [worklist.data])
  const paymentMethods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'),
  })
  useEffect(() => {
    if ((!linkedEncounterId && !linkedResidentId) || !worklist.data) return
    const target = worklist.data.find((item) => linkedEncounterId
      ? item.encounterId === linkedEncounterId : item.residentId === linkedResidentId)
    if (target) setEncounterId(target.encounterId)
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId'); next.delete('residentId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, linkedResidentId, searchParams, setSearchParams, worklist.data])
  useEffect(() => {
    if (linkedEncounterId || linkedResidentId) return
    if (!encounterId && settlementItems.length) setEncounterId(settlementItems[0].encounterId)
    if (encounterId && settlementItems.length && !settlementItems.some((item) => item.encounterId === encounterId)) {
      setEncounterId(settlementItems[0].encounterId)
    }
  }, [encounterId, linkedEncounterId, linkedResidentId, settlementItems])
  useEffect(() => { setSettlementMode('SELF_PAY') }, [encounterId])
  const selected = worklist.data?.find((item) => item.encounterId === encounterId)
  const statement = useQuery({ queryKey: ['billing-statement', encounterId],
    queryFn: () => api.billing.statement(encounterId), enabled: Boolean(encounterId && selected?.accountId) })
  const hasInsuranceSettlement = Boolean(statement.data?.settlements.some((value) =>
    value.settlementType === 'NORMAL' && insuranceSettlementReady(value)))
  useEffect(() => {
    if (hasInsuranceSettlement) setSettlementMode('MEDICAL_INSURANCE')
  }, [encounterId, hasInsuranceSettlement])
  const paymentOrders = useQuery({ queryKey: ['billing-payment-orders', statement.data?.accountId],
    queryFn: () => api.billing.paymentOrders(statement.data!.accountId), enabled: Boolean(statement.data?.accountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false })
  useEffect(() => {
    const completed = [...(paymentOrders.data ?? [])]
      .filter((value) => ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(value.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    if (!completed) return
    const marker = `${completed.id}:${completed.status}:${completed.updatedAt}`
    if (completedPaymentMarker.current === marker) return
    completedPaymentMarker.current = marker
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId] }),
    ])
  }, [encounterId, paymentOrders.data, queryClient])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['billing-payment-orders'] }),
    ])
  }
  const synchronize = useMutation({
    mutationFn: () => api.billing.synchronize(encounterId, `BIL-SYNC-${encounterId}-${Date.now()}`), onSuccess: refresh,
  })
  const canInvoice = Boolean(statement.data && statement.data.charges.some((charge) =>
    !statement.data!.invoices.some((invoice) => invoice.lines.some((line) => line.chargeItemId === charge.id))))
  const payableSettlements = useMemo(() => statement.data?.settlements.filter((settlement) =>
    settlement.settlementType === 'NORMAL' && settlement.outstandingAmount > 0) ?? [], [statement.data])
  const settlementOptions = useMemo(() => [
    ...(canInvoice && statement.data ? [{
      id: draftSettlementId, code: '本次待结算费用', outstandingAmount: statement.data.uninvoicedAmount,
      currencyCode: statement.data.currencyCode, insuranceReady: false, insurancePreparationAllowed: true,
    }] : []),
    ...payableSettlements.map((settlement) => ({
      id: settlement.id, code: settlement.settlementNo, outstandingAmount: settlement.outstandingAmount,
      currencyCode: settlement.currencyCode,
      insuranceReady: insuranceSettlementReady(settlement), insurancePreparationAllowed: false,
      insuranceAmount: settlement.insuranceAmount,
      personalAccountAmount: settlement.tenders.filter((value) => value.tenderType === 'PERSONAL_ACCOUNT')
        .reduce((sum, value) => sum + value.amount, 0),
      otherFundAmount: settlement.otherAmount,
    })),
  ], [canInvoice, payableSettlements, statement.data])
  const checkout = useMutation({
    mutationFn: async (command: SettlementPaymentCommand) => {
      let settlementId = command.settlementId
      if (settlementId === draftSettlementId) {
        setCheckoutStage('CREATING_SETTLEMENT')
        const invoice = await api.billing.issueInvoice(statement.data!.accountId,
          `INV-${command.idempotencyKey.replace(/^PAY-/, '')}`)
        if (command.amount <= 0) return invoice
        const updatedStatement = await api.billing.statement(encounterId)
        const createdSettlement = updatedStatement.settlements.find((value) =>
          value.legacyInvoiceId === invoice.id && value.settlementType === 'NORMAL')
        if (!createdSettlement) throw new Error('结算单已生成，但暂未读取到支付信息，请刷新后继续。')
        settlementId = createdSettlement.id
      }
      if (command.amount <= 0) return api.billing.settlement(settlementId)
      setCheckoutStage('CREATING_PAYMENT')
      return api.billing.createPaymentOrder(settlementId, {
        idempotencyKey: command.idempotencyKey, businessScene: 'OUTPATIENT', paymentSceneCode: 'CASHIER',
        paymentMethodCode: command.paymentMethodCode, amount: command.amount, terminalCode: 'CASHIER-WEB',
      })
    },
    onSettled: async () => {
      try { await refresh() } finally { setCheckoutStage('IDLE') }
    },
  })
  const recoverPaymentOrder = useMutation({
    mutationFn: (paymentOrderId: string) => api.billing.queryPaymentOrder(paymentOrderId),
    onSuccess: refresh,
  })
  const error = worklist.error || paymentMethods.error || statement.error || paymentOrders.error
    || synchronize.error || checkout.error || recoverPaymentOrder.error
  const currency = statement.data?.currencyCode ?? selected?.currencyCode ?? 'CNY'

  return <div className="billing-page">
    <PageHeader eyebrow="收费管理" title="收费结算" description="处理费用核对、结算和患者收款。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="billing-context-bar billing-context-bar--compact">
      <div><span>当前收费机构</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong></div>
      <div><span>待计费</span><strong>{settlementItems.filter((item) => item.status === 'PENDING_CHARGE').length}</strong></div>
      <div><span>待结算/收款</span><strong>{settlementItems.filter((item) => item.status !== 'PENDING_CHARGE').length}</strong></div>
    </div>
    {worklist.isPending ? <LoadingState label="正在加载收费队列…" /> : <div className="billing-workspace-scroll">
      <div className="billing-workspace">
      <BillingQueue title="待收费患者" items={settlementItems} selectedId={encounterId} onSelect={setEncounterId}
        emptyTitle="暂无待收费患者" emptyCopy="当前没有待计费、待结算或待收款业务。" />
      <Panel className="billing-statement">
        <header className="billing-section-head"><div><h2>费用明细</h2>
          <span>{selected
            ? [selected.residentName, selected.encounterNo].filter(Boolean).join(' · ') || '已选择患者'
            : '请选择患者'}</span></div>
          {selected?.status === 'PENDING_CHARGE' && <Button onClick={() => synchronize.mutate()}
            busy={synchronize.isPending}>同步计费</Button>}
        </header>
        {statement.isPending && <LoadingState label="正在加载费用明细…" />}
        {selected && !selected.accountId && !statement.isPending && <EmptyState icon="billing" title="尚未形成费用账户"
          copy="同步本次就诊的收费来源后即可结算。" action={<Button onClick={() => synchronize.mutate()}>生成收费事项</Button>} />}
        {statement.data && <>
          <div className="billing-metrics">
            <div><span>费用合计</span><strong>{money(statement.data.chargeAmount, currency)}</strong></div>
            <div><span>已结算</span><strong>{money(statement.data.invoicedAmount, currency)}</strong></div>
            <div><span>已收款</span><strong>{money(statement.data.paymentAmount, currency)}</strong></div>
            <div className={statement.data.accountBalance === 0 ? 'is-balanced' : 'is-open'}>
              <span>待收金额</span><strong>{money(statement.data.accountBalance, currency)}</strong></div>
          </div>
          <section className="billing-table-section"><header><div><h3>收费项目</h3><span>{statement.data.charges.length} 项</span></div></header>
            <div className="billing-table-wrap"><table className="billing-table"><thead><tr>
              <th>项目</th><th>来源</th><th>数量</th><th>单价</th><th>金额</th><th>发生时间</th>
            </tr></thead><tbody>{statement.data.charges.map((charge) => <tr key={charge.id}>
              <td><strong>{charge.itemName}</strong><code>{charge.itemCode}</code></td>
              <td><StatusBadge tone={charge.totalAmount < 0 ? 'warning' : 'info'}>
                {charge.totalAmount < 0 ? '冲正' : '收费'}</StatusBadge><code>{charge.sourceId}</code></td>
              <td>{charge.quantity} {charge.unitCode}</td><td>{money(charge.unitPrice, charge.currencyCode)}</td>
              <td className={charge.totalAmount < 0 ? 'is-negative' : ''}>{money(charge.totalAmount, charge.currencyCode)}</td>
              <td>{new Date(charge.occurredAt).toLocaleString('zh-CN')}</td>
            </tr>)}</tbody></table></div>
          </section>
          <BillingTimeline invoices={statement.data.invoices} payments={statement.data.payments} currency={currency} />
        </>}
      </Panel>
      <Panel className="billing-payment-panel">
        <header className="billing-section-head"><div><h2>结算</h2><span>结算与支付进度</span></div></header>
        {statement.data && <SettlementProgress statement={statement.data} canInvoice={canInvoice}
          orders={paymentOrders.data ?? []} stage={checkoutStage} settlementMode={settlementMode} />}
        <div className="billing-action-form">
          <SettlementPaymentPanel settlements={settlementOptions}
            methods={(paymentMethods.data ?? []).map((item) => ({ code: item.code, name: item.name }))}
            orders={paymentOrders.data ?? []} busy={checkout.isPending} targetLabel="结算范围"
            showSettlementMode settlementModeCode={settlementMode} onSettlementModeChange={setSettlementMode}
            actionLabel="结算" busyLabel={checkoutStage === 'CREATING_SETTLEMENT' ? '正在生成结算单' : '正在支付'}
            recoveringOrderId={recoverPaymentOrder.isPending ? recoverPaymentOrder.variables : undefined}
            onRecoverOrder={(order) => recoverPaymentOrder.mutateAsync(order.id)}
            onSubmit={(command) => checkout.mutateAsync(command)} />
        </div>
      </Panel>
      </div>
    </div>}
  </div>
}

function SettlementProgress({ statement, canInvoice, orders, stage, settlementMode }: {
  statement: AccountStatement
  canInvoice: boolean
  orders: PaymentOrder[]
  stage: CheckoutStage
  settlementMode: SettlementModeCode
}) {
  const latestSettlement = [...statement.settlements].filter((value) => value.settlementType === 'NORMAL')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
  const activeOrder = orders.find((value) => ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status))
  const latestOrder = [...orders].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  const hasCharges = statement.charges.length > 0
  const insuranceMode = settlementMode === 'MEDICAL_INSURANCE'
  const settlementGenerated = stage === 'CREATING_PAYMENT' || Boolean(latestSettlement && !canInvoice)
  const insuranceReady = Boolean(latestSettlement && insuranceSettlementReady(latestSettlement))
  const settlementComplete = insuranceMode ? settlementGenerated && insuranceReady : settlementGenerated
  const paymentComplete = settlementComplete && !activeOrder && statement.accountBalance === 0
  const paymentFailed = settlementComplete && latestOrder?.status === 'FAILED'
  const steps = [
    {
      title: '费用确认', state: hasCharges ? 'done' : 'current',
      detail: hasCharges ? `${statement.charges.length} 项 · ${money(statement.chargeAmount, statement.currencyCode)}` : '等待收费项目',
    },
    {
      title: insuranceMode ? '医保结算' : '生成结算单', state: settlementComplete ? 'done' : hasCharges ? 'current' : 'waiting',
      detail: stage === 'CREATING_SETTLEMENT' ? '正在生成结算单' : insuranceMode && settlementGenerated && !insuranceReady
        ? '等待医保预结算结果' : settlementComplete
          ? insuranceMode ? `医保基金 ${money(latestSettlement?.insuranceAmount ?? 0, statement.currencyCode)}`
            : latestSettlement?.settlementNo ?? '已生成' : '点击结算后自动生成',
    },
    {
      title: insuranceMode ? '个人自付收款' : '支付记账', state: paymentComplete ? 'done' : paymentFailed ? 'error'
        : settlementComplete || activeOrder ? 'current' : 'waiting',
      detail: stage === 'CREATING_PAYMENT' ? '正在发起支付' : activeOrder ? `支付${paymentOrderProgress(activeOrder.status)}`
        : paymentComplete ? statement.paymentAmount > 0
          ? `已收款 ${money(statement.paymentAmount, statement.currencyCode)}` : '无需支付'
          : paymentFailed ? '支付失败，可重试' : settlementComplete
            ? `待收 ${money(statement.accountBalance, statement.currencyCode)}` : '等待结算单',
    },
  ]

  return <ol className="billing-settlement-progress" aria-label="结算进度">
    {steps.map((step, index) => <li key={step.title} className={`is-${step.state}`}
      aria-current={step.state === 'current' ? 'step' : undefined}>
      <i aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</i>
      <div><strong>{step.title}</strong><span>{step.detail}</span></div>
    </li>)}
  </ol>
}

function insuranceSettlementReady(settlement: AccountStatement['settlements'][number]) {
  const latestInsuranceEvent = [...settlement.events]
    .filter((value) => value.commandCode.startsWith('INSURANCE-'))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  if (latestInsuranceEvent) return latestInsuranceEvent.eventType !== 'REVERSE_COMPLETE'
  return settlement.insuranceAmount > 0 || settlement.tenders.some((value) => Boolean(value.claimResponseId))
}

function paymentOrderProgress(status: PaymentOrder['status']) {
  return ({ CREATED: '已创建', PENDING: '待确认', PROCESSING: '处理中', PARTIAL: '部分完成' } as Record<string, string>)[status]
    ?? '处理中'
}
