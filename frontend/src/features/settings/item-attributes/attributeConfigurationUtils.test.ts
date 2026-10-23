import { describe, expect, it } from 'vitest'
import {
  buildSchema,
  dataTypeLabel,
  displayJson,
  extractDefinitionOptions,
  parseConfiguredValue,
  splitValues,
  suggestedWidget,
  variabilityHint,
  widgetLabel,
} from './attributeConfigurationUtils'

describe('attributeConfigurationUtils', () => {
  it('translates data types and widgets into human-readable labels', () => {
    expect(dataTypeLabel('TEXT')).toBe('文本')
    expect(dataTypeLabel('BOOLEAN')).toBe('布尔')
    expect(dataTypeLabel('DICT_REF')).toBe('字典引用')

    expect(widgetLabel('TEXT')).toBe('单行文本')
    expect(widgetLabel('INPUT')).toBe('单行输入')
    expect(widgetLabel('SWITCH')).toBe('开关')
    expect(widgetLabel('UNKNOWN')).toBe('UNKNOWN')
  })

  it('suggests appropriate widgets based on definition dataType and cardinality', () => {
    expect(suggestedWidget({ dataType: 'BOOLEAN', cardinality: 'SINGLE' } as any)).toBe('SWITCH')
    expect(suggestedWidget({ dataType: 'TEXT', cardinality: 'MULTIPLE' } as any)).toBe('MULTI_SELECT')
    expect(suggestedWidget({ dataType: 'DICT_REF', cardinality: 'SINGLE' } as any)).toBe('DICT_SELECT')
    expect(suggestedWidget({ dataType: 'ENUM', cardinality: 'SINGLE' } as any)).toBe('SELECT')
    expect(suggestedWidget({ dataType: 'TEXT', cardinality: 'SINGLE' } as any)).toBe('INPUT')
  })

  it('provides explanatory hints for variability modes', () => {
    expect(variabilityHint('BASE_ONLY')).toContain('统一公共基线值')
    expect(variabilityHint('SCOPE_OVERRIDE')).toContain('多级按需覆盖')
    expect(variabilityHint('LOCAL_ONLY')).toContain('无统一基线')
  })

  it('splits values by Chinese/English punctuation and line breaks', () => {
    expect(splitValues('甲、乙,丙；丁\n戊')).toEqual(['甲', '乙', '丙', '丁', '戊'])
    expect(splitValues('   ')).toEqual([])
  })

  it('builds JSON schema correctly for scalar and array types', () => {
    const textSchema = buildSchema('TEXT', 'SINGLE', true, '', '', '', '100')
    expect(textSchema).toEqual({ type: ['string', 'null'], maxLength: 100 })

    const enumArraySchema = buildSchema('ENUM', 'MULTIPLE', false, 'A、B、C', '', '', '')
    expect(enumArraySchema).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['A', 'B', 'C'] },
      uniqueItems: true,
    })
  })

  it('parses configured default values by target data type', () => {
    expect(parseConfiguredValue('true', 'BOOLEAN', 'SINGLE')).toBe(true)
    expect(parseConfiguredValue('是', 'BOOLEAN', 'SINGLE')).toBe(true)
    expect(parseConfiguredValue('42', 'INTEGER', 'SINGLE')).toBe(42)
    expect(parseConfiguredValue('3.14', 'DECIMAL', 'SINGLE')).toBe(3.14)
    expect(parseConfiguredValue('甲、乙', 'TEXT', 'MULTIPLE')).toEqual(['甲', '乙'])
  })

  it('formats display json safely', () => {
    expect(displayJson(undefined)).toBe('未设置')
    expect(displayJson(null)).toBe('空值')
    expect(displayJson(true)).toBe('是')
    expect(displayJson(false)).toBe('否')
    expect(displayJson('hello')).toBe('hello')
    expect(displayJson({ key: 'val' })).toBe('{"key":"val"}')
  })

  it('extracts enum options with labels from definition schema', () => {
    const enumDef = {
      dataType: 'ENUM',
      schema: {
        type: 'string',
        enum: ['ORIGINAL_SOLUTION', 'DILUTED_SOLUTION'],
        'x-enumLabels': {
          ORIGINAL_SOLUTION: '原液直接试验',
          DILUTED_SOLUTION: '稀释配制皮试液',
        },
      },
    } as any

    const options = extractDefinitionOptions(enumDef)
    expect(options).toEqual([
      { value: 'ORIGINAL_SOLUTION', label: '原液直接试验' },
      { value: 'DILUTED_SOLUTION', label: '稀释配制皮试液' },
    ])
  })
})
