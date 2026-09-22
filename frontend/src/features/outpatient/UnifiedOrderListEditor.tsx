import { OrderComposerSafety } from './orders/OrderComposerSafety'
import { OrderComposerInstruction } from './orders/OrderComposerInstruction'
import { OrderComposerQuantity } from './orders/OrderComposerQuantity'
import { OrderComposerDirections } from './orders/OrderComposerDirections'
import { OrderComposerResource } from './orders/OrderComposerResource'
import { type MedicationEntry, emptyMedicationEntry, withSkinTestExemption } from './orders/medicationEntry'
import { SavedOrderList } from './orders/SavedOrderList'
import { DraftOrderList } from './orders/DraftOrderList'
import { useAiOrderReview } from './orders/useAiOrderReview'
import { savedOrderEntries, draftOrderEntries, findGroupingComposerTarget } from './orders/orderEntries'
import { calculatePackageQuantity, resolveFrequencyTimesPerDay } from './orders/medicationQuantity'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { ItemGroup, MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Icon, StatusBadge, type ClinicalResource, type ClinicalResourceOption, type OrderSearchMode } from '../../shared/ui'
import type { MedicationPlanDraft } from './orders/medicationDraft'
import { resolveDispensableOptions } from './orders/dispensableOptions'
import { orderDocuments, type OrderDocument } from './OrderDocuments'
import { roundNumber } from '../../shared/utils/precision'
import { type OrderEntryType, type ServicePlanDraft, type AiOrderReviewCommand } from './orders/orderDraftTypes'
import { resolveExecutingDepartment, formatUnitPrice } from './orders/orderPresentation'
import { syncMedicationDraftGroup, newAdministrationGroupKey, buildAdministrationGroups } from './orders/administrationGroups'
import { parseHerbalInstruction } from './orders/herbalInstructions'
import { focusResource, focusControl, focusControlAfterSelection } from './orders/orderEditorControls'

export { type OrderEntryType, type ServicePlanDraft, clinicalAiTreatmentKey, type AiOrderReviewCommand } from './orders/orderDraftTypes'
export { formatPackageUnit, type ExecutingDepartmentSource, resolveExecutingDepartment, formatServiceExecution } from './orders/orderPresentation'
export { syncMedicationDraftGroup, type AdministrationGroupDetail } from './orders/administrationGroups'

export { calculatePackageQuantity, resolveFrequencyTimesPerDay } from './orders/medicationQuantity'

export function UnifiedOrderListEditor({
  encounter, allergies = [], prescriptions = [], medications = [], services = [],
  medicationDrafts = [], setMedicationDrafts,
  serviceDrafts = [], setServiceDrafts, api, busy = false,
  readOnly = false, aiOrderReview, onAiOrderReviewConsumed, onAiOrdersPrepared, aiSuggestionSurfaceRef,
  currentDepartmentName, documentRows = {}, onOpenDocument, documentEditing = false,
  documents: propDocuments, selectedDocumentKey, onSelectDocument, onSavedDocument,
  onCancelMedication = () => {}, onCancelService = () => {}, onPrint = () => {}, onPrintService = () => {},
}: {
  documentEditing?: boolean
  documentRows?: Record<string, { key: string; label: string; selected: boolean }>
  onOpenDocument?: (key: string) => void
  documents?: OrderDocument[]
  selectedDocumentKey?: string | null
  onSelectDocument?: (key: string | null) => void
  onSavedDocument?: () => Promise<unknown>
  encounter: Encounter
  allergies?: AllergyIntolerance[]
  prescriptions?: Prescription[]
  medications?: MedicationRequest[]
  services?: ServiceRequest[]
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  api: RhnApi
  busy?: boolean
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onAiOrdersPrepared?: () => void
  aiSuggestionSurfaceRef?: (element: HTMLDivElement | null) => void
  readOnly?: boolean
  currentDepartmentName?: string
  onCancelMedication?: (value: MedicationRequest) => void
  onCancelService?: (value: ServiceRequest) => void
  onPrint?: (value: Prescription) => void
  onPrintService?: (value: ServiceRequest) => void
}) {
  const currentDept = currentDepartmentName || (encounter as any).departmentName || '当前科室'
  const [internalDocKey, setInternalDocKey] = useState<string | null>(null)
  const activeDocKey = selectedDocumentKey !== undefined ? selectedDocumentKey : internalDocKey
  const handleSelectDoc = (key: string | null) => {
    if (onSelectDocument) onSelectDocument(key)
    else setInternalDocKey(key)
    if (key && onOpenDocument) onOpenDocument(key)
  }
  const allDocuments = useMemo(
    () => propDocuments ?? orderDocuments(prescriptions, services),
    [propDocuments, prescriptions, services]
  )
  const [entryType, setEntryType] = useState<OrderEntryType>('ALL')
  const [searchMode, setSearchMode] = useState<OrderSearchMode>(() => {
    try {
      const saved = localStorage.getItem('rhn_order_search_mode')
      if (saved === 'prefix' || saved === 'smart') return saved
    } catch {}
    return 'smart'
  })
  const [successToast, setSuccessToast] = useState('')
  const [medicationEntry, setMedicationEntry] = useState<MedicationEntry>(emptyMedicationEntry)
  const [service, setService] = useState<ClinicalResourceOption<ServiceCatalogItem>>()
  const [serviceQuantity, setServiceQuantity] = useState(1)
  const [serviceDescription, setServiceDescription] = useState('')
  const [validationError, setValidationError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const shouldFocusOnOpenRef = useRef(false)
  const [editingDraft, setEditingDraft] = useState<{ kind: 'medication' | 'service'; id: string } | null>(null)
  const [groupingSession, setGroupingSession] = useState<{
    groupKey: string
    routeCode: string
    frequencyCode: string
    durationValue: number | ''
    headMedicationName: string
  } | null>(null)

  function finishGroupingSession() {
    setGroupingSession(null)
    setMedicationEntry(emptyMedicationEntry())
    setValidationError('')
    setSuccessToast('输液组方已完成，已恢复常规开立模式')
  }

  function finishHerbalGrouping() {
    setComposerOpen(true)
    setEntryType('ALL')
    setMedicationEntry(emptyMedicationEntry())
    setValidationError('')
    setSuccessToast('中药方剂组方已完成')
    focusResource('ALL')
  }

  const draftHerbalCount = useMemo(
    () => medicationDrafts.filter((d) => d.categoryCode === 'HERBAL' || d.editorMode === 'herbal').length,
    [medicationDrafts]
  )

  function startHerbalGrouping() {
    setComposerOpen(true)
    setEntryType('HERBAL')
    setGroupingSession(null)
    const herbalDrafts = medicationDrafts.filter(
      (d) => d.categoryCode === 'HERBAL' || d.editorMode === 'herbal'
    )
    if (herbalDrafts.length > 0) {
      const first = herbalDrafts[0]
      const parsed = parseHerbalInstruction(first.request.medicationInstruction)
      setMedicationEntry((curr) => ({
        ...curr,
        herbalDoseCount: first.request.durationValue || curr.herbalDoseCount || 7,
        herbalMethod: parsed.method || curr.herbalMethod || '水煎服',
        frequencyCode: first.request.frequencyCode || curr.frequencyCode || 'BID',
        instruction: '',
      }))
    }
    focusResource('HERBAL')
  }

  function continueGroupingFromDraft(draft: MedicationPlanDraft) {
    const targetGroupKey = draft.administrationGroupKey || newAdministrationGroupKey()
    if (!draft.administrationGroupKey) {
      setMedicationDrafts((current) =>
        current.map((d) => (d.id === draft.id ? { ...d, administrationGroupKey: targetGroupKey } : d))
      )
    }
    const sessionDuration: number | '' = typeof draft.request.durationValue === 'number' ? draft.request.durationValue : ''
    const session = {
      groupKey: targetGroupKey,
      routeCode: draft.request.routeCode || 'IV_DRIP',
      frequencyCode: draft.request.frequencyCode || 'QD',
      durationValue: sessionDuration,
      headMedicationName: draft.productName || draft.medicationName || '输液药品',
    }
    setGroupingSession(session)
    setEditingDraft(null)
    setComposerOpen(true)
    setMedicationEntry({
      ...emptyMedicationEntry(),
      routeCode: session.routeCode,
      routeExecutionType: 'INFUSION',
      frequencyCode: session.frequencyCode,
      durationValue: session.durationValue,
      administrationGroupKey: targetGroupKey,
    })
    setValidationError('')
    setEntryType('WESTERN')
    focusResource('WESTERN')
    setSuccessToast(`已关联输液组【${session.headMedicationName}】，请继续录入同组药品`)
  }

  function changeSearchMode(next: OrderSearchMode) {
    setSearchMode(next)
    try {
      localStorage.setItem('rhn_order_search_mode', next)
    } catch {}
  }

  useEffect(() => {
    if (!successToast) return
    const timer = globalThis.setTimeout(() => setSuccessToast(''), 4000)
    return () => globalThis.clearTimeout(timer)
  }, [successToast])
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
  const skinTests = useQuery({
    queryKey: ['doctor-skin-tests', encounter.id],
    queryFn: () => api.treatments.skinTestWorklist(undefined, undefined, encounter.id),
    refetchInterval: 20_000,
  })
  const skinTestByRequest = new Map((skinTests.data ?? []).map((item) => [item.medicationRequestId, item]))
  const frequencyOptions = (frequencies.data ?? []).map((frequency) => ({
    value: frequency.code, label: frequency.name,
    secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}`,
    searchKeywords: [frequency.code, frequency.shortName ?? ''],
  }))
  const routeOptions = (routes.data ?? []).map((route) => ({
    value: route.code, label: route.name, secondaryText: route.code,
    searchKeywords: [route.code, route.name],
  }))
  const isWesternOrPatent = entryType === 'WESTERN' || entryType === 'CHINESE_PATENT' || entryType === 'MEDICATION'
  const isMedication = isWesternOrPatent || entryType === 'HERBAL' || (entryType === 'ALL' && !service)
  const currentMedication = medicationEntry.medication?.raw
  const dispensableOptions = currentMedication
    ? resolveDispensableOptions(currentMedication, encounter.organizationId) : []
  const selectedProduct = dispensableOptions.find((value) => value.key === medicationEntry.dispenseOptionKey)
    ?? dispensableOptions[0]
  const currentRouteExecutionType = medicationEntry.routeExecutionType
    ?? routes.data?.find((value) => value.code === medicationEntry.routeCode)?.executionType
  const currentIsInfusion = currentRouteExecutionType === 'INFUSION'
  const administrationGroups = useMemo(() => buildAdministrationGroups(
    medications, medicationDrafts, currentIsInfusion ? medicationEntry.administrationGroupKey : undefined,
  ), [currentIsInfusion, medicationEntry.administrationGroupKey, medicationDrafts, medications])
  const availableDoseUnits = useMemo(() => {
    if (!currentMedication) return []
    const units = [
      currentMedication.strengthUnit?.trim(),
      currentMedication.preparationUnit?.trim(),
      currentMedication.defaultDoseUnit?.trim(),
    ].filter(Boolean) as string[]
    return Array.from(new Set(units))
  }, [currentMedication])

  const calcResult = useMemo(() => calculatePackageQuantity({
    medication: currentMedication,
    doseValue: medicationEntry.doseValue,
    doseUnit: medicationEntry.doseUnit,
    frequencyCode: medicationEntry.frequencyCode,
    durationValue: medicationEntry.durationValue,
    selectedPackage: selectedProduct,
    frequencies: frequencies.data,
  }), [currentMedication, medicationEntry.doseValue, medicationEntry.doseUnit, medicationEntry.frequencyCode, medicationEntry.durationValue, selectedProduct, frequencies.data])
  const frequencyQuantityUnavailable = Boolean(currentMedication && medicationEntry.frequencyCode)
    && resolveFrequencyTimesPerDay(frequencies.data, medicationEntry.frequencyCode) === null
  const automaticQuantity = frequencyQuantityUnavailable ? '' : calcResult?.quantity
  useEffect(() => {
    if (!currentMedication || entryType === 'HERBAL' || automaticQuantity === undefined) return
    setMedicationEntry((current) => current.isManualQuantity || current.quantity === automaticQuantity
      ? current : { ...current, quantity: automaticQuantity })
  }, [automaticQuantity, currentMedication, entryType])
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const allergyReviewRecorded = allergies.some((item) => item.assertionType === 'NO_KNOWN_ALLERGY'
    || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY') || drugAllergies.length > 0
  const allergyVerificationMissing = !allergyReviewRecorded
  const matchedAllergies = currentMedication ? drugAllergies.filter((item) => item.allergenId
    ? currentMedication.allergenConceptIds?.includes(item.allergenId)
    : item.substanceCode && item.substanceCode.toLowerCase() === currentMedication.code.toLowerCase()) : []
  const hasKnownAllergies = drugAllergies.length > 0
  const isSkinTest = Boolean(currentMedication?.skinTestRequired)
  const isAntimicrobial = Boolean(currentMedication?.antimicrobial)
  const isAllergyHit = matchedAllergies.length > 0
  const recentNegativeQuery = useQuery({
    queryKey: ['recent-negative-skin-test', encounter.residentId, currentMedication?.id],
    queryFn: () => (currentMedication?.skinTestRequired && currentMedication?.id)
      ? api.treatments.validNegativeSkinTests(encounter.residentId, currentMedication.id, currentMedication.skinTestResultValidityHours)
      : Promise.resolve([]),
    enabled: Boolean(currentMedication?.skinTestRequired && currentMedication?.id),
    staleTime: 30_000,
  })
  const recentNegativeItem = recentNegativeQuery.data?.[0]
  const hasPositiveSkinTest = Boolean(
    currentMedication?.id &&
    (skinTests.data ?? []).some((item) => item.medicationId === currentMedication.id && item.status === 'POSITIVE')
  )
  const hasSafetyAlert = Boolean(currentMedication && (allergyVerificationMissing || isAllergyHit
    || hasKnownAllergies || isSkinTest || isAntimicrobial || hasPositiveSkinTest))
  const isStockInsufficient = Boolean(
    isMedication
    && medicationEntry.availablePackageQuantity != null
    && typeof medicationEntry.quantity === 'number'
    && medicationEntry.quantity > medicationEntry.availablePackageQuantity
  )
  const savedEntries = useMemo(() => savedOrderEntries(services, medications), [services, medications])
  const draftEntries = useMemo(() => draftOrderEntries(serviceDrafts, medicationDrafts), [serviceDrafts, medicationDrafts])

  const hasOrders = savedEntries.length > 0 || draftEntries.length > 0
  const isComposerActive = !readOnly && (composerOpen || !hasOrders)

  const groupingComposerTarget = useMemo(() => findGroupingComposerTarget(
    savedEntries, draftEntries, groupingSession?.groupKey, isComposerActive,
  ), [isComposerActive, groupingSession?.groupKey, draftEntries, savedEntries])

  function changeType(value: OrderEntryType) {
    if (groupingSession && value !== 'WESTERN' && value !== 'MEDICATION' && value !== 'ALL') {
      setGroupingSession(null)
    }
    setEntryType(value)
    setMedicationEntry(emptyMedicationEntry())
    setService(undefined)
    setServiceQuantity(1)
    setServiceDescription('')
    setValidationError('')
  }

  function openComposer() {
    setEditingDraft(null)
    setComposerOpen(true)
    shouldFocusOnOpenRef.current = true
    focusResource(entryType)
  }

  useEffect(() => {
    shouldFocusOnOpenRef.current = false
  }, [encounter.id])

  useEffect(() => {
    if (shouldFocusOnOpenRef.current && isComposerActive) {
      shouldFocusOnOpenRef.current = false
      focusResource(entryType)
    }
  }, [isComposerActive, entryType])

  function closeComposer() {
    setGroupingSession(null)
    changeType('ALL')
    if (hasOrders) {
      setComposerOpen(false)
    }
  }

  const hasEnteredOrder = isMedication ? Boolean(medicationEntry.medication) : Boolean(service)

  useEffect(() => {
    if (!composerOpen && hasOrders) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      const isInsideRow = composerRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover')
      )
      const isInsideSubrow = Boolean(
        (target as Element)?.closest?.('.doctor-unified-order-subrow, .doctor-grouping-banner')
      )
      if (!isInsideRow && !isInsidePopover && !isInsideSubrow && !hasEnteredOrder) {
        if (hasOrders) {
          closeComposer()
        } else {
          setValidationError('')
        }
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [composerOpen, hasEnteredOrder, hasOrders])

  function selectMedication(option?: ClinicalResourceOption<MedicationKnowledge>) {
    if (!option) {
      setMedicationEntry(entryType === 'HERBAL' ? {
        ...emptyMedicationEntry(),
        routeCode: 'ORAL', routeExecutionType: 'NONE',
        frequencyCode: medicationEntry.frequencyCode,
        herbalDoseCount: medicationEntry.herbalDoseCount,
        herbalMethod: medicationEntry.herbalMethod,
        durationValue: Number(medicationEntry.herbalDoseCount),
      } : emptyMedicationEntry())
      setValidationError('')
      return
    }
    const value = option.raw
    const rawOrderable = value as (MedicationKnowledge & { stockSiteId?: string, stockSiteName?: string, availablePackageQuantity?: number, packageUnitName?: string }) | undefined
    const defaultDispenseOption = value
      ? resolveDispensableOptions(value, encounter.organizationId)[0] : undefined
    const initialDose = value?.defaultDose ?? ''
    const initialDoseUnit = value?.defaultDoseUnit ?? value?.preparationUnit ?? ''
    let initialRoute = groupingSession
      ? groupingSession.routeCode
      : (entryType === 'HERBAL' ? 'ORAL' : value?.defaultRoute ?? 'ORAL')
    const initialRouteExecutionType = groupingSession
      ? 'INFUSION'
      : (entryType === 'HERBAL' ? 'NONE'
        : routes.data?.find((route) => route.code === initialRoute)?.executionType)
    let initialFrequency = groupingSession
      ? groupingSession.frequencyCode
      : (entryType === 'HERBAL'
        ? medicationEntry.frequencyCode || value?.defaultFrequency || 'BID'
        : value?.defaultFrequency ?? 'QD')
    let initialDuration = groupingSession
      ? groupingSession.durationValue
      : (entryType === 'HERBAL' ? Number(medicationEntry.herbalDoseCount) || 7 : (medicationEntry.durationValue || 7))

    let initialGroupKey: string | undefined = groupingSession?.groupKey
    if (!initialGroupKey && initialRouteExecutionType === 'INFUSION') {
      const latestGroup = administrationGroups.latestDraftGroupKey
        ? administrationGroups.groupDetails.get(administrationGroups.latestDraftGroupKey)
        : administrationGroups.existingGroups[0]
      if (latestGroup) {
        initialGroupKey = latestGroup.key
        if (latestGroup.routeCode) initialRoute = latestGroup.routeCode
        if (latestGroup.frequencyCode) initialFrequency = latestGroup.frequencyCode
        if (latestGroup.durationValue) initialDuration = latestGroup.durationValue
      } else {
        initialGroupKey = newAdministrationGroupKey()
      }
    }

    const calc = calculatePackageQuantity({
      medication: value,
      doseValue: initialDose,
      doseUnit: initialDoseUnit,
      frequencyCode: initialFrequency,
      durationValue: initialDuration,
      selectedPackage: defaultDispenseOption,
      frequencies: frequencies.data,
    })

    setMedicationEntry({
      medication: option,
      doseValue: initialDose,
      doseUnit: initialDoseUnit,
      routeCode: initialRoute,
      routeExecutionType: initialRouteExecutionType,
      administrationGroupKey: initialGroupKey,
      frequencyCode: initialFrequency,
      durationValue: initialDuration,
      quantity: calc?.quantity ?? (resolveFrequencyTimesPerDay(frequencies.data, initialFrequency) === null ? '' : 1),
      dispenseOptionKey: defaultDispenseOption?.key ?? '',
      instruction: '',
      herbalDoseCount: entryType === 'HERBAL' ? medicationEntry.herbalDoseCount : 7,
      herbalMethod: entryType === 'HERBAL' ? medicationEntry.herbalMethod : '水煎服',
      safetyReviewed: false,
      allergyOverrideReason: '',
      isManualQuantity: false,
      stockSiteId: rawOrderable?.stockSiteId,
      stockSiteName: rawOrderable?.stockSiteName,
      availablePackageQuantity: rawOrderable?.availablePackageQuantity,
      packageUnitName: rawOrderable?.packageUnitName,
      skinTestExempt: false,
      skinTestExemptReason: '',
      exemptEvidenceEventId: undefined,
    })
    setValidationError('')
    if (option) focusControlAfterSelection('doctor-unified-dose')
  }

  function handleOrderResourceSelect(option?: ClinicalResourceOption<ClinicalResource>) {
    if (!option) {
      selectMedication(undefined)
      setService(undefined)
      return
    }

    const raw = option.raw as any
    // 1. 组套 (ItemGroup) 一键批量展开
    if (raw && ('groupType' in raw || 'members' in raw)) {
      const group = raw as ItemGroup
      const members = group.members || []
      if (members.length === 0) {
        setValidationError(`组套【${group.name}】未配置任何项目明细`)
        return
      }
      const newServiceDrafts: ServicePlanDraft[] = members.map((m, idx) => ({
        id: globalThis.crypto.randomUUID(),
        sequence: Date.now() + idx,
        serviceType: m.serviceType || 'LABORATORY',
        catalogItemId: m.catalogItemId,
        itemCode: m.itemCode,
        itemName: m.itemName,
        quantity: m.quantity || 1,
        unitCode: m.unitCode || '项',
        clinicalDescription: m.memberDescription,
      }))
      setServiceDrafts((cur) => [...cur, ...newServiceDrafts])
      setSuccessToast(`已成功调入组套【${group.name}】共 ${newServiceDrafts.length} 项项目`)
      setEditingDraft(null)
      setComposerOpen(true)
      shouldFocusOnOpenRef.current = true
      selectMedication(undefined)
      setService(undefined)
      setServiceQuantity(1)
      setServiceDescription('')
      setEntryType('ALL')
      setValidationError('')
      focusResource('ALL')
      return
    }

    // 2. 药品 (MedicationKnowledge / OrderableMedicationKnowledge)
    if (raw && ('sdMedicationType' in raw || 'preparationSpec' in raw || 'products' in raw)) {
      const medType: OrderEntryType = raw.sdMedicationType === 'HERBAL' ? 'HERBAL'
        : raw.sdMedicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT'
        : 'WESTERN'
      setEntryType(medType)
      selectMedication(option as ClinicalResourceOption<MedicationKnowledge>)
      return
    }

    // 3. 诊疗项目 (ServiceCatalogItem)
    if (raw && ('sdServiceType' in raw || 'serviceType' in raw)) {
      const sType = raw.sdServiceType || raw.serviceType
      const srvType: OrderEntryType = ['LABORATORY', 'EXAMINATION', 'TREATMENT'].includes(sType)
        ? sType : 'TREATMENT'
      setEntryType(srvType)
      setService(option as ClinicalResourceOption<ServiceCatalogItem>)
      setValidationError('')
      if (srvType === 'TREATMENT') {
        focusControlAfterSelection('doctor-unified-quantity')
      } else {
        focusControlAfterSelection('doctor-unified-service-note')
      }
      return
    }
  }

  useAiOrderReview({ encounter, busy, readOnly, aiOrderReview, api,
    onAiOrderReviewConsumed, onAiOrdersPrepared, medicationDrafts, serviceDrafts, medications, services,
    allergies, setMedicationDrafts, setServiceDrafts, setValidationError, setSuccessToast })

  function updateMedication<K extends keyof MedicationEntry>(field: K, value: MedicationEntry[K]) {
    setMedicationEntry((current) => {
      const next = { ...current, [field]: value }
      if (field === 'quantity') {
        next.isManualQuantity = true
      } else if (['doseValue', 'frequencyCode', 'durationValue', 'dispenseOptionKey'].includes(field as string)) {
        if (!next.isManualQuantity) {
          const currentMed = next.medication?.raw
          const options = currentMed ? resolveDispensableOptions(currentMed, encounter.organizationId) : []
          const pkg = options.find((opt) => opt.key === next.dispenseOptionKey) ?? options[0]
          const calc = calculatePackageQuantity({
            medication: currentMed,
            doseValue: next.doseValue,
            doseUnit: next.doseUnit,
            frequencyCode: next.frequencyCode,
            durationValue: next.durationValue,
            selectedPackage: pkg,
            frequencies: frequencies.data,
          })
          if (calc?.quantity) {
            next.quantity = calc.quantity
          } else if (resolveFrequencyTimesPerDay(frequencies.data, next.frequencyCode) === null) {
            next.quantity = ''
          }
        }
      }
      return next
    })
    if (groupingSession) {
      if (field === 'frequencyCode' && typeof value === 'string') {
        setGroupingSession((curr) => curr ? { ...curr, frequencyCode: value } : null)
      } else if (field === 'durationValue') {
        setGroupingSession((curr) => curr ? { ...curr, durationValue: value as number | '' } : null)
      }
    }
    setValidationError('')
  }

  function updateRoute(routeCode: string) {
    const executionType = routes.data?.find((value) => value.code === routeCode)?.executionType
    setMedicationEntry((current) => {
      let groupKey = current.administrationGroupKey
      let nextFrequency = current.frequencyCode
      let nextDuration = current.durationValue
      if (executionType === 'INFUSION') {
        if (!groupKey) {
          const candidate = administrationGroups.latestDraftGroupKey
            ? administrationGroups.groupDetails.get(administrationGroups.latestDraftGroupKey)
            : administrationGroups.existingGroups[0]
          if (candidate) {
            groupKey = candidate.key
            if (candidate.frequencyCode) nextFrequency = candidate.frequencyCode
            if (candidate.durationValue) nextDuration = candidate.durationValue
          } else {
            groupKey = newAdministrationGroupKey()
          }
        }
      } else {
        groupKey = undefined
      }
      return {
        ...current,
        routeCode,
        routeExecutionType: executionType,
        administrationGroupKey: groupKey,
        frequencyCode: nextFrequency,
        durationValue: nextDuration,
      }
    })
    if (groupingSession && executionType === 'INFUSION') {
      setGroupingSession((curr) => curr ? { ...curr, routeCode } : null)
    }
    setValidationError('')
  }

  function addCurrentEntry() {
    if (!isMedication) {
      const selected = service?.raw
      if (!selected || serviceQuantity <= 0) { setValidationError('请选择诊疗项目并填写数量'); return }
      const activePrice = selected.prices?.find((p) => p.sdStatus === 'ACTIVE') ?? selected.prices?.[0]
      setServiceDrafts((current) => [...current, {
        id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: selected.sdServiceType,
        catalogItemId: selected.id, itemCode: selected.code, itemName: selected.name,
        quantity: serviceQuantity, unitCode: selected.unitCode,
        clinicalDescription: serviceDescription.trim() || undefined,
        unitPrice: activePrice?.price,
        currencyCode: activePrice?.currencyCode,
      }])
      setComposerOpen(true)
      setService(undefined)
      setServiceQuantity(1)
      setServiceDescription('')
      setValidationError('')
      setEntryType('ALL')
      focusResource('ALL')
      return
    }
    const medication = medicationEntry.medication?.raw
    if (!medication) { setValidationError('请选择药品'); return }
    const product = resolveDispensableOptions(medication, encounter.organizationId)
      .find((value) => value.key === medicationEntry.dispenseOptionKey)
      ?? resolveDispensableOptions(medication, encounter.organizationId)[0]
    if (!product) { setValidationError('该药品未配置当前机构可发药产品、包装或有效价格'); return }
    if (medicationEntry.doseValue === '' || Number(medicationEntry.doseValue) <= 0 || !medicationEntry.doseUnit.trim()) {
      setValidationError('请完整填写剂量'); return
    }
    if (isWesternOrPatent && (!medicationEntry.routeCode.trim()
      || !medicationEntry.frequencyCode.trim() || medicationEntry.quantity === '' || Number(medicationEntry.quantity) <= 0)) {
      setValidationError('请完整填写途径、频次和发药量'); return
    }
    if (entryType === 'HERBAL' && (Number(medicationEntry.herbalDoseCount) <= 0
      || !medicationEntry.herbalMethod.trim() || !medicationEntry.frequencyCode.trim())) {
      setValidationError('请填写剂数、服法和频次'); return
    }
    if (isAllergyHit && !medicationEntry.allergyOverrideReason.trim()) {
      setValidationError('命中已知过敏原，必须填写继续开立理由')
      return
    }
    if (hasPositiveSkinTest) {
      setValidationError('当前药品患者皮试结果为【阳性】（严重禁忌），系统禁止开立！')
      return
    }
    if (medicationEntry.skinTestExempt && !medicationEntry.skinTestExemptReason?.trim()) {
      setValidationError('已勾选免做皮试，必须选择或填写免试原因')
      return
    }

    if (isMedication && isStockInsufficient) {
      setValidationError(`开立数量(${medicationEntry.quantity})超过【${medicationEntry.stockSiteName || '药房'}】当前可用库存(${medicationEntry.availablePackageQuantity}${medicationEntry.packageUnitName || '包装'})，请调减数量`)
      return
    }
    const herbal = entryType === 'HERBAL'
    const doseValue = Number(medicationEntry.doseValue)
    const isInfusion = !herbal && isWesternOrPatent && currentIsInfusion
    const assignedGroupKey = herbal || !currentIsInfusion ? undefined
      : medicationEntry.administrationGroupKey || newAdministrationGroupKey()

    const newDraft: MedicationPlanDraft = {
      id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: herbal ? 'herbal' : 'regular',
      quantityManuallySet: medicationEntry.isManualQuantity === true,
      categoryCode: medication.sdMedicationType || (entryType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'WESTERN'), medicationName: medication.name, medicationCode: medication.code,
      preparationSpec: medication.preparationSpec, productName: product.product.name,
      productSpec: product.itemPackage?.packageSpec || product.label,
      manufacturerName: product.product.manufacturerName,
      unitPrice: product.price, currencyCode: product.currencyCode,
      routeName: herbal ? '口服'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.name,
      routeExecutionType: herbal ? 'NONE'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.executionType,
      administrationGroupKey: assignedGroupKey,
      stockSiteName: medicationEntry.stockSiteName,
      availablePackageQuantity: medicationEntry.availablePackageQuantity,
      packageUnitName: medicationEntry.packageUnitName,
      skinTestRequired: Boolean(medication.skinTestRequired),
      skinTestResultValidityHours: medication.skinTestResultValidityHours,
      antimicrobial: Boolean(medication.antimicrobial),
      sdAntimicrobialLevelText: medication.sdAntimicrobialLevelText,
      allergenConceptIds: medication.allergenConceptIds,
      request: {
        medicationId: medication.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
        doseValue, doseUnit: medicationEntry.doseUnit.trim(),
        routeCode: herbal ? 'ORAL' : medicationEntry.routeCode.trim(),
        frequencyCode: medicationEntry.frequencyCode.trim(),
        durationValue: herbal ? Number(medicationEntry.herbalDoseCount)
          : medicationEntry.durationValue === '' ? undefined : Number(medicationEntry.durationValue),
        durationUnit: herbal ? '剂' : medicationEntry.durationValue === '' ? undefined : '天',
        quantity: herbal ? roundNumber(doseValue * Number(medicationEntry.herbalDoseCount), 2) : Number(medicationEntry.quantity),
        quantityUnit: product.unitCode, substitutionAllowed: true, selfProvided: false,
        medicationInstruction: herbal
          ? [medicationEntry.herbalMethod, medicationEntry.instruction.trim()].filter(Boolean).join('；')
          : medicationEntry.instruction.trim(),
        allergyReviewConfirmed: medicationEntry.safetyReviewed || allergyReviewRecorded || !hasSafetyAlert,
        allergyOverrideReason: medicationEntry.allergyOverrideReason.trim() || undefined,
        skinTestExempt: medicationEntry.skinTestExempt,
        skinTestExemptReason: medicationEntry.skinTestExempt
          ? (medicationEntry.skinTestExemptReason?.trim() || '周期内已有阴性结果（有效时间内）')
          : undefined,
        exemptEvidenceEventId: medicationEntry.exemptEvidenceEventId,
        priceType: product.priceType, pricingRequired: true,
        reason: herbal ? '门诊草药处方' : '门诊处方',
      },
    }

    setMedicationDrafts((current) => {
      let syncedCurrent = current
      if (isInfusion && assignedGroupKey) {
        syncedCurrent = syncMedicationDraftGroup(
          current,
          newDraft,
          frequencies.data ?? []
        )
      } else if (herbal) {
        const count = Number(medicationEntry.herbalDoseCount) || 7
        const method = medicationEntry.herbalMethod.trim() || '水煎服'
        const freq = medicationEntry.frequencyCode.trim()
        syncedCurrent = current.map((d) => {
          if (d.editorMode !== 'herbal' && d.categoryCode !== 'HERBAL') return d
          const dose = d.request.doseValue || 0
          const parts = (d.request.medicationInstruction || '').split('；').map((s) => s.trim())
          const special = parts.length > 1 ? parts.slice(1).join('；') : ''
          return {
            ...d,
            request: {
              ...d.request,
              durationValue: count,
              quantity: roundNumber(dose * count, 2),
              frequencyCode: freq || d.request.frequencyCode,
              medicationInstruction: special ? `${method}；${special}` : method,
            },
          }
        })
      }
      return [...syncedCurrent, newDraft]
    })

    let nextSession = groupingSession
    if (isInfusion && assignedGroupKey) {
      if (!nextSession) {
        // 检测到组头药，默认激活成组录入模式
        nextSession = {
          groupKey: assignedGroupKey,
          routeCode: medicationEntry.routeCode.trim(),
          frequencyCode: medicationEntry.frequencyCode.trim(),
          durationValue: medicationEntry.durationValue,
          headMedicationName: medication.name,
        }
        setGroupingSession(nextSession)
      } else {
        // 保持并同步最新途径、频次与天数
        nextSession = {
          ...nextSession,
          routeCode: medicationEntry.routeCode.trim(),
          frequencyCode: medicationEntry.frequencyCode.trim(),
          durationValue: medicationEntry.durationValue,
        }
        setGroupingSession(nextSession)
      }
    }

    if (nextSession) {
      setComposerOpen(true)
      setMedicationEntry({
        ...emptyMedicationEntry(),
        routeCode: nextSession.routeCode,
        routeExecutionType: 'INFUSION',
        frequencyCode: nextSession.frequencyCode,
        durationValue: nextSession.durationValue,
        administrationGroupKey: nextSession.groupKey,
      })
      setValidationError('')
      setEntryType('WESTERN')
      focusResource('WESTERN')
    } else {
      setComposerOpen(true)
      setMedicationEntry(herbal ? {
        ...emptyMedicationEntry(),
        routeCode: 'ORAL', routeExecutionType: 'NONE',
        frequencyCode: medicationEntry.frequencyCode,
        herbalDoseCount: medicationEntry.herbalDoseCount,
        herbalMethod: medicationEntry.herbalMethod,
        durationValue: Number(medicationEntry.herbalDoseCount),
      } : emptyMedicationEntry())
      setValidationError('')
      if (!herbal) {
        setEntryType('ALL')
        focusResource('ALL')
      } else {
        focusResource(entryType)
      }
    }
  }

  function continueOnEnter(event: KeyboardEvent<HTMLInputElement>, nextControlId?: string) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) {
      addCurrentEntry()
      return
    }
    if (nextControlId) focusControl(nextControlId)
    else addCurrentEntry()
  }

  function handleEntryBoxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (composerOpen && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      addCurrentEntry()
    }
  }

  function saveMedicationDraft(next: MedicationPlanDraft) {
    setMedicationDrafts((current) => syncMedicationDraftGroup(
      current,
      next,
      frequencies.data ?? []
    ))
    if (groupingSession && next.administrationGroupKey && groupingSession.groupKey === next.administrationGroupKey) {
      setGroupingSession((curr) => curr ? {
        ...curr,
        routeCode: next.request.routeCode || curr.routeCode,
        frequencyCode: next.request.frequencyCode || curr.frequencyCode,
        durationValue: next.request.durationValue ?? curr.durationValue,
      } : null)
    }
    setEditingDraft(null)
  }

  function renderComposer() {
    return (
      <Fragment key="unified-inline-composer-fragment">
        <div ref={composerRef} className={`doctor-unified-inline-composer is-${entryType.toLowerCase()}${!hasEnteredOrder ? ' is-unselected' : ''}`} role="row"
          onClick={(e) => {
            if (!hasEnteredOrder) {
              const target = e.target as HTMLElement
              if (!target.closest('button, input, select, .ui-select, .ui-remote-search')) {
                focusResource(entryType)
              }
            }
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null
            if (!next) return
            const isInsideRow = composerRef.current?.contains(next)
            const isInsidePopover = Boolean(
              (next as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover')
            )
            const isInsideSubrow = Boolean(
              (next as Element)?.closest?.('.doctor-unified-order-subrow, .doctor-grouping-banner')
            )
            if (!isInsideRow && !isInsidePopover && !isInsideSubrow && !hasEnteredOrder) {
              if (hasOrders) {
                closeComposer()
              } else {
                setValidationError('')
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !hasEnteredOrder) {
              e.preventDefault()
              if (hasOrders) {
                closeComposer()
              } else {
                changeType('ALL')
                setValidationError('')
              }
            }
          }}>
          <OrderComposerResource entryType={entryType} changeType={changeType} hasEnteredOrder={hasEnteredOrder}
            isMedication={isMedication} selectedProduct={selectedProduct} grouping={Boolean(groupingSession)}
            api={api} encounter={encounter} searchMode={searchMode} changeSearchMode={changeSearchMode}
            medicationOption={medicationEntry.medication} service={service} handleOrderResourceSelect={handleOrderResourceSelect} />

          <OrderComposerDirections entryType={entryType} isMedication={isMedication} hasEnteredOrder={hasEnteredOrder}
            medicationEntry={medicationEntry} updateMedication={updateMedication} availableDoseUnits={availableDoseUnits}
            updateRoute={updateRoute} routesLoading={routes.isPending} frequenciesLoading={frequencies.isPending}
            routeOptions={routeOptions} frequencyOptions={frequencyOptions} serviceType={service?.raw?.sdServiceType}
            continueOnEnter={continueOnEnter} addCurrentEntry={addCurrentEntry} />

          <OrderComposerQuantity entryType={entryType} isMedication={isMedication} hasEnteredOrder={hasEnteredOrder}
            medicationEntry={medicationEntry} updateMedication={updateMedication} selectedProduct={selectedProduct}
            isStockInsufficient={isStockInsufficient} frequencyQuantityUnavailable={frequencyQuantityUnavailable}
            calculationText={calcResult?.calculationText} serviceQuantity={serviceQuantity} setServiceQuantity={setServiceQuantity}
            serviceUnit={service?.raw?.unitCode} continueOnEnter={continueOnEnter} />

          <div className="doctor-inline-order-static doctor-inline-order-dept">
            {hasEnteredOrder ? (
              <span className="doctor-direction-chip is-dept">
                {isMedication ? (
                  resolveExecutingDepartment({
                    kind: 'medication',
                    type: entryType,
                    stockSiteName: medicationEntry.stockSiteName,
                  }, currentDept)
                ) : (
                  resolveExecutingDepartment({
                    kind: 'service',
                    type: service?.raw?.sdServiceType || (entryType === 'ALL' ? undefined : entryType),
                    itemName: service?.raw?.name,
                  }, currentDept)
                )}
              </span>
            ) : (
              <span className="doctor-inline-order-placeholder">—</span>
            )}
          </div>

          <OrderComposerInstruction entryType={entryType} isMedication={isMedication} hasEnteredOrder={hasEnteredOrder}
            medicationEntry={medicationEntry} updateMedication={updateMedication} serviceDescription={serviceDescription}
            setServiceDescription={setServiceDescription} continueOnEnter={continueOnEnter} addCurrentEntry={addCurrentEntry} />

          {isMedication ? (
            <div className="doctor-inline-order-static doctor-inline-order-price">
              {selectedProduct ? formatUnitPrice(selectedProduct.price, selectedProduct.currencyCode) : '—'}
            </div>
          ) : (
            <div className="doctor-inline-order-static doctor-inline-order-price">
              {(() => {
                const activePrice = service?.raw?.prices?.find((p) => p.sdStatus === 'ACTIVE') ?? service?.raw?.prices?.[0]
                return activePrice ? formatUnitPrice(activePrice.price, activePrice.currencyCode) : '—'
              })()}
            </div>
          )}

          <div className="doctor-inline-order-status">
            <StatusBadge tone={groupingSession || entryType === 'HERBAL' ? 'success' : 'info'}>
              {groupingSession ? '成组中' : entryType === 'HERBAL' ? '组方中' : '录入中'}
            </StatusBadge>
          </div>
          <div className="doctor-inline-order-actions">
            <Button size="sm" variant="primary" className="doctor-unified-entry-add-btn" onClick={addCurrentEntry}
              disabled={!hasEnteredOrder}
              title="加入待确认列表 (Enter / Ctrl+Enter)" aria-label="加入医嘱"><Icon name="add" /></Button>
            <Button size="sm" variant="text" className="doctor-unified-entry-close-btn" onClick={closeComposer}
              title="退出录入" aria-label="退出医嘱录入"><Icon name="close" /></Button>
          </div>
        </div>

        {groupingSession && (
          <div className="doctor-unified-order-subrow doctor-grouping-banner" role="status">
            <span className="doctor-grouping-tip">
              <strong>成组录入模式</strong>（已关联首药：{groupingSession.headMedicationName}，途径与频次已对齐）
            </span>
            <Button size="sm" variant="secondary" onClick={finishGroupingSession}>组方完成</Button>
          </div>
        )}

        {entryType === 'HERBAL' && (
          <div className="doctor-unified-order-subrow doctor-grouping-banner is-herbal" role="status">
            <span className="doctor-grouping-tip">
              <strong>草药连续组方中</strong>（整方共 {medicationEntry.herbalDoseCount || 7} 剂 · {medicationEntry.herbalMethod || '水煎服'} · {medicationEntry.frequencyCode || 'BID'}{draftHerbalCount > 0 ? ` · 已加入 ${draftHerbalCount} 味` : ''}）
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="doctor-herbal-finish-btn"
              onClick={finishHerbalGrouping}
            >
              完成组方
            </Button>
          </div>
        )}

        <OrderComposerSafety hasSafetyAlert={hasSafetyAlert} allergyVerificationMissing={allergyVerificationMissing}
          isAllergyHit={isAllergyHit} hasKnownAllergies={hasKnownAllergies} matchedAllergies={matchedAllergies}
          drugAllergies={drugAllergies} isSkinTest={isSkinTest} hasPositiveSkinTest={hasPositiveSkinTest}
          isAntimicrobial={isAntimicrobial} antimicrobialLevelText={currentMedication?.sdAntimicrobialLevelText}
          recentNegativeItem={recentNegativeItem} medicationEntry={medicationEntry} updateMedication={updateMedication}
          onChangeReason={(reason) => setMedicationEntry((current) => ({ ...current, skinTestExemptReason: reason }))}
          onChangeExemption={(checked, evidence) => setMedicationEntry((current) =>
            withSkinTestExemption(current, checked, evidence))} />

        {frequencyQuantityUnavailable && entryType !== 'HERBAL' && (
          <div className="doctor-unified-order-subrow" role="row">
            <Alert className="doctor-unified-order-alert" tone="warning">当前频次无法自动推算总量，请核对并手动填写数量。</Alert>
          </div>
        )}
        {(validationError || frequencies.error || routes.error) && (
          <div className="doctor-unified-order-subrow doctor-unified-order-error" role="row">
            <Alert className="doctor-unified-order-alert">
              {validationError || (routes.error ? '给药途径数据加载失败' : '频次数据加载失败')}
            </Alert>
          </div>
        )}
      </Fragment>
    )
  }

  return <div className={`doctor-unified-orders${readOnly ? ' is-readonly' : ''}`} onKeyDown={handleEntryBoxKeyDown}>
    {successToast && (
      <div className="doctor-unified-order-toast" role="status">
        <Icon name="check" />
        <span>{successToast}</span>
        <button type="button" className="doctor-toast-close" onClick={() => setSuccessToast('')} aria-label="关闭提示">
          <Icon name="close" />
        </button>
      </div>
    )}

    <div className="doctor-table-wrap">
      <div className={`doctor-unified-order-list ${savedEntries.length === 0 && draftEntries.length === 0 ? 'is-empty' : ''}`} role="table" aria-label="本次医嘱连续录入列表">
      <div className="doctor-unified-order-head" role="row">
        <span className="doctor-unified-cell-type">类型</span>
        <span className="doctor-unified-cell-name">药品 / 项目</span>
        <span className="doctor-unified-cell-directions">用法用量 / 执行要求</span>
        <span className="doctor-unified-cell-qty">总量</span>
        <span className="doctor-unified-cell-dept">执行科室</span>
        <span className="doctor-unified-cell-instruction">嘱托 / 说明</span>
        <span className="doctor-unified-cell-price">单价</span>
        <span className="doctor-unified-cell-status">状态</span>
        {!readOnly && <span className="doctor-unified-cell-actions">操作</span>}
      </div>

      {!readOnly && <div ref={aiSuggestionSurfaceRef} />}

      {savedEntries.length === 0 && draftEntries.length === 0 && readOnly && (
        <div className="doctor-unified-order-empty" role="row">
          <span>暂无已开立医嘱</span>
        </div>
      )}

      <SavedOrderList savedEntries={savedEntries} draftEntries={draftEntries} allDocuments={allDocuments}
        prescriptions={prescriptions} documentRows={documentRows} activeDocKey={activeDocKey}
        handleSelectDoc={handleSelectDoc} onSavedDocument={onSavedDocument} encounter={encounter} api={api}
        readOnly={readOnly} busy={busy} documentEditing={documentEditing} currentDept={currentDept}
        onCancelService={onCancelService} onPrintService={onPrintService}
        onCancelMedication={onCancelMedication} onPrint={onPrint} skinTestByRequest={skinTestByRequest}
        groupingComposerTarget={groupingComposerTarget} groupingSession={groupingSession}
        isComposerActive={isComposerActive} composer={renderComposer()} />

      {!readOnly && <DraftOrderList draftEntries={draftEntries}
        herbalFormula={{ herbalDoseCount: medicationEntry.herbalDoseCount, herbalMethod: medicationEntry.herbalMethod,
          frequencyCode: medicationEntry.frequencyCode, instruction: medicationEntry.instruction }}
        onHerbalFormulaChange={(formula) => setMedicationEntry((current) => ({ ...current, ...formula }))}
        frequencyOptions={frequencyOptions} routeOptions={routeOptions} routes={routes.data ?? []}
        frequencies={frequencies.data ?? []} administrationGroupOptions={administrationGroups.options} readOnly={readOnly} isComposerActive={isComposerActive}
        entryType={entryType} setMedicationDrafts={setMedicationDrafts} setServiceDrafts={setServiceDrafts}
        startHerbalGrouping={startHerbalGrouping} groupingComposerTarget={groupingComposerTarget}
        composer={renderComposer()} editingDraft={editingDraft} setEditingDraft={setEditingDraft}
        onEditDraft={(draft) => { setComposerOpen(false); setEditingDraft(draft) }}
        onSaveMedicationDraft={saveMedicationDraft} continueGroupingFromDraft={continueGroupingFromDraft}
        groupingSession={groupingSession} currentDept={currentDept} encounter={encounter} api={api}
        allergies={allergies} skinTests={skinTests} />}

      {!readOnly && isComposerActive && !groupingComposerTarget && !(entryType === 'HERBAL' && draftHerbalCount > 0) && renderComposer()}
      </div>

      {!readOnly && !isComposerActive && !editingDraft && (
        <div className="doctor-unified-order-row is-launcher" role="row" onClick={openComposer}>
          <div className="doctor-unified-launcher-cell">
            <button type="button" className="doctor-table-launcher-btn" aria-label="新增医嘱" onClick={(e) => {
              e.stopPropagation()
              openComposer()
            }}>
              <Icon name="add" />
              <span><strong>新增医嘱</strong></span>
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
}
