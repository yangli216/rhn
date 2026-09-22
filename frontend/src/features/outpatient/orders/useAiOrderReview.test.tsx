import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { useAiOrderReview } from './useAiOrderReview'

function setup() {
  let resolve!: (value: unknown) => void
  const catalog = new Promise((done) => { resolve = done })
  const searchServices = vi.fn(() => catalog)
  const encounter: Encounter = { id: 'enc-1', residentId: 'resident-1', encounterNo: 'E1',
    organizationId: 'org-1', departmentId: 'dept-1', status: 'IN_PROGRESS', diagnoses: [], registeredAt: '' }
  const props: Parameters<typeof useAiOrderReview>[0] = {
    encounter, busy: false, readOnly: false,
    aiOrderReview: { id: 'review-1', encounterId: encounter.id, items: [
      { type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB', name: '血常规', rationale: '' },
    ], onCompleted: vi.fn() },
    api: { masterData: { searchServices } } as unknown as RhnApi,
    medicationDrafts: [], serviceDrafts: [], medications: [], services: [], allergies: [],
    onAiOrderReviewConsumed: vi.fn(), onAiOrdersPrepared: vi.fn(),
    setMedicationDrafts: vi.fn(), setServiceDrafts: vi.fn(), setValidationError: vi.fn(), setSuccessToast: vi.fn(),
  }
  const complete = async () => act(async () => {
    resolve({ content: [{ id: 'lab-1', code: 'LAB', name: '血常规', sdServiceType: 'LABORATORY',
      sdStatus: 'ACTIVE', orderable: true, sdUsageType: 'OUTPATIENT', prices: [],
      organizationAdoption: { organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, executable: true },
    }] })
    await catalog
  })
  return { props, searchServices, complete }
}

describe('AI order review lifecycle', () => {
  it.each(['busy', 'readOnly', 'patient'] as const)('discards a late catalog result after %s changes', async (change) => {
    const { props, searchServices, complete } = setup()
    const view = renderHook(useAiOrderReview, { initialProps: props })
    expect(searchServices).toHaveBeenCalledTimes(1)
    view.rerender({ ...props,
      busy: change === 'busy', readOnly: change === 'readOnly',
      encounter: change === 'patient' ? { ...props.encounter, id: 'enc-2', residentId: 'resident-2' } : props.encounter,
    })
    await complete()
    expect(props.setServiceDrafts).not.toHaveBeenCalled()
    expect(props.setMedicationDrafts).not.toHaveBeenCalled()
    expect(props.aiOrderReview?.onCompleted).not.toHaveBeenCalled()
    expect(props.onAiOrdersPrepared).not.toHaveBeenCalled()
  })

  it('does not restart the command when draft state changes during catalog resolution', async () => {
    const { props, searchServices, complete } = setup()
    const view = renderHook(useAiOrderReview, { initialProps: props })
    view.rerender({ ...props, serviceDrafts: [{ id: 'manual', catalogItemId: 'other', itemCode: 'OTHER',
      itemName: '手工项目', quantity: 1 }] })
    await complete()
    expect(searchServices).toHaveBeenCalledTimes(1)
    expect(props.setServiceDrafts).toHaveBeenCalledTimes(1)
    expect(props.aiOrderReview?.onCompleted).toHaveBeenCalledWith(['LABORATORY:lab-1'])
    expect(props.onAiOrderReviewConsumed).toHaveBeenCalledTimes(1)
  })
})
