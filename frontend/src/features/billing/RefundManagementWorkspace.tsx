import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import '../../styles/features/billing-settlement.css'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { RefundItemPreCheckView } from '../../shared/api/billingApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import { BillingQueue, BillingTimeline, money } from './BillingShared'
import { requireRefundPreCheck, requireRefundStatement } from './refundVerification'

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  CASH: '现金',
  WECHAT: '微信支付',
  ALIPAY: '支付宝',
  BANK_CARD: '银行卡',
  MEDICAL_INSURANCE: '医保支付',
  INTERNAL_TRANSFER: '内部转账',
  SELF_PAY: '自费',
  OTHER: '其他',
}

function paymentMethodText(code?: string): string {
  if (!code) return '—'
  return PAYMENT_METHOD_NAMES[code] || code
}

export function RefundManagementWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [queueTab, setQueueTab] = useState<'PENDING_REFUND' | 'SETTLED'>('PENDING_REFUND')
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
  const filteredQueueItems = useMemo(() => {
    const list = worklist.data ?? []
    return list.filter((item) => item.status === queueTab)
  }, [worklist.data, queueTab])

  useEffect(() => {
    if (!linkedEncounterId || !worklist.data) return
    const target = worklist.data.find((item) => item.encounterId === linkedEncounterId)
    if (target) {
      if (target.status === 'SETTLED') setQueueTab('SETTLED')
      setEncounterId(target.encounterId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, searchParams, setSearchParams, worklist.data])

  useEffect(() => {
    if (linkedEncounterId) return
    if (!encounterId && filteredQueueItems.length) setEncounterId(filteredQueueItems[0].encounterId)
    if (encounterId && filteredQueueItems.length && !filteredQueueItems.some((item) => item.encounterId === encounterId)) {
      setEncounterId(filteredQueueItems[0].encounterId)
    }
  }, [encounterId, linkedEncounterId, filteredQueueItems])

  const selected = worklist.isSuccess ? worklist.data.find((item) => item.encounterId === encounterId) : undefined

  // 1. 账户账单明细查询
  const statement = useQuery({
    queryKey: ['billing-statement', encounterId, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => requireRefundStatement(await api.billing.statement(encounterId), encounterId, selected!.accountId!),
    enabled: Boolean(encounterId && selected?.accountId),
  })

  // 2. 跨科室退费防损与协同审批前置检查查询
  const preCheck = useQuery({
    queryKey: ['refund-precheck', encounterId, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => requireRefundPreCheck(await api.billing.refundPreCheck(encounterId), encounterId, selected!.accountId!),
    enabled: Boolean(encounterId && selected?.accountId),
  })

  const verifiedStatement = statement.isSuccess ? statement.data : undefined
  const verifiedPreCheck = preCheck.isSuccess ? preCheck.data : undefined
  const verificationReady = Boolean(selected?.accountId && verifiedStatement && verifiedPreCheck
    && !worklist.isFetching && !statement.isFetching && !preCheck.isFetching
    && verifiedStatement.currencyCode === verifiedPreCheck.currencyCode)

  useEffect(() => { setReason(''); setSelectedChargeItemIds([]); setPaymentId('') },
    [encounterId, clinicalContext.organization.id, clinicalContext.department.id])

  const refundablePayments = useMemo(() => {
    return verifiedStatement?.payments.filter((item) => item.paymentType === 'PAYMENT'
      && verifiedPreCheck?.refundablePayments.some((payment) => payment.paymentId === item.id && payment.refundableAmount > 0)) ?? []
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

  useEffect(() => {
    if (refundMode === 'DIRECT') {
      if (selectedItemsTotalAmount > 0) {
        setAmount(selectedItemsTotalAmount.toFixed(2))
      } else {
        setAmount('')
      }
    } else {
      setAmount(maximumStandardRefund > 0 ? maximumStandardRefund.toFixed(2) : '')
    }
  }, [refundMode, selectedItemsTotalAmount, verifiedPreCheck?.refundableAmount, maximumStandardRefund])

  const handleAmountBlur = () => {
    const val = Number(amount)
    if (Number.isFinite(val) && val > 0) {
      setAmount(val.toFixed(2))
    }
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId, clinicalContext.organization.id, clinicalContext.department.id] }),
      queryClient.invalidateQueries({ queryKey: ['refund-precheck', encounterId, clinicalContext.organization.id, clinicalContext.department.id] }),
    ])
  }

  // 常规退费：药房已实物退药形成负余额
  const refund = useMutation({
    mutationFn: () => {
      if (!canExecuteStandardRefund) throw new Error('退款资料尚未核实或金额、原因不完整')
      return api.billing.createRefundOrder(paymentId, {
        idempotencyKey: `REFUND-${crypto.randomUUID()}`,
        amount: Number(amount),
        reason: reason.trim(),
        terminalCode: 'CASHIER-WEB',
      })
    },
    onSuccess: async () => {
      setAmount('')
      await refresh()
    },
  })

  // 直接退费：未发药未执行医嘱误收费直接退款（自动账务冲正、逆向作废发药任务、发票红冲）
  const directRefund = useMutation({
    mutationFn: () => {
      if (!canExecuteDirectRefund) throw new Error('请核实可退项目、原支付剩余金额与退款原因')
      return api.billing.directRefund(paymentId, {
        idempotencyKey: `DIR-REF-${crypto.randomUUID()}`,
        refundAmount: Number(amount),
        reason: reason.trim(),
        terminalCode: 'CASHIER-WEB',
        chargeItemIds: selectedChargeItemIds,
      })
    },
    onSuccess: async () => {
      setAmount('')
      await refresh()
    },
  })

  const error = worklist.error || statement.error || preCheck.error || refund.error || directRefund.error
  const currency = verifiedStatement?.currencyCode ?? selected?.currencyCode ?? 'CNY'
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
    setSelectedChargeItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    )
  }

  const handleSelectAllAllowed = () => {
    if (!verifiedPreCheck?.items) return
    const allAllowed = verifiedPreCheck.items
      .filter((item) => item.allowed)
      .map((item) => String(item.chargeItemId))
    setSelectedChargeItemIds(allAllowed)
  }

  return <>
    <PageHeader
      eyebrow="收费管理"
      title="退费管理"
      description={`临床-医技-药房协同审批闭环与退费防损管理 · 当前机构: ${clinicalContext.organization.name}（${clinicalContext.department.name}）`}
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>}
    />
    {error && <Alert tone="error">{errorMessage(error)}</Alert>}

    {worklist.isPending ? <LoadingState label="正在加载退费队列…" /> : worklist.isError ?
      <EmptyState icon="billing" title="退费队列加载失败" copy="无法确认当前待退费记录，请重新加载。"
        action={<Button onClick={() => void worklist.refetch()}>重新加载退费队列</Button>} /> : <div className="billing-refund-workspace">
      <div>
        <div className="billing-refund-queue-tabs">
          <button
            type="button"
            className={`billing-refund-queue-tab ${queueTab === 'PENDING_REFUND' ? 'is-active' : ''}`}
            onClick={() => setQueueTab('PENDING_REFUND')}
          >
            待退费队列 ({worklist.data?.filter((i) => i.status === 'PENDING_REFUND').length ?? 0})
          </button>
          <button
            type="button"
            className={`billing-refund-queue-tab ${queueTab === 'SETTLED' ? 'is-active' : ''}`}
            onClick={() => setQueueTab('SETTLED')}
          >
            已收费就诊 ({worklist.data?.filter((i) => i.status === 'SETTLED').length ?? 0})
          </button>
        </div>
        <BillingQueue
          title={queueTab === 'PENDING_REFUND' ? '待退费患者' : '已结算就诊（误收费退款）'}
          items={filteredQueueItems}
          selectedId={encounterId}
          onSelect={setEncounterId}
          emptyTitle="暂无符合就诊"
          emptyCopy={queueTab === 'PENDING_REFUND' ? '药房实物退药核收后会进入此队列。' : '暂无已收费结算记录。'}
        />
      </div>

      <Panel className="billing-refund-detail">
        <header className="billing-section-head">
          <div>
            <h2>协同审批与原收费记录</h2>
            <span>{selected ? `患者 ${selected.residentName} · 就诊 ${selected.encounterId}` : '请选择就诊'}</span>
          </div>
        </header>

        {!selected ? (
          <EmptyState icon="billing" title="请选择就诊患者" copy="在左侧队列中选择就诊以进行跨科室协同审批检查与退款办理。" />
        ) : !selected.accountId ? (
          <EmptyState icon="billing" title="暂无费用账户" copy="当前就诊未形成费用账户。" />
        ) : statement.isFetching || preCheck.isFetching ? (
          <LoadingState label="正在进行临床-药房-医技协同退费前置检查…" />
        ) : !verificationReady ? (
          <EmptyState icon="billing" title="退费资料未核实" copy="账单或协同核验未成功，不能判断是否允许退款。"
            action={<Button onClick={() => void refresh()}>重新核验退费资料</Button>} />
        ) : (
          <>
            {/* 1. 临床-医技-药房-退费协同审批防损卡片 */}
            <div className={`billing-collaboration-card ${isBlocked ? 'billing-collaboration-card--blocked' : isPartial ? '' : 'billing-collaboration-card--allowed'}`}>
              <div className="billing-collaboration-header">
                <div className="billing-collaboration-header-left">
                  <h3>
                    <span>协同审批防损门禁</span>
                    {isBlocked ? (
                      <StatusBadge tone="danger">⛔ 协同校验阻断 · 严禁直接退费</StatusBadge>
                    ) : isPartial ? (
                      <StatusBadge tone="warning">部分项目可退 · 请逐项核对</StatusBadge>
                    ) : !verifiedPreCheck?.eligibleForRefund ? (
                      <StatusBadge tone="warning">项目核验通过 · 未满足退款条件</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">✅ 协同校验通过 · 允许直接退费</StatusBadge>
                    )}
                  </h3>
                </div>
                <div>
                  <Button variant="secondary" size="sm" onClick={handleSelectAllAllowed}>
                    全选允许退款项
                  </Button>
                </div>
              </div>

              {isBlocked ? (
                <div className="billing-collaboration-notice billing-collaboration-notice--blocked">
                  <strong>【退费防损硬阻断】</strong>
                  {verifiedPreCheck?.summaryNotice || '核验结果为阻断，接口未提供汇总说明。'}
                </div>
              ) : (
                <div className={`billing-collaboration-notice ${isPartial ? '' : 'billing-collaboration-notice--allowed'}`}>
                  <strong>【协同放行指引】</strong>
                  {verifiedPreCheck?.summaryNotice || '接口未提供汇总说明，请核对逐项核验结果。'}
                </div>
              )}

              <div className="billing-collaboration-table-wrap">
                <table className="billing-collaboration-table">
                  <thead>
                    <tr>
                      <th style={{ width: '3rem', textAlign: 'center' }}>选择</th>
                      <th>收费项目 / 单据编码</th>
                      <th>项目类别</th>
                      <th>单价 × 数量</th>
                      <th>金额</th>
                      <th>协同执行状态</th>
                      <th>防损指引 / 阻断说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verifiedPreCheck?.items ?? []).map((item: RefundItemPreCheckView) => {
                      const isSelected = selectedChargeItemIds.includes(String(item.chargeItemId))
                      return (
                        <tr key={item.chargeItemId} style={{ opacity: item.allowed ? 1 : 0.85 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!item.allowed}
                              onChange={() => handleToggleItem(String(item.chargeItemId), item.allowed)}
                            />
                          </td>
                          <td>
                            <div className="billing-collaboration-item-title">
                              <strong>{item.itemName}</strong>
                              <span className="billing-collaboration-item-code">{item.itemCode} · 单据:{item.documentNo || item.sourceId}</span>
                            </div>
                          </td>
                          <td>
                            <StatusBadge tone="neutral">
                              {item.sourceType === 'MEDICATION_REQUEST' ? '药品处方'
                                : item.sourceType === 'SERVICE_REQUEST' ? '检验检查'
                                : item.sourceType === 'TREATMENT' ? '治疗处置' : '诊疗服务'}
                            </StatusBadge>
                          </td>
                          <td>{item.quantity} {item.unitCode}</td>
                          <td><strong>{money(item.totalAmount, currency)}</strong></td>
                          <td>
                            <StatusBadge tone={item.statusTone as any}>
                              {item.statusBadgeText}
                            </StatusBadge>
                          </td>
                          <td>
                            {item.blockReason ? (
                              <div className="billing-collaboration-guidance">
                                ⚠ {item.blockReason}
                              </div>
                            ) : (
                              <StatusBadge tone={item.allowed ? 'success' : 'warning'}>
                                {item.allowed ? '✓ 允许直接退费' : '不允许直接退费，未提供阻断说明'}
                              </StatusBadge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. 费用账务数据 */}
            <div className="billing-metrics">
              <div><span>原收费总额</span><strong>{money(verifiedStatement?.chargeAmount ?? 0, currency)}</strong></div>
              <div><span>实收总额</span><strong>{money(verifiedStatement?.paymentAmount ?? 0, currency)}</strong></div>
              <div><span>已退款</span><strong>{money(verifiedStatement?.refundAmount ?? 0, currency)}</strong></div>
              <div className="is-open">
                <span>选中项退款金额</span>
                <strong>{money(selectedItemsTotalAmount, currency)}</strong>
              </div>
            </div>

            <section className="billing-table-section">
              <header>
                <div>
                  <h3>可关联原支付明细</h3>
                  <span>{refundablePayments.length} 笔</span>
                </div>
              </header>
              <div className="billing-table-wrap">
                <table className="billing-table billing-table--payments">
                  <thead>
                    <tr>
                      <th>支付单号</th><th>支付方式</th><th>金额</th><th>支付时间</th><th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundablePayments.map((item) => (
                      <tr
                        key={item.id}
                        className={item.id === paymentId ? 'is-selected' : ''}
                        onClick={() => setPaymentId(item.id)}
                      >
                        <td><strong>{item.paymentNo}</strong><code>{item.externalTransactionNo || item.id}</code></td>
                        <td>{paymentMethodText(item.paymentMethodCode)}</td>
                        <td>{money(item.amount, item.currencyCode)}</td>
                        <td>{new Date(item.paidAt).toLocaleString('zh-CN')}</td>
                        <td><StatusBadge tone="success">已支付</StatusBadge></td>
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
            <span>协同闭环原路退款</span>
          </div>
        </header>

        {!selected ? (
          <EmptyState icon="billing" title="请先选择就诊" copy="核对协同前置检查结果后在此办理退款。" />
        ) : !verificationReady ? (
          <EmptyState icon="billing" title="暂不能办理退款" copy="请先完成原收费账单与协同退费核验。" />
        ) : (
          <div className="billing-action-form billing-action-form--refund">
            <div className="billing-refund-mode-switch">
              <button
                type="button"
                className={`billing-refund-mode-btn ${refundMode === 'DIRECT' ? 'is-active' : ''}`}
                onClick={() => setRefundMode('DIRECT')}
              >
                未发药直接退款 (误收冲退)
              </button>
              <button
                type="button"
                className={`billing-refund-mode-btn ${refundMode === 'STANDARD' ? 'is-active' : ''}`}
                onClick={() => setRefundMode('STANDARD')}
              >
                常规负余额冲退 (药房退药)
              </button>
            </div>

            <FormField label="原支付记录">
              <Select
                value={paymentId}
                onChange={setPaymentId}
                showValue
                placeholder="暂无可选原支付"
                options={refundablePayments.map((item) => ({
                  value: item.id,
                  label: item.paymentNo,
                  secondaryText: `${paymentMethodText(item.paymentMethodCode)} · ${money(item.amount, item.currencyCode)}`,
                }))}
              />
            </FormField>

            {selectedPayment && (
              <div className="billing-refund-origin">
                <span>原支付金额（{paymentMethodText(selectedPayment.paymentMethodCode)}）</span>
                <strong>{money(selectedPayment.amount, selectedPayment.currencyCode)}</strong>
                <span>剩余可退金额 {money(refundableBalance, selectedPayment.currencyCode)}</span>
              </div>
            )}

            {refundMode === 'STANDARD' && (
              <div className="billing-refund-origin billing-refund-origin--negative">
                <span>当前待退负余额</span>
                <strong>{money(maximumStandardRefund, currency)}</strong>
              </div>
            )}

            <FormField label="退款金额">
              <div className="billing-refund-amount-input-wrap">
                <span className="billing-refund-amount-prefix" aria-hidden="true">¥</span>
                <input
                  aria-label="退款金额"
                  className="ui-field__control billing-refund-amount-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  onBlur={handleAmountBlur}
                />
              </div>
            </FormField>

            <FormField label="退款原因">
              <textarea
                className="ui-field__control"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>

            {refundMode === 'DIRECT' ? (
              <>
                {hasSelectedBlockedItem && (
                  <Alert tone="error">
                    当前勾选的项目中包含协同阻断项（如已发药或已出报告），严禁直接退款！
                  </Alert>
                )}
                {isBlocked && (
                  <Alert tone="warning">
                    注意：当前就诊存在阻断项，仅能对未发药/未执行的项目进行冲退。
                  </Alert>
                )}
                <Button
                  variant="danger"
                  disabled={!canExecuteDirectRefund}
                  busy={directRefund.isPending || refund.isPending}
                  onClick={() => directRefund.mutate()}
                >
                  确认未发药直接退款（逆向作废并红冲发票）
                </Button>
              </>
            ) : (
              <>
                {maximumStandardRefund <= 0 && (
                  <Alert tone="warning">
                    当前账户无待退负余额。如属误收费退费，请切换至【未发药直接退款】模式。
                  </Alert>
                )}
                <Button
                  variant="danger"
                  disabled={!canExecuteStandardRefund}
                  busy={directRefund.isPending || refund.isPending}
                  onClick={() => refund.mutate()}
                >
                  确认常规退款
                </Button>
              </>
            )}
          </div>
        )}
      </Panel>
    </div>}
  </>
}
