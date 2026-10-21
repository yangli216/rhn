import { afterEach, describe, expect, it, vi } from 'vitest'
import { age, formatDateTimeParts, formatLocaleDateTime, regionDisplayName } from './format'

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

describe('locale date/time display helpers (TZ pinned to Asia/Shanghai by vitest config)', () => {
  const at = new Date('2026-03-05T06:07:08Z')

  it('formatLocaleDateTime follows toLocaleString defaults: date and time when no field is requested', () => {
    expect(formatLocaleDateTime(at)).toBe('2026/3/5 14:07:08')
    expect(formatLocaleDateTime('2026-03-05T06:07:08Z')).toBe('2026/3/5 14:07:08')
    expect(formatLocaleDateTime(at.getTime())).toBe('2026/3/5 14:07:08')
    expect(formatLocaleDateTime(at, { hour12: false })).toBe('2026/3/5 14:07:08')
    expect(formatLocaleDateTime(at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })).toBe('03/05 14:07')
    expect(formatLocaleDateTime('not a date')).toBe('Invalid Date')
  })

  it('formatDateTimeParts follows Intl.DateTimeFormat: date only by default, requested fields otherwise', () => {
    expect(formatDateTimeParts(at)).toBe('2026/3/5')
    expect(formatDateTimeParts('2026-03-05T06:07:08Z', { hour: '2-digit', minute: '2-digit' })).toBe('14:07')
    expect(formatDateTimeParts(at, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })).toBe('14:07:08')
    expect(formatDateTimeParts(at, { dateStyle: 'medium', timeStyle: 'short' })).toBe('2026年3月5日 14:07')
    expect(formatDateTimeParts(at, { month: 'long', day: 'numeric', weekday: 'long' })).toBe('3月5日星期四')
    expect(formatDateTimeParts(at, {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })).toBe('03/05周四 14:07')
    expect(formatDateTimeParts(at, {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    })).toBe('2026/03/05 UTC 06:07:08')
    expect(() => formatDateTimeParts('not a date')).toThrow(RangeError)
  })

  it('regionDisplayName returns the Chinese region name', () => {
    expect(regionDisplayName('US')).toBe('美国')
    expect(regionDisplayName('CN')).toBe('中国')
    expect(() => regionDisplayName('not-a-region')).toThrow(RangeError)
  })
})
