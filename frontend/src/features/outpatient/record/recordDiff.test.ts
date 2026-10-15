import { describe, expect, it } from 'vitest'
import { diffText, hasChanges } from './recordDiff'

describe('diffText', () => {
  it('returns one unchanged segment for equal text', () => {
    expect(diffText('咳嗽三天', '咳嗽三天')).toEqual([{ type: 'same', text: '咳嗽三天' }])
    expect(hasChanges(diffText('咳嗽三天', '咳嗽三天'))).toBe(false)
  })

  it('marks only the replaced characters inside a sentence', () => {
    expect(diffText('反复咳嗽3天', '反复咳嗽5天')).toEqual([
      { type: 'same', text: '反复咳嗽' }, { type: 'del', text: '3' },
      { type: 'add', text: '5' }, { type: 'same', text: '天' },
    ])
  })

  it('shows insertions and deletions at either end', () => {
    expect(diffText('', '新增内容')).toEqual([{ type: 'add', text: '新增内容' }])
    expect(diffText('删除内容', '')).toEqual([{ type: 'del', text: '删除内容' }])
    expect(diffText('发热伴咳嗽', '发热')).toEqual([{ type: 'same', text: '发热' }, { type: 'del', text: '伴咳嗽' }])
  })

  it('reconstructs both sides from the segments', () => {
    const before = '晨起头晕明显，无意识障碍，既往血压偏高'
    const after = '晨起头晕加重，伴恶心，无意识障碍'
    const segments = diffText(before, after)
    expect(segments.filter((s) => s.type !== 'add').map((s) => s.text).join('')).toBe(before)
    expect(segments.filter((s) => s.type !== 'del').map((s) => s.text).join('')).toBe(after)
  })

  it('falls back to a whole replacement for very long differing text', () => {
    const segments = diffText('甲'.repeat(600), '乙'.repeat(600))
    expect(segments).toEqual([{ type: 'del', text: '甲'.repeat(600) }, { type: 'add', text: '乙'.repeat(600) }])
  })
})
