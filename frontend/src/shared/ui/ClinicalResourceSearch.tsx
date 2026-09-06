import { useCallback } from 'react'
import type { DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../api/masterDataApi'
import type { OrderableMedicationKnowledge } from '../api/encountersApi'
import type { RhnApi } from '../rhnApi'
import { RemoteSearchSelect, type RemoteSearchOption, type RemoteSearchSelectProps } from './RemoteSearchSelect'

export type ClinicalResourceType = 'diagnosis' | 'medication' | 'service'
export type ClinicalResource = DiseaseConcept | MedicationKnowledge | ServiceCatalogItem | OrderableMedicationKnowledge
export type ClinicalResourceOption<T extends ClinicalResource = ClinicalResource> = RemoteSearchOption<T>

export interface ClinicalResourceSearchProps<T extends ClinicalResource = ClinicalResource>
  extends Omit<RemoteSearchSelectProps<T>, 'loadOptions'> {
  api: RhnApi
  resource: ClinicalResourceType
  organizationId?: string
  encounterId?: string
  filterResult?: (item: T) => boolean
}

const resourceCopy: Record<ClinicalResourceType, { placeholder: string; searchPlaceholder: string }> = {
  diagnosis: { placeholder: '检索并选择诊断', searchPlaceholder: '输入诊断名称、编码或拼音码' },
  medication: { placeholder: '检索并选择在库药品', searchPlaceholder: '输入通用名、编码或别名' },
  service: { placeholder: '检索并选择诊疗项目', searchPlaceholder: '输入项目名称、编码或项目类型' },
}

export function ClinicalResourceSearch<T extends ClinicalResource = ClinicalResource>({
  api,
  resource,
  organizationId,
  encounterId,
  filterResult,
  placeholder,
  searchPlaceholder,
  ...props
}: ClinicalResourceSearchProps<T>) {
  const loadOptions = useCallback(async (query: string): Promise<RemoteSearchOption<T>[]> => {
    let values: ClinicalResource[]
    if (resource === 'diagnosis') {
      values = await api.masterData.diseases(query, '', 'ACTIVE')
    } else if (resource === 'medication') {
      if (encounterId) {
        values = await api.encounters.orderableMedications(encounterId, query)
      } else {
        values = await api.masterData.medications(query, '', 'ACTIVE', organizationId)
      }
    } else {
      values = await api.masterData.services(query, '', 'ACTIVE', organizationId)
    }
    return values
      .filter((item) => !filterResult || filterResult(item as T))
      .map((item) => mapResourceOption(resource, item) as RemoteSearchOption<T>)
  }, [api, encounterId, filterResult, organizationId, resource])

  const copy = resourceCopy[resource]
  return <RemoteSearchSelect<T>
    {...props}
    showCode={props.showCode ?? (resource !== 'medication')}
    placeholder={placeholder ?? copy.placeholder}
    searchPlaceholder={searchPlaceholder ?? copy.searchPlaceholder}
    loadOptions={loadOptions}
  />
}

function mapResourceOption(resource: ClinicalResourceType, item: ClinicalResource): RemoteSearchOption<ClinicalResource> {
  if (resource === 'diagnosis') {
    const value = item as DiseaseConcept
    return {
      value: value.id,
      label: value.display,
      code: value.code,
      description: [value.systemName, value.sdConceptTypeText, value.chapterName].filter(Boolean).join(' · '),
      tags: value.shortDisplay && value.shortDisplay !== value.display ? [value.shortDisplay] : undefined,
      raw: value,
    }
  }
  if (resource === 'medication') {
    const value = item as MedicationKnowledge & Partial<OrderableMedicationKnowledge>
    const tags = [
      value.prescriptionDrug ? '处方药' : '',
      value.antimicrobial ? '抗菌药' : '',
      value.skinTestRequired ? '需皮试' : '',
    ].filter(Boolean)
    if (value.stockSiteName) {
      tags.unshift(value.stockSiteName)
    }
    const spec = value.preparationSpec ? ` (${value.preparationSpec})` : ''
    const packageSpecs = Array.from(new Set(
      (value.products ?? []).flatMap((p) =>
        (p.packages ?? []).map((pkg) => pkg.packageSpec || (pkg.quantityFactor && pkg.unitName ? `${pkg.quantityFactor}${p.unitCode || value.preparationUnit || '单位'}/${pkg.unitName}` : ''))
      ).filter(Boolean)
    ))
    const packageSpecText = packageSpecs.length > 0 ? `包装: ${packageSpecs.join(' / ')}` : ''
    const stockText = value.stockSiteName && value.availablePackageQuantity != null
      ? `【${value.stockSiteName} · 可用: ${value.availablePackageQuantity}${value.packageUnitName || '包装'}】`
      : ''
    return {
      value: value.id,
      label: `${value.name}${spec}`,
      code: value.code,
      description: [stockText, value.sdMedicationTypeText, value.sdDoseFormText, packageSpecText].filter(Boolean).join(' · '),
      tags: tags.length ? tags : undefined,
      raw: value,
    }
  }
  const value = item as ServiceCatalogItem
  return {
    value: value.id,
    label: value.organizationAdoption?.localName || value.name,
    code: value.organizationAdoption?.localCode || value.code,
    description: [value.sdServiceTypeText, value.serviceSubtype, value.unitCode].filter(Boolean).join(' · '),
    tags: value.medicalTechnology ? ['医疗技术'] : undefined,
    raw: value,
  }
}
