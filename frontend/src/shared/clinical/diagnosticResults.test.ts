import { describe, expect, it } from 'vitest'
import type { DiagnosticObservation } from '../api/diagnosticsApi'
import { diagnosticObservationValue } from './diagnosticResults'

describe('diagnostic observation source values', () => {
  it.each([
    [{ valueType: 'NUMBER', valueNumber: 0 }, '0'],
    [{ valueType: 'NUMBER', valueNumber: -2.3 }, '-2.3'],
    [{ valueType: 'STRING', valueString: '实际所见' }, '实际所见'],
    [{ valueType: 'CODE', valueCode: 'NEG' }, 'NEG'],
    [{ valueType: 'BOOLEAN', valueBoolean: false }, '否'],
    [{ valueType: 'BOOLEAN', valueBoolean: true }, '是'],
    [{ valueType: 'BOOLEAN', valueBoolean: false, valueNumber: null, valueString: null }, '否'],
    [{ valueType: 'BOOLEAN', valueBoolean: null }, '结果缺失'],
    [{ valueType: 'BOOLEAN' }, '结果缺失'],
    [{ valueType: 'STRING', valueString: '  ' }, '结果缺失'],
    [{ valueType: 'NUMBER', valueNumber: null }, '结果缺失'],
    [{ valueType: 'NUMBER', valueString: '0' }, '结果数据异常，请核对'],
    [{ valueType: 'NUMBER', valueNumber: '0' }, '结果数据异常，请核对'],
    [{ valueType: 'BOOLEAN', valueBoolean: 'false' }, '结果数据异常，请核对'],
    [{ valueType: 'BOOLEAN', valueBoolean: 0 }, '结果数据异常，请核对'],
    [{ valueType: 'NUMBER', valueNumber: Infinity }, '结果数据异常，请核对'],
    [{ valueType: 'NUMBER', valueNumber: NaN }, '结果数据异常，请核对'],
    [{ valueType: 'NUMBER', valueNumber: 5, valueString: '正常' }, '结果数据异常，请核对'],
    [{ valueType: 'DATETIME', valueDateTime: '0' }, '结果数据异常，请核对'],
    [{ valueType: 'DATETIME', valueDateTime: 'bad-date' }, '结果数据异常，请核对'],
    [{ valueNumber: 0 }, '结果数据异常，请核对'],
    [{ valueType: 'OTHER', valueString: '正常' }, '结果数据异常，请核对'],
  ])('does not infer a substitute for %j', (value, expected) => {
    expect(diagnosticObservationValue(value as unknown as DiagnosticObservation)).toBe(expected)
  })

  it('retains the year and seconds of an actual datetime result', () => {
    const result = diagnosticObservationValue({ valueType: 'DATETIME', valueDateTime: '2025-09-10T08:30:45Z' } as DiagnosticObservation)
    expect(result).toContain('2025')
    expect(result).toContain('09/10')
    expect(result).toContain(':30:45')
    expect(result).not.toContain('结果')
  })
})
