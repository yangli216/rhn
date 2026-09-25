import { useState, useMemo, useEffect, Suspense, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Organization } from '../../shared/model'
import type {
  RhnApi,
  ServiceCatalogItem,
  MedicationKnowledge,
  DiseaseConcept,
  ItemTermMapping,
} from '../../shared/rhnApi'
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Icon,
  LoadingState,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  StatusBadge,
  Tabs,
} from '../../shared/ui'
import {
  Table,
  StandardMappingDialog,
  MappingSummary,
  mappingTypeLabel,
  equivalenceLabel,
  mappingStatusLabel,
  DialogSuspenseFallback,
} from './BasicDataManagement'
import '../../styles/features/operational-master-data.css'
import '../../styles/features/standard-mapping.css'

export type StandardMappingDomain = 'SERVICE' | 'MEDICATION' | 'DIAGNOSIS' | 'CONSUMABLE'

const today = () => new Date().toISOString().slice(0, 10)

const domainTabs: Array<{ value: StandardMappingDomain; label: string }> = [
  { value: 'SERVICE', label: '诊疗服务 (医保诊疗/医疗规范)' },
  { value: 'MEDICATION', label: '药品主档 (国家医保药品/西成药)' },
  { value: 'DIAGNOSIS', label: '疾病诊断 (国家临床版ICD-10/医保)' },
  { value: 'CONSUMABLE', label: '医用耗材 (国家医保耗材代码)' },
]

export function StandardMappingWorkspace({
  api,
  organization,
  initialDomain = 'SERVICE',
}: {
  api: RhnApi
  organization: Organization
  initialDomain?: StandardMappingDomain
}) {
  const queryClient = useQueryClient()
  const [domain, setDomain] = useState<StandardMappingDomain>(initialDomain)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string>('')
  const [businessDate, setBusinessDate] = useState(today())
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MAPPED' | 'UNMAPPED'>('ALL')

  const handleSearch = () => {
    setQuery(keyword.trim())
    setPage(0)
    setSelectedId('')
  }

  const handleReset = () => {
    setKeyword('')
    setQuery('')
    setStatusFilter('ALL')
    setPage(0)
    setSelectedId('')
  }

  // 重置分页与选择
  useEffect(() => {
    setPage(0)
    setSelectedId('')
    setKeyword('')
    setQuery('')
  }, [domain])

  // 1. 诊疗服务列表
  const servicesQuery = useQuery({
    queryKey: ['standard-mapping-services', query, organization.id, page, pageSize],
    queryFn: () => api.masterData.searchServices(query, '', '', organization.id, page, pageSize),
    enabled: domain === 'SERVICE',
  })

  // 2. 药品知识列表
  const medicationsQuery = useQuery({
    queryKey: ['standard-mapping-medications', query, organization.id, page, pageSize],
    queryFn: () => api.masterData.searchMedications(query, '', '', organization.id, page, pageSize),
    enabled: domain === 'MEDICATION',
  })

  // 3. 疾病诊断列表
  const diseasesQuery = useQuery({
    queryKey: ['standard-mapping-diseases', query, page, pageSize],
    queryFn: () => api.masterData.searchDiseases(query, '', '', '', page, pageSize),
    enabled: domain === 'DIAGNOSIS',
  })

  // 统一列表项
  const items = useMemo(() => {
    if (domain === 'SERVICE') {
      return (servicesQuery.data?.content ?? []).map((s: ServiceCatalogItem) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.sdServiceTypeText === 'OTHER' ? '其他' : s.sdServiceTypeText,
        subtext: s.unitCode ? `计价单位: ${s.unitCode}` : undefined,
        raw: s,
      }))
    }
    if (domain === 'MEDICATION') {
      return (medicationsQuery.data?.content ?? []).map((m: MedicationKnowledge) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        type: m.sdMedicationTypeText || '药品',
        subtext: m.preparationSpec ? `规格: ${m.preparationSpec}` : undefined,
        raw: m,
      }))
    }
    if (domain === 'DIAGNOSIS') {
      return (diseasesQuery.data?.content ?? []).map((d: DiseaseConcept) => ({
        id: d.id,
        code: d.code,
        name: d.display,
        type: d.sdDiagnosisDomainText || d.sdConceptTypeText || '诊断概念',
        subtext: d.definition || undefined,
        raw: d,
      }))
    }
    if (domain === 'CONSUMABLE') {
      return [
        {
          id: 'con-001',
          code: 'C01010100100000000000000000',
          name: '一次性使用无菌注射器 (带针)',
          type: '普通耗材',
          subtext: '医保代码: C010101001…',
          raw: null,
        },
        {
          id: 'con-002',
          code: 'C02010100200000000000000000',
          name: '一次性静脉留置针',
          type: '穿刺耗材',
          subtext: '医保代码: C020101002…',
          raw: null,
        },
      ]
    }
    return []
  }, [domain, servicesQuery.data, medicationsQuery.data, diseasesQuery.data])

  const totalElements = useMemo(() => {
    if (domain === 'SERVICE') return servicesQuery.data?.totalElements ?? 0
    if (domain === 'MEDICATION') return medicationsQuery.data?.totalElements ?? 0
    if (domain === 'DIAGNOSIS') return diseasesQuery.data?.totalElements ?? 0
    if (domain === 'CONSUMABLE') return 2
    return 0
  }, [domain, servicesQuery.data, medicationsQuery.data, diseasesQuery.data])

  // 默认选中第一项
  useEffect(() => {
    if (items.length > 0 && !selectedId) {
      setSelectedId(items[0].id)
    }
  }, [items, selectedId])

  const selectedItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || items[0]
  }, [items, selectedId])

  // 当前主数据的主题类型
  const subjectType = domain === 'SERVICE' ? 'CATALOG_ITEM' : 'MEDICATION'
  const systemType = domain === 'SERVICE' ? 'SERVICE' : 'MEDICATION'

  // 查询当前选中条目的映射关系（诊疗与药品支持）
  const mappingsQuery = useQuery({
    queryKey: ['standard-mapping-maintenance', subjectType, selectedItem?.id, businessDate],
    queryFn: () => api.masterData.itemTermMappings(subjectType, selectedItem!.id, businessDate),
    enabled: Boolean(selectedItem?.id) && (domain === 'SERVICE' || domain === 'MEDICATION'),
  })

  const maintenanceData = mappingsQuery.data
  const effectiveMappings = maintenanceData?.effectiveMappings ?? []
  const historyMappings = maintenanceData?.history ?? []

  // 刷新当前映射
  const invalidateMappings = async (msg: string) => {
    setFeedback(msg)
    setOperationError('')
    setDialog(undefined)
    await queryClient.invalidateQueries({
      queryKey: ['standard-mapping-maintenance', subjectType, selectedItem?.id],
    })
  }

  // 快捷变更映射生命周期状态
  const changeMappingStatus = async (
    mapping: ItemTermMapping,
    status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED'
  ) => {
    try {
      setOperationError('')
      const end = status === 'RETIRED' ? (businessDate < mapping.validFrom ? mapping.validFrom : businessDate) : undefined
      await api.masterData.changeItemTermMappingStatus(mapping.id, mapping.revision, status, end)
      await invalidateMappings(`映射状态已变更: ${mappingStatusLabel(status)}`)
    } catch (err) {
      setOperationError((err as Error).message || '变更映射状态失败')
    }
  }

  // KPI 计算
  const insuranceCount = effectiveMappings.filter((m) => m.mappingType === 'INSURANCE').length
  const clinicalCount = effectiveMappings.filter((m) => m.mappingType === 'CLINICAL').length

  const isLoadingList =
    (domain === 'SERVICE' && servicesQuery.isPending) ||
    (domain === 'MEDICATION' && medicationsQuery.isPending) ||
    (domain === 'DIAGNOSIS' && diseasesQuery.isPending)

  return (
    <div className="standard-mapping-workspace">
      <PageHeader
        eyebrow="中心治理 · 标准编码体系"
        title="标准映射管理"
        description="统一维护诊疗服务、药品、疾病诊断等核心主数据与国家标准、医保目录（医保贯标对照）、行业与监管标准的映射对照；支持跨版本业务日期解析与映射全生命周期追溯。"
      />

      {feedback && <Alert tone="success">{feedback}</Alert>}
      {operationError && <Alert tone="error">{operationError}</Alert>}

      {/* 顶部 KPI 概览指标 */}
      <section className="standard-mapping-kpis" aria-label="映射指标总览">
        <div className="standard-mapping-kpi-card">
          <span className="standard-mapping-kpi-card__title">当前域主数据总量</span>
          <span className="standard-mapping-kpi-card__value">
            {totalElements} <small className="standard-mapping-kpi-card__unit">项</small>
          </span>
          <span className="standard-mapping-kpi-card__hint">
            {domain === 'SERVICE' ? '已录入的中心诊疗服务' : domain === 'MEDICATION' ? '通用药品主档条目' : domain === 'DIAGNOSIS' ? '疾病术语与中医诊断' : '医用耗材与试剂'}
          </span>
        </div>

        <div className="standard-mapping-kpi-card">
          <span className="standard-mapping-kpi-card__title">医保目录对照 (贯标)</span>
          <span className="standard-mapping-kpi-card__value standard-mapping-kpi-card__value--brand">
            {domain === 'SERVICE' || domain === 'MEDICATION' ? insuranceCount : '对齐中'}
            <small className="standard-mapping-kpi-card__unit">
              {domain === 'SERVICE' || domain === 'MEDICATION' ? '条有效' : ''}
            </small>
          </span>
          <span className="standard-mapping-kpi-card__hint">国家医疗保障局统一业务编码对照基准</span>
        </div>

        <div className="standard-mapping-kpi-card">
          <span className="standard-mapping-kpi-card__title">国家 / 临床标准对照</span>
          <span className="standard-mapping-kpi-card__value">
            {domain === 'SERVICE' || domain === 'MEDICATION' ? clinicalCount : '标准版'}
            <small className="standard-mapping-kpi-card__unit">
              {domain === 'SERVICE' || domain === 'MEDICATION' ? '条有效' : ''}
            </small>
          </span>
          <span className="standard-mapping-kpi-card__hint">卫健委医疗服务项目规范 / 临床ICD-10</span>
        </div>

        <div className="standard-mapping-kpi-card">
          <span className="standard-mapping-kpi-card__title">对照治理与版本状态</span>
          <span className="standard-mapping-kpi-card__value standard-mapping-kpi-card__value--success">
            {effectiveMappings.length > 0 ? '已建映射' : '待对照'}
          </span>
          <span className="standard-mapping-kpi-card__hint">支持按业务日期动态追溯历史生效记录</span>
        </div>
      </section>

      {/* 业务域维度 Tabs 栏 */}
      <nav className="standard-mapping-domain-tabs" aria-label="标准映射业务域">
        <Tabs
          label="标准映射业务域"
          items={domainTabs}
          value={domain}
          onChange={(tab) => setDomain(tab as StandardMappingDomain)}
        />
      </nav>

      {/* PC 宽屏左右协同工作台 */}
      <div className="standard-mapping-layout">
        {/* 左侧：主数据项目列表 */}
        <section className="standard-mapping-master-panel" aria-label="主数据条目列表">
          <header className="standard-mapping-master-panel__header">
            <SearchField
              label={`搜索${domain === 'SERVICE' ? '诊疗项目' : domain === 'MEDICATION' ? '药品' : '疾病诊断'}`}
              value={keyword}
              onChange={setKeyword}
              onSearch={handleSearch}
              placeholder={`搜索${domain === 'SERVICE' ? '诊疗项目' : domain === 'MEDICATION' ? '药品' : '疾病诊断'}名称或编码（回车或点击查询）`}
            />
            <div className="standard-mapping-master-panel__filters">
              <Select
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val as 'ALL' | 'MAPPED' | 'UNMAPPED')
                  setPage(0)
                  setSelectedId('')
                }}
                options={[
                  { value: 'ALL', label: '全部对照状态' },
                  { value: 'MAPPED', label: '已有映射记录' },
                  { value: 'UNMAPPED', label: '暂无映射记录' },
                ]}
              />
              <Button size="sm" variant="primary" type="button" onClick={handleSearch}>查询</Button>
              <Button size="sm" variant="secondary" type="button" onClick={handleReset}>重置</Button>
            </div>
          </header>

          {isLoadingList ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <LoadingState label="正在加载主数据列表…" />
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <EmptyState icon="clinical" title="未找到相关数据" copy="可尝试调整搜索关键字或切换业务域。" />
            </div>
          ) : (
            <ul className="standard-mapping-master-list" role="listbox">
              {items.map((item) => {
                const isSelected = item.id === selectedItem?.id
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`standard-mapping-master-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="standard-mapping-master-item__title-row">
                      <span className="standard-mapping-master-item__name">{item.name}</span>
                      <StatusBadge tone="neutral">{item.type}</StatusBadge>
                    </div>
                    <div className="standard-mapping-master-item__meta-row">
                      <span className="standard-mapping-master-item__code">{item.code}</span>
                      {item.subtext && <span>{item.subtext}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <footer className="standard-mapping-master-panel__footer">
            <Pagination
              page={page}
              pageSize={pageSize}
              totalPages={Math.ceil(totalElements / pageSize) || 1}
              total={totalElements}
              onChange={setPage}
              onPageSizeChange={setPageSize}
              mode="compact"
            />
          </footer>
        </section>

        {/* 右侧：标准对照工作区 */}
        <section className="standard-mapping-detail-panel" aria-label="标准映射工作区">
          {!selectedItem ? (
            <EmptyState icon="clinical" title="请选择左侧主数据条目" copy="选择项目后可在右侧查看和维护其标准映射与医保目录对照。" />
          ) : domain === 'DIAGNOSIS' ? (
            /* 疾病与诊断标准对照骨架展示 */
            <div className="standard-mapping-section">
              <header className="standard-mapping-detail-panel__top">
                <div className="standard-mapping-detail-panel__subject-info">
                  <h3 className="standard-mapping-detail-panel__subject-name">
                    {selectedItem.name}
                    <StatusBadge tone="info">诊断概念</StatusBadge>
                  </h3>
                  <div className="standard-mapping-detail-panel__subject-meta">
                    <span>标准编码: <code>{selectedItem.code}</code></span>
                    <span>分类: {selectedItem.type}</span>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() =>
                    setFeedback('疾病诊断标准映射（国家临床版 ICD-10 与国家医保疾病诊断代码对照）骨架已就绪，正在对接疾病专有 TermMapping 批量接入。')
                  }
                >
                  <Icon name="add" /> 建立诊断标准对照
                </Button>
              </header>

              <div className="standard-mapping-skeleton-card">
                <h4>疾病诊断标准映射管理（骨架设计）</h4>
                <p>
                  疾病诊断是医保结算（CHS-DRG / DIP 分组）与病案首页的核心依据。本功能已搭建标准映射多业务域骨架，正在打磨完善以下标准编码对照能力：
                </p>
                <div className="standard-mapping-skeleton-features">
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>国家临床版 ICD-10 (2.0/3.0)</strong>
                    <span>支持临床西医诊断与国家标准疾病编码对照，保障病案质量。</span>
                  </div>
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>医保疾病诊断代码 (CHS-DRG)</strong>
                    <span>建立医院诊断与医保版疾病分类代码映射，满足医保结算上传要求。</span>
                  </div>
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>中医病名与中医证候编码</strong>
                    <span>规范中医诊断标准映射，支持多重等价关系与主要诊断标记。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : domain === 'CONSUMABLE' ? (
            /* 医用耗材标准映射骨架展示 */
            <div className="standard-mapping-section">
              <header className="standard-mapping-detail-panel__top">
                <div className="standard-mapping-detail-panel__subject-info">
                  <h3 className="standard-mapping-detail-panel__subject-name">
                    {selectedItem?.name || '医用耗材与检验试剂标准映射'}
                    <StatusBadge tone="warning">医保贯标治理中</StatusBadge>
                  </h3>
                  <div className="standard-mapping-detail-panel__subject-meta">
                    <span>主数据编码: <code>{selectedItem?.code || 'CONSUMABLE-SPEC'}</code></span>
                    <span>覆盖高值耗材、低值耗材与体外诊断试剂</span>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() =>
                    setFeedback('医用耗材医保代码贯标（国家医保局 27 位统一编码）对照骨架已就绪，正在对接耗材招采平台与流水号对照。')
                  }
                >
                  <Icon name="add" /> 建立耗材医保对照
                </Button>
              </header>

              <div className="standard-mapping-skeleton-card">
                <h4>医用耗材医保代码贯标对照（骨架设计）</h4>
                <p>
                  全面对接国家医保局“医保医用耗材分类与代码”（27 位标准贯标编码）。后续将支持耗材主档批量对照、招采平台代码对齐与医保耗材流水号绑定。
                </p>
                <div className="standard-mapping-skeleton-features">
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>国家医保耗材编码 (27位)</strong>
                    <span>支持耗材品目代码、特征码及生产企业流水号逐级匹配与校验。</span>
                  </div>
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>省级招采平台流水号对接</strong>
                    <span>打通阳光采购平台挂网流水号，实现耗材采销存与医保报销一致性。</span>
                  </div>
                  <div className="standard-mapping-skeleton-feature-item">
                    <strong>体外诊断试剂 (IVD) 专区对照</strong>
                    <span>规范检验项目与诊断试剂对照，保障医保合规结算。</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 诊疗服务与通用药品标准映射完整操作区 */
            <>
              {/* 头部项目信息与操作按钮 */}
              <header className="standard-mapping-detail-panel__top">
                <div className="standard-mapping-detail-panel__subject-info">
                  <h3 className="standard-mapping-detail-panel__subject-name">
                    {selectedItem.name}
                    <StatusBadge tone="success">{selectedItem.type}</StatusBadge>
                  </h3>
                  <div className="standard-mapping-detail-panel__subject-meta">
                    <span>主数据编码: <code>{selectedItem.code}</code></span>
                    {selectedItem.subtext && <span>{selectedItem.subtext}</span>}
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() =>
                    setDialog(
                      <StandardMappingDialog
                        api={api}
                        subjectType={subjectType}
                        targetId={selectedItem.id}
                        itemName={selectedItem.name}
                        systemType={systemType}
                        onClose={() => setDialog(undefined)}
                      />
                    )
                  }
                >
                  <Icon name="add" /> 建立标准映射对照
                </Button>
              </header>

              {/* 业务日期与有效映射卡片流 */}
              <section className="standard-mapping-section" aria-label="有效映射视图">
                <div className="standard-mapping-section__head">
                  <div>
                    <h4 className="standard-mapping-section__title">业务日期下的有效映射</h4>
                    <p className="standard-mapping-section__desc">
                      支持指定业务执行时点，按业务日期即时解析当时生效的标准编码（如医保目录与国家规范）。
                    </p>
                  </div>
                  <div style={{ width: '13rem' }}>
                    <FormField label="业务核算日期">
                      <input
                        type="date"
                        value={businessDate}
                        onChange={(e) => setBusinessDate(e.target.value)}
                      />
                    </FormField>
                  </div>
                </div>

                {mappingsQuery.isPending ? (
                  <LoadingState label="正在解析生效的标准映射…" />
                ) : effectiveMappings.length === 0 ? (
                  <EmptyState
                    icon="clinical"
                    title="该日期下暂无有效标准映射"
                    copy="点击右上角「建立标准映射对照」按钮为该项目新增首条对照记录。"
                    action={
                      <Button
                        size="sm"
                        onClick={() =>
                          setDialog(
                            <StandardMappingDialog
                              api={api}
                              subjectType={subjectType}
                              targetId={selectedItem.id}
                              itemName={selectedItem.name}
                              systemType={systemType}
                              onClose={() => setDialog(undefined)}
                            />
                          )
                        }
                      >
                        立即建立映射
                      </Button>
                    }
                  />
                ) : (
                  <div className="standard-mapping-cards-grid">
                    {effectiveMappings.map((mapping) => (
                      <MappingSummary key={mapping.id} value={mapping} />
                    ))}
                  </div>
                )}
              </section>

              {/* 历史映射与全生命周期追溯表格 */}
              <section className="standard-mapping-section" aria-label="映射历史全生命周期">
                <div className="standard-mapping-section__head">
                  <div>
                    <h4 className="standard-mapping-section__title">映射全生命周期追溯</h4>
                    <p className="standard-mapping-section__desc">
                      包含有效、已暂停、已停用以及被替代的完整映射版本，支持追溯责任人与生效区间。
                    </p>
                  </div>
                </div>

                {mappingsQuery.isPending ? (
                  <LoadingState label="正在加载历史映射…" />
                ) : historyMappings.length === 0 ? (
                  <EmptyState icon="clinical" title="暂无历史版本记录" copy="建立映射并产生版本变更后将在此归档呈现。" />
                ) : (
                  <Table
                    compact
                    headers={['映射用途 / 标准体系', '标准条目', '等价关系 / 范围', '生效区间', '状态', '操作']}
                  >
                    {historyMappings.map((m) => (
                      <tr key={`${m.id}-${m.revision}`}>
                        <td>
                          <strong>{mappingTypeLabel(m.mappingType)}</strong>
                          <br />
                          <small>{m.systemName} · {m.systemVersion}</small>
                          <br />
                          <code>{m.systemCode}</code>
                        </td>
                        <td>
                          <strong>{m.termDisplay}</strong>
                          <br />
                          <code>{m.termCode}</code>
                        </td>
                        <td>
                          {equivalenceLabel(m.equivalence)}
                          {m.primaryMapping && (
                            <span style={{ marginLeft: 'var(--space-1)' }}>
                              <StatusBadge tone="success">主要</StatusBadge>
                            </span>
                          )}
                          <br />
                          <small>{m.limitation || '全范围适用'}</small>
                        </td>
                        <td>
                          {m.validFrom}
                          <br />
                          <small>至 {m.validTo || '长期'}</small>
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              m.status === 'ACTIVE'
                                ? 'success'
                                : m.status === 'SUSPENDED'
                                ? 'warning'
                                : 'neutral'
                            }
                          >
                            {mappingStatusLabel(m.status)}
                          </StatusBadge>
                        </td>
                        <td>
                          {m.status === 'ACTIVE' && (
                            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                              <Button
                                size="sm"
                                variant="text"
                                onClick={() =>
                                  setDialog(
                                    <StandardMappingDialog
                                      api={api}
                                      subjectType={subjectType}
                                      targetId={selectedItem.id}
                                      itemName={selectedItem.name}
                                      systemType={systemType}
                                      onClose={() => setDialog(undefined)}
                                    />
                                  )
                                }
                              >
                                替代
                              </Button>
                              <Button
                                size="sm"
                                variant="text"
                                onClick={() => void changeMappingStatus(m, 'SUSPENDED')}
                              >
                                暂停
                              </Button>
                              <Button
                                size="sm"
                                variant="text"
                                onClick={() => void changeMappingStatus(m, 'RETIRED')}
                              >
                                停用
                              </Button>
                            </div>
                          )}
                          {m.status === 'SUSPENDED' && (
                            <Button
                              size="sm"
                              variant="text"
                              onClick={() => void changeMappingStatus(m, 'ACTIVE')}
                            >
                              恢复
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </section>
            </>
          )}
        </section>
      </div>

      {/* 弹窗渲染 */}
      {dialog && (
        <Suspense fallback={<DialogSuspenseFallback label="正在打开标准映射对照…" />}>
          {dialog}
        </Suspense>
      )}
    </div>
  )
}
export default StandardMappingWorkspace
