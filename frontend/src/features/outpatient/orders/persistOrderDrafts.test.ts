import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from './medicationDraft'
import type { ServicePlanDraft } from './orderDraftTypes'
import { orderDraftReceipt } from './orderDraftSave.testFixtures'
import { persistOrderDrafts, type OrderDraftApi } from './persistOrderDrafts'

const med = { id: 'm', categoryCode: 'WESTERN', request: { medicationId: 'drug', catalogItemId: 'product', packageId: 'box', quantity: 2, doseValue: 5, medicationInstruction: '餐后服用' } } as MedicationPlanDraft
const service = { id: 's', catalogItemId: 'lab', quantity: 1, performerOrganizationId: 'org', performerDepartmentId: 'lab-dept' } as ServicePlanDraft
function setup() {
  return { encounters: { saveOrderDrafts: vi.fn(async (...args: Parameters<typeof orderDraftReceipt>) => orderDraftReceipt(...args)),
    batchOrderPrescriptions: vi.fn(), createPrescription: vi.fn(), createMedicationRequest: vi.fn(), createServiceRequest: vi.fn() } }
}
afterEach(() => vi.restoreAllMocks())
describe('atomic order draft save', () => {
  it('never falls back to per-line writes when the endpoint is missing', async () => {
    const api = setup()
    Object.assign(api.encounters, { saveOrderDrafts: undefined })
    await expect(persistOrderDrafts('e', [med], [service], api as OrderDraftApi, 'command')).rejects.toThrow('整批保存接口不可用')
    expect(api.encounters.batchOrderPrescriptions).not.toHaveBeenCalled()
    expect(api.encounters.createPrescription).not.toHaveBeenCalled()
    expect(api.encounters.createMedicationRequest).not.toHaveBeenCalled()
    expect(api.encounters.createServiceRequest).not.toHaveBeenCalled()
  })
  it('does not attempt any alternate write after a server error', async () => {
    const api = setup()
    api.encounters.saveOrderDrafts.mockRejectedValue(new Error('服务异常'))
    await expect(persistOrderDrafts('e', [med], [service], api, 'command')).rejects.toThrow('服务异常')
    expect(api.encounters.createServiceRequest).not.toHaveBeenCalled()
    expect(api.encounters.batchOrderPrescriptions).not.toHaveBeenCalled()
  })
  it.each(['empty', 'command', 'encounter', 'missingMed', 'duplicateMed', 'wrongProduct', 'wrongQuantity',
    'missingService', 'wrongDepartment', 'cancelled', 'missingRevision', 'wrongDose', 'wrongInstruction'])('rejects unconfirmed receipts: %s', async defect => {
    const api = setup()
    api.encounters.saveOrderDrafts.mockImplementationOnce(async (id, input) => {
      const receipt = orderDraftReceipt(id, input)
      if (defect === 'empty') return undefined as never
      if (defect === 'command') receipt.commandCode = 'other'
      if (defect === 'encounter') receipt.encounterId = 'other'
      if (defect === 'missingMed') receipt.prescriptions = []
      if (defect === 'duplicateMed') receipt.prescriptions.push(receipt.prescriptions[0])
      if (defect === 'wrongProduct') receipt.prescriptions[0].medicationRequests[0].catalogItemId = 'other'
      if (defect === 'wrongDose') receipt.prescriptions[0].medicationRequests[0].doseValue = 10
      if (defect === 'wrongInstruction') receipt.prescriptions[0].medicationRequests[0].medicationInstruction = ''
      if (defect === 'wrongQuantity') receipt.prescriptions[0].medicationRequests[0].quantity = 9
      if (defect === 'missingService') receipt.services = []
      if (defect === 'wrongDepartment') receipt.services[0].performerDepartmentId = 'other'
      if (defect === 'cancelled') receipt.services[0].status = 'CANCELLED'
      if (defect === 'missingRevision') delete (receipt.services[0] as Partial<typeof receipt.services[0]>).revision
      return receipt
    })
    await expect(persistOrderDrafts('e', [med], [service], api, 'command')).rejects.toThrow('回执未确认')
    expect(med.request.quantity).toBe(2)
  })
  it('sends one real HTTP request for medications and services with the same command', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toBe('/api/encounters/e/order-drafts')
      expect(init?.method).toBe('POST')
      const input = JSON.parse(String(init?.body))
      expect(input.commandCode).toBe('command')
      expect(input.medicationItems[0].catalogItemId).toBe('product')
      expect(input.serviceItems[0].performerDepartmentId).toBe('lab-dept')
      return new Response(JSON.stringify(orderDraftReceipt('e', input)))
    })
    await persistOrderDrafts('e', [med], [service], createRhnSessionApi('tenant'), 'command')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('explains a changed request after a prior commit without making a new write', async () => {
    const api = setup()
    api.encounters.saveOrderDrafts.mockRejectedValue({ code: 'IDEMPOTENCY_KEY_REUSED', message: '幂等键已用于不同请求' })
    await expect(persistOrderDrafts('e', [med], [service], api, 'command')).rejects.toThrow('请先核对已保存医嘱')
    expect(api.encounters.saveOrderDrafts).toHaveBeenCalledTimes(1)
    expect(api.encounters.createServiceRequest).not.toHaveBeenCalled()
  })
  it('skips requests for an empty draft', async () => {
    const api = setup()
    await persistOrderDrafts('e', [], [], api, 'command')
    expect(api.encounters.saveOrderDrafts).not.toHaveBeenCalled()
  })
})
