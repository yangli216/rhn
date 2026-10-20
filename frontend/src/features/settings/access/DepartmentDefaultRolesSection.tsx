import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, Select, StatusBadge, Switch } from '../../../shared/ui'
import { requireAccessRoles } from '../accessPermissionFacts'
import { organizationQueryScope } from '../organizationQueryScope'
import { requireDepartmentDefaults } from './accessFacts'
import '../../../styles/features/access-control.css'

/**
 * 科室默认角色：已开通账号的人员在本科室开始任职时自动授予，任职结束时自动失效。
 * 仅在当前账号可管理该科室时允许维护；新增的角色不能超出维护人自身的权限。
 */
export function DepartmentDefaultRolesSection({ api, departmentId, departmentName, onSaved }: {
  api: RhnApi; departmentId: string; departmentName: string; onSaved: (message: string) => Promise<void>
}) {
  const scope = organizationQueryScope(api)
  const [editing, setEditing] = useState(false)
  const defaults = useQuery({ queryKey: ['department-default-roles', scope, departmentId],
    queryFn: async () => requireDepartmentDefaults(await api.identityAccess.departmentDefaultRoles(departmentId), departmentId) })
  if (defaults.isPending) return <LoadingState label="正在加载默认角色…" />
  if (defaults.isError) return <Alert placement="inline">{errorMessage(defaults.error)}<Button size="sm" variant="secondary" onClick={() => void defaults.refetch()}>重新加载</Button></Alert>
  const { roles, manageable } = defaults.data
  return <>
    <div className="organization-staff-summary">
      {roles.length ? <ul className="access-role-chips" aria-label="默认角色">{roles.map(role => <li key={role.roleId}>
        <span>{role.roleName}</span><code>{role.roleCode}</code>
        {role.roleStatus !== 'ACTIVE' && <StatusBadge tone="neutral">已停用，不再授予</StatusBadge>}</li>)}</ul>
        : <span className="organization-section__empty">未设置默认角色</span>}
      {manageable && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>设置默认角色</Button>}
    </div>
    <p className="organization-section__hint">已开通账号的人员在本科室开始任职时自动授予这些角色，任职结束、调岗或离职时随之失效。{!manageable && '当前账号不能维护本科室的默认角色。'}</p>
    {editing && <DefaultRolesDialog api={api} scope={scope} departmentId={departmentId} departmentName={departmentName}
      current={roles.map(role => role.roleId)} onClose={() => setEditing(false)}
      onDone={async message => { setEditing(false); await defaults.refetch(); await onSaved(message) }} />}
  </>
}

function DefaultRolesDialog({ api, scope, departmentId, departmentName, current, onClose, onDone }: {
  api: RhnApi; scope: number; departmentId: string; departmentName: string; current: string[]
  onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const [roleIds, setRoleIds] = useState(current)
  const [applyToCurrentStaff, setApplyToCurrentStaff] = useState(false)
  const roles = useQuery({ queryKey: ['iam-roles', scope], queryFn: async () => requireAccessRoles(await api.identityAccess.roles()) })
  const mutation = useMutation({
    mutationFn: async () => {
      const next = requireDepartmentDefaults(await api.identityAccess.replaceDepartmentDefaultRoles(departmentId, { roleIds, applyToCurrentStaff }), departmentId)
      if (next.roles.length !== roleIds.length || next.roles.some(role => !roleIds.includes(role.roleId))) throw new Error('默认角色保存结果未确认，请重新加载核实')
      return `已保存${departmentName}的默认角色${applyToCurrentStaff ? `，为现有人员新增 ${next.grantedCount} 项授权` : ''}`
    },
    onSuccess: message => onDone(message),
  })
  const options = (roles.data ?? []).filter(role => role.status === 'ACTIVE' || current.includes(role.id))
    .map(role => ({ value: role.id, label: role.name, secondaryText: role.code, disabled: role.status !== 'ACTIVE' && !roleIds.includes(role.id) }))
  return <Dialog title="设置默认角色" eyebrow={departmentName} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!roles.isSuccess} onClick={() => mutation.mutate()}>保存</Button></>}>
    {mutation.error && <Alert placement="inline">保存未完成：{errorMessage(mutation.error)}</Alert>}
    {roles.isError && <Alert placement="inline">角色目录加载失败<Button size="sm" variant="secondary" onClick={() => void roles.refetch()}>重新加载</Button></Alert>}
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="默认角色" hint="可多选；移除角色不会撤销已授予的授权，可在「角色与权限」中反查后撤销">
        <Select multiple searchable value={roleIds} onChange={values => setRoleIds(values)} loading={roles.isPending} options={options} /></FormField>
      <FormField label="同时授予科室现有人员" hint="为本科室在岗或待生效、且已开通账号的人员补授新增的默认角色">
        <Switch aria-label="同时授予科室现有人员" checked={applyToCurrentStaff} onChange={setApplyToCurrentStaff} checkedText="是" uncheckedText="否" /></FormField>
    </fieldset>
  </Dialog>
}
