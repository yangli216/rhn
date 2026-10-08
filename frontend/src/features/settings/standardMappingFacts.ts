import { z } from 'zod'
import type { ItemTermMapping, ItemTermMappingMaintenance, ItemAttributeSubjectType, StandardCodeSystem, StandardTerm, StandardMappingType, SaveItemTermMappingInput } from '../../shared/rhnApi'

const text = z.string().trim().min(1)
const date = z.iso.date()
const mapping = z.object({
  id: text, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), subjectId: text,
  subjectType: text, targetId: text, conceptId: text, codeSystemId: text, systemCode: text,
  systemName: text, systemVersion: text, authorityType: z.enum(['NATIONAL', 'INSURANCE', 'REGULATORY', 'LOCAL', 'INTERNAL', 'OTHER']),
  termCode: text, termDisplay: text, mappingType: z.enum(['CLINICAL', 'INSURANCE', 'REGULATORY', 'LOCAL']),
  equivalence: z.enum(['EXACT', 'EQUIVALENT', 'WIDER', 'NARROWER', 'RELATED']), primaryMapping: z.boolean(),
  limitation: z.string().nullish(), validFrom: date, validTo: date.nullish(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'RETIRED', 'SUPERSEDED']), replacesMappingId: text.nullish(),
  createdAt: z.iso.datetime({ offset: true }), createdBy: text, updatedAt: z.iso.datetime({ offset: true }), updatedBy: text,
}).refine(row => (!row.validTo || row.validTo >= row.validFrom)
  && (!['RETIRED', 'SUPERSEDED'].includes(row.status) || Boolean(row.validTo)))
const snapshot = z.object({ subjectId: text, subjectType: text, targetId: text, businessDate: date,
  effectiveMappings: z.array(mapping), history: z.array(mapping) })
const fields = Object.keys(mapping.shape) as Array<keyof ItemTermMapping>
const same = (a: ItemTermMapping, b: ItemTermMapping, keys = fields) => keys.every(key => (a[key] ?? null) === (b[key] ?? null))
const unique = (rows: { id: string }[]) => new Set(rows.map(row => row.id)).size === rows.length
export function requireStandardMappings(source: unknown, expected: {
  subjectType: ItemAttributeSubjectType; targetId: string; businessDate?: string
}): ItemTermMappingMaintenance {
  const parsed = snapshot.safeParse(source)
  const fail = (): never => { throw new Error('标准映射数据不完整或关联不一致，请重新加载核实') }
  if (!parsed.success) return fail()
  const value = source as ItemTermMappingMaintenance
  if (value.subjectType !== expected.subjectType || value.targetId !== expected.targetId
    || (expected.businessDate !== undefined && value.businessDate !== expected.businessDate)
    || !unique(value.history) || !unique(value.effectiveMappings)
    || value.history.some(row => row.subjectId !== value.subjectId || row.subjectType !== value.subjectType || row.targetId !== value.targetId)) return fail()
  const effective = value.history.filter(row => row.status !== 'SUSPENDED' && row.validFrom <= value.businessDate
    && (!row.validTo || row.validTo >= value.businessDate))
  if (effective.length !== value.effectiveMappings.length || value.effectiveMappings.some(row => {
    const original = effective.find(item => item.id === row.id)
    return !original || !same(row, original)
  })) return fail()
  return value
}
export type MappingStatusCommand = { original: ItemTermMapping; status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED'; validTo?: string }
export function assertMappingStatusCommand(before: ItemTermMappingMaintenance, command: MappingStatusCommand) {
  const { original, status, validTo } = command
  const actual = before.history.find(row => row.id === original.id)
  if (!actual || !same(actual, original)) throw new Error('原映射已变化，请重新加载后操作')
  if (status === 'ACTIVE' ? original.status !== 'SUSPENDED' : original.status !== 'ACTIVE') {
    throw new Error('当前映射状态不支持此操作，请重新加载后操作')
  }
  if (status === 'RETIRED' && (!date.safeParse(validTo).success || validTo! < original.validFrom)) {
    throw new Error('停用日期不能早于映射生效日期，请调整业务日期')
  }
  if (status !== 'RETIRED' && validTo !== undefined) throw new Error('暂停或恢复不能修改失效日期')
}
export function verifyMappingStatusReceipt(source: unknown, before: ItemTermMappingMaintenance, command: MappingStatusCommand) {
  assertMappingStatusCommand(before, command)
  const value = requireStandardMappings(source, { subjectType: before.subjectType, targetId: before.targetId })
  const fail = (): never => { throw new Error('状态变更结果未确认：返回记录与提交操作不一致，请重新核实映射') }
  if (value.subjectId !== before.subjectId || value.history.length !== before.history.length) return fail()
  for (const original of before.history) {
    const actual = value.history.find(row => row.id === original.id)
    if (!actual) return fail()
    if (original.id !== command.original.id) { if (!same(original, actual)) return fail(); continue }
    const unchanged = fields.filter(key => !['status', 'revision', 'validTo', 'updatedAt', 'updatedBy'].includes(key))
    if (!same(original, actual, unchanged) || actual.revision <= original.revision || actual.status !== command.status
      || (actual.validTo ?? null) !== (command.status === 'RETIRED' ? command.validTo : original.validTo ?? null)) return fail()
  }
  return value
}
export function requirePersistedMappings(receipt: ItemTermMappingMaintenance, persisted: ItemTermMappingMaintenance) {
  if (receipt.subjectId !== persisted.subjectId || receipt.subjectType !== persisted.subjectType || receipt.targetId !== persisted.targetId
    || receipt.history.length !== persisted.history.length || receipt.history.some(row => {
      const actual = persisted.history.find(value => value.id === row.id)
      return !actual || !same(row, actual)
    })) throw new Error('映射保存结果未确认：重新读取结果与保存回执不一致，请重新核实映射')
}

const authority = z.enum(['NATIONAL', 'INSURANCE', 'REGULATORY', 'LOCAL', 'INTERNAL', 'OTHER'])
const systemSchema = z.object({ id: text, code: text, name: text, version: text, systemType: text, authorityType: authority,
  status: z.literal('ACTIVE'), effectiveFrom: date, effectiveTo: date.nullish() })
const termSchema = z.object({ id: text, codeSystemId: text, systemCode: text, systemName: text, systemVersion: text,
  authorityType: authority, code: text, display: text, status: z.literal('ACTIVE'), effectiveFrom: date, effectiveTo: date.nullish() })
const available = (row: { effectiveFrom: string; effectiveTo?: string | null }, at: string) => row.effectiveFrom <= at
  && (!row.effectiveTo || row.effectiveTo >= at)
export function requireMappingSystems(source: unknown, systemType: string, at: string): StandardCodeSystem[] {
  const parsed = z.array(systemSchema).safeParse(source)
  if (!parsed.success || !unique(parsed.data) || parsed.data.some(row => row.systemType !== systemType || !available(row, at))) {
    throw new Error('标准发布版数据不完整或不适用于当前日期，请重新加载')
  }
  return source as StandardCodeSystem[]
}
export function requireMappingTerms(source: unknown, system: StandardCodeSystem, at: string): StandardTerm[] {
  const parsed = z.array(termSchema).safeParse(source)
  if (!parsed.success || !unique(parsed.data) || parsed.data.some(row => row.codeSystemId !== system.id
    || row.systemCode !== system.code || row.systemName !== system.name || row.systemVersion !== system.version
    || row.authorityType !== system.authorityType || !available(row, at))) {
    throw new Error('标准条目数据不完整或发布版关联不一致，请重新检索')
  }
  return source as StandardTerm[]
}
export function mappingAuthorityMatches(type: StandardMappingType, authority: string) {
  return type === 'INSURANCE' ? authority === 'INSURANCE' : type === 'REGULATORY' ? ['NATIONAL', 'REGULATORY'].includes(authority)
    : type === 'LOCAL' ? ['LOCAL', 'INTERNAL'].includes(authority) : true
}
export type MappingSaveCommand = { input: SaveItemTermMappingInput; system: StandardCodeSystem; term: StandardTerm; replaced?: ItemTermMapping }
const dayBefore = (value: string) => {
  const result = new Date(`${value}T00:00:00Z`); result.setUTCDate(result.getUTCDate() - 1)
  return result.toISOString().slice(0, 10)
}
export function assertMappingSaveCommand(before: ItemTermMappingMaintenance, command: MappingSaveCommand) {
  const { input, system, term, replaced } = command
  const from = input.validFrom, to = input.validTo
  if (!date.safeParse(from).success || (to !== undefined && (!date.safeParse(to).success || to < from))) {
    throw new Error('映射有效期不正确，请核实生效和失效日期')
  }
  requireMappingSystems([system], system.systemType, from); requireMappingTerms([term], system, from)
  if (term.id !== input.conceptId || !mappingAuthorityMatches(input.mappingType, system.authorityType)
    || !['CLINICAL', 'INSURANCE', 'REGULATORY', 'LOCAL'].includes(input.mappingType)
    || !['EXACT', 'EQUIVALENT', 'WIDER', 'NARROWER', 'RELATED'].includes(input.equivalence)
    || typeof input.primaryMapping !== 'boolean') throw new Error('映射用途、标准条目或等价关系尚未确认')
  if ([system, term].some(row => row.effectiveTo && (!to || to > row.effectiveTo!))) {
    throw new Error('映射有效期必须位于发布版和标准条目的有效期内')
  }
  if (replaced) {
    const original = before.history.find(row => row.id === replaced.id)
    if (!original || !same(original, replaced) || replaced.status !== 'ACTIVE' || replaced.mappingType !== input.mappingType
      || input.replacesMappingId !== replaced.id || input.expectedReplacesRevision !== replaced.revision || from <= replaced.validFrom) {
      throw new Error('替代映射的原记录、修订号或生效日期不正确，请重新核实')
    }
  } else if (input.replacesMappingId !== undefined || input.expectedReplacesRevision !== undefined) {
    throw new Error('替代映射的原记录尚未确认')
  }
  for (const row of before.history) {
    if (row.id === replaced?.id || row.mappingType !== input.mappingType || (row.validTo && row.validTo < from) || (to && to < row.validFrom)) continue
    if (row.conceptId === input.conceptId) throw new Error('相同标准条目已存在重叠有效期映射，请核实历史，勿重复提交')
    if (input.primaryMapping && row.primaryMapping && row.systemCode === system.code) throw new Error('该标准体系和用途已存在重叠的主要映射')
  }
}
export function verifyMappingSaveReceipt(source: unknown, before: ItemTermMappingMaintenance, command: MappingSaveCommand) {
  assertMappingSaveCommand(before, command)
  const { input, term, system, replaced } = command
  const result = requireStandardMappings(source, { subjectType: before.subjectType, targetId: before.targetId, businessDate: input.validFrom })
  const fail = (): never => { throw new Error('映射保存结果未确认：返回记录与提交内容不一致，请重新核实映射') }
  if (result.subjectId !== before.subjectId || result.history.length !== before.history.length + 1) return fail()
  for (const original of before.history) {
    const actual = result.history.find(row => row.id === original.id)
    if (!actual) return fail()
    if (original.id !== replaced?.id) { if (!same(original, actual)) return fail(); continue }
    const unchanged = fields.filter(key => !['status', 'revision', 'validTo', 'updatedAt', 'updatedBy'].includes(key))
    if (!same(original, actual, unchanged) || actual.status !== 'SUPERSEDED' || actual.revision <= original.revision
      || actual.validTo !== dayBefore(input.validFrom)) return fail()
  }
  const added = result.history.filter(row => !before.history.some(original => original.id === row.id))
  if (added.length !== 1) return fail()
  const expected: Partial<ItemTermMapping> = { conceptId: input.conceptId, mappingType: input.mappingType,
    equivalence: input.equivalence, primaryMapping: input.primaryMapping, limitation: input.limitation?.trim() || undefined,
    validFrom: input.validFrom, validTo: input.validTo, replacesMappingId: input.replacesMappingId, status: 'ACTIVE',
    codeSystemId: system.id, systemCode: system.code, systemName: system.name, systemVersion: system.version,
    authorityType: system.authorityType, termCode: term.code, termDisplay: term.display }
  if ((Object.keys(expected) as Array<keyof ItemTermMapping>).some(key => (added[0][key] ?? null) !== (expected[key] ?? null))) return fail()
  return result
}
export function requireUnchangedMappingSelection(command: MappingSaveCommand, systems: StandardCodeSystem[], terms: StandardTerm[]) {
  const system = systems.find(row => row.id === command.system.id), term = terms.find(row => row.id === command.term.id)
  const sameFields = (a: object, b: object, keys: string[]) => keys.every(key => (a[key as keyof typeof a] ?? null) === (b[key as keyof typeof b] ?? null))
  if (!system || !term || !sameFields(command.system, system, Object.keys(systemSchema.shape))
    || !sameFields(command.term, term, Object.keys(termSchema.shape))) {
    throw new Error('已选标准发布版或条目已变化，请重新检索选择后保存')
  }
}
