import { useCallback, useRef, useState } from 'react'
import { Button, Dialog } from '../shared/ui'

export function useWorkspaceUnsavedPrompt() {
  const dirty = useRef(new Set<string>())
  const resolving = useRef<((answer: boolean) => void) | null>(null)
  const [open, setOpen] = useState(false)
  const markDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id)
    else dirty.current.delete(id)
  }, [])
  const confirmDiscard = useCallback((ids: string[]): Promise<boolean> => {
    if (!ids.some((id) => dirty.current.has(id))) return Promise.resolve(true)
    if (resolving.current) return Promise.resolve(false)
    return new Promise((resolve) => { resolving.current = resolve; setOpen(true) })
  }, [])
  const answer = (value: boolean) => {
    resolving.current?.(value); resolving.current = null; setOpen(false)
  }
  const prompt = open && <Dialog title="医技报告有未保存内容" description="关闭工作台或切换工作机构、科室会丢失未保存输入。"
    closeOnBackdrop={false} onClose={() => answer(false)}>
    <p>可先返回工作台保存草稿，再继续操作。</p>
    <div className="ui-form-actions"><Button variant="secondary" onClick={() => answer(false)}>返回继续编辑</Button>
      <Button onClick={() => answer(true)}>放弃未保存内容并继续</Button></div>
  </Dialog>
  return { markDirty, confirmDiscard, prompt }
}
