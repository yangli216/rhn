import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { ActiveOrderFrequency, ItemGroup, MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { ClinicalAiTreatmentRecommendation } from '../../shared/api/clinicalAiApi'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, Icon, Popconfirm, Select, StatusBadge,
  type ClinicalResource, type ClinicalResourceOption, type OrderSearchMode,
} from '../../shared/ui'
import {
  canPrintPrescription, resolveDispensableOptions, type DispensableProductOption, type MedicationPlanDraft,
} from './PrescriptionListEditor'

export type OrderEntryType = 'ALL' | 'MEDICATION' | 'HERBAL' | 'LABORATORY' | 'EXAMINATION' | 'TREATMENT'

export function formatPackageUnit(unitName?: string, unitCode?: string): string {
  const name = unitName?.trim()
  if (name && !/^[A-Z_]+$/.test(name)) return name
  const code = (unitCode || name || '').toUpperCase()
  const map: Record<string, string> = {
    BOX: '盒',
    BOTTLE: '瓶',
    BAG: '袋',
    VIAL: '支',
    AMP: '安瓿',
    TUBE: '支',
    PIECE: '片',
    TAB: '片',
    CAP: '粒',
    STRIP: '板',
    PACK: '包',
    DOSE: '剂',
    ITEM: '项',
  }
  return map[code] || unitName || unitCode || '单位'
}

export interface ServicePlanDraft {
  id: string
  sequence?: number
  serviceType?: string
  catalogItemId: string
  itemCode: string
  itemName: string
  quantity: number
  unitCode?: string
  clinicalDescription?: string
  unitPrice?: number
  currencyCode?: string
}

export function clinicalAiTreatmentKey(item: Pick<ClinicalAiTreatmentRecommendation, 'type' | 'catalogItemId'>) {
  return `${item.type}:${item.catalogItemId}`
}

export interface AiOrderReviewCommand {
  id: string
  encounterId: string
  items: ClinicalAiTreatmentRecommendation[]
  onCompleted?: (acceptedKeys: string[]) => void
}

interface MedicationEntry {
  medication?: ClinicalResourceOption<MedicationKnowledge>
  doseValue: number | ''
  doseUnit: string
  routeCode: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
  administrationGroupKey?: string
  frequencyCode: string
  durationValue: number | ''
  quantity: number | ''
  dispenseOptionKey: string
  instruction: string
  herbalDoseCount: number | ''
  herbalMethod: string
  safetyReviewed: boolean
  allergyOverrideReason: string
  isManualQuantity?: boolean
  stockSiteId?: string
  stockSiteName?: string
  availablePackageQuantity?: number
  packageUnitName?: string
}

export function calculatePackageQuantity({
  medication,
  doseValue,
  doseUnit,
  frequencyCode,
  durationValue,
  selectedPackage,
  frequencies,
}: {
  medication?: MedicationKnowledge
  doseValue?: number | ''
  doseUnit?: string
  frequencyCode?: string
  durationValue?: number | ''
  selectedPackage?: DispensableProductOption
  frequencies?: ActiveOrderFrequency[]
}): { quantity: number; calculationText: string; totalBaseUnits: number } | null {
  if (!medication || !selectedPackage) return null
  const numDose = Number(doseValue)
  if (!numDose || numDose <= 0) return null

  let timesPerDay = 1
  const freqObj = (frequencies ?? []).find((f) => f.code === frequencyCode)
  if (freqObj?.executionTimes?.length) {
    timesPerDay = freqObj.executionTimes.length
  } else if (freqObj?.frequencyCount) {
    const period = freqObj.periodUnit === 'w' ? 7 : (freqObj.periodValue || 1)
    timesPerDay = freqObj.frequencyCount / period
  } else {
    const codeMap: Record<string, number> = {
      QD: 1, QN: 1, BID: 2, TID: 3, QID: 4, Q6H: 4, Q8H: 3, Q12H: 2, QOD: 0.5, QW: 1 / 7, ST: 1, PRN: 1,
    }
    timesPerDay = (frequencyCode ? codeMap[frequencyCode.toUpperCase()] : undefined) ?? 1
  }

  let singleDoseUnits = numDose
  const prepUnit = medication.preparationUnit || ''
  let strValue = medication.strengthValue
  let strUnit = medication.strengthUnit || ''
  const specText = (medication as unknown as { strength?: string }).strength || medication.preparationSpec
  if ((!strValue || strValue <= 0) && specText) {
    const match = String(specText).match(/^([\d.]+)\s*([a-zA-Z\u4e00-\u9fa5]+)/)
    if (match) {
      strValue = Number(match[1])
      strUnit = strUnit || match[2]
    }
  }

  if (doseUnit && prepUnit && doseUnit === prepUnit) {
    singleDoseUnits = numDose
  } else if (strValue && strValue > 0) {
    const dUnit = (doseUnit || '').toLowerCase()
    const sUnit = (strUnit || '').toLowerCase()
    let doseInStrengthUnit = numDose
    if (dUnit && sUnit && dUnit !== sUnit) {
      if (dUnit === 'g' && sUnit === 'mg') doseInStrengthUnit = numDose * 1000
      else if (dUnit === 'mg' && sUnit === 'g') doseInStrengthUnit = numDose / 1000
      else if ((dUnit === 'mg' && (sUnit === 'ug' || sUnit === 'μg'))) doseInStrengthUnit = numDose * 1000
      else if (((dUnit === 'ug' || dUnit === 'μg') && sUnit === 'mg')) doseInStrengthUnit = numDose / 1000
    }
    singleDoseUnits = doseInStrengthUnit / strValue
  }

  const days = Number(durationValue) > 0 ? Number(durationValue) : 1
  const totalBaseUnits = singleDoseUnits * timesPerDay * days
  const factor = selectedPackage.packageFactor > 0 ? selectedPackage.packageFactor : 1
  const packageQty = Math.max(1, Math.ceil(totalBaseUnits / factor))

  const calculationText = `1${selectedPackage.unitName}=${factor}${prepUnit || '单位'} · ${days}天共需${Math.round(totalBaseUnits * 100) / 100}${prepUnit || ''}，合${packageQty}${selectedPackage.unitName}`

  return { quantity: packageQty, calculationText, totalBaseUnits }
}

const emptyMedicationEntry = (): MedicationEntry => ({
  doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
  dispenseOptionKey: '', instruction: '', herbalDoseCount: 7, herbalMethod: '水煎服', safetyReviewed: false,
  allergyOverrideReason: '', isManualQuantity: false,
  stockSiteId: undefined, stockSiteName: undefined, availablePackageQuantity: undefined, packageUnitName: undefined,
})

function newAdministrationGroupKey() {
  return `draft:${globalThis.crypto.randomUUID()}`
}

export interface AdministrationGroupDetail {
  key: string
  label: string
  medicationNames: string[]
  routeCode?: string
  frequencyCode?: string
  durationValue?: number
  isRequest: boolean
}

function buildAdministrationGroups(medications: MedicationRequest[], drafts: MedicationPlanDraft[], currentKey?: string) {
  const labels = new Map<string, string>()
  const requestLabels = new Map<string, string>()
  const draftLabels = new Map<string, string>()
  const groupDetails = new Map<string, AdministrationGroupDetail>()
  let sequence = 0

  const labelFor = (key: string, isRequest = false) => {
    let detail = groupDetails.get(key)
    if (!detail) {
      const label = `IV-${String(++sequence).padStart(2, '0')}`
      detail = {
        key,
        label,
        medicationNames: [],
        isRequest,
      }
      groupDetails.set(key, detail)
      labels.set(key, label)
    }
    return detail.label
  }

  medications.filter((value) => value.status !== 'CANCELLED'
    && value.routeExecutionType === 'INFUSION').forEach((value) => {
    const key = `request:${value.parentRequestId || value.id}`
    const label = labelFor(key, true)
    requestLabels.set(value.id, label)
    const detail = groupDetails.get(key)
    if (detail) {
      detail.medicationNames.push(value.itemName || value.medicationName)
      if (!detail.routeCode) detail.routeCode = value.routeCode
      if (!detail.frequencyCode) detail.frequencyCode = value.frequencyCode
      if (!detail.durationValue) detail.durationValue = value.durationValue
    }
  })

  let latestDraftGroupKey: string | undefined
  drafts.filter((value) => value.routeExecutionType === 'INFUSION' && value.administrationGroupKey)
    .forEach((value) => {
      const key = value.administrationGroupKey!
      const label = labelFor(key, false)
      draftLabels.set(value.id, label)
      latestDraftGroupKey = key
      const detail = groupDetails.get(key)
      if (detail) {
        detail.medicationNames.push(value.productName || value.medicationName)
        if (!detail.routeCode) detail.routeCode = value.request.routeCode
        if (!detail.frequencyCode) detail.frequencyCode = value.request.frequencyCode
        if (!detail.durationValue) detail.durationValue = value.request.durationValue
      }
    })

  if (currentKey) labelFor(currentKey, false)

  const existingGroups = [...groupDetails.values()].filter((g) => g.medicationNames.length > 0)

  return {
    requestLabels,
    draftLabels,
    groupDetails,
    existingGroups,
    latestDraftGroupKey,
    options: [...labels.entries()].map(([value, label]) => {
      const detail = groupDetails.get(value)
      const desc = detail && detail.medicationNames.length > 0
        ? `已含: ${detail.medicationNames.slice(0, 2).join('、')}`
        : (value.startsWith('request:') ? '已开立组' : '本次待确认组')
      return {
        value, label, secondaryText: desc, searchKeywords: [label],
      }
    }),
    currentLabel: currentKey ? labels.get(currentKey) : undefined,
  }
}

export function UnifiedOrderListEditor({
  encounter, allergies = [], prescriptions = [], medications = [], services = [],
  medicationDrafts = [], setMedicationDrafts,
  serviceDrafts = [], setServiceDrafts, api, busy = false,
  readOnly = false, aiOrderReview, onAiOrderReviewConsumed, aiSuggestionSurfaceRef,
  onCancelMedication = () => {}, onCancelService = () => {}, onPrint = () => {},
}: {
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
  aiSuggestionSurfaceRef?: (element: HTMLDivElement | null) => void
  readOnly?: boolean
  onCancelMedication?: (value: MedicationRequest) => void
  onCancelService?: (value: ServiceRequest) => void
  onPrint?: (value: Prescription) => void
}) {
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
  const [editingDraft, setEditingDraft] = useState<{ kind: 'medication' | 'service'; id: string } | null>(null)

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
  const isMedication = entryType === 'MEDICATION' || entryType === 'HERBAL' || (entryType === 'ALL' && !service)
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
  const calcResult = useMemo(() => calculatePackageQuantity({
    medication: currentMedication,
    doseValue: medicationEntry.doseValue,
    doseUnit: medicationEntry.doseUnit,
    frequencyCode: medicationEntry.frequencyCode,
    durationValue: medicationEntry.durationValue,
    selectedPackage: selectedProduct,
    frequencies: frequencies.data,
  }), [currentMedication, medicationEntry.doseValue, medicationEntry.doseUnit, medicationEntry.frequencyCode, medicationEntry.durationValue, selectedProduct, frequencies.data])
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const allergyReviewRecorded = allergies.some((item) => item.assertionType === 'NO_KNOWN_ALLERGY'
    || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY') || drugAllergies.length > 0
  const matchedAllergies = currentMedication ? drugAllergies.filter((item) => item.substanceCode
    && item.substanceCode.toLowerCase() === currentMedication.code.toLowerCase()) : []
  const hasKnownAllergies = drugAllergies.length > 0
  const isSkinTest = Boolean(currentMedication?.skinTestRequired)
  const isAntimicrobial = Boolean(currentMedication?.antimicrobial)
  const isAllergyHit = matchedAllergies.length > 0
  const hasSafetyAlert = Boolean(currentMedication && (isAllergyHit || hasKnownAllergies || isSkinTest || isAntimicrobial))
  const isStockInsufficient = Boolean(
    isMedication
    && medicationEntry.availablePackageQuantity != null
    && typeof medicationEntry.quantity === 'number'
    && medicationEntry.quantity > medicationEntry.availablePackageQuantity
  )
  const savedEntries: Array<
    { kind: 'service'; value: ServiceRequest } | { kind: 'medication'; value: MedicationRequest }
  > = [
    ...services.map((value) => ({ kind: 'service' as const, value })),
    ...medications.map((value) => ({ kind: 'medication' as const, value })),
  ].sort((left, right) => byAuthoredAt(left.value, right.value))
  const draftEntries: Array<
    { kind: 'service'; value: ServicePlanDraft } | { kind: 'medication'; value: MedicationPlanDraft }
  > = [
    ...serviceDrafts.map((value) => ({ kind: 'service' as const, value })),
    ...medicationDrafts.map((value) => ({ kind: 'medication' as const, value })),
  ].sort((left, right) => bySequence(left.value, right.value))

  const hasOrders = savedEntries.length > 0 || draftEntries.length > 0
  const isComposerActive = !readOnly && (composerOpen || !hasOrders)

  function changeType(value: OrderEntryType) {
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
  }

  function closeComposer() {
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
      if (!isInsideRow && !isInsidePopover && !hasEnteredOrder) {
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
    const initialRoute = entryType === 'HERBAL' ? 'ORAL' : value?.defaultRoute ?? 'ORAL'
    const initialRouteExecutionType = entryType === 'HERBAL' ? 'NONE'
      : routes.data?.find((route) => route.code === initialRoute)?.executionType
    let initialFrequency = entryType === 'HERBAL'
      ? medicationEntry.frequencyCode || value?.defaultFrequency || 'BID'
      : value?.defaultFrequency ?? 'QD'
    let initialDuration = entryType === 'HERBAL' ? Number(medicationEntry.herbalDoseCount) || 7 : (medicationEntry.durationValue || 7)

    let initialGroupKey: string | undefined
    if (initialRouteExecutionType === 'INFUSION') {
      const latestGroup = administrationGroups.latestDraftGroupKey
        ? administrationGroups.groupDetails.get(administrationGroups.latestDraftGroupKey)
        : undefined
      if (latestGroup) {
        initialGroupKey = latestGroup.key
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
      quantity: calc?.quantity ?? 1,
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
    })
    setValidationError('')
    if (option && entryType !== 'HERBAL') focusControlAfterSelection('doctor-unified-dose')
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
      selectMedication(undefined)
      setService(undefined)
      setEntryType('ALL')
      setValidationError('')
      return
    }

    // 2. 药品 (MedicationKnowledge / OrderableMedicationKnowledge)
    if (raw && ('sdMedicationType' in raw || 'preparationSpec' in raw || 'products' in raw)) {
      const medType: OrderEntryType = raw.sdMedicationType === 'HERBAL' ? 'HERBAL' : 'MEDICATION'
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
      focusControlAfterSelection('doctor-unified-service-note')
      return
    }
  }

  const reviewState = useRef({ encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed,
    medicationDrafts, serviceDrafts, medications, services, allergies })
  reviewState.current = { encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed,
    medicationDrafts, serviceDrafts, medications, services, allergies }
  useEffect(() => {
    if (!aiOrderReview || aiOrderReview.encounterId !== encounter.id) return
    let cancelled = false
    const canReview = () => !cancelled && reviewState.current.encounterId === aiOrderReview.encounterId
      && !reviewState.current.busy && !reviewState.current.readOnly
    if (!canReview()) {
      setValidationError('当前医嘱区正在处理其他操作，请稍后重试。')
      reviewState.current.onAiOrderReviewConsumed?.()
      return
    }
    void (async () => {
      const existing = new Set([
        ...reviewState.current.medicationDrafts.map((value) => `MEDICATION:${value.request.catalogItemId}`),
        ...reviewState.current.serviceDrafts.map((value) => `${value.serviceType}:${value.catalogItemId}`),
        ...reviewState.current.medications.filter((value) => value.status !== 'CANCELLED')
          .map((value) => `MEDICATION:${value.catalogItemId}`),
        ...reviewState.current.services.filter((value) => value.status !== 'CANCELLED')
          .map((value) => `${value.serviceType}:${value.catalogItemId}`),
      ])
      const selected = [...new Map(aiOrderReview.items.map((item) => [clinicalAiTreatmentKey(item), item])).values()]
        .filter((item) => !existing.has(clinicalAiTreatmentKey(item)))
      const resolved = await Promise.all(selected.map(async (item) => {
        if (item.type === 'MEDICATION') {
          const matches = await api.encounters.orderableMedications(encounter.id, item.code)
          const medication = matches.find((value) => String(value.id) === String(item.medicationId)
            && value.products.some((product) => String(product.id) === String(item.catalogItemId))
            && Number(value.availablePackageQuantity) > 0)
          if (!medication) return { item, error: '已不在本次可用药品目录中' }
          const raw = { ...medication,
            products: medication.products.filter((product) => String(product.id) === String(item.catalogItemId)) }
          const product = resolveDispensableOptions(raw, encounter.organizationId)[0]
          if (!product) return { item, error: '未配置可发药产品、包装或有效价格' }
          const doseValue = Number(raw.defaultDose)
          const doseUnit = raw.defaultDoseUnit || raw.preparationUnit
          const routeCode = raw.defaultRoute
          const frequencyCode = raw.defaultFrequency
          if (!(doseValue > 0) || !doseUnit || !routeCode || !frequencyCode) {
            return { item, error: '目录缺少默认剂量、途径或频次，请手工检索后补全' }
          }
          const routeExecutionType = routes.data?.find((value) => value.code === routeCode)?.executionType
          if (raw.sdMedicationType === 'HERBAL' || routeExecutionType === 'INFUSION') {
            return { item, error: '草药或输液需手工核对剂数、服法或输液分组' }
          }
          const allergyHit = reviewState.current.allergies.some((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG' && allergy.substanceCode?.toLowerCase() === raw.code.toLowerCase())
          if (allergyHit) return { item, error: '命中已知药物过敏，需手工开立并填写理由' }
          const drugAllergies = reviewState.current.allergies.filter((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG')
          const allergyReviewRecorded = reviewState.current.allergies.some((allergy) =>
            allergy.assertionType === 'NO_KNOWN_ALLERGY' || allergy.assertionType === 'NO_KNOWN_DRUG_ALLERGY')
            || drugAllergies.length > 0
          const hasSafetyAlert = drugAllergies.length > 0 || Boolean(raw.skinTestRequired || raw.antimicrobial)
          const quantity = calculatePackageQuantity({ medication: raw, doseValue, doseUnit, frequencyCode,
            selectedPackage: product, frequencies: frequencies.data })?.quantity ?? 1
          if (quantity > Number(raw.availablePackageQuantity)) return { item, error: '当前可用库存不足' }
          const draft: MedicationPlanDraft = {
            id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: 'regular',
            categoryCode: raw.sdMedicationType, medicationName: raw.name, medicationCode: raw.code,
            preparationSpec: raw.preparationSpec, productName: product.product.name,
            productSpec: product.itemPackage?.packageSpec || product.label,
            manufacturerName: product.product.manufacturerName, unitPrice: product.price,
            currencyCode: product.currencyCode,
            routeName: routes.data?.find((value) => value.code === routeCode)?.name,
            routeExecutionType,
            stockSiteName: raw.stockSiteName, availablePackageQuantity: raw.availablePackageQuantity,
            packageUnitName: raw.packageUnitName,
            request: { medicationId: raw.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
              doseValue, doseUnit, routeCode, frequencyCode, quantity, quantityUnit: product.unitCode,
              substitutionAllowed: true, selfProvided: false,
              allergyReviewConfirmed: allergyReviewRecorded || !hasSafetyAlert,
              priceType: product.priceType, pricingRequired: true, reason: 'AI 治疗建议，待医生核对' },
          }
          return { item, medicationDraft: draft }
        }
        const matches = await api.masterData.searchServices(item.code, item.type, 'ACTIVE', encounter.organizationId, 0, 100)
        const today = new Date().toLocaleDateString('sv-SE')
        const valid = (from?: string, to?: string) => (!from || from <= today) && (!to || to >= today)
        const raw = matches.content.find((value) => String(value.id) === String(item.catalogItemId)
          && value.sdStatus === 'ACTIVE' && value.orderable && ['COMMON', 'OUTPATIENT'].includes(value.sdUsageType)
          && valid(value.validFrom, value.validTo) && value.organizationAdoption?.organizationId === encounter.organizationId
          && value.organizationAdoption.sdStatus === 'ACTIVE' && value.organizationAdoption.orderable
          && value.organizationAdoption.executable && valid(value.organizationAdoption.validFrom, value.organizationAdoption.validTo))
        if (!raw) return { item, error: '已不在本次可用诊疗目录中' }
        const activePrice = raw.prices?.find((price) => price.sdStatus === 'ACTIVE') ?? raw.prices?.[0]
        const serviceDraft: ServicePlanDraft = {
          id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: raw.sdServiceType,
          catalogItemId: raw.id, itemCode: raw.code, itemName: raw.name, quantity: 1, unitCode: raw.unitCode,
          clinicalDescription: item.rationale || undefined, unitPrice: activePrice?.price,
          currencyCode: activePrice?.currencyCode,
        }
        return { item, serviceDraft }
      }))
      if (!canReview()) return
      const medicationAdditions = resolved.flatMap((value) => value.medicationDraft ? [value.medicationDraft] : [])
      const serviceAdditions = resolved.flatMap((value) => value.serviceDraft ? [value.serviceDraft] : [])
      if (medicationAdditions.length) setMedicationDrafts((current) => [...current, ...medicationAdditions])
      if (serviceAdditions.length) setServiceDrafts((current) => [...current, ...serviceAdditions])
      const acceptedKeys = resolved.filter((value) => value.medicationDraft || value.serviceDraft)
        .map((value) => clinicalAiTreatmentKey(value.item))
      const failures = resolved.filter((value) => value.error)
      if (acceptedKeys.length) {
        setSuccessToast(`已将 ${acceptedKeys.length} 项 AI 建议转为待确认医嘱，可直接逐项编辑或统一审核开立。`)
        aiOrderReview.onCompleted?.(acceptedKeys)
      }
      setValidationError(failures.length ? failures.map((value) => `${value.item.name}：${value.error}`).join('；') : '')
    })().catch(() => {
      if (canReview()) setValidationError('部分目录读取失败，请重试或在医嘱区检索。')
    }).finally(() => {
      if (!cancelled) reviewState.current.onAiOrderReviewConsumed?.()
    })
    return () => { cancelled = true }
    // The review is a one-shot command. Mutable editor state is checked again after the catalog query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOrderReview?.id, encounter.id, api])

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
          }
        }
      }
      return next
    })
    setValidationError('')
  }

  function updateRoute(routeCode: string) {
    const executionType = routes.data?.find((value) => value.code === routeCode)?.executionType
    setMedicationEntry((current) => ({
      ...current,
      routeCode,
      routeExecutionType: executionType,
      administrationGroupKey: executionType === 'INFUSION'
        ? (current.routeExecutionType === 'INFUSION' && current.administrationGroupKey
            ? current.administrationGroupKey : newAdministrationGroupKey())
        : undefined,
    }))
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
    if (entryType === 'MEDICATION' && (!medicationEntry.routeCode.trim()
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

    if (isMedication && isStockInsufficient) {
      setValidationError(`开立数量(${medicationEntry.quantity})超过【${medicationEntry.stockSiteName || '药房'}】当前可用库存(${medicationEntry.availablePackageQuantity}${medicationEntry.packageUnitName || '包装'})，请调减数量`)
      return
    }
    const herbal = entryType === 'HERBAL'
    const doseValue = Number(medicationEntry.doseValue)
    setMedicationDrafts((current) => [...current, {
      id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: herbal ? 'herbal' : 'regular',
      categoryCode: medication.sdMedicationType, medicationName: medication.name, medicationCode: medication.code,
      preparationSpec: medication.preparationSpec, productName: product.product.name,
      productSpec: product.itemPackage?.packageSpec || product.label,
      manufacturerName: product.product.manufacturerName,
      unitPrice: product.price, currencyCode: product.currencyCode,
      routeName: herbal ? '口服'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.name,
      routeExecutionType: herbal ? 'NONE'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.executionType,
      administrationGroupKey: herbal || !currentIsInfusion ? undefined
        : medicationEntry.administrationGroupKey || newAdministrationGroupKey(),
      stockSiteName: medicationEntry.stockSiteName,
      availablePackageQuantity: medicationEntry.availablePackageQuantity,
      packageUnitName: medicationEntry.packageUnitName,
      request: {
        medicationId: medication.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
        doseValue, doseUnit: medicationEntry.doseUnit.trim(),
        routeCode: herbal ? 'ORAL' : medicationEntry.routeCode.trim(),
        frequencyCode: medicationEntry.frequencyCode.trim(),
        durationValue: herbal ? Number(medicationEntry.herbalDoseCount)
          : medicationEntry.durationValue === '' ? undefined : Number(medicationEntry.durationValue),
        durationUnit: herbal ? '剂' : medicationEntry.durationValue === '' ? undefined : '天',
        quantity: herbal ? doseValue * Number(medicationEntry.herbalDoseCount) : Number(medicationEntry.quantity),
        quantityUnit: product.unitCode, substitutionAllowed: true, selfProvided: false,
        medicationInstruction: herbal
          ? [medicationEntry.herbalMethod, medicationEntry.instruction.trim()].filter(Boolean).join('；')
          : medicationEntry.instruction.trim(),
        allergyReviewConfirmed: medicationEntry.safetyReviewed || allergyReviewRecorded || !hasSafetyAlert,
        allergyOverrideReason: medicationEntry.allergyOverrideReason.trim() || undefined,
        priceType: product.priceType, pricingRequired: true,
        reason: herbal ? '门诊草药处方' : '门诊处方',
      },
    }])
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

      {savedEntries.map((entry, index) => {
        if (entry.kind === 'service') return <ServiceReadRow key={`service-${entry.value.id}`} value={entry.value}
          busy={busy} readOnly={readOnly} onCancel={() => onCancelService(entry.value)} />
        const prescription = prescriptions.find((value) => value.id === entry.value.prescriptionId)
        const firstLine = prescription?.medicationRequests.find((value) => value.status === 'ACTIVE')?.id === entry.value.id
        const prev = index > 0 ? savedEntries[index - 1] : undefined
        const isSubsequent = Boolean(
          entry.value.routeExecutionType === 'INFUSION' &&
          (entry.value.parentRequestId || entry.value.id) &&
          prev?.kind === 'medication' &&
          (prev.value.parentRequestId || prev.value.id) === (entry.value.parentRequestId || entry.value.id)
        )
        return <MedicationReadRow key={`medication-${entry.value.id}`} value={entry.value} busy={busy}
          administrationGroupLabel={administrationGroups.requestLabels.get(entry.value.id)}
          isSubsequent={isSubsequent}
          readOnly={readOnly}
          skinTest={skinTestByRequest.get(entry.value.id)}
          onCancel={() => onCancelMedication(entry.value)}
          onPrint={prescription && firstLine && canPrintPrescription(prescription) ? () => onPrint(prescription) : undefined} />
      })}

      {!readOnly && draftEntries.map((entry, index) => entry.kind === 'service'
        ? editingDraft?.kind === 'service' && editingDraft.id === entry.value.id
          ? <ServiceDraftEditRow key={`draft-service-edit-${entry.value.id}`} value={entry.value}
              onCancel={() => setEditingDraft(null)}
              onSave={(next) => {
                setServiceDrafts((current) => current.map((value) => value.id === next.id ? next : value))
                setEditingDraft(null)
              }}
              onRemove={() => {
                setEditingDraft((curr) => curr?.id === entry.value.id ? null : curr)
                setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))
              }} />
          : <ServiceDraftRow key={`draft-service-${entry.value.id}`} value={entry.value}
              onEdit={() => { setComposerOpen(false); setEditingDraft({ kind: 'service', id: entry.value.id }) }}
              onRemove={() => setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
        : editingDraft?.kind === 'medication' && editingDraft.id === entry.value.id
          ? <MedicationDraftEditRow key={`draft-medication-edit-${entry.value.id}`} value={entry.value}
              routeOptions={routeOptions} frequencyOptions={frequencyOptions}
              routeExecutionTypes={new Map((routes.data ?? []).map((value) => [value.code, value.executionType]))}
              administrationGroupOptions={administrationGroups.options}
              onCancel={() => setEditingDraft(null)}
              onSave={(next) => {
                setMedicationDrafts((current) => current.map((value) => value.id === next.id ? next : value))
                setEditingDraft(null)
              }}
              onRemove={() => {
                setEditingDraft((curr) => curr?.id === entry.value.id ? null : curr)
                setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))
              }} />
          : (() => {
              const prev = index > 0 ? draftEntries[index - 1] : undefined
              const isSubsequent = Boolean(
                entry.value.administrationGroupKey &&
                prev?.kind === 'medication' &&
                prev.value.administrationGroupKey === entry.value.administrationGroupKey
              )
              return <MedicationDraftRow key={`draft-medication-${entry.value.id}`} value={entry.value}
                administrationGroupLabel={administrationGroups.draftLabels.get(entry.value.id)}
                isSubsequent={isSubsequent}
                onEdit={() => { setComposerOpen(false); setEditingDraft({ kind: 'medication', id: entry.value.id }) }}
                onRemove={() => setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
            })())}

      {!readOnly && isComposerActive && (
        <>
          <div ref={composerRef} className={`doctor-unified-inline-composer is-${entryType.toLowerCase()}${!hasEnteredOrder ? ' is-unselected' : ''}`} role="row"
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null
              if (!next) return
              const isInsideRow = composerRef.current?.contains(next)
              const isInsidePopover = Boolean(
                (next as Element)?.closest?.('.ui-remote-search__popover, .ui-select__popover')
              )
              if (!isInsideRow && !isInsidePopover && !hasEnteredOrder) {
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
            <div className="doctor-inline-order-field doctor-inline-order-type">
              <div className="doctor-composer-type-wrap">
                <Select id="doctor-unified-entry-type" aria-label="医嘱类型" value={entryType} clearable={false} searchable={false}
                  options={[
                    { value: 'ALL', label: '全部类型' },
                    { value: 'MEDICATION', label: '西药/成药' },
                    { value: 'HERBAL', label: '草药' },
                    { value: 'LABORATORY', label: '检验' },
                    { value: 'EXAMINATION', label: '检查' },
                    { value: 'TREATMENT', label: '治疗' },
                  ]}
                  onChange={(value) => {
                    const nextType = value as OrderEntryType
                    changeType(nextType)
                    globalThis.setTimeout(() => focusResource(nextType), 0)
                  }} />
              </div>
            </div>

            <div className="doctor-inline-order-field doctor-inline-order-resource">
              <ClinicalResourceSearch
                id={`doctor-unified-${entryType}-resource`}
                api={api}
                resource={entryType === 'ALL' ? 'mixed' : (isMedication ? 'medication' : 'service')}
                searchMode={searchMode}
                onSearchModeChange={changeSearchMode}
                organizationId={encounter.organizationId}
                encounterId={encounter.id}
                value={isMedication ? (medicationEntry.medication as any) : (service as any)}
                aria-label={entryType === 'HERBAL' ? '搜索中草药名称/拼音' : entryType === 'ALL' ? '搜索药品/项目名称或拼音' : isMedication ? '搜索药品名称/拼音' : `搜索${orderTypeLabel(entryType)}项目名称/拼音`}
                filterResult={entryType === 'ALL' ? undefined
                  : entryType === 'MEDICATION' ? (item) => !('sdMedicationType' in (item as any)) || (item as any)?.sdMedicationType !== 'HERBAL'
                  : entryType === 'HERBAL' ? (item) => (item as any)?.sdMedicationType === 'HERBAL'
                  : (item) => (item as any)?.sdServiceType === entryType}
                placeholder={entryType === 'HERBAL' ? '搜索中草药名称/拼音' : entryType === 'ALL' ? '搜索药品/项目名称或拼音' : isMedication ? '搜索药品名称/拼音' : `搜索${orderTypeLabel(entryType)}项目名称/拼音`}
                onChange={handleOrderResourceSelect} />
              {isMedication && selectedProduct && (
                <div className="doctor-inline-spec-hint">
                  <span>{selectedProduct.itemPackage?.packageSpec || selectedProduct.label}</span>
                  {selectedProduct.product.manufacturerName && (
                    <>
                      <span className="doctor-subtext-divider">/</span>
                      <span>{selectedProduct.product.manufacturerName}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {isMedication ? (
              entryType === 'HERBAL' ? (
                <div className="doctor-inline-order-directions-group">
                  <div className={`doctor-inline-order-field doctor-inline-order-dose${!hasEnteredOrder ? ' is-disabled' : ''}`} title="每付剂量">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-dose" aria-label="每付剂量" type="number" min="0" step="0.01"
                        disabled={!hasEnteredOrder}
                        value={medicationEntry.doseValue} placeholder="0"
                        onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-method')} />
                      <small>{medicationEntry.doseUnit || 'g'}</small>
                    </div>
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-route${!hasEnteredOrder ? ' is-disabled' : ''}`} title="煎服法">
                    <input id="doctor-unified-herbal-method" aria-label="服法" value={medicationEntry.herbalMethod} placeholder="水煎服"
                      disabled={!hasEnteredOrder}
                      onChange={(event) => updateMedication('herbalMethod', event.target.value)}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-frequency')} />
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-frequency${!hasEnteredOrder ? ' is-disabled' : ''}`} title="频次">
                    <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
                      disabled={!hasEnteredOrder}
                      onChange={(value) => updateMedication('frequencyCode', value)}
                      openOnFocus
                      onSelectionCommit={() => focusControlAfterSelection('doctor-unified-herbal-count')}
                      showValue loading={frequencies.isPending} popoverMinWidth={260}
                      placeholder="频次" options={frequencyOptions} />
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-duration${!hasEnteredOrder ? ' is-disabled' : ''}`} title="剂数">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-herbal-count" aria-label="剂数" type="number" min="1"
                        disabled={!hasEnteredOrder}
                        value={medicationEntry.herbalDoseCount}
                        onChange={(event) => updateMedication('herbalDoseCount', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} />
                      <small>剂</small>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="doctor-inline-order-directions-group">
                  <div className={`doctor-inline-order-field doctor-inline-order-dose${!hasEnteredOrder ? ' is-disabled' : ''}`} title="单次剂量">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-dose" aria-label="单次剂量" type="number" min="0" step="0.01"
                        disabled={!hasEnteredOrder}
                        value={medicationEntry.doseValue} placeholder="0"
                        onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-route')} />
                      <small>{medicationEntry.doseUnit || ''}</small>
                    </div>
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-route${!hasEnteredOrder ? ' is-disabled' : ''}`} title="给药途径">
                    <Select id="doctor-unified-route" aria-label="给药途径" value={medicationEntry.routeCode}
                      disabled={!hasEnteredOrder}
                      onChange={updateRoute}
                      openOnFocus
                      onSelectionCommit={() => focusControlAfterSelection('doctor-unified-frequency')}
                      showValue loading={routes.isPending} popoverMinWidth={220}
                      placeholder="途径" options={routeOptions} />
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-frequency${!hasEnteredOrder ? ' is-disabled' : ''}`} title="执行频次">
                    <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
                      disabled={!hasEnteredOrder}
                      onChange={(value) => updateMedication('frequencyCode', value)}
                      openOnFocus
                      onSelectionCommit={() => focusControlAfterSelection('doctor-unified-duration')}
                      showValue loading={frequencies.isPending} popoverMinWidth={260}
                      placeholder="频次" options={frequencyOptions} />
                  </div>

                  <div className={`doctor-inline-order-field doctor-inline-order-duration${!hasEnteredOrder ? ' is-disabled' : ''}`} title="疗程">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-duration" aria-label="疗程" type="number" min="1"
                        disabled={!hasEnteredOrder}
                        value={medicationEntry.durationValue} placeholder="天数"
                        onChange={(event) => updateMedication('durationValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
                      <small>天</small>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="doctor-inline-order-static doctor-inline-service-execution">
                <span className="doctor-direction-service">{formatServiceExecution(service?.raw?.sdServiceType || (entryType === 'ALL' ? undefined : entryType))}</span>
              </div>
            )}

            {isMedication ? (
              entryType === 'HERBAL' ? (
                <div className={`doctor-inline-order-field doctor-inline-order-quantity${!hasEnteredOrder ? ' is-disabled' : ''}`}>
                  <div className="doctor-entry-input-unit">
                    <input id="doctor-unified-quantity" aria-label="总量" type="number"
                      disabled={!hasEnteredOrder}
                      value={medicationEntry.doseValue === '' || medicationEntry.herbalDoseCount === '' ? ''
                        : Number(medicationEntry.doseValue) * Number(medicationEntry.herbalDoseCount)}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} readOnly />
                    <small>g</small>
                  </div>
                </div>
              ) : (
                <div className={`doctor-inline-order-field doctor-inline-order-quantity ${isStockInsufficient ? 'is-danger' : ''}${!hasEnteredOrder ? ' is-disabled' : ''}`}>
                  <div className="doctor-entry-input-unit">
                    <input id="doctor-unified-quantity" aria-label="总量" type="number" min="0.01" step="0.01"
                      disabled={!hasEnteredOrder}
                      title={isStockInsufficient ? `开立数量超过当前可用库存` : (calcResult?.calculationText ? `根据剂量频次自动计算: ${calcResult.calculationText}` : undefined)}
                      value={medicationEntry.quantity} placeholder="数量"
                      onChange={(event) => updateMedication('quantity', numberValue(event.target.value))}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} />
                    <small>{formatPackageUnit(selectedProduct?.unitName, selectedProduct?.unitCode)}</small>
                  </div>
                </div>
              )
            ) : (
              <div className={`doctor-inline-order-field doctor-inline-order-quantity${!hasEnteredOrder ? ' is-disabled' : ''}`}>
                <div className="doctor-entry-input-unit">
                  <input id="doctor-unified-quantity" aria-label="项目数量" type="number" min="0.01" step="0.01"
                    disabled={!hasEnteredOrder}
                    value={serviceQuantity} placeholder="数量"
                    onChange={(event) => setServiceQuantity(Number(event.target.value))}
                    onKeyDown={(event) => continueOnEnter(event)} />
                  <small>{service?.raw?.unitCode ?? '项'}</small>
                </div>
              </div>
            )}

            {isMedication ? (
              entryType === 'HERBAL' ? (
                <div className={`doctor-inline-order-field doctor-inline-order-instruction${!hasEnteredOrder ? ' is-disabled' : ''}`} title="特殊煎法/嘱托">
                  <input id="doctor-unified-instruction" aria-label="特殊煎法" value={medicationEntry.instruction}
                    disabled={!hasEnteredOrder}
                    list="doctor-herbal-instruction-options"
                    placeholder="如: 先煎、后下" onChange={(event) => updateMedication('instruction', event.target.value)}
                    onKeyDown={(event) => continueOnEnter(event)} />
                  <datalist id="doctor-herbal-instruction-options">
                    {['先煎', '后下', '包煎', '烊化', '冲服', '另煎', '生用'].map((value) => <option key={value} value={value} />)}
                  </datalist>
                </div>
              ) : (
                <div className={`doctor-inline-order-field doctor-inline-order-instruction${!hasEnteredOrder ? ' is-disabled' : ''}`} title="用药嘱托">
                  <input id="doctor-unified-instruction" aria-label="用药嘱托" value={medicationEntry.instruction}
                    disabled={!hasEnteredOrder}
                    placeholder="嘱托 (如: 饭后)" onChange={(event) => updateMedication('instruction', event.target.value)}
                    onKeyDown={(event) => continueOnEnter(event)} />
                </div>
              )
            ) : (
              <div className={`doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note${!hasEnteredOrder ? ' is-disabled' : ''}`}>
                <input id="doctor-unified-service-note" className="doctor-unified-service-note" aria-label="临床说明"
                  disabled={!hasEnteredOrder}
                  value={serviceDescription} placeholder={entryType === 'LABORATORY' ? '标本种类或检验目的 (回车跳至数量)' : entryType === 'EXAMINATION' ? '检查部位及检查目的 (回车跳至数量)' : '治疗部位或临床说明 (回车跳至数量)'}
                  onChange={(event) => setServiceDescription(event.target.value)}
                  onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
              </div>
            )}

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

            <div className="doctor-inline-order-status"><StatusBadge tone="info">录入中</StatusBadge></div>
            <div className="doctor-inline-order-actions">
              <Button size="sm" variant="primary" className="doctor-unified-entry-add-btn" onClick={addCurrentEntry}
                disabled={!hasEnteredOrder}
                title="加入待确认列表 (Enter / Ctrl+Enter)" aria-label="加入医嘱"><Icon name="add" /></Button>
              <Button size="sm" variant="text" className="doctor-unified-entry-close-btn" onClick={closeComposer}
                title="退出录入" aria-label="退出医嘱录入"><Icon name="close" /></Button>
            </div>
          </div>

          {entryType === 'MEDICATION' && currentIsInfusion && (() => {
            const currentSelectedGroup = medicationEntry.administrationGroupKey
              ? administrationGroups.groupDetails.get(medicationEntry.administrationGroupKey)
              : undefined
            const isExistingSelected = Boolean(currentSelectedGroup && currentSelectedGroup.medicationNames.length > 0)
            return (
              <div className="doctor-unified-order-subrow doctor-administration-group-editor" role="row">
                <div className="doctor-infusion-group-header">
                  <strong>输液成组设置：</strong>
                  <span className="doctor-infusion-group-tip">同组药品将混合在同一袋/瓶静滴，给药途径、频次与疗程自动对齐保持一致。</span>
                </div>

                {administrationGroups.existingGroups.length > 0 && (
                  <div className="doctor-infusion-group-pills" role="radiogroup" aria-label="快捷选择输液组">
                    {administrationGroups.existingGroups.map((group) => {
                      const isSelected = medicationEntry.administrationGroupKey === group.key
                      const namesSummary = group.medicationNames.slice(0, 2).join(' + ') + (group.medicationNames.length > 2 ? ` 等${group.medicationNames.length}味` : '')
                      return (
                        <button
                          key={group.key}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`doctor-infusion-group-pill ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => {
                            updateMedication('administrationGroupKey', group.key)
                            if (group.routeCode) updateRoute(group.routeCode)
                            if (group.frequencyCode) updateMedication('frequencyCode', group.frequencyCode)
                            if (group.durationValue) updateMedication('durationValue', group.durationValue)
                          }}
                        >
                          <span className="doctor-infusion-pill-badge">{group.label}</span>
                          <span className="doctor-infusion-pill-title">并入此组</span>
                          <span className="doctor-infusion-pill-desc" title={group.medicationNames.join('、')}>
                            （已含: {namesSummary}）
                          </span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!isExistingSelected}
                      className={`doctor-infusion-group-pill ${!isExistingSelected ? 'is-selected' : ''}`}
                      onClick={() => updateMedication('administrationGroupKey', newAdministrationGroupKey())}
                    >
                      <span className="doctor-infusion-pill-badge is-new">新组</span>
                      <span className="doctor-infusion-pill-title">新建独立输液组</span>
                      <span className="doctor-infusion-pill-desc">（单独一袋/瓶）</span>
                    </button>
                  </div>
                )}

                <div className="doctor-infusion-group-controls">
                  <Select id="doctor-unified-administration-group" aria-label="输液分组"
                    value={medicationEntry.administrationGroupKey || ''} clearable={false} searchable={false}
                    options={[
                      { value: '__NEW__', label: '新输液组', secondaryText: '单独一袋/瓶' },
                      ...administrationGroups.options,
                    ]}
                    onChange={(value) => updateMedication('administrationGroupKey',
                      value === '__NEW__' ? newAdministrationGroupKey() : value)}
                    onSelectionCommit={() => focusControlAfterSelection('doctor-unified-frequency')} />
                  <span>当前 {administrationGroups.currentLabel || '新组'}</span>
                  {isExistingSelected && (
                    <span className="doctor-infusion-group-hint">
                      ✓ 已与【{currentSelectedGroup?.label}】同组，频次与疗程已自动对齐。
                    </span>
                  )}
                </div>
              </div>
            )
          })()}

          {entryType === 'HERBAL' && (
            <div className="doctor-unified-order-subrow doctor-herbal-formula-summary" role="row">
              <strong>方剂设置</strong>
              <span>{medicationEntry.herbalDoseCount || '未填'}剂 · {medicationEntry.herbalMethod || '未填写服法'} · {medicationEntry.frequencyCode || '未填写频次'}</span>
              <small>连续录入下一味时自动保留</small>
            </div>
          )}

          {hasSafetyAlert && (
            <div className="doctor-unified-order-subrow doctor-unified-order-safety is-warning" role="row">
              <div className="doctor-safety-content">
                <span className="doctor-safety-badge-title">用药风险提醒：</span>
                {isAllergyHit && (
                  <span className="doctor-safety-tag is-danger">
                    <Icon name="warning" /> 命中患者药物过敏：{matchedAllergies.map((item) => item.substanceDisplay).join('、')}
                  </span>
                )}
                {!isAllergyHit && hasKnownAllergies && (
                  <span className="doctor-safety-tag is-warning">
                    患者既往药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}
                  </span>
                )}
                {isSkinTest && (
                  <span className="doctor-safety-tag is-skintest">
                    <Icon name="info" /> 需皮试药品（开立后自动派发皮试任务）
                  </span>
                )}
                {isAntimicrobial && (
                  <span className="doctor-safety-tag is-antimicrobial">
                    抗菌药物{currentMedication?.sdAntimicrobialLevelText ? ` · ${currentMedication.sdAntimicrobialLevelText}` : ''}
                  </span>
                )}
                {isAllergyHit && (
                  <input aria-label="继续开立理由" value={medicationEntry.allergyOverrideReason}
                    placeholder="命中已知过敏，请输入继续开立理由" onChange={(event) => updateMedication('allergyOverrideReason', event.target.value)} />
                )}

              </div>
            </div>
          )}

          {(validationError || frequencies.error || routes.error) && (
            <div className="doctor-unified-order-subrow doctor-unified-order-error" role="row">
              <Alert className="doctor-unified-order-alert">
                {validationError || (routes.error ? '给药途径数据加载失败' : '频次数据加载失败')}
              </Alert>
            </div>
          )}
        </>
      )}
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

function MedicationReadRow({ value, skinTest, busy, readOnly, administrationGroupLabel, isSubsequent, onCancel, onPrint }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; readOnly: boolean
  administrationGroupLabel?: string; isSubsequent?: boolean
  onCancel: () => void; onPrint?: () => void
}) {
  const spec = value.packageSpec || value.preparationSpec
  const mfr = value.manufacturerName
  return <div className="doctor-unified-order-row" role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.medicationType === 'HERBAL' ? 'HERBAL'
      : value.medicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'MEDICATION'} />
      {administrationGroupLabel && <AdministrationGroupBadge label={administrationGroupLabel} isSubsequent={isSubsequent} />}</span>
    <span className="doctor-unified-order-name">
      <strong>{value.itemName || value.medicationName}</strong>
      {(spec || mfr) && (
        <div className="doctor-unified-order-subtext">
          {spec && <span>{spec}</span>}
          {spec && mfr && <span className="doctor-subtext-divider">/</span>}
          {mfr && <span>{mfr}</span>}
        </div>
      )}
    </span>
    <span className="doctor-unified-directions">
      {value.doseValue ? <span className="doctor-direction-chip is-dose">{value.doseValue}{value.doseUnit || ''}</span> : null}
      {value.routeName || value.routeCode ? <span className="doctor-direction-chip">{value.routeName || value.routeCode}</span> : null}
      {value.frequencyName || value.frequencyCode ? <span className="doctor-direction-chip">{value.frequencyName || value.frequencyCode}</span> : null}
      {value.durationValue ? <span className="doctor-direction-chip">{value.durationValue}{value.durationUnit || '天'}</span> : null}
      {!value.doseValue && !value.routeName && !value.frequencyName && <span className="doctor-direction-empty">—</span>}
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{formatPackageUnit(undefined, value.quantityUnit)}</small>
    </span>
    <span className="doctor-unified-order-detail">{value.medicationInstruction || '—'}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>
        {orderStatusLabel(value.status)}
      </StatusBadge>
      {value.skinTestRequired && <StatusBadge tone={skinTest?.status === 'NEGATIVE' ? 'success'
        : skinTest?.status === 'POSITIVE' ? 'danger' : 'warning'}>{doctorSkinTestLabel(skinTest?.status)}</StatusBadge>}
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      {onPrint && <Button size="sm" variant="text" onClick={onPrint}>打印</Button>}
      {value.status !== 'CANCELLED' && (
        <Popconfirm
          title={`确认撤销“${value.itemName || value.medicationName}”？`}
          okText="撤销"
          okVariant="danger"
          onConfirm={onCancel}
        >
          <Button size="sm" variant="text" busy={busy}>撤销</Button>
        </Popconfirm>
      )}
    </span>}
  </div>
}

function doctorSkinTestLabel(value?: SkinTestWorkItem['status']) {
  if (value === 'NEGATIVE') return '皮试阴性'
  if (value === 'POSITIVE') return '皮试阳性'
  if (value === 'IN_PROGRESS') return '皮试中'
  if (value === 'UNCERTAIN') return '待复试'
  if (value === 'INVALID') return '结果无效'
  if (value === 'WAITING_SETTLEMENT') return '待结算皮试'
  if (value === 'WAITING_DISPENSE') return '待发药皮试'
  return '待皮试'
}

function ServiceReadRow({ value, busy, readOnly, onCancel }: {
  value: ServiceRequest; busy: boolean; readOnly: boolean; onCancel: () => void
}) {
  return <div className="doctor-unified-order-row" role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.serviceType} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.itemName}</strong>
    </span>
    <span className="doctor-unified-directions">
      <span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{value.unitCode}</small>
    </span>
    <span className="doctor-unified-order-detail">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(value.status)}</StatusBadge>
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      {value.status === 'ACTIVE' && (
        <Popconfirm
          title={`确认撤销“${value.itemName}”？`}
          okText="撤销"
          okVariant="danger"
          onConfirm={onCancel}
        >
          <Button size="sm" variant="text" busy={busy}>撤销</Button>
        </Popconfirm>
      )}
    </span>}
  </div>
}

function MedicationDraftEditRow({ value, routeOptions, frequencyOptions, routeExecutionTypes,
  administrationGroupOptions, onSave, onCancel, onRemove }: {
  value: MedicationPlanDraft
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routeExecutionTypes: Map<string, 'NONE' | 'ADMINISTRATION' | 'INFUSION'>
  administrationGroupOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  onSave: (value: MedicationPlanDraft) => void
  onCancel: () => void
  onRemove: () => void
}) {
  const [doseValue, setDoseValue] = useState<number | ''>(value.request.doseValue ?? '')
  const [routeCode, setRouteCode] = useState(value.request.routeCode)
  const [frequencyCode, setFrequencyCode] = useState(value.request.frequencyCode)
  const [durationValue, setDurationValue] = useState<number | ''>(value.request.durationValue ?? '')
  const [quantity, setQuantity] = useState(value.request.quantity)
  const [instruction, setInstruction] = useState(value.request.medicationInstruction ?? '')
  const [administrationGroupKey, setAdministrationGroupKey] = useState(value.administrationGroupKey)
  const executionType = routeExecutionTypes.get(routeCode || '')
  const valid = Number(doseValue) > 0 && Boolean(routeCode) && Boolean(frequencyCode) && Number(quantity) > 0
  const spec = value.productSpec || value.preparationSpec
  const mfr = value.manufacturerName

  const rowRef = useRef<HTMLDivElement>(null)
  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)

  const save = () => {
    if (hasSavedRef.current || isRemovingRef.current) return
    hasSavedRef.current = true
    if (valid) {
      onSave({
        ...value,
        routeExecutionType: executionType,
        administrationGroupKey: executionType === 'INFUSION'
          ? administrationGroupKey || newAdministrationGroupKey() : undefined,
        routeName: routeOptions.find((option) => option.value === routeCode)?.label || value.routeName,
        request: {
          ...value.request,
          doseValue: Number(doseValue),
          routeCode,
          frequencyCode,
          durationValue: durationValue === '' ? undefined : Number(durationValue),
          quantity: Number(quantity),
          medicationInstruction: instruction.trim() || undefined
        },
      })
    } else {
      onCancel()
    }
  }

  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const handleOutsideInteraction = (event: Event) => {
      if (isRemovingRef.current) return
      const target = event.target as Node | null
      if (!target) return
      const isInsideRow = rowRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
      )
      if (!isInsideRow && !isInsidePopover) {
        saveRef.current()
      }
    }

    document.addEventListener('pointerdown', handleOutsideInteraction)
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('click', handleOutsideInteraction, true)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction)
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('click', handleOutsideInteraction, true)
    }
  }, [])

  const handleBlur = (event: React.FocusEvent) => {
    if (isRemovingRef.current) return
    const next = event.relatedTarget as Node | null
    if (!next) {
      setTimeout(() => {
        if (isRemovingRef.current) return
        const active = document.activeElement
        const isInsideRow = rowRef.current?.contains(active)
        const isInsidePopover = Boolean(
          active?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
        )
        if (!isInsideRow && !isInsidePopover) {
          save()
        }
      }, 50)
      return
    }
    const isInsideRow = rowRef.current?.contains(next)
    const isInsidePopover = Boolean(
      (next as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
    )
    if (!isInsideRow && !isInsidePopover) {
      save()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      hasSavedRef.current = true
      onCancel()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  return <div ref={rowRef} className="doctor-unified-inline-composer is-draft-editor" role="row"
    aria-label={`编辑待确认医嘱 ${value.medicationName}`}
    onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <div className="doctor-inline-order-static-type"><OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} />
        {executionType === 'INFUSION' && <Select id={`draft-group-${value.id}`} aria-label="编辑输液分组" value={administrationGroupKey || ''}
          clearable={false} searchable={false}
          options={[{ value: '__NEW__', label: '新组' }, ...administrationGroupOptions]}
          onChange={(next) => setAdministrationGroupKey(next === '__NEW__' ? newAdministrationGroupKey() : next)}
          onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)} />}
      </div>
      <div className="doctor-inline-order-static-resource">
        <strong>{value.productName || value.medicationName}</strong>
        {(spec || mfr) && (
          <div className="doctor-unified-order-subtext">
            {spec && <span>{spec}</span>}
            {spec && mfr && <span className="doctor-subtext-divider">/</span>}
            {mfr && <span>{mfr}</span>}
          </div>
        )}
      </div>
      <div className="doctor-inline-order-directions-group">
        <div className="doctor-inline-order-field doctor-inline-order-dose">
          <div className="doctor-entry-input-unit"><input id={`draft-dose-${value.id}`} aria-label="编辑单次剂量" type="number" min="0" step="0.01"
            autoFocus value={doseValue} onChange={(event) => setDoseValue(numberValue(event.target.value))}
            onKeyDown={(event) => continueDraftOnEnter(event, `draft-route-${value.id}`)} /><small>{value.request.doseUnit}</small></div>
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-route">
          <Select id={`draft-route-${value.id}`} aria-label="编辑给药途径" value={routeCode}
            openOnFocus
            onChange={(next) => { setRouteCode(next); if (routeExecutionTypes.get(next) === 'INFUSION' && !administrationGroupKey) setAdministrationGroupKey(newAdministrationGroupKey()) }}
            onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)}
            showValue placeholder="途径" options={routeOptions} />
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-frequency">
          <Select id={`draft-frequency-${value.id}`} aria-label="编辑频次" value={frequencyCode}
            openOnFocus
            onChange={setFrequencyCode} onSelectionCommit={() => focusControlAfterSelection(`draft-duration-${value.id}`)}
            showValue placeholder="频次" options={frequencyOptions} />
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-duration">
          <div className="doctor-entry-input-unit"><input id={`draft-duration-${value.id}`} aria-label="编辑疗程" type="number" min="1" value={durationValue}
            onChange={(event) => setDurationValue(numberValue(event.target.value))}
            onKeyDown={(event) => continueDraftOnEnter(event, `draft-quantity-${value.id}`)} /><small>{value.request.durationUnit || '天'}</small></div>
        </div>
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-quantity">
        <div className="doctor-entry-input-unit"><input id={`draft-quantity-${value.id}`} aria-label="编辑总量" type="number" min="0.01" step="0.01" value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
          onKeyDown={(event) => continueDraftOnEnter(event, `draft-instruction-${value.id}`)} />
          <small>{formatPackageUnit(undefined, value.request.quantityUnit)}</small></div>
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-instruction">
        <input id={`draft-instruction-${value.id}`} aria-label="编辑用药嘱托" value={instruction} placeholder="用药嘱托"
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() } }} />
      </div>
      <div className="doctor-inline-order-static doctor-inline-order-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</div>
      <div className="doctor-inline-order-status"><StatusBadge tone="warning">编辑中</StatusBadge></div>
      <div className="doctor-inline-order-actions">
        <Popconfirm
          title={`确认移除“${value.productName || value.medicationName || '该药品'}”？`}
          okText="移除"
          okVariant="danger"
          onConfirm={onRemove}
        >
          <Button size="sm" variant="text" onMouseDown={() => { isRemovingRef.current = true }}>移除</Button>
        </Popconfirm>
      </div>
  </div>
}

function ServiceDraftEditRow({ value, onSave, onCancel, onRemove }: {
  value: ServicePlanDraft; onSave: (value: ServicePlanDraft) => void; onCancel: () => void; onRemove: () => void
}) {
  const [description, setDescription] = useState(value.clinicalDescription ?? '')
  const [quantity, setQuantity] = useState(value.quantity)

  const rowRef = useRef<HTMLDivElement>(null)
  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)

  const save = () => {
    if (hasSavedRef.current || isRemovingRef.current) return
    hasSavedRef.current = true
    if (quantity > 0) {
      onSave({ ...value, quantity, clinicalDescription: description.trim() || undefined })
    } else {
      onCancel()
    }
  }

  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const handleOutsideInteraction = (event: Event) => {
      if (isRemovingRef.current) return
      const target = event.target as Node | null
      if (!target) return
      const isInsideRow = rowRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
      )
      if (!isInsideRow && !isInsidePopover) {
        saveRef.current()
      }
    }

    document.addEventListener('pointerdown', handleOutsideInteraction)
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('click', handleOutsideInteraction, true)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction)
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('click', handleOutsideInteraction, true)
    }
  }, [])

  const handleBlur = (event: React.FocusEvent) => {
    if (isRemovingRef.current) return
    const next = event.relatedTarget as Node | null
    if (!next) {
      setTimeout(() => {
        if (isRemovingRef.current) return
        const active = document.activeElement
        const isInsideRow = rowRef.current?.contains(active)
        const isInsidePopover = Boolean(
          active?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
        )
        if (!isInsideRow && !isInsidePopover) {
          save()
        }
      }, 50)
      return
    }
    const isInsideRow = rowRef.current?.contains(next)
    const isInsidePopover = Boolean(
      (next as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
    )
    if (!isInsideRow && !isInsidePopover) {
      save()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      hasSavedRef.current = true
      onCancel()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  return <div ref={rowRef} className="doctor-unified-inline-composer is-service-draft-editor" role="row"
    aria-label={`编辑待确认医嘱 ${value.itemName}`}
    onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <div className="doctor-inline-order-static-type"><OrderTypeBadge type={value.serviceType || 'OTHER'} /></div>
      <div className="doctor-inline-order-static-resource"><strong>{value.itemName}</strong></div>
      <div className="doctor-inline-order-static doctor-inline-service-execution"><span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span></div>
      <div className="doctor-inline-order-field doctor-inline-order-quantity">
        <div className="doctor-entry-input-unit"><input id={`draft-service-quantity-${value.id}`} aria-label="编辑项目数量" type="number" min="0.01" step="0.01"
          autoFocus value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}
          onKeyDown={(event) => continueDraftOnEnter(event, `draft-service-note-${value.id}`)} /><small>{value.unitCode || '项'}</small></div>
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note">
        <input id={`draft-service-note-${value.id}`} aria-label="编辑临床说明" value={description} placeholder="临床说明"
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() } }} />
      </div>
      <div className="doctor-inline-order-static doctor-inline-order-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</div>
      <div className="doctor-inline-order-status"><StatusBadge tone="warning">编辑中</StatusBadge></div>
      <div className="doctor-inline-order-actions">
        <Popconfirm
          title={`确认移除“${value.itemName || '该项目'}”？`}
          okText="移除"
          okVariant="danger"
          onConfirm={onRemove}
        >
          <Button size="sm" variant="text" onMouseDown={() => { isRemovingRef.current = true }}>移除</Button>
        </Popconfirm>
      </div>
  </div>
}

function MedicationDraftRow({ value, administrationGroupLabel, isSubsequent, onEdit, onRemove }: {
  value: MedicationPlanDraft; administrationGroupLabel?: string; isSubsequent?: boolean; onEdit: () => void; onRemove: () => void
}) {
  const spec = value.productSpec || value.preparationSpec
  const mfr = value.manufacturerName
  return <div className="doctor-unified-order-row is-draft is-editable" role="row" tabIndex={0}
    aria-label={`编辑待确认医嘱 ${value.medicationName}`} title="单击编辑医嘱" onClick={onEdit}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit() } }}>
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} />
      {administrationGroupLabel && <AdministrationGroupBadge label={administrationGroupLabel} isSubsequent={isSubsequent} />}</span>
    <span className="doctor-unified-order-name">
      <strong>{value.productName || value.medicationName}</strong>
      {(spec || mfr) && (
        <div className="doctor-unified-order-subtext">
          {spec && <span>{spec}</span>}
          {spec && mfr && <span className="doctor-subtext-divider">/</span>}
          {mfr && <span>{mfr}</span>}
        </div>
      )}
    </span>
    <span className="doctor-unified-directions">
      {value.request.doseValue ? <span className="doctor-direction-chip is-dose">{value.request.doseValue}{value.request.doseUnit || ''}</span> : null}
      {value.routeName || value.request.routeCode ? <span className="doctor-direction-chip">{value.routeName || value.request.routeCode}</span> : null}
      {value.request.frequencyCode ? <span className="doctor-direction-chip">{value.request.frequencyCode}</span> : null}
      {value.request.durationValue ? <span className="doctor-direction-chip">{value.request.durationValue}{value.request.durationUnit || '天'}</span> : null}
      {!value.request.doseValue && !value.routeName && !value.request.frequencyCode && <span className="doctor-direction-empty">—</span>}
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.request.quantity}</strong> <small>{formatPackageUnit(undefined, value.request.quantityUnit)}</small>
    </span>
    <span className="doctor-unified-order-detail">{value.request.medicationInstruction || '—'}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone="warning">待确认</StatusBadge>
    </span>
    <span className="doctor-unified-order-actions">
      <Popconfirm
        title={`确认移除“${value.productName || value.medicationName || '该药品'}”？`}
        okText="移除"
        okVariant="danger"
        onConfirm={onRemove}
      >
        <Button size="sm" variant="text" onClick={(event) => { event.stopPropagation() }}>移除</Button>
      </Popconfirm>
    </span>
  </div>
}

function ServiceDraftRow({ value, onEdit, onRemove }: { value: ServicePlanDraft; onEdit: () => void; onRemove: () => void }) {
  return <div className="doctor-unified-order-row is-draft is-editable" role="row" tabIndex={0}
    aria-label={`编辑待确认医嘱 ${value.itemName}`} title="单击编辑医嘱" onClick={onEdit}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit() } }}>
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.serviceType || 'OTHER'} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.itemName}</strong>
    </span>
    <span className="doctor-unified-directions">
      <span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{value.unitCode}</small>
    </span>
    <span className="doctor-unified-order-detail">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone="warning">待确认</StatusBadge>
    </span>
    <span className="doctor-unified-order-actions">
      <Popconfirm
        title={`确认移除“${value.itemName || '该项目'}”？`}
        okText="移除"
        okVariant="danger"
        onConfirm={onRemove}
      >
        <Button size="sm" variant="text" onClick={(event) => { event.stopPropagation() }}>移除</Button>
      </Popconfirm>
    </span>
  </div>
}

function OrderTypeBadge({ type }: { type: string }) {
  const label = type === 'MEDICATION' || type === 'WESTERN' ? '西药'
    : type === 'CHINESE_PATENT' ? '中成药' : type === 'HERBAL' ? '草药'
      : serviceTypeLabel(type)
  const className = ['MEDICATION', 'WESTERN', 'CHINESE_PATENT', 'HERBAL'].includes(type)
    ? 'is-medication' : `is-${type.toLowerCase()}`
  return <span className={`doctor-unified-order-kind ${className}`}>{label}</span>
}

function AdministrationGroupBadge({ label, isSubsequent }: { label: string; isSubsequent?: boolean }) {
  return <span className={`doctor-administration-group-badge ${isSubsequent ? 'is-subsequent' : ''}`}
    title={isSubsequent ? `输液同组（与上一味合并同一袋静滴）` : `输液组号: ${label}`}>
    {label}
    {isSubsequent && <small className="badge-sub">同组</small>}
  </span>
}

function serviceTypeLabel(value?: string) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as Record<string, string>)[value || 'OTHER']
    ?? '诊疗'
}

export function formatServiceExecution(value?: string) {
  if (value === 'LABORATORY') return '门诊检验送检'
  if (value === 'EXAMINATION') return '放射/医技检查'
  if (value === 'TREATMENT') return '门诊治疗室执行'
  return '门诊常规执行'
}

function orderTypeLabel(value: OrderEntryType) {
  return value === 'ALL' ? '全部' : value === 'MEDICATION' ? '药品' : value === 'HERBAL' ? '草药' : serviceTypeLabel(value)
}

function orderStatusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已开立', SUBMITTED: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

function numberValue(value: string): number | '' {
  return value === '' ? '' : Number(value)
}

function formatUnitPrice(value?: number, currencyCode = 'CNY') {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: currencyCode || 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(Number(value))
}

function continueDraftOnEnter(event: KeyboardEvent<HTMLInputElement>, nextControlId: string) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
  event.preventDefault()
  focusControl(nextControlId)
}

function byAuthoredAt(left: { authoredAt: string }, right: { authoredAt: string }) {
  return left.authoredAt.localeCompare(right.authoredAt)
}

function bySequence(left: { sequence?: number }, right: { sequence?: number }) {
  return (left.sequence ?? 0) - (right.sequence ?? 0)
}

function focusResource(type: OrderEntryType) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(`doctor-unified-${type}-resource`)
    if (el) {
      el.focus()
      const searchInput = document.querySelector<HTMLInputElement>('.ui-remote-search__search input')
      if (searchInput && document.activeElement !== searchInput) {
        searchInput.focus()
      }
    }
  })
  globalThis.setTimeout(() => {
    const searchInput = document.querySelector<HTMLInputElement>('.ui-remote-search__search input')
    if (searchInput && document.activeElement !== searchInput) {
      searchInput.focus()
    }
  }, 40)
}

function focusControl(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus())
}

function focusControlAfterSelection(id: string) {
  globalThis.setTimeout(() => focusControl(id), 0)
}
