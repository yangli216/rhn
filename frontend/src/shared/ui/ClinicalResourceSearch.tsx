import { useCallback } from 'react'
import type { DiseaseConcept, ItemGroup, MedicationKnowledge, ServiceCatalogItem } from '../api/masterDataApi'
import type { OrderableMedicationKnowledge } from '../api/encountersApi'
import type { RhnApi } from '../rhnApi'
import { RemoteSearchSelect, type RemoteSearchOption, type RemoteSearchSelectProps } from './RemoteSearchSelect'
import { matchesPinyinOrText } from './pinyinInitials'

export type ClinicalResourceType = 'diagnosis' | 'medication' | 'service' | 'mixed'
export type ClinicalResource = DiseaseConcept | MedicationKnowledge | ServiceCatalogItem | OrderableMedicationKnowledge | ItemGroup
export type ClinicalResourceOption<T extends ClinicalResource = ClinicalResource> = RemoteSearchOption<T>
export type OrderSearchMode = 'smart' | 'prefix'

export interface ClinicalResourceSearchProps<T extends ClinicalResource = ClinicalResource>
  extends Omit<RemoteSearchSelectProps<T>, 'loadOptions'> {
  api: RhnApi
  resource: ClinicalResourceType
  organizationId?: string
  encounterId?: string
  searchMode?: OrderSearchMode
  onSearchModeChange?: (mode: OrderSearchMode) => void
  filterResult?: (item: T) => boolean
}

const resourceCopy: Record<ClinicalResourceType, { placeholder: string; searchPlaceholder: string }> = {
  diagnosis: { placeholder: '检索并选择诊断', searchPlaceholder: '输入诊断名称、编码或拼音码' },
  medication: { placeholder: '检索并选择在库药品', searchPlaceholder: '输入通用名、编码或别名' },
  service: { placeholder: '检索并选择诊疗项目', searchPlaceholder: '输入项目名称、编码或项目类型' },
  mixed: { placeholder: '搜索药品/项目名称或拼音', searchPlaceholder: '输入通用名、编码或别名' },
}

interface CacheItem<T> {
  data: T[]
  time: number
}

const CACHE_TTL_MS = 30_000

const poolOrderableMeds = new Map<string, CacheItem<OrderableMedicationKnowledge>>()
const poolMasterMeds = new Map<string, CacheItem<MedicationKnowledge>>()
const poolServices = new Map<string, CacheItem<ServiceCatalogItem>>()
const poolItemGroups = new Map<string, CacheItem<ItemGroup>>()

async function getOrderableMedsPool(api: RhnApi, encounterId: string): Promise<OrderableMedicationKnowledge[]> {
  const cached = poolOrderableMeds.get(encounterId)
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data
  try {
    const list = (await api.encounters.orderableMedications(encounterId)) || []
    poolOrderableMeds.set(encounterId, { data: list, time: Date.now() })
    return list
  } catch {
    return cached?.data || []
  }
}

async function getMasterMedsPool(api: RhnApi, organizationId = ''): Promise<MedicationKnowledge[]> {
  const cached = poolMasterMeds.get(organizationId)
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data
  try {
    const list = (await api.masterData.medications('', '', 'ACTIVE', organizationId)) || []
    poolMasterMeds.set(organizationId, { data: list, time: Date.now() })
    return list
  } catch {
    return cached?.data || []
  }
}

async function getServicesPool(api: RhnApi, organizationId = ''): Promise<ServiceCatalogItem[]> {
  const cached = poolServices.get(organizationId)
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data
  try {
    const list = (await api.masterData.services('', '', 'ACTIVE', organizationId)) || []
    poolServices.set(organizationId, { data: list, time: Date.now() })
    return list
  } catch {
    return cached?.data || []
  }
}

async function getItemGroupsPool(api: RhnApi): Promise<ItemGroup[]> {
  const cached = poolItemGroups.get('default')
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.data
  try {
    const list = (await api.masterData.itemGroups('', 'ORDER_SET', 'ACTIVE')) || []
    poolItemGroups.set('default', { data: list, time: Date.now() })
    return list
  } catch {
    return cached?.data || []
  }
}

function matchMedicationItem(item: MedicationKnowledge & Partial<OrderableMedicationKnowledge>, query: string): boolean {
  if (
    matchesPinyinOrText(item.name, query) ||
    matchesPinyinOrText(item.aliasName, query) ||
    matchesPinyinOrText(item.code, query) ||
    matchesPinyinOrText(item.preparationSpec, query)
  ) {
    return true
  }
  return (item.products ?? []).some((p) =>
    matchesPinyinOrText(p.name, query) ||
    matchesPinyinOrText(p.tradeName, query) ||
    matchesPinyinOrText(p.manufacturerName, query) ||
    matchesPinyinOrText(p.code, query)
  )
}

function matchServiceItem(item: ServiceCatalogItem, query: string): boolean {
  return (
    matchesPinyinOrText(item.name, query) ||
    matchesPinyinOrText(item.code, query) ||
    matchesPinyinOrText(item.organizationAdoption?.localName, query) ||
    matchesPinyinOrText(item.organizationAdoption?.localCode, query) ||
    matchesPinyinOrText(item.sdServiceTypeText, query) ||
    matchesPinyinOrText(item.serviceSubtype, query)
  )
}

function matchItemGroupItem(item: ItemGroup, query: string): boolean {
  return matchesPinyinOrText(item.name, query) || matchesPinyinOrText(item.code, query)
}

export function ClinicalResourceSearch<T extends ClinicalResource = ClinicalResource>({
  api,
  resource,
  organizationId,
  encounterId,
  searchMode = 'smart',
  onSearchModeChange,
  filterResult,
  placeholder,
  searchPlaceholder,
  ...props
}: ClinicalResourceSearchProps<T>) {
  const loadOptions = useCallback(async (query: string): Promise<RemoteSearchOption<T>[]> => {
    const trimmed = query.trim()
    if (!trimmed) return []

    if (resource === 'diagnosis') {
      const values = await api.masterData.diseases(trimmed, '', 'ACTIVE')
      return values
        .filter((item) => !filterResult || filterResult(item as T))
        .map((item) => mapResourceOption('diagnosis', item, organizationId) as RemoteSearchOption<T>)
    }

    if (resource === 'medication') {
      let values = await (encounterId
        ? api.encounters.orderableMedications(encounterId, trimmed)
        : api.masterData.medications(trimmed, '', 'ACTIVE', organizationId)
      ).catch(() => [])

      if ((!values || values.length === 0) && /^[a-zA-Z0-9\s.]+$/.test(trimmed)) {
        const pool = encounterId
          ? await getOrderableMedsPool(api, encounterId)
          : await getMasterMedsPool(api, organizationId)
        values = pool.filter((item) => matchMedicationItem(item, trimmed))
      }

      return (values || [])
        .filter((item) => !filterResult || filterResult(item as T))
        .map((item) => mapResourceOption('medication', item, organizationId) as RemoteSearchOption<T>)
    }

    if (resource === 'service') {
      let values = await api.masterData.services(trimmed, '', 'ACTIVE', organizationId).catch(() => [])

      if ((!values || values.length === 0) && /^[a-zA-Z0-9\s.]+$/.test(trimmed)) {
        const pool = await getServicesPool(api, organizationId)
        values = pool.filter((item) => matchServiceItem(item, trimmed))
      }

      return (values || [])
        .filter((item) => !filterResult || filterResult(item as T))
        .map((item) => mapResourceOption('service', item, organizationId) as RemoteSearchOption<T>)
    }

    // --- resource === 'mixed' 混合检索 ---
    const isPrefixMode = searchMode === 'prefix'
    const isDot = trimmed.startsWith('.')
    const isSlash = trimmed.startsWith('/')

    let searchMed = false
    let searchSrv = false
    let searchGrp = false
    let actualQuery = trimmed

    if (isPrefixMode) {
      if (isDot) {
        searchSrv = true
        actualQuery = trimmed.slice(1).trim()
      } else if (isSlash) {
        searchGrp = true
        actualQuery = trimmed.slice(1).trim()
      } else {
        searchMed = true
      }
    } else {
      // smart mode (智能模式)
      if (isDot) {
        searchSrv = true
        actualQuery = trimmed.slice(1).trim()
      } else if (isSlash) {
        searchGrp = true
        actualQuery = trimmed.slice(1).trim()
      } else {
        // 全库混搜：并发请求药品、诊疗项目和组套
        searchMed = true
        searchSrv = true
        searchGrp = true
      }
    }

    if (!actualQuery && !isSlash) return []

    const tasks: Promise<RemoteSearchOption<ClinicalResource>[]>[] = []

    if (searchMed) {
      tasks.push(
        (async () => {
          const remoteItems = await (encounterId
            ? api.encounters.orderableMedications(encounterId, actualQuery)
            : api.masterData.medications(actualQuery, '', 'ACTIVE', organizationId)
          ).catch(() => [])

          if (remoteItems && remoteItems.length > 0) {
            return remoteItems.map((item) => mapResourceOption('medication', item, organizationId))
          }

          if (/^[a-zA-Z0-9\s.]+$/.test(actualQuery)) {
            const pool = encounterId
              ? await getOrderableMedsPool(api, encounterId)
              : await getMasterMedsPool(api, organizationId)
            const matched = pool.filter((item) => matchMedicationItem(item, actualQuery))
            if (matched.length > 0) {
              return matched.map((item) => mapResourceOption('medication', item, organizationId))
            }
          }
          return []
        })()
      )
    }

    if (searchSrv && api.masterData?.services) {
      tasks.push(
        (async () => {
          const remoteItems = await api.masterData.services(actualQuery, '', 'ACTIVE', organizationId).catch(() => [])
          if (remoteItems && remoteItems.length > 0) {
            return remoteItems.map((item) => mapResourceOption('service', item, organizationId))
          }

          if (/^[a-zA-Z0-9\s.]+$/.test(actualQuery)) {
            const pool = await getServicesPool(api, organizationId)
            const matched = pool.filter((item) => matchServiceItem(item, actualQuery))
            if (matched.length > 0) {
              return matched.map((item) => mapResourceOption('service', item, organizationId))
            }
          }
          return []
        })()
      )
    }

    if (searchGrp && api.masterData?.itemGroups) {
      tasks.push(
        (async () => {
          const remoteItems = await api.masterData.itemGroups(actualQuery, 'ORDER_SET', 'ACTIVE').catch(() => [])
          if (remoteItems && remoteItems.length > 0) {
            return remoteItems.map((item) => mapItemGroupOption(item))
          }

          if (/^[a-zA-Z0-9\s.]+$/.test(actualQuery)) {
            const pool = await getItemGroupsPool(api)
            const matched = pool.filter((item) => matchItemGroupItem(item, actualQuery))
            if (matched.length > 0) {
              return matched.map((item) => mapItemGroupOption(item))
            }
          }
          return []
        })()
      )
    }

    const settled = await Promise.all(tasks)
    const combined = settled.flat()

    return combined
      .filter((item) => !filterResult || filterResult(item.raw as T)) as RemoteSearchOption<T>[]
  }, [api, encounterId, filterResult, organizationId, resource, searchMode])

  const copy = resourceCopy[resource]
  const defaultSearchPlaceholder = copy.searchPlaceholder

  const popoverHeader = (resource === 'mixed' && onSearchModeChange) ? (
    <div className="doctor-order-search-mode-bar is-popover-mode-bar">
      <div className="doctor-order-mode-tabs" role="tablist" aria-label="医嘱录入模式">
        <button
          type="button"
          role="tab"
          aria-selected={searchMode === 'smart'}
          className={`doctor-order-mode-btn ${searchMode === 'smart' ? 'is-active' : ''}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSearchModeChange('smart')
          }}
        >
          <span className="doctor-order-mode-icon">✨</span>
          <span>智能模式</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={searchMode === 'prefix'}
          className={`doctor-order-mode-btn ${searchMode === 'prefix' ? 'is-active' : ''}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSearchModeChange('prefix')
          }}
        >
          <span className="doctor-order-mode-icon">⚡</span>
          <span>前缀模式</span>
        </button>
      </div>
      <div className="doctor-order-mode-hint">
        {searchMode === 'prefix' ? (
          <>
            <span className="doctor-order-hint-item">
              <span className="doctor-order-hint-tag">默认</span>
              <span className="doctor-order-hint-text">药品</span>
            </span>
            <span className="doctor-order-hint-item">
              <kbd className="doctor-order-hint-kbd">.</kbd>
              <span className="doctor-order-hint-text">项目</span>
            </span>
            <span className="doctor-order-hint-item">
              <kbd className="doctor-order-hint-kbd">/</kbd>
              <span className="doctor-order-hint-text">组套</span>
            </span>
          </>
        ) : (
          <span className="doctor-order-hint-item">
            <span className="doctor-order-hint-tag">全库混搜</span>
            <span className="doctor-order-hint-text">药品 / 项目 / 组套自适应识别</span>
          </span>
        )}
      </div>
    </div>
  ) : props.popoverHeader

  return <RemoteSearchSelect<T>
    popoverMinWidth={props.popoverMinWidth ?? (resource === 'medication' || resource === 'mixed' ? 680 : 560)}
    openOnFocus={props.openOnFocus ?? true}
    {...props}
    popoverHeader={popoverHeader}
    showCode={props.showCode ?? (resource !== 'medication' && resource !== 'mixed')}
    placeholder={placeholder ?? copy.placeholder}
    searchPlaceholder={searchPlaceholder ?? defaultSearchPlaceholder}
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

    // --- 第二行：产品相关信息（厂家、单价、包装规格、药房与库存）---
    // 1. 生产厂家（移除境内生产等前缀，直接显示纯厂家名称）
    const manufacturers = Array.from(new Set(
      (value.products ?? []).map((p) => (p.manufacturerName || '').trim()).filter(Boolean)
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
  const typeTag = value.sdServiceTypeText || (
    value.sdServiceType === 'LABORATORY' ? '检验'
    : value.sdServiceType === 'EXAMINATION' ? '检查'
    : value.sdServiceType === 'TREATMENT' ? '治疗' : '项目'
  )
  const tags = [
    typeTag,
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

function mapItemGroupOption(item: ItemGroup): RemoteSearchOption<ClinicalResource> {
  const memberCount = item.members?.length || 0
  const preview = item.members?.map((m) => m.itemName).filter(Boolean).slice(0, 4).join('、')
  const description = memberCount > 0
    ? `包含 ${memberCount} 项明细: ${preview}${memberCount > 4 ? ' 等' : ''}`
    : '医嘱组套'

  return {
    value: item.id,
    label: item.name,
    code: item.code,
    description,
    tags: ['组套', `${memberCount}项`],
    raw: item,
  }
}
