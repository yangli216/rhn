import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { CashierClose } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'
import { billingTone, money } from './BillingShared'

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function closeStatus(value: string) {
  return ({ CALCULATED: '待确认', CONFIRMED: '已结账', REVERSED: '已撤销' } as Record<string, string>)[value] ?? value
}

export function CashierCloseWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [businessDate, setBusinessDate] = useState(today)
  const [terminalCode, setTerminalCode] = useState('CASHIER-WEB')
  const [rangeFrom, setRangeFrom] = useState(`${today()}T00:00`)
  const [rangeTo, setRangeTo] = useState(`${today()}T23:59`)
  const [cashPayment, setCashPayment] = useState('')
  const [cashRefund, setCashRefund] = useState('')
  const [differenceReason, setDifferenceReason] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const reconciliation = useQuery({ queryKey: ['billing-reconciliation', businessDate],
    queryFn: () => api.billing.dailyReconciliation(businessDate), enabled: Boolean(businessDate) })
  const closes = useQuery({ queryKey: ['billing-cashier-closes'], queryFn: api.billing.cashierCloses })
  useEffect(() => {
    if (!selectedId && closes.data?.length) setSelectedId(closes.data[0].id)
    if (selectedId && closes.data && !closes.data.some((item) => item.id === selectedId)) {
      setSelectedId(closes.data[0]?.id ?? '')
    }
  }, [closes.data, selectedId])
  const selected = closes.data?.find((item) => item.id === selectedId)
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-reconciliation'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-cashier-closes'] }),
    ])
  }
  const calculate = useMutation({
    mutationFn: () => {
      const actualAmounts: Array<{ paymentMethodCode: string; paymentType: 'PAYMENT' | 'REFUND'; amount: number }> = []
      if (cashPayment !== '') actualAmounts.push({ paymentMethodCode: 'CASH', paymentType: 'PAYMENT', amount: Number(cashPayment) })
      if (cashRefund !== '') actualAmounts.push({ paymentMethodCode: 'CASH', paymentType: 'REFUND', amount: -Math.abs(Number(cashRefund)) })
      return api.billing.calculateCashierClose({ commandCode: `CLOSE-${crypto.randomUUID()}`, terminalCode,
        rangeFrom: new Date(rangeFrom).toISOString(), rangeTo: new Date(rangeTo).toISOString(), actualAmounts })
    },
    onSuccess: async (value) => { await refresh(); setSelectedId(value.id); setDifferenceReason('') },
  })
  const confirm = useMutation({
    mutationFn: (value: CashierClose) => api.billing.confirmCashierClose(value.id, {
      commandCode: `CONFIRM-${crypto.randomUUID()}`, differenceReason: differenceReason.trim() || undefined,
    }),
    onSuccess: refresh,
  })
  const summary = reconciliation.data
  const error = reconciliation.error || closes.error || calculate.error || confirm.error
  const selectedHasDifference = Boolean(selected && Math.abs(selected.differenceAmount) > 0.000001)
  const canCalculate = Boolean(terminalCode.trim() && rangeFrom && rangeTo && new Date(rangeTo) > new Date(rangeFrom))
  const closeMetrics = useMemo(() => ({
    confirmed: closes.data?.filter((item) => item.status === 'CONFIRMED').length ?? 0,
    pending: closes.data?.filter((item) => item.status === 'CALCULATED').length ?? 0,
  }), [closes.data])

  return <>
    <PageHeader eyebrow="收费管理" title="日终结账" description="核对当日收费、实盘现金并完成收费员日结。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="billing-close-context">
      <div><span>当前收费机构</span><strong>{clinicalContext.organization.name}</strong></div>
      <FormField label="业务日期"><input type="date" value={businessDate} onChange={(event) => {
        const value = event.target.value; setBusinessDate(value); setRangeFrom(`${value}T00:00`); setRangeTo(`${value}T23:59`)
      }} /></FormField>
      <FormField label="收费终端"><input value={terminalCode} onChange={(event) => setTerminalCode(event.target.value)} /></FormField>
      <div><span>待确认 / 已结账</span><strong>{closeMetrics.pending} / {closeMetrics.confirmed}</strong></div>
    </div>
    <div className="billing-close-workspace">
      <Panel className="billing-close-reconciliation">
        <header className="billing-section-head"><div><h2>结账前核对</h2><span>{businessDate}</span></div></header>
        {reconciliation.isPending && <LoadingState label="正在核对当日账务…" />}
        {summary && <>
          <div className="billing-close-summary">
            <div><span>业务来源 / 已计费</span><strong>{summary.sourceEventCount} / {summary.chargedEventCount}</strong></div>
            <div><span>收费</span><strong>{money(summary.paymentAmount, summary.currencyCode)}</strong></div>
            <div><span>退款</span><strong>{money(summary.refundAmount, summary.currencyCode)}</strong></div>
            <div className={summary.discrepancyCount ? 'is-warning' : 'is-success'}><span>账务差异</span>
              <strong>{summary.discrepancyCount} 项</strong></div>
          </div>
          <div className="billing-table-wrap"><table className="billing-table billing-table--reconciliation"><thead><tr>
            <th>业务单号</th><th>业务类型</th><th>预期金额</th><th>已计费金额</th><th>核对结果</th><th>说明</th>
          </tr></thead><tbody>{summary.lines.map((line) => <tr key={`${line.sourceType}-${line.sourceId}`}>
            <td><strong>{line.sourceNo || line.sourceId}</strong><code>{line.encounterId}</code></td>
            <td>{line.sourceType}</td><td>{money(line.expectedAmount, summary.currencyCode)}</td>
            <td>{money(line.chargedAmount, summary.currencyCode)}</td>
            <td><StatusBadge tone={billingTone(line.status)}>{line.status === 'MATCHED' ? '一致' : '待核对'}</StatusBadge></td>
            <td>{line.description}</td>
          </tr>)}</tbody></table></div>
          {!summary.lines.length && <EmptyState icon="billing" title="当日暂无账务来源" copy="当前业务日期没有可核对的收费记录。" />}
        </>}
      </Panel>
      <div className="billing-close-side">
        <Panel>
          <header className="billing-section-head"><div><h2>生成日结</h2><span>按收费员和终端结账</span></div></header>
          <div className="billing-close-form">
            <div className="billing-close-range">
              <FormField label="开始时间"><input type="datetime-local" value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)} /></FormField>
              <FormField label="结束时间"><input type="datetime-local" value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)} /></FormField>
            </div>
            <div className="billing-close-range">
              <FormField label="现金收款实盘"><input type="number" min="0" step="0.01" value={cashPayment}
                placeholder="无现金可留空" onChange={(event) => setCashPayment(event.target.value)} /></FormField>
              <FormField label="现金退款实盘"><input type="number" min="0" step="0.01" value={cashRefund}
                placeholder="无现金退款可留空" onChange={(event) => setCashRefund(event.target.value)} /></FormField>
            </div>
            <Button disabled={!canCalculate} busy={calculate.isPending} onClick={() => calculate.mutate()}>计算日结</Button>
          </div>
        </Panel>
        <Panel className="billing-close-history">
          <header className="billing-section-head"><div><h2>日结记录</h2><span>{closes.data?.length ?? 0} 条</span></div></header>
          {closes.isPending && <LoadingState label="正在加载日结记录…" />}
          <div className="billing-close-list">{closes.data?.map((item) => <button type="button" key={item.id}
            className={item.id === selectedId ? 'is-active' : ''} onClick={() => { setSelectedId(item.id); setDifferenceReason('') }}>
            <div><strong>{item.closeNo}</strong><StatusBadge tone={billingTone(item.status)}>{closeStatus(item.status)}</StatusBadge></div>
            <span>{new Date(item.rangeFrom).toLocaleString('zh-CN')} 至 {new Date(item.rangeTo).toLocaleString('zh-CN')}</span>
            <small>{item.transactionCount} 笔 · {money(item.expectedAmount, item.currencyCode)}</small>
          </button>)}</div>
          {!closes.isPending && !closes.data?.length && <EmptyState icon="billing" title="暂无日结记录" copy="完成首次日结计算后将在此展示。" />}
        </Panel>
      </div>
    </div>
    {selected && <Panel className="billing-close-detail">
      <header className="billing-section-head"><div><h2>{selected.closeNo}</h2>
        <span>{closeStatus(selected.status)} · {selected.terminalCode}</span></div>
        {selected.status === 'CALCULATED' && <Button disabled={selectedHasDifference && !differenceReason.trim()}
          busy={confirm.isPending} onClick={() => confirm.mutate(selected)}>确认结账</Button>}
      </header>
      <div className="billing-close-summary">
        <div><span>交易笔数</span><strong>{selected.transactionCount}</strong></div>
        <div><span>系统应收</span><strong>{money(selected.expectedAmount, selected.currencyCode)}</strong></div>
        <div><span>实盘金额</span><strong>{money(selected.actualAmount, selected.currencyCode)}</strong></div>
        <div className={selectedHasDifference ? 'is-warning' : 'is-success'}><span>长短款</span>
          <strong>{money(selected.differenceAmount, selected.currencyCode)}</strong></div>
      </div>
      {selected.status === 'CALCULATED' && <div className="billing-close-confirm">
        <FormField label={selectedHasDifference ? '差异原因（必填）' : '结账备注'}><input value={differenceReason}
          onChange={(event) => setDifferenceReason(event.target.value)} /></FormField>
      </div>}
      <div className="billing-table-wrap"><table className="billing-table billing-table--close-lines"><thead><tr>
        <th>支付方式</th><th>业务类型</th><th>笔数</th><th>系统金额</th><th>实盘金额</th><th>差异</th>
      </tr></thead><tbody>{selected.lines.map((line) => <tr key={line.lineNo}>
        <td><strong>{line.paymentMethodCode}</strong></td><td>{line.paymentType === 'REFUND' ? '退款' : '收款'}</td>
        <td>{line.transactionCount}</td><td>{money(line.expectedAmount, line.currencyCode)}</td>
        <td>{money(line.actualAmount, line.currencyCode)}</td>
        <td className={line.differenceAmount ? 'is-negative' : ''}>{money(line.differenceAmount, line.currencyCode)}</td>
      </tr>)}</tbody></table></div>
    </Panel>}
  </>
}
