import { z } from 'zod'
import type { DictionaryValue, OrganizationProfileResult, OrganizationType, OrganizationUnit, OrganizationUnitInput } from '../../../shared/rhnApi'
import { departmentStructure } from '../organizationUnitReceipt'
import { formatDateKey } from '../../../shared/utils/dateRange'

export const LEGAL_ORGANIZATION_TYPES = ['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC']
export const TIMEZONE_OPTIONS = [{ value: 'Asia/Shanghai', label: 'Asia/Shanghai（中国标准时间）' }, { value: 'Asia/Urumqi', label: 'Asia/Urumqi（新疆时间）' }]

export const today = () => formatDateKey()
export const codeNameOption = (item: { code: string; name: string }) => ({ value: item.code, label: item.name })

/** 当前有效：启用且今天在有效期内。资质与联系只展示和维护当前有效记录，历史在变更记录查看。 */
export const currentRecord = (value: { sdDetailStatus: string; validFrom: string; validTo?: string | null }, on = today()) =>
  value.sdDetailStatus === 'ACTIVE' && value.validFrom <= on && (!value.validTo || value.validTo >= on)

/** 具体科室类型按业务属性和结构类型收窄；不按科室名称猜测。 */
export function departmentTypeOptions(values: DictionaryValue[], structuralType: string, property: string) {
  const specific: Record<string, (code: string) => boolean> = {
    PHARMACY: code => code.startsWith('MED_PHARMACY'),
    EQUIPMENT_ASSET: code => code.startsWith('MED_EQUIPMENT'),
    SUPPLY_LOGISTICS: code => code.startsWith('LOG_') || ['MED_CONSUMABLE_WAREHOUSE', 'MED_SURGICAL_STORE', 'MED_REAGENT_STORE', 'MED_SUPPLY', 'NUR_CSSD'].some(prefix => code.startsWith(prefix)),
    RESEARCH_EDUCATION: code => ['ADM_RESEARCH', 'ADM_EDUCATION', 'ADM_TEACH'].some(prefix => code.startsWith(prefix)),
  }
  if (specific[property]) return values.filter(item => specific[property](item.code) || item.code === 'CUSTOM_OTHER')
  const custom = (code: string) => code === 'CUSTOM_OTHER'
  if (structuralType === 'ADMINISTRATIVE_DEPARTMENT') return values.filter((item) => item.code.startsWith('ADM_') || custom(item.code))
  if (structuralType === 'MEDICAL_TECHNOLOGY_DEPARTMENT') return values.filter((item) => item.code.startsWith('MED_')
    || ['30', '31', '32'].some((prefix) => item.code === prefix || item.code.startsWith(`${prefix}.`)) || custom(item.code))
  if (structuralType === 'NURSING_UNIT') return values.filter((item) => item.code.startsWith('NUR_') || custom(item.code))
  return values.filter((item) => (!item.code.startsWith('ADM_') && !item.code.startsWith('MED_')
    && !item.code.startsWith('NUR_') && !item.code.startsWith('LOG_')
    && !['30', '31', '32'].some(prefix => item.code === prefix || item.code.startsWith(`${prefix}.`))) || custom(item.code))
}

export function resolveDepartmentTypeText(unit?: OrganizationUnit | null, departmentTypes?: DictionaryValue[]): string {
  if (!unit) return ''
  if (unit.sdOrgKind !== 'ORG_UNIT') return unit.sdOrgTypeText || ''
  const typeCode = unit.sdDepartmentType?.trim() || ''
  const configuredName = departmentTypes?.find((item) => item.code === typeCode)?.name
  return configuredName || unit.sdDepartmentTypeText?.trim() || typeCode || '未维护科室类型'
}

/** 科室档案里的科室字段更完整；上级为空时表示直属机构。 */
export function unitFromProfile(unit: OrganizationUnit, profile: OrganizationProfileResult): OrganizationUnit {
  return 'organization' in profile ? profile.organization
    : { ...unit, ...profile.department, parentId: profile.department.parentId ?? profile.department.organizationId }
}

export const unitSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入字母开头的组织代码'),
  name: z.string().trim().min(1, '请输入组织名称').max(200),
  shortName: z.string().max(100), description: z.string().max(1000),
  sdOrgKind: z.enum(['LEGAL_ORGANIZATION', 'ORG_UNIT']),
  sdOrgType: z.string().min(1, '请选择组织结构类型'), parentId: z.string(),
  sdOrgProperty: z.string(), sdDepartmentProperty: z.string(), virtual: z.boolean(), sortOrder: z.number().int().min(0),
  timezoneCode: z.string().max(64), sdDepartmentType: z.string(),
  validFrom: z.string().min(1, '请选择生效日期'), validTo: z.string(),
}).refine((value) => value.sdOrgKind === 'LEGAL_ORGANIZATION' || value.parentId, {
  path: ['parentId'], message: '科室必须选择上级组织',
}).refine((value) => value.sdOrgKind !== 'ORG_UNIT' || value.sdDepartmentProperty.trim(), {
  path: ['sdDepartmentProperty'], message: '请选择业务属性',
}).refine((value) => value.sdOrgKind !== 'ORG_UNIT' || value.sdDepartmentType, {
  path: ['sdDepartmentType'], message: '请选择具体科室类型',
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, {
  path: ['validTo'], message: '结束日期不能早于生效日期',
})
export type UnitForm = z.infer<typeof unitSchema>

export function unitFormDefaults(editing: OrganizationUnit | undefined, parent: OrganizationUnit | undefined): UnitForm {
  return {
    code: editing?.code ?? '', name: editing?.name ?? '', shortName: editing?.shortName ?? '', description: editing?.description ?? '',
    sdOrgKind: editing?.sdOrgKind ?? (parent ? 'ORG_UNIT' : 'LEGAL_ORGANIZATION'),
    sdOrgType: editing?.sdOrgType ?? (parent ? 'CLINICAL_DEPARTMENT' : 'TOWNSHIP_HEALTH_CENTER'),
    sdOrgProperty: editing?.sdOrgProperty ?? '', virtual: editing?.virtual ?? false,
    sdDepartmentProperty: editing?.sdDepartmentProperty ?? '', sortOrder: editing?.sortOrder ?? 0,
    timezoneCode: editing ? editing.timezoneCode ?? '' : 'Asia/Shanghai', sdDepartmentType: editing?.sdDepartmentType ?? '',
    parentId: editing?.parentId ?? parent?.id ?? '', validFrom: editing?.validFrom ?? today(), validTo: editing?.validTo ?? '',
  }
}

/** 机构只提交机构字段，科室只提交科室字段；科室的结构类型由业务属性推导。 */
export function unitDetails(value: UnitForm): Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'> {
  const legal = value.sdOrgKind === 'LEGAL_ORGANIZATION'
  return {
    parentId: value.parentId || undefined, name: value.name, shortName: value.shortName || undefined, description: value.description || undefined,
    sdOrgType: legal ? value.sdOrgType as OrganizationType : departmentStructure(value.sdDepartmentProperty),
    sdOrgProperty: legal ? value.sdOrgProperty || undefined : undefined,
    sdDepartmentProperty: legal ? undefined : value.sdDepartmentProperty || undefined,
    virtual: value.virtual, sortOrder: value.sortOrder, timezoneCode: legal ? value.timezoneCode || undefined : undefined,
    sdDepartmentType: legal ? undefined : value.sdDepartmentType || undefined,
    validFrom: value.validFrom, validTo: value.validTo || undefined,
  }
}
