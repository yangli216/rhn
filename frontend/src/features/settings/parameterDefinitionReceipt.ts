import type { ParameterDefinition, ParameterDefinitionInput } from '../../shared/api/configurationApi'
import { requireParameterDefinition } from './parameterDefinitionFacts'

export type ParameterDefinitionCommand =
  | { kind: 'create'; input: ParameterDefinitionInput }
  | { kind: 'update'; before: ParameterDefinition; input: ParameterDefinitionInput }
  | { kind: 'status'; before: ParameterDefinition; enabled: boolean }

const storedText = (value: string | null | undefined) => value?.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '') || null
const fail = (reason: string): never => { throw new Error(`保存未确认：${reason} 请保留草稿，重新核实后再操作。`) }

export function requireSavedParameterDefinition(command: ParameterDefinitionCommand, result: unknown, tenantId: string): ParameterDefinition {
  const before = command.kind === 'create' ? undefined : command.before
  let next: ParameterDefinition
  try {
    const id = before?.id ?? (result as ParameterDefinition | null)?.id ?? ''
    next = requireParameterDefinition(result, id, tenantId)
  } catch (error) { return fail(error instanceof Error ? error.message : '返回的定义资料不完整。') }
  if (before && (next.key !== before.key || next.revision <= before.revision)) fail('返回的参数键或修订号未确认本次变更。')
  const status = command.kind === 'status' ? command.enabled ? 'ACTIVE' : 'INACTIVE' : before?.sdParamStatus ?? 'ACTIVE'
  if (next.sdParamStatus !== status) fail('返回的启用状态与提交不符。')
  if (command.kind === 'status') {
    const fields = ['key', 'name', 'categoryId', 'description', 'sdParamValueType', 'sdParamControlType', 'sdParamConfigType',
      'jsonSchema', 'defaultValueJson', 'exampleValueJson', 'hasDefaultValue', 'hasExampleValue', 'unit', 'dictionaryCode',
      'inheritanceEnabled', 'cacheEnabled', 'nullableValue', 'sdParamSensitivity', 'sdParamDisplayPolicy',
      'dependsOnKey', 'dependsOnValue', 'dependencyBehavior'] as const
    if (fields.some(field => (next[field] ?? null) !== (command.before[field] ?? null))
      || !sameScopes(next.allowedScopes, command.before.allowedScopes)) fail('启停结果同时改变了其他定义内容。')
    return next
  }
  const input = command.input
  const expected = {
    key: storedText(input.key)?.toLowerCase(), name: storedText(input.name), categoryId: input.categoryId,
    description: storedText(input.description), jsonSchema: storedText(input.jsonSchema), unit: storedText(input.unit),
    dictionaryCode: storedText(input.dictionaryCode)?.toUpperCase() ?? null,
    sdParamValueType: input.valueType, sdParamControlType: input.controlType, sdParamConfigType: input.category,
    inheritanceEnabled: input.inheritanceEnabled, cacheEnabled: input.cacheEnabled, nullableValue: input.nullableValue,
    sdParamSensitivity: input.sensitivity, sdParamDisplayPolicy: input.displayPolicy,
    dependsOnKey: storedText(input.dependsOnKey), dependsOnValue: storedText(input.dependsOnValue),
    dependencyBehavior: input.dependencyBehavior ?? 'DISABLE_AND_SUPPRESS',
  }
  for (const field of Object.keys(expected) as Array<keyof typeof expected>) {
    if ((next[field] ?? null) !== expected[field]) fail('返回的定义内容或策略与提交不符。')
  }
  if (!sameScopes(next.allowedScopes, input.allowedScopes)) fail('返回的参数级别与提交不符。')
  const protectedBefore = before && (before.sdParamSensitivity !== 'NORMAL' || before.sdParamDisplayPolicy !== 'PLAIN')
  const reveal = next.sdParamSensitivity === 'NORMAL' && next.sdParamDisplayPolicy === 'PLAIN'
  for (const [content, flag] of [['defaultValueJson', 'hasDefaultValue'], ['exampleValueJson', 'hasExampleValue']] as const) {
    const retainProtected = protectedBefore && input[content] == null && (content !== 'defaultValueJson' || input.sensitivity !== 'SECRET')
    const expectedText = storedText(input[content])
    const expectedPresent = retainProtected ? before[flag] : expectedText !== null
    if (next[flag] !== expectedPresent) fail('默认值或示例值的存在状态与提交不符。')
    // Protected existing text is intentionally absent from the source response; verify its presence without inventing it.
    if (reveal && expectedPresent && retainProtected) {
      if (next[content] == null) fail('返回的默认值或示例值正文缺失。')
    } else if ((next[content] ?? null) !== (reveal ? expectedText : null)) fail('返回的默认值或示例值内容与提交不符。')
  }
  return next
}

function sameScopes(actual: string[], expected: string[]) {
  return actual.length === expected.length && expected.every(scope => actual.includes(scope))
}
