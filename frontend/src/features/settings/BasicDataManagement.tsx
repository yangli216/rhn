import './master-data/clinical-content.css'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import type { Organization } from "../../shared/model";
import { errorMessage, type DiseaseManagementProgram, type RhnApi } from "../../shared/rhnApi";
import { Alert, Button, Icon, LoadingState, PageHeader, Panel, Pagination, SearchField, Select, Tabs } from "../../shared/ui";
import '../../styles/features/operational-master-data.css'
import './clinical-medication-standards.css'
import { type BasicDataScope, type Tab, type DiseaseMode, type MedicationMode, dictionaryCodes, type DictionaryMap, preloadOperationalMasterData, preloadMedicationComposition, options, ClinicalServiceConfigurationDialog, MedicationStandardReadinessPanel, ClinicalMedicationStandardsPanel, StandardMedicationCatalogPanel, MedicationCompositionDialog, ItemAttributeConfigurationPanel, OperationalMasterDataPanel, DialogSuspenseFallback } from './master-data/masterDataShared'
import { MasterDataImportDialog } from './master-data/MasterDataImportDialog'
import { DiseaseDialog, DiseaseManagementProgramDialog, DiseaseTable, DiseaseManagementTable, DiseaseManagementMembersDialog } from './master-data/DiseaseMaintenance'
import { ServiceDialog, ServiceTable } from './master-data/ServiceMaintenance'
import { StandardMedicationSetupDialog, MedicationDialog } from './master-data/MedicationMaintenance'
import { MedicationTable } from './master-data/MedicationPresentation'
import { ProductDialog, ProductEditDialog, PackageDialog } from './master-data/ProductMaintenance'
export { preloadMedicationComposition } from './master-data/masterDataShared'
export { preloadOperationalMasterData } from './master-data/masterDataShared'
export { DialogSuspenseFallback } from './master-data/masterDataShared'
export { type BasicDataScope } from './master-data/masterDataShared'
export { type MedicationMode } from './master-data/masterDataShared'
export { type DictionaryMap } from './master-data/masterDataShared'
export { SERVICE_SUBTYPE_MAP } from './master-data/masterDataShared'
export { accountingCategoryLabel } from './master-data/masterDataShared'
export { SERVICE_DUPLICATE_RULE_MAP } from './master-data/masterDataShared'
export { serviceSubtypeLabel } from './master-data/masterDataShared'
export { serviceDuplicateRuleLabel } from './master-data/masterDataShared'
export { serviceTypeTone } from './master-data/masterDataShared'
export { ServiceTable } from './master-data/ServiceMaintenance'
export { MedicationTable } from './master-data/MedicationPresentation'
export { MedicationKnowledgeTable } from './master-data/MedicationPresentation'
export { MedicationProductPopover } from './master-data/MedicationPresentation'
export { MedicationProductQuickViewDialog } from './master-data/MedicationPresentation'
export { MedicationProductTable } from './master-data/MedicationPresentation'
export { medicationSummary } from './master-data/MedicationPresentation'
export { StandardMappingDialog } from './master-data/StandardMappingDialog'
export { CatalogLifecycleDialog } from './master-data/CatalogLifecycleDialog'
export { OrganizationCatalogImportDialog } from './master-data/CatalogLifecycleDialog'
export { MappingSummary } from './master-data/StandardMappingDialog'
export { mappingTypeLabel } from './master-data/StandardMappingDialog'
export { equivalenceLabel } from './master-data/StandardMappingDialog'
export { mappingStatusLabel } from './master-data/StandardMappingDialog'
export { AttributeManagementDialog } from './master-data/AttributeMaintenance'
export { DiseaseManagementMembersDialog } from './master-data/DiseaseMaintenance'
export { ServiceDialog } from './master-data/ServiceMaintenance'
export { standardMedicationDraft } from './master-data/MedicationMaintenance'
export { StandardMedicationSetupDialog } from './master-data/MedicationMaintenance'
export { MedicationDialog } from './master-data/MedicationMaintenance'
export { Table } from './master-data/masterDataShared'

export function BasicDataManagement({ api, organization, onNavigate, scope = 'all' }: {
  api: RhnApi; organization: Organization; onNavigate: (path: string) => void; scope?: BasicDataScope
}) {
  const queryClient = useQueryClient()
  const initialTab: Tab = scope === 'medication' ? 'medication'
    : scope === 'service' ? 'service'
    : scope === 'disease' ? 'disease'
    : scope === 'operations' ? 'operations'
    : 'disease'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [diseaseMode, setDiseaseMode] = useState<DiseaseMode>('terms')
  const [serviceDensity, setServiceDensity] = useState<'two-line' | 'single-line'>('two-line')
  const [medicationMode, setMedicationMode] = useState<MedicationMode>('standard')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<ReactNode>()
  const [diseaseScopeEditor, setDiseaseScopeEditor] = useState<{ program: DiseaseManagementProgram; api: RhnApi }>()
  useEffect(() => { setDiseaseScopeEditor(undefined) }, [api])
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setTypeFilter('')
    setStatusFilter('')
    setPage(0)
  }

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
    queryKey: ['master-data-medications', medicationMode, query, typeFilter, statusFilter, organization.id, page, pageSize],
    queryFn: async () => {
      if (medicationMode !== 'product') return api.masterData.searchMedications(
        query, typeFilter, statusFilter, organization.id, page, pageSize)
      const result = await api.masterData.searchMedicationProducts(query, typeFilter, statusFilter, organization.id, page, pageSize)
      return { ...result, content: result.content.map(({ product, medication }) => ({ ...medication, products: [product] })) }
    },
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

  useEffect(() => { setTypeFilter(''); setStatusFilter(''); setKeyword(''); setQuery(''); setPage(0) }, [diseaseMode, tab])
  useEffect(() => { setPage(0) }, [pageSize, query, statusFilter, typeFilter, medicationMode])
  useEffect(() => {
    if (tab === 'service') {
      void preloadOperationalMasterData()
    } else if (tab === 'medication') {
      void preloadMedicationComposition()
    }
  }, [tab])

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
  const pageActions = tab === 'attribute' || tab === 'operations' || (tab === 'medication' && ['standard', 'semantics', 'readiness', 'rules'].includes(medicationMode)) ? undefined : <>
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
      if (tab === 'service') setDialog(<ServiceDialog api={api} organization={organization} dictionaries={dictionaries.data!}
        onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.createService(input, organization.id)
          .then(() => invalidate('诊疗项目已创建'))} />)
      if (tab === 'medication') setMedicationMode('standard')
    }}><Icon name="add" />{tab === 'disease' && diseaseMode === 'management' ? '新增管理项目' : tab === 'medication' ? '从标准目录建档' : `新增${tabLabel(tab)}`}</Button>
  </>

  const headerMeta = scope === 'medication'
    ? { eyebrow: '药品知识库与标准体系', title: '药品知识与目录', description: '统一维护国家参考目录追溯、全院在用药品主档标准关联、临床通用知识与生产企业包装主档。' }
    : scope === 'service'
      ? { eyebrow: '诊疗服务主档', title: '诊疗服务目录', description: '统一维护集团/区域共享的诊疗服务目录主档与开立收费标准；本院开展与定价请至「机构项目管理」维护。' }
      : scope === 'disease'
        ? { eyebrow: '诊断概念与临床标准', title: '疾病与诊断标准', description: '统一维护版本化疾病诊断术语与慢病管理分类规则。' }
        : scope === 'operations'
          ? { eyebrow: '运营主数据与属性体系', title: '耗材与运营主数据', description: '统一维护医用耗材主档、诊疗耗材组套、统一计量单位与扩展属性配置。' }
          : { eyebrow: '中心治理 · 标准主数据', title: '基础数据中心', description: '统一维护集团/区域共享的疾病诊断术语、诊疗服务目录主档、通用药品知识库与医用耗材标准；机构开展项目与本院定价请至「机构项目管理」维护。' }

  return <div className="master-data-page">
    <PageHeader compact eyebrow={headerMeta.eyebrow} title={headerMeta.title}
      description={headerMeta.description}
      actions={<>
        {scope === 'service' && pageActions}
        <Button variant="secondary" onClick={() => onNavigate('/settings/organization-catalog')}>
          <Icon name="clinical" />前往机构项目管理</Button>
      </>} />

    {feedback && <Alert tone="success" className="master-data-feedback">{feedback}</Alert>}
    {(operationError || currentError) && <Alert className="master-data-feedback">
      {operationError || errorMessage(currentError)}
    </Alert>}

    <Panel className="master-data-panel">
      {scope === 'all' && (
        <Tabs value={tab} onChange={setTab} label="基础数据类型" variant="workspace" responsiveCards
          className="master-data-tabs" actions={pageActions} items={[
            { value: 'disease', label: '疾病与术语', meta: '版本化标准' },
            { value: 'service', label: '诊疗项目', meta: '开立 · 执行 · 收费' },
            { value: 'medication', label: '药品目录', meta: '知识 · 产品 · 包装' },
            { value: 'operations', label: '运营主数据', meta: '组套 · 耗材 · 计量' },
            { value: 'attribute', label: '扩展属性', meta: '定义 · 装配 · 继承' },
          ]} />
      )}
      {tab === 'disease' && <Tabs value={diseaseMode} onChange={setDiseaseMode} label="疾病维护视图"
        variant="line" className="disease-management-mode" actions={scope !== 'all' ? pageActions : undefined} items={[
          { value: 'terms', label: '疾病术语' },
          { value: 'management', label: '管理规则' },
        ]} />}
      {tab === 'medication' && <Tabs value={medicationMode === 'semantics' ? 'readiness' : medicationMode} onChange={setMedicationMode} label="药品目录视图"
        variant="line" className="medication-management-mode" actions={scope !== 'all' ? pageActions : undefined} items={[
          { value: 'standard', label: '标准目录' },
          { value: 'readiness', label: '主档标准关联' },
          { value: 'knowledge', label: '药品主档' },
          { value: 'product', label: '产品包装' },
          { value: 'rules', label: '用药规则' },
        ]} />}
      {tab !== 'attribute' && tab !== 'operations' && !(tab === 'medication' && ['standard', 'semantics', 'readiness', 'rules'].includes(medicationMode)) && <div className="master-data-toolbar">
        <SearchField className="master-data-toolbar__search" label="搜索基础数据" value={keyword} onChange={setKeyword}
          onSearch={handleSearch}
          placeholder={tab === 'disease' && diseaseMode === 'management' ? '管理项目名称、编码或说明（回车或点击查询）'
            : tab === 'disease' ? '名称、别名、编码或检索码（回车或点击查询）'
            : tab === 'service' ? '项目名称、编码或分类（回车或点击查询）'
            : medicationMode === 'product' ? '产品名、生产厂家、批准文号或通用名（回车或点击查询）'
            : '通用名、别名、剂型或编码（回车或点击查询）'} />
        <Select value={typeFilter} onChange={setTypeFilter} placeholder="全部类型" options={typeOptions} />
        <Select value={statusFilter} onChange={setStatusFilter} placeholder="全部状态"
          options={options(dictionaries.data, 'BD_MASTER_STATUS')} />
        <Button size="sm" variant="primary" onClick={handleSearch}>查询</Button>
        <Button size="sm" variant="secondary" onClick={handleReset}>重置</Button>
        {tab === 'service' && <div className="service-density-switcher" role="group" aria-label="列表密度">
          <Button type="button"
            className={`service-density-btn ${serviceDensity === 'two-line' ? 'is-active' : ''}`}
            onClick={() => setServiceDensity('two-line')}
            title="两行视图：第一行展示项目与类别，第二行展示执行规格与规则" variant="text" size="sm">
            两行视图
          </Button>
          <Button type="button"
            className={`service-density-btn ${serviceDensity === 'single-line' ? 'is-active' : ''}`}
            onClick={() => setServiceDensity('single-line')}
            title="单行极简视图：极致行高，一屏吞吐更多项目" variant="text" size="sm">
            单行视图
          </Button>
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
          onMembers={(value) => setDiseaseScopeEditor({ program: value, api })}
          onStatus={(value) => api.masterData.diseaseManagementProgramStatus(value.id, value.revision,
            value.sdStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
            .then(() => invalidate('疾病管理项目状态已更新')).catch(fail)} />}
      {tab === 'service' && <ServiceTable values={services.data?.content} loading={services.isPending}
        pagination={pagination} density={serviceDensity}
        onConfigure={(value) => setDialog(<ClinicalServiceConfigurationDialog api={api} service={value}
          organizationId={organization.id} dictionaries={dictionaries.data!}
          onClose={() => setDialog(undefined)} />)}
        onEdit={(value) => setDialog(<ServiceDialog api={api} organization={organization} dictionaries={dictionaries.data!} value={value}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.updateService(
            value.id, value.revision, input, organization.id).then(() => invalidate('诊疗项目已更新'))} />)} />}
      {tab === 'medication' && (medicationMode === 'readiness' || medicationMode === 'semantics') && (
        <Suspense fallback={<LoadingState label="正在加载药品标准建设情况…" />}>
          <MedicationStandardReadinessPanel api={api} compact={scope !== 'all'} organizationId={organization.id} onOpenCatalog={() => setMedicationMode('standard')} />
        </Suspense>
      )}
      {tab === 'medication' && medicationMode === 'rules' && (
        <Suspense fallback={<LoadingState label="正在加载临床用药规则基准…" />}>
          <ClinicalMedicationStandardsPanel api={api} defaultTab="rules" hideNav organizationId={organization.id} onOpenCatalog={() => setMedicationMode('standard')} />
        </Suspense>
      )}
      {tab === 'medication' && medicationMode === 'standard' && (
        <Suspense fallback={<LoadingState label="正在加载标准药品目录…" />}>
          <StandardMedicationCatalogPanel api={api} organizationId={organization.id}
            setupDisabled={!dictionaries.data || manufacturers.isPending || frequencies.isPending || routes.isPending}
            onSetup={(entry, spec) => setDialog(<StandardMedicationSetupDialog key={spec.id} api={api}
              entry={entry} spec={spec} organization={organization} dictionaries={dictionaries.data!}
              manufacturers={manufacturers.data ?? []} frequencies={frequencies.data ?? []} routes={routes.data ?? []}
              onClose={() => {
                setDialog(undefined)
                void queryClient.invalidateQueries({queryKey:['master-data-medications']})
                void queryClient.invalidateQueries({queryKey:['standard-medication-usage']})
              }}
              onComplete={async (medication) => {
                setQuery(medication.code); setTypeFilter(''); setStatusFilter(''); setMedicationMode('product')
                await invalidate('药品来源、厂家产品、包装和本院价格已建档，请到药库调入经营目录')
              }} />)} />
        </Suspense>
      )}
      {tab === 'medication' && (medicationMode === 'knowledge' || medicationMode === 'product') && <MedicationTable values={medications.data?.content}
        loading={medications.isPending} pagination={pagination}
        mode={medicationMode} onModeChange={setMedicationMode}
        routes={routes.data ?? []} frequencies={frequencies.data ?? []}
        onEdit={(value) => setDialog(<MedicationDialog api={api} organization={organization} dictionaries={dictionaries.data!} frequencies={frequencies.data ?? []}
          routes={routes.data ?? []} value={value}
          onClose={() => setDialog(undefined)} onSave={(input) => api.masterData.updateMedication(
            value.id, value.revision, input, organization.id).then(() => invalidate('药品知识已更新'))} />)}
        onComposition={(value) => setDialog(<MedicationCompositionDialog api={api} medication={value} onClose={() => setDialog(undefined)} />)}
        onProduct={(value) => {
          if (value.standardReference?.status !== 'LINKED') {
            setFeedback(`请先在标准参考目录中为「${value.name}」关联标准规格，再建立产品。`)
            setMedicationMode('standard'); return
          }
          setDialog(<ProductDialog medication={value} manufacturers={manufacturers.data ?? []}
          organization={organization} dictionaries={dictionaries.data!} onClose={() => setDialog(undefined)}
          onSave={(input) => api.masterData.createProductSetup(input)
            .then(() => invalidate('药品产品、包装和机构价格已创建')).catch(fail)} />) }}
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
        {tab === 'attribute' && (
          <Suspense fallback={<LoadingState label="正在加载属性配置…" />}>
            <ItemAttributeConfigurationPanel api={api} />
          </Suspense>
        )}
        {tab === 'operations' && dictionaries.data && (
          <Suspense fallback={<LoadingState label="正在加载运维配置…" />}>
            <OperationalMasterDataPanel api={api}
              organization={organization} manufacturers={manufacturers.data ?? []} />
          </Suspense>
        )}
      </div>
    </Panel>
    {(dialog || diseaseScopeEditor?.api === api) && (
      <Suspense fallback={<DialogSuspenseFallback />}>
        {dialog}
        {diseaseScopeEditor?.api === api && <DiseaseManagementMembersDialog program={diseaseScopeEditor.program}
          api={api} dictionaries={dictionaries.data!} codeSystems={codeSystems.data ?? []}
          onClose={() => setDiseaseScopeEditor(undefined)}
          onSave={(rules, exceptions) => api.masterData.replaceDiseaseManagementScope(
            diseaseScopeEditor.program.id, diseaseScopeEditor.program.revision, rules, exceptions)}
          onSaved={() => { setDiseaseScopeEditor(undefined); void invalidate('适用疾病范围已更新').catch(fail) }} />}
      </Suspense>
    )}
  </div>
}

function tabLabel(tab: Tab) { return tab === 'disease' ? '疾病' : tab === 'service' ? '项目' : '药品' }
