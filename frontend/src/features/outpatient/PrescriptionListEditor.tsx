import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { MedicationRequest, Prescription } from '../../shared/api/encountersApi'
import type { MedicationKnowledge } from '../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { Encounter } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, StatusBadge, type ClinicalResourceOption,
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
  frequencyCode: string
  durationValue: number | ''
  quantity: number | ''
  instruction: string
  safetyReviewed: boolean
  allergyOverrideReason: string
}

const regularFields: EditableField[] = [
  'doseValue', 'doseUnit', 'routeCode', 'frequencyCode', 'durationValue', 'quantity', 'instruction',
]

export function PrescriptionListEditor({ encounter, allergies, prescriptions, api, onRefresh }: {
  encounter: Encounter
  allergies: AllergyIntolerance[]
  prescriptions: Prescription[]
  api: RhnApi
  onRefresh: () => Promise<unknown>
}) {
  const sequence = useRef(1)
  const [mode, setMode] = useState<EditorMode>('regular')
  const [regularLine, setRegularLine] = useState(() => emptyLine(sequence.current++))
  const [herbalLine, setHerbalLine] = useState(() => emptyLine(sequence.current++))
  const [herbalDoseCount, setHerbalDoseCount] = useState(7)
  const [herbalMethod, setHerbalMethod] = useState('水煎服')
  const [herbalFrequency, setHerbalFrequency] = useState('BID')
  const line = mode === 'regular' ? regularLine : herbalLine
  const setLine = mode === 'regular' ? setRegularLine : setHerbalLine
  const currentMedication = line.medication?.raw
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const matchedAllergies = currentMedication ? drugAllergies.filter((item) => item.substanceCode
    && item.substanceCode.toLowerCase() === currentMedication.code.toLowerCase()) : []
  const requiresSafetyReview = Boolean(currentMedication && (drugAllergies.length > 0
    || currentMedication.skinTestRequired || currentMedication.antimicrobial))

  const saveLine = useMutation({
    mutationFn: async ({ value, editorMode }: { value: PrescriptionLineDraft; editorMode: EditorMode }) => {
      const medication = value.medication?.raw
      if (!medication) throw new Error('请先选择药品')
      if (!isLineComplete(value, editorMode)) throw new Error('请完整填写当前医嘱行')
      if (editorMode === 'herbal' && (!herbalMethod.trim() || !herbalFrequency.trim())) {
        throw new Error('请填写草药服法和频次')
      }
      if (requiresSafetyReview && !value.safetyReviewed) throw new Error('请先完成用药安全核对')
      if (matchedAllergies.length > 0 && !value.allergyOverrideReason.trim()) {
        throw new Error('命中过敏原时必须填写继续开立理由')
      }
      const categoryCode = medication.sdMedicationType
      let draft = prescriptions.find((item) => item.status === 'DRAFT' && item.categoryCode === categoryCode)
      if (!draft) {
        draft = await api.encounters.createPrescription(encounter.id, categoryCode,
          categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊西药/中成药处方')
      }
      const doseValue = Number(value.doseValue)
      const quantity = editorMode === 'herbal' ? doseValue * herbalDoseCount : Number(value.quantity)
      const instruction = editorMode === 'herbal'
        ? [herbalMethod, value.instruction.trim()].filter(Boolean).join('；') : value.instruction.trim()
      const parentRequestId = editorMode === 'regular'
        ? resolveAdministrationParent(draft, value) : undefined
      return api.encounters.createMedicationRequest(encounter.id, {
        prescriptionId: draft.id,
        medicationId: medication.id,
        doseValue,
        doseUnit: value.doseUnit.trim(),
        routeCode: editorMode === 'herbal' ? 'PO' : value.routeCode.trim(),
        frequencyCode: editorMode === 'herbal' ? herbalFrequency.trim() : value.frequencyCode.trim(),
        parentRequestId,
        durationValue: editorMode === 'herbal' ? herbalDoseCount
          : value.durationValue === '' ? undefined : Number(value.durationValue),
        durationUnit: editorMode === 'herbal' ? '剂' : value.durationValue === '' ? undefined : '天',
        quantity,
        quantityUnit: medication.preparationUnit,
        substitutionAllowed: true,
        selfProvided: false,
        medicationInstruction: instruction,
        allergyReviewConfirmed: value.safetyReviewed || drugAllergies.length === 0,
        allergyOverrideReason: value.allergyOverrideReason.trim() || undefined,
        reason: categoryCode === 'HERBAL' ? '门诊草药处方' : '门诊处方',
      })
    },
    onSuccess: async (_, variables) => {
      if (variables.editorMode === 'regular') setRegularLine(emptyLine(sequence.current++))
      else setHerbalLine(emptyLine(sequence.current++))
      await onRefresh()
      focusMedication(variables.editorMode)
    },
  })
  const submit = useMutation({
    mutationFn: async (drafts: Prescription[]) => Promise.all(drafts.map((value) =>
      api.encounters.submitPrescription(encounter.id, value.id, value.revision))),
    onSuccess: onRefresh,
  })
  const cancelLine = useMutation({
    mutationFn: (value: MedicationRequest) => api.encounters.cancelMedicationRequest(
      encounter.id, value.id, value.revision, '医生站撤销'),
    onSuccess: onRefresh,
  })
  const visibleCategories = mode === 'herbal' ? ['HERBAL'] : ['WESTERN', 'CHINESE_PATENT']
  const visiblePrescriptions = prescriptions.filter((item) => visibleCategories.includes(item.categoryCode))
  const visibleLines = visiblePrescriptions.flatMap((item) => item.medicationRequests
    .map((request) => ({ request, prescription: item })))
    .sort((left, right) => left.request.authoredAt.localeCompare(right.request.authoredAt))
  const administrationGroups = administrationGroupLabels(visibleLines.map((item) => item.request))
  const drafts = visiblePrescriptions.filter((item) => item.status === 'DRAFT'
    && item.medicationRequests.some((request) => request.status === 'DRAFT'))
  const error = saveLine.error || submit.error || cancelLine.error

  function selectMedication(option?: ClinicalResourceOption<MedicationKnowledge>) {
    const medication = option?.raw
    setLine((current) => ({
      ...current,
      medication: option,
      doseValue: medication?.defaultDose ?? '',
      doseUnit: medication?.defaultDoseUnit ?? medication?.preparationUnit ?? '',
      routeCode: medication?.defaultRoute ?? (mode === 'herbal' ? 'PO' : ''),
      frequencyCode: medication?.defaultFrequency ?? (mode === 'herbal' ? herbalFrequency : ''),
      quantity: mode === 'herbal' ? 1 : current.quantity,
      instruction: mode === 'herbal' ? '' : '遵医嘱使用',
      safetyReviewed: false,
      allergyOverrideReason: '',
    }))
    if (option) focusField(mode, 'doseValue')
  }

  function update<K extends keyof PrescriptionLineDraft>(field: K, value: PrescriptionLineDraft[K]) {
    setLine((current) => ({ ...current, [field]: value }))
  }

  function nextOnEnter(event: KeyboardEvent<HTMLInputElement>, field: EditableField) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const fields = mode === 'herbal' ? (['doseValue', 'doseUnit', 'instruction'] as EditableField[]) : regularFields
    const next = fields[fields.indexOf(field) + 1]
    if (next) focusField(mode, next)
    else if (!saveLine.isPending) saveLine.mutate({ value: line, editorMode: mode })
  }

  return <div className="doctor-prescription-list-editor">
    <nav className="doctor-prescription-type-tabs" aria-label="处方录入方式">
      <button type="button" className={mode === 'regular' ? 'is-active' : ''}
        onClick={() => setMode('regular')}>西药 / 中成药</button>
      <button type="button" className={mode === 'herbal' ? 'is-active' : ''}
        onClick={() => setMode('herbal')}>草药处方</button>
      <span>{mode === 'regular' ? '按药品类型自动分方，输液连续医嘱自动组方' : '按剂数计算总量，独立生成草药处方'}</span>
    </nav>
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <div className="doctor-prescription-splits">
      {visiblePrescriptions.length === 0 ? <span>录入首条医嘱时自动建方</span>
        : visiblePrescriptions.map((value) => <span key={value.id}>
          <strong>{prescriptionTypeLabel(value.categoryCode)}</strong>{value.prescriptionNo}
          <StatusBadge tone={value.status === 'DRAFT' ? 'warning' : value.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {statusLabel(value.status)}</StatusBadge>
        </span>)}
    </div>
    {mode === 'herbal' && <div className="doctor-herbal-summary">
      <label>剂数<input type="number" min="1" value={herbalDoseCount}
        onChange={(event) => setHerbalDoseCount(Math.max(1, Number(event.target.value)))} /></label>
      <label>服法<input value={herbalMethod} onChange={(event) => setHerbalMethod(event.target.value)} /></label>
      <label>频次<input value={herbalFrequency} onChange={(event) => setHerbalFrequency(event.target.value)} /></label>
    </div>}
    <div className={`doctor-prescription-grid ${mode === 'herbal' ? 'is-herbal' : ''}`} role="table"
      aria-label={mode === 'herbal' ? '草药处方列表录入' : '西药和中成药处方列表录入'}>
      <div className="doctor-prescription-grid__head" role="row">
        {mode === 'regular' ? <>
          <span>组</span><span>药品</span><span>单次剂量</span><span>单位</span><span>途径</span><span>频次</span>
          <span>疗程</span><span>发药量</span><span>用药嘱托</span><span>状态</span>
        </> : <>
          <span>序</span><span>草药饮片</span><span>每付剂量</span><span>单位</span><span>特殊煎法 / 脚注</span><span>总量</span><span>状态</span>
        </>}
      </div>
      {visibleLines.map(({ request }, index) => mode === 'regular'
        ? <RegularSavedRow key={request.id} value={request} groupLabel={administrationGroups.get(request.id)}
          busy={cancelLine.isPending}
          onCancel={() => cancelLine.mutate(request)} />
        : <HerbalSavedRow key={request.id} value={request} index={index + 1} busy={cancelLine.isPending}
          onCancel={() => cancelLine.mutate(request)} />)}
      <div className="doctor-prescription-grid__entry" role="row" key={line.key}>
        <span className="doctor-prescription-group-cell">{mode === 'regular' ? (isInfusionRoute(line.routeCode) ? '自动' : '—')
          : visibleLines.length + 1}</span>
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
          <input data-rx-mode={mode} data-rx-field="routeCode" aria-label="给药途径" value={line.routeCode}
            placeholder="PO/IVGTT" onChange={(event) => update('routeCode', event.target.value)}
            onKeyDown={(event) => nextOnEnter(event, 'routeCode')} />
          <input data-rx-mode={mode} data-rx-field="frequencyCode" aria-label="频次" value={line.frequencyCode}
            placeholder="BID" onChange={(event) => update('frequencyCode', event.target.value)}
            onKeyDown={(event) => nextOnEnter(event, 'frequencyCode')} />
          <input data-rx-mode={mode} data-rx-field="durationValue" aria-label="疗程天数" type="number" min="1"
            value={line.durationValue} placeholder="天" onChange={(event) => update('durationValue', numberValue(event.target.value))}
            onKeyDown={(event) => nextOnEnter(event, 'durationValue')} />
          <input data-rx-mode={mode} data-rx-field="quantity" aria-label="发药数量" type="number" min="0" step="0.01"
            value={line.quantity} onChange={(event) => update('quantity', numberValue(event.target.value))}
            onKeyDown={(event) => nextOnEnter(event, 'quantity')} />
        </> : null}
        <input data-rx-mode={mode} data-rx-field="instruction"
          aria-label={mode === 'herbal' ? '特殊煎法或脚注' : '用药嘱托'} value={line.instruction}
          placeholder={mode === 'herbal' ? '如先煎、后下' : '最后回车保存'}
          onChange={(event) => update('instruction', event.target.value)}
          onKeyDown={(event) => nextOnEnter(event, 'instruction')} />
        {mode === 'herbal' && <span className="doctor-herbal-total">
          {line.doseValue === '' ? '—' : Number(line.doseValue) * herbalDoseCount} {line.doseUnit}</span>}
        <Button size="sm" busy={saveLine.isPending} disabled={!isLineComplete(line, mode)
          || (mode === 'herbal' && (!herbalMethod.trim() || !herbalFrequency.trim()))
          || (requiresSafetyReview && !line.safetyReviewed)
          || (matchedAllergies.length > 0 && !line.allergyOverrideReason.trim())}
          onClick={() => saveLine.mutate({ value: line, editorMode: mode })}>保存</Button>
      </div>
    </div>
    {currentMedication && <div className={`doctor-medication-safety ${requiresSafetyReview ? 'is-warning' : 'is-clear'}`}>
      <strong>{requiresSafetyReview ? '当前行需完成用药安全核对' : '当前行未命中高风险提示'}</strong>
      {drugAllergies.length > 0 && <p>患者药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
      {currentMedication.skinTestRequired && <p>该药品标记为需皮试，请确认皮试流程。</p>}
      {currentMedication.antimicrobial && <p>抗菌药等级：{currentMedication.sdAntimicrobialLevelText || '未配置等级'}</p>}
      {matchedAllergies.length > 0 && <label>继续开立理由<input value={line.allergyOverrideReason}
        onChange={(event) => update('allergyOverrideReason', event.target.value)} /></label>}
      {requiresSafetyReview && <label><input type="checkbox" checked={line.safetyReviewed}
        onChange={(event) => update('safetyReviewed', event.target.checked)} /> 已核对患者过敏及药品风险</label>}
    </div>}
    <div className="doctor-prescription-actions">
      <span>末格回车自动保存并新增下一行</span>
      <Button size="sm" variant="secondary" busy={submit.isPending} disabled={drafts.length === 0}
        onClick={() => submit.mutate(drafts)}>提交当前处方{drafts.length > 1 ? `（${drafts.length} 张分方）` : ''}</Button>
    </div>
  </div>
}

function RegularSavedRow({ value, groupLabel, busy, onCancel }: {
  value: MedicationRequest; groupLabel?: string; busy: boolean; onCancel: () => void
}) {
  return <div className={`doctor-prescription-grid__saved ${groupLabel ? 'is-grouped' : ''}`} role="row">
    <span className="doctor-prescription-group-cell">{groupLabel || '—'}</span>
    <span className="doctor-prescription-drug"><strong>{value.medicationName}</strong><small>{value.preparationSpec || value.medicationCode}</small></span>
    <span>{value.doseValue ?? '—'}</span><span>{value.doseUnit || '—'}</span><span>{value.routeCode || '—'}</span>
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

function emptyLine(key: number): PrescriptionLineDraft {
  return {
    key, doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
    instruction: '', safetyReviewed: false, allergyOverrideReason: '',
  }
}

function numberValue(value: string): number | '' {
  return value === '' ? '' : Number(value)
}

function isLineComplete(value: PrescriptionLineDraft, mode: EditorMode) {
  if (!value.medication || value.doseValue === '' || Number(value.doseValue) <= 0 || !value.doseUnit.trim()) return false
  if (mode === 'herbal') return true
  return Boolean(value.routeCode.trim() && value.frequencyCode.trim() && value.quantity !== ''
    && Number(value.quantity) > 0 && value.instruction.trim())
}

function focusField(mode: EditorMode, field: EditableField) {
  window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(
    `[data-rx-mode="${mode}"][data-rx-field="${field}"]`)?.focus())
}

function focusMedication(mode: EditorMode) {
  window.requestAnimationFrame(() => document.getElementById(`doctor-${mode}-medication-search`)?.focus())
}

function isInfusionRoute(route: string | undefined) {
  const normalized = route?.trim().toUpperCase() ?? ''
  return ['IV', 'IVGTT', 'IV_DRIP', 'INTRAVENOUS'].includes(normalized)
    || normalized.includes('输液') || normalized.includes('静滴')
}

function resolveAdministrationParent(prescription: Prescription, line: PrescriptionLineDraft) {
  if (!isInfusionRoute(line.routeCode)) return undefined
  const active = prescription.medicationRequests.filter((item) => item.status !== 'CANCELLED')
  const previous = active[active.length - 1]
  if (previous && isInfusionRoute(previous.routeCode)
    && previous.routeCode?.trim().toUpperCase() === line.routeCode.trim().toUpperCase()
    && previous.frequencyCode === line.frequencyCode.trim()
    && String(previous.durationValue ?? '') === String(line.durationValue)) {
    return previous.parentRequestId || previous.id
  }
  return undefined
}

function administrationGroupLabels(values: MedicationRequest[]) {
  const labels = new Map<string, string>()
  const rootLabels = new Map<string, string>()
  let sequence = 0
  values.filter((value) => value.status !== 'CANCELLED' && isInfusionRoute(value.routeCode)).forEach((value) => {
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

function prescriptionTypeLabel(category: string) {
  return ({ WESTERN: '西药方', CHINESE_PATENT: '中成药方', HERBAL: '草药方' } as Record<string, string>)[category]
    ?? '门诊方'
}

function statusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}
