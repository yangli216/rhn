import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RemoteSearchSelect, type RemoteSearchOption } from './RemoteSearchSelect'

const first = { value: 'first', label: '首次结果', code: 'FIRST' }
const latest = { value: 'latest', label: '最新结果', code: 'LATEST' }
function query(value: string) { fireEvent.change(screen.getByLabelText('远程检索'), { target: { value } }) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('remote search error and request boundaries', () => {
  it.each([true, false])('preserves the configured cache policy, cacheResults=%s', async cacheResults => {
    const load = vi.fn().mockResolvedValueOnce([first]).mockResolvedValueOnce([]).mockResolvedValueOnce([latest])
    render(<RemoteSearchSelect loadOptions={load} onChange={vi.fn()} defaultOpen cacheResults={cacheResults} debounceMs={0} />)
    query('same'); await screen.findByRole('option', { name: /首次结果/ })
    query('other'); await screen.findByText('未找到匹配结果')
    query('same')
    expect(await screen.findByRole('option', { name: cacheResults ? /首次结果/ : /最新结果/ })).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(cacheResults ? 2 : 3)
  })
  it('surfaces synchronous loader exceptions and retries the exact query', async () => {
    const load = vi.fn().mockImplementationOnce(() => { throw new Error('目录契约无效') }).mockResolvedValue([latest])
    render(<RemoteSearchSelect loadOptions={load} onChange={vi.fn()} defaultOpen debounceMs={0} />)
    query('目标')
    expect(await screen.findByRole('alert')).toHaveTextContent('目录契约无效')
    await userEvent.click(screen.getByRole('button', { name: '重新检索' }))
    expect(await screen.findByRole('option', { name: /最新结果/ })).toBeInTheDocument()
    expect(load.mock.calls).toEqual([['目标'], ['目标']])
  })
  it('does not accept a late response from the previous query', async () => {
    const pending = deferred<RemoteSearchOption[]>(), load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue([latest])
    render(<RemoteSearchSelect loadOptions={load} onChange={vi.fn()} defaultOpen debounceMs={0} />)
    query('old'); await waitFor(() => expect(load).toHaveBeenCalledWith('old'))
    query('new'); await screen.findByRole('option', { name: /最新结果/ })
    await act(async () => pending.resolve([first]))
    expect(screen.queryByRole('option', { name: /首次结果/ })).not.toBeInTheDocument()
  })
  it('clears selectable results on disable and reloads after enabling', async () => {
    const onChange = vi.fn(), load = vi.fn().mockResolvedValue([first])
    const content = (disabled: boolean) => <RemoteSearchSelect loadOptions={load} onChange={onChange} defaultOpen
      debounceMs={0} cacheResults={false} disabled={disabled} />
    const view = render(content(false)); query('same')
    await screen.findByRole('option', { name: /首次结果/ })
    view.rerender(content(true))
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    load.mockResolvedValue([latest]); view.rerender(content(false))
    expect(await screen.findByRole('option', { name: /最新结果/ })).toBeInTheDocument()
  })
  it('invalidates cached queries when the loader changes', async () => {
    const load = vi.fn().mockResolvedValue([first]), next = vi.fn().mockResolvedValue([latest])
    const view = render(<RemoteSearchSelect loadOptions={load} onChange={vi.fn()} defaultOpen debounceMs={0} />)
    query('same'); await screen.findByRole('option', { name: /首次结果/ })
    view.rerender(<RemoteSearchSelect loadOptions={next} onChange={vi.fn()} defaultOpen debounceMs={0} />)
    expect(await screen.findByRole('option', { name: /最新结果/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /首次结果/ })).not.toBeInTheDocument()
  })
})
