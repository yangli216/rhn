import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type RhnApi, type PractitionerDetail, type PersonnelAssignment, type Employment, type Position,
  type OrganizationUnit, type SystemEnumDefinition,
} from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Select } from '../../shared/ui'
import { requirePractitionerDetail, requirePositions } from './organizationPersonnelFacts'
import { departmentOwner } from './organizationUnitReceipt'

export type PersonnelMaintenanceAction =
  | { kind: 'assignment' | 'transfer' | 'end-assignment'; value: PersonnelAssignment }
  | { kind: 'employment' | 'end-employment'; value: Employment }
  | { kind: 'position'; value: Position }

export function PersonnelLifecycleDialog({ api, action, detail, units, positions, enums, available, onRefresh, onClose, onSaved }: {
  api: RhnApi; action: PersonnelMaintenanceAction; detail?: PractitionerDetail; units: OrganizationUnit[]; positions: Position[];
  enums?: SystemEnumDefinition[]; available: boolean; onRefresh: () => Promise<unknown>; onClose: () => void; onSaved: () => void
}) {
  const a = action.kind === 'assignment' || action.kind === 'transfer' || action.kind === 'end-assignment' ? action.value : undefined
  const e = action.kind === 'employment' || action.kind === 'end-employment' ? action.value : undefined
  const p = action.kind === 'position' ? action.value : undefined
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [from, setFrom] = useState(a?.validFrom ?? e?.hireDate ?? '')
  const [to, setTo] = useState(a?.validTo ?? e?.leaveDate ?? '')
  const [department, setDepartment] = useState(a?.departmentId ?? '')
  const [position, setPosition] = useState(a?.positionId ?? '')
  const [type, setType] = useState(a?.sdAssignmentType ?? e?.sdEmploymentType ?? p?.sdPositionType ?? '')
  const [specialty, setSpecialty] = useState(a?.specialtyCode ?? '')
  const [workload, setWorkload] = useState(a?.workloadPercent == null ? '' : String(a.workloadPercent))
  const [primary, setPrimary] = useState(a?.primaryAssignment ?? e?.primaryEmployment ?? false)
  const [status, setStatus] = useState(a?.sdPersonnelStatus ?? e?.sdPersonnelStatus ?? p?.sdPersonnelStatus ?? 'ACTIVE')
  const [name, setName] = useState(p?.name ?? '')
  const [duty, setDuty] = useState(p?.dutyDescription ?? '')
  const [validation, setValidation] = useState('')
  const ending = action.kind.startsWith('end-')
  const transfer = action.kind === 'transfer'
  const title = action.kind === 'end-employment' ? '办理离职' : action.kind === 'end-assignment' ? '结束任职'
    : transfer ? '办理调岗' : p ? '编辑标准岗位' : e ? '编辑聘用关系' : '编辑科室任职'
  const mutation = useMutation({
    mutationFn: async () => {
      if (!available) throw new Error('维护依赖的档案尚未确认，请重新加载')
      if (!reason.trim()) throw new Error('请填写变更原因')
      if (!ending && !transfer && !systemEnumItems(enums, p ? ORGANIZATION_SYSTEM_ENUM.positionType : e ? ORGANIZATION_SYSTEM_ENUM.employmentType : ORGANIZATION_SYSTEM_ENUM.assignmentType).some(item => item.code === type)) throw new Error('类型选项尚未确认，请重新加载')
      const expectedRevision = action.value.revision
      if (p) {
        const next = requirePositions([await api.organization.updatePosition(p.id, {
          expectedRevision, name, sdPositionType: type as Position['sdPositionType'], dutyDescription: duty || undefined,
          sdPersonnelStatus: status as Position['sdPersonnelStatus'], reason,
        })])[0]
        if (next.id !== p.id || next.code !== p.code || next.revision <= p.revision || next.name !== name.trim()
          || next.sdPositionType !== type || next.sdPersonnelStatus !== status || (next.dutyDescription ?? '') !== duty.trim()) throw new Error('岗位保存结果未确认，请重新加载核实')
        return
      }
      if (!detail) throw new Error('人员详情尚未确认')
      const response = ending
        ? e ? await api.organization.endEmployment(e.id, { expectedRevision, lastDay: date, reason })
          : await api.organization.endAssignment(a!.id, { expectedRevision, lastDay: date, reason })
        : transfer ? await api.organization.transferAssignment(a!.id, { expectedRevision, departmentId: department, positionId: position, effectiveDate: date, reason })
          : e ? await api.organization.updateEmployment(e.id, {
            expectedRevision, sdEmploymentType: type as Employment['sdEmploymentType'], primaryEmployment: primary, hireDate: from,
            leaveDate: to || undefined, sdPersonnelStatus: status as Employment['sdPersonnelStatus'], reason,
          }) : await api.organization.updateAssignment(a!.id, {
            expectedRevision, positionId: position, sdAssignmentType: type as PersonnelAssignment['sdAssignmentType'],
            specialtyCode: specialty.trim() || undefined, primaryAssignment: primary, workloadPercent: workload === '' ? undefined : Number(workload),
            validFrom: from, validTo: to || undefined, sdPersonnelStatus: status as PersonnelAssignment['sdPersonnelStatus'], reason,
          })
      const next = requirePractitionerDetail(response, detail.practitioner.id)
      if (next.employments.length !== detail.employments.length || detail.employments.some(old => !next.employments.some(item => item.id === old.id))
        || next.assignments.length !== detail.assignments.length + (transfer ? 1 : 0) || detail.assignments.some(old => !next.assignments.some(item => item.id === old.id))) throw new Error('保存结果缺少原有关系记录，请重新核实')
      const before = e ?? a!
      const changed = e ? next.employments.find(item => item.id === e.id) : next.assignments.find(item => item.id === a!.id)
      if (!changed || changed.revision <= before.revision) throw new Error('关系保存结果未确认，请重新核实人员档案')
      const endDate = 'hireDate' in changed ? changed.leaveDate : changed.validTo
      if (ending && endDate !== date) throw new Error('结束日期保存结果未确认')
      if (action.kind === 'end-employment' && next.assignments.some(item => item.employmentId === e!.id && item.sdPersonnelStatus === 'ACTIVE'
        && (!item.validTo || item.validTo > date))) throw new Error('离职后的任职结束结果未确认')
      if (transfer) {
        const previousDay = new Date(`${date}T00:00:00Z`); previousDay.setUTCDate(previousDay.getUTCDate() - 1)
        const created = next.assignments.filter(item => !detail.assignments.some(old => old.id === item.id))
        if (endDate !== previousDay.toISOString().slice(0, 10) || created.length !== 1 || created[0].departmentId !== department
          || created[0].positionId !== position || created[0].validFrom !== date || created[0].employmentId !== a!.employmentId) throw new Error('调岗前后任职关联未确认')
      }
      if (!ending && !transfer) {
        if (e && (!('hireDate' in changed) || changed.hireDate !== from || (changed.leaveDate ?? '') !== to || changed.sdEmploymentType !== type || changed.primaryEmployment !== primary || changed.sdPersonnelStatus !== status)) throw new Error('聘用变更结果未确认')
        if (a && (!('validFrom' in changed) || changed.validFrom !== from || (changed.validTo ?? '') !== to || changed.positionId !== position || changed.sdAssignmentType !== type || changed.primaryAssignment !== primary || changed.sdPersonnelStatus !== status || (changed.specialtyCode ?? '') !== specialty.trim() || (changed.workloadPercent ?? null) !== (workload === '' ? null : Number(workload)))) throw new Error('任职变更结果未确认')
      }
    },
    onSuccess: onSaved,
  })
  const options = (code: string) => systemEnumItems(enums, code).map(item => ({ value: item.code, label: item.name }))
  return <Dialog title={title} eyebrow="组织与人员维护" onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button type="submit" form="personnel-maintenance" busy={mutation.isPending} disabled={!available}>{title}</Button></>}>
    {(validation || mutation.error) && <Alert>{validation || errorMessage(mutation.error)}<Button variant="secondary" disabled={mutation.isPending} onClick={() => void onRefresh()}>重新核实维护档案</Button></Alert>}
    {!available && <Alert>人员、机构或岗位目录正在核实，确认后才能保存。<Button variant="secondary" onClick={() => void onRefresh()}>重新加载维护目录</Button></Alert>}
    {action.kind === 'end-employment' && <p>以最后工作日为聘用结束日，同时结束其下未结束的任职。账号与授权独立维护，请在角色与权限中复核。</p>}
    {transfer && <p>调岗生效日前一天结束原任职；新任职保留原任职类型及主要标记。任一步失败均不保存。</p>}
    <form id="personnel-maintenance" className="master-form" inert={mutation.isPending} onSubmit={event => {
      event.preventDefault(); setValidation('')
      if (!reason.trim() || (!ending && !transfer && (!type || !from && !p))) { setValidation('请完整填写必填项和变更原因'); return }
      mutation.mutate()
    }}>
      {(ending || transfer) && <FormField label={ending ? '最后工作日（含当日）' : '调岗生效日期'} required>
        <input type="date" required value={date} onChange={event => setDate(event.target.value)} /></FormField>}
      {p && <><FormField label="岗位代码"><span>{p.code}</span></FormField><FormField label="岗位名称" required>
        <input required value={name} maxLength={128} onChange={event => setName(event.target.value)} /></FormField></>}
      {transfer && <FormField label="目标科室" required><Select value={department} onChange={setDepartment} options={units.filter(unit =>
        unit.sdOrgKind === 'ORG_UNIT' && departmentOwner(unit.id, units) === a!.organizationId && unit.sdOrgStatus === 'ACTIVE')
        .map(unit => ({ value: unit.id, label: unit.name, secondaryText: unit.code }))} /></FormField>}
      {(transfer || a && !ending) && <FormField label="标准岗位" required><Select value={position} onChange={setPosition}
        options={positions.filter(item => item.sdPersonnelStatus === 'ACTIVE' || item.id === a?.positionId).map(item => ({ value: item.id, label: item.name }))} /></FormField>}
      {!ending && !transfer && <>
        <FormField label={p ? '岗位类别' : e ? '聘用类型' : '任职类型'} required><Select value={type} onChange={setType}
          options={options(p ? ORGANIZATION_SYSTEM_ENUM.positionType : e ? ORGANIZATION_SYSTEM_ENUM.employmentType : ORGANIZATION_SYSTEM_ENUM.assignmentType)} /></FormField>
        {!p && <><FormField label="开始日期" required><input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></FormField>
          <FormField label="结束日期"><input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></FormField>
          <label className="master-check"><input type="checkbox" checked={primary} onChange={event => setPrimary(event.target.checked)} />{e ? '主要聘用' : '本科室主任职'}</label></>}
        {a && <><FormField label="专业代码"><input value={specialty} maxLength={64} onChange={event => setSpecialty(event.target.value)} /></FormField>
          <FormField label="工作量比例（%）"><input type="number" min="0" max="100" step="0.01" value={workload} onChange={event => setWorkload(event.target.value)} /></FormField></>}
        {p && <FormField label="岗位职责"><textarea value={duty} maxLength={1000} onChange={event => setDuty(event.target.value)} /></FormField>}
        <FormField label="记录状态"><Select value={status} onChange={value => setStatus(value as 'ACTIVE' | 'INACTIVE')}
          options={options(ORGANIZATION_SYSTEM_ENUM.personnelStatus)} /></FormField>
        {!p && <p>录入纠错使用编辑；人员流转使用调岗、结束任职或办理离职。作废用于撤销错误关系，并保留历史。</p>}
      </>}
      <FormField className="master-form__span-2" label="变更原因" required><textarea required value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></FormField>
    </form>
  </Dialog>
}
