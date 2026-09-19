import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEDULING_DATE_PRESETS, type PresetKey } from './dateRange'

const range = (key: PresetKey) => SCHEDULING_DATE_PRESETS.find(preset => preset.key === key)!.getRange()
afterEach(() => vi.useRealTimers())

describe('scheduling date presets', () => {
  it('uses inclusive future ranges and excludes elapsed days from the current week/month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 18, 12))
    expect(range('THIS_WEEK')).toEqual({ from: '2026-09-18', to: '2026-09-20' })
    expect(range('NEXT_WEEK')).toEqual({ from: '2026-09-21', to: '2026-09-27' })
    expect(range('NEXT_7_DAYS')).toEqual({ from: '2026-09-18', to: '2026-09-24' })
    expect(range('NEXT_14_DAYS')).toEqual({ from: '2026-09-18', to: '2026-10-01' })
    expect(range('NEXT_28_DAYS')).toEqual({ from: '2026-09-18', to: '2026-10-15' })
    expect(range('THIS_MONTH')).toEqual({ from: '2026-09-18', to: '2026-09-30' })
    expect(range('NEXT_MONTH')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('handles Sunday, year rollover and leap-year month boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 27, 12))
    expect(range('THIS_WEEK')).toEqual({ from: '2026-12-27', to: '2026-12-27' })
    expect(range('NEXT_WEEK')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(range('NEXT_MONTH')).toEqual({ from: '2027-01-01', to: '2027-01-31' })
    vi.setSystemTime(new Date(2028, 0, 31, 12))
    expect(range('NEXT_MONTH')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})
