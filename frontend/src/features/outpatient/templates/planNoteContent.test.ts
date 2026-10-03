import { describe, expect, it } from 'vitest'
import { planNoteContent } from './planNoteContent'

describe('one plan writing projection', () => {
  const tasks = [{ kind: 'EDUCATION', text: '休息', details: '注意休息' },
    { kind: 'FOLLOW_UP', text: '一周复诊' }, { kind: 'CONDITION', text: '门诊患者' }]
  it('places supporting writing tasks in their paragraphs and keeps conditions out of the record', () => {
    expect(planNoteContent({}, tasks)).toEqual({ healthEducation: '注意休息', followUp: '一周复诊' })
  })
  it('uses linked paragraphs once, including an intentionally cleared paragraph', () => {
    expect(planNoteContent({ healthEducation: '已调整的宣教', followUp: '' }, tasks))
      .toEqual({ healthEducation: '已调整的宣教', followUp: '' })
  })
})
