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
  const numDose = Number(doseValue), days = Number(durationValue)
  const factor = selectedPackage.packageFactor
  if (!Number.isFinite(numDose) || numDose <= 0 || !Number.isFinite(days) || days <= 0
    || typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null
  const baseUnit = selectedPackage.product?.unitCode?.trim()
  const actualDoseUnit = doseUnit?.trim()
  if (!baseUnit || !actualDoseUnit || !selectedPackage.unitName?.trim()) return null
  const timesPerDay = resolveFrequencyTimesPerDay(frequencies, frequencyCode)
  if (timesPerDay === null) return null

  let singleDoseUnits: number
  if (actualDoseUnit === baseUnit) {
    singleDoseUnits = numDose
  } else {
    // Strength is per preparation unit, so it cannot convert a different product base unit.
    const strength = medication.strengthValue
    const strengthUnit = medication.strengthUnit?.trim()
    if (medication.preparationUnit?.trim() !== baseUnit || typeof strength !== 'number'
      || !Number.isFinite(strength) || strength <= 0 || !strengthUnit) return null
    const massUnits: Record<string, number> = { g: 1, mg: 0.001, ug: 0.000001, 'μg': 0.000001, 'µg': 0.000001 }
    let conversion: number
    if (actualDoseUnit === strengthUnit) conversion = 1
    else if (Object.hasOwn(massUnits, actualDoseUnit) && Object.hasOwn(massUnits, strengthUnit)) {
      conversion = massUnits[actualDoseUnit] / massUnits[strengthUnit]
    } else return null
    singleDoseUnits = numDose * conversion / strength
  }
  const totalBaseUnits = singleDoseUnits * timesPerDay * days
  const packageQty = Math.ceil(totalBaseUnits / factor)
  if (!Number.isFinite(totalBaseUnits) || totalBaseUnits <= 0 || !Number.isSafeInteger(packageQty) || packageQty <= 0) return null
  const calculationText = `1${selectedPackage.unitName}=${factor}${baseUnit} · ${days}天共需${totalBaseUnits}${baseUnit}，合${packageQty}${selectedPackage.unitName}`
  return { quantity: packageQty, calculationText, totalBaseUnits }
}
