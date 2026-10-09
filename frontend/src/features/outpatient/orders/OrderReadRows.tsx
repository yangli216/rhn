import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import { Button, Icon, Popconfirm, StatusBadge } from '../../../shared/ui'
import { formatPackageUnit, resolveExecutingDepartment, formatServiceExecution, orderStatusLabel, formatUnitPrice } from './orderPresentation'
import { OrderTypeBadge, AdministrationGroupBracket } from './OrderRowDecorations'

export function MedicationReadRow({ value, skinTest, busy, readOnly, isHead, isTail, isMid, onCancel, onInspectMedication, currentDept, documentLink }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; readOnly: boolean
  isHead?: boolean; isTail?: boolean; isMid?: boolean
  onCancel: () => void
  onInspectMedication?: (name: string) => void
  documentLink?: { key: string; label: string; selected: boolean }
  currentDept?: string
}) {
  const spec = value.packageSpec || value.preparationSpec
  const mfr = value.manufacturerName
  const medName = value.itemName || value.medicationName
  return <div id={`order-${value.id}`} className={`doctor-unified-order-row${documentLink?.selected ? ' is-document-selected' : ''}`} role="row">
    <span className="doctor-unified-cell-type">
      <OrderTypeBadge type={value.medicationType === 'HERBAL' ? 'HERBAL'
        : value.medicationType === 'CHINESE_PATENT' ? 'CHINESE_PATENT' : 'MEDICATION'} />
    </span>
    <span className="doctor-unified-order-name">
      <div className="doctor-unified-order-name-row">
        <AdministrationGroupBracket isHead={isHead} isTail={isTail} isMid={isMid} />
        <div className="doctor-unified-order-name-text">
          <div className="doctor-order-name-with-action">
            <strong>{medName}</strong>
            {onInspectMedication && medName && (
              <Button
                type="button"
                size="sm"
                variant="text"
                className="doctor-order-insert-btn"
                title={`在临床知识库中查阅《${medName}》药品资料`}
                onClick={(e) => {
                  e.stopPropagation()
                  onInspectMedication(medName)
                }}
              >
                <Icon name="pill" />说明书
              </Button>
            )}
          </div>
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

export function doctorSkinTestLabel(value?: SkinTestWorkItem['status']) {
  if (value === 'NEGATIVE') return '皮试阴性'
  if (value === 'POSITIVE') return '皮试阳性'
  if (value === 'IN_PROGRESS') return '皮试中'
  if (value === 'UNCERTAIN') return '待复试'
  if (value === 'INVALID') return '结果无效'
  if (value === 'WAITING_SETTLEMENT') return '待结算皮试'
  if (value === 'WAITING_DISPENSE') return '待发药皮试'
  return '待皮试'
}

export function ServiceReadRow({ value, busy, readOnly, onCancel, currentDept, documentLink }: {
  value: ServiceRequest; busy: boolean; readOnly: boolean; onCancel: () => void
  documentLink?: { key: string; label: string; selected: boolean }
  currentDept?: string
}) {
  return <div id={`order-${value.id}`} className={`doctor-unified-order-row${documentLink?.selected ? ' is-document-selected' : ''}`} role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.serviceType} /></span>
    <span className="doctor-unified-order-name">
      <strong>{value.itemName}</strong>
    </span>
    <span className="doctor-unified-directions">
      <span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span>
      {value.clinicalDescription && <span className="doctor-unified-order-detail" title={value.clinicalDescription}>临床说明：{value.clinicalDescription}</span>}
    </span>
    <span className="doctor-unified-cell-qty">
      <strong>{value.quantity}</strong> <small>{value.unitCode}</small>
    </span>
    <span className="doctor-unified-cell-dept">
      <span className="doctor-direction-chip is-dept">
        {resolveExecutingDepartment({
          kind: 'service',
          performerDepartmentId: value.performerDepartmentId,
          type: value.serviceType,
          itemName: value.itemName,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">—</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(value.status)}</StatusBadge>
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
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
