import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/api'
import { ClinicalRecordReferences } from './ClinicalRecordReferences'

it('shows canonical clinical references without text inputs and excludes cancelled orders', async () => {
  const api = { encounters: {
    medicationRequests: vi.fn().mockResolvedValue([
      { id: 'm1', status: 'ACTIVE', medicationName: '已开药品', doseValue: 0.5, doseUnit: 'g', routeCode: 'ORAL', frequencyCode: 'TID' },
      { id: 'm2', status: 'CANCELLED', medicationName: '已取消药品' },
    ]),
    serviceRequests: vi.fn().mockResolvedValue([{ id: 's1', status: 'ACTIVE', itemName: '已开检查' }]),
  } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient()}>
    <ClinicalRecordReferences api={api} encounterId="enc-1" diagnoses={[{ code: 'J06.9', display: '结构化诊断', type: 'PRIMARY' }]}
      medicationDrafts={[]} serviceDrafts={[{ id: 'draft-1', catalogItemId: 'c1', itemCode: 's2', itemName: '待保存检查', quantity: 1 }]} />
  </QueryClientProvider>)
  expect(await screen.findByText(/已开药品/)).toBeInTheDocument()
  expect(screen.getByText(/结构化诊断/)).toBeInTheDocument()
  expect(screen.getByText(/待保存检查/)).toHaveTextContent('待保存草稿')
  expect(screen.queryByText(/已取消药品/)).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
