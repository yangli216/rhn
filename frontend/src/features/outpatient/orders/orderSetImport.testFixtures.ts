import { orderDraftReceipt } from './orderDraftSave.testFixtures'
import { vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ItemGroup } from '../../../shared/api/masterDataApi'

export function groupFixture() {
  return { id: 'group', revision: 2, code: 'GROUP', name: '检查组套', groupType: 'ORDER_SET',
    status: 'ACTIVE', organizationId: 'org', executionDepartmentId: 'lab-dept', usageType: 'OUTPATIENT',
    validFrom: '2020-01-01', validTo: null, members: [
      { id: 'm1', catalogItemId: 's1', itemCode: 'S1', itemName: '旧项目名称', serviceType: 'LABORATORY',
        quantity: 2, unitCode: null, sortOrder: 0, requiredMember: true, memberDescription: null },
      { id: 'm2', catalogItemId: 's2', itemCode: 'S2', itemName: '检查项目', serviceType: 'EXAMINATION',
        quantity: 1, unitCode: '次', sortOrder: 1, requiredMember: false, memberDescription: '明确的临床说明' },
    ] } as unknown as ItemGroup
}
export function groupApi(group = groupFixture()) {
  const department = { id: 'lab-dept', organizationId: 'org', name: '检验中心二部', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null }
  const services = group.members.map(member => ({ id: member.catalogItemId, code: member.itemCode,
    name: `${member.itemCode}当前目录名称`, sdServiceType: member.serviceType, unitCode: '次',
    sdUsageType: 'OUTPATIENT', sdStatus: 'ACTIVE', orderable: true, chargeable: true, validFrom: '2020-01-01',
    organizationAdoption: { organizationId: 'org', sdStatus: 'ACTIVE', orderable: true, chargeable: true, validFrom: '2020-01-01' },
    prices: [{ id: `${member.id}-price`, organizationId: 'org', sdStatus: 'ACTIVE', sdPriceType: 'SALE', price: 3, currencyCode: 'USD', validFrom: '2020-01-01' }],
  }))
  const api = { masterData: {
    itemGroups: vi.fn().mockResolvedValue([group]),
    searchServices: vi.fn().mockImplementation(async (code: string) => ({ content: services.filter(service => service.code === code) })),
  }, organization: { department: vi.fn().mockResolvedValue({ department }) },
  encounters: { saveOrderDrafts: vi.fn().mockImplementation(async (id, input) => orderDraftReceipt(id, input)) } } satisfies { [K in keyof RhnApi]?: Partial<RhnApi[K]> } as unknown as RhnApi
  return { api, services, department }
}
