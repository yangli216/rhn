import type { ApiClient } from './httpClient'

export interface AccessRole {
  id: string
  code: string
  name: string
  roleType: 'SYSTEM' | 'ADMIN' | 'BUSINESS' | 'CUSTOM'
  status: 'ACTIVE' | 'INACTIVE'
  version: number
  permissionCodes: string[]
}

export interface AccessPermission {
  id: string
  code: string
  name: string
  resourceCode: string
  actionCode: string
  status: string
  moduleId?: string | null
  moduleCode?: string | null
  moduleName?: string | null
  routePath?: string | null
}

/** 登录账号；未关联人员档案的账号无人员字段。revision 用于停用/启用与重置密码的乐观锁。 */
export interface AccessUser {
  id: string
  username: string
  status: string
  revision: number
  practitionerId?: string | null
  practitionerCode?: string | null
  practitionerName?: string | null
}

export type GrantSource = 'MANUAL' | 'DEPT_DEFAULT'
export type DataScopeType = 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'

export interface UserRoleAssignment {
  id: string
  userId: string
  username: string
  roleId: string
  roleCode: string
  roleName: string
  organizationId?: string | null
  organizationName?: string | null
  departmentId?: string | null
  departmentName?: string | null
  dataScopeType: DataScopeType
  validFrom: string
  validTo?: string | null
  grantedBy?: string | null
  createdAt: string
  effective: boolean
  /** DEPT_DEFAULT：按科室默认角色自动授予，随对应任职结束而失效。 */
  grantSource: GrantSource
  staffAssignmentId?: string | null
  practitionerId?: string | null
  practitionerCode?: string | null
  practitionerName?: string | null
}

/** 当前账号的管理范围：全租户、本机构或当前工作科室。 */
export interface ManagementScope {
  scopeType: DataScopeType
  organizationId?: string | null
  organizationName?: string | null
  departmentId?: string | null
  departmentName?: string | null
}

export interface PractitionerAccess {
  practitionerId: string
  account?: AccessUser | null
  assignments: UserRoleAssignment[]
  scope: ManagementScope
}

export interface DepartmentDefaultRole {
  id: string
  organizationId: string
  departmentId: string
  roleId: string
  roleCode: string
  roleName: string
  roleStatus: AccessRole['status']
  createdAt: string
}

export interface DepartmentDefaultRoles {
  organizationId: string
  departmentId: string
  manageable: boolean
  roles: DepartmentDefaultRole[]
  grantedCount: number
}

export interface AssignRoleInput {
  roleId: string
  organizationId?: string | null
  departmentId?: string | null
  dataScopeType: DataScopeType
  validFrom?: string | null
  validTo?: string | null
}

export function createIdentityAccessApi(client: ApiClient) {
  const base = '/api/platform/iam'
  return {
    roles: () => client.request<AccessRole[]>(`${base}/roles`),
    permissions: () => client.request<AccessPermission[]>(`${base}/permissions`),
    users: () => client.request<AccessUser[]>(`${base}/users`),
    changeAccountStatus: (user: AccessUser, status: 'ACTIVE' | 'INACTIVE', reason?: string) =>
      client.request<AccessUser>(`${base}/users/${user.id}/status`, {
        method: 'PUT', body: JSON.stringify({ expectedRevision: user.revision, status, reason: reason || null }),
      }),
    resetPassword: (user: AccessUser, newPassword: string) =>
      client.request<AccessUser>(`${base}/users/${user.id}/password-reset`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: user.revision, newPassword }),
      }),
    assignments: (userId: string) => client.request<UserRoleAssignment[]>(`${base}/users/${userId}/role-assignments`),
    roleMembers: (roleId: string, includeExpired = false) =>
      client.request<UserRoleAssignment[]>(`${base}/roles/${roleId}/members?includeExpired=${includeExpired}`),
    practitionerAccess: (practitionerId: string) => client.request<PractitionerAccess>(`${base}/practitioners/${practitionerId}/access`),
    openAccount: (practitionerId: string, input: { username: string; initialPassword: string }) =>
      client.request<PractitionerAccess>(`${base}/practitioners/${practitionerId}/account`, { method: 'POST', body: JSON.stringify(input) }),
    departmentDefaultRoles: (departmentId: string) => client.request<DepartmentDefaultRoles>(`${base}/departments/${departmentId}/default-roles`),
    replaceDepartmentDefaultRoles: (departmentId: string, input: { roleIds: string[]; applyToCurrentStaff: boolean }) =>
      client.request<DepartmentDefaultRoles>(`${base}/departments/${departmentId}/default-roles`, { method: 'PUT', body: JSON.stringify(input) }),
    createRole: (input: { code: string; name: string; roleType: AccessRole['roleType'] }) =>
      client.request<AccessRole>(`${base}/roles`, { method: 'POST', body: JSON.stringify(input) }),
    updateRole: (role: AccessRole, input: { name: string; status: AccessRole['status'] }) =>
      client.request<AccessRole>(`${base}/roles/${role.id}`, {
        method: 'PUT', body: JSON.stringify({ expectedVersion: role.version, ...input }),
      }),
    replaceRolePermissions: (role: AccessRole, permissionIds: string[]) =>
      client.request<AccessRole>(`${base}/roles/${role.id}/permissions`, {
        method: 'PUT', body: JSON.stringify({ expectedVersion: role.version, permissionIds }),
      }),
    assignRole: (userId: string, input: AssignRoleInput) => client.request<UserRoleAssignment>(`${base}/users/${userId}/role-assignments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    revokeAssignment: (assignmentId: string) => client.request<void>(`${base}/user-role-assignments/${assignmentId}`, {
      method: 'DELETE',
    }),
  }
}
