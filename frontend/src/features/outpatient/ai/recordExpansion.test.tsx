import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext, ClinicalAiSuggestion } from '../../../shared/api/clinicalAiApi'
import { ClinicalAiCopilotHub, type ClinicalAiCopilotHubProps } from './ClinicalAiCopilotHub'
import { canExpandRecord, pickRecordExpansion, recordExpansionTargets } from './recordExpansion'

const context: ClinicalAiDraftContext = { encounterId: 'enc-1', residentId: 'res-1', encounterStatus: 'IN_PROGRESS',
  documentVersion: 0, documentStatus: 'DRAFT', structuredContextFingerprint: 'f', medicationDraftFingerprint: 'm',
  serviceDraftFingerprint: 's', allergyContextFingerprint: 'a', allergyState: 'READY', busy: false, diagnoses: [],
  chiefComplaint: '咳嗽3天', medicalHistory: '高血压病史5年。', temperature: 38.2 }
const capability: ClinicalAiCapabilities = { mode: 'MODEL', available: true, provider: 'test', message: '',
  features: ['RECORD_COMPLETENESS', 'RECORD_EXPANSION'] }
const expansionDraft = {
  chiefComplaint: '咳嗽、发热3天', presentIllness: '患者3天前出现咳嗽，无咳痰、胸痛。', medicalHistory: '否认慢性病史。',
  physicalExam: '咽部无充血，双肺呼吸音清。', temperature: 37, pulseRate: 88,
  annotations: [
    { field: 'presentIllness' as const, text: '无咳痰、胸痛', source: 'AI' as const, kind: 'VARIABLE' as const, label: 'AI推荐·待核实' },
    { field: 'medicalHistory' as const, text: '否认慢性病史', source: 'AI' as const, kind: 'VARIABLE' as const },
    { field: 'physicalExam' as const, text: '咽部无充血，双肺呼吸音清', source: 'AI' as const, kind: 'VARIABLE' as const },
  ],
}

describe('record expansion targets', () => {
  it('offers expansion only for a short chief complaint with an empty target section', () => {
    expect(canExpandRecord(context)).toBe(true)
    expect(canExpandRecord({ ...context, chiefComplaint: '  ' })).toBe(false)
    expect(canExpandRecord({ ...context, chiefComplaint: '咳'.repeat(61) })).toBe(false)
    // A written present illness (doctor or any AI draft, e.g. a chronic follow-up record) retires the shortcut,
    // even while other sections such as health education are still empty.
    expect(canExpandRecord({ ...context, presentIllness: '高血压病史5年，规律服药。' })).toBe(false)
    expect(canExpandRecord({ ...context, presentIllness: '  ' })).toBe(true)
  })

  it('writes the chief complaint and only still-empty sections and vitals', () => {
    const targets = recordExpansionTargets(context)
    expect(targets).toEqual(expect.arrayContaining(['chiefComplaint', 'presentIllness', 'allergyHistory', 'physicalExam',
      'healthEducation', 'followUp', 'pulseRate']))
    expect(targets).not.toContain('medicalHistory')
    expect(targets).not.toContain('temperature')
    expect(recordExpansionTargets({ ...context, followUp: '1周后复诊' })).not.toContain('followUp')
    const picked = pickRecordExpansion(expansionDraft, targets)
    expect(picked).toMatchObject({ chiefComplaint: '咳嗽、发热3天', presentIllness: expansionDraft.presentIllness, pulseRate: 88 })
    expect(picked.medicalHistory).toBeUndefined()
    expect(picked.temperature).toBeUndefined()
    expect(picked.annotations?.map((mark) => mark.field)).toEqual(['presentIllness', 'physicalExam'])
  })
})

function renderHub(props: Partial<ClinicalAiCopilotHubProps> = {}) {
  const field = document.createElement('div')
  const input = document.createElement('textarea')
  field.appendChild(input)
  const slot = document.createElement('div')
  document.body.append(field, slot)
  const base: ClinicalAiCopilotHubProps = { context, capability, suggestion: null, current: false, busy: false,
    generating: false, inputBusy: false, preview: { recordDraft: {} }, onView: vi.fn(), disabled: false, canAdopt: true,
    error: '', voiceInput: null, question: '', onQuestionChange: vi.fn(), onGenerate: vi.fn().mockResolvedValue('s-expand'),
    onApply: vi.fn(), sceneLoading: false,
    surfaces: { summary: null, note: null, diagnoses: null, plans: null, detail: null, chiefComplaint: slot } }
  const merged = { ...base, ...props }
  const view = render(<ClinicalAiCopilotHub {...merged} />)
  return { ...view, props: merged, input, slot,
    rerender: (next: Partial<ClinicalAiCopilotHubProps>) => view.rerender(<ClinicalAiCopilotHub {...merged} {...next} />) }
}

const suggestion = { id: 's-expand', status: 'GENERATED', contextHash: 'h', clientContextFingerprint: 'c', provider: 'test',
  promptVersion: 'RHN-RECORD-EXPANSION-V2', generatedAt: '', expiresAt: '', summary: '', recordDraft: expansionDraft,
  diagnosisCandidates: [], differentialDiagnoses: [], missingInformation: [], safetyAlerts: [], recommendedPlans: [],
  disclaimer: '' } satisfies ClinicalAiSuggestion

describe('record expansion shortcut in the copilot hub', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = '' })

  it('runs from the button and from Ctrl/⌘+Enter in the chief complaint only', async () => {
    const { props, input, slot } = renderHub()
    expect(slot).toHaveTextContent(/AI扩写\((Ctrl|⌘)\+Enter\)/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AI扩写/ })) })
    expect(props.onGenerate).toHaveBeenCalledWith(undefined, { intent: 'RECORD_EXPANSION' })

    vi.mocked(props.onGenerate).mockClear()
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true }) })
    expect(props.onGenerate).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter', metaKey: true }) })
    expect(props.onGenerate).toHaveBeenCalledWith(undefined, { intent: 'RECORD_EXPANSION' })
  })

  it('is hidden without the model feature, without a chief complaint, or when the record is busy', () => {
    const view = renderHub({ capability: { ...capability, features: ['RECORD_COMPLETENESS'] } })
    expect(view.slot).toBeEmptyDOMElement()
    view.rerender({ capability, context: { ...context, chiefComplaint: '' } })
    expect(view.slot).toBeEmptyDOMElement()
    view.rerender({ capability, busy: true })
    expect(screen.getByRole('button', { name: /AI扩写/ })).toBeDisabled()
  })

  it('shows a failed expansion beside the shortcut but stays quiet when cancelled', async () => {
    const onGenerate = vi.fn().mockRejectedValueOnce(new Error('模型辅助暂时不可用，请稍后重试'))
      .mockRejectedValueOnce(new DOMException('已取消过期分析', 'AbortError'))
    const { slot } = renderHub({ onGenerate })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AI扩写/ })) })
    expect(screen.getByRole('alert')).toHaveTextContent('模型辅助暂时不可用，请稍后重试')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AI扩写/ })) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(slot).toHaveTextContent(/AI扩写\((Ctrl|⌘)\+Enter\)/)
  })

  it('adopts the normalized chief complaint and fills only empty sections', async () => {
    const view = renderHub()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AI扩写/ })) })
    view.rerender({ suggestion, current: true })
    expect(view.props.onApply).toHaveBeenCalledTimes(1)
    const selection = vi.mocked(view.props.onApply).mock.calls[0][0]
    expect(selection.incrementalRecord).toBe(false)
    expect(selection.recordDraft).toMatchObject({ chiefComplaint: '咳嗽、发热3天', presentIllness: expansionDraft.presentIllness,
      physicalExam: expansionDraft.physicalExam, pulseRate: 88 })
    expect(selection.recordDraft?.medicalHistory).toBeUndefined()
    expect(selection.recordDraft?.temperature).toBeUndefined()
    expect(selection.recordDraft?.annotations?.every((mark) => mark.field !== 'medicalHistory')).toBe(true)
  })
})
