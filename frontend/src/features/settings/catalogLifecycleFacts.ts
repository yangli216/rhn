import { z } from 'zod'
import type { CatalogLifecycle } from '../../shared/rhnApi'

const text = z.string().refine(value => value.trim().length > 0)
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const date = z.iso.date()
const status = z.enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'REPLACED'])
const period = { validFrom: date, validTo: date.nullish() }
const ordered = (value: { validFrom: string; validTo?: string | null }) => !value.validTo || value.validTo >= value.validFrom
const adoption = z.object({ id: text, revision: integer, organizationId: text, catalogItemId: text,
  defaultDepartmentId: text.nullish(), localCode: z.string().nullish(), localName: z.string().nullish(),
  orderable: z.boolean(), executable: z.boolean(), chargeable: z.boolean(), purchasable: z.boolean(),
  stocked: z.boolean(), dispensable: z.boolean(), returnable: z.boolean(), sdStatus: status, sdStatusText: text,
  ...period, replacesAdoptionId: text.nullish(),
}).refine(ordered)
const price = z.object({ id: text, revision: integer, organizationId: text.nullable(), packageId: text.nullish(),
  sdPriceType: text, sdPriceTypeText: text, price: z.number().finite().nonnegative(), currencyCode: text,
  priceDocumentCode: z.string().nullish(), priceReason: z.string().nullish(), ...period, sdStatus: status, sdStatusText: text,
  replacesPriceId: text.nullish(),
}).refine(ordered)
const snapshot = z.object({ catalogItemId: text, organizationId: text, businessDate: date,
  currentAdoption: adoption.nullable(), adoptionHistory: z.array(adoption), currentPrices: z.array(price), priceHistory: z.array(price),
})
const unique = (values: { id: string }[]) => new Set(values.map(value => value.id)).size === values.length
const inPeriod = (value: { validFrom: string; validTo?: string | null }, at: string) => value.validFrom <= at && (!value.validTo || value.validTo >= at)
// Retired/replaced records retain their historical validity up to their end date, as the backend does.
const effective = (value: { sdStatus: string; validFrom: string; validTo?: string | null }, at: string) => value.sdStatus !== 'SUSPENDED' && inPeriod(value, at)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function nextCatalogVersionDate(validFrom: string, today: string) {
  const next = new Date(`${validFrom}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const value = next.toISOString().slice(0, 10)
  return value > today ? value : today
}
export function requireCatalogLifecycle(source: unknown, expected: {
  catalogItemId: string; organizationId: string; businessDate: string; sourceOrganizationId?: string | null
}): CatalogLifecycle {
  const parsed = snapshot.safeParse(source)
  const fail = (): never => { throw new Error('目录与价格快照不完整或关联不一致，请重新加载核实') }
  if (!parsed.success) return fail()
  const value = parsed.data
  if (value.catalogItemId !== expected.catalogItemId || value.organizationId !== expected.organizationId || value.businessDate !== expected.businessDate
    || !unique(value.adoptionHistory) || !unique(value.priceHistory) || !unique(value.currentPrices)
    || value.adoptionHistory.some(row => row.organizationId !== expected.organizationId || row.catalogItemId !== expected.catalogItemId)
    || value.priceHistory.some(row => row.organizationId !== null && row.organizationId !== expected.organizationId)) return fail()
  const current = value.currentAdoption
  const local = value.adoptionHistory.find(row => inPeriod(row, value.businessDate))
  if (local) {
    if (effective(local, value.businessDate) ? !same(local, current) : current !== null) return fail()
  } else if (current && (current.organizationId !== expected.sourceOrganizationId || current.catalogItemId !== expected.catalogItemId
    || current.defaultDepartmentId != null || !effective(current, value.businessDate))) return fail()
  const actualPrices = value.priceHistory.filter(row => effective(row, value.businessDate))
  if (actualPrices.length !== value.currentPrices.length || value.currentPrices.some(row =>
    !same(row, actualPrices.find(entry => entry.id === row.id)))) return fail()
  return source as CatalogLifecycle
}
export function requireCatalogDepartments(source: unknown, organizationId: string) {
  const result = z.array(z.object({ id: text, organizationId: text, code: text, name: text })).safeParse(source)
  if (!result.success || !unique(result.data) || result.data.some(row => row.organizationId !== organizationId)) {
    throw new Error('默认科室目录不完整或不属于当前机构，请重新加载核实')
  }
  return result.data
}
