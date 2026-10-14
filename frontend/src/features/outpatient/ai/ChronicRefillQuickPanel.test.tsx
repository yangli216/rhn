import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext } from '../../../shared/api/clinicalAiApi'
import { ClinicalAiCopilotHub, type ClinicalAiCopilotHubProps } from './ClinicalAiCopilotHub'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import type { ChronicRefillController } from './useChronicRefill'

const context: ClinicalAiDraftContext = { encounterId: 'enc-1', residentId: 'res-1', encounterStatus: 'IN_PROGRESS',
  documentVersion: 0, documentStatus: 'DRAFT', structuredContextFingerprint: 'f', medicationDraftFingerprint: 'm',
  serviceDraftFingerprint: 's', allergyContextFingerprint: 'a', allergyState: 'READY', busy: false, diagnoses: [] }
const capability: ClinicalAiCapabilities = { mode: 'MODEL', available: true, provider: 'test', message: '',
  features: ['RECORD_COMPLETENESS'] }
const chronicScene: ReceptionSceneAssessment = { scene: 'CHRONIC_REFILL', sceneLabel: '慢病复诊配药', badgeTone: 'info',
  summaryText: '近90天病史提示高血压', matchedConditions: ['高血压'], reportHighlights: [], selectedReportIds: [],
  chronicEncounterIds: ['enc-0'] }
const medication = (id: string, name: string) => ({ medicationId: id, medicationName: name, doseValue: 5, doseUnit: 'mg',
  routeCode: 'PO', frequencyCode: 'QD', medicationInstruction: '口服，每日一次', quantity: 1, selfProvided: false,
  substitutionAllowed: false })

function controller(overrides: Partial<ChronicRefillController> = {}): ChronicRefillController {
  const medications = [medication('m1', '苯磺酸氨氯地平片'), medication('m2', '缬沙坦胶囊'),
    medication('m3', '阿托伐他汀钙片'), medication('m4', '阿司匹林肠溶片')]
  return { encounterId: 'enc-1', loading: false, ready: true, medications, conditionsText: '高血压',
    stablePlan: { encounterId: 'enc-1', sourceEncounterId: 'enc-0', conditionTitle: '高血压', summary: '识别 4 项稳定用药',
      diagnoses: [], medications, services: [], guidanceNotes: [], reviewItems: [], assessedCategories: ['MEDICATION'] },
    tone: 'success', toneLabel: '指标核查平稳', adopted: false, overrideWarning: false, actionDisabled: false,
    applyRefill: vi.fn(), openHistory: vi.fn(), ...overrides }
}

function renderHub(props: Partial<ClinicalAiCopilotHubProps> = {}) {
  const base: ClinicalAiCopilotHubProps = { context, capability, suggestion: null, current: false, busy: false,
    generating: false, inputBusy: false, preview: { recordDraft: {} }, onView: vi.fn(), disabled: false, canAdopt: true,
    error: '', voiceInput: null, question: '', onQuestionChange: vi.fn(), onGenerate: vi.fn().mockResolvedValue('s-1'),
    onApply: vi.fn(), sceneAssessment: chronicScene, sceneLoading: false,
    surfaces: { summary: null, note: null, diagnoses: null, plans: null, detail: null }, chronicRefill: controller() }
  const merged = { ...base, ...props }
  const view = render(<ClinicalAiCopilotHub {...merged} />)
  return { ...view, props: merged, rerender: (next: Partial<ClinicalAiCopilotHubProps>) =>
    view.rerender(<ClinicalAiCopilotHub {...merged} {...next} />) }
}

const panel = () => screen.queryByRole('region', { name: '慢病快捷续方' })
const guide = () => screen.queryByRole('region', { name: '慢病复诊引导' })

describe('ChronicRefillQuickPanel in the copilot hub', () => {
  afterEach(cleanup)

  it('auto-opens without taking focus when a refillable chronic plan is ready', () => {
    const editor = document.createElement('textarea')
    document.body.appendChild(editor)
    editor.focus()
    renderHub()
    expect(panel()).toBeInTheDocument()
    expect(screen.getByText('识别为慢病复诊 · 高血压')).toBeInTheDocument()
    expect(screen.getByText('苯磺酸氨氯地平片')).toBeInTheDocument()
    expect(screen.queryByText('阿司匹林肠溶片')).not.toBeInTheDocument()
    expect(screen.getByText('另有 1 种药品，可在处方明细中核对')).toBeInTheDocument()
    expect(document.activeElement).toBe(editor)
    editor.remove()
  })

  it('does not auto-open while the scene or stable plan is loading, or when not chronic', () => {
    const { rerender } = renderHub({ chronicRefill: controller(), sceneLoading: true })
    expect(panel()).not.toBeInTheDocument()
    expect(guide()).not.toBeInTheDocument()
    rerender({ chronicRefill: controller({ loading: true, ready: false, stablePlan: undefined }), sceneLoading: false })
    expect(guide()).not.toBeInTheDocument()
    rerender({ chronicRefill: controller(), sceneLoading: false,
      sceneAssessment: { ...chronicScene, scene: 'FIRST_VISIT' } })
    expect(panel()).not.toBeInTheDocument()
  })

  it('auto-opens a record guide without a refillable plan and generates only the follow-up record', async () => {
    const onGenerate = vi.fn().mockResolvedValue('s-1')
    const onOpenHistory = vi.fn()
    const onFindPlans = vi.fn().mockResolvedValue([])
    const onQuestionChange = vi.fn()
    const refill = controller({ ready: false, stablePlan: undefined, medications: [], openHistory: onOpenHistory })
    renderHub({ chronicRefill: refill, onGenerate, onFindPlans, onQuestionChange })
    expect(panel()).not.toBeInTheDocument()
    expect(guide()).toBeInTheDocument()
    expect(screen.getByText('近90天病史提示高血压；暂无可直接续用的历史稳定方案。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看历史处方' }))
    expect(onOpenHistory).toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成复诊病历' })) })
    // Generates immediately: no plan-choice detour and no prompt parked in the question box.
    expect(onGenerate).toHaveBeenCalledWith(expect.stringContaining('高血压'))
    expect(onFindPlans).not.toHaveBeenCalled()
    expect(onQuestionChange).not.toHaveBeenCalled()
    expect(refill.applyRefill).not.toHaveBeenCalled()
    expect(guide()).not.toBeInTheDocument()
  })

  it('routes one-click refill through the hub generator', () => {
    const refill = controller()
    renderHub({ chronicRefill: refill })
    fireEvent.click(screen.getByRole('button', { name: /一键安全续方/ }))
    expect(refill.applyRefill).toHaveBeenCalledWith(expect.any(Function))
  })

  it('closes on Escape and outside click, and auto-opens only once per encounter', () => {
    const { rerender } = renderHub()
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(panel()).not.toBeInTheDocument()
    rerender({ busy: true })
    rerender({ busy: false })
    expect(panel()).not.toBeInTheDocument()

    rerender({ context: { ...context, encounterId: 'enc-2' }, chronicRefill: controller({ encounterId: 'enc-2' }) })
    expect(panel()).toBeInTheDocument()
    act(() => { fireEvent.mouseDown(document.body) })
    expect(panel()).not.toBeInTheDocument()
  })

  it('closes after adoption and hands over to the full hub', () => {
    const { rerender } = renderHub()
    fireEvent.click(screen.getByRole('button', { name: '更多 AI 辅诊' }))
    expect(panel()).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'AI 临床辅诊中枢' })).toBeInTheDocument()

    cleanup()
    const second = renderHub()
    expect(panel()).toBeInTheDocument()
    second.rerender({ chronicRefill: controller({ adopted: true }) })
    expect(panel()).not.toBeInTheDocument()
    void rerender
  })
})
