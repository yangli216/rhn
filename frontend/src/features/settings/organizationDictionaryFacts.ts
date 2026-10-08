import { z } from 'zod'
import { ORGANIZATION_DICTIONARY as codes, type DictionaryValue, type OrganizationProfileInput,
  type OrganizationProfileSection, type OrganizationUnit } from '../../shared/rhnApi'

const text = z.string().refine(value => value.trim().length > 0)
const entry = z.object({ code: text, name: text, sortOrder: z.number().int(),
  attributes: z.record(z.string(), z.string()).nullish(), parentCode: text.nullish(),
}).passthrough()
export function requireOrganizationDictionary(source: unknown): DictionaryValue[] {
  const result = z.array(entry).safeParse(source)
  if (!result.success || new Set(result.data.map(item => item.code)).size !== result.data.length) {
    throw new Error('组织字典返回不完整或编码重复，请重新加载核实')
  }
  // Preserve optional server metadata; only code/name/order are used by this page.
  return source as DictionaryValue[]
}
export function profileDictionaryCodes(section: OrganizationProfileSection, department: boolean): string[] {
  switch (section) {
    case 'identifier': return [codes.identifierType, codes.verifyStatus]
    case 'contact': return [codes.contactType, codes.contactUse]
    case 'address': return [codes.addressType]
    case 'relation': return [department ? codes.departmentRelationType : codes.relationType]
    case 'capability': return [department ? codes.departmentCapabilityType : codes.capabilityType, codes.verifyStatus]
    case 'responsibility': return [department ? codes.departmentResponsibilityType : codes.responsibilityType]
  }
}
export function requireProfileDictionarySelection(input: OrganizationProfileInput, unit: Pick<OrganizationUnit, 'sdOrgKind'>,
  dictionaries: Map<string, DictionaryValue[]>) {
  const expected = profileDictionaryCodes(input.section, unit.sdOrgKind === 'ORG_UNIT')
  const selected = input.section === 'identifier' ? [input.sdIdentifierType, input.sdVerifyStatus]
    : input.section === 'contact' ? [input.sdContactType, input.sdContactUse]
    : input.section === 'address' ? [input.sdAddressType]
    : input.section === 'relation' ? [input.sdRelationType]
    : input.section === 'capability' ? [input.sdCapabilityType, input.sdVerifyStatus] : [input.sdResponsibilityType]
  if (expected.some((code, index) => !dictionaries.get(code)?.some(item => item.code === selected[index]))) {
    throw new Error('当前资料类别的字典选项尚未确认或已失效，请重新加载并选择')
  }
}
