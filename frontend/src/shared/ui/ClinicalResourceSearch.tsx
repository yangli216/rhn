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
      .map((item) => mapResourceOption(resource, item, organizationId) as RemoteSearchOption<T>)
  }, [api, encounterId, filterResult, organizationId, resource])

  const copy = resourceCopy[resource]
  return <RemoteSearchSelect<T>
    popoverMinWidth={props.popoverMinWidth ?? (resource === 'medication' ? 680 : 560)}
    {...props}
    showCode={props.showCode ?? (resource !== 'medication')}
    placeholder={placeholder ?? copy.placeholder}
    searchPlaceholder={searchPlaceholder ?? copy.searchPlaceholder}
    loadOptions={loadOptions}
  />
}

function mapResourceOption(
  resource: ClinicalResourceType,
  item: ClinicalResource,
  organizationId?: string,
): RemoteSearchOption<ClinicalResource> {
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

    // --- 第一行：药品通用信息（类型、通用名、制剂规格、剂型与临床属性）---
    const typeLabel = value.sdMedicationTypeText || (value.sdMedicationType === 'HERBAL' ? '草药' : '西药')
    const clinicalTags = [
      typeLabel,
      value.essentialDrug ? '基药' : '',
      value.prescriptionDrug ? '处方药' : (value.products?.some((p) => p.otc) ? 'OTC' : ''),
      value.skinTestRequired ? '需皮试' : '',
      value.antimicrobial ? (value.sdAntimicrobialLevelText || '抗菌药') : '',
      value.chronicDiseaseDrug ? '慢病药' : '',
      value.products?.some((p) => p.centralPurchase) ? '集采' : '',
    ].filter(Boolean)

    const spec = value.preparationSpec ? ` (${value.preparationSpec})` : ''
    const doseForm = value.sdDoseFormText ? ` · ${value.sdDoseFormText}` : ''
    const genericLabel = `${value.name}${spec}${doseForm}`

    // --- 第二行：产品相关信息（产地/厂家、单价、包装规格、药房与库存）---
    // 1. 产地 / 生产厂家
    const manufacturers = Array.from(new Set(
      (value.products ?? []).map((p) => {
        const place = p.sdProductionPlaceText ? `[${p.sdProductionPlaceText}]` : ''
        return `${place}${p.manufacturerName || ''}`.trim()
      }).filter(Boolean)
    ))
    const manufacturerText = manufacturers.join('/')

    // 2. 参考单价
    const activePrices: { price: number; unitName?: string }[] = []
    for (const product of value.products ?? []) {
      for (const p of product.prices ?? []) {
        if ((p.sdStatus === 'ACTIVE' || !p.sdStatus) && typeof p.price === 'number') {
          if (!organizationId || !p.organizationId || p.organizationId === organizationId) {
            const matchedPkg = product.packages?.find((pkg) => pkg.id === p.packageId)
            activePrices.push({
              price: p.price,
              unitName: matchedPkg?.unitName,
            })
          }
        }
      }
    }
    let priceText = ''
    if (activePrices.length > 0) {
      const minPrice = Math.min(...activePrices.map((item) => item.price))
      const maxPrice = Math.max(...activePrices.map((item) => item.price))
      const range = minPrice === maxPrice ? `¥${minPrice.toFixed(2)}` : `¥${minPrice.toFixed(2)}~${maxPrice.toFixed(2)}`
      const unit = activePrices[0].unitName || value.packageUnitName || ''
      priceText = unit ? `${range}/${unit}` : range
    }

    // 3. 包装规格
    const packageSpecs = Array.from(new Set(
      (value.products ?? []).flatMap((p) =>
        (p.packages ?? []).map((pkg) => pkg.packageSpec || (pkg.quantityFactor && pkg.unitName ? `${pkg.quantityFactor}${p.unitCode || value.preparationUnit || '单位'}/${pkg.unitName}` : ''))
      ).filter(Boolean)
    ))
    const packageSpecText = packageSpecs.join(' / ')

    // 4. 药房与库存
    let stockText = ''
    if (value.stockSiteName) {
      if (value.availablePackageQuantity != null) {
        if (value.availablePackageQuantity > 0) {
          stockText = `${value.stockSiteName} (可用: ${value.availablePackageQuantity}${value.packageUnitName || '包装'})`
        } else {
          stockText = `${value.stockSiteName} (缺药)`
        }
      } else {
        stockText = value.stockSiteName
      }
    }

    const description = [
      manufacturerText,
      priceText,
      packageSpecText,
      stockText,
    ].filter(Boolean).join(' · ')

    return {
      value: value.id,
      label: genericLabel,
      code: value.code,
      description,
      tags: clinicalTags.length ? clinicalTags : undefined,
      raw: value,
    }
  }
  const value = item as ServiceCatalogItem
  const activePrices = (value.prices ?? []).filter((p) =>
    (p.sdStatus === 'ACTIVE' || !p.sdStatus) && (!organizationId || !p.organizationId || p.organizationId === organizationId)
  )
  let priceText = ''
  if (activePrices.length > 0) {
    const minPrice = Math.min(...activePrices.map((p) => p.price))
    const maxPrice = Math.max(...activePrices.map((p) => p.price))
    const range = minPrice === maxPrice ? `¥${minPrice.toFixed(2)}` : `¥${minPrice.toFixed(2)}~${maxPrice.toFixed(2)}`
    priceText = value.unitCode ? `${range}/${value.unitCode}` : range
  }
  const tags = [
    value.medicalTechnology ? '医疗技术' : '',
    value.combinationItem ? '组合项目' : '',
    value.pregnancyAlert ? '孕妇慎用' : '',
  ].filter(Boolean)

  return {
    value: value.id,
    label: value.organizationAdoption?.localName || value.name,
    code: value.organizationAdoption?.localCode || value.code,
    description: [value.sdServiceTypeText, value.serviceSubtype, priceText].filter(Boolean).join(' · '),
    tags: tags.length ? tags : undefined,
    raw: value,
  }
}
