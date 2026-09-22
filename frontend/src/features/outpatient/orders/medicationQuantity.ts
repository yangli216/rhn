import type { ActiveOrderFrequency, MedicationKnowledge } from '../../../shared/api/masterDataApi'
import type { DispensableProductOption } from './dispensableOptions'
import { fixedDailyRate } from '../../../shared/clinical/frequencySemantics'

export function resolveFrequencyTimesPerDay(frequencies?: ActiveOrderFrequency[], code?: string): number | null {
  return fixedDailyRate(code ? frequencies?.find((frequency) => frequency.code === code) : undefined)
}

export function calculatePackageQuantity({
  medication,
  doseValue,
  doseUnit,
  frequencyCode,
  durationValue,
  selectedPackage,
  frequencies,
}: {
  medication?: MedicationKnowledge
  doseValue?: number | string
  doseUnit?: string
  frequencyCode?: string
  durationValue?: number | string
  selectedPackage?: DispensableProductOption
  frequencies?: ActiveOrderFrequency[]
}): { quantity: number; calculationText: string; totalBaseUnits: number } | null {
  if (!medication || !selectedPackage) return null
  const numDose = Number(doseValue)
  if (!numDose || numDose <= 0) return null

  const timesPerDay = resolveFrequencyTimesPerDay(frequencies, frequencyCode)
  if (timesPerDay === null) return null

  let singleDoseUnits = numDose
  const prepUnit = medication.preparationUnit || ''
  let strValue = medication.strengthValue
  let strUnit = medication.strengthUnit || ''
  const specText = (medication as unknown as { strength?: string }).strength || medication.preparationSpec
  if ((!strValue || strValue <= 0) && specText) {
    const match = String(specText).match(/^([\d.]+)\s*([a-zA-Z\u4e00-\u9fa5]+)/)
    if (match) {
      strValue = Number(match[1])
      strUnit = strUnit || match[2]
    }
  }

  if (doseUnit && prepUnit && doseUnit === prepUnit) {
    singleDoseUnits = numDose
  } else if (strValue && strValue > 0) {
    const dUnit = (doseUnit || '').toLowerCase()
    const sUnit = (strUnit || '').toLowerCase()
    let doseInStrengthUnit = numDose
    if (dUnit && sUnit && dUnit !== sUnit) {
      if (dUnit === 'g' && sUnit === 'mg') doseInStrengthUnit = numDose * 1000
      else if (dUnit === 'mg' && sUnit === 'g') doseInStrengthUnit = numDose / 1000
      else if ((dUnit === 'mg' && (sUnit === 'ug' || sUnit === 'μg'))) doseInStrengthUnit = numDose * 1000
      else if (((dUnit === 'ug' || dUnit === 'μg') && sUnit === 'mg')) doseInStrengthUnit = numDose / 1000
    }
    singleDoseUnits = doseInStrengthUnit / strValue
  }

  const days = Number(durationValue) > 0 ? Number(durationValue) : 1
  const totalBaseUnits = singleDoseUnits * timesPerDay * days
  const factor = selectedPackage.packageFactor > 0 ? selectedPackage.packageFactor : 1
  const packageQty = Math.max(1, Math.ceil(totalBaseUnits / factor))

  let doseEquivalentText = ''
  if (doseUnit && prepUnit && doseUnit === prepUnit && strValue && strValue > 0) {
    const eqStrength = Math.round(numDose * strValue * 100) / 100
    doseEquivalentText = `折合单次 ${eqStrength}${strUnit || ''}`
  } else if (doseUnit && prepUnit && doseUnit !== prepUnit && singleDoseUnits > 0) {
    const eqPrep = Math.round(singleDoseUnits * 100) / 100
    doseEquivalentText = `折合单次 ${eqPrep}${prepUnit}`
  }

  const calculationText = `1${selectedPackage.unitName}=${factor}${prepUnit || '单位'} · ${days}天共需${Math.round(totalBaseUnits * 100) / 100}${prepUnit || ''}，合${packageQty}${selectedPackage.unitName}${doseEquivalentText ? `（${doseEquivalentText}）` : ''}`

  return { quantity: packageQty, calculationText, totalBaseUnits }
}

