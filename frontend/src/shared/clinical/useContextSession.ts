import { useMemo } from 'react'

/** Keep requests in one client context together; changing the client starts a new session. */
export function useContextSession(contextIdentity: object) {
  return useMemo(() => ({ contextIdentity, id: globalThis.crypto.randomUUID() }), [contextIdentity]).id
}
