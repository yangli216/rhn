import { useEffect, useRef } from 'react'

/** Only finalized speech schedules work. Typing and AI adoption never start an analysis loop. */
export function useStableVoiceCopilot({ scope, transcript, inputKey, enabled, busy, run }: {
  scope: string; transcript: string; inputKey: string; enabled: boolean; busy: boolean
  run: () => Promise<void>
}) {
  const handled = useRef({ scope, transcript: '' })
  const latestRun = useRef(run)
  latestRun.current = run
  useEffect(() => {
    if (handled.current.scope !== scope) handled.current = { scope, transcript: '' }
    if (!enabled || busy || !transcript.trim() || handled.current.transcript === transcript) return
    const timer = window.setTimeout(() => {
      handled.current = { scope, transcript }
      void latestRun.current().catch(() => undefined)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [scope, transcript, inputKey, enabled, busy])
}
