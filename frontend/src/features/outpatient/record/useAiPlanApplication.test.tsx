import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { clinicalAiContextFingerprint, type ClinicalAiDraftRequest } from '../ai/aiDraftAdapter'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { templateCatalogFixture } from '../templates/resolveTemplateOrders.testFixtures'
import { aiContextFromDraft } from './clinicalAiDraftContext'
import type { RecordForm } from './clinicalRecordDraft'
import type { AiRecordUndo } from './useClinicalAiDraft'
import { useAiPlanApplication } from './useAiPlanApplication'

function setup() {
  const f = templateCatalogFixture(), onNotice = vi.fn()
  f.plan.diagnoses = [{ code: 'I10', display: '高血压', type: 'PRIMARY' }]
  const props = { api: f.api, blocked: false, encounter: f.target, allergyReady: true }
  const hook = renderHook((input: typeof props) => {
    const form = useForm<RecordForm>({ defaultValues: { chiefComplaint: '原主诉', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '' } })
    form.watch()
    const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
    const [medications, setMedications] = useState<MedicationPlanDraft[]>([])
    const [services, setServices] = useState<ServicePlanDraft[]>([])
    const [undo, setUndo] = useState<AiRecordUndo | null>(null)
    const readContext = () => aiContextFromDraft(form.getValues(), diagnoses, input.encounter, {
      documentStatus: 'DRAFT', structuredFormId: '', structuredValues: {}, medicationDrafts: medications,
      serviceDrafts: services, allergies: [], allergyState: input.allergyReady ? 'READY' : 'LOADING', busy: input.blocked,
    })
    const prepare = useAiPlanApplication({ ...input, form, readContext, allergies: [], diagnoses, setDiagnoses,
      medications, setMedications, services, setServices, setUndo, onNotice })
    return { prepare, form, readContext, diagnoses, medications, services, undo }
  }, { initialProps: props })
  const request = (): ClinicalAiDraftRequest => ({ requestId: 'request', sourceSuggestionId: 'suggestion',
    encounterId: f.target.id, residentId: f.target.residentId, sourceLabel: '测试方案', planTemplate: f.plan,
    recordDraft: { presentIllness: '明确的建议内容' }, contextFingerprint: clinicalAiContextFingerprint(hook.result.current.readContext()) })
  return { ...hook, f, props, request, onNotice }
}

describe('AI plan resolves all facts before one local commit', () => {
  it('stages nothing during preparation, then adopts record, diagnoses and current orders exactly once', async () => {
    const h = setup()
    const commit = await h.result.current.prepare(h.request())
    expect(h.result.current.form.getValues('presentIllness')).toBe('')
    expect(h.result.current.medications).toEqual([])
    expect(h.onNotice).not.toHaveBeenCalled()
    act(commit)
    expect(h.result.current.form.getValues('presentIllness')).toBe('明确的建议内容')
    expect(h.result.current.diagnoses).toEqual([expect.objectContaining({ code: 'I10' })])
    expect(h.result.current.medications[0]).toMatchObject({ medicationName: '当前测试药', unitPrice: 2.5, stockSiteId: 'pharmacy' })
    expect(h.result.current.services[0]).toMatchObject({ unitPrice: 3, performerDepartmentName: '检验中心二部' })
    expect(h.result.current.undo?.before.presentIllness).toBe('')
    expect(() => act(commit)).toThrow(/本次未带入/)
    expect(h.onNotice).toHaveBeenCalledTimes(1)
  })
  it('preserves explicit physician allergy acknowledgement and override without inventing either', async () => {
    const h = setup(), request = h.request()
    request.allergyReviewConfirmed = true; request.allergyOverrideReason = '医生明确理由'
    const commit = await h.result.current.prepare(request)
    act(commit)
    expect(h.result.current.medications[0].request).toMatchObject({ allergyReviewConfirmed: true, allergyOverrideReason: '医生明确理由' })
  })
  it.each(['price', 'department', 'split', 'stock'])('leaves every draft unchanged when %s verification fails', async failure => {
    const h = setup()
    if (failure === 'price') h.f.medication.products[0].prices = []
    if (failure === 'department') vi.mocked(h.f.api.organization.department).mockRejectedValue(new Error('科室不可访问'))
    if (failure === 'split') h.f.autoSplitPreview.mockResolvedValue([])
    if (failure === 'stock') h.f.medication.availableBaseQuantity = 0
    await expect(h.result.current.prepare(h.request())).rejects.toThrow()
    expect(h.result.current.form.getValues('presentIllness')).toBe('')
    expect(h.result.current.diagnoses).toEqual([])
    expect(h.result.current.medications).toEqual([])
    expect(h.result.current.services).toEqual([])
    expect(h.result.current.undo).toBeNull()
    expect(h.onNotice).not.toHaveBeenCalled()
  })
  it.each(['record', 'record-back', 'patient', 'scope', 'api', 'allergy', 'busy', 'unmount'])(
    'rejects a prepared commit after %s changes, including audit-call latency', async change => {
      const h = setup(), commit = await h.result.current.prepare(h.request())
      if (change === 'record' || change === 'record-back') act(() => {
        h.result.current.form.setValue('chiefComplaint', '医生新输入')
        if (change === 'record-back') h.result.current.form.setValue('chiefComplaint', '原主诉')
      })
      if (change === 'patient') h.rerender({ ...h.props, encounter: { ...h.f.target, residentId: 'other' } })
      if (change === 'scope') h.rerender({ ...h.props, encounter: { ...h.f.target, departmentId: 'other' } })
      if (change === 'api') h.rerender({ ...h.props, api: { ...h.f.api } as RhnApi })
      if (change === 'allergy') h.rerender({ ...h.props, allergyReady: false })
      if (change === 'busy') h.rerender({ ...h.props, blocked: true })
      if (change === 'unmount') h.unmount()
      expect(() => act(commit)).toThrow(/本次未带入/)
      expect(h.result.current.form.getValues('presentIllness')).toBe('')
      expect(h.result.current.medications).toEqual([])
      expect(h.result.current.services).toEqual([])
      expect(h.onNotice).not.toHaveBeenCalled()
    })
  it('rejects late catalog resolution after a manual record change', async () => {
    const h = setup()
    let complete!: (value: unknown) => void
    h.f.medications.mockImplementation(() => new Promise(done => { complete = done }))
    const work = h.result.current.prepare(h.request())
    const rejected = expect(work).rejects.toThrow(/本次未带入/)
    await act(async () => { await Promise.resolve() })
    act(() => h.result.current.form.setValue('chiefComplaint', '核对期间修改'))
    await act(async () => { complete([h.f.medication]); await rejected })
    expect(h.result.current.medications).toEqual([])
    expect(h.result.current.diagnoses).toEqual([])
  })
  it('rejects duplicate selected orders before modifying the record', async () => {
    const h = setup(), first = await h.result.current.prepare(h.request())
    act(first)
    const next = h.request(); next.recordDraft = { physicalExam: '不应带入的查体' }
    await expect(h.result.current.prepare(next)).rejects.toThrow(/重复/)
    expect(h.result.current.form.getValues('physicalExam')).toBe('')
    expect(h.result.current.medications).toHaveLength(1)
  })
})
