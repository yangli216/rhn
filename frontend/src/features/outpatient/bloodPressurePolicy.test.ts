import { describe, expect, it } from 'vitest'
import { requiresBloodPressure } from './bloodPressurePolicy'
import { createRecordSchema } from './DoctorWorkstation'

const visit = '2026-09-19T08:00:00Z'
const note = { chiefComplaint: '咳嗽', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '' }

describe('outpatient blood pressure requirement', () => {
  it.each([
    ['2020-09-19', false], ['2008-09-20', false], ['2008-09-19', true],
    ['1975-06-15', true], [undefined, true], ['invalid', true], ['2020-02-30', true], ['2030-01-01', true],
  ])('uses age on the visit date for %s', (birthDate, required) => {
    expect(requiresBloodPressure(birthDate, visit)).toBe(required)
  })
  it('allows a child without blood pressure while preserving pair, range and relation checks', () => {
    const schema = createRecordSchema(false)
    expect(schema.safeParse(note).success).toBe(true)
    for (const bp of [{ systolic: 100 }, { diastolic: 60 }, { systolic: 10, diastolic: 60 },
      { systolic: 60, diastolic: 100 }, { systolic: 100.5, diastolic: 60 }]) {
      expect(schema.safeParse({ ...note, ...bp }).success).toBe(false)
    }
    expect(schema.safeParse({ ...note, systolic: 100, diastolic: 60 }).success).toBe(true)
    expect(createRecordSchema(true).safeParse(note).success).toBe(false)
  })
})
