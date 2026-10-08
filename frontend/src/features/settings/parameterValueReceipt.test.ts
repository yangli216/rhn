import { describe, expect, it } from 'vitest'
import type { ParameterDefinition, ParameterValueInput } from '../../shared/api/configurationApi'
import { requireSavedParameterValue } from './parameterValueReceipt'

const input: ParameterValueInput = { scopeType: 'TENANT', valueMode: 'OVERRIDE', expectedRevision: 2, valueJson: '"new"' }
const before = { id: 'def-1', key: 'test.setting', revision: 3, sdParamValueType: 'STRING', sdParamSensitivity: 'NORMAL',
  sdParamDisplayPolicy: 'PLAIN', values: [{ id: 'value-1', definitionId: 'def-1', revision: 2, tenantId: 'tenant-1',
    sdParamScopeType: 'TENANT', scopeId: 'tenant-1', scopeCode: 'TENANT:tenant-1', sdParamValueMode: 'OVERRIDE',
    valueJson: '"old"', displayValue: '"old"', hasValue: true, secretReference: false, sdParamStatus: 'ACTIVE',
  }],
} as ParameterDefinition
const good = { ...before, values: [{ ...before.values[0], revision: 3, valueJson: '"new"', displayValue: '"new"' }] }

function check(result: unknown, command = input, original = before) {
  return requireSavedParameterValue(original, result as ParameterDefinition, command, 'tenant-1')
}

describe('current parameter value receipts', () => {
  it('confirms only the submitted current value and preserves the returned server object', () => {
    expect(check(good)).toBe(good)
    expect(check(good, input, good)).toBe(good) // Idempotent replay may read the already-saved revision.
  })

  it.each([null, {}, { ...good, id: 'other' }, { ...good, key: 'other.key' }, { ...good, values: null },
    { ...good, values: [] }, { ...good, values: [...good.values, ...good.values] },
    { ...good, revision: 1 }, { ...good, sdParamValueType: 'NUMBER' }])('rejects incomplete or mismatched definitions %j', result => {
    expect(() => check(result)).toThrow('保存未确认')
  })

  it.each([
    { id: 'other-value' }, { definitionId: 'other' }, { tenantId: 'another-tenant' }, { scopeId: 'other' },
    { scopeReference: 'OTHER' }, { scopeCode: 'PLATFORM' }, { sdParamScopeType: 'PLATFORM' },
    { revision: 2 }, { revision: -1 }, { revision: Number.NaN }, { sdParamValueMode: 'EXPLICIT_NULL' },
    { sdParamStatus: 'INACTIVE' }, { hasValue: false }, { secretReference: true }, { valueJson: '"old"' },
    { displayValue: '"old"' },
  ])('rejects a wrong or stale current-value receipt %j', patch => {
    expect(() => check({ ...good, values: [{ ...good.values[0], ...patch }] })).toThrow('保存未确认')
  })

  it.each([
    { scopeType: 'PLATFORM', scopeCode: 'PLATFORM', tenantId: undefined, scopeId: undefined },
    { scopeType: 'TENANT', scopeCode: 'TENANT:tenant-1', tenantId: 'tenant-1', scopeId: 'tenant-1' },
    { scopeType: 'ORGANIZATION', scopeCode: 'ORGANIZATION:org-1', tenantId: 'tenant-1', scopeId: 'org-1' },
    { scopeType: 'DEPARTMENT', scopeCode: 'DEPARTMENT:dept-1', tenantId: 'tenant-1', scopeId: 'dept-1' },
    { scopeType: 'USER', scopeCode: 'USER:user-1', tenantId: 'tenant-1', scopeId: 'user-1' },
    { scopeType: 'PRODUCT', scopeCode: 'PRODUCT:tenant-1:APP', tenantId: 'tenant-1', scopeId: undefined, scopeReference: 'APP' },
    { scopeType: 'MODULE', scopeCode: 'MODULE:tenant-1:APP', tenantId: 'tenant-1', scopeId: undefined, scopeReference: 'APP' },
    { scopeType: 'ENVIRONMENT', scopeCode: 'ENVIRONMENT:tenant-1:APP', tenantId: 'tenant-1', scopeId: undefined, scopeReference: 'APP' },
  ] as const)('confirms newly created values using the $scopeType server scope protocol', target => {
    const scopeReference = 'scopeReference' in target ? target.scopeReference : undefined
    const command = { ...input, expectedRevision: undefined, scopeType: target.scopeType,
      scopeId: target.scopeId, scopeReference: scopeReference?.toLowerCase() }
    const created = { ...good, values: [{ ...good.values[0], ...target, sdParamScopeType: target.scopeType, revision: 0 }] }
    expect(check(created, command, { ...before, values: [] })).toBe(created)
  })

  it.each(['INHERIT', 'RESET_DEFAULT', 'EXPLICIT_NULL'] as const)('requires cleared content for %s', valueMode => {
    const command = { ...input, valueMode, valueJson: undefined }
    const result = { ...good, values: [{ ...good.values[0], sdParamValueMode: valueMode, valueJson: undefined, displayValue: undefined, hasValue: false }] }
    expect(check(result, command)).toBe(result)
    expect(() => check({ ...result, values: [{ ...result.values[0], hasValue: true }] }, command)).toThrow('保存未确认')
  })

  it.each([
    { sdParamSensitivity: 'SENSITIVE', sdParamDisplayPolicy: 'MASKED', secret: false, display: '******' },
    { sdParamSensitivity: 'NORMAL', sdParamDisplayPolicy: 'HIDDEN', secret: false, display: undefined },
    { sdParamSensitivity: 'SECRET', sdParamDisplayPolicy: 'MASKED', secret: true, display: '******' },
    { sdParamSensitivity: 'SECRET', sdParamDisplayPolicy: 'HIDDEN', secret: true, display: undefined },
  ] as const)('checks protected content metadata without requiring disclosure: $sdParamSensitivity / $sdParamDisplayPolicy', policy => {
    const original = { ...before, ...policy }
    const result = { ...good, ...policy, values: [{ ...good.values[0], valueJson: undefined, secretReference: policy.secret, displayValue: policy.display }] }
    const command = { ...input, valueJson: policy.secret ? undefined : input.valueJson, secretRef: policy.secret ? 'vault:ref' : undefined }
    expect(check(result, command, original)).toBe(result)
    expect(() => check({ ...result, values: [{ ...result.values[0], revision: 2 }] }, command, original)).toThrow('保存未确认')
    expect(() => check({ ...result, values: [{ ...result.values[0], valueJson: '"disclosed"' }] }, command, original)).toThrow('保存未确认')
  })

  it('does not equate distinct large numbers or change whitespace inside JSON strings', () => {
    const command = { ...input, valueJson: '  {"id":9007199254740993,"label":" x "}\n' }
    const content = '{"id":9007199254740993,"label":" x "}'
    const result = { ...good, values: [{ ...good.values[0], valueJson: content, displayValue: content }] }
    expect(check(result, command)).toBe(result)
    expect(() => check(result, { ...command, valueJson: content.replace('993', '992') })).toThrow('保存未确认')
  })

  it('preserves an inactive value when editing its content', () => {
    const original = { ...before, values: [{ ...before.values[0], sdParamStatus: 'INACTIVE' }] } as ParameterDefinition
    const result = { ...good, values: [{ ...good.values[0], sdParamStatus: 'INACTIVE' }] } as ParameterDefinition
    expect(check(result, input, original)).toBe(result)
    expect(() => check(good, input, original)).toThrow('保存未确认')
  })
})
