import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from './httpClient'
import { createPharmacyApi } from './pharmacyApi'

describe('pharmacy ward supply api', () => {
  it('uses the rolling supply list, create, detail, intake and batch reservation contracts', async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createPharmacyApi({ request } as unknown as ApiClient)
    const query = {
      stockSiteId: 'site 1', nursingUnitDepartmentId: 'ward/1', businessDate: '2026-08-31', shiftCode: 'DAY' as const,
    }

    await api.wardSupplyBatches(query)
    await api.createWardSupplyBatch({ ...query, commandCode: 'WARD-SUPPLY-001' })
    await api.wardSupplyBatch('batch/1')
    await api.intakeWardSupplyBatch('batch/1', {
      lines: [{ lineId: 'line-1', stockItemId: 'stock-item-1' }], description: '滚动供药批量接方',
    })
    await api.reviewAndReserveWardSupplyBatch('batch/1', {
      pharmacistPractitionerId: 'practitioner-1', reviewerAssignmentId: 'assignment-1',
      expiryMinutes: 30, description: '批量审方并预留',
    })
    await api.completePickingWardSupplyBatch('batch/1', {
      pickerPractitionerId: 'practitioner-1', pickerAssignmentId: 'assignment-1',
      description: '整批配药复核',
    })
    await api.dispenseDeliverWardSupplyBatch('batch/1', {
      dispenserPractitionerId: 'practitioner-1', dispenserAssignmentId: 'assignment-1',
      description: '整批发药配送',
    })
    await api.intakeWardSupplyLine('line/1', { stockItemId: 'stock-item-1', description: '滚动供药逐行接方' })

    expect(request).toHaveBeenNthCalledWith(1,
      '/api/pharmacy/ward-supply-batches?stockSiteId=site+1&nursingUnitDepartmentId=ward%2F1&businessDate=2026-08-31&shiftCode=DAY')
    expect(request).toHaveBeenNthCalledWith(2, '/api/pharmacy/ward-supply-batches', {
      method: 'POST', body: JSON.stringify({ ...query, commandCode: 'WARD-SUPPLY-001' }),
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/pharmacy/ward-supply-batches/batch%2F1')
    expect(request).toHaveBeenNthCalledWith(4, '/api/pharmacy/ward-supply-batches/batch%2F1/intake', {
      method: 'POST', body: JSON.stringify({
        lines: [{ lineId: 'line-1', stockItemId: 'stock-item-1' }], description: '滚动供药批量接方',
      }),
    })
    expect(request).toHaveBeenNthCalledWith(5, '/api/pharmacy/ward-supply-batches/batch%2F1/review-reserve', {
      method: 'POST', body: JSON.stringify({ pharmacistPractitionerId: 'practitioner-1',
        reviewerAssignmentId: 'assignment-1', expiryMinutes: 30, description: '批量审方并预留' }),
    })
    expect(request).toHaveBeenNthCalledWith(6, '/api/pharmacy/ward-supply-batches/batch%2F1/picking/complete', {
      method: 'POST', body: JSON.stringify({ pickerPractitionerId: 'practitioner-1',
        pickerAssignmentId: 'assignment-1', description: '整批配药复核' }),
    })
    expect(request).toHaveBeenNthCalledWith(7, '/api/pharmacy/ward-supply-batches/batch%2F1/dispense-deliveries', {
      method: 'POST', body: JSON.stringify({ dispenserPractitionerId: 'practitioner-1',
        dispenserAssignmentId: 'assignment-1', description: '整批发药配送' }),
    })
    expect(request).toHaveBeenNthCalledWith(8, '/api/pharmacy/ward-supply-lines/line%2F1/intake', {
      method: 'POST', body: JSON.stringify({ stockItemId: 'stock-item-1', description: '滚动供药逐行接方' }),
    })
  })
})
