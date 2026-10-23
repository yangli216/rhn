import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, SESSION_ENDED_EVENT, type SessionEndedDetail } from './httpClient'

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })))
}

function listen() {
  const events: SessionEndedDetail[] = []
  const handler = (event: Event) => events.push((event as CustomEvent<SessionEndedDetail>).detail)
  window.addEventListener(SESSION_ENDED_EVENT, handler)
  return { events, stop: () => window.removeEventListener(SESSION_ENDED_EVENT, handler) }
}

describe('ApiClient session end', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['AUTHENTICATION_REQUIRED', 'SESSION_TERMINATED'] as const)('announces %s', async (code) => {
    respond(401, { code, message: '登录信息已失效，请重新登录', correlationId: 'c-1' })
    const { events, stop } = listen()

    await expect(new ApiClient(null, '1').request('/api/session')).rejects.toMatchObject({ code })

    expect(events).toEqual([{ code, message: '登录信息已失效，请重新登录' }])
    stop()
  })

  it('stays quiet for other failures', async () => {
    respond(403, { code: 'FORBIDDEN', message: '无权限', correlationId: 'c-2' })
    const { events, stop } = listen()

    await expect(new ApiClient(null, '1').request('/api/session')).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(events).toEqual([])
    stop()
  })
})
