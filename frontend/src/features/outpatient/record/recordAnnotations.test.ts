import { describe, expect, it } from 'vitest'
import { anchorAnnotations, applyBoundFacts, rebaseAnnotations, recordEvidence, templateAnnotations } from './recordAnnotations'
import type { RecordAnnotation } from '../../../shared/api/recordAnnotations'

const cough: RecordAnnotation = { field: 'presentIllness', text: '3天', start: 2,
  source: 'TEMPLATE', kind: 'VARIABLE', binding: 'symptom.cough.duration' }

describe('record writing annotations', () => {
  it('does not resolve ambiguous quotes or relocate a stale offset', () => {
    const content = { presentIllness: '咳嗽3天，用药3天' }
    expect(anchorAnnotations(content, [{ ...cough, start: undefined }])).toEqual([])
    expect(anchorAnnotations(content, [{ ...cough, start: 3 }])).toEqual([])
    expect(anchorAnnotations(content, [cough])[0].start).toBe(2)
  })
  it('updates only the bound duration and preserves unrelated treatment duration', () => {
    const content = { presentIllness: '咳嗽3天，用药3天' }
    const marks = templateAnnotations(content, [cough])
    const result = applyBoundFacts(content, marks, [{ ...cough, text: '5天', source: 'VOICE', sourceQuote: '咳嗽五天了' }])
    expect(result.content.presentIllness).toBe('咳嗽5天，用药3天')
    expect(result.annotations.find((item) => item.source === 'VOICE')?.text).toBe('5天')
    expect(recordEvidence(result.content, result.annotations).presentIllness).toBe('5天')
  })
  it('preserves presets in the document but does not treat them as evidence until saving confirms them', () => {
    const content = { physicalExam: '双肺未闻及啰音' }
    const marks = templateAnnotations(content)
    expect(content.physicalExam).toBe('双肺未闻及啰音')
    expect(recordEvidence(content, marks).physicalExam).toBe('')
    expect(recordEvidence(content, marks.map((item) => ({ ...item, confirmed: true }))).physicalExam).toBe(content.physicalExam)
  })
  it('protects a manually corrected semantic slot from later automatic updates', () => {
    const before = '咳嗽3天，用药3天'
    const after = '咳嗽7天，用药3天'
    const marks = rebaseAnnotations('presentIllness', before, after, templateAnnotations({ presentIllness: before }, [cough]))
    const update = applyBoundFacts({ presentIllness: after }, marks, [{ ...cough, text: '5天', source: 'VOICE' }])
    expect(update.content.presentIllness).toBe(after)
    expect(update.annotations.find((item) => item.kind === 'CONFLICT')?.reason).toContain('5天')
    expect(marks.find((item) => item.source === 'DOCTOR')?.binding).toBe(cough.binding)
  })
  it('updates the same oral slot incrementally without touching another duration', () => {
    const content = { presentIllness: '咳嗽3天，用药3天' }
    const first = applyBoundFacts(content, templateAnnotations(content, [cough]), [{ ...cough, text: '5天', source: 'VOICE' }])
    const second = applyBoundFacts(first.content, first.annotations, [{ ...cough, text: '6天', source: 'VOICE' }])
    expect(second.content.presentIllness).toBe('咳嗽6天，用药3天')
    expect(second.annotations.filter((item) => item.source === 'VOICE')).toHaveLength(1)
  })
  it('rebases unaffected spans and discards an edited highlight without anchoring a duplicate elsewhere', () => {
    const marks = rebaseAnnotations('presentIllness', '咳嗽3天，用药3天', '咳嗽已缓解，用药3天', [cough])
    expect(marks.some((item) => item.source === 'TEMPLATE')).toBe(false)
    expect(marks[0].source).toBe('DOCTOR')
    const shifted = rebaseAnnotations('presentIllness', '咳嗽3天', '今天咳嗽3天', [cough])
    expect(shifted.find((item) => item.kind === 'VARIABLE')?.start).toBe(4)
  })
  it('coalesces consecutive typing so metadata does not grow one item per keystroke', () => {
    let text = '', marks: RecordAnnotation[] = []
    for (const char of '医生口述补充') {
      marks = rebaseAnnotations('presentIllness', text, text + char, marks)
      text += char
    }
    expect(marks).toHaveLength(1)
    expect(marks[0].text).toBe(text)
  })
})
