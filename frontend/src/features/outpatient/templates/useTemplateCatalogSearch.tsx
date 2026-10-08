import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../../shared/rhnApi'
import { Button } from '../../../shared/ui'

export function useTemplateCatalogSearch<T>(context: string, query: string, enabled: boolean, load: (query: string) => Promise<T[]>) {
  const signature = JSON.stringify([context, query.trim(), enabled])
  const latest = useRef({ signature, query, enabled, load })
  latest.current = { signature, query, enabled, load }
  const epoch = useRef(0)
  const [state, setState] = useState<{ signature: string; epoch: number; status: 'loading' | 'success' | 'error'; rows: T[]; error?: string }>()
  useEffect(() => {
    epoch.current += 1
    return () => { epoch.current += 1 }
  }, [signature])
  async function search() {
    const captured = latest.current
    if (!captured.enabled || !captured.query.trim()) return
    const request = ++epoch.current
    const current = () => epoch.current === request && latest.current.signature === captured.signature && latest.current.enabled
    setState({ signature: captured.signature, epoch: request, status: 'loading', rows: [] })
    try {
      const rows = await captured.load(captured.query.trim())
      if (current()) setState({ signature: captured.signature, epoch: request, status: 'success', rows })
    } catch (cause) {
      if (current()) setState({ signature: captured.signature, epoch: request, status: 'error', rows: [], error: errorMessage(cause) })
    }
  }
  const isCurrent = () => enabled && state?.signature === latest.current.signature && state.epoch === epoch.current
  const status = isCurrent() ? state!.status : 'idle'
  return { search, status, error: status === 'error' ? state?.error : undefined,
    rows: status === 'success' ? state!.rows : [],
    canSelect: (item: T) => isCurrent() && state?.status === 'success' && state.rows.includes(item) }
}

export function TemplateCatalogSearchStatus({ search }: { search: Pick<ReturnType<typeof useTemplateCatalogSearch>, 'status' | 'error' | 'search' | 'rows'> }) {
  if (search.status === 'error') return <div role="alert" className="doctor-plan-pool-notice">目录检索失败：{search.error}
    <Button variant="text" onClick={() => void search.search()}>重新检索</Button></div>
  if (search.status === 'loading') return <div role="status">正在检索目录…</div>
  if (search.status === 'success') return <div role="status">{search.rows.length
    ? '显示本次查询的目录候选；如未找到目标，请细化关键词。' : '本次查询未找到匹配目录项。'}</div>
  return null
}
