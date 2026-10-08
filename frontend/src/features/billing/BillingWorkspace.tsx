import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { AccountStatement, InsuranceSettlementView, ReceiptView } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { useBarcodeScanner } from '../../shared/hooks/useBarcodeScanner'
import { SettlementPaymentPanel, type SettlementModeCode,
  type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { useCashierPaymentMethods } from '../../shared/billing/useCashierPaymentMethods'
import { CashierPanel } from '../../shared/billing/CashierPanel'
import { AggregatedPaymentModal } from '../../shared/billing/AggregatedPaymentModal'
import { confirmInsuranceResult, type InsuranceResultTarget } from '../../shared/billing/insuranceResult'
import { FiscalReceiptModal } from '../../shared/billing/FiscalReceiptModal'
import { Alert, Button, DataTable, SearchField, tableCellClass, PanelHead, EmptyState, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'
import { Icon } from '../../shared/ui/Icon'
import { age } from '../../shared/format'
import { BillingQueue, BillingTimeline, money } from './BillingShared'
import '../../styles/features/billing-settlement.css'

const settlementStatuses = new Set(['PENDING_CHARGE', 'PENDING_INVOICE', 'PENDING_PAYMENT'])
const draftSettlementId = '__CURRENT_UNINVOICED_CHARGES__'
type CheckoutStage = 'IDLE' | 'CREATING_SETTLEMENT' | 'CREATING_PAYMENT'

export interface BillingDocumentGroup {
  id: string
  docType: 'PRESCRIPTION' | 'SERVICE' | 'REGISTRATION' | 'OTHER'
  docTypeName: string
  docNo: string
  occurredAt: string
  isExpired: boolean
  charges: AccountStatement['charges']
  totalAmount: number
  uninvoicedAmount: number
  invoicedCount: number
  uninvoicedCount: number
}

const UNIT_ZH_MAP: Record<string, string> = {
  BOX: '盒',
  VIAL: '支',
  BOTTLE: '瓶',
  AMP: '支',
  AMPOULE: '支',
  PIECE: '片',
  TABLET: '片',
  CAPSULE: '粒',
  BAG: '袋',
  PACK: '包',
  TUBE: '支',
  SYRINGE: '支',
  G: '克',
  MG: '毫克',
  ML: '毫升',
  L: '升',
}

function formatUnit(unitCode?: string, unitName?: string) {
  if (unitName && !/^[A-Za-z]+$/.test(unitName)) return unitName
  if (!unitCode) return unitName || ''
  const upper = unitCode.toUpperCase()
  return UNIT_ZH_MAP[upper] || unitName || unitCode
}

function formatItemDisplayName(itemName: string, packageSpec?: string) {
  if (!packageSpec) return itemName
  if (itemName.includes(packageSpec)) return itemName
  const parts = itemName.split(/\s+/)
  if (parts.length > 1 && /^[\d.]+[a-zA-Z%]+$/.test(parts[parts.length - 1])) {
    const baseName = parts.slice(0, -1).join(' ')
    return `${baseName} ${packageSpec}`
  }
  return `${itemName} ${packageSpec}`
}

export function BillingWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const linkedResidentId = searchParams.get('residentId')
  const [encounterId, setEncounterId] = useState('')
  const [patientLookup, setPatientLookup] = useState('')
  const [isManualSelecting, setIsManualSelecting] = useState(false)
  const [settlementMode, setSettlementMode] = useState<SettlementModeCode>('SELF_PAY')
  const [insuranceClaimView, setInsuranceClaimView] = useState<InsuranceSettlementView | null>(null)
  const [isPreSettlingInsurance, setIsPreSettlingInsurance] = useState(false)
  const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>('IDLE')
  const [scanNotice, setScanNotice] = useState<{ tone: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [scanModalState, setScanModalState] = useState<{
    open: boolean
    settlementId: string
    settlementCode?: string
    paymentMethodCode: string
    paymentMethodName: string
    amount: number
  }>({
    open: false,
    settlementId: '',
    paymentMethodCode: 'WECHAT',
    paymentMethodName: '微信支付',
    amount: 0,
  })
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<ReceiptView | null>(null)
  const insuranceSession = useRef({ api, encounterId, context: '', revision: 0 })
  const insuranceContext = JSON.stringify(clinicalContext)
  if (insuranceSession.current.api !== api || insuranceSession.current.encounterId !== encounterId
    || insuranceSession.current.context !== insuranceContext) {
    insuranceSession.current = { api, encounterId, context: insuranceContext, revision: insuranceSession.current.revision + 1 }
  }
  const renderedInsuranceSession = insuranceSession.current
  useEffect(() => () => { insuranceSession.current.revision += 1 }, [])
  const captureInsuranceSession = () => {
    const revision = renderedInsuranceSession.revision
    const isCurrent = () => insuranceSession.current === renderedInsuranceSession && insuranceSession.current.revision === revision
    return { isCurrent, check: () => {
      if (!isCurrent()) throw new Error('收银上下文已变化，医保结果未确认，请返回原患者核实申请。')
    } }
  }
  const preSettlementKeys = useRef(new WeakMap<RhnApi, Map<string, string>>())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const completedPaymentMarker = useRef('')
  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
  const settlementItems = useMemo(() => (worklist.data ?? []).filter((item) => settlementStatuses.has(item.status)),
    [worklist.data])
  const paymentMethods = useCashierPaymentMethods(api, clinicalContext)

  const handleResetPatient = useCallback(() => {
    setIsManualSelecting(true)
    setEncounterId('')
    setPatientLookup('')
    setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 50)
  }, [])

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
    if (linkedEncounterId || linkedResidentId || isManualSelecting) return
    if (!encounterId && settlementItems.length) setEncounterId(settlementItems[0].encounterId)
    if (encounterId && settlementItems.length && !settlementItems.some((item) => item.encounterId === encounterId)) {
      setEncounterId(settlementItems[0].encounterId)
    }
  }, [encounterId, isManualSelecting, linkedEncounterId, linkedResidentId, settlementItems])
  useEffect(() => {
    setSettlementMode('SELF_PAY')
    setInsuranceClaimView(null)
    setIsPreSettlingInsurance(false)
    setCheckoutStage('IDLE')
  }, [api, encounterId, insuranceContext])
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
      queryClient.invalidateQueries({ queryKey: ['billing-workspace-receipts', encounterId] }),
    ])
  }

  const settlements = useMemo(() => statement.data?.settlements ?? [], [statement.data?.settlements])
  const receiptQueryKey = ['billing-workspace-receipts', encounterId, settlements.map((s) => s.id)]
  const receipts = useQuery({
    queryKey: receiptQueryKey,
    enabled: settlements.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(settlements.map(async (settlement) => {
        const values = await api.billing.settlementReceipts(settlement.id)
        if (!Array.isArray(values)) throw new Error('票据查询返回无效结果')
        return [settlement.id, values] as const
      }))
      return Object.fromEntries(entries) as Record<string, ReceiptView[]>
    },
  })
  const settlementReceiptsMap = useMemo(() => receipts.isError ? {} : receipts.data ?? {}, [receipts.data, receipts.isError])

  const allCurrentReceipts = useMemo(() => {
    return Object.values(settlementReceiptsMap).flat()
  }, [settlementReceiptsMap])

  const handleOpenOrIssueReceipt = async (settlementId: string) => {
    if (!receipts.isSuccess || receipts.isFetching) {
      setScanNotice({ tone: 'warning', text: '请先成功查询已有票据，再办理开票。' })
      return
    }
    const existing = settlementReceiptsMap[settlementId]
    if (existing && existing.length > 0) {
      setActiveReceipt(existing[0])
      setFiscalModalOpen(true)
      return
    }
    try {
      setScanNotice({ tone: 'info', text: '正在向省财政电子票据平台申请开具电子票据...' })
      const issued = await api.billing.issueSettlementReceipt(settlementId, {
        idempotencyKey: `RCPT-${crypto.randomUUID()}`,
        receiptType: 'MEDICAL_E_INVOICE',
        issueChannel: 'CASHIER',
        fiscalAuthorityCode: '360100',
        payerName: selected?.residentName,
      })
      queryClient.setQueryData<Record<string, ReceiptView[]>>(receiptQueryKey, (prev) => ({
        ...prev,
        [settlementId]: [issued, ...(prev?.[settlementId] ?? []).filter((value) => value.id !== issued.id)],
      }))
      setActiveReceipt(issued)
      setFiscalModalOpen(true)
      setScanNotice({
        tone: issued.status === 'ISSUED' ? 'success' : issued.status === 'REQUESTED' ? 'info' : 'warning',
        text: issued.status === 'ISSUED'
          ? `财政电子票据已开具，票据号码：${issued.fiscalNumber || '未返回'}`
          : issued.errorMessage || (issued.status === 'REQUESTED' ? '票据开具处理中，尚未确认成功。' : '票据未开具成功，请核实处理结果。'),
      })
    } catch (err: unknown) {
      setScanNotice({
        tone: 'warning',
        text: err instanceof Error ? err.message : '开具财政电子票据失败，请重试',
      })
    }
  }

  const synchronize = useMutation({
    mutationFn: () => api.billing.synchronize(encounterId, `BIL-SYNC-${encounterId}-${Date.now()}`), onSuccess: refresh,
  })
  const invoicedChargeIds = useMemo(() => {
    if (!statement.data) return new Set<string>()
    return new Set(statement.data.invoices.flatMap((inv) => inv.lines.map((line) => line.chargeItemId)))
  }, [statement.data])

  const documentGroups = useMemo(() => {
    if (!statement.data) return []
    const map = new Map<string, BillingDocumentGroup>()

    for (const charge of statement.data.charges) {
      let docType: BillingDocumentGroup['docType'] = 'OTHER'
      let docTypeName = '门诊综合费用'
      let docNo = charge.requestCode || charge.sourceId || charge.id

      if (charge.sourceType.startsWith('MEDICATION')) {
        docType = 'PRESCRIPTION'
        docTypeName = '药品处方单'
        docNo = charge.requestCode || `CF-${charge.sourceId}`
      } else if (charge.sourceType.startsWith('SERVICE')) {
        docType = 'SERVICE'
        docTypeName = '检查/检验处置单'
        docNo = charge.requestCode || `EX-${charge.sourceId}`
      } else if (charge.sourceType === 'DIRECT_VISIT_SERVICE') {
        docType = 'SERVICE'
        docTypeName = '门诊服务费'
      } else if (charge.sourceType === 'REGISTRATION') {
        docType = 'REGISTRATION'
        docTypeName = '挂号诊查费'
        docNo = charge.requestCode || `GH-${charge.sourceId}`
      }

      const groupKey = `${docType}_${docNo}`
      let group = map.get(groupKey)
      if (!group) {
        const isExpired = docType === 'PRESCRIPTION' &&
          (Date.now() - new Date(charge.occurredAt).getTime()) > 72 * 3600 * 1000
        group = {
          id: groupKey,
          docType,
          docTypeName,
          docNo,
          occurredAt: charge.occurredAt,
          isExpired,
          charges: [],
          totalAmount: 0,
          uninvoicedAmount: 0,
          invoicedCount: 0,
          uninvoicedCount: 0,
        }
        map.set(groupKey, group)
      }

      group.charges.push(charge)
      group.totalAmount += charge.totalAmount
      if (invoicedChargeIds.has(charge.id)) {
        group.invoicedCount += 1
      } else {
        group.uninvoicedCount += 1
        group.uninvoicedAmount += charge.totalAmount
      }
    }

    return Array.from(map.values())
  }, [statement.data, invoicedChargeIds])

  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())
  const [collapsedDocIds, setCollapsedDocIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!statement.data) {
      setSelectedChargeIds(new Set())
      return
    }
    const uninvoiced = statement.data.charges
      .filter((c) => !invoicedChargeIds.has(c.id))
      .map((c) => c.id)
    setSelectedChargeIds(new Set(uninvoiced))
  }, [statement.data?.accountId, statement.data?.revision, invoicedChargeIds])

  const toggleCharge = (id: string) => {
    setSelectedChargeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDocumentGroup = (group: BillingDocumentGroup) => {
    const uninvoicedInGroup = group.charges.filter((c) => !invoicedChargeIds.has(c.id)).map((c) => c.id)
    const allSelected = uninvoicedInGroup.length > 0 && uninvoicedInGroup.every((id) => selectedChargeIds.has(id))
    setSelectedChargeIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        uninvoicedInGroup.forEach((id) => next.delete(id))
      } else {
        uninvoicedInGroup.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const selectAllUninvoiced = () => {
    if (!statement.data) return
    const uninvoiced = statement.data.charges.filter((c) => !invoicedChargeIds.has(c.id)).map((c) => c.id)
    setSelectedChargeIds(new Set(uninvoiced))
  }

  const invertSelection = () => {
    if (!statement.data) return
    const uninvoiced = statement.data.charges.filter((c) => !invoicedChargeIds.has(c.id)).map((c) => c.id)
    setSelectedChargeIds((prev) => {
      const next = new Set<string>()
      uninvoiced.forEach((id) => {
        if (!prev.has(id)) next.add(id)
      })
      return next
    })
  }

  const toggleDocCollapse = (docId: string) => {
    setCollapsedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  const selectedChargesAmount = useMemo(() => {
    if (!statement.data) return 0
    return statement.data.charges
      .filter((c) => selectedChargeIds.has(c.id) && !invoicedChargeIds.has(c.id))
      .reduce((sum, c) => sum + c.totalAmount, 0)
  }, [statement.data, selectedChargeIds, invoicedChargeIds])

  const totalUninvoicedCount = useMemo(() => {
    if (!statement.data) return 0
    return statement.data.charges.filter((c) => !invoicedChargeIds.has(c.id)).length
  }, [statement.data, invoicedChargeIds])

  const canInvoice = selectedChargeIds.size > 0

  const payableSettlements = useMemo(() => statement.data?.settlements.filter((settlement) =>
    settlement.settlementType === 'NORMAL' && settlement.outstandingAmount > 0) ?? [], [statement.data])

  const settlementOptions = useMemo(() => [
    ...(canInvoice && statement.data && selectedChargesAmount > 0 ? [{
      id: draftSettlementId,
      code: `本次勾选结算 (${selectedChargeIds.size} 项)`,
      outstandingAmount: selectedChargesAmount,
      currencyCode: statement.data.currencyCode,
      insuranceReady: false,
      insurancePreparationAllowed: true,
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
  ], [canInvoice, selectedChargeIds.size, selectedChargesAmount, payableSettlements, statement.data])

  const insuranceTarget = (settlementId: string, current = statement.data): InsuranceResultTarget => {
    const target = current?.settlements.find(value => value.id === settlementId)
    if (!current || current.encounterId !== encounterId || current.accountId !== selected?.accountId
      || current.organizationId !== clinicalContext.organization.id || current.departmentId !== clinicalContext.department.id
      || !target || target.patientAccountId !== current.accountId || target.settlementType !== 'NORMAL'
      || target.currencyCode !== current.currencyCode || !Number.isFinite(target.netAmount) || target.netAmount <= 0) {
      throw new Error('医保结果未确认：当前患者的结算资料不完整或不一致，请重新加载后核实。')
    }
    return { settlementId, patientAccountId: current.accountId, currencyCode: current.currencyCode, grossAmount: target.netAmount }
  }
  const finalInsuranceTarget = (settlementId: string) => {
    const target = insuranceTarget(settlementId)
    if (!insuranceClaimView || insuranceClaimView.settlementId !== target.settlementId
      || insuranceClaimView.patientAccountId !== target.patientAccountId) {
      throw new Error('医保结果未确认：试算申请与当前结算单不一致，请重新选择对应结算单。')
    }
    // Patient-payment rounding can update the settlement after the claim was finalized.
    // Retries must verify the original confirmed claim amount.
    return { ...target, grossAmount: insuranceClaimView.grossAmount, claimId: insuranceClaimView.claimId }
  }

  const handlePreSettleInsurance = async (targetSettlementId: string) => {
    const session = captureInsuranceSession()
    let finalSettlementId = targetSettlementId
    let currentStatement = statement.data
    setIsPreSettlingInsurance(true)
    try {
      session.check()
      if (finalSettlementId === draftSettlementId) {
        setCheckoutStage('CREATING_SETTLEMENT')
        const idempotencySuffix = crypto.randomUUID()
        const invoice = await api.billing.issueInvoice(
          statement.data!.accountId,
          `INV-CHS-${idempotencySuffix}`,
          undefined,
          Array.from(selectedChargeIds),
        )
        session.check()
        const updatedStatement = await api.billing.statement(encounterId)
        session.check()
        currentStatement = updatedStatement
        const createdSettlement = updatedStatement.settlements.find((value) =>
          value.legacyInvoiceId === invoice.id && value.settlementType === 'NORMAL')
        if (!createdSettlement) throw new Error('结算单已生成，但暂未读取到结算信息，请重试。')
        finalSettlementId = createdSettlement.id
      }

      session.check()
      const target = insuranceTarget(finalSettlementId, currentStatement)
      let keys = preSettlementKeys.current.get(api)
      if (!keys) { keys = new Map(); preSettlementKeys.current.set(api, keys) }
      const key = keys.get(finalSettlementId) ?? `PRE-CHS-${crypto.randomUUID()}`
      keys.set(finalSettlementId, key)
      const receipt = await api.billing.quickPreSettleInsurance(finalSettlementId, { idempotencyKey: key })
      const preResult = await confirmInsuranceResult(api.billing, receipt, 'PRE_SETTLED', target, session.check)
      setInsuranceClaimView(preResult)
      setScanNotice({
        tone: 'success',
        text: `国家医保预结算试算成功（流水号 ${preResult.externalPreSettlementNo}）：统筹报销 ${money(preResult.insuranceFundAmount, preResult.currencyCode)}，个账抵扣 ${money(preResult.personalAccountAmount, preResult.currencyCode)}，现金自付 ${money(preResult.patientCashAmount, preResult.currencyCode)}`,
      })
      await refresh()
      return preResult
    } catch (err: unknown) {
      if (!session.isCurrent()) return null
      setScanNotice({
        tone: 'warning',
        text: err instanceof Error ? err.message : '医保预结算失败，请重试',
      })
      setInsuranceClaimView(null)
      return null
    } finally {
      if (session.isCurrent()) { setIsPreSettlingInsurance(false); setCheckoutStage('IDLE') }
    }
  }

  const checkout = useMutation({
    mutationFn: async (command: SettlementPaymentCommand) => {
      const session = captureInsuranceSession()
      session.check()
      let settlementId = command.settlementId

      // 医保模式且已试算：先执行医保正式结算 (2207)
      if (settlementMode === 'MEDICAL_INSURANCE' && insuranceClaimView) {
        setCheckoutStage('CREATING_PAYMENT')
        if (!Number.isFinite(command.amount) || command.amount < 0) throw new Error('收款金额无效，请重新核实。')
        const target = finalInsuranceTarget(command.settlementId)
        const receipt = await api.billing.settleInsurance(insuranceClaimView.claimId, `CHS-SETL-${insuranceClaimView.claimId}`)
        const settledClaim = await confirmInsuranceResult(api.billing, receipt, 'SETTLED', target, session.check)
        setInsuranceClaimView(settledClaim)
        if (!Number.isFinite(command.roundingAdjustment ?? 0) || Math.abs(command.amount - (command.roundingAdjustment ?? 0) - settledClaim.patientCashAmount) > 0.005) {
          throw new Error('医保已结算，自付金额与试算不一致，请刷新结算余额后收款。')
        }

        // 若有现金自付且选择了现金等方式支付：
        if (settledClaim.patientCashAmount > 0 && command.amount > 0 && command.paymentMethodCode) {
          return api.billing.createPaymentOrder(settledClaim.settlementId, {
            idempotencyKey: command.idempotencyKey,
            businessScene: 'OUTPATIENT',
            paymentSceneCode: 'CASHIER',
            paymentMethodCode: command.paymentMethodCode,
            amount: command.amount,
            roundingAdjustment: command.roundingAdjustment,
            terminalCode: 'CASHIER-WEB',
          })
        }
        return settledClaim
      }

      if (settlementId === draftSettlementId) {
        setCheckoutStage('CREATING_SETTLEMENT')
        const invoice = await api.billing.issueInvoice(
          statement.data!.accountId,
          `INV-${command.idempotencyKey.replace(/^PAY-/, '')}`,
          undefined,
          Array.from(selectedChargeIds),
        )
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
        paymentMethodCode: command.paymentMethodCode, amount: command.amount,
        roundingAdjustment: command.roundingAdjustment, terminalCode: 'CASHIER-WEB',
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

  const handleInitiateScanPay = async (command: {
    settlementId: string
    paymentMethodCode: string
    paymentMethodName: string
    amount: number
  }) => {
    const session = captureInsuranceSession()
    let finalSettlementId = command.settlementId
    let finalSettlementCode = settlementOptions.find((s) => s.id === command.settlementId)?.code

    if (settlementMode === 'MEDICAL_INSURANCE' && insuranceClaimView) {
      setCheckoutStage('CREATING_PAYMENT')
      try {
        session.check()
        if (!Number.isFinite(command.amount) || command.amount < 0) throw new Error('收款金额无效，请重新核实。')
        const target = finalInsuranceTarget(command.settlementId)
        const receipt = await api.billing.settleInsurance(insuranceClaimView.claimId, `CHS-SETL-${insuranceClaimView.claimId}`)
        const settledClaim = await confirmInsuranceResult(api.billing, receipt, 'SETTLED', target, session.check)
        finalSettlementId = settledClaim.settlementId
        setInsuranceClaimView(settledClaim)
        if (Math.abs(command.amount - settledClaim.patientCashAmount) > 0.005) {
          await refresh()
          session.check()
          throw new Error('医保已结算，自付金额与试算不一致，请刷新结算余额后收款。')
        }
      } catch (err: unknown) {
        if (!session.isCurrent()) return
        setScanNotice({
          tone: 'warning',
          text: err instanceof Error ? err.message : '医保结算失败，无法发起自付收款',
        })
        setCheckoutStage('IDLE')
        return
      }
    } else if (finalSettlementId === draftSettlementId) {
      setCheckoutStage('CREATING_SETTLEMENT')
      try {
        const idempotencySuffix = crypto.randomUUID()
        const invoice = await api.billing.issueInvoice(
          statement.data!.accountId,
          `INV-${idempotencySuffix}`,
          undefined,
          Array.from(selectedChargeIds),
        )
        session.check()
        const updatedStatement = await api.billing.statement(encounterId)
        session.check()
        const createdSettlement = updatedStatement.settlements.find((value) =>
          value.legacyInvoiceId === invoice.id && value.settlementType === 'NORMAL')
        if (!createdSettlement) throw new Error('结算单已生成，但暂未读取到支付信息，请刷新后继续。')
        finalSettlementId = createdSettlement.id
        finalSettlementCode = createdSettlement.settlementNo
      } catch (err: unknown) {
        setScanNotice({
          tone: 'warning',
          text: err instanceof Error ? err.message : '生成结算单失败，请重试',
        })
        return
      } finally {
        setCheckoutStage('IDLE')
      }
    }

    if (!session.isCurrent()) return
    setCheckoutStage('IDLE')
    setScanModalState({
      open: true,
      settlementId: finalSettlementId,
      settlementCode: finalSettlementCode,
      paymentMethodCode: command.paymentMethodCode,
      paymentMethodName: command.paymentMethodName,
      amount: command.amount,
    })
  }

  useBarcodeScanner({
    onScan: (scannedText) => {
      const code = scannedText.trim().toLowerCase()
      if (!code) return
      const target = settlementItems.find((item) => {
        const encNo = (item.encounterNo || '').toLowerCase()
        const healthNo = (item.healthRecordNo || '').toLowerCase()
        const resId = (item.residentId || '').toLowerCase()
        const encId = (item.encounterId || '').toLowerCase()
        return encNo === code || healthNo === code || resId === code || encId === code
          || (code.length >= 8 && encNo.includes(code))
      })
      if (target) {
        setEncounterId(target.encounterId)
        setScanNotice({
          tone: 'success',
          text: `已扫码定位患者：${target.residentName}（就诊号 ${target.encounterNo}）`,
        })
      } else {
        const settledMatch = (worklist.data ?? []).find((item) => {
          const encNo = (item.encounterNo || '').toLowerCase()
          const healthNo = (item.healthRecordNo || '').toLowerCase()
          return encNo === code || healthNo === code
        })
        if (settledMatch) {
          setScanNotice({
            tone: 'warning',
            text: `已识别就诊 ${settledMatch.encounterNo}（${settledMatch.residentName}），该就诊已完成结算平账。`,
          })
        } else {
          setScanNotice({
            tone: 'warning',
            text: `未在待收费队列中找到条码 [${scannedText}] 对应的患者。`,
          })
        }
      }
    },
    enabled: Boolean(worklist.data && worklist.data.length > 0),
  })

  useEffect(() => {
    if (!scanNotice) return
    const timer = setTimeout(() => setScanNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [scanNotice])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')

      if (e.key === 'F1') {
        e.preventDefault()
        handleResetPatient()
        return
      }

      if (e.key === 'F2') {
        e.preventDefault()
        if (!settlementItems.length) return
        const currentIdx = settlementItems.findIndex((item) => item.encounterId === encounterId)
        const nextIdx = currentIdx < settlementItems.length - 1 ? currentIdx + 1 : 0
        setIsManualSelecting(false)
        setEncounterId(settlementItems[nextIdx].encounterId)
        return
      }

      if (!isInput && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!settlementItems.length) return
        e.preventDefault()
        const currentIdx = settlementItems.findIndex((item) => item.encounterId === encounterId)
        if (e.key === 'ArrowDown') {
          const nextIdx = currentIdx < settlementItems.length - 1 ? currentIdx + 1 : 0
          setIsManualSelecting(false)
          setEncounterId(settlementItems[nextIdx].encounterId)
        } else {
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : settlementItems.length - 1
          setIsManualSelecting(false)
          setEncounterId(settlementItems[prevIdx].encounterId)
        }
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [encounterId, handleResetPatient, settlementItems])

  const error = worklist.error || paymentMethods.error || statement.error || paymentOrders.error
    || synchronize.error || checkout.error || recoverPaymentOrder.error
  const currency = statement.data?.currencyCode ?? selected?.currencyCode ?? 'CNY'
  const timelineCount = (statement.data?.invoices.length ?? 0) + (statement.data?.payments.length ?? 0)
    + allCurrentReceipts.length

  return <div className="billing-page">
    <PageHeader compact eyebrow="收费管理" title="收费结算" description="处理费用核对、结算和患者收款。" />
    {error && <Alert>{errorMessage(error)}</Alert>}
    {scanNotice && <Alert tone={scanNotice.tone} onDismiss={() => setScanNotice(null)}>{scanNotice.text}</Alert>}
    {worklist.isPending ? <LoadingState label="正在加载收费队列…" /> : <div className="billing-workspace-scroll">
      <div className="billing-workspace">
      <BillingQueue title="待收费患者" items={settlementItems} selectedId={encounterId}
        onSelect={(id) => {
          setIsManualSelecting(false)
          setEncounterId(id)
        }}
        action={
          <Button
            variant="text"
            onClick={() => void refresh()}
            busy={worklist.isPending}
            title="刷新待收费列表"
            aria-label="刷新待收费列表"
          >
            <Icon name="refresh" />
          </Button>
        }
        emptyTitle="暂无待收费患者" emptyCopy="当前没有待计费、待结算或待收款业务。"
        keyword={patientLookup} onKeywordChange={setPatientLookup} showSearch={false} />
      <main className="billing-main-workspace">
        <section className={`billing-patient-strip ${selected ? 'has-patient' : ''}`}>
          {selected ? (
            <div className="billing-patient-identity">
              <span className={`resident-avatar billing-patient-identity__avatar ${selected.gender?.toLowerCase() || ''}`}>
                {selected.residentName?.slice(-1) || '患'}
              </span>
              <div className="billing-patient-identity__content">
                <div className="billing-patient-identity__header">
                  <strong className="billing-patient-identity__name">{selected.residentName || '姓名未提供'}</strong>
                  <span className="billing-patient-identity__tag">
                    {selected.genderText ?? '未知'}
                    {selected.birthDate ? ` · ${age(selected.birthDate)} 岁` : ''}
                  </span>
                  <span className={`billing-patient-identity__mode-badge ${settlementMode === 'MEDICAL_INSURANCE' ? 'is-insurance' : 'is-selfpay'}`}>
                    <Icon name={settlementMode === 'MEDICAL_INSURANCE' ? 'check' : 'billing'} />
                    {settlementMode === 'MEDICAL_INSURANCE' ? '医保结算' : '自费结算'}
                  </span>
                  {selected.birthDate && age(selected.birthDate) >= 65 && (
                    <span className="billing-patient-identity__senior-badge">
                      <Icon name="check" /> 65岁以上老年优待
                    </span>
                  )}
                </div>
                <div className="billing-patient-identity__meta">
                  <span><small>就诊号：</small><code>{selected.encounterNo || '未登记'}</code></span>
                  <span><small>健康档案号：</small><code>{selected.healthRecordNo || '未登记'}</code></span>
                  <span><small>当前门诊科室：</small><code>{clinicalContext.department.name}</code></span>
                </div>
              </div>
              <Button
                className="billing-patient-reset"
                size="sm"
                variant="secondary"
                onClick={handleResetPatient}
              >
                <Icon name="refresh" />
                <span>重新选择</span>
              </Button>
            </div>
          ) : (
            <div className="billing-patient-lookup-bar">
              <div className="billing-patient-lookup__control">
                <SearchField inputRef={searchInputRef} label="患者检索" value={patientLookup}
                  placeholder="输入姓名 / 就诊卡号 / 医保码快速检索并按回车确认 (F1)"
                  onChange={setPatientLookup}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    const code = patientLookup.trim().toLowerCase()
                    const match = settlementItems.find((item) => !code || [item.residentName, item.encounterNo,
                      item.healthRecordNo, item.residentId].some((value) => value?.toLowerCase().includes(code)))
                    if (match) {
                      setIsManualSelecting(false)
                      setEncounterId(match.encounterId)
                    }
                  }} />
              </div>
              <div className="billing-patient-placeholder">
                <Icon name="residents" />
                <span>可从左侧待收费队列直接点击选择，或输入关键字回车快速定位</span>
              </div>
            </div>
          )}
        </section>

        <div className="billing-workbench">
      <Panel className="billing-statement">
        <PanelHead title="费用明细与单据"
          meta={statement.data && `共 ${documentGroups.length} 张单据 · ${statement.data.charges.length} 项收费`}
          actions={<div className="billing-section-head__actions billing-selection-toolbar">
            {selected?.status === 'PENDING_CHARGE' && (
              <Button size="sm" onClick={() => synchronize.mutate()} busy={synchronize.isPending}>同步计费</Button>
            )}
            {statement.data && totalUninvoicedCount > 0 && (
              <div className="billing-selection-actions">
                <label className="billing-check-all-label">
                  <input
                    type="checkbox"
                    checked={selectedChargeIds.size === totalUninvoicedCount && totalUninvoicedCount > 0}
                    onChange={() => {
                      if (selectedChargeIds.size === totalUninvoicedCount) setSelectedChargeIds(new Set())
                      else selectAllUninvoiced()
                    }}
                  />
                  <span>全选待结</span>
                </label>
                <Button variant="secondary" size="sm" onClick={invertSelection}>反选</Button>
                <span className="billing-selection-summary">
                  已勾选总金额 <strong className="billing-selection-summary__amount">{money(selectedChargesAmount, currency)}</strong>
                  <span> · {selectedChargeIds.size} / {totalUninvoicedCount} 项</span>
                </span>
              </div>
            )}
          </div>} />
        {!selected ? (
          <EmptyState icon="billing" title="请选择待收费患者" copy="在左侧待收费列表中选择患者后查看费用明细及办理结算。" />
        ) : !selected.accountId ? (
          <EmptyState icon="billing" title="尚未形成费用账户"
            copy="同步本次就诊的收费来源后即可结算。"
            action={<Button onClick={() => synchronize.mutate()} busy={synchronize.isPending}>生成收费事项</Button>} />
        ) : statement.isLoading ? (
          <LoadingState label="正在加载费用明细…" />
        ) : statement.error ? (
          <Alert>{errorMessage(statement.error)}</Alert>
        ) : statement.data ? (
          <>
            <section className="billing-table-section">

              <div className="billing-doc-groups">
                {documentGroups.map((group) => {
                  const uninvoicedCharges = group.charges.filter((c) => !invoicedChargeIds.has(c.id))
                  const isCollapsed = collapsedDocIds.has(group.id)
                  const allGroupSelected = uninvoicedCharges.length > 0 && uninvoicedCharges.every((c) => selectedChargeIds.has(c.id))
                  const someGroupSelected = uninvoicedCharges.some((c) => selectedChargeIds.has(c.id)) && !allGroupSelected
                  const isFullyInvoiced = group.uninvoicedCount === 0

                  return (
                    <div key={group.id} className={`billing-doc-card ${isFullyInvoiced ? 'is-settled' : ''}`}>
                      <header className="billing-doc-card__header">
                        <div className="billing-doc-card__meta">
                          {!isFullyInvoiced ? (
                            <input
                              type="checkbox"
                              aria-label={`勾选单据 ${group.docNo}`}
                              checked={allGroupSelected}
                              ref={(el) => { if (el) el.indeterminate = someGroupSelected }}
                              onChange={() => toggleDocumentGroup(group)}
                            />
                          ) : (
                            <span className="billing-doc-card__settled-icon" title="该单据已全部结算"><Icon name="check" /></span>
                          )}
                          <span className={`billing-doc-type-icon billing-doc-type-icon--${group.docType.toLowerCase()}`}>
                            <Icon name={group.docType === 'PRESCRIPTION' ? 'pill' : group.docType === 'SERVICE' ? 'clinical' : group.docType === 'REGISTRATION' ? 'user' : 'billing'} />
                          </span>
                          <div className="billing-doc-card__titles">
                            <strong>{group.docTypeName}</strong>
                            <code>{group.docNo}</code>
                            {group.charges.length > 1 && (
                              <StatusBadge tone="neutral">{group.charges.length} 项明细</StatusBadge>
                            )}
                          </div>
                          {group.isExpired && (
                            <StatusBadge tone="warning">处方已超72小时</StatusBadge>
                          )}
                          {isFullyInvoiced ? (
                            <StatusBadge tone="success">已全额结算</StatusBadge>
                          ) : group.invoicedCount > 0 ? (
                            <StatusBadge tone="info">部分已结 ({group.invoicedCount}/{group.charges.length})</StatusBadge>
                          ) : null}
                        </div>
                        <div className="billing-doc-card__right">
                          <span className="billing-doc-card__amount">
                            小计 <strong>{money(group.totalAmount, currency)}</strong>
                          </span>
                          <Button variant="text"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleDocCollapse(group.id)}
                            aria-label={isCollapsed ? '展开单据明细' : '折叠单据明细'}
                          >
                            <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} />
                          </Button>
                        </div>
                      </header>

                      {!isCollapsed && (
                        <div className="billing-doc-card__body">
                          <DataTable compact aria-label="单据费用明细">
                            <thead>
                              <tr>
                                <th className={tableCellClass('control')} aria-label="选择项目"></th>
                                <th>项目名称</th>
                                <th className={tableCellClass('numeric')}>数量</th>
                                <th className={tableCellClass('numeric')}>单价</th>
                                <th className={tableCellClass('numeric')}>金额</th>
                                <th>开单时间</th>
                                <th className={tableCellClass('status')}>结算状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.charges.map((charge) => {
                                const isInvoiced = invoicedChargeIds.has(charge.id)
                                const isSelected = selectedChargeIds.has(charge.id)
                                return (
                                  <tr key={charge.id} className={isSelected && !isInvoiced ? 'is-selected' : ''}>
                                    <td className={tableCellClass('control')}>
                                      {!isInvoiced ? (
                                        <input
                                          type="checkbox"
                                          aria-label={`勾选项目 ${charge.itemName}`}
                                          checked={isSelected}
                                          onChange={() => toggleCharge(charge.id)}
                                        />
                                      ) : (
                                        <Icon name="check" className="billing-item-settled-check" />
                                      )}
                                    </td>
                                    <td>
                                      <div className="billing-table-item-name">
                                         <div className="billing-table-item-main">
                                           <strong className="billing-table-item-title">
                                             {formatItemDisplayName(charge.itemName, charge.packageSpec)}
                                           </strong>
                                           {charge.manufacturerName && (
                                             <div className="billing-table-item-manufacturer">
                                               {charge.manufacturerName}
                                             </div>
                                           )}
                                         </div>
                                        {charge.totalAmount < 0 && (
                                          <StatusBadge tone="warning">冲正</StatusBadge>
                                        )}
                                      </div>
                                    </td>
                                    <td className={tableCellClass('numeric')}>{charge.quantity} {formatUnit(charge.unitCode, charge.unitName)}</td>
                                    <td className={tableCellClass('numeric')}>{money(charge.unitPrice, charge.currencyCode)}</td>
                                    <td className={tableCellClass('numeric')}>
                                      {money(charge.totalAmount, charge.currencyCode)}
                                    </td>
                                    <td>{new Date(charge.occurredAt).toLocaleString('zh-CN')}</td>
                                    <td className={tableCellClass('status')}>
                                      {isInvoiced ? (
                                        <StatusBadge tone="success">已结</StatusBadge>
                                      ) : (
                                        <StatusBadge tone="warning">未结</StatusBadge>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </DataTable>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
            {timelineCount > 0 && <details className="billing-history-panel">
              <summary><span>结算与支付记录 · {timelineCount} 条</span><Icon name="chevron-down" /></summary>
              <BillingTimeline
                invoices={statement.data.invoices}
                payments={statement.data.payments}
                receipts={allCurrentReceipts}
                currency={currency}
                onViewReceipt={(receipt) => {
                  setActiveReceipt(receipt)
                  setFiscalModalOpen(true)
                }}
              />
            </details>}
          </>
        ) : null}
      </Panel>
      <CashierPanel className="billing-payment-panel" title="收费结算"
        amountLabel="待支付金额"
        amount={money(selectedChargesAmount || statement.data?.accountBalance || 0, currency)}
        meta={selected ? (settlementMode === 'MEDICAL_INSURANCE' ? '医保实时结算' : '自费结算') : '待选择患者'}>
        {!selected ? (
          <EmptyState icon="billing" title="请先选择患者" copy="选定患者并确认费用明细后在此办理结算与支付。" />
        ) : !selected.accountId ? (
          <EmptyState icon="billing" title="等待生成收费事项" copy="请先在费用明细面板中同步计费以生成费用账户。" />
        ) : (
          <>
            <div className="billing-action-form">
              <SettlementPaymentPanel key={`${encounterId}-${selected.accountId}`} settlements={settlementOptions}
                methods={paymentMethods.options}
                methodsStatus={paymentMethods.status}
                onReloadMethods={() => { void paymentMethods.refetch() }}
                orders={paymentOrders.data ?? []} busy={checkout.isPending || isPreSettlingInsurance} targetLabel="结算范围"
                showSettlementMode settlementModeCode={settlementMode} onSettlementModeChange={(mode) => {
                  setSettlementMode(mode)
                  setInsuranceClaimView(null)
                }}
                showAmountInput={false}
                actionLabel="结算开票 (Ctrl+Enter)" busyLabel={checkoutStage === 'CREATING_SETTLEMENT' ? '正在生成结算单' : isPreSettlingInsurance ? '正在试算医保' : '正在支付'}
                recoveringOrderId={recoverPaymentOrder.isPending ? recoverPaymentOrder.variables : undefined}
                onRecoverOrder={(order) => recoverPaymentOrder.mutateAsync(order.id)}
                onInitiateScanPay={handleInitiateScanPay}
                insuranceIntegrated
                insuranceClaimView={insuranceClaimView}
                onPreSettleInsurance={handlePreSettleInsurance}
                onCancelInsurancePreSettle={() => setInsuranceClaimView(null)}
                isPreSettlingInsurance={isPreSettlingInsurance}
                submitShortcut
                onSubmit={(command) => checkout.mutateAsync(command)} />
            </div>
            {statement.data && statement.data.settlements.length > 0 && (
              <div className="fiscal-receipt-entry-banner">
                <div className="fiscal-receipt-entry-banner__left">
                  <Icon name="billing" className="fiscal-receipt-entry-icon" />
                  <div>
                    <strong>财政医疗收费电子票据</strong>
                    <p>查看平台返回的票据信息、校验码与原件链接</p>
                  </div>
                </div>
                <div className="fiscal-receipt-entry-banner__right">
                  {receipts.isFetching ? <LoadingState label="正在查询已有票据…" />
                    : receipts.isError ? <div>
                      <Alert tone="warning">票据查询失败，尚不能确认是否已开票，请重试查询。</Alert>
                      <Button variant="secondary" onClick={() => void receipts.refetch()}>重试票据查询</Button>
                    </div>
                    : allCurrentReceipts.length > 0 ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setActiveReceipt(allCurrentReceipts[0])
                        setFiscalModalOpen(true)
                      }}
                    >
                      <Icon name="check" />
                      查看电子票据
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const normalSettlement = statement.data?.settlements.find((s) => s.settlementType === 'NORMAL')
                        if (normalSettlement) {
                          handleOpenOrIssueReceipt(normalSettlement.id)
                        }
                      }}
                    >
                      <Icon name="add" />
                      开具电子票据
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CashierPanel>
        </div>
      </main>
      </div>
    </div>}
    <AggregatedPaymentModal
      open={scanModalState.open}
      onClose={() => setScanModalState((prev) => ({ ...prev, open: false }))}
      paymentMethodCode={scanModalState.paymentMethodCode}
      paymentMethodName={scanModalState.paymentMethodName}
      amount={scanModalState.amount}
      currencyCode={statement.data?.currencyCode}
      settlementId={scanModalState.settlementId}
      settlementCode={scanModalState.settlementCode}
      onPaymentSuccess={async (order) => {
        setScanModalState((prev) => ({ ...prev, open: false }))
        setScanNotice({
          tone: 'success',
          text: `${scanModalState.paymentMethodName}扣款成功（单号：${order.orderNo}），已完成实收记账！`,
        })
        await refresh()
      }}
      api={api}
    />
    <FiscalReceiptModal
      open={fiscalModalOpen}
      onClose={() => setFiscalModalOpen(false)}
      receipt={activeReceipt}
      settlement={statement.data?.settlements.find((s) => s.id === activeReceipt?.settlementId)}
      onPrint={async (receiptId) => {
        try {
          await api.billing.printReceipt(receiptId, `PRINT-${Date.now()}`)
        } catch {
          // ignore error for print logging
        }
      }}
    />
  </div>
}

function insuranceSettlementReady(settlement: AccountStatement['settlements'][number]) {
  const latestInsuranceEvent = [...settlement.events]
    .filter((value) => value.commandCode.startsWith('INSURANCE-'))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  if (latestInsuranceEvent) return latestInsuranceEvent.eventType !== 'REVERSE_COMPLETE'
  return settlement.insuranceAmount > 0 || settlement.tenders.some((value) => Boolean(value.claimResponseId))
}
