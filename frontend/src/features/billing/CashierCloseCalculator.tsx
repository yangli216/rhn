import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { CashierClose, CashierClosePreview } from '../../shared/api/billingApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DictionarySelect, FormField, LoadingState, Select } from '../../shared/ui'
import { money } from './BillingShared'

type Line = CashierClosePreview['lines'][number]
const lineKey = (line: Pick<Line, 'paymentMethodCode' | 'paymentType'>) => `${line.paymentMethodCode}:${line.paymentType}`
const lineLabel = (line: Line) => `${line.paymentMethodCode} ${line.paymentType === 'REFUND' ? '退款' : '收款'}`

export function CashierCloseCalculator({ api, scopeKey, terminalCode, rangeFrom, rangeTo, onCalculated }: {
  api: RhnApi; scopeKey: string; terminalCode: string; rangeFrom: string; rangeTo: string
  onCalculated: (value: CashierClose) => Promise<void>
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [extraLines, setExtraLines] = useState<Line[]>([])
  const [adding, setAdding] = useState(false)
  const [method, setMethod] = useState('')
  const [paymentType, setPaymentType] = useState<'PAYMENT' | 'REFUND'>('PAYMENT')
  const validRange = Boolean(terminalCode.trim() && rangeFrom && rangeTo && new Date(rangeTo) > new Date(rangeFrom))
  const preview = useQuery({
    queryKey: ['billing-cashier-close-preview', scopeKey, terminalCode, rangeFrom, rangeTo],
    enabled: validRange,
    queryFn: async () => {
      const value = await api.billing.cashierClosePreview(terminalCode.trim(), new Date(rangeFrom).toISOString(), new Date(rangeTo).toISOString())
      if (!value || !value.currencyCode || !Number.isInteger(value.transactionCount) || !Array.isArray(value.lines)
          || value.lines.some((line) => !line.paymentMethodCode || !['PAYMENT', 'REFUND'].includes(line.paymentType)
            || !Number.isFinite(line.expectedAmount) || !Number.isInteger(line.transactionCount))) {
        throw new Error('日结预览返回不完整')
      }
      return value
    },
  })
  const expectedLines = preview.isSuccess ? preview.data.lines : []
  const lines = [...expectedLines, ...extraLines.filter((extra) => !expectedLines.some((line) => lineKey(line) === lineKey(extra)))]
  const complete = validRange && preview.isSuccess && !preview.isFetching && lines.every((line) => {
    const value = amounts[lineKey(line)]
    return Boolean(value?.trim()) && Number.isFinite(Number(value)) && Number(value) >= 0
  })
  const calculate = useMutation({
    mutationFn: () => {
      if (!complete) throw new Error('请核对所有收款和退款渠道的实际金额')
      return api.billing.calculateCashierClose({ commandCode: `CLOSE-${crypto.randomUUID()}`, terminalCode: terminalCode.trim(),
        rangeFrom: new Date(rangeFrom).toISOString(), rangeTo: new Date(rangeTo).toISOString(),
        actualAmounts: lines.map((line) => ({ paymentMethodCode: line.paymentMethodCode, paymentType: line.paymentType,
          amount: Number(amounts[lineKey(line)]) * (line.paymentType === 'REFUND' ? -1 : 1) })),
      })
    },
    onSuccess: async (value) => { setAmounts({}); setExtraLines([]); await onCalculated(value) },
    onError: () => { void preview.refetch() },
  })
  return <>
    {!validRange ? <Alert>请选择有效的终端和结账时间范围。</Alert>
      : preview.isPending ? <LoadingState label="正在读取待日结交易…" />
      : preview.isError ? <Alert tone="warning">待日结交易尚未核验：{errorMessage(preview.error)}
        <Button variant="secondary" size="sm" onClick={() => void preview.refetch()}>重试日结预览</Button></Alert>
      : <>
        <p>待日结 {preview.data.transactionCount} 笔。现金填写实盘，其他渠道填写核对后的实际收退金额；退款填写正数。</p>
        {lines.map((line) => <FormField key={lineKey(line)} label={`${lineLabel(line)}核对金额`} required
          hint={`系统金额 ${money(line.expectedAmount, preview.data.currencyCode)} · ${line.transactionCount} 笔`}>
          <input aria-label={`${lineLabel(line)}核对金额`} type="number" min="0" step="0.000001"
            value={amounts[lineKey(line)] ?? ''} placeholder="请录入实际核对金额"
            onChange={(event) => setAmounts((current) => ({ ...current, [lineKey(line)]: event.target.value }))} />
        </FormField>)}
        <Button variant="secondary" size="sm" onClick={() => setAdding((value) => !value)}>补录账面外收退</Button>
        {adding && <>
          <FormField label="补录支付方式"><DictionarySelect api={api.dictionaries} dictionaryCode="PAY_METHOD"
            aria-label="补录支付方式" value={method} onChange={setMethod} /></FormField>
          <FormField label="补录类型"><Select aria-label="补录类型" value={paymentType} clearable={false}
            options={[{ value: 'PAYMENT', label: '收款' }, { value: 'REFUND', label: '退款' }]}
            onChange={(value) => setPaymentType(value as typeof paymentType)} /></FormField>
          <Button size="sm" variant="secondary" disabled={!method || lines.some((line) => lineKey(line) === `${method}:${paymentType}`)}
            onClick={() => { setExtraLines((current) => [...current, { paymentMethodCode: method, paymentType,
              transactionCount: 0, expectedAmount: 0 }]); setAdding(false); setMethod('') }}>加入核对</Button>
        </>}
      </>}
    {calculate.isSuccess && <Alert tone="success">日结已生成：{calculate.data.closeNo}。请核对各渠道差异后确认结账。</Alert>}
    {calculate.error && <Alert>{errorMessage(calculate.error)}</Alert>}
    <Button disabled={!complete} busy={calculate.isPending} onClick={() => calculate.mutate()}>计算日结</Button>
  </>
}
