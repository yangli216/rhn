import { describe, expect, it } from 'vitest'
import { emptyMedicationEntry, withSkinTestExemption } from './medicationEntry'

describe('composer skin test exemption updates', () => {
  it('replaces evidence atomically while preserving the current dose and manual quantity', () => {
    const current = { ...emptyMedicationEntry(), doseValue: 0.5, quantity: 3, isManualQuantity: true,
      exemptEvidenceEventId: 'old' }
    const next = withSkinTestExemption(current, true, { eventId: 'new' })
    expect(next).toMatchObject({ doseValue: 0.5, quantity: 3, isManualQuantity: true,
      skinTestExempt: true, exemptEvidenceEventId: 'new', skinTestExemptReason: '周期内皮试阴性有效（引用记录 #new）' })
    expect(current.exemptEvidenceEventId).toBe('old')
  })

  it('retains a manual reason on enable and clears reason and evidence on disable', () => {
    const current = { ...emptyMedicationEntry(), skinTestExemptReason: '同批号连续用药', exemptEvidenceEventId: 'old' }
    const enabled = withSkinTestExemption(current, true)
    expect(enabled.skinTestExemptReason).toBe('同批号连续用药')
    expect(withSkinTestExemption(enabled, false)).toMatchObject({ skinTestExempt: false,
      skinTestExemptReason: '', exemptEvidenceEventId: undefined })
  })

  it('does not retain an old evidence ID when the new result has no event ID', () => {
    const current = { ...emptyMedicationEntry(), exemptEvidenceEventId: 'old' }
    expect(withSkinTestExemption(current, true, {}).exemptEvidenceEventId).toBeUndefined()
  })
})
