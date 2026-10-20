import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext } from '../../../shared/api/clinicalAiApi'
import { stableClinicalAiFingerprint } from './aiDraftAdapter'
import { ClinicalAiCopilotHub, type ClinicalAiCopilotHubProps } from './ClinicalAiCopilotHub'

const context: ClinicalAiDraftContext = { encounterId: 'enc-1', residentId: 'res-1', encounterStatus: 'IN_PROGRESS',
  documentVersion: 0, documentStatus: 'DRAFT', structuredContextFingerprint: 'f',
  medicationDraftFingerprint: stableClinicalAiFingerprint('medications', []),
  serviceDraftFingerprint: stableClinicalAiFingerprint('services', []), allergyContextFingerprint: 'a', allergyState: 'READY', busy: false, diagnoses: [],
  chiefComplaint: '咳嗽3天', presentIllness: '患者3天前出现咳嗽，无发热。' }
const capability: ClinicalAiCapabilities = { mode: 'MODEL', available: true, provider: 'test', message: '',
  features: ['RECORD_COMPLETENESS'] }

function renderHub(props: Partial<ClinicalAiCopilotHubProps> = {}) {
  const slot = document.createElement('div')
  document.body.append(slot)
  const onGenerate = vi.fn().mockResolvedValue('s-1')
  const base: ClinicalAiCopilotHubProps = { context, capability, suggestion: null, current: false, busy: false,
    generating: false, inputBusy: false, preview: { recordDraft: {} }, onView: vi.fn(), disabled: false, canAdopt: true,
    error: '', voiceInput: null, question: '', onQuestionChange: vi.fn(), onGenerate, onApply: vi.fn(), sceneLoading: false,
    surfaces: { summary: null, note: null, diagnoses: null, plans: null, detail: null, chiefComplaint: slot } }
  return { onGenerate, ...render(<ClinicalAiCopilotHub {...base} {...props} />) }
}

describe('copilot next step intents', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = '' })

  it('asks only for diagnoses on the diagnosis step', async () => {
    const { onGenerate } = renderHub()
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /AI 推荐诊断/ })) })
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate).toHaveBeenCalledWith(undefined, { intent: 'DIAGNOSIS_RECOMMENDATION' })
  })

  it('asks only for treatments on the orders step', async () => {
    const { onGenerate } = renderHub({ context: { ...context,
      diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY', codeSystem: 'WHO.BD.CS.ICD10',
        diagnosisDomain: 'WESTERN_MEDICINE' } as ClinicalAiDraftContext['diagnoses'][number]] } })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /AI 推荐医嘱/ })) })
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate).toHaveBeenCalledWith(undefined, { intent: 'TREATMENT_RECOMMENDATION' })
  })
})
