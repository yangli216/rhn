/** Mirrors ClinicalFrequencySemantics; both implementations share contract fixtures. */
export interface ClinicalFrequency {
  kind: string
  dailyRateComputable: boolean
  doses: number | null
  perDays: number | null
  scheduledTimes: string[]
  unknownReason: string | null
}

export function interpretClinicalFrequency(snapshot: unknown): ClinicalFrequency {
  const value = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : null
  const times = Array.isArray(value?.executionTimes)
    ? value.executionTimes.filter((time): time is string => typeof time === 'string') : []
  const unknown = (kind: string, reason: string): ClinicalFrequency => ({
    kind, dailyRateComputable: false, doses: null, perDays: null, scheduledTimes: times, unknownReason: reason,
  })
  if (!value) return unknown('OTHER', 'FREQUENCY_MISSING')
  switch (value.ruleType) {
    case 'PRN': return unknown('AS_NEEDED', 'AS_NEEDED_HAS_NO_FIXED_DAILY_RATE')
    case 'ONCE': return unknown('ONCE', 'SINGLE_OCCURRENCE_HAS_NO_DAILY_RATE')
    case 'CALENDAR': return unknown('SCHEDULED_TIME', 'CALENDAR_REQUIRES_DATE_CONTEXT')
    case 'TIMES_PER_PERIOD':
    case 'FIXED_INTERVAL': break
    default: return unknown('OTHER', 'FREQUENCY_NOT_COMPUTABLE')
  }
  const kind = value.ruleType === 'FIXED_INTERVAL' ? 'INTERVAL' : 'TIMES_PER_DAY'
  const period = value.periodValue
  if (typeof period !== 'number' || !Number.isFinite(period) || period <= 0) {
    return unknown(kind, 'PERIOD_MISSING_OR_INVALID')
  }
  if (kind === 'INTERVAL' && value.frequencyCount !== 1) return unknown(kind, 'INTERVAL_COUNT_CONFLICT')
  const count = value.frequencyCount
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
    return unknown(kind, 'FREQUENCY_COUNT_MISSING_OR_INVALID')
  }
  let doses = count
  let perDays = period
  switch (value.periodUnit) {
    case 'MIN': doses *= 1440; break
    case 'H': doses *= 24; break
    case 'D': break
    case 'WK': perDays *= 7; break
    default: return unknown(kind, 'PERIOD_UNIT_NOT_FIXED_LENGTH')
  }
  return { kind, dailyRateComputable: true, doses, perDays, scheduledTimes: times, unknownReason: null }
}

/** Null is deliberate: an unknown/PRN/once schedule must never default to one dose per day. */
export function fixedDailyRate(snapshot: unknown): number | null {
  const result = interpretClinicalFrequency(snapshot)
  if (!result.dailyRateComputable || result.doses === null || result.perDays === null) return null
  const rate = result.doses / result.perDays
  return Number.isFinite(rate) && rate > 0 ? rate : null
}
