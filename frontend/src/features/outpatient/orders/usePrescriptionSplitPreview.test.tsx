import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BatchOrderMedicationItem, SplitPrescriptionPlan } from '../../../shared/api/encountersApi'
import { requireSplitPreview, usePrescriptionSplitPreview } from './usePrescriptionSplitPreview'

const item: BatchOrderMedicationItem = { medicationId: '1', catalogItemId: '11', quantity: 2,
  routeCode: 'PO', categoryCode: 'WESTERN', routeExecutionType: 'NONE', stockSiteId: '10', stockSiteName: '实际药房' }
const plan: SplitPrescriptionPlan = { categoryCode: 'WESTERN', title: '西药处方', stockSiteId: '10',
  stockSiteName: '实际药房', routeGroupType: 'NON_INFUSION', ruleReasons: ['分类分方'], items: [{ item, groupLeader: false }] }
const encounter = { id: 'e', residentId: 'r', organizationId: 'org', departmentId: 'dept' }
function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('verified split preview', () => {
  it.each([[], [{ ...plan, items: [] }], [plan, plan], [{ ...plan, items: [{ item: { ...item, quantity: 1 }, groupLeader: false }] }],
    [{ ...plan, stockSiteName: null }], [{ ...plan, categoryCode: '' }]].map(value => ({ value })))('rejects incomplete, duplicate or changed receipts %#', ({ value }) => {
    expect(() => requireSplitPreview(value, [item])).toThrow('分方结果')
  })
  it('matches duplicate products by actual quantity and instructions without relying on order', () => {
    const second = { ...item, quantity: 3, medicationInstruction: '晚间服用' }
    expect(requireSplitPreview([{ ...plan, items: [{ item: second, groupLeader: false }, ...plan.items] }], [item, second])).toHaveLength(1)
  })
  it('accepts verified names and explicit absence of a pharmacy for self-provided medication', () => {
    expect(requireSplitPreview([plan], [{ ...item, stockSiteName: '客户端旧名' }])).toEqual([plan])
    const own = { ...item, selfProvided: true, stockSiteId: null, stockSiteName: null }
    expect(requireSplitPreview([{ ...plan, stockSiteId: null, stockSiteName: null, items: [{ item: own, groupLeader: false }] }], [own])).toHaveLength(1)
  })
  it('blocks failed preview, supports retry and suppresses stale plans while refetching', async () => {
    const api = { autoSplitPreview: vi.fn().mockRejectedValueOnce(new Error('未配置路由')).mockResolvedValue([plan]) }
    const view = renderHook(usePrescriptionSplitPreview, { wrapper, initialProps: { api, encounter, items: [item], enabled: true } })
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(view.result.current.plans).toEqual([])
    expect(() => view.result.current.requireReady()).toThrow('尚未确认')
    await act(async () => { await view.result.current.refetch() })
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    let release!: (value: SplitPrescriptionPlan[]) => void
    api.autoSplitPreview.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    act(() => { void view.result.current.refetch() })
    await waitFor(() => expect(view.result.current.ready).toBe(false))
    expect(view.result.current.plans).toEqual([])
    await act(async () => release([plan]))
    await waitFor(() => expect(view.result.current.ready).toBe(true))
  })
  it.each(['id', 'residentId', 'organizationId', 'departmentId', 'api', 'items'])('does not apply a late result after %s changes', async field => {
    let release!: (value: SplitPrescriptionPlan[]) => void
    const api = { autoSplitPreview: vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve })) }
    const initialProps = { api, encounter, items: [item], enabled: true }
    const view = renderHook(usePrescriptionSplitPreview, { wrapper, initialProps })
    const oldRelease = release
    if (field === 'api') view.rerender({ ...initialProps, api: { autoSplitPreview: vi.fn().mockReturnValue(new Promise(() => {})) } })
    else if (field === 'items') view.rerender({ ...initialProps, items: [{ ...item, quantity: 3 }] })
    else view.rerender({ ...initialProps, encounter: { ...encounter, [field]: 'changed' } })
    await act(async () => oldRelease([plan]))
    expect(view.result.current.ready).toBe(false)
    expect(view.result.current.plans).toEqual([])
  })
  it('does not need a medication preview for service-only orders', () => {
    const api = { autoSplitPreview: vi.fn() }
    const view = renderHook(usePrescriptionSplitPreview, { wrapper, initialProps: { api, encounter, items: [], enabled: true } })
    expect(view.result.current.ready).toBe(true)
    expect(api.autoSplitPreview).not.toHaveBeenCalled()
  })
})
