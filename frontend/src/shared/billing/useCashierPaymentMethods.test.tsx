import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../clinical/workContext'
import type { RhnApi } from '../rhnApi'
import { useCashierPaymentMethods } from './useCashierPaymentMethods'

const context = { organization: { id: 'org1' }, department: { id: 'dept1' } } as ClinicalContext
function setup(applicable: ReturnType<typeof vi.fn>) {
  const api = { dictionaries: { applicable } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useCashierPaymentMethods(api, context), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
}

describe('cashier payment configuration', () => {
  it.each([
    undefined, {}, { PAYMENT_PRECISION: '0.1' }, { ROUNDING_MODE: 'FLOOR' },
    { PAYMENT_PRECISION: '0.1bad', ROUNDING_MODE: 'HALF_UP' },
    { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'UNRECOGNIZED' },
  ])('rejects incomplete or invalid rounding attributes %j', async (attributes) => {
    const { result } = setup(vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金', attributes }]))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.options).toEqual([])
    expect(result.current.error?.message).toMatch(/未配置或无效/)
  })

  it.each([null, {}, [{ code: 'CASH' }], [{ code: 'CASH', name: '现金', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }, { code: 'CASH', name: '重复现金', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }]].map((data) => ({ data })))(
    'rejects malformed dictionary response %j', async ({ data }) => {
      const { result } = setup(vi.fn().mockResolvedValue(data))
      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.options).toEqual([])
    },
  )

  it('distinguishes a valid empty configuration from failure', async () => {
    const { result } = setup(vi.fn().mockResolvedValue([]))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.options).toEqual([])
  })

  it('removes stale options on refetch failure and restores only verified data on retry', async () => {
    const applicable = vi.fn().mockResolvedValue([{ code: 'CASH', name: '现金', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }])
    const { result } = setup(applicable)
    await waitFor(() => expect(result.current.options).toHaveLength(1))
    applicable.mockRejectedValue(new Error('配置不可用'))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.options).toEqual([])
    applicable.mockResolvedValue([{ code: 'BANK_CARD', name: '银行卡', attributes: { PAYMENT_PRECISION: '0.01', ROUNDING_MODE: 'HALF_UP' } }])
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.options[0].code).toBe('BANK_CARD')
  })
})
