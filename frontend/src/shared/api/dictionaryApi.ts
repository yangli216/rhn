import type { ApiClient } from './httpClient'
import type { components } from './generated'

type DictionaryItemContract = components['schemas']['DictionaryItemResponse']
type DictionarySummaryContract = components['schemas']['DictionarySummaryResponse']
type DictionaryDetailContract = components['schemas']['DictionaryDetailResponse']
type DictionaryCategoryContract = components['schemas']['DictionaryCategoryResponse']
type CreateCategoryContract = components['schemas']['CreateDictionaryCategoryRequest']
type UpdateCategoryContract = components['schemas']['UpdateDictionaryCategoryRequest']
type CreateDictionaryContract = components['schemas']['CreateDictionaryRequest']
type UpdateDictionaryContract = components['schemas']['UpdateDictionaryRequest']
type CreateItemContract = components['schemas']['CreateItemRequest']
type UpdateItemContract = components['schemas']['UpdateItemRequest']
type RevisionContract = components['schemas']['RevisionCommand']
type DictionaryChangeContract = components['schemas']['DictionaryChangeResponse']
type SystemEnumItemContract = components['schemas']['SystemEnumItem']
type SystemEnumDefinitionContract = components['schemas']['SystemEnumDefinition']
type DictionaryValueContract = components['schemas']['DictionaryValue']

export type DictionaryScopeType = CreateDictionaryContract['scopeType']
export type DictionaryStatus = NonNullable<DictionarySummaryContract['sdDictStatus']>
export type DictionaryChangeType = NonNullable<DictionaryChangeContract['sdDictChangeType']>
export type DictionaryChangeTargetType = NonNullable<DictionaryChangeContract['sdDictChangeTargetType']>

export const DICTIONARY_SYSTEM_ENUM = {
  scopeType: 'DICT_SCOPE_TYPE',
  categoryStatus: 'DICT_CATEGORY_STATUS',
  dictionaryStatus: 'DICT_STATUS',
  itemStatus: 'DICT_ITEM_STATUS',
  changeType: 'DICT_CHANGE_TYPE',
  changeTargetType: 'DICT_CHANGE_TARGET_TYPE',
} as const

export type DictionarySystemEnumCode = typeof DICTIONARY_SYSTEM_ENUM[keyof typeof DICTIONARY_SYSTEM_ENUM]

export interface SystemEnumItem extends SystemEnumItemContract {
  code: string
  name: string
  description: string
  sortOrder: number
}

export interface SystemEnumDefinition extends SystemEnumDefinitionContract {
  code: string
  name: string
  description: string
  items: SystemEnumItem[]
}

export interface DictionaryItem extends DictionaryItemContract {
  id: string
  parentItemId?: string
  parentItemCode?: string
  code: string
  name: string
  description?: string
  sortOrder: number
  sdDictItemStatus: DictionaryStatus
  sdDictItemStatusText: string
}

export interface DictionarySummary extends DictionarySummaryContract {
  id: string
  revision: number
  sdDictScopeType: DictionaryScopeType
  sdDictScopeTypeText: string
  scopeCode: string
  tenantId?: string
  categoryId: string
  categoryCode: string
  categoryName: string
  code: string
  name: string
  description?: string
  systemManaged: boolean
  sdDictStatus: DictionaryStatus
  sdDictStatusText: string
  itemCount: number
  updatedAt: string
  updatedBy: string
}

export interface DictionaryDetail extends DictionaryDetailContract {
  id: string
  revision: number
  sdDictScopeType: DictionaryScopeType
  sdDictScopeTypeText: string
  scopeCode: string
  categoryId: string
  categoryCode: string
  categoryName: string
  code: string
  name: string
  systemManaged: boolean
  sdDictStatus: DictionaryStatus
  sdDictStatusText: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  items: DictionaryItem[]
}

export interface DictionaryChange {
  id: string
  categoryId?: string
  dictionaryId?: string
  itemId?: string
  sdDictChangeType: DictionaryChangeType
  sdDictChangeTypeText: string
  sdDictChangeTargetType: DictionaryChangeTargetType
  sdDictChangeTargetTypeText: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
  requestCode: string
  changedAt: string
  changedBy: string
}

export interface DictionaryCategory extends DictionaryCategoryContract {
  id: string
  revision: number
  sdDictScopeType: DictionaryScopeType
  sdDictScopeTypeText: string
  scopeCode: string
  tenantId?: string
  parentId?: string
  code: string
  name: string
  description?: string
  sortOrder: number
  sdDictCategoryStatus: DictionaryStatus
  sdDictCategoryStatusText: string
  dictionaryCount: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface DictionaryValue extends DictionaryValueContract {
  code: string
  name: string
  sortOrder: number
  attributes?: Record<string, string>
  parentCode?: string
}

export type DictionaryAttributeDataType = 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'TEXT' | 'CODE' | 'DATE' | 'DATETIME' | 'DICT_REF'
export type DictionaryAttributeCardinality = 'SINGLE' | 'MULTIPLE'
export type DictionaryAttributeScopeType = 'PLATFORM' | 'TENANT' | 'ORGANIZATION' | 'DEPARTMENT'
export type DictionaryAttributeOverridePolicy = 'ANY' | 'NO_OVERRIDE'
export type DictionaryAttributeValueMode = 'OVERRIDE' | 'EXPLICIT_EMPTY'

export interface DictionaryAttributeReferenceOption { id: string; code: string; name: string; sortOrder: number }
export interface DictionaryAttributeDefinition {
  id: string
  revision: number
  dictionaryId: string
  code: string
  name: string
  description: string
  dataType: DictionaryAttributeDataType
  cardinality: DictionaryAttributeCardinality
  referenceDictionaryId?: string
  referenceDictionaryCode?: string
  referenceDictionaryName?: string
  schema: Record<string, unknown>
  minimumScope: DictionaryAttributeScopeType
  overridePolicy: DictionaryAttributeOverridePolicy
  requiredValue: boolean
  searchable: boolean
  status: DictionaryStatus
  updatedAt: string
  updatedBy: string
  referenceOptions: DictionaryAttributeReferenceOption[]
}

export interface DictionaryAttributeValueMember {
  id: string
  valueOrder: number
  value?: string
  referenceItemId?: string
  referenceItemCode?: string
  referenceItemName?: string
}

export interface DictionaryAttributeValueSet {
  scopeType: DictionaryAttributeScopeType
  scopeCode: string
  tenantId?: string
  organizationId?: string
  departmentId?: string
  valueMode: DictionaryAttributeValueMode
  values: DictionaryAttributeValueMember[]
  sourceLabel: string
}

export interface DictionaryItemAttribute {
  definition: DictionaryAttributeDefinition
  configured?: DictionaryAttributeValueSet
  resolved?: DictionaryAttributeValueSet
  inherited: boolean
}

export interface DictionaryItemAttributeConfiguration {
  dictionaryId: string
  dictionaryItemId: string
  itemCode: string
  itemName: string
  editingScope: DictionaryAttributeScopeType
  editingScopeCode: string
  attributes: DictionaryItemAttribute[]
}

export interface ApplicableDictionaryItem {
  id: string
  code: string
  name: string
  sortOrder: number
  matchedAttributeCode: string
  matchedReferenceCode: string
  resolvedScopeCode: string
  attributes?: Record<string, string>
}

export interface DictionaryAttributeDefinitionInput {
  expectedDictionaryRevision: number
  expectedAttributeRevision?: number
  code?: string
  name: string
  description: string
  dataType: DictionaryAttributeDataType
  cardinality: DictionaryAttributeCardinality
  referenceDictionaryId?: string
  schema?: Record<string, unknown>
  minimumScope: DictionaryAttributeScopeType
  overridePolicy: DictionaryAttributeOverridePolicy
  requiredValue: boolean
  searchable: boolean
  reason?: string
  requestCode: string
}

export interface DictionaryMutationContext extends RevisionContract {
  expectedRevision: number
  reason?: string
  requestCode: string
}

export interface CreateDictionaryInput extends CreateDictionaryContract {}

export interface UpdateDictionaryInput extends UpdateDictionaryContract {}
export interface CreateDictionaryCategoryInput extends CreateCategoryContract {}
export interface UpdateDictionaryCategoryInput extends UpdateCategoryContract {}

export interface CreateDictionaryItemInput extends CreateItemContract {
  sortOrder: number
  parentItemId?: string
}

export interface UpdateDictionaryItemInput extends UpdateItemContract {
  sortOrder: number
  parentItemId?: string
}

export function systemEnumItems(definitions: SystemEnumDefinition[] | undefined,
                                code: string): SystemEnumItem[] {
  return definitions?.find((definition) => definition.code === code)?.items ?? []
}

export function systemEnumItemName(definitions: SystemEnumDefinition[] | undefined,
                                   code: string, itemCode: string): string {
  return systemEnumItems(definitions, code).find((item) => item.code === itemCode)?.name ?? itemCode
}

export function createDictionaryApi(client: ApiClient) {
  return {
    systemEnums: () => client.request<SystemEnumDefinition[]>('/api/platform/dictionaries/system-enums'),
    systemEnum: (code: string) => client.request<SystemEnumDefinition>(
      `/api/platform/dictionaries/system-enums/${code}`,
    ),
    resolve: (code: string) => client.request<DictionaryValue[]>(
      `/api/platform/dictionaries/resolve/${encodeURIComponent(code)}`,
    ),
    applicable: (code: string, attributeCode: string, referenceCode: string) => {
      const params = new URLSearchParams({ attributeCode, referenceCode })
      return client.request<ApplicableDictionaryItem[]>(
        `/api/platform/dictionaries/resolve/${encodeURIComponent(code)}/applicable?${params}`,
      )
    },
    list: (query = '', categoryId = '', scopeType = '', status = '') => {
      const params = new URLSearchParams()
      if (query.trim()) params.set('query', query.trim())
      if (categoryId) params.set('categoryId', categoryId)
      if (scopeType) params.set('scopeType', scopeType)
      if (status) params.set('status', status)
      const suffix = params.size ? `?${params}` : ''
      return client.request<DictionarySummary[]>(`/api/platform/dictionaries${suffix}`)
    },
    categories: () => client.request<DictionaryCategory[]>('/api/platform/dictionaries/categories'),
    categoryChanges: (id: string) => client.request<DictionaryChange[]>(
      `/api/platform/dictionaries/categories/${id}/changes`,
    ),
    createCategory: (input: CreateDictionaryCategoryInput) => client.request<DictionaryCategory>(
      '/api/platform/dictionaries/categories', { method: 'POST', body: JSON.stringify(input) },
    ),
    updateCategory: (id: string, input: UpdateDictionaryCategoryInput) => client.request<DictionaryCategory>(
      `/api/platform/dictionaries/categories/${id}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    changeCategoryStatus: (id: string, enabled: boolean, input: DictionaryMutationContext) =>
      client.request<DictionaryCategory>(
        `/api/platform/dictionaries/categories/${id}/${enabled ? 'enable' : 'disable'}`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    get: (id: string) => client.request<DictionaryDetail>(`/api/platform/dictionaries/${id}`),
    changes: (id: string) => client.request<DictionaryChange[]>(`/api/platform/dictionaries/${id}/changes`),
    attributes: (id: string) => client.request<DictionaryAttributeDefinition[]>(
      `/api/platform/dictionaries/${id}/attributes`,
    ),
    createAttribute: (id: string, input: DictionaryAttributeDefinitionInput) =>
      client.request<DictionaryAttributeDefinition>(`/api/platform/dictionaries/${id}/attributes`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    updateAttribute: (id: string, attributeId: string, input: DictionaryAttributeDefinitionInput) =>
      client.request<DictionaryAttributeDefinition>(`/api/platform/dictionaries/${id}/attributes/${attributeId}`, {
        method: 'PUT', body: JSON.stringify(input),
      }),
    changeAttributeStatus: (id: string, attributeId: string, enabled: boolean,
                            input: { expectedDictionaryRevision: number; expectedAttributeRevision: number; reason?: string; requestCode: string }) =>
      client.request<DictionaryAttributeDefinition>(
        `/api/platform/dictionaries/${id}/attributes/${attributeId}/${enabled ? 'enable' : 'disable'}`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    itemAttributes: (id: string, itemId: string, scopeType: DictionaryAttributeScopeType = 'ORGANIZATION',
                     organizationId = '', departmentId = '') =>
      client.request<DictionaryItemAttributeConfiguration>(
        `/api/platform/dictionaries/${id}/items/${itemId}/attributes?${new URLSearchParams({
          scopeType, ...(organizationId ? { organizationId } : {}), ...(departmentId ? { departmentId } : {}),
        })}`,
      ),
    itemAttributeConfigurations: (id: string, scopeType: DictionaryAttributeScopeType = 'ORGANIZATION',
                                  organizationId = '', departmentId = '') =>
      client.request<DictionaryItemAttributeConfiguration[]>(
        `/api/platform/dictionaries/${id}/item-attribute-configurations?${new URLSearchParams({
          scopeType, ...(organizationId ? { organizationId } : {}), ...(departmentId ? { departmentId } : {}),
        })}`,
      ),
    setItemAttribute: (id: string, itemId: string, attributeId: string, input: {
      expectedDictionaryRevision: number
      scopeType: DictionaryAttributeScopeType
      organizationId?: string
      departmentId?: string
      valueMode: DictionaryAttributeValueMode
      values: string[]
      reason?: string
      requestCode: string
    }) => client.request<DictionaryItemAttributeConfiguration>(
      `/api/platform/dictionaries/${id}/items/${itemId}/attributes/${attributeId}/values`,
      { method: 'PUT', body: JSON.stringify(input) },
    ),
    inheritItemAttribute: (id: string, itemId: string, attributeId: string, input: {
      expectedDictionaryRevision: number
      scopeType: DictionaryAttributeScopeType
      organizationId?: string
      departmentId?: string
      reason?: string
      requestCode: string
    }) => client.request<DictionaryItemAttributeConfiguration>(
      `/api/platform/dictionaries/${id}/items/${itemId}/attributes/${attributeId}/inherit`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
    create: (input: CreateDictionaryInput) => client.request<DictionaryDetail>('/api/platform/dictionaries', {
      method: 'POST', body: JSON.stringify(input),
    }),
    update: (id: string, input: UpdateDictionaryInput) => client.request<DictionaryDetail>(
      `/api/platform/dictionaries/${id}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    changeStatus: (id: string, enabled: boolean, input: DictionaryMutationContext) =>
      client.request<DictionaryDetail>(`/api/platform/dictionaries/${id}/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST', body: JSON.stringify(input),
      }),
    addItem: (id: string, input: CreateDictionaryItemInput) => client.request<DictionaryDetail>(
      `/api/platform/dictionaries/${id}/items`, { method: 'POST', body: JSON.stringify(input) },
    ),
    updateItem: (id: string, itemId: string, input: UpdateDictionaryItemInput) =>
      client.request<DictionaryDetail>(`/api/platform/dictionaries/${id}/items/${itemId}`, {
        method: 'PUT', body: JSON.stringify(input),
      }),
    changeItemStatus: (id: string, itemId: string, enabled: boolean, input: DictionaryMutationContext) =>
      client.request<DictionaryDetail>(
        `/api/platform/dictionaries/${id}/items/${itemId}/${enabled ? 'enable' : 'disable'}`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
  }
}
