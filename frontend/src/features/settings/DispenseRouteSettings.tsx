import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import {
  errorMessage,
  type DispenseCareSetting,
  type DispenseRoute,
  type DispenseRouteInput,
  type RhnApi,
} from '../../shared/rhnApi'
import {
  Alert,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Icon,
  LoadingState,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  Select,
  StatusBadge,
  TableShell,
} from '../../shared/ui'
import type { IconName } from '../../shared/ui/Icon'
import type { StatusTone } from '../../shared/ui'

const today = () => new Date().toISOString().slice(0, 10)

export const careSettingLabels: Record<DispenseCareSetting, string> = {
  OUTPATIENT: '门诊',
  EMERGENCY: '急诊',
  INPATIENT: '住院',
  HOME_CARE: '家庭病床',
}

export const careSettingTones: Record<DispenseCareSetting, 'info' | 'success' | 'warning' | 'neutral'> = {
  OUTPATIENT: 'info',
  INPATIENT: 'success',
  EMERGENCY: 'warning',
  HOME_CARE: 'neutral',
}

export type RoutePriority = 1 | 2 | 3 | 4

export interface RoutePriorityMeta {
  priority: RoutePriority
  level: number
  label: string
  tone: StatusTone
  icon: IconName
  hint: string
}

export function getRoutePriorityMeta(
  route: Pick<DispenseRoute, 'medicationType' | 'sourceDepartmentId'>
): RoutePriorityMeta {
  const hasMed = Boolean(route.medicationType)
  const hasDept = Boolean(route.sourceDepartmentId)
  if (hasMed && hasDept) {
    return {
      priority: 1,
      level: 3,
      label: '复合专项',
      tone: 'warning',
      icon: 'award',
      hint: '科室与药品同时命中，优先级最高',
    }
  }
  if (hasMed) {
    return {
      priority: 2,
      level: 2,
      label: '药品专项',
      tone: 'info',
      icon: 'clinical',
      hint: '指定药品类型精准分流，优先于科室与默认规则',
    }
  }
  if (hasDept) {
    return {
      priority: 3,
      level: 1,
      label: '科室专项',
      tone: 'success',
      icon: 'organization',
      hint: '指定开方科室专属分流，优先于默认兜底规则',
    }
  }
  return {
    priority: 4,
    level: 0,
    label: '默认兜底',
    tone: 'neutral',
    icon: 'tasks',
    hint: '全科室与全药品通用兜底规则',
  }
}

export function resolveSimulatedRoute(
  routes: DispenseRoute[],
  careSetting: DispenseCareSetting,
  departmentId?: string,
  medicationType?: string,
  date: string = today()
): { route: DispenseRoute | null; reason: string } {
  const candidates = routes.filter((r) => {
    if (!r.active) return false
    if (r.validFrom > date) return false
    if (r.validTo && r.validTo < date) return false
    if (r.careSetting !== careSetting) return false
    if (r.sourceDepartmentId && r.sourceDepartmentId !== departmentId) return false
    if (r.medicationType && r.medicationType !== medicationType) return false
    return true
  })

  if (candidates.length === 0) {
    return {
      route: null,
      reason: '未命中任何有效路由规则，医嘱无法自动路由至发药药房，请配置兜底规则。',
    }
  }

  // 严格遵循后端 DispenseRouteApplicationService specificity 降序算法
  candidates.sort((a, b) => {
    const specA = (a.medicationType ? 2 : 0) + (a.sourceDepartmentId ? 1 : 0)
    const specB = (b.medicationType ? 2 : 0) + (b.sourceDepartmentId ? 1 : 0)
    if (specB !== specA) return specB - specA
    return a.code.localeCompare(b.code)
  })

  const winner = candidates[0]
  const meta = getRoutePriorityMeta(winner)
  let reason = ''
  if (meta.priority === 1) {
    reason = `开方科室与药品类型同时精准匹配（复合专项最高优先级），直达专属发药药房。`
  } else if (meta.priority === 2) {
    reason = `药品类型专项命中（优先级 2），优先于科室及默认兜底规则分流。`
  } else if (meta.priority === 3) {
    reason = `开方科室专项命中（优先级 3），优先于默认兜底规则分流。`
  } else {
    reason = `未命中任何专项规则，按场景通用默认规则兜底流向。`
  }

  return { route: winner, reason }
}

export function DispenseRouteSettings({
  api,
  clinicalContext,
}: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const organizationId = clinicalContext.organization.id
  const [editor, setEditor] = useState<DispenseRoute | null | undefined>()
  const [feedback, setFeedback] = useState('')

  // 搜索与多维过滤
  const [search, setSearch] = useState('')
  const [careSettingFilter, setCareSettingFilter] = useState<string>('ALL')
  const [pharmacyFilter, setPharmacyFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL')

  // 交互式路由试算沙盒
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [simCareSetting, setSimCareSetting] = useState<DispenseCareSetting>('OUTPATIENT')
  const [simDepartmentId, setSimDepartmentId] = useState<string>('')
  const [simMedicationType, setSimMedicationType] = useState<string>('')

  const routes = useQuery({
    queryKey: ['dispense-routes', organizationId],
    queryFn: () => api.pharmacy.dispenseRoutes(organizationId),
  })
  const sites = useQuery({
    queryKey: ['pharmacy-sites', organizationId],
    queryFn: () => api.pharmacy.sites(organizationId),
  })
  const departments = useQuery({
    queryKey: ['organization-departments', organizationId],
    queryFn: () => api.organization.departments(organizationId),
  })
  const medicationTypes = useQuery({
    queryKey: ['dictionary', 'BD_MEDICATION_TYPE'],
    queryFn: () => api.dictionaries.resolve('BD_MEDICATION_TYPE'),
  })

  const pharmacySites = useMemo(
    () => (sites.data ?? []).filter((site) => site.active && site.siteType === 'PHARMACY'),
    [sites.data]
  )

  const activeRoutes = useMemo(() => routes.data?.filter((value) => value.active) ?? [], [routes.data])
  const inactiveCount = (routes.data?.length ?? 0) - activeRoutes.length

  // 门诊兜底与住院兜底
  const defaultOutpatientRoute = useMemo(
    () =>
      activeRoutes.find(
        (value) => value.careSetting === 'OUTPATIENT' && !value.sourceDepartmentId && !value.medicationType
      ),
    [activeRoutes]
  )

  const defaultInpatientRoute = useMemo(
    () =>
      activeRoutes.find(
        (value) => value.careSetting === 'INPATIENT' && !value.sourceDepartmentId && !value.medicationType
      ),
    [activeRoutes]
  )

  const outpatientSiteName = useMemo(() => {
    if (defaultOutpatientRoute) {
      return pharmacySites.find((site) => site.id === defaultOutpatientRoute.targetStockSiteId)?.name ?? '已配置'
    }
    const anyOutpatient = activeRoutes.find((r) => r.careSetting === 'OUTPATIENT')
    if (anyOutpatient) {
      return pharmacySites.find((site) => site.id === anyOutpatient.targetStockSiteId)?.name ?? '专项分流中'
    }
    return '未配置'
  }, [defaultOutpatientRoute, activeRoutes, pharmacySites])

  const inpatientSiteName = useMemo(() => {
    if (defaultInpatientRoute) {
      return pharmacySites.find((site) => site.id === defaultInpatientRoute.targetStockSiteId)?.name ?? '已配置'
    }
    const anyInpatient = activeRoutes.find((r) => r.careSetting === 'INPATIENT')
    if (anyInpatient) {
      return pharmacySites.find((site) => site.id === anyInpatient.targetStockSiteId)?.name ?? '病区专流中'
    }
    return '未配置'
  }, [defaultInpatientRoute, activeRoutes, pharmacySites])

  const specializedMedCount = useMemo(
    () => new Set(activeRoutes.map((value) => value.medicationType).filter(Boolean)).size,
    [activeRoutes]
  )
  const specializedDeptCount = useMemo(
    () => new Set(activeRoutes.map((value) => value.sourceDepartmentId).filter(Boolean)).size,
    [activeRoutes]
  )

  async function refreshed(message: string) {
    setFeedback(message)
    setEditor(undefined)
    await queryClient.invalidateQueries({ queryKey: ['dispense-routes', organizationId] })
  }

  const save = useMutation({
    mutationFn: ({ value, input }: { value?: DispenseRoute; input: DispenseRouteInput }) =>
      value
        ? api.pharmacy.updateDispenseRoute(value.id, value.revision, input)
        : api.pharmacy.createDispenseRoute(input),
    onSuccess: (_, variables) => refreshed(variables.value ? '发药路由已更新' : '发药路由已创建'),
  })

  const toggleActive = useMutation({
    mutationFn: (value: DispenseRoute) =>
      api.pharmacy.updateDispenseRoute(value.id, value.revision, {
        organizationId: value.organizationId,
        code: value.code,
        name: value.name,
        careSetting: value.careSetting,
        sourceDepartmentId: value.sourceDepartmentId,
        medicationType: value.medicationType,
        targetStockSiteId: value.targetStockSiteId,
        active: !value.active,
        validFrom: value.validFrom,
        validTo: value.validTo,
        description: value.description,
      }),
    onSuccess: (_, variables) =>
      refreshed(`发药路由【${variables.name}】已${variables.active ? '停用' : '启用'}`),
  })

  // 试算结果推演
  const simulationResult = useMemo(() => {
    if (!simulatorOpen || !routes.data) return null
    return resolveSimulatedRoute(
      routes.data,
      simCareSetting,
      simDepartmentId || undefined,
      simMedicationType || undefined
    )
  }, [simulatorOpen, routes.data, simCareSetting, simDepartmentId, simMedicationType])

  // 规则列表多维过滤与自然层级排序
  const filteredRoutes = useMemo(() => {
    if (!routes.data) return []
    const term = search.trim().toLowerCase()

    return routes.data
      .filter((route) => {
        if (careSettingFilter !== 'ALL' && route.careSetting !== careSettingFilter) return false
        if (pharmacyFilter !== 'ALL' && route.targetStockSiteId !== pharmacyFilter) return false
        if (statusFilter === 'ACTIVE' && !route.active) return false
        if (statusFilter === 'INACTIVE' && route.active) return false

        const meta = getRoutePriorityMeta(route)
        if (priorityFilter !== 'ALL' && String(meta.priority) !== priorityFilter) return false

        if (term) {
          const deptName = departments.data?.find((item) => item.id === route.sourceDepartmentId)?.name ?? ''
          const medName = medicationTypes.data?.find((item) => item.code === route.medicationType)?.name ?? ''
          const siteName = pharmacySites.find((site) => site.id === route.targetStockSiteId)?.name ?? ''
          const matchesTerm =
            route.name.toLowerCase().includes(term) ||
            route.code.toLowerCase().includes(term) ||
            (route.description ?? '').toLowerCase().includes(term) ||
            deptName.toLowerCase().includes(term) ||
            medName.toLowerCase().includes(term) ||
            siteName.toLowerCase().includes(term)
          if (!matchesTerm) return false
        }
        return true
      })
      .sort((a, b) => {
        // 场景排序：OUTPATIENT -> INPATIENT -> EMERGENCY -> HOME_CARE
        const settingOrder: Record<DispenseCareSetting, number> = {
          OUTPATIENT: 0,
          INPATIENT: 1,
          EMERGENCY: 2,
          HOME_CARE: 3,
        }
        if (a.careSetting !== b.careSetting) {
          return (settingOrder[a.careSetting] ?? 9) - (settingOrder[b.careSetting] ?? 9)
        }
        // 特异度优先级高的排在前面
        const specA = (a.medicationType ? 2 : 0) + (a.sourceDepartmentId ? 1 : 0)
        const specB = (b.medicationType ? 2 : 0) + (b.sourceDepartmentId ? 1 : 0)
        if (specB !== specA) return specB - specA
        return a.code.localeCompare(b.code)
      })
  }, [
    routes.data,
    search,
    careSettingFilter,
    pharmacyFilter,
    statusFilter,
    priorityFilter,
    departments.data,
    medicationTypes.data,
    pharmacySites,
  ])

  const loading = routes.isPending || sites.isPending || departments.isPending || medicationTypes.isPending
  const currentError =
    routes.error || sites.error || departments.error || medicationTypes.error || save.error || toggleActive.error

  const hasActiveFilters =
    Boolean(search) ||
    careSettingFilter !== 'ALL' ||
    pharmacyFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL'

  function clearAllFilters() {
    setSearch('')
    setCareSettingFilter('ALL')
    setPharmacyFilter('ALL')
    setStatusFilter('ALL')
    setPriorityFilter('ALL')
  }

  return (
    <div className="master-data-page dispense-route-page">
      <PageHeader
        compact
        eyebrow="运营配置 · 药事管理"
        title="发药药房设置"
        description="定义医生站开具药品医嘱时流向的发药药房；支持四级匹配特异度分流机制，专项规则精准优先，未命中时自动使用默认药房兜底。"
        actions={
          <div className="dispense-header-actions">
            <Button
              variant={simulatorOpen ? 'secondary' : 'secondary'}
              onClick={() => setSimulatorOpen((prev) => !prev)}
            >
              <Icon name="clinical" />
              {simulatorOpen ? '收起测算沙盒' : '路由测算沙盒'}
            </Button>
            <Button onClick={() => setEditor(null)} disabled={!pharmacySites.length}>
              <Icon name="add" />
              新增规则
            </Button>
          </div>
        }
      />

      {feedback && <Alert tone="success">{feedback}</Alert>}
      {currentError && <Alert>{errorMessage(currentError)}</Alert>}

      {/* 顶部四维 KPI 概览工作台 */}
      <section className="ui-stat-grid dispense-route-summary" aria-label="发药路由概览">
        <div className="ui-stat-card">
          <span>全院生效路由</span>
          <strong>
            {activeRoutes.length} <small>条生效</small>
          </strong>
          <small>
            共 {routes.data?.length ?? 0} 条配置{inactiveCount > 0 ? `（${inactiveCount} 条停用）` : '，运转正常'}
          </small>
        </div>

        <div className={`ui-stat-card ${defaultOutpatientRoute ? 'is-success' : 'is-warning'}`}>
          <span>门诊默认药房</span>
          <strong title={outpatientSiteName}>{outpatientSiteName}</strong>
          <small>{defaultOutpatientRoute ? '覆盖门诊未命中专项医嘱' : '未设全局兜底，建议配置'}</small>
        </div>

        <div className={`ui-stat-card ${defaultInpatientRoute ? 'is-success' : 'is-warning'}`}>
          <span>住院默认药房</span>
          <strong title={inpatientSiteName}>{inpatientSiteName}</strong>
          <small>{defaultInpatientRoute ? '覆盖病区住院常规医嘱' : '病区医嘱由专属规则分流'}</small>
        </div>

        <div className="ui-stat-card">
          <span>专项精准分流</span>
          <strong>
            {specializedMedCount} 类药品 / {specializedDeptCount} 科室
          </strong>
          <small>特异度优先，精准导流专属药房</small>
        </div>
      </section>

      {/* 主规则面板 */}
      <Panel className="master-data-panel dispense-route-panel">
        <PanelHead
          title="发药路由匹配规则"
          meta="匹配决策顺序：① 复合专项（P1） > ② 药品专项（P2） > ③ 科室专项（P3） > ④ 默认兜底（P4）"
        />

        {/* 交互式路由试算沙盒（展开态） */}
        {simulatorOpen && (
          <section className="dispense-route-simulator" aria-label="发药路由测算沙盒">
            <div className="dispense-route-simulator__head">
              <div className="dispense-route-simulator__title">
                <Icon name="clinical" />
                <span>医嘱发药路由测算沙盒</span>
                <small>（输入拟开立医嘱的业务要素，实时验证匹配药房与决策依据）</small>
              </div>
              <Button size="sm" variant="text" onClick={() => setSimulatorOpen(false)}>
                收起沙盒
              </Button>
            </div>
            <div className="dispense-route-simulator__form">
              <FormField label="拟开立场景" required>
                <Select
                  value={simCareSetting}
                  onChange={(val) => setSimCareSetting(val as DispenseCareSetting)}
                  clearable={false}
                  options={Object.entries(careSettingLabels).map(([value, label]) => ({ value, label }))}
                />
              </FormField>

              <FormField label="开方科室" hint="留空代表未限定特定科室">
                <Select
                  value={simDepartmentId}
                  onChange={setSimDepartmentId}
                  placeholder="全部开方科室"
                  showValue
                  options={(departments.data ?? [])
                    .filter((item) => item.sdOrgStatus === 'ACTIVE')
                    .map((item) => ({ value: item.id, label: item.name, code: item.code }))}
                />
              </FormField>

              <FormField label="开立药品类型" hint="留空代表常规全部药品类型">
                <Select
                  value={simMedicationType}
                  onChange={setSimMedicationType}
                  placeholder="全部药品类型"
                  showValue
                  options={(medicationTypes.data ?? []).map((item) => ({
                    value: item.code,
                    label: item.name,
                    code: item.code,
                  }))}
                />
              </FormField>
            </div>

            {simulationResult && (
              <div
                className={`dispense-route-simulator__result ${
                  simulationResult.route ? 'is-matched' : 'is-unmatched'
                }`}
              >
                <div className="dispense-route-simulator__result-main">
                  <div className="dispense-route-simulator__result-badge">
                    <Icon name="pharmacy" />
                    <span>
                      {simulationResult.route
                        ? pharmacySites.find((s) => s.id === simulationResult.route?.targetStockSiteId)?.name ??
                          '目标药房'
                        : '未命中发药药房'}
                    </span>
                  </div>
                  <div className="dispense-route-simulator__result-info">
                    <strong>
                      {simulationResult.route
                        ? `命中规则：${simulationResult.route.name}`
                        : '无法自动路由分配'}
                    </strong>
                    <small>{simulationResult.reason}</small>
                  </div>
                </div>
                {simulationResult.route && (
                  <div className="dispense-route-simulator__result-priority">
                    {(() => {
                      const meta = getRoutePriorityMeta(simulationResult.route)
                      return (
                        <StatusBadge tone={meta.tone}>
                          优先级 P{meta.priority} · {meta.label}
                        </StatusBadge>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 综合过滤与即时检索工具栏 */}
        <div className="master-data-toolbar dispense-route-toolbar">
          <SearchField
            className="master-data-toolbar__search"
            label="搜索发药路由"
            value={search}
            onChange={setSearch}
            placeholder="搜索规则名称、编码、科室、药品或药房…"
          />

          <Select
            value={careSettingFilter}
            onChange={setCareSettingFilter}
            clearable={false}
            options={[
              { value: 'ALL', label: '全部场景' },
              ...Object.entries(careSettingLabels).map(([value, label]) => ({ value, label })),
            ]}
          />

          <Select
            value={pharmacyFilter}
            onChange={setPharmacyFilter}
            clearable={false}
            options={[
              { value: 'ALL', label: '全部流向药房' },
              ...pharmacySites.map((site) => ({ value: site.id, label: site.name })),
            ]}
          />

          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            clearable={false}
            options={[
              { value: 'ALL', label: '全部优先级' },
              { value: '1', label: 'P1 · 复合专项' },
              { value: '2', label: 'P2 · 药品专项' },
              { value: '3', label: 'P3 · 科室专项' },
              { value: '4', label: 'P4 · 默认兜底' },
            ]}
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            clearable={false}
            options={[
              { value: 'ALL', label: '全部状态' },
              { value: 'ACTIVE', label: '已启用' },
              { value: 'INACTIVE', label: '已停用' },
            ]}
          />

          {hasActiveFilters && (
            <Button size="sm" variant="text" onClick={clearAllFilters}>
              <Icon name="close" />
              重置
            </Button>
          )}

          <span className="master-data-count">
            {hasActiveFilters
              ? `筛选 ${filteredRoutes.length} / 共 ${routes.data?.length ?? 0} 条`
              : `共 ${routes.data?.length ?? 0} 条规则`}
          </span>
        </div>

        {/* 内容主体区域 */}
        {loading && <LoadingState label="正在加载发药药房设置…" />}
        {!loading && !pharmacySites.length && (
          <EmptyState
            icon="pharmacy"
            title="暂无可用发药药房"
            copy="请先在组织与人员中建立门诊药房、住院药房或中药房科室，系统会自动同步生成库存站点。"
          />
        )}
        {!loading && pharmacySites.length > 0 && !routes.data?.length && (
          <EmptyState
            icon="pharmacy"
            title="尚未配置发药路由"
            copy="建议先配置一条门诊或住院的默认兜底规则，再按中药饮片等特殊药品类型补充专项规则。"
            action={<Button onClick={() => setEditor(null)}>配置默认药房</Button>}
          />
        )}

        {!loading && Boolean(routes.data?.length) && filteredRoutes.length === 0 && (
          <EmptyState
            icon="search"
            title="未找到匹配的发药规则"
            copy="请尝试调整检索关键词或清空场景、药房与优先级筛选条件。"
            action={
              <Button variant="secondary" onClick={clearAllFilters}>
                清空筛选条件
              </Button>
            }
          />
        )}

        {!loading && filteredRoutes.length > 0 && (
          <TableShell scrollClassName="master-data-table-wrap">
            <DataTable className="master-data-table dispense-route-table" compact>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>规则名称</th>
                  <th style={{ width: '12%' }}>匹配优先级</th>
                  <th style={{ width: '8%' }}>诊疗场景</th>
                  <th style={{ width: '12%' }}>开方科室</th>
                  <th style={{ width: '12%' }}>药品类型</th>
                  <th style={{ width: '12%' }}>流向发药药房</th>
                  <th style={{ width: '10%' }}>有效期</th>
                  <th style={{ width: '7%' }}>状态</th>
                  <th className="col-actions" style={{ width: '8.5rem', minWidth: '8.5rem' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map((value) => {
                  const priorityMeta = getRoutePriorityMeta(value)
                  const isSimulatedMatch = simulationResult?.route?.id === value.id
                  const pharmacySite = pharmacySites.find((site) => site.id === value.targetStockSiteId)
                  const deptName = departments.data?.find((item) => item.id === value.sourceDepartmentId)?.name
                  const medTypeName = medicationTypes.data?.find((item) => item.code === value.medicationType)?.name

                  return (
                    <tr
                      key={value.id}
                      className={`${isSimulatedMatch ? 'is-simulated-match' : ''} ${
                        !value.active ? 'is-inactive-row' : ''
                      }`}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <strong>{value.name}</strong>
                          {isSimulatedMatch && <StatusBadge tone="info">🎯 测算命中</StatusBadge>}
                        </div>
                        {value.description && <small>{value.description}</small>}
                      </td>

                      <td>
                        <span title={priorityMeta.hint}>
                          <StatusBadge tone={priorityMeta.tone}>
                            P{priorityMeta.priority} · {priorityMeta.label}
                          </StatusBadge>
                        </span>
                      </td>

                      <td>
                        <StatusBadge tone={careSettingTones[value.careSetting]}>
                          {careSettingLabels[value.careSetting]}
                        </StatusBadge>
                      </td>

                      <td>
                        {value.sourceDepartmentId && deptName ? (
                          <strong>{deptName}</strong>
                        ) : (
                          <span className="dispense-text-muted">全部开方科室</span>
                        )}
                      </td>

                      <td>
                        {value.medicationType && medTypeName ? (
                          <strong>{medTypeName}</strong>
                        ) : (
                          <span className="dispense-text-muted">全部药品类型</span>
                        )}
                      </td>

                      <td>
                        <div className="dispense-pharmacy-cell">
                          <Icon name="pharmacy" className="ui-icon-inline" />
                          <span>{pharmacySite?.name || '未知药房'}</span>
                        </div>
                      </td>

                      <td>
                        <div>{value.validFrom}</div>
                        <small>{value.validTo ? `至 ${value.validTo}` : '长期有效'}</small>
                      </td>

                      <td>
                        <StatusBadge tone={value.active ? 'success' : 'neutral'}>
                          {value.active ? '已启用' : '已停用'}
                        </StatusBadge>
                      </td>

                      <td className="col-actions">
                        <div className="master-data-row-actions">
                          <Button size="sm" variant="text" onClick={() => setEditor(value)}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            disabled={toggleActive.isPending}
                            onClick={() => toggleActive.mutate(value)}
                          >
                            {value.active ? '停用' : '启用'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          </TableShell>
        )}
      </Panel>

      {/* 规则编辑/新增弹窗 */}
      {editor !== undefined && (
        <RouteEditor
          value={editor ?? undefined}
          organizationId={organizationId}
          departments={(departments.data ?? []).filter(
            (item) => item.sdOrgStatus === 'ACTIVE' && !item.sdDepartmentType.startsWith('MED_PHARMACY')
          )}
          medicationTypes={medicationTypes.data ?? []}
          sites={pharmacySites}
          busy={save.isPending}
          onClose={() => setEditor(undefined)}
          onSave={(input) => save.mutate({ value: editor ?? undefined, input })}
        />
      )}
    </div>
  )
}

function RouteEditor({
  value,
  organizationId,
  departments,
  medicationTypes,
  sites,
  busy,
  onClose,
  onSave,
}: {
  value?: DispenseRoute
  organizationId: string
  departments: Awaited<ReturnType<RhnApi['organization']['departments']>>
  medicationTypes: Awaited<ReturnType<RhnApi['dictionaries']['resolve']>>
  sites: Awaited<ReturnType<RhnApi['pharmacy']['sites']>>
  busy: boolean
  onClose: () => void
  onSave: (input: DispenseRouteInput) => void
}) {
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [careSetting, setCareSetting] = useState<DispenseCareSetting>(value?.careSetting ?? 'OUTPATIENT')
  const [sourceDepartmentId, setSourceDepartmentId] = useState(value?.sourceDepartmentId ?? '')
  const [medicationType, setMedicationType] = useState(value?.medicationType ?? '')
  const [targetStockSiteId, setTargetStockSiteId] = useState(value?.targetStockSiteId ?? sites[0]?.id ?? '')
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [active, setActive] = useState(value?.active ?? true)
  const [description, setDescription] = useState(value?.description ?? '')

  const eligibleSites = useMemo(
    () =>
      sites.filter(
        (site) =>
          site.serviceScope === 'MIXED' ||
          site.serviceScope === careSetting ||
          (careSetting === 'HOME_CARE' && site.serviceScope === 'COMMUNITY')
      ),
    [sites, careSetting]
  )

  const priorityPreview = useMemo(
    () =>
      getRoutePriorityMeta({
        sourceDepartmentId: sourceDepartmentId || undefined,
        medicationType: medicationType || undefined,
      }),
    [sourceDepartmentId, medicationType]
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({
      organizationId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      careSetting,
      sourceDepartmentId: sourceDepartmentId || undefined,
      medicationType: medicationType || undefined,
      targetStockSiteId,
      active,
      validFrom,
      validTo: validTo || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <Dialog
      title={value ? '编辑发药路由' : '新增发药路由'}
      eyebrow="发药药房设置"
      size="wide"
      description="发药路由决定各场景下药品医嘱流向的发药药房；专项规则将优先于通用规则进行精准分流。"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="dispense-route-editor" busy={busy}>
            保存规则
          </Button>
        </>
      }
    >
      <form id="dispense-route-editor" className="dispense-route-editor" onSubmit={submit}>
        <div className="ui-form-row">
          <FormField label="规则名称" required>
            <input
              autoFocus
              className="ui-field__control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              placeholder="如：门诊中药饮片发药路由"
              required
            />
          </FormField>
          <FormField label="规则编码" required>
            <input
              className="ui-field__control"
              value={code}
              disabled={Boolean(value)}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              maxLength={64}
              placeholder="如 OUTPATIENT_HERBAL"
              required
            />
          </FormField>
        </div>

        <div className="ui-form-row">
          <FormField label="诊疗场景" required>
            <Select
              value={careSetting}
              onChange={(next) => {
                const selected = next as DispenseCareSetting
                setCareSetting(selected)
                const current = sites.find((site) => site.id === targetStockSiteId)
                if (
                  current &&
                  current.serviceScope !== 'MIXED' &&
                  current.serviceScope !== selected &&
                  !(selected === 'HOME_CARE' && current.serviceScope === 'COMMUNITY')
                ) {
                  setTargetStockSiteId(
                    sites.find(
                      (site) =>
                        site.serviceScope === selected ||
                        site.serviceScope === 'MIXED' ||
                        (selected === 'HOME_CARE' && site.serviceScope === 'COMMUNITY')
                    )?.id ?? ''
                  )
                }
              }}
              clearable={false}
              options={Object.entries(careSettingLabels).map(([value, label]) => ({ value, label }))}
            />
          </FormField>
          <FormField label="开方科室" hint="不选表示当前场景全部开方科室">
            <Select
              value={sourceDepartmentId}
              onChange={setSourceDepartmentId}
              placeholder="全部开方科室"
              showValue
              options={departments.map((item) => ({ value: item.id, label: item.name, code: item.code }))}
            />
          </FormField>
        </div>

        <div className="ui-form-row">
          <FormField label="药品类型" hint="专项类型会优先于默认规则">
            <Select
              value={medicationType}
              onChange={setMedicationType}
              placeholder="全部药品类型"
              showValue
              options={medicationTypes.map((item) => ({ value: item.code, label: item.name, code: item.code }))}
            />
          </FormField>
          <FormField label="流向发药药房" required>
            <Select
              value={targetStockSiteId}
              onChange={setTargetStockSiteId}
              clearable={false}
              showValue
              options={eligibleSites.map((site) => ({ value: site.id, label: site.name, code: site.code }))}
            />
          </FormField>
        </div>

        {/* 动态优先级实时反馈卡片 */}
        <div className="dispense-route-editor__priority-preview">
          <Icon name={priorityPreview.icon} className="ui-icon-inline" />
          <span>
            预计匹配层级：
            <StatusBadge tone={priorityPreview.tone} className="dispense-priority-preview-badge">
              P{priorityPreview.priority} · {priorityPreview.label}
            </StatusBadge>{' '}
            — {priorityPreview.hint}
          </span>
        </div>

        <div className="ui-form-row">
          <FormField label="生效日期" required>
            <input
              type="date"
              className="ui-field__control"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              required
            />
          </FormField>
          <FormField label="结束日期" hint="留空代表长期有效">
            <input
              type="date"
              className="ui-field__control"
              min={validFrom}
              value={validTo}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </FormField>
        </div>

        <FormField label="规则说明">
          <textarea
            className="ui-field__control"
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="说明该路由规则适用的业务场景及分流原因"
          />
        </FormField>

        <label className="dispense-route-editor__status">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          <span>
            <strong>启用本条路由规则</strong>
            <small>停用后新开立或新进入发药环节的医嘱将不再匹配本规则</small>
          </span>
        </label>
      </form>
    </Dialog>
  )
}
