import type { MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { ClinicalResourceSearch, Select, type ClinicalResource, type ClinicalResourceOption, type OrderSearchMode } from '../../../shared/ui'
import type { DispensableProductOption } from './dispensableOptions'
import type { OrderEntryType } from './orderDraftTypes'
import { AdministrationGroupBracket } from './OrderRowDecorations'
import { orderTypeLabel } from './orderPresentation'
import { focusResource } from './orderEditorControls'

export function OrderComposerResource({
  entryType, changeType, hasEnteredOrder, isMedication, selectedProduct, grouping, api, encounter,
  searchMode, changeSearchMode, medicationOption, service, handleOrderResourceSelect
}: {
  entryType: OrderEntryType
  changeType: (type: OrderEntryType) => void
  hasEnteredOrder: boolean
  isMedication: boolean
  selectedProduct?: DispensableProductOption
  grouping: boolean
  api: RhnApi
  encounter: Pick<Encounter, 'id' | 'organizationId'>
  searchMode: OrderSearchMode
  changeSearchMode: (mode: OrderSearchMode) => void
  medicationOption?: ClinicalResourceOption<MedicationKnowledge>
  service?: ClinicalResourceOption<ServiceCatalogItem>
  handleOrderResourceSelect: (option?: ClinicalResourceOption<ClinicalResource>) => void
}) {
  return <>
    <div className="doctor-inline-order-field doctor-inline-order-type">
      <div className="doctor-composer-type-wrap">
        <Select id="doctor-unified-entry-type" aria-label="医嘱类型" value={entryType} clearable={false} searchable={false}
          options={[
            { value: 'ALL', label: '全部' },
            { value: 'WESTERN', label: '西药' },
            { value: 'CHINESE_PATENT', label: '中成药' },
            { value: 'HERBAL', label: '草药' },
            { value: 'LABORATORY', label: '检验' },
            { value: 'EXAMINATION', label: '检查' },
            { value: 'TREATMENT', label: '治疗' },
          ]}
          onChange={(value) => {
            const nextType = value as OrderEntryType
            changeType(nextType)
            globalThis.setTimeout(() => focusResource(nextType), 0)
          }} />
      </div>
    </div>

    <div className={`doctor-inline-order-field doctor-inline-order-resource${hasEnteredOrder ? ' has-selected' : ''}`}
      title={isMedication && selectedProduct ? `${selectedProduct.label}${selectedProduct.itemPackage?.packageSpec ? ` (${selectedProduct.itemPackage.packageSpec})` : ''}${selectedProduct.product.manufacturerName ? ` · ${selectedProduct.product.manufacturerName}` : ''}` : undefined}>
      <div className="doctor-inline-resource-input-wrap">
        {grouping && (
          <AdministrationGroupBracket isTail />
        )}
        <ClinicalResourceSearch
          id={`doctor-unified-${entryType}-resource`}
          api={api}
          resource={entryType === 'ALL' ? 'mixed' : (isMedication ? 'medication' : 'service')}
          searchMode={searchMode}
          onSearchModeChange={changeSearchMode}
          organizationId={encounter.organizationId}
          encounterId={encounter.id}
          value={isMedication ? (medicationOption as any) : (service as any)}
          aria-label={
            entryType === 'HERBAL' ? '搜索中草药名称/拼音'
            : entryType === 'WESTERN' ? '搜索西药名称/拼音'
            : entryType === 'CHINESE_PATENT' ? '搜索中成药名称/拼音'
            : entryType === 'ALL' ? '搜索药品/项目名称或拼音'
            : isMedication ? '搜索药品名称/拼音'
            : `搜索${orderTypeLabel(entryType)}项目名称/拼音`
          }
          filterResult={
            entryType === 'ALL' ? undefined
            : entryType === 'WESTERN' ? (item) => !('sdMedicationType' in (item as any)) || (item as any)?.sdMedicationType === 'WESTERN'
            : entryType === 'CHINESE_PATENT' ? (item) => (item as any)?.sdMedicationType === 'CHINESE_PATENT'
            : entryType === 'HERBAL' ? (item) => (item as any)?.sdMedicationType === 'HERBAL'
            : entryType === 'MEDICATION' ? (item) => !('sdMedicationType' in (item as any)) || (item as any)?.sdMedicationType !== 'HERBAL'
            : (item) => (item as any)?.sdServiceType === entryType
          }
          placeholder={
            entryType === 'HERBAL' ? '搜索中草药名称/拼音'
            : entryType === 'WESTERN' ? '搜索西药名称/拼音'
            : entryType === 'CHINESE_PATENT' ? '搜索中成药名称/拼音'
            : entryType === 'ALL' ? '搜索药品/项目名称或拼音'
            : isMedication ? '搜索药品名称/拼音'
            : `搜索${orderTypeLabel(entryType)}项目名称/拼音`
          }
          onChange={handleOrderResourceSelect} />
      </div>
      {isMedication && selectedProduct && (
        <div className="doctor-inline-spec-hint"
          title={`${selectedProduct.itemPackage?.packageSpec || selectedProduct.label}${selectedProduct.product.manufacturerName ? ` / ${selectedProduct.product.manufacturerName}` : ''}`}>
          <span>{selectedProduct.itemPackage?.packageSpec || selectedProduct.label}</span>
          {selectedProduct.product.manufacturerName && (
            <>
              <span className="doctor-subtext-divider">/</span>
              <span>{selectedProduct.product.manufacturerName}</span>
            </>
          )}
        </div>
      )}
    </div>
  </>
}
