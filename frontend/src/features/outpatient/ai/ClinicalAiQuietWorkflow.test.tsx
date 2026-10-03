import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { ClinicalAiDraftContext, ClinicalAiRecommendedPlan, ClinicalAiSuggestion, GenerateClinicalAiSuggestionInput } from '../../../shared/api/clinicalAiApi'
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
function setup(generateStream = vi.fn().mockImplementation(async (_id, input) => result(input)), withTreatmentReview = false, plans?: ClinicalAiRecommendedPlan[]) {
  const reviewRecommendedPlan = vi.fn()
  const recommendPlans = vi.fn().mockResolvedValue(plans ?? [])
  const recordEvent = vi.fn().mockResolvedValue(undefined), apply = vi.fn(), onFieldStream = vi.fn()
  const api = { clinicalAi: { capabilities: vi.fn().mockResolvedValue({ available: true, mode: 'MODEL', provider: 'test',
    features: ['BACKGROUND_DRAFT', 'STREAMING_DRAFT', 'RECORD_COMPLETENESS', 'PLAN_RECOMMENDATIONS', 'TERMINOLOGY_VALIDATION', 'AUDIT_TRAIL', 'VOICE_TRANSCRIPTION'] }),
    generateStream, recommendPlans, history: vi.fn().mockResolvedValue([]), recordEvent },
    masterData: { diseases: vi.fn().mockResolvedValue([
      { code: 'J06.9', display: '测试诊断甲', sdStatus: 'ACTIVE', systemCode: 'WHO.BD.CS.ICD10' },
      { code: 'R50.9', display: '测试诊断乙', sdStatus: 'ACTIVE', systemCode: 'WHO.BD.CS.ICD10' },
    ]), searchServices: vi.fn().mockResolvedValue({ content: [
      { id: 'lab-1', code: 'LAB001', name: '血常规', prices: [] },
      { id: 'exam-1', code: 'EXAM001', name: '胸部X线', prices: [] },
    ] }) },
    diagnostics: { reportsByEncounter: vi.fn().mockResolvedValue([]) },
    outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
  const nodes = render(<div><div data-testid="summary" /><div data-testid="note" /><div data-testid="diagnoses" /><div data-testid="plans" /></div>)
  const surfaces = { summary: nodes.getByTestId('summary') as HTMLDivElement, note: nodes.getByTestId('note') as HTMLDivElement,
    diagnoses: nodes.getByTestId('diagnoses') as HTMLDivElement, plans: nodes.getByTestId('plans') as HTMLDivElement, detail: null }
  function Harness() {
    const [activeEncounter, setActiveEncounter] = useState(encounter)
    const [text, setText] = useState('')
    const [templateApplied, setTemplateApplied] = useState(false)
    const [treatmentKeys, setTreatmentKeys] = useState<string[]>([])
    return <><button onClick={() => setActiveEncounter({ ...encounter, id: 'next-enc', residentId: 'next-resident' })}>切换测试患者</button><button onClick={() => setTemplateApplied(true)}>带入测试模板</button><textarea aria-label="主病历输入" value={text} onChange={(event) => setText(event.target.value)} />
      <ClinicalAiAssistantPanel encounter={activeEncounter} currentContext={{ ...base, encounterId: activeEncounter.id, residentId: activeEncounter.residentId, presentIllness: text,
          chiefComplaint: templateApplied ? '咳嗽3天' : undefined,
          annotations: templateApplied ? [{ field: 'chiefComplaint', text: '3天', start: 2, source: 'TEMPLATE', kind: 'VARIABLE', binding: 'symptom.cough.duration' }] : [],
          serviceDraftFingerprint: treatmentKeys.join('|') || 's' }}
        api={api} allergies={[]} allergyState="READY" disabled={false} surfaces={surfaces}
        onReviewRecommendedPlan={plans ? reviewRecommendedPlan : undefined}
        existingTreatmentKeys={treatmentKeys}
        onReviewTreatment={withTreatmentReview ? (items, completed) => {
          const keys = items.map((item) => `${item.type}:${item.catalogItemId}`)
          completed(keys); setTreatmentKeys(keys)
        } : undefined}
        onAdoptionBusyChange={() => undefined} onApply={apply} onFieldStream={onFieldStream} /></>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)
  const openHub = () => {
    const pill = screen.queryByRole('button', { name: 'AI 辅诊' })
    if (pill && pill.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(pill)
    }
  }
  return { generateStream, recommendPlans, reviewRecommendedPlan, recordEvent, apply, surfaces, onFieldStream, openHub }
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

class FakeSpeech {
  static current: FakeSpeech
  onstart?: () => void
  onend?: () => void
  onresult?: (event: unknown) => void
  constructor() { FakeSpeech.current = this }
  start() { this.onstart?.() }
  stop() { this.onend?.() }
  emit(text: string, final: boolean, index = 0) {
    const results = Array.from({ length: index + 1 }, () => ({ isFinal: final, 0: { transcript: text } }))
    this.onresult?.({ resultIndex: index, results })
  }
}

describe('quiet clinical AI workflow', () => {
  it('keeps the default co-writing toolbar compact without removing accessible actions', async () => {
    const { openHub } = setup()
    await advance(20)

    expect(screen.getByRole('button', { name: 'AI 辅诊' })).toBeInTheDocument()
    openHub()

    expect(screen.getByText('AI 临床辅诊中枢')).toBeInTheDocument()
    expect(screen.getByText('AI 共写')).toBeInTheDocument()
    expect(screen.getByText('待分析')).toBeInTheDocument()
    expect(screen.queryByText('输入问诊要点后准备建议')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '自动准备' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('接诊场景')).not.toBeInTheDocument()
    expect(screen.queryByText('初诊全科接诊')).not.toBeInTheDocument()
    expect(screen.queryByText('自动识别')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分析当前病历' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '口述 / 输入要点' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多辅助' })).toBeInTheDocument()

    const composer = screen.getByLabelText('问诊要点或辅助要求')
    const headingLabel = document.querySelector('.doctor-ai-composer-card__head label')
    expect(screen.queryByText('问诊要点与口述录入')).not.toBeInTheDocument()
    expect(headingLabel).toHaveTextContent('问诊要点或辅助要求')
    expect(headingLabel).toHaveAttribute('for', composer.id)
  })

  it('generates and directly adopts only the completed record, through audit, without auto-adding diagnoses', async () => {
    const { apply, recordEvent, generateStream, openHub } = setup(vi.fn().mockImplementation(async (_id, input) => ({ ...result(input),
      recordDraft: { chiefComplaint: '发热3天', presentIllness: '患者发热3天，最高体温39℃。', medicalHistory: '既往史待询问',
        physicalExam: '专科查体待完成', treatmentPlan: '建议进一步评估病因并随访。' },
      diagnosisCandidates: [{ code: 'R50.9', display: '发热', type: 'PRIMARY', confidence: .8, rationale: '待确认' }] })))
    await advance(20)
    openHub()
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
    const { apply, openHub } = setup(generateStream)
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(50)
    fireEvent.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '整理并对照建议' }))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
  })

  it('cancels direct adoption when clinical input changes during generation', async () => {
    let finish!: (value: ClinicalAiSuggestion) => void
    let input!: GenerateClinicalAiSuggestionInput
    const { apply, openHub } = setup(vi.fn().mockImplementation((_id, value) => {
      input = value; return new Promise<ClinicalAiSuggestion>((resolve) => { finish = resolve })
    }))
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '直接生成并带入病历' }))
    await advance(20)
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '患者新补充了重要病史' } })
    await act(async () => finish(result(input)))
    await advance(50)
    expect(apply).not.toHaveBeenCalled()
  })

  it('never generates on typing or idle time, even with a previously enabled automatic preference', async () => {
    localStorage.setItem('rhn:ai-auto-prepare', 'on')
    const { generateStream, surfaces, apply, openHub } = setup()
    await advance(20)
    expect(screen.queryByLabelText('AI 诊断待确认')).not.toBeInTheDocument()
    expect(surfaces.plans).toBeEmptyDOMElement()
    await advance(3000)
    expect(generateStream).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '合成问诊输入内容，仅手动触发分析' } })
    await advance(60_000)
    expect(generateStream).not.toHaveBeenCalled()
    openHub()
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
    const { recordEvent, openHub } = setup(generateStream, true)
    await advance(20)
    openHub()
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
    const { openHub } = setup(generateStream, true)
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByRole('button', { name: '确认所选（2）' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: '选择 血常规' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '选择 胸部X线' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '确认所选（2）' }))
    await advance(100)
    expect(screen.queryByLabelText('AI 医嘱待确认')).not.toBeInTheDocument()
  })

  it('offers whole plans before generation and continues only after the doctor declines', async () => {
    const plans = [{ templateId: 'plan-1', name: '院内整体方案', description: '病历、诊断及医嘱', rationale: '资料匹配' }]
    const { openHub, generateStream, recommendPlans, reviewRecommendedPlan, apply } = setup(undefined, true, plans)
    await advance(20)
    openHub()
    fireEvent.change(screen.getByLabelText('问诊要点或辅助要求'), { target: { value: '合成问诊要点' } })
    fireEvent.click(screen.getByRole('button', { name: '匹配方案并继续' }))
    await advance(100)
    expect(recommendPlans).toHaveBeenCalledTimes(1)
    expect(generateStream).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(screen.getByLabelText('整体诊疗方案推荐')).toHaveTextContent('院内整体方案')
    fireEvent.click(screen.getByRole('button', { name: '核对整体方案' }))
    expect(reviewRecommendedPlan).toHaveBeenCalledWith(plans[0])
    expect(generateStream).not.toHaveBeenCalled()
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '不采用方案，继续 AI 共写' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(generateStream.mock.calls[0][1].question).toContain('合成问诊要点')
  })

  it('continues the existing workflow when no whole plan matches', async () => {
    const { openHub, generateStream, recommendPlans } = setup(undefined, true, [])
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '整理并对照建议' }))
    await advance(100)
    expect(recommendPlans).toHaveBeenCalledTimes(1)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('整体诊疗方案推荐')).not.toBeInTheDocument()
  })

  it('invalidates a pending plan choice when the question changes', async () => {
    const plans = [{ templateId: 'plan-1', name: '旧方案', description: '', rationale: '' }]
    const { openHub, generateStream } = setup(undefined, true, plans)
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '匹配方案并继续' }))
    await advance(100)
    fireEvent.change(screen.getByLabelText('问诊要点或辅助要求'), { target: { value: '新的合成内容' } })
    await advance(20)
    expect(screen.queryByLabelText('整体诊疗方案推荐')).not.toBeInTheDocument()
    expect(generateStream).not.toHaveBeenCalled()
  })

  it('adopts only the checked diagnosis candidates in a batch', async () => {
    const generateStream = vi.fn().mockImplementation(async (_id, input) => ({ ...result(input),
      diagnosisCandidates: [
        { code: 'J06.9', display: '测试诊断甲', type: 'PRIMARY', rationale: '需核对' },
        { code: 'R50.9', display: '测试诊断乙', type: 'SECONDARY', rationale: '需核对' },
      ] }))
    const { openHub, apply } = setup(generateStream)
    await advance(20)
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 测试诊断乙' }))
    fireEvent.click(screen.getByRole('button', { name: '确认所选诊断（1）' }))
    await advance(100)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ diagnoses: [
      { code: 'J06.9', display: '测试诊断甲', type: 'PRIMARY' },
    ] }))
  })

  it('shows a partial draft early, keeps input editable, and discards a stale completion', async () => {
    let finish!: (value: ClinicalAiSuggestion) => void
    let input!: GenerateClinicalAiSuggestionInput, signal!: AbortSignal
    const generateStream = vi.fn().mockImplementation((_id, value, abort, delta) => {
      input = value; signal = abort
      delta('{"summary":"正在整理合成内容","recordDraft":{"chiefComplaint":"未完成主诉')
      return new Promise<ClinicalAiSuggestion>((resolve) => { finish = resolve })
    })
    const { apply, onFieldStream, openHub } = setup(generateStream)
    await advance(20)
    openHub()
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
    const { generateStream, openHub } = setup(vi.fn().mockRejectedValue(new Error('模拟服务失败')))
    await advance(20)
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '合成输入，等待后不应自动调用模型' } })
    await advance(60_000)
    expect(generateStream).not.toHaveBeenCalled()
    openHub()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByRole('alert')).toHaveTextContent('模拟服务失败')
    await advance(60_000)
    expect(generateStream).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledTimes(2)
  })
  it('coalesces finalized speech, ignores interim text, and offers a whole template before generation', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeech)
    const plan = { templateId: 'saved-plan', name: '已保存方案', rationale: '符合当前病情' } as ClinicalAiRecommendedPlan
    const { openHub, recommendPlans, generateStream, apply } = setup(undefined, false, [plan])
    await advance(20); openHub()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    act(() => FakeSpeech.current.emit('临时识别内容', false))
    await advance(1200)
    expect(recommendPlans).not.toHaveBeenCalled()
    act(() => FakeSpeech.current.emit('患者咳嗽三天', true))
    await advance(500)
    act(() => FakeSpeech.current.emit('没有发热', true, 1))
    await advance(500)
    expect(recommendPlans).not.toHaveBeenCalled()
    await advance(450)
    expect(recommendPlans).toHaveBeenCalledTimes(1)
    expect(recommendPlans.mock.calls[0][1].voiceTranscript).toBe('患者咳嗽三天 没有发热')
    expect(screen.getByRole('region', { name: '整体诊疗方案推荐' })).toHaveTextContent('已保存方案')
    expect(generateStream).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('falls back from no matching plan to generation and preserves oral provenance in an incremental adoption', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeech)
    const { openHub, recommendPlans, generateStream, apply } = setup(vi.fn().mockImplementation(async (_id, input) => ({
      ...result(input), recordDraft: { chiefComplaint: '咳嗽5天', annotations: [{ field: 'chiefComplaint', text: '5天', start: 2,
        source: 'VOICE', kind: 'FACT', binding: 'symptom.cough.duration', sourceQuote: '咳嗽五天' }] },
    })), false, [])
    await advance(20); openHub()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    act(() => FakeSpeech.current.emit('咳嗽五天', true))
    await advance(1000)
    expect(recommendPlans).toHaveBeenCalledTimes(1)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ overwriteRecord: false,
      recordDraft: expect.objectContaining({ annotations: [expect.objectContaining({ source: 'VOICE', binding: 'symptom.cough.duration' })] }) }))
    // Duplicate final events and the resulting record change cannot create a second automatic analysis.
    act(() => FakeSpeech.current.emit('咳嗽五天', true))
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '医生核对后的病历' } })
    await advance(5000)
    expect(generateStream).toHaveBeenCalledTimes(1)
  })

  it('aborts a pending match and drops late speech when the patient changes', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeech)
    const { openHub, recommendPlans, generateStream, apply } = setup(undefined, false, [])
    let finish!: (plans: ClinicalAiRecommendedPlan[]) => void
    recommendPlans.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await advance(20); openHub()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    const speech = FakeSpeech.current
    act(() => speech.emit('第一位患者的口述', true))
    await advance(1000)
    const signal = recommendPlans.mock.calls[0][2] as AbortSignal
    fireEvent.click(screen.getByRole('button', { name: '切换测试患者' }))
    expect(signal.aborted).toBe(true)
    act(() => speech.emit('迟到的识别结果', true, 1))
    await act(async () => finish([]))
    await advance(1200)
    expect(generateStream).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(screen.getByLabelText('问诊要点或辅助要求')).toHaveValue('')
  })

  it('adapts a chosen template using the same finalized dictation without repeating plan matching', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeech)
    const { openHub, generateStream, recommendPlans, apply } = setup(undefined, false,
      [{ templateId: 'chosen', name: '咳嗽方案', rationale: '资料符合' }])
    await advance(20); openHub()
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    act(() => FakeSpeech.current.emit('咳嗽五天', true))
    await advance(1000)
    fireEvent.click(screen.getByRole('button', { name: '核对整体方案' }))
    fireEvent.click(screen.getByRole('button', { name: '带入测试模板' }))
    await advance(100)
    expect(generateStream).toHaveBeenCalledTimes(1)
    expect(generateStream.mock.calls[0][1]).toMatchObject({ voiceTranscript: '咳嗽五天',
      draft: { chiefComplaint: '咳嗽3天', annotations: [expect.objectContaining({ binding: 'symptom.cough.duration' })] } })
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ overwriteRecord: false }))
    expect(recommendPlans).toHaveBeenCalledTimes(1)
    await advance(3000)
    expect(generateStream).toHaveBeenCalledTimes(1)
  })

  it('keeps a declined treatment selection across a new analysis and temporary stale results', async () => {
    let sequence = 0
    const { openHub } = setup(vi.fn().mockImplementation(async (_id, input) => ({ ...result(input), id: `analysis-${++sequence}`,
      treatmentRecommendations: [{ type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB001', name: '血常规', rationale: '评估感染' }] })), true)
    await advance(20); openHub()
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 血常规' }))
    fireEvent.change(screen.getByLabelText('主病历输入'), { target: { value: '补充本次事实' } })
    fireEvent.click(screen.getByRole('button', { name: '分析当前病历' }))
    await advance(100)
    expect(screen.getByRole('checkbox', { name: '选择 血常规' })).not.toBeChecked()
  })

})
