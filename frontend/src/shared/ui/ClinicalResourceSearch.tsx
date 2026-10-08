import { clinicalReferencePrices, clinicalMedicationType, clinicalStockText } from './clinicalResourceFacts'
import { useCallback } from 'react'
import type { DiseaseConcept, ItemGroup, MedicationKnowledge, ServiceCatalogItem } from '../api/masterDataApi'
import type { OrderableMedicationKnowledge } from '../api/encountersApi'
import { errorMessage } from '../api/httpClient'
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
  medication: { placeholder: '检索并选择药品', searchPlaceholder: '输入通用名、编码或别名' },
  service: { placeholder: '检索并选择诊疗项目', searchPlaceholder: '输入项目名称、编码或项目类型' },
  mixed: { placeholder: '搜索药品/项目名称或拼音', searchPlaceholder: '输入通用名、编码或别名' },
}

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0
function searchScope(api: RhnApi, resource: ClinicalResourceType, organizationId?: string, encounterId?: string) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return JSON.stringify([apiScopes.get(api), resource, organizationId, encounterId])
}

function requireClinicalList<T extends ClinicalResource>(source: unknown, nameField: 'name' | 'display'): T[] {
  if (!Array.isArray(source) || source.some(value => !value || typeof value !== 'object'
    || typeof value.id !== 'string' || !value.id.trim() || typeof value.code !== 'string' || !value.code.trim()
    || typeof value[nameField] !== 'string' || !value[nameField].trim())
    || new Set(source.map(value => value.id)).size !== source.length) {
    throw new Error('返回目录数据不完整或包含重复记录')
  }
  return source as T[]
}

async function searchClinicalList<T extends ClinicalResource>(label: string, query: string,
  load: (query: string) => Promise<T[]>, matches?: (item: T, query: string) => boolean, nameField: 'name' | 'display' = 'name'): Promise<T[]> {
  try {
    const values = requireClinicalList<T>(await load(query), nameField)
    if (values.length || !matches || !/^[a-zA-Z0-9\s.]+$/.test(query)) return values
    // Supplement a successful empty query with a fresh, same-context pinyin search.
    // A failed request must propagate; it must never unlock a broader or cached search.
    return requireClinicalList<T>(await load(''), nameField).filter(value => matches(value, query))
  } catch (error) { throw new Error(`${label}检索失败：${errorMessage(error)}`) }
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

    const medicationSearch = () => searchClinicalList('药品', trimmed,
      value => encounterId ? api.encounters.orderableMedications(encounterId, value)
        : api.masterData.medications(value, '', 'ACTIVE', organizationId), matchMedicationItem)
    if (resource === 'diagnosis') {
      const values = await searchClinicalList('诊断', trimmed, value => api.masterData.diseases(value, '', 'ACTIVE'), undefined, 'display')
      return values.filter(item => !filterResult || filterResult(item as T))
        .map(item => mapResourceOption('diagnosis', item, organizationId) as RemoteSearchOption<T>)
    }
    if (resource === 'medication') {
      const values = await medicationSearch()
      return values.filter(item => !filterResult || filterResult(item as T))
        .map(item => mapResourceOption('medication', item, organizationId) as RemoteSearchOption<T>)
    }
    if (resource === 'service') {
      const values = await searchClinicalList('项目', trimmed, value => api.masterData.services(value, '', 'ACTIVE', organizationId), matchServiceItem)
      return values.filter(item => !filterResult || filterResult(item as T))
        .map(item => mapResourceOption('service', item, organizationId) as RemoteSearchOption<T>)
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

    if (searchMed) tasks.push(searchClinicalList('药品', actualQuery,
      value => encounterId ? api.encounters.orderableMedications(encounterId, value)
        : api.masterData.medications(value, '', 'ACTIVE', organizationId), matchMedicationItem)
      .then(values => values.map(item => mapResourceOption('medication', item, organizationId))))
    if (searchSrv) tasks.push(searchClinicalList('项目', actualQuery,
      value => api.masterData.services(value, '', 'ACTIVE', organizationId), matchServiceItem)
      .then(values => values.map(item => mapResourceOption('service', item, organizationId))))
    if (searchGrp) tasks.push(searchClinicalList('组套', actualQuery,
      value => api.masterData.itemGroups(value, 'ORDER_SET', 'ACTIVE'), matchItemGroupItem)
      .then(values => values.map(mapItemGroupOption)))

    const settled = await Promise.all(tasks)
    const combined = settled.flat()
    if (new Set(combined.map(item => item.value)).size !== combined.length) throw new Error('混合检索返回了重复资源标识，请重新检索')

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
    key={searchScope(api, resource, organizationId, encounterId)}
    popoverMinWidth={props.popoverMinWidth ?? (resource === 'medication' || resource === 'mixed' ? 680 : 560)}
    openOnFocus={props.openOnFocus ?? true}
    {...props}
    cacheResults={false}
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
    const typeLabel = clinicalMedicationType(value)
    const clinicalTags = [
      typeLabel,
      [value.essentialDrug, value.prescriptionDrug, value.skinTestRequired, value.antimicrobial, value.chronicDiseaseDrug]
        .some(flag => typeof flag !== 'boolean') ? '临床属性待确认' : '',
      value.essentialDrug === true ? '基药' : '',
      value.prescriptionDrug === true ? '处方药' : (value.products?.some((p) => p.otc === true) ? 'OTC' : ''),
      value.skinTestRequired === true ? '需皮试' : '',
      value.antimicrobial === true ? (value.sdAntimicrobialLevelText || '抗菌药') : '',
      value.chronicDiseaseDrug === true ? '慢病药' : '',
      value.products?.some((p) => p.centralPurchase === true) ? '集采' : '',
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

    const priceText = clinicalReferencePrices(value.products, organizationId)

    // 3. 包装规格
    const packageSpecs = Array.from(new Set(
      (value.products ?? []).flatMap((p) =>
        (p.packages ?? []).map((pkg) => pkg.packageSpec || (typeof pkg.quantityFactor === 'number' && Number.isFinite(pkg.quantityFactor) && pkg.quantityFactor > 0 && pkg.unitName && p.unitCode ? `${pkg.quantityFactor}${p.unitCode}/${pkg.unitName}` : ''))
      ).filter(Boolean)
    ))
    const packageSpecText = packageSpecs.join(' / ')

    const stockText = clinicalStockText(value)

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
  const priceText = clinicalReferencePrices([value], organizationId)
  const typeTag = value.sdServiceTypeText || (
    value.sdServiceType === 'LABORATORY' ? '检验'
    : value.sdServiceType === 'EXAMINATION' ? '检查'
    : value.sdServiceType === 'TREATMENT' ? '治疗' : value.sdServiceType ? `项目类型：${value.sdServiceType}` : '项目类型待确认'
  )
  const tags = [
    typeTag,
    value.medicalTechnology === true ? '医疗技术' : '',
    value.combinationItem === true ? '组合项目' : '',
    value.pregnancyAlert === true ? '孕妇慎用' : '',
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
  const membersKnown = Array.isArray(item.members)
  const memberCount = membersKnown ? item.members.length : undefined
  const preview = (membersKnown ? item.members : []).map((m) => m.itemName).filter(Boolean).slice(0, 4).join('、')
  const description = memberCount !== undefined && memberCount > 0
    ? `包含 ${memberCount} 项明细: ${preview}${memberCount > 4 ? ' 等' : ''}`
    : membersKnown ? '医嘱组套（无明细）' : '组套明细待确认'

  return {
    value: item.id,
    label: item.name,
    code: item.code,
    description,
    tags: ['组套', membersKnown ? `${memberCount}项` : '明细待确认'],
    disabled: !membersKnown,
    raw: item,
  }
}
