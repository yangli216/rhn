import { describe, expect, it } from 'vitest'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { DiseaseConcept } from '../../../shared/api/masterDataApi'
import { diagnosisManagementFromCatalog, hasConfirmedDiagnosisManagement } from './diagnosisManagementEvidence'

const program = { id: '101', code: 'CHRONIC', name: '慢病管理', managementType: 'CHRONIC_CARE',
  triggerAction: 'PROMPT_CONFIRMATION' } as const

describe('diagnosis management evidence', () => {
  it.each([undefined, null, [], [program]])('missing confirmation does not assert an empty or complete policy: %j', managementPrograms => {
    expect(hasConfirmedDiagnosisManagement({ managementPrograms })).toBe(false)
  })
  it.each([null, undefined, [null], [{}], [{ ...program, id: '' }], [{ ...program, reportDeadlineHours: -1 }]])(
    'rejects absent or incomplete confirmed programs: %j', managementPrograms => {
      expect(hasConfirmedDiagnosisManagement({ managementResolutionStatus: 'CONFIRMED', managementPrograms } as DiagnosisInput)).toBe(false)
    })
  it('distinguishes confirmed no requirements from confirmed real requirements', () => {
    expect(hasConfirmedDiagnosisManagement({ managementResolutionStatus: 'CONFIRMED', managementPrograms: [] })).toBe(true)
    expect(hasConfirmedDiagnosisManagement({ managementResolutionStatus: 'CONFIRMED', managementPrograms: [program] })).toBe(true)
  })
  it('preserves catalog requirements while refusing a missing catalog field', () => {
    expect(diagnosisManagementFromCatalog(undefined)).toEqual({ managementResolutionStatus: 'UNCONFIRMED', managementPrograms: null })
    expect(diagnosisManagementFromCatalog([])).toEqual({ managementResolutionStatus: 'CONFIRMED', managementPrograms: [] })
    const catalog = [{ id: program.id, code: program.code, name: program.name,
      sdManagementType: program.managementType, sdTriggerAction: program.triggerAction }] as DiseaseConcept['managementPrograms']
    expect(diagnosisManagementFromCatalog(catalog)).toEqual({ managementResolutionStatus: 'CONFIRMED', managementPrograms: [program] })
  })
})
