import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  ClinicalConfiguration, DictionaryValue, ExaminationProfileInput, ExaminationVariantConfiguration, ExaminationVariantInput,
  ExaminationAttachmentConfiguration, ExaminationAttachmentInput,
  ItemGroup, ItemGroupInput, LaboratoryProfile, Manufacturer, RhnApi, ServiceCatalogItem,
  SpecimenConfiguration, SpecimenConfigurationInput, SupplyInput, SupplyItem, UnitConversion,
  UnitConversionInput, UnitDefinition,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { Organization } from '../../shared/model'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge } from '../../shared/ui'

type Area = 'clinical' | 'group' | 'supply' | 'unit'
const today = () => new Date().toISOString().slice(0, 10)
const activeStatus = [{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]
const dimensions = [
  ['COUNT', '计数'], ['MASS', '质量'], ['VOLUME', '体积'], ['TIME', '时间'], ['LENGTH', '长度'],
  ['AREA', '面积'], ['ACTIVITY', '活度'], ['TEMPERATURE', '温度'], ['OTHER', '其它'],
].map(([value, label]) => ({ value, label }))

export function OperationalMasterDataPanel({ api, organization, dictionaries, manufacturers }: {
  api: RhnApi; organization: Organization; dictionaries: Record<string, DictionaryValue[]>; manufacturers: Manufacturer[]
}) {
  const client = useQueryClient()
  const [area, setArea] = useState<Area>('clinical')
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const services = useQuery({ queryKey: ['master-data-services-operational', organization.id],
    queryFn: () => api.masterData.services('', '', '', organization.id) })
  const supplies = useQuery({ queryKey: ['master-data-operational-supplies'], queryFn: () => api.masterData.supplies(), enabled: area === 'supply' || area === 'unit' })
  const groups = useQuery({ queryKey: ['master-data-operational-groups'], queryFn: () => api.masterData.itemGroups(), enabled: area === 'group' })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units(), enabled: area === 'unit' || area === 'supply' || area === 'clinical' })
  const conversions = useQuery({ queryKey: ['master-data-operational-conversions'], queryFn: () => api.masterData.unitConversions(), enabled: area === 'unit' })
  const configuration = useQuery({ queryKey: ['master-data-clinical-configuration', selectedServiceId],
    queryFn: () => api.masterData.clinicalConfiguration(selectedServiceId), enabled: Boolean(selectedServiceId) })

  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ predicate: ({ queryKey }) => String(queryKey[0] ?? '').startsWith('master-data-operational') })
    await client.invalidateQueries({ queryKey: ['master-data-clinical-configuration'] })
    await client.invalidateQueries({ queryKey: ['master-data-services'] })
  }
  const execute = (message: string, task: Promise<unknown>) => task.then(() => invalidate(message)).catch((error) => setOperationError(errorMessage(error)))
  const activeServices = (services.data ?? []).filter((value) => ['LABORATORY', 'EXAMINATION'].includes(value.sdServiceType))
  const serviceOptions = activeServices.map((value) => ({ value: value.id, label: value.name,
    secondaryText: value.code, searchKeywords: [value.sdServiceTypeText] }))

  return <div className="operational-master-data">
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    <div className="operational-master-data__nav" role="tablist" aria-label="运营主数据类型">
      <AreaButton active={area === 'clinical'} onClick={() => setArea('clinical')} title="标本与部位" copy="检验标本、容器、检查部位方式" />
      <AreaButton active={area === 'group'} onClick={() => setArea('group')} title="项目组套" copy="LIS/PACS 组套与组合项目" />
      <AreaButton active={area === 'supply'} onClick={() => setArea('supply')} title="耗材与器械" copy="UDI、注册证、型号与库存属性" />
      <AreaButton active={area === 'unit'} onClick={() => setArea('unit')} title="计量与换算" copy="统一单位、全局/项目换算" />
    </div>
    {area === 'clinical' && <section className="operational-master-data__body">
      <div className="operational-master-data__toolbar">
        <div><h3>检验/检查执行配置</h3><p>先选择诊疗项目，再维护其可用标本、容器和部位方式。</p></div>
        <Select value={selectedServiceId} onChange={setSelectedServiceId} loading={services.isPending}
          placeholder="搜索项目名称或编码" showValue options={serviceOptions} />
      </div>
      {!selectedServiceId ? <EmptyState icon="clinical" title="请选择检验或检查项目" copy="选择后可维护该项目的执行约束。" />
        : configuration.isPending ? <LoadingState label="正在加载项目执行配置…" />
          : configuration.data && <ClinicalWorkspace value={configuration.data} dictionaries={dictionaries}
            unitCodes={(units.data ?? []).filter((v) => v.status === 'ACTIVE')}
            onEditProfile={() => setDialog(configuration.data?.laboratory
              ? <LaboratoryProfileDialog value={configuration.data.laboratory} dictionaries={dictionaries}
                units={units.data ?? []} onClose={() => setDialog(undefined)} onSave={(input) => execute('检验项目配置已更新', api.masterData.updateLaboratoryProfile(selectedServiceId, configuration.data!.laboratory!.revision, input))} />
              : <ExaminationProfileDialog value={configuration.data!.examination!} dictionaries={dictionaries}
                services={services.data ?? []} currentServiceId={selectedServiceId}
                onClose={() => setDialog(undefined)} onSave={(input) => execute('检查项目配置已更新', api.masterData.updateExaminationProfile(selectedServiceId, configuration.data!.examination!.revision, input))} />)}
            onSpecimen={(row) => setDialog(<SpecimenDialog value={row} configuration={configuration.data!}
              units={units.data ?? []} services={services.data ?? []} onClose={() => setDialog(undefined)} onSave={(input) => execute(row ? '标本配置已更新' : '标本配置已新增', row
                ? api.masterData.updateSpecimenConfiguration(selectedServiceId, row, input)
                : api.masterData.createSpecimenConfiguration(selectedServiceId, input))} />)}
            onVariant={(row) => setDialog(<VariantDialog value={row} dictionaries={dictionaries}
              onClose={() => setDialog(undefined)} onSave={(input) => execute(row ? '检查部位方式已更新' : '检查部位方式已新增', row
                ? api.masterData.updateExaminationVariant(selectedServiceId, row, input)
                : api.masterData.createExaminationVariant(selectedServiceId, input))} />)}
            onAttachment={(row) => setDialog(<AttachmentDialog value={row} services={services.data ?? []}
              currentServiceId={selectedServiceId} onClose={() => setDialog(undefined)}
              onSave={(input) => execute(row ? '检查附件项目已更新' : '检查附件项目已新增', row
                ? api.masterData.updateExaminationAttachment(selectedServiceId, row, input)
                : api.masterData.createExaminationAttachment(selectedServiceId, input))} />)} />}
    </section>}
    {area === 'group' && <ListSection title="项目组套" copy="LIS 只能选检验项目，PACS 只能选检查项目；服务端会再次校验。"
      action={<Button onClick={() => setDialog(<GroupDialog services={services.data ?? []} organization={organization} units={units.data ?? []}
        onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已新增', api.masterData.createItemGroup(input))} />)}><Icon name="add" />新增组套</Button>}>
      {groups.isPending ? <LoadingState label="正在加载项目组套…" /> : !groups.data?.length
        ? <EmptyState icon="clinical" title="暂无项目组套" copy="可建立检验组套、检查组套或常用组合项目。" />
        : <DataTable headers={['组套', '类型', '适用范围', '成员', '状态', '操作']} rows={groups.data.map((value) => [
          <b>{value.name}<code>{value.code}</code></b>, value.groupType,
          value.organizationId ? organization.name : '租户通用', `${value.members.length} 项`, <State value={value.status} />,
          <Button size="sm" variant="text" onClick={() => setDialog(<GroupDialog value={value} services={services.data ?? []} organization={organization} units={units.data ?? []}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('项目组套已更新', api.masterData.updateItemGroup(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'supply' && <ListSection title="医用耗材/器械主数据" copy="统一维护编码、UDI-DI、注册信息、供应商和库存能力。"
      action={<Button onClick={() => setDialog(<SupplyDialog units={units.data ?? []} manufacturers={manufacturers} onClose={() => setDialog(undefined)}
        onSave={(input) => execute('耗材/器械已新增', api.masterData.createSupply(input))} />)}><Icon name="add" />新增耗材/器械</Button>}>
      {supplies.isPending ? <LoadingState label="正在加载耗材与器械…" /> : !supplies.data?.length
        ? <EmptyState icon="pharmacy" title="暂无耗材/器械资料" copy="可先维护单位，再建立耗材或器械主档。" />
        : <DataTable headers={['名称/编码', '类型/型号', 'UDI/注册证', '经营属性', '状态', '操作']} rows={supplies.data.map((value) => [
          <b>{value.name}<code>{value.code}</code></b>, `${value.supplyType === 'DEVICE' ? '医疗器械' : '医用耗材'}${value.modelName ? ` · ${value.modelName}` : ''}`,
          <span>{value.udiDi || '—'}<small>{value.registrationCode || '未维护注册证'}</small></span>,
          [value.stocked && '库存', value.chargeable && '收费', value.highValue && '高值', value.implant && '植入'].filter(Boolean).join(' · ') || '—',
          <State value={value.status} />, <Button size="sm" variant="text" onClick={() => setDialog(<SupplyDialog value={value} units={units.data ?? []} manufacturers={manufacturers}
            onClose={() => setDialog(undefined)} onSave={(input) => execute('耗材/器械已更新', api.masterData.updateSupply(value, input))} />)}>编辑</Button>,
        ])} />}
    </ListSection>}
    {area === 'unit' && <UnitWorkspace api={api} units={units.data ?? []} conversions={conversions.data ?? []}
      catalogItems={[...(services.data ?? []), ...(supplies.data ?? [])]}
      loading={units.isPending || conversions.isPending} onDialog={setDialog} onDone={invalidate} onError={(e) => setOperationError(errorMessage(e))} />}
    {dialog}
  </div>
}

function AreaButton({ active, onClick, title, copy }: { active: boolean; onClick: () => void; title: string; copy: string }) {
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}><strong>{title}</strong><small>{copy}</small></button>
}
function ListSection({ title, copy, action, children }: { title: string; copy: string; action: ReactNode; children: ReactNode }) {
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar">
    <div><h3>{title}</h3><p>{copy}</p></div>{action}</div>{children}</section>
}
function State({ value }: { value: string }) { return <StatusBadge tone={value === 'ACTIVE' ? 'success' : 'neutral'}>{value === 'ACTIVE' ? '启用' : '停用'}</StatusBadge> }
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="master-data-table-wrap"><table className="master-data-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function ClinicalWorkspace({ value, dictionaries, unitCodes, onEditProfile, onSpecimen, onVariant, onAttachment }: {
  value: ClinicalConfiguration; dictionaries: Record<string, DictionaryValue[]>; unitCodes: UnitDefinition[]
  onEditProfile: () => void; onSpecimen: (value?: SpecimenConfiguration) => void
  onVariant: (value?: ExaminationVariantConfiguration) => void
  onAttachment: (value?: ExaminationAttachmentConfiguration) => void
}) {
  void dictionaries; void unitCodes
  const profile = value.laboratory ?? value.examination
  return <div className="clinical-configuration">
    <header><div><strong>{value.serviceName}</strong><code>{value.serviceCode}</code></div><State value="ACTIVE" />
      <Button variant="secondary" onClick={onEditProfile}>编辑项目执行配置</Button></header>
    <div className="clinical-configuration__facts">
      {value.laboratory ? <><span>检验方法<strong>{value.laboratory.laboratoryMethod || '未设置'}</strong></span>
        <span>报告时长<strong>{value.laboratory.reportDuration ? `${value.laboratory.reportDuration} ${value.laboratory.reportDurationUnit}` : '未设置'}</strong></span>
        <span>执行属性<strong>{[value.laboratory.fastingRequired && '空腹', value.laboratory.pointOfCare && 'POCT'].filter(Boolean).join(' · ') || '常规'}</strong></span></>
        : <><span>检查类型<strong>{value.examination?.examinationType || '未设置'}</strong></span>
          <span>部位规则<strong>{value.examination?.bodySiteRequired ? `必选 · 最多 ${value.examination.maxBodySiteCount} 个` : '不要求'}</strong></span>
          <span>多部位计价<strong>{sitePricingLabel(value.examination!)}</strong></span></>}
    </div>
    <div className="clinical-configuration__section"><div className="section-heading"><div><h4>{value.laboratory ? '可用标本与容器' : '检查部位与方式'}</h4>
      <p>{value.laboratory ? '开立与采集时将按此限定标本。' : '作为检查申请的可选变体。'}</p></div>
      <Button onClick={() => value.laboratory ? onSpecimen() : onVariant()}><Icon name="add" />新增</Button></div>
      {value.laboratory ? <DataTable headers={['标本', '容器', '最小采集量', '分管/加收', '状态', '操作']} rows={value.laboratory.specimens.map((row) => [
        <b>{row.specimenName}<code>{row.specimenCode}</code></b>, row.containerName || '—', row.minimumQuantity ? `${row.minimumQuantity} ${row.minimumQuantityUnit}` : '—',
        <span>{tubeRuleLabel(row)}<small>{[row.defaultSpecimen && '默认', row.requiredSpecimen && '必需'].filter(Boolean).join(' · ') || '可选'}</small></span>, <State value={row.status} />,
        <Button size="sm" variant="text" onClick={() => onSpecimen(row)}>编辑</Button>,
      ])} /> : <DataTable headers={['部位/方式', '方式类型', '部位选择', '排序', '状态', '操作']} rows={(value.examination?.variants ?? []).map((row) => [
        <b>{row.name}<code>{row.code}</code></b>, row.methodType || '常规', row.bodySiteRequired ? '必选部位' : '固定方式', row.sortOrder,
        <State value={row.status} />, <Button size="sm" variant="text" onClick={() => onVariant(row)}>编辑</Button>,
      ])} />}
    </div>
    {value.examination && <div className="clinical-configuration__section"><div className="section-heading"><div>
      <h4>附件项目</h4><p>配置胶片、造影、麻醉等随检查带出的项目及计费数量。</p></div>
      <Button onClick={() => onAttachment()}><Icon name="add" />新增附件</Button></div>
      {!value.examination.attachments.length ? <EmptyState icon="clinical" title="暂无附件项目" copy="按需配置必带、可选或多部位触发的附件。" />
        : <DataTable headers={['附件项目', '触发条件', '数量规则', '计费', '状态', '操作']} rows={value.examination.attachments.map((row) => [
          <b>{row.attachmentItemName}<code>{row.attachmentItemCode}</code></b>, attachmentTriggerLabel(row.triggerType),
          `${attachmentQuantityLabel(row.quantityBasis)} × ${row.quantity}`, row.separatelyChargeable ? '单独计费' : '随主项',
          <State value={row.status} />, <Button size="sm" variant="text" onClick={() => onAttachment(row)}>编辑</Button>,
        ])} />}
    </div>}{!profile && <Alert>当前项目未初始化执行配置。</Alert>}
  </div>
}

const sitePricingLabel = (value: NonNullable<ClinicalConfiguration['examination']>) => ({
  SINGLE: '主项计费一次', PER_SITE: '按部位计主项', BASE_PLUS_FIXED: `含 ${value.includedSiteCount} 个 · 超出固定加收`,
  BASE_PLUS_ITEM: `含 ${value.includedSiteCount} 个 · 超出加收项目`,
}[value.sitePricingMode])
const tubeRuleLabel = (value: SpecimenConfiguration) => {
  const sharing = { SEPARATE: '独立分管', SHARE: '同组共管', BY_TEST_COUNT: `每管最多 ${value.maxTestsPerTube} 项` }[value.tubeSharingMode]
  const charge = value.tubeChargeMode === 'NONE' ? '' : ` · ${value.tubeChargeItemName || '试管加收'}`
  return `${sharing}${value.tubeGroupCode ? ` · ${value.tubeGroupCode}` : ''}${charge}`
}
const attachmentTriggerLabel = (value: ExaminationAttachmentConfiguration['triggerType']) => ({ ALWAYS: '始终带出', OPTIONAL: '按需选择', MULTI_SITE: '多部位时' }[value])
const attachmentQuantityLabel = (value: ExaminationAttachmentConfiguration['quantityBasis']) => ({ FIXED: '固定', PER_SITE: '每部位', PER_EXTRA_SITE: '每超出部位' }[value])

function FormDialog({ title, description, onClose, onSubmit, children }: { title: string; description: string; onClose: () => void; onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <Dialog title={title} eyebrow="基础数据 · 运营配置" description={description} size="wide" onClose={onClose}>
    <form className="master-data-dialog-form" onSubmit={onSubmit}><div className="master-data-form-grid">{children}</div>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose} type="button">取消</Button><Button type="submit">保存</Button></div></form>
  </Dialog>
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="operational-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
}

function LaboratoryProfileDialog({ value, dictionaries, units, onClose, onSave }: { value: LaboratoryProfile; dictionaries: Record<string, DictionaryValue[]>; units: UnitDefinition[]; onClose: () => void; onSave: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => void }) {
  const [form, setForm] = useState({ laboratoryMethod: value.laboratoryMethod ?? '', reportDuration: value.reportDuration?.toString() ?? '', reportDurationUnit: value.reportDurationUnit ?? '', fastingRequired: value.fastingRequired, pointOfCare: value.pointOfCare, collectionDescription: value.collectionDescription ?? '' })
  return <FormDialog title="编辑检验项目配置" description="维护检验方法、报告时长与采集要求。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ ...form, laboratoryMethod: form.laboratoryMethod || undefined, reportDuration: form.reportDuration ? Number(form.reportDuration) : undefined, reportDurationUnit: form.reportDurationUnit || undefined, collectionDescription: form.collectionDescription || undefined }) }}>
    <FormField label="检验方法"><Select value={form.laboratoryMethod} onChange={(v) => setForm({ ...form, laboratoryMethod: v })} showValue placeholder="选择检验方法" options={(dictionaries.BD_LAB_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="报告时长"><input type="number" min="0.001" step="0.001" value={form.reportDuration} onChange={(e) => setForm({ ...form, reportDuration: e.target.value })} /></FormField>
    <FormField label="时长单位"><Select value={form.reportDurationUnit} onChange={(v) => setForm({ ...form, reportDurationUnit: v })} showValue options={units.filter((v) => v.dimension === 'TIME' && v.status === 'ACTIVE').map(unitOption)} /></FormField>
    <FormField label="采集说明" className="span-2"><textarea value={form.collectionDescription} onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })} /></FormField>
    <Check label="要求空腹" checked={form.fastingRequired} onChange={(v) => setForm({ ...form, fastingRequired: v })} /><Check label="院内快速检测（POCT）" checked={form.pointOfCare} onChange={(v) => setForm({ ...form, pointOfCare: v })} />
  </FormDialog>
}

function ExaminationProfileDialog({ value, dictionaries, services, currentServiceId, onClose, onSave }: {
  value: NonNullable<ClinicalConfiguration['examination']>; dictionaries: Record<string, DictionaryValue[]>
  services: ServiceCatalogItem[]; currentServiceId: string; onClose: () => void
  onSave: (input: ExaminationProfileInput) => void
}) {
  const [form, setForm] = useState({ examinationType: value.examinationType ?? '', bodySiteRequired: value.bodySiteRequired,
    multiBodySite: value.multiBodySite, maxBodySiteCount: value.maxBodySiteCount?.toString() ?? '1',
    preparationDescription: value.preparationDescription ?? '', sitePricingMode: value.sitePricingMode,
    includedSiteCount: String(value.includedSiteCount), additionalSitePrice: value.additionalSitePrice?.toString() ?? '',
    additionalSiteItemId: value.additionalSiteItemId ?? '', additionalSiteQuantity: String(value.additionalSiteQuantity || 1),
    maxChargeableSiteCount: value.maxChargeableSiteCount?.toString() ?? value.maxBodySiteCount?.toString() ?? '1' })
  const itemOptions = services.filter((v) => v.id !== currentServiceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const pricingMode = form.multiBodySite ? form.sitePricingMode : 'SINGLE'
  return <FormDialog title="编辑检查项目配置" description="维护检查类型、部位约束和多部位计价规则。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ examinationType: form.examinationType || undefined, bodySiteRequired: form.bodySiteRequired, multiBodySite: form.bodySiteRequired && form.multiBodySite, maxBodySiteCount: form.bodySiteRequired ? Number(form.maxBodySiteCount || 1) : undefined, preparationDescription: form.preparationDescription || undefined, sitePricingMode: pricingMode, includedSiteCount: Number(form.includedSiteCount || 1), additionalSitePrice: pricingMode === 'BASE_PLUS_FIXED' ? Number(form.additionalSitePrice) : undefined, additionalSiteItemId: pricingMode === 'BASE_PLUS_ITEM' ? form.additionalSiteItemId : undefined, additionalSiteQuantity: Number(form.additionalSiteQuantity || 1), maxChargeableSiteCount: form.multiBodySite ? Number(form.maxChargeableSiteCount || form.maxBodySiteCount) : 1 }) }}>
    <FormField label="检查类型"><Select value={form.examinationType} onChange={(v) => setForm({ ...form, examinationType: v })} showValue options={(dictionaries.BD_EXAM_TYPE ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="最多部位数"><input type="number" min="1" disabled={!form.bodySiteRequired} value={form.maxBodySiteCount} onChange={(e) => setForm({ ...form, maxBodySiteCount: e.target.value })} /></FormField>
    <FormField label="多部位计价"><Select disabled={!form.multiBodySite} value={pricingMode} onChange={(v) => setForm({ ...form, sitePricingMode: v as typeof form.sitePricingMode })} options={[
      { value: 'SINGLE', label: '主项目只计一次' }, { value: 'PER_SITE', label: '主项目按部位数量计费' },
      { value: 'BASE_PLUS_FIXED', label: '基础部位 + 固定金额' }, { value: 'BASE_PLUS_ITEM', label: '基础部位 + 加收项目' },
    ]} /></FormField>
    <FormField label="价格包含部位数"><input type="number" min="1" disabled={!form.multiBodySite} value={form.includedSiteCount} onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })} /></FormField>
    {pricingMode === 'BASE_PLUS_FIXED' && <FormField label="每超出部位加收金额" required><input type="number" min="0" step="0.01" value={form.additionalSitePrice} onChange={(e) => setForm({ ...form, additionalSitePrice: e.target.value })} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="多部位加收项目" required><Select value={form.additionalSiteItemId} onChange={(v) => setForm({ ...form, additionalSiteItemId: v })} showValue options={itemOptions} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="每超出部位加收数量"><input type="number" min="0.0001" step="any" value={form.additionalSiteQuantity} onChange={(e) => setForm({ ...form, additionalSiteQuantity: e.target.value })} /></FormField>}
    {form.multiBodySite && <FormField label="最大计费部位数"><input type="number" min={form.includedSiteCount || 1} max={form.maxBodySiteCount} value={form.maxChargeableSiteCount} onChange={(e) => setForm({ ...form, maxChargeableSiteCount: e.target.value })} /></FormField>}
    <FormField label="检查前准备" className="span-2"><textarea value={form.preparationDescription} onChange={(e) => setForm({ ...form, preparationDescription: e.target.value })} /></FormField>
    <Check label="申请时必须选择检查部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} /><Check label="允许多部位" checked={form.multiBodySite} onChange={(v) => setForm({ ...form, multiBodySite: v })} />
  </FormDialog>
}

function SpecimenDialog({ value, configuration, units, services, onClose, onSave }: { value?: SpecimenConfiguration; configuration: ClinicalConfiguration; units: UnitDefinition[]; services: ServiceCatalogItem[]; onClose: () => void; onSave: (input: SpecimenConfigurationInput) => void }) {
  const [form, setForm] = useState({ specimenItemId: value?.specimenItemId ?? '', containerItemId: value?.containerItemId ?? '', minimumQuantity: value?.minimumQuantity?.toString() ?? '', minimumQuantityUnit: value?.minimumQuantityUnit?.toUpperCase() ?? '', defaultSpecimen: value?.defaultSpecimen ?? false, requiredSpecimen: value?.requiredSpecimen ?? true, sortOrder: String(value?.sortOrder ?? ((configuration.laboratory?.specimens.length ?? 0) + 1) * 10), collectionDescription: value?.collectionDescription ?? '', status: value?.status ?? 'ACTIVE', tubeGroupCode: value?.tubeGroupCode ?? '', tubeSharingMode: value?.tubeSharingMode ?? 'SEPARATE', baseTubeCount: String(value?.baseTubeCount ?? 1), maxTestsPerTube: value?.maxTestsPerTube?.toString() ?? '', tubeChargeMode: value?.tubeChargeMode ?? 'NONE', tubeChargeItemId: value?.tubeChargeItemId ?? '', includedTubeCount: String(value?.includedTubeCount ?? 0), tubeChargeQuantity: String(value?.tubeChargeQuantity ?? 1) })
  const chargeOptions = services.filter((v) => v.id !== configuration.serviceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  return <FormDialog title={value ? '编辑标本与分管规则' : '新增标本与分管规则'} description="维护标本容器、合管拆管条件以及采血管加收规则。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ specimenItemId: form.specimenItemId, containerItemId: form.containerItemId || undefined, minimumQuantity: form.minimumQuantity ? Number(form.minimumQuantity) : undefined, minimumQuantityUnit: form.minimumQuantityUnit || undefined, defaultSpecimen: form.defaultSpecimen, requiredSpecimen: form.requiredSpecimen, sortOrder: Number(form.sortOrder), collectionDescription: form.collectionDescription || undefined, status: form.status as 'ACTIVE' | 'INACTIVE', tubeGroupCode: form.tubeGroupCode || undefined, tubeSharingMode: form.tubeSharingMode, baseTubeCount: Number(form.baseTubeCount || 1), maxTestsPerTube: form.tubeSharingMode === 'BY_TEST_COUNT' ? Number(form.maxTestsPerTube) : undefined, tubeChargeMode: form.tubeChargeMode, tubeChargeItemId: form.tubeChargeMode === 'NONE' ? undefined : form.tubeChargeItemId, includedTubeCount: Number(form.includedTubeCount || 0), tubeChargeQuantity: Number(form.tubeChargeQuantity || 1) }) }}>
    <FormField label="标本类型" required><Select value={form.specimenItemId} onChange={(v) => setForm({ ...form, specimenItemId: v })} showValue options={configuration.specimenOptions.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="采集容器"><Select value={form.containerItemId} onChange={(v) => setForm({ ...form, containerItemId: v })} showValue placeholder="不限定" options={configuration.containerOptions.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="最小采集量"><input type="number" min="0.001" step="0.001" value={form.minimumQuantity} onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })} /></FormField>
    <FormField label="采集量单位"><Select value={form.minimumQuantityUnit} onChange={(v) => setForm({ ...form, minimumQuantityUnit: v })} showValue options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)} /></FormField>
    <FormField label="分管方式"><Select value={form.tubeSharingMode} onChange={(v) => setForm({ ...form, tubeSharingMode: v as typeof form.tubeSharingMode })} options={[
      { value: 'SEPARATE', label: '独立分管' }, { value: 'SHARE', label: '同组项目共管' }, { value: 'BY_TEST_COUNT', label: '按每管项目数拆分' },
    ]} /></FormField>
    <FormField label="分管编码" required={form.tubeSharingMode !== 'SEPARATE'}><input value={form.tubeGroupCode} placeholder="如 EDTA_HEMATOLOGY" onChange={(e) => setForm({ ...form, tubeGroupCode: e.target.value.toUpperCase() })} /></FormField>
    <FormField label="基础试管数" required><input type="number" min="1" value={form.baseTubeCount} onChange={(e) => setForm({ ...form, baseTubeCount: e.target.value })} /></FormField>
    {form.tubeSharingMode === 'BY_TEST_COUNT' && <FormField label="每管最大项目数" required><input type="number" min="1" value={form.maxTestsPerTube} onChange={(e) => setForm({ ...form, maxTestsPerTube: e.target.value })} /></FormField>}
    <FormField label="试管加收"><Select value={form.tubeChargeMode} onChange={(v) => setForm({ ...form, tubeChargeMode: v as typeof form.tubeChargeMode })} options={[
      { value: 'NONE', label: '不加收' }, { value: 'PER_TUBE', label: '每管加收' }, { value: 'EXCESS_TUBE', label: '超出包含管数后加收' },
    ]} /></FormField>
    {form.tubeChargeMode !== 'NONE' && <FormField label="试管加收项目" required><Select value={form.tubeChargeItemId} onChange={(v) => setForm({ ...form, tubeChargeItemId: v })} showValue options={chargeOptions} /></FormField>}
    {form.tubeChargeMode === 'EXCESS_TUBE' && <FormField label="已包含试管数"><input type="number" min="0" value={form.includedTubeCount} onChange={(e) => setForm({ ...form, includedTubeCount: e.target.value })} /></FormField>}
    {form.tubeChargeMode !== 'NONE' && <FormField label="每管加收数量"><input type="number" min="0.0001" step="any" value={form.tubeChargeQuantity} onChange={(e) => setForm({ ...form, tubeChargeQuantity: e.target.value })} /></FormField>}
    <FormField label="排序号" required><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })} options={activeStatus} /></FormField>
    <FormField label="采集说明" className="span-2"><textarea value={form.collectionDescription} onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })} /></FormField>
    <Check label="默认标本" checked={form.defaultSpecimen} onChange={(v) => setForm({ ...form, defaultSpecimen: v })} /><Check label="必需标本" checked={form.requiredSpecimen} onChange={(v) => setForm({ ...form, requiredSpecimen: v })} />
  </FormDialog>
}

function VariantDialog({ value, dictionaries, onClose, onSave }: { value?: ExaminationVariantConfiguration; dictionaries: Record<string, DictionaryValue[]>; onClose: () => void; onSave: (input: ExaminationVariantInput) => void }) {
  const [form, setForm] = useState({ code: value?.code ?? '', name: value?.name ?? '', methodType: value?.methodType ?? '', bodySiteRequired: value?.bodySiteRequired ?? true, mutualRecognitionCode: value?.mutualRecognitionCode ?? '', sortOrder: String(value?.sortOrder ?? 10), status: value?.status ?? 'ACTIVE' })
  return <FormDialog title={value ? '编辑检查部位方式' : '新增检查部位方式'} description="可先维护本地编码与名称，后续再关联标准部位术语。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ code: form.code, name: form.name, methodType: form.methodType || undefined, bodySiteRequired: form.bodySiteRequired, mutualRecognitionCode: form.mutualRecognitionCode || undefined, sortOrder: Number(form.sortOrder), status: form.status as 'ACTIVE' | 'INACTIVE' }) }}>
    <FormField label="方式编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="方式名称" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
    <FormField label="方式类型"><Select value={form.methodType} onChange={(v) => setForm({ ...form, methodType: v })} showValue options={(dictionaries.BD_SERVICE_VARIANT_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField><FormField label="互认编码"><input value={form.mutualRecognitionCode} onChange={(e) => setForm({ ...form, mutualRecognitionCode: e.target.value })} /></FormField>
    <FormField label="排序号"><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' })} options={activeStatus} /></FormField>
    <Check label="申请时仍需选择标准部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} />
  </FormDialog>
}

function AttachmentDialog({ value, services, currentServiceId, onClose, onSave }: {
  value?: ExaminationAttachmentConfiguration; services: ServiceCatalogItem[]; currentServiceId: string
  onClose: () => void; onSave: (input: ExaminationAttachmentInput) => void
}) {
  const [form, setForm] = useState({ attachmentCatalogItemId: value?.attachmentCatalogItemId ?? '',
    triggerType: value?.triggerType ?? 'ALWAYS', quantityBasis: value?.quantityBasis ?? 'FIXED',
    quantity: String(value?.quantity ?? 1), requiredAttachment: value?.requiredAttachment ?? false,
    separatelyChargeable: value?.separatelyChargeable ?? true, sortOrder: String(value?.sortOrder ?? 10),
    description: value?.description ?? '', status: value?.status ?? 'ACTIVE' })
  const options = services.filter((v) => v.id !== currentServiceId && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: `${v.code}${v.chargeable ? ' · 可收费' : ''}` }))
  return <FormDialog title={value ? '编辑检查附件项目' : '新增检查附件项目'}
    description="附件项目引用统一诊疗目录，可按固定、每部位或每超出部位计算数量。"
    onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ attachmentCatalogItemId: form.attachmentCatalogItemId,
      triggerType: form.triggerType, quantityBasis: form.quantityBasis, quantity: Number(form.quantity),
      requiredAttachment: form.triggerType === 'OPTIONAL' ? false : form.requiredAttachment,
      separatelyChargeable: form.separatelyChargeable, sortOrder: Number(form.sortOrder),
      description: form.description || undefined, status: form.status as 'ACTIVE' | 'INACTIVE' }) }}>
    <FormField label="附件项目" required><Select disabled={Boolean(value)} value={form.attachmentCatalogItemId} onChange={(v) => setForm({ ...form, attachmentCatalogItemId: v })} showValue options={options} /></FormField>
    <FormField label="触发条件"><Select value={form.triggerType} onChange={(v) => setForm({ ...form, triggerType: v as typeof form.triggerType })} options={[
      { value: 'ALWAYS', label: '始终带出' }, { value: 'OPTIONAL', label: '申请时按需选择' }, { value: 'MULTI_SITE', label: '选择多个部位时' },
    ]} /></FormField>
    <FormField label="数量依据"><Select value={form.quantityBasis} onChange={(v) => setForm({ ...form, quantityBasis: v as typeof form.quantityBasis })} options={[
      { value: 'FIXED', label: '固定数量' }, { value: 'PER_SITE', label: '每个检查部位' }, { value: 'PER_EXTRA_SITE', label: '每个超出部位' },
    ]} /></FormField>
    <FormField label="数量"><input type="number" min="0.0001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></FormField>
    <FormField label="排序号"><input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></FormField>
    <FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as typeof form.status })} options={activeStatus} /></FormField>
    <FormField label="说明" className="span-2"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
    <Check label="必带附件" checked={form.requiredAttachment} onChange={(v) => setForm({ ...form, requiredAttachment: v })} />
    <Check label="生成独立收费行" checked={form.separatelyChargeable} onChange={(v) => setForm({ ...form, separatelyChargeable: v })} />
  </FormDialog>
}

function SupplyDialog({ value, units, manufacturers, onClose, onSave }: {
  value?: SupplyItem; units: UnitDefinition[]; manufacturers: Manufacturer[]
  onClose: () => void; onSave: (input: SupplyInput) => void
}) {
  const [form, setForm] = useState({
    supplyType: value?.supplyType ?? 'CONSUMABLE', code: value?.code ?? '', name: value?.name ?? '',
    unitCode: value?.unitCode ?? 'EA', udiDi: value?.udiDi ?? '', genericCode: value?.genericCode ?? '',
    genericName: value?.genericName ?? '', modelName: value?.modelName ?? '', specification: value?.specification ?? '',
    materialType: value?.materialType ?? '', deviceClass: value?.deviceClass ?? '',
    registrationCode: value?.registrationCode ?? '', registrationName: value?.registrationName ?? '',
    registrantName: value?.registrantName ?? '', registrationFrom: value?.registrationFrom ?? '',
    registrationTo: value?.registrationTo ?? '', manufacturerId: value?.manufacturerId ?? '',
    structureDescription: value?.structureDescription ?? '', scopeDescription: value?.scopeDescription ?? '',
    instruction: value?.instruction ?? '', validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '',
    orderable: value?.orderable ?? true, chargeable: value?.chargeable ?? true, stocked: value?.stocked ?? true,
    highValue: value?.highValue ?? false, implant: value?.implant ?? false,
    intervention: value?.intervention ?? false, sterile: value?.sterile ?? false,
    singleUse: value?.singleUse ?? true, status: value?.status ?? 'ACTIVE',
  })
  const optional = (text: string) => text.trim() || undefined
  return <FormDialog title={value ? '编辑耗材/器械' : '新增耗材/器械'}
    description="统一维护经营属性、UDI、注册证和生产企业信息。" onClose={onClose}
    onSubmit={(e) => { e.preventDefault(); onSave({
      supplyType: form.supplyType as 'CONSUMABLE' | 'DEVICE', code: form.code, name: form.name,
      unitCode: form.unitCode, orderable: form.orderable, chargeable: form.chargeable, stocked: form.stocked,
      status: form.status as 'ACTIVE' | 'INACTIVE', validFrom: form.validFrom, validTo: form.validTo || undefined,
      udiDi: optional(form.udiDi), genericCode: optional(form.genericCode), genericName: optional(form.genericName),
      modelName: optional(form.modelName), specification: optional(form.specification), materialType: optional(form.materialType),
      deviceClass: form.deviceClass as 'I' | 'II' | 'III' || undefined, highValue: form.highValue,
      implant: form.implant, intervention: form.intervention, sterile: form.sterile, singleUse: form.singleUse,
      registrationCode: optional(form.registrationCode), registrationName: optional(form.registrationName),
      registrantName: optional(form.registrantName), registrationFrom: form.registrationFrom || undefined,
      registrationTo: form.registrationTo || undefined, manufacturerId: form.manufacturerId || undefined,
      structureDescription: optional(form.structureDescription), scopeDescription: optional(form.scopeDescription),
      instruction: optional(form.instruction),
    }) }}>
    <FormField label="主数据类型" required><Select value={form.supplyType} onChange={(v) => setForm({ ...form, supplyType: v as 'CONSUMABLE' | 'DEVICE' })} options={[{ value: 'CONSUMABLE', label: '医用耗材' }, { value: 'DEVICE', label: '医疗器械' }]} /></FormField>
    <FormField label="编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField>
    <FormField label="名称" required className="span-2"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
    <FormField label="基础单位" required><Select value={form.unitCode} onChange={(v) => setForm({ ...form, unitCode: v })} showValue options={units.filter((v) => v.status === 'ACTIVE' || v.code === value?.unitCode).map(unitOption)} /></FormField>
    <FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField>
    <FormField label="UDI-DI"><input value={form.udiDi} onChange={(e) => setForm({ ...form, udiDi: e.target.value })} /></FormField>
    <FormField label="通用编码"><input value={form.genericCode} onChange={(e) => setForm({ ...form, genericCode: e.target.value })} /></FormField>
    <FormField label="通用名"><input value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} /></FormField>
    <FormField label="生产企业"><Select value={form.manufacturerId} onChange={(v) => setForm({ ...form, manufacturerId: v })} placeholder="未指定" showValue options={manufacturers.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="型号"><input value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} /></FormField>
    <FormField label="规格"><input value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} /></FormField>
    <FormField label="材质类型"><input value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })} /></FormField>
    <FormField label="器械分类"><Select value={form.deviceClass} onChange={(v) => setForm({ ...form, deviceClass: v })} placeholder="非器械/未设置" options={['I', 'II', 'III'].map((v) => ({ value: v, label: `${v} 类` }))} /></FormField>
    <FormField label="注册证号"><input value={form.registrationCode} onChange={(e) => setForm({ ...form, registrationCode: e.target.value })} /></FormField>
    <FormField label="注册证名称"><input value={form.registrationName} onChange={(e) => setForm({ ...form, registrationName: e.target.value })} /></FormField>
    <FormField label="注册人"><input value={form.registrantName} onChange={(e) => setForm({ ...form, registrantName: e.target.value })} /></FormField>
    <FormField label="注册有效期起"><input type="date" value={form.registrationFrom} onChange={(e) => setForm({ ...form, registrationFrom: e.target.value })} /></FormField>
    <FormField label="注册有效期止"><input type="date" min={form.registrationFrom} value={form.registrationTo} onChange={(e) => setForm({ ...form, registrationTo: e.target.value })} /></FormField>
    <FormField label="主档生效日期" required><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></FormField>
    <FormField label="主档失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></FormField>
    <FormField label="结构组成" className="span-2"><textarea value={form.structureDescription} onChange={(e) => setForm({ ...form, structureDescription: e.target.value })} /></FormField>
    <FormField label="适用范围" className="span-2"><textarea value={form.scopeDescription} onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} /></FormField>
    <FormField label="使用说明" className="span-2"><textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} /></FormField>
    <Check label="可开立" checked={form.orderable} onChange={(v) => setForm({ ...form, orderable: v })} />
    <Check label="可收费" checked={form.chargeable} onChange={(v) => setForm({ ...form, chargeable: v })} />
    <Check label="可库存" checked={form.stocked} onChange={(v) => setForm({ ...form, stocked: v })} />
    <Check label="高值耗材" checked={form.highValue} onChange={(v) => setForm({ ...form, highValue: v })} />
    <Check label="植入类" checked={form.implant} onChange={(v) => setForm({ ...form, implant: v, highValue: v || form.highValue })} />
    <Check label="介入类" checked={form.intervention} onChange={(v) => setForm({ ...form, intervention: v })} />
    <Check label="无菌" checked={form.sterile} onChange={(v) => setForm({ ...form, sterile: v })} />
    <Check label="一次性使用" checked={form.singleUse} onChange={(v) => setForm({ ...form, singleUse: v })} />
  </FormDialog>
}

function GroupDialog({ value, services, organization, units, onClose, onSave }: { value?: ItemGroup; services: ServiceCatalogItem[]; organization: Organization; units: UnitDefinition[]; onClose: () => void; onSave: (input: ItemGroupInput) => void }) {
  const [type, setType] = useState(value?.groupType ?? 'LIS')
  const [selected, setSelected] = useState<string[]>(value?.members.map((v) => v.catalogItemId) ?? [])
  const [memberConfig, setMemberConfig] = useState<Record<string, { quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>>(
    Object.fromEntries((value?.members ?? []).map((v) => [v.catalogItemId, { quantity: String(v.quantity), unitCode: v.unitCode ?? '', requiredMember: v.requiredMember, memberDescription: v.memberDescription ?? '' }])),
  )
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [scope, setScope] = useState(value?.organizationId ? 'ORGANIZATION' : 'TENANT')
  const [usageType, setUsageType] = useState(value?.usageType ?? '')
  const [pointOfCare, setPointOfCare] = useState(value?.pointOfCare ?? false)
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [status, setStatus] = useState(value?.status ?? 'ACTIVE')
  const available = services.filter((v) => type === 'LIS' ? v.sdServiceType === 'LABORATORY' : type === 'PACS' ? v.sdServiceType === 'EXAMINATION' : true)
  const toggle = (id: string) => setSelected((items) => {
    if (items.includes(id)) return items.filter((v) => v !== id)
    setMemberConfig((current) => ({ ...current, [id]: current[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' } }))
    return [...items, id]
  })
  const setMember = (id: string, patch: Partial<{ quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>) =>
    setMemberConfig((current) => ({ ...current, [id]: {
      quantity: current[id]?.quantity ?? '1', unitCode: current[id]?.unitCode ?? '',
      requiredMember: current[id]?.requiredMember ?? true,
      memberDescription: current[id]?.memberDescription ?? '', ...patch,
    } }))
  return <FormDialog title={value ? '编辑项目组套' : '新增项目组套'} description="组套成员会在开立时展开，不复制成员主档。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ organizationId: scope === 'ORGANIZATION' ? organization.id : undefined, code, name, groupType: type as ItemGroup['groupType'], usageType: usageType || undefined, pointOfCare, status: status as 'ACTIVE' | 'INACTIVE', validFrom, validTo: validTo || undefined, members: selected.map((catalogItemId, index) => ({ catalogItemId, sortOrder: (index + 1) * 10, quantity: Number(memberConfig[catalogItemId]?.quantity || 1), unitCode: memberConfig[catalogItemId]?.unitCode || undefined, requiredMember: memberConfig[catalogItemId]?.requiredMember ?? true, memberDescription: memberConfig[catalogItemId]?.memberDescription || undefined })) }) }}>
    <FormField label="组套编码" required><input value={code} disabled={Boolean(value)} onChange={(e) => setCode(e.target.value.toUpperCase())} /></FormField><FormField label="组套名称" required><input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
    <FormField label="组套类型"><Select value={type} onChange={(v) => { setType(v as typeof type); setSelected([]); setMemberConfig({}) }} options={[{ value: 'LIS', label: '检验组套（LIS）' }, { value: 'PACS', label: '检查组套（PACS）' }, { value: 'ORDER_SET', label: '常用组合项目' }, { value: 'PACKAGE', label: '项目包' }]} /></FormField><FormField label="适用范围"><Select value={scope} onChange={setScope} options={[{ value: 'TENANT', label: '租户通用' }, { value: 'ORGANIZATION', label: organization.name }]} /></FormField>
    <FormField label="使用场景"><input value={usageType} onChange={(e) => setUsageType(e.target.value)} placeholder="例如：门诊、住院、体检" /></FormField><FormField label="状态"><Select value={status} onChange={(v) => setStatus(v as 'ACTIVE' | 'INACTIVE')} options={activeStatus} /></FormField>
    <FormField label="生效日期" required><input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></FormField><FormField label="失效日期"><input type="date" min={validFrom} value={validTo} onChange={(e) => setValidTo(e.target.value)} /></FormField>
    <Check label="院内快速检测组套（POCT）" checked={pointOfCare} onChange={setPointOfCare} />
    <FormField label={`组套成员（已选 ${selected.length} 项）`} required className="span-2"><div className="group-member-picker">{available.map((service) => <Check key={service.id} label={`${service.name} · ${service.code}`} checked={selected.includes(service.id)} onChange={() => toggle(service.id)} />)}</div></FormField>
    {selected.length > 0 && <FormField label="成员执行参数" className="span-2"><div className="group-member-config">
      {selected.map((id) => { const service = services.find((v) => v.id === id); const config = memberConfig[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' }; return <div className="group-member-config__row" key={id}>
        <strong>{service?.name}<code>{service?.code}</code></strong>
        <input type="number" min="0.001" step="any" aria-label={`${service?.name}数量`} value={config.quantity} onChange={(e) => setMember(id, { quantity: e.target.value })} />
        <Select aria-label={`${service?.name}单位`} value={config.unitCode} onChange={(unitCode) => setMember(id, { unitCode })} placeholder="沿用项目单位" showValue options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)} />
        <Check label="必选" checked={config.requiredMember} onChange={(requiredMember) => setMember(id, { requiredMember })} />
        <input aria-label={`${service?.name}说明`} value={config.memberDescription} onChange={(e) => setMember(id, { memberDescription: e.target.value })} placeholder="成员说明（可选）" />
      </div> })}
    </div></FormField>}
  </FormDialog>
}

function UnitWorkspace({ api, units, conversions, catalogItems, loading, onDialog, onDone, onError }: { api: RhnApi; units: UnitDefinition[]; conversions: UnitConversion[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; loading: boolean; onDialog: (v?: ReactNode) => void; onDone: (m: string) => Promise<void>; onError: (e: unknown) => void }) {
  const [quantity, setQuantity] = useState('1'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [catalogItemId, setCatalogItemId] = useState(''); const [result, setResult] = useState('')
  const opts = units.filter((v) => v.status === 'ACTIVE').map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const catalogName = (id?: string) => catalogItems.find((v) => v.id === id)?.name ?? '项目专属'
  const run = () => api.masterData.convertUnit(Number(quantity), from, to, catalogItemId || undefined, today()).then((v) => setResult(`${v.input} ${v.fromUnitCode} = ${v.result} ${v.toUnitCode} · ${v.path.join(' → ')}`)).catch(onError)
  const saveUnit = (value?: UnitDefinition) => (input: Omit<UnitDefinition, 'id' | 'revision'>) =>
    (value ? api.masterData.updateUnit(value, input) : api.masterData.createUnit(input))
      .then(() => { onDialog(undefined); return onDone(value ? '计量单位已更新' : '计量单位已新增') }).catch(onError)
  const saveConversion = (value?: UnitConversion) => (input: UnitConversionInput) =>
    (value ? api.masterData.updateUnitConversion(value, input) : api.masterData.createUnitConversion(input))
      .then(() => { onDialog(undefined); return onDone(value ? '换算规则已更新' : '换算规则已新增') }).catch(onError)
  return <section className="operational-master-data__body"><div className="operational-master-data__toolbar"><div><h3>统一计量单位与换算</h3><p>单位按计量维度管理，项目专属规则优先于全局规则。</p></div><div className="row-actions"><Button variant="secondary" onClick={() => onDialog(<UnitDialog onClose={() => onDialog(undefined)} onSave={saveUnit()} />)}>新增单位</Button><Button onClick={() => onDialog(<ConversionDialog units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion()} />)}>新增换算</Button></div></div>
    {loading ? <LoadingState label="正在加载计量体系…" /> : <div className="unit-workspace"><div><h4>单位定义</h4><DataTable headers={['单位', '维度', '精度', '状态', '操作']} rows={units.map((v) => [<b>{v.name}<code>{v.code} · {v.symbol}</code></b>, dimensions.find((d) => d.value === v.dimension)?.label, v.decimalScale, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<UnitDialog value={v} onClose={() => onDialog(undefined)} onSave={saveUnit(v)} />)}>编辑</Button>])} /></div>
      <div><h4>换算规则</h4><DataTable headers={['范围', '换算', '有效期', '状态', '操作']} rows={conversions.map((v) => [v.catalogItemId ? catalogName(v.catalogItemId) : '全局', `1 ${v.fromUnitCode} = ${v.factor} ${v.toUnitCode}${v.offset ? ` + ${v.offset}` : ''}`, `${v.validFrom} 至 ${v.validTo || '长期'}`, <State value={v.status} />, <Button size="sm" variant="text" onClick={() => onDialog(<ConversionDialog value={v} units={units} catalogItems={catalogItems} onClose={() => onDialog(undefined)} onSave={saveConversion(v)} />)}>编辑</Button>])} /></div></div>}
    <div className="unit-converter"><strong>换算试算</strong><Select value={catalogItemId} onChange={setCatalogItemId} placeholder="全局规则（可选项目）" options={catalogOptions} showValue /><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Select value={from} onChange={setFrom} placeholder="来源单位" options={opts} /><span>→</span><Select value={to} onChange={setTo} placeholder="目标单位" options={opts} /><Button variant="secondary" disabled={!from || !to} onClick={run}>试算</Button>{result && <output>{result}</output>}</div>
  </section>
}

function UnitDialog({ value, onClose, onSave }: { value?: UnitDefinition; onClose: () => void; onSave: (v: Omit<UnitDefinition, 'id' | 'revision'>) => void }) {
  const [form, setForm] = useState({ code: value?.code ?? '', name: value?.name ?? '', symbol: value?.symbol ?? '', dimension: value?.dimension ?? 'COUNT', decimalScale: String(value?.decimalScale ?? 0), status: value?.status ?? 'ACTIVE' })
  return <FormDialog title={value ? '编辑计量单位' : '新增计量单位'} description="单位编码作为跨业务交换键，创建后不可修改。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ code: form.code, name: form.name, symbol: form.symbol || undefined, dimension: form.dimension as UnitDefinition['dimension'], decimalScale: Number(form.decimalScale), status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="单位编码" required><input value={form.code} disabled={Boolean(value)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField><FormField label="单位名称" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField><FormField label="显示符号"><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} /></FormField><FormField label="计量维度"><Select value={form.dimension} onChange={(v) => setForm({ ...form, dimension: v as UnitDefinition['dimension'] })} options={dimensions} /></FormField><FormField label="小数精度"><input type="number" min="0" max="12" value={form.decimalScale} onChange={(e) => setForm({ ...form, decimalScale: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField></FormDialog>
}
function ConversionDialog({ value, units, catalogItems, onClose, onSave }: { value?: UnitConversion; units: UnitDefinition[]; catalogItems: Array<ServiceCatalogItem | SupplyItem>; onClose: () => void; onSave: (v: UnitConversionInput) => void }) {
  const [form, setForm] = useState({ catalogItemId: value?.catalogItemId ?? '', fromUnitCode: value?.fromUnitCode ?? '', toUnitCode: value?.toUnitCode ?? '', factor: String(value?.factor ?? ''), offset: String(value?.offset ?? 0), validFrom: value?.validFrom ?? today(), validTo: value?.validTo ?? '', status: value?.status ?? 'ACTIVE' }); const opts = units.filter((v) => v.status === 'ACTIVE' || v.code === value?.fromUnitCode || v.code === value?.toUnitCode).map(unitOption)
  const catalogOptions = catalogItems.map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  return <FormDialog title={value ? '编辑单位换算' : '新增单位换算'} description="全局规则适用于通用物理换算；包装规格等应使用项目专属换算。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onSave({ catalogItemId: form.catalogItemId || undefined, fromUnitCode: form.fromUnitCode, toUnitCode: form.toUnitCode, factor: Number(form.factor), offset: Number(form.offset), validFrom: form.validFrom, validTo: form.validTo || undefined, status: form.status as 'ACTIVE' | 'INACTIVE' }) }}><FormField label="规则范围"><Select disabled={Boolean(value)} value={form.catalogItemId} onChange={(v) => setForm({ ...form, catalogItemId: v })} placeholder="全局通用" showValue options={catalogOptions} /></FormField><FormField label="来源单位" required><Select disabled={Boolean(value)} value={form.fromUnitCode} onChange={(v) => setForm({ ...form, fromUnitCode: v })} showValue options={opts} /></FormField><FormField label="目标单位" required><Select disabled={Boolean(value)} value={form.toUnitCode} onChange={(v) => setForm({ ...form, toUnitCode: v })} showValue options={opts} /></FormField><FormField label="乘数" required><input type="number" min="0.000000001" step="any" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} /></FormField><FormField label="偏移量"><input type="number" step="any" value={form.offset} onChange={(e) => setForm({ ...form, offset: e.target.value })} /></FormField><FormField label="状态"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })} options={activeStatus} /></FormField><FormField label="生效日期"><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></FormField><FormField label="失效日期"><input type="date" min={form.validFrom} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></FormField></FormDialog>
}

const unitOption = (v: UnitDefinition) => ({ value: v.code, label: v.name, secondaryText: `${v.code}${v.symbol ? ` · ${v.symbol}` : ''}` })
