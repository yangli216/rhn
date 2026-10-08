import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HistoryPrescriptionReference } from './HistoryPrescriptionReference'
import { historicalImportFixture } from './historicalPrescriptionImport.testFixtures'

function setup() {
  const f = historicalImportFixture(), onStage = vi.fn()
  const props = { encounter: f.source, targetEncounter: f.target, api: f.api, disabled: false,
    allergies: [], allergyReady: true, onStage }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><HistoryPrescriptionReference {...props} /></QueryClientProvider>)
  const rerender = (patch: Partial<Parameters<typeof HistoryPrescriptionReference>[0]>) =>
    view.rerender(<QueryClientProvider client={client}><HistoryPrescriptionReference {...props} {...patch} /></QueryClientProvider>)
  const select = async () => {
    fireEvent.click(await screen.findByRole('checkbox', { name: /历史测试药/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /已核对当前病情/ }))
  }
  const click = () => fireEvent.click(screen.getByRole('button', { name: /加入续方草稿/ }))
  return { ...f, onStage, props, view, rerender, select, click }
}

describe('historical prescription reference', () => {
  it('requires selection and review, then verifies current facts before staging exactly once', async () => {
    const f = setup()
    fireEvent.click(await screen.findByRole('checkbox', { name: /历史测试药/ }))
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /已核对当前病情/ }))
    f.click(); f.click()
    await waitFor(() => expect(f.onStage).toHaveBeenCalledTimes(1))
    expect(f.onStage.mock.calls[0][0][0]).toMatchObject({ unitPrice: 2.5, stockSiteId: 'pharmacy',
      request: { frequencyCode: 'QD', allergyReviewConfirmed: true, substitutionAllowed: true } })
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
  })
  it('retains the selection and a persistent error after failure, then allows an explicit retry', async () => {
    const f = setup()
    f.orderableMedications.mockRejectedValueOnce(new Error('目录暂不可用'))
    await f.select(); f.click()
    expect(await screen.findByRole('alert')).toHaveTextContent('目录暂不可用')
    expect(f.onStage).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /历史测试药/ })).toBeChecked()
    await waitFor(() => expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeEnabled())
    f.click()
    await waitFor(() => expect(f.onStage).toHaveBeenCalledTimes(1))
  })
  it.each(['patient', 'organization', 'department', 'disabled', 'allergy', 'signed', 'api', 'unmount'])(
    'discards a late result after %s changes', async change => {
      const f = setup()
      let resolve!: (value: unknown) => void
      f.orderableMedications.mockImplementation(() => new Promise(done => { resolve = done }))
      await f.select(); f.click()
      await waitFor(() => expect(f.orderableMedications).toHaveBeenCalledTimes(1))
      if (change === 'unmount') f.view.unmount()
      else f.rerender({
        ...(change === 'disabled' ? { disabled: true } : {}),
        ...(change === 'allergy' ? { allergyReady: false } : {}),
        ...(change === 'api' ? { api: historicalImportFixture().api } : {}),
        targetEncounter: { ...f.target,
          ...(change === 'patient' ? { id: 'new', residentId: 'new-patient' } : {}),
          ...(change === 'organization' ? { organizationId: 'new-org' } : {}),
          ...(change === 'department' ? { departmentId: 'new-dept' } : {}),
          ...(change === 'signed' ? { status: 'COMPLETED' } : {}),
        },
      })
      await act(async () => { resolve([f.medication]) })
      expect(f.onStage).not.toHaveBeenCalled()
    })
  it('shows a missing duration unit explicitly instead of inventing days', async () => {
    const f = setup()
    f.rx.medicationRequests[0].durationUnit = undefined
    expect(await screen.findByText(/5疗程单位待核对/)).toBeInTheDocument()
    await f.select(); f.click()
    expect(await screen.findByRole('alert')).toHaveTextContent('单位不完整')
    expect(f.onStage).not.toHaveBeenCalled()
  })
})
