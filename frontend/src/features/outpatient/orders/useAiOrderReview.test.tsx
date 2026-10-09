import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import { useAiOrderReview } from './useAiOrderReview'

function setup(pricePatch: Record<string, unknown> = {}, recommendationPatch: Partial<ClinicalAiTreatmentRecommendation> = {}) {
  let resolve!: (value: unknown) => void
  const catalog = new Promise((done) => { resolve = done })
  const searchServices = vi.fn(() => catalog)
  const encounter: Encounter = { id: 'enc-1', residentId: 'resident-1', encounterNo: 'E1',
    organizationId: 'org-1', departmentId: 'dept-1', status: 'IN_PROGRESS', diagnoses: [], registeredAt: '' }
  const props: Parameters<typeof useAiOrderReview>[0] = {
    encounter, busy: false, readOnly: false,
    aiOrderReview: { id: 'review-1', encounterId: encounter.id, items: [
      { type: 'LABORATORY', catalogItemId: 'lab-1', code: 'LAB', name: '血常规', rationale: '模型生成的推荐理由', ...recommendationPatch },
    ], onCompleted: vi.fn() },
    api: { masterData: { searchServices }, organization: { department: vi.fn(async (id: string) => ({
      department: { id, organizationId: 'org-1', name: id === 'dept-2' ? '检验中心' : '检验科',
        sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null },
    })) } } as unknown as RhnApi,
    medicationDrafts: [], serviceDrafts: [], medications: [], services: [], allergies: [],
    onAiOrderReviewConsumed: vi.fn(), onAiOrdersPrepared: vi.fn(),
    setMedicationDrafts: vi.fn(), setServiceDrafts: vi.fn(), setValidationError: vi.fn(), setSuccessToast: vi.fn(),
  }
  const complete = async () => act(async () => {
    resolve({ content: [{ id: 'lab-1', code: 'LAB', name: '血常规', sdServiceType: 'LABORATORY',
      sdStatus: 'ACTIVE', orderable: true, chargeable: true, unitCode: '次', validFrom: '2020-01-01', sdUsageType: 'OUTPATIENT', prices: [{ id: 'service-price', organizationId: 'org-1', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 12.5, currencyCode: 'CNY', validFrom: '2020-01-01', ...pricePatch }],
      organizationAdoption: { organizationId: 'org-1', defaultDepartmentId: 'dept-1', sdStatus: 'ACTIVE', orderable: true, executable: true, chargeable: true, validFrom: '2020-01-01' },
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

  it('does not turn an AI recommendation rationale into a service clinical description', async () => {
    const { props, complete } = setup()
    renderHook(useAiOrderReview, { initialProps: props })
    await complete()
    const update = vi.mocked(props.setServiceDrafts).mock.calls[0][0]
    expect(typeof update).toBe('function')
    if (typeof update === 'function') {
      expect(update([])[0].clinicalDescription).toBeUndefined()
    }
  })

  it('keeps an explicitly edited service clinical description', async () => {
    const { props, complete } = setup({}, { orderDraft: { quantity: 1, instruction: '空腹采血' } })
    renderHook(useAiOrderReview, { initialProps: props })
    await complete()
    const update = vi.mocked(props.setServiceDrafts).mock.calls[0][0]
    expect(typeof update).toBe('function')
    if (typeof update === 'function') {
      expect(update([])[0].clinicalDescription).toBe('空腹采血')
    }
  })

  it.each([undefined, 'dept-2'])('revalidates and preserves the default or edited execution department: %s', async id => {
    const { props, complete } = setup({}, id ? { orderDraft: {
      quantity: 1, performerOrganizationId: 'org-1', performerDepartmentId: id,
    } } : {})
    renderHook(useAiOrderReview, { initialProps: props })
    await complete()
    expect(props.api.organization.department).toHaveBeenCalledWith(id || 'dept-1')
    const update = vi.mocked(props.setServiceDrafts).mock.calls[0][0]
    if (typeof update === 'function') expect(update([])[0]).toMatchObject({
      performerOrganizationId: 'org-1', performerDepartmentId: id || 'dept-1',
      performerDepartmentName: id ? '检验中心' : '检验科',
    })
  })

  it('rejects an inactive execution department instead of silently replacing the physician selection', async () => {
    const { props, complete } = setup({}, { orderDraft: { quantity: 1, performerDepartmentId: 'inactive' } })
    vi.mocked(props.api.organization.department).mockResolvedValue({ department: {
      id: 'inactive', organizationId: 'org-1', name: '停用检验科', sdOrgStatus: 'INACTIVE',
      validFrom: '2020-01-01', validTo: null,
    } } as never)
    renderHook(useAiOrderReview, { initialProps: props })
    await complete()
    expect(props.setServiceDrafts).not.toHaveBeenCalled()
    expect(props.onAiOrdersPrepared).not.toHaveBeenCalled()
    expect(props.setValidationError).toHaveBeenCalled()
  })
  it.each([{ sdStatus: 'INACTIVE' }, { validTo: '2020-01-01' }, { currencyCode: undefined }])(
    'does not confirm an AI service with unavailable pricing: %j', async patch => {
      const { props, complete } = setup(patch)
      renderHook(useAiOrderReview, { initialProps: props })
      await complete()
      expect(props.setServiceDrafts).not.toHaveBeenCalled()
      expect(props.aiOrderReview?.onCompleted).not.toHaveBeenCalled()
      expect(props.setValidationError).toHaveBeenCalledWith(expect.stringMatching(/价格/))
    })

})
