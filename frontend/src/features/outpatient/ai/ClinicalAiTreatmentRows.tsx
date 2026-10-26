import { resolveServicePricing } from '../orders/servicePricing'
import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import type { MedicationKnowledge } from '../../../shared/api/masterDataApi'
import { IconButton, Button, Icon, Select } from '../../../shared/ui'
import { MedicalInsertViewerModal, type MedicalInsertTarget } from './MedicalInsertViewerModal'
import { ServiceInsertButton } from './ServiceInsertButton'
import { examinationSiteSummary } from './examinationSiteSummary'
import { calculatePackageQuantity, defaultPackageQuantity, hasNoDailyRate } from '../orders/medicationQuantity'
import { clinicalAiTreatmentKey } from '../orders/orderDraftTypes'
import {
  formatPackageUnit,
  formatUnitPrice,
  formatSpecimenType,
  formatExaminationType,
  shouldDisplayOrderCode,
} from '../orders/orderPresentation'
import { resolveDispensableOptions } from '../orders/dispensableOptions'
import { useOrderExecutionDepartments } from '../orders/useOrderExecutionDepartments'
import { defaultServiceExecutionDepartment } from '../orders/orderExecutionDepartment'

type OrderDetails = NonNullable<ClinicalAiTreatmentRecommendation['orderDraft']>
type EditableOrderDetails = Omit<OrderDetails, 'quantity'> & { quantity?: number }

type UsageFields = Pick<EditableOrderDetails, 'doseValue' | 'doseUnit' | 'routeCode' | 'frequencyCode' | 'durationValue'>

/** Keep only the AI usage fields that are valid against the loaded dictionaries and catalog units; others fall back per field. */
function aiUsage(suggestion: ClinicalAiTreatmentRecommendation['usageSuggestion'], medication: MedicationKnowledge,
  product: { product?: { unitCode?: string } } | undefined, routes?: Array<{ code: string }>, frequencies?: Array<{ code: string }>): UsageFields {
  if (!suggestion) return {}
  const result: UsageFields = {}
  const unit = suggestion.doseUnit?.trim()
  const units = [medication.defaultDoseUnit, medication.preparationUnit, medication.strengthUnit, product?.product?.unitCode]
    .map(value => value?.trim()).filter(Boolean)
  const unitOk = Boolean(unit) && units.includes(unit)
  if (typeof suggestion.doseValue === 'number' && Number.isFinite(suggestion.doseValue) && suggestion.doseValue > 0
    && (!unit || unitOk)) {
    result.doseValue = suggestion.doseValue
    if (unitOk) result.doseUnit = unit
  }
  if (suggestion.routeCode && routes?.some(route => route.code === suggestion.routeCode)) result.routeCode = suggestion.routeCode
  if (suggestion.frequencyCode && frequencies?.some(frequency => frequency.code === suggestion.frequencyCode)) result.frequencyCode = suggestion.frequencyCode
  if (typeof suggestion.durationDays === 'number' && Number.isFinite(suggestion.durationDays) && suggestion.durationDays > 0) result.durationValue = suggestion.durationDays
  return result
}

/** Footer rows stay below every ordered recommendation row. */
const TAIL_ORDER = { order: 100_000 }

/** Without a course the total cannot be derived; when the usage itself converts, prefill one package for review. */
function draftPackageQuantity(input: Parameters<typeof calculatePackageQuantity>[0]) {
  const quantity = defaultPackageQuantity(input)
  if (quantity !== undefined || Number(input.durationValue) > 0) return quantity
  return calculatePackageQuantity({ ...input, durationValue: 1 }) ? 1 : undefined
}

/** Resolve catalog details after a requested analysis; this never triggers another model request. */
export function ClinicalAiTreatmentRows({ items, api, encounter, disabled, onReview, orderOf }: {
  items: ClinicalAiTreatmentRecommendation[]
  api: RhnApi
  encounter: Encounter
  disabled: boolean
  onReview: (items: ClinicalAiTreatmentRecommendation[]) => void
  /** Flex order per row key, shared with pending catalog rows so the list never reshuffles. */
  orderOf?: (key: string) => number
}) {
  const [inspectTarget, setInspectTarget] = useState<MedicalInsertTarget | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, Partial<OrderDetails>>>({})
  const [editingKey, setEditingKey] = useState<string>()
  const [manualQuantities, setManualQuantities] = useState<Record<string, boolean>>({})
  const hasMedication = items.some((item) => item.type === 'MEDICATION')
  const departments = useOrderExecutionDepartments(api, encounter.organizationId,
    items.some(item => item.type !== 'MEDICATION'))
  const routes = useQuery({ queryKey: ['outpatient-medication-routes'], queryFn: () => api.masterData.activeMedicationRoutes('OUTPATIENT'),
    enabled: hasMedication, staleTime: 300_000 })
  const frequencies = useQuery({ queryKey: ['outpatient-order-frequencies', encounter.organizationId, encounter.departmentId],
    queryFn: () => api.masterData.activeOrderFrequencies(encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
    enabled: hasMedication, staleTime: 300_000 })
  const results = useQueries({ queries: items.map((item) => ({
    queryKey: ['ai-treatment-details', encounter.id, encounter.organizationId, item.type, item.catalogItemId, item.code],
    staleTime: 60_000, retry: false,
    queryFn: async () => {
      if (item.type === 'MEDICATION') {
        const matches = await api.encounters.orderableMedications(encounter.id, item.code)
        const medication = matches.find((value) => String(value.id) === String(item.medicationId)
          && value.products.some((product) => String(product.id) === String(item.catalogItemId)))
        if (!medication) throw new Error('药品已不在可用目录中')
        const product = resolveDispensableOptions({ ...medication,
          products: medication.products.filter((value) => String(value.id) === String(item.catalogItemId)) }, encounter.organizationId)[0]
        if (!product) throw new Error('暂无可发药包装或有效价格')
        return { medication, product, price: product.price, currencyCode: product.currencyCode, unit: formatPackageUnit(product.unitName, product.unitCode),
          specification: product.itemPackage?.packageSpec || medication.preparationSpec,
          executionRequirements: undefined, stockSiteName: medication.stockSiteName,
          details: { packageId: product.itemPackage?.id, doseValue: medication.defaultDose,
            doseUnit: medication.defaultDoseUnit || medication.preparationUnit, routeCode: medication.defaultRoute,
            frequencyCode: medication.defaultFrequency, quantity: undefined,
            instruction: '' } satisfies EditableOrderDetails }
      }
      const matches = await api.masterData.searchServices(item.code, item.type, 'ACTIVE', encounter.organizationId, 0, 100)
      const service = matches.content.find((value) => String(value.id) === String(item.catalogItemId))
      if (!service) throw new Error('项目已不在可用目录中')
      const pricing = resolveServicePricing(service, encounter.organizationId)
      if (pricing.error) throw new Error(pricing.error)
      const price = pricing.price
      const specLabel = formatSpecimenType(service.specimenType)
      const examLabel = formatExaminationType(service.examinationType)
      const specification = [specLabel && `标本：${specLabel}`,
        examLabel && `检查类型：${examLabel}`].filter(Boolean).join('；')
      const executionRequirements = [specification, service.examinationNotes, service.attention].filter(Boolean).join('；')
      return { price: price?.price, currencyCode: price?.currencyCode, unit: formatPackageUnit(undefined, service.unitCode || 'ITEM'),
        specification, executionRequirements, stockSiteName: undefined,
        details: { quantity: 1, performerOrganizationId: encounter.organizationId,
          performerDepartmentId: defaultServiceExecutionDepartment(service, encounter.departmentId) } satisfies OrderDetails }
    },
  })) })
  const rows = items.map((item, index) => {
    const key = clinicalAiTreatmentKey(item), result = results[index], resolved = result.data
    const medication = item.type === 'MEDICATION'
    const ai = medication && resolved?.medication ? aiUsage(item.usageSuggestion, resolved.medication, resolved.product, routes.data, frequencies.data) : {}
    const aiFields = Object.keys(ai) as Array<keyof typeof ai>
    const base: EditableOrderDetails = { ...resolved?.details, ...ai }
    // Lab/exam: the AI-suggested examination purpose seeds the editable instruction (becomes the document's examination purpose).
    if (!medication && resolved && base.instruction === undefined) base.instruction = item.purpose?.trim() || ''
    // Default quantity is derivable once an AI-supplied draft completes dose/frequency/duration; PRN/once defaults to one package.
    if ((aiFields.length || hasNoDailyRate(frequencies.data, base.frequencyCode)) && base.quantity === undefined
      && resolved?.medication && resolved.product) {
      base.quantity = draftPackageQuantity({ medication: resolved.medication, selectedPackage: resolved.product, doseValue: base.doseValue,
        doseUnit: base.doseUnit, frequencyCode: base.frequencyCode, durationValue: base.durationValue, frequencies: frequencies.data })
    }
    const details: EditableOrderDetails = { ...base, ...edits[key] }
    const usageSource = !aiFields.length ? 'default' : (['doseValue', 'doseUnit', 'routeCode', 'frequencyCode'] as const).every(field => field in ai) ? 'ai' : 'mixed'
    const department = departments.data?.find(value => value.id === details.performerDepartmentId)
    const valid = Boolean(resolved) && typeof details.quantity === 'number' && Number.isFinite(details.quantity) && details.quantity > 0
      && (medication || Boolean(department))
      && (!medication || (Number.isFinite(details.doseValue) && Number(details.doseValue) > 0
        && details.doseUnit?.trim() && routes.data?.some((route) => route.code === details.routeCode)
        && frequencies.data?.some((frequency) => frequency.code === details.frequencyCode)
        && (details.durationValue === undefined || (Number.isFinite(details.durationValue) && details.durationValue > 0))))
    const change = (patch: Partial<OrderDetails>) => {
      const next = { ...details, ...patch }
      if ('quantity' in patch) setManualQuantities(current => ({ ...current, [key]: true }))
      if (resolved?.medication && resolved.product && !manualQuantities[key]
        && !('quantity' in patch) && ['doseValue', 'doseUnit', 'frequencyCode', 'durationValue'].some((field) => field in patch)) {
        const quantity = draftPackageQuantity({ medication: resolved.medication, selectedPackage: resolved.product,
          doseValue: next.doseValue, doseUnit: next.doseUnit, frequencyCode: next.frequencyCode,
          durationValue: next.durationValue, frequencies: frequencies.data })
        patch.quantity = quantity
      }
      setEdits((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
    }
    return { item, key, result, resolved, details, usageSource, valid, medication, department, change }
  })
  const routeOptions = (routes.data ?? []).map((route) => ({ value: route.code, label: route.name, secondaryText: route.code,
    searchKeywords: [route.code, route.name] }))
  const frequencyOptions = (frequencies.data ?? []).map((frequency) => ({ value: frequency.code, label: frequency.name,
    secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}`,
    searchKeywords: [frequency.code, frequency.shortName ?? ''] }))
  const selected = rows.filter((row) => !excluded.includes(row.key))
  const selectedReady = selected.length > 0 && selected.every((row) => row.valid)
  if (!items.length) return null
  return <div className="doctor-ai-order-suggestions" aria-label="AI 医嘱待确认">
    {rows.map(({ item, key, result, resolved, details, usageSource, valid, medication, department, change }) => {
      const route = routes.data?.find((value) => value.code === details.routeCode)?.name || details.routeCode
      const frequency = frequencies.data?.find((value) => value.code === details.frequencyCode)?.name || details.frequencyCode
      const serviceExecution = [resolved?.specification, details.instruction?.trim() && `目的：${details.instruction.trim()}`].filter(Boolean).join('；')
      const secondaryText = medication
        ? resolved?.specification || item.specification || (shouldDisplayOrderCode(item.code) ? item.code : undefined)
        : [examinationSiteSummary(item.examinationSites), shouldDisplayOrderCode(item.code) ? item.code : undefined]
          .filter(Boolean).join(' · ') || undefined
      const open = editingKey === key
      const doseUnits = [...new Set([details.doseUnit, resolved?.medication?.strengthUnit, resolved?.medication?.preparationUnit,
        resolved?.medication?.defaultDoseUnit].map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
      const typeCell = <label className="doctor-ai-order-select">
        <input type="checkbox" aria-label={`选择 ${item.name}`} checked={!excluded.includes(key)} disabled={disabled}
          onChange={() => setExcluded((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} />
        <span className="doctor-ai-pending-badge">
          {{ MEDICATION: '药品', LABORATORY: '检验', EXAMINATION: '检查' }[item.type]}</span></label>
      const nameCell = <>
            <div className="doctor-order-name-with-action">
              <strong>{item.name}</strong>
              {medication && (
                <IconButton icon="file-text" size="sm" label="说明书"
                  title={`在临床知识库中查阅《${item.name}》药品资料`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setInspectTarget({ name: item.name, type: 'medication' })
                  }}
                />
              )}
              {!medication && <ServiceInsertButton name={item.name} serviceType={item.type} onView={setInspectTarget} />}
            </div>
            {/* Keep the name cell to two lines: catalog detail and the AI's original wording share one line. */}
            {(secondaryText || item.aiOriginalName) && <small title={item.aiOriginalName ? `AI 原建议：${item.aiOriginalName}` : undefined}>
              {[secondaryText, item.aiOriginalName && `AI 原建议：${item.aiOriginalName}`].filter(Boolean).join(' · ')}</small>}
      </>
      const numberInput = (label: string, value: number | undefined, onValue: (next: number | undefined) => void, unit: string, autoFocus = false) =>
        <div className="doctor-entry-input-unit"><input aria-label={label} type="number" step="any" min="0" value={value ?? ''} disabled={disabled}
          autoFocus={autoFocus} onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onValue(event.target.value === '' ? undefined : Number(event.target.value))} /><small>{unit}</small></div>
      const order = orderOf ? { order: orderOf(key) } : undefined
      if (open) return <div key={key} className="doctor-ai-treatment-item" style={order}>
        <div className="doctor-unified-inline-composer is-draft-editor is-ai-suggestion" role="row" aria-label={`修改 ${item.name}`}>
          <div className="doctor-inline-order-static-type">{typeCell}</div>
          <div className="doctor-inline-order-static-resource doctor-unified-cell-name">{nameCell}</div>
          {medication ? <div className="doctor-inline-order-directions-group">
            <div className="doctor-inline-order-field doctor-inline-order-dose">
              {/* The AI unit may differ from the catalog default, so the catalog's units stay selectable as in order entry. */}
              <div className="doctor-entry-input-unit">
                <input aria-label="单次剂量" type="number" step="any" min="0" autoFocus value={details.doseValue ?? ''} disabled={disabled}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => change({ doseValue: event.target.value === '' ? undefined : Number(event.target.value) })} />
                {doseUnits.length > 1
                  ? <select aria-label="剂量单位" className="doctor-inline-dose-unit-select" value={details.doseUnit ?? ''} disabled={disabled}
                    onChange={(event) => change({ doseUnit: event.target.value })}>
                    {doseUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
                  : <small>{details.doseUnit}</small>}</div>
            </div>
            <div className="doctor-inline-order-field doctor-inline-order-route">
              <Select aria-label="途径" value={details.routeCode ?? ''} disabled={disabled} showValue placeholder="途径"
                options={routeOptions} onChange={(routeCode) => change({ routeCode })} />
            </div>
            <div className="doctor-inline-order-field doctor-inline-order-frequency">
              <Select aria-label="频次" value={details.frequencyCode ?? ''} disabled={disabled} showValue placeholder="频次"
                options={frequencyOptions} onChange={(frequencyCode) => change({ frequencyCode })} />
            </div>
            <div className="doctor-inline-order-field doctor-inline-order-duration" title="天数，可不填">
              {numberInput('天数', details.durationValue, (durationValue) => change({ durationValue }), '天')}
            </div>
          </div> : <div className="doctor-inline-order-static doctor-inline-service-execution"
            title={resolved?.executionRequirements || undefined}>{resolved?.specification || '按项目执行流程'}</div>}
          <div className="doctor-inline-order-field doctor-inline-order-quantity" title={`总量（${resolved?.unit ?? ''}）`}>
            {numberInput(`总量（${resolved?.unit ?? ''}）`, details.quantity, (quantity) => change({ quantity }), resolved?.unit ?? '', !medication)}
          </div>
          {medication ? <div className="doctor-inline-order-static doctor-inline-order-dept doctor-ai-order-dept-text">
            {resolved?.stockSiteName || '发药药房待确认'}</div>
            : <div className="doctor-inline-order-field doctor-inline-order-dept">
              <Select aria-label="执行科室" value={details.performerDepartmentId || ''}
                disabled={disabled || departments.isPending || departments.isError}
                placeholder={departments.isPending ? '加载科室…' : '执行科室'}
                options={(departments.data || []).map(value => ({ value: value.id, label: value.name }))}
                onChange={id => change({ performerOrganizationId: encounter.organizationId, performerDepartmentId: id || undefined })} />
            </div>}
          <div className={`doctor-inline-order-field doctor-inline-order-instruction${medication ? '' : ' doctor-inline-order-service-note'}`}>
            <input aria-label={medication ? '用药嘱托' : '检查目的'} placeholder={medication ? '用药嘱托' : '检查目的'}
              value={details.instruction ?? ''} disabled={disabled} maxLength={1000}
              onChange={(event) => change({ instruction: event.target.value })} />
          </div>
          <div className="doctor-inline-order-static doctor-inline-order-price">{formatUnitPrice(resolved?.price, resolved?.currencyCode)}</div>
          <div className="doctor-inline-order-status"><span className="doctor-ai-review-status">{valid ? '待核对' : '需补全'}</span></div>
          <div className="doctor-inline-order-actions"><Button size="sm" variant="text" onClick={() => setEditingKey(undefined)}>完成</Button></div>
        </div>
        {!valid && <small className="doctor-ai-treatment-editor-error" role="alert">请补全有效的{medication ? '剂量、单位、途径、频次和总量；填写天数时须大于 0' : '执行科室和总量'}。</small>}
      </div>
      return <div key={key} className="doctor-ai-treatment-item" style={order}>
        <div className="doctor-unified-order-row is-ai-suggestion" role="row">
          <span className="doctor-unified-cell-type">{typeCell}</span>
          <span className="doctor-unified-cell-name">{nameCell}</span>
          <span className="doctor-unified-cell-directions" title={medication ? undefined : resolved?.executionRequirements || undefined}>{result.isPending ? '正在补齐目录用法…' : result.isError
            ? <span role="alert">{result.error.message}<Button variant="text" size="sm" onClick={() => void result.refetch()}>重试</Button></span>
            : medication ? <span className="doctor-ai-treatment-directions">
              <span>每次 {details.doseValue ?? '待填'} {details.doseUnit} · {route || '途径待填'} · {frequency || '频次待填'}</span>
              <small>{details.durationValue ? `${details.durationValue} 天` : details.frequencyCode === 'PRN' ? '按需使用，天数可补充'
                : details.quantity ? `疗程未设定，总量按 ${details.quantity} ${resolved?.unit ?? ''} 预填` : '疗程未设定，可修改'} · {edits[key] ? '已修改，待核对' : usageSource === 'ai' ? 'AI 建议用法，需核对' : usageSource === 'mixed' ? '部分来自 AI 建议，需核对' : '目录默认，需核对'}</small>
            </span> : serviceExecution || '按项目执行流程'}
          </span>
          <span className="doctor-unified-cell-qty">{resolved ? `${details.quantity ?? '待填'} ${resolved.unit}` : '—'}</span>
          <span className="doctor-unified-cell-dept">{medication
            ? resolved?.stockSiteName || '发药药房待确认'
            : department?.name || '执行科室待确认'}</span>
          <span className="doctor-unified-cell-instruction" title={medication ? details.instruction || undefined : undefined}>
            {medication ? details.instruction || '—' : '—'}
          </span>
          <span className="doctor-unified-cell-price">{formatUnitPrice(resolved?.price, resolved?.currencyCode)}</span>
          <span className="doctor-unified-cell-status"><span className="doctor-ai-review-status">{resolved && !valid ? '需补全' : '待核对'}</span></span>
          <span className="doctor-unified-cell-actions"><Button size="sm" variant="text" disabled={disabled || !resolved}
            onClick={() => setEditingKey(key)}>修改</Button></span>
        </div>
      </div>
    })}
    {departments.isError && <div role="alert" style={TAIL_ORDER}>执行科室加载失败。<Button variant="text" size="sm"
      onClick={() => void departments.refetch()}>重试</Button></div>}
    {(routes.isError || frequencies.isError) && <div role="alert" style={TAIL_ORDER}>用法字典加载失败，暂不能确认药品。<Button variant="text" size="sm"
      onClick={() => { void routes.refetch(); void frequencies.refetch() }}>重试</Button></div>}
    <div className="doctor-ai-order-batch" role="row" style={TAIL_ORDER}><span>已选 {selected.length} 项，核对后可批量转入待开立医嘱。</span>
      <Button size="sm" variant="primary" disabled={disabled || !selectedReady}
        onClick={() => {
          if (!selectedReady) return
          onReview(selected.map(({ item, details }) => ({ ...item, orderDraft: { ...details, quantity: details.quantity! } })))
        }}>
        <Icon name="check" />确认所选（{selected.length}）</Button>
    </div>

    <MedicalInsertViewerModal
      isOpen={Boolean(inspectTarget)}
      onClose={() => setInspectTarget(null)}
      target={inspectTarget}
      api={api}
    />
  </div>
}
