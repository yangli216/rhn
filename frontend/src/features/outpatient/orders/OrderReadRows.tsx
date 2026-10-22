import type { MedicalInsertTarget } from '../ai/MedicalInsertViewerModal'
import { formatBodySites } from './examinationSites'
import { ServiceInsertButton } from '../ai/ServiceInsertButton'
import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import { IconButton, Button, Popconfirm, StatusBadge } from '../../../shared/ui'
import { formatDurationUnit, formatPackageUnit, resolveExecutingDepartment, formatServiceExecution, orderStatusLabel, formatUnitPrice } from './orderPresentation'
import { OrderTypeBadge, AdministrationGroupBracket } from './OrderRowDecorations'
import type { OrderWorkflowMode } from './editSavedOrder'

/** 已保存医嘱的修改与取消签署；只在允许时给出对应回调，不允许的操作不显示。 */
export interface SavedOrderEditAction {
  onEdit?: () => void
  onWithdraw?: () => void
  /** 取消签署的确认说明，例如药品会整张处方退回。 */
  withdrawNotice?: string
  mode: OrderWorkflowMode
}

function SavedOrderActions({ name, status, editBlockedReason, cancelBlockedReason, editAction, busy, onCancel }: {
  name: string; status: MedicationRequest['status']; cancelBlockedReason?: string | null; editBlockedReason?: string | null
  editAction?: SavedOrderEditAction; busy: boolean; onCancel: () => void
}) {
  if (status === 'CANCELLED') return null
  // 未签署或未进结算单的撤销不产生退费，对医生就是删除；已进结算单的仍称撤销，由收费处按冲销退费。
  const label = status === 'DRAFT' || (editAction?.mode === 'SIMPLE' && !editBlockedReason) ? '删除' : '撤销'
  return <>
    {editAction?.onEdit && <Button size="sm" variant="text" disabled={busy}
      title="在原医嘱上修改，保存后生效" onClick={editAction.onEdit}>修改</Button>}
    {editAction?.onWithdraw && <Popconfirm title={`确认取消签署“${name}”？${editAction.withdrawNotice ?? ''}`}
      okText="取消签署" onConfirm={editAction.onWithdraw}>
      <Button size="sm" variant="text" busy={busy}>取消签署</Button>
    </Popconfirm>}
    {cancelBlockedReason ? (
      <Button size="sm" variant="text" disabled title={cancelBlockedReason}>{label}</Button>
    ) : (
      <Popconfirm
        title={label === '删除' ? `确认删除“${name}”？` : `确认撤销“${name}”？${editAction ? '已缴费的需到收费处退费' : ''}`}
        okText={label}
        okVariant="danger"
        onConfirm={onCancel}
      >
        <Button size="sm" variant="text" busy={busy}>{label}</Button>
      </Popconfirm>
    )}
  </>
}

export function MedicationReadRow({ value, skinTest, busy, readOnly, isHead, isTail, isMid, onCancel, editAction, onInspectMedication, currentDept, documentLink }: {
  value: MedicationRequest; skinTest?: SkinTestWorkItem; busy: boolean; readOnly: boolean
  isHead?: boolean; isTail?: boolean; isMid?: boolean
  onCancel: () => void
  editAction?: SavedOrderEditAction
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
              <IconButton icon="file-text" size="sm" label="说明书"
                title={`在临床知识库中查阅《${medName}》药品资料`}
                onClick={(e) => {
                  e.stopPropagation()
                  onInspectMedication(medName)
                }}
              />
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
      {value.durationValue ? <span className="doctor-direction-chip">{value.durationValue}{formatDurationUnit(value.durationUnit)}</span> : null}
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
          stockSiteName: value.stockSiteName,
          stockSiteSource: value.stockSiteSource,
          selfProvided: value.selfProvided,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">{value.medicationInstruction || '—'}</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>
        {orderStatusLabel(value.status, editAction?.mode)}
      </StatusBadge>
      {value.skinTestExempt ? (
        <span title={value.skinTestExemptReason || '已免做皮试'}><StatusBadge tone="info">免皮试</StatusBadge></span>
      ) : value.skinTestRequired ? (
        <StatusBadge tone={skinTest?.status === 'NEGATIVE' ? 'success'
          : skinTest?.status === 'POSITIVE' ? 'danger' : 'warning'}>{doctorSkinTestLabel(skinTest?.status)}</StatusBadge>
      ) : null}
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      <SavedOrderActions name={value.itemName || value.medicationName} status={value.status}
        cancelBlockedReason={value.cancelBlockedReason} editBlockedReason={value.editBlockedReason}
        editAction={editAction} busy={busy} onCancel={onCancel} />
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

export function ServiceReadRow({ value, busy, readOnly, onCancel, editAction, currentDept, documentLink, performerDepartmentName, onInspectService }: {
  value: ServiceRequest; busy: boolean; readOnly: boolean; onCancel: () => void
  editAction?: SavedOrderEditAction
  onInspectService?: (target: MedicalInsertTarget) => void
  documentLink?: { key: string; label: string; selected: boolean }
  currentDept?: string
  performerDepartmentName?: string
}) {
  return <div id={`order-${value.id}`} className={`doctor-unified-order-row${documentLink?.selected ? ' is-document-selected' : ''}`} role="row">
    <span className="doctor-unified-cell-type"><OrderTypeBadge type={value.serviceType} /></span>
    <span className="doctor-unified-order-name">
      <div className="doctor-order-name-with-action">
        <strong>{value.itemName}</strong>
        <ServiceInsertButton name={value.itemName} serviceType={value.serviceType} onView={onInspectService} />
      </div>
    </span>
    <span className="doctor-unified-directions">
      <span className="doctor-direction-service">{formatServiceExecution(value.serviceType)}</span>
      {value.bodySites?.length ? <span className="doctor-unified-order-detail" title={formatBodySites(value.bodySites)}>部位：{formatBodySites(value.bodySites)}</span> : null}
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
          performerDepartmentName,
          type: value.serviceType,
          itemName: value.itemName,
        }, currentDept)}
      </span>
    </span>
    <span className="doctor-unified-order-detail">—</span>
    <span className="doctor-unified-price">{formatUnitPrice(value.unitPrice, value.currencyCode)}</span>
    <span className="doctor-order-status-stack">
      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'DRAFT' ? 'warning' : 'neutral'}>{orderStatusLabel(value.status, editAction?.mode)}</StatusBadge>
    </span>
    {!readOnly && <span className="doctor-unified-order-actions">
      <SavedOrderActions name={value.itemName} status={value.status}
        cancelBlockedReason={value.cancelBlockedReason} editBlockedReason={value.editBlockedReason}
        editAction={editAction} busy={busy} onCancel={onCancel} />
    </span>}
  </div>
}
