import { describe, expect, it } from 'vitest'
import {
  describeParameterFieldValue, diffParameterFieldValues, parameterFieldErrors, parameterFieldVisible,
  readParameterFieldDraft, readParameterFields, writeParameterFieldDraft,
} from './parameterFieldSchema'

const schema = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['enabled', 'minAge', 'enforceAt'],
  properties: {
    enabled: { type: 'boolean', title: '门诊就诊必测血压', default: true },
    minAge: { type: 'integer', title: '必测起始年龄（周岁）', minimum: 0, maximum: 120, default: 18, 'x-visibleWhen': { enabled: true } },
    enforceAt: { type: 'string', title: '拦截时机', enum: ['DRAFT', 'COMPLETION'],
      'x-enumLabels': { DRAFT: '保存草稿时', COMPLETION: '诊毕时' }, default: 'COMPLETION', 'x-visibleWhen': { enabled: true } },
  },
})

describe('parameterFieldSchema', () => {
  const fields = readParameterFields(schema)!

  it('按 properties 读取字段、中文名与枚举名称', () => {
    expect(fields.map((field) => field.title)).toEqual(['门诊就诊必测血压', '必测起始年龄（周岁）', '拦截时机'])
    expect(fields[2].options).toEqual([{ value: 'DRAFT', label: '保存草稿时' }, { value: 'COMPLETION', label: '诊毕时' }])
    expect(readParameterFields('{"type":"object"}')).toBeUndefined()
    expect(readParameterFields('{"type":"object","properties":{"a":{"type":"array"}}}')).toBeUndefined()
  })

  it('无当前值时用默认值，保存时保留未声明的原有属性', () => {
    expect(readParameterFieldDraft(fields, undefined)!.values).toEqual({ enabled: 'true', minAge: '18', enforceAt: 'COMPLETION' })
    const draft = readParameterFieldDraft(fields, '{"enabled":false,"legacy":1}')!
    expect(draft.values.enabled).toBe('false')
    expect(writeParameterFieldDraft(fields, { ...draft, values: { ...draft.values, minAge: '35' } }))
      .toBe('{"enabled":false,"minAge":35,"enforceAt":"COMPLETION","legacy":1}')
    expect(readParameterFieldDraft(fields, '[1]')).toBeUndefined()
  })

  it('按字段校验取值范围与类型，并按条件隐藏字段', () => {
    expect(parameterFieldErrors(fields, { enabled: 'true', minAge: '150', enforceAt: 'COMPLETION' })).toEqual({ minAge: '不能大于 120' })
    expect(parameterFieldErrors(fields, { enabled: 'true', minAge: '1.5', enforceAt: '' })).toEqual({ minAge: '请输入整数', enforceAt: '请选择' })
    expect(parameterFieldVisible(fields[1], { enabled: 'false' })).toBe(false)
    expect(parameterFieldVisible(fields[1], { enabled: 'true' })).toBe(true)
  })

  it('列表摘要与变更记录按字段中文名展示', () => {
    expect(describeParameterFieldValue(fields, '{"enabled":true,"minAge":35,"enforceAt":"DRAFT"}'))
      .toBe('门诊就诊必测血压：是；必测起始年龄（周岁）：35；拦截时机：保存草稿时')
    expect(describeParameterFieldValue(fields, '{"enabled":false,"minAge":35,"enforceAt":"DRAFT"}')).toBe('门诊就诊必测血压：否')
    expect(diffParameterFieldValues(fields, '{"enabled":true,"minAge":18,"enforceAt":"COMPLETION"}', '{"enabled":true,"minAge":35,"enforceAt":"COMPLETION"}'))
      .toEqual([{ name: 'minAge', title: '必测起始年龄（周岁）', before: '18', after: '35' }])
    expect(diffParameterFieldValues(fields, null, '{"enabled":true}')![0]).toMatchObject({ before: '未设置', after: '是' })
  })
})
