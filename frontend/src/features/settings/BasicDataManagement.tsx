import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Organization } from '../../shared/model'
import {
  errorMessage, type CatalogPrice, type DiseaseConcept, type DiseaseInput,
  type DiseaseManagementProgram, type DiseaseManagementProgramInput, type DiseaseManagementRule,
  type DiseaseManagementExceptionInput, type CodeSystemSummary,
  type Department, type DictionaryValue, type Manufacturer, type MasterDataStatus,
  type MedicationInput, type MedicationKnowledge, type MedicationProduct, type PackageInput,
  type ItemPackage,
  type MedicationProductSetupInput, type ProductInput, type RhnApi, type ServiceCatalogItem, type ServiceInput,
  type ItemAttributeJson, type ItemAttributeOverride, type ItemAttributeSchema,
  type ItemAttributeSubjectType, type ItemAttributeValue, type MasterDataImportBatch,
  type MasterDataImportRow, type MasterDataImportType, type ItemTermMapping,
  type StandardEquivalence, type StandardMappingType,
  type CatalogLifecycle, type LifecycleAdoptionInput, type LifecyclePriceInput,
  type CatalogAdoptionCandidate, type OrganizationAdoption,
  type ActiveOrderFrequency,
  type MedicationRoute, type StandardMedicationDetail, type StandardMedicationSpecification,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel,
  Pagination, SearchField, Select, StatusBadge, TableShell, Tabs, Tooltip,
} from '../../shared/ui'
import { MedicationCompositionDialog } from './MedicationCompositionDialog'
import { StandardMedicationCatalogPanel } from './StandardMedicationCatalogPanel'
import { ItemAttributeConfigurationPanel } from './ItemAttributeConfigurationPanel'
import { ClinicalServiceConfigurationDialog, OperationalMasterDataPanel } from './OperationalMasterDataPanel'

type Tab = 'disease' | 'service' | 'medication' | 'operations' | 'attribute'
type DiseaseMode = 'terms' | 'management'
export type DictionaryMap = Record<string, DictionaryValue[]>

const dictionaryCodes = [
  'BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE',
  'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_MANUFACTURER_TYPE', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE',
  'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL', 'BD_SERVICE_DUPLICATE_RULE',
  'BD_PRODUCT_MARKET_STATUS', 'BD_PRODUCTION_PLACE', 'BD_SHELF_LIFE_UNIT',
  'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD', 'BD_EXAM_TYPE',
  'BD_SERVICE_VARIANT_METHOD',
  'BD_DIAGNOSIS_DOMAIN', 'BD_DISEASE_MANAGEMENT_TYPE', 'BD_DISEASE_TRIGGER_ACTION',
] as const

const today = () => new Date().toISOString().slice(0, 10)

export function BasicDataManagement({ api, organization, onNavigate }: {
  api: RhnApi; organization: Organization; onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('disease')
  const [diseaseMode, setDiseaseMode] = useState<DiseaseMode>('terms')
  const [serviceDensity, setServiceDensity] = useState<'two-line' | 'single-line'>('two-line')
  const [medicationMode, setMedicationMode] = useState<'knowledge' | 'product' | 'standard'>('knowledge')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
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
    queryKey: ['master-data-diseases', query, typeFilter, statusFilter, page, pageSize],
    queryFn: () => api.masterData.searchDiseases(query, typeFilter, statusFilter, '', page, pageSize),
    enabled: tab === 'disease' && diseaseMode === 'terms',
  })
  const diseasePrograms = useQuery({
    queryKey: ['master-data-disease-management-programs', query, typeFilter, statusFilter, page, pageSize],
    queryFn: () => api.masterData.searchDiseaseManagementPrograms(
      query, typeFilter, statusFilter, page, pageSize),
    enabled: tab === 'disease' && diseaseMode === 'management',
  })
  const services = useQuery({
    queryKey: ['master-data-services', query, typeFilter, statusFilter, organization.id, page, pageSize],
    queryFn: () => api.masterData.searchServices(
      query, typeFilter, statusFilter, organization.id, page, pageSize),
    enabled: tab === 'service',
  })
  const medications = useQuery({
    queryKey: ['master-data-medications', query, typeFilter, statusFilter, organization.id, page, pageSize],
    queryFn: () => api.masterData.searchMedications(
      query, typeFilter, statusFilter, organization.id, page, pageSize),
    enabled: tab === 'medication',
  })
  const frequencies = useQuery({
    queryKey: ['master-data-active-order-frequencies', organization.id],
    queryFn: () => api.masterData.activeOrderFrequencies(organization.id, undefined, 'OUTPATIENT', 'MEDICATION'),
    enabled: tab === 'medication', staleTime: 5 * 60 * 1000,
  })
  const routes = useQuery({
    queryKey: ['master-data-active-medication-routes'],
    queryFn: () => api.masterData.activeMedicationRoutes('MASTER_DATA'),
    enabled: tab === 'medication', staleTime: 5 * 60 * 1000,
  })
  const manufacturers = useQuery({
    queryKey: ['master-data-manufacturers'], queryFn: () => api.masterData.manufacturers(),
    enabled: tab === 'medication' || tab === 'operations',
  })

  useEffect(() => { setTypeFilter(''); setStatusFilter(''); setQuery(''); setPage(0) }, [diseaseMode, tab])
  useEffect(() => { setPage(0) }, [pageSize, query, statusFilter, typeFilter])

  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await queryClient.invalidateQueries({ predicate: (value) => String(value.queryKey[0]).startsWith('master-data') })
  }
  const fail = (error: unknown) => setOperationError(errorMessage(error))
  const busy = diseases.isFetching || diseasePrograms.isFetching || services.isFetching || medications.isFetching
  const currentError = diseases.error || diseasePrograms.error || services.error || medications.error
    || routes.error || dictionaries.error || codeSystems.error
  const typeOptions = tab === 'disease' && diseaseMode === 'management'
    ? options(dictionaries.data, 'BD_DISEASE_MANAGEMENT_TYPE')
    : tab === 'disease' ? options(dictionaries.data, 'BD_CONCEPT_TYPE')
    : tab === 'service' ? options(dictionaries.data, 'BD_SERVICE_TYPE')
      : options(dictionaries.data, 'BD_MEDICATION_TYPE')
  const currentPage = tab === 'disease'
    ? diseaseMode === 'terms' ? diseases.data : diseasePrograms.data
    : tab === 'service' ? services.data : medications.data
  const count = currentPage?.totalElements ?? 0
  const totalPages = Math.max(1, currentPage?.totalPages ?? 1)
  const safePage = Math.min(page, totalPages - 1)
  const pageDataReady = Boolean(currentPage)
  const pagination = <Pagination page={safePage} totalPages={totalPages} total={count} pageSize={pageSize}
    onPageSizeChange={setPageSize} onChange={setPage} label={`${tabLabel(tab)}列表分页`} />
  useEffect(() => { if (pageDataReady && page !== safePage) setPage(safePage) }, [page, pageDataReady, safePage])
  const pageActions = tab === 'attribute' || tab === 'operations' || (tab === 'medication' && medicationMode === 'standard') ? undefined : <>
    {tab !== 'disease' && <>
      <Button variant="secondary" onClick={() => setDialog(
        <MasterDataImportDialog api={api} importType={tab === 'service' ? 'SERVICE' : 'MEDICATION'}
          onClose={() => setDialog(undefined)} onCompleted={() => invalidate(`${tabLabel(tab)}批量导入已完成`)} />
      )}>批量导入</Button>
    </>}
    <Button disabled={!dictionaries.data || (tab === 'disease' && diseaseMode === 'terms' && !codeSystems.data?.length)} onClick={() => {
      if (tab === 'disease' && diseaseMode === 'terms') setDialog(<DiseaseDialog dictionaries={dictionaries.data!}
        codeSystems={codeSystems.data ?? []} onClose={() => setDialog(undefined)}
        onSave={(input) => api.masterData.createDisease(input).then(() => invalidate('疾病概念已创建')).catch(fail)} />)
      if (tab === 'disease' && diseaseMode === 'management') setDialog(<DiseaseManagementProgramDialog
        dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
        onSave={(input) => api.masterData.createDiseaseManagementProgram(input)
          .then(() => invalidate('疾病管理项目已创建')).catch(fail)} />)
      if (tab === 'service') setDialog(<ServiceDialog dictionaries={dictionaries.data!}
        onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createService(input, organization.id)
          .then(() => invalidate('诊疗项目已创建')).catch(fail)} />)
      if (tab === 'medication') setDialog(<MedicationDialog dictionaries={dictionaries.data!} frequencies={frequencies.data ?? []}
        routes={routes.data ?? []}
        onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createMedication(input, organization.id)
          .then(() => invalidate('通用药品知识已创建')).catch(fail)} />)
    }}><Icon name="add" />{tab === 'disease' && diseaseMode === 'management' ? '新增管理项目' : `新增${tabLabel(tab)}`}</Button>
  </>

  return <div className="master-data-page">
    <PageHeader compact eyebrow="中心治理 · 标准主数据" title="基础数据中心"
      description="统一维护集团/区域共享的疾病诊断术语、诊疗服务目录主档、通用药品知识库与医用耗材标准；机构开展项目与本院定价请至「机构项目管理」维护。"
      actions={<Button variant="secondary" onClick={() => onNavigate('/settings/organization-catalog')}>
        <Icon name="clinical" />前往机构项目管理</Button>} />

    {feedback && <Alert tone="success" className="master-data-feedback">{feedback}</Alert>}
    {(operationError || currentError) && <Alert className="master-data-feedback">
      {operationError || errorMessage(currentError)}
    </Alert>}

    <Panel className="master-data-panel">
      <Tabs value={tab} onChange={setTab} label="基础数据类型" variant="workspace" responsiveCards
        className="master-data-tabs" actions={pageActions} items={[
          { value: 'disease', label: '疾病与术语', meta: '版本化标准' },
          { value: 'service', label: '诊疗项目', meta: '开立 · 执行 · 收费' },
          { value: 'medication', label: '药品目录', meta: '知识 · 产品 · 包装' },
          { value: 'operations', label: '运营主数据', meta: '组套 · 耗材 · 计量' },
          { value: 'attribute', label: '属性配置', meta: '定义 · 装配 · 继承' },
        ]} />
      {tab === 'disease' && <Tabs value={diseaseMode} onChange={setDiseaseMode} label="疾病维护视图"
        variant="line" className="disease-management-mode" items={[
          { value: 'terms', label: '疾病术语' },
          { value: 'management', label: '管理分类与规则' },
        ]} />}
      {tab === 'medication' && <Tabs value={medicationMode} onChange={setMedicationMode} label="药品目录视图"
        variant="line" className="medication-management-mode" items={[
          { value: 'standard', label: '标准参考目录', meta: '来源追溯 · 独立规格 · 核验清单' },
          { value: 'knowledge', label: '基本信息视角', meta: '通用知识 · 剂型规格 · 默认用法' },
          { value: 'product', label: '产品信息视角', meta: '厂家产品 · 包装规格 · 批准文号' },
        ]} />}
      {tab !== 'attribute' && tab !== 'operations' && !(tab === 'medication' && medicationMode === 'standard') && <div className="master-data-toolbar">
        <SearchField className="master-data-toolbar__search" label="搜索基础数据" value={query} onChange={setQuery}
          placeholder={tab === 'disease' && diseaseMode === 'management' ? '管理项目名称、编码或说明'
            : tab === 'disease' ? '名称、别名、编码或检索码'
            : tab === 'service' ? '项目名称、编码或分类'
            : medicationMode === 'product' ? '产品名、生产厂家、批准文号或通用名'
            : '通用名、别名、剂型或编码'} />
        <Select value={typeFilter} onChange={setTypeFilter} showValue placeholder="全部类型" options={typeOptions} />
        <Select value={statusFilter} onChange={setStatusFilter} showValue placeholder="全部状态"
          options={options(dictionaries.data, 'BD_MASTER_STATUS')} />
        {tab === 'service' && <div className="service-density-switcher" role="group" aria-label="列表密度">
          <button type="button"
            className={`service-density-btn ${serviceDensity === 'two-line' ? 'is-active' : ''}`}
            onClick={() => setServiceDensity('two-line')}
            title="两行视图：第一行展示项目与类别，第二行展示执行规格与规则">
            两行视图
          </button>
          <button type="button"
            className={`service-density-btn ${serviceDensity === 'single-line' ? 'is-active' : ''}`}
            onClick={() => setServiceDensity('single-line')}
            title="单行极简视图：极致行高，一屏吞吐更多项目">
            单行视图
          </button>
        </div>}
        <span className="master-data-count">{busy ? '正在刷新…' : `${count ?? 0} 条`}</span>
        {tab === 'medication' && <Button variant="secondary"
          onClick={() => onNavigate('/settings/partners?tab=manufacturers')}>生产企业档案</Button>}
      </div>}

      <div className="master-data-body">
        {tab === 'disease' && diseaseMode === 'terms' && <DiseaseTable values={diseases.data?.content}
        loading={diseases.isPending} pagination={pagination}
        onEdit={(value) => setDialog(<DiseaseDialog dictionaries={dictionaries.data!}
          codeSystems={codeSystems.data ?? []} value={value} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.updateDisease(value.id, value.revision, input)
            .then(() => invalidate('疾病概念已更新')).catch(fail)} />)}
        onStatus={(value) => api.masterData.diseaseStatus(value.id, value.revision,
          value.sdStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE').then(() => invalidate('疾病状态已更新')).catch(fail)} />}
        {tab === 'disease' && diseaseMode === 'management' && <DiseaseManagementTable
          values={diseasePrograms.data?.content ?? []} loading={diseasePrograms.isPending} pagination={pagination}
          onEdit={(value) => setDialog(<DiseaseManagementProgramDialog dictionaries={dictionaries.data!}
            value={value} onClose={() => setDialog(undefined)}
            onSave={(input) => api.masterData.updateDiseaseManagementProgram(value.id, value.revision, input)
              .then(() => invalidate('疾病管理项目已更新')).catch(fail)} />)}
          onMembers={(value) => setDialog(<DiseaseManagementMembersDialog program={value}
            api={api} dictionaries={dictionaries.data!} codeSystems={codeSystems.data ?? []}
            onClose={() => setDialog(undefined)}
            onSave={(rules, exceptions) => api.masterData.replaceDiseaseManagementScope(
              value.id, value.revision, rules, exceptions)
              .then(() => invalidate('适用疾病范围已更新')).catch(fail)} />)}
          onStatus={(value) => api.masterData.diseaseManagementProgramStatus(value.id, value.revision,
            value.sdStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
            .then(() => invalidate('疾病管理项目状态已更新')).catch(fail)} />}
      {tab === 'service' && <ServiceTable values={services.data?.content} loading={services.isPending}
        pagination={pagination} density={serviceDensity}
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
          onClose={() => setDialog(undefined)} />)} />}
      {tab === 'medication' && medicationMode === 'standard' && <StandardMedicationCatalogPanel api={api}
        setupDisabled={!dictionaries.data || manufacturers.isPending || frequencies.isPending || routes.isPending}
        onSetup={(entry, spec) => setDialog(<StandardMedicationSetupDialog key={spec.id} api={api}
          entry={entry} spec={spec} organization={organization} dictionaries={dictionaries.data!}
          manufacturers={manufacturers.data ?? []} frequencies={frequencies.data ?? []} routes={routes.data ?? []}
          onClose={() => { setDialog(undefined); void queryClient.invalidateQueries({queryKey:['master-data-medications']}) }}
          onComplete={async (medication) => {
            setQuery(medication.code); setTypeFilter(''); setStatusFilter(''); setMedicationMode('product')
            await invalidate('药品、厂家产品、包装和本院价格已就绪，可入库并开方')
          }} />)} />}
      {tab === 'medication' && medicationMode !== 'standard' && <MedicationTable values={medications.data?.content}
        loading={medications.isPending} pagination={pagination}
        mode={medicationMode} onModeChange={setMedicationMode}
        routes={routes.data ?? []} frequencies={frequencies.data ?? []}
        onEdit={(value) => setDialog(<MedicationDialog dictionaries={dictionaries.data!} frequencies={frequencies.data ?? []}
          routes={routes.data ?? []} value={value}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.updateMedication(
            value.id, value.revision, input, organization.id).then(() => invalidate('药品知识已更新')).catch(fail)} />)}
        onAttributes={(value) => setDialog(<AttributeManagementDialog api={api} organization={organization}
          subjectType="MEDICATION" targetId={value.id} itemName={value.name}
          onClose={() => setDialog(undefined)} />)}
        onComposition={(value) => setDialog(<MedicationCompositionDialog api={api} medication={value} onClose={() => setDialog(undefined)} />)}
        onMappings={(value) => setDialog(<StandardMappingDialog api={api} subjectType="MEDICATION"
          targetId={value.id} itemName={value.name} systemType="MEDICATION"
          onClose={() => setDialog(undefined)} />)}
        onProduct={(value) => setDialog(<ProductDialog medication={value} manufacturers={manufacturers.data ?? []}
          organization={organization} dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.createProductSetup(input)
            .then(() => invalidate('药品产品、包装和机构价格已创建')).catch(fail)} />)}
        onEditProduct={(product, medication) => setDialog(<ProductEditDialog product={product} medication={medication}
          manufacturers={manufacturers.data ?? []} dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.updateProduct(product.id, product.revision, input, organization.id)
            .then(() => invalidate('药品产品已更新')).catch(fail)}
          onEditPackage={(item) => setDialog(<PackageDialog product={product} medication={medication}
            dictionaries={dictionaries.data!} editing={item} onClose={() => setDialog(undefined)}
            onSave={(input) => api.masterData.updatePackage(item.id, input)
              .then(() => invalidate('产品包装已更新')).catch(fail)} />)} />)}
        onPackage={(product, medication) => setDialog(<PackageDialog product={product} medication={medication} dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createPackage(product.id, input)
            .then(() => invalidate('产品包装已新增')).catch(fail)} />)}
        onEditPackage={(item, product, medication) => setDialog(<PackageDialog product={product} medication={medication}
          dictionaries={dictionaries.data!} editing={item} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.updatePackage(item.id, input)
            .then(() => invalidate('产品包装已更新')).catch(fail)} />)} />}
        {tab === 'attribute' && <ItemAttributeConfigurationPanel api={api} />}
        {tab === 'operations' && dictionaries.data && <OperationalMasterDataPanel api={api}
          organization={organization} manufacturers={manufacturers.data ?? []} />}
      </div>
    </Panel>
    {dialog}
  </div>
}

function DiseaseTable({ values, loading, pagination, onEdit, onStatus }: { values?: DiseaseConcept[]; loading: boolean;
  pagination: ReactNode;
  onEdit: (value: DiseaseConcept) => void; onStatus: (value: DiseaseConcept) => void }) {
  if (loading) return <LoadingState label="正在加载疾病术语…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到疾病概念" copy="请调整筛选条件或新增疾病概念。" />
  return <Table headers={['疾病概念', '标准编码', '诊断体系 / 类型', '管理标识', '别名', '状态', '操作']}
    footer={pagination}>
    {values.map((value) => <tr key={value.id}><td><strong>{value.display}</strong><small>{value.shortDisplay || value.definition || '—'}</small></td>
      <td><code>{value.code}</code><small>{value.systemName} · {value.systemVersion}</small></td>
      <td><strong>{value.sdDiagnosisDomainText}</strong><small>{value.sdConceptTypeText} · {value.chapterName || '未分类'}</small></td>
      <td>{value.managementPrograms.length ? value.managementPrograms.map((item) => <StatusBadge key={item.id}
        tone={item.sdManagementType === 'DISEASE_REPORT' ? 'warning' : 'success'}>{item.name}</StatusBadge>) : '—'}</td>
      <td>{value.aliases.slice(0, 2).map((item) => item.name).join('、') || '—'}</td>
      <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
      <td><RowActions><Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑</Button>
        <Button size="sm" variant="text" onClick={() => onStatus(value)}>{value.sdStatus === 'ACTIVE' ? '暂停' : '启用'}</Button></RowActions></td></tr>)}
  </Table>
}

function DiseaseManagementTable({ values, loading, pagination, onEdit, onMembers, onStatus }: {
  values?: DiseaseManagementProgram[]; loading: boolean; pagination: ReactNode
  onEdit: (value: DiseaseManagementProgram) => void
  onMembers: (value: DiseaseManagementProgram) => void
  onStatus: (value: DiseaseManagementProgram) => void
}) {
  if (loading) return <LoadingState label="正在加载疾病管理项目…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到疾病管理项目"
    copy="请新增慢病管理、疾病报告或专项登记项目。" />
  return <Table headers={['管理项目', '类别 / 触发动作', '适用疾病', '报卡要求', '有效期 / 状态', '操作']}
    footer={pagination}>
    {values.map((value) => <tr key={value.id}>
      <td><strong>{value.name}</strong><code>{value.code}</code><small>{value.description || '未填写说明'}</small></td>
      <td><StatusBadge tone={value.sdManagementType === 'DISEASE_REPORT' ? 'warning' : 'success'}>
        {value.sdManagementTypeText}</StatusBadge><small>{value.sdTriggerActionText}</small></td>
      <td><strong>{value.ruleCount} 条规则</strong><small>{value.exceptionCount
        ? `${value.exceptionCount} 个精确例外` : value.ruleCount ? '按规则自动识别，无精确例外' : '尚未配置适用范围'}</small></td>
      <td>{value.reportCardType || '不适用'}<small>{value.reportDeadlineHours
        ? `${value.reportDeadlineHours} 小时内` : value.sdManagementType === 'DISEASE_REPORT' ? '按适用规则确认' : '—'}</small></td>
      <td><DataStatus value={value.sdStatus} text={value.sdStatusText} />
        <small>{value.effectiveFrom} 至 {value.effectiveTo || '长期'}</small></td>
      <td><RowActions><Button size="sm" variant="text" onClick={() => onMembers(value)}>配置识别范围</Button>
        <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑规则</Button>
        <Button size="sm" variant="text" onClick={() => onStatus(value)}>
          {value.sdStatus === 'ACTIVE' ? '暂停' : '启用'}</Button></RowActions></td>
    </tr>)}
  </Table>
}

export const SERVICE_SUBTYPE_MAP: Record<string, string> = {
  IMMUNOASSAY: '免疫检测',
  BIOCHEMISTRY: '生化检测',
  HEMATOLOGY: '血液体液检测',
  MICROBIOLOGY: '微生物检测',
  MOLECULAR: '分子生物检测',
  PATHOLOGY: '病理检查',
  RADIOGRAPHY: '普通放射 (DR)',
  CT: '计算机断层扫描 (CT)',
  MRI: '磁共振成像 (MRI)',
  ULTRASOUND: '超声检查',
  ENDOSCOPY: '内镜检查',
  ECG: '心电图',
  OUTPATIENT_VISIT: '门诊诊查',
  EMERGENCY_VISIT: '急诊诊查',
  INPATIENT_VISIT: '住院诊查',
  NEBULIZATION: '雾化治疗',
  DRESSING: '创面换药',
  INJECTION: '注射处置',
  PHYSIOTHERAPY: '物理治疗',
  BED_DAY: '按日床位',
  GENERAL: '常规项目',
}

export const ACCOUNTING_CATEGORY_MAP: Record<string, string> = {
  LABORATORY: '检验费',
  REGISTRATION: '诊察挂号费',
  IMAGING: '检查影像费',
  TREATMENT: '治疗处置费',
  SURGERY: '手术费',
  BED: '床位费',
  NURSING: '护理费',
  BLOOD: '输血费',
  MATERIAL: '材料费',
  OTHER: '其他费用',
}

export function accountingCategoryLabel(category?: string) {
  if (!category) return ''
  return ACCOUNTING_CATEGORY_MAP[category] || category
}

export const SERVICE_DUPLICATE_RULE_MAP: Record<string, string> = {
  SAME_DAY: '当日不重复',
  ALLOW: '允许重复',
  WARN: '提醒后允许',
  BLOCK: '禁止重复',
  INTERVAL: '间隔限制',
}

export function serviceSubtypeLabel(subtype?: string) {
  if (!subtype) return ''
  return SERVICE_SUBTYPE_MAP[subtype] || subtype
}

export function serviceDuplicateRuleLabel(rule?: string, fallbackText?: string) {
  if (rule && SERVICE_DUPLICATE_RULE_MAP[rule]) return SERVICE_DUPLICATE_RULE_MAP[rule]
  if (fallbackText && SERVICE_DUPLICATE_RULE_MAP[fallbackText]) return SERVICE_DUPLICATE_RULE_MAP[fallbackText]
  return fallbackText || (rule ? SERVICE_DUPLICATE_RULE_MAP[rule] || rule : '')
}

export function serviceTypeTone(serviceType: string): 'info' | 'success' | 'warning' | 'neutral' {
  switch (serviceType) {
    case 'LABORATORY': return 'info'
    case 'EXAMINATION': return 'info'
    case 'TREATMENT': return 'success'
    case 'SURGERY': return 'warning'
    default: return 'neutral'
  }
}

export function ServiceTable({ values, loading, pagination, density = 'two-line', onConfigure, onEdit, onAttributes, onMappings }: {
  values?: ServiceCatalogItem[]; loading: boolean;
  pagination: ReactNode;
  density?: 'two-line' | 'single-line';
  onConfigure: (value: ServiceCatalogItem) => void;
  onEdit: (value: ServiceCatalogItem) => void;
  onAttributes: (value: ServiceCatalogItem) => void; onMappings: (value: ServiceCatalogItem) => void
}) {
  if (loading) return <LoadingState label="正在加载诊疗项目…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到诊疗项目" copy="请调整筛选条件或新增项目。" />
  const isSingle = density === 'single-line'

  return <Table
    headers={['项目', '临床语义', '中心能力', '状态', '操作']}
    footer={pagination}
    compact={isSingle}
    className={`service-catalog-table is-${density}`}>
    {values.map((value) => {
      const typeText = value.sdServiceTypeText === 'OTHER' ? '其他' : value.sdServiceTypeText
      const subtype = serviceSubtypeLabel(value.serviceSubtype)
      const ruleText = serviceDuplicateRuleLabel(value.sdDuplicateRule, value.sdDuplicateRuleText)
      const mutualText = value.mutualRecognitionCode ? `互认 ${value.mutualRecognitionCode}` : ''
      const accCategory = accountingCategoryLabel(value.accountingCategory)
      const execDetail = value.sdServiceType === 'LABORATORY'
        ? (value.laboratory ? `${value.laboratory.sdLaboratoryMethodText || '检验'} · ${value.laboratory.specimens.length} 种标本` : '未配置标本')
        : value.sdServiceType === 'EXAMINATION'
        ? (value.examination ? `${value.examination.sdExaminationTypeText || '检查'} · ${value.examination.variants.length} 个部位/方式` : '未配置部位')
        : (value.medicalTechnology ? '医技科室执行' : '临床科室执行')
      const metaSummary = [execDetail, ruleText || '未设置重复规则', mutualText].filter(Boolean).join(' · ')

      return <tr key={value.id} className={`service-catalog-row is-${density}`}>
        <td className="service-col-name">
          <div className="service-name-wrap">
            <strong className="service-item-name" title={`项目编码: ${value.code}`}>{value.name}</strong>
            {value.unitCode && <span className="service-unit-tag" title="计价单位">{value.unitCode}</span>}
          </div>
          {!isSingle && accCategory && (
            <div className="service-name-sub">
              <span className="service-acc-tag">{accCategory}</span>
            </div>
          )}
        </td>

        <td className="service-col-semantics">
          {!isSingle ? (
            <>
              <div className="service-cell__primary">
                <StatusBadge tone={serviceTypeTone(value.sdServiceType)}>{typeText}</StatusBadge>
                <span className="service-usage-text">{value.sdUsageTypeText}</span>
                {subtype && <span className="service-subtype-text"> · {subtype}</span>}
              </div>
              <div className="service-cell__secondary">
                <span className="service-meta-text" title={metaSummary}>{metaSummary}</span>
              </div>
            </>
          ) : (
            <div className="service-cell__inline">
              <StatusBadge tone={serviceTypeTone(value.sdServiceType)}>{typeText}</StatusBadge>
              <span className="service-usage-text">{value.sdUsageTypeText}</span>
              {subtype && <span className="service-subtype-text"> · {subtype}</span>}
              <span className="service-meta-inline" title={metaSummary}>({metaSummary})</span>
            </div>
          )}
        </td>

        <td className="service-col-capabilities">
          {!isSingle ? (
            <>
              <div className="service-cell__primary service-flags">
                <Flag value={value.orderable} label="可开立" />
                <Flag value={value.chargeable} label="可收费" />
              </div>
              <div className="service-cell__secondary">
                <small className="service-single-chip">
                  {value.singleOrder ? '允许单开' : '仅组合使用'}
                  {value.pregnancyAlert ? ' · 孕期提醒' : ''}
                </small>
              </div>
            </>
          ) : (
            <div className="service-capability-inline">
              <Flag value={value.orderable} label="开立" />
              <Flag value={value.chargeable} label="收费" />
              <span className={`service-single-chip is-inline ${value.singleOrder ? 'is-single' : 'is-combo'}`}>
                {value.singleOrder ? '单开' : '组合'}
              </span>
            </div>
          )}
        </td>

        <td className="service-col-status">
          <DataStatus value={value.sdStatus} text={value.sdStatusText} />
        </td>

        <td className="service-col-actions">
          <RowActions>
            {['LABORATORY', 'EXAMINATION'].includes(value.sdServiceType) && (
              <Button size="sm" variant="text" onClick={() => onConfigure(value)}>项目配置</Button>
            )}
            <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑主档</Button>
            <Button size="sm" variant="text" onClick={() => onMappings(value)}>标准映射</Button>
            <Button size="sm" variant="text" onClick={() => onAttributes(value)}>类型扩展属性</Button>
          </RowActions>
        </td>
      </tr>
    })}
  </Table>
}

export function MedicationTable({
  values, loading, pagination, mode = 'knowledge', routes, frequencies,
  onModeChange, onEdit, onAttributes, onMappings, onProduct, onEditProduct, onPackage, onEditPackage, onViewProducts, onComposition,
}: {
  values?: MedicationKnowledge[]; loading: boolean; pagination: ReactNode;
  mode?: 'knowledge' | 'product';
  routes: MedicationRoute[]; frequencies: ActiveOrderFrequency[];
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onEdit: (value: MedicationKnowledge) => void;
  onAttributes: (value: MedicationKnowledge) => void;
  onMappings: (value: MedicationKnowledge) => void;
  onProduct: (value: MedicationKnowledge) => void;
  onEditProduct: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onPackage: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onEditPackage: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void;
  onViewProducts?: (value: MedicationKnowledge) => void;
  onComposition?: (value: MedicationKnowledge) => void;
}) {
  const [popoverAnchor, setPopoverAnchor] = useState<{
    medication: MedicationKnowledge
    anchorRect: DOMRect
  } | null>(null)

  if (loading) return <LoadingState label="正在加载药品目录…" />
  if (!values?.length) return <EmptyState icon="pharmacy" title="未找到药品" copy="请调整筛选条件或新增通用药品知识。" />

  if (mode === 'product') {
    return <MedicationProductTable
      values={values}
      pagination={pagination}
      onModeChange={onModeChange}
      onProduct={onProduct}
      onEditProduct={onEditProduct}
      onPackage={onPackage}
      onEditPackage={onEditPackage}
    />
  }

  const handleTogglePopover = (value: MedicationKnowledge, el: HTMLElement) => {
    onViewProducts?.(value)
    if (popoverAnchor?.medication.id === value.id) {
      setPopoverAnchor(null)
    } else {
      setPopoverAnchor({ medication: value, anchorRect: el.getBoundingClientRect() })
    }
  }

  return <>
    <MedicationKnowledgeTable
      values={values}
      pagination={pagination}
      routes={routes}
      frequencies={frequencies}
      onModeChange={onModeChange}
      onEdit={onEdit}
      onAttributes={onAttributes}
      onMappings={onMappings}
      onComposition={onComposition}
      onProduct={onProduct}
      activePopoverMedicationId={popoverAnchor?.medication.id}
      onTogglePopover={handleTogglePopover}
      onViewProducts={onViewProducts}
    />
    {popoverAnchor && (
      <MedicationProductPopover
        medication={popoverAnchor.medication}
        anchorRect={popoverAnchor.anchorRect}
        onClose={() => setPopoverAnchor(null)}
        onProduct={onProduct}
        onEditProduct={onEditProduct}
        onPackage={onPackage}
        onEditPackage={onEditPackage}
        onModeChange={onModeChange}
      />
    )}
  </>
}

export function MedicationKnowledgeTable({
  values, pagination, routes, frequencies, onModeChange: _onModeChange,
  onEdit, onAttributes, onMappings, onProduct, activePopoverMedicationId, onTogglePopover, onViewProducts, onComposition
}: {
  values: MedicationKnowledge[]; pagination: ReactNode; routes: MedicationRoute[]; frequencies: ActiveOrderFrequency[];
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onEdit: (value: MedicationKnowledge) => void;
  onAttributes: (value: MedicationKnowledge) => void;
  onMappings: (value: MedicationKnowledge) => void;
  onProduct: (value: MedicationKnowledge) => void;
  activePopoverMedicationId?: string;
  onTogglePopover?: (value: MedicationKnowledge, el: HTMLElement) => void;
  onViewProducts?: (value: MedicationKnowledge) => void;
  onComposition?: (value: MedicationKnowledge) => void;
}) {
  return <Table
    headers={['药品通用名 / 编码', '分类与剂型', '规格与含量', '默认用法', '安全监管', '厂家产品', '状态', '操作']}
    footer={pagination}
    className="medication-knowledge-table">
    {values.map((value) => {
      const herbal = value.sdMedicationType === 'HERBAL'
      const vaccine = value.sdMedicationType === 'VACCINE'
      const routeName = value.defaultRoute
        ? routes.find((route) => route.code === value.defaultRoute)?.name ?? value.defaultRoute : undefined
      const frequencyName = value.defaultFrequency
        ? frequencies.find((frequency) => frequency.code === value.defaultFrequency)?.name ?? value.defaultFrequency : undefined
      const storageText = formatStorageType(value.sdStorageTypeText, value.sdStorageType)

      const specText = [value.preparationSpec, storageText].filter(Boolean).join(' · ') || '—'
      const strengthText = herbal ? (value.preparationUnit || '—')
        : value.strengthValue ? `${value.strengthValue} ${value.strengthUnit || ''}`.trim() : '—'

      const usageDose = value.defaultDose && `${value.defaultDose}${value.defaultDoseUnit || ''}`
      const usageRouteFreq = [routeName, vaccine ? undefined : frequencyName].filter(Boolean).join(' · ')

      const safetyTags = medicationSafetyMarkers(value)

      return <tr key={value.id} className="medication-knowledge-row">
        <td className="medication-col-name">
          <div className="medication-name-wrap">
            <strong className="medication-item-name" title={`药品编码: ${value.code}`}>{value.name}</strong>
            <code className="medication-code-tag">{value.code}</code>
          </div>
        </td>

        <td className="medication-col-type">
          <div className="medication-type-wrap">
            <StatusBadge tone={value.sdMedicationType === 'WESTERN' ? 'info' : value.sdMedicationType === 'HERBAL' ? 'success' : 'neutral'}>
              {value.sdMedicationTypeText}
            </StatusBadge>
            <StatusBadge tone="neutral">{value.sdDoseFormText || '未维护剂型'}</StatusBadge>
          </div>
        </td>

        <td className="medication-col-spec">
          <div className="medication-spec-wrap">
            <strong title={specText}>{specText}</strong>
            {strengthText !== '—' && <small title={`含量/单位: ${strengthText}`}>{strengthText}</small>}
          </div>
        </td>

        <td className="medication-col-usage">
          <div className="medication-usage-wrap">
            <strong>{usageDose || '未设默认剂量'}</strong>
            <small>{usageRouteFreq || '未设途径频次'}</small>
          </div>
        </td>

        <td className="medication-col-safety">
          <div className="medication-safety-tags">
            {safetyTags.length ? safetyTags.map((tag) => (
              <Tooltip key={`${tag.symbol}-${tag.detail}`} content={tag.detail}>
                <span className={`ui-badge ui-badge--${tag.tone} medication-safety-marker`}
                  aria-label={tag.detail} tabIndex={0}>{tag.symbol}</span>
              </Tooltip>
            )) : <small className="medication-safety-normal">普通</small>}
          </div>
        </td>

        <td className="medication-col-products">
          <div className="medication-product-summary-cell">
            {value.products.length > 0 ? (
              <button
                type="button"
                className={`medication-product-count-chip ${activePopoverMedicationId === value.id ? 'is-active' : ''}`}
                onClick={(e) => {
                  if (onTogglePopover) onTogglePopover(value, e.currentTarget)
                  else onViewProducts?.(value)
                }}
                title="点击轻量级查看该药品的厂家产品列表">
                {value.products.length} 个产品 ›
              </button>
            ) : (
              <span className="medication-product-empty-chip">未建档</span>
            )}
            <Button
              size="sm"
              variant="text"
              className="medication-quick-add-btn"
              onClick={() => onProduct(value)}
              title="为该通用药品新增厂家产品">
              +产品
            </Button>
          </div>
        </td>

        <td className="medication-col-status">
          <DataStatus value={value.sdStatus} text={value.sdStatusText} />
        </td>

        <td className="medication-col-actions">
          <RowActions>
            <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑知识</Button>
            <Button size="sm" variant="text" onClick={() => onMappings(value)}>标准映射</Button>
            {onComposition && <Button size="sm" variant="text" onClick={() => onComposition(value)}>成分与含量</Button>}
            <Button size="sm" variant="text" onClick={() => onAttributes(value)}>扩展属性</Button>
          </RowActions>
        </td>
      </tr>
    })}
  </Table>
}

type MedicationSafetyTone = 'warning' | 'success' | 'danger' | 'info' | 'neutral'

function medicationSafetyMarkers(value: MedicationKnowledge) {
  const antimicrobialLevel = value.sdAntimicrobialLevelText || '抗菌药物'
  const antimicrobialSymbol = value.sdAntimicrobialLevel === 'SPECIAL' || antimicrobialLevel.includes('特殊')
    ? '特' : value.sdAntimicrobialLevel === 'NON_RESTRICTED' || antimicrobialLevel.includes('非限制')
      ? '非' : value.sdAntimicrobialLevel === 'RESTRICTED' || antimicrobialLevel.includes('限制') ? '限' : '抗'
  const skinTestMethod = value.skinTestMethod === 'PRICK' ? '点刺试验'
    : value.skinTestMethod === 'OTHER' ? '其他方式' : '皮内试验'
  const solutionMode = value.skinTestSolutionMode === 'ORIGINAL_SOLUTION' ? '原液' : '配制皮试液'
  const skinTestDetail = [
    '需皮试', skinTestMethod, solutionMode,
    value.skinTestObservationMinutes && `观察 ${value.skinTestObservationMinutes} 分钟`,
    value.skinTestResultValidityHours && `结果有效 ${value.skinTestResultValidityHours} 小时`,
    value.skinTestInstructions,
  ].filter(Boolean).join(' · ')

  return [
    value.prescriptionDrug && { symbol: '处', detail: '处方药', tone: 'warning' as const },
    value.essentialDrug && { symbol: '基', detail: '基本药物', tone: 'success' as const },
    value.antimicrobial && { symbol: antimicrobialSymbol, detail: `抗菌药物 · ${antimicrobialLevel}`, tone: 'danger' as const },
    value.antimicrobial && value.antimicrobialOutpatientAllowed === false
      && { symbol: '住', detail: '仅限住院使用，门诊不可常规开立', tone: 'warning' as const },
    value.antimicrobial && value.antimicrobialConsultationRequired
      && { symbol: '审', detail: '需要会诊或审批', tone: 'warning' as const },
    value.antimicrobial && value.antimicrobialEmergencyAllowed
      && { symbol: '急', detail: '允许紧急使用后补审批', tone: 'info' as const },
    value.skinTestRequired && { symbol: '皮', detail: skinTestDetail, tone: 'danger' as const },
    value.chronicDiseaseDrug && { symbol: '慢', detail: '慢病用药', tone: 'info' as const },
    !value.singleOrder && { symbol: '组', detail: '仅限组合开立', tone: 'neutral' as const },
  ].filter(Boolean) as Array<{ symbol: string; detail: string; tone: MedicationSafetyTone }>
}

export function MedicationProductPopover({
  medication,
  anchorRect,
  onClose,
  onProduct,
  onEditProduct,
  onPackage,
  onEditPackage,
  onModeChange,
}: {
  medication: MedicationKnowledge
  anchorRect: DOMRect | null
  onClose: () => void
  onProduct?: (value: MedicationKnowledge) => void
  onEditProduct?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onPackage?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onEditPackage?: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
  onModeChange?: (mode: 'knowledge' | 'product') => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const style = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) return { position: 'fixed', top: '15%', left: '50%', transform: 'translate(-50%, 0)' }

    const width = 450
    const margin = 12

    let left = anchorRect.left - 120
    if (typeof window !== 'undefined') {
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin
      }
      if (left < margin) {
        left = margin
      }
    }

    const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - anchorRect.bottom : 500
    let top = anchorRect.bottom + 6
    if (spaceBelow < 250 && anchorRect.top > 250) {
      top = Math.max(margin, anchorRect.top - 340)
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
    }
  }, [anchorRect])

  const content = (
    <div
      ref={popoverRef}
      className="medication-product-popover"
      style={style}
      role="dialog"
      aria-label={`${medication.name} 厂家产品清单`}
    >
      <header className="medication-product-popover__header">
        <div className="medication-product-popover__title">
          <span>{medication.name} · 厂家产品</span>
          <span className="medication-product-popover__count-badge">{medication.products.length}</span>
        </div>
        <div className="medication-product-popover__header-actions">
          {onProduct && (
            <Button
              size="sm"
              variant="text"
              onClick={() => {
                onClose()
                onProduct(medication)
              }}
              title="为该通用药品新增厂家产品"
            >
              +产品
            </Button>
          )}
          <button
            type="button"
            className="medication-product-popover__close-btn"
            onClick={onClose}
            aria-label="关闭"
            title="关闭 (Esc)"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div className="medication-product-popover__list">
        {medication.products.length === 0 ? (
          <div className="medication-product-popover__empty">
            <p>暂未建档厂家产品</p>
            {onProduct && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose()
                  onProduct(medication)
                }}
              >
                新增厂家产品
              </Button>
            )}
          </div>
        ) : (
          medication.products.map((product) => {
            const tags = [
              product.otc ? { label: 'OTC', tone: 'info' as const } : { label: '处方药', tone: 'warning' as const },
              product.centralPurchase && { label: '集采', tone: 'success' as const },
              product.orderable ? { label: '可开立', tone: 'neutral' as const } : { label: '禁开', tone: 'danger' as const },
            ].filter(Boolean) as Array<{ label: string; tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral' }>

            return (
              <article key={product.id} className="medication-product-popover__item">
                <div className="medication-product-popover__item-head">
                  <span className="medication-product-popover__mfg">
                    {product.manufacturerName || '未关联生产企业'}
                  </span>
                  <div className="medication-product-popover__item-tags">
                    {tags.map((tag) => (
                      <StatusBadge key={tag.label} tone={tag.tone}>
                        {tag.label}
                      </StatusBadge>
                    ))}
                    <DataStatus value={product.sdStatus} text={product.sdStatusText} />
                  </div>
                </div>

                <div className="medication-product-popover__item-body">
                  <div className="medication-product-popover__prod-row">
                    <strong className="medication-product-title">{product.name}</strong>
                    {product.tradeName && (
                      <span className="medication-trade-name">（商品名: {product.tradeName}）</span>
                    )}
                  </div>
                  {product.approvalCode && (
                    <div className="medication-product-popover__approval-row">
                      <span className="medication-product-popover__meta-label">批准文号:</span>
                      <code className="medication-approval-code">{product.approvalCode}</code>
                    </div>
                  )}
                  <div className="medication-product-popover__packages-row">
                    <PackageChips
                      product={product}
                      onEdit={
                        onEditPackage
                          ? (pkg) => {
                              onClose()
                              onEditPackage(pkg, product, medication)
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>

                <div className="medication-product-popover__item-actions">
                  {onEditProduct && (
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => {
                        onClose()
                        onEditProduct(product, medication)
                      }}
                    >
                      编辑产品
                    </Button>
                  )}
                  {onPackage && (
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => {
                        onClose()
                        onPackage(product, medication)
                      }}
                    >
                      加包装
                    </Button>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {onModeChange && (
        <footer className="medication-product-popover__footer">
          <span>编码: {medication.code}</span>
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              onClose()
              onModeChange('product')
            }}
          >
            完整产品视角 ›
          </Button>
        </footer>
      )}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

export function MedicationProductQuickViewDialog({
  medication,
  onClose,
  onProduct,
  onEditProduct,
  onPackage,
  onEditPackage,
  onModeChange,
}: {
  medication: MedicationKnowledge
  onClose: () => void
  onProduct?: (value: MedicationKnowledge) => void
  onEditProduct?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onPackage?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onEditPackage?: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
  onModeChange?: (mode: 'knowledge' | 'product') => void
}) {
  return (
    <Dialog
      title={`${medication.name} · 厂家产品列表`}
      eyebrow={`通用编码: ${medication.code} · ${medication.sdDoseFormText || '通用剂型'} · ${medication.preparationSpec || '通用规格'}`}
      description={`已关联 ${medication.products.length} 个厂家产品与批准文号，以列表方式展示生产企业、包装规格及价格状态。`}
      size="xwide"
      onClose={onClose}
    >
      <div className="medication-quick-view-dialog">
        <div className="medication-quick-view-toolbar">
          <div className="medication-quick-view-summary">
            <span className="medication-quick-view-tag">通用名: <strong>{medication.name}</strong></span>
            <span className="medication-quick-view-tag">类型: <strong>{medication.sdMedicationTypeText}</strong></span>
            {medication.strengthValue && (
              <span className="medication-quick-view-tag">
                含量: <strong>{medication.strengthValue}{medication.strengthUnit || ''}</strong>
              </span>
            )}
            <span className="medication-quick-view-tag">
              厂家产品数: <strong>{medication.products.length} 个</strong>
            </span>
          </div>
          <div className="medication-quick-view-actions">
            {onProduct && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onClose()
                  onProduct(medication)
                }}
              >
                + 新增厂家产品
              </Button>
            )}
            {onModeChange && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose()
                  onModeChange('product')
                }}
                title="切换到产品信息视角进行全局筛选与维护"
              >
                完整产品视角 ›
              </Button>
            )}
          </div>
        </div>

        {medication.products.length === 0 ? (
          <EmptyState
            icon="pharmacy"
            title="暂无厂家产品"
            copy="该通用药品尚未建档具体的生产企业和批准文号产品。"
            action={
              onProduct ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose()
                    onProduct(medication)
                  }}
                >
                  立即为「{medication.name}」新增产品
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="medication-quick-view-table-wrap">
            <Table
              headers={['厂家产品 / 生产企业', '产品编码', '批准文号', '包装规格与换算', '属性标签', '状态', '操作']}
              className="medication-quick-view-table"
            >
              {medication.products.map((product) => {
                const tags = [
                  product.otc ? { label: 'OTC', tone: 'info' as const } : { label: '处方药', tone: 'warning' as const },
                  product.centralPurchase && { label: '集采', tone: 'success' as const },
                  product.orderable ? { label: '可开立', tone: 'neutral' as const } : { label: '禁开', tone: 'danger' as const },
                  product.traceCode && { label: '追溯码', tone: 'neutral' as const },
                ].filter(Boolean) as Array<{ label: string; tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral' }>

                return (
                  <tr key={product.id} className="medication-quick-view-row">
                    <td className="medication-quick-view-col-product">
                      <div className="medication-product-info">
                        <strong className="medication-product-title">{product.name}</strong>
                        <div className="medication-quick-view-sub">
                          <small className="medication-manufacturer-name">
                            {product.manufacturerName || '未关联生产企业'}
                          </small>
                          {product.tradeName && (
                            <small className="medication-trade-name">（商品名: {product.tradeName}）</small>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="medication-quick-view-col-code">
                      <code className="medication-code-tag">{product.code}</code>
                    </td>

                    <td className="medication-quick-view-col-approval">
                      {product.approvalCode ? (
                        <code className="medication-approval-code" title={product.approvalCode}>
                          {product.approvalCode}
                        </code>
                      ) : (
                        <span className="medication-empty-text">—</span>
                      )}
                    </td>

                    <td className="medication-quick-view-col-packages">
                      <PackageChips
                        product={product}
                        onEdit={
                          onEditPackage
                            ? (item) => {
                                onClose()
                                onEditPackage(item, product, medication)
                              }
                            : undefined
                        }
                      />
                    </td>

                    <td className="medication-quick-view-col-tags">
                      <div className="medication-safety-tags">
                        {tags.map((tag) => (
                          <StatusBadge key={tag.label} tone={tag.tone}>
                            {tag.label}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>

                    <td className="medication-quick-view-col-status">
                      <DataStatus value={product.sdStatus} text={product.sdStatusText} />
                    </td>

                    <td className="medication-quick-view-col-actions">
                      <RowActions>
                        {onEditProduct && (
                          <Button
                            size="sm"
                            variant="text"
                            onClick={() => {
                              onClose()
                              onEditProduct(product, medication)
                            }}
                          >
                            编辑产品
                          </Button>
                        )}
                        {onPackage && (
                          <Button
                            size="sm"
                            variant="text"
                            onClick={() => {
                              onClose()
                              onPackage(product, medication)
                            }}
                          >
                            加包装
                          </Button>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </Table>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function MedicationProductTable({ values, pagination, onModeChange, onProduct, onEditProduct, onPackage, onEditPackage }: {
  values: MedicationKnowledge[]; pagination: ReactNode;
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onProduct: (value: MedicationKnowledge) => void;
  onEditProduct: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onPackage: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onEditPackage: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
}) {
  const productEntries = values.flatMap((medication) =>
    medication.products.map((product) => ({ product, medication }))
  )
  const unmappedMedications = values.filter((m) => m.products.length === 0)

  if (productEntries.length === 0) {
    return (
      <TableShell scrollClassName="master-data-table-wrap" footer={pagination}>
        <EmptyState
          icon="pharmacy"
          title="当前页通用药品暂无厂家产品"
          copy={`当前页共 ${values.length} 种通用药品知识，均尚未建档具体生产企业与批准文号产品。`}
          action={
            <div className="medication-empty-actions">
              <Button onClick={() => onModeChange?.('knowledge')}>返回基本信息视角</Button>
              {values[0] && (
                <Button variant="secondary" onClick={() => onProduct(values[0])}>
                  为「{values[0].name}」新增产品
                </Button>
              )}
            </div>
          }
        />
      </TableShell>
    )
  }

  return (
    <>
      <Table
        headers={['厂家产品 / 生产企业', '所属通用药品', '剂型规格 / 含量', '批准文号', '包装规格与换算', '中心状态', '操作']}
        footer={pagination}
        className="medication-product-table">
        {productEntries.map(({ product, medication }) => (
          <tr key={product.id} className="medication-product-row">
            <td className="medication-col-product">
              <div className="medication-product-info">
                <strong className="medication-product-title">{product.name}</strong>
                <small className="medication-manufacturer-name">
                  {product.manufacturerName || '未关联生产企业'}
                </small>
              </div>
            </td>

            <td className="medication-col-parent">
              <div className="medication-parent-info">
                <strong className="medication-parent-name" title={`所属通用名: ${medication.name}`}>
                  {medication.name}
                </strong>
                <div className="medication-parent-meta">
                  <code>{medication.code}</code>
                  <span> · {medication.sdMedicationTypeText}</span>
                </div>
              </div>
            </td>

            <td className="medication-col-formspec">
              <div className="medication-formspec-info">
                <strong>{medication.sdDoseFormText || '未设剂型'}{medication.preparationSpec ? ` · ${medication.preparationSpec}` : ''}</strong>
                {medication.strengthValue && (
                  <small>{`${medication.strengthValue} ${medication.strengthUnit || ''}`.trim()}</small>
                )}
              </div>
            </td>

            <td className="medication-col-approval">
              {product.approvalCode ? (
                <code className="medication-approval-code" title={product.approvalCode}>{product.approvalCode}</code>
              ) : (
                <span className="medication-empty-text">—</span>
              )}
            </td>

            <td className="medication-col-packages">
              <PackageChips product={product} onEdit={(item) => onEditPackage(item, product, medication)} />
            </td>

            <td className="medication-col-status">
              <DataStatus value={product.sdStatus} text={product.sdStatusText} />
            </td>

            <td className="medication-col-actions">
              <RowActions>
                <Button size="sm" variant="text" onClick={() => onEditProduct(product, medication)}>编辑产品</Button>
                <Button size="sm" variant="text" onClick={() => onPackage(product, medication)}>加包装</Button>
              </RowActions>
            </td>
          </tr>
        ))}
      </Table>

      {unmappedMedications.length > 0 && (
        <div className="medication-unmapped-banner">
          <div className="medication-unmapped-text">
            <span>当前页还有 <strong>{unmappedMedications.length}</strong> 个通用药品尚未建档厂家产品：</span>
            <small>{unmappedMedications.slice(0, 4).map((m) => m.name).join('、')}{unmappedMedications.length > 4 ? ' 等' : ''}</small>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onModeChange?.('knowledge')}>
            前往基本信息视角查看与建档
          </Button>
        </div>
      )}
    </>
  )
}

export function medicationSummary(value: MedicationKnowledge, routes: MedicationRoute[], frequencies: ActiveOrderFrequency[]) {
  const herbal = value.sdMedicationType === 'HERBAL'
  const vaccine = value.sdMedicationType === 'VACCINE'
  const routeName = value.defaultRoute
    ? routes.find((route) => route.code === value.defaultRoute)?.name ?? value.defaultRoute : undefined
  const frequencyName = value.defaultFrequency
    ? frequencies.find((frequency) => frequency.code === value.defaultFrequency)?.name ?? value.defaultFrequency : undefined
  const storageText = formatStorageType(value.sdStorageTypeText, value.sdStorageType)
  return [
    { label: herbal ? '炮制规格' : vaccine ? '剂量规格' : '规格',
      value: [value.preparationSpec, storageText].filter(Boolean).join(' · ') || '—' },
    { label: herbal ? '调剂单位' : vaccine ? '每剂含量' : '含量',
      value: herbal ? (value.preparationUnit || '—')
        : value.strengthValue ? `${value.strengthValue} ${value.strengthUnit || ''}`.trim() : '—' },
    { label: vaccine ? '剂量 / 途径' : '用法',
      value: [value.defaultDose && `${value.defaultDose}${value.defaultDoseUnit || ''}`, routeName,
        vaccine ? undefined : frequencyName].filter(Boolean).join(' · ') || '—' },
    { label: '安全',
      value: [value.prescriptionDrug && '处方药', value.essentialDrug && '基本药物',
        value.antimicrobial && (value.sdAntimicrobialLevelText || '抗菌药'), value.skinTestRequired && '需皮试',
        value.chronicDiseaseDrug && '慢病用药', !value.singleOrder && '仅组合使用'].filter(Boolean).join(' · ') || '普通' },
  ]
}

const storageTypeLabelMap: Record<string, string> = {
  NORMAL: '常温',
  ROOM_TEMPERATURE: '常温',
  COLD_CHAIN: '冷链',
  COOL: '阴凉',
  COOL_DARK: '凉暗',
  REFRIGERATED: '冷藏',
  FROZEN: '冷冻',
  DRY: '干燥',
  DARK: '避光',
}

function formatStorageType(text?: string | null, code?: string | null): string | undefined {
  if (text && storageTypeLabelMap[text]) {
    return storageTypeLabelMap[text]
  }
  if (text && text !== code) {
    return text
  }
  if (code && storageTypeLabelMap[code]) {
    return storageTypeLabelMap[code]
  }
  return text || code || undefined
}

function ensureStorageTypeValues(values: DictionaryValue[] = []): DictionaryValue[] {
  const existingCodes = new Set(values.map((v) => v.code))
  const additions: DictionaryValue[] = [
    { code: 'ROOM_TEMPERATURE', name: '常温', sortOrder: 10, attributes: {} },
    { code: 'COLD_CHAIN', name: '冷链', sortOrder: 20, attributes: {} },
    { code: 'COOL', name: '阴凉', sortOrder: 30, attributes: {} },
    { code: 'REFRIGERATED', name: '冷藏', sortOrder: 40, attributes: {} },
    { code: 'FROZEN', name: '冷冻', sortOrder: 50, attributes: {} },
    { code: 'DRY', name: '干燥', sortOrder: 60, attributes: {} },
    { code: 'COOL_DARK', name: '凉暗', sortOrder: 70, attributes: {} },
    { code: 'DARK', name: '避光', sortOrder: 80, attributes: {} },
  ]
  const merged = [...values]
  for (const item of additions) {
    if (!existingCodes.has(item.code)) {
      merged.push(item)
    }
  }
  return merged.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

function PackageChips({ product, onEdit }: { product: MedicationProduct; onEdit?: (value: ItemPackage) => void }) {
  if (!product.packages.length) return <span className="medication-packages__empty">未维护</span>
  return <div className="medication-packages">{product.packages.map((item) => {
    const marks = [item.defaultPurchase && '采', item.defaultSale && '销', item.defaultDispense && '发']
      .filter(Boolean).join('')
    const label = item.packageSpec || `${item.unitName} = ${item.quantityFactor}${product.unitCode || '最小单位'}`
    const hint = `${item.sdUsageTypeText}${item.barcode ? ` · 条码 ${item.barcode}` : ''}${onEdit ? ' · 点击编辑包装' : ''}`
    return onEdit ? <button type="button" className="medication-package" key={item.id} title={hint}
      onClick={() => onEdit(item)}>{label}{marks && <small>{marks}</small>}</button>
      : <span className="medication-package" key={item.id} title={hint}>{label}{marks && <small>{marks}</small>}</span>
  })}</div>
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

export function CatalogLifecycleDialog({ api, catalogItemId, itemName, organization, packages = [], dictionaries,
  defaults, onClose, onChanged }: { api: RhnApi; catalogItemId: string; itemName: string; organization: Organization;
  packages?: Array<{ id: string; packageSpec?: string; unitName: string }>; dictionaries: DictionaryMap;
  defaults: AdoptionDefaults; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const [businessDate, setBusinessDate] = useState(today())
  const editorsRef = useRef<HTMLDivElement>(null)
  const [replacementAdoption, setReplacementAdoption] = useState<OrganizationAdoption>()
  const [replacementPrice, setReplacementPrice] = useState<CatalogPrice>()
  const [pending, setPending] = useState('')
  const [operationError, setOperationError] = useState('')
  const maintenance = useQuery({
    queryKey: ['catalog-lifecycle', catalogItemId, organization.id, businessDate],
    queryFn: () => api.masterData.catalogLifecycle(catalogItemId, organization.id, businessDate),
  })
  const departments = useQuery({
    queryKey: ['organization-catalog-departments', organization.id],
    queryFn: () => api.organization.departments(organization.id),
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
    setReplacementAdoption(value); setReplacementPrice(undefined)
    editorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const startPriceReplacement = (value: CatalogPrice) => {
    setReplacementPrice(value); setReplacementAdoption(undefined)
    editorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const packageLabel = (id?: string | null) => {
    if (!id) return '最小单位拆零'
    const item = packages.find((entry) => entry.id === id)
    return item ? (item.packageSpec || item.unitName) : '指定包装'
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
    size="xwide" onClose={onClose} description="按业务日期查看当前版本；在下方调整机构能力或价格，新版本生效时被替代版本自动截止到前一天，旧记录保持可追溯。"
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    <div className="master-data-lifecycle-dialog">
      {(operationError || maintenance.error) && <Alert>{operationError || errorMessage(maintenance.error)}</Alert>}
      <section className="master-data-lifecycle-status">
        <FormField label="业务日期"><input type="date" value={businessDate}
          onChange={(event) => setBusinessDate(event.target.value)} /></FormField>
        {maintenance.isPending ? <LoadingState label="正在解析机构目录与价格…" /> : <>
          <div className="master-data-lifecycle-status__item"><span>机构目录</span>
            {values?.currentAdoption ? <><DataStatus value={values.currentAdoption.sdStatus}
              text={values.currentAdoption.sdStatusText} />
              <strong>{values.currentAdoption.localName || itemName}</strong>
              <code>{values.currentAdoption.localCode || '沿用中心编码'}</code></>
              : <StatusBadge>未采用</StatusBadge>}</div>
          <div className="master-data-lifecycle-status__item"><span>有效价格</span>
            {values?.currentPrices.length ? values.currentPrices.map((value) => <strong key={value.id}>
              ¥ {Number(value.price).toFixed(2)}<small>{value.sdPriceTypeText} · {packageLabel(value.packageId)}</small></strong>)
              : <span className="master-data-lifecycle-status__empty">未维护</span>}</div>
        </>}
      </section>

      <div className="master-data-lifecycle-editors" ref={editorsRef}>
      <section className="master-data-lifecycle-editor">
        <header><div><h3>{replacementAdoption ? '以当前目录为基准调整' : '调整机构目录'}</h3>
          <p>本地编码、显示名称与机构可用能力；新版本生效时被替代版本自动截止到前一天。</p></div></header>
        <form key={`adoption-${adoptionSeed?.id ?? 'new'}-${adoptionSeed?.revision ?? 0}`}
          className="master-data-lifecycle-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget)
            const input: LifecycleAdoptionInput = { organizationId: organization.id,
              defaultDepartmentId: optionalText(form, 'defaultDepartmentId'), localCode: optionalText(form, 'localCode'),
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
          <StaticSelectField name="defaultDepartmentId" label="默认科室" required={false}
            defaultValue={adoptionSeed?.defaultDepartmentId} options={(departments.data ?? []).map((value) => ({
              value: value.id, label: `${value.name}（${value.code}）`,
            }))} />
          <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
            fromDefault={replacementAdoption ? nextDate(replacementAdoption.validFrom) : today()} />
          <Checkboxes title="机构可用能力">
            {(['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
              .map((key) => <Checkbox key={key} name={key} label={capabilityLabel(key)}
                defaultChecked={adoptionSeed?.[key] ?? defaults[key]} />)}
          </Checkboxes><div className="master-data-lifecycle-editor-actions"><Button type="submit"
            busy={pending === 'save-adoption'}>{replacementAdoption ? '保存替代版本' : '保存并生效'}</Button></div>
        </form>
      </section>
      <section className="master-data-lifecycle-editor">
        <header><div><h3>{replacementPrice ? '以当前价格为基准调价' : '调整价格'}</h3>
          <p>按包装或最小单位计价；新版本生效时被替代价格自动截止到前一天。</p></div></header>
        <form key={`price-${priceSeed?.id ?? 'new'}-${priceSeed?.revision ?? 0}`}
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
            defaultValue={priceSeed?.packageId} placeholder="最小单位（拆零计价）" options={packages.map((item) => ({
              value: item.id, label: item.packageSpec || item.unitName,
            }))} />}
          <p className="master-data-field-hint span-2">选择包装时按盒、瓶等包装计价；不选择包装时按产品最小单位计价，供允许拆零销售的处方使用。</p>
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
            {replacementPrice ? '保存调价版本' : '保存并生效'}</Button></div>
        </form>
      </section>
      </div>

      <section className="master-data-lifecycle-history">
        <header><h3>机构目录历史</h3><p>包含启用、暂停、停用及被替代版本。</p></header>
        {!values?.adoptionHistory.length ? <EmptyState icon="clinical" title="暂无机构目录历史" copy="可在上方表单维护首个版本。" />
          : <Table compact headers={['本地目录', '业务能力', '有效期', '状态', '操作']}>{values.adoptionHistory.map((value) =>
            <tr key={`${value.id}-${value.revision}`}><td><strong>{value.localName || itemName}</strong><code>{value.localCode || '沿用中心编码'}</code></td>
              <td>{capabilityShortLabels(value).join(' · ') || '未开放'}</td><td>{value.validFrom} 起 · {value.validTo ? `至 ${value.validTo}` : '长期'}</td>
              <td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td><td><RowActions>
                {value.sdStatus === 'ACTIVE' && <><Button size="sm" variant="text" onClick={() => startAdoptionReplacement(value)}>替代</Button>
                  <Button size="sm" variant="text" busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'SUSPENDED')}>暂停</Button>
                  <Button size="sm" variant="text" busy={pending === `a-${value.id}`} onClick={() => void changeAdoptionStatus(value, 'RETIRED')}>停用</Button></>}
                {value.sdStatus === 'SUSPENDED' && <Button size="sm" variant="text" busy={pending === `a-${value.id}`}
                  onClick={() => void changeAdoptionStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td></tr>)}</Table>}
      </section>
      <section className="master-data-lifecycle-history">
        <header><h3>价格历史</h3><p>包装价格与最小单位拆零价格均保留完整调价链。</p></header>
        {!values?.priceHistory.length ? <EmptyState icon="clinical" title="暂无价格历史" copy="可在上方表单新增价格。" />
          : <Table compact headers={['价格 / 类型', '计价范围', '依据', '有效期', '状态', '操作']}>{values.priceHistory.map((value) =>
            <tr key={`${value.id}-${value.revision}`}><td><strong className="master-data-price">¥ {Number(value.price).toFixed(2)}</strong><small>{value.sdPriceTypeText}</small></td>
              <td>{packageLabel(value.packageId)}</td><td>{value.priceDocumentCode || '—'}<small>{value.priceReason || '未说明'}</small></td>
              <td>{value.validFrom} 起 · {value.validTo ? `至 ${value.validTo}` : '长期'}</td><td><DataStatus value={value.sdStatus} text={value.sdStatusText} /></td>
              <td><RowActions>{value.sdStatus === 'ACTIVE' && <><Button size="sm" variant="text" onClick={() => startPriceReplacement(value)}>调价</Button>
                <Button size="sm" variant="text" busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'SUSPENDED')}>暂停</Button>
                <Button size="sm" variant="text" busy={pending === `p-${value.id}`} onClick={() => void changePriceStatus(value, 'RETIRED')}>停用</Button></>}
                {value.sdStatus === 'SUSPENDED' && <Button size="sm" variant="text" busy={pending === `p-${value.id}`}
                  onClick={() => void changePriceStatus(value, 'ACTIVE')}>恢复</Button>}</RowActions></td></tr>)}</Table>}
      </section>
    </div>
  </Dialog>
}

export function OrganizationCatalogImportDialog({ api, organization, initialItemType, onClose, onCompleted }: {
  api: RhnApi; organization: Organization; initialItemType: 'SERVICE' | 'MED_PRODUCT'
  onClose: () => void; onCompleted: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const [itemType, setItemType] = useState<'SERVICE' | 'MED_PRODUCT'>(initialItemType)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<Map<string, CatalogAdoptionCandidate>>(new Map())
  const [pending, setPending] = useState(false)
  const [operationError, setOperationError] = useState('')
  const [feedback, setFeedback] = useState('')
  const candidates = useQuery({
    queryKey: ['master-data-adoption-candidates', organization.id, itemType, query, page, pageSize],
    queryFn: () => api.masterData.adoptionCandidates(organization.id, itemType, query, page, pageSize),
  })
  useEffect(() => { setPage(0); setSelected(new Map()) }, [itemType, query, pageSize])
  const values = candidates.data?.content ?? []
  const totalPages = Math.max(1, candidates.data?.totalPages ?? 1)
  const toggle = (value: CatalogAdoptionCandidate) => setSelected((current) => {
    const next = new Map(current)
    if (next.has(value.id)) next.delete(value.id); else next.set(value.id, value)
    return next
  })
  const selectable = values.filter((value) => value.adoptionSourceType !== 'LOCAL')
  const submit = async (form: FormData) => {
    if (!selected.size) { setOperationError('请至少选择一个待调入项目'); return }
    setPending(true); setOperationError(''); setFeedback('')
    try {
      await api.masterData.adoptionBatch({ requestCode: crypto.randomUUID(), operationType: 'ADOPT',
        organizationId: organization.id, businessDate: text(form, 'businessDate'),
        catalogItemIds: [...selected.keys()], template: { localCode: undefined, localName: undefined,
          orderable: checked(form, 'orderable'), executable: checked(form, 'executable'),
          chargeable: checked(form, 'chargeable'), purchasable: checked(form, 'purchasable'),
          stocked: checked(form, 'stocked'), dispensable: checked(form, 'dispensable'),
          returnable: checked(form, 'returnable'), status: 'ACTIVE' } })
      setSelected(new Map()); setFeedback(`已调入 ${selected.size} 个项目`)
      await queryClient.invalidateQueries({ queryKey: ['master-data-adoption-candidates'] })
      await onCompleted()
    } catch (error) { setOperationError(errorMessage(error)) } finally { setPending(false) }
  }
  return <Dialog title="机构项目调入" eyebrow={organization.name} size="xwide" onClose={onClose}>
    <div className="master-data-catalog-import">
      {operationError && <Alert>{operationError}</Alert>}
      {feedback && <Alert tone="success">{feedback}</Alert>}
      <form className="master-data-batch-lifecycle" onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)) }}>
        <section className="master-data-batch-picker"><header><div><h3>中心目录</h3><p>已选择 {selected.size} 项</p></div>
          <Button size="sm" variant="text" disabled={!selectable.length} onClick={() => setSelected((current) => {
            const next = new Map(current); selectable.forEach((value) => next.set(value.id, value)); return next
          })}>选择本页待调入项</Button></header>
          <Tabs value={itemType} onChange={(value) => setItemType(value as 'SERVICE' | 'MED_PRODUCT')}
            label="目录类型" variant="line" items={[{ value: 'SERVICE', label: '诊疗项目' }, { value: 'MED_PRODUCT', label: '药品产品' }]} />
          <SearchField label="搜索中心目录" value={query} onChange={setQuery} placeholder="项目名称或编码" />
          {candidates.isPending ? <LoadingState label="正在读取中心目录…" /> : !values.length
            ? <EmptyState icon="clinical" title="没有匹配项目" copy="请调整搜索条件。" />
            : <div className="master-data-catalog-candidates">{values.map((value) => {
              const local = value.adoptionSourceType === 'LOCAL'
              return <label key={value.id} className={local ? 'is-disabled' : ''}><input type="checkbox"
                disabled={local} checked={selected.has(value.id)} onChange={() => toggle(value)} />
                <span><strong>{value.name}</strong><code>{value.code}</code></span>
                <StatusBadge tone={value.adoptionSourceType === 'LOCAL' ? 'success'
                  : value.adoptionSourceType === 'SHARED' ? 'warning' : 'neutral'}>
                  {value.adoptionSourceType === 'LOCAL' ? '本机构' : value.adoptionSourceType === 'SHARED' ? '共享' : '未调入'}
                </StatusBadge></label>
            })}</div>}
          <Pagination page={candidates.data?.page ?? page} totalPages={totalPages}
            total={candidates.data?.totalElements ?? 0} pageSize={pageSize} onPageSizeChange={setPageSize}
            onChange={setPage} label="中心目录分页" />
        </section>
        <section className="master-data-batch-config"><header><h3>本机构能力</h3></header>
          <div className="master-data-lifecycle-form"><FormField label="生效日期" required>
            <input name="businessDate" type="date" defaultValue={today()} required /></FormField>
            <Checkboxes key={itemType} title="允许的业务范围">
              <Checkbox name="orderable" label="允许开立" defaultChecked />
              <Checkbox name="executable" label="允许执行" defaultChecked={itemType === 'SERVICE'} />
              <Checkbox name="chargeable" label="允许收费" defaultChecked />
              <Checkbox name="purchasable" label="允许采购" defaultChecked={itemType === 'MED_PRODUCT'} />
              <Checkbox name="stocked" label="允许入库" defaultChecked={itemType === 'MED_PRODUCT'} />
              <Checkbox name="dispensable" label="允许发放" defaultChecked={itemType === 'MED_PRODUCT'} />
              <Checkbox name="returnable" label="允许退药/退库" defaultChecked={itemType === 'MED_PRODUCT'} />
            </Checkboxes>
          </div><div className="master-data-lifecycle-editor-actions"><Button type="submit"
            disabled={!selected.size} busy={pending}>调入所选项目</Button></div>
        </section>
      </form>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>关闭</Button></div>
    </div>
  </Dialog>
}

function capabilityLabel(value: keyof AdoptionDefaults) {
  return ({ orderable: '允许开立', executable: '允许执行', chargeable: '允许收费', purchasable: '允许采购',
    stocked: '允许入库', dispensable: '允许发放', returnable: '允许退药/退库' } as const)[value]
}
function capabilityShortLabels(value: OrganizationAdoption) {
  const short: Record<keyof AdoptionDefaults, string> = { orderable: '开立', executable: '执行', chargeable: '收费',
    purchasable: '采购', stocked: '入库', dispensable: '发放', returnable: '退药/退库' }
  return (['orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable'] as const)
    .filter((key) => value[key]).map((key) => short[key])
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
    onSubmit={(form) => onSave({ codeSystemId: value?.codeSystemId || text(form, 'codeSystemId'), code: (value?.code || text(form, 'code')).trim(),
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
        {value && <input type="hidden" name="code" value={value.code} />}
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

function DiseaseManagementProgramDialog({ dictionaries, value, onClose, onSave }: {
  dictionaries: DictionaryMap; value?: DiseaseManagementProgram; onClose: () => void
  onSave: (input: DiseaseManagementProgramInput) => void
}) {
  return <DataFormDialog title={value ? '编辑疾病管理项目' : '新增疾病管理项目'} eyebrow="疾病管理分类"
    size="xwide" onClose={onClose}
    description="管理项目可以关联多个疾病；诊断命中后只生成受控提示或草稿，不会静默完成纳管和上报。"
    onSubmit={(form) => onSave({ productScope: value?.scopeType === 'PRODUCT',
      code: (value?.code || text(form, 'code')).trim(), name: text(form, 'name'),
      sdManagementType: text(form, 'sdManagementType') as DiseaseManagementProgramInput['sdManagementType'],
      sdTriggerAction: text(form, 'sdTriggerAction') as DiseaseManagementProgramInput['sdTriggerAction'],
      description: optionalText(form, 'description'), reportCardType: optionalText(form, 'reportCardType'),
      reportDeadlineHours: optionalNumber(form, 'reportDeadlineHours'), effectiveFrom: text(form, 'effectiveFrom'),
      effectiveTo: optionalText(form, 'effectiveTo') })}>
    <FormSection title="项目身份" description="项目编码创建后不可修改；租户项目只在当前租户内生效。">
      <FormGrid columns={3}>
        <FormField label="项目编码" required><input name="code" defaultValue={value?.code}
          disabled={Boolean(value)} placeholder="如 CHRONIC_COPD" required /></FormField>
        {value && <input type="hidden" name="code" value={value.code} />}
        <FormField label="项目名称" required className="span-2"><input name="name" defaultValue={value?.name}
          placeholder="如 慢阻肺慢病管理" required /></FormField>
        <SelectField name="sdManagementType" label="管理类别" values={dictionaries.BD_DISEASE_MANAGEMENT_TYPE}
          defaultValue={value?.sdManagementType ?? 'CHRONIC_CARE'} />
        <SelectField name="sdTriggerAction" label="诊断触发动作" values={dictionaries.BD_DISEASE_TRIGGER_ACTION}
          defaultValue={value?.sdTriggerAction ?? 'PROMPT_CONFIRMATION'} />
        <FormField label="当前作用域"><input value={value?.scopeType === 'PRODUCT' ? '平台公共' : '当前租户'} disabled /></FormField>
      </FormGrid>
    </FormSection>
    <FormSection title="报告与有效期" description="疾病报告信息为空时，由医生按当前适用规则确认具体时限。">
      <FormGrid columns={3}>
        <FormField label="报卡类型"><input name="reportCardType" defaultValue={value?.reportCardType}
          placeholder="如 INFECTIOUS_DISEASE" /></FormField>
        <FormField label="报告时限（小时）"><input name="reportDeadlineHours" type="number" min="1"
          defaultValue={value?.reportDeadlineHours} placeholder="按规则选填" /></FormField>
        <span />
        <DateRangeFields fromName="effectiveFrom" toName="effectiveTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={value?.effectiveFrom} toDefault={value?.effectiveTo} />
        <FormField label="规则说明" className="span-3"><textarea name="description" rows={3}
          defaultValue={value?.description} placeholder="说明纳入条件、人工确认边界和后续责任岗位" /></FormField>
      </FormGrid>
    </FormSection>
  </DataFormDialog>
}

type EditableDiseaseRule = DiseaseManagementRule & { key: string }

function DiseaseManagementMembersDialog({ program, api, dictionaries, codeSystems, onClose, onSave }: {
  program: DiseaseManagementProgram; api: RhnApi; dictionaries: DictionaryMap; codeSystems: CodeSystemSummary[]
  onClose: () => void
  onSave: (rules: DiseaseManagementRule[], exceptions: DiseaseManagementExceptionInput[]) => void
}) {
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('')
  const [page, setPage] = useState(0)
  const [rules, setRules] = useState<EditableDiseaseRule[]>(() => program.rules.map((rule) => ({
    ...rule, key: rule.id ?? crypto.randomUUID(),
  })))
  const [exceptions, setExceptions] = useState(() => new Map(program.members.map((item) => [item.conceptId, {
    conceptId: item.conceptId, inclusionMode: item.inclusionMode, note: '', display: item.display,
    code: item.code, systemName: item.systemName, domainText: item.sdDiagnosisDomainText,
  }])))
  useEffect(() => setPage(0), [domain, query])
  const search = useQuery({
    queryKey: ['disease-management-scope-search', query, domain, page],
    queryFn: () => api.masterData.searchDiseases(query.trim(), '', 'ACTIVE', domain, page, 10),
    enabled: query.trim().length >= 2,
  })
  const addRule = () => setRules((current) => [...current, {
    key: crypto.randomUUID(), inclusionMode: 'INCLUDE', sdDiagnosisDomain: 'WESTERN_MEDICINE',
  }])
  const updateRule = (key: string, field: keyof DiseaseManagementRule, value: string) => setRules((current) =>
    current.map((rule) => rule.key === key ? { ...rule, [field]: value || undefined } : rule))
  const addException = (disease: DiseaseConcept, inclusionMode: 'INCLUDE' | 'EXCLUDE') =>
    setExceptions((current) => new Map(current).set(disease.id, { conceptId: disease.id, inclusionMode, note: '',
      display: disease.display, code: disease.code, systemName: disease.systemName,
      domainText: disease.sdDiagnosisDomainText }))
  const domainOptions = options(dictionaries, 'BD_DIAGNOSIS_DOMAIN')
  const conceptTypeOptions = options(dictionaries, 'BD_CONCEPT_TYPE')
  const exceptionValues = [...exceptions.values()]
  return <Dialog title="配置疾病识别范围" eyebrow={program.name} size="xwide" onClose={onClose}
    description="使用规则覆盖大批量疾病，只为少数特殊疾病配置精确例外；精确例外的优先级最高。">
    <div className="disease-scope-editor">
      <section className="disease-scope-section">
        <div className="disease-scope-section__head"><div><h3>批量识别规则</h3>
          <p>同一行内的条件同时满足，多条“纳入”规则取并集；命中“排除”规则时不纳入。</p></div>
          <Button variant="secondary" size="sm" onClick={addRule}><Icon name="add" />新增规则</Button></div>
        {!rules.length && <Alert tone="info">尚未配置批量规则。可以按诊断体系、编码体系、疾病类型、章节或编码范围建立规则。</Alert>}
        <div className="disease-rule-list">{rules.map((rule, index) => <div className="disease-rule-card" key={rule.key}>
          <div className="disease-rule-card__title"><strong>规则 {index + 1}</strong>
            <StatusBadge tone={rule.inclusionMode === 'INCLUDE' ? 'success' : 'warning'}>
              {rule.inclusionMode === 'INCLUDE' ? '纳入' : '排除'}</StatusBadge>
            <Button variant="text" size="sm" onClick={() => setRules((current) => current.filter((item) => item.key !== rule.key))}>删除</Button></div>
          <div className="disease-rule-grid">
            <FormField label="处理方式"><Select value={rule.inclusionMode}
              onChange={(value) => updateRule(rule.key, 'inclusionMode', value)} options={[
                { value: 'INCLUDE', label: '纳入' }, { value: 'EXCLUDE', label: '排除' },
              ]} /></FormField>
            <FormField label="诊断体系"><Select value={rule.sdDiagnosisDomain ?? ''}
              onChange={(value) => updateRule(rule.key, 'sdDiagnosisDomain', value)}
              placeholder="不限" options={domainOptions} /></FormField>
            <FormField label="编码体系"><Select value={rule.codeSystemId ?? ''}
              onChange={(value) => updateRule(rule.key, 'codeSystemId', value)} placeholder="不限"
              options={codeSystems.map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))} /></FormField>
            <FormField label="疾病类型"><Select value={rule.sdConceptType ?? ''}
              onChange={(value) => updateRule(rule.key, 'sdConceptType', value)}
              placeholder="不限" options={conceptTypeOptions} /></FormField>
            <FormField label="章节编码"><input value={rule.chapterCode ?? ''} placeholder="如 I"
              onChange={(event) => updateRule(rule.key, 'chapterCode', event.target.value)} /></FormField>
            <FormField label="编码起始"><input value={rule.codeFrom ?? ''} placeholder="如 I10"
              onChange={(event) => updateRule(rule.key, 'codeFrom', event.target.value)} /></FormField>
            <FormField label="编码结束"><input value={rule.codeTo ?? ''} placeholder="如 I15.9"
              onChange={(event) => updateRule(rule.key, 'codeTo', event.target.value)} /></FormField>
            <FormField label="规则说明"><input value={rule.note ?? ''} placeholder="便于后续审查"
              onChange={(event) => updateRule(rule.key, 'note', event.target.value)} /></FormField>
          </div>
        </div>)}</div>
      </section>

      <section className="disease-scope-section">
        <div className="disease-scope-section__head"><div><h3>精确疾病例外</h3>
          <p>仅维护规则无法表达的特殊疾病；可明确纳入，也可从规则结果中明确排除。</p></div>
          <span>{exceptionValues.length} 个例外</span></div>
        {!!exceptionValues.length && <div className="disease-exception-list">{exceptionValues.map((item) => <div key={item.conceptId}>
          <span><strong>{item.display}</strong><small>{item.domainText} · {item.systemName}</small></span><code>{item.code}</code>
          <Select value={item.inclusionMode} options={[{ value: 'INCLUDE', label: '明确纳入' }, { value: 'EXCLUDE', label: '明确排除' }]}
            onChange={(value) => setExceptions((current) => {
              const next = new Map(current); next.set(item.conceptId, { ...item, inclusionMode: value as 'INCLUDE' | 'EXCLUDE' }); return next
            })} />
          <Button variant="text" size="sm" onClick={() => setExceptions((current) => {
            const next = new Map(current); next.delete(item.conceptId); return next
          })}>移除</Button></div>)}</div>}
        <div className="disease-management-member-toolbar">
          <SearchField label="查找精确疾病" value={query} onChange={setQuery} placeholder="至少输入 2 个字符，支持名称、编码或拼音码" />
          <Select value={domain} onChange={setDomain} placeholder="全部诊断体系" options={domainOptions} />
          <span>{query.trim().length < 2 ? '输入关键词后检索' : search.isFetching ? '正在检索…' : `共 ${search.data?.totalElements ?? 0} 条`}</span>
        </div>
        {query.trim().length >= 2 && <div className="disease-search-results">
          {search.data?.content.map((disease) => <div key={disease.id}><span><strong>{disease.display}</strong>
            <small>{disease.sdDiagnosisDomainText} · {disease.systemName}</small></span><code>{disease.code}</code>
            <Button variant="secondary" size="sm" onClick={() => addException(disease, 'INCLUDE')}>明确纳入</Button>
            <Button variant="text" size="sm" onClick={() => addException(disease, 'EXCLUDE')}>明确排除</Button></div>)}
          {!search.isFetching && !search.data?.content.length && <EmptyState icon="clinical" title="未找到疾病" copy="请调整检索条件。" />}
          {!!search.data?.totalPages && search.data.totalPages > 1 && <div className="disease-search-pagination">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>上一页</Button>
            <span>第 {page + 1} / {search.data.totalPages} 页</span>
            <Button variant="secondary" size="sm" disabled={page + 1 >= search.data.totalPages}
              onClick={() => setPage((value) => value + 1)}>下一页</Button></div>}
        </div>}
      </section>
      <div className="ui-form-actions"><Button variant="secondary" onClick={onClose}>取消</Button>
        <Button onClick={() => onSave(rules.map(({ key: _key, id: _id, ...rule }) => rule),
          exceptionValues.map(({ display: _display, code: _code, systemName: _systemName,
            domainText: _domainText, ...item }) => item))}>保存识别范围</Button></div>
    </div>
  </Dialog>
}

function ServiceDialog({ dictionaries, value, onClose, onSave }: { dictionaries: DictionaryMap;
  value?: ServiceCatalogItem; onClose: () => void; onSave: (input: ServiceInput) => void }) {
  return <DataFormDialog title={value ? '编辑诊疗项目' : '新增诊疗项目'} eyebrow="临床服务目录" onClose={onClose}
    size="xwide" description="维护项目主档身份和目录属性；检验检查的执行、部位与收费规则从项目列表的“项目配置”进入。"
    onSubmit={(form) => onSave({ code: (value?.code || text(form, 'code')).trim(), name: text(form, 'name'), unitCode: optionalText(form, 'unitCode'),
      orderable: checked(form, 'orderable'), chargeable: checked(form, 'chargeable'), sdStatus: (value?.sdStatus ?? 'ACTIVE'),
      validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'), sdServiceType: value?.sdServiceType || text(form, 'sdServiceType'),
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
        {value && <input type="hidden" name="code" value={value.code} />}
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

export function standardMedicationDraft(entry: StandardMedicationDetail, spec: StandardMedicationSpecification): Partial<MedicationInput> {
  const amount = spec.strength.kind === 'AMOUNT_PER_PRESENTATION' && spec.strength.computable
    && spec.presentationUnit ? spec.strength.numerator : null
  return {
    code: spec.id, name: entry.name + (spec.substanceQualifier ? `（${spec.substanceQualifier}）` : ''),
    aliasName: entry.innName || undefined, sdMedicationType: entry.medicationType,
    sdDoseForm: spec.doseForm, preparationSpec: spec.specification,
    preparationUnit: spec.presentationUnit || undefined,
    strengthValue: amount ? Number(amount.value) : undefined, strengthUnit: amount?.unit,
  }
}

export function StandardMedicationSetupDialog({ api, entry, spec, organization, dictionaries, manufacturers,
  frequencies, routes, onClose, onComplete }: {
  api: RhnApi; entry: StandardMedicationDetail; spec: StandardMedicationSpecification; organization: Organization;
  dictionaries: DictionaryMap; manufacturers: Manufacturer[]; frequencies: ActiveOrderFrequency[]; routes: MedicationRoute[];
  onClose: () => void; onComplete: (medication: MedicationKnowledge) => void | Promise<unknown>
}) {
  const [medication, setMedication] = useState<MedicationKnowledge>()
  const existing = useQuery({queryKey:['master-data-standard-setup', organization.id, spec.id],
    queryFn: () => api.masterData.searchMedications(spec.id, '', '', organization.id, 0, 20),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false})
  if (existing.isPending || existing.isFetching || existing.error) return <Dialog title="建立本院药品" onClose={onClose}>
    {existing.isPending || existing.isFetching ? <LoadingState /> : <><Alert>{errorMessage(existing.error)}</Alert>
      <Button onClick={() => void existing.refetch()}>重试</Button></>}
  </Dialog>
  const prior = existing.data?.content.find(item => item.code === spec.id)
  if (!medication) return <MedicationDialog key={prior?.id ?? spec.id} dictionaries={dictionaries}
    frequencies={frequencies} routes={routes} value={prior} initialValue={standardMedicationDraft(entry, spec)}
    onClose={onClose} onSave={async (input) => {
      const saved = prior
        ? await api.masterData.updateMedication(prior.id, prior.revision, input, organization.id)
        : await api.masterData.createMedication(input, organization.id)
      setMedication(saved)
    }} />
  return <ProductDialog medication={medication} manufacturers={manufacturers} organization={organization}
    dictionaries={dictionaries} onClose={onClose} onSave={async input => {
      await api.masterData.createProductSetup(input)
      await onComplete(medication)
    }} />
}

export function MedicationDialog({ dictionaries, frequencies, routes, value, initialValue, onClose, onSave }: { dictionaries: DictionaryMap;
  frequencies: ActiveOrderFrequency[]; routes: MedicationRoute[]; value?: MedicationKnowledge; initialValue?: Partial<MedicationInput>;
  onClose: () => void; onSave: (input: MedicationInput) => void | Promise<unknown> }) {
  const initial = value ?? initialValue
  const [medicationType, setMedicationType] = useState(initial?.sdMedicationType ?? 'WESTERN')
  const [antimicrobial, setAntimicrobial] = useState(initial?.antimicrobial ?? false)
  const [antimicrobialLevel, setAntimicrobialLevel] = useState(initial?.sdAntimicrobialLevel ?? 'NON_RESTRICTED')
  const [antimicrobialOutpatientAllowed, setAntimicrobialOutpatientAllowed] = useState(
    initial?.antimicrobialOutpatientAllowed ?? true)
  const [antimicrobialConsultationRequired, setAntimicrobialConsultationRequired] = useState(
    initial?.antimicrobialConsultationRequired ?? false)
  const [antimicrobialEmergencyAllowed, setAntimicrobialEmergencyAllowed] = useState(
    initial?.antimicrobialEmergencyAllowed ?? false)
  const [skinTestRequired, setSkinTestRequired] = useState(initial?.skinTestRequired ?? false)
  const [defaultFrequency, setDefaultFrequency] = useState(initial?.defaultFrequency ?? '')
  const [defaultRoute, setDefaultRoute] = useState(initial?.defaultRoute ?? '')
  const [preparationSpec, setPreparationSpec] = useState(initial?.preparationSpec ?? '')
  const [preparationUnit, setPreparationUnit] = useState(initial?.preparationUnit ?? '')
  const [strengthValue, setStrengthValue] = useState(initial?.strengthValue ? String(initial.strengthValue) : '')
  const [strengthUnit, setStrengthUnit] = useState(initial?.strengthUnit ?? '')
  const [defaultDoseUnit, setDefaultDoseUnit] = useState(initial?.defaultDoseUnit ?? '')
  const [specTouched, setSpecTouched] = useState(Boolean(initial?.preparationSpec))

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

  const generateSpec = (strVal: string, strUnit: string, prepUnit: string) => {
    const val = strVal.trim()
    const su = strUnit.trim()
    const pu = prepUnit.trim()
    if (!val && !su) return ''
    if (val && su && pu) return `${val}${su}/${pu}`
    if (val && su) return `${val}${su}`
    return ''
  }

  const handleStrengthValueChange = (val: string) => {
    setStrengthValue(val)
    if (!specTouched) {
      setPreparationSpec(generateSpec(val, strengthUnit, preparationUnit))
    }
  }

  const handleStrengthUnitChange = (unit: string) => {
    setStrengthUnit(unit)
    if (!specTouched) {
      setPreparationSpec(generateSpec(strengthValue, unit, preparationUnit))
    }
  }

  const handlePreparationUnitChange = (unit: string) => {
    setPreparationUnit(unit)
    if (!specTouched) {
      setPreparationSpec(generateSpec(strengthValue, strengthUnit, unit))
    }
  }

  const doseUnitCandidates = Array.from(new Set([
    strengthUnit?.trim(),
    preparationUnit?.trim(),
    herbal ? 'g' : undefined,
    herbal ? '剂' : undefined,
    vaccine ? '剂' : undefined,
  ].filter(Boolean) as string[]))

  const effectiveDoseUnit = (defaultDoseUnit && doseUnitCandidates.includes(defaultDoseUnit))
    ? defaultDoseUnit
    : (doseUnitCandidates[0] ?? defaultDoseUnit)

  return <DataFormDialog title={value ? '编辑通用药品知识' : initialValue ? '建立本院药品 · 1/2 药品属性' : '新增通用药品知识'} eyebrow="药品知识层" onClose={onClose}
    size="xwide" className="medication-knowledge-dialog"
    description="通用药品知识不包含厂家和价格信息，产品、包装与机构目录在后续层级维护。"
    onSubmit={(form) => onSave({ code: (initial?.code || text(form, 'code')).trim(), name: text(form, 'name'), aliasName: optionalText(form, 'aliasName'),
      sdMedicationType: medicationType, sdDoseForm: optionalText(form, 'sdDoseForm'),
      preparationSpec: optionalText(form, 'preparationSpec') || preparationSpec || undefined,
      preparationUnit: optionalText(form, 'preparationUnit') || preparationUnit || undefined,
      strengthValue: herbal ? undefined : (optionalNumber(form, 'strengthValue') ?? (strengthValue ? Number(strengthValue) : undefined)),
      strengthUnit: herbal ? undefined : (optionalText(form, 'strengthUnit') || strengthUnit || undefined),
      sdStorageType: optionalText(form, 'sdStorageType'),
      prescriptionDrug: checked(form, 'prescriptionDrug'), essentialDrug: checked(form, 'essentialDrug'),
      antimicrobial: western && antimicrobial,
      sdAntimicrobialLevel: western && antimicrobial ? antimicrobialLevel : undefined,
      antimicrobialOutpatientAllowed: western && antimicrobial ? antimicrobialOutpatientAllowed : undefined,
      antimicrobialConsultationRequired: western && antimicrobial ? antimicrobialConsultationRequired : undefined,
      antimicrobialEmergencyAllowed: western && antimicrobial ? antimicrobialEmergencyAllowed : undefined,
      antimicrobialMaxDays: western && antimicrobial && antimicrobialOutpatientAllowed
        ? optionalNumber(form, 'antimicrobialMaxDays') : undefined,
      skinTestRequired: western && skinTestRequired,
      skinTestMethod: western && skinTestRequired
        ? optionalText(form, 'skinTestMethod') as MedicationInput['skinTestMethod'] : undefined,
      skinTestSolutionMode: western && skinTestRequired
        ? optionalText(form, 'skinTestSolutionMode') as MedicationInput['skinTestSolutionMode'] : undefined,
      skinTestObservationMinutes: western && skinTestRequired ? optionalNumber(form, 'skinTestObservationMinutes') : undefined,
      skinTestResultValidityHours: western && skinTestRequired ? optionalNumber(form, 'skinTestResultValidityHours') : undefined,
      skinTestInstructions: western && skinTestRequired ? optionalText(form, 'skinTestInstructions') : undefined,
      defaultDose: optionalNumber(form, 'defaultDose'),
      defaultDoseUnit: optionalNumber(form, 'defaultDose') === undefined ? undefined : effectiveDoseUnit || optionalText(form, 'defaultDoseUnit'),
      defaultRoute: defaultRoute || undefined,
      defaultFrequency: vaccine ? undefined : defaultFrequency || undefined,
      chronicDiseaseDrug: (western || chinesePatent) && checked(form, 'chronicDiseaseDrug'),
      singleOrder: checked(form, 'singleOrder'),
      sdStatus: initial?.sdStatus ?? 'ACTIVE' })}>
    <FormSection title="药品身份" description="药品类型决定可维护的业务属性，创建后不可直接修改；类型调整需新建主档并处理替代关系。">
      <FormGrid columns={4}>
        <FormField label="通用药品编码" required><input name="code" defaultValue={initial?.code} disabled={Boolean(value)} readOnly={Boolean(initialValue)}
          placeholder="如 MED_AMOXICILLIN" autoFocus={!value} required /></FormField>
        <FormField label="通用名称" required><input name="name" defaultValue={initial?.name}
          placeholder="录入药品通用名称" required /></FormField>
        <FormField label="别名"><input name="aliasName" defaultValue={initial?.aliasName}
          placeholder="如历史名称或常用简称" /></FormField>
        <FormField label={value ? '药品类型（创建后不可修改）' : '药品类型'} required>
          <StaticSelectControl name="sdMedicationType" value={medicationType}
            onChange={(next) => { setMedicationType(next); if (next !== 'WESTERN') setAntimicrobial(false) }}
            options={dictionaries.BD_MEDICATION_TYPE.map((item) => ({ value: item.code, label: item.name }))}
            placeholder="请选择药品类型" disabled={Boolean(value)} required />
        </FormField>
        <SelectField name="sdDoseForm" label={doseFormLabel} values={dictionaries.BD_DOSE_FORM}
          defaultValue={initial?.sdDoseForm ?? (initialValue ? '' : 'TABLET')} />
        <FormField className="medication-knowledge-dialog__spec" label={specificationLabel} hint="单方制剂推荐按「含量+单位/制剂单位」自动生成；复合制剂可手动录入（如 400mg:57mg/片、5mg/2.5ml 或 复方）。">
          <div className="master-data-spec-field">
            <input name="preparationSpec" value={preparationSpec}
              onChange={(e) => { setPreparationSpec(e.target.value); setSpecTouched(true) }}
              placeholder={herbal ? '如 净制、切片' : vaccine ? '如 0.5ml/支' : '如 500mg/片 或 400mg:57mg/片'} />
            {!herbal && (strengthValue || strengthUnit) && (
              <Tooltip content="根据当前含量、含量单位与制剂单位重新生成规格">
                <Button variant="secondary" className="master-data-spec-gen-btn"
                  aria-label="根据当前含量重新生成制剂规格"
                  onClick={() => {
                    const gen = generateSpec(strengthValue, strengthUnit, preparationUnit)
                    setPreparationSpec(gen)
                    setSpecTouched(false)
                  }}>
                  <Icon name="refresh" />生成规格
                </Button>
              </Tooltip>
            )}
          </div>
        </FormField>
      </FormGrid>
    </FormSection>
    <FormSection title={`${typeName}属性`} description={typeDescription}>
      <FormGrid columns={4}>
        <FormField label={unitLabel} required={Boolean(initialValue)}><input name="preparationUnit" value={preparationUnit} required={Boolean(initialValue)}
          onChange={(e) => handlePreparationUnitChange(e.target.value)}
          placeholder={herbal ? 'g、袋' : vaccine ? '支、剂' : '片、粒、支'} /></FormField>
        {!herbal && <><FormField label={vaccine ? '每剂含量' : '结构化含量'}><input name="strengthValue" type="number" min="0" step="any"
          value={strengthValue} onChange={(e) => handleStrengthValueChange(e.target.value)}
          placeholder={vaccine ? '如 0.5' : '如 500'} /></FormField>
        <FormField label={vaccine ? '每剂含量单位' : '含量单位'}><input name="strengthUnit" value={strengthUnit}
          onChange={(e) => handleStrengthUnitChange(e.target.value)}
          placeholder={vaccine ? 'ml、IU' : 'mg、g、IU'} /></FormField></>}
        <FormField label="默认给药途径"><Select name="defaultRoute" value={defaultRoute}
          onChange={setDefaultRoute} showValue placeholder="请选择给药途径"
          options={routes.map((route) => ({ value: route.code, label: route.name,
            secondaryText: route.code, searchKeywords: [route.code, route.name] }))} /></FormField>
        {!vaccine && <FormField label={herbal ? '默认服用频次' : '默认频次'}><Select name="defaultFrequency"
          value={defaultFrequency} onChange={setDefaultFrequency} showValue placeholder="请选择医嘱频次"
          options={frequencies.map((frequency) => ({ value: frequency.code, label: frequency.name,
            secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}` }))} /></FormField>}
        <SelectField name="sdStorageType" label={vaccine ? '冷链 / 储藏方式' : '储藏方式'}
          values={ensureStorageTypeValues(dictionaries.BD_STORAGE_TYPE)}
          defaultValue={initial?.sdStorageType === 'NORMAL' ? 'ROOM_TEMPERATURE' : initial?.sdStorageType} required={false} />
        <FormField label="默认剂量"><input name="defaultDose" type="number" min="0" step="any"
          defaultValue={initial?.defaultDose} placeholder="如 0.5" /></FormField>
        <FormField label="默认剂量单位" hint="严格限制只能从「含量单位」或「制剂单位」中二选一，杜绝脏数据。">
          {doseUnitCandidates.length > 0 ? <Select name="defaultDoseUnit" value={effectiveDoseUnit}
            onChange={setDefaultDoseUnit} searchable={false} clearable={false}
            options={doseUnitCandidates.map((u) => {
                const isStrength = u === strengthUnit?.trim()
                const isPrep = u === preparationUnit?.trim()
                const roleTag = isStrength && isPrep ? '含量/制剂同单位' : isStrength ? '含量单位' : isPrep ? '制剂单位' : '标准单位'
                return { value: u, label: `${u}（${roleTag}）` }
              })} /> : (
            <input name="defaultDoseUnit" value={defaultDoseUnit}
              onChange={(e) => setDefaultDoseUnit(e.target.value)}
              placeholder="请先在上方填写制剂单位或含量单位" />
          )}
        </FormField>
        <Checkboxes title="安全与管理属性" className="span-full">
          <Checkbox name="prescriptionDrug" label="处方药" defaultChecked={initial?.prescriptionDrug ?? true} />
          <Checkbox name="essentialDrug" label="基本药物" defaultChecked={initial?.essentialDrug} />
          {western && <Checkbox name="antimicrobial" label="抗菌药物" checked={antimicrobial}
            onChange={(checkedValue) => setAntimicrobial(checkedValue)} />}
          {western && <Checkbox name="skinTestRequired" label="需要皮试" checked={skinTestRequired}
            onChange={setSkinTestRequired} />}
          {(western || chinesePatent) && <Checkbox name="chronicDiseaseDrug" label="慢病用药" defaultChecked={initial?.chronicDiseaseDrug} />}
          <Checkbox name="singleOrder" label="允许单开" defaultChecked={initial?.singleOrder ?? true} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    {western && antimicrobial && <FormSection title="抗菌药物临床应用管控"
      description="分级决定医师处方资质与前置审核强度；特殊使用级抗菌药物门诊默认严禁开立。">
      <FormGrid columns={4}>
        <FormField label="抗菌药物管理级别" required><Select name="sdAntimicrobialLevel" value={antimicrobialLevel}
          searchable={false} clearable={false}
          onChange={(next) => {
            setAntimicrobialLevel(next)
            if (next === 'SPECIAL') { setAntimicrobialOutpatientAllowed(false); setAntimicrobialConsultationRequired(true) }
          }} options={dictionaries.BD_ANTIMICROBIAL_LEVEL.map((item) => ({ value: item.code, label: item.name }))} /></FormField>
        <FormField label="门诊单次处方疗程上限 (天)" hint={antimicrobialOutpatientAllowed ? '常规处方最长天数（如 7 天）' : '特殊使用级或非门诊用药不适用'}>
          <input name="antimicrobialMaxDays" type="number" min={1} max={90}
            defaultValue={initial?.antimicrobialMaxDays ?? 7}
            disabled={!antimicrobialOutpatientAllowed}
            placeholder={antimicrobialOutpatientAllowed ? '如 7' : '门诊禁用'} />
        </FormField>
        <FormField className="span-2" label="处方资质要求" hint={
          antimicrobialLevel === 'SPECIAL'
            ? '特殊使用级：副高及以上专业技术职务医师开具，门诊禁止使用，需抗感染专家/药师会诊。'
            : antimicrobialLevel === 'RESTRICTED'
              ? '限制使用级：中级及以上专业技术职务医师开具，门诊按指征慎用。'
              : '非限制使用级：初级及以上职称医师均可开具，门诊临床常用抗菌药物。'
        }>
          <div className="master-data-qualification-field">
            <StatusBadge tone={antimicrobialLevel === 'SPECIAL' ? 'danger' : antimicrobialLevel === 'RESTRICTED' ? 'warning' : 'neutral'}>
              {antimicrobialLevel === 'SPECIAL' ? '副高及以上' : antimicrobialLevel === 'RESTRICTED' ? '中级及以上' : '初级及以上'}
            </StatusBadge>
            <span className="master-data-qualification-field__text">
              {antimicrobialLevel === 'SPECIAL' ? '需会诊审批 · 门诊严禁' : antimicrobialLevel === 'RESTRICTED' ? '门诊按指征慎用' : '门诊临床常用'}
            </span>
          </div>
        </FormField>
        <Checkboxes title="处方准入与审批规则" className="span-full">
          <Checkbox name="antimicrobialOutpatientAllowed" label="允许门诊常规开立" checked={antimicrobialOutpatientAllowed}
            onChange={setAntimicrobialOutpatientAllowed} disabled={antimicrobialLevel === 'SPECIAL'} />
          <Checkbox name="antimicrobialConsultationRequired" label="需专科会诊 / 事前审批"
            checked={antimicrobialConsultationRequired} onChange={setAntimicrobialConsultationRequired}
            disabled={antimicrobialLevel === 'SPECIAL'} />
          <Checkbox name="antimicrobialEmergencyAllowed" label="急危重症允许越级使用 (单日应急)"
            checked={antimicrobialEmergencyAllowed} onChange={setAntimicrobialEmergencyAllowed} />
        </Checkboxes>
      </FormGrid>
    </FormSection>}
    {western && skinTestRequired && <FormSection title="皮试临床执行规则 (敏感试验)"
      description="默认方案会随医嘱生成快照并自动带入护士皮试工作台；执行人员仍可按医嘱现场微调。">
      <FormGrid columns={4}>
        <StaticSelectField name="skinTestMethod" label="皮试给药方式" defaultValue={initial?.skinTestMethod ?? 'INTRADERMAL'}
          searchable={false} options={[{ value: 'INTRADERMAL', label: '皮内试验 (推荐)' },
            { value: 'PRICK', label: '点刺试验' }, { value: 'OTHER', label: '其他方式' }]} />
        <StaticSelectField name="skinTestSolutionMode" label="皮试液制备方式"
          defaultValue={initial?.skinTestSolutionMode ?? 'DILUTED_SOLUTION'} searchable={false}
          options={[{ value: 'DILUTED_SOLUTION', label: '稀释配制皮试液' },
            { value: 'ORIGINAL_SOLUTION', label: '原液直接试验' }]} />
        <FormField label="皮试观察等待时长 (分钟)" required>
          <input name="skinTestObservationMinutes" type="number" min={1} max={120}
            defaultValue={initial?.skinTestObservationMinutes ?? 20} placeholder="如 20" required />
        </FormField>
        <FormField label="阴性结果有效期 (小时)" required>
          <input name="skinTestResultValidityHours" type="number" min={1} max={8760}
            defaultValue={initial?.skinTestResultValidityHours ?? 24} placeholder="如 24" required />
        </FormField>
        <FormField label="皮试液配制浓度与操作要点" className="span-full"><textarea name="skinTestInstructions" rows={2}
          defaultValue={initial?.skinTestInstructions} placeholder="如：稀释配制浓度（如青霉素 500U/ml）、试验推注剂量（0.1ml）、注射部位及阴阳性判定或复试要求" /></FormField>
      </FormGrid>
    </FormSection>}
    {!knownType && <Alert>当前药品类型尚未建立专属模板，本次仅按通用字段维护；请在扩展属性配置中补充类型规则。</Alert>}
  </DataFormDialog>
}

function medicationPackageSpec(preparationSpec: string | undefined, factor: string,
  itemUnit: string | undefined, packageUnit: string) {
  if (!factor || !packageUnit) return ''
  if (Number(factor) === 1 && itemUnit?.trim() === packageUnit.trim()) {
    return preparationSpec?.trim() ? `${preparationSpec.trim()}/${packageUnit}` : packageUnit
  }
  const quantitySpec = `${factor}${itemUnit || '最小单位'}/${packageUnit}`
  return preparationSpec?.trim() ? `${preparationSpec.trim()}*${quantitySpec}` : quantitySpec
}

function ProductDialog({ medication, manufacturers, organization, dictionaries, onClose, onSave }: {
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

function ProductEditDialog({ product, medication, manufacturers, dictionaries, onClose, onSave, onEditPackage }: {
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
          return <button type="button" key={item.id} title="点击编辑此包装" onClick={() => onEditPackage(item)}>
            <strong>{item.packageSpec || `${item.unitName} = ${item.quantityFactor}${product.unitCode || '最小单位'}`}</strong>
            <span>{[item.sdUsageTypeText, item.barcode && `条码 ${item.barcode}`, marks,
              `自 ${item.validFrom}${item.validTo ? ` 至 ${item.validTo}` : ''}`].filter(Boolean).join(' · ')}</span>
          </button>
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

function PackageDialog({ product, medication, dictionaries, editing, onClose, onSave }: { product: MedicationProduct;
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

function DataFormDialog({ title, eyebrow, description, size = 'wide', className, onClose, onSubmit, children }: {
  title: string; eyebrow: string; description?: string; size?: 'wide' | 'xwide'
  className?: string
  onClose: () => void; onSubmit: (form: FormData) => void | Promise<unknown>; children: ReactNode
}) {
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  return <Dialog title={title} eyebrow={eyebrow} description={description} size={size} className={className} onClose={onClose}>
    <form className="master-data-dialog-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (pending.current) return
      const form = new FormData(event.currentTarget)
      pending.current = true; setSaving(true); setSaveError('')
      try { await onSubmit(form) } catch (error) { setSaveError(errorMessage(error)) }
      finally { pending.current = false; setSaving(false) }
    }}>{children}{saveError && <p role="alert">{saveError}</p>}
    <div className="ui-form-actions"><Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
    <Button type="submit" disabled={saving}>{saving ? '正在保存…' : '保存'}</Button></div></form></Dialog>
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
function Checkboxes({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <fieldset className={`master-data-checkboxes ${className ?? 'span-2'}`.trim()}><legend>{title}</legend><div>{children}</div></fieldset>
}
function Checkbox({ name, label, defaultChecked = false, checked: checkedValue, onChange, disabled = false }: { name: string; label: string;
  defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return <label><input type="checkbox" name={name} defaultChecked={checkedValue === undefined ? defaultChecked : undefined}
    checked={checkedValue} onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
    disabled={disabled} />{label}</label>
}
function SelectField({ name, label, values = [], defaultValue, disabled = false, required = true, placeholder }: { name: string; label: string;
  values?: DictionaryValue[]; defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string }) {
  return <StaticSelectField name={name} label={label} defaultValue={defaultValue ?? (required ? values[0]?.code : undefined)}
    disabled={disabled} required={required} placeholder={placeholder} options={values.map((item) => ({ value: item.code, label: item.name }))} />
}
function StaticSelectField({ name, label, options: values, defaultValue, disabled = false, required = true,
  placeholder = '请选择', searchable = true }: { name: string; label: string; options: Array<{ value: string; label: string }>;
  defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string; searchable?: boolean }) {
  const [value, setValue] = useState(defaultValue ?? '')
  return <FormField label={label} required={required}><StaticSelectControl name={name} value={value}
    onChange={setValue} options={values} placeholder={placeholder} disabled={disabled} required={required}
    searchable={searchable} /></FormField>
}
function StaticSelectControl({ id, name, className, value, onChange, options: values, placeholder, disabled, required,
  searchable = true, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired }: {
  id?: string; name: string; className?: string; value: string; onChange: (value: string) => void
  options: Array<{ value: string; label: string }>; placeholder: string; disabled: boolean; required: boolean; searchable?: boolean
  'aria-describedby'?: string; 'aria-invalid'?: boolean | 'false' | 'true'; 'aria-required'?: boolean | 'false' | 'true'
}) {
  return <div className="master-data-select-field">
    {disabled && <input type="hidden" name={name} value={value} />}
    <Select id={id} name={disabled ? undefined : name} className={className} value={value} onChange={onChange}
      options={values} placeholder={placeholder} disabled={disabled} clearable={!required}
      searchable={searchable}
      aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid} aria-required={ariaRequired} />
  </div>
}
function Table({ headers, children, compact = false, footer, className = '' }: {
  headers: string[]; children: ReactNode; compact?: boolean; footer?: ReactNode; className?: string
}) {
  return <TableShell scrollClassName="master-data-table-wrap" footer={footer}>
    <DataTable className={`master-data-table ${className}`.trim()} compact={compact}>
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody>
    </DataTable>
  </TableShell>
}
function RowActions({ children }: { children: ReactNode }) { return <div className="master-data-row-actions">{children}</div> }
function DataStatus({ value, text }: { value: MasterDataStatus; text: string }) {
  return <StatusBadge tone={value === 'ACTIVE' ? 'success' : value === 'SUSPENDED' ? 'warning' : 'neutral'}>{text}</StatusBadge>
}
function Flag({ value, label }: { value: boolean; label: string }) { return <StatusBadge tone={value ? 'success' : 'neutral'}>{value ? label : `不可${label.slice(1)}`}</StatusBadge> }
function options(values: DictionaryMap | undefined, code: string) {
  return (values?.[code] ?? []).map((item) => ({ value: item.code, label: item.name }))
}
function tabLabel(tab: Tab) { return tab === 'disease' ? '疾病' : tab === 'service' ? '项目' : '药品' }
function text(form: FormData, name: string) { return String(form.get(name) ?? '').trim() }
function optionalText(form: FormData, name: string) { const value = text(form, name); return value || undefined }
function optionalNumber(form: FormData, name: string) { const value = text(form, name); return value ? Number(value) : undefined }
function checked(form: FormData, name: string) { return form.get(name) === 'on' }
