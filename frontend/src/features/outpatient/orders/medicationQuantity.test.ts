import { describe, expect, it } from 'vitest'
import type { ActiveOrderFrequency, MedicationKnowledge } from '../../../shared/api/masterDataApi'
import type { DispensableProductOption } from './dispensableOptions'
import type { MedicationPlanDraft } from './medicationDraft'
import { syncMedicationDraftGroup } from './administrationGroups'
import { calculatePackageQuantity } from './medicationQuantity'

describe('medication quantity from structured frequency', () => {
  const frequency = (ruleType: ActiveOrderFrequency['ruleType'], frequencyCount = 1, periodValue = 1, periodUnit = 'D'): ActiveOrderFrequency => ({
    id: 'frequency-1', revision: 0, name: '规则', anchorType: 'ORDER_START',
    firstDayPolicy: 'FROM_ORDER_TIME', automaticTaskGeneration: false,
    code: 'MISLEADING-QD', ruleType, frequencyCount, periodValue, periodUnit, executionTimes: [],
  })
  const input = {
    medication: { preparationUnit: '片', strengthValue: 10, strengthUnit: 'mg' } as MedicationKnowledge,
    selectedPackage: { packageFactor: 10, unitName: '盒' } as DispensableProductOption,
    doseValue: 20, doseUnit: 'mg', frequencyCode: 'MISLEADING-QD', durationValue: 7,
  }

  it('converts hours and weeks before rounding to whole packages', () => {
    expect(calculatePackageQuantity({ ...input, frequencies: [frequency('FIXED_INTERVAL', 1, 8, 'H')] }))
      .toMatchObject({ totalBaseUnits: 42, quantity: 5 })
    expect(calculatePackageQuantity({ ...input, frequencies: [frequency('TIMES_PER_PERIOD', 1, 1, 'WK')] }))
      .toMatchObject({ totalBaseUnits: 2, quantity: 1 })
  })

  it.each(['PRN', 'ONCE', 'CALENDAR', 'CONTINUOUS'] as const)(
    'requires an explicit quantity for %s, even with execution slots', (kind) => {
      expect(calculatePackageQuantity({ ...input, frequencies: [{ ...frequency(kind), executionTimes: ['08:00'] }] }))
        .toBeNull()
    },
  )

  it('does not use a hardcoded QD fallback while frequency data is unavailable', () => {
    expect(calculatePackageQuantity({ ...input, frequencyCode: 'QD' })).toBeNull()
  })

  const draft = (id: string, code: string, manual = false): MedicationPlanDraft => ({
    id, editorMode: 'regular', categoryCode: 'WESTERN', medicationCode: id, medicationName: id, productName: id,
    routeExecutionType: 'INFUSION', administrationGroupKey: 'group-1', quantityManuallySet: manual,
    request: { medicationId: id, routeCode: 'IV', frequencyCode: code, durationValue: 7, durationUnit: '天',
      quantity: 7, substitutionAllowed: true, selfProvided: false },
  })
  const frequencies = [
    { ...frequency('TIMES_PER_PERIOD'), code: 'QD' },
    { ...frequency('TIMES_PER_PERIOD', 2), code: 'BID' },
    { ...frequency('PRN'), code: 'PRN' },
  ]

  it('preserves manually entered totals while synchronizing the group schedule', () => {
    const automatic = draft('automatic', 'QD')
    const manual = draft('manual', 'QD', true)
    const changed = draft('head', 'BID')
    const result = syncMedicationDraftGroup([draft('head', 'QD'), automatic, manual], changed, frequencies)
    expect(result[1].request).toMatchObject({ frequencyCode: 'BID', quantity: 14 })
    expect(result[2].request).toMatchObject({ frequencyCode: 'BID', quantity: 7 })
  })

  it('does not rescale other draft totals when either frequency has no fixed rate', () => {
    for (const [before, after] of [['QD', 'PRN'], ['PRN', 'BID']]) {
      const result = syncMedicationDraftGroup([draft('head', before), draft('other', before)], draft('head', after), frequencies)
      expect(result[1].request).toMatchObject({ frequencyCode: after, quantity: 7 })
    }
  })
})
