import { formatDurationUnit, formatPackageUnit, resolveExecutingDepartment, summarizeExecutingDepartments } from "./orderPresentation";
import { useSavedOrderDepartmentNames } from "./useOrderExecutionDepartments";
import { ClinicalRecordValidationError } from "../record/clinicalRecordDraft";
import { usePrescriptionSplitPreview } from "./usePrescriptionSplitPreview";
import { matchSplitPreviewDraft, draftToBatchItem, draftToServiceItem } from "./persistOrderDrafts";
import { useServiceDocumentPreview } from "./useServiceDocumentPreview";
import type { OrderWorkflowMode } from "./editSavedOrder";
import { orderDocuments, saveOrderDocumentInfo, serviceDocumentKey } from "../OrderDocuments";
import { canPrintPrescription } from "./dispensableOptions";
import { buildDefaultDocumentInfo, getPrimaryDiagnosis } from "./orderDocumentDefaults";
import { OrderDocumentReviewCard, OrderDocumentReviewList } from "./OrderDocumentReviewCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DiagnosisInput, MedicationRequest, MedicationSafetyDecision, OrderDocumentInfo, Prescription, ServiceRequest } from "../../../shared/api/encountersApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { IconPlaylistAdd, IconPrinter, IconStack2 } from "@tabler/icons-react";
import { Alert, Button, Dialog, FormField, IconActionButton, LoadingState, Panel, PanelHead, StatusBadge } from "../../../shared/ui";
import type { MedicationPlanDraft } from "./medicationDraft";
import { UnifiedOrderListEditor, type AiOrderReviewCommand, type ServicePlanDraft } from "../UnifiedOrderListEditor";
import { medicationSafetyBlocksSubmission, medicationSafetyNeedsReason, medicationSafetySeverityLabel, medicationSafetyDecisionLabel, medicationSafetyRuleNames, prescriptionReviewTitle, serviceReviewTitle } from '../workstation/workstationShared'
import { ControlledPrintDialog, prescriptionCategoryLabel, serviceApplicationLabel, BatchPrintDialog } from '../printing/EncounterPrintPanel'
import { retryAfterReleasingUnpaidSettlements } from './releaseUnpaidSettlements'
import { SaveOrderSetDialog } from '../templates/SaveOrderSetDialog'
import { buildOrderSetCandidates, selectableCandidates } from '../templates/orderSetCandidates'

/** ISSUED：已全部生效（或无可生效医嘱）；REVIEW：需医生在核查窗确认合理用药；FAILED：未生效，原因已在面板提示。 */
export type OrderIssueOutcome = 'SKIPPED' | 'ISSUED' | 'REVIEW' | 'FAILED'

export function OrdersPanel({ encounter: savedEncounter, draftDiagnoses, onSaveClinicalDraft, onEditInvalidRecord, allergies, api, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, editing, onBusyChange, aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange,
  aiSuggestionSurfaceRef, currentDepartmentName, onOpenPrintCenter: _onOpenPrintCenter, onRegisterIssueOrders, onUnissuedCountChange, onOpenTemplateLibrary, onOpenOrderSetTemplate }: {
  /** 打开统一模板抽屉（用途：开立医嘱）；同时决定“存为组套”是否可用（仅编辑中、未签署时由上层传入）。 */
  onOpenTemplateLibrary?: () => void
  /** 医嘱录入框检索选中新医嘱组套：以开立医嘱用途打开抽屉并预选该组套，不直接展开。 */
  onOpenOrderSetTemplate?: (templateId: string) => void
  /** 简单模式“保存即生效”：病历保存成功后由工作区调用，标准模式返回 SKIPPED。 */
  onRegisterIssueOrders?: (handler: (() => Promise<OrderIssueOutcome>) | null) => void
  onUnissuedCountChange?: (count: number) => void
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onTreatmentKeysChange?: (keys: string[]) => void
  aiSuggestionSurfaceRef?: (element: HTMLDivElement | null) => void
  encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi
  draftDiagnoses: DiagnosisInput[]
  onSaveClinicalDraft: () => Promise<boolean>
  onEditInvalidRecord: () => void
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  editing: boolean
  onBusyChange: (busy: boolean) => void
  currentDepartmentName?: string
  onOpenPrintCenter?: () => void
}) {
  const encounter: Encounter = { ...savedEncounter, diagnoses: draftDiagnoses }
  const queryClient = useQueryClient()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [documentKey, setDocumentKey] = useState<string | null>(null)
  const [documentDirty, setDocumentDirty] = useState(false)
  const [reviewDocumentInfos, setReviewDocumentInfos] = useState<Record<string, OrderDocumentInfo>>({})
  const documentReturnFocus = useRef<HTMLElement | null>(null)
  const openDocument = (key: string) => {
    setDocumentKey(key)
    setReviewOpen(true)
  }

  const [safetyReviews, setSafetyReviews] = useState<MedicationSafetyDecision[]>([])
  const [safetyReviewKey, setSafetyReviewKey] = useState<string | null>(null)
  const [safetyReasons, setSafetyReasons] = useState<Record<string, string>>({})
  const [safetyReviewNotice, setSafetyReviewNotice] = useState('')
  // 简单模式下旁路监控结果只提示不阻断，随保存自动确认，提示保留在面板上供医生知晓。
  const [shadowNotice, setShadowNotice] = useState('')
  const safetyPreviewKey = useRef('')
  useEffect(() => {
    if (!reviewOpen) {
      setSafetyReviewKey(null)
      setSafetyReasons({})
      setSafetyReviewNotice('')
      setReviewDocumentInfos({})
      safetyPreviewKey.current = ''
    }
  }, [reviewOpen])
  const [ordersHovered, setOrdersHovered] = useState(false)
  const [saveOrderSetOpen, setSaveOrderSetOpen] = useState(false)
  const [saveOrderSetNotice, setSaveOrderSetNotice] = useState('')
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null)
  const [printServiceRequest, setPrintServiceRequest] = useState<ServiceRequest | null>(null)
  const [batchPrintOpen, setBatchPrintOpen] = useState(false)
  useEffect(() => {
    setReviewOpen(false)
    setSafetyReviews([])
    setDocumentKey(null)
    setDocumentDirty(false)
    setReviewDocumentInfos({})
    setShadowNotice('')
  }, [encounter.id])
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id], queryFn: () => api.encounters.prescriptions(encounter.id) })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const savedServiceDepartmentName = useSavedOrderDepartmentNames(api, reviewOpen ? services.data ?? [] : [])
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
  const frequencies = useQuery({
    queryKey: ['outpatient-order-frequencies', encounter.organizationId, encounter.departmentId],
    queryFn: () => api.masterData.activeOrderFrequencies(
      encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
    staleTime: 5 * 60 * 1000,
  })
  const routes = useQuery({
    queryKey: ['outpatient-medication-routes'],
    queryFn: () => api.masterData.activeMedicationRoutes('OUTPATIENT'),
    staleTime: 5 * 60 * 1000,
  })
  // 存为组套的候选：待确认草稿 + 已保存的医嘱草稿 + 本次已开立，复用已加载的医嘱查询，不新增请求。
  const orderSetCandidates = useMemo(() => buildOrderSetCandidates({ medicationDrafts, serviceDrafts,
    medications: medications.data ?? [], services: services.data ?? [] }), [medicationDrafts, serviceDrafts, medications.data, services.data])
  const orderSetCandidateCount = selectableCandidates(orderSetCandidates).length
  const treatmentKeys = [
    ...medicationDrafts.map((item) => `MEDICATION:${item.request.catalogItemId}`),
    ...serviceDrafts.map((item) => `${item.serviceType}:${item.catalogItemId}`),
    ...(medications.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `MEDICATION:${item.catalogItemId}`),
    ...(services.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `${item.serviceType}:${item.catalogItemId}`),
  ].filter((key) => !key.endsWith(':undefined')).sort()
  const treatmentKeySignature = treatmentKeys.join('|')
  const stableTreatmentKeys = useMemo(() => treatmentKeySignature ? [...new Set(treatmentKeySignature.split('|'))] : [], [treatmentKeySignature])
  useEffect(() => onTreatmentKeysChange?.(stableTreatmentKeys), [onTreatmentKeysChange, stableTreatmentKeys])
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] }),
  ])
  const cancelService = useMutation({
    mutationFn: (value: import('../../../shared/api/encountersApi').ServiceRequest) =>
      api.encounters.cancelServiceRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  const cancelMedication = useMutation({
    mutationFn: (value: MedicationRequest) =>
      api.encounters.cancelMedicationRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  // 签署模式的取消签署：药品以整张处方为单位退回未签署，诊疗项目逐项退回；未进结算单的记账同时作废，
  // 只进了未付款结算单的先取消该结算单。
  const withdrawSignature = useMutation({
    mutationFn: async (value: { kind: 'medication'; order: MedicationRequest } | { kind: 'service'; order: ServiceRequest }) => {
      if (value.kind === 'service') return retryAfterReleasingUnpaidSettlements(api.billing, encounter.id,
        () => api.encounters.withdrawServiceSignature(encounter.id, value.order.id, value.order.revision))
      const prescription = (prescriptions.data ?? []).find((rx) => rx.id === value.order.prescriptionId)
      if (!prescription) throw new Error('未找到药品所在处方，请刷新后重试')
      return retryAfterReleasingUnpaidSettlements(api.billing, encounter.id,
        () => api.encounters.withdrawPrescriptionSignature(encounter.id, prescription.id, prescription.revision))
    },
    onSuccess: refresh,
  })
  const splitPreview = usePrescriptionSplitPreview({ api: api.encounters, encounter,
    items: medicationDrafts.map(draftToBatchItem), enabled: reviewOpen })
  const orderingPolicy = useQuery({
    queryKey: ['outpatient-ordering-policy', encounter.id],
    queryFn: () => api.encounters.orderingPolicy(encounter.id),
    staleTime: 5 * 60 * 1000,
  })
  // 参数读取失败时按标准模式处理：多一次核查，不少一道确认。
  const simpleReview = orderingPolicy.data?.reviewMode === 'SIMPLE'
  // 简单模式保存即生效；标准模式即签署模式：保存为未签署，经核查窗签署后生效。
  const orderMode: OrderWorkflowMode | undefined = orderingPolicy.data ? (simpleReview ? 'SIMPLE' : 'SIGNING') : undefined
  const signVerb = simpleReview ? '生效' : '签署'
  const serviceDocumentPreview = useServiceDocumentPreview({ api: api.encounters, encounter,
    items: serviceDrafts.map(draftToServiceItem), enabled: reviewOpen })
  const confirmPlan = useMutation({
    mutationFn: async ({ acknowledged, afterRecordSaved = false }: { acknowledged: boolean; afterRecordSaved?: boolean }) => {
      if (reviewOpen) { splitPreview.requireReady(); serviceDocumentPreview.requireReady() }
      setShadowNotice('')
      const defaultServiceInfo = buildDefaultDocumentInfo(encounter, 'service')
      const existingPrescriptionIds = new Set((prescriptions.data ?? []).map((value) => value.id))
      const existingServiceIds = new Set((services.data ?? []).map((value) => value.id))

      // 工作区保存后接着生效时病历与草稿已落库；此时本组件的草稿状态可能尚未刷新，不能再触发一次保存。
      if (!afterRecordSaved) {
        const clinicalDraftSaved = await onSaveClinicalDraft()
        if (!clinicalDraftSaved) throw new Error(`本次草稿保存未完成，请处理保存提示后重新${signVerb}`)
      }

      const [latestPrescriptions, latestServices] = await Promise.all([
        api.encounters.prescriptions(encounter.id),
        api.encounters.serviceRequests(encounter.id),
      ])

      const draftPrescriptions = latestPrescriptions.filter((value) => value.status === 'DRAFT'
        && value.medicationRequests.some((request) => request.status === 'DRAFT'))
      const newPrescriptionIndexes = new Map(latestPrescriptions.filter((p) => p.status === 'DRAFT')
        .filter((prescription) => !existingPrescriptionIds.has(prescription.id))
        .map((prescription, index) => [prescription.id, index]))
      const prescriptionEntries = draftPrescriptions.map((rx) => {
        const previewIndex = newPrescriptionIndexes.get(rx.id)
        const customInfo = reviewDocumentInfos[`prescription:${rx.id}`]
          || (previewIndex === undefined ? undefined : reviewDocumentInfos[`preview-plan-${previewIndex}`])
          || reviewDocumentInfos[rx.categoryCode]
        const safetyReason = safetyReasons[rx.id]?.trim()
        // 未改动的单据交给服务端：已有诊断保留，没有诊断默认关联主诊断。
        return { id: rx.id, expectedRevision: rx.revision,
          ...(customInfo ? { documentInfo: customInfo } : {}), ...(safetyReason ? { safetyReason } : {}) }
      })

      const serviceDocuments = latestServices.filter((s) => s.status === 'DRAFT'
        || (s.status === 'ACTIVE' && s.documentInfoEditable !== false))
        .flatMap((svc) => {
          const customInfo = reviewDocumentInfos[serviceDocumentKey(svc)] || reviewDocumentInfos[`service:${svc.id}`]
            || (!existingServiceIds.has(svc.id) ? reviewDocumentInfos[`draft-service:${svc.catalogItemId}`] : undefined)
          // 申请草稿全部随本次开立生效；未改动的单据交给服务端默认关联主诊断。
          if (svc.status === 'DRAFT') return [{ id: svc.id, expectedRevision: svc.revision,
            ...(customInfo && svc.documentInfoEditable !== false ? { documentInfo: customInfo } : {}) }]
          const targetInfo = customInfo || (svc.documentInfo?.diagnoses?.length ? svc.documentInfo : defaultServiceInfo)
          return targetInfo && JSON.stringify(targetInfo) !== JSON.stringify(svc.documentInfo)
            ? [{ id: svc.id, expectedRevision: svc.revision, documentInfo: targetInfo }] : []
        })
      if (!prescriptionEntries.length && !serviceDocuments.length) return { requiresAcknowledgement: false, reviews: [], empty: true }

      const sentKey = acknowledged ? safetyReviewKey ?? undefined : undefined
      let result = await api.encounters.submitOrders(encounter.id, {
        prescriptions: prescriptionEntries, serviceDocuments,
        ...(sentKey ? { acknowledgedReviewKey: sentKey } : {}),
      })
      if (result.status === 'REVIEW_REQUIRED' && simpleReview && !reviewOpen && result.reviewKey
        && result.reviews.length > 0 && result.reviews.every((review) => review.mode === 'SHADOW')) {
        const messages = [...new Set(result.reviews.flatMap((review) => review.findings.map((finding) => finding.message)))]
        result = await api.encounters.submitOrders(encounter.id, {
          prescriptions: prescriptionEntries, serviceDocuments, acknowledgedReviewKey: result.reviewKey,
        })
        if (result.status === 'SUBMITTED') setShadowNotice(`合理用药提示（不阻断）：${messages.join('；') || '部分规则未能完成评价，请人工核对'}`)
      }
      if (result.status === 'REVIEW_REQUIRED') {
        // 核查窗未打开时，阻断结论没有可确认的内容：直接在面板提示原因，不弹出分单核查。
        const blocked = reviewOpen ? [] : result.reviews.filter(medicationSafetyBlocksSubmission)
        if (blocked.length) {
          const reasons = [...new Set(blocked.flatMap((review) => review.findings
            .filter((finding) => finding.decision === review.decision).map((finding) => finding.message)))]
          throw new Error(`合理用药审查未通过，当前处方不能提交${reasons.length ? `：${reasons.join('；')}` : ''}`)
        }
        return { requiresAcknowledgement: true, reviews: result.reviews, reviewKey: result.reviewKey ?? null,
          changed: Boolean(sentKey) }
      }
      return { requiresAcknowledgement: false, reviews: [] }
    },
    onSuccess: async (result) => {
      if (result.requiresAcknowledgement) {
        setSafetyReviews(result.reviews)
        setSafetyReviewKey(result.reviewKey ?? null)
        setSafetyReasons({})
        setSafetyReviewNotice(result.changed ? '处方或审查结果已变化，请重新核对本次提示并填写处理理由。' : '')
        setReviewOpen(true)
        await refresh()
        return
      }
      setSafetyReviews([])
      setSafetyReviewKey(null)
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
    // 失败只在当前位置提示原因（面板或已打开的核查窗），不为展示错误而弹出分单核查。
  })

  const saveOnlyDocumentInfos = useMutation({
    mutationFn: async () => {
      const allDocs = orderDocuments(prescriptions.data ?? [], services.data ?? [])
      for (const doc of allDocs) {
        const customInfo = reviewDocumentInfos[doc.key]
        if (customInfo && JSON.stringify(customInfo) !== JSON.stringify(doc.value.documentInfo)) {
          await saveOrderDocumentInfo(api, encounter.id, doc, doc.value.revision, customInfo)
        }
      }
    },
    onSuccess: async () => {
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
  })

  // 预检与正式开立共用后端审查键，医生确认一次即可提交，结果变化时后端要求重新确认。
  const previewSafetyReview = useMutation({
    mutationFn: async (drafts: Prescription[]) => api.encounters.submitOrders(encounter.id, {
      prescriptions: drafts.map((prescription) => ({ id: prescription.id, expectedRevision: prescription.revision })),
      serviceDocuments: [], dryRun: true,
    }),
    onSuccess: (result) => {
      setSafetyReviews(result.reviews)
      setSafetyReviewKey(result.reviewKey ?? null)
      setSafetyReasons({})
      setSafetyReviewNotice('')
    },
  })

  const applyAllPrimaryDiagnosis = () => {
    const primary = getPrimaryDiagnosis(encounter)
    if (!primary) return
    const primaryLink = [{ code: primary.code, display: primary.display, primary: true }]
    setReviewDocumentInfos((curr) => {
      const next = { ...curr }
      const allDocs = orderDocuments(prescriptions.data ?? [], services.data ?? [])
      allDocs.forEach((doc) => {
        next[doc.key] = { ...(next[doc.key] || doc.value.documentInfo || buildDefaultDocumentInfo(encounter, doc.kind)), diagnoses: primaryLink }
      })
      ;splitPreview.plans.forEach((_, idx) => {
        next[`preview-plan-${idx}`] = { ...(next[`preview-plan-${idx}`] || buildDefaultDocumentInfo(encounter, 'prescription')), diagnoses: primaryLink }
      })
      serviceDrafts.forEach((service) => {
        const key = `draft-service:${service.catalogItemId}`
        next[key] = { ...(next[key] || buildDefaultDocumentInfo(encounter, 'service',
          service.clinicalDescription)), diagnoses: primaryLink }
      })
      return next
    })
  }
  useEffect(() => onBusyChange(confirmPlan.isPending || documentDirty), [confirmPlan.isPending, documentDirty, onBusyChange])
  const issueAfterSave = confirmPlan.mutateAsync
  useEffect(() => {
    onRegisterIssueOrders?.(async () => {
      if (!simpleReview) return 'SKIPPED'
      try {
        const result = await issueAfterSave({ acknowledged: false, afterRecordSaved: true })
        return result.requiresAcknowledgement ? 'REVIEW' : 'empty' in result ? 'SKIPPED' : 'ISSUED'
      } catch {
        return 'FAILED'
      }
    })
    return () => onRegisterIssueOrders?.(null)
  }, [issueAfterSave, onRegisterIssueOrders, simpleReview])
  const persistedDraftCount = (prescriptions.data ?? []).reduce((sum, value) => sum
    + (value.status === 'DRAFT' ? value.medicationRequests.filter((request) => request.status === 'DRAFT').length : 0), 0)
  const persistedServiceDraftCount = (services.data ?? []).filter((value) => value.status === 'DRAFT').length
  const planCount = medicationDrafts.length + serviceDrafts.length + persistedDraftCount + persistedServiceDraftCount
  // 已保存但未生效/未签署的项数：简单模式显示为“未生效”，签署模式作为诊毕拦截。
  const unissuedCount = persistedDraftCount + persistedServiceDraftCount
  useEffect(() => onUnissuedCountChange?.(unissuedCount), [onUnissuedCountChange, unissuedCount])
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)
  const hasUnverifiedAllergyDraft = medicationDrafts.some((value) => value.request.allergyReviewConfirmed !== true)
  const submitError = confirmPlan.error instanceof ClinicalRecordValidationError
    ? <div role="alert" className="doctor-order-record-validation">
      <span>{confirmPlan.error.message}</span>
      <Button variant="secondary" size="sm" onClick={() => {
        setReviewOpen(false)
        confirmPlan.reset()
        onEditInvalidRecord()
      }}>返回病历补充</Button>
    </div> : confirmPlan.error && <Alert>{errorMessage(confirmPlan.error)}</Alert>
  const error = prescriptions.error || services.error || medications.error
    || cancelService.error || cancelMedication.error || withdrawSignature.error
  const hasAnyOrders = orderCount + planCount > 0
  const safetyBlocked = safetyReviews.some(medicationSafetyBlocksSubmission)
  const safetyReasonMissing = safetyReviews.some((review) => medicationSafetyNeedsReason(review)
    && !safetyReasons[review.prescriptionId]?.trim())
  const documents = orderDocuments(prescriptions.data ?? [], services.data ?? [])
  const persistedServiceDocuments = documents.filter((document) => document.kind === 'service')
  const persistedDraftPrescriptions = useMemo(() => (prescriptions.data ?? []).filter((prescription) => prescription.status === 'DRAFT'
    && prescription.medicationRequests.some((request) => request.status === 'DRAFT')), [prescriptions.data])
  const persistedDraftSignature = persistedDraftPrescriptions
    .map((prescription) => `${prescription.id}:${prescription.revision}`).join('|')
  const previewPersistedSafety = previewSafetyReview.mutate
  useEffect(() => {
    if (!reviewOpen || !persistedDraftSignature || safetyPreviewKey.current === persistedDraftSignature) return
    safetyPreviewKey.current = persistedDraftSignature
    previewPersistedSafety(persistedDraftPrescriptions)
  }, [reviewOpen, persistedDraftSignature, persistedDraftPrescriptions, previewPersistedSafety])
  const previewPrescriptionDocumentCount = splitPreview.plans.length
  const pendingPrescriptionDocumentCount = previewPrescriptionDocumentCount + persistedDraftPrescriptions.length
  const reviewDocumentCount = planCount === 0 ? documents.length
    : pendingPrescriptionDocumentCount + serviceDocumentPreview.plans.length + persistedServiceDocuments.length
  const reviewItemCount = planCount === 0
    ? documents.reduce((sum, document) => sum + document.items.length, 0)
    : medicationDrafts.length + persistedDraftCount + serviceDrafts.length
      + persistedServiceDocuments.reduce((sum, document) => sum + document.items.length, 0)
  const reviewTypeCounts = new Map<string, number>()
  const countPrescription = (category: string) => {
    const label = category === 'HERBAL' ? '中药' : category === 'CHINESE_PATENT' ? '中成药' : '西药'
    reviewTypeCounts.set(label, (reviewTypeCounts.get(label) ?? 0) + 1)
  }
  const countService = (type?: string) => {
    const label = type === 'LABORATORY' ? '检验' : type === 'EXAMINATION' ? '检查' : '治疗/处置'
    reviewTypeCounts.set(label, (reviewTypeCounts.get(label) ?? 0) + 1)
  }
  ;splitPreview.plans.forEach(plan => countPrescription(plan.categoryCode))
  persistedDraftPrescriptions.forEach(rx => countPrescription(rx.categoryCode))
  serviceDocumentPreview.plans.forEach(plan => countService(plan.serviceType))
  documents.filter(doc => doc.kind === 'service' || (planCount === 0 && doc.value.status !== 'DRAFT'))
    .forEach(doc => doc.kind === 'service' ? countService((doc.value as ServiceRequest).serviceType)
      : countPrescription((doc.value as Prescription).categoryCode))
  const reviewTypeSummary = [...reviewTypeCounts].map(([label, count]) => `${label} ${count}`).join(' · ')
  const documentRows = Object.fromEntries(documents.flatMap(doc => doc.items.map(item => [item.id, {
    key: doc.key, label: doc.shortLabel, selected: doc.key === documentKey,
  }])))
  const routeDisplay = (code?: string, fallback?: string) => fallback
    || routes.data?.find((route) => route.code === code)?.name || code || '—'
  const frequencyDisplay = (code?: string, fallback?: string) => fallback
    || frequencies.data?.find((frequency) => frequency.code === code)?.name || code || '—'

  const firstActivePrescription = (prescriptions.data ?? []).find(canPrintPrescription)
  const firstActiveService = (services.data ?? []).find((s) => s.status === 'ACTIVE')
  const hasActivePrintable = Boolean(firstActivePrescription || firstActiveService)

  return <Panel className={`doctor-orders-panel ${!hasAnyOrders ? 'is-empty' : ''} ${ordersHovered ? 'is-hovered' : ''}`}
    onFocusCapture={(event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.doctor-unified-orders')
        && event.target.matches('input, textarea, [contenteditable="true"]')) documentReturnFocus.current = event.target
    }}
    onMouseEnter={() => setOrdersHovered(true)}
    onMouseLeave={() => setOrdersHovered(false)}>
    <PanelHead title="医嘱和费用"
      actions={<div className="doctor-order-head-actions">
        {editing && onOpenTemplateLibrary && (
          <IconActionButton label="组套 / 方案" icon={<IconStack2 />} title="组套 / 方案" onClick={onOpenTemplateLibrary} />
        )}
        {editing && onOpenTemplateLibrary && (
          <IconActionButton label="存为组套" icon={<IconPlaylistAdd />} disabled={orderSetCandidateCount === 0}
            title={orderSetCandidateCount === 0 ? '还没有可存为组套的药品或项目' : '存为组套'}
            onClick={() => setSaveOrderSetOpen(true)} />
        )}
        {hasActivePrintable && (
          <IconActionButton label="批量打印" icon={<IconPrinter />}
            title="批量打印"
            onClick={() => setBatchPrintOpen(true)}
          />
        )}
        {/* 简单模式没有单独的开立：保存即生效；只有被拦下的医嘱显示为“未生效”，再次保存会重新尝试。 */}
        {editing && (simpleReview
          ? unissuedCount > 0 && <span title="已保存但未生效，处理提示后点“保存”会再次生效">
            <StatusBadge tone="warning">{unissuedCount} 项未生效</StatusBadge></span>
          : <>
            {planCount > 0 && <StatusBadge tone="warning">{planCount} 项未签署</StatusBadge>}
            <Button size="sm" disabled={planCount === 0 || documentDirty || orderingPolicy.isPending}
              title="核对分单、诊断和合理用药后签署，签署后医嘱生效并计费" onClick={() => setReviewOpen(true)}>签署</Button>
          </>)}
      </div>} />
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    {saveOrderSetNotice && <Alert tone="success" onDismiss={() => setSaveOrderSetNotice('')}>{saveOrderSetNotice}</Alert>}
    {saveOrderSetOpen && <SaveOrderSetDialog api={api} candidates={orderSetCandidates}
      onClose={() => setSaveOrderSetOpen(false)}
      onSaved={(saved) => {
        setSaveOrderSetOpen(false)
        setSaveOrderSetNotice(`已保存医嘱组套“${saved.name}”，可在“组套 / 方案”或医嘱检索中使用。`)
      }} />}
    {!reviewOpen && submitError}
    {shadowNotice && <Alert tone="warning" duration={null}>{shadowNotice}</Alert>}
    <div className="doctor-orders-content">
      {prescriptions.isPending || services.isPending || medications.isPending ? <LoadingState />
        // 简易模式：AI 推荐医嘱只落入草稿，随医生点“保存”生效，不自动弹出核查窗。
        : <UnifiedOrderListEditor aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
          onAiOrdersPrepared={() => { if (!documentDirty && !simpleReview) setReviewOpen(true) }}
          onOpenOrderSetTemplate={onOpenOrderSetTemplate}
          documentRows={documentRows} onOpenDocument={openDocument} documentEditing={documentDirty}
          documents={documents} selectedDocumentKey={documentKey} onSelectDocument={setDocumentKey}
          onSavedDocument={refresh}
          aiSuggestionSurfaceRef={aiSuggestionSurfaceRef} encounter={encounter} allergies={allergies}
          prescriptions={prescriptions.data ?? []} medications={medications.data ?? []} services={services.data ?? []}
          medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
          serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} api={api}
          readOnly={!editing} orderMode={orderMode}
          onWithdrawMedication={(order) => withdrawSignature.mutate({ kind: 'medication', order })}
          onWithdrawService={(order) => withdrawSignature.mutate({ kind: 'service', order })}
          currentDepartmentName={currentDepartmentName}
          busy={cancelService.isPending || cancelMedication.isPending || confirmPlan.isPending || withdrawSignature.isPending}
          onCancelMedication={(item) => cancelMedication.mutate(item)}
          onCancelService={(item) => cancelService.mutate(item)}
          onPrint={setPrintPrescription} onPrintService={setPrintServiceRequest} />}
    </div>
    {reviewOpen && <Dialog title={`医嘱${signVerb}核查`} size="xwide" closeOnBackdrop={false}
      onClose={() => { if (!confirmPlan.isPending && !saveOnlyDocumentInfos.isPending) { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) } }}
      footer={<>
        <Button variant="secondary" disabled={confirmPlan.isPending || saveOnlyDocumentInfos.isPending}
          onClick={() => { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) }}>
          {planCount > 0 ? '返回修改' : '关闭'}
        </Button>
        {planCount > 0 ? (
          <Button busy={confirmPlan.isPending} disabled={previewSafetyReview.isPending
            || !splitPreview.ready || !serviceDocumentPreview.ready || safetyBlocked || safetyReasonMissing
            || (planCount === 0 && safetyReviews.length === 0)}
            onClick={() => confirmPlan.mutate({ acknowledged: safetyReviews.length > 0 })}>
            {safetyBlocked ? `当前处方不可${signVerb}` : safetyReviews.length > 0 ? `已知晓风险，继续${signVerb}` : `确认分单并${signVerb}`}
          </Button>
        ) : (
          <Button busy={saveOnlyDocumentInfos.isPending} disabled={saveOnlyDocumentInfos.isPending || Object.keys(reviewDocumentInfos).length === 0}
            onClick={() => saveOnlyDocumentInfos.mutate()}>
            保存分单属性
          </Button>
        )}
      </>}>
      <div className="doctor-split-review-container">
        {hasUnverifiedAllergyDraft && <Alert tone="warning">
          患者药物过敏信息尚未核验；本次提交是否允许继续由机构的过敏核验参数控制，请尽快补充核验记录。
        </Alert>}
        {submitError}
        {saveOnlyDocumentInfos.error && <Alert>{errorMessage(saveOnlyDocumentInfos.error)}</Alert>}
        {previewSafetyReview.error && <Alert>{errorMessage(previewSafetyReview.error)}</Alert>}
        {previewSafetyReview.isPending && <p className="doctor-safety-review-loading" role="status">
          正在进行合理用药审查…
        </p>}

        {safetyReviews.length > 0 && <section className="doctor-medication-safety-review" aria-label="合理用药审查">
          <header>
            <div>
              <strong>合理用药审查</strong>
              <span>发现 {safetyReviews.reduce((sum, value) => sum + value.findings.length, 0)} 项用药风险</span>
            </div>
            <StatusBadge tone={safetyBlocked ? 'danger' : 'warning'}>
              {safetyReviews.every((review) => review.mode === 'SHADOW')
                ? '旁路监控，仅提示不阻断' : '正式审查，按规则要求处理'}
            </StatusBadge>
          </header>
          {safetyReviewNotice && <Alert tone="warning">{safetyReviewNotice}</Alert>}
          {safetyBlocked && <Alert>存在阻断或无法完成的正式审查，请返回修改处方或补齐信息后重新检查。</Alert>}
          <div className="doctor-medication-safety-review__grid">
            {safetyReviews.flatMap((review, reviewIndex) => review.findings.map((finding, findingIndex) => (
              <article key={`${review.evaluationId ?? review.prescriptionId}-${finding.findingId}-${reviewIndex}-${findingIndex}`}
                className={`is-${finding.severity.toLowerCase()}`}>
                <div className="doctor-medication-safety-review__finding-head">
                  <StatusBadge tone={finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'danger' : 'warning'}>
                    {medicationSafetySeverityLabel(finding.severity)} · {medicationSafetyDecisionLabel(finding.decision)}
                  </StatusBadge>
                  <span>{medicationSafetyRuleNames[finding.ruleCode]
                    ?? ({ DUPLICATE_THERAPY: '重复用药核对', DRUG_INTERACTION: '相互作用核对' } as Record<string, string>)[finding.category]
                    ?? '用药规则核对'}</span>
                  <span>{prescriptions.data?.find((value) => value.id === review.prescriptionId)?.prescriptionNo ?? review.prescriptionId}
                    {' · '}{review.mode === 'SHADOW' ? '旁路提示' : '正式审查'}</span>
                </div>
                <p><strong>涉及药品：</strong>{finding.medicationRequestIds.map((id) => {
                  const request = medications.data?.find((value) => value.id === id)
                    ?? prescriptions.data?.flatMap((value) => value.medicationRequests).find((value) => value.id === id)
                  return typeof request?.medicationSnapshot.name === 'string' ? request.medicationSnapshot.name : `药品明细 ${id}`
                }).join('、') || '请核对本张处方'}</p>
                <p>{finding.message}</p>
                {finding.suggestedAction && <small><strong>建议：</strong>{finding.suggestedAction}</small>}
                {finding.evidence.length > 0 && <details>
                  <summary>查看规则依据</summary>
                  {finding.evidence.map((evidence, index) => <div key={index}>
                    <small>{[evidence.sourceTitle, evidence.sourceVersion, evidence.section, evidence.sourceLocator].filter(Boolean).join(' · ')}</small>
                    <p>{evidence.excerpt}</p>
                    {evidence.usageScope && <small>适用范围：{evidence.usageScope}</small>}
                  </div>)}
                </details>}
              </article>
            )))}
            {safetyReviews.some((review) => review.failureCodes.length > 0) && <article className="is-unavailable">
              <div className="doctor-medication-safety-review__finding-head">
                <StatusBadge tone="warning">评价不完整</StatusBadge>
                <span>部分规则未能完成评价，请人工核对</span>
              </div>
              <p>{[...new Set(safetyReviews.flatMap((review) => review.failureCodes))].join('、')}</p>
            </article>}
          </div>
          {safetyReviews.filter((review) => review.mode !== 'SHADOW' && !medicationSafetyBlocksSubmission(review))
            .map((review) => <FormField key={review.prescriptionId}
              label={`${prescriptions.data?.find((value) => value.id === review.prescriptionId)?.prescriptionNo ?? review.prescriptionId} 继续${signVerb}理由${medicationSafetyNeedsReason(review) ? '（必填）' : '（选填）'}`}>
              <textarea aria-label={`${review.prescriptionId} 继续${signVerb}理由`} maxLength={1000}
                disabled={confirmPlan.isPending} value={safetyReasons[review.prescriptionId] ?? ''}
                placeholder="请说明已核对的风险及继续用药的临床理由"
                onChange={(event) => setSafetyReasons((current) => ({ ...current, [review.prescriptionId]: event.target.value }))} />
            </FormField>)}
        </section>}

        <div className="doctor-split-overview-bar">
          <div className="doctor-split-overview-summary">
            <strong>{splitPreview.ready && serviceDocumentPreview.ready ? `${reviewDocumentCount} 张单据` : '单据数量待确认'}</strong>
            <span>{reviewItemCount} 项医嘱</span>
            <span aria-label="单据分类统计">{splitPreview.ready && serviceDocumentPreview.ready ? reviewTypeSummary : '分单待确认'}</span>
          </div>
          {encounter.diagnoses.length > 0 && (
            <div className="doctor-split-overview-actions">
              <Button size="sm" variant="secondary" onClick={applyAllPrimaryDiagnosis}>
                全部关联主诊断
              </Button>
            </div>
          )}
        </div>

        {medicationDrafts.length > 0 && splitPreview.isFetching && <LoadingState label="正在核对药品分方…" />}
        {medicationDrafts.length > 0 && splitPreview.isError && <div role="alert" className="doctor-unified-order-alert">
          分方预览失败：{errorMessage(splitPreview.error)}
          <Button variant="secondary" disabled={splitPreview.isFetching} onClick={() => void splitPreview.refetch()}>重新核对分方</Button>
        </div>}
        {serviceDrafts.length > 0 && serviceDocumentPreview.isFetching && <LoadingState label="正在核对申请单合单…" />}
        {serviceDrafts.length > 0 && serviceDocumentPreview.isError && <div role="alert" className="doctor-unified-order-alert">
          申请单合单预览失败：{errorMessage(serviceDocumentPreview.error)}
          <Button variant="secondary" disabled={serviceDocumentPreview.isFetching}
            onClick={() => void serviceDocumentPreview.refetch()}>重新核对合单</Button>
        </div>}

        <OrderDocumentReviewList>
          {/* 1. 待开立药品的自动分方预览卡片 */}
          {splitPreview.plans.map((plan, pIdx) => {
            const cardKey = `preview-plan-${pIdx}`
            const kind = plan.categoryCode === 'HERBAL' ? 'herbal'
              : plan.categoryCode === 'CHINESE_PATENT' ? 'patent' : 'western'
            const categoryIndex = splitPreview.plans.slice(0, pIdx + 1)
              .filter((candidate) => candidate.categoryCode === plan.categoryCode).length
            const currentInfo = reviewDocumentInfos[cardKey] || buildDefaultDocumentInfo(encounter, 'prescription')
            const items = plan.items.map((pi, iIdx) => {
              const matchDraft = matchSplitPreviewDraft(medicationDrafts, pi.item)
              return {
                id: iIdx,
                name: matchDraft?.medicationName || '未匹配药品，请返回核对',
                spec: matchDraft?.productSpec || matchDraft?.preparationSpec || '',
                manufacturer: matchDraft?.manufacturerName,
                doseText: pi.item.doseValue ? `${pi.item.doseValue} ${pi.item.doseUnit || ''}` : '—',
                routeAndFreqText: [routeDisplay(pi.item.routeCode, matchDraft?.routeName),
                  frequencyDisplay(pi.item.frequencyCode),
                  pi.item.durationValue ? `${pi.item.durationValue}${formatDurationUnit(pi.item.durationUnit, '单位待确认')}` : ''].filter(Boolean).join(' · '),
                instruction: matchDraft?.request.medicationInstruction,
                quantityText: `${pi.item.quantity} ${pi.item.quantityUnit ? formatPackageUnit(matchDraft?.packageUnitName, pi.item.quantityUnit) : '单位待确认'}`,
                isInfusionGroup: Boolean(pi.groupKey),
                isGroupLeader: pi.groupLeader,
              }
            })
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={prescriptionReviewTitle(plan.categoryCode, categoryIndex)}
                kind={kind}
                deptOrSite={summarizeExecutingDepartments(plan.items.map(({ item }) => ({
                  kind: 'medication', stockSiteName: item.stockSiteName, selfProvided: item.selfProvided,
                })))}
                ruleReasons={plan.ruleReasons}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                encounter={encounter}
              />
            )
          })}

          {/* 2. 待开立的检查、检验和处置：按后端合单结果成单，单据信息写入单内每个项目。 */}
          {serviceDocumentPreview.plans.map((plan, planIndex) => {
            const members = plan.itemIndexes.map((index) => serviceDrafts[index]).filter(Boolean)
            const cardKey = `draft-service-doc:${planIndex}`
            const memberKeys = members.map((service) => `draft-service:${service.catalogItemId}`)
            const planType = members[0]?.serviceType || plan.serviceType
            const serviceType: ServiceRequest['serviceType'] = planType === 'LABORATORY'
              || planType === 'EXAMINATION' || planType === 'TREATMENT'
              ? planType : 'OTHER'
            const kind = serviceType === 'LABORATORY' ? 'lab'
              : serviceType === 'EXAMINATION' ? 'exam' : 'treatment'
            const sameTypeIndex = serviceDocumentPreview.plans.slice(0, planIndex + 1)
              .filter((candidate) => (serviceDrafts[candidate.itemIndexes[0]]?.serviceType || candidate.serviceType) === planType).length
            const currentInfo = memberKeys.map((key) => reviewDocumentInfos[key]).find(Boolean)
              || buildDefaultDocumentInfo(encounter, 'service', members.length === 1 ? members[0].clinicalDescription : '')
            const items = members.map((service) => ({
              id: service.id,
              name: service.itemName,
              quantityText: `${service.quantity} ${service.unitCode || '项'}`,
              note: service.clinicalDescription,
            }))
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={serviceReviewTitle(serviceType, sameTypeIndex)}
                kind={kind}
                deptOrSite={resolveExecutingDepartment({ kind: 'service', performerDepartmentId: members[0]?.performerDepartmentId,
                  performerDepartmentName: members[0]?.performerDepartmentName })}
                ruleReasons={plan.ruleReasons}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr,
                  ...Object.fromEntries(memberKeys.map((key) => [key, next])) }))}
                encounter={encounter}
              />
            )
          })}

          {/* 3. 此前已保存、仍待提交的处方草稿 */}
          {persistedDraftPrescriptions
            .map((rx, rxIdx) => {
              const cardKey = `prescription:${rx.id}`
              const kind = rx.categoryCode === 'CHINESE_PATENT' ? 'patent'
                : rx.categoryCode === 'HERBAL' ? 'herbal' : 'western'
              const categoryIndex = splitPreview.plans.filter(plan => plan.categoryCode === rx.categoryCode).length
                + persistedDraftPrescriptions.slice(0, rxIdx + 1)
                  .filter((candidate) => candidate.categoryCode === rx.categoryCode).length
              const currentInfo = reviewDocumentInfos[cardKey]
                || (rx.documentInfo?.diagnoses?.length ? rx.documentInfo : buildDefaultDocumentInfo(encounter, 'prescription'))
              const items = rx.medicationRequests.filter((m) => m.status !== 'CANCELLED').map((m) => ({
                id: m.id,
                name: m.itemName || m.medicationName,
                spec: m.packageSpec || m.preparationSpec,
                manufacturer: m.manufacturerName,
                doseText: m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : '—',
                routeAndFreqText: [routeDisplay(m.routeCode, m.routeName),
                  frequencyDisplay(m.frequencyCode, m.frequencyName),
                  m.durationValue ? `${m.durationValue}${formatDurationUnit(m.durationUnit)}` : ''].filter(Boolean).join(' · '),
                instruction: m.medicationInstruction,
                quantityText: `${m.quantity} ${m.quantityUnit ? formatPackageUnit(undefined, m.quantityUnit) : '单位待确认'}`,
              }))
              return (
                <OrderDocumentReviewCard
                  key={cardKey}
                  cardKey={cardKey}
                  title={prescriptionReviewTitle(rx.categoryCode, categoryIndex)}
                  defaultExpanded={documentKey === cardKey}
                  kind={kind}
                  deptOrSite={resolveExecutingDepartment({ kind: 'medication' })}
                  items={items}
                  info={currentInfo}
                  onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                  encounter={encounter}
                />
              )
            })}

          {/* 4. 已保存的申请单（草稿随本次开立生效，已生效的可改单据信息）；无待开立医嘱时也展示已提交处方供整单核查。 */}
          {documents.filter((document) => document.kind === 'service'
            || (planCount === 0 && document.value.status !== 'DRAFT')).map((doc) => {
            const cardKey = doc.key
            const isPrescription = doc.kind === 'prescription'
            const rx = isPrescription ? (doc.value as Prescription) : undefined
            const svc = !isPrescription ? (doc.value as ServiceRequest) : undefined
            const kind = isPrescription
              ? (rx?.categoryCode === 'CHINESE_PATENT' ? 'patent' : rx?.categoryCode === 'HERBAL' ? 'herbal' : 'western')
              : (svc?.serviceType === 'LABORATORY' ? 'lab' : svc?.serviceType === 'EXAMINATION' ? 'exam' : 'treatment')
            const currentInfo = reviewDocumentInfos[cardKey]
              || (doc.value.documentInfo?.diagnoses?.length
                ? doc.value.documentInfo
                : buildDefaultDocumentInfo(encounter, isPrescription ? 'prescription' : 'service'))
            const items = isPrescription && rx
              ? rx.medicationRequests.filter((m) => m.status !== 'CANCELLED').map((m) => ({
                  id: m.id,
                  name: m.itemName || m.medicationName,
                  spec: m.packageSpec || m.preparationSpec,
                  manufacturer: m.manufacturerName,
                  doseText: m.doseValue ? `${m.doseValue} ${m.doseUnit || ''}` : '—',
                  routeAndFreqText: [routeDisplay(m.routeCode, m.routeName),
                    frequencyDisplay(m.frequencyCode, m.frequencyName),
                    m.durationValue ? `${m.durationValue}${formatDurationUnit(m.durationUnit)}` : ''].filter(Boolean).join(' · '),
                  instruction: m.medicationInstruction,
                  quantityText: `${m.quantity} ${m.quantityUnit ? formatPackageUnit(undefined, m.quantityUnit) : '单位待确认'}`,
                }))
              : svc
              ? (doc.members ?? [svc]).map((member) => ({
                  id: member.id,
                  name: member.itemName,
                  quantityText: `${member.quantity} ${member.unitCode || '项'}`,
                  note: [member.specimenType, member.clinicalDescription].filter(Boolean).join(' · '),
                }))
              : []
            const readOnly = isPrescription ? rx?.status !== 'DRAFT'
              : (doc.members ?? [svc]).some((member) => member?.documentInfoEditable === false)
            const draftTypeCount = svc ? serviceDocumentPreview.plans.filter(plan => (plan.serviceType || 'OTHER') === svc.serviceType).length : 0
            const typeIndex = draftTypeCount + documents.slice(0, documents.indexOf(doc) + 1).filter((candidate) => isPrescription && rx
              ? candidate.kind === 'prescription' && (candidate.value as Prescription).categoryCode === rx.categoryCode
              : candidate.kind === 'service' && (candidate.value as ServiceRequest).serviceType === svc?.serviceType).length
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={isPrescription && rx ? prescriptionReviewTitle(rx.categoryCode, typeIndex)
                  : svc ? serviceReviewTitle(svc.serviceType, typeIndex) : doc.shortLabel}
                defaultExpanded={documentKey === cardKey}
                kind={kind}
                deptOrSite={resolveExecutingDepartment(isPrescription ? { kind: 'medication' }
                  : { kind: 'service', performerDepartmentId: svc?.performerDepartmentId,
                    performerDepartmentName: svc ? savedServiceDepartmentName(svc) : undefined })}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                encounter={encounter}
                readOnly={readOnly}
              />
            )
          })}
        </OrderDocumentReviewList>
      </div>
    </Dialog>}
    {printPrescription && <ControlledPrintDialog api={api} title="打印门诊处方"
      description="仅生效处方可以生成正式 PDF；每次生成和重打都会留痕。"
      sourceLabel={`${prescriptionCategoryLabel(printPrescription.categoryCode)} · ${printPrescription.prescriptionNo}`}
      generate={(purpose, copies) => api.printing.prescription(
        encounter.id, printPrescription.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setPrintPrescription(null)} />}
    {printServiceRequest && <ControlledPrintDialog api={api}
      title={`打印${serviceApplicationLabel(printServiceRequest.serviceType)}申请单`}
      description="仅生效且未撤销的申请可以生成正式 PDF；每次生成和重打都会留痕。"
      sourceLabel={`${printServiceRequest.itemName} · ${printServiceRequest.requestNo}`}
      generate={(purpose, copies) => api.printing.serviceRequest(
        encounter.id, printServiceRequest.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setPrintServiceRequest(null)} />}
    {batchPrintOpen && (
      <BatchPrintDialog
        encounter={encounter}
        api={api}
        onClose={() => setBatchPrintOpen(false)}
        onPrinted={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      />
    )}
  </Panel>
}
