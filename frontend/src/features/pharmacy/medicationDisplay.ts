import type { MedicationRequest } from '../../shared/api/encountersApi'

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

function parseStrength(spec?: string, snapshot?: Record<string, unknown>, presentationUnit?: string): StrengthInfo | null {
  if (snapshot?.strengthValue && snapshot?.strengthUnit) {
    const val = Number(snapshot.strengthValue)
    if (val > 0 && Number.isFinite(val)) {
      return { value: val, unit: displayUnitName(String(snapshot.strengthUnit)) || String(snapshot.strengthUnit) }
    }
  }

  if (!spec) return null

  // Only a single amount (optionally per named presentation) establishes a conversion.
  // Concentrations, compound ingredients and free-text package descriptions remain display-only.
  const match = spec.trim().match(/^(\d+(?:\.\d+)?)\s*(mg|ml|ug|μg|g|毫克|克|毫升|微克)(?:\s*[/／]\s*([^\d\s]+))?$/i)
  if (match && (!match[3] || displayUnitName(match[3]) === presentationUnit)) {
    const val = Number(match[1])
    if (val > 0 && Number.isFinite(val)) return { value: val, unit: displayUnitName(match[2]) }
  }
  return null
}

function convertToUnit(value: number, fromUnit: string, toUnit: string): number | null {
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

  return null
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
  const minUnit = displayUnitName(req.preparationUnit || req.baseUnit)
  const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
  const strength = parseStrength(req.preparationSpec, snap, minUnit)

  if (doseVal == null || !Number.isFinite(doseVal)) return '剂量未记录'
  if (!rawDoseUnit) return `${formatNum(doseVal)}（剂量单位未记录）`

  // Case 1: Prescribed in countable packaging units (e.g. 2片, 4粒, 1支, 2袋)
  if (rawDoseUnit && (COUNTABLE_UNITS.has(rawDoseUnit) || COUNTABLE_UNITS.has(req.doseUnit || ''))) {
    const count = doseVal
    const countUnit = rawDoseUnit || minUnit
    if (strength && minUnit && countUnit === minUnit) {
      const totalStrength = count * strength.value
      return `${formatNum(totalStrength)} ${strength.unit}（${formatNum(count)}${countUnit}）`
    }
    return `${formatNum(count)} ${countUnit}`
  }

  // Case 2: Prescribed in mass/volume units (e.g. 0.5g, 250mg, 10ml) or general numeric dose
  const doseUnitName = rawDoseUnit
  const primaryDose = `${formatNum(doseVal)} ${doseUnitName}`

  let minUnitCount: number | null = null

  if (strength) {
    const strengthInDoseUnit = convertToUnit(strength.value, strength.unit, doseUnitName)
    if (strengthInDoseUnit !== null && strengthInDoseUnit > 0) {
      const calculated = doseVal / strengthInDoseUnit
      if (calculated > 0 && calculated <= 1000 && Number.isFinite(calculated)) {
        minUnitCount = Math.round(calculated * 100) / 100
      }
    }
  }

  if (minUnit && minUnitCount && minUnitCount > 0) {
    return `${primaryDose}（${formatNum(minUnitCount)}${minUnit}）`
  }

  return primaryDose
}

// A missing amount stays unknown; dispensing quantity may differ from pricing quantity.
export function recordedMedicationAmount(request: Pick<MedicationRequest, 'totalAmount'>): number | null {
  return request.totalAmount != null && Number.isFinite(request.totalAmount) ? request.totalAmount : null
}

export function sumRecordedAmounts(amounts: Array<number | null>): number | null {
  if (amounts.some((amount) => amount == null || !Number.isFinite(amount))) return null
  return amounts.reduce<number>((sum, amount) => sum + amount!, 0)
}

export function displayRecordedAmount(amount: number | null | undefined): string {
  return amount == null || !Number.isFinite(amount) ? '金额未提供' : `${amount.toFixed(2)} 元`
}

export function formatRecordedDuration(request: Pick<MedicationRequest, 'durationValue' | 'durationUnit'>): string {
  if (request.durationValue == null || !Number.isFinite(request.durationValue)) return '疗程未记录'
  if (!request.durationUnit?.trim()) return `${request.durationValue}（疗程单位未记录）`
  const units: Record<string, string> = { D: '天', DAY: '天', H: '小时', HOUR: '小时', W: '周', WEEK: '周' }
  return `${request.durationValue} ${units[request.durationUnit.toUpperCase()] ?? request.durationUnit}`
}
