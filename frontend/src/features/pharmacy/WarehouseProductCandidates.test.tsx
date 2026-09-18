import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { ItemDialog } from './WarehouseManagement'

it('searches product pages on the server and retains selected packages across pages', async () => {
  const searchMedicationProducts = vi.fn(async (_q: string, _t: string, _s: string, _o: string, page: number) => ({
    content: [{ product: {id: `p${page}`, name: `药品${page}`, code: `CODE${page}`, manufacturerName: '厂家',
      packages: [{id: `pkg${page}`, sdStatus: 'ACTIVE', validFrom: '2020-01-01', unitName: '盒', unitCode: 'BOX'}]} }],
    totalElements: 21, totalPages: 2, page, size: 20,
  }))
  const onSubmit = vi.fn()
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <ItemDialog api={{masterData:{searchMedicationProducts}} as unknown as RhnApi} organizationId="org"
      stockSiteType="PHARMACY" existingItems={[]} busy={false} error={undefined} onClose={vi.fn()} onSubmit={onSubmit} />
  </QueryClientProvider>)
  fireEvent.click(await screen.findByRole('checkbox', {name:'选择药品0'}))
  fireEvent.click(screen.getByRole('button', {name:'下一页'}))
  fireEvent.click(await screen.findByRole('checkbox', {name:'选择药品1'}))
  fireEvent.click(screen.getByRole('button', {name:'批量调入（2）'}))
  expect(onSubmit).toHaveBeenCalledWith([
    expect.objectContaining({catalogItemId:'p0',packageId:'pkg0'}),
    expect.objectContaining({catalogItemId:'p1',packageId:'pkg1'}),
  ])
  fireEvent.change(screen.getByPlaceholderText('搜索名称、编码、生产厂家或批准文号'),{target:{value:'批准文号'}})
  await waitFor(() => expect(searchMedicationProducts).toHaveBeenLastCalledWith('批准文号','','ACTIVE','org',0,20,true,true))
})
