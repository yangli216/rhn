import { afterEach, describe, expect, it, vi } from 'vitest'
import { age } from './format'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('patient age by calendar date', () => {
  it('changes age on the birthday rather than on the preceding UTC date', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59))
    expect(age('1990-10-14')).toBe(35)
    vi.setSystemTime(new Date(2026, 9, 14, 0, 0))
    expect(age('1990-10-14')).toBe(36)
  })
  it('handles year boundaries and a patient born today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12))
    expect(age('1990-12-31')).toBe(35)
    expect(age('2026-01-01')).toBe(0)
  })
})
