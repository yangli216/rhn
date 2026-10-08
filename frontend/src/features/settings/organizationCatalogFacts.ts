import { z } from 'zod'
import type { CatalogAdoptionCandidate, MasterDataPage, OrganizationCatalogSource } from '../../shared/rhnApi'

const text = z.string().refine(value => value.trim().length > 0)
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const date = z.iso.date()
const status = z.enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'REPLACED'])
const sourceSchema = z.object({ organizationId: text, organizationName: text, organizationRevision: integer,
  sourceOrganizationId: text.nullable(), sourceOrganizationName: text.nullable(),
}).refine(value => Boolean(value.sourceOrganizationId) === Boolean(value.sourceOrganizationName))
const adoptionSchema = z.object({ id: text, revision: integer, organizationId: text, catalogItemId: text,
  localCode: z.string().nullish(), localName: z.string().nullish(), defaultDepartmentId: text.nullish(),
  orderable: z.boolean(), executable: z.boolean(), chargeable: z.boolean(), purchasable: z.boolean(),
  stocked: z.boolean(), dispensable: z.boolean(), returnable: z.boolean(),
  sdStatus: status, sdStatusText: text, validFrom: date, validTo: date.nullish(), replacesAdoptionId: text.nullish(),
}).refine(value => !value.validTo || value.validTo >= value.validFrom)
const candidateSchema = z.object({ id: text, code: text, name: text, itemType: z.enum(['SERVICE', 'MED_PRODUCT']),
  centerStatus: status, adoptionSourceType: z.enum(['LOCAL', 'SHARED', 'NONE']), adoption: adoptionSchema.nullish(),
  packages: z.array(z.object({ id: text, unitCode: text, unitName: text, packageSpec: z.string().nullish() })),
})
const uniqueIds = (values: Array<{ id: string }>) => new Set(values.map(value => value.id)).size === values.length
const fail = (name: string): never => { throw new Error(`${name}返回不完整或关联不一致，请重新加载核实`) }

export function requireCatalogSource(source: unknown, organizationId: string): OrganizationCatalogSource {
  const result = sourceSchema.safeParse(source)
  if (!result.success || result.data.organizationId !== organizationId
    || result.data.sourceOrganizationId === organizationId) return fail('目录来源')
  return result.data
}

export function requireCatalogSourceReceipt(source: unknown, before: OrganizationCatalogSource,
  sourceOrganizationId: string): OrganizationCatalogSource {
  const value = requireCatalogSource(source, before.organizationId)
  if ((value.sourceOrganizationId ?? '') !== sourceOrganizationId
    || value.organizationRevision <= before.organizationRevision) return fail('目录来源保存回执')
  return value
}

export function requireCatalogOrganizations(source: unknown) {
  const result = z.array(z.object({ id: text, name: text, code: text, sdOrgKind: z.literal('LEGAL_ORGANIZATION') })).safeParse(source)
  if (!result.success || !uniqueIds(result.data)) return fail('来源机构目录')
  return result.data
}

export function requireCatalogCandidates(source: unknown, context: {
  organizationId: string; sourceOrganizationId?: string | null; itemType: 'SERVICE' | 'MED_PRODUCT'; page: number; size: number
}): MasterDataPage<CatalogAdoptionCandidate> {
  const result = z.object({ content: z.array(candidateSchema), totalElements: integer, totalPages: integer,
    page: integer, size: integer.positive(),
  }).safeParse(source)
  if (!result.success) return fail('机构候选项目')
  const value = result.data
  if (value.page !== context.page || value.size !== context.size
    || value.totalPages !== Math.ceil(value.totalElements / value.size)
    || value.content.length !== Math.min(value.size, Math.max(0, value.totalElements - value.page * value.size))
    || !uniqueIds(value.content)) return fail('机构候选项目分页')
  for (const item of value.content) {
    if (item.itemType !== context.itemType || !uniqueIds(item.packages)) return fail('机构候选项目')
    if (item.adoptionSourceType === 'NONE') {
      if (item.adoption != null) return fail('机构采用关系')
    } else {
      const expectedOrganization = item.adoptionSourceType === 'LOCAL' ? context.organizationId : context.sourceOrganizationId
      if (!expectedOrganization || !item.adoption || item.adoption.organizationId !== expectedOrganization
        || item.adoption.catalogItemId !== item.id) return fail('机构采用关系')
    }
  }
  // Return the original response so optional backend metadata is preserved.
  return source as MasterDataPage<CatalogAdoptionCandidate>
}
