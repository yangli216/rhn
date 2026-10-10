import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { AccessRole, RhnApi } from '../../shared/rhnApi'
import { AccessControlManagement } from './AccessControlManagement'
const role: AccessRole = { id: 'role1', code: 'ROLE1', name: '审核角色', roleType: 'BUSINESS', status: 'ACTIVE', version: 2, permissionCodes: ['TASK.READ'] }
const other: AccessRole = { ...role, id: 'role2', code: 'ROLE2', name: '另一角色', permissionCodes: [] }
const permissions = ['READ', 'WRITE'].map((action, index) => ({ id: `p${index}`, code: `TASK.${action}`, name: `任务${action}`,
  resourceCode: 'TASK', actionCode: action, status: 'ACTIVE', moduleName: '任务' }))
const context = { organization: { id: 'org', name: '机构' }, department: { id: 'dept', name: '科室' } } as ClinicalContext
function setup(overrides: Record<string, unknown> = {}) {
  const api = { identityAccess: { roles: vi.fn().mockResolvedValue([role, other]), permissions: vi.fn().mockResolvedValue(permissions),
    users: vi.fn().mockResolvedValue([]), assignments: vi.fn().mockResolvedValue([]),
    replaceRolePermissions: vi.fn().mockResolvedValue({ ...role, version: 3, permissionCodes: ['TASK.READ', 'TASK.WRITE'] }), ...overrides } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = (nextApi = api, nextContext = context) => <QueryClientProvider client={client}><AccessControlManagement api={nextApi} context={nextContext} /></QueryClientProvider>
  const result = render(tree())
  return { api, client, ...result, tree }
}
const save = () => screen.getByRole('button', { name: '保存权限' })
const check = (code = 'WRITE') => screen.getByRole('checkbox', { name: new RegExp(`任务${code}`) })
describe('permission saving never treats unknown facts as an empty permission set', () => {
  it.each(['failure', 'malformed'])('blocks saving when the initial permission catalog is %s', async scenario => {
    const query = scenario === 'failure' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue([{ id: 'p0' }])
    const { api } = setup({ permissions: query })
    expect(await screen.findByText('权限目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    expect(screen.queryByText('暂无权限')).not.toBeInTheDocument()
    await userEvent.click(save())
    expect(api.identityAccess.replaceRolePermissions).not.toHaveBeenCalled()
  })
  it('retains checkbox drafts across a failed refresh and does not show old rows as current facts', async () => {
    const { api, client } = setup()
    await screen.findByRole('checkbox', { name: /任务WRITE/ })
    await userEvent.click(check())
    vi.mocked(api.identityAccess.permissions).mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['iam-permissions'] }) })
    expect(await screen.findByText('权限目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '重新加载权限目录' }))
    await waitFor(() => expect(check()).toBeChecked())
    await userEvent.click(save())
    expect(await screen.findByText('已更新角色“审核角色”的功能权限')).toBeInTheDocument()
    expect(api.identityAccess.replaceRolePermissions).toHaveBeenCalledWith(role, ['p0', 'p1'])
  })
  it.each(['partial', 'old', 'wrong-role', 'wrong-set', 'failed'])('does not report success or reset the draft on %s save', async scenario => {
    const write = vi.fn().mockImplementation(async () => {
      if (scenario === 'failed') throw new Error('offline')
      if (scenario === 'partial') return { id: role.id }
      if (scenario === 'old') return role
      return { ...role, version: 3, id: scenario === 'wrong-role' ? 'other' : role.id,
        permissionCodes: scenario === 'wrong-set' ? ['TASK.READ'] : ['TASK.READ', 'TASK.WRITE'] }
    })
    setup({ replaceRolePermissions: write })
    await screen.findByRole('checkbox', { name: /任务WRITE/ })
    await userEvent.click(check()); await userEvent.click(save())
    expect(await screen.findByRole('button', { name: '重新核实角色权限' })).toBeInTheDocument()
    expect(check()).toBeChecked()
    expect(screen.queryByText('已更新角色“审核角色”的功能权限')).not.toBeInTheDocument()
  })
  it('never drops a role permission missing from the loaded catalog', async () => {
    const { api } = setup({ roles: vi.fn().mockResolvedValue([{ ...role, permissionCodes: ['TASK.HIDDEN'] }]) })
    expect(await screen.findByText(/不能自动删除这些权限/)).toBeInTheDocument()
    expect(save()).toBeDisabled()
    expect(api.identityAccess.replaceRolePermissions).not.toHaveBeenCalled()
  })
  it('allows intentionally clearing a confirmed role using an empty set', async () => {
    const { api } = setup({ replaceRolePermissions: vi.fn().mockResolvedValue({ ...role, version: 3, permissionCodes: [] }) })
    await screen.findByRole('checkbox', { name: /任务READ/ })
    await userEvent.click(check('READ')); await userEvent.click(save())
    expect(await screen.findByText('已更新角色“审核角色”的功能权限')).toBeInTheDocument()
    expect(api.identityAccess.replaceRolePermissions).toHaveBeenCalledWith(role, [])
  })
  it('keeps a stale-version draft until explicitly reloaded', async () => {
    const { api, client } = setup()
    await screen.findByRole('checkbox', { name: /任务WRITE/ }); await userEvent.click(check())
    vi.mocked(api.identityAccess.roles).mockResolvedValue([{ ...role, version: 3, permissionCodes: [] }, other])
    await act(async () => { await client.invalidateQueries({ queryKey: ['iam-roles'] }) })
    expect(await screen.findByText(/角色版本已变化/)).toBeInTheDocument()
    expect(check()).toBeChecked(); expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '放弃勾选草稿并载入最新权限' }))
    expect(check()).not.toBeChecked(); expect(save()).toBeEnabled()
  })
  it.each(['role', 'api', 'context'])('locks a pending save and ignores late success after changing %s', async scenario => {
    let finish!: () => void
    const write = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...role, version: 3, permissionCodes: ['TASK.READ', 'TASK.WRITE'] }) }))
    const { api, tree, rerender } = setup({ replaceRolePermissions: write })
    await screen.findByRole('checkbox', { name: /任务WRITE/ }); await userEvent.click(check())
    const button = save(); await userEvent.click(button)
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(check()).toBeDisabled(); await userEvent.click(button); expect(write).toHaveBeenCalledTimes(1)
    if (scenario === 'role') await userEvent.click(screen.getByRole('option', { name: /另一角色/ }))
    if (scenario === 'api') rerender(tree({ ...api }))
    if (scenario === 'context') rerender(tree(api, { ...context, department: { ...context.department, id: 'other' } }))
    await act(async () => finish())
    expect(screen.queryByText('已更新角色“审核角色”的功能权限')).not.toBeInTheDocument()
    expect(write).toHaveBeenCalledWith(role, ['p0', 'p1'])
  })
  it('blocks malformed roles and does not display a zero count as a confirmed result', async () => {
    setup({ roles: vi.fn().mockResolvedValue([{ ...role, permissionCodes: undefined }]) })
    expect(await screen.findByText('角色目录尚未确认，不能据此判断有无记录。')).toBeInTheDocument()
    expect(screen.getByText('数量待确认')).toBeInTheDocument(); expect(save()).toBeDisabled()
  })
})

describe('role creation and status use confirmed receipts', () => {
  const created = { ...role, id: 'new-role', code: 'NEW', name: '新角色', version: 0, permissionCodes: [] }
  async function fillCreate() {
    await waitFor(() => expect(screen.getByRole('button', { name: '创建角色' })).toBeEnabled())
    await userEvent.type(screen.getByRole('textbox', { name: /角色编码/ }), 'NEW')
    await userEvent.type(screen.getByRole('textbox', { name: /角色名称/ }), '新角色')
    return screen.getByRole('button', { name: '创建角色' })
  }
  it.each(['success', 'partial', 'existing', 'permission-added', 'failed'])('only clears creation inputs after a verified new role: %s', async scenario => {
    const createRole = vi.fn().mockImplementation(async () => {
      if (scenario === 'failed') throw new Error('offline')
      if (scenario === 'partial') return { id: 'new-role' }
      if (scenario === 'existing') return { ...created, id: role.id }
      if (scenario === 'permission-added') return { ...created, permissionCodes: ['TASK.READ'] }
      return created
    })
    setup({ createRole })
    await userEvent.click(await fillCreate())
    if (scenario === 'success') {
      expect(await screen.findByText('已创建角色“新角色”')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /角色编码/ })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: /角色名称/ })).toHaveValue('')
    } else {
      expect(await screen.findByRole('button', { name: '重新核实角色创建结果' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /角色编码/ })).toHaveValue('NEW')
      expect(screen.getByRole('textbox', { name: /角色名称/ })).toHaveValue('新角色')
      expect(screen.queryByText('已创建角色“新角色”')).not.toBeInTheDocument()
    }
  })
  it('does not create twice when rechecking finds the code after a lost response', async () => {
    const roles = vi.fn().mockResolvedValue([role, other])
    const createRole = vi.fn().mockImplementation(async () => { roles.mockResolvedValue([role, other, created]); throw new Error('response lost') })
    setup({ roles, createRole })
    await userEvent.click(await fillCreate())
    await userEvent.click(await screen.findByRole('button', { name: '重新核实角色创建结果' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '创建角色' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '创建角色' }))
    expect(await screen.findByText(/角色编码已存在/)).toBeInTheDocument()
    expect(createRole).toHaveBeenCalledTimes(1)
  })
  it('does not duplicate a created role already received by a directory refresh', async () => {
    let finish!: () => void
    const createRole = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => resolve(created) }))
    const { client } = setup({ createRole })
    await userEvent.click(await fillCreate()); await waitFor(() => expect(createRole).toHaveBeenCalledTimes(1))
    await act(async () => { client.setQueriesData({ queryKey: ['iam-roles'] }, [role, other, created]); finish() })
    expect(await screen.findByText('已创建角色“新角色”')).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /新角色/ })).toHaveLength(1)
  })
  it.each(['api', 'context'])('locks creation and ignores the late response after changing %s', async scenario => {
    let finish!: () => void
    const createRole = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => resolve(created) }))
    const { api, tree, rerender } = setup({ createRole })
    const button = await fillCreate(); await userEvent.click(button)
    await waitFor(() => expect(createRole).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled(); await userEvent.click(button)
    expect(createRole).toHaveBeenCalledTimes(1)
    if (scenario === 'api') rerender(tree({ ...api }))
    else rerender(tree(api, { ...context, department: { ...context.department, id: 'other' } }))
    await act(async () => finish())
    expect(screen.queryByText('已创建角色“新角色”')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /角色名称/ })).toHaveValue('')
  })
  it.each(['partial', 'old', 'wrong-state', 'wrong-permissions', 'success'])('confirms the exact status change: %s', async scenario => {
    const updateRole = vi.fn().mockResolvedValue(scenario === 'partial' ? { id: role.id } : {
      ...role, version: scenario === 'old' ? role.version : role.version + 1,
      status: scenario === 'wrong-state' ? 'ACTIVE' : 'INACTIVE',
      permissionCodes: scenario === 'wrong-permissions' ? [] : role.permissionCodes,
    })
    setup({ updateRole })
    await waitFor(() => expect(screen.getByRole('button', { name: '停用角色' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '停用角色' }))
    await userEvent.click(screen.getByRole('button', { name: '确认停用' }))
    if (scenario === 'success') {
      expect(await screen.findByText('角色“审核角色”已停用')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } else {
      expect(await screen.findByRole('button', { name: '重新核实角色状态' })).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.queryByText('角色“审核角色”已停用')).not.toBeInTheDocument()
    }
  })
  it('retries the same target and original version even if reloading shows the first request committed', async () => {
    const roles = vi.fn().mockResolvedValue([role, other])
    const inactive = { ...role, status: 'INACTIVE', version: 3 }
    const updateRole = vi.fn().mockImplementationOnce(async () => { roles.mockResolvedValue([inactive, other]); throw new Error('response lost') })
      .mockRejectedValue(new Error('version conflict'))
    setup({ roles, updateRole })
    await waitFor(() => expect(screen.getByRole('button', { name: '停用角色' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '停用角色' }))
    await userEvent.click(screen.getByRole('button', { name: '确认停用' }))
    await userEvent.click(await screen.findByRole('button', { name: '重新核实角色状态' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '确认停用' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '确认停用' }))
    await waitFor(() => expect(updateRole).toHaveBeenCalledTimes(2))
    expect(updateRole.mock.calls).toEqual([[role, { name: role.name, status: 'INACTIVE' }], [role, { name: role.name, status: 'INACTIVE' }]])
  })
  it('locks the status dialog and ignores a late response after role selection changes', async () => {
    let finish!: () => void
    const updateRole = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ...role, status: 'INACTIVE', version: 3 }) }))
    setup({ updateRole })
    await waitFor(() => expect(screen.getByRole('button', { name: '停用角色' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '停用角色' }))
    const confirm = screen.getByRole('button', { name: '确认停用' }); await userEvent.click(confirm)
    await waitFor(() => expect(updateRole).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await userEvent.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(confirm); expect(updateRole).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('option', { name: /另一角色/ }))
    await act(async () => finish())
    expect(screen.queryByText('角色“审核角色”已停用')).not.toBeInTheDocument()
  })
})

describe('user authorization facts and saved outcomes', () => {
  const account = { id: 'user1', username: 'operator', status: 'ACTIVE' }
  const grant = { id: 'grant1', userId: account.id, username: account.username, roleId: role.id, roleCode: role.code, roleName: role.name,
    organizationId: 'org', organizationName: '机构', departmentId: 'dept', departmentName: '科室', dataScopeType: 'DEPARTMENT',
    validFrom: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', effective: true }
  const grantButton = () => screen.getByRole('button', { name: '授予当前科室角色' })
  it.each(['users-failed', 'users-malformed', 'assignments-failed', 'assignments-malformed', 'wrong-scope'])('blocks grants and false emptiness for %s', async scenario => {
    const { api } = setup({ users: scenario === 'users-failed' ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(scenario === 'users-malformed' ? [{ id: account.id }] : [account]),
      assignments: scenario === 'assignments-failed' ? vi.fn().mockRejectedValue(new Error('offline'))
        : vi.fn().mockResolvedValue(scenario === 'assignments-malformed' ? [{ id: 'grant1' }] : scenario === 'wrong-scope' ? [{ ...grant, departmentId: 'other' }] : []),
      assignRole: vi.fn(),
    })
    await screen.findByText(scenario.startsWith('users') ? '用户目录尚未确认，不能据此判断有无记录。' : '用户授权尚未确认，不能据此判断有无记录。')
    expect(grantButton()).toBeDisabled()
    expect(screen.queryByText('暂无角色授权')).not.toBeInTheDocument()
    expect(screen.queryByText('租户范围')).not.toBeInTheDocument()
    expect(api.identityAccess.assignRole).not.toHaveBeenCalled()
  })
  it.each(['success', 'partial', 'wrong-user', 'wrong-role', 'wrong-expiry', 'failed'])('checks the returned grant before claiming it is saved: %s', async scenario => {
    const assignRole = vi.fn().mockImplementation(async () => {
      if (scenario === 'failed') throw new Error('response lost')
      if (scenario === 'partial') return { id: 'grant1' }
      return { ...grant, userId: scenario === 'wrong-user' ? 'other' : account.id, roleId: scenario === 'wrong-role' ? 'other' : role.id,
        validTo: scenario === 'wrong-expiry' ? null : '2030-01-01T00:00:00Z' }
    })
    setup({ users: vi.fn().mockResolvedValue([account]), assignRole })
    await waitFor(() => expect(grantButton()).toBeEnabled())
    // Datetime-local is interpreted in the test environment's local timezone, so derive the expected response from the request.
    if (scenario === 'success') assignRole.mockImplementation(async (_user, input) => ({ ...grant, validTo: input.validTo }))
    await userEvent.type(screen.getByLabelText('失效时间（可选）'), '2030-01-01T08:00')
    const value = (screen.getByLabelText('失效时间（可选）') as HTMLInputElement).value
    await userEvent.click(grantButton())
    if (scenario === 'success') {
      expect(await screen.findByText('用户角色授权记录已保存')).toBeInTheDocument()
      expect(screen.queryByText('用户角色授权已生效')).not.toBeInTheDocument()
    } else {
      expect(await screen.findByRole('button', { name: '重新核实用户授权' })).toBeInTheDocument()
      expect(screen.queryByText('用户角色授权记录已保存')).not.toBeInTheDocument()
      expect(screen.getByLabelText('失效时间（可选）')).toHaveValue(value)
    }
    expect(assignRole).toHaveBeenCalledWith(account.id, expect.objectContaining({ roleId: role.id, organizationId: 'org', departmentId: 'dept', dataScopeType: 'DEPARTMENT' }))
  })
  it('does not duplicate an already committed grant after rechecking a lost response', async () => {
    const assignments = vi.fn().mockResolvedValue([])
    const assignRole = vi.fn().mockImplementation(async () => { assignments.mockResolvedValue([grant]); throw new Error('response lost') })
    setup({ users: vi.fn().mockResolvedValue([account]), assignments, assignRole })
    await waitFor(() => expect(grantButton()).toBeEnabled()); await userEvent.click(grantButton())
    await userEvent.click(await screen.findByRole('button', { name: '重新核实用户授权' }))
    await waitFor(() => expect(grantButton()).toBeEnabled()); await userEvent.click(grantButton())
    expect(await screen.findByText(/已有有效授权/)).toBeInTheDocument()
    expect(assignRole).toHaveBeenCalledTimes(1)
  })
  it.each(['ended', 'unchanged', 'missing', 'read-failed'])('verifies the revoked record after the DELETE: %s', async scenario => {
    const assignments = vi.fn().mockResolvedValue([grant])
    const revokeAssignment = vi.fn().mockImplementation(async () => {
      if (scenario === 'read-failed') assignments.mockRejectedValue(new Error('read offline'))
      else assignments.mockResolvedValue(scenario === 'ended' ? [{ ...grant, effective: false, validTo: '2026-04-01T00:00:00Z' }]
        : scenario === 'missing' ? [] : [grant])
    })
    setup({ users: vi.fn().mockResolvedValue([account]), assignments, revokeAssignment })
    await userEvent.click(await screen.findByRole('button', { name: '撤销' }))
    if (scenario === 'ended') {
      expect(await screen.findByText('用户角色授权已撤销')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument()
    } else {
      expect(await screen.findByRole('button', { name: '重新核实用户授权' })).toBeInTheDocument()
      expect(screen.queryByText('用户角色授权已撤销')).not.toBeInTheDocument()
    }
    expect(revokeAssignment).toHaveBeenCalledWith('grant1')
    expect(assignments).toHaveBeenLastCalledWith(account.id)
  })
  it('does not duplicate a grant already returned by a concurrent directory refresh', async () => {
    let finish!: () => void
    const assignRole = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => resolve(grant) }))
    const { client } = setup({ users: vi.fn().mockResolvedValue([account]), assignRole })
    await waitFor(() => expect(grantButton()).toBeEnabled()); await userEvent.click(grantButton())
    await waitFor(() => expect(assignRole).toHaveBeenCalledTimes(1))
    await act(async () => { client.setQueriesData({ queryKey: ['iam-assignments'] }, [grant]); finish() })
    expect(await screen.findByText('用户角色授权记录已保存')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '撤销' })).toHaveLength(1)
  })
  it.each(['grant', 'revoke'])('locks %s submissions and ignores late results after a scope switch', async kind => {
    let finish!: () => void
    const assignments = vi.fn().mockResolvedValue(kind === 'grant' ? [] : [grant])
    const write = vi.fn().mockImplementation(() => new Promise(resolve => { finish = () => {
      assignments.mockResolvedValue(kind === 'grant' ? [grant] : [{ ...grant, effective: false, validTo: '2026-04-01T00:00:00Z' }])
      resolve(kind === 'grant' ? grant : undefined)
    } }))
    const { api, tree, rerender } = setup({ users: vi.fn().mockResolvedValue([account]), assignments, [kind === 'grant' ? 'assignRole' : 'revokeAssignment']: write })
    await waitFor(() => expect(grantButton()).toBeEnabled())
    const button = kind === 'grant' ? grantButton() : screen.getByRole('button', { name: '撤销' })
    await userEvent.click(button); await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled(); await userEvent.click(button); expect(write).toHaveBeenCalledTimes(1)
    rerender(tree({ ...api }))
    await act(async () => finish())
    expect(screen.queryByText(kind === 'grant' ? '用户角色授权记录已保存' : '用户角色授权已撤销')).not.toBeInTheDocument()
  })
})
