import { describe, expect, it } from 'vitest'
import type { DictionaryAttributeDefinition, DictionaryAttributeValueSet } from '../../shared/rhnApi'
import { requireSavedAttributeValues } from './dictionaryMutationReceipt'

function verify(type: DictionaryAttributeDefinition['dataType'], expected: string[], actual: string[]) {
  const definition = { dataType: type } as DictionaryAttributeDefinition
  const source = { scopeCode: 'scope', valueMode: 'OVERRIDE', values: actual.map((value) =>
    type === 'DICT_REF' ? { referenceItemId: value } : { value }) } as DictionaryAttributeValueSet
  return () => requireSavedAttributeValues(definition, source, 'scope', 'OVERRIDE', expected)
}

describe('dictionary value write receipt comparison', () => {
  it.each([
    ['DECIMAL', '1.2300E+2', '123'],
    ['DECIMAL', '9007199254740993.10', '9007199254740993.1'],
    ['INTEGER', '+0009007199254740993', '9007199254740993'],
    ['DATETIME', '2026-10-03T16:09:10.123456789+08:00', '2026-10-03T08:09:10.123456789Z'],
    ['BOOLEAN', 'TRUE', 'true'],
    ['DICT_REF', '00101', '101'],
  ] as const)('accepts the server normalization for %s: %s -> %s', (type, expected, actual) => {
    expect(verify(type, [expected], [actual])).not.toThrow()
  })

  it.each([
    ['INTEGER', '9007199254740993', '9007199254740992'],
    ['DECIMAL', '9007199254740993.00000001', '9007199254740993.00000002'],
    ['DATETIME', '2026-10-03T08:00:00.123456789Z', '2026-10-03T08:00:00.123456788Z'],
    ['TEXT', 'a,b', 'a'],
    ['DICT_REF', '101', '102'],
  ] as const)('rejects a different %s value: %s != %s', (type, expected, actual) => {
    expect(verify(type, [expected], [actual])).toThrow('保存未确认')
  })

  it('matches trim and exact-string dedup while retaining separate comma-containing values', () => {
    expect(verify('TEXT', [' a,b ', 'a,b', 'c'], ['a,b', 'c'])).not.toThrow()
    expect(verify('TEXT', ['a,b', 'c'], ['a', 'b', 'c'])).toThrow('保存未确认')
    expect(verify('TEXT', ['\u00a0text\u00a0'], ['text'])).toThrow('保存未确认')
  })
})
