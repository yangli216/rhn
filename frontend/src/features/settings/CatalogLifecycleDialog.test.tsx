import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { CatalogLifecycleDialog } from './BasicDataManagement'
import { nextCatalogVersionDate, requireCatalogDepartments, requireCatalogLifecycle } from './catalogLifecycleFacts'
import type { Organization } from '../../shared/model'
import type { RhnApi } from '../../shared/rhnApi'

const context = { catalogItemId: 'item', organizationId: 'org', businessDate: '2026-10-03', sourceOrganizationId: null }
const empty = { ...context, currentAdoption: null, adoptionHistory: [], currentPrices: [], priceHistory: [] }
const adoption = { id: 'adoption', revision: 1, organizationId: 'org', catalogItemId: 'item', defaultDepartmentId: null,
  localCode: 'LOCAL', localName: '本地项目', orderable: false, executable: true, chargeable: true, purchasable: false,
  stocked: false, dispensable: false, returnable: false, sdStatus: 'ACTIVE', sdStatusText: '启用', validFrom: '2026-01-01', validTo: null }
const price = { id: 'price', revision: 1, organizationId: 'org', packageId: null, sdPriceType: 'SALE', sdPriceTypeText: '销售价',
  price: 0.000123, currencyCode: 'USD', validFrom: '2026-01-01', validTo: null, sdStatus: 'ACTIVE', sdStatusText: '启用' }
const snapshot = { ...empty, currentAdoption: adoption, adoptionHistory: [adoption], currentPrices: [price], priceHistory: [price] }
const defaults = { orderable: true, executable: true, chargeable: true, purchasable: false, stocked: false, dispensable: false, returnable: false }
const org = { id: 'org', code: 'ORG', name: '机构' } as Organization
function fixture() {
  return { organization: { catalogSource: vi.fn().mockResolvedValue({ organizationId: 'org', organizationName: '机构', organizationRevision: 1,
    sourceOrganizationId: null, sourceOrganizationName: null }), departments: vi.fn().mockResolvedValue([]) },
    dictionaries: { resolve: vi.fn().mockResolvedValue([{ code: 'SALE', name: '销售价', sortOrder: 1 }]) },
    masterData: { catalogLifecycle: vi.fn().mockImplementation(async (_id, _org, businessDate) => ({ ...empty, businessDate })),
      createLifecycleAdoption: vi.fn(), createLifecyclePrice: vi.fn(), replaceLifecycleAdoption: vi.fn(), replaceLifecyclePrice: vi.fn(),
      changeLifecycleAdoptionStatus: vi.fn(), changeLifecyclePriceStatus: vi.fn() } }
}
function setup(api = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onChanged = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()
  const content = (value = api) => <QueryClientProvider client={client}><CatalogLifecycleDialog api={value as unknown as RhnApi}
    catalogItemId="item" itemName="项目" organization={org} dictionaries={{}} defaults={defaults}
    onChanged={onChanged} onClose={onClose} /></QueryClientProvider>
  const view = render(content())
  return { ...view, api, client, onChanged, onClose, switchApi: (value: ReturnType<typeof fixture>) => view.rerender(content(value)) }
}
const panel = () => document.querySelector('.master-data-lifecycle-tab-panel:not([hidden])') as HTMLElement
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('catalog lifecycle factual snapshots', () => {
  it('chooses a strictly later date without timezone day rollback', () => {
    expect(nextCatalogVersionDate('2026-10-03', '2026-10-03')).toBe('2026-10-04')
    expect(nextCatalogVersionDate('2026-12-31', '2026-10-03')).toBe('2027-01-01')
    expect(nextCatalogVersionDate('2026-01-01', '2026-10-03')).toBe('2026-10-03')
  })
  it('accepts verified empty and populated snapshots', () => {
    expect(requireCatalogLifecycle(empty, context)).toEqual(empty)
    expect(requireCatalogLifecycle(snapshot, context)).toEqual(snapshot)
  })
  it.each([
    {}, { ...empty, currentAdoption: undefined }, { ...empty, priceHistory: undefined }, { ...empty, organizationId: 'other' },
    { ...empty, catalogItemId: 'other' }, { ...empty, businessDate: '2026-10-04' },
    { ...snapshot, currentAdoption: { ...adoption, orderable: undefined } },
    { ...snapshot, currentAdoption: null }, { ...snapshot, adoptionHistory: [] },
    { ...snapshot, adoptionHistory: [adoption, adoption] },
    { ...snapshot, currentPrices: [] }, { ...snapshot, priceHistory: [price, price] },
    { ...snapshot, currentPrices: [{ ...price, price: 0 }] },
    { ...empty, priceHistory: [{ ...price, organizationId: 'other' }] },
    { ...empty, priceHistory: [{ ...price, currencyCode: undefined }] },
    { ...empty, priceHistory: [{ ...price, price: '0.00' }] },
  ])('rejects missing facts or contradictory associations %#', value => {
    expect(() => requireCatalogLifecycle(value, context)).toThrow('目录与价格快照')
  })
  it('accepts only the configured shared adoption and preserves local suspension overriding sharing', () => {
    const shared = { ...adoption, organizationId: 'source' }
    expect(requireCatalogLifecycle({ ...empty, currentAdoption: shared }, { ...context, sourceOrganizationId: 'source' })).toBeTruthy()
    expect(() => requireCatalogLifecycle({ ...empty, currentAdoption: shared }, context)).toThrow()
    expect(() => requireCatalogLifecycle({ ...empty, currentAdoption: { ...shared, defaultDepartmentId: 'foreign' } }, { ...context, sourceOrganizationId: 'source' })).toThrow()
    expect(requireCatalogLifecycle({ ...empty, adoptionHistory: [{ ...adoption, sdStatus: 'SUSPENDED' }] }, context)).toBeTruthy()
    expect(() => requireCatalogLifecycle({ ...empty, currentAdoption: shared, adoptionHistory: [{ ...adoption, sdStatus: 'SUSPENDED' }] }, { ...context, sourceOrganizationId: 'source' })).toThrow()
  })
  it('retains historical replaced/retired prices within their true validity range', () => {
    const historical = { ...price, sdStatus: 'REPLACED', validTo: '2026-10-03' }
    expect(requireCatalogLifecycle({ ...empty, priceHistory: [historical], currentPrices: [historical] }, context)).toBeTruthy()
    expect(requireCatalogLifecycle({ ...empty, businessDate: '2026-10-04', priceHistory: [historical] }, { ...context, businessDate: '2026-10-04' })).toBeTruthy()
  })
  it('allows tenant price history but not other organizations or incomplete department options', () => {
    const tenantPrice = { ...price, organizationId: null }
    expect(requireCatalogLifecycle({ ...empty, priceHistory: [tenantPrice], currentPrices: [tenantPrice] }, context)).toBeTruthy()
    expect(requireCatalogDepartments([], 'org')).toEqual([])
    for (const value of [undefined, {}, [{ id: 'd', code: 'D', name: '科室', organizationId: 'other' }]]) {
      expect(() => requireCatalogDepartments(value, 'org')).toThrow()
    }
  })
})

describe('catalog lifecycle read and draft guards', () => {
  it.each(['network', 'malformed'])('does not render empty business facts or default forms on %s', async kind => {
    const api = fixture()
    if (kind === 'network') api.masterData.catalogLifecycle.mockRejectedValueOnce(new Error('offline'))
    else api.masterData.catalogLifecycle.mockResolvedValueOnce({})
    setup(api)
    expect(await screen.findByText(/目录与价格加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('当前日期未采用 / 暂无生效目录')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无机构目录历史')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存目录版本' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新核实目录与价格' }))
    expect(await screen.findByRole('button', { name: '保存目录版本' })).toBeEnabled()
    expect(screen.getByText('当前日期未采用 / 暂无生效目录')).toBeInTheDocument()
  })
  it('does not load a snapshot until its sharing source is confirmed', async () => {
    const api = fixture()
    api.organization.catalogSource.mockRejectedValue(new Error('source offline'))
    setup(api)
    await screen.findByText(/目录与价格加载失败/)
    expect(api.masterData.catalogLifecycle).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '保存目录版本' })).not.toBeInTheDocument()
  })
  it('does not show default abilities during initial loading', async () => {
    const api = fixture(), pending = deferred<unknown>()
    api.masterData.catalogLifecycle.mockReturnValue(pending.promise)
    setup(api)
    await screen.findByText('正在读取目录与价格…')
    expect(screen.queryByRole('checkbox', { name: '允许开立' })).not.toBeInTheDocument()
    await act(async () => pending.resolve({ ...snapshot, businessDate: api.masterData.catalogLifecycle.mock.calls[0][2] }))
    expect(await screen.findByRole('checkbox', { name: '允许开立' })).not.toBeChecked()
  })
  it('keeps draft across failed refresh and retry, and blocks writes while reads are unknown', async () => {
    const { api, client } = setup()
    await screen.findByRole('button', { name: '保存目录版本' })
    fireEvent.change(within(panel()).getByLabelText('机构显示名称'), { target: { value: '保留的名称' } })
    api.masterData.catalogLifecycle.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['catalog-lifecycle'] }) })
    await screen.findByText(/目录与价格加载失败/)
    expect(screen.queryByText('暂无机构目录历史')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存目录版本', hidden: true })).toBeDisabled()
    fireEvent.submit(panel().querySelector('form')!)
    expect(api.masterData.createLifecycleAdoption).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '重新核实目录与价格' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存目录版本' })).toBeEnabled())
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('保留的名称')
  })
  it('preserves both tab drafts and requires explicit discard after the directory changes', async () => {
    const { api, client } = setup()
    await screen.findByRole('button', { name: '保存目录版本' })
    fireEvent.change(within(panel()).getByLabelText('机构显示名称'), { target: { value: '目录草稿' } })
    await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    fireEvent.change(within(panel()).getByLabelText(/金额/), { target: { value: '12.345678' } })
    await userEvent.click(screen.getByRole('tab', { name: /机构目录与能力/ }))
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('目录草稿')
    await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    expect(within(panel()).getByLabelText(/金额/)).toHaveValue(12.345678)
    api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, businessDate) => ({ ...snapshot, businessDate }))
    await act(async () => { await client.invalidateQueries({ queryKey: ['catalog-lifecycle'] }) })
    expect(await screen.findByText(/目录或价格已更新，草稿暂不可提交/)).toBeInTheDocument()
    expect(within(panel()).getByLabelText(/金额/)).toHaveValue(12.345678)
    expect(screen.getByRole('button', { name: '保存价格版本', hidden: true })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '放弃草稿并载入最新数据' }))
    expect(within(panel()).getByLabelText(/金额/)).toHaveValue(null)
    await userEvent.click(screen.getByRole('tab', { name: /机构目录与能力/ }))
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('本地项目')
  })
  it.each(['departments', 'price-types'])('keeps %s failures visible and disables the affected editor until retry', async kind => {
    const api = fixture()
    if (kind === 'departments') api.organization.departments.mockRejectedValueOnce(new Error('offline'))
    else api.dictionaries.resolve.mockRejectedValueOnce(new Error('offline'))
    setup(api)
    await screen.findByText('当前日期未采用 / 暂无生效目录')
    if (kind === 'departments') {
      expect(screen.getByRole('button', { name: '保存目录版本' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载默认科室' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存目录版本' })).toBeEnabled())
    } else {
      await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
      expect(screen.getByRole('button', { name: '保存价格版本' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: '重新加载价格类型' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存价格版本' })).toBeEnabled())
    }
  })
  it('shows actual currency/precision and keeps tenant prices out of organization mutation controls', async () => {
    const api = fixture(), tenantPrice = { ...price, organizationId: null }
    api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, businessDate) => ({ ...empty, businessDate,
      currentPrices: [tenantPrice], priceHistory: [tenantPrice] }))
    setup(api)
    await screen.findByRole('tab', { name: /机构价格与计价/ })
    await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    expect(screen.getAllByText('USD 0.000123')).toHaveLength(2)
    expect(screen.queryByText('¥ 0.00')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^调价$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '停用' })).not.toBeInTheDocument()
  })
  it('does not silently drop a missing default department', async () => {
    const api = fixture(), value = { ...adoption, defaultDepartmentId: 'missing' }
    api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, businessDate) => ({ ...empty, businessDate, currentAdoption: value, adoptionHistory: [value] }))
    setup(api)
    expect(await screen.findByText(/原默认科室不在当前目录/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存目录版本' })).toBeDisabled()
  })
  it('does not claim completion or clear a draft on an incomplete write receipt', async () => {
    const { api, onChanged } = setup()
    api.masterData.createLifecycleAdoption.mockResolvedValue({})
    await screen.findByRole('button', { name: '保存目录版本' })
    fireEvent.change(within(panel()).getByLabelText('机构显示名称'), { target: { value: '不能丢弃的输入' } })
    await userEvent.click(screen.getByRole('button', { name: '保存目录版本' }))
    expect(await screen.findByText(/操作结果待核实/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('不能丢弃的输入')
  })
  it('resets editor state on API context change', async () => {
    const view = setup()
    await screen.findByRole('button', { name: '保存目录版本' })
    fireEvent.change(within(panel()).getByLabelText('机构显示名称'), { target: { value: '旧上下文' } })
    view.switchApi(fixture())
    await screen.findByRole('button', { name: '保存目录版本' })
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('')
  })
})

function actualSnapshot(adoptions: any[], prices: any[], businessDate: string) {
  const effective = (row: any) => row.sdStatus !== 'SUSPENDED' && row.validFrom <= businessDate && (!row.validTo || row.validTo >= businessDate)
  return { ...empty, businessDate, currentAdoption: adoptions.find(effective) ?? null,
    adoptionHistory: adoptions, currentPrices: prices.filter(effective), priceHistory: prices }
}
async function fillNew(kind: 'adoption' | 'price') {
  await screen.findByRole('button', { name: '保存目录版本' })
  if (kind === 'adoption') fireEvent.change(within(panel()).getByLabelText('机构显示名称'), { target: { value: '本次目录' } })
  else {
    await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    fireEvent.change(within(panel()).getByLabelText(/金额/), { target: { value: '12.345678' } })
    await userEvent.click(within(panel()).getByRole('combobox', { name: /价格类型/ }))
    await userEvent.click(screen.getByRole('option', { name: '销售价' }))
  }
}
const createdAdoption = (input: any) => ({ ...adoption, ...input, id: 'new-adoption', revision: 0,
  defaultDepartmentId: input.defaultDepartmentId ?? null, localCode: input.localCode ?? null, localName: input.localName ?? null,
  sdStatus: input.status, sdStatusText: '启用', validTo: input.validTo ?? null, replacesAdoptionId: null })
const createdPrice = (input: any) => ({ ...price, ...input, id: 'new-price', revision: 0,
  packageId: input.packageId ?? null, priceDocumentCode: input.priceDocumentCode ?? null, priceReason: input.priceReason ?? null,
  sdPriceType: input.priceType, sdStatus: input.status, sdStatusText: '启用', validTo: input.validTo ?? null, replacesPriceId: null })

describe('catalog lifecycle precise write receipts', () => {
  it.each(['adoption', 'price'] as const)('confirms new %s only after the saved record is reread', async kind => {
    const api = fixture()
    const write = kind === 'adoption' ? api.masterData.createLifecycleAdoption : api.masterData.createLifecyclePrice
    write.mockImplementation(async (_id, input) => {
      const row = kind === 'adoption' ? createdAdoption(input) : createdPrice(input)
      api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot(kind === 'adoption' ? [row] : [], kind === 'price' ? [row] : [], date))
      return actualSnapshot(kind === 'adoption' ? [row] : [], kind === 'price' ? [row] : [], input.validFrom)
    })
    const { onChanged } = setup(api)
    await fillNew(kind)
    await userEvent.click(screen.getByRole('button', { name: kind === 'adoption' ? '保存目录版本' : '保存价格版本' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(write).toHaveBeenCalledOnce()
    expect(api.masterData.catalogLifecycle).toHaveBeenCalledTimes(2)
  })
  it.each(['adoption', 'price'] as const)('rejects a complete %s receipt with wrong submitted fields and preserves inputs', async kind => {
    const api = fixture()
    const write = kind === 'adoption' ? api.masterData.createLifecycleAdoption : api.masterData.createLifecyclePrice
    write.mockImplementation(async (_id, input) => actualSnapshot(
      kind === 'adoption' ? [{ ...createdAdoption(input), chargeable: !input.chargeable }] : [],
      kind === 'price' ? [{ ...createdPrice(input), price: input.price + 1 }] : [], input.validFrom))
    const { onChanged } = setup(api)
    await fillNew(kind)
    await userEvent.click(screen.getByRole('button', { name: kind === 'adoption' ? '保存目录版本' : '保存价格版本' }))
    expect(await screen.findByText(/操作结果待核实/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(within(panel()).getByLabelText(kind === 'adoption' ? '机构显示名称' : /金额/)).toHaveValue(kind === 'adoption' ? '本次目录' : 12.345678)
  })
  it.each(['network', 'unchanged', 'different-id'])('does not close the editor when reread is %s', async mode => {
    const api = fixture()
    api.masterData.createLifecycleAdoption.mockImplementation(async (_id, input) => {
      const row = createdAdoption(input)
      if (mode === 'network') api.masterData.catalogLifecycle.mockRejectedValue(new Error('read offline'))
      if (mode === 'different-id') api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot([{ ...row, id: 'different' }], [], date))
      return actualSnapshot([row], [], input.validFrom)
    })
    const { onChanged } = setup(api)
    await fillNew('adoption')
    await userEvent.click(screen.getByRole('button', { name: '保存目录版本' }))
    expect(await screen.findByText(/操作结果待核实/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('本次目录')
  })
  it.each(['adoption', 'price'] as const)('verifies %s replacement and both old/new IDs', async kind => {
    const api = fixture(), original = kind === 'adoption' ? adoption : price
    api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot(kind === 'adoption' ? [original] : [], kind === 'price' ? [original] : [], date))
    const write = kind === 'adoption' ? api.masterData.replaceLifecycleAdoption : api.masterData.replaceLifecyclePrice
    write.mockImplementation(async (_id, _version, input) => {
      const date = new Date(`${input.validFrom}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1)
      const old = { ...original, revision: original.revision + 1, sdStatus: 'REPLACED', validTo: date.toISOString().slice(0, 10) }
      const added = { ...(kind === 'adoption' ? createdAdoption(input) : createdPrice(input)), [kind === 'adoption' ? 'replacesAdoptionId' : 'replacesPriceId']: original.id }
      api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, day) => actualSnapshot(kind === 'adoption' ? [added, old] : [], kind === 'price' ? [added, old] : [], day))
      return actualSnapshot(kind === 'adoption' ? [added, old] : [], kind === 'price' ? [added, old] : [], input.validFrom)
    })
    const { onChanged } = setup(api)
    await screen.findByRole('button', { name: '保存目录版本' })
    if (kind === 'price') await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    for (const editor of document.querySelectorAll('.master-data-lifecycle-editor')) (editor as HTMLElement).scrollIntoView = vi.fn()
    await userEvent.click(screen.getByRole('button', { name: kind === 'adoption' ? '替代' : '调价' }))
    await userEvent.click(screen.getByRole('button', { name: kind === 'adoption' ? '保存替代版本' : '保存调价版本' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(write).toHaveBeenCalledWith(original.id, original.revision, expect.any(Object))
  })
  it.each(['adoption', 'price'] as const)('accepts %s status changes only with an advanced persisted revision', async kind => {
    const api = fixture(), original = kind === 'adoption' ? adoption : price
    api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot(kind === 'adoption' ? [original] : [], kind === 'price' ? [original] : [], date))
    const write = kind === 'adoption' ? api.masterData.changeLifecycleAdoptionStatus : api.masterData.changeLifecyclePriceStatus
    write.mockImplementation(async (_id, _revision, status) => {
      const changed = { ...original, sdStatus: status, revision: original.revision + 1 }
      const day = api.masterData.catalogLifecycle.mock.calls[0][2]
      api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot(kind === 'adoption' ? [changed] : [], kind === 'price' ? [changed] : [], date))
      return actualSnapshot(kind === 'adoption' ? [changed] : [], kind === 'price' ? [changed] : [], day)
    })
    const { onChanged } = setup(api)
    await screen.findByRole('button', { name: '保存目录版本' })
    if (kind === 'price') await userEvent.click(screen.getByRole('tab', { name: /机构价格与计价/ }))
    await userEvent.click(screen.getByRole('button', { name: '暂停' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(write).toHaveBeenCalledWith(original.id, original.revision, 'SUSPENDED', undefined)
  })
  it('does not re-create a record when a lost response is found by reloading', async () => {
    const api = fixture()
    api.masterData.createLifecycleAdoption.mockImplementation(async (_id, input) => {
      const row = createdAdoption(input)
      api.masterData.catalogLifecycle.mockImplementation(async (_id, _org, date) => actualSnapshot([row], [], date))
      throw new Error('lost response')
    })
    const { onChanged } = setup(api)
    await fillNew('adoption')
    await userEvent.click(screen.getByRole('button', { name: '保存目录版本' }))
    await screen.findByText(/操作结果待核实/)
    await userEvent.click(screen.getByRole('button', { name: '重新核实目录与价格' }))
    await screen.findByText(/目录或价格已更新/)
    await userEvent.click(screen.getByRole('button', { name: '放弃草稿并载入最新数据' }))
    await userEvent.click(screen.getByRole('button', { name: '保存目录版本' }))
    expect(await screen.findByText(/历史中已有与本次输入一致的记录/)).toBeInTheDocument()
    expect(api.masterData.createLifecycleAdoption).toHaveBeenCalledOnce()
    expect(onChanged).not.toHaveBeenCalled()
  })
  it('blocks duplicate writes and ignores a late receipt after switching API', async () => {
    const api = fixture(), pending = deferred<unknown>()
    api.masterData.createLifecycleAdoption.mockReturnValue(pending.promise)
    const view = setup(api)
    await fillNew('adoption')
    await userEvent.dblClick(screen.getByRole('button', { name: '保存目录版本' }))
    fireEvent.submit(panel().querySelector('form')!)
    expect(api.masterData.createLifecycleAdoption).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(view.onClose).not.toHaveBeenCalled()
    view.switchApi(fixture())
    const input = api.masterData.createLifecycleAdoption.mock.calls[0][1]
    await act(async () => pending.resolve(actualSnapshot([createdAdoption(input)], [], input.validFrom)))
    expect(view.onChanged).not.toHaveBeenCalled()
    expect(screen.queryByText(/操作结果待核实/)).not.toBeInTheDocument()
  })
  it('requires rechecking if the sharing source changes while the write is pending', async () => {
    const api = fixture(), pending = deferred<unknown>()
    api.masterData.createLifecycleAdoption.mockReturnValue(pending.promise)
    const { client, onChanged } = setup(api)
    await fillNew('adoption')
    await userEvent.click(screen.getByRole('button', { name: '保存目录版本' }))
    api.organization.catalogSource.mockResolvedValue({ organizationId: 'org', organizationName: '机构', organizationRevision: 2,
      sourceOrganizationId: 'new-source', sourceOrganizationName: '新来源机构' })
    await act(async () => { await client.invalidateQueries({ queryKey: ['catalog-lifecycle-source'] }) })
    const input = api.masterData.createLifecycleAdoption.mock.calls[0][1]
    await act(async () => pending.resolve(actualSnapshot([createdAdoption(input)], [], input.validFrom)))
    expect(await screen.findByText(/目录来源已变化/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(within(panel()).getByLabelText('机构显示名称')).toHaveValue('本次目录')
  })
})
