import { describe, expect, it } from 'vitest'
import { copilotNextStep } from './copilotNextStep'

const diagnosis = { code: 'I10', display: '原发性高血压' } as never
const base = { chiefComplaint: '高血压复诊配药', presentIllness: undefined, diagnoses: [] as never[] }

describe('copilotNextStep', () => {
  it('stays quiet without a chief complaint', () => {
    expect(copilotNextStep({ ...base, chiefComplaint: '' })).toBeUndefined()
  })
  it('leaves a short chief complaint to the expansion shortcut', () => {
    expect(copilotNextStep(base)).toBeUndefined()
  })
  it('suggests completing a long chief complaint with an empty narrative', () => {
    expect(copilotNextStep({ ...base, chiefComplaint: '头晕'.repeat(40) })?.kind).toBe('RECORD')
  })
  it('suggests diagnoses once the narrative is written', () => {
    expect(copilotNextStep({ ...base, presentIllness: '长期服药' })?.kind).toBe('DIAGNOSIS')
  })
  it('suggests orders only when orders are known to be empty', () => {
    const written = { ...base, presentIllness: '长期服药', diagnoses: [diagnosis] }
    expect(copilotNextStep(written, false)?.kind).toBe('ORDERS')
    expect(copilotNextStep(written, undefined)).toBeUndefined()
    expect(copilotNextStep(written, true)).toBeUndefined()
  })
})
