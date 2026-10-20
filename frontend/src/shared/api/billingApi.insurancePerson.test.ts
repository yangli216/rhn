import { describe, expect, it, vi } from 'vitest'
import { createBillingApi } from './billingApi'
import type { ApiClient } from './httpClient'

describe('billing api: insurance person (1101)', () => {
  it('translates the UI fields to the backend contract and back', async () => {
    const request = vi.fn().mockResolvedValue({
      personNo: 'PSN-TEST-310', certType: '06', certNo: 'TEST-310', personName: '测试', gender: '1', birthday: '1988-01-01',
      insuranceType: '310', insuranceTypeName: '职工基本医疗保险', accountBalance: 1850, regionCode: '360100',
      personCategory: '11', status: 'NORMAL',
    })
    const api = createBillingApi({ request } as unknown as ApiClient)
    const person = await api.queryInsurancePerson({ psnCertType: '06', certno: 'TEST-310', psnName: '测试' })
    expect(request).toHaveBeenCalledWith('/api/billing/insurance/person-info', {
      method: 'POST', body: JSON.stringify({ certType: '06', certNo: 'TEST-310', personName: '测试' }),
    })
    expect(person).toMatchObject({ psnNo: 'PSN-TEST-310', psnName: '测试', insutype: '310', insutypeName: '职工基本医疗保险',
      balc: 1850, insuOptins: '360100', psnType: '11', status: 'NORMAL' })
  })

  it('treats a missing personal account balance as zero', async () => {
    const request = vi.fn().mockResolvedValue({ personNo: 'P', certType: '02', certNo: 'T', personName: 'n',
      insuranceType: '390', insuranceTypeName: '居民', regionCode: '360100' })
    const api = createBillingApi({ request } as unknown as ApiClient)
    expect((await api.queryInsurancePerson({ psnCertType: '02', certno: 'T' })).balc).toBe(0)
  })
})
