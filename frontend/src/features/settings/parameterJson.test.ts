import { describe, expect, it } from 'vitest'
import { ParameterJsonNumber, compareParameterNumbers, isParameterNumberText, parseParameterJson, stringifyParameterJson } from './parameterJson'

describe('lossless parameter JSON', () => {
  it.each(['9007199254740993', '-9007199254740993', '0.12345678901234567890123456789', '-0',
    '1e400', '1e-400', '1.0000E+300', '0', 'true', 'false', 'null', '"9007199254740993"',
    '[9007199254740993,1e400,{"precise":0.10000000000000000001}]',
    '{"minimum":9007199254740993,"maximum":9007199254740994,"enum":[1.0,1e2],"custom":{"n":1e-400}}',
    '{"__proto__":{"polluted":true},"constructor":9007199254740993}',
    '{"escaped":"quote: \\" slash: \\\\","empty":{},"array":[]}',
  ])('retains numeric tokens and data in %s', source => {
    expect(stringifyParameterJson(parseParameterJson(source))).toBe(source)
  })

  it('handles whitespace and escaped Unicode object keys without mutating prototypes', () => {
    const parsed = parseParameterJson(' { "a\\u0062" : [ 1.234567890123456789 , " x " ], "__proto__" : { "n" : 2 } } ')
    expect(stringifyParameterJson(parsed)).toBe('{"ab":[1.234567890123456789," x "],"__proto__":{"n":2}}')
    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(({} as { n?: number }).n).toBeUndefined()
  })

  it.each(['{"a":1,"a":2}', '{"outer":{"a":1,"\\u0061":2}}', '[{"x":1,"x":2}]'])('rejects duplicate keys rather than dropping data: %s', source => {
    expect(() => parseParameterJson(source)).toThrow('JSON 属性重复')
  })

  it.each(['', '[1,]', '{"a":}', 'true false', 'NaN', 'Infinity', '01', '{bad}'])('rejects invalid JSON %s', source => {
    expect(() => parseParameterJson(source)).toThrow()
  })

  it.each(['0x10', '0b11', '+1', '.5', '5.', '01', 'NaN', 'Infinity', '', '1_000', '1e'])('rejects non-JSON decimal notation %s', value => {
    expect(isParameterNumberText(value)).toBe(false)
    expect(() => new ParameterJsonNumber(value)).toThrow()
  })

  it.each([
    ['9007199254740993', '9007199254740992', 1], ['-9007199254740993', '-9007199254740992', -1],
    ['1.00000000000000001', '1.00000000000000002', -1], ['1e400', '9e399', 1],
    ['1e-400', '9e-401', 1], ['-1e400', '-9e399', -1], ['0.00001', '0.0001', -1],
    ['0', '-0', 0], ['0e99999', '-0e-99999', 0], ['1.2300', '123e-2', 0],
    ['1e999999999999999999999', '1e999999999999999999998', 1], ['-1', '0', -1],
    ['0.00001', '-0.00001', 1], ['123', '123.0001', -1],
  ] as const)('compares %s with %s exactly', (left, right, expected) => {
    expect(compareParameterNumbers(new ParameterJsonNumber(left), new ParameterJsonNumber(right))).toBe(expected)
    expect(compareParameterNumbers(new ParameterJsonNumber(right), new ParameterJsonNumber(left))).toBe(expected === 0 ? 0 : -expected)
  })
})
