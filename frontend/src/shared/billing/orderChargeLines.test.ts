import { describe, expect, it } from 'vitest'
import { orderChargeLineIds } from './orderChargeLines'

describe('orderChargeLineIds', () => {
  const charges = [
    { id: 'c1', sourceType: 'SERVICE_REQUEST', sourceId: '900' },
    { id: 'c2', sourceType: 'SERVICE_REQUEST', sourceId: '900' },
    { id: 'c3', sourceType: 'SERVICE_REQUEST', sourceId: '901' },
    { id: 'c4', sourceType: 'MEDICATION_REQUEST', sourceId: '900' },
  ]

  it('selects every line of the same examination order together', () => {
    expect(orderChargeLineIds(charges, 'c2')).toEqual(['c1', 'c2'])
  })

  it('keeps other sources and unknown ids as single lines', () => {
    expect(orderChargeLineIds(charges, 'c3')).toEqual(['c3'])
    expect(orderChargeLineIds(charges, 'c4')).toEqual(['c4'])
    expect(orderChargeLineIds(charges, 'missing')).toEqual(['missing'])
  })
})
