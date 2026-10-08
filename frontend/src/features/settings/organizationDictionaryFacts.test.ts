import { describe, expect, it } from 'vitest'
import type { DictionaryValue, OrganizationProfileInput } from '../../shared/rhnApi'
import { profileDictionaryCodes, requireOrganizationDictionary, requireProfileDictionarySelection } from './organizationDictionaryFacts'

const item = { code: 'CUSTOM', name: '真实自定义项', sortOrder: 0 }
describe('organization dictionary facts', () => {
  it('preserves valid empty catalogs and extensible dictionary codes without inserting defaults', () => {
    expect(requireOrganizationDictionary([])).toEqual([])
    const source = [{ ...item, parentCode: null, attributes: null }]
    expect(requireOrganizationDictionary(source)).toBe(source)
  })
  it.each([undefined, {}, [null], [{ code: 'A' }], [{ ...item, name: ' ' }], [{ ...item, sortOrder: '0' }],
    [item, item], [{ ...item, attributes: { invalid: true } }]])('rejects incomplete or ambiguous dictionary %j', value => {
    expect(() => requireOrganizationDictionary(value)).toThrow(/组织字典/)
  })
  const inputs: OrganizationProfileInput[] = [
    { section: 'identifier', identifierSystem: 'urn:test', identifierCode: 'I', sdIdentifierType: 'CUSTOM', sdVerifyStatus: 'CUSTOM', primaryIdentifier: false, validFrom: '2026-01-01' },
    { section: 'contact', sdContactType: 'CUSTOM', sdContactUse: 'CUSTOM', contactValue: 'phone', primaryContact: false, sortOrder: 0, validFrom: '2026-01-01' },
    { section: 'address', sdAddressType: 'CUSTOM', countryCode: 'CN', streetAddress: 'Street', validFrom: '2026-01-01' },
    { section: 'relation', targetOrganizationId: 'target', sdRelationType: 'CUSTOM', primaryRelation: false, validFrom: '2026-01-01' },
    { section: 'capability', sdCapabilityType: 'CUSTOM', sdVerifyStatus: 'CUSTOM', validFrom: '2026-01-01' },
    { section: 'responsibility', sdResponsibilityType: 'CUSTOM', externalResponsibleName: 'Name', primaryResponsibility: false, validFrom: '2026-01-01' },
  ]
  it.each(inputs)('requires every dictionary for $section and rejects disappeared choices', input => {
    for (const sdOrgKind of ['LEGAL_ORGANIZATION', 'ORG_UNIT'] as const) {
      const codes = profileDictionaryCodes(input.section, sdOrgKind === 'ORG_UNIT')
      const dictionaries = new Map<string, DictionaryValue[]>(codes.map(code => [code, [item]]))
      expect(() => requireProfileDictionarySelection(input, { sdOrgKind }, dictionaries)).not.toThrow()
      for (const code of codes) {
        const missing = new Map(dictionaries); missing.delete(code)
        expect(() => requireProfileDictionarySelection(input, { sdOrgKind }, missing)).toThrow()
        missing.set(code, [])
        expect(() => requireProfileDictionarySelection(input, { sdOrgKind }, missing)).toThrow()
        missing.set(code, [{ ...item, code: 'OTHER' }])
        expect(() => requireProfileDictionarySelection(input, { sdOrgKind }, missing)).toThrow()
      }
    }
  })
  it('does not accept institution relation choices for departments', () => {
    expect(() => requireProfileDictionarySelection(inputs[3], { sdOrgKind: 'ORG_UNIT' }, new Map([['ORG_RELATION_TYPE', [item]]]))).toThrow()
  })
})
