import { useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { ActiveOrderFrequency, ItemGroup, MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { ClinicalAiTreatmentRecommendation } from '../../shared/api/clinicalAiApi'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import { formatTime } from '../../shared/format'
import {
  Alert, Button, ClinicalResourceSearch, Icon, Popconfirm, Select, StatusBadge,
  type ClinicalResource, type ClinicalResourceOption, type OrderSearchMode,
} from '../../shared/ui'
import {
  canPrintPrescription, resolveDispensableOptions, type DispensableProductOption, type MedicationPlanDraft,
} from './PrescriptionListEditor'

export type OrderEntryType = 'ALL' | 'WESTERN' | 'CHINESE_PATENT' | 'MEDICATION' | 'HERBAL' | 'LABORATORY' | 'EXAMINATION' | 'TREATMENT'

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
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
}

export function resolveFrequencyTimesPerDay(frequencies?: ActiveOrderFrequency[], frequencyCode?: string): number {
  if (!frequencyCode) return 1
  const freqObj = (frequencies ?? []).find((f) => f.code === frequencyCode)
  if (freqObj?.executionTimes?.length) {
    return freqObj.executionTimes.length
  }
  if ((freqObj as { timesPerDay?: number })?.timesPerDay) {
    return (freqObj as { timesPerDay?: number }).timesPerDay!
  }
  if (freqObj?.frequencyCount) {
    const period = freqObj.periodUnit === 'w' ? 7 : (freqObj.periodValue || 1)
    return freqObj.frequencyCount / period
  }
  const codeMap: Record<string, number> = {
    QD: 1, QN: 1, BID: 2, TID: 3, QID: 4, Q6H: 4, Q8H: 3, Q12H: 2, QOD: 0.5, QW: 1 / 7, ST: 1, PRN: 1,
  }
  return codeMap[frequencyCode.toUpperCase()] ?? 1
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
  doseValue?: number | string
  doseUnit?: string
  frequencyCode?: string
  durationValue?: number | string
  selectedPackage?: DispensableProductOption
  frequencies?: ActiveOrderFrequency[]
}): { quantity: number; calculationText: string; totalBaseUnits: number } | null {
  if (!medication || !selectedPackage) return null
  const numDose = Number(doseValue)
  if (!numDose || numDose <= 0) return null

  const timesPerDay = resolveFrequencyTimesPerDay(frequencies, frequencyCode)

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

  let doseEquivalentText = ''
  if (doseUnit && prepUnit && doseUnit === prepUnit && strValue && strValue > 0) {
    const eqStrength = Math.round(numDose * strValue * 100) / 100
    doseEquivalentText = `折合单次 ${eqStrength}${strUnit || ''}`
  } else if (doseUnit && prepUnit && doseUnit !== prepUnit && singleDoseUnits > 0) {
    const eqPrep = Math.round(singleDoseUnits * 100) / 100
    doseEquivalentText = `折合单次 ${eqPrep}${prepUnit}`
  }

  const calculationText = `1${selectedPackage.unitName}=${factor}${prepUnit || '单位'} · ${days}天共需${Math.round(totalBaseUnits * 100) / 100}${prepUnit || ''}，合${packageQty}${selectedPackage.unitName}${doseEquivalentText ? `（${doseEquivalentText}）` : ''}`

  return { quantity: packageQty, calculationText, totalBaseUnits }
}

const emptyMedicationEntry = (): MedicationEntry => ({
  doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
  dispenseOptionKey: '', instruction: '', herbalDoseCount: 7, herbalMethod: '水煎服', safetyReviewed: false,
  allergyOverrideReason: '', isManualQuantity: false,
  stockSiteId: undefined, stockSiteName: undefined, availablePackageQuantity: undefined, packageUnitName: undefined,
  skinTestExempt: false, skinTestExemptReason: '', exemptEvidenceEventId: undefined,
})

export function syncMedicationDraftGroup(
  currentDrafts: MedicationPlanDraft[],
  savedDraft: MedicationPlanDraft,
  frequencyList: ActiveOrderFrequency[],
  medicationsList?: MedicationKnowledge[],
  orgId?: string | number
): MedicationPlanDraft[] {
  const groupKey = savedDraft.administrationGroupKey
  if (!groupKey) {
    return currentDrafts.map((d) => (d.id === savedDraft.id ? savedDraft : d))
  }

  const isInfusionOrGroup = savedDraft.routeExecutionType === 'INFUSION' || Boolean(groupKey)

  return currentDrafts.map((d) => {
    if (d.id === savedDraft.id) {
      return savedDraft
    }
    // 同组药品且是输液/同组
    if (d.administrationGroupKey === groupKey && isInfusionOrGroup) {
      const nextRouteCode = savedDraft.request.routeCode
      const nextRouteName = savedDraft.routeName
      const nextRouteExecType = savedDraft.routeExecutionType
      const nextFrequencyCode = savedDraft.request.frequencyCode
      const nextDurationValue = savedDraft.request.durationValue
      const nextDurationUnit = savedDraft.request.durationUnit

      const oldFreq = resolveFrequencyTimesPerDay(frequencyList, d.request.frequencyCode)
      const newFreq = resolveFrequencyTimesPerDay(frequencyList, nextFrequencyCode)
      const oldDays = Number(d.request.durationValue) || 1
      const newDays = Number(nextDurationValue) || 1
      const ratio = (newFreq * newDays) / (oldFreq * oldDays)
      let recalculatedQuantity = d.request.quantity
      if (ratio > 0 && Math.abs(ratio - 1) > 0.001) {
        recalculatedQuantity = Math.max(1, Math.round(d.request.quantity * ratio))
      }

      // 如果提供了匹配的药品知识库与包装，执行精确规格折算
      if (medicationsList && medicationsList.length > 0) {
        const medKnowledge = medicationsList.find((m) => m.id === d.request.medicationId)
        const options = medKnowledge ? resolveDispensableOptions(medKnowledge, String(orgId || '')) : []
        const pkg = options.find((opt) => opt.itemPackage?.id === d.request.packageId) ?? options[0]
        if (medKnowledge && pkg) {
          const calc = calculatePackageQuantity({
            medication: medKnowledge,
            doseValue: d.request.doseValue,
            doseUnit: d.request.doseUnit,
            frequencyCode: nextFrequencyCode,
            durationValue: nextDurationValue,
            selectedPackage: pkg,
            frequencies: frequencyList,
          })
          if (calc?.quantity) {
            recalculatedQuantity = calc.quantity
          }
        }
      }

      return {
        ...d,
        routeName: nextRouteName,
        routeExecutionType: nextRouteExecType,
        request: {
          ...d.request,
          routeCode: nextRouteCode,
          frequencyCode: nextFrequencyCode,
          durationValue: nextDurationValue,
          durationUnit: nextDurationUnit,
          quantity: recalculatedQuantity,
        }
      }
    }
    return d
  })
}

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

export interface ExecutingDepartmentSource {
  kind: 'medication' | 'service'
  type?: string
  stockSiteName?: string
  itemName?: string
}

export function resolveExecutingDepartment(
  item: ExecutingDepartmentSource,
  currentDepartmentName?: string
): string {
  if (item.kind === 'medication') {
    if (item.stockSiteName?.trim()) {
      return item.stockSiteName.trim()
    }
    if (item.type === 'HERBAL') {
      return '门诊中药房'
    }
    return '门诊西药房'
  }

  // 诊疗项目
  const sType = item.type || ''
  const name = item.itemName || ''

  if (sType === 'LABORATORY') {
    return '检验科'
  }

  if (sType === 'EXAMINATION') {
    if (/(超声|彩超|B超|多普勒)/i.test(name)) return '超声科'
    if (/(心电|脑电|肌电)/i.test(name)) return '心电图室'
    if (/(CT|磁共振|MRI|X线|DR|摄片|胸片|造影|透视)/i.test(name)) return '放射影像科'
    if (/(胃镜|肠镜|内镜|支气管镜|喉镜)/i.test(name)) return '内窥镜中心'
    if (/(病理|活检|细胞学)/i.test(name)) return '病理科'
    return '医技检查科'
  }

  if (sType === 'PATHOLOGY') {
    return '病理科'
  }

  // 一般费用类/治疗处置类（不需要特别执行过的，默认当前科室）
  return currentDepartmentName?.trim() || '当前科室'
}

export function UnifiedOrderListEditor({
  encounter, allergies = [], prescriptions = [], medications = [], services = [],
  medicationDrafts = [], setMedicationDrafts,
  serviceDrafts = [], setServiceDrafts, api, busy = false,
  readOnly = false, aiOrderReview, onAiOrderReviewConsumed, onAiOrdersPrepared, aiSuggestionSurfaceRef,
  currentDepartmentName,
  onCancelMedication = () => {}, onCancelService = () => {}, onPrint = () => {}, onPrintService = () => {},
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
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const allergyReviewRecorded = allergies.some((item) => item.assertionType === 'NO_KNOWN_ALLERGY'
    || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY') || drugAllergies.length > 0
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
  const hasSafetyAlert = Boolean(currentMedication && (isAllergyHit || hasKnownAllergies || isSkinTest || isAntimicrobial || hasPositiveSkinTest))
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
  > = useMemo(() => {
    const rawEntries: Array<
      { kind: 'service'; value: ServicePlanDraft } | { kind: 'medication'; value: MedicationPlanDraft }
    > = [
      ...serviceDrafts.map((value) => ({ kind: 'service' as const, value })),
      ...medicationDrafts.map((value) => ({ kind: 'medication' as const, value })),
    ]

    const groupMinSeqMap = new Map<string, number>()
    for (const item of rawEntries) {
      if (item.kind === 'medication' && item.value.administrationGroupKey) {
        const key = item.value.administrationGroupKey
        const itemSeq = item.value.sequence ?? 0
        const prevMin = groupMinSeqMap.get(key)
        if (prevMin === undefined || itemSeq < prevMin) {
          groupMinSeqMap.set(key, itemSeq)
        }
      }
    }

    return rawEntries.sort((left, right) => {
      const leftGroup = left.kind === 'medication' ? left.value.administrationGroupKey : undefined
      const rightGroup = right.kind === 'medication' ? right.value.administrationGroupKey : undefined

      if (leftGroup && rightGroup && leftGroup === rightGroup) {
        return bySequence(left.value, right.value)
      }

      const leftBaseSeq = leftGroup ? (groupMinSeqMap.get(leftGroup) ?? 0) : (left.value.sequence ?? 0)
      const rightBaseSeq = rightGroup ? (groupMinSeqMap.get(rightGroup) ?? 0) : (right.value.sequence ?? 0)

      if (leftBaseSeq !== rightBaseSeq) {
        return leftBaseSeq - rightBaseSeq
      }
      return bySequence(left.value, right.value)
    })
  }, [serviceDrafts, medicationDrafts])

  const hasOrders = savedEntries.length > 0 || draftEntries.length > 0
  const isComposerActive = !readOnly && (composerOpen || !hasOrders)

  const groupingComposerTarget = useMemo(() => {
    if (!isComposerActive || !groupingSession) return null
    for (let i = draftEntries.length - 1; i >= 0; i--) {
      const d = draftEntries[i]
      if (d.kind === 'medication' && d.value.administrationGroupKey === groupingSession.groupKey) {
        return { type: 'draft' as const, index: i }
      }
    }
    for (let i = savedEntries.length - 1; i >= 0; i--) {
      const s = savedEntries[i]
      if (s.kind === 'medication' && (
        s.value.id === groupingSession.groupKey ||
        s.value.parentRequestId === groupingSession.groupKey ||
        `request:${s.value.id}` === groupingSession.groupKey ||
        `request:${s.value.parentRequestId}` === groupingSession.groupKey
      )) {
        return { type: 'saved' as const, index: i }
      }
    }
    return null
  }, [isComposerActive, groupingSession, draftEntries, savedEntries])

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
      skinTestExempt: false,
      skinTestExemptReason: '',
      exemptEvidenceEventId: undefined,
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

  const reviewState = useRef({ encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed, onAiOrdersPrepared,
    medicationDrafts, serviceDrafts, medications, services, allergies })
  reviewState.current = { encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed, onAiOrdersPrepared,
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
          const options = resolveDispensableOptions(raw, encounter.organizationId)
          const product = item.orderDraft
            ? options.find((option) => option.itemPackage?.id === item.orderDraft?.packageId) : options[0]
          if (!product) return { item, error: '未配置可发药产品、包装或有效价格' }
          const doseValue = Number(item.orderDraft ? item.orderDraft.doseValue : raw.defaultDose)
          const doseUnit = item.orderDraft ? item.orderDraft.doseUnit : raw.defaultDoseUnit || raw.preparationUnit
          const routeCode = item.orderDraft ? item.orderDraft.routeCode : raw.defaultRoute
          const frequencyCode = item.orderDraft ? item.orderDraft.frequencyCode : raw.defaultFrequency
          const durationValue = item.orderDraft?.durationValue
          if (!Number.isFinite(doseValue) || !(doseValue > 0) || !doseUnit?.trim() || !routeCode || !frequencyCode) {
            return { item, error: '目录缺少默认剂量、途径或频次，请手工检索后补全' }
          }
          const [activeRoutes, activeFrequencies] = await Promise.all([
            api.masterData.activeMedicationRoutes('OUTPATIENT'),
            api.masterData.activeOrderFrequencies(encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
          ])
          if (!activeRoutes.some((value) => value.code === routeCode)
            || !activeFrequencies.some((value) => value.code === frequencyCode)) {
            return { item, error: '用药途径或频次已失效，请重新选择' }
          }
          if (durationValue !== undefined && (!Number.isFinite(durationValue) || durationValue <= 0)) {
            return { item, error: '用药天数须大于 0' }
          }
          const routeExecutionType = activeRoutes.find((value) => value.code === routeCode)?.executionType
          if (raw.sdMedicationType === 'HERBAL' || routeExecutionType === 'INFUSION') {
            return { item, error: '草药或输液需手工核对剂数、服法或输液分组' }
          }
          const allergyHit = reviewState.current.allergies.some((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG' && (allergy.allergenId
              ? raw.allergenConceptIds?.includes(allergy.allergenId)
              : allergy.substanceCode?.toLowerCase() === raw.code.toLowerCase()))
          if (allergyHit) return { item, error: '命中已知药物过敏，需手工开立并填写理由' }
          const drugAllergies = reviewState.current.allergies.filter((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG')
          const allergyReviewRecorded = reviewState.current.allergies.some((allergy) =>
            allergy.assertionType === 'NO_KNOWN_ALLERGY' || allergy.assertionType === 'NO_KNOWN_DRUG_ALLERGY')
            || drugAllergies.length > 0
          const hasSafetyAlert = drugAllergies.length > 0 || Boolean(raw.skinTestRequired || raw.antimicrobial)
          const quantity = item.orderDraft?.quantity ?? calculatePackageQuantity({ medication: raw, doseValue, doseUnit, frequencyCode,
            durationValue, selectedPackage: product, frequencies: activeFrequencies })?.quantity ?? 1
          if (!Number.isFinite(quantity) || quantity <= 0) return { item, error: '请填写有效的开药总量' }
          if (quantity > Number(raw.availablePackageQuantity)) return { item, error: '当前可用库存不足' }
          const draft: MedicationPlanDraft = {
            id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: 'regular',
            categoryCode: raw.sdMedicationType, medicationName: raw.name, medicationCode: raw.code,
            preparationSpec: raw.preparationSpec, productName: product.product.name,
            productSpec: product.itemPackage?.packageSpec || product.label,
            manufacturerName: product.product.manufacturerName, unitPrice: product.price,
            currencyCode: product.currencyCode,
            routeName: activeRoutes.find((value) => value.code === routeCode)?.name,
            routeExecutionType,
            stockSiteName: raw.stockSiteName, availablePackageQuantity: raw.availablePackageQuantity,
            packageUnitName: raw.packageUnitName,
            skinTestRequired: Boolean(raw.skinTestRequired),
            skinTestResultValidityHours: raw.skinTestResultValidityHours,
            antimicrobial: Boolean(raw.antimicrobial),
            sdAntimicrobialLevelText: raw.sdAntimicrobialLevelText,
            allergenConceptIds: raw.allergenConceptIds,
            request: { medicationId: raw.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
              doseValue, doseUnit, routeCode, frequencyCode, quantity, quantityUnit: product.unitCode,
              durationValue, durationUnit: durationValue === undefined ? undefined : 'd',
              medicationInstruction: item.orderDraft ? item.orderDraft.instruction || undefined : product.product.instruction || undefined,
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
        const activePrice = raw.prices?.filter((price) => price.sdStatus === 'ACTIVE' && price.sdPriceType === 'SALE'
          && (!price.organizationId || price.organizationId === encounter.organizationId)
          && valid(price.validFrom, price.validTo)).sort((left, right) =>
            Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId)))[0]
        const quantity = item.orderDraft?.quantity ?? 1
        if (!Number.isFinite(quantity) || quantity <= 0) return { item, error: '请填写有效的项目总量' }
        const serviceDraft: ServicePlanDraft = {
          id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: raw.sdServiceType,
          catalogItemId: raw.id, itemCode: raw.code, itemName: raw.name, quantity, unitCode: raw.unitCode,
          clinicalDescription: item.orderDraft?.instruction ?? (item.rationale || undefined), unitPrice: activePrice?.price,
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
        if (!failures.length) reviewState.current.onAiOrdersPrepared?.()
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
        quantity: herbal ? doseValue * Number(medicationEntry.herbalDoseCount) : Number(medicationEntry.quantity),
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
      // 若该药属于同组输液，同组中已存的其它草稿一并同步为最新途径、频次与天数，并重新换算各自数量
      const syncedCurrent = isInfusion && assignedGroupKey
        ? syncMedicationDraftGroup(
            current,
            newDraft,
            frequencies.data ?? []
          )
        : current
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
                  { value: 'WESTERN', label: '西药' },
                  { value: 'CHINESE_PATENT', label: '中成药' },
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

          <div className={`doctor-inline-order-field doctor-inline-order-resource${hasEnteredOrder ? ' has-selected' : ''}`}
            title={isMedication && selectedProduct ? `${selectedProduct.label}${selectedProduct.itemPackage?.packageSpec ? ` (${selectedProduct.itemPackage.packageSpec})` : ''}${selectedProduct.product.manufacturerName ? ` · ${selectedProduct.product.manufacturerName}` : ''}` : undefined}>
            <div className="doctor-inline-resource-input-wrap">
              {groupingSession && (
                <AdministrationGroupBracket isTail />
              )}
              <ClinicalResourceSearch
                id={`doctor-unified-${entryType}-resource`}
                api={api}
                resource={entryType === 'ALL' ? 'mixed' : (isMedication ? 'medication' : 'service')}
                searchMode={searchMode}
                onSearchModeChange={changeSearchMode}
                organizationId={encounter.organizationId}
                encounterId={encounter.id}
                value={isMedication ? (medicationEntry.medication as any) : (service as any)}
                aria-label={
                  entryType === 'HERBAL' ? '搜索中草药名称/拼音'
                  : entryType === 'WESTERN' ? '搜索西药名称/拼音'
                  : entryType === 'CHINESE_PATENT' ? '搜索中成药名称/拼音'
                  : entryType === 'ALL' ? '搜索药品/项目名称或拼音'
                  : isMedication ? '搜索药品名称/拼音'
                  : `搜索${orderTypeLabel(entryType)}项目名称/拼音`
                }
                filterResult={
                  entryType === 'ALL' ? undefined
                  : entryType === 'WESTERN' ? (item) => !('sdMedicationType' in (item as any)) || (item as any)?.sdMedicationType === 'WESTERN'
                  : entryType === 'CHINESE_PATENT' ? (item) => (item as any)?.sdMedicationType === 'CHINESE_PATENT'
                  : entryType === 'HERBAL' ? (item) => (item as any)?.sdMedicationType === 'HERBAL'
                  : entryType === 'MEDICATION' ? (item) => !('sdMedicationType' in (item as any)) || (item as any)?.sdMedicationType !== 'HERBAL'
                  : (item) => (item as any)?.sdServiceType === entryType
                }
                placeholder={
                  entryType === 'HERBAL' ? '搜索中草药名称/拼音'
                  : entryType === 'WESTERN' ? '搜索西药名称/拼音'
                  : entryType === 'CHINESE_PATENT' ? '搜索中成药名称/拼音'
                  : entryType === 'ALL' ? '搜索药品/项目名称或拼音'
                  : isMedication ? '搜索药品名称/拼音'
                  : `搜索${orderTypeLabel(entryType)}项目名称/拼音`
                }
                onChange={handleOrderResourceSelect} />
            </div>
            {isMedication && selectedProduct && (
              <div className="doctor-inline-spec-hint"
                title={`${selectedProduct.itemPackage?.packageSpec || selectedProduct.label}${selectedProduct.product.manufacturerName ? ` / ${selectedProduct.product.manufacturerName}` : ''}`}>
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
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-method')} />
                    <small>{medicationEntry.doseUnit || 'g'}</small>
                  </div>
                </div>

                <div className={`doctor-inline-order-field doctor-inline-order-route${!hasEnteredOrder ? ' is-disabled' : ''}`} title="煎服法">
                  <input id="doctor-unified-herbal-method" aria-label="服法" value={medicationEntry.herbalMethod} placeholder="水煎服"
                    disabled={!hasEnteredOrder}
                    onFocus={(event) => event.currentTarget.select()}
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
                      onFocus={(event) => event.currentTarget.select()}
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
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-route')} />
                    {availableDoseUnits.length > 1 ? (
                      <select
                        id="doctor-unified-dose-unit"
                        aria-label="单次剂量单位"
                        className="doctor-inline-dose-unit-select"
                        value={medicationEntry.doseUnit}
                        disabled={!hasEnteredOrder}
                        onChange={(event) => updateMedication('doseUnit', event.target.value)}
                      >
                        {availableDoseUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : (
                      <small>{medicationEntry.doseUnit || ''}</small>
                    )}
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
                      onFocus={(event) => event.currentTarget.select()}
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
                    onFocus={(event) => event.currentTarget.select()}
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
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setServiceQuantity(Number(event.target.value))}
                  onKeyDown={(event) => continueOnEnter(event, entryType === 'TREATMENT' ? 'doctor-unified-service-note' : undefined)} />
                <small>{service?.raw?.unitCode ?? '项'}</small>
              </div>
            </div>
          )}

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

          {isMedication ? (
            entryType === 'HERBAL' ? (
              <div className={`doctor-inline-order-field doctor-inline-order-instruction${!hasEnteredOrder ? ' is-disabled' : ''}`} title="特殊煎法/嘱托">
                <input id="doctor-unified-instruction" aria-label="特殊煎法" value={medicationEntry.instruction}
                  disabled={!hasEnteredOrder}
                  list="doctor-herbal-instruction-options"
                  onFocus={(event) => event.currentTarget.select()}
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
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder="嘱托 (如: 饭后)" onChange={(event) => updateMedication('instruction', event.target.value)}
                  onKeyDown={(event) => continueOnEnter(event)} />
              </div>
            )
          ) : (
            <div className={`doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note${!hasEnteredOrder ? ' is-disabled' : ''}`}>
              <input id="doctor-unified-service-note" className="doctor-unified-service-note" aria-label="临床说明"
                disabled={!hasEnteredOrder}
                value={serviceDescription} placeholder={entryType === 'LABORATORY' ? '标本种类或检验目的 (回车跳至数量)' : entryType === 'EXAMINATION' ? '检查部位及检查目的 (回车跳至数量)' : '治疗部位或临床说明 (回车确认添加)'}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setServiceDescription(event.target.value)}
                onKeyDown={(event) => continueOnEnter(event, entryType === 'TREATMENT' ? undefined : 'doctor-unified-quantity')} />
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

          <div className="doctor-inline-order-status">
            <StatusBadge tone={groupingSession ? 'success' : 'info'}>
              {groupingSession ? '成组中' : '录入中'}
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
          <div className="doctor-unified-order-subrow doctor-herbal-formula-summary" role="row">
            <strong>方剂设置</strong>
            <span>{medicationEntry.herbalDoseCount || '未填'}剂 · {medicationEntry.herbalMethod || '未填写服法'} · {medicationEntry.frequencyCode || '未填写频次'}</span>
            <small>连续录入下一味时自动保留</small>
          </div>
        )}

        {hasSafetyAlert && (
          <div className="doctor-unified-order-subrow doctor-unified-order-safety is-warning is-compact" role="row">
            <div className="doctor-safety-content is-compact">
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
                <span className={`doctor-safety-tag ${hasPositiveSkinTest ? 'is-danger' : medicationEntry.skinTestExempt ? 'is-exempt' : 'is-skintest'}`}>
                  <Icon name={hasPositiveSkinTest ? 'warning' : 'info'} />
                  {hasPositiveSkinTest
                    ? '严正警示：患者当前药品皮试结果为【阳性】，禁止开立！'
                    : medicationEntry.skinTestExempt
                    ? `已免做皮试：${medicationEntry.skinTestExemptReason || '符合免试规则'}`
                    : '需皮试药品（默认派发皮试任务）'}
                </span>
              )}
              {isSkinTest && !hasPositiveSkinTest && (
                <div className="doctor-skintest-exempt-inline">
                  {recentNegativeItem && (
                    <div className="doctor-skintest-evidence-alert">
                      <span className="doctor-evidence-badge">探测到历史有效皮试</span>
                      <span className="doctor-evidence-info">
                        记录 #{recentNegativeItem.eventId}（阴性，完成于 {recentNegativeItem.completedAt ? formatTime(recentNegativeItem.completedAt) : '近期'}
                        {recentNegativeItem.verifiedByName ? `，复核护士：${recentNegativeItem.verifiedByName}` : ''}
                        {recentNegativeItem.resultValidityHours ? `，有效期 ${recentNegativeItem.resultValidityHours} 小时` : ''}）
                      </span>
                      {!medicationEntry.skinTestExempt ? (
                        <Button size="sm" variant="secondary" onClick={() => {
                          setMedicationEntry((curr) => ({
                            ...curr,
                            skinTestExempt: true,
                            skinTestExemptReason: `周期内皮试阴性有效（引用记录 #${recentNegativeItem.eventId}）`,
                            exemptEvidenceEventId: recentNegativeItem.eventId,
                          }))
                        }}>
                          一键引用免试
                        </Button>
                      ) : (
                        <span className="doctor-evidence-applied-tag">已引用免试</span>
                      )}
                    </div>
                  )}
                  <label className="doctor-exempt-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(medicationEntry.skinTestExempt)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setMedicationEntry((curr) => ({
                          ...curr,
                          skinTestExempt: checked,
                          skinTestExemptReason: checked
                            ? (curr.skinTestExemptReason || '周期内已有阴性结果（有效时间内）')
                            : '',
                          exemptEvidenceEventId: checked ? curr.exemptEvidenceEventId : undefined,
                        }))
                      }}
                    />
                    <span>免做皮试</span>
                  </label>
                  {medicationEntry.skinTestExempt && (
                    <div className="doctor-exempt-reason-select">
                      <Select
                        value={medicationEntry.skinTestExemptReason || '周期内已有阴性结果（有效时间内）'}
                        options={[
                          { value: '周期内已有阴性结果（有效时间内）', label: '周期内已有阴性结果（有效时间内）' },
                          { value: '同批号连续用药', label: '同批号连续用药' },
                          { value: '外院有效皮试结果证明', label: '外院有效皮试结果证明' },
                          { value: '患者既往近期规则耐受使用', label: '患者既往近期规则耐受使用' },
                          { value: '其他临床裁量免试', label: '其他临床裁量免试' },
                        ]}
                        searchable={false}
                        clearable={false}
                        onChange={(val) => setMedicationEntry((curr) => ({ ...curr, skinTestExemptReason: val }))}
                      />
                    </div>
                  )}
                </div>
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

      {savedEntries.map((entry, index) => {
        let rowNode: React.ReactNode
        if (entry.kind === 'service') {
          rowNode = <ServiceReadRow key={`service-${entry.value.id}`} value={entry.value}
            busy={busy} readOnly={readOnly} currentDept={currentDept} onCancel={() => onCancelService(entry.value)}
            onPrint={entry.value.status === 'ACTIVE' ? () => onPrintService(entry.value) : undefined} />
        } else {
          const prescription = prescriptions.find((value) => value.id === entry.value.prescriptionId)
          const firstLine = prescription?.medicationRequests.find((value) => value.status === 'ACTIVE')?.id === entry.value.id
          const prev = index > 0 ? savedEntries[index - 1] : undefined
          const next = index < savedEntries.length - 1 ? savedEntries[index + 1] : undefined
          const entryGroupId = entry.value.parentRequestId || entry.value.id
          const sameGroupAsPrev = Boolean(
            entry.value.routeExecutionType === 'INFUSION' &&
            prev?.kind === 'medication' &&
            prev.value.routeExecutionType === 'INFUSION' &&
            entryGroupId === (prev.value.parentRequestId || prev.value.id)
          )
          const nextInSaved = Boolean(
            entry.value.routeExecutionType === 'INFUSION' &&
            next?.kind === 'medication' &&
            next.value.routeExecutionType === 'INFUSION' &&
            entryGroupId === (next.value.parentRequestId || next.value.id)
          )
          const isLastSavedInGroup = !savedEntries.slice(index + 1).some(
            (s) => s.kind === 'medication' &&
              s.value.routeExecutionType === 'INFUSION' &&
              (s.value.parentRequestId || s.value.id) === entryGroupId
          )
          const hasDraftsInGroup = draftEntries.some(
            (d) => d.kind === 'medication' &&
              d.value.routeExecutionType === 'INFUSION' &&
              (d.value.parentRequestId || d.value.administrationGroupKey) === entryGroupId
          )
          const nextIsComposerSession = Boolean(
            isLastSavedInGroup &&
            !hasDraftsInGroup &&
            isComposerActive &&
            groupingSession &&
            (groupingSession.groupKey === entry.value.id ||
              groupingSession.groupKey === entry.value.parentRequestId ||
              groupingSession.groupKey === `request:${entry.value.id}` ||
              groupingSession.groupKey === `request:${entry.value.parentRequestId}`)
          )
          const sameGroupAsNext = nextInSaved || hasDraftsInGroup || nextIsComposerSession
          const isHead = !sameGroupAsPrev && sameGroupAsNext
          const isMid = sameGroupAsPrev && sameGroupAsNext
          const isTail = sameGroupAsPrev && !sameGroupAsNext
          rowNode = <MedicationReadRow key={`medication-${entry.value.id}`} value={entry.value} busy={busy}
            isHead={isHead}
            isMid={isMid}
            isTail={isTail}
            readOnly={readOnly}
            currentDept={currentDept}
            skinTest={skinTestByRequest.get(entry.value.id)}
            onCancel={() => onCancelMedication(entry.value)}
            onPrint={prescription && firstLine && canPrintPrescription(prescription) ? () => onPrint(prescription) : undefined} />
        }
        if (groupingComposerTarget?.type === 'saved' && groupingComposerTarget.index === index) {
          return (
            <Fragment key={`saved-wrap-${entry.value.id}`}>
              {rowNode}
              {renderComposer()}
            </Fragment>
          )
        }
        return rowNode
      })}

      {!readOnly && draftEntries.map((entry, index) => {
        const rowNode = entry.kind === 'service'
          ? editingDraft?.kind === 'service' && editingDraft.id === entry.value.id
            ? <ServiceDraftEditRow key={`draft-service-edit-${entry.value.id}`} value={entry.value}
                currentDept={currentDept}
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
                currentDept={currentDept}
                onEdit={() => { setComposerOpen(false); setEditingDraft({ kind: 'service', id: entry.value.id }) }}
                onRemove={() => setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
          : editingDraft?.kind === 'medication' && editingDraft.id === entry.value.id
            ? <MedicationDraftEditRow key={`draft-medication-edit-${entry.value.id}`} value={entry.value}
                routeOptions={routeOptions} frequencyOptions={frequencyOptions}
                routeExecutionTypes={new Map((routes.data ?? []).map((value) => [value.code, value.executionType]))}
                administrationGroupOptions={administrationGroups.options}
                frequencies={frequencies.data ?? []}
                currentDept={currentDept}
                encounter={encounter}
                api={api}
                allergies={allergies}
                skinTests={skinTests}
                onAppendToGroup={continueGroupingFromDraft}
                onCancel={() => setEditingDraft(null)}
                onSave={(next) => {
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
                }}
                onRemove={() => {
                  setEditingDraft((curr) => curr?.id === entry.value.id ? null : curr)
                  setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))
                }} />
            : (() => {
                const prev = index > 0 ? draftEntries[index - 1] : undefined
                const next = index < draftEntries.length - 1 ? draftEntries[index + 1] : undefined
                const sameGroupAsPrev = Boolean(
                  entry.value.administrationGroupKey &&
                  prev?.kind === 'medication' &&
                  prev.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const nextInDrafts = Boolean(
                  entry.value.administrationGroupKey &&
                  next?.kind === 'medication' &&
                  next.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const isLastDraftInThisGroup = !draftEntries.slice(index + 1).some(
                  (d) => d.kind === 'medication' && d.value.administrationGroupKey === entry.value.administrationGroupKey
                )
                const nextIsComposerSession = Boolean(
                  isLastDraftInThisGroup &&
                  isComposerActive &&
                  groupingSession &&
                  entry.value.administrationGroupKey === groupingSession.groupKey
                )
                const sameGroupAsNext = nextInDrafts || nextIsComposerSession
                const isHead = !sameGroupAsPrev && sameGroupAsNext
                const isMid = sameGroupAsPrev && sameGroupAsNext
                const isTail = sameGroupAsPrev && !sameGroupAsNext
                return <MedicationDraftRow key={`draft-medication-${entry.value.id}`} value={entry.value}
                  isHead={isHead}
                  isMid={isMid}
                  isTail={isTail}
                  currentDept={currentDept}
                  onAppendToGroup={continueGroupingFromDraft}
                  onEdit={() => { setComposerOpen(false); setEditingDraft({ kind: 'medication', id: entry.value.id }) }}
                  onRemove={() => setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
              })()
        if (groupingComposerTarget?.type === 'draft' && groupingComposerTarget.index === index) {
          return (
            <Fragment key={`draft-wrap-${entry.value.id}`}>
              {rowNode}
              {renderComposer()}
            </Fragment>
          )
        }
        return rowNode
      })}

      {!readOnly && isComposerActive && !groupingComposerTarget && renderComposer()}
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

function MedicationReadRow({ value, skinTest, busy, readOnly, isHead, isTail, isMid, onCancel, onPrint, currentDept }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; readOnly: boolean
  isHead?: boolean; isTail?: boolean; isMid?: boolean
  onCancel: () => void; onPrint?: () => void
  currentDept?: string
}) {
  const spec = value.packageSpec || value.preparationSpec
  const mfr = value.manufacturerName
  return <div className="doctor-unified-order-row" role="row">
    <span className="doctor-unified-cell-type">
      <OrderTypeBadge type={value.medicationType === 'HERBAL' ? 'HERBAL'
        : value.medicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'MEDICATION'} />
    </span>
    <span className="doctor-unified-order-name">
      <div className="doctor-unified-order-name-row">
        <AdministrationGroupBracket isHead={isHead} isTail={isTail} isMid={isMid} />
        <div className="doctor-unified-order-name-text">
          <strong>{value.itemName || value.medicationName}</strong>
          {(spec || mfr) && (
            <div className="doctor-unified-order-subtext">
              {spec && <span>{spec}</span>}
              {spec && mfr && <span className="doctor-subtext-divider">/</span>}
              {mfr && <span>{mfr}</span>}
            </div>
          )}
        </div>
      </div>
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
    <span className="doctor-unified-cell-dept">
      <span className="doctor-direction-chip is-dept">
        {resolveExecutingDepartment({
          kind: 'medication',
          type: value.medicationType,
          stockSiteName: (value as any).stockSiteName,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">{value.medicationInstruction || '—'}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>
        {orderStatusLabel(value.status)}
      </StatusBadge>
      {value.skinTestExempt ? (
        <span title={value.skinTestExemptReason || '已免做皮试'}><StatusBadge tone="info">免皮试</StatusBadge></span>
      ) : value.skinTestRequired ? (
        <StatusBadge tone={skinTest?.status === 'NEGATIVE' ? 'success'
          : skinTest?.status === 'POSITIVE' ? 'danger' : 'warning'}>{doctorSkinTestLabel(skinTest?.status)}</StatusBadge>
      ) : null}
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

function ServiceReadRow({ value, busy, readOnly, onCancel, onPrint, currentDept }: {
  value: ServiceRequest; busy: boolean; readOnly: boolean; onCancel: () => void; onPrint?: () => void
  currentDept?: string
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
    <span className="doctor-unified-cell-dept">
      <span className="doctor-direction-chip is-dept">
        {resolveExecutingDepartment({
          kind: 'service',
          type: value.serviceType,
          itemName: value.itemName,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(value.status)}</StatusBadge>
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      {onPrint && <Button size="sm" variant="text" onClick={onPrint}>打印</Button>}
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
  administrationGroupOptions, frequencies, onSave, onCancel, onRemove, onAppendToGroup, currentDept,
  encounter, api, allergies, skinTests }: {
  value: MedicationPlanDraft
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routeExecutionTypes: Map<string, 'NONE' | 'ADMINISTRATION' | 'INFUSION'>
  administrationGroupOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencies?: ActiveOrderFrequency[]
  onSave: (value: MedicationPlanDraft) => void
  onCancel: () => void
  onRemove: () => void
  onAppendToGroup?: (value: MedicationPlanDraft) => void
  currentDept?: string
  encounter?: Encounter
  api?: RhnApi
  allergies?: AllergyIntolerance[]
  skinTests?: { data?: SkinTestWorkItem[] }
}) {
  const [doseValue, setDoseValue] = useState<number | ''>(value.request.doseValue ?? '')
  const [routeCode, setRouteCode] = useState(value.request.routeCode)
  const [frequencyCode, setFrequencyCode] = useState(value.request.frequencyCode)
  const [durationValue, setDurationValue] = useState<number | ''>(value.request.durationValue ?? '')
  const [quantity, setQuantity] = useState(value.request.quantity)
  const [instruction, setInstruction] = useState(value.request.medicationInstruction ?? '')
  const [administrationGroupKey, setAdministrationGroupKey] = useState(value.administrationGroupKey)

  // 皮试与安全核对状态
  const [skinTestExempt, setSkinTestExempt] = useState(Boolean(value.request.skinTestExempt))
  const [skinTestExemptReason, setSkinTestExemptReason] = useState(value.request.skinTestExemptReason ?? '')
  const [exemptEvidenceEventId, setExemptEvidenceEventId] = useState(value.request.exemptEvidenceEventId)
  const [allergyOverrideReason, setAllergyOverrideReason] = useState(value.request.allergyOverrideReason ?? '')

  const executionType = routeExecutionTypes.get(routeCode || '') || value.routeExecutionType
  const valid = Number(doseValue) > 0 && Boolean(routeCode) && Boolean(frequencyCode) && Number(quantity) > 0
  const spec = value.productSpec || value.preparationSpec
  const mfr = value.manufacturerName
  const isManualQuantityRef = useRef(false)

  // 药品知识库查询（若当前草稿上未缓存皮试相关字段，异步补充查询）
  const medQuery = useQuery({
    queryKey: ['medicationKnowledge', value.request.medicationId],
    queryFn: async () => {
      if (!api || !encounter || !value.request.medicationId) return null
      const res = await api.masterData.medications(value.medicationName || value.medicationCode, '', 'ACTIVE', encounter.organizationId)
      return res.find((m) => m.id === value.request.medicationId) || res[0] || null
    },
    enabled: Boolean(api && encounter && value.request.medicationId && value.skinTestRequired === undefined),
  })

  const isSkinTest = Boolean(
    value.skinTestRequired ||
    medQuery.data?.skinTestRequired ||
    value.request.skinTestExempt ||
    value.request.skinTestExemptReason
  )

  const recentNegativeSkinTests = useQuery({
    queryKey: ['recentNegativeSkinTests', encounter?.residentId, value.request.medicationId],
    queryFn: () => (isSkinTest && value.request.medicationId && encounter?.residentId && api)
      ? api.treatments.validNegativeSkinTests(
          encounter.residentId,
          value.request.medicationId,
          value.skinTestResultValidityHours ?? medQuery.data?.skinTestResultValidityHours
        )
      : Promise.resolve([]),
    enabled: Boolean(isSkinTest && value.request.medicationId && encounter?.residentId && api),
  })
  const recentNegativeItem = (recentNegativeSkinTests.data ?? [])[0]

  const hasPositiveSkinTest = Boolean(
    (skinTests?.data ?? []).some((item) => item.medicationId === value.request.medicationId && item.status === 'POSITIVE')
  )

  const drugAllergies = useMemo(
    () => (allergies ?? []).filter((allergy) => allergy.assertionType === 'ALLERGY' && allergy.categoryCode === 'DRUG'),
    [allergies]
  )
  const allergenConceptIds = value.allergenConceptIds ?? medQuery.data?.allergenConceptIds
  const isAllergyHit = drugAllergies.some((allergy) => allergy.allergenId
    ? allergenConceptIds?.includes(allergy.allergenId)
    : allergy.substanceCode?.toLowerCase() === value.medicationCode?.toLowerCase())
  const matchedAllergies = drugAllergies.filter((allergy) => allergy.allergenId
    ? allergenConceptIds?.includes(allergy.allergenId)
    : allergy.substanceCode?.toLowerCase() === value.medicationCode?.toLowerCase())
  const hasKnownAllergies = drugAllergies.length > 0

  const isAntimicrobial = Boolean(value.antimicrobial ?? medQuery.data?.antimicrobial)
  const antimicrobialLevelText = value.sdAntimicrobialLevelText || medQuery.data?.sdAntimicrobialLevelText

  const hasSafetyAlert = drugAllergies.length > 0 || isSkinTest || isAntimicrobial

  const recalculateCurrentQuantity = (nextDose: number | '', nextFreq: string, nextDur: number | '') => {
    if (isManualQuantityRef.current) return
    const origDose = Number(value.request.doseValue) || 1
    const origFreq = resolveFrequencyTimesPerDay(frequencies, value.request.frequencyCode)
    const origDur = Number(value.request.durationValue) || 1
    const curDose = Number(nextDose) || origDose
    const curFreq = resolveFrequencyTimesPerDay(frequencies, nextFreq)
    const curDur = Number(nextDur) || origDur
    const doseRatio = curDose / origDose
    const scheduleRatio = (curFreq * curDur) / (origFreq * origDur)
    const totalRatio = doseRatio * scheduleRatio
    if (totalRatio > 0) {
      setQuantity(Math.max(1, Math.round(value.request.quantity * totalRatio)))
    }
  }

  const rowRef = useRef<HTMLDivElement>(null)
  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)
  const isAppendingRef = useRef(false)
  const isInteractingWithContainerRef = useRef(false)
  const containerInteractionTimeoutRef = useRef<number | null>(null)

  const markContainerInteraction = () => {
    isInteractingWithContainerRef.current = true
    if (containerInteractionTimeoutRef.current) {
      window.clearTimeout(containerInteractionTimeoutRef.current)
    }
    containerInteractionTimeoutRef.current = window.setTimeout(() => {
      isInteractingWithContainerRef.current = false
    }, 400)
  }

  const getUpdatedDraft = (): MedicationPlanDraft => ({
    ...value,
    productSpec: spec,
    manufacturerName: mfr,
    administrationGroupKey,
    routeName: routesDataName(routeCode),
    routeExecutionType: executionType,
    skinTestRequired: isSkinTest,
    antimicrobial: isAntimicrobial,
    sdAntimicrobialLevelText: antimicrobialLevelText,
    allergenConceptIds,
    request: {
      ...value.request,
      doseValue: Number(doseValue),
      routeCode,
      frequencyCode,
      durationValue: durationValue === '' ? undefined : Number(durationValue),
      quantity: Number(quantity),
      medicationInstruction: instruction.trim(),
      skinTestExempt,
      skinTestExemptReason: skinTestExempt
        ? (skinTestExemptReason.trim() || '周期内已有阴性结果（有效时间内）')
        : undefined,
      exemptEvidenceEventId: skinTestExempt ? exemptEvidenceEventId : undefined,
      allergyOverrideReason: allergyOverrideReason.trim() || undefined,
    },
  })

  const save = () => {
    if (hasSavedRef.current || isRemovingRef.current || isAppendingRef.current) return
    hasSavedRef.current = true
    if (valid) {
      onSave(getUpdatedDraft())
    } else {
      onCancel()
    }
  }

  const handleAppendToGroup = () => {
    if (hasSavedRef.current || isRemovingRef.current) return
    hasSavedRef.current = true
    const updated = getUpdatedDraft()
    onSave(updated)
    onAppendToGroup?.(updated)
  }

  function routesDataName(code?: string) {
    if (!code) return ''
    return routeOptions.find((item) => item.value === code)?.label ?? code
  }

  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const listEl = rowRef.current?.closest('.doctor-unified-order-list')
    const handleScroll = () => {
      markContainerInteraction()
    }
    if (listEl) {
      listEl.addEventListener('scroll', handleScroll, { passive: true })
    }

    const handleOutsideInteraction = (event: Event) => {
      if (isRemovingRef.current || isAppendingRef.current) return
      const target = event.target as Node | null
      if (!target) return
      const isInsideRow = rowRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
      )
      const isTableContainer = target === listEl || Boolean((target as Element)?.classList?.contains('doctor-unified-order-list'))
      if (isTableContainer) {
        markContainerInteraction()
        return
      }
      if (!isInsideRow && !isInsidePopover) {
        saveRef.current()
      }
    }

    document.addEventListener('pointerdown', handleOutsideInteraction)
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('click', handleOutsideInteraction, true)
    return () => {
      if (listEl) {
        listEl.removeEventListener('scroll', handleScroll)
      }
      if (containerInteractionTimeoutRef.current) {
        window.clearTimeout(containerInteractionTimeoutRef.current)
      }
      document.removeEventListener('pointerdown', handleOutsideInteraction)
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('click', handleOutsideInteraction, true)
    }
  }, [])

  const handleBlur = (event: React.FocusEvent) => {
    if (isRemovingRef.current || isAppendingRef.current) return
    if (isInteractingWithContainerRef.current) return
    const next = event.relatedTarget as Node | null
    if (!next) {
      setTimeout(() => {
        if (isRemovingRef.current || isAppendingRef.current) return
        if (isInteractingWithContainerRef.current) return
        const active = document.activeElement
        const isInsideRow = rowRef.current?.contains(active)
        const isInsidePopover = Boolean(
          active?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
        )
        if (!isInsideRow && !isInsidePopover) {
          save()
        }
      }, 100)
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

  return (
    <div
      ref={rowRef}
      className="doctor-unified-draft-editor-wrap"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div
        className="doctor-unified-inline-composer is-draft-editor"
        role="row"
        aria-label={`编辑待确认医嘱 ${value.medicationName}`}
      >
        <div className="doctor-inline-order-static-type">
          <OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} />
        </div>
        <div
          className="doctor-inline-order-static-resource"
          title={`${value.productName || value.medicationName}${spec ? ` (${spec})` : ''}${mfr ? ` · ${mfr}` : ''}`}
        >
          <div className="doctor-draft-edit-resource-wrap">
            {(executionType === 'INFUSION' || Boolean(administrationGroupKey)) && (
              <div className="doctor-draft-group-selector">
                <Select
                  id={`draft-group-${value.id}`}
                  aria-label="编辑输液分组"
                  value={administrationGroupKey || ''}
                  clearable={false}
                  searchable={false}
                  options={[{ value: '__NEW__', label: '新组' }, ...administrationGroupOptions]}
                  onChange={(next) => setAdministrationGroupKey(next === '__NEW__' ? newAdministrationGroupKey() : next)}
                  onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)}
                />
              </div>
            )}
            <div className="doctor-draft-resource-text">
              <strong>{value.productName || value.medicationName}</strong>
              {(spec || mfr) && (
                <div className="doctor-unified-order-subtext">
                  {spec && <span>{spec}</span>}
                  {spec && mfr && <span className="doctor-subtext-divider">/</span>}
                  {mfr && <span>{mfr}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="doctor-inline-order-directions-group">
          <div className="doctor-inline-order-field doctor-inline-order-dose">
            <div className="doctor-entry-input-unit">
              <input
                id={`draft-dose-${value.id}`}
                aria-label="编辑单次剂量"
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={doseValue}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const next = numberValue(event.target.value)
                  setDoseValue(next)
                  recalculateCurrentQuantity(next, frequencyCode || '', durationValue)
                }}
                onKeyDown={(event) => continueDraftOnEnter(event, `draft-route-${value.id}`)}
              />
              <small>{value.request.doseUnit}</small>
            </div>
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-route">
            <Select
              id={`draft-route-${value.id}`}
              aria-label="编辑给药途径"
              value={routeCode}
              openOnFocus
              onChange={(next) => {
                setRouteCode(next)
                if (routeExecutionTypes.get(next) === 'INFUSION' && !administrationGroupKey) {
                  setAdministrationGroupKey(newAdministrationGroupKey())
                }
              }}
              onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)}
              showValue
              placeholder="途径"
              options={routeOptions}
            />
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-frequency">
            <Select
              id={`draft-frequency-${value.id}`}
              aria-label="编辑频次"
              value={frequencyCode}
              openOnFocus
              onChange={(next) => {
                setFrequencyCode(next)
                recalculateCurrentQuantity(doseValue, next, durationValue)
              }}
              onSelectionCommit={() => focusControlAfterSelection(`draft-duration-${value.id}`)}
              showValue
              placeholder="频次"
              options={frequencyOptions}
            />
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-duration">
            <div className="doctor-entry-input-unit">
              <input
                id={`draft-duration-${value.id}`}
                aria-label="编辑疗程"
                type="number"
                min="1"
                value={durationValue}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const next = numberValue(event.target.value)
                  setDurationValue(next)
                  recalculateCurrentQuantity(doseValue, frequencyCode || '', next)
                }}
                onKeyDown={(event) => continueDraftOnEnter(event, `draft-quantity-${value.id}`)}
              />
              <small>{value.request.durationUnit || '天'}</small>
            </div>
          </div>
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-quantity">
          <div className="doctor-entry-input-unit">
            <input
              id={`draft-quantity-${value.id}`}
              aria-label="编辑总量"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                isManualQuantityRef.current = true
                setQuantity(Number(event.target.value))
              }}
              onKeyDown={(event) => continueDraftOnEnter(event, `draft-instruction-${value.id}`)}
            />
            <small>{formatPackageUnit(undefined, value.request.quantityUnit)}</small>
          </div>
        </div>
        <div className="doctor-inline-order-static doctor-inline-order-dept">
          <span className="doctor-direction-chip is-dept">
            {resolveExecutingDepartment(
              {
                kind: 'medication',
                type: value.categoryCode,
                stockSiteName: value.stockSiteName,
              },
              currentDept
            )}
          </span>
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-instruction">
          <input
            id={`draft-instruction-${value.id}`}
            aria-label="编辑用药嘱托"
            value={instruction}
            placeholder="用药嘱托"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                save()
              }
            }}
          />
        </div>
        <div className="doctor-inline-order-static doctor-inline-order-price">
          {formatUnitPrice(value.unitPrice, value.currencyCode)}
        </div>
        <div className="doctor-inline-order-status">
          <StatusBadge tone="warning">编辑中</StatusBadge>
        </div>
        <div className="doctor-inline-order-actions">
          {(executionType === 'INFUSION' || Boolean(administrationGroupKey)) && onAppendToGroup && (
            <Button
              size="sm"
              variant="secondary"
              onMouseDown={() => {
                isAppendingRef.current = true
              }}
              onClick={handleAppendToGroup}
              title="向该输液组追加药品"
            >
              + 同组
            </Button>
          )}
          <Popconfirm
            title={`确认移除“${value.productName || value.medicationName || '该药品'}”？`}
            okText="移除"
            okVariant="danger"
            onConfirm={onRemove}
          >
            <Button
              size="sm"
              variant="text"
              onMouseDown={() => {
                isRemovingRef.current = true
              }}
            >
              移除
            </Button>
          </Popconfirm>
        </div>
      </div>

      {hasSafetyAlert && (
        <div className="doctor-unified-order-subrow doctor-unified-order-safety is-warning is-compact" role="row">
          <div className="doctor-safety-content is-compact">
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
              <span
                className={`doctor-safety-tag ${hasPositiveSkinTest ? 'is-danger' : skinTestExempt ? 'is-exempt' : 'is-skintest'}`}
              >
                <Icon name={hasPositiveSkinTest ? 'warning' : 'info'} />
                {hasPositiveSkinTest
                  ? '严正警示：患者当前药品皮试结果为【阳性】，禁止开立！'
                  : skinTestExempt
                  ? `已免做皮试：${skinTestExemptReason || '符合免试规则'}`
                  : '需皮试药品（默认派发皮试任务）'}
              </span>
            )}
            {isSkinTest && !hasPositiveSkinTest && (
              <div className="doctor-skintest-exempt-inline">
                {recentNegativeItem && !skinTestExempt && (
                  <span className="doctor-skintest-evidence-inline">
                    <span className="doctor-evidence-badge">历史阴性</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSkinTestExempt(true)
                        setSkinTestExemptReason(`周期内皮试阴性有效（引用记录 #${recentNegativeItem.eventId}）`)
                        setExemptEvidenceEventId(recentNegativeItem.eventId)
                      }}
                    >
                      一键引用免试
                    </Button>
                  </span>
                )}
                <label className="doctor-exempt-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(skinTestExempt)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSkinTestExempt(checked)
                      if (checked) {
                        setSkinTestExemptReason((curr) => curr || '周期内已有阴性结果（有效时间内）')
                      } else {
                        setSkinTestExemptReason('')
                        setExemptEvidenceEventId(undefined)
                      }
                    }}
                  />
                  <span>免做皮试</span>
                </label>
                {skinTestExempt && (
                  <div className="doctor-exempt-reason-select">
                    <Select
                      value={skinTestExemptReason || '周期内已有阴性结果（有效时间内）'}
                      options={[
                        { value: '周期内已有阴性结果（有效时间内）', label: '周期内已有阴性结果（有效时间内）' },
                        { value: '同批号连续用药', label: '同批号连续用药' },
                        { value: '外院有效皮试结果证明', label: '外院有效皮试结果证明' },
                        { value: '患者既往近期规则耐受使用', label: '患者既往近期规则耐受使用' },
                        { value: '其他临床裁量免试', label: '其他临床裁量免试' },
                      ]}
                      searchable={false}
                      clearable={false}
                      onChange={(val) => setSkinTestExemptReason(val)}
                    />
                  </div>
                )}
              </div>
            )}
            {isAntimicrobial && (
              <span className="doctor-safety-tag is-antimicrobial">
                抗菌药物{antimicrobialLevelText ? ` · ${antimicrobialLevelText}` : ''}
              </span>
            )}
            {isAllergyHit && (
              <input
                aria-label="继续开立理由"
                value={allergyOverrideReason}
                placeholder="命中已知过敏，请输入继续开立理由"
                onChange={(event) => setAllergyOverrideReason(event.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceDraftEditRow({ value, onSave, onCancel, onRemove, currentDept }: {
  value: ServicePlanDraft; onSave: (value: ServicePlanDraft) => void; onCancel: () => void; onRemove: () => void
  currentDept?: string
}) {
  const [description, setDescription] = useState(value.clinicalDescription ?? '')
  const [quantity, setQuantity] = useState(value.quantity)

  const rowRef = useRef<HTMLDivElement>(null)
  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)
  const isInteractingWithContainerRef = useRef(false)
  const containerInteractionTimeoutRef = useRef<number | null>(null)

  const markContainerInteraction = () => {
    isInteractingWithContainerRef.current = true
    if (containerInteractionTimeoutRef.current) {
      window.clearTimeout(containerInteractionTimeoutRef.current)
    }
    containerInteractionTimeoutRef.current = window.setTimeout(() => {
      isInteractingWithContainerRef.current = false
    }, 400)
  }

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
    const listEl = rowRef.current?.closest('.doctor-unified-order-list')
    const handleScroll = () => {
      markContainerInteraction()
    }
    if (listEl) {
      listEl.addEventListener('scroll', handleScroll, { passive: true })
    }

    const handleOutsideInteraction = (event: Event) => {
      if (isRemovingRef.current) return
      const target = event.target as Node | null
      if (!target) return
      const isInsideRow = rowRef.current?.contains(target)
      const isInsidePopover = Boolean(
        (target as Element)?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
      )
      const isTableContainer = target === listEl || Boolean((target as Element)?.classList?.contains('doctor-unified-order-list'))
      if (isTableContainer) {
        markContainerInteraction()
        return
      }
      if (!isInsideRow && !isInsidePopover) {
        saveRef.current()
      }
    }

    document.addEventListener('pointerdown', handleOutsideInteraction)
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('click', handleOutsideInteraction, true)
    return () => {
      if (listEl) {
        listEl.removeEventListener('scroll', handleScroll)
      }
      if (containerInteractionTimeoutRef.current) {
        window.clearTimeout(containerInteractionTimeoutRef.current)
      }
      document.removeEventListener('pointerdown', handleOutsideInteraction)
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('click', handleOutsideInteraction, true)
    }
  }, [])

  const handleBlur = (event: React.FocusEvent) => {
    if (isRemovingRef.current) return
    if (isInteractingWithContainerRef.current) return
    const next = event.relatedTarget as Node | null
    if (!next) {
      setTimeout(() => {
        if (isRemovingRef.current) return
        if (isInteractingWithContainerRef.current) return
        const active = document.activeElement
        const isInsideRow = rowRef.current?.contains(active)
        const isInsidePopover = Boolean(
          active?.closest?.('.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm')
        )
        if (!isInsideRow && !isInsidePopover) {
          save()
        }
      }, 100)
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
          autoFocus value={quantity}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setQuantity(Number(event.target.value))}
          onKeyDown={(event) => continueDraftOnEnter(event, `draft-service-note-${value.id}`)} /><small>{value.unitCode || '项'}</small></div>
      </div>
      <div className="doctor-inline-order-static doctor-inline-order-dept">
        <span className="doctor-direction-chip is-dept">
          {resolveExecutingDepartment({
            kind: 'service',
            type: value.serviceType,
            itemName: value.itemName,
          }, currentDept)}
        </span>
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note">
        <input id={`draft-service-note-${value.id}`} aria-label="编辑临床说明" value={description} placeholder="临床说明"
          onFocus={(event) => event.currentTarget.select()}
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

function MedicationDraftRow({ value, isHead, isTail, isMid, onEdit, onRemove, onAppendToGroup, currentDept }: {
  value: MedicationPlanDraft; isHead?: boolean; isTail?: boolean; isMid?: boolean; onEdit: () => void; onRemove: () => void
  onAppendToGroup?: (value: MedicationPlanDraft) => void
  currentDept?: string
}) {
  const spec = value.productSpec || value.preparationSpec
  const mfr = value.manufacturerName
  return <div className="doctor-unified-order-row is-draft is-editable" role="row" tabIndex={0}
    aria-label={`编辑待确认医嘱 ${value.medicationName}`} title="单击编辑医嘱" onClick={onEdit}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit() } }}>
    <span className="doctor-unified-cell-type">
      <OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} />
    </span>
    <span className="doctor-unified-order-name">
      <div className="doctor-unified-order-name-row">
        <AdministrationGroupBracket isHead={isHead} isTail={isTail} isMid={isMid} />
        <div className="doctor-unified-order-name-text">
          <strong>{value.productName || value.medicationName}</strong>
          {(spec || mfr) && (
            <div className="doctor-unified-order-subtext">
              {spec && <span>{spec}</span>}
              {spec && mfr && <span className="doctor-subtext-divider">/</span>}
              {mfr && <span>{mfr}</span>}
            </div>
          )}
        </div>
      </div>
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
    <span className="doctor-unified-cell-dept">
      <span className="doctor-direction-chip is-dept">
        {resolveExecutingDepartment({
          kind: 'medication',
          type: value.categoryCode,
          stockSiteName: value.stockSiteName,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">{value.request.medicationInstruction || '—'}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone="warning">待确认</StatusBadge>
      {value.request.skinTestExempt ? (
        <span title={value.request.skinTestExemptReason || '已免做皮试'}><StatusBadge tone="info">免皮试</StatusBadge></span>
      ) : value.skinTestRequired ? (
        <StatusBadge tone="warning">需皮试</StatusBadge>
      ) : null}
    </span>
    <span className="doctor-unified-order-actions">
      {(value.routeExecutionType === 'INFUSION' || Boolean(value.administrationGroupKey)) && onAppendToGroup && (
        <Button
          size="sm"
          variant="secondary"
          title="向该输液组追加药品"
          onClick={(event) => {
            event.stopPropagation()
            onAppendToGroup(value)
          }}
        >
          + 同组
        </Button>
      )}
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

function ServiceDraftRow({ value, onEdit, onRemove, currentDept }: {
  value: ServicePlanDraft; onEdit: () => void; onRemove: () => void; currentDept?: string
}) {
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
    <span className="doctor-unified-cell-dept">
      <span className="doctor-direction-chip is-dept">
        {resolveExecutingDepartment({
          kind: 'service',
          type: value.serviceType,
          itemName: value.itemName,
        }, currentDept)}
      </span>
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
    ? (type === 'CHINESE_PATENT' ? 'is-patent' : type === 'HERBAL' ? 'is-herbal' : 'is-medication')
    : `is-${type.toLowerCase()}`
  return <span className={`doctor-unified-order-kind ${className}`}>{label}</span>
}

function AdministrationGroupBracket({ isHead, isTail, isMid }: {
  isHead?: boolean; isTail?: boolean; isMid?: boolean
}) {
  if (!isHead && !isTail && !isMid) return null
  const symbol = isHead ? '┏' : isTail ? '┗' : '┃'
  return (
    <span
      className={`doctor-group-bracket ${isHead ? 'is-head' : isTail ? 'is-tail' : 'is-mid'}`}
      title={isHead ? '输液成组（组头药）' : '输液成组（同组药）'}
      aria-label="输液成组标识"
    >
      {symbol}
    </span>
  )
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
  return value === 'ALL' ? '全部'
    : value === 'WESTERN' ? '西药'
    : value === 'CHINESE_PATENT' ? '中成药'
    : value === 'MEDICATION' ? '药品'
    : value === 'HERBAL' ? '草药'
    : serviceTypeLabel(value)
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
  if (typeof document === 'undefined') return
  const tryFocus = () => {
    const el = document.getElementById(`doctor-unified-${type}-resource`)
      || document.querySelector<HTMLElement>('.doctor-unified-inline-composer .ui-remote-search__trigger')
    if (el) {
      el.focus()
      const searchInput = document.querySelector<HTMLInputElement>('.ui-remote-search__search input')
      if (searchInput && document.activeElement !== searchInput) {
        searchInput.focus()
      }
      return true
    }
    return false
  }

  if (tryFocus()) return

  window.requestAnimationFrame(() => {
    if (tryFocus()) return
    globalThis.setTimeout(() => {
      if (tryFocus()) return
      globalThis.setTimeout(tryFocus, 80)
    }, 40)
  })
}

function focusControl(id: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id)
    if (el) {
      el.focus()
      if (el instanceof HTMLInputElement) {
        el.select()
      }
    }
  })
}

function focusControlAfterSelection(id: string) {
  globalThis.setTimeout(() => focusControl(id), 0)
}
