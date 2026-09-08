import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type {
  CreateMedicationRequestInput, MedicationRequest, Prescription,
} from '../../shared/api/encountersApi'
import type { ItemPackage, MedicationKnowledge, MedicationProduct } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { Encounter } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, Select, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'

type EditorMode = 'regular' | 'herbal'
type EditableField = 'doseValue' | 'doseUnit' | 'routeCode' | 'frequencyCode'
  | 'durationValue' | 'quantity' | 'instruction'

interface PrescriptionLineDraft {
  key: number
  medication?: ClinicalResourceOption<MedicationKnowledge>
  doseValue: number | ''
  doseUnit: string
  routeCode: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
  frequencyCode: string
  durationValue: number | ''
  quantity: number | ''
  dispenseOptionKey: string
  instruction: string
  safetyReviewed: boolean
  allergyOverrideReason: string
}

export interface MedicationPlanDraft {
  id: string
  sequence?: number
  editorMode: EditorMode
  categoryCode: string
  medicationName: string
  medicationCode: string
  preparationSpec?: string
  productName: string
  productSpec?: string
  manufacturerName?: string
  unitPrice?: number
  currencyCode?: string
  routeName?: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
  administrationGroupKey?: string
  stockSiteName?: string
  availablePackageQuantity?: number
  packageUnitName?: string
  request: Omit<CreateMedicationRequestInput, 'prescriptionId' | 'parentRequestId'>
}

const regularFields: EditableField[] = [
  'doseValue', 'doseUnit', 'routeCode', 'frequencyCode', 'durationValue', 'quantity', 'instruction',
]

export function PrescriptionListEditor({
  encounter, allergies, prescriptions, drafts, onDraftsChange, api, onRefresh, onPrint,
}: {
  encounter: Encounter
  allergies: AllergyIntolerance[]
  prescriptions: Prescription[]
  drafts: MedicationPlanDraft[]
  onDraftsChange: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  api: RhnApi
  onRefresh: () => Promise<unknown>
  onPrint: (value: Prescription) => void
}) {
  const frequencies = useQuery({
    queryKey: ['outpatient-order-frequencies', encounter.organizationId, encounter.departmentId],
    queryFn: () => api.masterData.activeOrderFrequencies(
      encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
    staleTime: 5 * 60 * 1000,
  })
  const frequencyOptions = (frequencies.data ?? []).map((frequency) => ({
    value: frequency.code, label: frequency.name,
    secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}`,
    searchKeywords: [frequency.code, frequency.shortName ?? ''],
  }))
  const routes = useQuery({
    queryKey: ['outpatient-medication-routes'],
    queryFn: () => api.masterData.activeMedicationRoutes('OUTPATIENT'),
    staleTime: 5 * 60 * 1000,
  })
  const routeOptions = (routes.data ?? []).map((route) => ({
    value: route.code, label: route.name, secondaryText: route.code,
    searchKeywords: [route.code, route.name],
  }))
  const cancelLine = useMutation({
    mutationFn: (value: MedicationRequest) => api.encounters.cancelMedicationRequest(
      encounter.id, value.id, value.revision, '医生站撤销'),
    onSuccess: onRefresh,
  })

  return <div className="doctor-prescription-list-editor">
    {(frequencies.error || routes.error || cancelLine.error) && <Alert className="doctor-order-error">
      {errorMessage(frequencies.error || routes.error || cancelLine.error)}</Alert>}
    <PrescriptionEditorSection mode="regular" encounter={encounter} allergies={allergies}
      prescriptions={prescriptions} drafts={drafts} onDraftsChange={onDraftsChange} api={api}
      frequencyOptions={frequencyOptions} frequencyLoading={frequencies.isPending}
      routes={routes.data ?? []} routeOptions={routeOptions} routeLoading={routes.isPending}
      cancelBusy={cancelLine.isPending} onCancel={(value) => cancelLine.mutate(value)} onPrint={onPrint} />
    <PrescriptionEditorSection mode="herbal" encounter={encounter} allergies={allergies}
      prescriptions={prescriptions} drafts={drafts} onDraftsChange={onDraftsChange} api={api}
      frequencyOptions={frequencyOptions} frequencyLoading={frequencies.isPending}
      routes={routes.data ?? []} routeOptions={routeOptions} routeLoading={routes.isPending}
      cancelBusy={cancelLine.isPending} onCancel={(value) => cancelLine.mutate(value)} onPrint={onPrint} />
  </div>
}

function PrescriptionEditorSection({
  mode, encounter, allergies, prescriptions, drafts, onDraftsChange, api,
  frequencyOptions, frequencyLoading, routes, routeOptions, routeLoading, cancelBusy, onCancel, onPrint,
}: {
  mode: EditorMode
  encounter: Encounter
  allergies: AllergyIntolerance[]
  prescriptions: Prescription[]
  drafts: MedicationPlanDraft[]
  onDraftsChange: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  api: RhnApi
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencyLoading: boolean
  routes: import('../../shared/api/masterDataApi').MedicationRoute[]
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routeLoading: boolean
  cancelBusy: boolean
  onCancel: (value: MedicationRequest) => void
  onPrint: (value: Prescription) => void
}) {
  const sequence = useRef(1)
  const [line, setLine] = useState(() => emptyLine(sequence.current++))
  const [herbalDoseCount, setHerbalDoseCount] = useState(7)
  const [herbalMethod, setHerbalMethod] = useState('水煎服')
  const [herbalFrequency, setHerbalFrequency] = useState('BID')
  const [validationError, setValidationError] = useState('')
  const currentMedication = line.medication?.raw
  const dispensableOptions = currentMedication
    ? resolveDispensableOptions(currentMedication, encounter.organizationId) : []
  const selectedProduct = dispensableOptions.find((value) => value.key === line.dispenseOptionKey)
    ?? dispensableOptions[0]
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const allergyReviewRecorded = allergies.some((item) => item.assertionType === 'NO_KNOWN_ALLERGY'
    || item.assertionType === 'NO_KNOWN_DRUG_ALLERGY') || drugAllergies.length > 0
  const matchedAllergies = currentMedication ? drugAllergies.filter((item) => item.substanceCode
    && item.substanceCode.toLowerCase() === currentMedication.code.toLowerCase()) : []
  const requiresSafetyReview = Boolean(currentMedication && (!allergyReviewRecorded || drugAllergies.length > 0
    || currentMedication.skinTestRequired || currentMedication.antimicrobial))
  const visibleCategories = mode === 'herbal' ? ['HERBAL'] : ['WESTERN', 'CHINESE_PATENT']
  const visiblePrescriptions = prescriptions.filter((item) => visibleCategories.includes(item.categoryCode))
  const visibleLines = visiblePrescriptions.flatMap((item) => item.medicationRequests
    .map((request) => ({ request, prescription: item })))
    .sort((left, right) => left.request.authoredAt.localeCompare(right.request.authoredAt))
  const visibleDrafts = drafts.filter((item) => item.editorMode === mode)
  const administrationGroups = administrationGroupLabels(visibleLines.map((item) => item.request))
  const draftGroups = draftAdministrationGroupLabels(visibleDrafts)

  function selectMedication(option?: ClinicalResourceOption<MedicationKnowledge>) {
    const medication = option?.raw
    const defaultDispenseOption = medication
      ? resolveDispensableOptions(medication, encounter.organizationId)[0] : undefined
    setValidationError('')
    setLine((current) => ({
      ...current,
      medication: option,
      doseValue: medication?.defaultDose ?? '',
      doseUnit: medication?.defaultDoseUnit ?? medication?.preparationUnit ?? '',
      routeCode: medication?.defaultRoute ?? (mode === 'herbal' ? 'ORAL' : ''),
      routeExecutionType: routes.find((value) => value.code === medication?.defaultRoute)?.executionType,
      frequencyCode: medication?.defaultFrequency ?? (mode === 'herbal' ? herbalFrequency : ''),
      quantity: mode === 'herbal' ? 1 : current.quantity,
      dispenseOptionKey: defaultDispenseOption?.key ?? '',
      instruction: mode === 'herbal' ? '' : '遵医嘱使用',
      safetyReviewed: false,
      allergyOverrideReason: '',
    }))
    if (option) focusField(mode, 'doseValue')
  }

  function update<K extends keyof PrescriptionLineDraft>(field: K, value: PrescriptionLineDraft[K]) {
    setValidationError('')
    setLine((current) => ({ ...current, [field]: value }))
  }

  function addLine() {
    const medication = line.medication?.raw
    if (!medication) { setValidationError('请先选择药品'); return }
    const product = resolveDispensableOptions(medication, encounter.organizationId)
      .find((value) => value.key === line.dispenseOptionKey)
      ?? resolveDispensableOptions(medication, encounter.organizationId)[0]
    if (!product) { setValidationError('所选药品尚未配置当前机构可发药的产品、包装或有效价格'); return }
    if (!isLineComplete(line, mode)) { setValidationError('请完整填写当前医嘱行'); return }
    if (mode === 'herbal' && (!herbalMethod.trim() || !herbalFrequency.trim())) {
      setValidationError('请填写草药服法和频次'); return
    }
    if (requiresSafetyReview && !line.safetyReviewed) { setValidationError('请先完成用药安全核对'); return }
    if (matchedAllergies.length > 0 && !line.allergyOverrideReason.trim()) {
      setValidationError('命中过敏原时必须填写继续开立理由'); return
    }
    const categoryCode = medication.sdMedicationType
    const doseValue = Number(line.doseValue)
    const quantity = mode === 'herbal' ? doseValue * herbalDoseCount : Number(line.quantity)
    const instruction = mode === 'herbal'
      ? [herbalMethod, line.instruction.trim()].filter(Boolean).join('；') : line.instruction.trim()
    onDraftsChange((current) => [...current, {
      id: globalThis.crypto.randomUUID(),
      editorMode: mode,
      categoryCode,
      medicationName: medication.name,
      medicationCode: medication.code,
      preparationSpec: medication.preparationSpec,
      productName: product.product.name,
      routeName: mode === 'herbal' ? '口服' : routes.find((value) => value.code === line.routeCode)?.name,
      routeExecutionType: mode === 'herbal' ? 'NONE' : line.routeExecutionType,
      request: {
        medicationId: medication.id,
        catalogItemId: product.product.id,
        packageId: product.itemPackage?.id,
        doseValue,
        doseUnit: line.doseUnit.trim(),
        routeCode: mode === 'herbal' ? 'ORAL' : line.routeCode.trim(),
        frequencyCode: mode === 'herbal' ? herbalFrequency.trim() : line.frequencyCode.trim(),
        durationValue: mode === 'herbal' ? herbalDoseCount
          : line.durationValue === '' ? undefined : Number(line.durationValue),
        durationUnit: mode === 'herbal' ? '剂' : line.durationValue === '' ? undefined : '天',
        quantity,
        quantityUnit: product.unitCode,
        substitutionAllowed: true,
        selfProvided: false,
        medicationInstruction: instruction,
        allergyReviewConfirmed: line.safetyReviewed || allergyReviewRecorded,
        allergyOverrideReason: line.allergyOverrideReason.trim() || undefined,
        priceType: product.priceType,
        pricingRequired: true,
        reason: categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊处方',
      },
    }])
    setLine(emptyLine(sequence.current++))
    setValidationError('')
    focusMedication(mode)
  }

  function nextOnEnter(event: KeyboardEvent<HTMLInputElement>, field: EditableField) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const fields = mode === 'herbal' ? (['doseValue', 'doseUnit', 'instruction'] as EditableField[]) : regularFields
    const next = fields[fields.indexOf(field) + 1]
    if (next) focusField(mode, next)
    else addLine()
  }

  return <section className="doctor-prescription-section" aria-labelledby={`doctor-${mode}-prescription-title`}>
    <header>
      <div><strong id={`doctor-${mode}-prescription-title`}>
        {mode === 'regular' ? '西药 / 中成药' : '草药处方'}</strong></div>
      <StatusBadge tone={visibleDrafts.length ? 'warning' : 'neutral'}>{visibleDrafts.length} 条待确认</StatusBadge>
    </header>
    {visiblePrescriptions.length > 0 && <div className="doctor-prescription-splits">
      {visiblePrescriptions.map((value) => <span key={value.id}>
          <strong>{prescriptionTypeLabel(value.categoryCode)}</strong>{value.prescriptionNo}
          <StatusBadge tone={value.status === 'DRAFT' ? 'warning' : value.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {statusLabel(value.status)}</StatusBadge>
          {canPrintPrescription(value) && <Button size="sm" variant="text"
            onClick={() => onPrint(value)}>打印</Button>}
        </span>)}
    </div>}
    {mode === 'herbal' && <div className="doctor-herbal-summary">
      <label>剂数<input type="number" min="1" value={herbalDoseCount}
        onChange={(event) => setHerbalDoseCount(Math.max(1, Number(event.target.value)))} /></label>
      <label>服法<input value={herbalMethod} onChange={(event) => setHerbalMethod(event.target.value)} /></label>
      <label>频次<Select value={herbalFrequency} onChange={setHerbalFrequency} showValue
        loading={frequencyLoading} options={frequencyOptions} /></label>
    </div>}
    {validationError && <Alert>{validationError}</Alert>}
    <div className={`doctor-prescription-grid ${mode === 'herbal' ? 'is-herbal' : ''}`} role="table"
      aria-label={mode === 'herbal' ? '草药处方列表录入' : '西药和中成药处方列表录入'}>
      <div className="doctor-prescription-grid__head" role="row">
        {mode === 'regular' ? <>
          <span>组</span><span>药品</span><span>单次剂量</span><span>单位</span><span>途径</span><span>频次</span>
          <span>疗程</span><span>发药量</span><span>用药嘱托</span><span>操作</span>
        </> : <>
          <span>序</span><span>草药饮片</span><span>每付剂量</span><span>单位</span><span>特殊煎法 / 脚注</span><span>总量</span><span>操作</span>
        </>}
      </div>
      {visibleLines.map(({ request }, index) => mode === 'regular'
        ? <RegularSavedRow key={request.id} value={request} groupLabel={administrationGroups.get(request.id)}
          busy={cancelBusy} onCancel={() => onCancel(request)} />
        : <HerbalSavedRow key={request.id} value={request} index={index + 1} busy={cancelBusy}
          onCancel={() => onCancel(request)} />)}
      {visibleDrafts.map((draft, index) => mode === 'regular'
        ? <RegularPlanRow key={draft.id} value={draft} groupLabel={draftGroups.get(draft.id)}
          onRemove={() => onDraftsChange((current) => current.filter((item) => item.id !== draft.id))} />
        : <HerbalPlanRow key={draft.id} value={draft} index={visibleLines.length + index + 1}
          onRemove={() => onDraftsChange((current) => current.filter((item) => item.id !== draft.id))} />)}
      <div className="doctor-prescription-grid__entry" role="row" key={line.key}>
        <span className="doctor-prescription-group-cell">{mode === 'regular' ? (isInfusionRoute(line.routeCode, line.routeExecutionType) ? 'IV' : '—')
          : visibleLines.length + visibleDrafts.length + 1}</span>
        <ClinicalResourceSearch<MedicationKnowledge> id={`doctor-${mode}-medication-search`} api={api}
          resource="medication" organizationId={encounter.organizationId} value={line.medication}
          filterResult={(item) => mode === 'herbal' ? item.sdMedicationType === 'HERBAL'
            : ['WESTERN', 'CHINESE_PATENT'].includes(item.sdMedicationType)}
          placeholder={mode === 'herbal' ? '搜索草药' : '搜索药品'} onChange={selectMedication}
          aria-label={mode === 'herbal' ? '搜索草药' : '搜索西药或中成药'} />
        <input data-rx-mode={mode} data-rx-field="doseValue" aria-label="单次剂量" type="number" min="0" step="0.01"
          value={line.doseValue} onChange={(event) => update('doseValue', numberValue(event.target.value))}
          onKeyDown={(event) => nextOnEnter(event, 'doseValue')} />
        <input data-rx-mode={mode} data-rx-field="doseUnit" aria-label="剂量单位" value={line.doseUnit}
          onChange={(event) => update('doseUnit', event.target.value)} onKeyDown={(event) => nextOnEnter(event, 'doseUnit')} />
        {mode === 'regular' ? <>
          <Select aria-label="给药途径" value={line.routeCode} showValue loading={routeLoading}
            placeholder="给药途径" options={routeOptions} onChange={(value) => {
              setValidationError('')
              setLine((current) => ({ ...current, routeCode: value,
                routeExecutionType: routes.find((route) => route.code === value)?.executionType }))
              focusField(mode, 'frequencyCode')
            }} />
          <Select id={`doctor-${mode}-frequency`} aria-label="频次" value={line.frequencyCode} onChange={(value) => {
            update('frequencyCode', value)
            focusField(mode, 'durationValue')
          }} showValue loading={frequencyLoading} placeholder="频次" options={frequencyOptions} />
          <input data-rx-mode={mode} data-rx-field="durationValue" aria-label="疗程天数" type="number" min="1"
            value={line.durationValue} placeholder="天" onChange={(event) => update('durationValue', numberValue(event.target.value))}
            onKeyDown={(event) => nextOnEnter(event, 'durationValue')} />
          <input data-rx-mode={mode} data-rx-field="quantity" aria-label="发药数量" type="number" min="0" step="0.01"
            value={line.quantity} onChange={(event) => update('quantity', numberValue(event.target.value))}
            onKeyDown={(event) => nextOnEnter(event, 'quantity')} />
        </> : null}
        <input data-rx-mode={mode} data-rx-field="instruction"
          aria-label={mode === 'herbal' ? '特殊煎法或脚注' : '用药嘱托'} value={line.instruction}
          placeholder={mode === 'herbal' ? '如先煎、后下' : '用药嘱托'}
          onChange={(event) => update('instruction', event.target.value)}
          onKeyDown={(event) => nextOnEnter(event, 'instruction')} />
        {mode === 'herbal' && <span className="doctor-herbal-total">
          {line.doseValue === '' ? '—' : Number(line.doseValue) * herbalDoseCount} {line.doseUnit}</span>}
        <Button size="sm" disabled={!isLineComplete(line, mode) || !selectedProduct
          || (mode === 'herbal' && (!herbalMethod.trim() || !herbalFrequency.trim()))
          || (requiresSafetyReview && !line.safetyReviewed)
          || (matchedAllergies.length > 0 && !line.allergyOverrideReason.trim())}
          onClick={addLine}>加入</Button>
      </div>
    </div>
    {currentMedication && <div className={`doctor-medication-safety ${requiresSafetyReview ? 'is-warning' : 'is-clear'}`}>
      <strong>{requiresSafetyReview ? '当前行需完成用药安全核对' : '当前行未命中高风险提示'}</strong>
      {!selectedProduct && <p>当前机构未配置可发药产品、销售包装或有效价格，暂不能加入方案。</p>}
      {selectedProduct && <><p>发药产品：{selectedProduct.product.name}</p>
        <div className="doctor-dispense-unit-picker"><span>发药单位与计价</span>
          <Select aria-label="发药单位与计价" value={selectedProduct.key}
            onChange={(value) => update('dispenseOptionKey', value)} clearable={false} showValue
            options={dispensableOptions.map((value) => ({
              value: value.key, label: value.label, secondaryText: value.secondaryText,
              searchKeywords: [value.unitCode, value.unitName],
            }))} />
          <small>{dispenseEstimate(selectedProduct, mode === 'herbal'
            ? line.doseValue === '' ? 0 : Number(line.doseValue) * herbalDoseCount
            : line.quantity === '' ? 0 : Number(line.quantity))}</small></div></>}
      {!allergyReviewRecorded && <p>患者过敏状态尚未确认，请先核对后继续。</p>}
      {drugAllergies.length > 0 && <p>患者药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
      {currentMedication.skinTestRequired && <p>该药品标记为需皮试，请确认皮试流程。</p>}
      {currentMedication.antimicrobial && <p>抗菌药等级：{currentMedication.sdAntimicrobialLevelText || '未配置等级'}</p>}
      {matchedAllergies.length > 0 && <label>继续开立理由<input value={line.allergyOverrideReason}
        onChange={(event) => update('allergyOverrideReason', event.target.value)} /></label>}
      {requiresSafetyReview && <label><input type="checkbox" checked={line.safetyReviewed}
        onChange={(event) => update('safetyReviewed', event.target.checked)} /> 已核对患者过敏及药品风险</label>}
    </div>}
  </section>
}

function RegularSavedRow({ value, groupLabel, busy, onCancel }: {
  value: MedicationRequest; groupLabel?: string; busy: boolean; onCancel: () => void
}) {
  return <div className={`doctor-prescription-grid__saved ${groupLabel ? 'is-grouped' : ''}`} role="row">
    <span className="doctor-prescription-group-cell">{groupLabel || '—'}</span>
    <span className="doctor-prescription-drug"><strong>{value.medicationName}</strong><small>{value.preparationSpec || value.medicationCode}</small></span>
    <span>{value.doseValue ?? '—'}</span><span>{value.doseUnit || '—'}</span>
    <span>{value.routeName || value.routeCode || '—'}</span>
    <span>{value.frequencyCode || '—'}</span><span>{value.durationValue ? `${value.durationValue}${value.durationUnit || '天'}` : '—'}</span>
    <span>{value.quantity} {value.quantityUnit}</span><span title={value.medicationInstruction}>{value.medicationInstruction || '—'}</span>
    <span className="doctor-prescription-row-action"><StatusBadge tone={value.status === 'DRAFT' ? 'warning'
      : value.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusLabel(value.status)}</StatusBadge>
      {value.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}</span>
  </div>
}

function HerbalSavedRow({ value, index, busy, onCancel }: {
  value: MedicationRequest; index: number; busy: boolean; onCancel: () => void
}) {
  const instruction = value.medicationInstruction?.split('；').slice(1).join('；') || '—'
  return <div className="doctor-prescription-grid__saved" role="row">
    <span className="doctor-prescription-group-cell">{index}</span>
    <span className="doctor-prescription-drug"><strong>{value.medicationName}</strong><small>{value.preparationSpec || value.medicationCode}</small></span>
    <span>{value.doseValue ?? '—'}</span><span>{value.doseUnit || '—'}</span><span>{instruction}</span>
    <span>{value.quantity} {value.quantityUnit}</span>
    <span className="doctor-prescription-row-action"><StatusBadge tone={value.status === 'DRAFT' ? 'warning'
      : value.status === 'ACTIVE' ? 'success' : 'neutral'}>{statusLabel(value.status)}</StatusBadge>
      {value.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={busy} onClick={onCancel}>撤销</Button>}</span>
  </div>
}

function RegularPlanRow({ value, groupLabel, onRemove }: {
  value: MedicationPlanDraft; groupLabel?: string; onRemove: () => void
}) {
  const request = value.request
  return <div className={`doctor-prescription-grid__saved is-plan-draft ${groupLabel ? 'is-grouped' : ''}`} role="row">
    <span className="doctor-prescription-group-cell">{groupLabel || '—'}</span>
    <span className="doctor-prescription-drug"><strong>{value.medicationName}</strong>
      <small>{value.preparationSpec || value.medicationCode}</small></span>
    <span>{request.doseValue ?? '—'}</span><span>{request.doseUnit || '—'}</span>
    <span>{value.routeName || request.routeCode || '—'}</span>
    <span>{request.frequencyCode || '—'}</span><span>{request.durationValue ? `${request.durationValue}${request.durationUnit || '天'}` : '—'}</span>
    <span>{request.quantity} {request.quantityUnit}</span><span title={request.medicationInstruction}>{request.medicationInstruction || '—'}</span>
    <span className="doctor-prescription-row-action"><StatusBadge tone="warning">待确认</StatusBadge>
      <Button size="sm" variant="text" onClick={onRemove}>移除</Button></span>
  </div>
}

function HerbalPlanRow({ value, index, onRemove }: {
  value: MedicationPlanDraft; index: number; onRemove: () => void
}) {
  const request = value.request
  const instruction = request.medicationInstruction?.split('；').slice(1).join('；') || '—'
  return <div className="doctor-prescription-grid__saved is-plan-draft" role="row">
    <span className="doctor-prescription-group-cell">{index}</span>
    <span className="doctor-prescription-drug"><strong>{value.medicationName}</strong>
      <small>{value.preparationSpec || value.medicationCode}</small></span>
    <span>{request.doseValue ?? '—'}</span><span>{request.doseUnit || '—'}</span><span>{instruction}</span>
    <span>{request.quantity} {request.quantityUnit}</span>
    <span className="doctor-prescription-row-action"><StatusBadge tone="warning">待确认</StatusBadge>
      <Button size="sm" variant="text" onClick={onRemove}>移除</Button></span>
  </div>
}

function emptyLine(key: number): PrescriptionLineDraft {
  return {
    key, doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
    dispenseOptionKey: '', instruction: '', safetyReviewed: false, allergyOverrideReason: '',
  }
}

function numberValue(value: string): number | '' {
  return value === '' ? '' : Number(value)
}

function isLineComplete(value: PrescriptionLineDraft, mode: EditorMode) {
  if (!value.medication || value.doseValue === '' || Number(value.doseValue) <= 0 || !value.doseUnit.trim()) return false
  if (mode === 'herbal') return true
  return Boolean(value.routeCode.trim() && value.frequencyCode.trim() && value.quantity !== ''
    && Number(value.quantity) > 0)
}

function focusField(mode: EditorMode, field: EditableField) {
  window.requestAnimationFrame(() => {
    if (field === 'frequencyCode') {
      document.getElementById(`doctor-${mode}-frequency`)?.focus()
      return
    }
    document.querySelector<HTMLInputElement>(`[data-rx-mode="${mode}"][data-rx-field="${field}"]`)?.focus()
  })
}

function focusMedication(mode: EditorMode) {
  window.requestAnimationFrame(() => document.getElementById(`doctor-${mode}-medication-search`)?.focus())
}

export function isInfusionRoute(_route: string | undefined, executionType?: string) {
  return executionType === 'INFUSION'
}

function administrationGroupLabels(values: MedicationRequest[]) {
  const labels = new Map<string, string>()
  const rootLabels = new Map<string, string>()
  let sequence = 0
  values.filter((value) => value.status !== 'CANCELLED'
    && isInfusionRoute(value.routeCode, value.routeExecutionType)).forEach((value) => {
    const rootId = value.parentRequestId || value.id
    let label = rootLabels.get(rootId)
    if (!label) {
      label = `IV-${String(++sequence).padStart(2, '0')}`
      rootLabels.set(rootId, label)
    }
    labels.set(value.id, label)
  })
  return labels
}

function draftAdministrationGroupLabels(values: MedicationPlanDraft[]) {
  const labels = new Map<string, string>()
  let sequence = 0
  let previousKey = ''
  let currentLabel = ''
  values.forEach((value) => {
    if (!isInfusionRoute(value.request.routeCode, value.routeExecutionType)) { previousKey = ''; currentLabel = ''; return }
    const key = [value.request.routeCode?.trim().toUpperCase(), value.request.frequencyCode,
      value.request.durationValue ?? ''].join('|')
    if (key !== previousKey) currentLabel = `IV-${String(++sequence).padStart(2, '0')}`
    labels.set(value.id, currentLabel)
    previousKey = key
  })
  return labels
}

function prescriptionTypeLabel(category: string) {
  return ({ WESTERN: '西药方', CHINESE_PATENT: '中成药方', HERBAL: '草药方' } as Record<string, string>)[category]
    ?? '门诊方'
}

function statusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

export function canPrintPrescription(value: { status: string; medicationRequests: Array<{ status: string }> }) {
  return value.status === 'ACTIVE' && value.medicationRequests.length > 0
    && value.medicationRequests.every((item) => item.status === 'ACTIVE')
}

export interface DispensableProductOption {
  key: string
  product: MedicationProduct
  itemPackage?: ItemPackage
  unitCode: string
  unitName: string
  packageFactor: number
  priceType: string
  price: number
  currencyCode: string
  split: boolean
  label: string
  secondaryText: string
}

export function resolveDispensableOptions(
  medication: MedicationKnowledge, organizationId: string,
): DispensableProductOption[] {
  const today = new Date().toISOString().slice(0, 10)
  const result: DispensableProductOption[] = []
  for (const product of medication.products) {
    const adoption = product.organizationAdoption
    if (product.sdStatus !== 'ACTIVE' || !product.orderable || !product.chargeable
      || !adoption || adoption.organizationId !== organizationId || adoption.sdStatus !== 'ACTIVE'
      || !adoption.orderable || !adoption.chargeable || !adoption.dispensable) continue
    const prices = product.prices.filter((value) => value.sdStatus === 'ACTIVE'
      && value.sdPriceType === 'SALE' && (!value.organizationId || value.organizationId === organizationId)
      && value.validFrom <= today && (!value.validTo || value.validTo >= today))
      .sort((left, right) => Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId)))
    const packages = [...product.packages].filter((value) => value.sdStatus === 'ACTIVE'
      && value.validFrom <= today && (!value.validTo || value.validTo >= today))
      .sort((left, right) => Number(right.defaultDispense) - Number(left.defaultDispense)
        || Number(right.defaultSale) - Number(left.defaultSale))
    for (const itemPackage of packages) {
      const price = prices.find((value) => value.packageId === itemPackage.id)
      if (price) result.push({
        key: `${product.id}:${itemPackage.id}`, product, itemPackage,
        unitCode: itemPackage.unitCode, unitName: itemPackage.unitName,
        packageFactor: Number(itemPackage.quantityFactor), priceType: price.sdPriceType,
        price: Number(price.price), currencyCode: price.currencyCode, split: false,
        label: itemPackage.packageSpec || itemPackage.unitName,
        secondaryText: `${itemPackage.quantityFactor}${product.unitCode || medication.preparationUnit || '最小单位'} · ${unitPriceText(Number(price.price), price.currencyCode)}/${itemPackage.unitName}`,
      })
    }
    const basePrice = prices.find((value) => !value.packageId)
    const baseUnit = product.unitCode || medication.preparationUnit
    if (basePrice && baseUnit) result.push({
      key: `${product.id}:BASE`, product, unitCode: baseUnit, unitName: baseUnit,
      packageFactor: 1, priceType: basePrice.sdPriceType, price: Number(basePrice.price),
      currencyCode: basePrice.currencyCode, split: true, label: `${baseUnit}（拆零）`,
      secondaryText: `${unitPriceText(Number(basePrice.price), basePrice.currencyCode)}/${baseUnit} · 按最小单位计价`,
    })
  }
  return result
}

export function resolveDispensableProduct(medication: MedicationKnowledge, organizationId: string): {
  product: MedicationProduct; itemPackage: ItemPackage; priceType: string
} | undefined {
  const value = resolveDispensableOptions(medication, organizationId).find((option) => option.itemPackage)
  return value?.itemPackage ? { product: value.product, itemPackage: value.itemPackage, priceType: value.priceType } : undefined
}

function dispenseEstimate(value: DispensableProductOption, quantity: number) {
  const conversion = value.split ? '库存按最小单位直接扣减'
    : `1${value.unitName} = ${value.packageFactor}${value.product.unitCode || '最小单位'}`
  const amount = quantity > 0 ? ` · 预计 ${unitPriceText(quantity * value.price, value.currencyCode)}` : ''
  return `${conversion}${amount}`
}

function unitPriceText(value: number, currencyCode: string) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: currencyCode || 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value)
}
