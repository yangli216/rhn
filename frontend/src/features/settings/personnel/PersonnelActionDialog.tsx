import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems, type PersonnelAssignment, type PractitionerDetail,
  type PractitionerGender, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DatePicker, Dialog, FormField, Select, Switch } from '../../../shared/ui'
import { requireAccountChange, requirePractitionerAccess } from '../access/accessFacts'
import { requirePractitionerDetail } from '../organizationPersonnelFacts'
import { organizationQueryScope } from '../organizationQueryScope'
import { departmentOwner } from '../organizationUnitReceipt'
import type { usePersonnelOptions } from './usePersonnelOptions'
import { formatDateKey } from '../../../shared/utils/dateRange'

export type PersonnelAction = { kind: 'profile' | 'status' | 'assign' | 'leave' }
  | { kind: 'transfer' | 'end-assignment'; assignment: PersonnelAssignment }

const TITLES: Record<PersonnelAction['kind'], string> = {
  profile: '编辑档案', status: '变更档案状态', assign: '新增任职', leave: '办理离职', transfer: '调岗', 'end-assignment': '结束任职',
}
const today = () => formatDateKey()

/**
 * 人员流转与档案维护。调岗只能在原机构内；离职结束所选机构的聘用及其下全部任职，可一并停用登录账号
 * （先停用账号再结束聘用，避免补录离职后超出管理范围而无法停用）。
 */
export function PersonnelActionDialog({ api, action, detail, options, onClose, onDone }: {
  api: RhnApi; action: PersonnelAction; detail: PractitionerDetail; options: ReturnType<typeof usePersonnelOptions>
  onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const person = detail.practitioner
  const assignment = 'assignment' in action ? action.assignment : undefined
  const units = options.units.data ?? []
  const positions = options.positions.data ?? []
  const activeEmployments = detail.employments.filter(item => item.sdPersonnelStatus === 'ACTIVE' && !item.leaveDate)
  const [fullName, setFullName] = useState(person.fullName)
  const [gender, setGender] = useState<string>(person.sdPractGender ?? '')
  const [organizationId, setOrganizationId] = useState(assignment?.organizationId ?? activeEmployments.find(item => item.primaryEmployment)?.organizationId ?? '')
  const [departmentId, setDepartmentId] = useState(assignment?.departmentId ?? '')
  const [positionId, setPositionId] = useState(assignment?.positionId ?? '')
  const [primary, setPrimary] = useState(!detail.assignments.some(item => item.primaryAssignment && item.sdPersonnelStatus === 'ACTIVE' && (!item.validTo || item.validTo >= today())))
  const [date, setDate] = useState(today())
  const [employmentId, setEmploymentId] = useState(activeEmployments.find(item => item.primaryEmployment)?.id ?? activeEmployments[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState('')
  const access = useQuery({ queryKey: ['practitioner-access', person.id, organizationQueryScope(api)], enabled: action.kind === 'leave',
    queryFn: async () => requirePractitionerAccess(await api.identityAccess.practitionerAccess(person.id), person.id) })
  const loginAccount = access.data?.account?.status === 'ACTIVE' ? access.data.account : undefined
  // 离开最后一个聘用机构时默认一并停用；仍在其他机构聘用时由操作人决定。
  const [disableAccount, setDisableAccount] = useState(activeEmployments.length <= 1)
  const [accountDisabled, setAccountDisabled] = useState('')
  const departments = units.filter(unit => unit.sdOrgKind === 'ORG_UNIT' && unit.sdOrgStatus === 'ACTIVE' && departmentOwner(unit.id, units) === organizationId)
    .map(unit => ({ value: unit.id, label: unit.name, secondaryText: unit.code }))
  const organizations = units.filter(unit => unit.sdOrgKind === 'LEGAL_ORGANIZATION' && unit.sdOrgStatus === 'ACTIVE').map(unit => ({ value: unit.id, label: unit.name }))
  const positionOptions = positions.filter(item => item.sdPersonnelStatus === 'ACTIVE').map(item => ({ value: item.id, label: item.name }))
  const needsReason = ['leave', 'transfer', 'end-assignment'].includes(action.kind)

  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      switch (action.kind) {
        case 'profile': {
          const next = await api.organization.updatePractitioner(person.id, { expectedRevision: person.revision, fullName: fullName.trim(), sdPractGender: gender as PractitionerGender })
          if (next.id !== person.id || next.revision <= person.revision || next.fullName !== fullName.trim()) throw new Error('档案保存结果未确认，请重新加载核实')
          return `已保存${next.fullName}的档案`
        }
        case 'status': {
          const target = person.sdPersonnelStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
          const next = await api.organization.changePractitionerStatus(person.id, person.revision, target)
          if (next.id !== person.id || next.sdPersonnelStatus !== target) throw new Error('档案状态保存结果未确认，请重新加载核实')
          return `${person.fullName}的档案已${target === 'ACTIVE' ? '启用' : '停用'}`
        }
        case 'assign': {
          const created = await api.organization.assignPractitioner(person.id, { organizationId, departmentId, positionId, primaryAssignment: primary, validFrom: date })
          if (created.practitionerId !== person.id || created.departmentId !== departmentId || created.positionId !== positionId) throw new Error('任职保存结果未确认，请重新加载核实')
          return `已为${person.fullName}新增任职：${created.departmentName}`
        }
        case 'transfer': {
          const next = requirePractitionerDetail(await api.organization.transferAssignment(assignment!.id,
            { expectedRevision: assignment!.revision, departmentId, positionId, effectiveDate: date, reason: reason.trim() }), person.id)
          if (!next.assignments.some(item => item.departmentId === departmentId && item.positionId === positionId && item.validFrom === date)) throw new Error('调岗结果未确认，请重新加载核实')
          return `${person.fullName}已调岗，自 ${date} 生效`
        }
        case 'end-assignment': {
          const next = requirePractitionerDetail(await api.organization.endAssignment(assignment!.id,
            { expectedRevision: assignment!.revision, lastDay: date, reason: reason.trim() }), person.id)
          if (next.assignments.find(item => item.id === assignment!.id)?.validTo !== date) throw new Error('结束任职结果未确认，请重新加载核实')
          return `已结束${person.fullName}在${assignment!.departmentName}的任职`
        }
        case 'leave': {
          const employment = activeEmployments.find(item => item.id === employmentId)!
          let disabled = accountDisabled
          if (!disabled && disableAccount && loginAccount) {
            const account = requireAccountChange(await api.identityAccess.changeAccountStatus(loginAccount, 'INACTIVE',
              `办理离职：${reason.trim()}`.slice(0, 500)), loginAccount)
            if (account.status !== 'INACTIVE') throw new Error('账号停用结果未确认，请重新加载核实')
            disabled = account.username
            setAccountDisabled(disabled)
          }
          try {
            const next = requirePractitionerDetail(await api.organization.endEmployment(employment.id,
              { expectedRevision: employment.revision, lastDay: date, reason: reason.trim() }), person.id)
            if (next.employments.find(item => item.id === employment.id)?.leaveDate !== date) throw new Error('离职结果未确认，请重新加载核实')
          } catch (error) {
            if (disabled) throw new Error(`登录账号 ${disabled} 已停用，但离职未完成：${errorMessage(error)}`)
            throw error
          }
          return `${person.fullName}已办理离职，最后工作日 ${date}${disabled ? `；登录账号 ${disabled} 已停用` : ''}`
        }
      }
    },
    onSuccess: message => onDone(message),
  })
  const submit = () => {
    setValidation('')
    const missing = action.kind === 'profile' ? !fullName.trim()
      : action.kind === 'assign' ? !organizationId || !departmentId || !positionId || !date
      : action.kind === 'transfer' ? !departmentId || !positionId || !date
      : action.kind === 'leave' ? !employmentId || !date : action.kind === 'end-assignment' ? !date : false
    if (missing || (needsReason && !reason.trim())) { setValidation('请完整填写必填项'); return }
    mutation.mutate()
  }
  const title = TITLES[action.kind]
  return <Dialog title={title} eyebrow={person.fullName} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button variant={action.kind === 'leave' || action.kind === 'status' && person.sdPersonnelStatus === 'ACTIVE' ? 'danger' : 'primary'}
        busy={mutation.isPending} onClick={submit}>{action.kind === 'status' ? (person.sdPersonnelStatus === 'ACTIVE' ? '确认停用' : '确认启用') : `确认${title}`}</Button></>}>
    {(validation || mutation.error) && <Alert placement="inline">{validation || `保存未完成：${errorMessage(mutation.error)}`}</Alert>}
    {action.kind === 'leave' && <p className="personnel-hint">以最后工作日结束所选机构的聘用，并同时结束其下未结束的任职；科室默认角色随任职自动失效，手工授予的角色请在「账号与角色」中撤销。</p>}
    {action.kind === 'leave' && !accountDisabled && loginAccount && <FormField label="同时停用登录账号"
      hint={`停用 ${loginAccount.username} 后其已登录的会话立即失效${activeEmployments.length > 1 ? '；该人员仍在其他机构聘用，请确认后再停用' : ''}`}>
      <Switch aria-label="同时停用登录账号" checked={disableAccount} onChange={setDisableAccount} disabled={mutation.isPending} checkedText="是" uncheckedText="否" /></FormField>}
    {action.kind === 'transfer' && <p className="personnel-hint">原任职在生效日前一天结束，并在同一机构内新增目标任职。</p>}
    {action.kind === 'status' && <p>{person.sdPersonnelStatus === 'ACTIVE'
      ? '停用后不能再新增任职；实际离职请使用「办理离职」结束聘用。' : '启用后可以再次新增任职。'}</p>}
    <fieldset disabled={mutation.isPending} className="personnel-action-form">
      {action.kind === 'profile' && <>
        <FormField label="姓名" required><input maxLength={100} value={fullName} onChange={event => setFullName(event.target.value)} /></FormField>
        <FormField label="性别"><Select value={gender} onChange={setGender} clearable={false}
          options={systemEnumItems(options.enums, ORGANIZATION_SYSTEM_ENUM.gender).map(item => ({ value: item.code, label: item.name }))} /></FormField></>}
      {action.kind === 'assign' && <FormField label="机构" required><Select value={organizationId} onChange={value => { setOrganizationId(value); setDepartmentId('') }} options={organizations} /></FormField>}
      {(action.kind === 'assign' || action.kind === 'transfer') && <>
        <FormField label={action.kind === 'transfer' ? '目标科室' : '科室'} required><Select value={departmentId} onChange={setDepartmentId} options={departments} /></FormField>
        <FormField label="岗位" required><Select value={positionId} onChange={setPositionId} options={positionOptions} /></FormField></>}
      {action.kind === 'assign' && <FormField label="主任职" hint="一个人在同一科室的重叠期间只能有一个主任职">
        <Switch aria-label="主任职" checked={primary} onChange={setPrimary} checkedText="是" uncheckedText="否" /></FormField>}
      {action.kind === 'leave' && activeEmployments.length > 1 && <FormField label="离职机构" required>
        <Select value={employmentId} onChange={setEmploymentId} options={activeEmployments.map(item => ({ value: item.id, label: item.organizationName }))} /></FormField>}
      {action.kind !== 'profile' && action.kind !== 'status' && <FormField required
        label={action.kind === 'assign' ? '任职开始日期' : action.kind === 'transfer' ? '调岗生效日期' : '最后工作日（含当日）'}>
        <DatePicker value={date} onChange={setDate} /></FormField>}
      {needsReason && <FormField label="原因" required className="personnel-action-form__wide">
        <textarea rows={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></FormField>}
    </fieldset>
  </Dialog>
}
