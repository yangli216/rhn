import { groupApi, groupFixture } from './orderSetImport.testFixtures'
import { describe, expect, it, vi } from 'vitest'
import { orderSetStaticIssue, resolveOrderSetImport, resolveOrderSetRows } from './orderSetImport'
import { persistOrderDrafts } from './persistOrderDrafts'

const encounter = { organizationId: 'org', departmentId: 'doctor-dept' }

describe('order-set import facts', () => {
  it('loads the fresh group, current catalog names, real prices and configured executing department', async () => {
    const selected = groupFixture(), { api } = groupApi()
    const result = await resolveOrderSetImport(selected, encounter, api)
    expect(api.masterData.itemGroups).toHaveBeenCalledWith('GROUP', 'ORDER_SET', '')
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts[0]).toMatchObject({ itemName: 'S1当前目录名称', serviceType: 'LABORATORY', quantity: 2, unitCode: '次',
      unitPrice: 3, currencyCode: 'USD', performerOrganizationId: 'org', performerDepartmentId: 'lab-dept', performerDepartmentName: '检验中心二部' })
    expect(result.drafts[0].clinicalDescription).toBeUndefined()
    expect(result.drafts[1].clinicalDescription).toBe('明确的临床说明')
    await persistOrderDrafts('enc', [], result.drafts, api, 'order-set-command')
    expect(api.encounters.saveOrderDrafts).toHaveBeenCalledWith('enc', expect.objectContaining({
      commandCode: 'order-set-command', serviceItems: expect.arrayContaining([expect.objectContaining({
        quantity: 2, unitCode: '次', performerOrganizationId: 'org', performerDepartmentId: 'lab-dept', clinicalDescription: undefined,
      })]),
    }))
  })
  it.each([{ quantity: undefined }, { quantity: 0 }, { quantity: -1 }, { quantity: '2' }, { quantity: Infinity },
    { serviceType: undefined }, { serviceType: 'MEDICATION' }, { unitCode: undefined }, { unitCode: '' },
    { requiredMember: undefined }, { catalogItemId: undefined }, { sortOrder: undefined }])('rejects incomplete member facts: %j', async patch => {
    const group = groupFixture(), { api } = groupApi(group)
    Object.assign(group.members[0], patch)
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow(/信息不完整/)
    expect(api.masterData.searchServices).not.toHaveBeenCalled()
  })
  it.each([{ status: 'INACTIVE' }, { usageType: 'INPATIENT' }, { organizationId: undefined },
    { validFrom: undefined }, { validTo: '' }, { members: [] }, { members: null }])('rejects incomplete or unavailable group facts: %j', async patch => {
    const group = groupFixture(), { api } = groupApi(group)
    Object.assign(group, patch)
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow()
  })
  it.each([{ organizationId: 'other' }, { validFrom: '2999-01-01' }, { validTo: '2020-01-01' }])('respects group scope and effective date: %j', async patch => {
    const group = groupFixture(), { api } = groupApi(group)
    Object.assign(group, patch)
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow(/不可用/)
  })
  it('requires reselection after a group version changes', async () => {
    const group = groupFixture(), selected = { ...group }, { api } = groupApi(group)
    group.revision += 1
    await expect(resolveOrderSetImport(selected, encounter, api)).rejects.toThrow(/组套已更新/)
  })
  it.each(['id', 'catalogItemId', 'sortOrder'] as const)('rejects duplicate %s identities', async field => {
    const group = groupFixture(), { api } = groupApi(group)
    Object.assign(group.members[1], { [field]: group.members[0][field] })
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow(/重复/)
  })
  it.each(['missing', 'price', 'type', 'unit'])('does not partially import when one member has a %s defect', async defect => {
    const group = groupFixture(), { api, services } = groupApi(group)
    if (defect === 'missing') services.pop()
    if (defect === 'price') services[1].prices = []
    if (defect === 'type') services[1].sdServiceType = 'TREATMENT'
    if (defect === 'unit') services[1].unitCode = '片'
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow()
  })
  it.each([{ organizationId: 'other' }, { sdOrgStatus: 'INACTIVE' }, { validFrom: undefined }, { validTo: '2020-01-01' }])(
    'does not substitute an unknown or invalid execution department: %j', async patch => {
      const group = groupFixture(), { api, department } = groupApi(group)
      Object.assign(department, patch)
      await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow(/执行科室/)
    })
  it('uses the verified encounter department when no group override is configured', async () => {
    const group = groupFixture(), { api, department } = groupApi(group)
    Object.assign(group, { organizationId: null, usageType: null, executionDepartmentId: null })
    department.id = encounter.departmentId
    expect((await resolveOrderSetImport(group, encounter, api)).drafts[0].performerDepartmentId).toBe(encounter.departmentId)
  })
  it('resolves each member by its own default department when the group sets none', async () => {
    const group = groupFixture(), { api, services } = groupApi(group)
    Object.assign(group, { executionDepartmentId: null })
    Object.assign(services[0], { defaultExecutionDepartment: { departmentId: 'lis-dept', departmentName: '检验科', source: 'CONFIGURED' } })
    Object.assign(services[1], { organizationAdoption: { ...services[1].organizationAdoption, defaultDepartmentId: 'pacs-dept' } })
    const base = { organizationId: 'org', sdOrgStatus: 'ACTIVE', validFrom: '2020-01-01', validTo: null }
    vi.mocked(api.organization.department).mockImplementation(async (id: string) => ({ department: { ...base, id, name: `${id}名称` } }) as never)
    const { drafts } = await resolveOrderSetImport(group, encounter, api)
    expect(drafts.map(draft => draft.performerDepartmentId)).toEqual(['lis-dept', 'pacs-dept'])
    expect(drafts[0].performerDepartmentName).toBe('lis-dept名称')
  })
  it('keeps an explicit group department over member defaults', async () => {
    const group = groupFixture(), { api, services } = groupApi(group)
    Object.assign(services[0], { defaultExecutionDepartment: { departmentId: 'lis-dept', departmentName: '检验科', source: 'CONFIGURED' } })
    const { drafts } = await resolveOrderSetImport(group, encounter, api)
    expect(drafts.map(draft => draft.performerDepartmentId)).toEqual(['lab-dept', 'lab-dept'])
  })
  it('skips only the member whose own default department is invalid', async () => {
    const group = groupFixture(), { api, services } = groupApi(group)
    Object.assign(group, { executionDepartmentId: null })
    Object.assign(services[0], { defaultExecutionDepartment: { departmentId: null, departmentName: null, source: 'AMBIGUOUS' } })
    Object.assign(services[1], { defaultExecutionDepartment: { departmentId: 'gone', departmentName: null, source: 'CONFIGURED' } })
    vi.mocked(api.organization.department).mockResolvedValue({ department: { id: 'gone', organizationId: 'org', name: '停用科室', sdOrgStatus: 'INACTIVE', validFrom: '2020-01-01', validTo: null } } as never)
    const result = await resolveOrderSetRows(group, encounter, api)
    expect(result.drafts).toEqual([])
    expect(result.skipped.map(item => item.memberId)).toEqual(['m1', 'm2'])
  })
  it('does not swallow a directory request failure', async () => {
    const { api } = groupApi()
    vi.mocked(api.masterData.searchServices).mockRejectedValue(new Error('目录服务不可用'))
    await expect(resolveOrderSetImport(groupFixture(), encounter, api)).rejects.toThrow('目录服务不可用')
  })
})

describe('order-set rows tolerate member-level defects only', () => {
  it('imports valid members and lists the defective one with a reason', async () => {
    const group = groupFixture(), { api, services } = groupApi(group)
    services[1].prices = []
    const result = await resolveOrderSetRows(group, encounter, api)
    expect(result.drafts.map(draft => draft.itemCode)).toEqual(['S1'])
    expect(result.skipped).toEqual([{ memberId: 'm2', label: '检查项目', reason: expect.stringContaining('销售价格') }])
    await expect(resolveOrderSetImport(group, encounter, api)).rejects.toThrow(/检查项目：/)
  })
  it('imports only the requested members but still validates the whole group', async () => {
    const group = groupFixture(), { api } = groupApi(group)
    const result = await resolveOrderSetRows(group, encounter, api, new Set(['m2']))
    expect(result.drafts.map(draft => draft.itemCode)).toEqual(['S2'])
    expect(api.masterData.searchServices).toHaveBeenCalledTimes(1)
    Object.assign(group.members[1], { catalogItemId: group.members[0].catalogItemId })
    await expect(resolveOrderSetRows(group, encounter, api, new Set(['m2']))).rejects.toThrow(/重复/)
  })
  it('does not turn a directory outage into skipped members', async () => {
    const { api } = groupApi()
    vi.mocked(api.masterData.searchServices).mockRejectedValue(new Error('目录服务不可用'))
    await expect(resolveOrderSetRows(groupFixture(), encounter, api)).rejects.toThrow('目录服务不可用')
  })
  it.each<[Partial<ReturnType<typeof groupFixture>>, string]>([[{ status: 'INACTIVE' }, '停用'], [{ members: [] }, '没有成员'],
    [{ validFrom: '2999-01-01' }, '有效期'], [{ organizationId: 'other' }, '机构']])('flags statically unavailable groups before any request: %j', (patch, reason) => {
    expect(orderSetStaticIssue({ ...groupFixture(), ...patch }, encounter)).toContain(reason)
  })
  it('accepts an effective group of the current organization', () => {
    expect(orderSetStaticIssue(groupFixture(), encounter)).toBeUndefined()
  })
})
