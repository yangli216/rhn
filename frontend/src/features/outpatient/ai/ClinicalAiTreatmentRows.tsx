import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { Button, Icon } from '../../../shared/ui'
import { calculatePackageQuantity } from '../orders/medicationQuantity'
import { clinicalAiTreatmentKey } from '../orders/orderDraftTypes'
import { formatPackageUnit } from '../orders/orderPresentation'
import { resolveDispensableOptions } from '../orders/dispensableOptions'

type OrderDetails = NonNullable<ClinicalAiTreatmentRecommendation['orderDraft']>

/** Resolve catalog details after a requested analysis; this never triggers another model request. */
export function ClinicalAiTreatmentRows({ items, api, encounter, disabled, onReview }: {
  items: ClinicalAiTreatmentRecommendation[]
  api: RhnApi
  encounter: Encounter
  disabled: boolean
  onReview: (items: ClinicalAiTreatmentRecommendation[]) => void
}) {
  const [excluded, setExcluded] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, Partial<OrderDetails>>>({})
  const [editingKey, setEditingKey] = useState<string>()
  const hasMedication = items.some((item) => item.type === 'MEDICATION')
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
        return { medication, product, price: product.price, unit: formatPackageUnit(product.unitName, product.unitCode),
          specification: product.itemPackage?.packageSpec || medication.preparationSpec,
          details: { packageId: product.itemPackage?.id, doseValue: medication.defaultDose,
            doseUnit: medication.defaultDoseUnit || medication.preparationUnit, routeCode: medication.defaultRoute,
            frequencyCode: medication.defaultFrequency, quantity: 1,
            instruction: product.product.instruction || '' } satisfies OrderDetails }
      }
      const matches = await api.masterData.searchServices(item.code, item.type, 'ACTIVE', encounter.organizationId, 0, 100)
      const service = matches.content.find((value) => String(value.id) === String(item.catalogItemId))
      if (!service) throw new Error('项目已不在可用目录中')
      const today = new Date().toLocaleDateString('sv-SE')
      const price = service.prices?.filter((value) => value.sdStatus === 'ACTIVE' && value.sdPriceType === 'SALE'
        && (!value.organizationId || value.organizationId === encounter.organizationId)
        && (!value.validFrom || value.validFrom <= today) && (!value.validTo || value.validTo >= today))
        .sort((left, right) => Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId)))[0]
      const requirements = [service.specimenType && `标本：${service.specimenType}`,
        service.examinationType && `检查类型：${service.examinationType}`, service.examinationNotes, service.attention].filter(Boolean).join('；')
      return { price: price?.price, unit: formatPackageUnit(undefined, service.unitCode || 'ITEM'),
        specification: requirements, details: { quantity: 1,
          instruction: [requirements, item.rationale].filter(Boolean).join('；') } satisfies OrderDetails }
    },
  })) })
  const rows = items.map((item, index) => {
    const key = clinicalAiTreatmentKey(item), result = results[index], resolved = result.data
    const details: OrderDetails = { quantity: 1, ...resolved?.details, ...edits[key] }
    const medication = item.type === 'MEDICATION'
    const valid = Boolean(resolved) && Number.isFinite(details.quantity) && details.quantity > 0
      && (!medication || (Number.isFinite(details.doseValue) && Number(details.doseValue) > 0
        && details.doseUnit?.trim() && routes.data?.some((route) => route.code === details.routeCode)
        && frequencies.data?.some((frequency) => frequency.code === details.frequencyCode)
        && (details.durationValue === undefined || (Number.isFinite(details.durationValue) && details.durationValue > 0))))
    const change = (patch: Partial<OrderDetails>) => {
      const next = { ...details, ...patch }
      if (resolved?.medication && resolved.product && next.durationValue && next.frequencyCode !== 'PRN'
        && !('quantity' in patch) && ['doseValue', 'doseUnit', 'frequencyCode', 'durationValue'].some((field) => field in patch)) {
        const quantity = calculatePackageQuantity({ medication: resolved.medication, selectedPackage: resolved.product,
          doseValue: next.doseValue, doseUnit: next.doseUnit, frequencyCode: next.frequencyCode,
          durationValue: next.durationValue, frequencies: frequencies.data })?.quantity
        if (quantity) patch.quantity = quantity
      }
      setEdits((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
    }
    return { item, key, result, resolved, details, valid, medication, change }
  })
  const selected = rows.filter((row) => !excluded.includes(row.key))
  const selectedReady = selected.length > 0 && selected.every((row) => row.valid)
  return <div className="doctor-ai-order-suggestions" aria-label="AI 医嘱待确认">
    {rows.map(({ item, key, result, resolved, details, valid, medication, change }) => {
      const route = routes.data?.find((value) => value.code === details.routeCode)?.name || details.routeCode
      const frequency = frequencies.data?.find((value) => value.code === details.frequencyCode)?.name || details.frequencyCode
      const open = editingKey === key
      return <div key={key} className="doctor-ai-treatment-item">
        <div className="doctor-unified-order-row is-ai-suggestion" role="row">
          <span className="doctor-unified-cell-type"><label className="doctor-ai-order-select">
            <input type="checkbox" aria-label={`选择 ${item.name}`} checked={!excluded.includes(key)} disabled={disabled}
              onChange={() => setExcluded((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} />
            <span className="doctor-ai-pending-badge"><Icon name="sparkles" />
              {{ MEDICATION: '药品', LABORATORY: '检验', EXAMINATION: '检查' }[item.type]}</span></label></span>
          <span className="doctor-unified-cell-name"><strong>{item.name}</strong><small>{medication ? resolved?.specification || item.specification || item.code : item.code}</small></span>
          <span className="doctor-unified-cell-directions">{result.isPending ? '正在补齐目录用法…' : result.isError
            ? <span role="alert">{result.error.message}<Button variant="text" size="sm" onClick={() => void result.refetch()}>重试</Button></span>
            : medication ? <span className="doctor-ai-treatment-directions">
              <span>每次 {details.doseValue ?? '待填'} {details.doseUnit} · {route || '途径待填'} · {frequency || '频次待填'}</span>
              <small>{details.durationValue ? `${details.durationValue} 天` : details.frequencyCode === 'PRN' ? '按需使用，天数可补充' : '疗程未设定，可修改'} · {edits[key] ? '已修改，待核对' : '目录默认，需核对'}</small>
            </span> : resolved?.specification || '按项目执行流程'}
          </span>
          <span className="doctor-unified-cell-qty">{resolved ? `${details.quantity} ${resolved.unit}` : '—'}</span>
          <span className="doctor-unified-cell-instruction" title={details.instruction || item.rationale}>{details.instruction || item.rationale}</span>
          <span className="doctor-unified-cell-price">{resolved?.price === undefined ? '—' : `¥${resolved.price.toFixed(2)}`}</span>
          <span className="doctor-unified-cell-status"><span className="doctor-ai-review-status">{resolved && !valid ? '需补全' : '待核对'}</span></span>
          <span className="doctor-unified-cell-actions"><Button size="sm" variant="text" disabled={disabled || !resolved}
            onClick={() => setEditingKey(open ? undefined : key)}>{open ? '收起' : '修改'}</Button></span>
        </div>
        {open && <div className="doctor-ai-treatment-editor" aria-label={`修改 ${item.name}`}>
          {medication && <>
            <label>单次剂量<input type="number" step="any" min="0" value={details.doseValue ?? ''} disabled={disabled}
              onChange={(event) => change({ doseValue: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
            <label>剂量单位<input value={details.doseUnit ?? ''} disabled={disabled} maxLength={32}
              onChange={(event) => change({ doseUnit: event.target.value })} /></label>
            <label>途径<select value={details.routeCode ?? ''} disabled={disabled}
              onChange={(event) => change({ routeCode: event.target.value })}><option value="">请选择</option>
              {routes.data?.map((value) => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
            <label>频次<select value={details.frequencyCode ?? ''} disabled={disabled}
              onChange={(event) => change({ frequencyCode: event.target.value })}><option value="">请选择</option>
              {frequencies.data?.map((value) => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
            <label>天数<input type="number" step="any" min="0" placeholder="未设定" value={details.durationValue ?? ''} disabled={disabled}
              onChange={(event) => change({ durationValue: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
          </>}
          <label>总量（{resolved?.unit}）<input type="number" step="any" min="0" value={details.quantity || ''} disabled={disabled}
            onChange={(event) => change({ quantity: Number(event.target.value) })} /></label>
          <label className="doctor-ai-treatment-editor__instruction">{medication ? '用药嘱托' : '执行要求'}<input value={details.instruction ?? ''} disabled={disabled}
            maxLength={1000} onChange={(event) => change({ instruction: event.target.value })} /></label>
          {!valid && <small role="alert">请补全有效的{medication ? '剂量、单位、途径、频次和总量；填写天数时须大于 0' : '总量'}。</small>}
        </div>}
      </div>
    })}
    {(routes.isError || frequencies.isError) && <div role="alert">用法字典加载失败，暂不能确认药品。<Button variant="text" size="sm"
      onClick={() => { void routes.refetch(); void frequencies.refetch() }}>重试</Button></div>}
    <div className="doctor-ai-order-batch" role="row"><span>已选 {selected.length} 项，核对后可批量转入待开立医嘱。</span>
      <Button size="sm" variant="primary" disabled={disabled || !selectedReady}
        onClick={() => onReview(selected.map(({ item, details }) => ({ ...item, orderDraft: details })))}>
        <Icon name="check" />确认所选（{selected.length}）</Button>
    </div>
  </div>
}
