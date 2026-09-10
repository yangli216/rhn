import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { ClinicalAiDraftContext, ClinicalAiSuggestion, GenerateClinicalAiSuggestionInput } from '../../../shared/api/clinicalAiApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { Encounter } from '../../../shared/model'
import { ClinicalAiAssistantPanel } from './ClinicalAiAssistantPanel'

const encounter = { id: 'quiet-enc', residentId: 'quiet-resident', organizationId: 'org', departmentId: 'dept', status: 'IN_PROGRESS' } as Encounter
const base: ClinicalAiDraftContext = { encounterId: encounter.id, residentId: encounter.residentId,
  encounterStatus: 'IN_PROGRESS', documentVersion: 0, documentStatus: 'DRAFT', structuredContextFingerprint: 'f',
  medicationDraftFingerprint: 'm', serviceDraftFingerprint: 's', allergyContextFingerprint: 'a', allergyState: 'READY', busy: false, diagnoses: [] }
function result(input: GenerateClinicalAiSuggestionInput): ClinicalAiSuggestion {
  return { id: 'quiet-result', status: 'GENERATED', clientContextFingerprint: input.clientContextFingerprint,
    contextHash: 'hash', provider: 'test', promptVersion: 'v1', generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(), summary: '已整理合成资料', recordDraft: { chiefComplaint: '待核对的测试主诉' },
    diagnosisCandidates: [], differentialDiagnoses: [], missingInformation: [], safetyAlerts: [], recommendedPlans: [], disclaimer: '待核对' }
}
function setup(generateStream = vi.fn().mockImplementation(async (_id, input) => result(input)), withTreatmentReview = false) {
  const recordEvent = vi.fn().mockResolvedValue(undefined), apply = vi.fn(), onFieldStream = vi.fn()
  const api = { clinicalAi: { capabilities: vi.fn().mockResolvedValue({ available: true, mode: 'MODEL', provider: 'test',
    features: ['BACKGROUND_DRAFT', 'STREAMING_DRAFT', 'RECORD_COMPLETENESS', 'PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL'] }),
    generateStream, history: vi.fn().mockResolvedValue([]), recordEvent },
    masterData: { searchServices: vi.fn().mockResolvedValue({ content: [
      { id: 'lab-1', code: 'LAB001', name: '血常规', prices: [] },
      { id: 'exam-1', code: 'EXAM001', name: '胸部X线', prices: [] },
    ] }) },
    diagnostics: { reportsByEncounter: vi.fn().mockResolvedValue([]) },
    outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
  const nodes = render(<div><div data-testid="summary" /><div data-testid="note" /><div data-testid="diagnoses" /><div data-testid="plans" /></div>)
  const surfaces = { summary: nodes.getByTestId('summary') as HTMLDivElement, note: nodes.getByTestId('note') as HTMLDivElement,
    diagnoses: nodes.getByTestId('diagnoses') as HTMLDivElement, plans: nodes.getByTestId('plans') as HTMLDivElement, detail: null }
  function Harness() {
    const [text, setText] = useState('')
    const [treatmentKeys, setTreatmentKeys] = useState<string[]>([])
    return <><textarea aria-label="主病历输入" value={text} onChange={(event) => setText(event.target.value)} />
      <ClinicalAiAssistantPanel encounter={encounter} currentContext={{ ...base, presentIllness: text,
          serviceDraftFingerprint: treatmentKeys.join('|') || 's' }}
        api={api} allergies={[]} allergyState="READY" disabled={false} surfaces={surfaces}
        existingTreatmentKeys={treatmentKeys}
        onReviewTreatment={withTreatmentReview ? (items, completed) => {
          const keys = items.map((item) => `${item.type}:${item.catalogItemId}`)
          completed(keys); setTreatmentKeys(keys)
        } : undefined}
        onAdoptionBusyChange={() => undefined} onApply={apply} onFieldStream={onFieldStream} /></>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  return { generateStream, recordEvent, apply, surfaces, onFieldStream }
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('quiet clinical AI workflow', () => {
  it('keeps the default co-writing toolbar compact without removing accessible actions', async () => {
    setup()
    await advance(20)

    expect(screen.getByText('AI 共写')).toBeInTheDocument()
    expect(screen.getByText('待分析')).toBeInTheDocument()
    expect(screen.queryByText('输入问诊要点后准备建议')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '自动准备' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('接诊场景')).not.toBeInTheDocument()
    expect(screen.queryByText('初诊全科接诊')).not.toBeInTheDocument()
    expect(screen.queryByText('自动识别')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析当前病历' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '口述 / 输入要点' })).toHaveTextContent('录入要点')
    expect(screen.getByRole('button', { name: '更多辅助' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '口述 / 输入要点' }))
    const composer = screen.getByLabelText('问诊要点或辅助要求')
    const headingLabel = document.querySelector('.doctor-ai-composer-card__head label')
    expect(screen.queryByText('问诊要点与口述录入')).not.toBeInTheDocument()
    expect(headingLabel).toHaveTextContent('问诊要点或辅助要求')
    expect(headingLabel).toHaveAttribute('for', composer.id)
  })

  it('generates and directly adopts only the completed record, through audit, without auto-adding diagnoses', async () => {
    const { apply, recordEvent, generateStream } = setup(vi.fn().mockImplementation(async (_id, input) => ({ ...result(input),
      recordDraft: { chiefComplaint: '发热3天', presentIllness: '患者发热3天，最高体温39℃。', medicalHistory: '既往史待询问',
        physicalExam: '专科查体待完成', treatmentPlan: '建议进一步评估病因并随访。' },
      diagnosisCandidates: [{ code: 'R50.9', display: '发热', type: 'PRIMARY', confidence: .8, rationale: '待确认' }] })))
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '口述 / 输入要点' }))
    fireEvent.change(screen.getByLabelText('问诊要点或辅助要求'), { target: { value: '感冒发热3天，最高体温39度' } })
    fireEvent.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledWith(encounter.id, expect.objectContaining({ receptionScene: 'FIRST_VISIT' }), expect.anything(), expect.any(Function))
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0][0]).toMatchObject({ overwriteRecord: true, recordDraft: { chiefComplaint: '发热3天', medicalHistory: '既往史待询问' } })
    expect(apply.mock.calls[0][0].diagnoses).toBeUndefined()
    expect(recordEvent).toHaveBeenCalledWith('quiet-result', expect.objectContaining({ eventType: 'ADOPTED', sectionCode: 'RECORD' }))
  })

  it('does not adopt an old result or a later manual analysis after direct generation fails', async () => {
    const generateStream = vi.fn().mockImplementationOnce(async (_id, input) => result(input))
      .mockRejectedValueOnce(new Error('生成失败'))
      .mockImplementation(async (_id, input) => ({ ...result(input), id: 'later' }))
    const { apply } = setup(generateStream)
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(50)
    fireEvent.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '口述 / 输入要点' }))
    fireEvent.click(screen.getByRole('button', { name: '整理并对照建议' }))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
  })

  it('cancels direct adoption when clinical input changes during generation', async () => {
    let finish!: (value: ClinicalAiSuggestion) => void
    let input!: GenerateClinicalAiSuggestionInput
    const { apply } = setup(vi.fn().mockImplementation((_id, value) => {
      input = value; return new Promise<ClinicalAiSuggestion>((resolve) => { finish = resolve })
    }))
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '口述 / 输入要点' }))
    fireEvent.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await advance(20)
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '患者新补充了重要病史' } })
    await act(async () => finish(result(input)))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
  })

  it('never generates on typing or idle time, even with a previously enabled automatic preference', async () => {
    localStorage.setItem('rhn:ai-auto-prepare', 'on')
    const { generateStream, surfaces, apply } = setup()
    await advance(20)
    expect(screen.queryByLabelText('AI 诊断待确认')).not.toBeInTheDocument()
    expect(surfaces.plans).toBeEmptyDOMElement()
    await advance(3000)
    expect(generateStream).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '合成问诊输入内容，仅手动触发分析' } })
    await advance(60_000)
    expect(generateStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '口述 / 输入要点' }))
    fireEvent.change(screen.getByLabelText('问诊要点或辅助要求'), { target: { value: '补充模拟问诊描述，停顿不自动分析' } })
    await advance(60_000)
    expect(generateStream).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '整理并对照建议' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(screen.getByText('建议已准备好')).toBeInTheDocument()
    expect(screen.getByLabelText('主诉建议（可编辑）')).toHaveValue('待核对的测试主诉')
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '手动生成后再次修改，也不会自动重试分析' } })
    await advance(60_000)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
  })

  it('keeps accepted treatment rows hidden and does not regenerate when only order drafts change', async () => {
    const generateStream = vi.fn().mockImplementation(async (_id, input) => ({ ...result(input),
      treatmentRecommendations: [{ type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001',
        name: '血常规', rationale: '评估感染' }] }))
    const { recordEvent } = setup(generateStream, true)
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByLabelText('AI 医嘱待确认')).toHaveTextContent('血常规')
    fireEvent.click(screen.getByRole('button', { name: '确认所选（1）' }))
    await advance(100)
    expect(screen.queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument()
    expect(recordEvent).toHaveBeenCalledWith('quiet-result', expect.objectContaining({
      eventType: 'ADOPTED', sectionCode: 'TREATMENT',
    }))
    await advance(20_000)
    expect(generateStream).toHaveBeenCalledTimes(1)
  })

  it('selects and confirms multiple treatment suggestions in one operation', async () => {
    const generateStream = vi.fn().mockImplementation(async (_id, input) => ({ ...result(input),
      treatmentRecommendations: [
        { type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '评估感染' },
        { type: 'EXAMINATION', catalogItemId: 'exam-1', code: 'EXAM001', name: '胸部X线', rationale: '评估肺部' },
      ] }))
    setup(generateStream, true)
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: '选择 血常规' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 胸部X线' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    await advance(100)
    expect(screen.queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument()
  })

  it('shows a partial draft early, keeps input editable, and discards a stale completion', async () => {
    let finish!: (value: ClinicalAiSuggestion) => void
    let input!: GenerateClinicalAiSuggestionInput, signal!: AbortSignal
    const generateStream = vi.fn().mockImplementation((_id, value, abort, delta) => {
      input = value; signal = abort
      delta('{"summary":"正在整理合成内容","recordDraft":{"chiefComplaint":"未完成主诉')
      return new Promise<ClinicalAiSuggestion>((resolve) => { finish = resolve })
    })
    const { apply, onFieldStream } = setup(generateStream)
    await advance(20)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(20)
    expect(screen.queryByText('未完成主诉')).not.toBeInTheDocument()
    expect(onFieldStream).toHaveBeenLastCalledWith(expect.objectContaining({ recordDraft: { chiefComplaint: '未完成主诉' } }))
    expect(screen.getByText('正在共写病历')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /采纳所选草稿/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('问诊要点或辅助要求')).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '合成输入已变化，之前生成必须失效' } })
    await advance(20)
    expect(signal.aborted).toBe(true)
    await act(async () => finish(result(input)))
    await advance(20)
    expect(screen.queryByText('建议已准备好')).not.toBeInTheDocument()
    expect(screen.queryByText('未完成主诉')).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('shows a manual generation error and retries only when the button is clicked', async () => {
    const { generateStream } = setup(vi.fn().mockRejectedValue(new Error('模拟服务失败')))
    await advance(20)
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '合成输入，等待后不应自动调用模型' } })
    await advance(60_000)
    expect(generateStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByRole('alert')).toHaveTextContent('模拟服务失败')
    await advance(60_000)
    expect(generateStream).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledTimes(2)
  })
})
