import { Button } from '../../../shared/ui'
import { useState } from "react";
import type { Organization } from "../../../shared/model";
import { type Manufacturer, type MedicationKnowledge, type MedicationProduct, type PackageInput, type ItemPackage, type MedicationProductSetupInput, type ProductInput } from "../../../shared/rhnApi";
import { FormField, Select } from "../../../shared/ui";
import { type DictionaryMap, today, checked, text, optionalText, optionalNumber, DataFormDialog, FormSection, FormGrid, StaticSelectField, Checkboxes, Checkbox, SelectField, DateRangeFields } from './masterDataShared'

export function medicationPackageSpec(preparationSpec: string | undefined, factor: string,
  itemUnit: string | undefined, packageUnit: string) {
  if (!factor || !packageUnit) return ''
  if (Number(factor) === 1 && itemUnit?.trim() === packageUnit.trim()) {
    return preparationSpec?.trim() ? `${preparationSpec.trim()}/${packageUnit}` : packageUnit
  }
  const quantitySpec = `${factor}${itemUnit || '最小单位'}/${packageUnit}`
  return preparationSpec?.trim() ? `${preparationSpec.trim()}*${quantitySpec}` : quantitySpec
}

export function ProductDialog({ medication, manufacturers, organization, dictionaries, onClose, onSave }: {
  medication: MedicationKnowledge; manufacturers: Manufacturer[]; organization: Organization;
  dictionaries: DictionaryMap; onClose: () => void; onSave: (input: MedicationProductSetupInput) => void | Promise<unknown>
}) {
  const [markupMode, setMarkupMode] = useState<'NONE' | 'RATE'>('NONE')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [markupRate, setMarkupRate] = useState('')
  const [packageUnitName, setPackageUnitName] = useState('盒')
  const [quantityFactor, setQuantityFactor] = useState('')
  const [packageSpec, setPackageSpec] = useState('')
  const generatedPackageSpec = (factor: string, packageUnit: string) => medicationPackageSpec(
    medication.preparationSpec, factor, medication.preparationUnit, packageUnit)
  const calculateSalePrice = (purchase: string, rate: string) => {
    const cost = Number(purchase); const percent = Number(rate)
    if (purchase && rate && Number.isFinite(cost) && Number.isFinite(percent)) {
      setSalePrice((cost * (1 + percent / 100)).toFixed(2))
    }
  }
  const submit = (form: FormData) => {
    const activeFrom = today()
    const productOrderable = checked(form, 'orderable')
    const productChargeable = checked(form, 'chargeable')
    const productStocked = checked(form, 'stocked')
    return onSave({
      product: { medicationId: medication.id, manufacturerId: text(form, 'manufacturerId'),
        code: text(form, 'code'), tradeName: optionalText(form, 'tradeName'),
        approvalCode: optionalText(form, 'approvalCode'), traceCode: optionalText(form, 'traceCode'),
        registrationCode: optionalText(form, 'registrationCode'), purchaseCode: undefined,
        sdMarketStatus: optionalText(form, 'sdMarketStatus'), sdProductionPlace: optionalText(form, 'sdProductionPlace'),
        otc: checked(form, 'otc'), centralPurchase: checked(form, 'centralPurchase'),
        importAllowed: checked(form, 'importAllowed'), traceSplitRequired: checked(form, 'traceSplitRequired'),
        orderable: productOrderable, chargeable: productChargeable, stocked: productStocked, sdStatus: 'ACTIVE',
        shelfLifeValue: optionalNumber(form, 'shelfLifeValue'), sdShelfLifeUnit: optionalText(form, 'sdShelfLifeUnit'),
        validFrom: activeFrom },
      packaging: { unitCode: text(form, 'packageUnitName'), unitName: text(form, 'packageUnitName'),
        packageSpec: optionalText(form, 'packageSpec'), quantityFactor: Number(text(form, 'quantityFactor')),
        sdUsageType: 'SALE', barcode: optionalText(form, 'barcode'), defaultPurchase: true,
        defaultSale: true, defaultDispense: checked(form, 'defaultDispense'), sdStatus: 'ACTIVE', validFrom: activeFrom },
      organization: { organizationId: organization.id, localCode: optionalText(form, 'localCode'),
        localName: optionalText(form, 'localName'), orderable: productOrderable, executable: false,
        chargeable: productChargeable, purchasable: checked(form, 'purchasable'), stocked: productStocked,
        dispensable: checked(form, 'dispensable'), returnable: checked(form, 'returnable'),
        sdStatus: 'ACTIVE', validFrom: activeFrom },
      purchasePrice: Number(purchasePrice), salePrice: Number(salePrice),
      priceDocumentCode: optionalText(form, 'priceDocumentCode'),
    })
  }
  return <DataFormDialog title="新增药品产品" eyebrow={`${medication.name} · ${organization.name}`} onClose={onClose}
    size="xwide" description="一次完成厂家产品、首个包装、机构经营编码及初始价格建档。" onSubmit={submit}>
    <FormSection title="常用产品信息" description="优先维护开立、采购、入库和收费都会使用的字段。">
      <FormGrid columns={3}>
        <StaticSelectField name="manufacturerId" label="生产厂家"
          options={manufacturers.map((item) => ({ value: item.id, label: item.name }))}
          defaultValue={manufacturers[0]?.id} />
        <FormField label="产品编码" required><input name="code" placeholder="如 PROD_0001" autoFocus required /></FormField>
        <FormField label="机构货品码"><input name="localCode" placeholder="院内药品编码" /></FormField>
        <FormField label="产品名称" required className="span-2" hint="来自药品通用信息；如需调整，请返回通用信息维护。">
          <input value={medication.name} readOnly aria-readonly="true" />
        </FormField>
        <FormField label="商品名"><input name="tradeName" placeholder="无商品名可留空" /></FormField>
        <FormField label="机构显示名称"><input name="localName" placeholder="默认沿用产品名称" /></FormField>
        <FormField label="批准文号"><input name="approvalCode" placeholder="国药准字或注册证编号" /></FormField>
        <FormField label="追溯码" hint="通常为7位数字，用于标识厂家产品。"><input name="traceCode"
          inputMode="numeric" maxLength={7} pattern="[0-9]{7}" placeholder="如 8690001" /></FormField>
        <FormField label="最小单位" required hint="来自药品通用信息；厂家产品不可单独修改。"><input
          value={medication.preparationUnit || ''} placeholder="请先维护药品通用信息" readOnly aria-readonly="true" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="包装、条码与价格" description="包装规格由制剂规格、包装系数、最小单位和包装单位自动生成，也可以按实际商品规格手动修正。">
      <FormGrid columns={4}>
        <FormField label="包装单位" required><input name="packageUnitName" value={packageUnitName} placeholder="盒、瓶、支" required
          onChange={(event) => { const next = event.target.value; setPackageUnitName(next); setPackageSpec(generatedPackageSpec(quantityFactor, next)) }} /></FormField>
        <FormField label={`包装系数（${medication.preparationUnit || '最小单位'}）`} required>
          <input name="quantityFactor" type="number" min="0.000001" step="any" placeholder="如 24" value={quantityFactor} required
            onChange={(event) => { const next = event.target.value; setQuantityFactor(next); setPackageSpec(generatedPackageSpec(next, packageUnitName)) }} />
        </FormField>
        <FormField label="包装规格" required className="span-2" hint="系统自动组合制剂规格与包装数量，允许按厂家包装文字手动修改。"><input
          name="packageSpec" value={packageSpec} placeholder="如 5mg*24片/盒" required onChange={(event) => setPackageSpec(event.target.value)} /></FormField>
        <FormField label="条形码"><input name="barcode" placeholder="扫描或录入商品条码" /></FormField>
        <FormField label="进货价格" required><input name="purchasePrice" type="number" min="0" step="0.000001" value={purchasePrice} required
          onChange={(event) => { setPurchasePrice(event.target.value); if (markupMode === 'RATE') calculateSalePrice(event.target.value, markupRate) }} /></FormField>
        <FormField label="零售价格" required><input name="salePrice" type="number" min="0" step="0.000001" value={salePrice} required
          onChange={(event) => setSalePrice(event.target.value)} /></FormField>
        <FormField label="价格文件号"><input name="priceDocumentCode" placeholder="调价或采购依据编号" /></FormField>
        <FormField label="加成方式"><Select value={markupMode} onChange={(value) => {
          const next = value as 'NONE' | 'RATE'; setMarkupMode(next); if (next === 'RATE') calculateSalePrice(purchasePrice, markupRate)
        }} options={[{ value: 'NONE', label: '不自动计算' }, { value: 'RATE', label: '按加成率计算' }]} /></FormField>
        <FormField label="加成率（%）"><input name="markupRate" type="number" min="0" step="0.01" disabled={markupMode === 'NONE'}
          value={markupRate} onChange={(event) => { setMarkupRate(event.target.value); calculateSalePrice(purchasePrice, event.target.value) }} /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="机构业务能力" description="控制该产品是否可以进入医生开立、采购库存、药房发药和收费流程。">
      <FormGrid>
        <Checkboxes title="当前机构启用能力">
          <Checkbox name="orderable" label="允许开立" defaultChecked />
          <Checkbox name="purchasable" label="允许采购" defaultChecked />
          <Checkbox name="stocked" label="库存商品" defaultChecked />
          <Checkbox name="dispensable" label="允许发药" defaultChecked />
          <Checkbox name="chargeable" label="允许收费" defaultChecked />
          <Checkbox name="returnable" label="允许退药" defaultChecked />
          <Checkbox name="defaultDispense" label="默认发药包装" />
          <Checkbox name="traceSplitRequired" label="拆零需处理追溯码" defaultChecked />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    <details className="master-data-advanced-fields">
      <summary>监管与产品补充信息（非日常必填）</summary>
      <FormGrid columns={3}>
        <FormField label="注册证号"><input name="registrationCode" placeholder="进口药品或器械适用" /></FormField>
        <SelectField name="sdMarketStatus" label="上市状态" values={dictionaries.BD_PRODUCT_MARKET_STATUS}
          defaultValue="MARKETED" />
        <SelectField name="sdProductionPlace" label="产品生产地" values={dictionaries.BD_PRODUCTION_PLACE} required={false} />
        <FormField label="产品有效期数值"><input name="shelfLifeValue" type="number" min="0" step="any" placeholder="如 24" /></FormField>
        <SelectField name="sdShelfLifeUnit" label="产品有效期单位" values={dictionaries.BD_SHELF_LIFE_UNIT} required={false} />
        <Checkboxes title="监管标识">
          <Checkbox name="otc" label="OTC" />
          <Checkbox name="centralPurchase" label="国家/省级集采" />
          <Checkbox name="importAllowed" label="允许进口" />
        </Checkboxes>
      </FormGrid>
    </details>
  </DataFormDialog>
}

export function ProductEditDialog({ product, medication, manufacturers, dictionaries, onClose, onSave, onEditPackage }: {
  product: MedicationProduct; medication: MedicationKnowledge; manufacturers: Manufacturer[];
  dictionaries: DictionaryMap; onClose: () => void; onSave: (input: ProductInput) => void;
  onEditPackage: (value: ItemPackage) => void
}) {
  return <DataFormDialog title="编辑药品产品" eyebrow={`${medication.name} · ${product.code}`} onClose={onClose}
    size="xwide" description="维护厂家、批准文号、监管标识与中心层业务能力；当前包装如下，点击可直接维护包装规格，机构目录与价格在各自入口维护。"
    onSubmit={(form) => onSave({
      medicationId: product.medicationId, manufacturerId: text(form, 'manufacturerId'), code: product.code,
      tradeName: optionalText(form, 'tradeName'), approvalCode: optionalText(form, 'approvalCode'),
      traceCode: optionalText(form, 'traceCode'),
      approvalFrom: optionalText(form, 'approvalFrom'), approvalTo: optionalText(form, 'approvalTo'),
      registrationCode: optionalText(form, 'registrationCode'),
      registrationFrom: optionalText(form, 'registrationFrom'), registrationTo: optionalText(form, 'registrationTo'),
      purchaseCode: optionalText(form, 'purchaseCode'),
      sdMarketStatus: optionalText(form, 'sdMarketStatus'), sdProductionPlace: optionalText(form, 'sdProductionPlace'),
      otc: checked(form, 'otc'), centralPurchase: checked(form, 'centralPurchase'),
      importAllowed: checked(form, 'importAllowed'), traceSplitRequired: checked(form, 'traceSplitRequired'),
      orderable: checked(form, 'orderable'), chargeable: checked(form, 'chargeable'), stocked: checked(form, 'stocked'),
      shelfLifeValue: optionalNumber(form, 'shelfLifeValue'), sdShelfLifeUnit: optionalText(form, 'sdShelfLifeUnit'),
      sdStatus: product.sdStatus, validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'),
      indication: optionalText(form, 'indication'), instruction: optionalText(form, 'instruction'),
    })}>
    <FormSection title="产品身份" description="产品编码、名称与最小单位来自通用药品知识，创建后不可在产品层修改。">
      <FormGrid columns={3}>
        <StaticSelectField name="manufacturerId" label="生产厂家"
          options={manufacturers.map((item) => ({ value: item.id, label: item.name }))}
          defaultValue={product.manufacturerId} />
        <FormField label="产品编码" hint="创建后不可修改。"><input value={product.code} readOnly aria-readonly="true" /></FormField>
        <FormField label="商品名"><input name="tradeName" defaultValue={product.tradeName} placeholder="无商品名可留空" autoFocus /></FormField>
        <FormField label="产品名称" className="span-2" hint="来自药品通用信息；如需调整，请返回通用信息维护。">
          <input value={product.name} readOnly aria-readonly="true" /></FormField>
        <FormField label="最小单位" hint="来自药品通用信息；厂家产品不可单独修改。"><input
          value={medication.preparationUnit || product.unitCode || ''} placeholder="请先维护药品通用信息" readOnly aria-readonly="true" /></FormField>
        <FormField label="批准文号"><input name="approvalCode" defaultValue={product.approvalCode} placeholder="国药准字或注册证编号" /></FormField>
        <FormField label="追溯码" hint="通常为7位数字，用于标识厂家产品。"><input name="traceCode" defaultValue={product.traceCode}
          inputMode="numeric" maxLength={7} pattern="[0-9]{7}" placeholder="如 8690001" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="包装与规格" description="产品当前已建档的包装，在此查看；点击任意包装可打开包装维护。">
      <div className="master-data-package-list">
        {product.packages.length ? product.packages.map((item) => {
          const marks = [item.defaultPurchase && '默认采购', item.defaultSale && '默认销售',
            item.defaultDispense && '默认发药'].filter(Boolean).join(' · ')
          return <Button type="button" key={item.id} title="点击编辑此包装" onClick={() => onEditPackage(item)} variant="text" size="sm">
            <strong>{item.packageSpec || `${item.unitName} = ${item.quantityFactor}${product.unitCode || '最小单位'}`}</strong>
            <span>{[item.sdUsageTypeText, item.barcode && `条码 ${item.barcode}`, marks,
              `自 ${item.validFrom}${item.validTo ? ` 至 ${item.validTo}` : ''}`].filter(Boolean).join(' · ')}</span>
          </Button>
        }) : <p className="master-data-package-list__empty">暂无包装，请通过列表“加包装”建档。</p>}
      </div>
    </FormSection>
    <FormSection title="中心层业务能力" description="控制产品在中心目录的可开立、可收费与库存属性；机构级开关请在“机构目录与价格”维护。">
      <FormGrid>
        <Checkboxes title="中心层能力">
          <Checkbox name="orderable" label="允许开立" defaultChecked={product.orderable} />
          <Checkbox name="chargeable" label="允许收费" defaultChecked={product.chargeable} />
          <Checkbox name="stocked" label="库存商品" defaultChecked={product.stocked} />
          <Checkbox name="traceSplitRequired" label="拆零需处理追溯码" defaultChecked={product.traceSplitRequired} />
        </Checkboxes>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={product.validFrom} toDefault={product.validTo} />
      </FormGrid>
    </FormSection>
    <FormSection title="监管与产品补充信息" description="上市状态、生产地与有效期等监管字段。">
      <FormGrid columns={3}>
        <SelectField name="sdMarketStatus" label="上市状态" values={dictionaries.BD_PRODUCT_MARKET_STATUS}
          defaultValue={product.sdMarketStatus} required={false} />
        <SelectField name="sdProductionPlace" label="产品生产地" values={dictionaries.BD_PRODUCTION_PLACE}
          defaultValue={product.sdProductionPlace} required={false} />
        <FormField label="产品有效期数值"><input name="shelfLifeValue" type="number" min="0" step="any"
          defaultValue={product.shelfLifeValue} placeholder="如 24" /></FormField>
        <SelectField name="sdShelfLifeUnit" label="产品有效期单位" values={dictionaries.BD_SHELF_LIFE_UNIT}
          defaultValue={product.sdShelfLifeUnit} required={false} />
        <Checkboxes title="监管标识">
          <Checkbox name="otc" label="OTC" defaultChecked={product.otc} />
          <Checkbox name="centralPurchase" label="国家/省级集采" defaultChecked={product.centralPurchase} />
          <Checkbox name="importAllowed" label="允许进口" defaultChecked={product.importAllowed} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    <details className="master-data-advanced-fields">
      <summary>批准 / 注册 / 说明书信息（非日常维护）</summary>
      <FormGrid columns={3}>
        <DateRangeFields fromName="approvalFrom" toName="approvalTo" fromLabel="批准生效日期" toLabel="批准失效日期"
          fromDefault={product.approvalFrom} toDefault={product.approvalTo} required={false} />
        <FormField label="注册证号"><input name="registrationCode" defaultValue={product.registrationCode} placeholder="进口药品或器械适用" /></FormField>
        <DateRangeFields fromName="registrationFrom" toName="registrationTo" fromLabel="注册生效日期" toLabel="注册失效日期"
          fromDefault={product.registrationFrom} toDefault={product.registrationTo} required={false} />
        <FormField label="采购编码"><input name="purchaseCode" defaultValue={product.purchaseCode} placeholder="供应链或集采平台编码" /></FormField>
        <FormField label="适应症" className="span-2"><input name="indication" defaultValue={product.indication} placeholder="批准适应症摘要" /></FormField>
        <FormField label="说明书要点" className="span-2"><input name="instruction" defaultValue={product.instruction} placeholder="用法用量或说明书摘要" /></FormField>
      </FormGrid>
    </details>
  </DataFormDialog>
}

export function PackageDialog({ product, medication, dictionaries, editing, onClose, onSave }: { product: MedicationProduct;
  medication: MedicationKnowledge; editing?: ItemPackage;
  dictionaries: DictionaryMap; onClose: () => void; onSave: (input: PackageInput) => void }) {
  const [unitName, setUnitName] = useState(editing?.unitName ?? '盒')
  const [quantityFactor, setQuantityFactor] = useState(editing ? String(Number(editing.quantityFactor)) : '')
  const [packageSpec, setPackageSpec] = useState(editing?.packageSpec ?? '')
  const generatedPackageSpec = (factor: string, packageUnit: string) => medicationPackageSpec(
    medication.preparationSpec, factor, product.unitCode, packageUnit)
  return <DataFormDialog title={editing ? '编辑产品包装' : '新增产品包装'} eyebrow={product.name} onClose={onClose}
    size="xwide" description={editing ? '修正包装系数、包装规格与业务用途；已有库存批次不受影响。'
      : `根据包装系数维护包装规格，并声明采购、销售和发放用途。`}
    onSubmit={(form) => onSave({ unitCode: text(form, 'unitName'), unitName: text(form, 'unitName'),
      packageSpec: optionalText(form, 'packageSpec'), quantityFactor: Number(text(form, 'quantityFactor')),
      sdUsageType: text(form, 'sdUsageType'), barcode: optionalText(form, 'barcode'),
      defaultPurchase: checked(form, 'defaultPurchase'), defaultSale: checked(form, 'defaultSale'),
      defaultDispense: checked(form, 'defaultDispense'), sdStatus: editing?.sdStatus ?? 'ACTIVE', validFrom: text(form, 'validFrom'),
      validTo: optionalText(form, 'validTo') })}>
    <FormSection title="包装与规格" description={`最小单位为${product.unitCode || '未维护'}，包装规格可在自动生成后手动修正。`}>
      <FormGrid columns={3}>
        <FormField label="包装单位" required><input name="unitName" placeholder="盒" autoFocus required value={unitName}
          onChange={(event) => { const next = event.target.value; setUnitName(next); setPackageSpec(generatedPackageSpec(quantityFactor, next)) }} /></FormField>
        <SelectField name="sdUsageType" label="包装用途" values={dictionaries.BD_PACKAGE_USE} defaultValue={editing?.sdUsageType ?? 'SALE'} />
        <FormField label={`包装系数（${product.unitCode || '最小单位'}）`} required><input name="quantityFactor"
          type="number" min="0.000001" step="any" placeholder="如 24" required value={quantityFactor}
          onChange={(event) => { const next = event.target.value; setQuantityFactor(next); setPackageSpec(generatedPackageSpec(next, unitName)) }} /></FormField>
        <FormField label="包装规格" className="span-2" hint="系统自动组合制剂规格与包装数量，允许按厂家包装文字手动修改。"><input
          name="packageSpec" placeholder="如 5mg*24片/盒" value={packageSpec} onChange={(event) => setPackageSpec(event.target.value)} /></FormField>
        <FormField label="条码"><input name="barcode" defaultValue={editing?.barcode} placeholder="扫描或录入商品条码" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="业务用途与生命周期" description="有效期结束后不再用于新的采购、销售或发放。">
      <FormGrid>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={editing?.validFrom} toDefault={editing?.validTo} />
        <Checkboxes title="默认业务包装">
          <Checkbox name="defaultPurchase" label="默认采购包装" defaultChecked={editing?.defaultPurchase ?? true} />
          <Checkbox name="defaultSale" label="默认销售包装" defaultChecked={editing?.defaultSale ?? true} />
          <Checkbox name="defaultDispense" label="默认发药包装" defaultChecked={editing?.defaultDispense ?? false} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}
