import { describe, expect, it } from 'vitest'
import { exceedsWarning, parseChineseResidentId } from './businessValidation'
import type { VitalSignRule } from '../api/clinicalSafetyApi'

describe('businessValidation', () => {
  describe('exceedsWarning', () => {
    const spo2Rule: VitalSignRule = {
      code: 'oxygen-saturation',
      name: '血氧饱和度',
      unit: '%',
      hardMinimum: 0,
      hardMaximum: 100,
      warningMinimum: 90,
      warningMaximum: null,
    }

    it('does not warn for normal SpO2 values when warningMaximum is null', () => {
      expect(exceedsWarning(98, spo2Rule)).toBe(false)
      expect(exceedsWarning(95, spo2Rule)).toBe(false)
      expect(exceedsWarning(100, spo2Rule)).toBe(false)
      expect(exceedsWarning(90, spo2Rule)).toBe(false)
    })

    it('warns when SpO2 is below warningMinimum', () => {
      expect(exceedsWarning(89, spo2Rule)).toBe(true)
      expect(exceedsWarning(85, spo2Rule)).toBe(true)
    })

    it('handles two-sided warning limits properly', () => {
      const bpRule: VitalSignRule = {
        code: 'systolic-pressure',
        name: '收缩压',
        unit: 'mmHg',
        hardMinimum: 20,
        hardMaximum: 300,
        warningMinimum: 80,
        warningMaximum: 180,
      }

      expect(exceedsWarning(120, bpRule)).toBe(false)
      expect(exceedsWarning(79, bpRule)).toBe(true)
      expect(exceedsWarning(181, bpRule)).toBe(true)
    })

    it('returns false for undefined or NaN values', () => {
      expect(exceedsWarning(undefined, spo2Rule)).toBe(false)
      expect(exceedsWarning(NaN, spo2Rule)).toBe(false)
      expect(exceedsWarning(98, undefined)).toBe(false)
    })
  })

  describe('parseChineseResidentId', () => {
    it('parses valid ID card', () => {
      const res = parseChineseResidentId('330102196601011138')
      expect(res).not.toBeNull()
      expect(res?.birthDate).toBe('1966-01-01')
      expect(res?.gender).toBe('MALE')
    })
  })
})
