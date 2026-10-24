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
    f.orderableMedicationsBatch.mockRejectedValueOnce(new Error('目录暂不可用'))
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
      f.orderableMedicationsBatch.mockImplementation(() => new Promise(done => { resolve = done }))
      await f.select(); f.click()
      await waitFor(() => expect(f.orderableMedicationsBatch).toHaveBeenCalledTimes(1))
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
      await act(async () => { resolve({ TEST: [f.medication] }) })
      expect(f.onStage).not.toHaveBeenCalled()
    })
  it.each(['unfinished-visit', 'inactive-prescription', 'read-only'])(
    'keeps medication details readable without renewal controls for %s', async reason => {
      const f = setup()
      if (reason === 'unfinished-visit') f.rerender({ encounter: { ...f.source, status: 'IN_PROGRESS' } })
      if (reason === 'inactive-prescription') f.rx.status = 'CANCELLED'
      if (reason === 'read-only') f.rerender({ disabled: true })
      expect(await screen.findByText('历史测试药')).toBeInTheDocument()
      expect(screen.getByText(/每次 5mg/)).toBeInTheDocument()
      expect(screen.getByText(reason === 'unfinished-visit'
        ? '历史就诊未完成，请在本次医嘱中重新评估开立。'
        : '仅供用药参考，需要开药时请在本次医嘱中重新评估。')).toBeInTheDocument()
      if (reason === 'read-only') expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      else expect(screen.getByRole('checkbox', { name: /历史测试药/ })).toBeDisabled()
      expect(screen.queryByRole('button', { name: /加入续方草稿/ })).not.toBeInTheDocument()
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
  it('selects only eligible orders as a group and requires a fresh review after changing selection', async () => {
    const f = setup()
    const item = f.rx.medicationRequests[0]
    f.rx.medicationRequests.push({ ...item, id: 'antimicrobial', medicationName: '需重新评估药', antimicrobial: true })
    const group = await screen.findByRole('checkbox', { name: '选择全部可续方医嘱' })
    expect(group).not.toBeChecked()
    fireEvent.click(group)
    expect(screen.getByRole('checkbox', { name: /历史测试药/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /需重新评估药/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /需重新评估药/ })).not.toBeChecked()
    expect(screen.getByText('已选 1/1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /已核对当前病情/ }))
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeEnabled()
    fireEvent.click(group)
    expect(screen.getByRole('checkbox', { name: /已核对当前病情/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    expect(f.onStage).not.toHaveBeenCalled()
  })
})
