import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import { clinicalAiContextFingerprint, type ClinicalAiDraftRequest } from '../ai/aiDraftAdapter'
import type { ClinicalAiContextState } from './clinicalAiDraftContext'
import type { RecordForm } from './clinicalRecordDraft'
import { useClinicalAiDraft, type AiRecordUndo } from './useClinicalAiDraft'

const encounter: Encounter = {
  id: 'enc-1', residentId: 'resident-1', encounterNo: 'E001', organizationId: 'org-1',
  departmentId: 'dept-1', status: 'IN_PROGRESS', diagnoses: [], registeredAt: '2026-09-22T08:00:00Z',
}
const original: RecordForm = {
  chiefComplaint: '复诊', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '',
}
const document: ClinicalDocument = {
  id: 'doc-1', residentId: encounter.residentId, encounterId: encounter.id,
  documentType: 'OUTPATIENT_NOTE', instanceKey: 'DEFAULT', title: '门诊病历', status: 'DRAFT',
  currentVersion: 1, content: {}, contentSchema: 'RHN.OUTPATIENT_NOTE.V1', createdBy: 'doctor',
  createdAt: '', updatedAt: '', history: [],
}

function setup() {
  const context: ClinicalAiContextState = {
    document, documentStatus: 'DRAFT', structuredFormId: '', structuredValues: {},
    medicationDrafts: [], serviceDrafts: [], allergies: [], allergyState: 'READY', busy: false,
  }
  const callbacks = { onAiDraftConsumed: vi.fn(), onAiContextChange: vi.fn(), onNotice: vi.fn(), onPlan: vi.fn() }
  type Props = { aiDraft: ClinicalAiDraftRequest | null; context: ClinicalAiContextState; businessBusy: boolean }
  const props: Props = { aiDraft: null, context, businessBusy: false }
  const hook = renderHook((input: Props) => {
    const form = useForm<RecordForm>({ defaultValues: original })
    form.watch()
    const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
    const [aiRecordUndo, setAiRecordUndo] = useState<AiRecordUndo | null>(null)
    const ai = useClinicalAiDraft({ ...input, ...callbacks, encounter, form, diagnoses, setDiagnoses,
      aiRecordUndo, setAiRecordUndo })
    return { ...ai, form, diagnoses }
  }, { initialProps: props })
  const request = (patch: Partial<ClinicalAiDraftRequest> = {}): ClinicalAiDraftRequest => ({
    requestId: 'request-1', sourceSuggestionId: 'suggestion-1', encounterId: encounter.id,
    residentId: encounter.residentId, sourceLabel: 'AI 病历建议',
    contextFingerprint: clinicalAiContextFingerprint(hook.result.current.buildAiContext()),
    recordDraft: { presentIllness: 'AI 生成的现病史' }, ...patch,
  })
  return { ...hook, ...callbacks, props, request }
}

describe('clinical AI adoption boundary', () => {
  it('adopts a request once and only undoes adopted fields, retaining diagnoses and other edits', () => {
    const h = setup()
    const aiDraft = h.request({ diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' }] })
    h.rerender({ ...h.props, aiDraft })
    expect(h.result.current.form.getValues('presentIllness')).toBe('AI 生成的现病史')
    expect(h.onAiDraftConsumed).toHaveBeenCalledTimes(1)
    h.rerender({ ...h.props, aiDraft })
    expect(h.onAiDraftConsumed).toHaveBeenCalledTimes(1)
    act(() => h.result.current.form.setValue('physicalExam', '医生补充查体'))
    expect(h.result.current.canUndoAiRecord).toBe(true)
    act(() => h.result.current.undoAiRecord())
    expect(h.result.current.form.getValues()).toMatchObject({ presentIllness: '', physicalExam: '医生补充查体' })
    expect(h.result.current.diagnoses).toEqual([expect.objectContaining({ code: 'I10', type: 'PRIMARY' })])
    expect(h.result.current.canUndoAiRecord).toBe(false)
  })

  it.each(['patient', 'version', 'structured', 'busy'] as const)('rejects a request after %s context changes', (change) => {
    const h = setup()
    const aiDraft = h.request(change === 'patient' ? { residentId: 'another-patient' } : {})
    const context = { ...h.props.context }
    if (change === 'version') context.document = { ...document, currentVersion: 2 }
    if (change === 'structured') context.structuredValues = { symptom: '新信息' }
    h.rerender({ aiDraft, context, businessBusy: change === 'busy' })
    expect(h.result.current.form.getValues()).toEqual(original)
    expect(h.onAiDraftConsumed).toHaveBeenCalledTimes(1)
    expect(h.onNotice).toHaveBeenCalledWith(expect.stringContaining('拒绝'))
    expect(h.onPlan).not.toHaveBeenCalled()
  })

  it.each(['edited', 'saved', 'signed', 'busy'] as const)('protects undo when the record is %s', (change) => {
    const h = setup()
    h.rerender({ ...h.props, aiDraft: h.request() })
    const context = { ...h.props.context }
    if (change === 'edited') act(() => h.result.current.form.setValue('presentIllness', '医生再次修改'))
    if (change === 'saved') context.document = { ...document, currentVersion: 2 }
    if (change === 'signed') context.document = { ...document, status: 'SIGNED' }
    h.rerender({ aiDraft: null, context, businessBusy: change === 'busy' })
    expect(h.result.current.canUndoAiRecord).toBe(false)
    const before = h.result.current.form.getValues()
    act(() => h.result.current.undoAiRecord())
    expect(h.result.current.form.getValues()).toEqual(before)
  })

  it('publishes form changes and clears the AI context on unmount', () => {
    const h = setup()
    act(() => h.result.current.form.setValue('chiefComplaint', '新的主诉'))
    expect(h.onAiContextChange).toHaveBeenLastCalledWith(expect.objectContaining({ chiefComplaint: '新的主诉' }))
    h.unmount()
    expect(h.onAiContextChange).toHaveBeenLastCalledWith(null)
  })
})
