import { useCallback } from 'react'
import type { DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../api/masterDataApi'
import type { RhnApi } from '../rhnApi'
import { RemoteSearchSelect, type RemoteSearchOption, type RemoteSearchSelectProps } from './RemoteSearchSelect'

export type ClinicalResourceType = 'diagnosis' | 'medication' | 'service'
export type ClinicalResource = DiseaseConcept | MedicationKnowledge | ServiceCatalogItem
export type ClinicalResourceOption<T extends ClinicalResource = ClinicalResource> = RemoteSearchOption<T>

export interface ClinicalResourceSearchProps<T extends ClinicalResource = ClinicalResource>
  extends Omit<RemoteSearchSelectProps<T>, 'loadOptions'> {
  api: RhnApi
  resource: ClinicalResourceType
  organizationId?: string
  filterResult?: (item: T) => boolean
}

const resourceCopy: Record<ClinicalResourceType, { placeholder: string; searchPlaceholder: string }> = {
  diagnosis: { placeholder: '检索并选择诊断', searchPlaceholder: '输入诊断名称、编码或拼音码' },
  medication: { placeholder: '检索并选择通用药品', searchPlaceholder: '输入通用名、编码或别名' },
  service: { placeholder: '检索并选择诊疗项目', searchPlaceholder: '输入项目名称、编码或项目类型' },
}

export function ClinicalResourceSearch<T extends ClinicalResource = ClinicalResource>({
  api,
  resource,
  organizationId,
  filterResult,
  placeholder,
  searchPlaceholder,
  ...props
}: ClinicalResourceSearchProps<T>) {
  const loadOptions = useCallback(async (query: string): Promise<RemoteSearchOption<T>[]> => {
    let values: ClinicalResource[]
    if (resource === 'diagnosis') values = await api.masterData.diseases(query, '', 'ACTIVE')
    else if (resource === 'medication') values = await api.masterData.medications(query, '', 'ACTIVE', organizationId)
    else values = await api.masterData.services(query, '', 'ACTIVE', organizationId)
    return values
      .filter((item) => !filterResult || filterResult(item as T))
      .map((item) => mapResourceOption(resource, item) as RemoteSearchOption<T>)
  }, [api, filterResult, organizationId, resource])

  const copy = resourceCopy[resource]
  return <RemoteSearchSelect<T>
    {...props}
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
    const value = item as MedicationKnowledge
    const tags = [value.prescriptionDrug ? '处方药' : '', value.antimicrobial ? '抗菌药' : '',
      value.skinTestRequired ? '需皮试' : ''].filter(Boolean)
    return {
      value: value.id,
      label: value.name,
      code: value.code,
      description: [value.sdMedicationTypeText, value.sdDoseFormText, value.preparationSpec].filter(Boolean).join(' · '),
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
