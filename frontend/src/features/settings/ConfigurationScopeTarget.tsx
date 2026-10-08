import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { Button, FormField, Select } from '../../shared/ui'

export type ConfigurableBusinessScope = 'PLATFORM' | 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'

export function useConfigurationScopeTarget({ api, scopeType, tenantId, organizationId, departmentId, enabled = true }: {
  api: RhnApi; scopeType: string; tenantId: string; organizationId: string; departmentId: string; enabled?: boolean
}) {
  const needsOrganization = scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT'
  const organizations = useQuery({
    queryKey: ['configuration-scope-organizations', tenantId],
    queryFn: async () => {
      const result = await api.organization.list()
      if (!Array.isArray(result) || result.some((item) => !item || typeof item.id !== 'string' || !item.id.trim()
        || typeof item.name !== 'string' || !item.name.trim())) throw new Error('机构列表响应不完整')
      return result
    },
    enabled: enabled && needsOrganization && Boolean(tenantId),
  })
  const organizationsReady = enabled && organizations.isSuccess && !organizations.isFetching
  const organization = organizationsReady ? organizations.data.find((item) => item.id === organizationId) : undefined
  const departments = useQuery({
    queryKey: ['configuration-scope-departments', tenantId, organizationId],
    queryFn: async () => {
      const result = await api.organization.departments(organizationId)
      if (!Array.isArray(result) || result.some((item) => !item || typeof item.id !== 'string' || !item.id.trim()
        || typeof item.name !== 'string' || !item.name.trim() || item.organizationId !== organizationId)) {
        throw new Error('科室列表响应不完整或包含其他机构的科室')
      }
      return result
    },
    enabled: enabled && scopeType === 'DEPARTMENT' && Boolean(organization),
  })
  const departmentsReady = Boolean(organization) && departments.isSuccess && !departments.isFetching
  const department = departmentsReady ? departments.data!.find((item) => item.id === departmentId) : undefined
  const ready = enabled && Boolean(tenantId) && (!needsOrganization
    || Boolean(organization) && (scopeType !== 'DEPARTMENT' || Boolean(department)))
  const organizationError = organizations.isError ? '机构列表加载失败，请重试'
    : organizationsReady && !organization ? organizationId ? '原机构不在可用列表，请明确重新选择' : '请选择机构' : undefined
  const departmentError = departments.isError ? '科室列表加载失败，请重试'
    : departmentsReady && !department ? departmentId ? '原科室不在所选机构中，请明确重新选择' : '请选择科室' : undefined
  const busy = organizations.isFetching || departments.isFetching
  async function refresh() {
    if (!enabled || !needsOrganization) return
    const result = await organizations.refetch()
    if (scopeType === 'DEPARTMENT' && result.isSuccess && result.data.some((item) => item.id === organizationId)) {
      await departments.refetch()
    }
  }
  return { ready, busy, organizationsReady, departmentsReady, organizationError, departmentError, refresh,
    organizations: organizationsReady ? organizations.data : [], departments: departmentsReady ? departments.data! : [] }
}

export function ConfigurationScopeTarget({ scopeType, tenantId, organizationId, departmentId, verification,
  onOrganizationChange, onDepartmentChange, disabled = false, className }: {
  scopeType: ConfigurableBusinessScope
  tenantId: string
  organizationId: string
  departmentId: string
  verification: ReturnType<typeof useConfigurationScopeTarget>
  onOrganizationChange: (value: string) => void
  onDepartmentChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  if (scopeType === 'PLATFORM') return <FormField className={className} label="配置对象" required>
    <Select value="PLATFORM" disabled clearable={false} showValue onChange={() => undefined}
      options={[{ value: 'PLATFORM', label: '全平台', secondaryText: '平台统一基线' }]} />
  </FormField>

  if (scopeType === 'TENANT') return <FormField className={className} label="目标租户" required
    hint="租户隔离生效，只能配置当前登录租户">
    <Select value={tenantId} disabled clearable={false} showValue onChange={() => undefined}
      options={[{ value: tenantId, label: '当前租户', secondaryText: tenantId }]} />
  </FormField>

  return <>
    <FormField className={className} label={scopeType === 'DEPARTMENT' ? '所属机构' : '目标机构'} required
      error={verification.organizationError}>
      <Select value={organizationId} disabled={disabled || !verification.organizationsReady} clearable={false} showValue
        placeholder={verification.busy ? '正在核实机构…' : '请选择机构'}
        onChange={(value) => { onOrganizationChange(value); onDepartmentChange('') }}
        options={verification.organizations.map((value) => ({ value: value.id, label: value.name, secondaryText: value.code }))} />
    </FormField>
    {scopeType === 'DEPARTMENT' && <FormField className={className} label="目标科室" required
      error={verification.departmentError}>
      <Select value={departmentId} disabled={disabled || !verification.departmentsReady}
        clearable={false} showValue placeholder={verification.busy ? '正在核实科室…' : '请选择科室'}
        onChange={onDepartmentChange} options={verification.departments.map((value) => ({ value: value.id, label: value.name, secondaryText: value.code }))} />
    </FormField>}
    {!verification.ready && <div className={className} role="status"><p>配置对象尚未确认，请核实或重新选择。</p>
      <Button variant="secondary" disabled={verification.busy} onClick={() => void verification.refresh()}>重新核实配置对象</Button>
    </div>}
  </>
}
