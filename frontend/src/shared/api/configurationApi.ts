import type { ApiClient } from './httpClient'
import type { components } from './generated'

type CategoryContract = components['schemas']['ParameterCategoryResponse']
type SummaryContract = components['schemas']['ParameterDefinitionSummaryResponse']
type DetailContract = components['schemas']['ParameterDefinitionDetailResponse']
type ValueContract = components['schemas']['ParameterValueResponse']
type ChangeContract = components['schemas']['ParameterChangeResponse']
type DefinitionRequestContract = components['schemas']['DefinitionRequest']
type SaveValueContract = components['schemas']['SaveValueRequest']
type CreateCategoryContract = components['schemas']['CreateCategoryRequest']
type UpdateCategoryContract = components['schemas']['UpdateCategoryRequest']

export type ParameterScope = SaveValueContract['scopeType']
export type ParameterValueMode = SaveValueContract['valueMode']
export type ParameterValueType = DefinitionRequestContract['valueType']
export type ParameterControlType = DefinitionRequestContract['controlType']
export type ParameterConfigType = DefinitionRequestContract['category']
export type ParameterSensitivity = NonNullable<DefinitionRequestContract['sensitivity']>
export type ParameterDisplayPolicy = NonNullable<DefinitionRequestContract['displayPolicy']>
export type ParameterStatus = NonNullable<SummaryContract['sdParamStatus']>

export const PARAMETER_SYSTEM_ENUM = {
  scopeType: 'PARAM_SCOPE_TYPE',
  valueType: 'PARAM_VALUE_TYPE',
  controlType: 'PARAM_CONTROL_TYPE',
  configType: 'PARAM_CONFIG_TYPE',
  sensitivity: 'PARAM_SENSITIVITY',
  displayPolicy: 'PARAM_DISPLAY_POLICY',
  status: 'PARAM_STATUS',
  valueMode: 'PARAM_VALUE_MODE',
  changeType: 'PARAM_CHANGE_TYPE',
  changeTargetType: 'PARAM_CHANGE_TARGET_TYPE',
} as const

export interface ParameterCategory extends CategoryContract {
  id: string
  revision: number
  code: string
  name: string
  sortOrder: number
  sdParamStatus: ParameterStatus
  sdParamStatusText: string
}

export type ConfigurationDependencyBehavior = 'DISABLE_AND_SUPPRESS' | 'HIDE'

export interface ParameterDefinitionSummary extends SummaryContract {
  id: string
  revision: number
  categoryId: string
  categoryName: string
  key: string
  name: string
  sdParamValueType: ParameterValueType
  sdParamValueTypeText: string
  sdParamControlType: ParameterControlType
  sdParamControlTypeText: string
  sdParamConfigType: ParameterConfigType
  sdParamConfigTypeText: string
  sdParamStatus: ParameterStatus
  sdParamStatusText: string
  valueCount: number
  updatedAt: string
  dependsOnKey?: string | null
  dependsOnValue?: string | null
  dependencyBehavior?: ConfigurationDependencyBehavior | null
  dependsOnName?: string | null
  dependencySatisfied?: boolean | null
}

export interface ParameterValue extends ValueContract {
  id: string
  definitionId: string
  revision: number
  sdParamScopeType: ParameterScope
  sdParamScopeTypeText: string
  scopeCode: string
  sdParamValueMode: ParameterValueMode
  sdParamValueModeText: string
  hasValue: boolean
  secretReference: boolean
  sdParamStatus: ParameterStatus
  sdParamStatusText: string
  updatedAt: string
}

export interface ParameterDefinition extends DetailContract {
  id: string
  revision: number
  categoryId: string
  categoryName: string
  key: string
  name: string
  sdParamValueType: ParameterValueType
  sdParamValueTypeText: string
  sdParamControlType: ParameterControlType
  sdParamControlTypeText: string
  allowedScopes: ParameterScope[]
  sdParamConfigType: ParameterConfigType
  sdParamConfigTypeText: string
  inheritanceEnabled: boolean
  cacheEnabled: boolean
  nullableValue: boolean
  sdParamSensitivity: ParameterSensitivity
  sdParamSensitivityText: string
  sdParamDisplayPolicy: ParameterDisplayPolicy
  sdParamDisplayPolicyText: string
  sdParamStatus: ParameterStatus
  sdParamStatusText: string
  values: ParameterValue[]
  createdAt: string
  updatedAt: string
  dependsOnKey?: string | null
  dependsOnValue?: string | null
  dependencyBehavior?: ConfigurationDependencyBehavior | null
  dependsOnName?: string | null
  dependencySatisfied?: boolean | null
}

export interface ParameterChange extends ChangeContract {
  id: string
  definitionId: string
  sdParamChangeTargetType: 'DEFINITION' | 'VALUE'
  sdParamChangeTargetTypeText: string
  sdParamChangeType: 'CREATE' | 'UPDATE' | 'ENABLE' | 'DISABLE' | 'RESET' | 'ROLLBACK'
  sdParamChangeTypeText: string
  requestCode: string
  changedAt: string
  changedBy: string
}

export interface ParameterDefinitionInput extends Omit<DefinitionRequestContract, 'requestCode' | 'expectedRevision'> {
  reason?: string
  dependsOnKey?: string | null
  dependsOnValue?: string | null
  dependencyBehavior?: ConfigurationDependencyBehavior | null
}

export interface ParameterValueInput extends Omit<SaveValueContract, 'requestCode'> {}
export interface ParameterCategoryInput extends CreateCategoryContract {}
export interface ParameterCategoryUpdate extends UpdateCategoryContract {}
export interface ParameterCategoryOrder {
  id: string
  expectedRevision: number
  parentId?: string
  sortOrder: number
}

export interface ResolvedConfigurationValue<T = unknown> {
  key: string
  value: T
  requestedScope: string
  resolvedScope: string
  inherited: boolean
  suppressedByDependency: boolean
}

export function createConfigurationApi(client: ApiClient) {
  return {
    resolve: <T = unknown>(key: string, context: {
      organizationId?: string
      departmentId?: string
      moduleCode?: string
    } = {}) => {
      const params = new URLSearchParams()
      if (context.organizationId) params.set('organizationId', context.organizationId)
      if (context.departmentId) params.set('departmentId', context.departmentId)
      if (context.moduleCode) params.set('moduleCode', context.moduleCode)
      return client.request<ResolvedConfigurationValue<T>>(
        `/api/platform/configuration/values/${encodeURIComponent(key)}${params.size ? `?${params}` : ''}`,
      )
    },
    categories: () => client.request<ParameterCategory[]>('/api/platform/configuration/categories'),
    createCategory: (input: ParameterCategoryInput) => client.request<ParameterCategory>(
      '/api/platform/configuration/categories', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateCategory: (id: string, input: ParameterCategoryUpdate) => client.request<ParameterCategory>(
      `/api/platform/configuration/categories/${id}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    reorderCategories: (categories: ParameterCategoryOrder[]) => client.request<ParameterCategory[]>(
      '/api/platform/configuration/categories/reorder', {
        method: 'PUT', body: JSON.stringify({ categories }),
      },
    ),
    definitions: (query = '', categoryId = '', category = '', status = '') => {
      const params = new URLSearchParams()
      if (query.trim()) params.set('query', query.trim())
      if (categoryId) params.set('categoryId', categoryId)
      if (category) params.set('category', category)
      if (status) params.set('status', status)
      return client.request<ParameterDefinitionSummary[]>(
        `/api/platform/configuration/definitions${params.size ? `?${params}` : ''}`,
      )
    },
    get: (id: string) => client.request<ParameterDefinition>(`/api/platform/configuration/definitions/${id}`),
    changes: (id: string) => client.request<ParameterChange[]>(
      `/api/platform/configuration/definitions/${id}/changes`,
    ),
    create: (input: ParameterDefinitionInput) => client.request<ParameterDefinition>(
      '/api/platform/configuration/definitions', {
        method: 'POST', body: JSON.stringify({ ...input, requestCode: crypto.randomUUID() }),
      },
    ),
    update: (id: string, revision: number, input: ParameterDefinitionInput) => client.request<ParameterDefinition>(
      `/api/platform/configuration/definitions/${id}`, {
        method: 'PUT', body: JSON.stringify({ ...input, expectedRevision: revision, requestCode: crypto.randomUUID() }),
      },
    ),
    changeStatus: (id: string, revision: number, enabled: boolean) => client.request<ParameterDefinition>(
      `/api/platform/configuration/definitions/${id}/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: revision,
          reason: enabled ? '重新启用参数定义' : '停止参数解析', requestCode: crypto.randomUUID() }),
      },
    ),
    saveValue: (id: string, input: ParameterValueInput) => client.request<ParameterDefinition>(
      `/api/platform/configuration/definitions/${id}/values`, {
        method: 'PUT', body: JSON.stringify({ ...input, requestCode: crypto.randomUUID() }),
      },
    ),
    changeValueStatus: (id: string, value: ParameterValue, enabled: boolean) => client.request<ParameterDefinition>(
      `/api/platform/configuration/definitions/${id}/values/${value.id}/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: value.revision,
          reason: enabled ? '重新启用当前值' : '停止使用当前值', requestCode: crypto.randomUUID() }),
      },
    ),
    rollback: (id: string, changeId: string, expectedRevision: number, reason: string) =>
      client.request<ParameterDefinition>(
        `/api/platform/configuration/definitions/${id}/changes/${changeId}/rollback`, {
          method: 'POST', body: JSON.stringify({ expectedRevision, reason, requestCode: crypto.randomUUID() }),
        },
      ),
  }
}
