import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationAliasSection } from './master-data/ItemAliasSection'

function setup(initial: string[] = []) {
  const medicationAliases = vi.fn().mockResolvedValue(initial.map((aliasName, index) => ({
    id: `a${index}`, catalogItemId: 'med-1', aliasType: 'SYNONYM', aliasName, primaryAlias: index === 0, status: 'ACTIVE' })))
  const replaceMedicationAliases = vi.fn().mockResolvedValue([])
  const api = { masterData: { medicationAliases, replaceMedicationAliases } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MedicationAliasSection api={api} medicationId="med-1" />
  </QueryClientProvider>)
  return { medicationAliases, replaceMedicationAliases }
}

describe('MedicationAliasSection', () => {
  it('loads aliases from the medication alias endpoint and saves one row per alias with the first as primary', async () => {
    const { replaceMedicationAliases } = setup(['格华止'])
    expect(await screen.findByText('格华止')).toBeInTheDocument()
    const input = screen.getByLabelText('新增药品别名')
    fireEvent.change(input, { target: { value: '盐酸二甲双胍，' } })
    fireEvent.change(input, { target: { value: '格华止' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: '保存别名' }))
    await waitFor(() => expect(replaceMedicationAliases).toHaveBeenCalledWith('med-1', [
      { aliasType: 'SYNONYM', aliasName: '格华止', primaryAlias: true, status: 'ACTIVE' },
      { aliasType: 'SYNONYM', aliasName: '盐酸二甲双胍', primaryAlias: false, status: 'ACTIVE' },
    ]))
    expect(await screen.findByText('药品别名已更新')).toBeInTheDocument()
  })

  it('blocks saving while aliases fail to load', async () => {
    const medicationAliases = vi.fn().mockRejectedValue(new Error('别名读取失败'))
    const api = { masterData: { medicationAliases, replaceMedicationAliases: vi.fn() } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MedicationAliasSection api={api} medicationId="med-1" />
    </QueryClientProvider>)
    expect(await screen.findByText('药品别名加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存别名' })).toBeDisabled()
  })
})
