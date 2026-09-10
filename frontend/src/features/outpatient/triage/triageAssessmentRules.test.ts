import { describe, expect, it } from 'vitest'
import { assessVitals } from './triageAssessmentRules'

describe('assessVitals', () => {
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
