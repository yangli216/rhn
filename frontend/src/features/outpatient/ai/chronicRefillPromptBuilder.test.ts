import { describe, it, expect } from 'vitest'
import { buildChronicRefillPrompt } from './chronicRefillPromptBuilder'
import type { Encounter } from '../../../shared/model'

const mockEncounter: Encounter = {
  id: 'enc-1',
  residentId: 'res-1',
  encounterNo: 'E-001',
  organizationId: 'org-1',
  departmentId: 'dept-1',
  registeredAt: '2026-10-13T09:00:00Z',
  status: 'IN_PROGRESS',
  systolic: 128,
  diastolic: 82,
  diagnoses: [],
}

describe('buildChronicRefillPrompt', () => {
  it('incorporates vital signs, medications, and conditions into structured AI prompt', () => {
    const result = buildChronicRefillPrompt({
      encounter: mockEncounter,
      matchedConditions: ['原发性高血压', '2型糖尿病'],
      medications: [
        { medicationName: '苯磺酸氨氯地平片 5mg' },
        { medicationName: '盐酸二甲双胍片 0.5g' },
      ],
    })

    expect(result.aiFocusPrompt).toContain('原发性高血压、2型糖尿病')
    expect(result.aiFocusPrompt).toContain('128/82 mmHg')
    expect(result.aiFocusPrompt).toContain('苯磺酸氨氯地平片 5mg')
    expect(result.fallbackChiefComplaint).toBe('原发性高血压、2型糖尿病复诊配药')
    expect(result.fallbackPresentIllness).toContain('128/82 mmHg')
  })

  it('handles empty vitals gracefully', () => {
    const noVitalsEncounter: Encounter = {
      ...mockEncounter,
      systolic: undefined,
      diastolic: undefined,
    }

    const result = buildChronicRefillPrompt({
      encounter: noVitalsEncounter,
      matchedConditions: ['高血压'],
      medications: [],
    })

    expect(result.aiFocusPrompt).toContain('高血压')
    expect(result.fallbackChiefComplaint).toBe('高血压复诊配药')
    expect(result.fallbackPresentIllness).toContain('患者既往明确高血压病史')
  })
})
