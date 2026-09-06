import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { ActiveOrderFrequency, MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, Icon, Select, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'
import {
  canPrintPrescription, resolveDispensableOptions, type DispensableProductOption, type MedicationPlanDraft,
} from './PrescriptionListEditor'

export type OrderEntryType = 'MEDICATION' | 'HERBAL' | 'LABORATORY' | 'EXAMINATION' | 'TREATMENT'

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
}

interface MedicationEntry {
  medication?: ClinicalResourceOption<MedicationKnowledge>
  doseValue: number | ''
  doseUnit: string
  routeCode: string
  frequencyCode: string
  durationValue: number | ''
  quantity: number | ''
  dispenseOptionKey: string
  instruction: string
  herbalDoseCount: number
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

export function UnifiedOrderListEditor({
  encounter, allergies = [], prescriptions = [], medications = [], services = [],
  medicationDrafts = [], setMedicationDrafts,
  serviceDrafts = [], setServiceDrafts, api, busy = false,
  readOnly = false,
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
  readOnly?: boolean
  onCancelMedication?: (value: MedicationRequest) => void
  onCancelService?: (value: ServiceRequest) => void
  onPrint?: (value: Prescription) => void
}) {
  const [entryType, setEntryType] = useState<OrderEntryType>('MEDICATION')
  const [medicationEntry, setMedicationEntry] = useState<MedicationEntry>(emptyMedicationEntry)
  const [service, setService] = useState<ClinicalResourceOption<ServiceCatalogItem>>()
  const [serviceQuantity, setServiceQuantity] = useState(1)
  const [serviceDescription, setServiceDescription] = useState('')
  const [validationError, setValidationError] = useState('')
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
  const isMedication = entryType === 'MEDICATION' || entryType === 'HERBAL'
  const currentMedication = medicationEntry.medication?.raw
  const dispensableOptions = currentMedication
    ? resolveDispensableOptions(currentMedication, encounter.organizationId) : []
  const selectedProduct = dispensableOptions.find((value) => value.key === medicationEntry.dispenseOptionKey)
    ?? dispensableOptions[0]
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
  const requiresSafetyReview = Boolean(currentMedication && (isAllergyHit || isSkinTest || (hasKnownAllergies && isAntimicrobial)))
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

  function changeType(value: OrderEntryType) {
    setEntryType(value)
    setMedicationEntry(emptyMedicationEntry())
    setService(undefined)
    setServiceQuantity(1)
    setServiceDescription('')
    setValidationError('')
  }

  function selectMedication(option?: ClinicalResourceOption<MedicationKnowledge>) {
    const value = option?.raw
    const rawOrderable = value as (MedicationKnowledge & { stockSiteId?: string, stockSiteName?: string, availablePackageQuantity?: number, packageUnitName?: string }) | undefined
    const defaultDispenseOption = value
      ? resolveDispensableOptions(value, encounter.organizationId)[0] : undefined
    const initialDose = value?.defaultDose ?? ''
    const initialDoseUnit = value?.defaultDoseUnit ?? value?.preparationUnit ?? ''
    const initialRoute = entryType === 'HERBAL' ? 'ORAL' : value?.defaultRoute ?? 'ORAL'
    const initialFrequency = value?.defaultFrequency ?? (entryType === 'HERBAL' ? 'BID' : 'QD')
    const initialDuration = entryType === 'HERBAL' ? 7 : (medicationEntry.durationValue || 7)

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
      frequencyCode: initialFrequency,
      durationValue: initialDuration,
      quantity: calc?.quantity ?? 1,
      dispenseOptionKey: defaultDispenseOption?.key ?? '',
      instruction: '',
      herbalDoseCount: 7,
      herbalMethod: '水煎服',
      safetyReviewed: false,
      allergyOverrideReason: '',
      isManualQuantity: false,
      stockSiteId: rawOrderable?.stockSiteId,
      stockSiteName: rawOrderable?.stockSiteName,
      availablePackageQuantity: rawOrderable?.availablePackageQuantity,
      packageUnitName: rawOrderable?.packageUnitName,
    })
    setValidationError('')
    if (option) focusControl('doctor-unified-dose')
  }

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

  function addCurrentEntry() {
    if (!isMedication) {
      const selected = service?.raw
      if (!selected || serviceQuantity <= 0) { setValidationError('请选择诊疗项目并填写数量'); return }
      setServiceDrafts((current) => [...current, {
        id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: selected.sdServiceType,
        catalogItemId: selected.id, itemCode: selected.code, itemName: selected.name,
        quantity: serviceQuantity, unitCode: selected.unitCode,
        clinicalDescription: serviceDescription.trim() || undefined,
      }])
      setService(undefined)
      setServiceQuantity(1)
      setServiceDescription('')
      setValidationError('')
      focusResource(entryType)
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
    if (entryType === 'HERBAL' && (!medicationEntry.herbalMethod.trim() || !medicationEntry.frequencyCode.trim())) {
      setValidationError('请填写剂数、服法和频次'); return
    }
    if (isAllergyHit && !medicationEntry.allergyOverrideReason.trim()) {
      setValidationError('命中已知过敏原，必须填写继续开立理由')
      return
    }
    if (requiresSafetyReview && !medicationEntry.safetyReviewed) {
      setValidationError(isAllergyHit ? '命中已知过敏原，请完成用药安全核对' : '当前开立需皮试或高风险药品，请完成用药安全核对')
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
      routeName: herbal ? '口服'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.name,
      routeExecutionType: herbal ? 'NONE'
        : routes.data?.find((value) => value.code === medicationEntry.routeCode)?.executionType,
      stockSiteName: medicationEntry.stockSiteName,
      availablePackageQuantity: medicationEntry.availablePackageQuantity,
      packageUnitName: medicationEntry.packageUnitName,
      request: {
        medicationId: medication.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
        doseValue, doseUnit: medicationEntry.doseUnit.trim(),
        routeCode: herbal ? 'ORAL' : medicationEntry.routeCode.trim(),
        frequencyCode: medicationEntry.frequencyCode.trim(),
        durationValue: herbal ? medicationEntry.herbalDoseCount
          : medicationEntry.durationValue === '' ? undefined : Number(medicationEntry.durationValue),
        durationUnit: herbal ? '剂' : medicationEntry.durationValue === '' ? undefined : '天',
        quantity: herbal ? doseValue * medicationEntry.herbalDoseCount : Number(medicationEntry.quantity),
        quantityUnit: formatPackageUnit(product.unitName, product.unitCode), substitutionAllowed: true, selfProvided: false,
        medicationInstruction: herbal
          ? [medicationEntry.herbalMethod, medicationEntry.instruction.trim()].filter(Boolean).join('；')
          : medicationEntry.instruction.trim(),
        allergyReviewConfirmed: medicationEntry.safetyReviewed || allergyReviewRecorded || !hasSafetyAlert,
        allergyOverrideReason: medicationEntry.allergyOverrideReason.trim() || undefined,
        priceType: product.priceType, pricingRequired: true,
        reason: herbal ? '门诊草药处方' : '门诊处方',
      },
    }])
    setMedicationEntry(emptyMedicationEntry())
    setValidationError('')
    focusResource(entryType)
  }

  function continueOnEnter(event: KeyboardEvent<HTMLInputElement>, nextControlId?: string) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (nextControlId) focusControl(nextControlId)
    else addCurrentEntry()
  }

  function handleEntryBoxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      addCurrentEntry()
    }
  }

  return <div className={`doctor-unified-orders${readOnly ? ' is-readonly' : ''}`} onKeyDown={handleEntryBoxKeyDown}>
    <div className="doctor-unified-order-list" role="table" aria-label="本次医嘱连续录入列表">
      <div className="doctor-unified-order-head" role="row">
        <span className="doctor-unified-cell-type">类型</span>
        <span className="doctor-unified-cell-name">项目与规格</span>
        <span className="doctor-unified-cell-detail">用法用量 / 说明</span>
        <span className="doctor-unified-cell-qty">包装数量</span>
        <span className="doctor-unified-cell-status">状态</span>
        {!readOnly && <span className="doctor-unified-cell-actions">操作</span>}
      </div>

      {savedEntries.length === 0 && draftEntries.length === 0 && readOnly && (
        <div className="doctor-unified-order-empty" role="row">
          <span>暂无已开立医嘱</span>
        </div>
      )}

      {savedEntries.map((entry) => {
        if (entry.kind === 'service') return <ServiceReadRow key={`service-${entry.value.id}`} value={entry.value}
          busy={busy} readOnly={readOnly} onCancel={() => onCancelService(entry.value)} />
        const prescription = prescriptions.find((value) => value.id === entry.value.prescriptionId)
        const firstLine = prescription?.medicationRequests.find((value) => value.status === 'ACTIVE')?.id === entry.value.id
        return <MedicationReadRow key={`medication-${entry.value.id}`} value={entry.value} busy={busy}
          readOnly={readOnly}
          skinTest={skinTestByRequest.get(entry.value.id)}
          onCancel={() => onCancelMedication(entry.value)}
          onPrint={prescription && firstLine && canPrintPrescription(prescription) ? () => onPrint(prescription) : undefined} />
      })}

      {!readOnly && draftEntries.map((entry) => entry.kind === 'service'
        ? <ServiceDraftRow key={`draft-service-${entry.value.id}`} value={entry.value}
            onRemove={() => setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
        : <MedicationDraftRow key={`draft-medication-${entry.value.id}`} value={entry.value}
            onRemove={() => setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />)}

      {!readOnly && (
        <>
          <div className={`doctor-unified-order-row is-active-composer is-${entryType.toLowerCase()}`} role="row">
            <span className="doctor-unified-cell-type">
              <div className="doctor-composer-type-wrap">
                <Select aria-label="医嘱类型" value={entryType} clearable={false} searchable={false}
                  options={[
                    { value: 'MEDICATION', label: '西药/中成药' },
                    { value: 'HERBAL', label: '草药' },
                    { value: 'LABORATORY', label: '检验' },
                    { value: 'EXAMINATION', label: '检查' },
                    { value: 'TREATMENT', label: '治疗' },
                  ]}
                  onChange={(value) => changeType(value as OrderEntryType)} />
              </div>
            </span>

            <span className="doctor-unified-cell-name">
              <div className="doctor-composer-resource-wrap">
                {isMedication ? (
                  <ClinicalResourceSearch<MedicationKnowledge> id={`doctor-unified-${entryType}-resource`} api={api}
                    resource="medication" organizationId={encounter.organizationId} encounterId={encounter.id} value={medicationEntry.medication}
                    filterResult={(item) => entryType === 'HERBAL' ? item.sdMedicationType === 'HERBAL'
                      : ['WESTERN', 'CHINESE_PATENT'].includes(item.sdMedicationType)}
                    placeholder={entryType === 'HERBAL' ? '搜索中草药名称/拼音' : '搜索药品名称/拼音'} onChange={selectMedication} />
                ) : (
                  <ClinicalResourceSearch<ServiceCatalogItem> id={`doctor-unified-${entryType}-resource`} api={api}
                    resource="service" organizationId={encounter.organizationId} value={service}
                    filterResult={(item) => item.sdServiceType === entryType}
                    placeholder={`搜索${orderTypeLabel(entryType)}项目名称/拼音`} onChange={(value) => {
                      setService(value); setValidationError(''); if (value) focusControl('doctor-unified-service-note')
                    }} />
                )}
                {isMedication && dispensableOptions.length > 0 && (
                  <div className="doctor-composer-dispense-wrap">
                    <Select aria-label="发药包装与单位" value={selectedProduct ? selectedProduct.key : ''}
                      onChange={(value) => updateMedication('dispenseOptionKey', value)} clearable={false} showValue
                      placeholder="发药包装"
                      options={dispensableOptions.map((value) => ({
                        value: value.key, label: value.label, secondaryText: value.secondaryText,
                        searchKeywords: [value.unitCode, value.unitName],
                      }))} />
                  </div>
                )}
                {isMedication && medicationEntry.stockSiteName && (
                  <div className={`doctor-composer-stock-pill ${isStockInsufficient ? 'is-danger' : 'is-success'}`}>
                    <span className="doctor-stock-site"><Icon name="hospital" className="ui-icon-inline" /> {medicationEntry.stockSiteName}</span>
                    <span className="doctor-stock-qty">可用: <strong>{medicationEntry.availablePackageQuantity}</strong> {medicationEntry.packageUnitName || '包装'}</span>
                    {isStockInsufficient && <span className="doctor-stock-warning-text"><Icon name="warning" className="ui-icon-inline" /> 超过可用库存</span>}
                  </div>
                )}
              </div>
            </span>

            <span className="doctor-unified-cell-detail">
              {entryType === 'MEDICATION' && (
                <div className="doctor-composer-dosage-strip">
                  <div className="doctor-entry-pill-field" title="单次剂量">
                    <label htmlFor="doctor-unified-dose">每次</label>
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-dose" aria-label="单次剂量" type="number" min="0" step="0.01"
                        value={medicationEntry.doseValue} placeholder="0"
                        onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-route')} />
                      <small>{medicationEntry.doseUnit || ''}</small>
                    </div>
                  </div>

                  <div className="doctor-entry-pill-field" title="给药途径">
                    <Select id="doctor-unified-route" aria-label="给药途径" value={medicationEntry.routeCode}
                      onChange={(value) => { updateMedication('routeCode', value); focusControl('doctor-unified-frequency') }}
                      showValue loading={routes.isPending} popoverMinWidth={220}
                      placeholder="途径" options={routeOptions} />
                  </div>

                  <div className="doctor-entry-pill-field doctor-entry-pill-field--freq" title="执行频次">
                    <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
                      onChange={(value) => { updateMedication('frequencyCode', value); focusControl('doctor-unified-duration') }}
                      showValue loading={frequencies.isPending} popoverMinWidth={260}
                      placeholder="频次" options={frequencyOptions} />
                  </div>

                  <div className="doctor-entry-pill-field doctor-entry-pill-field--duration" title="疗程">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-duration" aria-label="疗程" type="number" min="1"
                        value={medicationEntry.durationValue} placeholder="天数"
                        onChange={(event) => updateMedication('durationValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} />
                      <small>天</small>
                    </div>
                  </div>

                  <div className="doctor-entry-pill-field doctor-entry-pill-field--instruction" title="用药嘱托">
                    <input id="doctor-unified-instruction" aria-label="用药嘱托" value={medicationEntry.instruction}
                      placeholder="嘱托 (如: 饭后)" onChange={(event) => updateMedication('instruction', event.target.value)}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
                  </div>
                </div>
              )}

              {entryType === 'HERBAL' && (
                <div className="doctor-composer-dosage-strip">
                  <div className="doctor-entry-pill-field" title="每付剂量">
                    <label htmlFor="doctor-unified-dose">每付</label>
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-dose" aria-label="每付剂量" type="number" min="0" step="0.01"
                        value={medicationEntry.doseValue} placeholder="0"
                        onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-count')} />
                      <small>{medicationEntry.doseUnit || 'g'}</small>
                    </div>
                  </div>

                  <div className="doctor-entry-pill-field" title="剂数">
                    <div className="doctor-entry-input-unit">
                      <input id="doctor-unified-herbal-count" aria-label="剂数" type="number" min="1"
                        value={medicationEntry.herbalDoseCount}
                        onChange={(event) => updateMedication('herbalDoseCount', Math.max(1, Number(event.target.value)))}
                        onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-method')} />
                      <small>剂</small>
                    </div>
                  </div>

                  <div className="doctor-entry-pill-field" title="煎服法">
                    <input id="doctor-unified-herbal-method" aria-label="服法" value={medicationEntry.herbalMethod} placeholder="水煎服"
                      onChange={(event) => updateMedication('herbalMethod', event.target.value)}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-frequency')} />
                  </div>

                  <div className="doctor-entry-pill-field doctor-entry-pill-field--freq" title="频次">
                    <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
                      onChange={(value) => { updateMedication('frequencyCode', value); focusControl('doctor-unified-instruction') }}
                      showValue loading={frequencies.isPending} popoverMinWidth={260}
                      placeholder="频次" options={frequencyOptions} />
                  </div>

                  <div className="doctor-entry-pill-field doctor-entry-pill-field--instruction" title="特殊煎法/嘱托">
                    <input id="doctor-unified-instruction" aria-label="特殊煎法" value={medicationEntry.instruction}
                      placeholder="如: 先煎、后下" onChange={(event) => updateMedication('instruction', event.target.value)}
                      onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
                  </div>
                </div>
              )}

              {!isMedication && (
                <div className="doctor-entry-pill-field doctor-entry-pill-field--service">
                  <input id="doctor-unified-service-note" className="doctor-unified-service-note" aria-label="临床说明"
                    value={serviceDescription} placeholder={entryType === 'LABORATORY' ? '标本种类或检验目的 (回车跳至数量)' : entryType === 'EXAMINATION' ? '检查部位及检查目的 (回车跳至数量)' : '治疗部位或临床说明 (回车跳至数量)'}
                    onChange={(event) => setServiceDescription(event.target.value)}
                    onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
                </div>
              )}
            </span>

            <span className="doctor-unified-cell-qty">
              <div className={`doctor-entry-qty-input ${isStockInsufficient ? 'is-danger' : ''}`}>
                <input id="doctor-unified-quantity" aria-label="发药数量" type="number" min="0.01" step="0.01"
                  title={entryType === 'HERBAL' ? '按每付剂量和剂数自动计算' : (isStockInsufficient ? `可用库存不足！当前仅剩 ${medicationEntry.availablePackageQuantity} 包装` : (calcResult?.calculationText ? `根据剂量频次自动计算: ${calcResult.calculationText}` : undefined))}
                  value={entryType === 'HERBAL'
                    ? medicationEntry.doseValue === '' ? '' : Number(medicationEntry.doseValue) * medicationEntry.herbalDoseCount
                    : isMedication ? medicationEntry.quantity : serviceQuantity}
                  disabled={entryType === 'HERBAL'}
                  placeholder="数量"
                  onChange={(event) => isMedication
                    ? updateMedication('quantity', numberValue(event.target.value)) : setServiceQuantity(Number(event.target.value))}
                  onKeyDown={(event) => continueOnEnter(event)} />
                <small>{entryType === 'HERBAL' ? '总付' : isMedication ? formatPackageUnit(selectedProduct?.unitName, selectedProduct?.unitCode) : (service?.raw?.unitCode ?? '项')}</small>
              </div>
              {isStockInsufficient && (
                <div className="doctor-entry-stock-error" style={{ color: 'var(--color-danger, #d32f2f)', fontSize: '0.75rem', marginTop: '2px', fontWeight: 600 }}>
                  超量(限{medicationEntry.availablePackageQuantity})
                </div>
              )}
            </span>

            <span className="doctor-unified-cell-status">
              <span className="doctor-composer-status-badge">录入中</span>
            </span>

            <span className="doctor-unified-cell-actions">
              <Button size="sm" variant="primary" className="doctor-unified-entry-add-btn" onClick={addCurrentEntry}
                title="加入待确认列表 (Enter / Ctrl+Enter)" aria-label="加入医嘱"><Icon name="add" /></Button>
            </span>
          </div>

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
                <label className="doctor-safety-checkbox">
                  <input type="checkbox" checked={medicationEntry.safetyReviewed}
                    onChange={(event) => updateMedication('safetyReviewed', event.target.checked)} />
                  <span>已完成用药禁忌与配伍安全核对</span>
                </label>
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
  </div>
}

function MedicationReadRow({ value, skinTest, busy, readOnly, onCancel, onPrint }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; readOnly: boolean
  onCancel: () => void; onPrint?: () => void
}) {
  return <div className="doctor-unified-order-row" role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.medicationType === 'HERBAL' ? 'HERBAL'
      : value.medicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'MEDICATION'} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.medicationName}</strong>
      <small className="doctor-order-spec-tag">{value.preparationSpec || value.medicationCode}</small>
    </span>
    <span className="doctor-unified-order-detail">
      <span className="doctor-order-usage-pill">{medicationDetail(value)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{formatPackageUnit(undefined, value.quantityUnit)}</small>
    </span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>
        {orderStatusLabel(value.status)}
      </StatusBadge>
      {value.skinTestRequired && <StatusBadge tone={skinTest?.status === 'NEGATIVE' ? 'success'
        : skinTest?.status === 'POSITIVE' ? 'danger' : 'warning'}>{doctorSkinTestLabel(skinTest?.status)}</StatusBadge>}
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      {onPrint && <Button size="sm" variant="text" onClick={onPrint}>打印</Button>}
      {value.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}
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
      <small className="doctor-order-spec-tag">{value.itemCode}</small>
    </span>
    <span className="doctor-unified-order-detail">
      <span className="doctor-order-usage-pill">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{value.unitCode}</small>
    </span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(value.status)}</StatusBadge>
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      {value.status === 'ACTIVE' && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}
    </span>}
  </div>
}

function MedicationDraftRow({ value, onRemove }: { value: MedicationPlanDraft; onRemove: () => void }) {
  return <div className="doctor-unified-order-row is-draft" role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.medicationName}</strong>
      <small className="doctor-order-spec-tag">{value.preparationSpec || value.medicationCode}</small>
      {value.stockSiteName && (
        <small className="doctor-order-site-tag" title={`发药药房: ${value.stockSiteName}`} style={{ color: 'var(--color-text-secondary, #666)', marginLeft: '6px' }}>
          <Icon name="hospital" className="ui-icon-inline" /> {value.stockSiteName} (余量: {value.availablePackageQuantity ?? '-'}{value.packageUnitName || ''})
        </small>
      )}
    </span>
    <span className="doctor-unified-order-detail">
      <span className="doctor-order-usage-pill">{medicationDraftDetail(value)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.request.quantity}</strong> <small>{formatPackageUnit(undefined, value.request.quantityUnit)}</small>
    </span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone="warning">待确认</StatusBadge>
    </span>
    <span className="doctor-unified-order-actions">
      <Button size="sm" variant="text" onClick={onRemove}>移除</Button>
    </span>
  </div>
}

function ServiceDraftRow({ value, onRemove }: { value: ServicePlanDraft; onRemove: () => void }) {
  return <div className="doctor-unified-order-row is-draft" role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.serviceType || 'OTHER'} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.itemName}</strong>
      <small className="doctor-order-spec-tag">{value.itemCode}</small>
    </span>
    <span className="doctor-unified-order-detail">
      <span className="doctor-order-usage-pill">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{value.unitCode}</small>
    </span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone="warning">待确认</StatusBadge>
    </span>
    <span className="doctor-unified-order-actions">
      <Button size="sm" variant="text" onClick={onRemove}>移除</Button>
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

function medicationDetail(value: MedicationRequest) {
  return [value.doseValue && `${value.doseValue}${value.doseUnit || ''}`, value.routeName || value.routeCode, value.frequencyCode,
    value.durationValue && `${value.durationValue}${value.durationUnit || '天'}`, value.medicationInstruction]
    .filter(Boolean).join(' · ') || '—'
}

function medicationDraftDetail(value: MedicationPlanDraft) {
  const request = value.request
  return [request.doseValue && `${request.doseValue}${request.doseUnit || ''}`, value.routeName || request.routeCode,
    request.frequencyCode, request.durationValue && `${request.durationValue}${request.durationUnit || '天'}`,
    request.medicationInstruction].filter(Boolean).join(' · ') || '—'
}

function serviceTypeLabel(value?: string) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as Record<string, string>)[value || 'OTHER']
    ?? '诊疗'
}

function orderTypeLabel(value: OrderEntryType) {
  return value === 'MEDICATION' ? '药品' : value === 'HERBAL' ? '草药' : serviceTypeLabel(value)
}

function orderStatusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已开立', SUBMITTED: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

function numberValue(value: string): number | '' {
  return value === '' ? '' : Number(value)
}

function byAuthoredAt(left: { authoredAt: string }, right: { authoredAt: string }) {
  return left.authoredAt.localeCompare(right.authoredAt)
}

function bySequence(left: { sequence?: number }, right: { sequence?: number }) {
  return (left.sequence ?? 0) - (right.sequence ?? 0)
}

function focusResource(type: OrderEntryType) {
  window.requestAnimationFrame(() => document.getElementById(`doctor-unified-${type}-resource`)?.focus())
}

function focusControl(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus())
}
