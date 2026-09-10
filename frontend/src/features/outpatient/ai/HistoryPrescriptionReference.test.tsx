import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Prescription } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { historicalMedicationDrafts, HistoryPrescriptionReference } from './HistoryPrescriptionReference'
const rx = { id: 'rx', status: 'ACTIVE', categoryCode: 'WESTERN', prescriptionNo: 'RX-1', medicationRequests: [
  { id: 'med', status: 'ACTIVE', medicationId: 'm', medicationName: '历史测试药', medicationCode: 'TEST', itemName: '测试药产品',
    doseValue: 5, doseUnit: 'mg', routeCode: 'PO', frequencyCode: 'QD', quantity: 30, quantityUnit: '片' },
] } as Prescription

describe('historical prescription reference', () => {
  it('requires explicit selection and excludes cancelled and special-treatment lines without reusing prescription IDs', () => {
    expect(historicalMedicationDrafts([rx], [])).toEqual([])
    const drafts = historicalMedicationDrafts([rx, { ...rx, id: 'copy' }], ['med'])
    expect(drafts).toHaveLength(1)
    expect(drafts[0].request).toMatchObject({ medicationId: 'm', doseValue: 5, quantity: 30 })
    expect(drafts[0].request).not.toHaveProperty('prescriptionId')
    expect(drafts[0].request).not.toHaveProperty('parentRequestId')
    expect(historicalMedicationDrafts([{ ...rx, status: 'CANCELLED' }], ['med'])).toEqual([])
    expect(historicalMedicationDrafts([{ ...rx, medicationRequests: [{ ...rx.medicationRequests[0], antimicrobial: true }] }], ['med'])).toEqual([])
  })
  it('shows real historical dosing and only stages after current safety review', async () => {
    const onStage = vi.fn()
    const api = { encounters: { prescriptions: vi.fn().mockResolvedValue([rx]) } } as unknown as RhnApi
    render(<QueryClientProvider client={new QueryClient()}><HistoryPrescriptionReference
      encounter={{ id: 'history', status: 'COMPLETED', registeredAt: new Date().toISOString() } as Encounter}
      api={api} disabled={false} allergies={[]} allergyReady onStage={onStage} /></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('checkbox', { name: /历史测试药/ }))
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /已核对当前病情/ }))
    fireEvent.click(screen.getByRole('button', { name: /加入续方草稿/ }))
    await waitFor(() => expect(onStage).toHaveBeenCalledTimes(1))
    expect(onStage.mock.calls[0][0][0].request).toMatchObject({ frequencyCode: 'QD', allergyReviewConfirmed: true })
  })
})
