import { z } from 'zod'
import type { OrganizationProfileResult, OrganizationUnit } from '../../shared/rhnApi'
import { requireOrganizationUnit } from './organizationPersonnelFacts'
import { isIsoInstant } from '../../shared/validation/instant'

const text = z.string().refine(value => value.trim().length > 0)
const date = z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value)
const optionalText = text.nullish()
const period = { validFrom: date, validTo: date.nullish() }
const status = { sdDetailStatus: text, sdDetailStatusText: text }
const base = { id: text, ...period, ...status }
const validPeriod = (value: { validFrom: string; validTo?: string | null }) => !value.validTo || value.validTo >= value.validFrom
function rows<T extends { id: string }>(schema: z.ZodType<T>) {
  return z.array(schema).refine(values => new Set(values.map(value => value.id)).size === values.length)
}
const contacts = rows(z.object({ ...base, sdContactType: text, sdContactTypeText: text, contactValue: text,
  sdContactUse: text, sdContactUseText: text, primaryContact: z.boolean(), sortOrder: z.number().int().nonnegative(),
}).passthrough().refine(validPeriod))
const capabilities = rows(z.object({ ...base, sdCapabilityType: text, sdCapabilityTypeText: text,
  qualificationBasisCode: optionalText, capabilityScope: optionalText, sdVerifyStatus: text, sdVerifyStatusText: text,
}).passthrough().refine(validPeriod))
const responsibilities = rows(z.object({ ...base, assignmentId: optionalText, responsibleName: text,
  sdResponsibilityType: text, sdResponsibilityTypeText: text, primaryResponsibility: z.boolean(),
}).passthrough().refine(validPeriod))
const relation = { ...base, sdRelationType: text, sdRelationTypeText: text, primaryRelation: z.boolean(), description: optionalText }
const organizationSchema = z.object({
  organization: z.unknown(), contacts, capabilities, responsibilities,
  identifiers: rows(z.object({ ...base, identifierSystem: text, identifierCode: text, sdIdentifierType: text, sdIdentifierTypeText: text,
    issuerOrganizationId: optionalText, primaryIdentifier: z.boolean(), sdVerifyStatus: text, sdVerifyStatusText: text,
  }).passthrough().refine(validPeriod)),
  addresses: rows(z.object({ ...base, sdAddressType: text, sdAddressTypeText: text, countryCode: text, provinceCode: optionalText,
    cityCode: optionalText, districtCode: optionalText, streetAddress: text, postalCode: optionalText,
  }).passthrough().refine(validPeriod)),
  relations: rows(z.object({ ...relation, targetOrganizationId: text, targetOrganizationName: text }).passthrough().refine(validPeriod)),
}).passthrough()
const departmentSchema = z.object({
  department: z.object({ id: text, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), organizationId: text,
    parentId: optionalText, code: text, name: text, sdDepartmentType: text, sdDepartmentTypeText: text,
    sdDepartmentProperty: optionalText, sdDepartmentPropertyText: optionalText,
    sdOrgType: z.enum(['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC', 'CAMPUS',
      'CLINICAL_DEPARTMENT', 'ADMINISTRATIVE_DEPARTMENT', 'MEDICAL_TECHNOLOGY_DEPARTMENT', 'NURSING_UNIT']), sdOrgTypeText: text,
    virtual: z.boolean(), sortOrder: z.number().int().nonnegative(), sdOrgStatus: z.enum(['DRAFT', 'PENDING_ACTIVE', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'MERGED']),
    sdOrgStatusText: text, ...period, createdAt: z.string().refine(isIsoInstant), updatedAt: z.string().refine(isIsoInstant),
  }).passthrough().refine(validPeriod), contacts, capabilities, responsibilities,
  relations: rows(z.object({ ...relation, targetDepartmentId: text, targetDepartmentName: text }).passthrough().refine(validPeriod)),
}).passthrough()

export function requireOrganizationProfile(source: unknown, unit: OrganizationUnit): OrganizationProfileResult {
  const fail = (): never => { throw new Error('组织治理档案返回不完整、版本过旧或对象不一致，请重新加载核实') }
  if (unit.sdOrgKind === 'ORG_UNIT') {
    const parsed = departmentSchema.safeParse(source)
    if (!parsed.success || 'organization' in parsed.data) return fail()
    const owner = parsed.data.department
    if (owner.id !== unit.id || owner.code !== unit.code || owner.revision < unit.revision) return fail()
    return parsed.data
  }
  const parsed = organizationSchema.safeParse(source)
  if (!parsed.success || 'department' in parsed.data) return fail()
  const owner = requireOrganizationUnit(parsed.data.organization)
  if (owner.sdOrgKind !== 'LEGAL_ORGANIZATION' || owner.id !== unit.id || owner.code !== unit.code || owner.revision < unit.revision) return fail()
  return { ...parsed.data, organization: owner }
}
