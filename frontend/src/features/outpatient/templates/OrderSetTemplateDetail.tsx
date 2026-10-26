import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import { Alert, DataTable, Icon, StatusBadge, tableCellClass } from '../../../shared/ui'
import { ServiceInsertButton } from '../ai/ServiceInsertButton'
import type { MedicalInsertTarget } from '../ai/MedicalInsertViewerModal'
import { legacyOrderSetOwnerLabel } from './orderSetTemplate'

const serviceTypeText = (value?: string) => value === 'LABORATORY' ? '检验' : value === 'EXAMINATION' ? '检查'
  : value === 'TREATMENT' ? '治疗' : '其他'

/** 临床模板库的医嘱组套详情：药品、项目两区；每行显示是否默认勾选，项目行显示执行科室。 */
export function OrderSetTemplateDetail({ template, departmentName, onInspect }: {
  template: OutpatientPlanTemplate
  /** 按科室编号取名称；未知时返回 undefined，界面提示“科室待确认”。 */
  departmentName: (departmentId: string) => string | undefined
  onInspect: (target: MedicalInsertTarget) => void
}) {
  return <>
    {template.description && <div className="doctor-plan-detail-hero"><p className="doctor-plan-detail-desc">{template.description}</p></div>}
    <div className="doctor-plan-detail-card">
      <div className="doctor-plan-detail-card__header">
        <div className="doctor-plan-detail-card__title">
          <Icon name="pill" className="ui-icon-inline" />
          <span>药品</span>
          <span className="doctor-plan-card-count">{template.medications.length} 项</span>
        </div>
      </div>
      <div className="doctor-plan-detail-card__table-wrapper">
        <DataTable compact className="doctor-plan-items-table" aria-label="组套药品">
          <thead><tr>
            <th className={`${tableCellClass('text')} doctor-col--med-name`}>药品名称及规格</th>
            <th className={`${tableCellClass('numeric')} doctor-col--dose`}>单次剂量</th>
            <th className={`${tableCellClass('text')} doctor-col--route`}>途径</th>
            <th className={`${tableCellClass('text')} doctor-col--frequency`}>频次</th>
            <th className={`${tableCellClass('numeric')} doctor-col--duration`}>疗程</th>
            <th className={tableCellClass('numeric')}>数量</th>
            <th className={`${tableCellClass('text')} doctor-col--instruction`}>用法说明 / 嘱托</th>
            <th className={tableCellClass('status')}>默认勾选</th>
          </tr></thead>
          <tbody>
            {template.medications.length ? template.medications.map((item) => <tr key={item.lineId}>
              <td className={`${tableCellClass('text')} doctor-col--med-name`}>
                <div className="doctor-plan-med-name-cell">
                  <strong>{item.medicationName}</strong>
                  {item.preparationSpec && <span className="doctor-plan-item-spec">{item.preparationSpec}</span>}
                </div>
              </td>
              <td className={`${tableCellClass('numeric')} doctor-col--dose`}>
                {item.doseValue ? `${item.doseValue} ${item.doseUnit || ''}` : <span className="doctor-plan-item-subtext">待确认</span>}
              </td>
              <td className={`${tableCellClass('text')} doctor-col--route`}>{item.routeName || item.routeCode || '—'}</td>
              <td className={`${tableCellClass('text')} doctor-col--frequency`}>{item.frequencyCode || '—'}</td>
              <td className={`${tableCellClass('numeric')} doctor-col--duration`}>
                {item.durationValue ? `${item.durationValue} ${item.durationUnit || '天'}` : <span className="doctor-plan-item-subtext">待确认</span>}
              </td>
              <td className={tableCellClass('numeric')}>{item.quantity} {item.quantityUnit ?? ''}</td>
              <td className={`${tableCellClass('text')} doctor-col--instruction`}>
                <div className="doctor-plan-instruction-cell" title={item.medicationInstruction || undefined}>{item.medicationInstruction || '—'}</div>
              </td>
              <td className={tableCellClass('status')}>
                <StatusBadge tone={item.defaultSelected === false ? 'neutral' : 'success'}>{item.defaultSelected === false ? '不勾选' : '勾选'}</StatusBadge>
              </td>
            </tr>) : <tr><td colSpan={8} className="doctor-plan-table-empty">暂无药品</td></tr>}
          </tbody>
        </DataTable>
      </div>
    </div>
    <div className="doctor-plan-detail-card">
      <div className="doctor-plan-detail-card__header">
        <div className="doctor-plan-detail-card__title">
          <Icon name="flask" className="ui-icon-inline" />
          <span>检查 / 检验 / 治疗项目</span>
          <span className="doctor-plan-card-count">{template.services.length} 项</span>
        </div>
      </div>
      <div className="doctor-plan-detail-card__table-wrapper">
        <DataTable compact className="doctor-plan-items-table" aria-label="组套项目">
          <thead><tr>
            <th className={`${tableCellClass('text')} doctor-col--service-name`}>项目名称</th>
            <th className={`${tableCellClass('status')} doctor-col--service-type`}>类型</th>
            <th className={`${tableCellClass('numeric')} doctor-col--service-qty`}>数量</th>
            <th className={`${tableCellClass('text')} doctor-col--service-desc`}>临床指征 / 要求</th>
            <th className={tableCellClass('text')}>执行科室</th>
            <th className={tableCellClass('status')}>默认勾选</th>
          </tr></thead>
          <tbody>
            {template.services.length ? template.services.map((item, index) => <tr key={`${item.catalogItemId}-${index}`}>
              <td className={`${tableCellClass('text')} doctor-col--service-name`}>
                <span className="doctor-order-name-with-action">
                  <strong>{item.itemName}</strong>
                  <ServiceInsertButton name={item.itemName} serviceType={item.serviceType} onView={onInspect} />
                </span> <small className="doctor-plan-item-subtext">({item.itemCode})</small>
              </td>
              <td className={`${tableCellClass('status')} doctor-col--service-type`}><StatusBadge tone="neutral">{serviceTypeText(item.serviceType)}</StatusBadge></td>
              <td className={`${tableCellClass('numeric')} doctor-col--service-qty`}>{item.quantity} {item.unitCode}</td>
              <td className={`${tableCellClass('text')} doctor-col--service-desc`}>
                <div className="doctor-plan-instruction-cell" title={item.clinicalDescription || undefined}>{item.clinicalDescription || '—'}</div>
              </td>
              <td className={tableCellClass('text')}>{item.executionDepartmentId
                ? departmentName(item.executionDepartmentId) ?? '科室待确认' : '按项目默认'}</td>
              <td className={tableCellClass('status')}>
                <StatusBadge tone={item.defaultSelected === false ? 'neutral' : 'success'}>{item.defaultSelected === false ? '不勾选' : '勾选'}</StatusBadge>
              </td>
            </tr>) : <tr><td colSpan={6} className="doctor-plan-table-empty">暂无检查检验治疗项目</td></tr>}
          </tbody>
        </DataTable>
      </div>
    </div>
  </>
}

/** 主数据里尚未迁移的“常用组合项目”：医生端只读，不提供编辑、停用。 */
export function LegacyOrderSetDetail({ group, onInspect }: { group: ItemGroup; onInspect: (target: MedicalInsertTarget) => void }) {
  const members = [...group.members].sort((left, right) => left.sortOrder - right.sortOrder)
  return <>
    <Alert tone="info" placement="inline" duration={null}>
      {legacyOrderSetOwnerLabel}：该组合尚未迁入临床模板库，暂不能在此编辑或停用；医生仍可在医嘱区使用。
    </Alert>
    <div className="doctor-plan-detail-card">
      <div className="doctor-plan-detail-card__header">
        <div className="doctor-plan-detail-card__title">
          <Icon name="flask" className="ui-icon-inline" />
          <span>检查 / 检验 / 治疗项目</span>
          <span className="doctor-plan-card-count">{members.length} 项</span>
        </div>
        <span className="doctor-plan-detail-card__sub">编码 {group.code}</span>
      </div>
      <div className="doctor-plan-detail-card__table-wrapper">
        <DataTable compact className="doctor-plan-items-table" aria-label="旧组合项目">
          <thead><tr>
            <th className={tableCellClass('text')}>项目名称</th>
            <th className={tableCellClass('status')}>类型</th>
            <th className={tableCellClass('numeric')}>数量</th>
            <th className={tableCellClass('text')}>临床要求</th>
          </tr></thead>
          <tbody>
            {members.length ? members.map((member) => <tr key={member.id}>
              <td className={tableCellClass('text')}>
                <span className="doctor-order-name-with-action">
                  <strong>{member.itemName}</strong>
                  <ServiceInsertButton name={member.itemName} serviceType={member.serviceType} onView={onInspect} />
                </span> <small className="doctor-plan-item-subtext">({member.itemCode})</small>
              </td>
              <td className={tableCellClass('status')}><StatusBadge tone="neutral">{serviceTypeText(member.serviceType)}</StatusBadge></td>
              <td className={tableCellClass('numeric')}>{member.quantity} {member.unitCode ?? ''}</td>
              <td className={tableCellClass('text')}>{member.memberDescription || '—'}</td>
            </tr>) : <tr><td colSpan={4} className="doctor-plan-table-empty">该组合暂无成员项目</td></tr>}
          </tbody>
        </DataTable>
      </div>
    </div>
  </>
}
