import { describe, expect, it } from 'vitest'
import type { DiagnosticChargeLine } from '../../shared/rhnApi'
import { knownChargeTotal, previewQuantity, requireExaminationPlan, requireTubePlan } from './diagnosticPreview'

const line: DiagnosticChargeLine = { catalogItemId: 'item', itemCode: 'ITEM', itemName: '实际收费项目',
  quantity: 2, separatelyChargeable: true, sourceType: 'MULTI_SITE_FIXED' }

describe('diagnostic preview truth', () => {
  it('does not treat an unpriced line as zero or a partial subtotal as the complete total', () => {
    expect(knownChargeTotal([line])).toBeUndefined()
    expect(knownChargeTotal([{ ...line, fixedAmount: 80 }, line])).toBeUndefined()
  })
  it('preserves explicit zero and sums line totals without multiplying quantities again', () => {
    expect(knownChargeTotal([{ ...line, fixedAmount: 0 }])).toBe(0)
    expect(knownChargeTotal([{ ...line, fixedAmount: 80 }])).toBe(80)
    expect(knownChargeTotal([{ ...line, separatelyChargeable: false }, { ...line, fixedAmount: 80 }])).toBe(80)
  })
  it('rejects missing or invalid quantities instead of inventing one', () => {
    for (const raw of [undefined, '', ' ', '0', '-1', 'NaN', 'Infinity']) expect(() => previewQuantity(raw)).toThrow()
    expect(previewQuantity('2')).toBe(2)
  })
  it('rejects malformed tube results and unknown monetary values', () => {
    expect(() => requireTubePlan({} as never)).toThrow()
    expect(() => requireTubePlan({ groups: [], chargeLines: [{ ...line, fixedAmount: NaN }] })).toThrow()
    expect(requireTubePlan({ groups: [], chargeLines: [] })).toEqual({ groups: [], chargeLines: [] })
  })
  it('rejects a response for a different examination', () => {
    expect(() => requireExaminationPlan({ serviceId: 'other', siteCount: 1, includedSiteCount: 1,
      extraSiteCount: 0, sitePricingMode: 'SINGLE', lines: [line] }, 'current')).toThrow()
  })
})
