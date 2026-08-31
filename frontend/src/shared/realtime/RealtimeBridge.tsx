import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { RhnApi } from '../rhnApi'
import type { RealtimeEvent } from '../api/realtimeApi'

export function RealtimeBridge({ api, contextKey, organizationId, onSessionTerminated }: {
  api: RhnApi
  contextKey: string
  organizationId: string
  onSessionTerminated?: () => void
}) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const controller = new AbortController()
    let lastEventId: string | undefined

    const invalidate = (event: RealtimeEvent) => {
      if (event.type === 'SESSION_TERMINATED') {
        onSessionTerminated?.()
        return
      }
      if (event.type === 'PHARMACY_QUEUE_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['pharmacy-inbox', event.organizationId ?? organizationId] })
      }
      if (event.type.startsWith('DIAGNOSTIC_CRITICAL_VALUE_')) {
        void queryClient.invalidateQueries({ queryKey: ['critical-values', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['portal-notifications', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['portal-summary', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['work-tasks'] })
      }
      if (event.type.startsWith('SYSTEM_ANNOUNCEMENT_')) {
        void queryClient.invalidateQueries({ queryKey: ['announcements', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['announcement-summary', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['announcement-management'] })
      }
      if (event.type === 'PRESENCE_SUMMARY_CHANGED') {
        void queryClient.invalidateQueries({ queryKey: ['presence-summary', contextKey] })
        void queryClient.invalidateQueries({ queryKey: ['presence-users', contextKey] })
      }
    }

    const run = async () => {
      let attempt = 0
      while (!controller.signal.aborted) {
        try {
          lastEventId = await api.realtime.connect(controller.signal, lastEventId, invalidate)
          if (!controller.signal.aborted) {
            await delay(1000 + Math.random() * 500, controller.signal)
          }
          attempt = 0
        } catch (error) {
          if (controller.signal.aborted) return
          attempt++
          await delay(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500,
            controller.signal)
        }
        if (!controller.signal.aborted) {
          void queryClient.invalidateQueries({ queryKey: ['pharmacy-inbox', organizationId] })
          void queryClient.invalidateQueries({ queryKey: ['critical-values', contextKey] })
          void queryClient.invalidateQueries({ queryKey: ['portal-summary', contextKey] })
          void queryClient.invalidateQueries({ queryKey: ['announcement-summary', contextKey] })
        }
      }
    }
    void run()
    return () => controller.abort()
  }, [api, contextKey, onSessionTerminated, organizationId, queryClient])

  useEffect(() => {
    const report = () => {
      if (document.visibilityState === 'visible') void api.presence.activity().catch(() => undefined)
    }
    report()
    const timer = window.setInterval(report, 60_000)
    const visibility = () => report()
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', report)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', report)
    }
  }, [api, contextKey])

  return null
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve() }, { once: true })
  })
}
