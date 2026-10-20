import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { AccessRole, RhnApi } from '../../shared/rhnApi'
import { AccessControlManagement } from './AccessControlManagement'

const role: AccessRole = { id: 'role1', code: 'ROLE1', name: '审核角色', roleType: 'BUSINESS', status: 'ACTIVE', version: 2, permissionCodes: ['TASK.READ'] }
const admin: AccessRole = { id: 'role2', code: 'PRESENCE_ADMIN', name: '在线会话管理员', roleType: 'ADMIN', status: 'ACTIVE', version: 0, permissionCodes: [] }
const permissions = ['READ', 'WRITE'].map((action, index) => ({ id: `p${index}`, code: `TASK.${action}`, name: `任务${action}`,
  resourceCode: 'TASK', actionCode: action, status: 'ACTIVE', moduleName: '任务' }))
const context = { organization: { id: 'org', name: '青禾镇中心卫生院' }, department: { id: 'dept', name: '全科门诊' } } as ClinicalContext
const member = { id: 'g-1', userId: 'u-1', username: 'p001', roleId: 'role1', roleCode: 'ROLE1', roleName: '审核角色', organizationId: 'org',
  organizationName: '青禾镇中心卫生院', departmentId: 'dept', departmentName: '全科门诊', dataScopeType: 'DEPARTMENT', validFrom: '2026-01-01T00:00:00Z',
  validTo: null, createdAt: '2026-01-01T00:00:00Z', effective: true, grantSource: 'DEPT_DEFAULT', staffAssignmentId: 'a-1',
  practitionerId: 'p-1', practitionerCode: 'P001', practitionerName: '陈国华' }

function setup(overrides: Record<string, unknown> = {}) {
  const identityAccess = { roles: vi.fn().mockResolvedValue([role, admin]), permissions: vi.fn().mockResolvedValue(permissions),
    users: vi.fn().mockResolvedValue([{ id: 'u-2', username: 'n002', status: 'ACTIVE', practitionerId: 'p-2', practitionerCode: 'N002', practitionerName: '李护士' }]),
    roleMembers: vi.fn().mockResolvedValue([member]),
    replaceRolePermissions: vi.fn().mockResolvedValue({ ...role, version: 3, permissionCodes: ['TASK.READ', 'TASK.WRITE'] }),
    assignRole: vi.fn().mockImplementation(async (userId, input) => ({ ...member, id: 'g-2', userId, username: 'n002', grantSource: 'MANUAL',
      staffAssignmentId: null, practitionerId: 'p-2', practitionerName: '李护士', roleId: input.roleId })),
    revokeAssignment: vi.fn().mockResolvedValue(undefined),
    ...overrides }
  const api = { identityAccess } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><AccessControlManagement api={api} context={context} /></QueryClientProvider>)
  return { identityAccess, client }
}
const save = () => screen.getByRole('button', { name: '保存权限' })
const check = (code = 'WRITE') => screen.getByRole('checkbox', { name: new RegExp(`任务${code}`) })

describe('AccessControlManagement', () => {
  it('lists every role type, including management roles from seed data', async () => {
    setup()
    const list = within(await screen.findByRole('listbox', { name: '角色列表' }))
    expect(list.getByRole('option', { name: /在线会话管理员/ })).toBeInTheDocument()
    await userEvent.click(list.getByRole('option', { name: /在线会话管理员/ }))
    expect(await screen.findByText('管理角色')).toBeInTheDocument()
  })

  it('saves the checked permission set and reports the confirmed result', async () => {
    const { identityAccess } = setup()
    await screen.findByRole('checkbox', { name: /任务WRITE/ })
    expect(save()).toBeDisabled()
    await userEvent.click(check()); await userEvent.click(save())
    expect(await screen.findByText('已更新“审核角色”的功能权限')).toBeInTheDocument()
    expect(identityAccess.replaceRolePermissions).toHaveBeenCalledWith(role, ['p0', 'p1'])
  })

  it.each(['partial', 'old', 'failed'])('keeps the draft and reports failure on %s save', async scenario => {
    setup({ replaceRolePermissions: vi.fn().mockImplementation(async () => {
      if (scenario === 'failed') throw new Error('offline')
      return scenario === 'partial' ? { id: role.id } : role
    }) })
    await screen.findByRole('checkbox', { name: /任务WRITE/ })
    await userEvent.click(check()); await userEvent.click(save())
    expect(await screen.findByText(/保存未完成/)).toBeInTheDocument()
    expect(check()).toBeChecked()
  })

  it('never drops a role permission missing from the loaded catalog', async () => {
    const { identityAccess } = setup({ roles: vi.fn().mockResolvedValue([{ ...role, permissionCodes: ['TASK.HIDDEN'] }]) })
    expect(await screen.findByText(/不能自动删除/)).toBeInTheDocument()
    await userEvent.click(check())
    expect(save()).toBeDisabled()
    expect(identityAccess.replaceRolePermissions).not.toHaveBeenCalled()
  })

  it('keeps a stale-version draft until explicitly reloaded', async () => {
    const { identityAccess, client } = setup()
    await screen.findByRole('checkbox', { name: /任务WRITE/ }); await userEvent.click(check())
    vi.mocked(identityAccess.roles).mockResolvedValue([{ ...role, version: 3, permissionCodes: [] }, admin])
    await act(async () => { await client.invalidateQueries({ queryKey: ['iam-roles'] }) })
    expect(await screen.findByText(/角色已被其他人修改/)).toBeInTheDocument()
    expect(check()).toBeChecked()
    expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '放弃草稿并载入最新权限' }))
    expect(check('READ')).not.toBeChecked()
  })

  it('looks up who holds the role and revokes a grant', async () => {
    const { identityAccess } = setup()
    await userEvent.click(await screen.findByRole('tab', { name: /已授权人员/ }))
    const table = within(await screen.findByRole('table', { name: '已授权人员' }))
    expect(table.getByText('陈国华（P001）')).toBeInTheDocument()
    expect(table.getByText('科室默认')).toBeInTheDocument()
    expect(identityAccess.roleMembers).toHaveBeenCalledWith('role1', false)
    await userEvent.click(screen.getByRole('switch', { name: '含已失效' }))
    await waitFor(() => expect(identityAccess.roleMembers).toHaveBeenCalledWith('role1', true))
    await userEvent.click(within(await screen.findByRole('table', { name: '已授权人员' })).getByRole('button', { name: '撤销' }))
    const dialog = within(screen.getByRole('dialog', { name: '撤销角色授权' }))
    expect(dialog.getByText(/同一任职期间不会再自动补授/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '确认撤销' }))
    await waitFor(() => expect(identityAccess.revokeAssignment).toHaveBeenCalledWith('g-1'))
    expect(await screen.findByText('已撤销陈国华的“审核角色”')).toBeInTheDocument()
  })

  it('grants the role to an account in the current department', async () => {
    const { identityAccess } = setup()
    await userEvent.click(await screen.findByRole('tab', { name: /已授权人员/ }))
    await userEvent.click(await screen.findByRole('button', { name: '授予人员' }))
    const dialog = within(await screen.findByRole('dialog', { name: '授予人员' }))
    await userEvent.click(dialog.getByRole('combobox', { name: /人员账号/ })); await userEvent.click(await screen.findByRole('option', { name: /李护士/ }))
    await userEvent.click(dialog.getByRole('button', { name: '确认授予' }))
    await waitFor(() => expect(identityAccess.assignRole).toHaveBeenCalledWith('u-2', { roleId: 'role1', dataScopeType: 'DEPARTMENT',
      organizationId: 'org', departmentId: 'dept', validTo: null }))
    expect(await screen.findByText('已授予“审核角色”：青禾镇中心卫生院 · 全科门诊')).toBeInTheDocument()
  })
})
