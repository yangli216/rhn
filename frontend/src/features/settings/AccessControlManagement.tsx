import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import '../../styles/features/billing-settlement.css'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  errorMessage, type AccessPermission, type AccessRole, type RhnApi, type UserRoleAssignment,
} from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, LoadingState, PageHeader, Panel, PanelHead, Select, StatusBadge } from '../../shared/ui'
import { permissionIdsFor, requireAccessPermissions, requireAccessRoles, requirePermissionReceipt } from './accessPermissionFacts'
import { requireAccessRoleStatus, requireCreatedAccessRole, type CreateAccessRoleInput } from './accessRoleReceipt'
import { requireAccessUsers, requireGrantedAssignment, requireRevokedAssignment, requireUserAssignments } from './accessAssignmentFacts'
import type { ClinicalContext } from '../../app/AppShell'

const apiScopes = new WeakMap<RhnApi, number>()
let nextScope = 0
function scopeFor(api: RhnApi) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextScope)
  return apiScopes.get(api)!
}

export function AccessControlManagement({ api, context }: { api: RhnApi; context: ClinicalContext }) {
  const queryClient = useQueryClient()
  const scope = `${scopeFor(api)}:${context.organization.id}:${context.department.id}`
  const roles = useQuery({ queryKey: ['iam-roles', scope], queryFn: async () => requireAccessRoles(await api.identityAccess.roles()) })
  const permissions = useQuery({ queryKey: ['iam-permissions', scope], queryFn: async () => requireAccessPermissions(await api.identityAccess.permissions()) })
  const users = useQuery({ queryKey: ['iam-users', scope], queryFn: async () => requireAccessUsers(await api.identityAccess.users()) })
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [permissionDraft, setPermissionDraft] = useState<{ role: AccessRole; codes: Set<string> }>()
  const selectedPermissions = permissionDraft?.codes ?? new Set<string>()
  const [roleCreated, setRoleCreated] = useState(0)
  const [statusCommand, setStatusCommand] = useState<{ role: AccessRole; target: AccessRole['status'] }>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const rolesReady = roles.isSuccess && !roles.isFetching
  const usersReady = users.isSuccess && !users.isFetching
  const selectedUser = usersReady ? users.data.find(user => user.id === selectedUserId) : undefined
  const assignmentScope = { organizationId: context.organization.id, departmentId: context.department.id }
  const assignmentSession = useRef(0)
  const currentAssignment = useRef({ scope, userId: selectedUserId })
  currentAssignment.current = { scope, userId: selectedUserId }
  const permissionsReady = permissions.isSuccess && !permissions.isFetching
  const current = useRef({ scope, roleId: selectedRoleId })
  current.current = { scope, roleId: selectedRoleId }
  const permissionSession = useRef(0)
  useEffect(() => {
    assignmentSession.current += 1; permissionSession.current += 1; setStatusCommand(undefined); setRoleCreated(0); setSelectedRoleId(''); setSelectedUserId(''); setPermissionDraft(undefined); setFeedback(''); setOperationError('')
  }, [scope])
  const selectedRole = rolesReady ? roles.data.find((role) => role.id === selectedRoleId) : undefined
  const assignments = useQuery({
    queryKey: ['iam-assignments', selectedUserId, scope],
    queryFn: async () => requireUserAssignments(await api.identityAccess.assignments(selectedUserId), selectedUserId, assignmentScope),
    enabled: Boolean(selectedUser),
  })

  const assignmentsReady = Boolean(selectedUser) && assignments.isSuccess && !assignments.isFetching
  async function reloadAssignments() {
    await Promise.allSettled([users.refetch(), roles.refetch(), selectedUserId ? queryClient.fetchQuery({
      queryKey: ['iam-assignments', selectedUserId, scope], staleTime: 0,
      queryFn: async () => requireUserAssignments(await api.identityAccess.assignments(selectedUserId), selectedUserId, assignmentScope),
    }) : Promise.resolve()])
  }

  useEffect(() => {
    if (!selectedRoleId && roles.data?.length) setSelectedRoleId(roles.data[0].id)
  }, [roles.data, selectedRoleId])

  useEffect(() => {
    if (usersReady && users.data.length && !users.data.some(user => user.id === selectedUserId)) setSelectedUserId(users.data[0].id)
  }, [selectedUserId, users.data, usersReady])

  useEffect(() => {
    if (selectedRole && permissionDraft?.role.id !== selectedRole.id) {
      setPermissionDraft({ role: selectedRole, codes: new Set(selectedRole.permissionCodes) })
    }
  }, [selectedRole, permissionDraft?.role.id])

  const draftMatches = Boolean(selectedRole && permissionDraft?.role.id === selectedRole.id)
  const draftVersionCurrent = draftMatches && permissionDraft?.role.version === selectedRole?.version
  const unknownCodes = permissionsReady && draftMatches ? [...selectedPermissions].filter(code => !permissions.data.some(item => item.code === code)) : []
  const permissionFactsReady = rolesReady && permissionsReady && draftVersionCurrent && !unknownCodes.length
  async function reloadPermissionFacts() { await Promise.allSettled([roles.refetch(), permissions.refetch()]) }

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, AccessPermission[]>()
    for (const permission of permissionsReady ? permissions.data : []) {
      const label = permission.moduleName || permission.resourceCode
      groups.set(label, [...(groups.get(label) ?? []), permission])
    }
    return [...groups.entries()]
  }, [permissions.data, permissionsReady])

  function succeed(message: string) {
    setFeedback(message)
    setOperationError('')
  }

  function fail(error: unknown) {
    setOperationError(errorMessage(error))
    setFeedback('')
  }

  type RoleCommandContext = { scope: string; roleId: string; session: number }
  function roleCommandContext(): RoleCommandContext {
    setFeedback(''); setOperationError('')
    return { scope, roleId: selectedRoleId, session: permissionSession.current }
  }
  function currentRoleCommand(submitted?: RoleCommandContext) {
    return submitted?.scope === current.current.scope && submitted.roleId === current.current.roleId && submitted.session === permissionSession.current
  }
  function roleCommandFailed(_error: unknown, _input: unknown, submitted?: RoleCommandContext) {
    if (!currentRoleCommand(submitted)) return
    setFeedback('')
    void queryClient.invalidateQueries({ queryKey: ['iam-roles', scope] })
  }
  function roleCommandError(mutation: { context?: RoleCommandContext; error: unknown }) {
    return currentRoleCommand(mutation.context) && mutation.error ? `操作结果未确认：${errorMessage(mutation.error)}` : undefined
  }
  const createRole = useMutation({
    mutationFn: async (input: CreateAccessRoleInput) => {
      if (!rolesReady) throw new Error('角色目录尚未确认，请重新加载')
      const before = roles.data, command = { ...input }
      if (before.some(role => role.code === command.code.trim().toUpperCase())) throw new Error('角色编码已存在，请核实上次创建结果，未重复提交')
      return requireCreatedAccessRole(await api.identityAccess.createRole(command), command, before)
    },
    onMutate: roleCommandContext,
    onSuccess: (role, _input, submitted) => {
      if (!currentRoleCommand(submitted)) return
      queryClient.setQueryData<AccessRole[]>(['iam-roles', scope], values => values ? values.some(value => value.id === role.id) ? values : [...values, role] : undefined)
      setSelectedRoleId(role.id); setRoleCreated(value => value + 1); succeed(`已创建角色“${role.name}”`)
    },
    onError: roleCommandFailed,
  })
  const savePermissions = useMutation({
    mutationFn: async (command: { role: AccessRole; codes: Set<string>; permissionIds: string[] }) =>
      requirePermissionReceipt(await api.identityAccess.replaceRolePermissions(command.role, command.permissionIds), command.role, command.codes),
    onMutate: () => { setFeedback(''); setOperationError(''); return { scope, roleId: selectedRoleId, session: permissionSession.current } },
    onSuccess: (role, _input, submitted) => {
      if (submitted.scope !== current.current.scope || submitted.roleId !== current.current.roleId || submitted.session !== permissionSession.current) return
      queryClient.setQueryData<AccessRole[]>(['iam-roles', scope], (values) => values?.map(item => item.id === role.id ? role : item))
      setPermissionDraft({ role, codes: new Set(role.permissionCodes) })
      succeed(`已更新角色“${role.name}”的功能权限`)
    },
    onError: (error, _input, submitted) => {
      if (submitted?.scope !== current.current.scope || submitted.roleId !== current.current.roleId || submitted.session !== permissionSession.current) return
      fail(error)
    },
  })
  function submitPermissions() {
    if (!permissionFactsReady || !permissionDraft || savePermissions.isPending || createRole.isPending || changeRoleStatus.isPending) return
    try {
      const codes = new Set(permissionDraft.codes)
      savePermissions.mutate({ role: permissionDraft.role, codes, permissionIds: permissionIdsFor(codes, permissions.data!) })
    } catch (error) { fail(error) }
  }
  const changeRoleStatus = useMutation({
    mutationFn: async (command: { role: AccessRole; target: AccessRole['status'] }) => {
      if (!rolesReady || selectedRoleId !== command.role.id) throw new Error('原角色尚未确认，请重新加载')
      return requireAccessRoleStatus(await api.identityAccess.updateRole(command.role, { name: command.role.name, status: command.target }), command.role, command.target)
    },
    onMutate: roleCommandContext,
    onSuccess: (role, _input, submitted) => {
      if (!currentRoleCommand(submitted)) return
      queryClient.setQueryData<AccessRole[]>(['iam-roles', scope], values => values?.map(item => item.id === role.id ? role : item))
      setStatusCommand(undefined)
      succeed(`角色“${role.name}”已${role.status === 'ACTIVE' ? '启用' : '停用'}`)
    },
    onError: roleCommandFailed,
  })
  type AssignmentContext = { scope: string; userId: string; session: number }
  function assignmentContext(): AssignmentContext {
    assignmentSession.current += 1
    setFeedback(''); setOperationError('')
    return { scope, userId: selectedUserId, session: assignmentSession.current }
  }
  function assignmentCurrent(submitted?: AssignmentContext) {
    return submitted?.scope === currentAssignment.current.scope && submitted.userId === currentAssignment.current.userId
      && submitted.session === assignmentSession.current
  }
  function assignmentFailed(_error: unknown, _input: unknown, submitted?: AssignmentContext) {
    if (!assignmentCurrent(submitted)) return
    setFeedback('')
    void queryClient.invalidateQueries({ queryKey: ['iam-assignments', submitted!.userId, submitted!.scope] })
  }
  const assignRole = useMutation({
    mutationFn: async (input: { roleId: string; validTo?: string | null }) => {
      if (!selectedUser || !assignmentsReady || !rolesReady) throw new Error('用户、角色或授权目录尚未确认，请重新加载')
      const account = selectedUser, before = assignments.data!, range = { ...assignmentScope }
      const role = roles.data.find(value => value.id === input.roleId && value.status === 'ACTIVE')
      if (!role) throw new Error('所选角色已不在当前启用目录中，请重新选择')
      if (before.some(value => value.roleId === role.id && value.effective)) throw new Error('该用户在当前科室已有有效授权，请核实结果，未重复提交')
      const command = { roleId: role.id, ...range, dataScopeType: 'DEPARTMENT' as const, validTo: input.validTo || null }
      return requireGrantedAssignment(await api.identityAccess.assignRole(account.id, command), account, role, range, command.validTo, before)
    },
    onMutate: assignmentContext,
    onSuccess: (record, _input, submitted) => {
      if (!assignmentCurrent(submitted)) return
      queryClient.setQueryData<UserRoleAssignment[]>(['iam-assignments', submitted.userId, submitted.scope], values => values ? values.some(value => value.id === record.id) ? values : [...values, record] : undefined)
      succeed('用户角色授权记录已保存')
    },
    onError: assignmentFailed,
  })
  const revoke = useMutation({
    mutationFn: async (before: UserRoleAssignment) => {
      if (!selectedUser || !assignmentsReady || before.userId !== selectedUser.id
        || !assignments.data!.some(value => value.id === before.id && value.effective)) throw new Error('原用户授权尚未确认，请重新加载')
      const range = { ...assignmentScope }, accountId = before.userId, assignmentId = before.id
      await api.identityAccess.revokeAssignment(assignmentId)
      return requireRevokedAssignment(await api.identityAccess.assignments(accountId), before, range)
    },
    onMutate: assignmentContext,
    onSuccess: (records, _input, submitted) => {
      if (!assignmentCurrent(submitted)) return
      queryClient.setQueryData(['iam-assignments', submitted.userId, submitted.scope], records)
      succeed('用户角色授权已撤销')
    },
    onError: assignmentFailed,
  })
  const assignmentBusy = assignRole.isPending || revoke.isPending
  const assignmentError = assignmentCurrent(assignRole.context) && assignRole.error ? errorMessage(assignRole.error)
    : assignmentCurrent(revoke.context) && revoke.error ? errorMessage(revoke.error) : undefined

  const queryError = roles.error || permissions.error || users.error || assignments.error
  return <>
    <PageHeader compact eyebrow="平台管理 · 身份权限" title="角色与功能授权"
      description="按角色组合原子功能权限，并在当前机构、科室范围内给用户分配有效期授权。所有变更保留审计事件。" />
    {feedback && <Alert tone="success" className="iam-feedback">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="iam-feedback">{operationError || errorMessage(queryError)}</Alert>}

    <section className="iam-overview" aria-label="权限管理工作区">
      <Panel className="iam-role-panel">
        <PanelHead title="角色" meta={rolesReady ? `${roles.data.length} 个` : '数量待确认'} />
        {!rolesReady && <AccessFactsState label="角色目录" loading={roles.isPending || roles.isFetching} onRetry={reloadPermissionFacts} />}
        <div className="iam-role-list" role="listbox" aria-label="角色列表">
          {rolesReady && roles.data.map((role) => <Button variant={role.id === selectedRoleId ? 'secondary' : 'text'} role="option" aria-selected={role.id === selectedRoleId}
            key={role.id} onClick={() => { permissionSession.current += 1; setSelectedRoleId(role.id); setFeedback(''); setOperationError('') }}>
            <span className="iam-role-list__content"><span className="iam-role-list__text"><strong>{role.name}</strong><code>{role.code}</code></span>
            <StatusBadge tone={role.status === 'ACTIVE' ? 'success' : 'neutral'}>{role.status === 'ACTIVE' ? '启用' : '停用'}</StatusBadge></span>
          </Button>)}
        </div>
        {roleCommandError(createRole) && <div role="alert"><p>{roleCommandError(createRole)}</p>
          <Button variant="secondary" disabled={createRole.isPending} onClick={() => void reloadPermissionFacts()}>重新核实角色创建结果</Button></div>}
        <CreateRoleForm key={scope} busy={createRole.isPending} available={rolesReady && !savePermissions.isPending && !changeRoleStatus.isPending}
          saved={roleCreated} onSubmit={(input) => createRole.mutate(input)} />
      </Panel>

      <Panel className="iam-permission-panel">
        <PanelHead title="功能权限" meta={selectedRole ? selectedRole.name : '请选择角色'} actions={<div className="iam-role-actions">
          <Button size="sm" variant="text" disabled={!selectedRole || savePermissions.isPending || createRole.isPending} busy={changeRoleStatus.isPending}
            onClick={() => {
              if (selectedRole) { changeRoleStatus.reset(); setFeedback(''); setStatusCommand({ role: selectedRole, target: selectedRole.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }
            }}>{selectedRole?.status === 'ACTIVE' ? '停用角色' : '启用角色'}</Button>
          <Button size="sm" disabled={!permissionFactsReady || changeRoleStatus.isPending || createRole.isPending} busy={savePermissions.isPending} onClick={submitPermissions}>
            保存权限
          </Button></div>} />
        {!permissionsReady && <AccessFactsState label="权限目录" loading={permissions.isPending || permissions.isFetching} onRetry={reloadPermissionFacts} />}
        {operationError && <div role="alert"><p>{operationError}</p><Button variant="secondary" disabled={savePermissions.isPending} onClick={() => void reloadPermissionFacts()}>重新核实角色权限</Button></div>}
        {draftMatches && !draftVersionCurrent && <div role="alert"><p>角色版本已变化，勾选草稿已保留。请核实后重新载入。</p>
          <Button variant="secondary" disabled={savePermissions.isPending} onClick={() => {
            if (selectedRole) setPermissionDraft({ role: selectedRole, codes: new Set(selectedRole.permissionCodes) })
          }}>放弃勾选草稿并载入最新权限</Button></div>}
        {unknownCodes.length > 0 && <div role="alert"><p>角色包含目录中未确认的权限：{unknownCodes.join('、')}。不能自动删除这些权限。</p>
          <Button variant="secondary" onClick={() => void reloadPermissionFacts()}>重新核实权限目录</Button></div>}
        {permissionsReady && permissionGroups.length === 0 && <EmptyState icon="settings" title="暂无权限"
          copy="请先通过版本迁移注册业务模块及原子权限。" />}
        <div className="iam-permission-groups">
          {permissionGroups.map(([moduleName, items]) => <fieldset key={moduleName} disabled={!permissionFactsReady || savePermissions.isPending || changeRoleStatus.isPending || createRole.isPending}>
            <legend>{moduleName}</legend>
            {items.map((permission) => <label key={permission.id}>
              <input type="checkbox" disabled={permission.status !== 'ACTIVE' && !selectedPermissions.has(permission.code)} checked={selectedPermissions.has(permission.code)} onChange={(event) => {
                setPermissionDraft(current => {
                  if (!current) return current
                  const codes = new Set(current.codes)
                  if (event.target.checked) codes.add(permission.code); else codes.delete(permission.code)
                  return { ...current, codes }
                })
              }} />
              <span><strong>{permission.name}</strong><code>{permission.code}</code>{permission.status !== 'ACTIVE' && <small>已停用</small>}</span>
            </label>)}
          </fieldset>)}
        </div>
      </Panel>

      <Panel className="iam-assignment-panel">
        <PanelHead title="用户授权" meta={`${context.organization.name} · ${context.department.name}`} />
        {!usersReady && <AccessFactsState label="用户目录" loading={users.isPending || users.isFetching} onRetry={reloadAssignments} />}
        {usersReady && !users.data.length && <EmptyState icon="residents" title="暂无用户账号" copy="当前目录没有可供授权的用户。" />}
        {assignmentError && <div role="alert"><p>授权操作结果未确认：{assignmentError}</p>
          <Button variant="secondary" disabled={assignmentBusy} onClick={() => void reloadAssignments()}>重新核实用户授权</Button></div>}
        <label className="iam-native-field"><span>用户账号</span><Select value={selectedUserId}
          onChange={id => { assignmentSession.current += 1; setSelectedUserId(id); setFeedback(''); setOperationError('') }}
          disabled={!usersReady || assignmentBusy} clearable={false} loading={users.isFetching}
          options={(usersReady ? users.data : []).map((user) => ({ value: user.id, label: user.username }))} /></label>
        <AssignRoleForm key={`${scope}:${selectedUserId}`} roles={(rolesReady ? roles.data : []).filter((role) => role.status === 'ACTIVE')}
          busy={assignmentBusy} available={rolesReady && assignmentsReady} onSubmit={(input) => assignRole.mutate(input)} />
        <div className="iam-assignment-list">
          {selectedUser && !assignmentsReady && <AccessFactsState label="用户授权" loading={assignments.isPending || assignments.isFetching} onRetry={reloadAssignments} />}
          {assignmentsReady && assignments.data!.map((assignment) => <article key={assignment.id} className={!assignment.effective ? 'is-expired' : ''}>
            <div><strong>{assignment.roleName}</strong><code>{assignment.roleCode}</code></div>
            <p>{assignment.organizationName} · {assignment.departmentName}</p>
            <small>{formatValidity(assignment.validFrom, assignment.validTo)} · {assignment.effective ? '授权有效期内' : '未处于授权有效期'}</small>
            {assignment.effective && <Button size="sm" variant="text" busy={revoke.isPending} disabled={assignmentBusy}
              onClick={() => { if (!assignmentBusy) revoke.mutate(assignment) }}>撤销</Button>}
          </article>)}
          {assignmentsReady && assignments.data!.length === 0 &&
            <EmptyState icon="residents" title="暂无角色授权" copy="可在上方为当前用户分配角色。" />}
        </div>
      </Panel>
    </section>
    {statusCommand && <Dialog title={`${statusCommand.target === 'INACTIVE' ? '确认停用' : '确认启用'}角色“${statusCommand.role.name}”`}
      onClose={() => { if (!changeRoleStatus.isPending) setStatusCommand(undefined) }} closeOnBackdrop={false}
      footer={<><Button variant="secondary" disabled={changeRoleStatus.isPending} onClick={() => setStatusCommand(undefined)}>取消</Button>
        <Button variant={statusCommand.target === 'INACTIVE' ? 'danger' : 'primary'} busy={changeRoleStatus.isPending}
          disabled={!rolesReady || selectedRoleId !== statusCommand.role.id || createRole.isPending || savePermissions.isPending}
          onClick={() => { if (!changeRoleStatus.isPending) changeRoleStatus.mutate(statusCommand) }}>
          {statusCommand.target === 'INACTIVE' ? '确认停用' : '确认启用'}</Button></>}>
      <p>本次仅修改该角色状态，已有权限配置保持不变。</p>
      {roleCommandError(changeRoleStatus) && <div role="alert"><p>{roleCommandError(changeRoleStatus)}</p>
        <Button variant="secondary" disabled={changeRoleStatus.isPending} onClick={() => void reloadPermissionFacts()}>重新核实角色状态</Button></div>}
      {(!rolesReady || selectedRoleId !== statusCommand.role.id) && <AccessFactsState label="原角色目录" loading={roles.isFetching} onRetry={reloadPermissionFacts} />}
    </Dialog>}
  </>
}

function AccessFactsState({ label, loading, onRetry }: { label: string; loading: boolean; onRetry: () => Promise<void> }) {
  return loading ? <LoadingState label={`正在核实${label}…`} /> : <div role="alert"><p>{label}尚未确认，不能据此判断有无记录。</p>
    <Button variant="secondary" onClick={() => void onRetry()}>重新加载{label}</Button></div>
}

function CreateRoleForm({ busy, available, saved, onSubmit }: {
  busy: boolean; available: boolean; saved: number
  onSubmit: (input: { code: string; name: string; roleType: AccessRole['roleType'] }) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  useEffect(() => { setCode(''); setName('') }, [saved])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !available || !code.trim() || !name.trim()) return
    onSubmit({ code, name, roleType: 'BUSINESS' })
  }
  return <form className="iam-create-role" inert={busy} onSubmit={submit}>
    <strong>新建业务角色</strong>
    <FormField label="角色编码" required><input value={code} maxLength={64} placeholder="例如 PHARMACIST"
      onChange={(event) => setCode(event.target.value.toUpperCase())} /></FormField>
    <FormField label="角色名称" required><input value={name} maxLength={128} placeholder="例如 门诊药师"
      onChange={(event) => setName(event.target.value)} /></FormField>
    <Button size="sm" type="submit" busy={busy} disabled={!available}>创建角色</Button>
  </form>
}

function AssignRoleForm({ roles, busy, available, onSubmit }: {
  roles: AccessRole[]
  busy: boolean; available: boolean
  onSubmit: (input: { roleId: string; validTo?: string | null }) => void
}) {
  const [roleId, setRoleId] = useState('')
  const [validTo, setValidTo] = useState('')
  const [dateError, setDateError] = useState('')
  useEffect(() => { if (!roleId && roles.length) setRoleId(roles[0].id) }, [roleId, roles])
  return <form className="iam-assign-form" inert={busy} onSubmit={(event) => {
    event.preventDefault()
    if (busy || !available || !roles.some(role => role.id === roleId)) return
    if (validTo && (!Number.isFinite(Date.parse(validTo)) || Date.parse(validTo) <= Date.now())) {
      setDateError('失效时间必须是有效的未来时间'); return
    }
    setDateError('')
    onSubmit({ roleId, validTo: validTo ? new Date(validTo).toISOString() : null })
  }}>
    <label className="iam-native-field"><span>分配角色</span><Select value={roleId} onChange={setRoleId}
      clearable={false} showValue options={roles.map((role) => ({ value: role.id, label: role.name,
        secondaryText: role.code }))} /></label>
    <label className="iam-native-field"><span>失效时间（可选）</span><input type="datetime-local" value={validTo}
      onChange={(event) => setValidTo(event.target.value)} /></label>
    {dateError && <p role="alert">{dateError}</p>}
    <Button size="sm" type="submit" busy={busy} disabled={!available || !roles.some(role => role.id === roleId)}>授予当前科室角色</Button>
  </form>
}

function formatValidity(from: string, to?: string | null) {
  const start = new Date(from).toLocaleString('zh-CN', { hour12: false })
  const end = to ? new Date(to).toLocaleString('zh-CN', { hour12: false }) : '长期有效'
  return `${start} — ${end}`
}
