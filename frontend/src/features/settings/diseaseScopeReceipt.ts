import { z } from 'zod'
import type { DiseaseManagementProgram, DiseaseManagementRule, DiseaseManagementExceptionInput } from '../../shared/rhnApi'

const text = z.string().refine(value => value.trim().length > 0)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const mode = z.enum(['INCLUDE', 'EXCLUDE'])
const domain = z.enum(['WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME'])
const conceptType = z.enum(['DISEASE', 'SYMPTOM', 'SIGN', 'CONDITION', 'SYNDROME'])
const ruleInput = z.object({ inclusionMode: mode, sdDiagnosisDomain: domain.nullish(), codeSystemId: text.nullish(),
  sdConceptType: conceptType.nullish(), chapterCode: z.string().max(64).nullish(),
  codeFrom: z.string().max(100).nullish(), codeTo: z.string().max(100).nullish(), note: z.string().max(500).nullish() })
const memberInput = z.object({ conceptId: text, inclusionMode: mode, note: z.string().max(500).nullish() })
const storedRule = z.object({ id: text, inclusionMode: mode, sdDiagnosisDomain: domain.nullable(), codeSystemId: text.nullable(),
  sdConceptType: conceptType.nullable(), chapterCode: z.string().nullable(), codeFrom: z.string().nullable(),
  codeTo: z.string().nullable(), note: z.string().nullable() })
const storedMember = z.object({ conceptId: text, inclusionMode: mode, note: z.string().nullable() })
const program = z.object({ id: text, revision: count, scopeType: z.enum(['PRODUCT', 'TENANT']), scopeId: text, code: text, name: text,
  sdManagementType: text, sdTriggerAction: text, sdStatus: text, effectiveFrom: text, effectiveTo: z.string().nullish(),
  description: z.string().nullish(), reportCardType: z.string().nullish(), reportDeadlineHours: count.positive().nullish(),
  ruleCount: count, exceptionCount: count, rules: z.array(storedRule).max(100), members: z.array(storedMember).max(1000) })
const storedText = (value?: string | null) => value?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') || null
const fail = (reason: string): never => { throw new Error(`保存未确认：${reason}，请保留草稿并重新加载核实`) }

function requireProgram(value: unknown) {
  const parsed = program.safeParse(value)
  if (!parsed.success) return fail('管理项目、规则或例外备注不完整')
  const item = parsed.data
  if (item.ruleCount !== item.rules.length || item.exceptionCount !== item.members.length
    || new Set(item.rules.map(rule => rule.id)).size !== item.rules.length
    || new Set(item.members.map(member => member.conceptId)).size !== item.members.length) return fail('明细数量或身份不一致')
  return item
}

export function prepareDiseaseScopeSave(before: DiseaseManagementProgram, rules: DiseaseManagementRule[], exceptions: DiseaseManagementExceptionInput[]) {
  const base = requireProgram(before)
  const parsedRules = z.array(ruleInput).max(100).safeParse(rules)
  const parsedMembers = z.array(memberInput).max(1000).safeParse(exceptions)
  if (!parsedRules.success || !parsedMembers.success) return fail('待提交范围不完整或超出上限')
  const normalizedRules = parsedRules.data.map(rule => ({ inclusionMode: rule.inclusionMode,
    sdDiagnosisDomain: rule.sdDiagnosisDomain ?? null, codeSystemId: rule.codeSystemId ?? null,
    sdConceptType: rule.sdConceptType ?? null, chapterCode: storedText(rule.chapterCode), codeFrom: storedText(rule.codeFrom),
    codeTo: storedText(rule.codeTo), note: storedText(rule.note) }))
  const normalizedMembers = parsedMembers.data.map(member => ({ ...member, note: storedText(member.note) }))
  if (new Set(normalizedMembers.map(member => member.conceptId)).size !== normalizedMembers.length) return fail('疾病例外标识重复')
  for (const rule of normalizedRules) {
    if (![rule.sdDiagnosisDomain, rule.codeSystemId, rule.sdConceptType, rule.chapterCode, rule.codeFrom, rule.codeTo].some(Boolean)) {
      return fail('疾病规则至少需要一个匹配条件')
    }
    if (rule.codeFrom && rule.codeTo && rule.codeFrom.toUpperCase() > rule.codeTo.toUpperCase()) return fail('编码起始值大于结束值')
  }
  return { before: base, rules: normalizedRules, exceptions: normalizedMembers }
}

export type DiseaseScopeSave = ReturnType<typeof prepareDiseaseScopeSave>
const signature = (items: unknown[]) => items.map(item => JSON.stringify(item)).sort().join('\n')
function ruleValue(rule: z.infer<typeof storedRule> | DiseaseScopeSave['rules'][number]) {
  return { inclusionMode: rule.inclusionMode, sdDiagnosisDomain: rule.sdDiagnosisDomain, codeSystemId: rule.codeSystemId,
    sdConceptType: rule.sdConceptType, chapterCode: rule.chapterCode, codeFrom: rule.codeFrom, codeTo: rule.codeTo, note: rule.note }
}

export function requireDiseaseScopeReceipt(command: DiseaseScopeSave, source: unknown) {
  const saved = requireProgram(source), before = command.before
  if (saved.revision <= before.revision) return fail('修订号未确认本次更新')
  for (const field of ['id', 'scopeType', 'scopeId', 'code', 'name', 'sdManagementType', 'sdTriggerAction', 'sdStatus',
    'effectiveFrom', 'effectiveTo', 'description', 'reportCardType', 'reportDeadlineHours'] as const) {
    if ((saved[field] ?? null) !== (before[field] ?? null)) return fail('返回的管理项目身份或属性与原对象不一致')
  }
  if (signature(saved.rules.map(ruleValue)) !== signature(command.rules.map(ruleValue))
    || signature(saved.members) !== signature(command.exceptions)) return fail('保存内容与提交的规则、例外或备注不一致')
  return saved
}
