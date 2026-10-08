import { useEffect, useRef } from 'react'

/** Reject late replies after context/permission changes, including a change away and back. */
export function useClinicalDocumentSession(api: object, identity: string, enabled: boolean) {
  const frame = useRef({ api, identity, enabled, revision: 0 })
  const mounted = useRef(false)
  if (frame.current.api !== api || frame.current.identity !== identity || frame.current.enabled !== enabled) {
    frame.current = { api, identity, enabled, revision: frame.current.revision + 1 }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; frame.current.revision += 1 }
  }, [])
  const renderedFrame = frame.current
  return () => {
    const revision = renderedFrame.revision
    return () => {
      if (!mounted.current || !frame.current.enabled || frame.current !== renderedFrame || frame.current.revision !== revision) {
        throw new Error('文书操作未确认：患者、工作上下文或操作权限已变化。后续操作已停止；原文书可能已更新，请返回原上下文核实')
      }
    }
  }
}
