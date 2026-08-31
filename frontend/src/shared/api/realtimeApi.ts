import type { ApiClient } from './httpClient'

export interface RealtimeEvent {
  id: string
  type: string
  occurredAt: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  organizationId?: string | null
  departmentId?: string | null
  recipientUserId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  routePath?: string | null
  attributes: Record<string, unknown>
}

export function createRealtimeApi(client: ApiClient) {
  return {
    connect: async (signal: AbortSignal, lastEventId: string | undefined,
      onEvent: (event: RealtimeEvent) => void) => {
      const response = await client.eventStream('/api/realtime/events', signal, lastEventId)
      if (!response.body) throw new Error('浏览器不支持流式响应')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let latestId = lastEventId
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = eventBoundary(buffer)
        while (boundary) {
          const block = buffer.slice(0, boundary.index)
          buffer = buffer.slice(boundary.index + boundary.length)
          const parsed = parseEvent(block)
          if (parsed.id) latestId = parsed.id
          if (parsed.data && parsed.name !== 'CONNECTED') {
            const value = JSON.parse(parsed.data) as RealtimeEvent
            onEvent({ ...value, type: value.type || parsed.name || 'MESSAGE' })
          }
          boundary = eventBoundary(buffer)
        }
      }
      return latestId
    },
  }
}

function eventBoundary(value: string) {
  const match = /\r?\n\r?\n/.exec(value)
  return match ? { index: match.index, length: match[0].length } : null
}

function parseEvent(block: string) {
  let id = ''
  let name = ''
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const raw = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'id') id = raw
    if (field === 'event') name = raw
    if (field === 'data') data.push(raw)
  }
  return { id, name, data: data.join('\n') }
}
