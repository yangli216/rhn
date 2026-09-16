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
import { CashierPanel } from '../../shared/billing/CashierPanel'
import { AggregatedPaymentModal } from '../../shared/billing/AggregatedPaymentModal'
import { FiscalReceiptModal } from '../../shared/billing/FiscalReceiptModal'
import { Alert, Button, EmptyState, LoadingState, PageHeader, Panel, StatusBadge } from '../../shared/ui'
import { Icon } from '../../shared/ui/Icon'
import { age, genderLabel } from '../../shared/format'
import { BillingQueue, BillingTimeline, money } from './BillingShared'

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
  const [settlementReceiptsMap, setSettlementReceiptsMap] = useState<Record<string, ReceiptView[]>>({})
  const searchInputRef = useRef<HTMLInputElement>(null)
  const completedPaymentMarker = useRef('')
  const worklist = useQuery({ queryKey: ['billing-worklist'], queryFn: api.billing.worklist })
  const settlementItems = useMemo(() => (worklist.data ?? []).filter((item) => settlementStatuses.has(item.status)),
    [worklist.data])
  const paymentMethods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'),
  })

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
  }, [encounterId])
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

  const settlements = useMemo(() => statement.data?.settlements ?? [], [statement.data?.settlements])
  useEffect(() => {
    if (!settlements.length) return
    let isMounted = true
    Promise.all(
      settlements.map((s) =>
        (typeof api.billing.settlementReceipts === 'function'
          ? api.billing.settlementReceipts(s.id)
          : Promise.resolve([] as ReceiptView[])
        )
          .then((receipts) => ({ settlementId: s.id, receipts: receipts || [] }))
          .catch(() => ({ settlementId: s.id, receipts: [] as ReceiptView[] }))
      )
    ).then((results) => {
      if (!isMounted) return
      const map: Record<string, ReceiptView[]> = {}
      for (const res of results) {
        map[res.settlementId] = res.receipts
      }
      setSettlementReceiptsMap(map)
    })
    return () => { isMounted = false }
  }, [settlements, api])

  const allCurrentReceipts = useMemo(() => {
    return Object.values(settlementReceiptsMap).flat()
  }, [settlementReceiptsMap])

  const handleOpenOrIssueReceipt = async (settlementId: string) => {
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
        payerName: selected?.residentName || '门诊患者',
      })
      setSettlementReceiptsMap((prev) => ({
        ...prev,
        [settlementId]: [issued, ...(prev[settlementId] || [])],
      }))
      setActiveReceipt(issued)
      setFiscalModalOpen(true)
      setScanNotice({
        tone: 'success',
        text: `财政电子票据开具成功！票据代码：${issued.fiscalCode || '3601060126'}，号码：${issued.fiscalNumber || issued.receiptNo}`,
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

  const handlePreSettleInsurance = async (targetSettlementId: string) => {
    let finalSettlementId = targetSettlementId
    setIsPreSettlingInsurance(true)
    try {
      if (finalSettlementId === draftSettlementId) {
        setCheckoutStage('CREATING_SETTLEMENT')
        const idempotencySuffix = crypto.randomUUID()
        const invoice = await api.billing.issueInvoice(
          statement.data!.accountId,
          `INV-CHS-${idempotencySuffix}`,
          undefined,
          Array.from(selectedChargeIds),
        )
        const updatedStatement = await api.billing.statement(encounterId)
        const createdSettlement = updatedStatement.settlements.find((value) =>
          value.legacyInvoiceId === invoice.id && value.settlementType === 'NORMAL')
        if (!createdSettlement) throw new Error('结算单已生成，但暂未读取到结算信息，请重试。')
        finalSettlementId = createdSettlement.id
      }

      const preResult = await api.billing.quickPreSettleInsurance(finalSettlementId)
      setInsuranceClaimView(preResult)
      setScanNotice({
        tone: 'success',
        text: `国家医保预结算试算成功（流水号 ${preResult.externalPreSettlementNo}）：统筹报销 ¥${preResult.insuranceFundAmount.toFixed(2)}，个账抵扣 ¥${preResult.personalAccountAmount.toFixed(2)}，现金自付 ¥${preResult.patientCashAmount.toFixed(2)}`,
      })
      await refresh()
      return preResult
    } catch (err: unknown) {
      setScanNotice({
        tone: 'warning',
        text: err instanceof Error ? err.message : '医保预结算失败，请重试',
      })
      throw err
    } finally {
      setIsPreSettlingInsurance(false)
      setCheckoutStage('IDLE')
    }
  }

  const checkout = useMutation({
    mutationFn: async (command: SettlementPaymentCommand) => {
      let settlementId = command.settlementId

      // 医保模式且已试算：先执行医保正式结算 (2207)
      if (settlementMode === 'MEDICAL_INSURANCE' && insuranceClaimView) {
        setCheckoutStage('CREATING_PAYMENT')
        const settledClaim = await api.billing.settleInsurance(
          insuranceClaimView.claimId,
          `CHS-SETL-${command.idempotencyKey.replace(/^PAY-/, '')}`,
        )
        setInsuranceClaimView(null)

        // 若有现金自付且选择了现金等方式支付：
        if (insuranceClaimView.patientCashAmount > 0 && command.amount > 0 && command.paymentMethodCode) {
          return api.billing.createPaymentOrder(insuranceClaimView.settlementId, {
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
    let finalSettlementId = command.settlementId
    let finalSettlementCode = settlementOptions.find((s) => s.id === command.settlementId)?.code

    if (settlementMode === 'MEDICAL_INSURANCE' && insuranceClaimView) {
      setCheckoutStage('CREATING_PAYMENT')
      try {
        await api.billing.settleInsurance(
          insuranceClaimView.claimId,
          `CHS-SETL-${crypto.randomUUID()}`,
        )
        finalSettlementId = insuranceClaimView.settlementId
        setInsuranceClaimView(null)
      } catch (err: unknown) {
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
        const updatedStatement = await api.billing.statement(encounterId)
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
    <PageHeader eyebrow="收费管理" title="收费结算" description="处理费用核对、结算和患者收款。" />
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
            size="sm"
            variant="secondary"
            onClick={() => void refresh()}
            busy={worklist.isPending}
            className="billing-queue-refresh-btn"
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
                    {genderLabel(selected.gender)}
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
                <Icon name="search" />
                <input ref={searchInputRef} type="search" value={patientLookup}
                  placeholder="输入姓名 / 就诊卡号 / 医保码快速检索并按回车确认 (F1)"
                  onChange={(event) => setPatientLookup(event.target.value)}
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
                {patientLookup && <button type="button" aria-label="清空患者检索" onClick={() => setPatientLookup('')}>
                  <Icon name="close" />
                </button>}
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
        <header className="billing-section-head">
          <div className="billing-section-head__title">
            <h2>费用明细与单据</h2>
            {statement.data && (
              <span>共 {documentGroups.length} 张单据 · {statement.data.charges.length} 项收费</span>
            )}
          </div>
          <div className="billing-section-head__actions">
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
          </div>
        </header>
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
                          <button
                            type="button"
                            className="billing-doc-card__collapse-btn"
                            onClick={() => toggleDocCollapse(group.id)}
                            aria-label={isCollapsed ? '展开单据明细' : '折叠单据明细'}
                          >
                            <Icon name={isCollapsed ? 'chevron-down' : 'chevron-up'} />
                          </button>
                        </div>
                      </header>

                      {!isCollapsed && (
                        <div className="billing-doc-card__body">
                          <table className="billing-table billing-table--compact">
                            <thead>
                              <tr>
                                <th style={{ width: '2.5rem' }}></th>
                                <th>项目名称</th>
                                <th>数量</th>
                                <th>单价</th>
                                <th>金额</th>
                                <th>开单时间</th>
                                <th>结算状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.charges.map((charge) => {
                                const isInvoiced = invoicedChargeIds.has(charge.id)
                                const isSelected = selectedChargeIds.has(charge.id)
                                return (
                                  <tr key={charge.id} className={isSelected && !isInvoiced ? 'is-selected' : ''}>
                                    <td>
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
                                    <td>{charge.quantity} {formatUnit(charge.unitCode, charge.unitName)}</td>
                                    <td>{money(charge.unitPrice, charge.currencyCode)}</td>
                                    <td className={charge.totalAmount < 0 ? 'is-negative' : ''}>
                                      {money(charge.totalAmount, charge.currencyCode)}
                                    </td>
                                    <td>{new Date(charge.occurredAt).toLocaleString('zh-CN')}</td>
                                    <td>
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
                          </table>
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
                methods={(paymentMethods.data ?? []).map((item) => ({
                  code: item.code,
                  name: item.name,
                  sortOrder: item.sortOrder,
                  precision: item.attributes?.PAYMENT_PRECISION,
                  roundingMode: item.attributes?.ROUNDING_MODE,
                }))}
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
                    <p>支持开具、扫码查验、防伪校验码核对与打印</p>
                  </div>
                </div>
                <div className="fiscal-receipt-entry-banner__right">
                  {allCurrentReceipts.length > 0 ? (
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
