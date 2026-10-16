import type { RhnApi } from '../../shared/rhnApi'
const scopes = new WeakMap<RhnApi, number>()
let nextScope = 0
export function organizationQueryScope(api: RhnApi) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return scopes.get(api)!
}
