// Bind observation caches to the API's work-context identity without serializing the client or credentials.
const scopes = new WeakMap<object, string>()
export function observationScope(api: object) {
  let scope = scopes.get(api)
  if (!scope) { scope = crypto.randomUUID(); scopes.set(api, scope) }
  return scope
}
