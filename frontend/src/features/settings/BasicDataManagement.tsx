import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Organization } from '../../shared/model'
import {
  errorMessage, type CatalogPrice, type DiseaseConcept, type DiseaseInput,
  type Department, type DictionaryValue, type Manufacturer, type MasterDataStatus,
  type MedicationInput, type MedicationKnowledge, type MedicationProduct, type PackageInput,
  type ProductInput, type RhnApi, type ServiceCatalogItem, type ServiceInput,
  type ItemAttributeJson, type ItemAttributeOverride, type ItemAttributeSchema,
  type ItemAttributeSubjectType, type ItemAttributeValue, type MasterDataImportBatch,
  type MasterDataImportRow, type MasterDataImportType, type ItemTermMapping,
  type StandardEquivalence, type StandardMappingType,
  type CatalogLifecycle, type CatalogChangeBatch, type LifecycleAdoptionInput, type LifecyclePriceInput,
  type OrganizationAdoption,
} from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel,
  Select, StatusBadge,
} from '../../shared/ui'
import { ItemAttributeConfigurationPanel } from './ItemAttributeConfigurationPanel'
import { ClinicalServiceConfigurationDialog, OperationalMasterDataPanel } from './OperationalMasterDataPanel'

type Tab = 'disease' | 'service' | 'medication' | 'operations' | 'attribute'
type DictionaryMap = Record<string, DictionaryValue[]>

const dictionaryCodes = [
  'BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE',
  'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_MANUFACTURER_TYPE', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE',
  'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL', 'BD_SERVICE_DUPLICATE_RULE',
  'BD_PRODUCT_MARKET_STATUS', 'BD_PRODUCTION_PLACE', 'BD_SHELF_LIFE_UNIT',
  'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD', 'BD_EXAM_TYPE',
  'BD_SERVICE_VARIANT_METHOD',
] as const

const today = () => new Date().toISOString().slice(0, 10)

export function BasicDataManagement({ api, organization, onNavigate }: {
  api: RhnApi; organization: Organization; onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('disease')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const dictionaries = useQuery({
    queryKey: ['master-data-dictionaries'],
    queryFn: async () => Object.fromEntries(await Promise.all(dictionaryCodes.map(async (code) =>
      [code, await api.dictionaries.resolve(code)] as const))) as DictionaryMap,
    staleTime: 5 * 60 * 1000,
  })
  const codeSystems = useQuery({
    queryKey: ['master-data-disease-code-systems'], queryFn: api.masterData.diseaseCodeSystems,
  })
  const diseases = useQuery({
    queryKey: ['master-data-diseases', query, typeFilter, statusFilter],
    queryFn: () => api.masterData.diseases(query, typeFilter, statusFilter), enabled: tab === 'disease',
  })
  const services = useQuery({
    queryKey: ['master-data-services', query, typeFilter, statusFilter, organization.id],
    queryFn: () => api.masterData.services(query, typeFilter, statusFilter, organization.id),
    enabled: tab === 'service',
  })
  const medications = useQuery({
    queryKey: ['master-data-medications', query, typeFilter, statusFilter, organization.id],
    queryFn: () => api.masterData.medications(query, typeFilter, statusFilter, organization.id),
    enabled: tab === 'medication',
  })
  const manufacturers = useQuery({
    queryKey: ['master-data-manufacturers'], queryFn: () => api.masterData.manufacturers(),
    enabled: tab === 'medication' || tab === 'operations',
  })

  useEffect(() => { setTypeFilter(''); setStatusFilter(''); setQuery('') }, [tab])

  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await queryClient.invalidateQueries({ queryKey: ['master-data'] })
  }
  const fail = (error: unknown) => setOperationError(errorMessage(error))
  const busy = diseases.isFetching || services.isFetching || medications.isFetching
  const currentError = diseases.error || services.error || medications.error || dictionaries.error || codeSystems.error
  const typeOptions = tab === 'disease' ? options(dictionaries.data, 'BD_CONCEPT_TYPE')
    : tab === 'service' ? options(dictionaries.data, 'BD_SERVICE_TYPE')
      : options(dictionaries.data, 'BD_MEDICATION_TYPE')
  const count = tab === 'disease' ? diseases.data?.length : tab === 'service' ? services.data?.length : medications.data?.length
  const lifecycleCandidates = useMemo(() => tab === 'service' ? (services.data ?? []).map((value) => ({
    id: value.id, code: value.code, name: value.name,
  })) : (medications.data ?? []).flatMap((value) => value.products.map((product) => ({
    id: product.id, code: product.code, name: `${value.name} · ${product.name}`,
  }))), [medications.data, services.data, tab])

  return <>
    <PageHeader eyebrow="平台管理 · 临床主数据" title="基础数据中心"
      description="统一维护疾病术语、诊疗项目与药品四层目录；机构采用、价格和包装不再复制中心主档。"
      actions={tab === 'attribute' || tab === 'operations' ? undefined : <>{tab !== 'disease' && <><Button variant="secondary" disabled={!dictionaries.data || !lifecycleCandidates.length}
        onClick={() => setDialog(<BatchLifecycleDialog api={api} organization={organization}
          candidates={lifecycleCandidates} dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
          onCompleted={() => invalidate('机构目录批量操作已完成')} />)}>批量机构目录 / 调价</Button>
        <Button variant="secondary" onClick={() => setDialog(
        <MasterDataImportDialog api={api} importType={tab === 'service' ? 'SERVICE' : 'MEDICATION'}
          onClose={() => setDialog(undefined)} onCompleted={() => invalidate(`${tabLabel(tab)}批量导入已完成`)} />
      )}>批量导入</Button></>}<Button disabled={!dictionaries.data || (tab === 'disease' && !codeSystems.data?.length)} onClick={() => {
        if (tab === 'disease') setDialog(<DiseaseDialog dictionaries={dictionaries.data!}
          codeSystems={codeSystems.data ?? []} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.createDisease(input).then(() => invalidate('疾病概念已创建')).catch(fail)} />)
        if (tab === 'service') setDialog(<ServiceDialog dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createService(input, organization.id)
            .then(() => invalidate('诊疗项目已创建')).catch(fail)} />)
        if (tab === 'medication') setDialog(<MedicationDialog dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createMedication(input, organization.id)
            .then(() => invalidate('通用药品知识已创建')).catch(fail)} />)
      }}><Icon name="add" />新增{tabLabel(tab)}</Button></>} />

    {feedback && <Alert tone="success" className="master-data-feedback">{feedback}</Alert>}
    {(operationError || currentError) && <Alert className="master-data-feedback">
      {operationError || errorMessage(currentError)}
    </Alert>}

    <Panel className="master-data-panel">
      <div className="master-data-tabs" role="tablist" aria-label="基础数据类型">
        <TabButton active={tab === 'disease'} onClick={() => setTab('disease')} label="疾病与术语" meta="版本化标准" />
        <TabButton active={tab === 'service'} onClick={() => setTab('service')} label="诊疗项目" meta="开立 · 执行 · 收费" />
        <TabButton active={tab === 'medication'} onClick={() => setTab('medication')} label="药品目录" meta="知识 · 产品 · 包装" />
        <TabButton active={tab === 'operations'} onClick={() => setTab('operations')} label="运营主数据" meta="组套 · 耗材 · 计量" />
        <TabButton active={tab === 'attribute'} onClick={() => setTab('attribute')} label="属性配置" meta="定义 · 装配 · 继承" />
      </div>
      {tab !== 'attribute' && tab !== 'operations' && <><div className="master-data-toolbar">
        <label className="master-data-search"><Icon name="search" /><span className="visually-hidden">搜索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'disease' ? '名称、别名、编码或检索码' : tab === 'service' ? '项目名称、编码或分类' : '通用名、别名、剂型或编码'} />
        </label>
        <Select value={typeFilter} onChange={setTypeFilter} showValue placeholder="全部类型" options={typeOptions} />
        <Select value={statusFilter} onChange={setStatusFilter} showValue placeholder="全部状态"
          options={options(dictionaries.data, 'BD_MASTER_STATUS')} />
        <span className="master-data-count">{busy ? '正在刷新…' : `${count ?? 0} 条`}</span>
        {tab === 'medication' && <Button variant="secondary"
          onClick={() => onNavigate('/settings/partners?tab=manufacturers')}>生产企业档案</Button>}
      </div>

      {tab === 'disease' && <DiseaseTable values={diseases.data} loading={diseases.isPending}
        onEdit={(value) => setDialog(<DiseaseDialog dictionaries={dictionaries.data!}
          codeSystems={codeSystems.data ?? []} value={value} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.updateDisease(value.id, value.revision, input)
            .then(() => invalidate('疾病概念已更新')).catch(fail)} />)}
        onStatus={(value) => api.masterData.diseaseStatus(value.id, value.revision,
          value.sdStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE').then(() => invalidate('疾病状态已更新')).catch(fail)} />}
      {tab === 'service' && <ServiceTable values={services.data} loading={services.isPending}
        onConfigure={(value) => setDialog(<ClinicalServiceConfigurationDialog api={api} service={value}
          organizationId={organization.id} dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} />)}
        onEdit={(value) => setDialog(<ServiceDialog dictionaries={dictionaries.data!} value={value}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.updateService(
            value.id, value.revision, input, organization.id).then(() => invalidate('诊疗项目已更新')).catch(fail)} />)}
        onAttributes={(value) => setDialog(<AttributeManagementDialog api={api} organization={organization}
          subjectType="CATALOG_ITEM" targetId={value.id} itemName={value.name}
          onClose={() => setDialog(undefined)} />)}
        onMappings={(value) => setDialog(<StandardMappingDialog api={api} subjectType="CATALOG_ITEM"
          targetId={value.id} itemName={value.name} systemType="SERVICE"
          onClose={() => setDialog(undefined)} />)}
        onLifecycle={(value) => setDialog(<CatalogLifecycleDialog api={api} catalogItemId={value.id}
          itemName={value.name} organization={organization} dictionaries={dictionaries.data!}
          defaults={{ orderable: value.orderable, executable: true, chargeable: value.chargeable,
            purchasable: false, stocked: false, dispensable: false, returnable: false }}
          onClose={() => setDialog(undefined)} onChanged={() => queryClient.invalidateQueries({ queryKey: ['master-data'] })} />)} />}
      {tab === 'medication' && <MedicationTable values={medications.data} loading={medications.isPending}
        onEdit={(value) => setDialog(<MedicationDialog dictionaries={dictionaries.data!} value={value}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.updateMedication(
            value.id, value.revision, input, organization.id).then(() => invalidate('药品知识已更新')).catch(fail)} />)}
        onAttributes={(value) => setDialog(<AttributeManagementDialog api={api} organization={organization}
          subjectType="MEDICATION" targetId={value.id} itemName={value.name}
          onClose={() => setDialog(undefined)} />)}
        onMappings={(value) => setDialog(<StandardMappingDialog api={api} subjectType="MEDICATION"
          targetId={value.id} itemName={value.name} systemType="MEDICATION"
          onClose={() => setDialog(undefined)} />)}
        onProduct={(value) => setDialog(<ProductDialog medication={value} manufacturers={manufacturers.data ?? []}
          dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.createProduct(input, organization.id)
            .then(() => invalidate('药品产品已创建')).catch(fail)} />)}
        onPackage={(product) => setDialog(<PackageDialog product={product} dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createPackage(product.id, input)
            .then(() => invalidate('产品包装已新增')).catch(fail)} />)}
        onLifecycle={(product) => setDialog(<CatalogLifecycleDialog api={api} catalogItemId={product.id}
          itemName={product.name} organization={organization} packages={product.packages}
          dictionaries={dictionaries.data!} defaults={{ orderable: product.orderable, executable: false,
            chargeable: product.chargeable, purchasable: true, stocked: product.stocked,
            dispensable: true, returnable: true }} onClose={() => setDialog(undefined)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['master-data'] })} />)} />}</>}
      {tab === 'attribute' && <ItemAttributeConfigurationPanel api={api} />}
      {tab === 'operations' && dictionaries.data && <OperationalMasterDataPanel api={api}
        organization={organization} manufacturers={manufacturers.data ?? []} />}
    </Panel>
    {dialog}
  </>
}

function DiseaseTable({ values, loading, onEdit, onStatus }: { values?: DiseaseConcept[]; loading: boolean;
  onEdit: (value: DiseaseConcept) => void; onStatus: (value: DiseaseConcept) => void }) {
  if (loading) return <LoadingState label="正在加载疾病术语…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到疾病概念" copy="请调整筛选条件或新增疾病概念。" />
  return <Table headers={['疾病概念', '标准编码', '类型 / 章节', '别名', '状态', '操作']}>
    {values.map((value) => <tr key={value.id}><td><strong>{value.display}</strong><small>{value.shortDisplay || value.definition || '—'}</small></td>
      <td><code>{value.code}</code><small>{value.systemName} · {value.systemVersion}</small></td>
      <td>{value.sdConceptTypeText}<small>{value.chapterName || '未分类'}</small></td>
      <td>{value.aliases.slice(0, 2).map((item) => item.name).join('、') || '—'}</td>
      <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
      <td><RowActions><Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑</Button>
        <Button size="sm" variant="text" onClick={() => onStatus(value)}>{value.sdStatus === 'ACTIVE' ? '暂停' : '启用'}</Button></RowActions></td></tr>)}
  </Table>
}

function ServiceTable({ values, loading, onConfigure, onEdit, onAttributes, onMappings, onLifecycle }: { values?: ServiceCatalogItem[]; loading: boolean;
  onConfigure: (value: ServiceCatalogItem) => void;
  onEdit: (value: ServiceCatalogItem) => void;
  onAttributes: (value: ServiceCatalogItem) => void; onMappings: (value: ServiceCatalogItem) => void;
  onLifecycle: (value: ServiceCatalogItem) => void }) {
  if (loading) return <LoadingState label="正在加载诊疗项目…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到诊疗项目" copy="请调整筛选条件或新增项目。" />
  return <Table headers={['项目', '临床语义', '中心能力', '机构目录', '当前价格', '操作']}>
    {values.map((value) => <tr key={value.id}><td><strong>{value.name}</strong><code>{value.code}</code></td>
      <td>{value.sdServiceTypeText}<small>{value.sdUsageTypeText}{value.serviceSubtype ? ` · ${value.serviceSubtype}` : ''}</small>
        <small>{[value.sdDuplicateRuleText, value.mutualRecognitionCode && `互认 ${value.mutualRecognitionCode}`]
          .filter(Boolean).join(' · ') || '未设置重复规则'}</small>
        {value.sdServiceType === 'LABORATORY' && <small>{value.laboratory
          ? `${value.laboratory.sdLaboratoryMethodText || '检验方法未设置'} · ${value.laboratory.specimens.length} 种标本`
          : '检验执行配置异常，请进入项目配置检查'}</small>}
        {value.sdServiceType === 'EXAMINATION' && <small>{value.examination
          ? `${value.examination.sdExaminationTypeText || '检查类型未设置'} · ${value.examination.variants.length} 个部位/方式`
          : '检查执行配置异常，请进入项目配置检查'}</small>}
      </td>
      <td><Flag value={value.orderable} label="可开立" /> <Flag value={value.chargeable} label="可收费" />
        <small>{value.singleOrder ? '允许单开' : '仅组合使用'}</small></td>
      <td>{value.organizationAdoption ? <><DataStatus value={value.organizationAdoption.sdStatus}
        text={value.organizationAdoption.sdStatusText} /><small>{value.organizationAdoption.localName || value.organizationAdoption.localCode || '沿用中心名称'}</small></> : <StatusBadge>未采用</StatusBadge>}</td>
      <td>{activePrice(value.prices)}</td>
      <td><RowActions>{['LABORATORY', 'EXAMINATION'].includes(value.sdServiceType)
        && <Button size="sm" variant="text" onClick={() => onConfigure(value)}>项目配置</Button>}
        <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑主档</Button>
        <Button size="sm" variant="text" onClick={() => onMappings(value)}>标准映射</Button>
        <Button size="sm" variant="text" onClick={() => onAttributes(value)}>类型扩展属性</Button>
        <Button size="sm" variant="text" onClick={() => onLifecycle(value)}>机构目录与价格</Button></RowActions></td></tr>)}
  </Table>
}

function MedicationTable({ values, loading, onEdit, onAttributes, onMappings, onProduct, onPackage, onLifecycle }: {
  values?: MedicationKnowledge[]; loading: boolean; onEdit: (value: MedicationKnowledge) => void;
  onAttributes: (value: MedicationKnowledge) => void;
  onMappings: (value: MedicationKnowledge) => void;
  onProduct: (value: MedicationKnowledge) => void; onPackage: (value: MedicationProduct) => void;
  onLifecycle: (value: MedicationProduct) => void }) {
  if (loading) return <LoadingState label="正在加载药品目录…" />
  if (!values?.length) return <EmptyState icon="pharmacy" title="未找到药品" copy="请调整筛选条件或新增通用药品知识。" />
  return <div className="medication-list">{values.map((value) => <article className="medication-card" key={value.id}>
    <header><div><strong>{value.name}</strong><code>{value.code}</code></div><div className="medication-card__meta">
      <StatusBadge>{value.sdMedicationTypeText}</StatusBadge><StatusBadge>{value.sdDoseFormText || '未维护剂型'}</StatusBadge>
      <DataStatus value={value.sdStatus} text={value.sdStatusText} /></div><RowActions>
        <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑知识</Button>
        <Button size="sm" variant="text" onClick={() => onMappings(value)}>标准映射</Button>
        <Button size="sm" variant="text" onClick={() => onAttributes(value)}>扩展属性</Button>
        <Button size="sm" variant="secondary" onClick={() => onProduct(value)}>新增厂家产品</Button></RowActions></header>
    <div className="medication-knowledge"><span>{value.sdMedicationType === 'HERBAL' ? '炮制规格 / 储藏'
      : value.sdMedicationType === 'VACCINE' ? '剂量规格 / 冷链' : '制剂规格 / 储藏'} <strong>{[
        value.preparationSpec, value.sdStorageTypeText].filter(Boolean).join(' · ') || '—'}</strong></span>
      <span>{value.sdMedicationType === 'HERBAL' ? '调剂单位' : value.sdMedicationType === 'VACCINE' ? '每剂含量' : '结构化含量'} <strong>{
        value.sdMedicationType === 'HERBAL' ? (value.preparationUnit || '—')
          : value.strengthValue ? `${value.strengthValue} ${value.strengthUnit || ''}` : '—'}</strong></span>
      <span>{value.sdMedicationType === 'VACCINE' ? '默认剂量 / 接种途径' : '默认剂量 / 用法'} <strong>{[
        value.defaultDose && `${value.defaultDose}${value.defaultDoseUnit || ''}`, value.defaultRoute,
        value.sdMedicationType === 'VACCINE' ? undefined : value.defaultFrequency,
      ].filter(Boolean).join(' · ') || '—'}</strong></span>
      <span>安全属性 <strong>{[value.prescriptionDrug && '处方药', value.essentialDrug && '基本药物',
        value.antimicrobial && (value.sdAntimicrobialLevelText || '抗菌药'), value.skinTestRequired && '需皮试',
        value.chronicDiseaseDrug && '慢病用药', !value.singleOrder && '仅组合使用'].filter(Boolean).join(' · ') || '普通'}</strong></span></div>
    {!value.products.length ? <EmptyState icon="pharmacy" title="暂无厂家产品" copy="通用药品知识已经建立，可继续新增批准产品。" />
      : <Table compact headers={['产品 / 厂家', '批准信息', '包装换算', '机构状态', '价格', '操作']}>
        {value.products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.manufacturerName}</small><code>{product.code}</code></td>
          <td>{product.approvalCode || '—'}<small>{[product.tradeName || '无商品名', product.sdMarketStatusText,
            product.sdProductionPlaceText].filter(Boolean).join(' · ')}</small></td>
          <td>{product.packages.length ? product.packages.map((item) => `${item.packageSpec || item.unitName} = ${item.quantityFactor}${product.unitCode || '最小单位'}`).join('；') : '未维护'}</td>
          <td>{product.organizationAdoption ? <DataStatus value={product.organizationAdoption.sdStatus} text={product.organizationAdoption.sdStatusText} /> : <StatusBadge>未采用</StatusBadge>}</td>
          <td>{activePrice(product.prices)}</td><td><RowActions>
            <Button size="sm" variant="text" onClick={() => onPackage(product)}>加包装</Button>
            <Button size="sm" variant="text" onClick={() => onLifecycle(product)}>机构目录与价格</Button>
          </RowActions></td></tr>)}</Table>}
  </article>)}</div>
}

function MasterDataImportDialog({ api, importType, onClose, onCompleted }: {
  api: RhnApi; importType: MasterDataImportType; onClose: () => void; onCompleted: () => Promise<void>
}) {
  const [file, setFile] = useState<File>()
  const [batch, setBatch] = useState<MasterDataImportBatch>()
  const [editingRow, setEditingRow] = useState<MasterDataImportRow>()
  const [busyAction, setBusyAction] = useState('')
  const [operationError, setOperationError] = useState('')
  const recent = useQuery({ queryKey: ['master-data-import-batches'], queryFn: api.masterData.importBatches })
  const execute = async (action: string, task: () => Promise<MasterDataImportBatch>) => {
    setBusyAction(action); setOperationError('')
    try { const value = await task(); setBatch(value); await recent.refetch(); return value }
    catch (error) { setOperationError(errorMessage(error)); return undefined }
    finally { setBusyAction('') }
  }
  const download = async (name: string, task: () => Promise<Blob>) => {
    setBusyAction(name); setOperationError('')
    try { downloadBlob(await task(), name) } catch (error) { setOperationError(errorMessage(error)) }
    finally { setBusyAction('') }
  }
  const label = importType === 'SERVICE' ? '诊疗项目' : '药品知识'
  const mutable = batch && !['COMPLETED', 'CANCELLED', 'IMPORTING'].includes(batch.status)
  return <Dialog title={`${label}批量导入`} eyebrow="基础数据 · 可恢复导入批次" size="xwide" onClose={onClose}
    description="先预检、再提交；错误行可在当前批次修正，已成功行不会因后续重试重复写入。">
    <div className="master-data-import-dialog">
      <section className="master-data-import-start">
        <div><strong>1. 下载标准模板</strong><small>支持 XLSX 与 UTF-8 CSV，单批最多 2,000 行、5 MB。</small></div>
        <div className="master-data-import-actions">
          <Button variant="text" busy={busyAction === `${label}导入模板.xlsx`} onClick={() => download(
            `${label}导入模板.xlsx`, () => api.masterData.downloadImportTemplate(importType, 'XLSX'))}>下载 XLSX 模板</Button>
          <Button variant="text" busy={busyAction === `${label}导入模板.csv`} onClick={() => download(
            `${label}导入模板.csv`, () => api.masterData.downloadImportTemplate(importType, 'CSV'))}>下载 CSV 模板</Button>
        </div>
        <div><strong>2. 选择文件并预检</strong><small>预检不会写入正式基础数据，可安全重复查看和修正。</small></div>
        <div className="master-data-import-file">
          <input type="file" accept=".xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0])} />
          <Button disabled={!file} busy={busyAction === 'preflight'} onClick={() => file && execute('preflight',
            () => api.masterData.preflightImport(importType, file))}>开始预检</Button>
        </div>
      </section>
      {operationError && <Alert>{operationError}</Alert>}
      {batch && <>
        <div className="master-data-import-summary">
          <div><span>批次状态</span><ImportStatus value={batch.status} /></div>
          <div><span>总行数</span><strong>{batch.totalRows}</strong></div>
          <div><span>可导入</span><strong>{batch.readyRows}</strong></div>
          <div><span>错误</span><strong className={batch.invalidRows || batch.failedRows ? 'is-error' : ''}>{batch.invalidRows + batch.failedRows}</strong></div>
          <div><span>已导入</span><strong>{batch.importedRows}</strong></div>
        </div>
        <div className="master-data-import-batch-meta"><span>{batch.fileName}</span><code>批次 {batch.id}</code>
          <span>更新时间 {new Date(batch.updatedAt).toLocaleString()}</span></div>
        <div className="master-data-import-table-wrap"><table className="master-data-import-table"><thead><tr>
          <th>行</th><th>编码 / 名称</th><th>预检结果</th><th>错误明细</th><th>目标记录</th><th>操作</th>
        </tr></thead><tbody>{batch.rows.map((row) => <tr key={`${row.id}-${row.revision}`}>
          <td>{row.rowNumber}</td><td><strong>{String(row.source['名称'] || row.normalized.name || '—')}</strong>
            <code>{row.sourceKey || '未识别编码'}</code></td><td><ImportStatus value={row.status} /></td>
          <td>{row.errors.length ? <ul>{row.errors.map((error, index) => <li key={`${error.code}-${index}`}>
            <code>{error.field}</code>{error.message}</li>)}</ul> : <span className="master-data-import-ok">校验通过</span>}</td>
          <td>{row.targetId ? <code>{row.targetId}</code> : '—'}</td><td>{mutable && row.status !== 'IMPORTED'
            ? <Button size="sm" variant="text" onClick={() => setEditingRow(row)}>修正</Button> : '—'}</td>
        </tr>)}</tbody></table></div>
        <div className="ui-form-actions master-data-import-footer">
          {(batch.invalidRows > 0 || batch.failedRows > 0) && <Button variant="text" onClick={() => download(
            `基础数据导入错误-${batch.id}.csv`, () => api.masterData.downloadImportErrors(batch.id))}>下载错误回执</Button>}
          {mutable && <Button variant="secondary" busy={busyAction === 'cancel'} onClick={() => execute('cancel',
            () => api.masterData.cancelImport(batch.id))}>取消批次</Button>}
          <Button disabled={!mutable || batch.invalidRows > 0 || batch.readyRows === 0} busy={busyAction === 'commit'}
            onClick={async () => { const value = await execute('commit', () => api.masterData.commitImport(batch.id));
              if (value?.status === 'COMPLETED') await onCompleted() }}>提交导入</Button>
        </div>
      </>}
      {!batch && recent.data?.length ? <section className="master-data-import-recent"><h3>最近导入批次</h3>
        <div>{recent.data.filter((item) => item.importType === importType).slice(0, 5).map((item) => <button key={item.id}
          type="button" onClick={() => execute('open', () => api.masterData.importBatch(item.id))}>
          <span><strong>{item.fileName}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
          <span><ImportStatus value={item.status} /><small>{item.importedRows}/{item.totalRows} 已导入</small></span>
        </button>)}</div></section> : null}
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
    {editingRow && batch && <ImportRowCorrectionDialog row={editingRow} onClose={() => setEditingRow(undefined)}
      onSave={async (values) => { const value = await execute('correct', () => api.masterData.correctImportRow(
        batch.id, editingRow, values)); if (value) setEditingRow(undefined) }} busy={busyAction === 'correct'} />}
  </Dialog>
}

function ImportRowCorrectionDialog({ row, onClose, onSave, busy }: { row: MasterDataImportRow; onClose: () => void;
  onSave: (values: Record<string, string>) => Promise<void>; busy: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(row.source).map(([key, value]) => [key, String(value ?? '')])))
  return <Dialog title={`修正第 ${row.rowNumber} 行`} eyebrow="导入预检 · 行级修正" size="wide" onClose={onClose}
    description="保存后会重新执行格式、字典、领域规则、租户存量及文件内重复校验。">
    <form onSubmit={(event) => { event.preventDefault(); void onSave(values) }}>
      <div className="master-data-import-correction">{Object.entries(values).map(([key, value]) => <FormField key={key} label={key}>
        <input value={value} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
      </FormField>)}</div>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
        <Button type="submit" busy={busy}>保存并重新预检</Button></div>
    </form>
  </Dialog>
}

function ImportStatus({ value }: { value: string }) {
  const labels: Record<string, string> = { PREFLIGHTING: '预检中', READY: '可提交', INVALID: '有错误',
    IMPORTING: '导入中', PARTIAL: '部分完成', COMPLETED: '已完成', CANCELLED: '已取消',
    IMPORTED: '已导入', FAILED: '失败' }
  const tone = ['READY', 'COMPLETED', 'IMPORTED'].includes(value) ? 'success'
    : ['INVALID', 'FAILED'].includes(value) ? 'danger' : 'neutral'
  return <StatusBadge tone={tone}>{labels[value] || value}</StatusBadge>
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function StandardMappingDialog({ api, subjectType, targetId, itemName, systemType, onClose }: {
  api: RhnApi; subjectType: ItemAttributeSubjectType; targetId: string; itemName: string
  systemType: 'SERVICE' | 'MEDICATION'; onClose: () => void
}) {
  const [businessDate, setBusinessDate] = useState(today())
  const [mappingType, setMappingType] = useState<StandardMappingType>('CLINICAL')
  const [equivalence, setEquivalence] = useState<StandardEquivalence>('EXACT')
  const [systemId, setSystemId] = useState('')
  const [termId, setTermId] = useState('')
  const [validFrom, setValidFrom] = useState(today())
  const [validTo, setValidTo] = useState('')
  const [limitation, setLimitation] = useState('')
  const [primaryMapping, setPrimaryMapping] = useState(true)
  const [replacement, setReplacement] = useState<ItemTermMapping>()
  const [pending, setPending] = useState('')
  const [operationError, setOperationError] = useState('')
  const maintenance = useQuery({
    queryKey: ['master-data-standard-mappings', subjectType, targetId, businessDate],
    queryFn: () => api.masterData.itemTermMappings(subjectType, targetId, businessDate),
  })
  const systems = useQuery({
    queryKey: ['master-data-standard-systems', systemType],
    queryFn: () => api.masterData.standardCodeSystems(systemType),
  })
  const eligibleSystems = useMemo(() => (systems.data ?? []).filter((value) => {
    if (mappingType === 'INSURANCE') return value.authorityType === 'INSURANCE'
    if (mappingType === 'REGULATORY') return ['NATIONAL', 'REGULATORY'].includes(value.authorityType)
    if (mappingType === 'LOCAL') return ['LOCAL', 'INTERNAL'].includes(value.authorityType)
    return true
  }), [mappingType, systems.data])
  useEffect(() => {
    if (!eligibleSystems.some((value) => value.id === systemId)) {
      setSystemId(eligibleSystems[0]?.id ?? '')
      setTermId('')
    }
  }, [eligibleSystems, systemId])
  const terms = useQuery({
    queryKey: ['master-data-standard-terms', systemId, validFrom],
    queryFn: () => api.masterData.standardTerms(systemId, validFrom),
    enabled: Boolean(systemId),
  })
  useEffect(() => { if (termId && !(terms.data ?? []).some((value) => value.id === termId)) setTermId('') }, [termId, terms.data])

  const refresh = async (message: string) => {
    setOperationError(''); setReplacement(undefined); setTermId(''); await maintenance.refetch()
    return message
  }
  const save = async () => {
    if (!termId || !validFrom) return
    setPending('save'); setOperationError('')
    try {
      await api.masterData.saveItemTermMapping(subjectType, targetId, {
        conceptId: termId, mappingType, equivalence, primaryMapping,
        limitation: limitation.trim() || undefined, validFrom, validTo: validTo || undefined,
        replacesMappingId: replacement?.id, expectedReplacesRevision: replacement?.revision,
      })
      setLimitation(''); setValidTo(''); await refresh('')
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPending('') }
  }
  const changeStatus = async (value: ItemTermMapping, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') => {
    setPending(value.id); setOperationError('')
    try {
      const end = status === 'RETIRED' ? (businessDate < value.validFrom ? value.validFrom : businessDate) : undefined
      await api.masterData.changeItemTermMappingStatus(value.id, value.revision, status, end)
      await refresh('')
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPending('') }
  }
  const startReplacement = (value: ItemTermMapping) => {
    setReplacement(value); setMappingType(value.mappingType); setEquivalence(value.equivalence)
    setPrimaryMapping(value.primaryMapping); setSystemId(value.codeSystemId); setTermId('')
    const next = new Date(`${value.validFrom}T00:00:00`); next.setDate(next.getDate() + 1)
    const nextDate = next.toISOString().slice(0, 10)
    setValidFrom(today() > nextDate ? today() : nextDate); setValidTo(''); setLimitation(value.limitation ?? '')
  }
  const values = maintenance.data
  return <Dialog title={`${itemName} · 标准映射`} eyebrow="基础数据 · 标准来源与有效期" size="xwide" onClose={onClose}
    description="维护国家、医保、监管及地方标准映射；业务模块按业务日期解析，历史映射不会被覆盖。">
    <div className="master-data-mapping-dialog">
      {(operationError || maintenance.error || systems.error || terms.error) && <Alert>
        {operationError || errorMessage(maintenance.error || systems.error || terms.error)}</Alert>}
      <section className="master-data-mapping-current">
        <header><div><h3>业务日期下的有效映射</h3><p>改变日期可回看当时应使用的标准编码。</p></div>
          <FormField label="业务日期"><input type="date" value={businessDate}
            onChange={(event) => setBusinessDate(event.target.value)} /></FormField></header>
        {maintenance.isPending ? <LoadingState label="正在解析标准映射…" />
          : !values?.effectiveMappings.length ? <EmptyState icon="clinical" title="当前日期暂无有效映射"
            copy="可在右侧维护区新增首条映射。" />
            : <div className="master-data-mapping-cards">{values.effectiveMappings.map((value) =>
              <MappingSummary key={value.id} value={value} />)}</div>}
      </section>

      <section className="master-data-mapping-editor">
        <header><h3>{replacement ? '建立替代映射' : '新增标准映射'}</h3><p>{replacement
          ? `将替代 ${replacement.systemName} · ${replacement.termCode}，原记录自动截止到新映射生效前一天。`
          : '先选用途与权威发布版，再选标准条目和有效期。'}</p></header>
        {replacement && <Alert tone="info">正在替代：{replacement.termDisplay}（{replacement.termCode}）
          <Button size="sm" variant="text" onClick={() => setReplacement(undefined)}>取消替代</Button></Alert>}
        <div className="master-data-mapping-form">
          <FormField label="映射用途" required><Select value={mappingType} disabled={Boolean(replacement)}
            onChange={(value) => setMappingType(value as StandardMappingType)} showValue options={[
              { value: 'CLINICAL', label: '临床标准' }, { value: 'INSURANCE', label: '医保目录' },
              { value: 'REGULATORY', label: '监管标准' }, { value: 'LOCAL', label: '地方 / 院内标准' },
            ]} /></FormField>
          <FormField label="标准发布版" required><Select value={systemId} onChange={(value) => { setSystemId(value); setTermId('') }}
            loading={systems.isPending} placeholder="选择权威标准及发布版" showValue options={eligibleSystems.map((value) => ({
              value: value.id, label: `${value.name} · ${value.version}`, secondaryText: value.code,
              searchKeywords: [value.publisher ?? '', value.authorityType],
            }))} /></FormField>
          <FormField label="标准条目" required><Select value={termId} onChange={setTermId} loading={terms.isFetching}
            disabled={!systemId} placeholder="按名称、编码或拼音检索" showValue options={(terms.data ?? []).map((value) => ({
              value: value.id, label: value.display, secondaryText: value.code,
              searchKeywords: [value.shortDisplay ?? '', value.conceptType ?? ''],
            }))} /></FormField>
          <FormField label="等价关系" required><Select value={equivalence}
            onChange={(value) => setEquivalence(value as StandardEquivalence)} showValue options={[
              { value: 'EXACT', label: '完全匹配' }, { value: 'EQUIVALENT', label: '语义等价' },
              { value: 'WIDER', label: '本地范围更宽' }, { value: 'NARROWER', label: '本地范围更窄' },
              { value: 'RELATED', label: '相关但不等价' },
            ]} /></FormField>
          <FormField label="生效日期" required><input type="date" value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)} required /></FormField>
          <FormField label="失效日期"><input type="date" value={validTo} min={validFrom}
            onChange={(event) => setValidTo(event.target.value)} /></FormField>
          <FormField label="限制使用范围" className="span-2"><input value={limitation}
            onChange={(event) => setLimitation(event.target.value)} placeholder="例如：仅限门诊检验收费，不用于住院结算" /></FormField>
          <Checkbox name="primaryMapping" label="设为该标准体系下的主要映射" checked={primaryMapping}
            onChange={setPrimaryMapping} />
        </div>
        <div className="master-data-mapping-editor-actions"><Button disabled={!termId || !validFrom}
          busy={pending === 'save'} onClick={() => void save()}>{replacement ? '保存替代映射' : '新增映射'}</Button></div>
      </section>

      <section className="master-data-mapping-history">
        <header><h3>映射历史</h3><p>包含当前、暂停、停用和已被替代的全部记录。</p></header>
        {!values?.history.length ? <EmptyState icon="clinical" title="暂无映射历史" copy="建立映射后将在此追溯。" />
          : <Table compact headers={['用途 / 标准来源', '标准条目', '关系 / 范围', '有效期', '状态', '操作']}>
            {values.history.map((value) => <tr key={`${value.id}-${value.revision}`}>
              <td><strong>{mappingTypeLabel(value.mappingType)}</strong><small>{value.systemName} · {value.systemVersion}</small>
                <code>{value.systemCode}</code></td><td><strong>{value.termDisplay}</strong><code>{value.termCode}</code></td>
              <td>{equivalenceLabel(value.equivalence)}{value.primaryMapping && <StatusBadge tone="success">主要</StatusBadge>}
                <small>{value.limitation || '无限制范围'}</small></td>
              <td>{value.validFrom}<small>至 {value.validTo || '长期'}</small></td>
              <td><StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
                {mappingStatusLabel(value.status)}</StatusBadge></td>
              <td><RowActions>{value.status === 'ACTIVE' && <>
                <Button size="sm" variant="text" onClick={() => startReplacement(value)}>替代</Button>
                <Button size="sm" variant="text" busy={pending === value.id}
                  onClick={() => void changeStatus(value, 'SUSPENDED')}>暂停</Button>
                <Button size="sm" variant="text" busy={pending === value.id}
                  onClick={() => void changeStatus(value, 'RETIRED')}>停用</Button></>}
                {value.status === 'SUSPENDED' && <Button size="sm" variant="text" busy={pending === value.id}
                  onClick={() => void changeStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td>
            </tr>)}</Table>}
      </section>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

type AdoptionDefaults = Pick<LifecycleAdoptionInput, 'orderable' | 'executable' | 'chargeable' | 'purchasable' |
  'stocked' | 'dispensable' | 'returnable'>

function CatalogLifecycleDialog({ api, catalogItemId, itemName, organization, packages = [], dictionaries,
  defaults, onClose, onChanged }: { api: RhnApi; catalogItemId: string; itemName: string; organization: Organization;
  packages?: Array<{ id: string; packageSpec?: string; unitName: string }>; dictionaries: DictionaryMap;
  defaults: AdoptionDefaults; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const [businessDate, setBusinessDate] = useState(today())
  const [editor, setEditor] = useState<'ADOPTION' | 'PRICE'>('ADOPTION')
  const [replacementAdoption, setReplacementAdoption] = useState<OrganizationAdoption>()
  const [replacementPrice, setReplacementPrice] = useState<CatalogPrice>()
  const [pending, setPending] = useState('')
  const [operationError, setOperationError] = useState('')
  const maintenance = useQuery({
    queryKey: ['catalog-lifecycle', catalogItemId, organization.id, businessDate],
    queryFn: () => api.masterData.catalogLifecycle(catalogItemId, organization.id, businessDate),
  })
  const refresh = async () => { await maintenance.refetch(); await onChanged() }
  const execute = async (key: string, task: () => Promise<CatalogLifecycle>) => {
    setPending(key); setOperationError('')
    try { await task(); setReplacementAdoption(undefined); setReplacementPrice(undefined); await refresh() }
    catch (error) { setOperationError(errorMessage(error)) } finally { setPending('') }
  }
  const nextDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10) > today() ? date.toISOString().slice(0, 10) : today()
  }
  const startAdoptionReplacement = (value: OrganizationAdoption) => {
    setEditor('ADOPTION'); setReplacementAdoption(value); setReplacementPrice(undefined)
  }
  const startPriceReplacement = (value: CatalogPrice) => {
    setEditor('PRICE'); setReplacementPrice(value); setReplacementAdoption(undefined)
  }
  const changeAdoptionStatus = (value: OrganizationAdoption, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') =>
    execute(`a-${value.id}`, () => api.masterData.changeLifecycleAdoptionStatus(value.id, value.revision,
      status, status === 'RETIRED' ? businessDate : undefined))
  const changePriceStatus = (value: CatalogPrice, status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED') =>
    execute(`p-${value.id}`, () => api.masterData.changeLifecyclePriceStatus(value.id, value.revision,
      status, status === 'RETIRED' ? businessDate : undefined))
  const values = maintenance.data
  const adoptionSeed = replacementAdoption ?? values?.currentAdoption
  const priceSeed = replacementPrice
  return <Dialog title={`${itemName} · 机构目录与价格`} eyebrow={`${organization.name} · 生命周期工作台`}
    size="xwide" onClose={onClose} description="按业务日期查看当前版本，通过替代版本调整机构能力与价格；旧记录保持可追溯。">
    <div className="master-data-lifecycle-dialog">
      {(operationError || maintenance.error) && <Alert>{operationError || errorMessage(maintenance.error)}</Alert>}
      <section className="master-data-lifecycle-current">
        <header><div><h3>业务日期快照</h3><p>当前采用关系与有效价格均按此日期解析。</p></div>
          <FormField label="业务日期"><input type="date" value={businessDate}
            onChange={(event) => setBusinessDate(event.target.value)} /></FormField></header>
        {maintenance.isPending ? <LoadingState label="正在解析机构目录与价格…" /> : <div className="master-data-lifecycle-snapshot">
          <article><span>机构目录</span>{values?.currentAdoption ? <><DataStatus
            value={values.currentAdoption.sdStatus} text={values.currentAdoption.sdStatusText} />
            <strong>{values.currentAdoption.localName || itemName}</strong>
            <code>{values.currentAdoption.localCode || '沿用中心编码'}</code>
            <small>{capabilityLabels(values.currentAdoption).join(' · ') || '未开放业务能力'}</small></>
            : <><StatusBadge>未采用</StatusBadge><strong>当前日期无有效版本</strong></>}</article>
          <article><span>有效价格</span>{values?.currentPrices.length ? values.currentPrices.map((value) =>
            <div key={value.id}><strong>¥ {Number(value.price).toFixed(2)}</strong>
              <small>{value.sdPriceTypeText} · {value.packageId ? '指定包装' : '默认单位'}</small></div>)
            : <strong>当前日期未维护价格</strong>}</article>
        </div>}
      </section>

      <section className="master-data-lifecycle-editor">
        <header><div><h3>{editor === 'ADOPTION' ? (replacementAdoption ? '建立机构目录替代版本' : '新增机构目录版本')
          : (replacementPrice ? '建立调价版本' : '新增价格版本')}</h3><p>新版本生效时自动将被替代版本截止到前一天。</p></div>
          <div className="master-data-lifecycle-switch"><button type="button" className={editor === 'ADOPTION' ? 'is-active' : ''}
            onClick={() => setEditor('ADOPTION')}>机构目录</button><button type="button" className={editor === 'PRICE' ? 'is-active' : ''}
              onClick={() => setEditor('PRICE')}>价格</button></div></header>
        {editor === 'ADOPTION' ? <form key={`adoption-${adoptionSeed?.id ?? 'new'}-${adoptionSeed?.revision ?? 0}`}
          className="master-data-lifecycle-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget)
            const input: LifecycleAdoptionInput = { organizationId: organization.id,
              defaultDepartmentId: adoptionSeed?.defaultDepartmentId, localCode: optionalText(form, 'localCode'),
              localName: optionalText(form, 'localName'), orderable: checked(form, 'orderable'),
              executable: checked(form, 'executable'), chargeable: checked(form, 'chargeable'),
              purchasable: checked(form, 'purchasable'), stocked: checked(form, 'stocked'),
              dispensable: checked(form, 'dispensable'), returnable: checked(form, 'returnable'), status: 'ACTIVE',
              validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo') }
            void execute('save-adoption', () => replacementAdoption
              ? api.masterData.replaceLifecycleAdoption(replacementAdoption.id, replacementAdoption.revision, input)
              : api.masterData.createLifecycleAdoption(catalogItemId, input)) }}>
          {replacementAdoption && <Alert tone="info">替代 {replacementAdoption.localName || itemName} · {replacementAdoption.validFrom}
            <Button size="sm" variant="text" onClick={() => setReplacementAdoption(undefined)}>取消</Button></Alert>}
          <FormField label="机构本地编码"><input name="localCode" defaultValue={adoptionSeed?.localCode} /></FormField>
          <FormField label="机构显示名称"><input name="localName" defaultValue={adoptionSeed?.localName} /></FormField>
          <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
            fromDefault={replacementAdoption ? nextDate(replacementAdoption.validFrom) : today()} />
          <Checkboxes title="机构可用能力">
            {(['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
              .map((key) => <Checkbox key={key} name={key} label={capabilityLabel(key)}
                defaultChecked={adoptionSeed?.[key] ?? defaults[key]} />)}
          </Checkboxes><div className="master-data-lifecycle-editor-actions"><Button type="submit"
            busy={pending === 'save-adoption'}>{replacementAdoption ? '保存替代版本' : '新增机构目录'}</Button></div>
        </form> : <form key={`price-${priceSeed?.id ?? 'new'}-${priceSeed?.revision ?? 0}`}
          className="master-data-lifecycle-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget)
            const input: LifecyclePriceInput = { organizationId: organization.id,
              packageId: optionalText(form, 'packageId'), priceType: text(form, 'priceType'),
              price: Number(text(form, 'price')), currencyCode: text(form, 'currencyCode'),
              priceDocumentCode: optionalText(form, 'priceDocumentCode'), priceReason: optionalText(form, 'priceReason'),
              validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'), status: 'ACTIVE' }
            void execute('save-price', () => replacementPrice
              ? api.masterData.replaceLifecyclePrice(replacementPrice.id, replacementPrice.revision, input)
              : api.masterData.createLifecyclePrice(catalogItemId, input)) }}>
          {replacementPrice && <Alert tone="info">调价：¥ {Number(replacementPrice.price).toFixed(2)} · {replacementPrice.sdPriceTypeText}
            <Button size="sm" variant="text" onClick={() => setReplacementPrice(undefined)}>取消</Button></Alert>}
          {packages.length > 0 && <StaticSelectField name="packageId" label="计价包装" required={false}
            defaultValue={priceSeed?.packageId} placeholder="默认单位" options={packages.map((item) => ({
              value: item.id, label: item.packageSpec || item.unitName,
            }))} />}
          <SelectField name="priceType" label="价格类型" values={dictionaries.BD_PRICE_TYPE}
            defaultValue={priceSeed?.sdPriceType ?? 'SALE'} />
          <FormField label="金额" required><input name="price" type="number" min="0" step="0.000001"
            defaultValue={priceSeed?.price} required /></FormField>
          <FormField label="币种" required><input name="currencyCode" defaultValue={priceSeed?.currencyCode ?? 'CNY'} required /></FormField>
          <FormField label="价格文件号"><input name="priceDocumentCode" defaultValue={priceSeed?.priceDocumentCode} /></FormField>
          <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
            fromDefault={replacementPrice ? nextDate(replacementPrice.validFrom) : today()} />
          <FormField label="调价依据" className="span-2"><textarea name="priceReason"
            defaultValue={priceSeed?.priceReason} rows={2} /></FormField>
          <div className="master-data-lifecycle-editor-actions"><Button type="submit" busy={pending === 'save-price'}>
            {replacementPrice ? '保存调价版本' : '新增价格'}</Button></div>
        </form>}
      </section>

      <section className="master-data-lifecycle-history">
        <header><h3>机构目录历史</h3><p>包含启用、暂停、停用及被替代版本。</p></header>
        {!values?.adoptionHistory.length ? <EmptyState icon="clinical" title="暂无机构目录历史" copy="可在右上维护首个版本。" />
          : <Table compact headers={['本地目录', '业务能力', '有效期', '状态', '操作']}>{values.adoptionHistory.map((value) =>
            <tr key={`${value.id}-${value.revision}`}><td><strong>{value.localName || itemName}</strong><code>{value.localCode || '沿用中心编码'}</code></td>
              <td>{capabilityLabels(value).join(' · ') || '未开放'}</td><td>{value.validFrom}<small>至 {value.validTo || '长期'}</small></td>
              <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td><td><RowActions>
                {value.sdStatus === 'ACTIVE' && <><Button size="sm" variant="text" onClick={() => startAdoptionReplacement(value)}>替代</Button>
                  <Button size="sm" variant="text" busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'SUSPENDED')}>暂停</Button>
                  <Button size="sm" variant="text" busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'RETIRED')}>停用</Button></>}
                {value.sdStatus === 'SUSPENDED' && <Button size="sm" variant="text" busy={pending === `a-${value.id}`}
                  onClick={() => void changeAdoptionStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td></tr>)}</Table>}
      </section>
      <section className="master-data-lifecycle-history">
        <header><h3>价格历史</h3><p>机构价与默认单位价格均保留完整调价链。</p></header>
        {!values?.priceHistory.length ? <EmptyState icon="clinical" title="暂无价格历史" copy="可在右上新增价格。" />
          : <Table compact headers={['价格 / 类型', '计价范围', '依据', '有效期', '状态', '操作']}>{values.priceHistory.map((value) =>
            <tr key={`${value.id}-${value.revision}`}><td><strong>¥ {Number(value.price).toFixed(2)}</strong><small>{value.sdPriceTypeText}</small></td>
              <td>{value.packageId ? '指定包装' : '默认单位'}</td><td>{value.priceDocumentCode || '—'}<small>{value.priceReason || '未说明'}</small></td>
              <td>{value.validFrom}<small>至 {value.validTo || '长期'}</small></td><td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
              <td><RowActions>{value.sdStatus === 'ACTIVE' && <><Button size="sm" variant="text" onClick={() => startPriceReplacement(value)}>调价</Button>
                <Button size="sm" variant="text" busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'SUSPENDED')}>暂停</Button>
                <Button size="sm" variant="text" busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'RETIRED')}>停用</Button></>}
                {value.sdStatus === 'SUSPENDED' && <Button size="sm" variant="text" busy={pending === `p-${value.id}`}
                  onClick={() => void changePriceStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td></tr>)}</Table>}
      </section>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

function BatchLifecycleDialog({ api, organization, candidates, dictionaries, onClose, onCompleted }: {
  api: RhnApi; organization: Organization; candidates: Array<{ id: string; code: string; name: string }>;
  dictionaries: DictionaryMap; onClose: () => void; onCompleted: () => Promise<void>
}) {
  const [mode, setMode] = useState<'ADOPTION' | 'PRICE'>('ADOPTION')
  const [operation, setOperation] = useState<'ADOPT' | 'RETIRE'>('ADOPT')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<CatalogChangeBatch>()
  const [pending, setPending] = useState(false)
  const [operationError, setOperationError] = useState('')
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id); return next })
  const submit = async (form: FormData) => {
    if (!selected.size) { setOperationError('请至少选择一个目录项目'); return }
    setPending(true); setOperationError('')
    try {
      const businessDate = text(form, 'businessDate'); const ids = [...selected]
      const value = mode === 'ADOPTION' ? await api.masterData.adoptionBatch({ requestCode: crypto.randomUUID(),
        operationType: operation, organizationId: organization.id, businessDate, catalogItemIds: ids,
        template: operation === 'ADOPT' ? { localCode: undefined, localName: undefined,
          orderable: checked(form, 'orderable'), executable: checked(form, 'executable'),
          chargeable: checked(form, 'chargeable'), purchasable: checked(form, 'purchasable'),
          stocked: checked(form, 'stocked'), dispensable: checked(form, 'dispensable'),
          returnable: checked(form, 'returnable'), status: 'ACTIVE', validTo: optionalText(form, 'validTo') } : undefined,
      }) : await api.masterData.priceBatch({ requestCode: crypto.randomUUID(), organizationId: organization.id,
        businessDate, entries: ids.map((catalogItemId) => ({ catalogItemId,
          priceType: text(form, 'priceType'), price: Number(text(form, 'price')),
          currencyCode: text(form, 'currencyCode'), priceDocumentCode: optionalText(form, 'priceDocumentCode'),
          priceReason: optionalText(form, 'priceReason'), validTo: optionalText(form, 'validTo'), status: 'ACTIVE' })) })
      setBatch(value); await onCompleted()
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPending(false) }
  }
  return <Dialog title="机构目录与价格批量工作台" eyebrow={organization.name} size="xwide" onClose={onClose}
    description="一次选择多个目录项目，统一采用、停用或按默认单位调价；逐条结果写入批次审计。">
    <form className="master-data-batch-lifecycle" onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)) }}>
      {operationError && <Alert>{operationError}</Alert>}
      <section className="master-data-batch-picker"><header><div><h3>选择目录项目</h3><p>已选择 {selected.size} / {candidates.length} 项</p></div>
        <Button size="sm" variant="text" onClick={() => setSelected(selected.size === candidates.length
          ? new Set() : new Set(candidates.map((value) => value.id)))}>{selected.size === candidates.length ? '清空' : '全选'}</Button></header>
        <div>{candidates.map((value) => <label key={value.id}><input type="checkbox" checked={selected.has(value.id)}
          onChange={() => toggle(value.id)} /><span><strong>{value.name}</strong><code>{value.code}</code></span></label>)}</div></section>
      <section className="master-data-batch-config"><header><h3>批量配置</h3><div className="master-data-lifecycle-switch">
        <button type="button" className={mode === 'ADOPTION' ? 'is-active' : ''} onClick={() => setMode('ADOPTION')}>机构目录</button>
        <button type="button" className={mode === 'PRICE' ? 'is-active' : ''} onClick={() => setMode('PRICE')}>批量调价</button></div></header>
        <div className="master-data-lifecycle-form"><FormField label="业务生效日期" required><input name="businessDate" type="date" defaultValue={today()} required /></FormField>
          <FormField label="统一失效日期"><input name="validTo" type="date" /></FormField>
          {mode === 'ADOPTION' ? <><FormField label="操作类型" required><Select value={operation} onChange={(value) => setOperation(value as 'ADOPT' | 'RETIRE')}
            options={[{ value: 'ADOPT', label: '采用 / 建立新版本' }, { value: 'RETIRE', label: '批量停用' }]} /></FormField>
            {operation === 'ADOPT' && <Checkboxes title="统一机构能力">
              <Checkbox name="orderable" label="允许开立" defaultChecked /><Checkbox name="executable" label="允许执行" defaultChecked />
              <Checkbox name="chargeable" label="允许收费" defaultChecked /><Checkbox name="purchasable" label="允许采购" />
              <Checkbox name="stocked" label="允许入库" /><Checkbox name="dispensable" label="允许发放" />
              <Checkbox name="returnable" label="允许退药/退库" />
            </Checkboxes>}</> : <><SelectField name="priceType" label="价格类型" values={dictionaries.BD_PRICE_TYPE} defaultValue="SALE" />
            <FormField label="统一金额" required><input name="price" type="number" min="0" step="0.000001" required /></FormField>
            <FormField label="币种" required><input name="currencyCode" defaultValue="CNY" required /></FormField>
            <FormField label="价格文件号"><input name="priceDocumentCode" /></FormField>
            <FormField label="调价依据" className="span-2"><textarea name="priceReason" rows={2} /></FormField></>}
        </div><div className="master-data-lifecycle-editor-actions"><Button type="submit" disabled={!selected.size} busy={pending}>执行批量操作</Button></div>
      </section>
      {batch && <section className="master-data-batch-result"><header><h3>批次结果</h3><p>批次 {batch.id} · {batch.status}</p></header>
        <div className="master-data-import-summary"><div><span>总数</span><strong>{batch.totalRows}</strong></div>
          <div><span>成功</span><strong>{batch.succeededRows}</strong></div><div><span>失败</span><strong className="is-error">{batch.failedRows}</strong></div></div>
        <Table compact headers={['序号', '目录项目', '结果', '目标版本 / 错误']}>{batch.rows.map((row) => <tr key={row.id}>
          <td>{row.rowNumber}</td><td><code>{row.catalogItemId}</code></td><td><StatusBadge tone={row.status === 'SUCCEEDED' ? 'success' : 'danger'}>
            {row.status === 'SUCCEEDED' ? '成功' : '失败'}</StatusBadge></td><td>{row.targetId || row.errorMessage || '—'}</td></tr>)}</Table></section>}
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </form>
  </Dialog>
}

function capabilityLabel(value: keyof AdoptionDefaults) {
  return ({ orderable: '允许开立', executable: '允许执行', chargeable: '允许收费', purchasable: '允许采购',
    stocked: '允许入库', dispensable: '允许发放', returnable: '允许退药/退库' } as const)[value]
}
function capabilityLabels(value: OrganizationAdoption) {
  return (['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
    .filter((key) => value[key]).map(capabilityLabel)
}

function MappingSummary({ value }: { value: ItemTermMapping }) {
  return <article><header><StatusBadge>{mappingTypeLabel(value.mappingType)}</StatusBadge>
    {value.primaryMapping && <StatusBadge tone="success">主要映射</StatusBadge>}</header>
    <strong>{value.termDisplay}</strong><code>{value.termCode}</code>
    <small>{value.systemName} · {value.systemVersion}</small>
    <footer><span>{equivalenceLabel(value.equivalence)}</span><span>{value.validFrom} — {value.validTo || '长期'}</span></footer></article>
}

function mappingTypeLabel(value: StandardMappingType) {
  return ({ CLINICAL: '临床标准', INSURANCE: '医保目录', REGULATORY: '监管标准', LOCAL: '地方 / 院内' } as const)[value]
}
function equivalenceLabel(value: StandardEquivalence) {
  return ({ EXACT: '完全匹配', EQUIVALENT: '语义等价', WIDER: '本地范围更宽',
    NARROWER: '本地范围更窄', RELATED: '相关但不等价' } as const)[value]
}
function mappingStatusLabel(value: ItemTermMapping['status']) {
  return ({ ACTIVE: '有效', SUSPENDED: '已暂停', RETIRED: '已停用', SUPERSEDED: '已替代' } as const)[value]
}

function AttributeManagementDialog({ api, organization, subjectType, targetId, itemName, onClose }: {
  api: RhnApi; organization: Organization; subjectType: ItemAttributeSubjectType
  targetId: string; itemName: string; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('基础数据扩展属性维护')
  const [pendingKey, setPendingKey] = useState('')
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [scopeType, setScopeType] = useState<'ORGANIZATION' | 'DEPARTMENT'>('ORGANIZATION')
  const [departmentId, setDepartmentId] = useState('')
  const queryKey = ['master-data-item-attributes', subjectType, targetId, today()]
  const maintenance = useQuery({
    queryKey,
    queryFn: () => api.masterData.itemAttributeMaintenance(subjectType, targetId, today()),
  })
  const departments = useQuery({
    queryKey: ['master-data-attribute-departments', organization.id],
    queryFn: () => api.organization.departments(organization.id),
  })
  useEffect(() => {
    if (scopeType === 'DEPARTMENT' && !departmentId) setDepartmentId(departments.data?.[0]?.id ?? '')
  }, [departmentId, departments.data, scopeType])
  const refresh = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey })
    setFeedback(message); setOperationError('')
  }
  const execute = async (key: string, action: () => Promise<unknown>, message: string) => {
    if (!reason.trim()) { setOperationError('请填写变更原因'); return }
    setPendingKey(key); setOperationError(''); setFeedback('')
    try { await action(); await refresh(message) } catch (error) { setOperationError(errorMessage(error)) }
    finally { setPendingKey('') }
  }

  const values = maintenance.data
  const selectedDepartment = departments.data?.find((value) => value.id === departmentId)
  const scopeName = scopeType === 'ORGANIZATION' ? organization.shortName || organization.name
    : selectedDepartment?.name || '所选科室'
  return <Dialog title={`${itemName} · 扩展属性`} eyebrow="基础数据扩展能力" size="xwide" onClose={onClose}
    description={`横向维护租户公共值与“${scopeName}”覆盖值；未维护覆盖时自动继承上一级。`}>
    <div className="master-data-attribute-dialog">
      <div className="master-data-attribute-toolbar">
        <FormField label="本次变更原因" required hint="保存到属性变更日志，便于审计和回溯">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000}
            placeholder="说明本次配置的业务依据" />
        </FormField>
        <div className="master-data-attribute-scope">
          <Select value={scopeType} onChange={(value) => setScopeType(value as 'ORGANIZATION' | 'DEPARTMENT')}
            options={[{ value: 'ORGANIZATION', label: '当前机构' }, { value: 'DEPARTMENT', label: '指定科室' }]} />
          {scopeType === 'DEPARTMENT' && <Select value={departmentId} onChange={setDepartmentId}
            placeholder="选择科室" showValue options={(departments.data ?? []).map((value: Department) => ({
              value: value.id, label: value.name, secondaryText: value.code,
            }))} />}
        </div>
        <div className="master-data-attribute-legend">
          <StatusBadge>租户公共值</StatusBadge><span>可被机构或科室覆盖</span>
          <StatusBadge tone="success">{scopeType === 'ORGANIZATION' ? '当前机构' : '当前科室'}</StatusBadge><span>
            {scopeType === 'ORGANIZATION' ? organization.code : selectedDepartment?.code || '请选择'}</span>
        </div>
      </div>
      {feedback && <Alert tone="success">{feedback}</Alert>}
      {(operationError || maintenance.error) && <Alert>{operationError || errorMessage(maintenance.error)}</Alert>}
      {maintenance.isPending && <LoadingState label="正在加载扩展属性 Schema 与当前值…" />}
      {values && !values.schema.attributes.length && <EmptyState icon="settings" title="当前类型未装配扩展属性"
        copy="可先在项目类型属性配置中完成装配；稳定核心字段仍在基础信息区域维护。" />}
      {values && values.schema.attributes.length > 0 && <div className="master-data-attribute-table-wrap">
        <table className="master-data-attribute-table"><thead><tr>
          <th>属性定义</th><th>租户公共值</th><th>{scopeName}覆盖值</th>
        </tr></thead><tbody>{values.schema.attributes.map((attribute) => {
          const baseValue = values.baseValues.find((item) => item.definitionId === attribute.definitionId)
          const overrideValue = values.overrides.find((item) => item.definitionId === attribute.definitionId
            && item.scopeType === scopeType && item.organizationId === organization.id
            && (scopeType === 'ORGANIZATION' || item.departmentId === departmentId))
          return <AttributeEditorRow key={`${attribute.definitionId}-${baseValue?.revision ?? 'new'}-${overrideValue?.revision ?? 'new'}`}
            attribute={attribute} baseValue={baseValue} overrideValue={overrideValue}
            organization={organization} scopeType={scopeType} departmentId={departmentId || undefined}
            reason={reason} pendingKey={pendingKey} execute={execute}
            subjectType={subjectType} targetId={targetId} api={api} />
        })}</tbody></table>
      </div>}
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

function AttributeEditorRow({ api, organization, scopeType, departmentId, subjectType, targetId, attribute, baseValue, overrideValue,
  reason, pendingKey, execute }: {
  api: RhnApi; organization: Organization; subjectType: ItemAttributeSubjectType; targetId: string
  scopeType: 'ORGANIZATION' | 'DEPARTMENT'; departmentId?: string
  attribute: ItemAttributeSchema; baseValue?: ItemAttributeValue; overrideValue?: ItemAttributeOverride
  reason: string; pendingKey: string
  execute: (key: string, action: () => Promise<unknown>, message: string) => Promise<void>
}) {
  const [baseRaw, setBaseRaw] = useState(attributeRaw(baseValue?.value ?? attribute.defaultValue, attribute))
  const [overrideRaw, setOverrideRaw] = useState(attributeRaw(overrideValue?.value, attribute))
  const [overrideMode, setOverrideMode] = useState<'OVERRIDE' | 'EXPLICIT_NULL'>(overrideValue?.valueMode ?? 'OVERRIDE')
  const baseKey = `base-${attribute.definitionId}`
  const overrideKey = `override-${attribute.definitionId}`
  const projected = attribute.storageMode === 'PROJECTED'
  const baseAllowed = !projected && attribute.variability !== 'LOCAL_ONLY'
  const overrideAllowed = !projected && attribute.variability !== 'BASE_ONLY'
    && attribute.allowedScopes.includes(scopeType)
    && (attribute.variability === 'LOCAL_ONLY' || attribute.overridePolicy === 'ANY')
    && (scopeType !== 'DEPARTMENT' || Boolean(departmentId))
  const explicitNullAllowed = !attribute.required && attributeSchemaAllowsNull(attribute)

  const saveBase = () => execute(baseKey, () => api.masterData.saveItemAttributeValue({
    subjectType, targetId, definitionId: attribute.definitionId, valueId: baseValue?.id,
    expectedRevision: baseValue?.revision, value: parseAttributeRaw(baseRaw, attribute),
    validFrom: baseValue?.validFrom ?? today(), validTo: baseValue?.validTo,
    reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的租户公共值已保存`)
  const saveOverride = () => execute(overrideKey, () => api.masterData.saveItemAttributeOverride({
    subjectType, targetId, definitionId: attribute.definitionId, overrideId: overrideValue?.id,
    expectedRevision: overrideValue?.revision, scopeType, organizationId: organization.id,
    departmentId: scopeType === 'DEPARTMENT' ? departmentId : undefined,
    valueMode: overrideMode, value: overrideMode === 'EXPLICIT_NULL' ? undefined : parseAttributeRaw(overrideRaw, attribute),
    validFrom: overrideValue?.validFrom ?? today(), validTo: overrideValue?.validTo,
    reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的机构覆盖值已保存`)
  const disableBase = () => baseValue && execute(baseKey, () => api.masterData.disableItemAttributeValue({
    subjectType, targetId, definitionId: attribute.definitionId, recordId: baseValue.id,
    expectedRevision: baseValue.revision, reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}的租户公共值已停用`)
  const disableOverride = () => overrideValue && execute(overrideKey, () => api.masterData.disableItemAttributeOverride({
    subjectType, targetId, definitionId: attribute.definitionId, recordId: overrideValue.id,
    expectedRevision: overrideValue.revision, reason: reason.trim(), requestCode: crypto.randomUUID(),
  }), `${attribute.name}已恢复继承租户公共值`)

  return <tr><td className="master-data-attribute-definition"><strong>{attribute.name}{attribute.required && ' *'}</strong>
    <code>{attribute.code}</code><small>{attribute.description || '未维护属性说明'}</small>
    <div><StatusBadge>{attribute.dataType}{attribute.cardinality === 'MULTIPLE' ? ' · 多值' : ''}</StatusBadge>
      {projected && <StatusBadge tone="warning">强类型投影</StatusBadge>}
      {attribute.unitCode && <span className="master-data-attribute-unit">单位：{attribute.unitCode}</span>}</div></td>
    <td>{projected ? <AttributeReadOnlyHint text="请在左侧强类型基础信息中维护" />
      : baseAllowed ? <AttributeValueEditor api={api} attribute={attribute} value={baseRaw} onChange={setBaseRaw}
        actions={<><Button size="sm" disabled={pendingKey === baseKey || !baseRaw} onClick={saveBase}>
          {pendingKey === baseKey ? '保存中…' : '保存基线'}</Button>
          {baseValue && <Button size="sm" variant="text" disabled={pendingKey === baseKey} onClick={disableBase}>停用</Button>}</>} />
        : <AttributeReadOnlyHint text="该属性仅允许维护作用域值" />}</td>
    <td>{projected ? <AttributeReadOnlyHint text="强类型安全字段不允许覆盖" />
      : overrideAllowed ? <AttributeValueEditor api={api} attribute={attribute} value={overrideRaw} onChange={setOverrideRaw}
        disabled={overrideMode === 'EXPLICIT_NULL'}
        placeholder={baseValue ? `继承：${displayAttributeValue(baseValue.value)}` : '未覆盖时使用类型默认值'}
        actions={<>{explicitNullAllowed && <Select value={overrideMode} onChange={(value) => setOverrideMode(value as 'OVERRIDE' | 'EXPLICIT_NULL')}
          options={[{ value: 'OVERRIDE', label: '设置覆盖值' }, { value: 'EXPLICIT_NULL', label: '明确清空' }]} />}
          <Button size="sm" disabled={pendingKey === overrideKey || (overrideMode === 'OVERRIDE' && !overrideRaw)} onClick={saveOverride}>
          {pendingKey === overrideKey ? '保存中…' : '保存覆盖'}</Button>
          {overrideValue && <Button size="sm" variant="text" disabled={pendingKey === overrideKey}
            onClick={disableOverride}>恢复继承</Button>}</>} />
        : <AttributeReadOnlyHint text={attribute.overridePolicy === 'RESTRICTIVE_ONLY'
          ? '需先配置受控限制比较规则' : '该属性不允许机构覆盖'} />}</td></tr>
}

function AttributeValueEditor({ api, attribute, value, onChange, placeholder, actions, disabled = false }: {
  api: RhnApi
  attribute: ItemAttributeSchema; value: string; onChange: (value: string) => void
  placeholder?: string; actions: ReactNode; disabled?: boolean
}) {
  const itemSchema = attribute.cardinality === 'MULTIPLE' && attribute.schema.items
    && typeof attribute.schema.items === 'object' && !Array.isArray(attribute.schema.items)
    ? attribute.schema.items as Record<string, ItemAttributeJson> : attribute.schema
  const enumeration = Array.isArray(itemSchema.enum) ? itemSchema.enum.map(String) : []
  const dictionary = useQuery({
    queryKey: ['master-data-attribute-dictionary', attribute.dictionaryId],
    queryFn: () => api.dictionaries.get(attribute.dictionaryId!),
    enabled: attribute.dataType === 'DICT_REF' && Boolean(attribute.dictionaryId),
    staleTime: 5 * 60 * 1000,
  })
  const options = attribute.dataType === 'DICT_REF' ? (dictionary.data?.items ?? [])
    .filter((item) => item.sdDictItemStatus === 'ACTIVE')
    .map((item) => ({ value: item.code, label: item.name, secondaryText: item.code }))
    : enumeration.map((item) => ({ value: item, label: item, secondaryText: item }))
  const selectable = options.length > 0
  const selectedValues = attribute.cardinality === 'MULTIPLE' ? parseRawArray(value) : []
  return <div className="master-data-attribute-editor">
    {selectable && attribute.cardinality === 'MULTIPLE' ? <Select multiple value={selectedValues}
      onChange={(values) => onChange(JSON.stringify(values))} placeholder={placeholder || '请选择'} showValue
      options={options} loading={dictionary.isPending && attribute.dataType === 'DICT_REF'} disabled={disabled} />
      : selectable ? <Select value={value} onChange={onChange} placeholder={placeholder || '请选择'} showValue
      options={options} loading={dictionary.isPending && attribute.dataType === 'DICT_REF'} disabled={disabled} />
      : attribute.dataType === 'BOOLEAN' ? <Select value={value} onChange={onChange} placeholder={placeholder || '请选择'}
        options={[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]} disabled={disabled} />
        : attribute.cardinality === 'MULTIPLE' || ['OBJECT', 'TERM_REF'].includes(attribute.dataType)
          ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3}
            placeholder={placeholder || '请输入合法 JSON'} disabled={disabled} />
          : <input value={value} onChange={(event) => onChange(event.target.value)}
            type={attribute.dataType === 'DATE' ? 'date' : ['INTEGER', 'DECIMAL'].includes(attribute.dataType) ? 'number' : 'text'}
            step={attribute.dataType === 'INTEGER' ? '1' : attribute.dataType === 'DECIMAL' ? 'any' : undefined}
            placeholder={placeholder || '请输入属性值'} disabled={disabled} />}
    <div className="master-data-attribute-actions">{actions}</div>
  </div>
}

function parseRawArray(value: string) {
  if (!value.trim()) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [] }
  catch { return [] }
}

function attributeSchemaAllowsNull(attribute: ItemAttributeSchema) {
  const type = attribute.schema.type
  return attribute.schema.nullable === true || (Array.isArray(type) && type.includes('null'))
}

function AttributeReadOnlyHint({ text }: { text: string }) {
  return <div className="master-data-attribute-readonly"><Icon name="info" /><span>{text}</span></div>
}

function attributeRaw(value: ItemAttributeJson | undefined, attribute: ItemAttributeSchema) {
  if (value === undefined || value === null) return ''
  if (attribute.cardinality === 'MULTIPLE' || typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function parseAttributeRaw(value: string, attribute: ItemAttributeSchema): ItemAttributeJson {
  const normalized = value.trim()
  if (!normalized) throw new Error('属性值不能为空')
  if (attribute.cardinality === 'MULTIPLE' || ['OBJECT', 'TERM_REF'].includes(attribute.dataType)) {
    return JSON.parse(normalized) as ItemAttributeJson
  }
  if (attribute.dataType === 'BOOLEAN') return normalized === 'true'
  if (attribute.dataType === 'INTEGER') return Number.parseInt(normalized, 10)
  if (attribute.dataType === 'DECIMAL') return Number(normalized)
  return normalized
}

function displayAttributeValue(value: ItemAttributeJson) {
  if (value === null) return '空值'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function DiseaseDialog({ dictionaries, codeSystems, value, onClose, onSave }: { dictionaries: DictionaryMap;
  codeSystems: Array<{ id: string; name: string; version: string }>; value?: DiseaseConcept; onClose: () => void;
  onSave: (input: DiseaseInput) => void }) {
  const [aliases, setAliases] = useState(value?.aliases.map((item) => item.name).join('、') ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState(value?.effectiveFrom ?? today())
  return <DataFormDialog title={value ? '编辑疾病概念' : '新增疾病概念'} eyebrow="疾病与临床术语" onClose={onClose}
    size="xwide" description="先确认标准身份，再补充目录与检索信息；标准编码和编码体系创建后不可修改。"
    onSubmit={(form) => onSave({ codeSystemId: text(form, 'codeSystemId'), code: text(form, 'code'),
      display: text(form, 'display'), shortDisplay: optionalText(form, 'shortDisplay'),
      sdConceptType: text(form, 'sdConceptType'), chapterCode: optionalText(form, 'chapterCode'),
      chapterName: optionalText(form, 'chapterName'), definition: optionalText(form, 'definition'),
      searchCode: optionalText(form, 'searchCode'), effectiveFrom: text(form, 'effectiveFrom'),
      effectiveTo: optionalText(form, 'effectiveTo'), sdStatus: (value?.sdStatus ?? 'ACTIVE') as MasterDataStatus,
      aliases: aliases.split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean) })}>
    <FormSection title="标准身份" description="确定概念的权威来源、唯一编码和临床类型。">
      <FormGrid columns={3}>
        <StaticSelectField name="codeSystemId" label="编码体系" disabled={Boolean(value)}
          options={codeSystems.map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))}
          defaultValue={value?.codeSystemId ?? codeSystems[0]?.id} />
        <FormField label="标准编码" required><input name="code" defaultValue={value?.code}
          disabled={Boolean(value)} placeholder="如 M54.5" autoFocus={!value} required /></FormField>
        <SelectField name="sdConceptType" label="概念类型" values={dictionaries.BD_CONCEPT_TYPE}
          defaultValue={value?.sdConceptType ?? 'DISEASE'} />
        <FormField label="规范名称" required className="span-2"><input name="display" defaultValue={value?.display}
          placeholder="录入标准规范名称" required /></FormField>
        <FormField label="简称"><input name="shortDisplay" defaultValue={value?.shortDisplay}
          placeholder="用于空间受限的场景" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="目录与检索" description="章节用于目录治理，别名和检索码用于提升检索召回。">
      <FormGrid columns={3}>
        <FormField label="章节编码"><input name="chapterCode" defaultValue={value?.chapterCode}
          placeholder="如 XIII" /></FormField>
        <FormField label="章节名称"><input name="chapterName" defaultValue={value?.chapterName}
          placeholder="如 肌肉骨骼系统疾病" /></FormField>
        <FormField label="检索码" hint="支持拼音首字母"><input name="searchCode" defaultValue={value?.searchCode}
          placeholder="如 YT" /></FormField>
        <FormField label="同义词 / 旧名" className="span-3"
          hint="用顿号或逗号分隔；可命中检索，但不会覆盖规范名称">
          <input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="如 腰部疼痛、下背痛" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="有效期与说明" description="失效日期为空表示持续有效；结束日期不能早于生效日期。">
      <FormGrid>
        <FormField label="生效日期" required><input name="effectiveFrom" type="date" value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)} required /></FormField>
        <FormField label="失效日期"><input name="effectiveTo" type="date" defaultValue={value?.effectiveTo}
          min={effectiveFrom} /></FormField>
        <FormField label="定义说明" className="span-2"><textarea name="definition" defaultValue={value?.definition}
          placeholder="说明概念边界、纳入条件或与相近概念的区别" rows={3} /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

function ServiceDialog({ dictionaries, value, onClose, onSave }: { dictionaries: DictionaryMap;
  value?: ServiceCatalogItem; onClose: () => void; onSave: (input: ServiceInput) => void }) {
  return <DataFormDialog title={value ? '编辑诊疗项目' : '新增诊疗项目'} eyebrow="临床服务目录" onClose={onClose}
    size="xwide" description="维护项目主档身份和目录属性；检验检查的执行、部位与收费规则从项目列表的“项目配置”进入。"
    onSubmit={(form) => onSave({ code: text(form, 'code'), name: text(form, 'name'), unitCode: optionalText(form, 'unitCode'),
      orderable: checked(form, 'orderable'), chargeable: checked(form, 'chargeable'), sdStatus: (value?.sdStatus ?? 'ACTIVE'),
      validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'), sdServiceType: text(form, 'sdServiceType'),
      serviceSubtype: optionalText(form, 'serviceSubtype'), sdUsageType: text(form, 'sdUsageType'),
      medicalTechnology: checked(form, 'medicalTechnology'), combinationItem: checked(form, 'combinationItem'),
      singleOrder: checked(form, 'singleOrder'), specimenType: value?.specimenType,
      examinationType: value?.examinationType, accountingCategory: optionalText(form, 'accountingCategory'),
      sdDuplicateRule: optionalText(form, 'sdDuplicateRule'), multiSitePrice: value?.multiSitePrice,
      freeSiteCount: value?.freeSiteCount, maxBodySiteCount: value?.maxBodySiteCount,
      mutualRecognitionCode: optionalText(form, 'mutualRecognitionCode'),
      pregnancyAlert: checked(form, 'pregnancyAlert'), attention: optionalText(form, 'attention'),
      examinationNotes: value?.examinationNotes })}>
    <FormSection title="标准身份" description="编码创建后保持稳定，名称与目录属性可继续维护。">
      <FormGrid columns={3}>
        <FormField label="项目编码" required><input name="code" defaultValue={value?.code} disabled={Boolean(value)}
          placeholder="如 EXAM_BLOOD_ROUTINE" autoFocus={!value} required /></FormField>
        <FormField label="项目名称" required className="span-2"><input name="name" defaultValue={value?.name}
          placeholder="录入统一项目名称" required /></FormField>
        <SelectField name="sdServiceType" label={value ? '项目类型（创建后不可修改）' : '项目类型'} values={dictionaries.BD_SERVICE_TYPE}
          defaultValue={value?.sdServiceType ?? 'EXAMINATION'} disabled={Boolean(value)} />
        <FormField label="项目子类"><input name="serviceSubtype" defaultValue={value?.serviceSubtype}
          placeholder="如 常规检验" /></FormField>
        <SelectField name="sdUsageType" label="适用场景" values={dictionaries.BD_SERVICE_USE}
          defaultValue={value?.sdUsageType ?? 'COMMON'} />
      </FormGrid>
    </FormSection>
    <FormSection title="目录属性与能力" description="这里只维护中心级目录属性；检验标本、检查部位、多部位计价与附加收费在该项目的“项目配置”中统一维护。">
      <FormGrid columns={4}>
        <FormField label="计价单位"><input name="unitCode" defaultValue={value?.unitCode ?? '次'} /></FormField>
        <FormField label="费用归并"><input name="accountingCategory" defaultValue={value?.accountingCategory}
          placeholder="如 检验费" /></FormField>
        <SelectField name="sdDuplicateRule" label="重复开立规则" values={dictionaries.BD_SERVICE_DUPLICATE_RULE}
          defaultValue={value?.sdDuplicateRule ?? 'WARN'} />
        <FormField label="互认编码"><input name="mutualRecognitionCode" defaultValue={value?.mutualRecognitionCode}
          placeholder="区域检查检验互认编码" /></FormField>
        <Checkboxes title="中心能力">
          <Checkbox name="orderable" label="允许开立" defaultChecked={value?.orderable ?? true} />
          <Checkbox name="chargeable" label="允许收费" defaultChecked={value?.chargeable ?? true} />
          <Checkbox name="medicalTechnology" label="医技项目" defaultChecked={value?.medicalTechnology ?? true} />
          <Checkbox name="singleOrder" label="允许单开" defaultChecked={value?.singleOrder ?? true} />
          <Checkbox name="combinationItem" label="组合项目" defaultChecked={value?.combinationItem} />
          <Checkbox name="pregnancyAlert" label="孕期提醒" defaultChecked={value?.pregnancyAlert} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    <FormSection title="生命周期与说明" description="失效日期为空表示持续有效。">
      <FormGrid>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={value?.validFrom} toDefault={value?.validTo} />
        <FormField label="注意事项"><textarea name="attention" defaultValue={value?.attention}
          placeholder="录入开立或执行时需要关注的事项" rows={2} /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

function MedicationDialog({ dictionaries, value, onClose, onSave }: { dictionaries: DictionaryMap;
  value?: MedicationKnowledge; onClose: () => void; onSave: (input: MedicationInput) => void }) {
  const [medicationType, setMedicationType] = useState(value?.sdMedicationType ?? 'WESTERN')
  const [antimicrobial, setAntimicrobial] = useState(value?.antimicrobial ?? false)
  const western = medicationType === 'WESTERN'
  const chinesePatent = medicationType === 'CHINESE_PATENT'
  const herbal = medicationType === 'HERBAL'
  const vaccine = medicationType === 'VACCINE'
  const knownType = western || chinesePatent || herbal || vaccine
  const typeName = dictionaries.BD_MEDICATION_TYPE.find((item) => item.code === medicationType)?.name ?? medicationType
  const doseFormLabel = herbal ? '饮片 / 颗粒形态' : vaccine ? '疫苗制剂类型' : '剂型'
  const specificationLabel = herbal ? '炮制规格' : vaccine ? '剂量规格' : '制剂规格'
  const unitLabel = herbal ? '调剂单位' : vaccine ? '接种单位' : '制剂单位'
  const typeDescription = western
    ? '维护结构化含量、默认用法及抗菌药、皮试等西药安全属性。'
    : chinesePatent
      ? '维护剂型、含量和默认用法；不展示西药专属的抗菌药等级与皮试属性。'
      : herbal
        ? '维护饮片形态、炮制规格、调剂单位与煎服建议；基原、产地和炮制方法从“类型扩展属性”维护。'
        : vaccine
          ? '维护剂量规格、接种单位、途径与冷链储藏；免疫程序、目标疾病和适龄范围从“类型扩展属性”维护。'
          : '当前药品类型尚未建立维护规则，请先完善类型配置。'
  return <DataFormDialog title={value ? '编辑通用药品知识' : '新增通用药品知识'} eyebrow="药品知识层" onClose={onClose}
    size="xwide" description="通用药品知识不包含厂家和价格信息，产品、包装与机构目录在后续层级维护。"
    onSubmit={(form) => onSave({ code: text(form, 'code'), name: text(form, 'name'), aliasName: optionalText(form, 'aliasName'),
      sdMedicationType: medicationType, sdDoseForm: optionalText(form, 'sdDoseForm'),
      preparationSpec: optionalText(form, 'preparationSpec'), preparationUnit: optionalText(form, 'preparationUnit'),
      strengthValue: herbal ? undefined : optionalNumber(form, 'strengthValue'),
      strengthUnit: herbal ? undefined : optionalText(form, 'strengthUnit'),
      sdStorageType: optionalText(form, 'sdStorageType'),
      prescriptionDrug: checked(form, 'prescriptionDrug'), essentialDrug: checked(form, 'essentialDrug'),
      antimicrobial: western && antimicrobial,
      sdAntimicrobialLevel: western && antimicrobial ? optionalText(form, 'sdAntimicrobialLevel') : undefined,
      skinTestRequired: western && checked(form, 'skinTestRequired'), defaultDose: optionalNumber(form, 'defaultDose'),
      defaultDoseUnit: optionalText(form, 'defaultDoseUnit'), defaultRoute: optionalText(form, 'defaultRoute'),
      defaultFrequency: vaccine ? undefined : optionalText(form, 'defaultFrequency'),
      chronicDiseaseDrug: (western || chinesePatent) && checked(form, 'chronicDiseaseDrug'),
      singleOrder: checked(form, 'singleOrder'),
      sdStatus: value?.sdStatus ?? 'ACTIVE' })}>
    <FormSection title="药品身份" description="药品类型决定可维护的业务属性，创建后不可直接修改；类型调整需新建主档并处理替代关系。">
      <FormGrid columns={3}>
        <FormField label="通用药品编码" required><input name="code" defaultValue={value?.code} disabled={Boolean(value)}
          placeholder="如 MED_AMOXICILLIN" autoFocus={!value} required /></FormField>
        <FormField label="通用名称" required><input name="name" defaultValue={value?.name}
          placeholder="录入药品通用名称" required /></FormField>
        <FormField label="别名"><input name="aliasName" defaultValue={value?.aliasName}
          placeholder="如历史名称或常用简称" /></FormField>
        <FormField label={value ? '药品类型（创建后不可修改）' : '药品类型'} required>
          <StaticSelectControl name="sdMedicationType" value={medicationType}
            onChange={(next) => { setMedicationType(next); if (next !== 'WESTERN') setAntimicrobial(false) }}
            options={dictionaries.BD_MEDICATION_TYPE.map((item) => ({ value: item.code, label: item.name }))}
            placeholder="请选择药品类型" disabled={Boolean(value)} required />
        </FormField>
        <SelectField name="sdDoseForm" label={doseFormLabel} values={dictionaries.BD_DOSE_FORM}
          defaultValue={value?.sdDoseForm ?? 'TABLET'} />
        <FormField label={specificationLabel}><input name="preparationSpec" defaultValue={value?.preparationSpec}
          placeholder={herbal ? '如 净制、切片' : vaccine ? '如 0.5ml/支' : '如 0.5g'} /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title={`${typeName}属性`} description={typeDescription}>
      <FormGrid columns={3}>
        <FormField label={unitLabel}><input name="preparationUnit" defaultValue={value?.preparationUnit}
          placeholder={herbal ? 'g、袋' : vaccine ? '支、剂' : '片、粒、支'} /></FormField>
        {!herbal && <><FormField label={vaccine ? '每剂含量' : '结构化含量'}><input name="strengthValue" type="number" min="0" step="any"
          defaultValue={value?.strengthValue} placeholder={vaccine ? '如 0.5' : '如 500'} /></FormField>
        <FormField label={vaccine ? '每剂含量单位' : '含量单位'}><input name="strengthUnit" defaultValue={value?.strengthUnit}
          placeholder={vaccine ? 'ml、IU' : 'mg、g、IU'} /></FormField></>}
        <FormField label="默认给药途径"><input name="defaultRoute" defaultValue={value?.defaultRoute}
          placeholder={herbal ? '如 煎服、冲服' : vaccine ? '如 肌内注射' : '如 口服'} /></FormField>
        {!vaccine && <FormField label={herbal ? '默认服用频次' : '默认频次'}><input name="defaultFrequency" defaultValue={value?.defaultFrequency}
          placeholder={herbal ? '如 每日一剂' : '如 每日三次'} /></FormField>}
        <SelectField name="sdStorageType" label={vaccine ? '冷链 / 储藏方式' : '储藏方式'} values={dictionaries.BD_STORAGE_TYPE}
          defaultValue={value?.sdStorageType} required={false} />
        <FormField label="默认剂量"><input name="defaultDose" type="number" min="0" step="any"
          defaultValue={value?.defaultDose} placeholder="如 0.5" /></FormField>
        <FormField label="默认剂量单位"><input name="defaultDoseUnit" defaultValue={value?.defaultDoseUnit}
          placeholder={herbal ? '如 g、剂' : vaccine ? '如 ml、剂' : '如 g、mg、ml'} /></FormField>
        {western && antimicrobial && <SelectField name="sdAntimicrobialLevel" label="抗菌药等级"
          values={dictionaries.BD_ANTIMICROBIAL_LEVEL} defaultValue={value?.sdAntimicrobialLevel ?? 'NON_RESTRICTED'} />}
        <Checkboxes title="安全与管理属性">
          <Checkbox name="prescriptionDrug" label="处方药" defaultChecked={value?.prescriptionDrug ?? true} />
          <Checkbox name="essentialDrug" label="基本药物" defaultChecked={value?.essentialDrug} />
          {western && <Checkbox name="antimicrobial" label="抗菌药物" checked={antimicrobial}
            onChange={(checkedValue) => setAntimicrobial(checkedValue)} />}
          {western && <Checkbox name="skinTestRequired" label="需要皮试" defaultChecked={value?.skinTestRequired} />}
          {(western || chinesePatent) && <Checkbox name="chronicDiseaseDrug" label="慢病用药" defaultChecked={value?.chronicDiseaseDrug} />}
          <Checkbox name="singleOrder" label="允许单开" defaultChecked={value?.singleOrder ?? true} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    {!knownType && <Alert>当前药品类型尚未建立专属模板，本次仅按通用字段维护；请在扩展属性配置中补充类型规则。</Alert>}
  </DataFormDialog>
}

function ProductDialog({ medication, manufacturers, dictionaries, onClose, onSave }: { medication: MedicationKnowledge;
  manufacturers: Manufacturer[]; dictionaries: DictionaryMap; onClose: () => void; onSave: (input: ProductInput) => void }) {
  return <DataFormDialog title="新增药品产品" eyebrow={`${medication.name} · 厂家产品层`} onClose={onClose}
    size="xwide" description="厂家产品承载批准、注册和机构经营能力，不重复维护通用药品知识。"
    onSubmit={(form) => onSave({ medicationId: medication.id, manufacturerId: text(form, 'manufacturerId'),
      code: text(form, 'code'), name: text(form, 'name'), unitCode: optionalText(form, 'unitCode'),
      tradeName: optionalText(form, 'tradeName'), approvalCode: optionalText(form, 'approvalCode'),
      approvalFrom: optionalText(form, 'approvalFrom'), approvalTo: optionalText(form, 'approvalTo'),
      registrationCode: optionalText(form, 'registrationCode'), registrationFrom: optionalText(form, 'registrationFrom'),
      registrationTo: optionalText(form, 'registrationTo'), purchaseCode: optionalText(form, 'purchaseCode'),
      sdMarketStatus: optionalText(form, 'sdMarketStatus'), sdProductionPlace: optionalText(form, 'sdProductionPlace'),
      otc: checked(form, 'otc'), centralPurchase: checked(form, 'centralPurchase'), importAllowed: checked(form, 'importAllowed'),
      traceSplitRequired: checked(form, 'traceSplitRequired'), orderable: checked(form, 'orderable'),
      chargeable: checked(form, 'chargeable'), stocked: checked(form, 'stocked'), sdStatus: 'ACTIVE',
      shelfLifeValue: optionalNumber(form, 'shelfLifeValue'), sdShelfLifeUnit: optionalText(form, 'sdShelfLifeUnit'),
      validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'), indication: optionalText(form, 'indication'),
      instruction: optionalText(form, 'instruction') })}>
    <FormSection title="产品身份" description="关联生产企业并维护产品级名称、编码和最小单位。">
      <FormGrid columns={3}>
        <StaticSelectField name="manufacturerId" label="生产企业"
          options={manufacturers.map((item) => ({ value: item.id, label: item.name }))}
          defaultValue={manufacturers[0]?.id} />
        <FormField label="产品编码" required><input name="code" placeholder="如 PROD_0001" autoFocus required /></FormField>
        <FormField label="最小单位"><input name="unitCode" defaultValue={medication.preparationUnit}
          placeholder="片、粒、支" /></FormField>
        <FormField label="产品名称" required className="span-2"><input name="name"
          defaultValue={`${medication.name}${medication.sdDoseFormText ?? ''}`} required /></FormField>
        <FormField label="商品名"><input name="tradeName" placeholder="无商品名可留空" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="批准与采购信息" description="批准有效期用于合规校验，采购编码用于机构业务对接。">
      <FormGrid columns={3}>
        <FormField label="批准文号"><input name="approvalCode" placeholder="录入批准文号" /></FormField>
        <FormField label="注册证号"><input name="registrationCode" placeholder="如适用" /></FormField>
        <FormField label="采购编码"><input name="purchaseCode" placeholder="机构或平台采购编码" /></FormField>
        <SelectField name="sdMarketStatus" label="上市状态" values={dictionaries.BD_PRODUCT_MARKET_STATUS}
          defaultValue="MARKETED" />
        <DateRangeFields fromName="approvalFrom" toName="approvalTo" fromLabel="批准起始" toLabel="批准截止"
          required={false} />
        <DateRangeFields fromName="registrationFrom" toName="registrationTo" fromLabel="注册起始" toLabel="注册截止"
          required={false} />
      </FormGrid>
    </FormSection>
    <FormSection title="目录能力与生命周期" description="目录失效日期为空表示持续有效。">
      <FormGrid>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="目录生效" toLabel="目录失效" />
        <SelectField name="sdProductionPlace" label="产品生产地" values={dictionaries.BD_PRODUCTION_PLACE}
          required={false} />
        <FormField label="产品有效期数值"><input name="shelfLifeValue" type="number" min="0" step="any"
          placeholder="如 24" /></FormField>
        <SelectField name="sdShelfLifeUnit" label="产品有效期单位" values={dictionaries.BD_SHELF_LIFE_UNIT}
          required={false} />
        <Checkboxes title="产品能力">
          <Checkbox name="orderable" label="允许开立" defaultChecked />
          <Checkbox name="chargeable" label="允许收费" defaultChecked />
          <Checkbox name="stocked" label="库存商品" defaultChecked />
          <Checkbox name="otc" label="OTC" />
          <Checkbox name="centralPurchase" label="集采产品" />
          <Checkbox name="importAllowed" label="允许机构调入" defaultChecked />
          <Checkbox name="traceSplitRequired" label="追溯码拆零" defaultChecked />
        </Checkboxes>
        <FormField label="适应证" className="span-2"><textarea name="indication"
          placeholder="录入厂家产品批准的适应证" rows={2} /></FormField>
        <FormField label="说明书" className="span-2"><textarea name="instruction"
          placeholder="录入或粘贴产品说明书摘要" rows={3} /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

function PackageDialog({ product, dictionaries, onClose, onSave }: { product: MedicationProduct;
  dictionaries: DictionaryMap; onClose: () => void; onSave: (input: PackageInput) => void }) {
  return <DataFormDialog title="新增产品包装" eyebrow={product.name} onClose={onClose}
    size="xwide" description={`定义包装单位与${product.unitCode || '最小单位'}之间的换算关系，并声明采购、销售和发放用途。`}
    onSubmit={(form) => onSave({ unitCode: text(form, 'unitCode'), unitName: text(form, 'unitName'),
      packageSpec: optionalText(form, 'packageSpec'), quantityFactor: Number(text(form, 'quantityFactor')),
      sdUsageType: text(form, 'sdUsageType'), barcode: optionalText(form, 'barcode'),
      defaultPurchase: checked(form, 'defaultPurchase'), defaultSale: checked(form, 'defaultSale'),
      defaultDispense: checked(form, 'defaultDispense'), sdStatus: 'ACTIVE', validFrom: text(form, 'validFrom'),
      validTo: optionalText(form, 'validTo') })}>
    <FormSection title="包装与换算" description="包装编码在产品范围内保持稳定。">
      <FormGrid columns={3}>
        <FormField label="包装单位编码" required><input name="unitCode" placeholder="BOX" autoFocus required /></FormField>
        <FormField label="包装单位名称" required><input name="unitName" placeholder="盒" required /></FormField>
        <SelectField name="sdUsageType" label="包装用途" values={dictionaries.BD_PACKAGE_USE} defaultValue="SALE" />
        <FormField label="包装规格"><input name="packageSpec" placeholder="如 24粒/盒" /></FormField>
        <FormField label={`换算数量（${product.unitCode || '最小单位'}）`} required><input name="quantityFactor"
          type="number" min="0.000001" step="any" placeholder="如 24" required /></FormField>
        <FormField label="条码"><input name="barcode" placeholder="扫描或录入商品条码" /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="业务用途与生命周期" description="有效期结束后不再用于新的采购、销售或发放。">
      <FormGrid>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期" />
        <Checkboxes title="默认业务包装">
          <Checkbox name="defaultPurchase" label="默认采购包装" defaultChecked />
          <Checkbox name="defaultSale" label="默认销售包装" defaultChecked />
          <Checkbox name="defaultDispense" label="默认发药包装" />
        </Checkboxes>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

function DataFormDialog({ title, eyebrow, description, size = 'wide', onClose, onSubmit, children }: {
  title: string; eyebrow: string; description?: string; size?: 'wide' | 'xwide'
  onClose: () => void; onSubmit: (form: FormData) => void; children: ReactNode
}) {
  return <Dialog title={title} eyebrow={eyebrow} description={description} size={size} onClose={onClose}>
    <form className="master-data-dialog-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); onSubmit(new FormData(event.currentTarget))
  }}>{children}<div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
    <Button type="submit">保存</Button></div></form></Dialog>
}

function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="master-data-form-section"><header><h3>{title}</h3><p>{description}</p></header>{children}</section>
}
function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return <div className={`master-data-form-grid master-data-form-grid--${columns}`}>{children}</div>
}
function DateRangeFields({ fromName, toName, fromLabel, toLabel, fromDefault, toDefault,
  required = true }: { fromName: string; toName: string; fromLabel: string; toLabel: string;
  fromDefault?: string; toDefault?: string; required?: boolean }) {
  const [from, setFrom] = useState(fromDefault ?? (required ? today() : ''))
  return <><FormField label={fromLabel} required={required}><input name={fromName} type="date" value={from}
    onChange={(event) => setFrom(event.target.value)} required={required} /></FormField>
    <FormField label={toLabel}><input name={toName} type="date" defaultValue={toDefault} min={from || undefined} /></FormField></>
}
function Checkboxes({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="master-data-checkboxes span-2"><legend>{title}</legend><div>{children}</div></fieldset>
}
function Checkbox({ name, label, defaultChecked = false, checked: checkedValue, onChange }: { name: string; label: string;
  defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void }) {
  return <label><input type="checkbox" name={name} defaultChecked={checkedValue === undefined ? defaultChecked : undefined}
    checked={checkedValue} onChange={onChange ? (event) => onChange(event.target.checked) : undefined} />{label}</label>
}
function SelectField({ name, label, values = [], defaultValue, disabled = false, required = true, placeholder }: { name: string; label: string;
  values?: DictionaryValue[]; defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string }) {
  return <StaticSelectField name={name} label={label} defaultValue={defaultValue ?? (required ? values[0]?.code : undefined)}
    disabled={disabled} required={required} placeholder={placeholder} options={values.map((item) => ({ value: item.code, label: item.name }))} />
}
function StaticSelectField({ name, label, options: values, defaultValue, disabled = false, required = true,
  placeholder = '请选择' }: { name: string; label: string; options: Array<{ value: string; label: string }>;
  defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue ?? '')
  return <FormField label={label} required={required}><StaticSelectControl name={name} value={value}
    onChange={setValue} options={values} placeholder={placeholder} disabled={disabled} required={required} /></FormField>
}
function StaticSelectControl({ id, name, className, value, onChange, options: values, placeholder, disabled, required,
  'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired }: {
  id?: string; name: string; className?: string; value: string; onChange: (value: string) => void
  options: Array<{ value: string; label: string }>; placeholder: string; disabled: boolean; required: boolean
  'aria-describedby'?: string; 'aria-invalid'?: boolean | 'false' | 'true'; 'aria-required'?: boolean | 'false' | 'true'
}) {
  return <div className="master-data-select-field">
    {disabled && <input type="hidden" name={name} value={value} />}
    <Select id={id} name={disabled ? undefined : name} className={className} value={value} onChange={onChange}
      options={values} placeholder={placeholder} disabled={disabled} clearable={!required}
      aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid} aria-required={ariaRequired} />
  </div>
}
function Table({ headers, children, compact = false }: { headers: string[]; children: ReactNode; compact?: boolean }) {
  return <div className="master-data-table-wrap"><table className={`master-data-table ${compact ? 'is-compact' : ''}`}>
    <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}
function TabButton({ active, onClick, label, meta }: { active: boolean; onClick: () => void; label: string; meta: string }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? 'is-active' : ''} onClick={onClick}>
    <strong>{label}</strong><small>{meta}</small></button>
}
function RowActions({ children }: { children: ReactNode }) { return <div className="master-data-row-actions">{children}</div> }
function DataStatus({ value, text }: { value: MasterDataStatus; text: string }) {
  return <StatusBadge tone={value === 'ACTIVE' ? 'success' : value === 'SUSPENDED' ? 'warning' : 'neutral'}>{text}</StatusBadge>
}
function Flag({ value, label }: { value: boolean; label: string }) { return <StatusBadge tone={value ? 'success' : 'neutral'}>{value ? label : `不可${label.slice(1)}`}</StatusBadge> }
function activePrice(values: CatalogPrice[]) {
  const at = today()
  const value = values.find((item) => item.sdStatus === 'ACTIVE' && item.validFrom <= at
    && (!item.validTo || item.validTo >= at))
  return value ? <><strong>¥ {Number(value.price).toFixed(2)}</strong><small>{value.sdPriceTypeText} · {value.validFrom}</small></> : '未维护'
}
function options(values: DictionaryMap | undefined, code: string) {
  return (values?.[code] ?? []).map((item) => ({ value: item.code, label: item.name }))
}
function tabLabel(tab: Tab) { return tab === 'disease' ? '疾病' : tab === 'service' ? '项目' : '药品' }
function text(form: FormData, name: string) { return String(form.get(name) ?? '').trim() }
function optionalText(form: FormData, name: string) { const value = text(form, name); return value || undefined }
function optionalNumber(form: FormData, name: string) { const value = text(form, name); return value ? Number(value) : undefined }
function checked(form: FormData, name: string) { return form.get(name) === 'on' }
