import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { FormField, Select } from '../../shared/ui'

export type ConfigurableBusinessScope = 'PLATFORM' | 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'

export function ConfigurationScopeTarget({ api, scopeType, tenantId, organizationId, departmentId,
  onOrganizationChange, onDepartmentChange, disabled = false, className }: {
  api: RhnApi
  scopeType: ConfigurableBusinessScope
  tenantId: string
  organizationId: string
  departmentId: string
  onOrganizationChange: (value: string) => void
  onDepartmentChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const needsOrganization = scopeType === 'ORGANIZATION' || scopeType === 'DEPARTMENT'
  const organizations = useQuery({
    queryKey: ['configuration-scope-organizations'],
    queryFn: api.organization.list,
    enabled: needsOrganization,
    staleTime: 5 * 60 * 1000,
  })
  const departments = useQuery({
    queryKey: ['configuration-scope-departments', organizationId],
    queryFn: () => api.organization.departments(organizationId),
    enabled: scopeType === 'DEPARTMENT' && Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!needsOrganization || disabled || !organizations.data?.length) return
    if (!organizations.data.some((value) => value.id === organizationId)) {
      onOrganizationChange(organizations.data[0].id)
    }
  }, [disabled, needsOrganization, onOrganizationChange, organizationId, organizations.data])

  useEffect(() => {
    if (scopeType !== 'DEPARTMENT' || disabled || !departments.data?.length) return
    if (!departments.data.some((value) => value.id === departmentId)) {
      onDepartmentChange(departments.data[0].id)
    }
  }, [departmentId, departments.data, disabled, onDepartmentChange, scopeType])

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
      error={organizations.error ? '机构列表加载失败' : undefined}>
      <Select value={organizationId} disabled={disabled || organizations.isPending} clearable={false} showValue
        placeholder={organizations.isPending ? '正在加载机构…' : '请选择机构'}
        onChange={(value) => { onOrganizationChange(value); onDepartmentChange('') }}
        options={(organizations.data ?? []).map((value) => ({
          value: value.id, label: value.name, secondaryText: value.code,
        }))} />
    </FormField>
    {scopeType === 'DEPARTMENT' && <FormField className={className} label="目标科室" required
      error={departments.error ? '科室列表加载失败' : undefined}>
      <Select value={departmentId} disabled={disabled || !organizationId || departments.isPending}
        clearable={false} showValue placeholder={departments.isPending ? '正在加载科室…' : '请选择科室'}
        onChange={onDepartmentChange} options={(departments.data ?? []).map((value) => ({
          value: value.id, label: value.name, secondaryText: value.code,
        }))} />
    </FormField>}
  </>
}
