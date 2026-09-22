import { useDraftRowInteractions } from './useDraftRowInteractions'
import { useRef, useState } from 'react'
import { Button, Popconfirm, StatusBadge } from '../../../shared/ui'
import { type ServicePlanDraft } from './orderDraftTypes'
import { resolveExecutingDepartment, formatServiceExecution, formatUnitPrice } from './orderPresentation'
import { OrderTypeBadge } from './OrderRowDecorations'
import { continueDraftOnEnter } from './orderEditorControls'

export function ServiceDraftEditRow({ value, onSave, onCancel, onRemove, currentDept }: {
  value: ServicePlanDraft; onSave: (value: ServicePlanDraft) => void; onCancel: () => void; onRemove: () => void
  currentDept?: string
}) {
  const [description, setDescription] = useState(value.clinicalDescription ?? '')
  const [quantity, setQuantity] = useState(value.quantity)

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
