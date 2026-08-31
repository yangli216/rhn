import { describe, expect, it } from 'vitest'
import type { WorkContextOption } from '../shared/rhnApi'
import { selectableWorkContexts, workContextTypeForPath } from './AppShell'

describe('AppShell work context routing', () => {
  it('routes inpatient workspaces to the ward context independently from outpatient clinics', () => {
    expect(workContextTypeForPath('/inpatient')).toBe('GENERAL')
    expect(workContextTypeForPath('/inpatient/orders?episodeId=1')).toBe('GENERAL')
    expect(workContextTypeForPath('/outpatient/reception')).toBe('CLINICAL')
    expect(workContextTypeForPath('/billing/settlement')).toBe('CLINICAL')
  })

  it('keeps the four pharmacy functions in the pharmacy context while warehouse remains independent', () => {
    expect(workContextTypeForPath('/pharmacy')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/returns')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/query')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/ward-delivery')).toBe('PHARMACY')
    expect(workContextTypeForPath('/pharmacy/warehouse')).toBe('INVENTORY')
  })

  it('keeps only department-scoped contexts selectable by a business workspace', () => {
    const contexts = [
      {
        organizationId: null,
        departmentId: null,
        organizationName: null,
        departmentName: null,
        workContextType: 'GENERAL',
        dataScopeType: 'TENANT',
        roleCodes: ['PRESENCE_ADMIN'],
      },
      {
        organizationId: 'org-1',
        departmentId: 'ward-1',
        organizationName: '青禾镇中心卫生院',
        departmentName: '综合病区',
        workContextType: 'GENERAL',
        dataScopeType: 'DEPARTMENT',
        roleCodes: ['PORTAL_OPERATOR'],
      },
    ] as unknown as WorkContextOption[]

    expect(selectableWorkContexts(contexts, 'GENERAL')).toEqual([contexts[1]])
  })
})
