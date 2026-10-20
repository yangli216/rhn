import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type PersonnelAssignment, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, Dialog, LoadingState, StatusBadge, tableCellClass } from '../../../shared/ui'
import { PractitionerAccessSection } from '../access/PractitionerAccessSection'
import { OrganizationChangeHistory } from '../OrganizationChangeHistory'
import { requirePractitionerDetail } from '../organizationPersonnelFacts'
import { PersonnelActionDialog, type PersonnelAction } from './PersonnelActionDialog'
import { requireQualification } from './personnelFacts'
import { QualificationForm } from './QualificationForm'
import type { usePersonnelOptions } from './usePersonnelOptions'

export const currentAssignment = (value: PersonnelAssignment, on = new Date().toLocaleDateString('sv-SE')) =>
  value.sdPersonnelStatus === 'ACTIVE' && value.validFrom <= on && (!value.validTo || value.validTo >= on)

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
  const person = detail.data?.practitioner
  const assignments = [...(detail.data?.assignments ?? [])].sort((a, b) => Number(currentAssignment(b)) - Number(currentAssignment(a))
    || Number(b.primaryAssignment) - Number(a.primaryAssignment) || b.validFrom.localeCompare(a.validFrom))
  const activeEmployments = (detail.data?.employments ?? []).filter(item => item.sdPersonnelStatus === 'ACTIVE' && !item.leaveDate)
  const active = person?.sdPersonnelStatus === 'ACTIVE'
  return <Dialog presentation="drawer" size="xwide" title={person ? `${person.fullName}（${person.code}）` : '人员档案'} eyebrow="人员档案" onClose={onClose}
    actions={canManage && person && <Button size="sm" variant="text" onClick={() => setHistory(true)}>变更记录</Button>}>
    {detail.isPending ? <LoadingState label="正在加载人员档案…" />
      : detail.isError ? <Alert placement="inline">{errorMessage(detail.error)}<Button size="sm" variant="secondary" onClick={() => void detail.refetch()}>重新加载</Button></Alert>
      : <div className="personnel-drawer">
        <section className="personnel-section" aria-label="基本档案">
          <div className="personnel-section__head"><h3>基本档案</h3>
            {canManage && <div className="personnel-section__actions">
              <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'profile' })}>编辑档案</Button>
              <Button size="sm" variant="text" onClick={() => setAction({ kind: 'status' })}>{active ? '停用档案' : '启用档案'}</Button></div>}</div>
          <dl className="personnel-facts">
            {([['工号', person!.code], ['姓名', person!.fullName], ['性别', person!.sdPractGenderText ?? '未填写'],
              ['状态', <StatusBadge key="status" tone={active ? 'success' : 'neutral'}>{active ? '在职' : '已停用'}</StatusBadge>]] as const)
              .map(([label, value]) => <div key={label} className="personnel-facts__item"><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
        <section className="personnel-section" aria-label="任职">
          <div className="personnel-section__head"><h3>任职</h3>
            {canManage && active && <div className="personnel-section__actions">
              <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'assign' })}>新增任职</Button>
              {!!activeEmployments.length && <Button size="sm" variant="danger" onClick={() => setAction({ kind: 'leave' })}>办理离职</Button>}</div>}</div>
          {!assignments.length ? <p className="personnel-hint">暂无任职。</p> : <DataTable compact aria-label="任职记录">
            <thead><tr><th>机构</th><th>科室</th><th>岗位</th><th>主任职</th><th>起止日期</th><th className={tableCellClass('status')}>状态</th>
              {canManage && <th className={tableCellClass('actions')}>操作</th>}</tr></thead>
            <tbody>{assignments.map(item => {
              const current = currentAssignment(item)
              return <tr key={item.id}>
                <td>{item.organizationName}</td><td>{item.departmentName}</td><td>{item.positionName}</td><td>{item.primaryAssignment ? '是' : '否'}</td>
                <td>{item.validFrom} 至 {item.validTo || '长期'}</td>
                <td className={tableCellClass('status')}><StatusBadge tone={current ? 'success' : 'neutral'}>{current ? '在岗' : item.sdPersonnelStatus === 'ACTIVE' ? (item.validFrom > new Date().toLocaleDateString('sv-SE') ? '待生效' : '已结束') : '已作废'}</StatusBadge></td>
                {canManage && <td className={tableCellClass('actions')}>{item.sdPersonnelStatus === 'ACTIVE' && (!item.validTo || item.validTo >= new Date().toLocaleDateString('sv-SE')) && <>
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
