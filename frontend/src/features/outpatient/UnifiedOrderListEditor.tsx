import { useQuery } from '@tanstack/react-query'
import { useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { MedicationRequest, Prescription, ServiceRequest } from '../../shared/api/encountersApi'
import type { MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../shared/api/treatmentApi'
import type { Encounter } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, Select, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'
import {
  canPrintPrescription, resolveDispensableOptions, type MedicationPlanDraft,
} from './PrescriptionListEditor'

export type OrderEntryType = 'MEDICATION' | 'HERBAL' | 'LABORATORY' | 'EXAMINATION' | 'TREATMENT'

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
}

const emptyMedicationEntry = (): MedicationEntry => ({
  doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
  dispenseOptionKey: '', instruction: '', herbalDoseCount: 7, herbalMethod: '水煎服', safetyReviewed: false,
  allergyOverrideReason: '',
})

export function UnifiedOrderListEditor({
  encounter, allergies, prescriptions, medications, services, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, api, busy, onCancelMedication, onCancelService, onPrint,
}: {
  encounter: Encounter
  allergies: AllergyIntolerance[]
  prescriptions: Prescription[]
  medications: MedicationRequest[]
  services: ServiceRequest[]
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  api: RhnApi
  busy: boolean
  onCancelMedication: (value: MedicationRequest) => void
  onCancelService: (value: ServiceRequest) => void
  onPrint: (value: Prescription) => void
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
  const isMedication = entryType === 'MEDICATION' || entryType === 'HERBAL'
  const currentMedication = medicationEntry.medication?.raw
  const dispensableOptions = currentMedication
    ? resolveDispensableOptions(currentMedication, encounter.organizationId) : []
  const selectedProduct = dispensableOptions.find((value) => value.key === medicationEntry.dispenseOptionKey)
    ?? dispensableOptions[0]
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const allergyReviewRecorded = allergies.some((item) => item.assertionType === 'NO_KNOWN_ALLERGY'
    || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY') || drugAllergies.length > 0
  const matchedAllergies = currentMedication ? drugAllergies.filter((item) => item.substanceCode
    && item.substanceCode.toLowerCase() === currentMedication.code.toLowerCase()) : []
  const requiresSafetyReview = Boolean(currentMedication && (!allergyReviewRecorded || drugAllergies.length > 0
    || currentMedication.skinTestRequired || currentMedication.antimicrobial))
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
    const defaultDispenseOption = value
      ? resolveDispensableOptions(value, encounter.organizationId)[0] : undefined
    setMedicationEntry((current) => ({
      ...current, medication: option, doseValue: value?.defaultDose ?? '',
      doseUnit: value?.defaultDoseUnit ?? value?.preparationUnit ?? '',
      routeCode: entryType === 'HERBAL' ? 'PO' : value?.defaultRoute ?? '',
      frequencyCode: value?.defaultFrequency ?? (entryType === 'HERBAL' ? 'BID' : ''),
      dispenseOptionKey: defaultDispenseOption?.key ?? '', instruction: '', safetyReviewed: false,
      allergyOverrideReason: '',
    }))
    setValidationError('')
    if (option) focusControl('doctor-unified-dose')
  }

  function updateMedication<K extends keyof MedicationEntry>(field: K, value: MedicationEntry[K]) {
    setMedicationEntry((current) => ({ ...current, [field]: value }))
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
    if (requiresSafetyReview && !medicationEntry.safetyReviewed) { setValidationError('请完成用药安全核对'); return }
    if (matchedAllergies.length > 0 && !medicationEntry.allergyOverrideReason.trim()) {
      setValidationError('命中过敏原时必须填写继续开立理由'); return
    }
    const herbal = entryType === 'HERBAL'
    const doseValue = Number(medicationEntry.doseValue)
    setMedicationDrafts((current) => [...current, {
      id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: herbal ? 'herbal' : 'regular',
      categoryCode: medication.sdMedicationType, medicationName: medication.name, medicationCode: medication.code,
      preparationSpec: medication.preparationSpec, productName: product.product.name,
      request: {
        medicationId: medication.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
        doseValue, doseUnit: medicationEntry.doseUnit.trim(),
        routeCode: herbal ? 'PO' : medicationEntry.routeCode.trim(),
        frequencyCode: medicationEntry.frequencyCode.trim(),
        durationValue: herbal ? medicationEntry.herbalDoseCount
          : medicationEntry.durationValue === '' ? undefined : Number(medicationEntry.durationValue),
        durationUnit: herbal ? '剂' : medicationEntry.durationValue === '' ? undefined : '天',
        quantity: herbal ? doseValue * medicationEntry.herbalDoseCount : Number(medicationEntry.quantity),
        quantityUnit: product.unitCode, substitutionAllowed: true, selfProvided: false,
        medicationInstruction: herbal
          ? [medicationEntry.herbalMethod, medicationEntry.instruction.trim()].filter(Boolean).join('；')
          : medicationEntry.instruction.trim(),
        allergyReviewConfirmed: medicationEntry.safetyReviewed || allergyReviewRecorded,
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

  return <div className="doctor-unified-orders">
    <div className="doctor-unified-order-list" role="table" aria-label="本次医嘱连续录入列表">
      <div className="doctor-unified-order-head" role="row">
        <span>类型</span><span>项目</span><span>医嘱内容</span><span>数量</span><span>状态</span><span>操作</span>
      </div>
      {savedEntries.map((entry) => {
        if (entry.kind === 'service') return <ServiceReadRow key={`service-${entry.value.id}`} value={entry.value}
          busy={busy} onCancel={() => onCancelService(entry.value)} />
        const prescription = prescriptions.find((value) => value.id === entry.value.prescriptionId)
        const firstLine = prescription?.medicationRequests.find((value) => value.status === 'ACTIVE')?.id === entry.value.id
        return <MedicationReadRow key={`medication-${entry.value.id}`} value={entry.value} busy={busy}
          skinTest={skinTestByRequest.get(entry.value.id)}
          onCancel={() => onCancelMedication(entry.value)}
          onPrint={prescription && firstLine && canPrintPrescription(prescription) ? () => onPrint(prescription) : undefined} />
      })}
      {draftEntries.map((entry) => entry.kind === 'service'
        ? <ServiceDraftRow key={`draft-service-${entry.value.id}`} value={entry.value}
            onRemove={() => setServiceDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />
        : <MedicationDraftRow key={`draft-medication-${entry.value.id}`} value={entry.value}
            onRemove={() => setMedicationDrafts((current) => current.filter((value) => value.id !== entry.value.id))} />)}
      <div className={`doctor-unified-order-entry is-${entryType.toLowerCase()}`} role="row">
        <select aria-label="医嘱类型" value={entryType} onChange={(event) => changeType(event.target.value as OrderEntryType)}>
          <option value="MEDICATION">西药/中成药</option><option value="HERBAL">草药</option>
          <option value="LABORATORY">检验</option><option value="EXAMINATION">检查</option>
          <option value="TREATMENT">治疗</option>
        </select>
        {isMedication
          ? <ClinicalResourceSearch<MedicationKnowledge> id={`doctor-unified-${entryType}-resource`} api={api}
              resource="medication" organizationId={encounter.organizationId} value={medicationEntry.medication}
              filterResult={(item) => entryType === 'HERBAL' ? item.sdMedicationType === 'HERBAL'
                : ['WESTERN', 'CHINESE_PATENT'].includes(item.sdMedicationType)}
              placeholder={entryType === 'HERBAL' ? '搜索草药' : '搜索药品'} onChange={selectMedication} />
          : <ClinicalResourceSearch<ServiceCatalogItem> id={`doctor-unified-${entryType}-resource`} api={api}
              resource="service" organizationId={encounter.organizationId} value={service}
              filterResult={(item) => item.sdServiceType === entryType}
              placeholder={`搜索${orderTypeLabel(entryType)}项目`} onChange={(value) => {
                setService(value); setValidationError(''); if (value) focusControl('doctor-unified-service-note')
              }} />}
        <div className="doctor-unified-order-fields">
          {entryType === 'MEDICATION' && <>
            <input id="doctor-unified-dose" aria-label="单次剂量" type="number" min="0" step="0.01"
              value={medicationEntry.doseValue} placeholder="剂量"
              onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-dose-unit')} />
            <input id="doctor-unified-dose-unit" aria-label="剂量单位" value={medicationEntry.doseUnit} placeholder="单位"
              onChange={(event) => updateMedication('doseUnit', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-route')} />
            <input id="doctor-unified-route" aria-label="给药途径" value={medicationEntry.routeCode} placeholder="途径"
              onChange={(event) => updateMedication('routeCode', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-frequency')} />
            <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
              onChange={(value) => { updateMedication('frequencyCode', value); focusControl('doctor-unified-duration') }}
              showValue loading={frequencies.isPending}
              placeholder="频次" options={frequencyOptions} />
            <input id="doctor-unified-duration" aria-label="疗程" type="number" min="1"
              value={medicationEntry.durationValue} placeholder="天"
              onChange={(event) => updateMedication('durationValue', numberValue(event.target.value))}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-instruction')} />
            <input id="doctor-unified-instruction" aria-label="用药嘱托" value={medicationEntry.instruction}
              placeholder="用药嘱托" onChange={(event) => updateMedication('instruction', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />
          </>}
          {entryType === 'HERBAL' && <>
            <input id="doctor-unified-dose" aria-label="每付剂量" type="number" min="0" step="0.01"
              value={medicationEntry.doseValue} placeholder="每付量"
              onChange={(event) => updateMedication('doseValue', numberValue(event.target.value))}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-dose-unit')} />
            <input id="doctor-unified-dose-unit" aria-label="剂量单位" value={medicationEntry.doseUnit} placeholder="单位"
              onChange={(event) => updateMedication('doseUnit', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-count')} />
            <input id="doctor-unified-herbal-count" aria-label="剂数" type="number" min="1"
              value={medicationEntry.herbalDoseCount}
              onChange={(event) => updateMedication('herbalDoseCount', Math.max(1, Number(event.target.value)))}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-herbal-method')} />
            <input id="doctor-unified-herbal-method" aria-label="服法" value={medicationEntry.herbalMethod} placeholder="服法"
              onChange={(event) => updateMedication('herbalMethod', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-frequency')} />
            <Select id="doctor-unified-frequency" aria-label="频次" value={medicationEntry.frequencyCode}
              onChange={(value) => { updateMedication('frequencyCode', value); focusControl('doctor-unified-instruction') }}
              showValue loading={frequencies.isPending}
              placeholder="频次" options={frequencyOptions} />
            <input id="doctor-unified-instruction" aria-label="特殊煎法" value={medicationEntry.instruction}
              placeholder="特殊煎法" onChange={(event) => updateMedication('instruction', event.target.value)}
              onKeyDown={(event) => continueOnEnter(event)} />
          </>}
          {!isMedication && <input id="doctor-unified-service-note" className="doctor-unified-service-note" aria-label="临床说明"
            value={serviceDescription} placeholder={entryType === 'LABORATORY' ? '标本或临床说明' : '部位或临床说明'}
            onChange={(event) => setServiceDescription(event.target.value)}
            onKeyDown={(event) => continueOnEnter(event, 'doctor-unified-quantity')} />}
        </div>
        <input id="doctor-unified-quantity" aria-label="医嘱数量" type="number" min="0.01" step="0.01"
          value={entryType === 'HERBAL'
            ? medicationEntry.doseValue === '' ? '' : Number(medicationEntry.doseValue) * medicationEntry.herbalDoseCount
            : isMedication ? medicationEntry.quantity : serviceQuantity}
          disabled={entryType === 'HERBAL'}
          title={entryType === 'HERBAL' ? '按每付剂量和剂数自动计算' : undefined}
          onChange={(event) => isMedication
            ? updateMedication('quantity', numberValue(event.target.value)) : setServiceQuantity(Number(event.target.value))}
          onKeyDown={(event) => continueOnEnter(event)} />
        <StatusBadge tone="warning">编辑中</StatusBadge>
        <Button size="sm" onClick={addCurrentEntry}>加入</Button>
      </div>
      {(validationError || frequencies.error) && <Alert className="doctor-unified-order-alert">
        {validationError || '频次数据加载失败'}</Alert>}
      {currentMedication && <div className={`doctor-unified-order-safety ${requiresSafetyReview ? 'is-warning' : ''}`}>
        <span>{selectedProduct ? selectedProduct.product.name : '当前机构无可发药产品或有效价格'}</span>
        {selectedProduct && <label className="doctor-dispense-unit-inline">发药单位
          <Select aria-label="发药单位与计价" value={selectedProduct.key}
            onChange={(value) => updateMedication('dispenseOptionKey', value)} clearable={false} showValue
            options={dispensableOptions.map((value) => ({
              value: value.key, label: value.label, secondaryText: value.secondaryText,
              searchKeywords: [value.unitCode, value.unitName],
            }))} /></label>}
        {drugAllergies.length > 0 && <span>药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}</span>}
        {matchedAllergies.length > 0 && <input aria-label="继续开立理由" value={medicationEntry.allergyOverrideReason}
          placeholder="继续开立理由" onChange={(event) => updateMedication('allergyOverrideReason', event.target.value)} />}
        {requiresSafetyReview && <label><input type="checkbox" checked={medicationEntry.safetyReviewed}
          onChange={(event) => updateMedication('safetyReviewed', event.target.checked)} /> 已完成用药安全核对</label>}
      </div>}
    </div>
  </div>
}

function MedicationReadRow({ value, skinTest, busy, onCancel, onPrint }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; onCancel: () => void; onPrint?: () => void
}) {
  return <div className="doctor-unified-order-row" role="row">
    <span><OrderTypeBadge type={value.medicationType === 'HERBAL' ? 'HERBAL'
      : value.medicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'MEDICATION'} /></span>
    <span className="doctor-unified-order-name"><strong>{value.medicationName}</strong>
      <small>{value.preparationSpec || value.medicationCode}</small></span>
    <span className="doctor-unified-order-detail">{medicationDetail(value)}</span>
    <span>{value.quantity} {value.quantityUnit}</span>
    <span className="doctor-order-status-stack"><StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>
      {orderStatusLabel(value.status)}</StatusBadge>
      {value.skinTestRequired && <StatusBadge tone={skinTest?.status === 'NEGATIVE' ? 'success'
        : skinTest?.status === 'POSITIVE' ? 'danger' : 'warning'}>{doctorSkinTestLabel(skinTest?.status)}</StatusBadge>}</span>
    <span className="doctor-unified-order-actions">{onPrint && <Button size="sm" variant="text" onClick={onPrint}>打印</Button>}
      {value.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}</span>
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

function ServiceReadRow({ value, busy, onCancel }: { value: ServiceRequest; busy: boolean; onCancel: () => void }) {
  return <div className="doctor-unified-order-row" role="row">
    <span><OrderTypeBadge type={value.serviceType} /></span>
    <span className="doctor-unified-order-name"><strong>{value.itemName}</strong><small>{value.itemCode}</small></span>
    <span className="doctor-unified-order-detail">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    <span>{value.quantity} {value.unitCode}</span>
    <span><StatusBadge tone={value.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(value.status)}</StatusBadge></span>
    <span className="doctor-unified-order-actions">{value.status === 'ACTIVE'
      && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}</span>
  </div>
}

function MedicationDraftRow({ value, onRemove }: { value: MedicationPlanDraft; onRemove: () => void }) {
  return <div className="doctor-unified-order-row is-draft" role="row">
    <span><OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} /></span>
    <span className="doctor-unified-order-name"><strong>{value.medicationName}</strong>
      <small>{value.preparationSpec || value.medicationCode}</small></span>
    <span className="doctor-unified-order-detail">{medicationDraftDetail(value)}</span>
    <span>{value.request.quantity} {value.request.quantityUnit}</span>
    <span><StatusBadge tone="warning">待确认</StatusBadge></span>
    <span className="doctor-unified-order-actions"><Button size="sm" variant="text" onClick={onRemove}>移除</Button></span>
  </div>
}

function ServiceDraftRow({ value, onRemove }: { value: ServicePlanDraft; onRemove: () => void }) {
  return <div className="doctor-unified-order-row is-draft" role="row">
    <span><OrderTypeBadge type={value.serviceType || 'OTHER'} /></span>
    <span className="doctor-unified-order-name"><strong>{value.itemName}</strong><small>{value.itemCode}</small></span>
    <span className="doctor-unified-order-detail">{value.clinicalDescription || serviceTypeLabel(value.serviceType)}</span>
    <span>{value.quantity} {value.unitCode}</span>
    <span><StatusBadge tone="warning">待确认</StatusBadge></span>
    <span className="doctor-unified-order-actions"><Button size="sm" variant="text" onClick={onRemove}>移除</Button></span>
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
  return [value.doseValue && `${value.doseValue}${value.doseUnit || ''}`, value.routeCode, value.frequencyCode,
    value.durationValue && `${value.durationValue}${value.durationUnit || '天'}`, value.medicationInstruction]
    .filter(Boolean).join(' · ') || '—'
}

function medicationDraftDetail(value: MedicationPlanDraft) {
  const request = value.request
  return [request.doseValue && `${request.doseValue}${request.doseUnit || ''}`, request.routeCode,
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
