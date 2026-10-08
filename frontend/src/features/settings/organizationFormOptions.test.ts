import { describe, expect, it } from 'vitest'
import type { DictionaryValue, OrganizationUnitInput } from '../../shared/rhnApi'
import { enumAvailable, requireEnumChoice, requireOrganizationEnums, requireUnitOptions, unitOptionsAvailable } from './organizationFormOptions'
const item = { code: 'CLINICAL', name: '真实类型', description: '', sortOrder: 0 }
const definition = { code: 'POSITION_TYPE', name: '岗位类型', description: '', items: [item] }
describe('verified organization form choices', () => {
  it.each([undefined, {}, [{ code: 'POSITION_TYPE' }], [{ ...definition, items: undefined }], [{ ...definition, items: [item, item] }],
    [definition, definition], [{ ...definition, items: [{ ...item, name: '' }] }], [{ ...definition, items: [{ ...item, sortOrder: '1' }] }]])('rejects invalid enum payload %j', source => {
    expect(() => requireOrganizationEnums(source)).toThrow(/系统枚举/)
  })
  it('keeps empty results empty and requires the actual definition and selected code', () => {
    expect(requireOrganizationEnums([])).toEqual([])
    expect(enumAvailable([], 'POSITION_TYPE')).toBe(false)
    expect(enumAvailable([definition], 'PRACT_GENDER')).toBe(false)
    expect(enumAvailable([definition], 'POSITION_TYPE')).toBe(true)
    expect(() => requireEnumChoice([definition], 'POSITION_TYPE', 'CLINICAL')).not.toThrow()
    expect(() => requireEnumChoice([definition], 'POSITION_TYPE', 'NURSING')).toThrow()
    expect(() => requireEnumChoice(undefined, 'POSITION_TYPE', 'CLINICAL')).toThrow()
  })
  const enums = [
    { ...definition, code: 'ORG_KIND', items: ['LEGAL_ORGANIZATION', 'ORG_UNIT'].map(code => ({ ...item, code })) },
    { ...definition, code: 'ORG_TYPE', items: [{ ...item, code: 'HOSPITAL' }] },
  ]
  const org: OrganizationUnitInput = { code: 'ORG', name: '机构', sdOrgKind: 'LEGAL_ORGANIZATION', sdOrgType: 'HOSPITAL',
    virtual: false, sortOrder: 0, validFrom: '2026-01-01' }
  const dept: OrganizationUnitInput = { ...org, sdOrgKind: 'ORG_UNIT', sdOrgType: 'CLINICAL_DEPARTMENT', sdDepartmentProperty: 'CLINICAL', sdDepartmentType: 'CUSTOM' }
  it('requires a confirmed property catalog for institutions, while allowing a confirmed empty optional catalog', () => {
    expect(unitOptionsAvailable(org.sdOrgKind, enums, new Map())).toBe(false)
    const values = new Map<string, DictionaryValue[]>([['ORG_PROPERTY', []]])
    expect(() => requireUnitOptions(org, enums, values)).not.toThrow()
    expect(() => requireUnitOptions({ ...org, sdOrgProperty: 'PUBLIC' }, enums, values)).toThrow(/机构性质/)
    expect(() => requireUnitOptions({ ...org, sdOrgType: 'CLINIC' }, enums, values)).toThrow(/已失效/)
  })
  it('requires both real department catalogs and never uses an institution catalog as a substitute', () => {
    const values = new Map<string, DictionaryValue[]>([['DEPT_PROPERTY', [item]], ['DEPT_TYPE', [{ ...item, code: 'CUSTOM' }]]])
    expect(() => requireUnitOptions(dept, enums, values)).not.toThrow()
    for (const code of ['DEPT_TYPE', 'DEPT_PROPERTY']) {
      const missing = new Map(values); missing.delete(code)
      expect(() => requireUnitOptions(dept, enums, missing)).toThrow()
      missing.set(code, [])
      expect(() => requireUnitOptions(dept, enums, missing)).toThrow()
      missing.set(code, [{ ...item, code: 'REMOVED' }])
      expect(() => requireUnitOptions(dept, enums, missing)).toThrow(/已失效/)
    }
  })
})
