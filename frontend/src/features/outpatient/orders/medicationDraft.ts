import type { CreateMedicationRequestInput } from '../../../shared/api/encountersApi'

export interface MedicationPlanDraft {
  /** Explicit total quantity must survive dose/frequency edits and group synchronization. */
  quantityManuallySet?: boolean
  id: string
  sequence?: number
  editorMode: 'regular' | 'herbal'
  categoryCode: string
  medicationName: string
  medicationCode: string
  preparationSpec?: string
  productName: string
  productSpec?: string
  manufacturerName?: string
  unitPrice?: number
  currencyCode?: string
  routeName?: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
  parentRequestId?: string
  administrationGroupKey?: string
  stockSiteName?: string
  availablePackageQuantity?: number
  packageUnitName?: string
  skinTestRequired?: boolean
  skinTestResultValidityHours?: number
  antimicrobial?: boolean
  sdAntimicrobialLevelText?: string
  allergenConceptIds?: string[]
  request: Omit<CreateMedicationRequestInput, 'prescriptionId' | 'parentRequestId'>
}

export function isInfusionRoute(_route: string | undefined, executionType?: string) {
  return executionType === 'INFUSION'
}

