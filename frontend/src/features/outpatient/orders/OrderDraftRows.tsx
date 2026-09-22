import { Button, Popconfirm, StatusBadge } from '../../../shared/ui'
import type { MedicationPlanDraft } from './medicationDraft'
import { type ServicePlanDraft } from './orderDraftTypes'
import { formatPackageUnit, resolveExecutingDepartment, serviceTypeLabel, formatServiceExecution, formatUnitPrice } from './orderPresentation'
import { OrderTypeBadge, AdministrationGroupBracket } from './OrderRowDecorations'

export function MedicationDraftRow({ value, isHead, isTail, isMid, onEdit, onRemove, onAppendToGroup, currentDept }: {
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

export function ServiceDraftRow({ value, onEdit, onRemove, currentDept }: {
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
