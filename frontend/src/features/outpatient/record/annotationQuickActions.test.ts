import { describe, expect, it } from 'vitest'
import { annotationQuickActions } from './annotationQuickActions'

const next = (text: string) => annotationQuickActions(text).map((item) => item.nextText)
describe('annotationQuickActions', () => {
  it('toggles presence words, replacing only the first hit', () => {
    expect(next('无胸痛，无发热')).toEqual(['有胸痛，无发热'])
    expect(next('有高血压史')).toEqual(['无高血压史'])
    expect(next('不伴发热')).toEqual(['伴发热'])
    expect(next('伴发热')).toEqual(['不伴发热'])
    expect(next('否认药物过敏')).toEqual(['诉药物过敏'])
    expect(next('诉头痛')).toEqual(['否认头痛'])
    expect(annotationQuickActions('无胸痛')[0]).toEqual({ label: '改为：有', nextText: '有胸痛' })
  })
  it.each(['无力', '乏力', '有力', '无锡', '主诉', '比较', '所有', '陪伴', '有效'])('does not treat %s as a presence word', (text) => {
    expect(next(text)).toEqual([])
  })
  it('skips a false hit and continues to a real one', () => {
    expect(next('乏力，无发热')).toEqual(['乏力，有发热'])
  })
  it('swaps positive and negative results', () => {
    expect(next('尿蛋白阳性')).toEqual(['尿蛋白阴性'])
    expect(next('血糖(+)')).toEqual(['血糖(-)'])
    expect(next('隐血（-）')).toEqual(['隐血（+）'])
  })
  it('offers the other members of a degree group, capped at four', () => {
    expect(next('轻度')).toEqual(['中度', '重度'])
    expect(next('严重')).toEqual(['轻微', '明显'])
    expect(next('疼痛明显')).toEqual(['疼痛轻微', '疼痛严重', '疼痛稍', '疼痛较'])
    expect(annotationQuickActions('疼痛明显').length).toBeLessThanOrEqual(4)
    expect(next('无明显诱因')).toEqual(['有明显诱因'])
    expect(next('稍微')).toEqual([])
  })
  it('returns nothing for numbers, units and unrelated text', () => {
    expect(next('3天')).toEqual([])
    expect(next('每日2次')).toEqual([])
    expect(next('')).toEqual([])
  })
})
