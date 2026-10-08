import type { ParameterDefinition, ParameterValueInput } from '../../shared/api/configurationApi'

// Match the scope protocol in ConfigurationApplicationService.validateScope.
function valueTarget(input: ParameterValueInput, tenantId: string) {
  switch (input.scopeType) {
    case 'PLATFORM': return { tenantId: null, scopeId: null, reference: null, code: 'PLATFORM' }
    case 'TENANT': return { tenantId, scopeId: tenantId, reference: null, code: `TENANT:${tenantId}` }
    case 'ORGANIZATION': case 'DEPARTMENT': case 'USER':
      if (!input.scopeId) throw new Error('保存未确认：缺少作用域标识。')
      return { tenantId, scopeId: input.scopeId, reference: null, code: `${input.scopeType}:${input.scopeId}` }
    case 'PRODUCT': case 'MODULE': case 'ENVIRONMENT': {
      const reference = input.scopeReference?.trim().toUpperCase()
      if (!reference) throw new Error('保存未确认：缺少作用域编码。')
      return { tenantId, scopeId: null, reference, code: `${input.scopeType}:${tenantId}:${reference}` }
    }
  }
}

export function requireSavedParameterValue(before: ParameterDefinition, result: ParameterDefinition,
  input: ParameterValueInput, tenantId: string): ParameterDefinition {
  const fail = (reason: string): never => { throw new Error(`保存未确认：${reason} 请保留草稿，重新核实后再操作。`) }
  if (!result || result.id !== before.id || result.key !== before.key || !Array.isArray(result.values)
    || !Number.isSafeInteger(result.revision) || result.revision < before.revision
    || result.sdParamValueType !== before.sdParamValueType || result.sdParamSensitivity !== before.sdParamSensitivity
    || result.sdParamDisplayPolicy !== before.sdParamDisplayPolicy) fail('返回的参数定义不完整或与提交目标不符。')
  const target = valueTarget(input, tenantId)
  const matches = result.values.filter(value => value?.scopeCode === target.code)
  if (matches.length !== 1) fail('返回结果没有唯一匹配的作用域当前值。')
  const saved = matches[0]
  const previous = before.values.find(value => value.scopeCode === target.code)
  if (!saved || typeof saved.id !== 'string' || !saved.id.trim() || saved.definitionId !== before.id
    || saved.sdParamScopeType !== input.scopeType || (saved.scopeId ?? null) !== target.scopeId
    || (saved.scopeReference ?? null) !== target.reference || (saved.tenantId ?? null) !== target.tenantId) {
    fail('返回的当前值属于其他参数或作用域。')
  }
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 0
    || (input.expectedRevision != null
      ? !previous || saved.id !== previous.id || saved.revision <= input.expectedRevision
      : Boolean(previous))) fail('返回的当前值未确认本次修订。')
  if (saved.sdParamValueMode !== input.valueMode || saved.sdParamStatus !== (previous?.sdParamStatus ?? 'ACTIVE')) {
    fail('返回的值模式或启用状态与提交不符。')
  }
  const hasContent = input.valueMode === 'OVERRIDE'
  const isSecret = before.sdParamSensitivity === 'SECRET' && hasContent
  if (saved.hasValue !== hasContent || saved.secretReference !== isSecret) fail('返回的内容状态与提交不符。')
  const reveal = before.sdParamSensitivity === 'NORMAL' && before.sdParamDisplayPolicy === 'PLAIN'
  // The server stores the supplied JSON text with outer ASCII whitespace trimmed.
  // Do not parse through JavaScript Number: distinct large numbers must stay distinct.
  const expectedJson = reveal && hasContent ? input.valueJson?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') : null
  if (reveal && hasContent && expectedJson == null) fail('提交的参数内容缺失。')
  if ((saved.valueJson ?? null) !== expectedJson) fail('返回的参数内容与提交不符。')
  const expectedDisplay = before.sdParamDisplayPolicy === 'MASKED' && hasContent ? '******' : expectedJson
  if ((saved.displayValue ?? null) !== expectedDisplay) fail('返回的显示内容与提交不符。')
  return result
}
