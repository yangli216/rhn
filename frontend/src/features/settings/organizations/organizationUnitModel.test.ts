import { describe, expect, it } from 'vitest'
import type { OrganizationUnit } from '../../../shared/rhnApi'
import { departmentTypeOptions, resolveDepartmentTypeText } from './organizationUnitModel'

const department = {
  id: 'dept-1', parentId: 'org-1', revision: 1, code: 'DEPT01', name: '中医科', sdOrgKind: 'ORG_UNIT', sdOrgKindText: '科室',
  sdOrgType: 'CLINICAL_DEPARTMENT', sdOrgTypeText: '临床科室', sdOrgStatus: 'ACTIVE', sdOrgStatusText: '正常', validFrom: '2026-01-01',
  sortOrder: 1, virtual: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
} as OrganizationUnit

describe('organizationUnitModel', () => {
  it('uses saved type metadata and never guesses a department type from its name', () => {
    expect(resolveDepartmentTypeText(department)).toBe('未维护科室类型')
    expect(resolveDepartmentTypeText({ ...department, name: '药房', sdDepartmentType: 'CUSTOM_X' })).toBe('CUSTOM_X')
    expect(resolveDepartmentTypeText({ ...department, sdDepartmentType: 'CUSTOM_OTHER' }, [{ code: 'CUSTOM_OTHER', name: '实际字典类型' }] as never))
      .toBe('实际字典类型')
  })

  it('offers property-specific department types without misclassifying logistics or labs as clinical', () => {
    const values = ['02', '30.03', 'MED_PHARMACY', 'MED_PHARMACY_OUTPATIENT', 'MED_EQUIPMENT_DEPT', 'LOG_GENERAL_DEPT', 'NUR_CSSD', 'CUSTOM_OTHER']
      .map(code => ({ code, name: code, sortOrder: 0 }))
    expect(departmentTypeOptions(values as never, 'MEDICAL_TECHNOLOGY_DEPARTMENT', 'PHARMACY').map(item => item.code))
      .toEqual(['MED_PHARMACY', 'MED_PHARMACY_OUTPATIENT', 'CUSTOM_OTHER'])
    expect(departmentTypeOptions(values as never, 'MEDICAL_TECHNOLOGY_DEPARTMENT', 'SUPPLY_LOGISTICS').map(item => item.code))
      .toEqual(['LOG_GENERAL_DEPT', 'NUR_CSSD', 'CUSTOM_OTHER'])
    expect(departmentTypeOptions(values as never, 'CLINICAL_DEPARTMENT', 'CLINICAL').map(item => item.code)).toEqual(['02', 'CUSTOM_OTHER'])
  })
})
