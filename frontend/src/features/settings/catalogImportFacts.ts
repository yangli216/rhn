import { z } from 'zod'
import type { AdoptionBatchInput, CatalogAdoptionCandidate, CatalogChangeBatch, RhnApi } from '../../shared/rhnApi'
import { isIsoInstant } from '../../shared/validation/instant'
import { requireCatalogCandidates } from './organizationCatalogFacts'

const scopes = new WeakMap<RhnApi, number>()
let nextScope = 0
export function catalogImportScope(api: RhnApi, organizationId: string) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return `${scopes.get(api)}:${organizationId}`
}
export interface CatalogImportAttempt { input: AdoptionBatchInput; items: CatalogAdoptionCandidate[]; batchId?: string }
export function requireImportCandidates(source: unknown, context: {
  organizationId: string; itemType: 'SERVICE' | 'MED_PRODUCT'; page: number; size: number
}) {
  const page = requireCatalogCandidates(source, context)
  if (page.content.some(item => item.adoptionSourceType !== 'NONE' || item.adoption != null || item.centerStatus !== 'ACTIVE')) {
    throw new Error('待调入目录包含已采用或非启用项目，请重新加载核实')
  }
  return page
}
const text = z.string().refine(value => value.trim().length > 0)
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const rowSchema = z.object({ id: text, rowNumber: integer.positive(), catalogItemId: text,
  packageId: text.nullish(), status: z.enum(['SUCCEEDED', 'FAILED']), targetResourceType: text.nullish(),
  targetId: text.nullish(), errorCode: text.nullish(), errorMessage: text.nullish(),
})
const batchSchema = z.object({ id: text, revision: integer, batchType: z.literal('ADOPTION'), operationType: z.literal('ADOPT'),
  organizationId: text, requestCode: text, businessDate: z.iso.date(), status: z.enum(['PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED']),
  totalRows: integer.positive(), succeededRows: integer, failedRows: integer,
  createdAt: z.string().refine(isIsoInstant), createdBy: text, updatedAt: z.string().refine(isIsoInstant), rows: z.array(rowSchema),
})
export function requireImportReceipt(source: unknown, attempt: CatalogImportAttempt): CatalogChangeBatch {
  const result = batchSchema.safeParse(source)
  const fail = (): never => { throw new Error('调入批次回执不完整或与提交内容不一致，请核实本批结果') }
  if (!result.success) return fail()
  const value = result.data, input = attempt.input
  if (value.organizationId !== input.organizationId || value.requestCode !== input.requestCode || value.businessDate !== input.businessDate
    || value.totalRows !== input.catalogItemIds.length || (attempt.batchId && value.id !== attempt.batchId)
    || new Set(value.rows.map(row => row.id)).size !== value.rows.length
    || new Set(value.rows.map(row => row.rowNumber)).size !== value.rows.length
    || new Set(value.rows.map(row => row.catalogItemId)).size !== value.rows.length) return fail()
  for (const row of value.rows) {
    if (row.catalogItemId !== input.catalogItemIds[row.rowNumber - 1] || row.packageId != null) return fail()
    if (row.status === 'SUCCEEDED' ? (!row.targetId || row.targetResourceType !== 'ORGANIZATION_ADOPTION' || row.errorCode != null || row.errorMessage != null)
      : (!row.errorCode || !row.errorMessage || row.targetId != null || row.targetResourceType != null)) return fail()
  }
  const succeeded = value.rows.filter(row => row.status === 'SUCCEEDED').length
  const failed = value.rows.length - succeeded
  if (value.succeededRows !== succeeded || value.failedRows !== failed || value.rows.length > value.totalRows) return fail()
  if (value.status !== 'PROCESSING') {
    if (value.rows.length !== value.totalRows || value.status !== (failed === 0 ? 'COMPLETED' : succeeded === 0 ? 'FAILED' : 'PARTIAL')) return fail()
  }
  return source as CatalogChangeBatch
}
