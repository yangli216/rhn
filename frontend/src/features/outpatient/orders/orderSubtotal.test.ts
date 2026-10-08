import { describe, expect, it } from 'vitest'
import { draftOrderSubtotal, savedOrderSubtotal, formatOrderSubtotal } from './orderSubtotal'

describe('order subtotal facts', () => {
  it.each([undefined, null, '', NaN, Infinity, -1, '1'])('does not turn unknown price %s into a partial total', unitPrice => {
    expect(draftOrderSubtotal([{ unitPrice: 10, quantity: 1, currencyCode: 'CNY' },
      { unitPrice: unitPrice as number, quantity: 1, currencyCode: 'CNY' }])).toEqual({ status: 'unknown' })
  })
  it.each([undefined, null, '', NaN, Infinity, -1, 0, '1'])('does not default quantity %s to one', quantity => {
    expect(draftOrderSubtotal([{ unitPrice: 10, quantity: quantity as number, currencyCode: 'CNY' }])).toEqual({ status: 'unknown' })
  })
  it.each([undefined, null, '', 'cny'])('does not infer currency %s', currencyCode => {
    expect(draftOrderSubtotal([{ unitPrice: 10, quantity: 1, currencyCode: currencyCode as string }])).toEqual({ status: 'unknown' })
  })
  it('keeps separate currencies and preserves genuine zero and small amounts', () => {
    const result = draftOrderSubtotal([{ unitPrice: 0, quantity: 2, currencyCode: 'CNY' },
      { unitPrice: 0.000001, quantity: 3, currencyCode: 'USD' }])
    expect(formatOrderSubtotal(result)).toBe('CNY 0.00；USD 0.000003')
  })
  it('adds decimal products exactly before rounding the subtotal display', () => {
    const result = draftOrderSubtotal([{ unitPrice: 0.18, quantity: 70.7, currencyCode: 'CNY' },
      { unitPrice: 0.2, quantity: 70, currencyCode: 'CNY' }, { unitPrice: 0.16, quantity: 74.2, currencyCode: 'CNY' }])
    expect(result).toEqual({ status: 'known', totals: [{ currencyCode: 'CNY', amount: '38.598' }] })
    expect(formatOrderSubtotal(result)).toBe('CNY 38.60')
    expect(formatOrderSubtotal(draftOrderSubtotal([{ unitPrice: 1.005, quantity: 1, currencyCode: 'CNY' }]))).toBe('CNY 1.01')
  })
  it('handles scientific notation without producing infinity or a fake zero', () => {
    expect(formatOrderSubtotal(draftOrderSubtotal([{ unitPrice: 1e-25, quantity: 1e20, currencyCode: 'CNY' }]))).toBe('CNY 0.00001')
    expect(formatOrderSubtotal(draftOrderSubtotal([{ unitPrice: 1e200, quantity: 1e200, currencyCode: 'CNY' }]))).not.toContain('Infinity')
  })
  it('uses saved amount snapshots instead of recomputing from base quantity and package price', () => {
    const rows = [{ status: 'ACTIVE', totalAmount: 18.8, currencyCode: 'USD', unitPrice: 18.8, quantity: 24 },
      { status: 'ACTIVE', totalAmount: 2, currencyCode: 'USD' }, { status: 'CANCELLED', totalAmount: 8, currencyCode: 'USD' }]
    expect(formatOrderSubtotal(savedOrderSubtotal(rows))).toBe('USD 20.80')
  })
  it('does not replace a missing saved amount with a computed value', () => {
    const row = { status: 'ACTIVE', unitPrice: 2, quantity: 3, currencyCode: 'CNY' }
    expect(savedOrderSubtotal([row])).toEqual({ status: 'unknown' })
  })
  it('distinguishes cancelled-only documents and unknown states from zero-priced active orders', () => {
    expect(formatOrderSubtotal(savedOrderSubtotal([{ status: 'CANCELLED' }]))).toBe('无有效计价明细')
    expect(formatOrderSubtotal(savedOrderSubtotal([{ status: 'ACTIVE', totalAmount: 0, currencyCode: 'CNY' }]))).toBe('CNY 0.00')
    expect(formatOrderSubtotal(savedOrderSubtotal([{ status: 'UNKNOWN', totalAmount: 2, currencyCode: 'CNY' }]))).toBe('待确认')
  })
})
