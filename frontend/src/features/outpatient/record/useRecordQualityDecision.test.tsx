import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { RecordQualityResult } from '../../../shared/api/clinicalAiApi'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { RecordForm } from './clinicalRecordDraft'
import { useClinicalDraftSession } from './useClinicalDraftSession'
import { recordQualityFields, useRecordQualityDecision } from './useRecordQualityDecision'
import { RecordQualityReview } from './RecordQualityReview'
import { RecordQualityControl } from './RecordQualityControl'

const assessment: RecordQualityResult = { runId: '50', mode: 'ASSIST', outcome: 'ASSIST', inputHash: 'hash',
  baselineDocumentVersion: 1, assessedAt: '2026-10-23T00:00:00Z', findings: [{ code: 'ONSET', field: 'presentIllness', kind: 'COMPLETENESS',
    title: '起病时间待补充', prompt: '请核实后记录' }], feedback: [], message: '核查完成，请医生核实' }
const document = { id: '90', currentVersion: 2 } as ClinicalDocument
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function setup() {
  const client = { latestRecordQuality: vi.fn().mockResolvedValue(null), assessRecordQuality: vi.fn().mockResolvedValue(assessment),
    recordQualityFeedback: vi.fn().mockImplementation((_encounter, runId, request) => Promise.resolve([{ id: crypto.randomUUID(), runId,
      findingCode: 'ONSET', actionText: request.action === 'ADOPTED' ? '已采纳，待保存核实' : '反馈已记录', action: request.action === 'SAVED' ? 'MODIFIED' : request.action, documentVersion: request.documentVersion }])) }
  const api = { clinicalAi: client } as unknown as RhnApi
  const initialProps = { identity: 'A', encounterId: 'A', enabled: true }
  const hook = renderHook(props => {
    const form = useForm<RecordForm>({ defaultValues: { chiefComplaint: '咳嗽', presentIllness: '咳嗽' } })
    form.watch()
    const capture = useClinicalDraftSession(api, props.identity, props.enabled, form, null)
    return { form, decision: useRecordQualityDecision(api, props.encounterId, props.identity, props.enabled, form.getValues, capture) }
  }, { initialProps })
  return { ...hook, client, initialProps }
}
describe('record quality physician feedback', () => {
  it('keeps details collapsed, toggles the result without rechecking, and supports Escape and outside dismissal', async () => {
    const { result, client } = setup(), user = userEvent.setup()
    await act(async () => { await result.current.decision.assess() })
    render(<RecordQualityControl decision={result.current.decision} disabled={false} onLocate={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '核查当前病历' })
    expect(trigger).toHaveTextContent('1')
    expect(screen.queryByText('起病时间待补充')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '病历核查结果' })).toBeInTheDocument()
    await user.click(trigger)
    expect(screen.queryByRole('dialog', { name: '病历核查结果' })).not.toBeInTheDocument()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: '病历核查结果' })).not.toBeInTheDocument()
    await user.click(trigger)
    await user.click(globalThis.document.body)
    expect(screen.queryByRole('dialog', { name: '病历核查结果' })).not.toBeInTheDocument()
    expect(client.assessRecordQuality).toHaveBeenCalledTimes(1)
  })
  it('counts adopted advice until a verified save and excludes ignored and saved findings', async () => {
    const { result } = setup()
    await act(async () => { await result.current.decision.assess() })
    const view = render(<RecordQualityControl decision={result.current.decision} disabled={false} onLocate={vi.fn()} />)
    const refresh = () => view.rerender(<RecordQualityControl decision={result.current.decision} disabled={false} onLocate={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '核查当前病历' })
    await act(async () => { await result.current.decision.act('ONSET', 'DISMISSED') }); refresh()
    expect(trigger).not.toHaveTextContent('1')
    await act(async () => { await result.current.decision.act('ONSET', 'ADOPTED') }); refresh()
    expect(trigger).toHaveTextContent('1')
    expect(trigger).toBeEnabled()
    await act(async () => { await result.current.decision.confirmSaved(document) }); refresh()
    expect(trigger).not.toHaveTextContent('1')
  })
  it.each(['', '   '])('does not assess an unwritten record containing %j', async value => {
    const { result, client } = setup()
    act(() => recordQualityFields.forEach(field => result.current.form.setValue(field, value)))
    expect(result.current.decision.hasContent).toBe(false)
    await act(async () => { await result.current.decision.assess() })
    expect(client.assessRecordQuality).not.toHaveBeenCalled()
    expect(result.current.decision.assessment).toBeNull()
  })
  it('records adoption separately from an actual save and preserves the edited record', async () => {
    const { result, client } = setup()
    await act(async () => { await result.current.decision.assess() })
    expect(result.current.form.getValues('presentIllness')).toBe('咳嗽')
    await act(async () => { await result.current.decision.act('ONSET', 'ADOPTED') })
    expect(result.current.decision.pendingAdoption).toBe(true)
    act(() => result.current.form.setValue('presentIllness', '医生核实：咳嗽三天'))
    await act(async () => { await result.current.decision.confirmSaved(document) })
    expect(client.recordQualityFeedback).toHaveBeenLastCalledWith('A', '50', expect.objectContaining({ action: 'SAVED', documentId: '90', documentVersion: 2 }))
    expect(result.current.decision.latest.get('ONSET')?.action).toBe('MODIFIED')
    expect(result.current.form.getValues('presentIllness')).toBe('医生核实：咳嗽三天')
  })
  it('retries the same command after a lost response and does not duplicate local events', async () => {
    const { result, client } = setup()
    await act(async () => { await result.current.decision.assess() })
    client.recordQualityFeedback.mockRejectedValueOnce(new Error('网络中断'))
    await act(async () => { await result.current.decision.act('ONSET', 'ADOPTED') })
    const request = client.recordQualityFeedback.mock.calls[0][2]
    expect(result.current.decision.retryPending).toBe(true)
    await act(async () => { await result.current.decision.retry() })
    expect(client.recordQualityFeedback).toHaveBeenLastCalledWith('A', '50', request)
    expect(result.current.decision.error).toBe('')
    expect(result.current.decision.assessment?.feedback).toHaveLength(1)
  })
  it('does not replace current edits when assessment returns late', async () => {
    const { result, client } = setup(), response = deferred<RecordQualityResult>()
    client.assessRecordQuality.mockReturnValueOnce(response.promise)
    let work!: Promise<void>
    act(() => { work = result.current.decision.assess() })
    act(() => result.current.form.setValue('chiefComplaint', '医生修改'))
    await act(async () => { response.resolve(assessment); await work })
    expect(result.current.decision.assessment).toBeNull()
    expect(result.current.decision.error).toContain('保存期间内容已变化')
    expect(result.current.form.getValues('chiefComplaint')).toBe('医生修改')
  })
  it.each(['patient', 'permission', 'away-and-back'] as const)('drops late responses after %s changes', async change => {
    const { result, client, rerender, initialProps } = setup(), response = deferred<RecordQualityResult>()
    client.assessRecordQuality.mockReturnValueOnce(response.promise)
    let work!: Promise<void>
    act(() => { work = result.current.decision.assess() })
    rerender({ identity: 'B', encounterId: 'B', enabled: change !== 'permission' })
    if (change === 'away-and-back') rerender(initialProps)
    await act(async () => { response.resolve(assessment); await work })
    expect(result.current.decision.assessment).toBeNull()
    expect(client.recordQualityFeedback).not.toHaveBeenCalled()
  })
  it('restores pending adoption after reload and can verify the persisted version', async () => {
    const { result, client, rerender } = setup()
    client.latestRecordQuality.mockResolvedValueOnce({ ...assessment, feedback: [{ id: 'f1', findingCode: 'ONSET', action: 'ADOPTED' }] })
    rerender({ identity: 'restored', encounterId: 'A', enabled: true })
    await waitFor(() => expect(result.current.decision.pendingAdoption).toBe(true))
    expect(result.current.decision.stale).toBe(true)
    await act(async () => { await result.current.decision.confirmSaved(document) })
    expect(result.current.decision.pendingAdoption).toBe(false)
  })
  it('does not treat ignored advice as a modified or saved record', async () => {
    const { result, client } = setup()
    await act(async () => { await result.current.decision.assess() })
    await act(async () => { await result.current.decision.act('ONSET', 'DISMISSED') })
    await act(async () => { await result.current.decision.confirmSaved(document) })
    expect(client.recordQualityFeedback).toHaveBeenCalledTimes(1)
    expect(result.current.decision.latest.get('ONSET')?.action).toBe('DISMISSED')
  })
  it('restores persisted adoption if an assessment races with the initial history request', async () => {
    const { result, client } = setup()
    client.assessRecordQuality.mockRejectedValueOnce({ code: 'RECORD_QUALITY_FEEDBACK_PENDING', message: '上次采纳待核实' })
    client.latestRecordQuality.mockResolvedValueOnce({ ...assessment, feedback: [{ id: 'f1', findingCode: 'ONSET', action: 'ADOPTED' }] })
    await act(async () => { await result.current.decision.assess() })
    expect(result.current.decision.pendingAdoption).toBe(true)
    expect(result.current.decision.stale).toBe(true)
    expect(result.current.form.getValues('presentIllness')).toBe('咳嗽')
  })
  it('can verify a newer receipt after a stale save version is rejected', async () => {
    const { result, client } = setup()
    await act(async () => { await result.current.decision.assess() })
    await act(async () => { await result.current.decision.act('ONSET', 'ADOPTED') })
    client.recordQualityFeedback.mockRejectedValueOnce({ code: 'RECORD_QUALITY_SAVE_VERSION', message: '版本已变化' })
    await act(async () => { await result.current.decision.confirmSaved(document) })
    expect(result.current.decision.retryPending).toBe(false)
    expect(result.current.decision.pendingAdoption).toBe(true)
    await act(async () => { await result.current.decision.confirmSaved({ ...document, currentVersion: 3 }) })
    expect(client.recordQualityFeedback).toHaveBeenLastCalledWith('A', '50', expect.objectContaining({ action: 'SAVED', documentVersion: 3 }))
    expect(result.current.decision.pendingAdoption).toBe(false)
  })
  it('renders bounded advice with adoption, dismissal, and saved feedback rather than inserting text', async () => {
    const { result } = setup(), locate = vi.fn()
    await act(async () => { await result.current.decision.assess() })
    const view = render(<RecordQualityReview decision={result.current.decision} disabled={false} onLocate={locate} />)
    expect(screen.getByText('起病时间待补充')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '采纳并定位' }))
    await waitFor(() => expect(locate).toHaveBeenCalledWith('presentIllness'))
    view.rerender(<RecordQualityReview decision={result.current.decision} disabled={false} onLocate={locate} />)
    expect(screen.getByText('已采纳，待保存核实')).toBeInTheDocument()
    expect(result.current.form.getValues('presentIllness')).toBe('咳嗽')
    expect(screen.queryByRole('button', { name: '核查当前病历' })).not.toBeInTheDocument()
  })
})
