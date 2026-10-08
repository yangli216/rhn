import { describe, expect, it } from 'vitest'
import { roundAmount } from './roundAmount'

describe('roundAmount', () => {
  it.each([
    [undefined, 'HALF_UP'], ['', 'HALF_UP'], ['0', 'HALF_UP'], ['0.1junk', 'HALF_UP'],
    ['1', 'HALF_UP'], ['-0.1', 'HALF_UP'], ['0.01', undefined], ['0.01', ''], ['0.01', 'UNKNOWN'],
  ])('rejects missing or invalid precision %s / mode %s', (precision, mode) => {
    expect(() => roundAmount(33.67, precision, mode)).toThrow(/未配置或无效/)
    expect(() => roundAmount(0, precision, mode)).toThrow(/未配置或无效/)
  })

  it.each([NaN, Infinity, -Infinity, 10_000_000_000, 0.0000001])('rejects invalid or unsupported amount %s', (amount) => {
    expect(() => roundAmount(amount, '0.01', 'HALF_UP')).toThrow(/金额/)
  })

  it('rounds six-decimal accounting amounts once at the configured precision', () => {
    expect(roundAmount(1.049, '0.1', 'HALF_UP')).toEqual({ rounded: 1, adjustment: -0.049 })
    expect(roundAmount(1.050001, '0.1', 'HALF_EVEN_SIX')).toEqual({ rounded: 1.1, adjustment: 0.049999 })
    expect(roundAmount(1.009, '0.01', 'FLOOR')).toEqual({ rounded: 1, adjustment: -0.009 })
    expect(roundAmount(1.005, '0.01', 'HALF_UP')).toEqual({ rounded: 1.01, adjustment: 0.005 })
    expect(roundAmount(-1.005, '0.01', 'HALF_UP')).toEqual({ rounded: -1.01, adjustment: -0.005 })
    expect(roundAmount(0.1 + 0.2, '0.01', 'HALF_UP')).toEqual({ rounded: 0.3, adjustment: 0 })
  })

  it('显式精度为分(0.01)时，不产生舍入误差', () => {
    expect(roundAmount(33.67, '0.01', 'HALF_UP')).toEqual({ rounded: 33.67, adjustment: 0 })
    expect(roundAmount(33.67, '0.01', 'FLOOR')).toEqual({ rounded: 33.67, adjustment: 0 })
  })

  it('精度为角(0.1) + 抹零(FLOOR)时，截断分位金额', () => {
    // 33.67 -> 33.60, 误差 -0.07
    expect(roundAmount(33.67, '0.1', 'FLOOR')).toEqual({ rounded: 33.60, adjustment: -0.07 })
    // 33.60 -> 33.60, 误差 0
    expect(roundAmount(33.60, '0.1', 'FLOOR')).toEqual({ rounded: 33.60, adjustment: 0 })
    // 33.69 -> 33.60, 误差 -0.09
    expect(roundAmount(33.69, '0.1', 'FLOOR')).toEqual({ rounded: 33.60, adjustment: -0.09 })
  })

  it('精度为角(0.1) + 四舍五入(HALF_UP)时，4舍5入', () => {
    // 33.67 -> 33.70, 误差 +0.03 (用户确认的例子)
    expect(roundAmount(33.67, '0.1', 'HALF_UP')).toEqual({ rounded: 33.70, adjustment: 0.03 })
    // 33.64 -> 33.60, 误差 -0.04
    expect(roundAmount(33.64, '0.1', 'HALF_UP')).toEqual({ rounded: 33.60, adjustment: -0.04 })
    // 33.65 -> 33.70, 误差 +0.05
    expect(roundAmount(33.65, '0.1', 'HALF_UP')).toEqual({ rounded: 33.70, adjustment: 0.05 })
  })

  it('精度为角(0.1) + 五舍六入(HALF_EVEN_SIX)时，5舍6入', () => {
    // 33.65 -> 33.60, 误差 -0.05 (5舍)
    expect(roundAmount(33.65, '0.1', 'HALF_EVEN_SIX')).toEqual({ rounded: 33.60, adjustment: -0.05 })
    // 33.66 -> 33.70, 误差 +0.04 (6入)
    expect(roundAmount(33.66, '0.1', 'HALF_EVEN_SIX')).toEqual({ rounded: 33.70, adjustment: 0.04 })
  })

  it('边界情况处理', () => {
    expect(roundAmount(0, '0.01', 'HALF_UP')).toEqual({ rounded: 0, adjustment: 0 })
    expect(() => roundAmount(NaN, '0.01', 'HALF_UP')).toThrow('待支付金额无效')
  })
})
