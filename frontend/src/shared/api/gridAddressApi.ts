import type { ApiClient } from './httpClient'

export type GridAddressLevel = 'PROVINCE' | 'CITY' | 'COUNTY' | 'STREET' | 'COMMUNITY'
export type GridAddressStatus = 'ACTIVE' | 'INACTIVE'

export interface GridAddressNode {
  id: string
  revision: number
  parentId?: string
  level: GridAddressLevel
  levelName: string
  depth: number
  code: string
  name: string
  shortName?: string
  pinyinCode: string
  fullPath: string
  sortOrder: number
  status: GridAddressStatus
  systemManaged: boolean
  updatedAt: string
}

export interface GridAddressCreateInput {
  parentId?: string
  level: GridAddressLevel
  code: string
  name: string
  shortName?: string
  pinyinCode: string
  sortOrder: number
}

export interface GridAddressUpdateInput {
  expectedRevision: number
  parentId?: string
  name: string
  shortName?: string
  pinyinCode: string
  sortOrder: number
}

export function createGridAddressApi(client: ApiClient) {
  return {
    list: (maxLevel: 3 | 5 = 5, query = '', includeInactive = false) => {
      const params = new URLSearchParams({ maxLevel: String(maxLevel) })
      if (query.trim()) params.set('query', query.trim())
      if (includeInactive) params.set('includeInactive', 'true')
      return client.request<GridAddressNode[]>(`/api/platform/grid-addresses?${params}`)
    },
    create: (input: GridAddressCreateInput) => client.request<GridAddressNode>('/api/platform/grid-addresses', {
      method: 'POST', body: JSON.stringify(input),
    }),
    update: (id: string, input: GridAddressUpdateInput) => client.request<GridAddressNode>(
      `/api/platform/grid-addresses/${id}`, { method: 'PUT', body: JSON.stringify(input) },
    ),
    changeStatus: (node: GridAddressNode, status: GridAddressStatus) => client.request<GridAddressNode>(
      `/api/platform/grid-addresses/${node.id}/status`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: node.revision, status }),
      },
    ),
  }
}
