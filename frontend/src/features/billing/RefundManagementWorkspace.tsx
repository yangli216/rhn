import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { RefundItemPreCheckView } from '../../shared/api/billingApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import { BillingQueue, BillingTimeline, money } from './BillingShared'

export function RefundManagementWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [queueTab, setQueueTab] = useState<'PENDING_REFUND' | 'SETTLED'>('PENDING_REFUND')
  const [encounterId, setEncounterId] = useState('')
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('误收费退费，已核验未发药未执行')
  const [refundMode, setRefundMode] = useState<'DIRECT' | 'STANDARD'>('DIRECT')
  const [selectedChargeItemIds, setSelectedChargeItemIds] = useState<string[]>([])

  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
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

  const selected = worklist.data?.find((item) => item.encounterId === encounterId)

  // 1. 账户账单明细查询
  const statement = useQuery({
    queryKey: ['billing-statement', encounterId],
    queryFn: () => api.billing.statement(encounterId),
    enabled: Boolean(encounterId && selected?.accountId),
  })

  // 2. 跨科室退费防损与协同审批前置检查查询
  const preCheck = useQuery({
    queryKey: ['refund-precheck', encounterId],
    queryFn: () => api.billing.refundPreCheck(encounterId),
    enabled: Boolean(encounterId),
  })

  const refundablePayments = useMemo(() => {
    return statement.data?.payments.filter((item) => item.paymentType === 'PAYMENT') ?? []
  }, [statement.data])

  useEffect(() => {
    if (paymentId && !refundablePayments.some((item) => item.id === paymentId)) setPaymentId('')
    if (!paymentId && refundablePayments.length) setPaymentId(refundablePayments[0].id)
  }, [paymentId, refundablePayments])

  // 默认选中所有前置校验允许退款的项目
  useEffect(() => {
    if (preCheck.data?.items) {
      const allowedIds = preCheck.data.items
        .filter((item) => item.allowed)
        .map((item) => String(item.chargeItemId))
      setSelectedChargeItemIds(allowedIds)
    }
  }, [preCheck.data])

  // 根据当前选择的模式及项目自动计算退费金额
  const maximumStandardRefund = Math.abs(Math.min(statement.data?.accountBalance ?? 0, 0))
  const selectedItemsTotalAmount = useMemo(() => {
    if (!preCheck.data?.items) return 0
    return preCheck.data.items
      .filter((item) => selectedChargeItemIds.includes(String(item.chargeItemId)))
      .reduce((sum, item) => sum + (item.totalAmount ?? 0), 0)
  }, [preCheck.data, selectedChargeItemIds])

  useEffect(() => {
    if (refundMode === 'DIRECT') {
      if (selectedItemsTotalAmount > 0) {
        setAmount(String(selectedItemsTotalAmount))
      } else if (preCheck.data?.refundableAmount && preCheck.data.refundableAmount > 0) {
        setAmount(String(preCheck.data.refundableAmount))
      } else {
        setAmount('')
      }
    } else {
      setAmount(maximumStandardRefund > 0 ? String(maximumStandardRefund) : '')
    }
  }, [refundMode, selectedItemsTotalAmount, preCheck.data?.refundableAmount, maximumStandardRefund])

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-statement', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['refund-precheck', encounterId] }),
    ])
  }

  // 常规退费：药房已实物退药形成负余额
  const refund = useMutation({
    mutationFn: () => api.billing.createRefundOrder(paymentId, {
      idempotencyKey: `REFUND-${crypto.randomUUID()}`,
      amount: Number(amount),
      reason: reason.trim(),
      terminalCode: 'CASHIER-WEB',
    }),
    onSuccess: async () => {
      setAmount('')
      await refresh()
    },
  })

  // 直接退费：未发药未执行医嘱误收费直接退款（自动账务冲正、逆向作废发药任务、发票红冲）
  const directRefund = useMutation({
    mutationFn: () => api.billing.directRefund(paymentId, {
      idempotencyKey: `DIR-REF-${crypto.randomUUID()}`,
      refundAmount: Number(amount),
      reason: reason.trim(),
      terminalCode: 'CASHIER-WEB',
      chargeItemIds: selectedChargeItemIds.length > 0 ? selectedChargeItemIds : undefined,
    }),
    onSuccess: async () => {
      setAmount('')
      await refresh()
    },
  })

  const error = worklist.error || statement.error || preCheck.error || refund.error || directRefund.error
  const currency = statement.data?.currencyCode ?? selected?.currencyCode ?? 'CNY'
  const selectedPayment = refundablePayments.find((item) => item.id === paymentId)

  const isBlocked = preCheck.data?.overallDecision === 'BLOCKED'
  const hasSelectedBlockedItem = useMemo(() => {
    if (!preCheck.data?.items) return false
    return preCheck.data.items.some((item) => selectedChargeItemIds.includes(String(item.chargeItemId)) && !item.allowed)
  }, [preCheck.data, selectedChargeItemIds])

  const validAmount = Number(amount) > 0 && (
    refundMode === 'DIRECT'
      ? Number(amount) <= (selectedPayment?.amount ?? 0)
      : Number(amount) <= maximumStandardRefund
  )

  const canExecuteDirectRefund = Boolean(
    paymentId &&
    validAmount &&
    reason.trim() &&
    !hasSelectedBlockedItem &&
    selectedChargeItemIds.length > 0
  )

  const handleToggleItem = (itemId: string, allowed: boolean) => {
    if (!allowed) return
    setSelectedChargeItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    )
  }

  const handleSelectAllAllowed = () => {
    if (!preCheck.data?.items) return
    const allAllowed = preCheck.data.items
      .filter((item) => item.allowed)
      .map((item) => String(item.chargeItemId))
    setSelectedChargeItemIds(allAllowed)
  }

  return <>
    <PageHeader
      eyebrow="收费管理"
      title="退费管理"
      description="临床-医技-药房协同审批闭环与退费防损管理，支持未发药未执行医嘱误收费直接退款及已发药严控拦截。"
      actions={<Button variant="secondary" onClick={() => void refresh()}>刷新</Button>}
    />
    {error && <Alert tone="danger">{errorMessage(error)}</Alert>}

    <div className="billing-context-bar billing-context-bar--compact">
      <div><span>当前收费机构</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong></div>
      <div><span>待处理就诊</span><strong>{filteredQueueItems.length}</strong></div>
      <div><span>可直接退款金额</span><strong>{money(preCheck.data?.refundableAmount ?? 0, currency)}</strong></div>
      <div><span>当前待退负余额</span><strong>{money(maximumStandardRefund, currency)}</strong></div>
    </div>

    {worklist.isPending ? <LoadingState label="正在加载退费队列…" /> : <div className="billing-refund-workspace">
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
        ) : statement.isLoading || preCheck.isLoading ? (
          <LoadingState label="正在进行临床-药房-医技协同退费前置检查…" />
        ) : (
          <>
            {/* 1. 临床-医技-药房-退费协同审批防损卡片 */}
            <div className={`billing-collaboration-card ${isBlocked ? 'billing-collaboration-card--blocked' : 'billing-collaboration-card--allowed'}`}>
              <div className="billing-collaboration-header">
                <div className="billing-collaboration-header-left">
                  <h3>
                    <span>协同审批防损门禁</span>
                    {isBlocked ? (
                      <StatusBadge tone="danger">⛔ 协同校验阻断 · 严禁直接退费</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">✅ 协同校验通过 · 允许直接退费</StatusBadge>
                    )}
                  </h3>
                </div>
                <div>
                  <Button variant="secondary" size="small" onClick={handleSelectAllAllowed}>
                    全选允许退款项
                  </Button>
                </div>
              </div>

              {isBlocked ? (
                <div className="billing-collaboration-notice billing-collaboration-notice--blocked">
                  <strong>【退费防损硬阻断】</strong>
                  {preCheck.data?.summaryNotice || '该就诊存在药房已发药出库药品或医技已出具诊断报告项目，根据医疗财务防损制度，严禁收费处直接退费！'}
                </div>
              ) : (
                <div className="billing-collaboration-notice billing-collaboration-notice--allowed">
                  <strong>【协同放行指引】</strong>
                  {preCheck.data?.summaryNotice || '未发药未执行医嘱核验通过，符合直接退费防损策略。办理直接退款后将联动逆向取消发药任务并红冲电子发票。'}
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
                    {(preCheck.data?.items ?? []).map((item: RefundItemPreCheckView) => {
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
                              <span style={{ color: 'var(--color-success)', fontSize: '0.75rem' }}>
                                ✓ 允许直接退费
                              </span>
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
              <div><span>原收费总额</span><strong>{money(statement.data?.chargeAmount ?? 0, currency)}</strong></div>
              <div><span>实收总额</span><strong>{money(statement.data?.paymentAmount ?? 0, currency)}</strong></div>
              <div><span>已退款</span><strong>{money(statement.data?.refundAmount ?? 0, currency)}</strong></div>
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
                        <td>{item.paymentMethodCode}</td>
                        <td>{money(item.amount, item.currencyCode)}</td>
                        <td>{new Date(item.paidAt).toLocaleString('zh-CN')}</td>
                        <td><StatusBadge tone="success">已支付</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {statement.data && (
              <BillingTimeline
                invoices={statement.data.invoices}
                payments={statement.data.payments}
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
                  secondaryText: money(item.amount, item.currencyCode),
                }))}
              />
            </FormField>

            {selectedPayment && (
              <div className="billing-refund-origin">
                <span>原支付金额</span>
                <strong>{money(selectedPayment.amount, selectedPayment.currencyCode)}</strong>
              </div>
            )}

            <FormField label="退款金额">
              <input
                className="ui-field__control"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
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
                  <Alert tone="danger">
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
                  busy={directRefund.isPending}
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
                  disabled={!paymentId || !validAmount || !reason.trim()}
                  busy={refund.isPending}
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

