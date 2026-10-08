import type {
  ConfigurationDependencyBehavior, ParameterConfigType, ParameterControlType, ParameterDefinition,
  ParameterDisplayPolicy, ParameterScope, ParameterSensitivity, ParameterStatus, ParameterValueMode, ParameterValueType,
} from '../../shared/api/configurationApi'
import { isIsoInstant } from '../../shared/validation/instant'
import { isParameterJsonNumber, parseParameterJson } from './parameterJson'

// Wire protocol, not UI options. Exhaustive maps keep this boundary aligned with generated types.
const controls: Record<ParameterControlType, true> = { TEXT: true, TEXTAREA: true, NUMBER: true, SWITCH: true, SELECT: true, JSON_EDITOR: true, SECRET_REFERENCE: true }
const types: Record<ParameterValueType, ParameterControlType[]> = {
  STRING: ['TEXT', 'TEXTAREA', 'SELECT', 'SECRET_REFERENCE'], NUMBER: ['NUMBER', 'SELECT'],
  BOOLEAN: ['SWITCH', 'SELECT'], JSON: ['JSON_EDITOR'],
}
const scopes: Record<ParameterScope, true> = { PLATFORM: true, TENANT: true, ORGANIZATION: true, DEPARTMENT: true, USER: true, PRODUCT: true, MODULE: true, ENVIRONMENT: true }
const modes: Record<ParameterValueMode, true> = { INHERIT: true, OVERRIDE: true, RESET_DEFAULT: true, EXPLICIT_NULL: true }
const configs: Record<ParameterConfigType, true> = { BUSINESS: true, SYSTEM: true }
const sensitivities: Record<ParameterSensitivity, true> = { NORMAL: true, SENSITIVE: true, SECRET: true }
const policies: Record<ParameterDisplayPolicy, true> = { PLAIN: true, MASKED: true, HIDDEN: true }
const statuses: Record<ParameterStatus, true> = { ACTIVE: true, INACTIVE: true }
const behaviors: Record<ConfigurationDependencyBehavior, true> = { DISABLE_AND_SUPPRESS: true, HIDE: true }

export function parameterControlsFor(type: ParameterValueType): ParameterControlType[] { return types[type] }

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const optionalText = (value: unknown) => value == null || typeof value === 'string'
const revision = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const member = <T extends string>(map: Record<T, unknown>, value: unknown): value is T => typeof value === 'string' && Object.hasOwn(map, value)

/** Reject missing facts instead of letting the edit form turn them into creation defaults. */
export function requireParameterDefinition(source: unknown, expectedId: string, tenantId: string): ParameterDefinition {
  const fail = (reason: string): never => { throw new Error(`参数详情返回数据不完整或不一致：${reason}，请重新加载`) }
  if (!record(source)) return fail('缺少参数定义')
  if (!text(source.id) || source.id !== expectedId || !revision(source.revision)) return fail('参数标识或修订号未确认')
  for (const key of ['key', 'name', 'categoryId', 'categoryName']) if (!text(source[key])) fail('参数键、名称或分类未确认')
  if (!member(types, source.sdParamValueType) || !member(controls, source.sdParamControlType)
    || !types[source.sdParamValueType].includes(source.sdParamControlType)) return fail('值类型或控件类型未确认')
  if (!member(configs, source.sdParamConfigType) || !member(sensitivities, source.sdParamSensitivity)
    || !member(policies, source.sdParamDisplayPolicy) || !member(statuses, source.sdParamStatus)) return fail('配置属性、安全策略或状态未确认')
  for (const [key, label] of Object.entries({ inheritanceEnabled: '继承策略', cacheEnabled: '缓存策略', nullableValue: '空值策略',
    hasDefaultValue: '默认值存在状态', hasExampleValue: '示例值存在状态' })) {
    if (typeof source[key] !== 'boolean') fail(`${label}未确认`)
  }
  // An explicitly empty scope set remains editable; an absent set is not equivalent to it.
  if (!Array.isArray(source.allowedScopes) || source.allowedScopes.some(scope => !member(scopes, scope))
    || new Set(source.allowedScopes).size !== source.allowedScopes.length) return fail('参数级别未确认')
  for (const key of ['description', 'jsonSchema', 'unit', 'dictionaryCode', 'defaultValueJson', 'exampleValueJson', 'dependsOnKey', 'dependsOnValue', 'dependsOnName']) {
    if (!optionalText(source[key])) fail('参数文本字段格式错误')
  }
  if ((source.dependsOnKey || source.dependencyBehavior != null) && !member(behaviors, source.dependencyBehavior)) fail('依赖策略未确认')
  if (source.dependencySatisfied != null && typeof source.dependencySatisfied !== 'boolean') fail('依赖预览状态无效')
  if (!isIsoInstant(source.createdAt) || !isIsoInstant(source.updatedAt)) fail('参数时间无效')
  const reveal = source.sdParamSensitivity === 'NORMAL' && source.sdParamDisplayPolicy === 'PLAIN'
  const valueType = source.sdParamValueType
  function checkJson(value: unknown, allowNull = false) {
    if (typeof value !== 'string') return fail('参数内容未确认')
    try {
      const parsed = parseParameterJson(value)
      if (parsed === null && allowNull) return // Existing null defaults can be explicitly repaired in the editor.
      const matches = valueType === 'STRING' ? typeof parsed === 'string'
        : valueType === 'BOOLEAN' ? typeof parsed === 'boolean'
          : valueType === 'NUMBER' ? isParameterJsonNumber(parsed)
            : parsed !== null && typeof parsed === 'object' && !isParameterJsonNumber(parsed)
      if (!matches) fail('参数内容与值类型不符')
    } catch { fail('参数内容不是有效的声明类型 JSON') }
  }
  for (const [content, flag] of [['defaultValueJson', 'hasDefaultValue'], ['exampleValueJson', 'hasExampleValue']]) {
    if (source[content] != null) {
      if (!source[flag] || !reveal) fail('默认值或示例值的内容状态不一致')
      checkJson(source[content], content === 'defaultValueJson')
    }
    // Plaintext flagged present but omitted is handled by the editor's persistent retry/replace flow.
  }
  if (!Array.isArray(source.values)) return fail('当前值列表未确认')
  const ids = new Set<string>(), targets = new Set<string>()
  for (const value of source.values) {
    if (!record(value) || !text(value.id) || value.definitionId !== expectedId || !revision(value.revision)) return fail('当前值标识或修订号未确认')
    if (!member(scopes, value.sdParamScopeType) || !member(modes, value.sdParamValueMode)
      || !member(statuses, value.sdParamStatus)) return fail('当前值作用域、模式或状态未确认')
    if (typeof value.hasValue !== 'boolean' || typeof value.secretReference !== 'boolean'
      || !isIsoInstant(value.updatedAt)) return fail('当前值内容状态或时间未确认')
    const scope = value.sdParamScopeType
    const global = scope === 'PLATFORM', tenant = scope === 'TENANT'
    const named = scope === 'PRODUCT' || scope === 'MODULE' || scope === 'ENVIRONMENT'
    if (global ? value.tenantId != null : value.tenantId !== tenantId) fail('当前值租户不匹配')
    if (global || named ? value.scopeId != null : tenant ? value.scopeId !== tenantId : !text(value.scopeId)) fail('当前值作用域标识无效')
    if (named ? !text(value.scopeReference) : value.scopeReference != null) fail('当前值作用域编码无效')
    if (named && value.scopeReference !== String(value.scopeReference).trim().toUpperCase()) fail('当前值作用域编码不是规范编码')
    const code = global ? 'PLATFORM' : named ? `${scope}:${tenantId}:${value.scopeReference}` : `${scope}:${value.scopeId}`
    if (value.scopeCode !== code || ids.has(value.id) || targets.has(code)) fail('当前值目标不一致或重复')
    ids.add(value.id); targets.add(code)
    const override = value.sdParamValueMode === 'OVERRIDE'
    if (value.hasValue !== override || value.secretReference !== (override && source.sdParamSensitivity === 'SECRET')) fail('当前值模式与内容状态不一致')
    if (reveal && override) checkJson(value.valueJson)
    else if (value.valueJson != null) fail('当前值不应包含明文内容')
    const display = source.sdParamDisplayPolicy === 'MASKED' && override ? '******' : reveal && override ? value.valueJson : null
    if ((value.displayValue ?? null) !== display) fail('当前值展示内容不一致')
  }
  return source as unknown as ParameterDefinition
}
