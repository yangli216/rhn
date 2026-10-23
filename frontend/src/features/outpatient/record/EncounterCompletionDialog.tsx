import { useContextSession } from '../../../shared/clinical/useContextSession'
import { useClinicalDocumentSession } from "./useClinicalDocumentSession";
import { createCompletionBillingWriter } from "./completionBillingWrites";
import { requireCompletionOrderCount, requireCompletionStatement, completionBillingSummary, requireCompletionPaymentOrders, hasPendingCompletionPayment, type OutpatientCompletionMode } from "./completionFacts";
import { requirePaymentRounding } from "../../../shared/billing/roundAmount";
import { isCollectableMethod } from "../../../shared/billing/PaymentMethodSelector";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import type { CompleteEncounterInput } from "../../../shared/api/encountersApi";
import type { AccountStatement } from "../../../shared/api/billingApi";
import type { Encounter } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import type { SettlementPaymentCommand } from "../../../shared/billing/SettlementPaymentPanel";
import { Alert, Button, Dialog, FormField, Icon, IconButton, LoadingState, Panel, PanelHead, Select } from "../../../shared/ui";
import { commandCode } from '../workstation/workstationShared'
import { money } from '../printing/EncounterPrintPanel'
import { bloodPressureMissing, useBloodPressureRequirement } from '../bloodPressurePolicy'
import { InsuranceCredentialDialog } from '../../../shared/billing/InsuranceCredentialDialog'
import { insuranceSettlementReady } from '../../../shared/billing/insuranceCheckout'
import { useCompletionInsurance } from './useCompletionInsurance'
import { AggregatedPaymentModal } from '../../../shared/billing/AggregatedPaymentModal'

export const SettlementPaymentPanel = lazy(() => import('../../../shared/billing/SettlementPaymentPanel')
  .then((module) => ({ default: module.SettlementPaymentPanel })))

export function EncounterCompletionDialog({ encounter, api, signed, ready, busy, error, completionMode, canEdit, billingWriter,
  configurationError, configurationLoading, onReloadConfiguration,
  onClose, onComplete, onSignNote, signing, simpleOrdering = false }: {
  encounter: Encounter; api: RhnApi; signed: boolean; ready: boolean; busy: boolean; error: unknown
  completionMode: OutpatientCompletionMode | undefined
  configurationError: unknown; configurationLoading: boolean; onReloadConfiguration: () => Promise<unknown>
  canEdit: boolean; billingWriter: ReturnType<typeof createCompletionBillingWriter>
  onClose: () => void; onComplete: (input: CompleteEncounterInput, batchPrint?: boolean) => void
  onSignNote?: () => void; signing?: boolean
  /** Simple ordering issues orders on save; the note is still signed on completion, but the action reads as completion. */
  simpleOrdering?: boolean
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
      const items = await api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'DOCTOR_STATION')
      if (!Array.isArray(items) || items.some(item => !item || !item.code?.trim() || !item.name?.trim())
        || new Set(items.map(item => item.code)).size !== items.length) throw new Error('诊间支付方式配置无效')
      const collectable = items.filter(item => isCollectableMethod({ tenderType: item.attributes?.TENDER_TYPE }))
      for (const item of collectable) requirePaymentRounding(item.attributes?.PAYMENT_PRECISION, item.attributes?.ROUNDING_MODE)
      return collectable
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
  const insurance = useCompletionInsurance({ api, encounter, sessionKey, captureSession: captureBillingSession })
  /** Settle the pre-settled claim, then collect only the self-pay remainder the settlement actually shows. */
  const settleInsuranceAndCollect = async (statementBefore: AccountStatement, command: SettlementPaymentCommand,
    assertCurrent: () => void) => {
    const settled = await insurance.settle(statementBefore, command.settlementId, assertCurrent)
    const current = requireCompletionStatement(await api.billing.statement(encounter.id), encounter)
    assertCurrent()
    const row = current.settlements.find(value => value.id === command.settlementId)
    const expected = settled.patientCashAmount
    if (!row || Math.abs(row.outstandingAmount - expected) > 0.01) {
      throw new Error(`医保已结算，待收 ${money(row?.outstandingAmount ?? 0, current.currencyCode)} 与试算自付 ${
        money(expected, current.currencyCode)} 不一致，请到收费处核对后收款。`)
    }
    if (row.outstandingAmount > 0 && command.amount > 0 && command.paymentMethodCode) {
      const amount = Math.abs(row.outstandingAmount - expected) <= 0.005 ? command.amount
        : Number((row.outstandingAmount + (command.roundingAdjustment ?? 0)).toFixed(2))
      return billingWriter.pay(api.billing, encounter, current, { ...command, amount }, assertCurrent)
    }
    const orders = requireCompletionPaymentOrders(await api.billing.paymentOrders(current.accountId), current)
    assertCurrent()
    return { statement: current, orders, assertCurrent, confirmApplied: () => undefined }
  }
  // 本次弹窗里生成、尚未收款的结算单：继续诊疗或关闭时取消，费用回到未结算，避免挡住医生继续修改医嘱。
  const [createdSettlementIds, setCreatedSettlementIds] = useState<string[]>([])
  const releaseCreated = useMutation({
    mutationFn: async () => {
      const current = requireCompletionStatement(await api.billing.statement(encounter.id), encounter)
      const unpaid = current.settlements.filter(row => createdSettlementIds.includes(row.id)
        && row.status === 'PRICED' && row.tenderedAmount === 0)
      for (const row of unpaid) await api.billing.cancelSettlement(row.id, '诊毕页未收款，取消诊间结算单')
    },
    onSettled: () => {
      setCreatedSettlementIds([])
      void queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })
      void queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] })
      void queryClient.invalidateQueries({ queryKey: ['doctor-completion-statement', sessionKey, encounter.id] })
    },
  })
  const close = () => {
    if (busy || signing || billingOperation.isPending || releaseCreated.isPending) return
    if (!createdSettlementIds.length) return onClose()
    // 取消失败（如医保撤销未成功）时留在弹窗提示原因，再次关闭不再重试，交由收费处处理。
    releaseCreated.mutate(undefined, { onSuccess: onClose })
  }
  const billingOperation = useMutation({
    mutationFn: async (input: { kind: 'payment'; command: SettlementPaymentCommand } | { kind: 'invoice' | 'retry' }) => {
      const assertCurrent = captureBillingSession()
      if (input.kind === 'retry') return billingWriter.retry(api.billing, encounter, assertCurrent)
      if (!confirmedStatement || !ordersReady || !canEdit) throw new Error('诊间结算资料尚未确认，请重新加载')
      if (input.kind !== 'payment') return billingWriter.issue(api.billing, encounter, confirmedStatement, assertCurrent, insurance.mode)
      return insurance.mode === 'MEDICAL_INSURANCE' && insurance.claim
        ? settleInsuranceAndCollect(confirmedStatement, input.command, assertCurrent)
        : billingWriter.pay(api.billing, encounter, confirmedStatement, input.command, assertCurrent)
    },
    onSuccess: (result, input) => {
      result.assertCurrent()
      queryClient.setQueryData(['doctor-completion-statement', sessionKey, encounter.id], result.statement)
      queryClient.setQueryData(['doctor-completion-payment-orders', sessionKey, encounter.id, result.statement.accountId], result.orders)
      result.confirmApplied()
      void queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })
      void queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] })
      if (input.kind === 'invoice') {
        const before = new Set((confirmedStatement?.settlements ?? []).map(row => row.id))
        const created = result.statement.settlements.filter(row => !before.has(row.id)).map(row => row.id)
        if (created.length) setCreatedSettlementIds(ids => [...ids, ...created])
      }
      // 医保患者生成结算单后直接试算，缺凭证时再提示读卡或扫码。
      if (input.kind === 'invoice' && insurance.mode === 'MEDICAL_INSURANCE') {
        const fresh = completionBillingSummary(result.statement).payable.filter(row => !insuranceSettlementReady(row))
        if (fresh.length === 1) void insurance.preSettle(result.statement, fresh[0].id)
      }
    },
  })
  const billingPending = billingWriter.hasPending()
  // 诊间结算不收现金；医保自付部分走扫码、刷卡等非现金方式。
  const nonCashMethods = (methods.data ?? []).filter(value => value.attributes?.TENDER_TYPE !== 'CASH')
  // 前置核对各非现金方式的渠道可用性：渠道未配置时选中即提示并禁用收款，避免提交后才报“未配置渠道适配器”。
  const channelChecks = useQuery({
    queryKey: ['doctor-completion-channel-capabilities', sessionKey, nonCashMethods.map(value => value.code).join(',')],
    enabled: nonCashMethods.length > 0, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const result: Record<string, string> = {}
      await Promise.all(nonCashMethods.map(async value => {
        try {
          const view = await api.billing.paymentChannelCapabilities(value.code)
          if (view && view.available === false) result[value.code] = view.unavailableReason || '当前机构支付渠道不可用'
        } catch { /* 查询失败不前置拦截，仍由提交时的后端校验兜底 */ }
      }))
      return result
    },
  })
  const unavailableMethods = channelChecks.data
  // 支付宝/微信等扫码渠道：先完成医保结算（如有），再弹出扫码收款窗口。
  const [scan, setScan] = useState<{ settlementId: string; settlementCode?: string; methodCode: string; methodName: string; amount: number } | null>(null)
  const [scanError, setScanError] = useState('')
  const initiateScanPay = async (command: { settlementId: string; paymentMethodCode: string; paymentMethodName: string; amount: number }) => {
    setScanError('')
    try {
      const assertCurrent = captureBillingSession()
      if (!confirmedStatement || !ordersReady || !canEdit) throw new Error('诊间结算资料尚未确认，请重新加载')
      let amount = command.amount
      if (insurance.mode === 'MEDICAL_INSURANCE' && insurance.claim) {
        const settled = await insurance.settle(confirmedStatement, command.settlementId, assertCurrent)
        const current = requireCompletionStatement(await api.billing.statement(encounter.id), encounter)
        assertCurrent()
        const row = current.settlements.find(value => value.id === command.settlementId)
        if (!row || Math.abs(row.outstandingAmount - settled.patientCashAmount) > 0.01) {
          throw new Error('医保已结算，待收金额与试算自付不一致，请到收费处核对后收款。')
        }
        queryClient.setQueryData(['doctor-completion-statement', sessionKey, encounter.id], current)
        amount = row.outstandingAmount
        if (amount <= 0) { await reloadFacts(); return }
      }
      const code = confirmedStatement.settlements.find(value => value.id === command.settlementId)?.settlementNo
      setScan({ settlementId: command.settlementId, settlementCode: code, methodCode: command.paymentMethodCode,
        methodName: command.paymentMethodName, amount })
    } catch (failure) { setScanError(errorMessage(failure)) }
  }
  const dialogBusy = busy || signing || billingOperation.isPending || releaseCreated.isPending
  const payable = billing?.payable ?? []
  const outstanding = billing?.outstanding
  const settledAmount = confirmedStatement && outstanding !== undefined
    ? Math.max(0, Number((confirmedStatement.chargeAmount - confirmedStatement.uninvoicedAmount - outstanding).toFixed(2))) : 0
  // 费用构成按收费来源归并；冲销行金额为负，直接累加即为净额。药占比 = 药品费用 / 本次就诊费用合计。
  const composition = (() => {
    const charges = confirmedStatement?.charges ?? []
    const sum = (types: string[]) => Number(charges.filter(row => types.includes(row.sourceType))
      .reduce((total, row) => total + row.totalAmount, 0).toFixed(2))
    const medication = sum(['MEDICATION_REQUEST', 'MEDICATION_REQUEST_REVERSAL', 'MEDICATION_DISPENSE', 'MEDICATION_RETURN'])
    const service = sum(['SERVICE_REQUEST', 'SERVICE_REQUEST_REVERSAL', 'DIRECT_VISIT_SERVICE'])
    const registration = sum(['REGISTRATION'])
    const total = Number((medication + service + registration).toFixed(2))
    return { medication, service, registration, total, ratio: total > 0 ? medication / total : null }
  })()
  const showPayment = payable.length > 0

  const primaryDiag = encounter.diagnoses.find((value) => value.type === 'PRIMARY')?.display || '未录入'
  const hasChiefComplaint = Boolean(encounter.chiefComplaint?.trim())
  const hasPrimaryDiagnosis = encounter.diagnoses.some((value) => value.type === 'PRIMARY')
  const bloodPressureRequirement = useBloodPressureRequirement(api, encounter.id).data
  const missingBloodPressure = bloodPressureMissing(bloodPressureRequirement, encounter)
  const signatureReady = signed || completionMode === 'COMBINED_CONFIRMATION'
  return <Dialog title="诊毕确认" size="xwide" className={`doctor-completion-modal${showPayment ? ' has-payment' : ''}`}
    closeOnBackdrop={false} onClose={close}
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
          {billingPending ? (
            <Button variant="secondary" disabled={!canEdit} busy={billingOperation.isPending}
              onClick={() => billingOperation.mutate({ kind: 'retry' })}>
              核实上次结算
            </Button>
          ) : confirmedStatement && confirmedStatement.uninvoicedAmount > 0 && (
            <Button variant="secondary" title="为未结算费用生成结算单，随后可在诊间收款"
              disabled={!canEdit || billingOperation.isPending || !ordersReady || pendingPayment}
              busy={billingOperation.isPending}
              onClick={() => billingOperation.mutate({ kind: 'invoice' })}>
              诊间结算
            </Button>
          )}
          <Button variant="secondary" disabled={dialogBusy} busy={releaseCreated.isPending}
            title={createdSettlementIds.length ? '关闭并取消本次生成、尚未收款的结算单' : undefined} onClick={close}>继续诊疗</Button>
          <Button busy={dialogBusy} disabled={!canComplete || !dispositionCode || billingOperation.isPending}
            title={!factsReady ? '诊毕资料尚未确认' : !ready ? '病历、主要诊断或血压尚未完成' : signed ? '确认诊毕' : '签署病历并完成诊毕'}
            onClick={() => canComplete && onComplete({ commandCode: requestCommand, dispositionCode },
              batchPrintOnComplete)}>{signed || simpleOrdering ? '确认诊毕' : completionMode === 'COMBINED_CONFIRMATION'
                ? '签署并诊毕' : '确认诊毕'}</Button>
        </div>
      </div>
    }>
    {insurance.credential && <InsuranceCredentialDialog api={api} residentId={encounter.residentId}
      busy={insurance.preSettling} error={insurance.credential.error}
      onVerified={() => { void insurance.preSettle(confirmedStatement, insurance.credential!.settlementId, true) }}
      onCancel={insurance.cancelCredential} />}
    <div className={`doctor-completion-dialog${showPayment ? ' has-payment' : ''}`} inert={dialogBusy}>
    <div className="doctor-completion-main">
      {(error || billingOperation.error)
        && <Alert duration={null}>{errorMessage(error || billingOperation.error)}</Alert>}
      {scanError && <Alert tone="warning" duration={null}>{scanError}</Alert>}
      {releaseCreated.error && <Alert placement="inline" tone="warning" duration={null}>
        未付款结算单取消失败：{errorMessage(releaseCreated.error)}。可再次关闭，结算单保留，由收费处收款或取消</Alert>}
      {factsError && <Alert duration={null}>诊毕资料加载失败：{errorMessage(factsError)}</Alert>}
      {billingError && <Alert placement="inline" tone="warning" duration={null}>费用信息加载失败：{errorMessage(billingError)}。不影响签署和诊毕</Alert>}

      <Panel className="doctor-completion-overview" aria-label="诊毕状态汇总">
        <div className="doctor-overview-stat doctor-overview-stat--diagnosis">
          <div className="doctor-overview-stat__header">
            <span className="doctor-overview-stat__icon" aria-hidden="true"><Icon name="stethoscope" /></span><span>主要诊断</span>
          </div>
          <strong title={primaryDiag} className={hasPrimaryDiagnosis ? '' : 'is-warning'}>{primaryDiag}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--note">
          <div className="doctor-overview-stat__header">
            <span className="doctor-overview-stat__icon" aria-hidden="true"><Icon name="file-text" /></span><span>病历状态</span>
          </div>
          <strong>
            {signed ? '已签署' : completionMode === 'COMBINED_CONFIRMATION' ? '诊毕时签署' : '待签署'}</strong>
        </div>
        <div className="doctor-overview-stat doctor-overview-stat--orders">
          <div className="doctor-overview-stat__header">
            <span className="doctor-overview-stat__icon" aria-hidden="true"><Icon name="pill" /></span><span>本次医嘱</span>
          </div>
          <strong>{orderCount === undefined ? '医嘱待核对' : `${orderCount} 项`}</strong>
        </div>
      </Panel>
      <Panel className="doctor-completion-fee" aria-label="费用结算">
        <PanelHead title="费用结算" icon="billing" meta={<strong className="doctor-fee-stat__status">
          {!confirmedStatement ? '费用待核对' : !ordersReady ? '支付状态待核对' : pendingPayment ? '支付处理中'
            : billing?.settled ? '已结清'
              : outstanding! > 0 ? `本次待收 ${money(outstanding!, confirmedStatement.currencyCode)}`
                : confirmedStatement.uninvoicedAmount !== 0 ? `${money(confirmedStatement.uninvoicedAmount, confirmedStatement.currencyCode)} 未结算`
                  : confirmedStatement.accountBalance !== 0 ? '账户余额待核对' : '结算尚未完成'}
        </strong>} />
        <div className="doctor-fee-stat-content">
          {confirmedStatement ? (
            <div className="doctor-fee-stat-metrics">
              {/* 费用合计 = 已结算 + 未结算 + 本次待收，四项相加恒等于合计，医生可直接对账。
                  已结清含个人已付，以及挂号等已结算单据中医保/基金已承担的部分。 */}
              <span>费用合计 <strong>{money(confirmedStatement.chargeAmount, confirmedStatement.currencyCode)}</strong></span>
              <span className="is-settled" title={`已完成结算的费用：个人已付 ${money(confirmedStatement.paymentAmount, confirmedStatement.currencyCode)}，其余为挂号等已结算单据中医保/基金已承担的部分`}>
                已结算 <strong>{money(settledAmount, confirmedStatement.currencyCode)}</strong></span>
              <span className={confirmedStatement.uninvoicedAmount > 0 ? 'is-pending' : undefined} title="已开立但尚未生成结算单的费用，需诊间结算或到收费处结算">未结算 <strong>{money(confirmedStatement.uninvoicedAmount, confirmedStatement.currencyCode)}</strong></span>
              <span className="is-due" title="已生成结算单、等待患者支付的金额（右侧诊间收款对应此金额）">本次待收 <strong>{money(outstanding!, confirmedStatement.currencyCode)}</strong></span>
              {confirmedStatement.accountBalance < 0 && <span title="患者账户预交款结余">
                账户结余 <strong>{money(Math.abs(confirmedStatement.accountBalance), confirmedStatement.currencyCode)}</strong></span>}
            </div>
          ) : statement.isPending ? (
            <small className="doctor-fee-stat__hint">读取中…</small>
          ) : null}
        </div>
        {confirmedStatement && composition.total > 0 && <div className="doctor-fee-composition" aria-label="费用构成">
          <span className="doctor-fee-composition__title">费用构成</span>
          <span>药品 <strong>{money(composition.medication, confirmedStatement.currencyCode)}</strong></span>
          <span>诊疗项目 <strong>{money(composition.service, confirmedStatement.currencyCode)}</strong></span>
          {composition.registration !== 0 && <span>挂号 <strong>{money(composition.registration, confirmedStatement.currencyCode)}</strong></span>}
          <span className="doctor-fee-composition__ratio" title="药占比 = 药品费用 ÷ 本次就诊费用合计（含挂号）">
            药占比 <strong>{(composition.ratio! * 100).toFixed(1)}%</strong></span>
        </div>}
      </Panel>
      <Panel className="doctor-completion-workflow">
        {/* 仅在资料核对中或支付处理中提示；正常状态由下方核对项表达，不再单独占一行。 */}
        <PanelHead title="诊毕核对" icon="tasks"
          meta={factsLoading ? '正在核对诊毕资料…' : !factsReady ? '诊毕资料待核对'
            : pendingPayment ? '支付处理中，不影响诊毕' : undefined}
          actions={<IconButton icon="refresh" label="重新加载诊毕资料" disabled={factsLoading || billingLoading}
            aria-busy={factsLoading || billingLoading || undefined} onClick={() => void reloadFacts()} />} />
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
            {bloodPressureRequirement?.required && <span className={`doctor-checklist-chip ${missingBloodPressure ? 'is-missing' : 'is-ready'}`}
              title={missingBloodPressure ? bloodPressureRequirement.message ?? undefined : undefined}>
              <Icon name={missingBloodPressure ? 'warning' : 'check'} className="ui-icon-inline" />
              <span>{missingBloodPressure ? '血压未填写' : '血压已填写'}</span>
            </span>}
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
      {showPayment && (
        <aside className="doctor-completion-side"><Panel className="doctor-completion-payment-section" aria-label="诊间收款">
          <PanelHead title="诊间收款" icon="card" meta={`待结算 ${payable.length} 笔`} />
          <div className="doctor-completion-payment">
            <Suspense fallback={<LoadingState label="正在加载收款组件…" />}>
              {insurance.error && <Alert tone="warning" duration={null}>{insurance.error}</Alert>}
              {billingPending || !canEdit || !ordersReady || !methods.isSuccess || methods.isFetching
                ? <p>支付资料尚未确认，请重新加载或联系管理员。</p>
                : <SettlementPaymentPanel settlements={payable.map((value) => ({
                id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount, currencyCode: value.currencyCode,
                insuranceReady: insuranceSettlementReady(value), insurancePreparationAllowed: false,
                insuranceAmount: value.insuranceAmount, otherFundAmount: value.otherAmount,
                personalAccountAmount: value.tenders.filter(tender => tender.tenderType === 'PERSONAL_ACCOUNT')
                  .reduce((sum, tender) => sum + tender.amount, 0),
              }))} methods={nonCashMethods.map((value) => ({
                code: value.code,
                name: value.name,
                sortOrder: value.sortOrder,
                precision: value.attributes?.PAYMENT_PRECISION,
                roundingMode: value.attributes?.ROUNDING_MODE,
                tenderType: value.attributes?.TENDER_TYPE,
              }))}
              orders={orders.data!} busy={billingOperation.isPending || insurance.preSettling} sceneLabel="诊间收款"
              onInitiateChannelPay={initiateScanPay} channelPayFilter={method => method.tenderType === 'DIGITAL'}
              unavailableMethods={unavailableMethods}
              showSettlementMode settlementModeCode={insurance.mode} onSettlementModeChange={insurance.setMode}
              insuranceIntegrated insuranceClaimView={insurance.claim} isPreSettlingInsurance={insurance.preSettling}
              onPreSettleInsurance={(settlementId) => insurance.preSettle(confirmedStatement, settlementId)}
              onCancelInsurancePreSettle={insurance.clearClaim}
              onSubmit={(command) => billingOperation.mutateAsync({ kind: 'payment', command })} />}
              {methods.isSuccess && !nonCashMethods.length && <small className="doctor-fee-stat__hint">
                诊间未配置非现金支付方式，需个人自付时请到收费处缴费。</small>}
            </Suspense>
          </div>
        </Panel></aside>
      )}
    </div>
    {scan && <AggregatedPaymentModal open contextKey={sessionKey} paymentSceneCode="DOCTOR_STATION" terminalPrefix="DOCTOR-STATION"
      paymentMethodCode={scan.methodCode} paymentMethodName={scan.methodName} amount={scan.amount}
      currencyCode={confirmedStatement?.currencyCode} settlementId={scan.settlementId} settlementCode={scan.settlementCode}
      onClose={() => { setScan(null); void reloadFacts() }}
      onPaymentSuccess={() => { setScan(null); void reloadFacts() }} api={api} />}
  </Dialog>
}
