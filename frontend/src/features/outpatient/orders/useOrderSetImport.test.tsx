import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupApi, groupFixture } from './orderSetImport.testFixtures'
import { useOrderSetImport } from './useOrderSetImport'

function setup() {
  const group = groupFixture(), { api } = groupApi(group)
  let release!: (value: unknown) => void
  const deferred = new Promise(resolve => { release = resolve })
  vi.mocked(api.masterData.itemGroups).mockReturnValueOnce(deferred as never)
  const props = { encounter: { id: 'e', residentId: 'r', organizationId: 'org', departmentId: 'd' }, api,
    busy: false, readOnly: false, onResolved: vi.fn() }
  return { group, api, release, props }
}
describe('order-set import lifecycle', () => {
  it('suppresses double selection and applies the complete result once', async () => {
    const { group, props, api, release } = setup(), view = renderHook(useOrderSetImport, { initialProps: props })
    act(() => { void view.result.current.start(group); void view.result.current.start(group) })
    expect(view.result.current.pending).toBe(true)
    expect(api.masterData.itemGroups).toHaveBeenCalledTimes(1)
    await act(async () => release([group]))
    await waitFor(() => expect(props.onResolved).toHaveBeenCalledTimes(1))
    expect(props.onResolved.mock.calls[0][0].drafts).toHaveLength(2)
  })
  it.each(['id', 'residentId', 'organizationId', 'departmentId', 'busy', 'readOnly', 'api', 'cancel', 'unmount'])('discards a late import after %s changes', async field => {
    const { group, props, release } = setup(), view = renderHook(useOrderSetImport, { initialProps: props })
    act(() => { void view.result.current.start(group) })
    if (field === 'cancel') act(() => view.result.current.cancel())
    else if (field === 'unmount') view.unmount()
    else if (field === 'busy' || field === 'readOnly') view.rerender({ ...props, [field]: true })
    else if (field === 'api') view.rerender({ ...props, api: groupApi().api })
    else view.rerender({ ...props, encounter: { ...props.encounter, [field]: 'other' } })
    await act(async () => release([group]))
    expect(props.onResolved).not.toHaveBeenCalled()
  })
  it('does not revive an import when a previous encounter returns', async () => {
    const { group, props, release } = setup(), view = renderHook(useOrderSetImport, { initialProps: props })
    act(() => { void view.result.current.start(group) })
    view.rerender({ ...props, encounter: { ...props.encounter, id: 'other' } })
    view.rerender(props)
    await act(async () => release([group]))
    expect(props.onResolved).not.toHaveBeenCalled()
  })
  it('retains the failure for an explicit retry and refetches authoritative data', async () => {
    const { props, group, release, api } = setup(), view = renderHook(useOrderSetImport, { initialProps: props })
    act(() => { void view.result.current.start(group) })
    await act(async () => release([]))
    await waitFor(() => expect(view.result.current.error).toContain('组套未导入'))
    expect(props.onResolved).not.toHaveBeenCalled()
    act(() => view.result.current.retry())
    await waitFor(() => expect(props.onResolved).toHaveBeenCalledTimes(1))
    expect(api.masterData.itemGroups).toHaveBeenCalledTimes(2)
    expect(view.result.current.error).toBeUndefined()
  })
})
