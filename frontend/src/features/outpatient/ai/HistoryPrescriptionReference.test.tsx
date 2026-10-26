import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { HistoryPrescriptionReference } from './HistoryPrescriptionReference'
import type { HistoryMedicationStager } from './HistoryPrescriptionReference'
import { historicalImportFixture } from './historicalPrescriptionImport.testFixtures'

type HarnessProps = Omit<Parameters<typeof HistoryPrescriptionReference>[0], 'stagerRef' | 'onSelectedCountChange'>
  & { onStage: (drafts: unknown[]) => void }

/** 模拟上层“带入本次”按钮：调用核对接口，成功后才交出草稿。 */
function Harness({ onStage, ...props }: HarnessProps) {
  const stagerRef = useRef<HistoryMedicationStager | null>(null)
  const [count, setCount] = useState(0)
  return <>
    <HistoryPrescriptionReference {...props} stagerRef={stagerRef} onSelectedCountChange={setCount} />
    <button type="button" disabled={count === 0} onClick={async () => { const drafts = await stagerRef.current?.stage(); if (drafts) onStage(drafts) }}>
      加入续方草稿</button>
  </>
}

function setup() {
  const f = historicalImportFixture(), onStage = vi.fn()
  const props = { encounter: f.source, targetEncounter: f.target, api: f.api, disabled: false,
    allergies: [], allergyReady: true, onStage }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>)
  const rerender = (patch: Partial<HarnessProps>) =>
    view.rerender(<QueryClientProvider client={client}><Harness {...props} {...patch} /></QueryClientProvider>)
  const select = async () => {
    expect(await screen.findByRole('checkbox', { name: /历史测试药/ })).toBeChecked()
  }
  const click = () => fireEvent.click(screen.getByRole('button', { name: /加入续方草稿/ }))
  return { ...f, onStage, props, view, rerender, select, click }
}

describe('historical prescription reference', () => {
  it('selects renewable medications by default without a manual review gate, then stages exactly once', async () => {
    const f = setup()
    const box = await screen.findByRole('checkbox', { name: /历史测试药/ })
    expect(box).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /已核对当前病情/ })).not.toBeInTheDocument()
    fireEvent.click(box)
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    fireEvent.click(box)
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeEnabled()
    f.click(); f.click()
    await waitFor(() => expect(f.onStage).toHaveBeenCalledTimes(1))
    expect(f.onStage.mock.calls[0][0][0]).toMatchObject({ unitPrice: 2.5, stockSiteId: 'pharmacy',
      request: { frequencyCode: 'QD', allergyReviewConfirmed: true, substitutionAllowed: true } })
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /历史测试药/ })).not.toBeChecked()
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
      expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
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
  it('shows duration and package units in Chinese', async () => {
    setup()
    expect(await screen.findByText(/每次 5mg.*5天.*总量 2盒/)).toBeInTheDocument()
  })
  it('selects only eligible orders by default and toggles them as a group', async () => {
    const f = setup()
    const item = f.rx.medicationRequests[0]
    f.rx.medicationRequests.push({ ...item, id: 'antimicrobial', medicationName: '需重新评估药', antimicrobial: true })
    const group = await screen.findByRole('checkbox', { name: '选择全部可续方医嘱' })
    expect(group).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /历史测试药/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /需重新评估药/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /需重新评估药/ })).not.toBeChecked()
    expect(screen.getByText('已选 1/1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeEnabled()
    fireEvent.click(group)
    expect(screen.getByRole('checkbox', { name: /历史测试药/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /加入续方草稿/ })).toBeDisabled()
    expect(f.onStage).not.toHaveBeenCalled()
  })
})
