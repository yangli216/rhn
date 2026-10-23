import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type PersonnelAssignment, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, LoadingState, StatusBadge, tableCellClass } from '../../../shared/ui'
import { grantOpen, requirePractitionerAccess } from '../access/accessFacts'
import { PractitionerAccessSection } from '../access/PractitionerAccessSection'
import { OrganizationChangeHistory } from '../OrganizationChangeHistory'
import { requirePractitionerDetail } from '../organizationPersonnelFacts'
import { organizationQueryScope } from '../organizationQueryScope'
import { PersonnelActionDialog, type PersonnelAction } from './PersonnelActionDialog'
import { prescribingSummary, requireQualification } from './personnelFacts'
import { QualificationForm } from './QualificationForm'
import type { usePersonnelOptions } from './usePersonnelOptions'
import { formatDateKey } from '../../../shared/utils/dateRange'

export const currentAssignment = (value: PersonnelAssignment, on = formatDateKey()) =>
  value.sdPersonnelStatus === 'ACTIVE' && value.validFrom <= on && (!value.validTo || value.validTo >= on)

/** 性别文本友好回显：未说明或未知统一展示为“未填写” */
const displayGender = (text?: string | null) => {
  if (!text || text === '未说明的性别' || text === '未知的性别' || text === '未填写') return '未填写'
  return text
}

/** 人员档案抽屉：基本档案、任职、执业资质。聘用不单独展示：入职、新增任职和离职由系统维护聘用。 */
export function PersonnelDrawer({ api, practitionerId, options, canManage, onChanged, onClose }: {
  api: RhnApi; practitionerId: string; options: ReturnType<typeof usePersonnelOptions>; canManage: boolean
  onChanged: (message: string) => Promise<void>; onClose: () => void
}) {
  const [action, setAction] = useState<PersonnelAction>()
  const [history, setHistory] = useState(false)
  const detail = useQuery({ queryKey: ['practitioner', practitionerId, options.scope],
    queryFn: async () => requirePractitionerDetail(await api.organization.practitioner(practitionerId), practitionerId) })
  const qualification = useQuery({ queryKey: ['practitioner-qualification', practitionerId, options.scope],
    queryFn: async () => requireQualification(await api.organization.qualification(practitionerId), practitionerId) })
  const access = useQuery({ queryKey: ['practitioner-access', practitionerId, organizationQueryScope(api)],
    enabled: canManage,
    queryFn: async () => requirePractitionerAccess(await api.identityAccess.practitionerAccess(practitionerId), practitionerId) })
  const person = detail.data?.practitioner
  const assignments = [...(detail.data?.assignments ?? [])].sort((a, b) => Number(currentAssignment(b)) - Number(currentAssignment(a))
    || Number(b.primaryAssignment) - Number(a.primaryAssignment) || b.validFrom.localeCompare(a.validFrom))
  const activeEmployments = (detail.data?.employments ?? []).filter(item => item.sdPersonnelStatus === 'ACTIVE' && !item.leaveDate)
  const active = person?.sdPersonnelStatus === 'ACTIVE'

  const primary = assignments.find(a => a.primaryAssignment && currentAssignment(a)) ?? assignments.find(a => a.primaryAssignment)
  const currentCount = assignments.filter(item => currentAssignment(item)).length
  const concurrentCount = Math.max(0, currentCount - (primary && currentAssignment(primary) ? 1 : 0))

  const hasClinicalAssignment = assignments.some(item => currentAssignment(item) && (item.sdPositionType === 'CLINICAL' || item.positionName?.includes('医')))
  const qualificationUnregistered = qualification.data && !qualification.data.registered
  const missingPrescribing = qualification.data && qualification.data.registered && !qualification.data.prescribing
  const complianceRisk = hasClinicalAssignment && (qualificationUnregistered || missingPrescribing)

  return <Dialog presentation="drawer" size="xwide" title={person ? `${person.fullName}（${person.code}）` : '人员档案'} eyebrow="人员档案" onClose={onClose}
    actions={canManage && person && <Button size="sm" variant="text" onClick={() => setHistory(true)}>变更记录</Button>}>
    {detail.isPending ? <LoadingState label="正在加载人员档案…" />
      : detail.isError ? <Alert placement="inline">{errorMessage(detail.error)}<Button size="sm" variant="secondary" onClick={() => void detail.refetch()}>重新加载</Button></Alert>
      : <div className="personnel-drawer">
        <section className="personnel-section personnel-section--profile" aria-label="基本档案">
          <div className="personnel-profile-card">
            <div className="personnel-profile-card__primary">
              <div className="personnel-profile-card__avatar" aria-hidden="true">
                {person!.fullName.slice(0, 1)}
              </div>
              <div className="personnel-profile-card__info">
                <div className="personnel-profile-card__title-row">
                  <span className="personnel-profile-card__name">{person!.fullName}</span>
                  <code className="personnel-profile-card__code">{person!.code}</code>
                  <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? '在职' : '已停用'}</StatusBadge>
                  {primary && <span className="personnel-profile-card__primary-badge" title="当前主任职">
                    主任职：{primary.departmentName} · {primary.positionName}
                  </span>}
                </div>
                <div className="personnel-profile-card__meta">
                  <span className="personnel-profile-card__meta-item">性别：{displayGender(person!.sdPractGenderText)}</span>
                  <span className="personnel-profile-card__meta-divider" aria-hidden="true">/</span>
                  <span className="personnel-profile-card__meta-item">在岗任职：{currentCount} 个科室{concurrentCount > 0 ? `（兼任 ${concurrentCount} 科）` : ''}</span>
                  <span className="personnel-profile-card__meta-divider" aria-hidden="true">/</span>
                  <span className="personnel-profile-card__meta-item">处方权：{qualification.data ? prescribingSummary(qualification.data) : '加载中…'}</span>
                </div>
              </div>
            </div>
            {canManage && <div className="personnel-profile-card__actions">
              <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'profile' })}>编辑档案</Button>
              <Button size="sm" variant="text" onClick={() => setAction({ kind: 'status' })}>{active ? '停用档案' : '启用档案'}</Button>
            </div>}
          </div>
        </section>
        <section className="personnel-section" aria-label="任职">
          <div className="personnel-section__head"><h3>任职</h3>
            {canManage && active && <div className="personnel-section__actions">
              <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'assign' })}>新增任职</Button>
              {!!activeEmployments.length && <Button size="sm" variant="secondary" className="personnel-btn--leave" onClick={() => setAction({ kind: 'leave' })}>办理离职</Button>}</div>}</div>
          {!assignments.length ? <p className="personnel-hint">暂无任职。</p> : <DataTable compact aria-label="任职记录">
            <thead><tr><th>机构</th><th>科室</th><th>岗位</th><th>主任职</th><th>系统角色</th><th>起止日期</th><th className={tableCellClass('status')}>状态</th>
              {canManage && <th className={tableCellClass('actions')}>操作</th>}</tr></thead>
            <tbody>{assignments.map(item => {
              const current = currentAssignment(item)
              return <tr key={item.id} className={item.primaryAssignment ? 'personnel-assignment-row--primary' : undefined}>
                <td>{item.organizationName}</td><td>{item.departmentName}</td><td>{item.positionName}</td>
                <td>{item.primaryAssignment ? <StatusBadge tone="accent">主任职</StatusBadge> : <span className="personnel-tag--muted">兼任</span>}</td>
                <td>{(() => {
                  if (!access.data?.account) return <span className="personnel-muted">未开账号</span>
                  const grants = (access.data.assignments ?? []).filter(g => grantOpen(g) && (g.dataScopeType === 'TENANT' || g.departmentId === item.departmentId))
                  if (!grants.length) return <span className="personnel-muted">未配角色</span>
                  return <span className="personnel-tag--role" title={grants.map(g => `${g.roleName}（${g.grantSource === 'DEPT_DEFAULT' ? '默认' : '手工'}）`).join('、')}>
                    {grants.map(g => g.roleName).join('、')}
                  </span>
                })()}</td>
                <td>{item.validFrom} 至 {item.validTo || '长期'}</td>
                <td className={tableCellClass('status')}><StatusBadge tone={current ? 'success' : 'neutral'}>{current ? '在岗' : item.sdPersonnelStatus === 'ACTIVE' ? (item.validFrom > formatDateKey() ? '待生效' : '已结束') : '已作废'}</StatusBadge></td>
                {canManage && <td className={tableCellClass('actions')}>{item.sdPersonnelStatus === 'ACTIVE' && (!item.validTo || item.validTo >= formatDateKey()) && <>
                  <Button size="sm" variant="text" onClick={() => setAction({ kind: 'transfer', assignment: item })}>调岗</Button>
                  <Button size="sm" variant="text" onClick={() => setAction({ kind: 'end-assignment', assignment: item })}>结束任职</Button></>}</td>}
              </tr>
            })}</tbody>
          </DataTable>}
        </section>
        <section className="personnel-section" aria-label="账号与角色">
          <div className="personnel-section__head"><h3>账号与角色</h3></div>
          <PractitionerAccessSection api={api} detail={detail.data!} canManage={canManage} onChanged={onChanged} />
        </section>
        <section className="personnel-section" aria-label="执业资质">
          <div className="personnel-section__head"><h3>执业资质</h3></div>
          {complianceRisk && <div className="personnel-compliance-alert" role="status" aria-label="执业合规提醒">
            <div className="personnel-compliance-alert__title">执业合规提醒</div>
            <div className="personnel-compliance-alert__copy">
              {qualificationUnregistered
                ? `该人员已在 ${currentCount} 个科室在岗，但未登记医师执业资格与处方权。开单校验接入前请先核验录入，以免影响门诊与病区正常下达医嘱。`
                : '该人员持有临床岗位任职，但尚未开通普通处方权，将无法在门诊/病区正常下达医嘱。'}
            </div>
          </div>}
          {qualification.isPending ? <LoadingState label="正在加载执业资质…" />
            : qualification.isError ? <Alert placement="inline">{errorMessage(qualification.error)}<Button size="sm" variant="secondary" onClick={() => void qualification.refetch()}>重新加载</Button></Alert>
            : <QualificationForm key={String(qualification.data.revision ?? 'new')} api={api} qualification={qualification.data}
              dictionaries={options.qualificationDictionaries} canManage={canManage} onSaved={() => onChanged(`已保存${person!.fullName}的执业资质`)} />}
        </section>
      </div>}
    {action && detail.data && <PersonnelActionDialog api={api} action={action} detail={detail.data} options={options}
      onClose={() => setAction(undefined)} onDone={async message => { setAction(undefined); await onChanged(message) }} />}
    {history && <Dialog title="人员变更记录" size="xwide" onClose={() => setHistory(false)} footer={<Button onClick={() => setHistory(false)}>关闭</Button>}>
      <OrganizationChangeHistory api={api} type="practitioner" id={practitionerId} /></Dialog>}
  </Dialog>
}
