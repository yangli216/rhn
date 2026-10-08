import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../../shared/rhnApi'

export function useTemplateApplication(contextKey: string, blocked: boolean, readDraft?: () => string, contextChangedMessage?: string) {
  const generation = useRef(0), inFlight = useRef(false)
  const latest = useRef({ contextKey, blocked, readDraft })
  latest.current = { contextKey, blocked, readDraft }
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (inFlight.current) setError(contextChangedMessage ?? '当前就诊、草稿或模板选择已变化，本次未带入，请重新核对。')
    generation.current += 1; inFlight.current = false; setPending(false)
    return () => { generation.current += 1 }
  }, [contextKey, blocked, contextChangedMessage])
  async function run<T>(load: (isCurrent: () => boolean) => Promise<T>, apply: (result: T) => void) {
    if (latest.current.blocked || inFlight.current) return
    const captured = latest.current.contextKey, draft = latest.current.readDraft?.(), current = ++generation.current
    const isCurrent = () => current === generation.current && captured === latest.current.contextKey && !latest.current.blocked
      && draft === latest.current.readDraft?.()
    inFlight.current = true; setPending(true); setError('')
    try {
      const result = await load(isCurrent)
      if (isCurrent()) apply(result)
      else if (current === generation.current) setError(contextChangedMessage ?? '当前草稿已变化，本次未带入，请重新核对。')
    } catch (failure) {
      if (isCurrent()) setError(errorMessage(failure))
    } finally {
      if (current === generation.current) { inFlight.current = false; setPending(false) }
    }
  }
  return { pending, error, run, reject: setError }
}
