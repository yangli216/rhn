import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceUnsavedPrompt } from './useWorkspaceUnsavedPrompt'

function Harness({ proceed }: { proceed: (answer: boolean) => void }) {
  const guard = useWorkspaceUnsavedPrompt()
  return <><button onClick={() => guard.markDirty('laboratory', true)}>编辑</button>
    <button onClick={() => guard.markDirty('laboratory', false)}>已保存</button>
    <button onClick={() => void guard.confirmDiscard(['laboratory']).then(proceed)}>关闭页签</button>
    <button onClick={() => void guard.confirmDiscard(['warehouse']).then(proceed)}>切换无关上下文</button>{guard.prompt}</>
}
describe('workspace unsaved protection', () => {
  it('keeps dirty work on cancellation, protects again, and allows clean or unrelated work', async () => {
    const proceed = vi.fn(); render(<Harness proceed={proceed} />)
    fireEvent.click(screen.getByText('编辑')); fireEvent.click(screen.getByText('关闭页签'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('返回继续编辑'))
    await waitFor(() => expect(proceed).toHaveBeenLastCalledWith(false))
    fireEvent.click(screen.getByText('切换无关上下文'))
    await waitFor(() => expect(proceed).toHaveBeenLastCalledWith(true))
    fireEvent.click(screen.getByText('关闭页签'))
    fireEvent.click(await screen.findByText('放弃未保存内容并继续'))
    await waitFor(() => expect(proceed).toHaveBeenLastCalledWith(true))
    fireEvent.click(screen.getByText('已保存')); fireEvent.click(screen.getByText('关闭页签'))
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(4))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
