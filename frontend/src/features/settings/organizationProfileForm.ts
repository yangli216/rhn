import { z } from 'zod'
import type { OrganizationProfileInput, OrganizationProfileSection } from '../../shared/rhnApi'
import type { ProfileRecordEdit } from './OrganizationProfileRecords'

export const profileSchema = z.object({
  section: z.enum(['identifier', 'contact', 'address', 'relation', 'capability', 'responsibility']),
  firstCode: z.string().max(300), secondCode: z.string().max(300), thirdCode: z.string().max(128),
  fourthCode: z.string().max(128), fifthCode: z.string().max(128), sixthCode: z.string().max(128),
  dictionaryType: z.string(), dictionaryUse: z.string(),
  targetOrganizationId: z.string(), description: z.string().max(1000), primary: z.boolean(),
  sortOrder: z.number().int().min(0), validFrom: z.string().min(1, '请选择开始日期'), validTo: z.string(),
  verifyStatus: z.string(), assignmentId: z.string(), responsibilitySubject: z.enum(['internal', 'external']),
  status: z.enum(['ACTIVE', 'INACTIVE']), reason: z.string().max(1000),
}).superRefine((value, context) => {
  const required = (field: 'firstCode' | 'secondCode' | 'dictionaryType' | 'dictionaryUse' | 'targetOrganizationId' | 'verifyStatus', message: string) => {
    if (!value[field].trim()) context.addIssue({ code: 'custom', path: [field], message })
  }
  if (value.section === 'identifier') { required('secondCode', '请输入标识编码'); required('dictionaryType', '请选择标识类型'); required('verifyStatus', '请选择确认结果') }
  if (value.section === 'contact') { required('firstCode', '请输入联系方式'); required('dictionaryType', '请选择联系方式类型'); required('dictionaryUse', '请选择用途') }
  if (value.section === 'address') { required('firstCode', '请输入国家代码'); required('secondCode', '请输入详细地址'); required('dictionaryType', '请选择地址类型') }
  if (value.section === 'relation') { required('targetOrganizationId', '请选择目标组织'); required('dictionaryType', '请选择关系类型') }
  if (value.section === 'capability') { required('dictionaryType', '请选择能力类型'); required('verifyStatus', '请选择确认结果') }
  if (value.section === 'responsibility') {
    if (value.responsibilitySubject === 'external') required('firstCode', '请输入负责人姓名')
    else if (!value.assignmentId) context.addIssue({ code: 'custom', path: ['assignmentId'], message: '请选择内部任职人员' })
    required('dictionaryType', '请选择负责人类型')
  }
  if (value.validTo && value.validTo < value.validFrom) context.addIssue({ code: 'custom', path: ['validTo'], message: '结束日期不能早于开始日期' })
})
export type ProfileForm = z.infer<typeof profileSchema>

export function draftFromProfile(edit: ProfileRecordEdit, blank: ProfileForm): ProfileForm {
  const input = edit.input
  const draft = { ...blank, section: input.section, validFrom: input.validFrom, validTo: input.validTo ?? '', status: edit.status as 'ACTIVE' | 'INACTIVE' }
  switch (input.section) {
    case 'contact': return { ...draft, firstCode: input.contactValue, dictionaryType: input.sdContactType, dictionaryUse: input.sdContactUse, primary: input.primaryContact, sortOrder: input.sortOrder }
    case 'identifier': return { ...draft, firstCode: input.identifierSystem, secondCode: input.identifierCode, dictionaryType: input.sdIdentifierType, primary: input.primaryIdentifier, verifyStatus: input.sdVerifyStatus, targetOrganizationId: input.issuerOrganizationId ?? '' }
    case 'address': return { ...draft, firstCode: input.countryCode, secondCode: input.streetAddress, thirdCode: input.provinceCode ?? '', fourthCode: input.cityCode ?? '', fifthCode: input.districtCode ?? '', sixthCode: input.postalCode ?? '', dictionaryType: input.sdAddressType }
    case 'relation': return { ...draft, targetOrganizationId: input.targetOrganizationId, dictionaryType: input.sdRelationType, primary: input.primaryRelation, description: input.description ?? '' }
    case 'capability': return { ...draft, firstCode: input.qualificationBasisCode ?? '', description: input.capabilityScope ?? '', dictionaryType: input.sdCapabilityType, verifyStatus: input.sdVerifyStatus }
    case 'responsibility': return { ...draft, assignmentId: input.assignmentId ?? '', responsibilitySubject: input.assignmentId ? 'internal' : 'external', firstCode: input.externalResponsibleName ?? '', dictionaryType: input.sdResponsibilityType, primary: input.primaryResponsibility }
  }
}

export function profileInput(value: ProfileForm): OrganizationProfileInput {
  const validTo = value.validTo || undefined
  switch (value.section) {
    case 'identifier': return { section: value.section, identifierSystem: value.firstCode.trim() || identifierSystemFor(value.dictionaryType), identifierCode: value.secondCode,
      issuerOrganizationId: value.targetOrganizationId || undefined, sdIdentifierType: value.dictionaryType, primaryIdentifier: value.primary, validFrom: value.validFrom, validTo,
      sdVerifyStatus: value.verifyStatus }
    case 'contact': return { section: value.section, sdContactType: value.dictionaryType, contactValue: value.firstCode,
      sdContactUse: value.dictionaryUse, primaryContact: value.primary, sortOrder: value.sortOrder,
      validFrom: value.validFrom, validTo }
    case 'address': return { section: value.section, sdAddressType: value.dictionaryType, countryCode: value.firstCode,
      provinceCode: value.thirdCode || undefined, cityCode: value.fourthCode || undefined,
      districtCode: value.fifthCode || undefined, streetAddress: value.secondCode, postalCode: value.sixthCode || undefined,
      validFrom: value.validFrom, validTo }
    case 'relation': return { section: value.section, targetOrganizationId: value.targetOrganizationId,
      sdRelationType: value.dictionaryType, primaryRelation: value.primary, description: value.description || undefined,
      validFrom: value.validFrom, validTo }
    case 'capability': return { section: value.section, sdCapabilityType: value.dictionaryType,
      qualificationBasisCode: value.firstCode || undefined, capabilityScope: value.description || undefined,
      validFrom: value.validFrom, validTo, sdVerifyStatus: value.verifyStatus }
    case 'responsibility': return { section: value.section,
      assignmentId: value.responsibilitySubject === 'internal' ? value.assignmentId : undefined,
      externalResponsibleName: value.responsibilitySubject === 'external' ? value.firstCode : undefined,
      sdResponsibilityType: value.dictionaryType, primaryResponsibility: value.primary,
      validFrom: value.validFrom, validTo }
  }
}

/** 新增机构标识不再要求填写体系 URI，由标识类型推导；已保存记录保持原值。后端仍要求非空。 */
export const identifierSystemFor = (typeCode: string) => `urn:rhn:organization-identifier:${typeCode}`

/** 新增行隐藏的字典字段默认取字典首项，用户只改需要改的内容。 */
export type ProfileDefaults = { dictionaryType?: string; dictionaryUse?: string }
export function blankProfile(section: OrganizationProfileSection, defaults: ProfileDefaults = {}): ProfileForm {
  return { section, firstCode: section === 'address' ? 'CN' : '', secondCode: '', thirdCode: '', fourthCode: '', fifthCode: '', sixthCode: '', dictionaryType: defaults.dictionaryType ?? '', dictionaryUse: defaults.dictionaryUse ?? '', targetOrganizationId: '', description: '', primary: false, sortOrder: 0, validFrom: new Date().toLocaleDateString('sv-SE'), validTo: '', verifyStatus: 'UNVERIFIED', assignmentId: '', responsibilitySubject: 'internal', status: 'ACTIVE', reason: '' }
}
