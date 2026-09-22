import type { MedicationRequest } from '../../shared/api/encountersApi'
import { fixedDailyRate } from '../../shared/clinical/frequencySemantics'

export function displayUnitName(code?: string) {
  if (!code) return ''
  const value = code.trim()
  const labels: Record<string, string> = {
    BOX: '盒', BOTTLE: '瓶', BAG: '袋', PACK: '包', VIAL: '瓶', AMP: '支', AMPOULE: '支',
    TABLET: '片', TAB: '片', CAPSULE: '粒', CAP: '粒', PIECE: '个', PCS: '个',
    ML: 'ml', L: 'L', MG: 'mg', G: 'g', UG: 'μg', DOSE: '剂', UNIT: 'U',
    毫克: 'mg', 克: 'g', 毫升: 'ml', 升: 'L', 微克: 'μg',
  }
  return labels[value.toUpperCase()] ?? labels[value] ?? value
}

export function formatFrequencyName(code?: string, name?: string) {
  if (name?.trim()) return name.trim()
  if (!code) return '频次未记录'
  const map: Record<string, string> = {
    QD: '每日一次', BID: '每日两次', TID: '每日三次', QID: '每日四次',
    Q8H: '每8小时一次', Q12H: '每12小时一次', QN: '每晚一次', QOD: '隔日一次',
    QW: '每周一次', PRN: '必要时', STAT: '立即',
  }
  return map[code.toUpperCase()] ?? code
}

const COUNTABLE_UNITS = new Set([
  '片', '粒', '支', '袋', '瓶', '贴', '包', '丸', '枚', '盒', '剂', '滴',
  'TAB', 'CAP', 'CAPSULE', 'TABLET', 'VIAL', 'AMP', 'AMPOULE', 'BAG', 'BOTTLE', 'PACK', 'PIECE', 'PCS',
])

interface StrengthInfo {
  value: number
  unit: string
}

function parseStrength(spec?: string, snapshot?: Record<string, unknown>): StrengthInfo | null {
  if (snapshot?.strengthValue && snapshot?.strengthUnit) {
    const val = Number(snapshot.strengthValue)
    if (val > 0) {
      return { value: val, unit: displayUnitName(String(snapshot.strengthUnit)) || String(snapshot.strengthUnit) }
    }
  }

  if (!spec) return null

  // Match e.g. "0.25g", "250mg", "10ml", "5mg/片", "0.25g*24片/盒", "0.5g/支", "100mg"
  const match = spec.match(/([\d.]+)\s*(g|mg|ml|ug|μg|毫克|克|毫升|微克)/i)
  if (match) {
    const val = parseFloat(match[1])
    const unit = displayUnitName(match[2]) || match[2]
    if (val > 0) {
      return { value: val, unit }
    }
  }
  return null
}

function convertToUnit(value: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.toLowerCase().trim()
  const to = toUnit.toLowerCase().trim()
  if (from === to) return value

  if ((from === 'g' || from === '克') && (to === 'mg' || to === '毫克')) return value * 1000
  if ((from === 'mg' || from === '毫克') && (to === 'g' || to === '克')) return value / 1000
  if ((from === 'mg' || from === '毫克') && (to === 'ug' || to === 'μg' || to === '微克')) return value * 1000
  if ((from === 'ug' || from === 'μg' || from === '微克') && (to === 'mg' || to === '毫克')) return value / 1000
  if ((from === 'g' || from === '克') && (to === 'ug' || to === 'μg' || to === '微克')) return value * 1000000
  if ((from === 'l' || from === '升') && (to === 'ml' || to === '毫升')) return value * 1000
  if ((from === 'ml' || from === '毫升') && (to === 'l' || to === '升')) return value / 1000

  return value
}

function formatNum(val: number): string {
  if (Math.abs(val - Math.round(val)) < 0.0001) {
    return String(Math.round(val))
  }
  return val.toFixed(2).replace(/\.?0+$/, '')
}

export function formatDoseWithMinimumUnit(req: MedicationRequest): string {
  const doseVal = req.doseValue
  const rawDoseUnit = req.doseUnit ? displayUnitName(req.doseUnit) : ''
  const minUnit = displayUnitName(req.preparationUnit || req.baseUnit) || '片'
  const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
  const strength = parseStrength(req.preparationSpec || req.packageSpec, snap)

  // If no dose specified at all
  if (doseVal === undefined || doseVal === null) {
    if (strength) {
      return `${formatNum(strength.value)} ${strength.unit}（1${minUnit}）`
    }
    return `1 ${minUnit}`
  }

  // Case 1: Prescribed in countable packaging units (e.g. 2片, 4粒, 1支, 2袋)
  if (rawDoseUnit && (COUNTABLE_UNITS.has(rawDoseUnit) || COUNTABLE_UNITS.has(req.doseUnit || ''))) {
    const count = doseVal
    const countUnit = rawDoseUnit || minUnit
    if (strength) {
      const totalStrength = count * strength.value
      return `${formatNum(totalStrength)} ${strength.unit}（${formatNum(count)}${countUnit}）`
    }
    return `${formatNum(count)} ${countUnit}`
  }

  // Case 2: Prescribed in mass/volume units (e.g. 0.5g, 250mg, 10ml) or general numeric dose
  const doseUnitName = rawDoseUnit || (strength ? strength.unit : 'g')
  const primaryDose = `${formatNum(doseVal)} ${doseUnitName}`

  let minUnitCount: number | null = null

  if (strength) {
    const strengthInDoseUnit = convertToUnit(strength.value, strength.unit, doseUnitName)
    if (strengthInDoseUnit > 0) {
      const calculated = doseVal / strengthInDoseUnit
      if (calculated > 0 && calculated <= 1000 && Number.isFinite(calculated)) {
        minUnitCount = Math.round(calculated * 100) / 100
      }
    }
  }

  if (minUnitCount === null) {
    const totalBase = req.baseQuantity || (req.quantity && req.packageFactor ? req.quantity * req.packageFactor : null)
    const timesPerDay = fixedDailyRate(req.frequencyRule)
    const days = ['d', '天'].includes(req.durationUnit?.toLowerCase() ?? '') ? req.durationValue : null
    const totalDoses = timesPerDay !== null && days != null && days > 0 ? timesPerDay * days : 0
    if (totalBase && totalDoses > 0) {
      const calculated = totalBase / totalDoses
      if (calculated > 0 && calculated <= 1000 && Number.isFinite(calculated)) {
        minUnitCount = Math.round(calculated * 100) / 100
      }
    }
  }

  if (minUnitCount && minUnitCount > 0) {
    return `${primaryDose}（${formatNum(minUnitCount)}${minUnit}）`
  }

  return primaryDose
}
