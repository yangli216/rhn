import type { VitalSignRule, VitalValidationProfile } from '../api/clinicalSafetyApi'

const ID_CARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

export const VITAL_HARD_LIMITS = {
  temperature: { minimum: 20, maximum: 45 },
  pulse: { minimum: 0, maximum: 300 },
  respiratoryRate: { minimum: 0, maximum: 100 },
  systolicPressure: { minimum: 20, maximum: 300 },
  diastolicPressure: { minimum: 10, maximum: 200 },
  oxygenSaturation: { minimum: 0, maximum: 100 },
  height: { minimum: 20, maximum: 250 },
  weight: { minimum: 0.1, maximum: 500 },
  volume: { minimum: 0, maximum: 100000 },
} as const

export function parseChineseResidentId(input: string) {
  const value = input.replace(/\s+/g, '').toUpperCase()
  if (!/^\d{17}[0-9X]$/.test(value)) return null
  const sum = ID_CARD_WEIGHTS.reduce((total, weight, index) => total + Number(value[index]) * weight, 0)
  if (value[17] !== ID_CARD_CHECK_CODES[sum % 11]) return null
  const year = Number(value.slice(6, 10))
  const month = Number(value.slice(10, 12))
  const day = Number(value.slice(12, 14))
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1
      || parsedDate.getUTCDate() !== day) return null
  return {
    normalized: value,
    birthDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    gender: Number(value[16]) % 2 === 1 ? 'MALE' as const : 'FEMALE' as const,
  }
}

export function vitalRule(profile: VitalValidationProfile | undefined, code: VitalSignRule['code']) {
  return profile?.rules.find((rule) => rule.code === code)
}

export function exceedsWarning(value: number | undefined, rule: VitalSignRule | undefined) {
  if (value === undefined || Number.isNaN(value) || !rule) return false
  return rule.warningMinimum !== undefined && value < rule.warningMinimum
    || rule.warningMaximum !== undefined && value > rule.warningMaximum
}
