import type { components } from './generated'
import type { ApiClient } from './httpClient'

export type BusinessNumberRuleView = components['schemas']['BusinessNumberRuleView']

export function createBusinessNumberingApi(client: ApiClient) {
  return { rules: () => client.request<BusinessNumberRuleView[]>('/api/platform/business-numbering/rules') }
}
