import { describe, expect, it } from 'vitest'
import { parseMedicationBrief } from './medicationBriefParser'

describe('parseMedicationBrief', () => {
  it('splits a clinical note into scannable fields', () => {
    const brief = parseMedicationBrief(
      '常规用法：每次 0.5g 口服 PRN 疗程 3天；适用条件：发热（体温≥38.5°C）或明显头痛；目的：解热镇痛；不建议常规使用：体温正常且无疼痛时不用。嘱托：体温超过38.5°C或疼痛明显时服用，24小时内不超过4次。')
    expect(brief).toEqual({
      usage: '每次 0.5g 口服 PRN 疗程 3天',
      indication: '发热（体温≥38.5°C）或明显头痛',
      purpose: '解热镇痛',
      caution: '体温正常且无疼痛时不用',
      advice: '体温超过38.5°C或疼痛明显时服用，24小时内不超过4次',
      other: [],
    })
  })

  it('keeps strength out of the brief and joins dose with unlabeled usage', () => {
    const brief = parseMedicationBrief('规格：0.25g/粒；单次剂量：0.5g，口服 tid 7天')
    expect(brief.usage).toBe('0.5g，口服 tid 7天')
    expect(brief.other).toEqual([])
  })

  it('never drops text it cannot classify', () => {
    const brief = parseMedicationBrief('常规用法：0.5g 口服 tid 7-10天；核对适用条件')
    expect(brief.usage).toBe('0.5g 口服 tid 7-10天')
    expect(brief.other).toEqual(['核对适用条件'])
  })

  it.each(['嘱托：无', '嘱托：无特殊嘱托。', '嘱托：暂无'])('omits an empty advice field: %s', (advice) => {
    const brief = parseMedicationBrief(`规格：0.5g/片；常规用法：每次 0.5g 口服 tid 3天；目的：解热；${advice}`)
    expect(brief.advice).toBeNull()
    expect(brief.other).toEqual([])
  })
})
