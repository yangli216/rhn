import { describe, it, expect } from 'vitest'
import {
  roundNumber,
  formatDose,
  formatQuantity,
  safeAdd,
  safeMultiply,
  formatCurrency,
} from './precision'

describe('precision utility', () => {
  describe('roundNumber', () => {
    it('handles IEEE 754 float quirks correctly', () => {
      expect(roundNumber(1.005, 2)).toBe(1.01)
      expect(roundNumber(30.700000000000003, 2)).toBe(30.7)
      expect(roundNumber(214.90000000000003, 2)).toBe(214.9)
    })

    it('handles zero, negative, null and invalid inputs gracefully', () => {
      expect(roundNumber(0)).toBe(0)
      expect(roundNumber(null)).toBe(0)
      expect(roundNumber(undefined)).toBe(0)
      expect(roundNumber('')).toBe(0)
      expect(roundNumber('abc' as any)).toBe(0)
      expect(roundNumber(-12.3456, 2)).toBe(-12.35)
    })
  })

  describe('formatDose & formatQuantity', () => {
    it('eliminates floating long tails and trailing unnecessary zeros', () => {
      expect(formatDose(10)).toBe('10')
      expect(formatDose(10.5)).toBe('10.5')
      expect(formatDose(30.700000000000003)).toBe('30.7')
      expect(formatDose(214.90000000000003)).toBe('214.9')
      expect(formatDose(0.25)).toBe('0.25')
      expect(formatDose(0.254, 2)).toBe('0.25')
    })

    it('formats quantity consistently', () => {
      expect(formatQuantity(14)).toBe('14')
      expect(formatQuantity(10.5)).toBe('10.5')
      expect(formatQuantity(null)).toBe('0')
    })
  })

  describe('safeAdd', () => {
    it('safely adds floating point numbers without cumulative precision drift', () => {
      expect(safeAdd([0.1, 0.2])).toBe(0.3)
      expect(safeAdd([10.1, 10, 10.6])).toBe(30.7)
      expect(safeAdd([null, undefined, 5, '10'])).toBe(15)
    })
  })

  describe('safeMultiply', () => {
    it('safely multiplies without float long tails', () => {
      expect(safeMultiply(30.7, 7)).toBe(214.9)
      expect(safeMultiply(10.5, 3)).toBe(31.5)
      expect(safeMultiply(0.18, 7)).toBe(1.26)
    })
  })

  describe('formatCurrency', () => {
    it('formats currency with symbol and correct decimals', () => {
      const formatted = formatCurrency(214.9)
      expect(formatted).toMatch(/¥214\.90/)
      expect(formatCurrency(null)).toBe('—')
    })
  })
})
