import type { MedicationKnowledge } from '../../../shared/api/masterDataApi'
import type { ClinicalResourceOption } from '../../../shared/ui'

export interface MedicationEntry {
  medication?: ClinicalResourceOption<MedicationKnowledge>
  doseValue: number | ''
  doseUnit: string
  routeCode: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
  administrationGroupKey?: string
  frequencyCode: string
  durationValue: number | ''
  quantity: number | ''
  dispenseOptionKey: string
  instruction: string
  herbalDoseCount: number | ''
  herbalMethod: string
  safetyReviewed: boolean
  allergyOverrideReason: string
  isManualQuantity?: boolean
  stockSiteId?: string
  stockSiteName?: string
  availablePackageQuantity?: number
  packageUnitName?: string
  skinTestExempt?: boolean
  skinTestExemptReason?: string
  exemptEvidenceEventId?: string
}

export const emptyMedicationEntry = (): MedicationEntry => ({
  doseValue: '', doseUnit: '', routeCode: '', frequencyCode: '', durationValue: '', quantity: 1,
  dispenseOptionKey: '', instruction: '', herbalDoseCount: 7, herbalMethod: '水煎服', safetyReviewed: false,
  allergyOverrideReason: '', isManualQuantity: false,
  stockSiteId: undefined, stockSiteName: undefined, availablePackageQuantity: undefined, packageUnitName: undefined,
  skinTestExempt: false, skinTestExemptReason: '', exemptEvidenceEventId: undefined,
})


export type MedicationEntryUpdate = <K extends keyof MedicationEntry>(field: K, value: MedicationEntry[K]) => void

export function withSkinTestExemption(current: MedicationEntry, checked: boolean, evidence?: { eventId?: string }) {
  return {
    ...current,
    skinTestExempt: checked,
    skinTestExemptReason: checked && evidence?.eventId ? `周期内皮试阴性有效（引用记录 #${evidence.eventId}）`
      : checked ? (current.skinTestExemptReason || '') : '',
    exemptEvidenceEventId: checked ? (evidence ? evidence.eventId : current.exemptEvidenceEventId) : undefined,
  }
}
