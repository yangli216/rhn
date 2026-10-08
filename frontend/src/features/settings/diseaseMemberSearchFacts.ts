import { z } from 'zod'
import type { RhnApi } from '../../shared/rhnApi'

const scopes = new WeakMap<RhnApi, number>()
let nextScope = 0
export function diseaseMemberEditorScope(api: RhnApi, programId: string, revision: number) {
  if (!scopes.has(api)) scopes.set(api, ++nextScope)
  return JSON.stringify([scopes.get(api), programId, revision])
}

// The disease directory enforces a minimum page size of ten.
export const diseaseMemberPageSize = 10
const text = z.string().refine(value => value.trim().length > 0)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const candidate = z.object({
  id: text, codeSystemId: text, systemCode: text, systemName: text, code: text, display: text,
  sdStatus: z.literal('ACTIVE'),
  sdDiagnosisDomain: z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME']).nullish(),
  sdDiagnosisDomainText: z.string().nullish(),
})
const pageSchema = z.object({ content: z.array(candidate), totalElements: count, totalPages: count,
  page: count, size: z.literal(diseaseMemberPageSize) })
export type DiseaseMemberCandidate = z.infer<typeof candidate>

export function requireDiseaseMemberSearchPage(source: unknown, requestedPage: number, domain: string) {
  const parsed = pageSchema.safeParse(source)
  const fail = (): never => { throw new Error('疾病目录结果未确认：分页、候选身份或启用状态不完整，请重新检索') }
  if (!parsed.success) return fail()
  const value = parsed.data
  if (value.page !== requestedPage || value.totalPages !== Math.ceil(value.totalElements / value.size)
    || value.content.length !== Math.min(value.size, Math.max(0, value.totalElements - value.page * value.size))
    || new Set(value.content.map(item => item.id)).size !== value.content.length
    || (domain && value.content.some(item => item.sdDiagnosisDomain !== domain))) return fail()
  return value
}
