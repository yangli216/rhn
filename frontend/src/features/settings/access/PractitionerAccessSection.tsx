import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type PractitionerDetail, type RhnApi, type UserRoleAssignment } from '../../../shared/rhnApi'
import { Alert, Button, LoadingState, StatusBadge, Switch } from '../../../shared/ui'
import { requireAccessRoles } from '../accessPermissionFacts'
import { organizationQueryScope } from '../organizationQueryScope'
import { grantOpen, requirePractitionerAccess, scopeText } from './accessFacts'
import { GrantRoleDialog, type GrantTarget } from './GrantRoleDialog'
import { OpenAccountDialog } from './OpenAccountDialog'
import { RevokeGrantDialog } from './RevokeGrantDialog'
import { RoleGrantsTable } from './RoleGrantsTable'
import '../../../styles/features/access-control.css'

type Pending = { kind: 'open' } | { kind: 'grant' } | { kind: 'revoke'; grant: UserRoleAssignment }

/** 人员档案中的「账号与角色」：开通账号、查看科室默认与手工授权、自定义添加或撤销角色。 */
export function PractitionerAccessSection({ api, detail, canManage, onChanged }: {
  api: RhnApi; detail: PractitionerDetail; canManage: boolean; onChanged: (message: string) => Promise<void>
}) {
  const person = detail.practitioner
  const scope = organizationQueryScope(api)
  const [pending, setPending] = useState<Pending>()
  const [showHistory, setShowHistory] = useState(false)
  const access = useQuery({ queryKey: ['practitioner-access', person.id, scope], enabled: canManage,
    queryFn: async () => requirePractitionerAccess(await api.identityAccess.practitionerAccess(person.id), person.id) })
  const roles = useQuery({ queryKey: ['iam-roles', scope], enabled: pending?.kind === 'grant',
    queryFn: async () => requireAccessRoles(await api.identityAccess.roles()) })
  if (!canManage) return <p className="personnel-hint">登录账号与角色授权需要「管理角色与授权」权限。</p>
  if (access.isPending) return <LoadingState label="正在加载账号与授权…" />
  if (access.isError) return <Alert placement="inline">{errorMessage(access.error)}<Button size="sm" variant="secondary" onClick={() => void access.refetch()}>重新加载</Button></Alert>

  const { account, assignments } = access.data
  const visible = showHistory ? assignments : assignments.filter(item => grantOpen(item))
  const today = new Date().toLocaleDateString('sv-SE')
  const managed = access.data.scope
  const targets: GrantTarget[] = [...new Map(detail.assignments
    .filter(item => item.sdPersonnelStatus === 'ACTIVE' && (!item.validTo || item.validTo >= today))
    .filter(item => managed.scopeType === 'TENANT' || item.organizationId === managed.organizationId
      && (managed.scopeType === 'ORGANIZATION' || item.departmentId === managed.departmentId))
    .map(item => [item.departmentId, { key: item.departmentId, label: `${item.organizationName} · ${item.departmentName}`, dataScopeType: 'DEPARTMENT' as const,
      organizationId: item.organizationId, departmentId: item.departmentId }])).values()]
  const done = async (message: string) => { setPending(undefined); await onChanged(message) }
  const active = person.sdPersonnelStatus === 'ACTIVE'

  return <>
    <div className="access-account">
      {account ? <><span>登录账号 <code>{account.username}</code></span>
        <StatusBadge tone={account.status === 'ACTIVE' ? 'success' : 'neutral'}>{account.status === 'ACTIVE' ? '启用' : '停用'}</StatusBadge></>
        : <span className="personnel-muted">未开通登录账号</span>}
      <span className="personnel-muted">可管理范围：{scopeText(managed)}</span>
      <div className="personnel-section__actions">
        {!account && active && <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'open' })}>开通账号</Button>}
        {account && <Button size="sm" variant="secondary" disabled={account.status !== 'ACTIVE'} onClick={() => setPending({ kind: 'grant' })}>添加角色</Button>}
        {account && <Switch size="sm" checked={showHistory} onChange={setShowHistory} label="显示已失效" />}
      </div>
    </div>
    {account && (visible.length ? <RoleGrantsTable rows={visible} view="person" canRevoke busy={false} label="角色授权"
      onRevoke={grant => setPending({ kind: 'revoke', grant })} />
      : <p className="personnel-hint">{assignments.length ? '没有有效授权，可打开「显示已失效」查看历史。' : '尚无角色授权。'}</p>)}
    <p className="personnel-hint">科室默认角色在任职开始时自动授予、任职结束（含调岗、离职）时自动失效；手工授予的角色不随任职变化，离职时请另行撤销。只显示当前可管理范围内的授权。</p>
    {pending?.kind === 'open' && <OpenAccountDialog api={api} practitionerId={person.id} practitionerName={person.fullName}
      suggestedUsername={person.code} onClose={() => setPending(undefined)} onDone={done} />}
    {pending?.kind === 'grant' && account && (roles.isSuccess
      ? <GrantRoleDialog api={api} title="添加角色" eyebrow={person.fullName} user={account} roles={roles.data} targets={targets}
        onClose={() => setPending(undefined)} onDone={done} />
      : roles.isError ? <Alert placement="inline">角色目录加载失败：{errorMessage(roles.error)}<Button size="sm" variant="secondary" onClick={() => void roles.refetch()}>重新加载</Button></Alert>
      : <LoadingState label="正在加载角色目录…" />)}
    {pending?.kind === 'revoke' && <RevokeGrantDialog api={api} grant={pending.grant} onClose={() => setPending(undefined)} onDone={done} />}
  </>
}
