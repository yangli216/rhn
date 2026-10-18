import type { MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import { editorServiceAdopted, requireEditorMedication, requireEditorService } from './templateEditorFacts'
import type { TemplateMedicationCandidate, TemplateServiceCandidate } from './templateCatalogSearch'

/** A shared-search medication (same directory as the doctor workstation) as a plan medication candidate. */
export function medicationCandidateFromKnowledge(value: MedicationKnowledge): TemplateMedicationCandidate {
  const item = requireEditorMedication(value)
  return { key: `generic:${item.id}`, id: item.id, medicationId: item.id, name: item.name, isGenericOnly: true,
    preparationSpec: item.preparationSpec, tradeName: item.aliasName, quantityUnit: item.preparationUnit,
    doseUnit: item.defaultDoseUnit, defaultDose: item.defaultDose, defaultRoute: item.defaultRoute,
    defaultFrequency: item.defaultFrequency }
}

/** Plans only carry outpatient laboratory/examination items that the current organization has adopted. */
export function serviceCandidateFromCatalog(value: ServiceCatalogItem, organizationId?: string): TemplateServiceCandidate {
  const item = requireEditorService(value)
  if (!organizationId) throw new Error('当前工作机构尚未确认，不能检索院内项目。')
  if (!editorServiceAdopted(item, organizationId) || !item.organizationAdoption?.executable) {
    throw new Error(`项目“${item.name}”在当前机构暂无有效可开立采用，不能加入方案。`)
  }
  if (!['LABORATORY', 'EXAMINATION'].includes(item.sdServiceType) || !['OUTPATIENT', 'COMMON'].includes(item.sdUsageType)) {
    throw new Error(`项目“${item.name}”不是门诊检验检查项目，不能加入方案。`)
  }
  const adoption = item.organizationAdoption
  return { id: item.id, code: adoption.localCode || item.code, name: adoption.localName || item.name, unitCode: item.unitCode,
    serviceType: item.sdServiceType as TemplateServiceCandidate['serviceType'], organizationId,
    chargeable: item.chargeable && adoption.chargeable }
}

/** Search-result filter keeping the picker to what a plan can actually hold. */
export const planServiceFilter = (item: ServiceCatalogItem) => ['LABORATORY', 'EXAMINATION'].includes(item.sdServiceType)
