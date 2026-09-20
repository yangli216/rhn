import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { ClinicalMedicationStandardsPanel } from './ClinicalMedicationStandardsPanel'

it('shows structural frequency identities while keeping PRN without a daily rate', async () => {
  const clinicalMedicationStandards = vi.fn().mockResolvedValue({
    version: 'rhn-medication-standards-v1',
    doseUnits: [{ id: 'UCUM:mg', display: '毫克', code: 'mg', dimension: 'MASS', conversionFactor: 0.001, canonicalUnit: 'g' }],
    routes: [{ id: 'oral', code: 'ORAL', name: '口服', systemCode: 'RHN.ROUTE', systemVersion: '1' }],
    frequencies: [
      { id: 'bid', code: 'BID', name: '每日两次', standard: { conceptId: 'TIMES_PER_DAY:2/1:DAY', interpretation: { kind: 'TIMES_PER_DAY', dailyRateComputable: true, doses: 2, perDays: 1 } } },
      { id: 'prn', code: 'PRN', name: '必要时', standard: { conceptId: 'AS_NEEDED', interpretation: { kind: 'AS_NEEDED', dailyRateComputable: false } } },
    ],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><ClinicalMedicationStandardsPanel api={{ masterData: { clinicalMedicationStandards } } as unknown as RhnApi} /></QueryClientProvider>)
  await screen.findByText('TIMES_PER_DAY:2/1:DAY')
  expect(screen.getByText('2 次 / 1 天')).toBeInTheDocument()
  const prn = screen.getByText('必要时').closest('tr')!
  expect(within(prn).getByText('无固定日频率')).toBeInTheDocument()
  expect(screen.getByText('1 mg = 0.001 g')).toBeInTheDocument()
  expect(screen.getByText(/默认剂量不代表安全上限/)).toBeInTheDocument()
})
