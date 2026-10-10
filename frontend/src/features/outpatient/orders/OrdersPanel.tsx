import { formatPackageUnit, resolveExecutingDepartment, summarizeExecutingDepartments } from "./orderPresentation";
import { useSavedOrderDepartmentNames } from "./useOrderExecutionDepartments";
import { ClinicalRecordValidationError } from "../record/clinicalRecordDraft";
import { usePrescriptionSplitPreview } from "./usePrescriptionSplitPreview";
import { matchSplitPreviewDraft, draftToBatchItem } from "./persistOrderDrafts";
import { OrderDocumentSummary, orderDocuments } from "../OrderDocuments";
import { canPrintPrescription } from "./dispensableOptions";
import { buildDefaultDocumentInfo, getPrimaryDiagnosis } from "./orderDocumentDefaults";
import { OrderDocumentReviewCard, OrderDocumentReviewList } from "./OrderDocumentReviewCard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DiagnosisInput, MedicationRequest, MedicationSafetyDecision, OrderDocumentInfo, Prescription, ServiceRequest } from "../../../shared/api/encountersApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, FormField, IconButton, LoadingState, Panel, PanelHead, StatusBadge } from "../../../shared/ui";
import type { MedicationPlanDraft } from "./medicationDraft";
import { UnifiedOrderListEditor, type AiOrderReviewCommand, type ServicePlanDraft } from "../UnifiedOrderListEditor";
import { needsMedicationSafetyAcknowledgement, medicationSafetyReviewKey, medicationSafetyBlocksSubmission, medicationSafetyNeedsReason, medicationSafetySeverityLabel, medicationSafetyDecisionLabel, medicationSafetyRuleNames, prescriptionReviewTitle, serviceReviewTitle } from '../workstation/workstationShared'
import { money, ControlledPrintDialog, prescriptionCategoryLabel, serviceApplicationLabel, BatchPrintDialog } from '../printing/EncounterPrintPanel'

export function OrdersPanel({ encounter: savedEncounter, draftDiagnoses, onSaveClinicalDraft, onEditInvalidRecord, allergies, api, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, editing, onBusyChange, aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange,
  aiSuggestionSurfaceRef, currentDepartmentName, onOpenPrintCenter: _onOpenPrintCenter }: {
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
  const [safetyReasons, setSafetyReasons] = useState<Record<string, string>>({})
  const [safetyReviewNotice, setSafetyReviewNotice] = useState('')
  const safetyPreviewKey = useRef('')
  useEffect(() => {
    if (!reviewOpen) {
      setSafetyReasons({})
      setSafetyReviewNotice('')
      setReviewDocumentInfos({})
      safetyPreviewKey.current = ''
    }
  }, [reviewOpen])
  const [ordersHovered, setOrdersHovered] = useState(false)
  const [printPrescription, setPrintPrescription] = useState<Prescription | null>(null)
  const [printServiceRequest, setPrintServiceRequest] = useState<ServiceRequest | null>(null)
  const [batchPrintOpen, setBatchPrintOpen] = useState(false)
  useEffect(() => {
    setReviewOpen(false)
    setSafetyReviews([])
    setDocumentKey(null)
    setDocumentDirty(false)
    setReviewDocumentInfos({})
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
  const treatmentKeys = [
    ...medicationDrafts.map((item) => `MEDICATION:${item.request.catalogItemId}`),
    ...serviceDrafts.map((item) => `${item.serviceType}:${item.catalogItemId}`),
    ...(medications.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `MEDICATION:${item.catalogItemId}`),
    ...(services.data ?? []).filter((item) => item.status !== 'CANCELLED').map((item) => `${item.serviceType}:${item.catalogItemId}`),
  ].filter((key) => !key.endsWith(':undefined')).sort()
  const treatmentKeySignature = treatmentKeys.join('|')
  const stableTreatmentKeys = useMemo(() => treatmentKeySignature ? [...new Set(treatmentKeySignature.split('|'))] : [], [treatmentKeySignature])
  useEffect(() => onTreatmentKeysChange?.(stableTreatmentKeys), [onTreatmentKeysChange, stableTreatmentKeys])
  const statement = useQuery({ queryKey: ['doctor-billing-statement', encounter.id],
    queryFn: () => api.billing.statement(encounter.id), retry: false })
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
  const splitPreview = usePrescriptionSplitPreview({ api: api.encounters, encounter,
    items: medicationDrafts.map(draftToBatchItem), enabled: reviewOpen })
  const confirmPlan = useMutation({
    mutationFn: async ({ acknowledged }: { acknowledged: boolean }) => {
      splitPreview.requireReady()
      const defaultPrescriptionInfo = buildDefaultDocumentInfo(encounter, 'prescription')
      const defaultServiceInfo = buildDefaultDocumentInfo(encounter, 'service')
      const existingPrescriptionIds = new Set((prescriptions.data ?? []).map((value) => value.id))
      const existingServiceIds = new Set((services.data ?? []).map((value) => value.id))

      const clinicalDraftSaved = await onSaveClinicalDraft()
      if (!clinicalDraftSaved) throw new Error('本次草稿保存未完成，请处理保存提示后重新开立')

      const [latestPrescriptions, latestServices] = await Promise.all([
        api.encounters.prescriptions(encounter.id),
        api.encounters.serviceRequests(encounter.id),
      ])

      const draftPrescriptions = latestPrescriptions.filter((p) => p.status === 'DRAFT')
      const newPrescriptionIndexes = new Map(draftPrescriptions
        .filter((prescription) => !existingPrescriptionIds.has(prescription.id))
        .map((prescription, index) => [prescription.id, index]))
      for (const rx of draftPrescriptions) {
        const previewIndex = newPrescriptionIndexes.get(rx.id)
        const customInfo = reviewDocumentInfos[`prescription:${rx.id}`]
          || (previewIndex === undefined ? undefined : reviewDocumentInfos[`preview-plan-${previewIndex}`])
          || reviewDocumentInfos[rx.categoryCode]
        const targetInfo = customInfo || (rx.documentInfo?.diagnoses?.length ? rx.documentInfo : defaultPrescriptionInfo)
        if (targetInfo && JSON.stringify(targetInfo) !== JSON.stringify(rx.documentInfo)) {
          await api.encounters.updatePrescriptionDocumentInfo(encounter.id, rx.id, rx.revision, targetInfo)
        }
      }

      const activeServices = latestServices.filter((s) => s.status === 'ACTIVE' && s.documentInfoEditable !== false)
      for (let sIdx = 0; sIdx < activeServices.length; sIdx++) {
        const svc = activeServices[sIdx]
        const customInfo = reviewDocumentInfos[`service:${svc.id}`]
          || (!existingServiceIds.has(svc.id) ? reviewDocumentInfos[`draft-service:${svc.catalogItemId}`] : undefined)
        const targetInfo = customInfo || (svc.documentInfo?.diagnoses?.length ? svc.documentInfo : defaultServiceInfo)
        if (targetInfo && JSON.stringify(targetInfo) !== JSON.stringify(svc.documentInfo)) {
          await api.encounters.updateServiceDocumentInfo(encounter.id, svc.id, svc.revision, targetInfo)
        }
      }

      const latest = await api.encounters.prescriptions(encounter.id)
      const draftsToSubmit = latest.filter((value) => value.status === 'DRAFT'
        && value.medicationRequests.some((request) => request.status === 'DRAFT'))

      if (draftsToSubmit.length > 0) {
        const evaluations = await Promise.all(draftsToSubmit.map((value) =>
          api.encounters.evaluatePrescriptionSafety(encounter.id, value.id)))
        const reviews = evaluations.filter(needsMedicationSafetyAcknowledgement)
        if (reviews.length > 0 && (!acknowledged
          || medicationSafetyReviewKey(reviews) !== medicationSafetyReviewKey(safetyReviews))) {
          return { requiresAcknowledgement: true, reviews, changed: acknowledged }
        }
        if (reviews.some(medicationSafetyBlocksSubmission)) throw new Error('当前处方不能开立，请返回修改或补齐评价所需信息。')
        if (reviews.some((review) => medicationSafetyNeedsReason(review) && !safetyReasons[review.prescriptionId]?.trim())) {
          throw new Error('请填写每张处方的继续开立理由。')
        }
      }

      if (draftsToSubmit.length > 0) {
        const submitted = await Promise.all(draftsToSubmit.map((value) =>
          safetyReasons[value.id]?.trim()
            ? api.encounters.submitPrescription(encounter.id, value.id, value.revision, safetyReasons[value.id].trim())
            : api.encounters.submitPrescription(encounter.id, value.id, value.revision)))
        return { requiresAcknowledgement: false,
          reviews: submitted.flatMap((value) => value.safetyEvaluation ? [value.safetyEvaluation] : []) }
      }
      return { requiresAcknowledgement: false, reviews: [] }
    },
    onSuccess: async (result) => {
      if (result.requiresAcknowledgement) {
        setSafetyReviews(result.reviews)
        setSafetyReasons({})
        setSafetyReviewNotice(result.changed ? '处方或审查结果已变化，请重新核对本次提示并填写处理理由。' : '')
        await refresh()
        return
      }
      setSafetyReviews([])
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
  })

  const saveOnlyDocumentInfos = useMutation({
    mutationFn: async () => {
      const allDocs = orderDocuments(prescriptions.data ?? [], services.data ?? [])
      for (const doc of allDocs) {
        const customInfo = reviewDocumentInfos[doc.key]
        if (customInfo && JSON.stringify(customInfo) !== JSON.stringify(doc.value.documentInfo)) {
          if (doc.kind === 'prescription') {
            await api.encounters.updatePrescriptionDocumentInfo(encounter.id, doc.value.id, doc.value.revision, customInfo)
          } else {
            await api.encounters.updateServiceDocumentInfo(encounter.id, doc.value.id, doc.value.revision, customInfo)
          }
        }
      }
    },
    onSuccess: async () => {
      setReviewOpen(false)
      setReviewDocumentInfos({})
      await refresh()
    },
  })

  const previewSafetyReview = useMutation({
    mutationFn: async (drafts: Prescription[]) => Promise.all(drafts.map((prescription) =>
      api.encounters.evaluatePrescriptionSafety(encounter.id, prescription.id))),
    onSuccess: (evaluations) => {
      setSafetyReviews(evaluations.filter(needsMedicationSafetyAcknowledgement))
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
  const persistedDraftCount = (prescriptions.data ?? []).reduce((sum, value) => sum
    + (value.status === 'DRAFT' ? value.medicationRequests.filter((request) => request.status === 'DRAFT').length : 0), 0)
  const planCount = medicationDrafts.length + serviceDrafts.length + persistedDraftCount
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)
  const hasUnverifiedAllergyDraft = medicationDrafts.some((value) => value.request.allergyReviewConfirmed !== true)
  const error = prescriptions.error || services.error || medications.error
    || cancelService.error || cancelMedication.error
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
    : pendingPrescriptionDocumentCount + serviceDrafts.length + persistedServiceDocuments.length
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
  serviceDrafts.forEach(service => countService(service.serviceType))
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
    <PanelHead title="医嘱和费用" meta={<>{orderCount} 项已开立
      {statement.data ? ` · ${money(statement.data.chargeAmount, statement.data.currencyCode)}` : ''}</>}
      actions={<div className="doctor-order-head-actions">
        {hasActivePrintable && (
          <IconButton icon="print" label="批量打印"
            title="一键批量受控打印本次就诊已生效处方与单据"
            onClick={() => setBatchPrintOpen(true)}
          />
        )}
        {editing && <>
          <StatusBadge tone={planCount ? 'warning' : 'neutral'}>{planCount} 项待确认</StatusBadge>
          <Button size="sm" disabled={planCount === 0 || documentDirty} onClick={() => setReviewOpen(true)}>审核开立</Button>
        </>}
      </div>} />
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <OrderDocumentSummary
      documents={documents}
      selectedKey={documentKey}
      onSelect={openDocument}
    />
    <div className="doctor-orders-content">
      {prescriptions.isPending || services.isPending || medications.isPending ? <LoadingState />
        : <UnifiedOrderListEditor aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
          onAiOrdersPrepared={() => { if (!documentDirty) setReviewOpen(true) }}
          documentRows={documentRows} onOpenDocument={openDocument} documentEditing={documentDirty}
          documents={documents} selectedDocumentKey={documentKey} onSelectDocument={setDocumentKey}
          onSavedDocument={refresh}
          aiSuggestionSurfaceRef={aiSuggestionSurfaceRef} encounter={encounter} allergies={allergies}
          prescriptions={prescriptions.data ?? []} medications={medications.data ?? []} services={services.data ?? []}
          medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
          serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} api={api}
          readOnly={!editing}
          currentDepartmentName={currentDepartmentName}
          busy={cancelService.isPending || cancelMedication.isPending || confirmPlan.isPending}
          onCancelMedication={(item) => cancelMedication.mutate(item)}
          onCancelService={(item) => cancelService.mutate(item)}
          onPrint={setPrintPrescription} onPrintService={setPrintServiceRequest} />}
    </div>
    {reviewOpen && <Dialog title="医嘱开立核查" size="xwide" closeOnBackdrop={false}
      onClose={() => { if (!confirmPlan.isPending && !saveOnlyDocumentInfos.isPending) { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) } }}
      footer={<>
        <Button variant="secondary" disabled={confirmPlan.isPending || saveOnlyDocumentInfos.isPending}
          onClick={() => { setReviewOpen(false); setSafetyReviews([]); setReviewDocumentInfos({}) }}>
          {planCount > 0 ? '返回修改' : '关闭'}
        </Button>
        {planCount > 0 ? (
          <Button busy={confirmPlan.isPending} disabled={previewSafetyReview.isPending
            || !splitPreview.ready || safetyBlocked || safetyReasonMissing
            || (planCount === 0 && safetyReviews.length === 0)}
            onClick={() => confirmPlan.mutate({ acknowledged: safetyReviews.length > 0 })}>
            {safetyBlocked ? '当前处方不可开立' : safetyReviews.length > 0 ? '已知晓风险，继续开立' : '确认分单并开立'}
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
        {confirmPlan.error instanceof ClinicalRecordValidationError ? <div role="alert" className="doctor-order-record-validation">
          <span>{confirmPlan.error.message}</span>
          <Button variant="secondary" size="sm" onClick={() => {
            setReviewOpen(false)
            confirmPlan.reset()
            onEditInvalidRecord()
          }}>返回病历补充</Button>
        </div> : confirmPlan.error && <Alert>{errorMessage(confirmPlan.error)}</Alert>}
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
              label={`${prescriptions.data?.find((value) => value.id === review.prescriptionId)?.prescriptionNo ?? review.prescriptionId} 继续开立理由${medicationSafetyNeedsReason(review) ? '（必填）' : '（选填）'}`}>
              <textarea aria-label={`${review.prescriptionId} 继续开立理由`} maxLength={1000}
                disabled={confirmPlan.isPending} value={safetyReasons[review.prescriptionId] ?? ''}
                placeholder="请说明已核对的风险及继续用药的临床理由"
                onChange={(event) => setSafetyReasons((current) => ({ ...current, [review.prescriptionId]: event.target.value }))} />
            </FormField>)}
        </section>}

        <div className="doctor-split-overview-bar">
          <div className="doctor-split-overview-summary">
            <strong>{splitPreview.ready ? `${reviewDocumentCount} 张单据` : '单据数量待确认'}</strong>
            <span>{reviewItemCount} 项医嘱</span>
            <span aria-label="单据分类统计">{splitPreview.ready ? reviewTypeSummary : '药品分方待确认'}</span>
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
                  pi.item.durationValue ? `${pi.item.durationValue}${pi.item.durationUnit || '单位待确认'}` : ''].filter(Boolean).join(' · '),
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

          {/* 2. 待开立的检查、检验和处置单据 */}
          {serviceDrafts.map((service, serviceIndex) => {
            const cardKey = `draft-service:${service.catalogItemId}`
            const serviceType: ServiceRequest['serviceType'] = service.serviceType === 'LABORATORY'
              || service.serviceType === 'EXAMINATION' || service.serviceType === 'TREATMENT'
              ? service.serviceType : 'OTHER'
            const kind = serviceType === 'LABORATORY' ? 'lab'
              : serviceType === 'EXAMINATION' ? 'exam' : 'treatment'
            const sameTypeIndex = serviceDrafts.slice(0, serviceIndex + 1)
              .filter((item) => (item.serviceType || 'OTHER') === serviceType).length
            const currentInfo = reviewDocumentInfos[cardKey]
              || buildDefaultDocumentInfo(encounter, 'service', service.clinicalDescription)
            const items = [{
              id: service.id,
              name: service.itemName,
              quantityText: `${service.quantity} ${service.unitCode || '项'}`,
              note: service.clinicalDescription,
            }]
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={serviceReviewTitle(serviceType, sameTypeIndex)}
                kind={kind}
                deptOrSite={resolveExecutingDepartment({ kind: 'service', performerDepartmentId: service.performerDepartmentId,
                  performerDepartmentName: service.performerDepartmentName })}
                items={items}
                info={currentInfo}
                onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
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
                  m.durationValue ? `${m.durationValue}${m.durationUnit || '天'}` : ''].filter(Boolean).join(' · '),
                instruction: m.medicationInstruction,
                quantityText: `${m.quantity} ${m.quantityUnit ? formatPackageUnit(undefined, m.quantityUnit) : '单位待确认'}`,
              }))
              return (
                <OrderDocumentReviewCard
                  key={cardKey}
                  cardKey={cardKey}
                  title={prescriptionReviewTitle(rx.categoryCode, categoryIndex)}
                  kind={kind}
                  deptOrSite={resolveExecutingDepartment({ kind: 'medication' })}
                  items={items}
                  info={currentInfo}
                  onChangeInfo={(next) => setReviewDocumentInfos((curr) => ({ ...curr, [cardKey]: next }))}
                  encounter={encounter}
                />
              )
            })}

          {/* 4. 服务申请创建后即为 ACTIVE；无待开立医嘱时也展示已提交处方供整单核查。 */}
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
                    m.durationValue ? `${m.durationValue}${m.durationUnit || '天'}` : ''].filter(Boolean).join(' · '),
                  instruction: m.medicationInstruction,
                  quantityText: `${m.quantity} ${m.quantityUnit ? formatPackageUnit(undefined, m.quantityUnit) : '单位待确认'}`,
                }))
              : svc
              ? [{
                  id: svc.id,
                  name: svc.itemName,
                  quantityText: `${svc.quantity} ${svc.unitCode || '项'}`,
                  note: [svc.specimenType, svc.clinicalDescription].filter(Boolean).join(' · '),
                }]
              : []
            const readOnly = isPrescription ? rx?.status !== 'DRAFT' : svc?.documentInfoEditable === false
            const draftTypeCount = svc ? serviceDrafts.filter(service => (service.serviceType || 'OTHER') === svc.serviceType).length : 0
            const typeIndex = draftTypeCount + documents.slice(0, documents.indexOf(doc) + 1).filter((candidate) => isPrescription && rx
              ? candidate.kind === 'prescription' && (candidate.value as Prescription).categoryCode === rx.categoryCode
              : candidate.kind === 'service' && (candidate.value as ServiceRequest).serviceType === svc?.serviceType).length
            return (
              <OrderDocumentReviewCard
                key={cardKey}
                cardKey={cardKey}
                title={isPrescription && rx ? prescriptionReviewTitle(rx.categoryCode, typeIndex)
                  : svc ? serviceReviewTitle(svc.serviceType, typeIndex) : doc.shortLabel}
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
