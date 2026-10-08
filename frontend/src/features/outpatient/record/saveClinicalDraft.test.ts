import { describe, expect, it, vi } from 'vitest'
import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import { orderDraftReceipt } from '../orders/orderDraftSave.testFixtures'
import { createClinicalDraftSaver } from './saveClinicalDraft'
import { clinicalRecordSaveFixture } from './clinicalRecordSave.testFixtures'

const content: Omit<ClinicalRecordInput, 'commandCode'> = {
  chiefComplaint: '复诊', diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' }],
}
const medication = { id: 'draft-1', categoryCode: 'WESTERN', request: { medicationId: 'med-1', quantity: 1 } } as MedicationPlanDraft
const base = { id: 'enc-1', residentId: 'resident-1', organizationId: 'org-1', departmentId: 'dept-1', status: 'IN_PROGRESS' } as Encounter
const draft = { encounterId: 'enc-1', residentId: 'resident-1', organizationId: 'org-1', departmentId: 'dept-1',
  content, medicationDrafts: [medication], serviceDrafts: [] }
function setup() {
  const events: string[] = []
  let saved = clinicalRecordSaveFixture(base, content)
  const api = { encounters: {
    recordClinicalData: vi.fn(async (_id: string, input: ClinicalRecordInput) => {
      events.push('record'); saved = clinicalRecordSaveFixture(base, input); return saved.encounter
    }),
    saveOrderDrafts: vi.fn(async (...args: Parameters<typeof orderDraftReceipt>) => { events.push('orders'); return orderDraftReceipt(...args) }),
  }, clinicalDocuments: { byEncounter: vi.fn(async () => { events.push('verify-document'); return [saved.document] }) } }
  const newCommand = vi.fn((id: string): string => `${id}-command-${newCommand.mock.calls.length}`)
  const coordinator = createClinicalDraftSaver(newCommand)
  const saver = { save: async (target: typeof api, value: Parameters<typeof coordinator.save>[1], check: () => void = () => {}) => {
    const saved = await coordinator.save(target, value, check)
    saved.confirmApplied()
    return saved
  } }
  return { api, events, newCommand, saver, coordinator }
}

describe('clinical draft save coordination', () => {
  it('saves the record before the single order transaction, and skips it for a record-only draft', async () => {
    const { saver, api, events } = setup()
    await saver.save(api, draft)
    expect(events).toEqual(['record', 'verify-document', 'orders'])
    events.length = 0
    await saver.save(api, { ...draft, medicationDrafts: [] })
    expect(events).toEqual(['record', 'verify-document'])
  })
  it('retains both command keys after an ambiguous save and renews them only after confirmed success', async () => {
    const { saver, api, newCommand } = setup()
    api.encounters.saveOrderDrafts.mockRejectedValueOnce(new Error('response lost'))
    await expect(saver.save(api, draft)).rejects.toThrow('response lost')
    await saver.save(api, draft)
    expect(newCommand).toHaveBeenCalledTimes(1)
    const calls = api.encounters.saveOrderDrafts.mock.calls
    expect(calls[0][1].commandCode).toBe(calls[1][1].commandCode)
    await saver.save(api, draft)
    expect(calls[2][1].commandCode).not.toBe(calls[1][1].commandCode)
    expect(newCommand).toHaveBeenCalledTimes(2)
  })
  it('keeps the order key after edits so the server can reject a changed request already committed', async () => {
    const { saver, api } = setup()
    api.encounters.saveOrderDrafts.mockRejectedValueOnce(new Error('response lost'))
    await expect(saver.save(api, draft)).rejects.toThrow()
    await saver.save(api, { ...draft, medicationDrafts: [{ ...medication, request: { ...medication.request, quantity: 2 } }] })
    const calls = api.encounters.saveOrderDrafts.mock.calls
    expect(calls[0][1].commandCode).toBe(calls[1][1].commandCode)
    expect(calls[1][1].medicationItems[0].quantity).toBe(2)
  })
  it('does not clear the retry command when the receipt omits a medication', async () => {
    const { saver, api } = setup()
    api.encounters.saveOrderDrafts.mockImplementationOnce(async (id, input) => ({ ...orderDraftReceipt(id, input), prescriptions: [] }))
    await expect(saver.save(api, draft)).rejects.toThrow('回执未确认')
    await saver.save(api, draft)
    expect(api.encounters.saveOrderDrafts.mock.calls[0][1].commandCode).toBe(api.encounters.saveOrderDrafts.mock.calls[1][1].commandCode)
    expect(draft.medicationDrafts).toHaveLength(1)
  })
  it('never submits orders after record failure or an unconfirmed record receipt', async () => {
    const { saver, api } = setup()
    api.encounters.recordClinicalData.mockRejectedValueOnce(new Error('record failed'))
    await expect(saver.save(api, draft)).rejects.toThrow('record failed')
    api.encounters.recordClinicalData.mockResolvedValueOnce({ id: 'other' } as Encounter)
    await expect(saver.save(api, draft)).rejects.toThrow('病历保存回执未确认')
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
  })
  it.each(['read-error', 'missing', 'different-text', 'different-vital', 'different-diagnosis'] as const)(
    'retains the draft and command when persisted document confirmation fails: %s', async failure => {
      const { saver, api, newCommand } = setup()
      if (failure === 'read-error') api.clinicalDocuments.byEncounter.mockRejectedValueOnce(new Error('network'))
      else {
        const note = clinicalRecordSaveFixture(base, content).document
        if (failure === 'different-text') note.content.chiefComplaint = '旧主诉'
        if (failure === 'different-vital') note.content.vitalSigns!.temperature = 38
        if (failure === 'different-diagnosis') note.content.diagnoses = []
        api.clinicalDocuments.byEncounter.mockResolvedValueOnce(failure === 'missing' ? [] : [note])
      }
      await expect(saver.save(api, draft)).rejects.toThrow('远端可能已保存')
      expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
      expect(draft.medicationDrafts).toHaveLength(1)
      const saved = await saver.save(api, draft)
      expect(newCommand).toHaveBeenCalledTimes(1)
      expect(api.encounters.recordClinicalData.mock.calls[0][1].commandCode)
        .toBe(api.encounters.recordClinicalData.mock.calls[1][1].commandCode)
      expect(saved.document.content.chiefComplaint).toBe('复诊')
      expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1)
    })
  it('renews the record command after an explicit coding-system edit and transmits the new identity', async () => {
    const { saver, api } = setup()
    const record = api.encounters.recordClinicalData.mockRejectedValueOnce(new Error('响应丢失'))
    const value = (system: string) => ({ ...draft, medicationDrafts: [], content: { ...content,
      diagnoses: content.diagnoses.map(item => ({ ...item, codeSystem: system })) } })
    await expect(saver.save(api, value('SYS_A'))).rejects.toThrow('响应丢失')
    await saver.save(api, value('SYS_B'))
    expect(record.mock.calls[0][1].commandCode).not.toBe(record.mock.calls[1][1].commandCode)
    expect(record.mock.calls[1][1].diagnoses[0].codeSystem).toBe('SYS_B')
  })
  it.each(['record', 'document', 'orders'] as const)('stops on a stale %s response without releasing retry commands', async stage => {
    const { saver, api, events } = setup()
    let active = true
    const check = () => { if (!active) throw new Error('旧草稿回执') }
    if (stage === 'record') api.encounters.recordClinicalData.mockImplementationOnce(async () => {
      active = false; return clinicalRecordSaveFixture(base, content).encounter
    })
    if (stage === 'document') api.clinicalDocuments.byEncounter.mockImplementationOnce(async () => {
      active = false; return [clinicalRecordSaveFixture(base, content).document]
    })
    if (stage === 'orders') api.encounters.saveOrderDrafts.mockImplementationOnce(async (...args) => {
      active = false; return orderDraftReceipt(...args)
    })
    await expect(saver.save(api, draft, check)).rejects.toThrow('旧草稿回执')
    if (stage !== 'orders') expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
    if (stage === 'record') expect(api.clinicalDocuments.byEncounter).not.toHaveBeenCalled()
    active = true
    await saver.save(api, draft, check)
    expect(api.encounters.recordClinicalData.mock.calls[0][1].commandCode).toBe(api.encounters.recordClinicalData.mock.calls[1][1].commandCode)
    if (stage === 'orders') expect(api.encounters.saveOrderDrafts.mock.calls[0][1].commandCode)
      .toBe(api.encounters.saveOrderDrafts.mock.calls[1][1].commandCode)
    expect(events).toContain('record')
  })
  it('retains both keys if the editor rejects a verified receipt before applying it', async () => {
    const { saver, coordinator, api } = setup()
    let active = true
    const receipt = await coordinator.save(api, draft, () => { if (!active) throw new Error('编辑器已变化') })
    active = false
    expect(receipt.confirmApplied).toThrow('编辑器已变化')
    active = true
    await saver.save(api, draft)
    expect(api.encounters.recordClinicalData.mock.calls[0][1].commandCode).toBe(api.encounters.recordClinicalData.mock.calls[1][1].commandCode)
    expect(api.encounters.saveOrderDrafts.mock.calls[0][1].commandCode).toBe(api.encounters.saveOrderDrafts.mock.calls[1][1].commandCode)
  })
  it('does not allow a new API session to resubmit an unresolved operation', async () => {
    const { saver, api } = setup()
    api.encounters.saveOrderDrafts.mockRejectedValueOnce(new Error('response lost'))
    await expect(saver.save(api, draft)).rejects.toThrow()
    await expect(saver.save({ ...api }, draft)).rejects.toThrow('原 API 会话仍有未确认的保存请求')
    expect(api.encounters.recordClinicalData).toHaveBeenCalledTimes(1)
    await saver.save(api, draft)
    expect(api.encounters.saveOrderDrafts.mock.calls[0][1].commandCode).toBe(api.encounters.saveOrderDrafts.mock.calls[1][1].commandCode)
  })
  it('uses one immutable request snapshot while later caller objects change', async () => {
    const { saver, api } = setup()
    const mutable = structuredClone(draft)
    const record = api.encounters.recordClinicalData.getMockImplementation()!
    api.encounters.recordClinicalData.mockImplementationOnce(async (id, input) => {
      mutable.medicationDrafts[0].request.quantity = 9
      mutable.content.chiefComplaint = '后来输入的主诉'
      return record(id, input)
    })
    await saver.save(api, mutable)
    expect(api.encounters.recordClinicalData.mock.calls[0][1].chiefComplaint).toBe('复诊')
    expect(api.encounters.saveOrderDrafts.mock.calls[0][1].medicationItems[0].quantity).toBe(1)
    expect(mutable.content.chiefComplaint).toBe('后来输入的主诉')
  })
  it('rejects duplicate in-flight saves without disturbing the first operation', async () => {
    const { saver, api } = setup()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const record = api.encounters.recordClinicalData.getMockImplementation()!
    api.encounters.recordClinicalData.mockImplementationOnce(async (id, input) => { await gate; return record(id, input) })
    const first = saver.save(api, draft)
    await expect(saver.save(api, draft)).rejects.toThrow('草稿正在保存')
    release()
    await first
    expect(api.encounters.recordClinicalData).toHaveBeenCalledTimes(1)
    expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1)
  })
})
