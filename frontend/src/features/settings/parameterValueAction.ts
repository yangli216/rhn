import type { ParameterChange, ParameterDefinition, ParameterValue, ParameterValueMode } from '../../shared/api/configurationApi'
import { isIsoInstant } from '../../shared/validation/instant'
import { requireParameterDefinition } from './parameterDefinitionFacts'
import { isParameterJsonNumber, parseParameterJson } from './parameterJson'

export type ParameterValueAction =
  | { kind: 'status'; before: ParameterDefinition; value: ParameterValue; enabled: boolean }
  | { kind: 'rollback'; before: ParameterDefinition; value: ParameterValue; change: ParameterChange }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const modes: Record<ParameterValueMode, true> = { OVERRIDE: true, INHERIT: true, RESET_DEFAULT: true, EXPLICIT_NULL: true }
const changeTypes: Record<ParameterChange['sdParamChangeType'], true> = { CREATE: true, UPDATE: true, ENABLE: true, DISABLE: true, RESET: true, ROLLBACK: true }
const fail = (reason: string): never => { throw new Error(reason) }

export function requireParameterChanges(source: unknown, definitionId: string): ParameterChange[] {
  if (!Array.isArray(source)) return fail('参数变更记录返回数据不完整，请重新加载')
  const ids = new Set<string>()
  for (const change of source) {
    if (!record(change) || !text(change.id) || ids.has(change.id) || change.definitionId !== definitionId
      || !text(change.requestCode) || !text(change.changedBy) || !isIsoInstant(change.changedAt)
      || !text(change.sdParamChangeType) || !Object.hasOwn(changeTypes, change.sdParamChangeType)
      || change.sdParamChangeTargetType !== 'DEFINITION' && change.sdParamChangeTargetType !== 'VALUE'
      || change.reason != null && typeof change.reason !== 'string'
      || (change.sdParamChangeTargetType === 'VALUE' ? !text(change.valueId) : change.valueId != null)) {
      return fail('参数变更记录的目标、类型或操作信息未确认，请重新加载')
    }
    ids.add(change.id)
  }
  return source as ParameterChange[]
}

function rollbackTarget(definition: ParameterDefinition, change: ParameterChange) {
  if (change.definitionId !== definition.id || change.sdParamChangeTargetType !== 'VALUE') return fail('历史记录不属于当前参数值')
  const value = definition.values.find(item => item.id === change.valueId)
  if (!value) return fail('历史记录对应的当前值不可见')
  const snapshot: unknown = change.after
  if (!record(snapshot)) return fail('历史恢复快照未返回或不是完整对象')
  if (typeof snapshot.active !== 'boolean') return fail('历史启用状态未确认')
  if (!text(snapshot.valueMode) || !Object.hasOwn(modes, snapshot.valueMode)) return fail('历史值模式未确认')
  for (const key of ['valueJson', 'secretRef', 'scopeReference']) {
    if (!Object.hasOwn(snapshot, key) || snapshot[key] !== null && typeof snapshot[key] !== 'string') return fail('历史内容或作用域字段缺失、类型错误')
  }
  const scopeId = snapshot.scopeId === null ? null : typeof snapshot.scopeId === 'string' ? snapshot.scopeId
    : typeof snapshot.scopeId === 'number' && Number.isSafeInteger(snapshot.scopeId) ? String(snapshot.scopeId) : undefined
  if (scopeId === undefined || scopeId !== (value.scopeId ?? null) || snapshot.scopeType !== value.sdParamScopeType
    || snapshot.scopeCode !== value.scopeCode || snapshot.scopeReference !== (value.scopeReference ?? null)) return fail('历史快照作用域与当前值不一致')
  const mode = snapshot.valueMode as ParameterValueMode
  const reveal = definition.sdParamSensitivity === 'NORMAL' && definition.sdParamDisplayPolicy === 'PLAIN'
  if (mode === 'OVERRIDE') {
    if (definition.sdParamSensitivity === 'SECRET') {
      if (!text(snapshot.secretRef) || snapshot.valueJson !== null) return fail('历史密钥引用未确认')
    } else {
      if (snapshot.secretRef !== null) return fail('历史内容与参数敏感级别不一致')
      if (reveal) {
        if (typeof snapshot.valueJson !== 'string') return fail('历史明文内容未返回')
        try {
          const content = parseParameterJson(snapshot.valueJson)
          const valid = definition.sdParamValueType === 'STRING' ? typeof content === 'string'
            : definition.sdParamValueType === 'BOOLEAN' ? typeof content === 'boolean'
              : definition.sdParamValueType === 'NUMBER' ? isParameterJsonNumber(content)
                : content !== null && typeof content === 'object' && !isParameterJsonNumber(content)
          if (!valid) return fail('历史内容与声明类型不符')
        } catch { return fail('历史内容不是有效的声明类型 JSON') }
      } else if (snapshot.valueJson !== null) return fail('受保护历史内容未按隐藏策略返回')
    }
  } else if (snapshot.valueJson !== null || snapshot.secretRef !== null) return fail('历史值模式与内容不一致')
  return { value, mode, active: snapshot.active, valueJson: snapshot.valueJson as string | null }
}

export function parameterRollbackIssue(definition: ParameterDefinition, change: ParameterChange): string | undefined {
  try { rollbackTarget(definition, change); return undefined } catch (error) { return error instanceof Error ? error.message : '历史快照未确认' }
}

export function prepareParameterRollback(definition: ParameterDefinition, change: ParameterChange): ParameterValueAction {
  return { kind: 'rollback', before: definition, value: rollbackTarget(definition, change).value, change }
}

export function requireParameterValueActionResult(command: ParameterValueAction, source: unknown, tenantId: string): ParameterDefinition {
  const unconfirmed = (reason: string): never => fail(`操作未确认：${reason} 请重新核实或重试本次操作。`)
  let next: ParameterDefinition
  try { next = requireParameterDefinition(source, command.before.id, tenantId) }
  catch (error) { return unconfirmed(error instanceof Error ? error.message : '返回数据不完整') }
  const before = command.before, original = command.value
  if (next.key !== before.key || next.revision < before.revision || next.sdParamValueType !== before.sdParamValueType
    || next.sdParamSensitivity !== before.sdParamSensitivity || next.sdParamDisplayPolicy !== before.sdParamDisplayPolicy) return unconfirmed('参数定义已变化')
  const saved = next.values.find(value => value.id === original.id)
  if (!saved || saved.revision <= original.revision || saved.sdParamScopeType !== original.sdParamScopeType
    || saved.scopeCode !== original.scopeCode || (saved.scopeId ?? null) !== (original.scopeId ?? null)
    || (saved.scopeReference ?? null) !== (original.scopeReference ?? null) || (saved.tenantId ?? null) !== (original.tenantId ?? null)) return unconfirmed('当前值目标或新修订未确认')
  if (command.kind === 'status') {
    if (saved.sdParamStatus !== (command.enabled ? 'ACTIVE' : 'INACTIVE')) return unconfirmed('返回状态与提交不符')
    for (const key of ['sdParamValueMode', 'valueJson', 'displayValue', 'hasValue', 'secretReference'] as const) {
      if ((saved[key] ?? null) !== (original[key] ?? null)) return unconfirmed('启停结果改变了参数内容')
    }
  } else {
    let target: ReturnType<typeof rollbackTarget>
    try { target = rollbackTarget(before, command.change) } catch (error) { return unconfirmed(error instanceof Error ? error.message : '历史目标未确认') }
    if (target.value.id !== original.id || saved.sdParamValueMode !== target.mode || saved.sdParamStatus !== (target.active ? 'ACTIVE' : 'INACTIVE')) return unconfirmed('返回模式或状态与历史快照不符')
    const reveal = before.sdParamSensitivity === 'NORMAL' && before.sdParamDisplayPolicy === 'PLAIN'
    const expected = reveal && target.mode === 'OVERRIDE' ? target.valueJson?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') : null
    if ((saved.valueJson ?? null) !== expected) return unconfirmed('返回内容与历史快照不符')
    // requireParameterDefinition also checks presence, secret flags and protected display against the restored mode.
  }
  return next
}
