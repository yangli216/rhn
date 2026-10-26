import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import '../../styles/features/billing-settlement.css'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { BillingWorkItem, RefundItemPreCheckView } from '../../shared/api/billingApi'
import { Tabs, Alert, Button, DateRangePicker, EmptyState, FormField, LoadingState, PageHeader, Pagination, Panel, StatusBadge } from '../../shared/ui'
import { getLast7DaysRange, type DateRange } from '../../shared/utils/dateRange'
import { semanticTone } from '../../shared/presentation'
import { BillingQueue, BillingTimeline, money } from './BillingShared'
import { requireRefundPreCheck, requireRefundStatement } from './refundVerification'
import { formatLocaleDateTime } from '../../shared/format'
import { orderChargeLineIds } from '../../shared/billing/orderChargeLines'

const SETTLED_PAGE_SIZE = 20
const KEYWORD_DEBOUNCE_MS = 300

export function RefundManagementWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [queueTab, setQueueTabState] = useState<'PENDING_REFUND' | 'SETTLED'>('PENDING_REFUND')
  const [encounterId, setEncounterId] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [refundMode, setRefundMode] = useState<'DIRECT' | 'STANDARD'>('DIRECT')
  const [selectedChargeItemIds, setSelectedChargeItemIds] = useState<string[]>([])

  const worklist = useQuery({
    queryKey: ['billing-worklist', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.billing.worklist()
      if (!Array.isArray(data)) throw new Error('退费队列返回无效，请重新加载')
      return data
    },
  })
  const pendingItems = useMemo(
    () => (worklist.data ?? []).filter((item) => item.status === 'PENDING_REFUND'), [worklist.data])

  // 已收费就诊走服务端分页；筛选（日期、关键字）变化回到第 1 页，关键字防抖后才请求。
  const [settledRange, setSettledRange] = useState<DateRange>(getLast7DaysRange)
  const [keywordInput, setKeywordInput] = useState('')
  const [settledKeyword, setSettledKeyword] = useState('')
  const [settledPage, setSettledPage] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledKeyword(keywordInput.trim())
      setSettledPage(0)
    }, KEYWORD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [keywordInput])
  const settled = useQuery({
    queryKey: ['billing-settled-encounters', clinicalContext.organization.id, clinicalContext.department.id,
      settledRange.from, settledRange.to, settledKeyword, settledPage],
    queryFn: () => api.billing.settledEncounters({
      dateFrom: settledRange.from, dateTo: settledRange.to,
      ...(settledKeyword ? { query: settledKeyword } : {}),
      page: settledPage, size: SETTLED_PAGE_SIZE,
    }),
    enabled: queueTab === 'SETTLED',
    placeholderData: keepPreviousData,
  })
  const settledItems = settled.data?.content

  // URL 带 encounterId：先在待退费里找，找不到再用 encounterId 精确定位已结算就诊。
  const linkedPending = linkedEncounterId && worklist.data
    ? pendingItems.find((item) => item.encounterId === linkedEncounterId) : undefined
  const linkedSettled = useQuery({
    queryKey: ['billing-settled-encounters', 'linked', clinicalContext.organization.id, clinicalContext.department.id,
      linkedEncounterId],
    queryFn: () => api.billing.settledEncounters({ encounterId: linkedEncounterId!, page: 0, size: 1 }),
    enabled: Boolean(linkedEncounterId && worklist.isSuccess && !linkedPending),
  })

  const [selectedItem, setSelectedItem] = useState<BillingWorkItem>()
  const selectItem = (item: BillingWorkItem) => { setEncounterId(item.encounterId); setSelectedItem(item) }
  const setQueueTab = (tab: 'PENDING_REFUND' | 'SETTLED') => {
    if (tab === queueTab) return
    setQueueTabState(tab)
    setEncounterId('')
    setSelectedItem(undefined)
  }

  useEffect(() => {
    if (!linkedEncounterId) return
    let target: BillingWorkItem | undefined
    if (linkedPending) {
      target = linkedPending
    } else if (linkedSettled.isSuccess) {
      target = linkedSettled.data.content.find((item) => item.encounterId === linkedEncounterId)
    } else if (!linkedSettled.isError) {
      return
    }
    if (target) {
      setQueueTabState(target.status === 'SETTLED' ? 'SETTLED' : 'PENDING_REFUND')
      setEncounterId(target.encounterId)
      setSelectedItem(target)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, linkedPending, linkedSettled.isSuccess, linkedSettled.isError, linkedSettled.data,
    searchParams, setSearchParams])

  // 仅在无选中项时默认选第一条（首次进入或切换 tab 后）；翻页、改筛选不改变当前选中。
  const queueItems = queueTab === 'PENDING_REFUND' ? pendingItems : settledItems
  useEffect(() => {
    if (linkedEncounterId || encounterId || !queueItems?.length) return
    setEncounterId(queueItems[0].encounterId)
    setSelectedItem(queueItems[0])
  }, [encounterId, linkedEncounterId, queueItems])

  // 当前 tab 数据源里的最新对象优先；翻页后不在本页时沿用缓存的选中项，详情不丢。
  const selected = encounterId
    ? (queueItems?.find((item) => item.encounterId === encounterId)
      ?? (selectedItem?.encounterId === encounterId ? selectedItem : undefined))
    : undefined

  // 1. 账户账单明细查询
  const statement = useQuery({
    queryKey: ['billing-statement', encounterId, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => requireRefundStatement(await api.billing.statement(encounterId), encounterId, selected!.accountId!),
    enabled: Boolean(encounterId && selected?.accountId),
  })

  // 2. 跨科室退费防损与协同审批前置检查查询（不依赖费用账户是否存在）
  const preCheck = useQuery({
    queryKey: ['refund-precheck', encounterId, clinicalContext.organization.id, clinicalContext.department.id, selected?.accountId],
    queryFn: async () => requireRefundPreCheck(
      await api.billing.refundPreCheck(encounterId, selected?.accountId), encounterId, selected?.accountId),
    enabled: Boolean(encounterId),
  })

  const verifiedStatement = statement.isSuccess ? statement.data : undefined
  const verifiedPreCheck = preCheck.isSuccess ? preCheck.data : undefined
  const statementRequired = Boolean(selected?.accountId)
  const verificationReady = Boolean(verifiedPreCheck
    && !worklist.isFetching && !preCheck.isFetching && !statement.isFetching
    && (!statementRequired || verifiedStatement)
    && (!verifiedStatement || verifiedStatement.currencyCode === verifiedPreCheck.currencyCode))

  useEffect(() => { setReason(''); setSelectedChargeItemIds([]); setPaymentId('') },
    [encounterId, clinicalContext.organization.id, clinicalContext.department.id])

  const refundablePayments = useMemo<{
    id: string
    paymentNo: string
    paymentMethodCode: string
    paymentMethodCodeText?: string
    amount: number
    currencyCode: string
    paidAt: string
    externalTransactionNo?: string
    refundableAmount: number
  }[]>(() => {
    const candidates = verifiedPreCheck?.refundablePayments.filter((payment) => payment.refundableAmount > 0) ?? []
    if (verifiedStatement) {
      return verifiedStatement.payments
        .filter((item) => item.paymentType === 'PAYMENT'
          && candidates.some((payment) => payment.paymentId === item.id))
        .map((item) => ({
          id: item.id,
          paymentNo: item.paymentNo,
          paymentMethodCode: item.paymentMethodCode,
          paymentMethodCodeText: item.paymentMethodCodeText,
          amount: item.amount,
          currencyCode: item.currencyCode,
          paidAt: item.paidAt,
          externalTransactionNo: item.externalTransactionNo,
          refundableAmount: candidates.find((payment) => payment.paymentId === item.id)?.refundableAmount ?? 0,
        }))
    }
    // 无费用账户时以退费核验返回的原支付候选为准，账户不再是退款前置条件。
    return candidates.map((payment) => ({
      id: payment.paymentId,
      paymentNo: payment.paymentNo,
      paymentMethodCode: payment.paymentMethodCode,
      paymentMethodCodeText: payment.paymentMethodCodeText,
      amount: payment.amount,
      currencyCode: payment.currencyCode,
      paidAt: payment.paidAt,
      refundableAmount: payment.refundableAmount,
    }))
  }, [verifiedStatement, verifiedPreCheck])

  useEffect(() => {
    if (paymentId && !refundablePayments.some((item) => item.id === paymentId)) setPaymentId('')
    if (!paymentId && refundablePayments.length) setPaymentId(refundablePayments[0].id)
  }, [paymentId, refundablePayments])

  // 默认选中所有前置校验允许退款的项目
  useEffect(() => {
    if (verifiedPreCheck?.items) {
      const allowedIds = verifiedPreCheck.items
        .filter((item) => item.allowed)
        .map((item) => String(item.chargeItemId))
      setSelectedChargeItemIds(allowedIds)
    } else {
      setSelectedChargeItemIds([])
    }
  }, [verifiedPreCheck])

  // 根据当前选择的模式及项目自动计算退费金额
  const maximumStandardRefund = Math.abs(Math.min(verifiedStatement?.accountBalance ?? 0, 0))
  const selectedItemsTotalAmount = useMemo(() => {
    if (!verifiedPreCheck?.items) return 0
    return verifiedPreCheck.items
      .filter((item) => selectedChargeItemIds.includes(String(item.chargeItemId)))
      .reduce((sum, item) => sum + item.totalAmount, 0)
  }, [verifiedPreCheck, selectedChargeItemIds])

  // 无费用账单时退费核验是唯一口径：原收费总额取全部收费项，而不是只累加允许退费的项。
  const verifiedChargeTotal = useMemo(
    () => verifiedPreCheck?.items.reduce((sum, item) => sum + item.totalAmount, 0) ?? 0,
    [verifiedPreCheck],
  )
  const verifiedRefundedTotal = useMemo(
    () => verifiedPreCheck?.refundablePayments.reduce((sum, payment) => sum + payment.refundedAmount, 0) ?? 0,
    [verifiedPreCheck],
  )

  // 直接退费默认取 min(选中项金额, 当前原支付剩余可退)，超出部分需从其它支付或医保冲销退还
  const currentPaymentRefundable = verifiedPreCheck?.refundablePayments.find((item) => item.paymentId === paymentId)?.refundableAmount
  const directDefaultAmount = currentPaymentRefundable === undefined
    ? selectedItemsTotalAmount
    : Math.min(selectedItemsTotalAmount, currentPaymentRefundable)
  useEffect(() => {
    if (refundMode === 'DIRECT') {
      setAmount(directDefaultAmount > 0 ? directDefaultAmount.toFixed(2) : '')
    } else {
      setAmount(maximumStandardRefund > 0 ? maximumStandardRefund.toFixed(2) : '')
    }
  }, [refundMode, directDefaultAmount, maximumStandardRefund])

  const handleAmountBlur = () => {
    const val = Number(amount)
    if (Number.isFinite(val) && val > 0) {
      setAmount(val.toFixed(2))
    }
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-settled-encounters'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId, clinicalContext.organization.id, clinicalContext.department.id] }),
      queryClient.invalidateQueries({ queryKey: ['refund-precheck', encounterId, clinicalContext.organization.id, clinicalContext.department.id] }),
    ])
  }

  // 每个退费意图固定一个幂等键：超时重试复用同一键，只有成功或支付/金额/项目/原因变化后才换新键
  const refundKeyRef = useRef<{ fingerprint: string; key: string } | null>(null)
  const refundKey = (prefix: string, ...parts: unknown[]) => {
    const fingerprint = JSON.stringify([prefix, ...parts])
    if (refundKeyRef.current?.fingerprint !== fingerprint) {
      refundKeyRef.current = { fingerprint, key: `${prefix}-${crypto.randomUUID()}` }
    }
    return refundKeyRef.current.key
  }

  // 常规退费：药房已实物退药形成负余额
  const refund = useMutation({
    mutationFn: () => {
      if (!canExecuteStandardRefund) throw new Error('退款资料尚未核实或金额、原因不完整')
      return api.billing.createRefundOrder(paymentId, {
        idempotencyKey: refundKey('REFUND', paymentId, amount, reason.trim()),
        amount: Number(amount),
        reason: reason.trim(),
        terminalCode: 'CASHIER-WEB',
      })
    },
    onSuccess: async () => {
      refundKeyRef.current = null
      setAmount('')
      await refresh()
    },
  })

  // 直接退费：未发药未执行医嘱误收费直接退款（自动账务冲正、逆向作废发药任务、发票红冲）
  const directRefund = useMutation({
    mutationFn: () => {
      if (!canExecuteDirectRefund) throw new Error('请核实可退项目、原支付剩余金额与退款原因')
      return api.billing.directRefund(paymentId, {
        idempotencyKey: refundKey('DIR-REF', paymentId, amount, reason.trim(), [...selectedChargeItemIds].sort()),
        refundAmount: Number(amount),
        reason: reason.trim(),
        terminalCode: 'CASHIER-WEB',
        chargeItemIds: selectedChargeItemIds,
      })
    },
    onSuccess: async () => {
      refundKeyRef.current = null
      setAmount('')
      await refresh()
    },
  })

  const error = worklist.error || settled.error || linkedSettled.error || statement.error || preCheck.error || refund.error || directRefund.error
  const currency = verifiedStatement?.currencyCode ?? verifiedPreCheck?.currencyCode ?? selected?.currencyCode ?? 'CNY'
  const selectedPayment = refundablePayments.find((item) => item.id === paymentId)

  const refundableBalance = verifiedPreCheck?.refundablePayments.find((item) => item.paymentId === paymentId)?.refundableAmount
  const isPartial = verifiedPreCheck?.overallDecision === 'PARTIAL'
  const isBlocked = verifiedPreCheck?.overallDecision === 'BLOCKED'
  const hasSelectedBlockedItem = useMemo(() => {
    if (!verifiedPreCheck?.items) return false
    return verifiedPreCheck.items.some((item) => selectedChargeItemIds.includes(String(item.chargeItemId)) && !item.allowed)
  }, [verifiedPreCheck, selectedChargeItemIds])

  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
    && refundableBalance !== undefined && Number(amount) <= refundableBalance && (
    refundMode === 'DIRECT'
      ? Number(amount) <= (selectedPayment?.amount ?? 0)
      : Number(amount) <= maximumStandardRefund
  )

  const canExecuteStandardRefund = Boolean(verificationReady && selectedPayment && validAmount && reason.trim())
  const canExecuteDirectRefund = Boolean(
    verificationReady && verifiedPreCheck?.eligibleForRefund
    && ['ALLOWED', 'PARTIAL'].includes(verifiedPreCheck.overallDecision)
    && selectedPayment &&
    validAmount &&
    reason.trim() &&
    !hasSelectedBlockedItem &&
    selectedChargeItemIds.length > 0
    && selectedChargeItemIds.every((id) => verifiedPreCheck.items.some((item) => String(item.chargeItemId) === id && item.allowed))
    && Number(amount) <= selectedItemsTotalAmount
  )

  const handleToggleItem = (itemId: string, allowed: boolean) => {
    if (!allowed) return
    // 检查申请的多行收费须整单退费：勾选或取消一行时同步同一申请的其余可退行。
    const lineIds = orderChargeLineIds((verifiedPreCheck?.items ?? []).filter((item) => item.allowed).map((item) => ({
      id: String(item.chargeItemId), sourceType: item.sourceType, sourceId: item.sourceId,
    })), itemId)
    setSelectedChargeItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => !lineIds.includes(id)) : [...new Set([...prev, ...lineIds])]
    )
  }

  const allowedItemIds = useMemo(
    () => (verifiedPreCheck?.items ?? []).filter((item) => item.allowed).map((item) => String(item.chargeItemId)),
    [verifiedPreCheck],
  )
  const selectedAllowedCount = allowedItemIds.filter((id) => selectedChargeItemIds.includes(id)).length
  const allAllowedSelected = allowedItemIds.length > 0 && selectedAllowedCount === allowedItemIds.length
  const handleToggleAllAllowed = () => {
    setSelectedChargeItemIds(allAllowedSelected ? [] : allowedItemIds)
  }

  const exceedsPaymentBalance = refundMode === 'DIRECT' && refundableBalance !== undefined
    && selectedItemsTotalAmount > refundableBalance
  const disabledReason = (() => {
    if (refundMode === 'DIRECT') {
      if (!verifiedPreCheck?.eligibleForRefund) return '当前就诊暂不满足退费条件'
      if (!selectedChargeItemIds.length) return '请勾选要退费的项目'
    } else if (maximumStandardRefund <= 0) return '当前账户没有待退负余额'
    if (!selectedPayment) return '请在原支付明细中选择一笔支付'
    if (!validAmount) return '请填写有效的退款金额（不超过原支付剩余可退）'
    if (!reason.trim()) return '请填写退款原因'
    return ''
  })()
  const reasonPresets = ['误收费', '患者取消治疗', '重复收费']
  const decisionBadge = isBlocked ? { tone: 'danger' as const, text: '不可退' }
    : isPartial ? { tone: 'warning' as const, text: '部分可退' }
      : !verifiedPreCheck?.eligibleForRefund ? { tone: 'warning' as const, text: '暂不可退' }
        : { tone: 'success' as const, text: '可退' }
  const showSummaryNotice = Boolean(verifiedPreCheck) && (decisionBadge.text !== '可退')



  return <>
    <PageHeader
      eyebrow="收费管理"
      title="退费管理"
      description="核对原收费项目与原支付，办理误收费退款或退药后退费"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>}
    />
    {error && <Alert tone="error">{errorMessage(error)}</Alert>}

    {worklist.isPending ? <LoadingState label="正在加载退费队列…" /> : worklist.isError ?
      <EmptyState icon="billing" title="退费队列加载失败" copy="无法确认当前待退费记录，请重新加载。"
        action={<Button onClick={() => void worklist.refetch()}>重新加载退费队列</Button>} /> : <div className="billing-refund-workspace">
        {queueTab === 'PENDING_REFUND' ? (
          <BillingQueue
            key="PENDING_REFUND"
            header={
              <Tabs label="退费队列" value={queueTab} onChange={setQueueTab} items={[
                { value: 'PENDING_REFUND', label: `待退费队列 (${pendingItems.length})` },
                { value: 'SETTLED', label: `已收费就诊${settled.data ? ` (${settled.data.totalElements})` : ''}` },
              ]} />
            }
            items={pendingItems}
            selectedId={encounterId}
            onSelect={(id) => { const item = pendingItems.find((value) => value.encounterId === id); if (item) selectItem(item) }}
            emptyTitle="暂无符合就诊"
            emptyCopy="药房实物退药核收后会进入此队列。"
          />
        ) : (
          <BillingQueue
            key="SETTLED"
            header={
              <Tabs label="退费队列" value={queueTab} onChange={setQueueTab} items={[
                { value: 'PENDING_REFUND', label: `待退费队列 (${pendingItems.length})` },
                { value: 'SETTLED', label: `已收费就诊${settled.data ? ` (${settled.data.totalElements})` : ''}` },
              ]} />
            }
            items={settledItems ?? []}
            selectedId={encounterId}
            onSelect={(id) => { const item = settledItems?.find((value) => value.encounterId === id); if (item) selectItem(item) }}
            emptyTitle={settled.isPending ? '正在加载…' : '暂无符合就诊'}
            emptyCopy={settled.isPending ? '正在查询已结算就诊。' : '所选日期范围内暂无符合条件的已结算就诊。'}
            serverFiltered
            keyword={keywordInput}
            onKeywordChange={setKeywordInput}
            toolbar={<div className="billing-queue-filters">
              <DateRangePicker compact value={settledRange}
                onChange={(range) => { setSettledRange(range); setSettledPage(0) }}
                startAriaLabel="已结算就诊开始日期" endAriaLabel="已结算就诊结束日期" />
            </div>}
            footer={settled.data && <Pagination mode="simple" className="billing-queue-pagination" label="已结算就诊分页"
              page={settled.data.page} totalPages={settled.data.totalPages} total={settled.data.totalElements}
              onChange={setSettledPage} />}
          />
        )}

      <Panel className="billing-refund-detail">
        <header className="billing-section-head">
          <div>
            <h2>退费项目</h2>
            <span>{selected ? `患者 ${selected.residentName} · 就诊 ${selected.encounterId}` : '请选择就诊'}</span>
          </div>
          {selected && verificationReady && <StatusBadge tone={decisionBadge.tone}>{decisionBadge.text}</StatusBadge>}
        </header>

        {!selected ? (
          <EmptyState icon="billing" title="请选择就诊患者" copy="在左侧队列中选择就诊后核对退费项目并办理退款。" />
        ) : statement.isFetching || preCheck.isFetching ? (
          <LoadingState label="正在核验退费资料…" />
        ) : !verificationReady ? (
          <EmptyState icon="billing" title="退费资料未核实" copy="账单或退费核验未成功，不能判断是否允许退款。"
            action={<Button onClick={() => void refresh()}>重新核验退费资料</Button>} />
        ) : (
          <>
            <div className="billing-refund-metrics">
              <div><span>原收费总额</span><strong>{money(verifiedStatement?.chargeAmount ?? verifiedChargeTotal, currency)}</strong></div>
              <div><span>实收总额</span><strong>{money(verifiedStatement?.paymentAmount ?? verifiedPreCheck?.totalPaidAmount ?? 0, currency)}</strong></div>
              <div><span>已退款</span><strong>{money(verifiedStatement?.refundAmount ?? verifiedRefundedTotal, currency)}</strong></div>
              <div className="is-open"><span>选中项金额</span><strong>{money(selectedItemsTotalAmount, currency)}</strong></div>
            </div>

            {showSummaryNotice && (
              <div className={`billing-collaboration-notice ${isBlocked ? 'billing-collaboration-notice--blocked' : ''}`}>
                {verifiedPreCheck?.summaryNotice || '接口未提供汇总说明，请核对逐项核验结果。'}
              </div>
            )}

            <div className="billing-collaboration-table-wrap">
              <table className="billing-collaboration-table">
                <thead>
                  <tr>
                    <th className="billing-refund-col-check">
                      <input
                        type="checkbox"
                        aria-label="全选可退项"
                        checked={allAllowedSelected}
                        disabled={allowedItemIds.length === 0}
                        ref={(node) => { if (node) node.indeterminate = selectedAllowedCount > 0 && !allAllowedSelected }}
                        onChange={handleToggleAllAllowed}
                      />
                    </th>
                    <th>收费项目</th>
                    <th>项目类别</th>
                    <th className="billing-refund-col-num">数量</th>
                    <th className="billing-refund-col-num">金额</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {(verifiedPreCheck?.items ?? []).map((item: RefundItemPreCheckView) => {
                    const isSelected = selectedChargeItemIds.includes(String(item.chargeItemId))
                    const docNo = item.documentNo || item.sourceId
                    return (
                      <tr key={item.chargeItemId} className={item.allowed ? '' : 'is-disabled'}>
                        <td className="billing-refund-col-check">
                          <input
                            type="checkbox"
                            aria-label={`选择 ${item.itemName}`}
                            checked={isSelected}
                            disabled={!item.allowed}
                            onChange={() => handleToggleItem(String(item.chargeItemId), item.allowed)}
                          />
                        </td>
                        <td>
                          <div className="billing-collaboration-item-title">
                            <strong>{item.itemName}</strong>
                            <span className="billing-collaboration-item-code" title={`${item.itemCode ?? ''} ${docNo ?? ''}`.trim()}>
                              {[item.itemCode, docNo].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusBadge tone="neutral">{item.sourceTypeText ?? item.sourceType}</StatusBadge>
                        </td>
                        <td className="billing-refund-col-num">{item.quantity} {item.unitCode}</td>
                        <td className="billing-refund-col-num"><strong>{money(item.totalAmount, currency)}</strong></td>
                        <td>
                          <StatusBadge tone={semanticTone(item.statusTone)}>{item.statusBadgeText}</StatusBadge>
                          {!item.allowed && (
                            <div className="billing-collaboration-guidance">
                              {item.blockReason || '未提供不可退说明'}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <section className="billing-table-section">
              <header>
                <div>
                  <h3>原支付明细</h3>
                  <span>{refundablePayments.length} 笔，点击选择退回的支付</span>
                </div>
              </header>
              <div className="billing-table-wrap">
                <table className="billing-table billing-table--payments">
                  <thead>
                    <tr>
                      <th className="billing-refund-col-check" />
                      <th>支付单号</th><th>支付方式</th><th>金额</th><th>剩余可退</th><th>支付时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundablePayments.map((item) => (
                      <tr
                        key={item.id}
                        className={item.id === paymentId ? 'is-selected' : ''}
                        onClick={() => setPaymentId(item.id)}
                      >
                        <td className="billing-refund-col-check">
                          <input type="radio" name="refund-payment" aria-label={`选择支付 ${item.paymentNo}`}
                            checked={item.id === paymentId} onChange={() => setPaymentId(item.id)} />
                        </td>
                        <td>
                          <strong>{item.paymentNo}</strong>
                          {item.externalTransactionNo && (
                            <span className="billing-refund-sub" title={item.externalTransactionNo}>
                              交易号 {item.externalTransactionNo}
                            </span>
                          )}
                        </td>
                        <td>{(item.paymentMethodCodeText ?? item.paymentMethodCode)}</td>
                        <td>{money(item.amount, item.currencyCode)}</td>
                        <td><strong>{money(item.refundableAmount, item.currencyCode)}</strong></td>
                        <td>{formatLocaleDateTime(item.paidAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {verifiedStatement && (
              <BillingTimeline
                invoices={verifiedStatement.invoices}
                payments={verifiedStatement.payments}
                currency={currency}
              />
            )}
          </>
        )}
      </Panel>

      <Panel className="billing-refund-action">
        <header className="billing-section-head">
          <div>
            <h2>退款办理</h2>
          </div>
        </header>

        {!selected ? (
          <EmptyState icon="billing" title="请先选择就诊" copy="核对退费项目后在此办理退款。" />
        ) : !verificationReady ? (
          <EmptyState icon="billing" title="暂不能办理退款" copy="请先完成原收费账单与退费核验。" />
        ) : (
          <div className="billing-action-form billing-action-form--refund">
            <div className="billing-refund-mode-switch">
              <button
                type="button"
                className={`billing-refund-mode-btn ${refundMode === 'DIRECT' ? 'is-active' : ''}`}
                onClick={() => setRefundMode('DIRECT')}
              >
                未执行退费
              </button>
              <button
                type="button"
                className={`billing-refund-mode-btn ${refundMode === 'STANDARD' ? 'is-active' : ''}`}
                onClick={() => setRefundMode('STANDARD')}
              >
                退药后退费
              </button>
            </div>

            <div className="billing-refund-origin">
              {selectedPayment ? <>
                <div>
                  <span>原支付</span>
                  <strong>{(selectedPayment.paymentMethodCodeText ?? selectedPayment.paymentMethodCode)} · {money(selectedPayment.amount, selectedPayment.currencyCode)}</strong>
                </div>
                <div>
                  <span>剩余可退</span>
                  <strong>{money(refundableBalance, selectedPayment.currencyCode)}</strong>
                </div>
              </> : <span>请在左侧原支付明细中选择一笔支付</span>}
            </div>

            {refundMode === 'STANDARD' && (
              <div className="billing-refund-origin billing-refund-origin--negative">
                <div>
                  <span>当前待退负余额</span>
                  <strong>{money(maximumStandardRefund, currency)}</strong>
                </div>
              </div>
            )}

            <FormField label="退款金额（元）">
              <input
                aria-label="退款金额"
                className="billing-refund-amount-input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onBlur={handleAmountBlur}
              />
            </FormField>
            {exceedsPaymentBalance && selectedPayment && (
              <p className="billing-refund-hint" role="note">
                {`选中项 ${money(selectedItemsTotalAmount, currency)} 超过该笔支付剩余可退 ${money(refundableBalance, selectedPayment.currencyCode)}，其余部分需从其它支付或医保冲销退还`}
              </p>
            )}

            <FormField label="退款原因">
              <textarea
                className="ui-field__control"
                placeholder="请填写退款原因"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
            <div className="billing-refund-presets" role="group" aria-label="常用退款原因">
              {reasonPresets.map((preset) => (
                <Button key={preset} variant="secondary" size="sm" onClick={() => setReason(preset)}>{preset}</Button>
              ))}
            </div>

            {refundMode === 'DIRECT' && hasSelectedBlockedItem && (
              <Alert tone="error">当前勾选的项目中包含不可退项，请取消勾选后再办理。</Alert>
            )}
            {(refundMode === 'DIRECT' ? !canExecuteDirectRefund : !canExecuteStandardRefund) && disabledReason && (
              <p className="billing-refund-hint billing-refund-hint--required" role="note">{disabledReason}</p>
            )}
            {refundMode === 'DIRECT' ? (
              <>
                <Button
                  variant="danger"
                  disabled={!canExecuteDirectRefund}
                  busy={directRefund.isPending || refund.isPending}
                  onClick={() => directRefund.mutate()}
                >
                  确认退费
                </Button>
                <p className="billing-refund-sub">适用于未发药、未执行的误收费项目；提交后自动冲正账务并红冲发票。</p>
              </>
            ) : (
              <>
                {maximumStandardRefund <= 0 && (
                  <p className="billing-refund-hint">当前账户无待退负余额。误收费退费请切换至“未执行退费”。</p>
                )}
                <Button
                  variant="danger"
                  disabled={!canExecuteStandardRefund}
                  busy={directRefund.isPending || refund.isPending}
                  onClick={() => refund.mutate()}
                >
                  确认退费
                </Button>
                <p className="billing-refund-sub">适用于药房已实物退药形成负余额的退费。</p>
              </>
            )}
          </div>
        )}
      </Panel>
    </div>}
  </>
}
