import { useDraftRowInteractions } from './useDraftRowInteractions'
import { useRef, useState } from 'react'
import { Button, Popconfirm, Select } from '../../../shared/ui'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { useOrderExecutionDepartments } from './useOrderExecutionDepartments'
import { type ServicePlanDraft } from './orderDraftTypes'
import { formatServiceExecution, formatUnitPrice } from './orderPresentation'
import { OrderTypeBadge } from './OrderRowDecorations'
import { continueDraftOnEnter } from './orderEditorControls'
import { DraftStatusBadge } from './DraftStatusBadge'
import { ExaminationSiteSelect } from './ExaminationSiteSelect'
import { examinationSiteError, examinationSiteQuantity, usesSiteQuantity } from './examinationSites'
import { useExaminationSiteOptions } from './useExaminationSiteOptions'

export function ServiceDraftEditRow({ value, onSave, onCancel, onRemove, encounter, api }: {
  value: ServicePlanDraft; onSave: (value: ServicePlanDraft) => void; onCancel: () => void; onRemove: () => void
  encounter: Encounter
  api: RhnApi
}) {
  const [description, setDescription] = useState(value.clinicalDescription ?? '')
  const [quantity, setQuantity] = useState(value.quantity)
  const [departmentId, setDepartmentId] = useState(value.performerDepartmentId || encounter.departmentId)
  const [sites, setSites] = useState(value.bodySites ?? [])
  const siteOptions = useExaminationSiteOptions(api, encounter.id, value.catalogItemId, value.serviceType)
  const siteRule = siteOptions.data
  const quantityBySites = usesSiteQuantity(siteRule, sites.length)
  const effectiveQuantity = quantityBySites && siteRule ? examinationSiteQuantity(siteRule, sites) : quantity
  const siteInvalid = Boolean(examinationSiteError(siteRule, value.itemName, sites.length))
  const departments = useOrderExecutionDepartments(api, encounter.organizationId)
  const selectedDepartment = departments.data?.find(department => department.id === departmentId)

  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)
  const save = () => {
    if (hasSavedRef.current || isRemovingRef.current) return
    if (!selectedDepartment) return
    hasSavedRef.current = true
    if (effectiveQuantity > 0) {
      onSave({ ...value, quantity: effectiveQuantity, clinicalDescription: description.trim() || undefined,
        bodySites: sites.length ? sites : undefined,
        performerOrganizationId: encounter.organizationId,
        performerDepartmentId: selectedDepartment.id, performerDepartmentName: selectedDepartment.name })
    } else {
      onCancel()
    }
  }

  const { rowRef, handleBlur, handleKeyDown } = useDraftRowInteractions({
    save,
    cancel: () => { hasSavedRef.current = true; onCancel() },
    ignoreInteraction: () => isRemovingRef.current,
  })

  return <div ref={rowRef} className="doctor-unified-inline-composer is-service-draft-editor" role="row"
    aria-label={`编辑待确认医嘱 ${value.itemName}`}
    onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <div className="doctor-inline-order-static-type"><OrderTypeBadge type={value.serviceType || 'OTHER'} /></div>
      <div className="doctor-inline-order-static-resource"><strong>{value.itemName}</strong></div>
      {siteRule?.configured && siteRule.sites.length
        ? <div className="doctor-inline-order-field doctor-inline-service-execution has-exam-site">
          <ExaminationSiteSelect id={`draft-service-site-${value.id}`} rule={siteRule}
            value={sites.map(site => site.code)} invalid={siteInvalid} onChange={setSites} />
        </div>
        : <div className="doctor-inline-order-static doctor-inline-service-execution"><span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span></div>}
      <div className="doctor-inline-order-field doctor-inline-order-quantity">
        <div className="doctor-entry-input-unit"><input id={`draft-service-quantity-${value.id}`} aria-label="编辑项目数量" type="number" min="0.01" step="0.01"
          autoFocus value={effectiveQuantity} readOnly={quantityBySites}
          title={quantityBySites ? '按所选检查部位计算' : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setQuantity(Number(event.target.value))}
          onKeyDown={(event) => continueDraftOnEnter(event, `draft-service-note-${value.id}`)} /><small>{value.unitCode || '项'}</small></div>
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-dept">
        <Select size="sm" aria-label="编辑执行科室" value={departmentId} onChange={setDepartmentId}
          disabled={departments.isPending || departments.isError}
          placeholder={departments.isPending ? '加载科室…' : '请选择执行科室'}
          options={(departments.data || []).map(department => ({ value: department.id, label: department.name }))} />
        {departments.isError && <Button size="sm" variant="text" onClick={() => void departments.refetch()}>重试</Button>}
      </div>
      <div className="doctor-inline-order-field doctor-inline-order-instruction doctor-inline-order-service-note">
        <input id={`draft-service-note-${value.id}`} aria-label="编辑临床说明" value={description} placeholder="临床说明"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save() } }} />
      </div>
      <div className="doctor-inline-order-static doctor-inline-order-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</div>
      <div className="doctor-inline-order-status"><DraftStatusBadge /></div>
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
