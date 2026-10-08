import { describe, expect, it } from 'vitest'
import { requireParameterDefinition } from './parameterDefinitionFacts'

const value = {
  id: 'value', definitionId: 'definition', revision: 0, tenantId: 'tenant', sdParamScopeType: 'TENANT',
  scopeId: 'tenant', scopeCode: 'TENANT:tenant', sdParamValueMode: 'OVERRIDE', hasValue: true,
  secretReference: false, valueJson: '""', displayValue: '""', sdParamStatus: 'ACTIVE', updatedAt: '2026-10-03T00:00:00Z',
}
const definition = {
  id: 'definition', revision: 0, key: 'test.setting', name: '参数', categoryId: 'category', categoryName: '分类',
  sdParamValueType: 'STRING', sdParamControlType: 'TEXT', sdParamConfigType: 'SYSTEM',
  sdParamSensitivity: 'NORMAL', sdParamDisplayPolicy: 'PLAIN', sdParamStatus: 'INACTIVE',
  inheritanceEnabled: false, cacheEnabled: false, nullableValue: false, hasDefaultValue: false, hasExampleValue: false,
  allowedScopes: ['TENANT'], values: [value], createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
}
const read = (source: unknown) => requireParameterDefinition(source, 'definition', 'tenant')

describe('parameter detail facts', () => {
  it('preserves exact verified facts including false, zero and an empty string value', () => {
    expect(read(definition)).toBe(definition)
    expect(read(Object.freeze({ ...definition, allowedScopes: [] })).allowedScopes).toEqual([])
  })

  it.each(['sdParamValueType', 'sdParamControlType', 'sdParamConfigType', 'sdParamSensitivity', 'sdParamDisplayPolicy', 'sdParamStatus',
    'inheritanceEnabled', 'cacheEnabled', 'nullableValue', 'hasDefaultValue', 'hasExampleValue', 'allowedScopes', 'revision'])
  ('does not invent missing %s', key => {
    for (const invalid of [undefined, null, 'UNKNOWN']) expect(() => read({ ...definition, [key]: invalid })).toThrow(/未确认/)
  })

  it.each([
    { id: 'another' }, { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { sdParamControlType: 'NUMBER' },
    { sdParamValueType: 'toString' }, { allowedScopes: ['TENANT', 'TENANT'] }, { allowedScopes: ['HOSPITAL'] },
    { dependencySatisfied: 'false' }, { dependsOnKey: 'parent.key' }, { dependencyBehavior: 'UNKNOWN' },
    { jsonSchema: {} }, { defaultValueJson: '"invented"' }, { createdAt: '2026-02-30T00:00:00Z' },
  ])('rejects contradictory definition facts %j', patch => {
    expect(() => read({ ...definition, ...patch })).toThrow(/参数详情/)
  })

  it('keeps unknown dependency previews and schema/content repair paths explicit', () => {
    const source = { ...definition, dependsOnKey: 'parent.key', dependencyBehavior: 'HIDE', dependencySatisfied: null,
      jsonSchema: '{invalid historical schema', hasDefaultValue: true, hasExampleValue: true }
    expect(read(source)).toBe(source)
    expect(read({ ...source, defaultValueJson: 'null' }).defaultValueJson).toBe('null')
  })

  it.each([
    { definitionId: 'another' }, { tenantId: 'another' }, { scopeId: 'another' }, { scopeCode: 'TENANT:another' },
    { revision: undefined }, { sdParamValueMode: undefined }, { sdParamScopeType: 'UNKNOWN' }, { sdParamStatus: undefined },
    { hasValue: undefined }, { hasValue: false }, { secretReference: undefined }, { secretReference: true },
    { valueJson: undefined }, { valueJson: 'not JSON' }, { valueJson: 'true', displayValue: 'true' }, { valueJson: 'null', displayValue: 'null' },
    { displayValue: undefined }, { updatedAt: 'yesterday' }, { scopeReference: 'EXTRA' },
  ])('rejects incomplete or inconsistent current values %j', patch => {
    expect(() => read({ ...definition, values: [{ ...value, ...patch }] })).toThrow(/参数详情/)
  })

  it.each([null, [null], [value, value], [value, { ...value, id: 'different' }]])('rejects absent, invalid or duplicate values %j', values => {
    expect(() => read({ ...definition, values })).toThrow(/参数详情/)
  })

  it.each(['PLATFORM', 'TENANT', 'ORGANIZATION', 'DEPARTMENT', 'USER', 'PRODUCT', 'MODULE', 'ENVIRONMENT'])
  ('checks the canonical %s target without requiring it to be the currently selected organization', scope => {
    const global = scope === 'PLATFORM', named = ['PRODUCT', 'MODULE', 'ENVIRONMENT'].includes(scope)
    const scopeId = global || named ? null : scope === 'TENANT' ? 'tenant' : 'other-id'
    const source = { ...definition, values: [{ ...value, sdParamScopeType: scope, tenantId: global ? null : 'tenant',
      scopeId, scopeReference: named ? 'CODE' : null,
      scopeCode: global ? 'PLATFORM' : named ? `${scope}:tenant:CODE` : `${scope}:${scopeId}` }] }
    expect(read(source)).toBe(source)
  })

  it.each(['INHERIT', 'RESET_DEFAULT', 'EXPLICIT_NULL'])('preserves verified non-override mode %s', mode => {
    const source = { ...definition, values: [{ ...value, sdParamValueMode: mode, hasValue: false, valueJson: null, displayValue: null }] }
    expect(read(source)).toBe(source)
    expect(() => read({ ...source, values: [{ ...source.values[0], valueJson: '"stale"' }] })).toThrow(/明文内容/)
  })

  it.each(['NORMAL', 'SENSITIVE', 'SECRET'])('preserves protected %s content flags without inventing hidden contents', sensitivity => {
    const source = { ...definition, sdParamSensitivity: sensitivity, sdParamDisplayPolicy: 'MASKED', hasExampleValue: true,
      values: [{ ...value, secretReference: sensitivity === 'SECRET', valueJson: null, displayValue: '******' }] }
    expect(read(source)).toBe(source)
    expect(() => read({ ...source, exampleValueJson: '"leaked"' })).toThrow(/内容状态不一致/)
    expect(() => read({ ...source, values: [{ ...source.values[0], valueJson: '"leaked"' }] })).toThrow(/明文内容/)
  })

  it.each(['1e400', '1e-400', '1.000000000000000000001'])('preserves exact numeric content %s', json => {
    const source = { ...definition, sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER',
      values: [{ ...value, valueJson: json, displayValue: json }] }
    expect(read(source)).toBe(source)
  })

  it.each(['{"a":1,"a":2}', '{"a":1} {}', 'false'])('rejects malformed or non-object JSON content %s', json => {
    expect(() => read({ ...definition, sdParamValueType: 'JSON', sdParamControlType: 'JSON_EDITOR',
      values: [{ ...value, valueJson: json, displayValue: json }] })).toThrow(/JSON/)
  })
})
