import { describe, expect, it } from 'vitest'
import { assessVitals } from './triageAssessmentRules'

describe('assessVitals', () => {
  it('未采集体征时应保持待评估，不能宣称生命体征平稳', () => {
    const result = assessVitals({})
    expect(result.hasData).toBe(false)
    expect(result.assessments).toEqual([])
    expect(result.suggestedReason).toBe('尚未采集体征，待评估')
  })

  it('单项正常仅代表已采集项目未触发预警', () => {
    const result = assessVitals({ temperature: 36.5 })
    expect(result.hasData).toBe(true)
    expect(result.suggestedReason).toContain('仍需结合主诉和未采集项目评估')
  })

  it('明确记录的零分和清醒应保留为已评估，血氧零值不能被正常值覆盖', () => {
    expect(assessVitals({ painScore: 0 }).hasData).toBe(true)
    expect(assessVitals({ consciousness: 'ALERT' }).hasData).toBe(true)
    expect(assessVitals({ oxygenSaturation: 0 }).hasCritical).toBe(true)
  })

  it('单纯高热应建议三级急症，不应直接判为二级危重', () => {
    const result = assessVitals({ temperature: 39.2, consciousness: 'ALERT', painScore: 0 })

    expect(result.hasWarning).toBe(true)
    expect(result.hasCritical).toBe(false)
    expect(result.suggestedLevel).toBe('LEVEL_3_ROUTINE_URGENT')
  })

  it('重度疼痛应建议二级危重', () => {
    const result = assessVitals({ temperature: 36.5, consciousness: 'ALERT', painScore: 8 })

    expect(result.suggestedLevel).toBe('LEVEL_2_URGENT')
  })

  it('严重生命体征异常应建议一级濒危', () => {
    const result = assessVitals({ oxygenSaturation: 88, consciousness: 'ALERT', painScore: 0 })

    expect(result.hasCritical).toBe(true)
    expect(result.suggestedLevel).toBe('LEVEL_1_CRITICAL')
  })
})
