import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { errorMessage, type AccessPermission, type AccessRole, type RhnApi, type UserRoleAssignment } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, SearchField, Select, StatusBadge, Switch, Tabs, useSystemEnum } from '../../shared/ui'
import { MasterDetailPage } from '../../shared/ui/templates/PageTemplates'
import { pinyinInitials } from '../../shared/ui/pinyinInitials'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import { requireAccessUsers, requireGrants } from './access/accessFacts'
import { GrantRoleDialog } from './access/GrantRoleDialog'
import { RevokeGrantDialog } from './access/RevokeGrantDialog'
import { RoleGrantsTable } from './access/RoleGrantsTable'
import { permissionIdsFor, requireAccessPermissions, requireAccessRoles, requirePermissionReceipt } from './accessPermissionFacts'
import { requireAccessRoleStatus, requireCreatedAccessRole, requireRenamedAccessRole } from './accessRoleReceipt'
import { organizationQueryScope } from './organizationQueryScope'
import '../../styles/features/access-control.css'

type Tab = 'permissions' | 'members'
type Pending = { kind: 'create' } | { kind: 'rename'; role: AccessRole } | { kind: 'status'; role: AccessRole }
  | { kind: 'grant'; role: AccessRole } | { kind: 'revoke'; grant: UserRoleAssignment }

/**
 * 角色与权限：左侧角色目录，右侧为所选角色的功能权限与已授权人员（反查）。
 * 个人的账号开通与按科室授权在「人员管理」档案中维护；科室默认角色在「机构与科室」中设置。
 */
export function AccessControlManagement({ api, context }: { api: RhnApi; context: ClinicalContext }) {
  const queryClient = useQueryClient()
  const roleTypes = useSystemEnum(api.dictionaries, 'SYS_ACC_ROLE_TYPE')
  const scope = `${organizationQueryScope(api)}:${context.organization.id}:${context.department.id}`
  const roles = useQuery({ queryKey: ['iam-roles', scope], queryFn: async () => requireAccessRoles(await api.identityAccess.roles()) })
  const permissions = useQuery({ queryKey: ['iam-permissions', scope], queryFn: async () => requireAccessPermissions(await api.identityAccess.permissions()) })
  const [selectedId, setSelectedId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [tab, setTab] = useState<Tab>('permissions')
  const [pending, setPending] = useState<Pending>()
  const [feedback, setFeedback] = useState('')
  useEffect(() => { setSelectedId(''); setPending(undefined); setFeedback('') }, [scope])

  const allRoles = useMemo(() => roles.data ?? [], [roles.data])
  const selected = allRoles.find(role => role.id === selectedId)
  useEffect(() => {
    if (allRoles.length && !allRoles.some(role => role.id === selectedId)) setSelectedId(allRoles[0].id)
  }, [allRoles, selectedId])
  const term = keyword.trim().toLowerCase()
  const visibleRoles = allRoles.filter(role => (showInactive || role.status === 'ACTIVE' || role.id === selectedId)
    && (!term || [role.name, role.code, pinyinInitials(role.name)].some(value => value.toLowerCase().includes(term))))

  async function changed(message: string, roleId?: string) {
    setPending(undefined)
    setFeedback(message)
    if (roleId) setSelectedId(roleId)
    await Promise.all(['iam-roles', 'iam-role-members', 'practitioner-access'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  }

  return <MasterDetailPage title="角色与权限"
    description="按角色组合功能权限，并反查已授权人员。人员的账号与按科室授权在「人员管理」中维护，科室默认角色在「机构与科室」中设置。"
    feedback={feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}
    navigationLabel="角色目录"
    navigationHeader={<div className="access-role-toolbar">
      <SearchField label="搜索角色" placeholder="名称、编码或拼音首字母" value={keyword} onChange={setKeyword} />
      <div className="access-role-toolbar__row">
        <Button size="sm" disabled={!roles.isSuccess} onClick={() => setPending({ kind: 'create' })}>新建角色</Button>
        <Switch size="sm" checked={showInactive} onChange={setShowInactive} label="显示停用" />
      </div>
    </div>}
    navigation={roles.isError ? <Alert placement="inline">{errorMessage(roles.error)}<Button size="sm" variant="secondary" onClick={() => void roles.refetch()}>重新加载</Button></Alert>
      : roles.isPending ? <LoadingState label="正在加载角色目录…" />
      : !visibleRoles.length ? <EmptyState icon="settings" title="没有匹配的角色" copy="调整搜索条件或新建角色。" />
      : <div className="access-role-list" role="listbox" aria-label="角色列表">
        {visibleRoles.map(role => <Button key={role.id} variant={role.id === selectedId ? 'secondary' : 'text'} role="option" aria-selected={role.id === selectedId}
          onClick={() => setSelectedId(role.id)}>
          <span className="access-role-list__item"><span className="access-role-list__text"><strong>{role.name}</strong><code>{role.code}</code></span>
            {role.status !== 'ACTIVE' && <StatusBadge tone="neutral">停用</StatusBadge>}</span>
        </Button>)}
      </div>}
    detailLabel="角色详情" detailResetScrollKey={`${selectedId}:${tab}`}
    detailHeader={selected && <header className="access-detail-head">
      <div className="access-detail-head__title"><span className="ui-eyebrow">{roleTypes.name(selected.roleType)}</span>
        <h2>{selected.name}</h2><code>{selected.code}</code>
        <StatusBadge tone={selected.status === 'ACTIVE' ? 'success' : 'neutral'}>{selected.status === 'ACTIVE' ? '启用' : '停用'}</StatusBadge></div>
      <div className="access-detail-head__actions">
        <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'rename', role: selected })}>修改名称</Button>
        <Button size="sm" variant={selected.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={() => setPending({ kind: 'status', role: selected })}>
          {selected.status === 'ACTIVE' ? '停用角色' : '启用角色'}</Button>
      </div>
      <Tabs label="角色详情" value={tab} onChange={setTab} items={[{ value: 'permissions', label: '功能权限', meta: selected.permissionCodes.length },
        { value: 'members', label: '已授权人员' }]} />
    </header>}>
    {!selected ? (roles.isSuccess ? <EmptyState icon="settings" title="选择角色" copy="在左侧选择角色查看功能权限与已授权人员。" /> : <LoadingState label="正在加载…" />)
      : tab === 'permissions'
        ? <RolePermissions key={selected.id} api={api} role={selected} permissions={permissions.data} permissionsError={permissions.error}
          onReload={async () => { await Promise.allSettled([roles.refetch(), permissions.refetch()]) }}
          onSaved={role => { queryClient.setQueryData<AccessRole[]>(['iam-roles', scope], values => values?.map(item => item.id === role.id ? role : item)); setFeedback(`已更新“${role.name}”的功能权限`) }} />
        : <RoleMembers key={selected.id} api={api} role={selected} scope={scope}
          onGrant={() => setPending({ kind: 'grant', role: selected })} onRevoke={grant => setPending({ kind: 'revoke', grant })} />}
    {pending?.kind === 'create' && <CreateRoleDialog api={api} roles={allRoles} onClose={() => setPending(undefined)}
      onDone={role => changed(`已创建角色“${role.name}”`, role.id)} />}
    {pending?.kind === 'rename' && <RenameRoleDialog api={api} role={pending.role} onClose={() => setPending(undefined)}
      onDone={role => changed(`角色已更名为“${role.name}”`)} />}
    {pending?.kind === 'status' && <RoleStatusDialog api={api} role={pending.role} onClose={() => setPending(undefined)}
      onDone={role => changed(`角色“${role.name}”已${role.status === 'ACTIVE' ? '启用' : '停用'}`)} />}
    {pending?.kind === 'grant' && <GrantFromRole api={api} role={pending.role} context={context} scope={scope}
      onClose={() => setPending(undefined)} onDone={message => changed(message)} />}
    {pending?.kind === 'revoke' && <RevokeGrantDialog api={api} grant={pending.grant} onClose={() => setPending(undefined)} onDone={message => changed(message)} />}
  </MasterDetailPage>
}

function RolePermissions({ api, role, permissions, permissionsError, onReload, onSaved }: {
  api: RhnApi; role: AccessRole; permissions?: AccessPermission[]; permissionsError: unknown
  onReload: () => Promise<void>; onSaved: (role: AccessRole) => void
}) {
  const [draft, setDraft] = useState(() => ({ version: role.version, codes: new Set(role.permissionCodes) }))
  const save = useMutation({
    mutationFn: async (codes: Set<string>) => requirePermissionReceipt(
      await api.identityAccess.replaceRolePermissions(role, permissionIdsFor(codes, permissions!)), role, codes),
    onSuccess: next => { setDraft({ version: next.version, codes: new Set(next.permissionCodes) }); onSaved(next) },
  })
  const groups = useMemo(() => {
    const result = new Map<string, AccessPermission[]>()
    for (const permission of permissions ?? []) {
      const label = permission.moduleName || permission.resourceCode
      result.set(label, [...(result.get(label) ?? []), permission])
    }
    return [...result.entries()]
  }, [permissions])
  if (permissionsError) return <Alert placement="inline">权限目录加载失败：{errorMessage(permissionsError)}<Button size="sm" variant="secondary" onClick={() => void onReload()}>重新加载</Button></Alert>
  if (!permissions) return <LoadingState label="正在加载权限目录…" />
  const stale = draft.version !== role.version
  const unknown = [...draft.codes].filter(code => !permissions.some(item => item.code === code))
  const dirty = draft.codes.size !== role.permissionCodes.length || role.permissionCodes.some(code => !draft.codes.has(code))
  const toggle = (code: string, checked: boolean) => setDraft(current => {
    const codes = new Set(current.codes)
    if (checked) codes.add(code); else codes.delete(code)
    return { ...current, codes }
  })
  return <div className="access-permissions">
    <div className="access-permissions__bar">
      <span className="access-hint">已选 {draft.codes.size} 项。只能授予当前账号自身具备的权限；保存后对持有该角色的人员下次请求起生效。</span>
      <Button size="sm" variant="secondary" disabled={!dirty || save.isPending} onClick={() => setDraft({ version: role.version, codes: new Set(role.permissionCodes) })}>撤销修改</Button>
      <Button size="sm" busy={save.isPending} disabled={!dirty || stale || unknown.length > 0} onClick={() => save.mutate(new Set(draft.codes))}>保存权限</Button>
    </div>
    {save.error && <Alert placement="inline">保存未完成：{errorMessage(save.error)}<Button size="sm" variant="secondary" onClick={() => void onReload()}>重新核实角色</Button></Alert>}
    {stale && <Alert placement="inline" tone="warning">角色已被其他人修改，勾选草稿已保留。
      <Button size="sm" variant="secondary" onClick={() => setDraft({ version: role.version, codes: new Set(role.permissionCodes) })}>放弃草稿并载入最新权限</Button></Alert>}
    {unknown.length > 0 && <Alert placement="inline" tone="warning">角色包含目录中未登记的权限：{unknown.join('、')}，不能自动删除，请核实权限目录。</Alert>}
    {!groups.length ? <EmptyState icon="settings" title="暂无权限" copy="请先通过版本迁移注册业务模块及原子权限。" />
      : <div className="access-permission-groups">{groups.map(([moduleName, items]) => <fieldset key={moduleName} disabled={save.isPending}>
        <legend>{moduleName}</legend>
        {items.map(permission => <label key={permission.id}>
          <input type="checkbox" disabled={permission.status !== 'ACTIVE' && !draft.codes.has(permission.code)} checked={draft.codes.has(permission.code)}
            onChange={event => toggle(permission.code, event.target.checked)} />
          <span><strong>{permission.name}</strong><code>{permission.code}</code>{permission.status !== 'ACTIVE' && <small>已停用</small>}</span>
        </label>)}
      </fieldset>)}</div>}
  </div>
}

function RoleMembers({ api, role, scope, onGrant, onRevoke }: {
  api: RhnApi; role: AccessRole; scope: string; onGrant: () => void; onRevoke: (grant: UserRoleAssignment) => void
}) {
  const [includeExpired, setIncludeExpired] = useState(false)
  const [keyword, setKeyword] = useState('')
  const members = useQuery({ queryKey: ['iam-role-members', scope, role.id, includeExpired],
    queryFn: async () => requireGrants(await api.identityAccess.roleMembers(role.id, includeExpired)) })
  const term = keyword.trim().toLowerCase()
  const rows = (members.data ?? []).filter(row => !term || [row.practitionerName, row.practitionerCode, row.username, row.departmentName]
    .some(value => value?.toLowerCase().includes(term)))
  const people = new Set((members.data ?? []).filter(row => row.effective).map(row => row.userId)).size
  return <div className="access-members">
    <div className="access-members__bar">
      <SearchField label="搜索已授权人员" placeholder="姓名、工号、账号或科室" value={keyword} onChange={setKeyword} />
      <Switch size="sm" checked={includeExpired} onChange={setIncludeExpired} label="含已失效" />
      <span className="access-hint">{members.isSuccess ? `当前有效 ${people} 人` : ''}</span>
      <Button disabled={role.status !== 'ACTIVE'} onClick={onGrant}>授予人员</Button>
    </div>
    {members.isPending ? <LoadingState label="正在反查已授权人员…" />
      : members.isError ? <Alert placement="inline">{errorMessage(members.error)}<Button size="sm" variant="secondary" onClick={() => void members.refetch()}>重新加载</Button></Alert>
      : rows.length ? <RoleGrantsTable rows={rows} view="role" canRevoke busy={false} onRevoke={onRevoke} label="已授权人员" />
      : <EmptyState icon="residents" title={term ? '没有匹配的人员' : '暂无授权人员'} copy="仅列出当前账号可管理范围内的授权；按科室默认或在人员档案中授予后显示在此。" />}
  </div>
}

function GrantFromRole({ api, role, context, scope, onClose, onDone }: {
  api: RhnApi; role: AccessRole; context: ClinicalContext; scope: string; onClose: () => void; onDone: (message: string) => Promise<void>
}) {
  const users = useQuery({ queryKey: ['iam-users', scope], queryFn: async () => requireAccessUsers(await api.identityAccess.users()) })
  if (users.isError) return <Dialog title="授予人员" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    <Alert placement="inline">{errorMessage(users.error)}<Button size="sm" variant="secondary" onClick={() => void users.refetch()}>重新加载</Button></Alert></Dialog>
  if (!users.isSuccess) return <Dialog title="授予人员" onClose={onClose}><LoadingState label="正在加载可管理的账号…" /></Dialog>
  return <GrantRoleDialog api={api} title="授予人员" eyebrow={role.name} role={role} users={users.data}
    targets={[{ key: context.department.id, label: `${context.organization.name} · ${context.department.name}`, dataScopeType: 'DEPARTMENT',
      organizationId: context.organization.id, departmentId: context.department.id }]}
    onClose={onClose} onDone={onDone} />
}

function CreateRoleDialog({ api, roles, onClose, onDone }: {
  api: RhnApi; roles: AccessRole[]; onClose: () => void; onDone: (role: AccessRole) => Promise<void>
}) {
  const roleTypes = useSystemEnum(api.dictionaries, 'SYS_ACC_ROLE_TYPE')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [roleType, setRoleType] = useState<'BUSINESS' | 'CUSTOM'>('BUSINESS')
  const [validation, setValidation] = useState('')
  const mutation = useMutation({
    mutationFn: async () => {
      const input = { code, name, roleType }
      return requireCreatedAccessRole(await api.identityAccess.createRole(input), input, roles)
    },
    onSuccess: role => onDone(role),
  })
  const submit = () => {
    setValidation('')
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code.trim())) { setValidation('角色编码只能包含大写字母、数字和下划线，且必须以字母开头'); return }
    if (!name.trim()) { setValidation('请填写角色名称'); return }
    if (roles.some(role => role.code === code.trim())) { setValidation('角色编码已存在'); return }
    mutation.mutate()
  }
  return <Dialog title="新建角色" onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} onClick={submit}>创建</Button></>}>
    {(validation || mutation.error) && <Alert placement="inline">{validation || `创建未完成：${errorMessage(mutation.error)}`}</Alert>}
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="角色编码" required hint="创建后不可修改"><input value={code} maxLength={64} placeholder="例如 OUTPATIENT_NURSE"
        onChange={event => setCode(event.target.value.toUpperCase())} /></FormField>
      <FormField label="角色名称" required><input value={name} maxLength={128} placeholder="例如 门诊护士" onChange={event => setName(event.target.value)} /></FormField>
      <FormField label="角色类型"><Select value={roleType} clearable={false} onChange={value => setRoleType(value as 'BUSINESS' | 'CUSTOM')}
        options={[{ value: 'BUSINESS', label: roleTypes.name('BUSINESS') }, { value: 'CUSTOM', label: roleTypes.name('CUSTOM') }]} /></FormField>
    </fieldset>
    <p className="access-hint">新角色没有任何权限，创建后在「功能权限」中勾选。</p>
  </Dialog>
}

function RenameRoleDialog({ api, role, onClose, onDone }: {
  api: RhnApi; role: AccessRole; onClose: () => void; onDone: (role: AccessRole) => Promise<void>
}) {
  const [name, setName] = useState(role.name)
  const mutation = useMutation({
    mutationFn: async () => requireRenamedAccessRole(await api.identityAccess.updateRole(role, { name: name.trim(), status: role.status }), role, name),
    onSuccess: next => onDone(next),
  })
  return <Dialog title="修改角色名称" eyebrow={role.code} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button busy={mutation.isPending} disabled={!name.trim() || name.trim() === role.name} onClick={() => mutation.mutate()}>保存</Button></>}>
    {mutation.error && <Alert placement="inline">保存未完成：{errorMessage(mutation.error)}</Alert>}
    <fieldset disabled={mutation.isPending} className="access-form">
      <FormField label="角色名称" required><input value={name} maxLength={128} onChange={event => setName(event.target.value)} /></FormField>
    </fieldset>
  </Dialog>
}

function RoleStatusDialog({ api, role, onClose, onDone }: {
  api: RhnApi; role: AccessRole; onClose: () => void; onDone: (role: AccessRole) => Promise<void>
}) {
  const target = role.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  const mutation = useMutation({
    mutationFn: async () => requireAccessRoleStatus(await api.identityAccess.updateRole(role, { name: role.name, status: target }), role, target),
    onSuccess: next => onDone(next),
  })
  return <Dialog title={`${target === 'INACTIVE' ? '停用' : '启用'}角色“${role.name}”`} onClose={() => { if (!mutation.isPending) onClose() }} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button variant={target === 'INACTIVE' ? 'danger' : 'primary'} busy={mutation.isPending} onClick={() => mutation.mutate()}>
        {target === 'INACTIVE' ? '确认停用' : '确认启用'}</Button></>}>
    {mutation.error && <Alert placement="inline">操作未完成：{errorMessage(mutation.error)}</Alert>}
    <p>{target === 'INACTIVE'
      ? '停用后持有该角色的人员立即失去其权限，也不能再授予或作为科室默认角色自动授予；授权记录和权限配置保留，重新启用后恢复。'
      : '启用后，现有有效授权立即恢复该角色的权限。'}</p>
  </Dialog>
}
