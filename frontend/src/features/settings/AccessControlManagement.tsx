import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  errorMessage, type AccessPermission, type AccessRole, type RhnApi,
} from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, PanelHead, Select, StatusBadge } from '../../shared/ui'
import type { ClinicalContext } from '../../app/AppShell'

export function AccessControlManagement({ api, context }: { api: RhnApi; context: ClinicalContext }) {
  const queryClient = useQueryClient()
  const roles = useQuery({ queryKey: ['iam-roles'], queryFn: api.identityAccess.roles })
  const permissions = useQuery({ queryKey: ['iam-permissions'], queryFn: api.identityAccess.permissions })
  const users = useQuery({ queryKey: ['iam-users'], queryFn: api.identityAccess.users })
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const selectedRole = roles.data?.find((role) => role.id === selectedRoleId)
  const assignments = useQuery({
    queryKey: ['iam-assignments', selectedUserId],
    queryFn: () => api.identityAccess.assignments(selectedUserId),
    enabled: Boolean(selectedUserId),
  })

  useEffect(() => {
    if (!selectedRoleId && roles.data?.length) setSelectedRoleId(roles.data[0].id)
  }, [roles.data, selectedRoleId])

  useEffect(() => {
    if (!selectedUserId && users.data?.length) setSelectedUserId(users.data[0].id)
  }, [selectedUserId, users.data])

  useEffect(() => {
    setSelectedPermissions(new Set(selectedRole?.permissionCodes ?? []))
  }, [selectedRole])

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, AccessPermission[]>()
    for (const permission of permissions.data ?? []) {
      const label = permission.moduleName || permission.resourceCode
      groups.set(label, [...(groups.get(label) ?? []), permission])
    }
    return [...groups.entries()]
  }, [permissions.data])

  function succeed(message: string) {
    setFeedback(message)
    setOperationError('')
  }

  function fail(error: unknown) {
    setOperationError(errorMessage(error))
    setFeedback('')
  }

  const createRole = useMutation({
    mutationFn: (input: { code: string; name: string; roleType: AccessRole['roleType'] }) => api.identityAccess.createRole(input),
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: ['iam-roles'] })
      setSelectedRoleId(role.id); succeed(`已创建角色“${role.name}”`)
    },
    onError: fail,
  })
  const savePermissions = useMutation({
    mutationFn: () => api.identityAccess.replaceRolePermissions(selectedRole!, (permissions.data ?? [])
      .filter((permission) => selectedPermissions.has(permission.code)).map((permission) => permission.id)),
    onSuccess: async (role) => {
      queryClient.setQueryData<AccessRole[]>(['iam-roles'], (current) => current?.map((item) => item.id === role.id ? role : item))
      succeed(`已更新角色“${role.name}”的功能权限`)
    },
    onError: fail,
  })
  const changeRoleStatus = useMutation({
    mutationFn: () => api.identityAccess.updateRole(selectedRole!, {
      name: selectedRole!.name, status: selectedRole!.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }),
    onSuccess: (role) => {
      queryClient.setQueryData<AccessRole[]>(['iam-roles'], (current) => current?.map((item) => item.id === role.id ? role : item))
      succeed(`角色“${role.name}”已${role.status === 'ACTIVE' ? '启用' : '停用'}`)
    },
    onError: fail,
  })
  const assignRole = useMutation({
    mutationFn: (input: { roleId: string; validTo?: string | null }) => api.identityAccess.assignRole(selectedUserId, {
      roleId: input.roleId,
      organizationId: context.organization.id,
      departmentId: context.department.id,
      dataScopeType: 'DEPARTMENT',
      validTo: input.validTo || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['iam-assignments', selectedUserId] })
      succeed('用户角色授权已生效')
    },
    onError: fail,
  })
  const revoke = useMutation({
    mutationFn: api.identityAccess.revokeAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['iam-assignments', selectedUserId] })
      succeed('用户角色授权已撤销')
    },
    onError: fail,
  })

  const queryError = roles.error || permissions.error || users.error || assignments.error
  return <>
    <PageHeader eyebrow="平台管理 · 身份权限" title="角色与功能授权"
      description="按角色组合原子功能权限，并在当前机构、科室范围内给用户分配有效期授权。所有变更保留审计事件。" />
    {feedback && <Alert tone="success" className="iam-feedback">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="iam-feedback">{operationError || errorMessage(queryError)}</Alert>}

    <section className="iam-overview" aria-label="权限管理工作区">
      <Panel className="iam-role-panel">
        <PanelHead title="角色" meta={`${roles.data?.length ?? 0} 个`} />
        {roles.isPending && <LoadingState label="正在加载角色…" />}
        <div className="iam-role-list" role="listbox" aria-label="角色列表">
          {roles.data?.map((role) => <button type="button" role="option" aria-selected={role.id === selectedRoleId}
            className={role.id === selectedRoleId ? 'is-selected' : ''} key={role.id} onClick={() => setSelectedRoleId(role.id)}>
            <span><strong>{role.name}</strong><code>{role.code}</code></span>
            <StatusBadge tone={role.status === 'ACTIVE' ? 'success' : 'neutral'}>{role.status === 'ACTIVE' ? '启用' : '停用'}</StatusBadge>
          </button>)}
        </div>
        <CreateRoleForm busy={createRole.isPending} onSubmit={(input) => createRole.mutate(input)} />
      </Panel>

      <Panel className="iam-permission-panel">
        <PanelHead title="功能权限" meta={selectedRole ? selectedRole.name : '请选择角色'} actions={<div className="iam-role-actions">
          <Button size="sm" variant="text" disabled={!selectedRole} busy={changeRoleStatus.isPending}
            onClick={() => changeRoleStatus.mutate()}>{selectedRole?.status === 'ACTIVE' ? '停用角色' : '启用角色'}</Button>
          <Button size="sm" disabled={!selectedRole} busy={savePermissions.isPending} onClick={() => savePermissions.mutate()}>
            保存权限
          </Button></div>} />
        {permissions.isPending && <LoadingState label="正在加载权限目录…" />}
        {!permissions.isPending && permissionGroups.length === 0 && <EmptyState icon="settings" title="暂无权限"
          copy="请先通过版本迁移注册业务模块及原子权限。" />}
        <div className="iam-permission-groups">
          {permissionGroups.map(([moduleName, items]) => <fieldset key={moduleName} disabled={!selectedRole}>
            <legend>{moduleName}</legend>
            {items.map((permission) => <label key={permission.id}>
              <input type="checkbox" checked={selectedPermissions.has(permission.code)} onChange={(event) => {
                setSelectedPermissions((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(permission.code); else next.delete(permission.code)
                  return next
                })
              }} />
              <span><strong>{permission.name}</strong><code>{permission.code}</code></span>
            </label>)}
          </fieldset>)}
        </div>
      </Panel>

      <Panel className="iam-assignment-panel">
        <PanelHead title="用户授权" meta={`${context.organization.name} · ${context.department.name}`} />
        <label className="iam-native-field"><span>用户账号</span><Select value={selectedUserId}
          onChange={setSelectedUserId} clearable={false} loading={users.isPending}
          options={(users.data ?? []).map((user) => ({ value: user.id, label: user.username }))} /></label>
        <AssignRoleForm roles={(roles.data ?? []).filter((role) => role.status === 'ACTIVE')}
          busy={assignRole.isPending} onSubmit={(input) => assignRole.mutate(input)} />
        <div className="iam-assignment-list">
          {assignments.isPending && <LoadingState label="正在加载用户授权…" />}
          {assignments.data?.map((assignment) => <article key={assignment.id} className={!assignment.effective ? 'is-expired' : ''}>
            <div><strong>{assignment.roleName}</strong><code>{assignment.roleCode}</code></div>
            <p>{assignment.departmentName ?? assignment.organizationName ?? '租户范围'}</p>
            <small>{formatValidity(assignment.validFrom, assignment.validTo)}</small>
            {assignment.effective && <Button size="sm" variant="text" busy={revoke.isPending}
              onClick={() => revoke.mutate(assignment.id)}>撤销</Button>}
          </article>)}
          {!assignments.isPending && selectedUserId && assignments.data?.length === 0 &&
            <EmptyState icon="residents" title="暂无角色授权" copy="可在上方为当前用户分配角色。" />}
        </div>
      </Panel>
    </section>
  </>
}

function CreateRoleForm({ busy, onSubmit }: {
  busy: boolean
  onSubmit: (input: { code: string; name: string; roleType: AccessRole['roleType'] }) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!code.trim() || !name.trim()) return
    onSubmit({ code, name, roleType: 'BUSINESS' })
    setCode(''); setName('')
  }
  return <form className="iam-create-role" onSubmit={submit}>
    <strong>新建业务角色</strong>
    <FormField label="角色编码" required><input value={code} maxLength={64} placeholder="例如 PHARMACIST"
      onChange={(event) => setCode(event.target.value.toUpperCase())} /></FormField>
    <FormField label="角色名称" required><input value={name} maxLength={128} placeholder="例如 门诊药师"
      onChange={(event) => setName(event.target.value)} /></FormField>
    <Button size="sm" type="submit" busy={busy}>创建角色</Button>
  </form>
}

function AssignRoleForm({ roles, busy, onSubmit }: {
  roles: AccessRole[]
  busy: boolean
  onSubmit: (input: { roleId: string; validTo?: string | null }) => void
}) {
  const [roleId, setRoleId] = useState('')
  const [validTo, setValidTo] = useState('')
  useEffect(() => { if (!roleId && roles.length) setRoleId(roles[0].id) }, [roleId, roles])
  return <form className="iam-assign-form" onSubmit={(event) => {
    event.preventDefault(); if (roleId) onSubmit({ roleId, validTo: validTo ? new Date(validTo).toISOString() : null })
  }}>
    <label className="iam-native-field"><span>分配角色</span><Select value={roleId} onChange={setRoleId}
      clearable={false} showValue options={roles.map((role) => ({ value: role.id, label: role.name,
        secondaryText: role.code }))} /></label>
    <label className="iam-native-field"><span>失效时间（可选）</span><input type="datetime-local" value={validTo}
      onChange={(event) => setValidTo(event.target.value)} /></label>
    <Button size="sm" type="submit" busy={busy} disabled={!roleId}>授予当前科室角色</Button>
  </form>
}

function formatValidity(from: string, to?: string | null) {
  const start = new Date(from).toLocaleString('zh-CN', { hour12: false })
  const end = to ? new Date(to).toLocaleString('zh-CN', { hour12: false }) : '长期有效'
  return `${start} — ${end}`
}
