import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, FormField, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'

const paymentMethodOptions = [
  { value: 'CASH', label: '现金' }, { value: 'WECHAT', label: '微信' },
  { value: 'ALIPAY', label: '支付宝' }, { value: 'BANK_CARD', label: '银行卡' },
]

export function InpatientBillingPanel({ api, episode, view = 'full' }: {
  api: RhnApi
  episode: InpatientEpisode
  view?: 'full' | 'deposits'
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [paymentMethodCode, setPaymentMethodCode] = useState('CASH')
  const [businessDate, setBusinessDate] = useState(today())
  const billing = useQuery({
    queryKey: ['inpatient-billing', episode.id],
    queryFn: () => api.inpatient.billing(episode.id),
  })
  const deposit = useMutation({
    mutationFn: () => api.inpatient.registerDeposit(episode.id, {
      paymentNo: `IPD-${episode.id}-${Date.now()}`,
      amount: Number(amount),
      currencyCode: billing.data?.currencyCode ?? 'CNY',
      paymentMethodCode,
      description: `${episode.residentName}住院预交金`,
    }),
    onSuccess: async (value) => {
      setAmount('')
      queryClient.setQueryData(['inpatient-billing', episode.id], value.account)
      await queryClient.invalidateQueries({ queryKey: ['inpatient-billing', episode.id] })
    },
  })
  const dailyStatement = useQuery({
    queryKey: ['inpatient-daily-statement', episode.id, businessDate],
    queryFn: () => api.inpatient.dailyStatement(episode.id, businessDate),
    enabled: view === 'full',
  })
  const postBedDays = useMutation({
    mutationFn: () => api.inpatient.postBedDays(episode.id, {
      throughDate: today(), currencyCode: billing.data?.currencyCode ?? 'CNY',
      commandCode: `IP-BED-${crypto.randomUUID()}`,
    }),
    onSuccess: async (value) => {
      queryClient.setQueryData(['inpatient-billing', episode.id], value.account)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inpatient-billing', episode.id] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-daily-statement', episode.id] }),
      ])
    },
  })
  const finalSettlement = useMutation({
    mutationFn: () => api.inpatient.finalSettlement(episode.id, {
      invoiceNo: `IP-${episode.episodeNo}-${Date.now()}`,
      currencyCode: billing.data?.currencyCode ?? 'CNY',
      terminalCode: 'INPATIENT-WORKSPACE', commandCode: `IP-SETTLE-${crypto.randomUUID()}`,
    }),
    onSuccess: async (value) => {
      queryClient.setQueryData(['inpatient-billing', episode.id], value.account)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inpatient-billing', episode.id] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-daily-statement', episode.id] }),
      ])
    },
  })
  const collectFinalPayment = useMutation({
    mutationFn: () => {
      const settlement = billing.data?.financialSettlement
      if (!settlement) throw new Error('请先生成住院结算单')
      return api.inpatient.collectFinalPayment(episode.id, {
        expectedRevision: settlement.revision, commandCode: `IP-PAY-${crypto.randomUUID()}`,
        paymentMethodCode, amount: settlement.outstandingAmount,
        currencyCode: settlement.currencyCode, description: `${episode.residentName}住院结算补缴`,
      })
    },
    onSuccess: async (value) => {
      queryClient.setQueryData(['inpatient-billing', episode.id], value.account)
      await queryClient.invalidateQueries({ queryKey: ['inpatient-billing', episode.id] })
    },
  })
  const refundSurplus = useMutation({
    mutationFn: () => {
      const settlement = billing.data?.financialSettlement
      if (!settlement) throw new Error('请先生成住院结算单')
      return api.inpatient.refundSurplus(episode.id, {
        expectedRevision: settlement.revision, commandCode: `IP-REF-${crypto.randomUUID()}`,
        amount: settlement.refundableAmount, currencyCode: settlement.currencyCode,
        reason: `${episode.residentName}住院结算退还预交金余额`,
      })
    },
    onSuccess: async (value) => {
      queryClient.setQueryData(['inpatient-billing', episode.id], value.account)
      await queryClient.invalidateQueries({ queryKey: ['inpatient-billing', episode.id] })
    },
  })
  const account = billing.data
  const settlement = account?.financialSettlement
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0

  return <Panel className="inpatient-billing">
    <header className="inpatient-section-head"><div><h2>{view === 'deposits' ? '住院预交金管理' : '住院费用与预交金'}</h2>
      <span>{view === 'deposits' ? '收取和查询每笔预交金；出院结算默认使用全部可用余额'
        : '床日按业务日期正式记账；临床出院与财务结算相互独立'}</span></div>
      {account && <StatusBadge tone={settlement?.financialStatus === 'SETTLED' ? 'success'
        : settlement ? 'warning' : account.paymentDue ? 'warning' : 'success'}>
        {settlement ? financialStatusText(settlement.financialStatus)
          : account.paymentDue ? '待结算' : '余额正常'}</StatusBadge>}
    </header>
    {billing.isPending ? <LoadingState label="正在汇总住院费用…" /> : billing.error ? <Alert>{errorMessage(billing.error)}</Alert> : account && <>
      <section className={`inpatient-billing__summary ${view === 'deposits' ? 'is-deposit-view' : ''}`}
        aria-label={view === 'deposits' ? '住院预交金汇总' : '住院费用汇总'}>
        {view === 'full' && <>
          <div><span>已记账费用</span><strong>{money(account.postedChargeAmount, account.currencyCode)}</strong></div>
          <div><span>预计医嘱</span><strong>{money(account.estimatedOrderAmount, account.currencyCode)}</strong></div>
          <div><span>未记账床位</span><strong>{money(account.estimatedBedAmount, account.currencyCode)}</strong></div>
        </>}
        <div><span>可用预交金</span><strong>{money(account.depositAmount, account.currencyCode)}</strong></div>
        <div><span>预计费用合计</span><strong>{money(account.estimatedTotalAmount, account.currencyCode)}</strong></div>
        <div className={account.paymentDue ? 'is-warning' : 'is-success'}><span>预计待结</span>
          <strong>{money(account.estimatedOutstandingAmount, account.currencyCode)}</strong></div>
      </section>
      {episode.status === 'ADMITTED' && <form className="inpatient-deposit" onSubmit={(event) => {
        event.preventDefault(); if (validAmount) deposit.mutate()
      }}>
        <FormField label="预交金额"><input inputMode="decimal" value={amount} placeholder="0.00"
          onChange={(event) => setAmount(event.target.value)} /></FormField>
        <FormField label="支付方式"><Select value={paymentMethodCode} options={paymentMethodOptions}
          searchable={false} clearable={false} onChange={setPaymentMethodCode} /></FormField>
        <Button type="submit" variant="secondary" busy={deposit.isPending} disabled={!validAmount}>收取预交金</Button>
      </form>}
      {deposit.error && <Alert>{errorMessage(deposit.error)}</Alert>}
      <section className="inpatient-deposit-ledger" aria-label="预交金记录">
        <header><div><strong>预交金记录</strong><small>共 {account.deposits?.length ?? 0} 笔</small></div>
          <span>结算时默认按缴纳时间顺序自动抵扣</span></header>
        {!account.deposits?.length ? <div className="inpatient-deposit-ledger__empty">暂无预交金记录</div>
          : <div className="inpatient-deposit-ledger__table">
            <div className="inpatient-deposit-ledger__head"><span>缴纳时间 / 凭证号</span><span>支付方式</span>
              <span>原金额</span><span>已抵扣</span><span>已退款</span><span>可用余额</span></div>
            {account.deposits.map((item) => <article key={item.paymentId}>
              <span><strong>{dateTime(item.paidAt)}</strong><small>{item.paymentNo}</small></span>
              <span>{paymentMethodText(item.paymentMethodCode)}</span>
              <b>{money(item.originalAmount, item.currencyCode)}</b>
              <span>{money(item.allocatedAmount, item.currencyCode)}</span>
              <span>{money(item.refundedAmount, item.currencyCode)}</span>
              <strong>{money(item.availableAmount, item.currencyCode)}</strong>
            </article>)}</div>}
      </section>
      {view === 'deposits' && settlement && <Alert tone="info">结算单 {settlement.settlementNo} 已自动使用预交金
        {' '}{money(settlement.prepaymentAmount, settlement.currencyCode)}。</Alert>}
      {view === 'full' && <><section className="inpatient-billing__actions" aria-label="床日记账与出院结算">
        {episode.status === 'ADMITTED' && <Button variant="secondary" busy={postBedDays.isPending}
          onClick={() => postBedDays.mutate()}>床日记账至今日</Button>}
        {episode.status === 'DISCHARGED' && !settlement && <Button busy={finalSettlement.isPending}
          onClick={() => finalSettlement.mutate()}>生成结算单并自动抵扣预交金</Button>}
        <small>{episode.status === 'DISCHARGED' && !settlement
          ? `可用预交金 ${money(account.depositAmount, account.currencyCode)} 将默认优先参与本次结算。`
          : '默认规则：入院日计费、出院日不重复加收；同日入出院计 1 个床日。'}</small>
      </section>
      {postBedDays.data && <Alert>床日记账完成：新增 {postBedDays.data.createdCount} 天，
        已存在 {postBedDays.data.existingCount} 天。</Alert>}
      {postBedDays.error && <Alert>{errorMessage(postBedDays.error)}</Alert>}
      {finalSettlement.data && <Alert>结算单 {finalSettlement.data.settlementNo} 已生成，预交金抵扣
        {' '}{money(finalSettlement.data.prepaymentAmount, finalSettlement.data.currencyCode)}，
        尚待支付 {money(finalSettlement.data.outstandingAmount, finalSettlement.data.currencyCode)}。</Alert>}
      {finalSettlement.error && <Alert>{errorMessage(finalSettlement.error)}</Alert>}
      {episode.status === 'DISCHARGED' && settlement && <section className="inpatient-deposit"
        aria-label="出院费用结算处理">
        <div><small>结算单 {settlement.settlementNo}</small><strong>
          {financialStatusText(settlement.financialStatus)}</strong></div>
        {settlement.financialStatus === 'PENDING_PAYMENT' && <>
          <FormField label="补缴方式"><Select value={paymentMethodCode} options={paymentMethodOptions}
            searchable={false} clearable={false} onChange={setPaymentMethodCode} /></FormField>
          <Button busy={collectFinalPayment.isPending} onClick={() => collectFinalPayment.mutate()}>
            补缴 {money(settlement.outstandingAmount, settlement.currencyCode)}</Button></>}
        {settlement.financialStatus === 'PENDING_REFUND' && <Button variant="secondary"
          busy={refundSurplus.isPending} onClick={() => refundSurplus.mutate()}>
          退还预交金余额 {money(settlement.refundableAmount, settlement.currencyCode)}</Button>}
        {settlement.financialStatus === 'SETTLED' && <small>费用、支付及预交金余额均已核对完成。</small>}
      </section>}
      {collectFinalPayment.data && <Alert>补缴已落账，当前状态：
        {financialStatusText(collectFinalPayment.data.settlement.financialStatus)}。</Alert>}
      {refundSurplus.data && <Alert>预交金余额已退还，当前状态：
        {financialStatusText(refundSurplus.data.settlement.financialStatus)}。</Alert>}
      {collectFinalPayment.error && <Alert>{errorMessage(collectFinalPayment.error)}</Alert>}
      {refundSurplus.error && <Alert>{errorMessage(refundSurplus.error)}</Alert>}
      <section className="inpatient-daily-statement" aria-label="患者日清单">
        <header><div><strong>患者日清单</strong><small>实账与预计分开显示</small></div>
          <input aria-label="日清单日期" type="date" value={businessDate} max={today()}
            onChange={(event) => setBusinessDate(event.target.value)} /></header>
        {dailyStatement.isPending ? <LoadingState label="正在读取日清单…" />
          : dailyStatement.error ? <Alert>{errorMessage(dailyStatement.error)}</Alert>
            : dailyStatement.data && <>
              <div className="inpatient-daily-statement__summary">
                <span>已记账 <b>{money(dailyStatement.data.postedAmount, account.currencyCode)}</b></span>
                <span>预计 <b>{money(dailyStatement.data.estimatedAmount, account.currencyCode)}</b></span>
                {dailyStatement.data.categorySummaries.map((item) => <span key={item.category}>
                  {item.categoryName} <b>{money(item.amount, account.currencyCode)}</b></span>)}
              </div>
              {dailyStatement.data.lines.length === 0 ? <small>当日暂无费用事项</small>
                : <div className="inpatient-daily-statement__lines">{dailyStatement.data.lines.map((line, index) =>
                  <article key={`${line.sourceType}-${line.sourceId ?? index}`}>
                    <span><strong>{line.itemName}</strong><small>{line.posted ? '已记账' : '预计'} · {line.itemCode}</small></span>
                    <span>{line.quantity} {line.unitCode ?? ''}</span>
                    <b>{money(line.totalAmount, line.currencyCode)}</b>
                  </article>)}</div>}
            </>}
      </section>
      {account.costLines.length > 0 && <details className="inpatient-cost-lines"><summary>查看费用明细（{account.costLines.length} 项）</summary>
        <div>{account.costLines.map((line, index) => <article key={`${line.sourceType}-${line.sourceId ?? index}`}>
          <span><strong>{line.itemName}</strong><small>{line.itemCode} · {line.status}</small></span>
          <span>{line.quantity} {line.unitCode ?? ''}</span><b>{money(line.totalAmount, line.currencyCode)}</b>
        </article>)}</div></details>}</>}
    </>}
  </Panel>
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function paymentMethodText(value: string) {
  return paymentMethodOptions.find((item) => item.value === value)?.label ?? value
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function financialStatusText(status: 'PENDING_PAYMENT' | 'PENDING_REFUND' | 'PAYMENT_REVIEW' | 'SETTLED') {
  if (status === 'PENDING_PAYMENT') return '待补缴'
  if (status === 'PENDING_REFUND') return '待退余'
  if (status === 'SETTLED') return '已结清'
  return '待财务复核'
}
