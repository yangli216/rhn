import type { ApiClient } from './httpClient'

export interface AccessRole {
  id: string
  code: string
  name: string
  roleType: 'SYSTEM' | 'BUSINESS' | 'CUSTOM'
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

export interface AccessUser {
  id: string
  username: string
  status: string
}

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
  dataScopeType: 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
  validFrom: string
  validTo?: string | null
  grantedBy?: string | null
  createdAt: string
  effective: boolean
}

export function createIdentityAccessApi(client: ApiClient) {
  const base = '/api/platform/iam'
  return {
    roles: () => client.request<AccessRole[]>(`${base}/roles`),
    permissions: () => client.request<AccessPermission[]>(`${base}/permissions`),
    users: () => client.request<AccessUser[]>(`${base}/users`),
    assignments: (userId: string) => client.request<UserRoleAssignment[]>(`${base}/users/${userId}/role-assignments`),
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
    assignRole: (userId: string, input: {
      roleId: string
      organizationId?: string | null
      departmentId?: string | null
      dataScopeType: UserRoleAssignment['dataScopeType']
      validFrom?: string | null
      validTo?: string | null
    }) => client.request<UserRoleAssignment>(`${base}/users/${userId}/role-assignments`, {
      method: 'POST', body: JSON.stringify(input),
    }),
    revokeAssignment: (assignmentId: string) => client.request<void>(`${base}/user-role-assignments/${assignmentId}`, {
      method: 'DELETE',
    }),
  }
}
