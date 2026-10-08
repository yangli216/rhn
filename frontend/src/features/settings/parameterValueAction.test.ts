import { describe, expect, it } from 'vitest'
import type { ParameterChange, ParameterDefinition, ParameterValue } from '../../shared/api/configurationApi'
import { parameterRollbackIssue, prepareParameterRollback, requireParameterChanges, requireParameterValueActionResult, type ParameterValueAction } from './parameterValueAction'

const value: ParameterValue = { id: 'value', definitionId: 'definition', revision: 2, tenantId: 'tenant', scopeId: 'tenant',
  sdParamScopeType: 'TENANT', sdParamScopeTypeText: '租户', scopeCode: 'TENANT:tenant', sdParamValueMode: 'OVERRIDE',
  sdParamValueModeText: '覆盖', valueJson: '"current"', displayValue: '"current"', hasValue: true, secretReference: false,
  sdParamStatus: 'ACTIVE', sdParamStatusText: '启用', updatedAt: '2026-10-03T00:00:00Z' }
const definition: ParameterDefinition = { id: 'definition', revision: 1, key: 'test.setting', name: '参数', categoryId: 'category', categoryName: '分类',
  sdParamValueType: 'STRING', sdParamValueTypeText: '字符串', sdParamControlType: 'TEXT', sdParamControlTypeText: '文本',
  sdParamConfigType: 'SYSTEM', sdParamConfigTypeText: '系统参数', sdParamStatus: 'ACTIVE', sdParamStatusText: '启用',
  sdParamSensitivity: 'NORMAL', sdParamSensitivityText: '普通', sdParamDisplayPolicy: 'PLAIN', sdParamDisplayPolicyText: '明文',
  inheritanceEnabled: true, cacheEnabled: true, nullableValue: true, allowedScopes: ['TENANT'], hasDefaultValue: false, hasExampleValue: false,
  values: [value], createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }
const snapshot = { scopeType: 'TENANT', scopeId: 'tenant', scopeReference: null, scopeCode: 'TENANT:tenant', valueMode: 'OVERRIDE',
  valueJson: '"historical"', secretRef: null, active: false }
const history = { id: 'change', definitionId: 'definition', valueId: 'value', sdParamChangeTargetType: 'VALUE', sdParamChangeTargetTypeText: '当前值',
  sdParamChangeType: 'UPDATE', sdParamChangeTypeText: '更新', requestCode: 'request', changedBy: 'user', changedAt: '2026-10-03T00:00:00Z', after: snapshot } as ParameterChange
const status: ParameterValueAction = { kind: 'status', before: definition, value, enabled: false }
const result = (patch: Partial<ParameterValue> = {}) => ({ ...definition, values: [{ ...value, revision: 3, sdParamStatus: 'INACTIVE' as const, ...patch }] })

describe('parameter value actions', () => {
  it('confirms status changes only with the same target/content and a newer revision', () => {
    const saved = result()
    expect(requireParameterValueActionResult(status, saved, 'tenant')).toBe(saved)
  })
  it.each([{}, { id: 'other' }, { revision: 2 }, { sdParamStatus: 'ACTIVE' }, { scopeId: 'other' }, { tenantId: 'other' },
    { valueJson: '"changed"', displayValue: '"changed"' }, { sdParamValueMode: 'EXPLICIT_NULL', hasValue: false, valueJson: undefined, displayValue: undefined }])
  ('rejects an unconfirmed status result %j', patch => {
    const source = Object.keys(patch).length ? result(patch as Partial<ParameterValue>) : definition
    expect(() => requireParameterValueActionResult(status, source, 'tenant')).toThrow(/操作未确认/)
  })
  it('confirms the historical mode, content and status together', () => {
    const command = prepareParameterRollback(definition, history)
    const saved = result({ valueJson: '"historical"', displayValue: '"historical"' })
    expect(requireParameterValueActionResult(command, saved, 'tenant')).toBe(saved)
    for (const source of [definition, result(), result({ sdParamStatus: 'ACTIVE' })]) {
      expect(() => requireParameterValueActionResult(command, source, 'tenant')).toThrow(/操作未确认/)
    }
  })
  it.each([{ active: undefined }, { active: 'false' }, { active: 0 }, { valueMode: undefined }, { valueMode: 'OTHER' },
    { scopeId: undefined }, { scopeId: 9007199254740992 }, { scopeId: 'another' }, { scopeCode: 'TENANT:another' },
    { scopeType: 'PLATFORM' }, { scopeReference: undefined }, { secretRef: undefined }, { valueJson: undefined },
    { valueJson: false }, { valueJson: 'null' }, { valueJson: 'invalid JSON' }])
  ('does not invent missing or coerce malformed snapshot facts %j', patch => {
    const change = { ...history, after: { ...snapshot, ...patch } } as ParameterChange
    expect(parameterRollbackIssue(definition, change)).toEqual(expect.any(String))
    expect(() => prepareParameterRollback(definition, change)).toThrow()
  })
  it.each([undefined, null, [], true])('rejects absent/non-object snapshots %j', after => {
    expect(parameterRollbackIssue(definition, { ...history, after } as ParameterChange)).toMatch(/快照/)
  })
  it('rejects history for another definition or an invisible current value', () => {
    expect(parameterRollbackIssue(definition, { ...history, definitionId: 'another' })).toMatch(/不属于/)
    expect(parameterRollbackIssue(definition, { ...history, valueId: 'another' })).toMatch(/不可见/)
  })
  it.each(['INHERIT', 'EXPLICIT_NULL', 'RESET_DEFAULT'])('confirms explicit non-override mode %s', mode => {
    const change = { ...history, after: { ...snapshot, valueMode: mode, valueJson: null } } as ParameterChange
    const command = prepareParameterRollback(definition, change)
    const saved = result({ sdParamValueMode: mode as ParameterValue['sdParamValueMode'], valueJson: undefined, displayValue: undefined, hasValue: false })
    expect(requireParameterValueActionResult(command, saved, 'tenant')).toBe(saved)
  })
  it.each(['1e400', '1e-400', '1.00000000000000000001'])('preserves exact historical numeric content %s', raw => {
    const numeric = { ...definition, sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER', values: [{ ...value, valueJson: '2', displayValue: '2' }] } as ParameterDefinition
    const change = { ...history, after: { ...snapshot, valueJson: raw } } as ParameterChange
    const command = prepareParameterRollback(numeric, change)
    const saved = { ...numeric, values: [{ ...numeric.values[0], revision: 3, sdParamStatus: 'INACTIVE' as const, valueJson: raw, displayValue: raw }] }
    expect(requireParameterValueActionResult(command, saved, 'tenant')).toBe(saved)
  })
  it.each(['SENSITIVE', 'SECRET'])('confirms protected %s snapshots without requesting hidden plaintext', sensitivity => {
    const protectedValue = { ...value, valueJson: undefined, displayValue: undefined, secretReference: sensitivity === 'SECRET' }
    const protectedDefinition = { ...definition, sdParamSensitivity: sensitivity, sdParamDisplayPolicy: 'HIDDEN',
      sdParamControlType: sensitivity === 'SECRET' ? 'SECRET_REFERENCE' : 'TEXT', values: [protectedValue] } as ParameterDefinition
    const change = { ...history, after: { ...snapshot, valueJson: null, secretRef: sensitivity === 'SECRET' ? 'vault:ref' : null } } as ParameterChange
    const command = prepareParameterRollback(protectedDefinition, change)
    const saved = { ...protectedDefinition, values: [{ ...protectedValue, revision: 3, sdParamStatus: 'INACTIVE' as const }] }
    expect(requireParameterValueActionResult(command, saved, 'tenant')).toBe(saved)
  })
  it.each([null, [null], [{ ...history, id: undefined }], [history, history], [{ ...history, definitionId: 'other' }],
    [{ ...history, changedBy: null }], [{ ...history, changedAt: '2026-02-30T00:00:00Z' }], [{ ...history, sdParamChangeType: 'OTHER' }]])
  ('rejects incomplete or mismatched history lists %j', source => expect(() => requireParameterChanges(source, 'definition')).toThrow(/变更记录/))
  it('preserves confirmed empty history and leaves unavailable snapshots visibly unavailable', () => {
    expect(requireParameterChanges([], 'definition')).toEqual([])
    const source = [{ ...history, after: undefined }]
    expect(requireParameterChanges(source, 'definition')).toBe(source)
    expect(parameterRollbackIssue(definition, source[0])).toMatch(/未返回/)
  })
})
