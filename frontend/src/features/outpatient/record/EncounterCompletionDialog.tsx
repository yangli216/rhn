import { useContextSession } from '../../../shared/clinical/useContextSession'
import { useClinicalDocumentSession } from "./useClinicalDocumentSession";
import { createCompletionBillingWriter } from "./completionBillingWrites";
import { requireCompletionOrderCount, requireCompletionStatement, completionBillingSummary, requireCompletionPaymentOrders, hasPendingCompletionPayment, type OutpatientCompletionMode } from "./completionFacts";
import { requirePaymentRounding } from "../../../shared/billing/roundAmount";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import type { CompleteEncounterInput } from "../../../shared/api/encountersApi";
import type { Encounter } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import type { SettlementPaymentCommand } from "../../../shared/billing/SettlementPaymentPanel";
import { Alert, Button, Dialog, FormField, Icon, IconButton, LoadingState, Panel, PanelHead, Select } from "../../../shared/ui";
import { commandCode } from '../workstation/workstationShared'
import { money } from '../printing/EncounterPrintPanel'

export const SettlementPaymentPanel = lazy(() => import('../../../shared/billing/SettlementPaymentPanel')
  .then((module) => ({ default: module.SettlementPaymentPanel })))

export function EncounterCompletionDialog({ encounter, api, signed, ready, busy, error, completionMode, canEdit, billingWriter,
  configurationError, configurationLoading, onReloadConfiguration,
  onClose, onComplete, onSignNote, signing }: {
  encounter: Encounter; api: RhnApi; signed: boolean; ready: boolean; busy: boolean; error: unknown
  completionMode: OutpatientCompletionMode | undefined
  configurationError: unknown; configurationLoading: boolean; onReloadConfiguration: () => Promise<unknown>
  canEdit: boolean; billingWriter: ReturnType<typeof createCompletionBillingWriter>
  onClose: () => void; onComplete: (input: CompleteEncounterInput, batchPrint?: boolean) => void
  onSignNote?: () => void; signing?: boolean
}) {
  const [batchPrintOnComplete, setBatchPrintOnComplete] = useState(false)
  const [dispositionCode, setDispositionCode] = useState<CompleteEncounterInput['dispositionCode']>('HOME')
  const [requestCommand, setRequestCommand] = useState(() => commandCode('COMPLETE', encounter.id))
  const queryClient = useQueryClient()
  const sessionKey = useContextSession(api)
  const statement = useQuery({
    queryKey: ['doctor-completion-statement', sessionKey, encounter.id],
    queryFn: async () => requireCompletionStatement(await api.billing.statement(encounter.id), encounter), retry: false,
  })
  const services = useQuery({ queryKey: ['doctor-completion-services', sessionKey, encounter.id], retry: false,
    queryFn: async () => requireCompletionOrderCount(await api.encounters.serviceRequests(encounter.id), encounter, 'service') })
  const medications = useQuery({ queryKey: ['doctor-completion-medications', sessionKey, encounter.id], retry: false,
    queryFn: async () => requireCompletionOrderCount(await api.encounters.medicationRequests(encounter.id), encounter, 'medication') })
  const confirmedStatement = statement.isSuccess && !statement.isFetching ? statement.data : undefined
  const billing = confirmedStatement ? completionBillingSummary(confirmedStatement) : undefined
  const methods = useQuery({
    queryKey: ['doctor-completion-methods', sessionKey, encounter.id], retry: false,
    enabled: Boolean(billing?.payable.length),
    queryFn: async () => {
      const items = await api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE')
      if (!Array.isArray(items) || items.some(item => !item || !item.code?.trim() || !item.name?.trim())
        || new Set(items.map(item => item.code)).size !== items.length) throw new Error('诊间支付方式配置无效')
      for (const item of items) if (item.code !== 'MEDICAL_INSURANCE') {
        requirePaymentRounding(item.attributes?.PAYMENT_PRECISION, item.attributes?.ROUNDING_MODE)
      }
      return items.filter(item => item.code !== 'MEDICAL_INSURANCE')
    },
  })
  const orders = useQuery({
    queryKey: ['doctor-completion-payment-orders', sessionKey, encounter.id, confirmedStatement?.accountId], retry: false,
    queryFn: async () => requireCompletionPaymentOrders(await api.billing.paymentOrders(confirmedStatement!.accountId), confirmedStatement!),
    enabled: Boolean(confirmedStatement),
    refetchInterval: query => query.state.data && hasPendingCompletionPayment(query.state.data) ? 2500 : false,
  })
  const ordersReady = orders.isSuccess && !orders.isFetching && Boolean(confirmedStatement)
  const pendingPayment = ordersReady && hasPendingCompletionPayment(orders.data)
  const orderCount = services.isSuccess && !services.isFetching && medications.isSuccess && !medications.isFetching
    ? services.data + medications.data : undefined
  const factsError = configurationError || services.error || medications.error
  const factsLoading = configurationLoading || services.isFetching || medications.isFetching
  const billingError = statement.error || orders.error || (billing?.payable.length ? methods.error : undefined)
  const billingLoading = statement.isFetching || orders.isFetching || methods.isFetching
  const factsReady = Boolean(completionMode && orderCount !== undefined && !factsError && !factsLoading)
  const canComplete = ready && factsReady
  const reloadFacts = async () => {
    await Promise.all([onReloadConfiguration(), statement.refetch(), services.refetch(), medications.refetch(),
      ...(confirmedStatement ? [orders.refetch()] : []), ...(billing?.payable.length ? [methods.refetch()] : [])])
  }
  const captureBillingSession = useClinicalDocumentSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit)
  const billingOperation = useMutation({
    mutationFn: async (input: { kind: 'payment'; command: SettlementPaymentCommand } | { kind: 'invoice' | 'retry' }) => {
      const assertCurrent = captureBillingSession()
      if (input.kind === 'retry') return billingWriter.retry(api.billing, encounter, assertCurrent)
      if (!confirmedStatement || !ordersReady || !canEdit) throw new Error('诊间结算资料尚未确认，请重新加载')
      return input.kind === 'payment'
        ? billingWriter.pay(api.billing, encounter, confirmedStatement, input.command, assertCurrent)
        : billingWriter.issue(api.billing, encounter, confirmedStatement, assertCurrent)
    },
    onSuccess: result => {
      result.assertCurrent()
      queryClient.setQueryData(['doctor-completion-statement', sessionKey, encounter.id], result.statement)
      queryClient.setQueryData(['doctor-completion-payment-orders', sessionKey, encounter.id, result.statement.accountId], result.orders)
      result.confirmApplied()
      void queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })
      void queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] })
    },
  })
  const billingPending = billingWriter.hasPending()
  const dialogBusy = busy || signing || billingOperation.isPending
  const payable = billing?.payable ?? []
  const outstanding = billing?.outstanding

  const primaryDiag = encounter.diagnoses.find((value) => value.type === 'PRIMARY')?.display || '未录入'
  const hasChiefComplaint = Boolean(encounter.chiefComplaint?.trim())
  const hasPrimaryDiagnosis = encounter.diagnoses.some((value) => value.type === 'PRIMARY')
  const signatureReady = signed || completionMode === 'COMBINED_CONFIRMATION'
  return <Dialog title="诊毕确认" size="xwide" className="doctor-completion-modal"
    closeOnBackdrop={false} onClose={() => !dialogBusy && onClose()}
    footer={
      <div className="doctor-completion-footer">
        <label className="doctor-completion-print-option ui-field__checkbox">
          <input
            type="checkbox"
            checked={batchPrintOnComplete}
            onChange={(event) => setBatchPrintOnComplete(event.target.checked)}
          />
          <span>诊毕后批量打印</span>
        </label>
        <div className="doctor-completion-footer__actions">
          <Button variant="secondary" disabled={dialogBusy} onClick={onClose}>继续诊疗</Button>
          <Button busy={dialogBusy} disabled={!canComplete || !dispositionCode || billingOperation.isPending}
            title={!factsReady ? '诊毕资料尚未确认' : !ready ? '病历或主要诊断尚未完成' : signed ? '确认诊毕' : '签署病历并完成诊毕'}
            onClick={() => canComplete && onComplete({ commandCode: requestCommand, dispositionCode },
              batchPrintOnComplete)}>{signed ? '确认诊毕' : completionMode === 'COMBINED_CONFIRMATION'
                ? '签署并诊毕' : '确认诊毕'}</Button>
        </div>
      </div>
    }>
    <div className="doctor-completion-dialog" inert={dialogBusy}>
      {(error || billingOperation.error)
        && <Alert duration={null}>{errorMessage(error || billingOperation.error)}</Alert>}
      {factsError && <Alert duration={null}>诊毕资料加载失败：{errorMessage(factsError)}</Alert>}
      {billingError && <Alert tone="warning" duration={null}>费用信息加载失败：{errorMessage(billingError)}。不影响签署和诊毕</Alert>}

      <div className="doctor-completion-banner" role="status">
        <div className="doctor-completion-banner__content">
          <Icon name={factsLoading ? 'info' : canComplete ? 'check' : 'warning'} />
          <span>
            {factsLoading ? '正在核对诊毕资料…' : !factsReady ? '诊毕资料待核对'
              : !signatureReady ? '请先签署病历' : !ready ? '请完善并保存病历和主要诊断'
                : pendingPayment ? '支付处理中，不影响诊毕'
                  : billing?.settled ? '可以确认诊毕' : confirmedStatement && !billingError && !billingLoading
                    ? '费用可在诊毕后结算' : '可以确认诊毕，费用状态待核对'}
          </span>
        </div>
        <div className="doctor-completion-banner__actions">
          {confirmedStatement && confirmedStatement.uninvoicedAmount > 0 && (
            <Button
              variant="secondary"
              disabled={!canEdit || billingOperation.isPending || billingPending || !ordersReady || pendingPayment}
              busy={billingOperation.isPending}
              onClick={() => billingOperation.mutate({ kind: 'invoice' })}
            >
              <Icon name="billing" />生成结算单
            </Button>
          )}
          {billingPending && (
            <Button variant="secondary" disabled={!canEdit} busy={billingOperation.isPending}
              onClick={() => billingOperation.mutate({ kind: 'retry' })}>
              核实上次结算
            </Button>
          )}
          <IconButton icon="refresh" label="重新加载诊毕资料" disabled={factsLoading || billingLoading}
            aria-busy={factsLoading || billingLoading || undefined} onClick={() => void reloadFacts()} />
        </div>
      </div>

      <Panel className="doctor-completion-overview" aria-label="诊毕状态汇总">
        <div className="doctor-overview-stat doctor-overview-stat--diagnosis">
          <div className="doctor-overview-stat__header">
            <span>主要诊断</span>
          </div>
          <strong title={primaryDiag} className={hasPrimaryDiagnosis ? '' : 'is-warning'}>{primaryDiag}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--note">
          <div className="doctor-overview-stat__header">
            <span>病历状态</span>
          </div>
          <strong>
            {signed ? '已签署' : completionMode === 'COMBINED_CONFIRMATION' ? '诊毕时签署' : '待签署'}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--orders">
          <div className="doctor-overview-stat__header">
            <span>本次医嘱</span>
          </div>
          <strong>{orderCount === undefined ? '医嘱待核对' : `${orderCount} 项`}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--fee">
          <div className="doctor-overview-stat__header">
            <span>费用结算</span>
          </div>
          <div className="doctor-fee-stat-content">
            <strong>
              {!confirmedStatement ? '费用待核对' : !ordersReady ? '支付状态待核对' : pendingPayment ? '支付处理中'
                : billing?.settled ? '已结清'
                  : outstanding! > 0 ? money(outstanding!, confirmedStatement.currencyCode)
                    : confirmedStatement.uninvoicedAmount !== 0 ? '尚有未开票费用'
                      : confirmedStatement.accountBalance !== 0 ? '账户余额待核对' : '结算尚未完成'}
            </strong>
            {confirmedStatement ? (
              <div className="doctor-fee-stat-metrics">
                <span>费用合计 <strong>{money(confirmedStatement.chargeAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>已支付 <strong>{money(confirmedStatement.paymentAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>未开票 <strong>{money(confirmedStatement.uninvoicedAmount, confirmedStatement.currencyCode)}</strong></span>
                <span>待支付 <strong>{money(outstanding!, confirmedStatement.currencyCode)}</strong></span>
                <span>账户余额 <strong>{money(confirmedStatement.accountBalance, confirmedStatement.currencyCode)}</strong></span>
              </div>
            ) : statement.isPending ? (
              <small className="doctor-fee-stat__hint">读取中…</small>
            ) : null}
          </div>
        </div>
      </Panel>
      {payable.length > 0 && (
        <Panel className="doctor-completion-payment-section">
          <PanelHead title="诊间收款" meta={`待结算 ${payable.length} 笔`} />
          <div className="doctor-completion-payment">
            <Suspense fallback={<LoadingState label="正在加载收款组件…" />}>
              {billingPending || !canEdit || !ordersReady || !methods.isSuccess || methods.isFetching || !methods.data.length
                ? <p>支付资料尚未确认或没有可用支付方式，请重新加载或联系管理员。</p>
                : <SettlementPaymentPanel settlements={payable.map((value) => ({
                id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount, currencyCode: value.currencyCode,
              }))} methods={methods.data.map((value) => ({
                code: value.code,
                name: value.name,
                sortOrder: value.sortOrder,
                precision: value.attributes?.PAYMENT_PRECISION,
                roundingMode: value.attributes?.ROUNDING_MODE,
              }))}
              orders={orders.data!} busy={billingOperation.isPending} sceneLabel="诊间收款"
              onSubmit={(command) => billingOperation.mutateAsync({ kind: 'payment', command })} />}
            </Suspense>
          </div>
        </Panel>
      )}
      <Panel className="doctor-completion-workflow">
        <PanelHead title="诊毕核对" />
        <div className="doctor-completion-confirmation">
          <FormField label="就诊转归" required>
            <Select value={dispositionCode} searchable={false} clearable={false}
              onChange={(value) => {
                setDispositionCode(value as CompleteEncounterInput['dispositionCode'])
                setRequestCommand(commandCode('COMPLETE', encounter.id))
              }} options={[
                { value: 'HOME', label: '门诊离院' }, { value: 'FOLLOW_UP', label: '预约复诊' },
                { value: 'OBSERVATION', label: '留观' }, { value: 'REFERRAL', label: '转诊 / 转科' },
                { value: 'ADMISSION', label: '收治住院' },
              ]} />
          </FormField>
          <div className="doctor-completion-checklist__items" aria-label="诊毕准入核对">
            <span className={`doctor-checklist-chip ${hasChiefComplaint ? 'is-ready' : 'is-missing'}`}>
              <Icon name={hasChiefComplaint ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>{hasChiefComplaint ? '主诉已保存' : '主诉未保存'}</span>
            </span>
            <span className={`doctor-checklist-chip ${hasPrimaryDiagnosis ? 'is-ready' : 'is-missing'}`}>
              <Icon name={hasPrimaryDiagnosis ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>{hasPrimaryDiagnosis ? '主要诊断' : '未录入主要诊断'}</span>
            </span>
            <span className={`doctor-checklist-chip ${signatureReady ? 'is-ready' : 'is-missing'}`}>
              <Icon name={signatureReady ? 'check' : 'warning'} className="ui-icon-inline" />
              <span>{signed ? '病历已签署' : completionMode === 'COMBINED_CONFIRMATION' ? '确认时自动签署' : '病历签署'}</span>
              {!signed && completionMode === 'SEPARATE_CONFIRMATIONS' && onSignNote && (
                <Button
                  size="sm"
                  variant="secondary"
                  busy={signing}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSignNote()
                  }}
                >
                  立即签署
                </Button>
              )}
            </span>
          </div>
        </div>
      </Panel>
    </div>
  </Dialog>
}
