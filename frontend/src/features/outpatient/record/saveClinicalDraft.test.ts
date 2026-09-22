import { describe, expect, it, vi } from 'vitest'
import type { ClinicalRecordInput } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import { createClinicalDraftSaver } from './saveClinicalDraft'

describe('clinical draft save coordination', () => {
  const content: Omit<ClinicalRecordInput, 'commandCode'> = {
    chiefComplaint: '复诊', diagnoses: [{ code: 'I10', display: '高血压', type: 'PRIMARY' }],
  }
  const medication = { id: 'draft-1', categoryCode: 'WESTERN', request: {
    medicationId: 'med-1', quantity: 1,
  } } as MedicationPlanDraft
  const setup = () => {
    const events: string[] = []
    const api = { encounters: {
      recordClinicalData: vi.fn(async () => { events.push('record'); return { id: 'enc-1' } as Encounter }),
      prescriptions: vi.fn(async () => { events.push('prescriptions'); return [] }),
      batchOrderPrescriptions: vi.fn(async () => { events.push('medications'); return [] }),
      createPrescription: vi.fn(), createMedicationRequest: vi.fn(),
      createServiceRequest: vi.fn(async () => { events.push('service'); return {} as never }),
    } }
    const newCommand = vi.fn((id: string): string => `${id}-command-${newCommand.mock.calls.length}`)
    return { api, events, newCommand, saver: createClinicalDraftSaver(newCommand) }
  }
  const draft = { encounterId: 'enc-1', content, medicationDrafts: [medication], serviceDrafts: [] }

  it('saves the record before prescriptions, and skips order queries for a record-only draft', async () => {
    const { saver, api, events } = setup()
    await saver.save(api, draft)
    expect(events).toEqual(['record', 'prescriptions', 'medications'])
    events.length = 0
    await saver.save(api, { ...draft, medicationDrafts: [] })
    expect(events).toEqual(['record'])
  })

  it('reuses the record command after order failure and renews it after full success', async () => {
    const { saver, api, newCommand } = setup()
    api.encounters.batchOrderPrescriptions.mockRejectedValueOnce(new Error('order failed'))
    await expect(saver.save(api, draft)).rejects.toThrow('order failed')
    await saver.save(api, draft)
    expect(newCommand).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(api.encounters.recordClinicalData).mock.calls as unknown as [string, ClinicalRecordInput][]
    expect(calls[0][1].commandCode).toBe(calls[1][1].commandCode)
    await saver.save(api, draft)
    expect(newCommand).toHaveBeenCalledTimes(2)
  })

  it('changes the command when the record or encounter changes after failure', async () => {
    const { saver, api, newCommand } = setup()
    api.encounters.recordClinicalData.mockRejectedValue(new Error('record failed'))
    await expect(saver.save(api, draft)).rejects.toThrow()
    await expect(saver.save(api, { ...draft, content: { ...content, chiefComplaint: '内容已修改' } })).rejects.toThrow()
    await expect(saver.save(api, { ...draft, encounterId: 'enc-2' })).rejects.toThrow()
    expect(newCommand).toHaveBeenCalledTimes(3)
    expect(api.encounters.batchOrderPrescriptions).not.toHaveBeenCalled()
  })
})
