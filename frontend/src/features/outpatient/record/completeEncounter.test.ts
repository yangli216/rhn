import { describe, expect, it, vi } from 'vitest'
import type { Encounter } from '../../../shared/model'
import type { CompleteEncounterInput } from '../../../shared/api/encountersApi'
import { completeEncounter } from './completeEncounter'

const encounter = { id: 'enc-1', residentId: 'resident-1', organizationId: 'org-1', departmentId: 'dept-1',
  encounterNo: 'ENC-1', status: 'IN_PROGRESS', registeredAt: '2026-10-04T00:00:00Z', startedAt: '2026-10-04T00:10:00Z' } as Encounter
const completed = { ...encounter, status: 'COMPLETED' as const, completedAt: '2026-10-04T00:20:00Z' }
const command: CompleteEncounterInput = { commandCode: 'complete-1', dispositionCode: 'HOME' }
function setup() {
  const api = { complete: vi.fn(async (_id: string, _input?: CompleteEncounterInput) => structuredClone(completed)),
    get: vi.fn(async (_id: string) => structuredClone(completed)) }
  return { api, assertCurrent: vi.fn() }
}

describe('confirmed encounter completion', () => {
  it('confirms the actual persisted completion after the command receipt', async () => {
    const { api, assertCurrent } = setup()
    expect(await completeEncounter(api, encounter, command, assertCurrent)).toEqual(completed)
    expect(api.get).toHaveBeenCalledWith('enc-1')
    expect(api.complete.mock.invocationCallOrder[0]).toBeLessThan(api.get.mock.invocationCallOrder[0])
  })
  it.each([
    ['missing', undefined], ['null', null], ['wrong-id', { ...completed, id: 'other' }],
    ['wrong-patient', { ...completed, residentId: 'other' }], ['wrong-organization', { ...completed, organizationId: 'other' }],
    ['wrong-department', { ...completed, departmentId: 'other' }], ['wrong-number', { ...completed, encounterNo: 'other' }],
    ['not-completed', encounter], ['missing-time', { ...completed, completedAt: undefined }],
    ['invalid-time', { ...completed, completedAt: 'unknown' }], ['backdated-time', { ...completed, completedAt: encounter.registeredAt }],
  ])('rejects a %s completion receipt before continuing', async (_name, receipt) => {
    const { api, assertCurrent } = setup()
    api.complete.mockResolvedValueOnce(receipt as typeof completed)
    await expect(completeEncounter(api, encounter, command, assertCurrent)).rejects.toThrow('诊毕结果未确认')
    expect(api.get).not.toHaveBeenCalled()
  })
  it.each(['missing', 'wrong-patient', 'not-completed', 'different-time', 'network'] as const)(
    'keeps completion unconfirmed when the saved state is %s', async problem => {
      const { api, assertCurrent } = setup()
      if (problem === 'network') api.get.mockRejectedValueOnce(new Error('读取中断'))
      else api.get.mockResolvedValueOnce((problem === 'missing' ? undefined
        : problem === 'wrong-patient' ? { ...completed, residentId: 'other' }
          : problem === 'not-completed' ? encounter : { ...completed, completedAt: '2026-10-04T00:21:00Z' }) as typeof completed)
      await expect(completeEncounter(api, encounter, command, assertCurrent)).rejects.toThrow('诊毕结果未确认')
      expect(await completeEncounter(api, encounter, command, assertCurrent)).toEqual(completed)
      expect(api.complete.mock.calls[0][1]).toEqual(api.complete.mock.calls[1][1])
    })
  it.each(['receipt', 'read'] as const)('rejects a late %s after context changes', async step => {
    const { api } = setup()
    let active = true
    if (step === 'receipt') api.complete.mockImplementationOnce(async () => { active = false; return completed })
    else api.get.mockImplementationOnce(async () => { active = false; return completed })
    await expect(completeEncounter(api, encounter, command, () => { if (!active) throw new Error('患者已变化') })).rejects.toThrow('患者已变化')
    if (step === 'receipt') expect(api.get).not.toHaveBeenCalled()
  })
})
