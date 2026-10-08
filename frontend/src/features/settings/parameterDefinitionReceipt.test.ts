import { describe, expect, it } from 'vitest'
import type { ParameterDefinition, ParameterDefinitionInput } from '../../shared/api/configurationApi'
import { requireSavedParameterDefinition, type ParameterDefinitionCommand } from './parameterDefinitionReceipt'

const input: ParameterDefinitionInput = {
  categoryId: 'category', key: 'test.setting', name: '新名称', description: '用途', valueType: 'STRING', controlType: 'TEXT',
  category: 'SYSTEM', inheritanceEnabled: false, cacheEnabled: true, nullableValue: false, sensitivity: 'NORMAL', displayPolicy: 'PLAIN',
  allowedScopes: ['TENANT', 'PLATFORM'], defaultValueJson: '""', exampleValueJson: '"例子"', unit: '次',
}
const saved: ParameterDefinition = {
  id: 'definition', revision: 4, categoryId: 'category', categoryName: '分类', key: 'test.setting', name: '新名称', description: '用途',
  sdParamValueType: 'STRING', sdParamValueTypeText: '字符串', sdParamControlType: 'TEXT', sdParamControlTypeText: '单行文本',
  sdParamConfigType: 'SYSTEM', sdParamConfigTypeText: '系统参数', sdParamStatus: 'ACTIVE', sdParamStatusText: '启用',
  inheritanceEnabled: false, cacheEnabled: true, nullableValue: false, sdParamSensitivity: 'NORMAL', sdParamSensitivityText: '普通',
  sdParamDisplayPolicy: 'PLAIN', sdParamDisplayPolicyText: '明文', allowedScopes: ['PLATFORM', 'TENANT'], values: [],
  defaultValueJson: '""', hasDefaultValue: true, exampleValueJson: '"例子"', hasExampleValue: true, unit: '次',
  dependencyBehavior: 'DISABLE_AND_SUPPRESS', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
}
const before = { ...saved, name: '旧名称', revision: 3 }
const update: ParameterDefinitionCommand = { kind: 'update', before, input }
const check = (result: unknown, command: ParameterDefinitionCommand = update) => requireSavedParameterDefinition(command, result, 'tenant')

describe('parameter definition write confirmation', () => {
  it('accepts a confirmed update without transforming the server response', () => expect(check(saved)).toBe(saved))
  it('accepts revision zero for a newly created definition', () => {
    const result = { ...saved, revision: 0 }
    expect(check(result, { kind: 'create', input })).toBe(result)
  })
  it.each([null, {}, { ...saved, values: null }, { ...saved, id: 'other' }, { ...saved, revision: 3 },
    { ...saved, revision: 2 }, { ...saved, name: '旧名称' }, { ...saved, key: 'other.setting' },
    { ...saved, categoryId: 'other' }, { ...saved, sdParamStatus: 'INACTIVE' }, { ...saved, cacheEnabled: false },
    { ...saved, inheritanceEnabled: true }, { ...saved, nullableValue: true }, { ...saved, sdParamControlType: 'TEXTAREA' },
    { ...saved, allowedScopes: ['TENANT'] }, { ...saved, unit: undefined }, { ...saved, description: '旧说明' },
    { ...saved, defaultValueJson: '"changed"' }, { ...saved, exampleValueJson: '"changed"' },
    { ...saved, hasExampleValue: false, exampleValueJson: undefined }, { ...saved, defaultValueJson: undefined },
    { ...saved, dependsOnKey: 'parent.setting' }, { ...saved, dependsOnValue: 'unknown' }, { ...saved, dependencyBehavior: 'HIDE' },
    { ...saved, jsonSchema: '{"minLength":1}' }, { ...saved, dictionaryCode: 'OTHER' },
  ])('rejects an unconfirmed update %j', result => expect(() => check(result)).toThrow(/保存未确认/))

  it('checks creation content as well as response shape', () => {
    expect(() => check({ ...saved, key: 'another.setting' }, { kind: 'create', input })).toThrow(/与提交不符/)
  })

  it('compares JSON as stored text without rounding numbers or changing schema members', () => {
    const numericInput = { ...input, valueType: 'NUMBER', controlType: 'NUMBER', defaultValueJson: ' 1.00000000000000001 ',
      exampleValueJson: '1e400', jsonSchema: '{"maximum":1e400,"custom":9007199254740993}' } as const
    const result = { ...saved, sdParamValueType: 'NUMBER', sdParamControlType: 'NUMBER', defaultValueJson: '1.00000000000000001',
      exampleValueJson: '1e400', jsonSchema: numericInput.jsonSchema } as ParameterDefinition
    const command = { kind: 'update', before, input: numericInput } as const
    expect(check(result, command)).toBe(result)
    expect(() => check({ ...result, defaultValueJson: '1' }, command)).toThrow(/内容与提交不符/)
  })

  it('confirms explicit clearing instead of retaining stale ordinary defaults', () => {
    const command = { ...update, input: { ...input, defaultValueJson: undefined, exampleValueJson: undefined } }
    expect(() => check(saved, command)).toThrow(/存在状态/)
    const cleared = { ...saved, defaultValueJson: undefined, exampleValueJson: undefined, hasDefaultValue: false, hasExampleValue: false }
    expect(check(cleared, command)).toBe(cleared)
  })

  it('preserves hidden default/example presence and verifies an explicit replacement without demanding plaintext', () => {
    const hidden = { ...before, sdParamSensitivity: 'SENSITIVE', sdParamDisplayPolicy: 'HIDDEN', defaultValueJson: undefined, exampleValueJson: undefined } as ParameterDefinition
    const command: ParameterDefinitionCommand = { kind: 'update', before: hidden,
      input: { ...input, sensitivity: 'SENSITIVE', displayPolicy: 'HIDDEN', defaultValueJson: undefined, exampleValueJson: undefined } }
    const result = { ...hidden, revision: 4, name: input.name }
    expect(check(result, command)).toBe(result)
    expect(() => check({ ...result, hasExampleValue: false }, command)).toThrow(/存在状态/)
    expect(check(result, { ...command, input: { ...command.input, exampleValueJson: '"新示例"' } })).toBe(result)
  })

  it('requires the default to be removed when changing a protected definition to secret', () => {
    const hidden = { ...before, sdParamSensitivity: 'SENSITIVE', sdParamDisplayPolicy: 'HIDDEN', defaultValueJson: undefined, exampleValueJson: undefined } as ParameterDefinition
    const command: ParameterDefinitionCommand = { kind: 'update', before: hidden, input: { ...input, sensitivity: 'SECRET', displayPolicy: 'HIDDEN',
      controlType: 'SECRET_REFERENCE', defaultValueJson: undefined, exampleValueJson: undefined } }
    const result = { ...hidden, name: input.name, revision: 4, sdParamSensitivity: 'SECRET', sdParamControlType: 'SECRET_REFERENCE', hasDefaultValue: false } as ParameterDefinition
    expect(check(result, command)).toBe(result)
    expect(() => check({ ...result, hasDefaultValue: true }, command)).toThrow(/存在状态/)
  })

  it('confirms both the target status and new revision without accepting an unrelated edit', () => {
    const command: ParameterDefinitionCommand = { kind: 'status', before, enabled: false }
    const disabled = { ...before, revision: 4, sdParamStatus: 'INACTIVE' } as ParameterDefinition
    expect(check(disabled, command)).toBe(disabled)
    for (const patch of [{ sdParamStatus: 'ACTIVE' }, { revision: 3 }, { name: '别人编辑的名称' }, { cacheEnabled: false }]) {
      expect(() => check({ ...disabled, ...patch }, command)).toThrow(/保存未确认/)
    }
  })
})
