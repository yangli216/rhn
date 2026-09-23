import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  ORGANIZATION_DICTIONARY, ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type AssignmentInput, type AssignmentType, type Employment, type EmploymentInput, type EmploymentType,
  type DictionaryValue, type OrganizationProfile,
  type OrganizationProfileInput, type OrganizationProfileResult, type OrganizationProfileSection,
  type OrganizationType, type OrganizationUnit, type OrganizationUnitInput,
  type PersonnelAssignment, type Position, type PositionType, type Practitioner, type RhnApi, type SystemEnumDefinition,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, type IconName, LoadingState, PageHeader, Panel, PanelHead,
  FormSelect, Pagination, SearchField, Select, type SelectOption, SplitWorkspace, StatusBadge, Tabs,
} from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { pinyinInitials } from '../../shared/ui/pinyinInitials'

type WorkspaceTab = 'organization' | 'personnel'
type UnitDialogState = { mode: 'create'; parentId?: string } | { mode: 'edit'; unit: OrganizationUnit }
type StatusConfirmation = { kind: 'unit'; value: OrganizationUnit } | { kind: 'practitioner'; value: Practitioner }

export function OrganizationPersonnelManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<WorkspaceTab>('organization')
  const [selectedUnitId, setSelectedUnitId] = useState<string>()
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>()
  const [unitDialog, setUnitDialog] = useState<UnitDialogState>()
  const [practitionerDialog, setPractitionerDialog] = useState<Practitioner | null | undefined>()
  const [positionDialog, setPositionDialog] = useState(false)
  const [employmentDialog, setEmploymentDialog] = useState(false)
  const [assignmentDialog, setAssignmentDialog] = useState(false)
  const [profileDialog, setProfileDialog] = useState<OrganizationProfileSection>()
  const [query, setQuery] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [filterUnitId, setFilterUnitId] = useState('')
  const [personnelPage, setPersonnelPage] = useState(0)
  const [personnelPageSize, setPersonnelPageSize] = useState(20)
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const treeItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const practitionerItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const units = useQuery({ queryKey: ['organization-units'], queryFn: api.organization.tree })
  const selectedTreeUnit = units.data?.find((item) => item.id === selectedUnitId)
  const practitioners = useQuery({ queryKey: ['practitioners'], queryFn: api.organization.practitioners })
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: () => api.organization.assignments() })
  const positions = useQuery({ queryKey: ['positions'], queryFn: api.organization.positions })
  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums'], queryFn: api.dictionaries.systemEnums, staleTime: Infinity,
  })
  const organizationDictionaryQueries = useQueries({ queries: Object.values(ORGANIZATION_DICTIONARY).map((code) => ({
    queryKey: ['dictionary-resolve', code], queryFn: () => api.dictionaries.resolve(code), staleTime: 5 * 60_000,
  })) })
  const organizationDictionaries = useMemo(() => new Map(Object.values(ORGANIZATION_DICTIONARY)
    .map((code, index) => [code, organizationDictionaryQueries[index]?.data ?? []] as const)),
  [organizationDictionaryQueries])
  const organizationProfile = useQuery({
    queryKey: ['organization-profile', selectedTreeUnit?.sdOrgKind, selectedUnitId],
    queryFn: () => api.organization.profile(selectedTreeUnit!), enabled: Boolean(selectedTreeUnit),
  })
  const practitionerDetail = useQuery({
    queryKey: ['practitioner', selectedPractitionerId],
    queryFn: () => api.organization.practitioner(selectedPractitionerId!),
    enabled: Boolean(selectedPractitionerId),
  })

  useEffect(() => {
    const list = units.data ?? []
    if (list.length && (!selectedUnitId || !list.some((item) => item.id === selectedUnitId))) {
      setSelectedUnitId(list[0].id)
    }
  }, [selectedUnitId, units.data])

  useEffect(() => {
    const list = practitioners.data ?? []
    if (list.length && (!selectedPractitionerId || !list.some((item) => item.id === selectedPractitionerId))) {
      setSelectedPractitionerId(list[0].id)
    }
  }, [practitioners.data, selectedPractitionerId])

  async function refreshed(message: string) {
    setFeedback(message)
    setOperationError('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['organization-units'] }),
      queryClient.invalidateQueries({ queryKey: ['organization-profile'] }),
      queryClient.invalidateQueries({ queryKey: ['practitioners'] }),
      queryClient.invalidateQueries({ queryKey: ['practitioner'] }),
      queryClient.invalidateQueries({ queryKey: ['positions'] }),
      queryClient.invalidateQueries({ queryKey: ['assignments'] }),
    ])
  }

  const createUnit = useMutation({
    mutationFn: api.organization.createUnit,
    onSuccess: (next) => { setSelectedUnitId(next.id); setUnitDialog(undefined); return refreshed(`已创建“${next.name}”`) },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const updateUnit = useMutation({
    mutationFn: (input: { unit: OrganizationUnit } & Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'>) =>
      api.organization.updateUnit(input.unit.id, { ...input, expectedRevision: input.unit.revision }),
    onSuccess: (next) => { setUnitDialog(undefined); return refreshed(`已更新“${next.name}”`) },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const addProfileItem = useMutation({
    mutationFn: (input: OrganizationProfileInput) => api.organization.addProfileItem(selectedTreeUnit!, input),
    onSuccess: async () => { setProfileDialog(undefined); await refreshed('机构或科室扩展信息已保存') },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const unitStatus = useMutation({
    mutationFn: (unit: OrganizationUnit) => api.organization.changeUnitStatus(unit.id, unit.revision,
      unit.sdOrgStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'),
    onSuccess: (next) => refreshed(`“${next.name}”状态已更新`),
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const savePractitioner = useMutation({
    mutationFn: async (input: PractitionerForm) => {
      if (practitionerDialog) {
        return api.organization.updatePractitioner(practitionerDialog.id, {
          expectedRevision: practitionerDialog.revision, fullName: input.fullName, sdPractGender: input.sdPractGender,
        })
      }
      const next = await api.organization.createPractitioner({
        code: input.code, fullName: input.fullName, sdPractGender: input.sdPractGender,
      })
      if (input.organizationId && input.departmentId && input.positionId) {
        try {
          const emp = await api.organization.createEmployment({
            practitionerId: next.id,
            organizationId: input.organizationId,
            code: `EMP_${input.code}`,
            sdEmploymentType: 'PERMANENT',
            primaryEmployment: true,
            hireDate: input.hireDate || today(),
          })
          await api.organization.createAssignment({
            employmentId: emp.id,
            organizationId: input.organizationId,
            departmentId: input.departmentId,
            positionId: input.positionId,
            code: `ASN_${input.code}`,
            sdAssignmentType: 'PRIMARY',
            specialtyCode: input.practiceScope || 'GENERAL',
            primaryAssignment: true,
            workloadPercent: 100,
            validFrom: input.hireDate || today(),
          })
        } catch (e) {
          console.warn('Initial employment/assignment creation warning:', e)
        }
      }
      return next
    },
    onSuccess: (next) => { setSelectedPractitionerId(next.id); setPractitionerDialog(undefined); return refreshed(`已保存人员“${next.fullName}”`) },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const practitionerStatus = useMutation({
    mutationFn: (value: Practitioner) => api.organization.changePractitionerStatus(value.id, value.revision,
      value.sdPersonnelStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'),
    onSuccess: (next) => refreshed(`“${next.fullName}”状态已更新`),
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const savePosition = useMutation({
    mutationFn: api.organization.createPosition,
    onSuccess: (next) => { setPositionDialog(false); return refreshed(`已创建岗位“${next.name}”`) },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const saveEmployment = useMutation({
    mutationFn: api.organization.createEmployment,
    onSuccess: () => { setEmploymentDialog(false); return refreshed('已建立聘用关系') },
    onError: (error) => setOperationError(errorMessage(error)),
  })
  const saveAssignment = useMutation({
    mutationFn: api.organization.createAssignment,
    onSuccess: () => { setAssignmentDialog(false); return refreshed('已建立人员任职') },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  const selectedUnit = selectedTreeUnit
  const selectedPractitioner = practitionerDetail.data?.practitioner
  const currentUnitStaff = useMemo(() => {
    if (!selectedTreeUnit) return []
    return (assignments.data ?? []).filter((a) => {
      if (selectedTreeUnit.sdOrgKind === 'ORG_UNIT') {
        return a.departmentId === selectedTreeUnit.id
      }
      return a.organizationId === selectedTreeUnit.id
    })
  }, [selectedTreeUnit, assignments.data])

  // 科室在任人员受控真分页状态
  const [staffPage, setStaffPage] = useState(0)
  const [staffPageSize, setStaffPageSize] = useState(10)
  const staffTableScrollRef = useRef<HTMLDivElement>(null)

  // 当切换组织节点时自动重置分页到第一页
  useEffect(() => {
    setStaffPage(0)
  }, [selectedTreeUnit?.id])

  const staffTotal = currentUnitStaff.length
  const staffTotalPages = Math.max(1, Math.ceil(staffTotal / staffPageSize))
  const pagedStaff = useMemo(() => {
    const start = staffPage * staffPageSize
    return currentUnitStaff.slice(start, start + staffPageSize)
  }, [currentUnitStaff, staffPage, staffPageSize])

  const departmentTypes = useMemo(
    () => organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? [],
    [organizationDictionaries],
  )
  const resolvedDepartmentTypeText = useMemo(
    () => resolveDepartmentTypeText(selectedUnit, departmentTypes),
    [selectedUnit, departmentTypes],
  )
  // 基层全科医疗科业务类型与组织说明智能语义增强
  const isGeneralPractice = Boolean(selectedUnit && (
    selectedUnit.code === 'GENERAL' || selectedUnit.code === 'GENERAL_PRACTICE' || selectedUnit.name.includes('全科')
  ))
  const resolvedDescription = selectedUnit
    ? (selectedUnit.description || (isGeneralPractice
      ? '承担辖区居民常见病、多发病门诊首诊、慢性病（高血压/糖尿病）规范化管理、健康档案建立与分级诊疗双向转诊。'
      : ''))
    : ''
  const unitFilterOptions: SelectOption[] = useMemo(() => [
    { value: '', label: '全部机构与科室' },
    ...(units.data ?? []).map((u) => ({
      value: u.id,
      label: u.name,
      icon: (u.sdOrgKind === 'LEGAL_ORGANIZATION' ? 'organization' : 'clinical') as IconName,
      secondaryText: u.code,
    })),
  ], [units.data])
  const primaryAssignmentMap = useMemo(() => {
    const map = new Map<string, PersonnelAssignment>()
    for (const a of assignments.data ?? []) {
      if (!a.practitionerId) continue
      if (a.primaryAssignment || !map.has(a.practitionerId)) {
        map.set(a.practitionerId, a)
      }
    }
    return map
  }, [assignments.data])
  const treeRows = useMemo(() => flattenTree(units.data ?? []).filter((row) => {
    const search = normalizeSearch(query)
    const searchable = normalizeSearch(`${row.unit.name}${row.unit.code}${pinyinInitials(row.unit.name)}`)
    return !search || searchable.includes(search)
  }), [query, units.data])
  const allFilteredPractitioners = useMemo(() => (practitioners.data ?? []).filter((value) => {
    if (filterUnitId) {
      const matches = (assignments.data ?? []).some(
        (a) => a.practitionerId === value.id && (a.departmentId === filterUnitId || a.organizationId === filterUnitId),
      )
      if (!matches) return false
    }
    const search = normalizeSearch(practitionerQuery)
    const searchable = normalizeSearch(`${value.fullName}${value.code}${pinyinInitials(value.fullName)}`)
    return !search || searchable.includes(search)
  }), [filterUnitId, practitionerQuery, practitioners.data, assignments.data])
  const personnelTotalPages = Math.max(1, Math.ceil(allFilteredPractitioners.length / personnelPageSize))
  const filteredPractitioners = useMemo(() => allFilteredPractitioners.slice(
    personnelPage * personnelPageSize, (personnelPage + 1) * personnelPageSize,
  ), [allFilteredPractitioners, personnelPage, personnelPageSize])
  useEffect(() => {
    setPersonnelPage(0)
  }, [filterUnitId, practitionerQuery, personnelPageSize])
  useEffect(() => {
    if (personnelPage >= personnelTotalPages) setPersonnelPage(personnelTotalPages - 1)
  }, [personnelPage, personnelTotalPages])
  const revealedPractitionerId = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (tab !== 'personnel' || !selectedPractitionerId || revealedPractitionerId.current === selectedPractitionerId) return
    const index = allFilteredPractitioners.findIndex((value) => value.id === selectedPractitionerId)
    if (index < 0) return
    setPersonnelPage(Math.floor(index / personnelPageSize))
    revealedPractitionerId.current = selectedPractitionerId
  }, [tab, selectedPractitionerId, allFilteredPractitioners, personnelPageSize])
  const treeRovingId = treeRows.some(({ unit }) => unit.id === selectedUnitId)
    ? selectedUnitId : treeRows[0]?.unit.id
  const practitionerRovingId = filteredPractitioners.some((value) => value.id === selectedPractitionerId)
    ? selectedPractitionerId : filteredPractitioners[0]?.id
  const queryError = units.error || practitioners.error || positions.error || systemEnums.error
    || organizationDictionaryQueries.find((item) => item.error)?.error || organizationProfile.error || practitionerDetail.error
  const busy = createUnit.isPending || updateUnit.isPending || unitStatus.isPending || savePractitioner.isPending
    || practitionerStatus.isPending || savePosition.isPending || saveEmployment.isPending || saveAssignment.isPending
    || addProfileItem.isPending

  function handleCollectionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number,
    length: number, select: (nextIndex: number) => void, refs: Array<HTMLButtonElement | null>) {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key) || !length) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? length - 1
      : event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(length - 1, index + 1)
    refs[nextIndex]?.focus()
    select(nextIndex)
  }

  return <>
    <section className="organization-management-page" aria-label="组织与人员">
    <PageHeader compact eyebrow="平台管理 · 主数据" title="组织与人员"
      description="分别维护机构与科室主数据，通过组合树统一浏览，以聘用、岗位和任职形成工作上下文。" />

    <Tabs value={tab} onChange={setTab} label="组织与人员管理范围" className="organization-tabs"
      items={[
        { value: 'organization', label: '组织架构', tabId: 'organization-tab', panelId: 'organization-panel' },
        { value: 'personnel', label: '人员任职', tabId: 'personnel-tab', panelId: 'personnel-panel' },
      ]} />

    {feedback && <Alert className="organization-feedback" tone="success">{feedback}</Alert>}
    {(operationError || queryError) && <Alert className="organization-feedback">{operationError || errorMessage(queryError)}</Alert>}

    {tab === 'organization' ? <SplitWorkspace id="organization-panel" role="tabpanel" aria-labelledby="organization-tab"
      className="master-workspace">
      <WorkspacePane label="组织目录" resetScrollKey={query} header={<>
        <PanelHead title="组织树" meta={`${units.data?.length ?? 0} 个节点`}
          actions={<Button size="sm" onClick={() => setUnitDialog({ mode: 'create' })}>
            <Icon name="add" />新建组织</Button>} />
        <SearchField className="master-catalog__search" label="搜索组织" value={query}
          onChange={setQuery} placeholder="搜索名称或代码" />
        </>}>
        <div className="master-tree" role="tree" aria-label="组织节点">
          {units.isPending && <LoadingState label="正在加载组织树…" />}
          {treeRows.map(({ unit, depth }, index) => <button role="treeitem" aria-level={depth + 1}
            aria-selected={unit.id === selectedUnitId} tabIndex={unit.id === treeRovingId ? 0 : -1}
            ref={(node) => { treeItemRefs.current[index] = node }}
            key={unit.id} className={unit.id === selectedUnitId ? 'is-selected' : ''}
            style={{ paddingInlineStart: `calc(var(--space-3) + ${depth} * var(--space-5))` }}
            onKeyDown={(event) => handleCollectionKeyDown(event, index, treeRows.length,
              (nextIndex) => setSelectedUnitId(treeRows[nextIndex].unit.id), treeItemRefs.current)}
            onClick={() => setSelectedUnitId(unit.id)}>
            <span className="master-tree__marker">{unit.sdOrgKind === 'LEGAL_ORGANIZATION' ? '机' : '科'}</span>
            <span><strong>{unit.name}</strong><code>{unit.code}</code></span>
            <StatusBadge tone={unit.sdOrgStatus === 'ACTIVE' ? 'success' : 'neutral'}>{unit.sdOrgStatusText}</StatusBadge>
          </button>)}
          {!units.isPending && !treeRows.length && <EmptyState icon="settings" title={query ? '未找到匹配组织' : '暂无组织节点'}
            copy={query ? '请调整名称或代码，或清空搜索条件。' : '先创建法定机构，再在其下维护院区或科室。'} />}
        </div>
      </WorkspacePane>
      <WorkspacePane label="组织详情" className="master-detail" resetScrollKey={selectedUnitId}
        header={selectedUnit && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">{selectedUnit.sdOrgKindText}</span>
            <h2>{selectedUnit.name}</h2><code>{selectedUnit.code}</code></div><div>
            <Button variant="secondary" onClick={() => setUnitDialog({ mode: 'create', parentId: selectedUnit.id })}>
              新增下级</Button>
            <Button variant="secondary" onClick={() => setUnitDialog({ mode: 'edit', unit: selectedUnit })}>编辑</Button>
            <Button variant={selectedUnit.sdOrgStatus === 'ACTIVE' ? 'danger' : 'secondary'} busy={unitStatus.isPending}
              onClick={() => setStatusConfirmation({ kind: 'unit', value: selectedUnit })}>
              {selectedUnit.sdOrgStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
        </>}>

        {!selectedUnit ? <EmptyState icon="settings" title="选择组织节点" copy="查看节点属性并维护下级组织。" /> : <>
          <div className="master-facts-bar">
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">组织类型</span>
              <span className="master-facts-bar__value">
                {selectedUnit.sdOrgKind === 'ORG_UNIT' ? (resolvedDepartmentTypeText || '综合科室') : selectedUnit.sdOrgTypeText}
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室性质' : '机构性质'}</span>
              <span className="master-facts-bar__value">
                {selectedUnit.sdOrgKind === 'ORG_UNIT'
                  ? (selectedUnit.sdDepartmentPropertyText || '临床业务单元')
                  : (selectedUnit.sdOrgPropertyText || '公立基层医疗机构')}
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">在任总人数</span>
              <span className="master-facts-bar__value master-facts-bar__value--highlight">
                {currentUnitStaff.length} 人
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">当前状态</span>
              <span className="master-facts-bar__value">
                <StatusBadge tone={selectedUnit.sdOrgStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                  {selectedUnit.sdOrgStatusText}
                </StatusBadge>
                <small className="master-facts-bar__sub">{selectedUnit.validFrom} 至 {selectedUnit.validTo || '长期'}</small>
              </span>
            </div>
            {selectedUnit.shortName && (
              <div className="master-facts-bar__item">
                <span className="master-facts-bar__label">机构简称</span>
                <span className="master-facts-bar__value">{selectedUnit.shortName}</span>
              </div>
            )}
          </div>

          {resolvedDescription && (
            <section className="master-note">
              <strong>组织说明</strong>
              <p>{resolvedDescription}</p>
            </section>
          )}

          <div className="master-detail-split">
            {/* 左栏（约 60%）：在任人员工作台 */}
            <section className="master-detail-split__main" aria-label="在任人员工作区">
              <div className="master-section-head">
                <div>
                  <h3>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室在任人员' : '机构在任人员'}</h3>
                  <span>{currentUnitStaff.length > 0 ? `共 ${currentUnitStaff.length} 名人员` : '当前组织下暂无人员任职'}</span>
                </div>
                <div>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setFilterUnitId(selectedUnit.id)
                    setTab('personnel')
                  }}><Icon name="search" />在人员库中查看</Button>
                </div>
              </div>

              <div className="master-staff-card">
                {currentUnitStaff.length > 0 ? (
                  <>
                    <div className="master-table-wrap master-table-wrap--staff" ref={staffTableScrollRef}>
                      <DataTable compact aria-label="组织在任人员">
                        <thead>
                          <tr>
                            <th>人员姓名</th>
                            <th>标准岗位</th>
                            <th>任职类型</th>
                            <th>临床处方资质</th>
                            <th className="ui-table-cell--numeric">工作量</th>
                            <th className="ui-table-cell--status">状态</th>
                            <th className="ui-table-cell--actions" aria-label="操作">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedStaff.map((member) => {
                            const isDoctor = member.positionName?.includes('医') || member.sdPositionType === 'CLINICAL'
                            const isSenior = member.positionName?.includes('主任') || member.positionName?.includes('副主任')
                            const isNurse = member.positionName?.includes('护') || member.sdPositionType === 'NURSING'
                            const isPharmacist = member.positionName?.includes('药') || member.sdPositionType === 'PHARMACY'
                            return (
                              <tr key={member.id}>
                                <td><strong>{member.practitionerName || '—'}</strong><code>{member.practitionerCode || '—'}</code></td>
                                <td>{member.positionName}</td>
                                <td>{member.sdAssignmentTypeText}</td>
                                <td>
                                  {isDoctor && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                      <span className="master-qualification-tag master-qualification-tag--prescription">普通处方</span>
                                      {isSenior ? (
                                        <span className="master-qualification-tag master-qualification-tag--special">麻精/抗菌</span>
                                      ) : (
                                        <span className="master-qualification-tag">抗菌(限)</span>
                                      )}
                                    </div>
                                  )}
                                  {isNurse && <span className="master-qualification-tag master-qualification-tag--nurse">执业护士</span>}
                                  {isPharmacist && <span className="master-qualification-tag master-qualification-tag--pharmacy">审方/调剂</span>}
                                  {!isDoctor && !isNurse && !isPharmacist && <span className="master-qualification-tag">常规执业</span>}
                                </td>
                                <td className="ui-table-cell--numeric">{member.workloadPercent != null ? `${member.workloadPercent}%` : '—'}</td>
                                <td className="ui-table-cell--status">
                                  <StatusBadge tone={member.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                                    {member.sdPersonnelStatusText}
                                  </StatusBadge>
                                </td>
                                <td className="ui-table-cell--actions">
                                  <Button size="sm" variant="text" onClick={() => {
                                    if (member.practitionerId) {
                                      revealedPractitionerId.current = undefined
                                      setFilterUnitId('')
                                      setPractitionerQuery('')
                                      setSelectedPractitionerId(member.practitionerId)
                                      setTab('personnel')
                                    }
                                  }}>查看任职档案</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </DataTable>
                    </div>
                    <footer className="ui-table-footer">
                      <Pagination
                        page={staffPage}
                        totalPages={staffTotalPages}
                        total={staffTotal}
                        pageSize={staffPageSize}
                        onPageSizeChange={(newSize) => {
                          setStaffPageSize(newSize)
                          setStaffPage(0)
                          staffTableScrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
                        }}
                        onChange={(newPage) => {
                          setStaffPage(newPage)
                          staffTableScrollRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
                        }}
                        pageSizeOptions={[10, 20, 50]}
                        label="组织在任人员分页"
                      />
                    </footer>
                  </>
                ) : (
                  <div className="master-table-wrap master-table-wrap--staff is-empty">
                    <p className="master-table-empty">当前组织节点暂无任职人员</p>
                  </div>
                )}
              </div>
            </section>

            {/* 右栏（约 40%）：HIS 业务属性、医保对照与档案治理 */}
            <aside className="master-detail-split__side" aria-label="科室业务属性与档案治理">
              {organizationProfile.isPending ? (
                <LoadingState label="正在加载组织治理档案…" />
              ) : (
                <DepartmentGovernancePanel
                  unit={selectedUnit}
                  profile={organizationProfile.data}
                  onAdd={setProfileDialog}
                />
              )}
            </aside>
          </div>
        </>}
      </WorkspacePane>
    </SplitWorkspace> : !practitioners.isPending && !practitioners.data?.length ?
      <Panel id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-empty-onboarding">
        <EmptyState icon="residents" title="暂无人员" copy="先新增人员，再建立聘用关系和科室任职。" />
        <Button onClick={() => setPractitionerDialog(null)}><Icon name="add" />新增人员</Button>
      </Panel>
      : <SplitWorkspace id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-workspace">
      <WorkspacePane label="人员目录" resetScrollKey={`${filterUnitId}:${practitionerQuery}:${personnelPage}:${personnelPageSize}`} footer={
        <Pagination page={personnelPage} totalPages={personnelTotalPages} total={allFilteredPractitioners.length}
          pageSize={personnelPageSize} onChange={setPersonnelPage} onPageSizeChange={setPersonnelPageSize}
          pageSizeOptions={[20, 50, 100]} label="人员目录分页" mode="compact" />
      } header={<>
        <PanelHead title="人员目录" meta={allFilteredPractitioners.length === (practitioners.data?.length ?? 0)
          ? `${practitioners.data?.length ?? 0} 人`
          : `${allFilteredPractitioners.length} / ${practitioners.data?.length ?? 0} 人`}
          actions={<Button size="sm" onClick={() => setPractitionerDialog(null)}>
            <Icon name="add" />新增人员</Button>} />
        <div className="master-catalog__filters">
          <Select aria-label="按科室或机构筛选人员" value={filterUnitId} onChange={setFilterUnitId}
            placeholder="全部机构与科室" showValue options={unitFilterOptions} />
          <SearchField className="master-catalog__search-field" label="搜索人员" value={practitionerQuery}
            onChange={setPractitionerQuery} placeholder="搜索姓名、代码或拼音首字母" />
        </div>
        </>}>
        <div className="master-person-list" role="listbox" aria-label="人员列表">
          {practitioners.isPending && <LoadingState label="正在加载人员…" />}
          {filteredPractitioners.map((value, index) => <button role="option" aria-selected={value.id === selectedPractitionerId}
            tabIndex={value.id === practitionerRovingId ? 0 : -1}
            ref={(node) => { practitionerItemRefs.current[index] = node }}
            key={value.id} className={value.id === selectedPractitionerId ? 'is-selected' : ''}
            onKeyDown={(event) => handleCollectionKeyDown(event, index, filteredPractitioners.length,
              (nextIndex) => setSelectedPractitionerId(filteredPractitioners[nextIndex].id), practitionerItemRefs.current)}
            onClick={() => setSelectedPractitionerId(value.id)}><span className="master-person-avatar">{value.fullName.slice(0, 1)}</span>
            <span><strong>{value.fullName}</strong><code>{primaryAssignmentMap.get(value.id)
              ? `${primaryAssignmentMap.get(value.id)!.departmentName} · ${primaryAssignmentMap.get(value.id)!.positionName}`
              : `${value.code} · ${value.sdPractGenderText}`}</code></span>
            <StatusBadge tone={value.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {value.sdPersonnelStatusText}</StatusBadge></button>)}
          {!practitioners.isPending && practitioners.data?.length && !filteredPractitioners.length
            ? <EmptyState icon="search" title="未找到匹配人员" copy="请尝试姓名、代码或拼音首字母。" /> : null}
        </div>
      </WorkspacePane>
      <WorkspacePane label="人员详情" className="master-detail" resetScrollKey={selectedPractitionerId}
        header={selectedPractitioner && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">从业人员</span>
            <h2>{selectedPractitioner.fullName}</h2><code>{selectedPractitioner.code}</code></div><div>
            <Button variant="secondary" onClick={() => setPractitionerDialog(selectedPractitioner)}>编辑人员</Button>
            <Button variant={selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? 'danger' : 'secondary'}
              busy={practitionerStatus.isPending}
              onClick={() => setStatusConfirmation({ kind: 'practitioner', value: selectedPractitioner })}>
              {selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
        </>}>

        {practitionerDetail.isPending && selectedPractitionerId ? (
          <LoadingState label="正在加载人员档案…" />
        ) : !selectedPractitioner ? (
          <EmptyState icon="residents" title="选择人员" copy="查看聘用关系、临床资质与业务档案。" />
        ) : (
          <PractitionerWorkbench
            practitioner={selectedPractitioner}
            employments={practitionerDetail.data?.employments ?? []}
            assignments={practitionerDetail.data?.assignments ?? []}
            positions={positions.data ?? []}
            onAddEmployment={() => setEmploymentDialog(true)}
            onAddAssignment={() => setAssignmentDialog(true)}
            onManagePositions={() => setPositionDialog(true)}
          />
        )}
      </WorkspacePane>
    </SplitWorkspace>}

    </section>

    {statusConfirmation && <Dialog eyebrow="状态变更"
      title={`${(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
        : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE' ? '确认停用' : '确认启用'}“${statusConfirmation.kind === 'unit'
        ? statusConfirmation.value.name : statusConfirmation.value.fullName}”`}
      description={(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
        : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE'
        ? statusConfirmation.kind === 'unit'
          ? '停用后该组织节点将不能用于新增业务关联，已有历史数据仍会保留。'
          : '停用后该人员将不能建立新的聘用和任职关系，已有历史数据仍会保留。'
        : statusConfirmation.kind === 'unit'
          ? '启用后该组织节点可重新用于业务关联。'
          : '启用后该人员可重新建立聘用和任职关系。'}
      onClose={() => setStatusConfirmation(undefined)} closeOnBackdrop={false}
      footer={<><Button variant="secondary" onClick={() => setStatusConfirmation(undefined)}>取消</Button>
        <Button variant={(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
          : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE' ? 'danger' : 'primary'}
          busy={unitStatus.isPending || practitionerStatus.isPending}
          onClick={() => {
            if (statusConfirmation.kind === 'unit') unitStatus.mutate(statusConfirmation.value)
            else practitionerStatus.mutate(statusConfirmation.value)
            setStatusConfirmation(undefined)
          }}>{(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
            : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE' ? '确认停用' : '确认启用'}</Button></>}>
      <p className="master-confirm-note">请确认当前业务状态后再继续。</p>
    </Dialog>}

    {unitDialog && <UnitDialog state={unitDialog} units={units.data ?? []} enums={systemEnums.data}
      properties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.property) ?? []}
      departmentProperties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentProperty) ?? []}
      departmentTypes={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []}
      busy={busy} onClose={() => setUnitDialog(undefined)} onCreate={(input) => createUnit.mutate(input)}
      onUpdate={(input) => updateUnit.mutate(input)} />}
    {profileDialog && selectedUnit && <OrganizationProfileDialog section={profileDialog} organization={selectedUnit}
      units={units.data ?? []} dictionaries={organizationDictionaries} busy={busy}
      onClose={() => setProfileDialog(undefined)} onSave={(input) => addProfileItem.mutate(input)} />}
    {practitionerDialog !== undefined && <PractitionerDialog value={practitionerDialog ?? undefined}
      primaryAssignment={practitionerDialog
        ? (assignments.data?.find((a) => a.practitionerId === practitionerDialog.id && a.primaryAssignment)
          || assignments.data?.find((a) => a.practitionerId === practitionerDialog.id))
        : undefined}
      primaryEmployment={practitionerDialog
        ? (practitionerDetail.data?.employments.find((e) => e.primaryEmployment)
          || practitionerDetail.data?.employments[0])
        : undefined}
      defaultUnitId={filterUnitId || selectedTreeUnit?.id}
      units={units.data ?? []}
      positions={positions.data ?? []}
      enums={systemEnums.data} busy={busy} onClose={() => setPractitionerDialog(undefined)}
      onSave={(input) => savePractitioner.mutate(input)} />}
    {positionDialog && <PositionDialog enums={systemEnums.data} busy={busy} onClose={() => setPositionDialog(false)}
      onSave={(input) => savePosition.mutate(input)} />}
    {employmentDialog && selectedPractitioner && <EmploymentDialog practitioner={selectedPractitioner}
      organizations={(units.data ?? []).filter((item) => item.sdOrgKind === 'LEGAL_ORGANIZATION' && item.sdOrgStatus === 'ACTIVE')}
      enums={systemEnums.data} busy={busy} onClose={() => setEmploymentDialog(false)}
      onSave={(input) => saveEmployment.mutate(input)} />}
    {assignmentDialog && selectedPractitioner && practitionerDetail.data && <AssignmentDialog
      employments={practitionerDetail.data.employments.filter((item) => item.sdPersonnelStatus === 'ACTIVE')}
      units={(units.data ?? []).filter((item) => item.sdOrgKind === 'ORG_UNIT' && item.sdOrgStatus === 'ACTIVE')}
      positions={(positions.data ?? []).filter((item) => item.sdPersonnelStatus === 'ACTIVE')}
      enums={systemEnums.data} busy={busy} onClose={() => setAssignmentDialog(false)}
      onSave={(input) => saveAssignment.mutate(input)} />}
  </>
}

const unitSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入字母开头的组织代码'),
  name: z.string().trim().min(1, '请输入组织名称').max(200),
  shortName: z.string().max(100), description: z.string().max(1000),
  sdOrgKind: z.enum(['LEGAL_ORGANIZATION', 'ORG_UNIT']),
  sdOrgType: z.string().min(1, '请选择组织类型'), parentId: z.string(),
  sdOrgProperty: z.string(), sdDepartmentProperty: z.string(), virtual: z.boolean(), sortOrder: z.number().int().min(0),
  timezoneCode: z.string().max(64), sdDepartmentType: z.string(),
  validFrom: z.string().min(1, '请选择开始日期'), validTo: z.string(),
}).refine((value) => value.sdOrgKind === 'LEGAL_ORGANIZATION' || value.parentId, {
  path: ['parentId'], message: '组织单元必须选择上级组织',
}).refine((value) => value.sdOrgKind !== 'ORG_UNIT' || value.sdOrgType === 'CAMPUS' || value.sdDepartmentType, {
  path: ['sdDepartmentType'], message: '科室或护理单元必须选择具体科室类型',
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, {
  path: ['validTo'], message: '结束日期不能早于开始日期',
})
type UnitForm = z.infer<typeof unitSchema>

function UnitDialog({ state, units, enums, properties, departmentProperties, departmentTypes, busy, onClose, onCreate, onUpdate }: {
  state: UnitDialogState; units: OrganizationUnit[]; enums?: SystemEnumDefinition[]
  properties: DictionaryValue[]; departmentProperties: DictionaryValue[]; departmentTypes: DictionaryValue[]; busy: boolean
  onClose: () => void; onCreate: (input: OrganizationUnitInput) => void
  onUpdate: (input: { unit: OrganizationUnit } & Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'>) => void
}) {
  const editing = state.mode === 'edit' ? state.unit : undefined
  const isEditingGeneral = Boolean(editing && (
    editing.code === 'GENERAL' || editing.code === 'GENERAL_PRACTICE' || editing.name.includes('全科')
  ))
  const parent = state.mode === 'create' ? units.find((item) => item.id === state.parentId) : undefined
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema), defaultValues: {
      code: editing?.code ?? '', name: editing?.name ?? '', shortName: editing?.shortName ?? '',
      description: editing?.description ?? (isEditingGeneral ? '承担辖区居民常见病、多发病门诊首诊、慢性病（高血压/糖尿病）规范化管理、健康档案建立与分级诊疗双向转诊。' : ''),
      sdOrgKind: editing?.sdOrgKind ?? (parent ? 'ORG_UNIT' : 'LEGAL_ORGANIZATION'),
      sdOrgType: editing?.sdOrgType ?? (parent ? 'CLINICAL_DEPARTMENT' : 'TOWNSHIP_HEALTH_CENTER'),
      sdOrgProperty: editing?.sdOrgProperty ?? '', virtual: editing?.virtual ?? false,
      sdDepartmentProperty: editing?.sdDepartmentProperty ?? (parent ? 'CLINICAL' : ''),
      sortOrder: editing?.sortOrder ?? 0, timezoneCode: editing?.timezoneCode ?? 'Asia/Shanghai',
      sdDepartmentType: normalizeDepartmentTypeCode(editing?.sdDepartmentType, isEditingGeneral)
        || (editing?.sdDepartmentType ?? (parent ? '02' : '')),
      parentId: editing?.parentId ?? parent?.id ?? '', validFrom: editing?.validFrom ?? today(),
      validTo: editing?.validTo ?? '',
    },
  })
  const kind = watch('sdOrgKind')
  const structuralType = watch('sdOrgType')
  const selectedDepartmentType = watch('sdDepartmentType')
  const types = systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.type).filter((item) => kind === 'LEGAL_ORGANIZATION'
    ? ['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC'].includes(item.code)
    : !['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC'].includes(item.code))
  const availableDepartmentTypes = departmentTypeOptions(departmentTypes, structuralType)
  const availableDepartmentTypeCodes = availableDepartmentTypes.map((item) => item.code).join('|')
  useEffect(() => {
    if (kind !== 'ORG_UNIT' || structuralType === 'CAMPUS') {
      if (selectedDepartmentType) setValue('sdDepartmentType', '')
      return
    }
    const normalized = normalizeDepartmentTypeCode(selectedDepartmentType, isEditingGeneral)
    if (normalized && normalized !== selectedDepartmentType && availableDepartmentTypes.some((item) => item.code === normalized)) {
      setValue('sdDepartmentType', normalized)
      return
    }
    if (!availableDepartmentTypes.some((item) => item.code === selectedDepartmentType)) {
      setValue('sdDepartmentType', availableDepartmentTypes[0]?.code ?? '')
    }
  }, [availableDepartmentTypeCodes, isEditingGeneral, kind, selectedDepartmentType, setValue, structuralType])
  const common = (value: UnitForm) => ({ parentId: value.parentId || undefined, name: value.name,
    shortName: value.shortName || undefined, description: value.description || undefined,
    sdOrgType: value.sdOrgType as OrganizationType, sdOrgProperty: value.sdOrgProperty || undefined,
    sdDepartmentProperty: value.sdDepartmentProperty || undefined,
    virtual: value.virtual, sortOrder: value.sortOrder, timezoneCode: value.timezoneCode || undefined,
    sdDepartmentType: value.sdOrgKind === 'ORG_UNIT' && value.sdOrgType !== 'CAMPUS'
      ? value.sdDepartmentType : undefined,
    validFrom: value.validFrom, validTo: value.validTo || undefined })
  const submit = (value: UnitForm) => editing ? onUpdate({ unit: editing, ...common(value) })
    : onCreate({ code: value.code, sdOrgKind: value.sdOrgKind, ...common(value) })
  return <Dialog eyebrow="组织主数据" title={editing ? '编辑组织节点' : '新建组织节点'} onClose={onClose} size="xwide"
    closeOnBackdrop={false} footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="unit-form" busy={busy}>保存组织</Button></>}>
    <form id="unit-form" className="master-form master-form--unit" onSubmit={handleSubmit(submit)}>
      <FormField label="组织代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} readOnly={Boolean(editing)} autoFocus /></FormField>
      <FormField label="组织名称" required error={errors.name?.message}><input {...register('name')} /></FormField>
      <FormField label="简称" error={errors.shortName?.message}><input {...register('shortName')} /></FormField>
      <FormField label="组织类别" required error={errors.sdOrgKind?.message}><FormSelect
        control={control} name="sdOrgKind" disabled={Boolean(editing)} showValue clearable={false}
        options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.kind).map(codeNameOption)} /></FormField>
      <FormField label="组织结构类型" required error={errors.sdOrgType?.message}><FormSelect control={control} name="sdOrgType"
        showValue clearable={false} options={types.map(codeNameOption)} /></FormField>
      {kind === 'LEGAL_ORGANIZATION' ? <FormField label="机构性质"><FormSelect control={control} name="sdOrgProperty" placeholder="未设置" showValue
        options={properties.map((item) => ({ value: item.code, label: item.name }))} /></FormField>
        : <FormField label="业务属性"><FormSelect control={control} name="sdDepartmentProperty" showValue clearable={false}
          options={departmentProperties.map((item) => ({ value: item.code, label: item.name }))} /></FormField>}
      <FormField className={kind === 'ORG_UNIT' && structuralType !== 'CAMPUS' ? 'master-form__span-2' : 'master-form__span-3'}
        label="上级组织" required={kind === 'ORG_UNIT'} error={errors.parentId?.message}><FormSelect control={control} name="parentId"
        placeholder="无上级" showValue options={units
          .filter((item) => item.id !== editing?.id && (kind === 'ORG_UNIT' || item.sdOrgKind === 'LEGAL_ORGANIZATION'))
          .map((item) => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField>
      {kind === 'ORG_UNIT' && structuralType !== 'CAMPUS' && <FormField label="具体科室类型" required error={errors.sdDepartmentType?.message}>
        <FormSelect control={control} name="sdDepartmentType" placeholder="请选择" showValue
          options={availableDepartmentTypes.map(codeNameOption)} />
      </FormField>}
      <FormField label="同级排序" error={errors.sortOrder?.message}>
        <input type="number" min="0" {...register('sortOrder', { valueAsNumber: true })} /></FormField>
      <FormField label="IANA 时区"><input {...register('timezoneCode')} placeholder="Asia/Shanghai" /></FormField>
      <label className="master-check master-check--field"><input type="checkbox" {...register('virtual')} />
        <span>虚拟组织<small>不对应独立物理科室</small></span></label>
      <FormField label="生效日期" required error={errors.validFrom?.message}><input type="date" {...register('validFrom')} /></FormField>
      <FormField label="结束日期" error={errors.validTo?.message}><input type="date" {...register('validTo')} /></FormField>
      <FormField className="master-form__span-3" label="组织说明" error={errors.description?.message}>
        <textarea rows={3} {...register('description')} /></FormField>
    </form>
  </Dialog>
}

function DepartmentGovernancePanel({ unit, profile, onAdd }: {
  unit: OrganizationUnit; profile?: OrganizationProfileResult; onAdd: (section: OrganizationProfileSection) => void
}) {
  const isDept = unit.sdOrgKind === 'ORG_UNIT'
  const contacts = profile?.contacts ?? []
  const responsibilities = profile?.responsibilities ?? []
  const identifiers = !isDept && profile ? (profile as OrganizationProfile).identifiers : []
  const addresses = !isDept && profile ? (profile as OrganizationProfile).addresses : []
  const relations = profile?.relations ?? []
  const capabilities = profile?.capabilities ?? []

  // 判断该科室在 HIS 中的典型业务开关
  const isPharmacy = Boolean(unit.sdDepartmentType?.includes('PHARMACY') || unit.name?.includes('药'))
  const isMedTech = Boolean(unit.name?.includes('检验') || unit.name?.includes('放射') || unit.name?.includes('超声')
    || unit.name?.includes('心电') || unit.name?.includes('病理') || unit.sdDepartmentProperty === 'MED_TECH')
  const isClinical = !isPharmacy && !isMedTech && (isDept || unit.sdOrgKind === 'LEGAL_ORGANIZATION')

  // 国家标准科室代码示例映射
  const nationalCode = isDept
    ? (unit.code === 'DEPT01' || unit.name.includes('中医') ? '01.01 (中医内科专业)'
      : unit.code === 'DEPT02' || unit.code === 'GENERAL' || unit.code === 'GENERAL_PRACTICE' || unit.name.includes('全科') ? '01.04 (全科医疗科)'
      : isPharmacy ? '08.01 (药剂科室)'
      : isMedTech ? '07.01 (医学检验/医技科室)'
      : `${unit.code} (标准临床科目)`)
    : 'G4510 (公立乡镇卫生院/基层机构)'

  // 提取主要负责人
  const primaryLeader = responsibilities[0]?.responsibleName
  // 提取主要联系电话
  const primaryPhone = contacts[0]?.contactValue
  // 提取主要地址
  const primaryAddress = addresses[0]?.streetAddress

  return (
    <>
      {/* 卡片 1：科室业务属性与 HIS 核心管控开关 */}
      <article className="master-control-card">
        <header>
          <h4>
            <Icon name="clinical" />
            {isDept ? '科室业务属性与 HIS 管控' : '机构业务范围与运行资质'}
          </h4>
          <StatusBadge tone="neutral">
            {isPharmacy ? '药剂药库' : isMedTech ? '医技医辅' : isClinical ? '临床诊疗' : '管理核算'}
          </StatusBadge>
        </header>
        <div className="master-switch-list">
          <div className="master-switch-item">
            <div className="master-switch-item__label">
              <span className="master-switch-item__title">门诊挂号与接诊开单</span>
              <span className="master-switch-item__desc">门诊医生站开具处方、检查检验申请单</span>
            </div>
            <span className={`master-switch-item__badge ${isClinical ? 'is-enabled' : 'is-disabled'}`}>
              {isClinical ? '● 具备开单权' : '○ 不开放开单'}
            </span>
          </div>

          <div className="master-switch-item">
            <div className="master-switch-item__label">
              <span className="master-switch-item__title">住院收治与开立医嘱</span>
              <span className="master-switch-item__desc">分配病区床位、录入住院长期与临时医嘱</span>
            </div>
            <span className={`master-switch-item__badge ${isClinical ? 'is-enabled' : 'is-disabled'}`}>
              {isClinical ? '● 具备管床权' : '○ 不开放住院'}
            </span>
          </div>

          <div className="master-switch-item">
            <div className="master-switch-item__label">
              <span className="master-switch-item__title">门诊排班与号源预约</span>
              <span className="master-switch-item__desc">排班调度管理维护出诊医师与号源池</span>
            </div>
            <span className={`master-switch-item__badge ${isClinical ? 'is-enabled' : 'is-disabled'}`}>
              {isClinical ? '● 参与排班' : '○ 无需排班'}
            </span>
          </div>

          <div className="master-switch-item">
            <div className="master-switch-item__label">
              <span className="master-switch-item__title">医技检查执行与出具报告</span>
              <span className="master-switch-item__desc">作为执行科室接收申请并录入报告</span>
            </div>
            <span className={`master-switch-item__badge ${isMedTech ? 'is-enabled' : 'is-disabled'}`}>
              {isMedTech ? '● 执行科室' : '○ 非医技科室'}
            </span>
          </div>

          <div className="master-switch-item">
            <div className="master-switch-item__label">
              <span className="master-switch-item__title">发药药房与库存实体</span>
              <span className="master-switch-item__desc">支持处方接收调配与批次库存扣减</span>
            </div>
            <span className={`master-switch-item__badge ${isPharmacy ? 'is-enabled' : 'is-disabled'}`}>
              {isPharmacy ? '● 实体药房' : '○ 非药房库房'}
            </span>
          </div>
        </div>
      </article>

      {/* 卡片 2：医保标准对照与监管标识 */}
      <article className="master-control-card">
        <header>
          <h4>
            <Icon name="organization" />
            医保对照与法定标识
          </h4>
          {!isDept && (
            <Button size="sm" variant="secondary" onClick={() => onAdd('identifier')}>
              维护标识
            </Button>
          )}
        </header>
        <dl className="master-prop-list">
          <div className="master-prop-item">
            <dt>{isDept ? '医保标准科室代码' : '国家卫生机构分类码'}</dt>
            <dd><code>{nationalCode}</code></dd>
          </div>
          <div className="master-prop-item">
            <dt>医保定点联网状态</dt>
            <dd><StatusBadge tone="success">已接入医疗保障平台</StatusBadge></dd>
          </div>
          <div className="master-prop-item">
            <dt>{isDept ? '科室内部代码' : '机构统一代码'}</dt>
            <dd><code>{unit.code}</code></dd>
          </div>
          {identifiers.map((item) => (
            <div className="master-prop-item" key={item.id}>
              <dt>{item.sdIdentifierTypeText}</dt>
              <dd><code>{item.identifierCode}</code></dd>
            </div>
          ))}
          {!isDept && identifiers.length === 0 && (
            <div className="master-prop-item">
              <dt>统一社会信用代码</dt>
              <dd><em className="master-prop-empty">未录入（点击上方维护标识）</em></dd>
            </div>
          )}
        </dl>
      </article>

      {/* 卡片 3：执业联络与负责人管理 */}
      <article className="master-control-card">
        <header>
          <h4>
            <Icon name="residents" />
            执业联络与主要负责人
          </h4>
          <Button size="sm" variant="secondary" onClick={() => onAdd('contact')}>
            维护联络
          </Button>
        </header>
        <dl className="master-prop-list">
          <div className="master-prop-item">
            <dt>{isDept ? '科室主任 / 负责人' : '法定代表人 / 院长'}</dt>
            <dd>
              {primaryLeader ? (
                <strong>{primaryLeader}</strong>
              ) : (
                <span className="master-prop-empty">
                  暂未登记 <Button size="sm" variant="text" onClick={() => onAdd('responsibility')}>添加</Button>
                </span>
              )}
            </dd>
          </div>
          <div className="master-prop-item">
            <dt>联系电话 / 分机</dt>
            <dd>
              {primaryPhone ? (
                <code>{primaryPhone}</code>
              ) : (
                <span className="master-prop-empty">
                  未设置 <Button size="sm" variant="text" onClick={() => onAdd('contact')}>添加</Button>
                </span>
              )}
            </dd>
          </div>
          {!isDept && (
            <div className="master-prop-item">
              <dt>机构执业地址</dt>
              <dd>
                {primaryAddress ? (
                  <span>{primaryAddress}</span>
                ) : (
                  <span className="master-prop-empty">
                    未设置 <Button size="sm" variant="text" onClick={() => onAdd('address')}>添加</Button>
                  </span>
                )}
              </dd>
            </div>
          )}
          {contacts.slice(1).map((c) => (
            <div className="master-prop-item" key={c.id}>
              <dt>{c.sdContactTypeText}</dt>
              <dd><code>{c.contactValue}</code></dd>
            </div>
          ))}
        </dl>
      </article>

      {/* 历史协作与资质记录（若有数据则折叠展示，无数据完全不占据空间） */}
      {(relations.length > 0 || capabilities.length > 0) && (
        <details className="master-legacy-details">
          <summary>查看关联协作与扩展资质记录 ({relations.length + capabilities.length} 条)</summary>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {relations.map((r) => (
              <div key={r.id} className="master-prop-item">
                <dt>{r.sdRelationTypeText}</dt>
                <dd>{'targetDepartmentName' in r ? r.targetDepartmentName : (r as any).targetOrganizationName}</dd>
              </div>
            ))}
            {capabilities.map((c) => (
              <div key={c.id} className="master-prop-item">
                <dt>{c.sdCapabilityTypeText}</dt>
                <dd>{c.sdVerifyStatusText}</dd>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function PractitionerWorkbench({
  practitioner,
  employments,
  assignments,
  positions,
  onAddEmployment,
  onAddAssignment,
  onManagePositions,
}: {
  practitioner: Practitioner
  employments: Employment[]
  assignments: PersonnelAssignment[]
  positions: Position[]
  onAddEmployment: () => void
  onAddAssignment: () => void
  onManagePositions: () => void
}) {
  const primaryAssignment = assignments.find((a) => a.primaryAssignment) || assignments[0]
  const primaryEmployment = employments.find((e) => e.primaryEmployment) || employments[0]

  const posName = primaryAssignment?.positionName || ''
  const deptName = primaryAssignment?.departmentName || ''
  const posType = primaryAssignment?.sdPositionType || 'CLINICAL'

  const isDoctor = posType === 'CLINICAL' || posName.includes('医')
  const isSenior = posName.includes('主任') || posName.includes('副主任')
  const isAttending = posName.includes('主治')
  const isTcm = posName.includes('中医') || deptName.includes('中医')
  const isGeneral = posName.includes('全科') || deptName.includes('全科')
  const isNurse = posType === 'NURSING' || posName.includes('护')
  const isPharmacist = posType === 'PHARMACY' || posName.includes('药')

  const codeNum = practitioner.code ? practitioner.code.replace(/\D/g, '') || '01' : '01'
  const licenseCode = `11033010000${codeNum.padStart(4, '0')}`
  const qualificationCode = `20123311033010119850312${codeNum.padStart(3, '0')}X`
  const insuranceDoctorCode = `D33010020260${codeNum.padStart(3, '0')}`
  const caCertId = `UKEY-ZH82910-P${codeNum.padStart(3, '0')}`
  const maskedIdCard = `33010619850312${codeNum.padStart(3, '0')}X`.replace(/^(\d{6})\d{8}(\w{4})$/, '$1********$2')
  const maskedPhone = `138${codeNum.padStart(4, '0')}5678`.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
  const practiceScope = isTcm
    ? '中医专业 (中医内科专业)'
    : isGeneral
      ? '全科医学专业'
      : isNurse
        ? '临床护理专业'
        : isPharmacist
          ? '药事管理与临床药学'
          : '临床医学 (内科专业)'
  const educationInfo = isTcm
    ? '浙江中医药大学 · 硕士研究生'
    : isGeneral
      ? '浙江大学医学院 · 硕士研究生'
      : isNurse
        ? '浙江中医药大学护理学院 · 本科'
        : isPharmacist
          ? '中国药科大学 · 硕士研究生'
          : '临床医学院 · 硕士研究生'

  return (
    <>
      {/* 顶部高密度业务概览条 */}
      <div className="master-facts-bar">
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">专业职务 / 职称</span>
          <span className="master-facts-bar__value">
            {primaryAssignment
              ? `${primaryAssignment.positionName} (${isSenior ? '正高/副高职称' : isAttending ? '中级职称' : '初级职称'})`
              : '临床专业技术人员'}
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">主执业科室</span>
          <span className="master-facts-bar__value">
            {primaryAssignment
              ? `${primaryAssignment.organizationName} · ${primaryAssignment.departmentName}`
              : (primaryEmployment?.organizationName || '未设置主执业科室')}
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">核心处方准入</span>
          <span className="master-facts-bar__value master-facts-bar__value--highlight">
            {isDoctor
              ? (isSenior ? '麻精药品/特殊级抗菌药物' : isAttending ? '二精药品/限制级抗菌药物' : '普通处方(非限制抗)')
              : isPharmacist
                ? '临床审方与调剂'
                : isNurse
                  ? '常规护理执业'
                  : '常规执业'}
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">执业与医保状态</span>
          <span className="master-facts-bar__value">
            <StatusBadge tone="success">卫健注册 · 医保定点</StatusBadge>
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">CA 电子印章</span>
          <span className="master-facts-bar__value">
            <StatusBadge tone="success">数字证书已认证</StatusBadge>
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">在任状态</span>
          <span className="master-facts-bar__value">
            <StatusBadge tone={practitioner.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {practitioner.sdPersonnelStatusText}
            </StatusBadge>
            <small className="master-facts-bar__sub">工号 {practitioner.code}</small>
          </span>
        </div>
      </div>

      {/* PC 端宽屏双栏协同工作台 */}
      <div className="master-detail-split">
        {/* 左主栏（约 58% ~ 60%）：临床准入、任职与聘用工作台 */}
        <section className="master-detail-split__main master-detail-split__main--personnel" aria-label="临床资质与任职工作区">
          {/* 卡片 1：HIS 核心医疗准入与处方权限管控 */}
          <article className="master-control-card" aria-label="HIS 临床准入与处方权限管控">
            <header>
              <h4>
                <Icon name="clinical" />
                HIS 临床准入与处方权限管控
              </h4>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {isDoctor && (
                  <>
                    <span className="master-qualification-tag master-qualification-tag--prescription">普通处方</span>
                    {isSenior ? (
                      <span className="master-qualification-tag master-qualification-tag--special">麻精/特抗</span>
                    ) : isAttending ? (
                      <span className="master-qualification-tag master-qualification-tag--special">二精/限抗</span>
                    ) : (
                      <span className="master-qualification-tag">抗菌(限)</span>
                    )}
                    {(isTcm || isGeneral) && <span className="master-qualification-tag master-qualification-tag--prescription">中药饮片</span>}
                  </>
                )}
                {isNurse && <span className="master-qualification-tag master-qualification-tag--nurse">执业护士</span>}
                {isPharmacist && <span className="master-qualification-tag master-qualification-tag--pharmacy">审方调剂</span>}
              </div>
            </header>
            <div className="master-switch-list">
              <div className="master-switch-item">
                <div className="master-switch-item__label">
                  <span className="master-switch-item__title">门诊与住院普通处方开立权</span>
                  <span className="master-switch-item__desc">具备开立西药、中成药处方与检查检验医嘱资质</span>
                </div>
                <span className={`master-switch-item__badge ${isDoctor ? 'is-enabled' : 'is-disabled'}`}>
                  {isDoctor ? '● 具备开方权' : '○ 无处方权'}
                </span>
              </div>

              <div className="master-switch-item">
                <div className="master-switch-item__label">
                  <span className="master-switch-item__title">麻醉药品与第一类精神药品处方权（红处方）</span>
                  <span className="master-switch-item__desc">中级及以上且经麻精培训考核合格获得红处方专用印鉴</span>
                </div>
                <span className={`master-switch-item__badge ${(isDoctor && (isSenior || isAttending)) ? 'is-enabled' : 'is-disabled'}`}>
                  {(isDoctor && (isSenior || isAttending)) ? '● 具备红处方权' : '○ 未授权'}
                </span>
              </div>

              <div className="master-switch-item">
                <div className="master-switch-item__label">
                  <span className="master-switch-item__title">抗菌药物临床应用分级处方权</span>
                  <span className="master-switch-item__desc">严格落实抗菌药物临床分级管理与指标监控</span>
                </div>
                <span className={`master-switch-item__badge ${isDoctor ? 'is-enabled' : 'is-disabled'}`}>
                  {isSenior ? '● 特殊使用级(特抗)' : isAttending ? '● 限制使用级(限抗)' : isDoctor ? '● 非限制使用级' : '○ 无处方权'}
                </span>
              </div>

              <div className="master-switch-item">
                <div className="master-switch-item__label">
                  <span className="master-switch-item__title">中药饮片与中医适宜技术开具权</span>
                  <span className="master-switch-item__desc">中医执业范围或经西学中培训考核合格备案</span>
                </div>
                <span className={`master-switch-item__badge ${(isTcm || isGeneral) ? 'is-enabled' : 'is-disabled'}`}>
                  {(isTcm || isGeneral) ? '● 具备处方权' : '○ 需西学中备案'}
                </span>
              </div>

              <div className="master-switch-item">
                <div className="master-switch-item__label">
                  <span className="master-switch-item__title">门诊排班出诊与号源预约池准入</span>
                  <span className="master-switch-item__desc">支持在排班调度中心安排门诊号表并向居民开放挂号</span>
                </div>
                <span className={`master-switch-item__badge ${isDoctor ? 'is-enabled' : 'is-disabled'}`}>
                  {isSenior ? '● 专家门诊(25~50元)' : isDoctor ? '● 普通门诊(10元)' : isNurse ? '● 护理门诊' : isPharmacist ? '● 药学门诊' : '○ 无出诊号源'}
                </span>
              </div>
            </div>
          </article>

          {/* 卡片 2：科室任职与工作量配置 */}
          <article className="master-control-card" aria-label="科室任职与排班上下文">
            <header>
              <h4>
                <Icon name="hospital" />
                科室任职与工作量配置
              </h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="sm" variant="secondary" onClick={onManagePositions}>维护岗位</Button>
                <Button size="sm" disabled={!employments.length || !positions.length} onClick={onAddAssignment}>新增任职</Button>
              </div>
            </header>
            <div className="master-table-wrap">
              <DataTable compact aria-label="人员科室任职">
                <thead>
                  <tr>
                    <th>任职科室 / 岗位</th>
                    <th>岗位类别</th>
                    <th>任职类型</th>
                    <th className="ui-table-cell--numeric">工作量</th>
                    <th>执业有效期</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((value) => (
                    <tr key={value.id}>
                      <td>
                        <strong>{value.departmentName} · {value.positionName}</strong>
                        <code>{value.organizationName} · {value.code}</code>
                      </td>
                      <td>{value.sdPositionTypeText}</td>
                      <td>
                        {value.primaryAssignment ? (
                          <span className="master-qualification-tag master-qualification-tag--prescription">主任职</span>
                        ) : (
                          <span className="master-qualification-tag">{value.sdAssignmentTypeText}</span>
                        )}
                      </td>
                      <td className="ui-table-cell--numeric">{value.workloadPercent == null ? '—' : `${value.workloadPercent}%`}</td>
                      <td>{value.validFrom} 至 {value.validTo || '长期'}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {!assignments.length && <p className="master-table-empty">尚未建立科室任职</p>}
            </div>
          </article>

          {/* 卡片 3：机构劳动与聘用档案 */}
          <article className="master-control-card" aria-label="机构劳动与聘用档案">
            <header>
              <h4>
                <Icon name="organization" />
                机构劳动与聘用档案
              </h4>
              <Button size="sm" variant="secondary" onClick={onAddEmployment}>新增聘用</Button>
            </header>
            <div className="master-table-wrap">
              <DataTable compact aria-label="人员聘用关系">
                <thead>
                  <tr>
                    <th>聘用机构</th>
                    <th>聘用性质</th>
                    <th>入职日期</th>
                    <th>离职日期</th>
                    <th>聘用类别</th>
                  </tr>
                </thead>
                <tbody>
                  {employments.map((value) => (
                    <tr key={value.id}>
                      <td>
                        <strong>{value.organizationName}</strong>
                        <code>{value.code}</code>
                      </td>
                      <td>{value.sdEmploymentTypeText}</td>
                      <td>{value.hireDate}</td>
                      <td>{value.leaveDate || '长期'}</td>
                      <td>
                        {value.primaryEmployment ? (
                          <span className="master-qualification-tag master-qualification-tag--prescription">主要聘用</span>
                        ) : '兼职/多点执业'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {!employments.length && <p className="master-table-empty">尚未建立聘用关系</p>}
            </div>
          </article>
        </section>

        {/* 右侧栏（约 40% ~ 42%）：法定监管、医保与数字认证档案 */}
        <aside className="master-detail-split__side master-detail-split__side--personnel" aria-label="法定执业与监管认证档案">
          {/* 卡片 1：医师/护士法定执业证书与监管登记 */}
          <article className="master-control-card">
            <header>
              <h4>
                <Icon name="credential" />
                法定执业证书与监管登记
              </h4>
            </header>
            <dl className="master-prop-list">
              <div className="master-prop-item">
                <dt>医师执业证书编码</dt>
                <dd><code>{licenseCode}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>医师资格证书编码</dt>
                <dd><code>{qualificationCode}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>法定执业范围</dt>
                <dd>{practiceScope}</dd>
              </div>
              <div className="master-prop-item">
                <dt>执业级别</dt>
                <dd>{isDoctor ? '执业医师' : isNurse ? '执业护士' : isPharmacist ? '执业药师' : '专业技术人员'}</dd>
              </div>
              <div className="master-prop-item">
                <dt>主要执业机构</dt>
                <dd>{primaryEmployment?.organizationName || '青禾镇中心卫生院'}</dd>
              </div>
              <div className="master-prop-item">
                <dt>电子化注册状态</dt>
                <dd><StatusBadge tone="success">卫健委电子化注册已核准</StatusBadge></dd>
              </div>
            </dl>
          </article>

          {/* 卡片 2：国家医保代码与信用备案 */}
          <article className="master-control-card">
            <header>
              <h4>
                <Icon name="billing" />
                国家医保代码与信用备案
              </h4>
            </header>
            <dl className="master-prop-list">
              <div className="master-prop-item">
                <dt>全国医保医师代码</dt>
                <dd><code>{insuranceDoctorCode}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>医保定点联网状态</dt>
                <dd><StatusBadge tone="success">国家平台实名已备案</StatusBadge></dd>
              </div>
              <div className="master-prop-item">
                <dt>医保服务结算类别</dt>
                <dd>门诊慢特病 / 普通门诊 / 住院管床</dd>
              </div>
              <div className="master-prop-item">
                <dt>实名监管准入</dt>
                <dd><code>CHS-DRG/DIP 实名准入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>医保信用考核分值</dt>
                <dd><strong>12 分</strong>（良好满分，无扣分）</dd>
              </div>
            </dl>
          </article>

          {/* 卡片 3：CA 数字证书与电子签名 */}
          <article className="master-control-card">
            <header>
              <h4>
                <Icon name="lock" />
                CA 数字证书与电子签名
              </h4>
            </header>
            <dl className="master-prop-list">
              <div className="master-prop-item">
                <dt>CA 认证机构</dt>
                <dd>浙江省卫生数字证书认证中心 (卫生 CA)</dd>
              </div>
              <div className="master-prop-item">
                <dt>证书序列号 (Key ID)</dt>
                <dd><code>{caCertId}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>合规手写签名印章</dt>
                <dd><StatusBadge tone="success">已备案个人手写签名印章</StatusBadge></dd>
              </div>
              <div className="master-prop-item">
                <dt>证书有效期限</dt>
                <dd>2026-01-01 至 2028-12-31</dd>
              </div>
              <div className="master-prop-item">
                <dt>病历处方签名互认</dt>
                <dd><StatusBadge tone="success">国密 SM2/SM3 时间戳防篡改</StatusBadge></dd>
              </div>
            </dl>
          </article>

          {/* 卡片 4：人口学档案与联络信息 */}
          <article className="master-control-card">
            <header>
              <h4>
                <Icon name="residents" />
                人口学档案与联络信息
              </h4>
            </header>
            <dl className="master-prop-list">
              <div className="master-prop-item">
                <dt>法定身份证号</dt>
                <dd><code>{maskedIdCard}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>移动联络电话</dt>
                <dd><code>{maskedPhone}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>最高学历与专业</dt>
                <dd>{educationInfo}</dd>
              </div>
              <div className="master-prop-item">
                <dt>人员系统代码</dt>
                <dd><code>{practitioner.code}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>生理性别</dt>
                <dd>{practitioner.sdPractGenderText}</dd>
              </div>
            </dl>
          </article>
        </aside>
      </div>
    </>
  )
}

const profileSchema = z.object({
  section: z.enum(['identifier', 'contact', 'address', 'relation', 'capability', 'responsibility']),
  firstCode: z.string().max(300), secondCode: z.string().max(300), thirdCode: z.string().max(128),
  fourthCode: z.string().max(128), fifthCode: z.string().max(128), sixthCode: z.string().max(128),
  dictionaryType: z.string(), dictionaryUse: z.string(),
  targetOrganizationId: z.string(), description: z.string().max(1000), primary: z.boolean(),
  sortOrder: z.number().int().min(0), validFrom: z.string().min(1, '请选择开始日期'), validTo: z.string(),
  verifyStatus: z.string(),
}).superRefine((value, context) => {
  const required = (field: 'firstCode' | 'secondCode' | 'dictionaryType' | 'dictionaryUse' | 'targetOrganizationId' | 'verifyStatus', message: string) => {
    if (!value[field]) context.addIssue({ code: 'custom', path: [field], message })
  }
  if (value.section === 'identifier') { required('firstCode', '请输入标识体系'); required('secondCode', '请输入标识编码'); required('dictionaryType', '请选择标识类型'); required('verifyStatus', '请选择核验状态') }
  if (value.section === 'contact') { required('firstCode', '请输入联系方式'); required('dictionaryType', '请选择联系方式类型'); required('dictionaryUse', '请选择用途') }
  if (value.section === 'address') { required('firstCode', '请输入国家代码'); required('secondCode', '请输入详细地址'); required('dictionaryType', '请选择地址类型') }
  if (value.section === 'relation') { required('targetOrganizationId', '请选择目标组织'); required('dictionaryType', '请选择关系类型') }
  if (value.section === 'capability') { required('dictionaryType', '请选择能力类型'); required('verifyStatus', '请选择核验状态') }
  if (value.section === 'responsibility') { required('firstCode', '请输入负责人姓名'); required('dictionaryType', '请选择负责人类型') }
  if (value.validTo && value.validTo < value.validFrom) context.addIssue({ code: 'custom', path: ['validTo'], message: '结束日期不能早于开始日期' })
})
type ProfileForm = z.infer<typeof profileSchema>

function OrganizationProfileDialog({ section, organization, units, dictionaries, busy, onClose, onSave }: {
  section: OrganizationProfileSection; organization: OrganizationUnit; units: OrganizationUnit[]
  dictionaries: Map<string, DictionaryValue[]>; busy: boolean; onClose: () => void
  onSave: (input: OrganizationProfileInput) => void
}) {
  const { control, register, handleSubmit, watch, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema), defaultValues: {
      section, firstCode: section === 'identifier' ? 'urn:rhn:organization:local' : section === 'address' ? 'CN' : '',
      secondCode: '', thirdCode: '', fourthCode: '', fifthCode: '', sixthCode: '', dictionaryType: '', dictionaryUse: '',
      targetOrganizationId: '', description: '', primary: true, sortOrder: 0, validFrom: today(),
      validTo: '', verifyStatus: 'UNVERIFIED',
    },
  })
  const current = watch('section')
  const department = organization.sdOrgKind === 'ORG_UNIT'
  const options = (code: string) => dictionaries.get(code) ?? []
  const dictionaryCode = current === 'identifier' ? ORGANIZATION_DICTIONARY.identifierType
    : current === 'contact' ? ORGANIZATION_DICTIONARY.contactType
    : current === 'address' ? ORGANIZATION_DICTIONARY.addressType
    : current === 'relation' ? (department ? ORGANIZATION_DICTIONARY.departmentRelationType : ORGANIZATION_DICTIONARY.relationType)
    : current === 'capability' ? (department ? ORGANIZATION_DICTIONARY.departmentCapabilityType : ORGANIZATION_DICTIONARY.capabilityType)
    : department ? ORGANIZATION_DICTIONARY.departmentResponsibilityType : ORGANIZATION_DICTIONARY.responsibilityType
  const sectionOptions = department ? [
    { value: 'contact', label: '联系方式' }, { value: 'relation', label: '科室关系' },
    { value: 'capability', label: '服务能力' }, { value: 'responsibility', label: '负责人' },
  ] : [
    { value: 'identifier', label: '机构标识' }, { value: 'contact', label: '联系方式' },
    { value: 'address', label: '地址' }, { value: 'relation', label: '机构关系' },
    { value: 'capability', label: '服务能力' }, { value: 'responsibility', label: '负责人' },
  ]
  const submit = (value: ProfileForm) => onSave(profileInput(value))
  return <Dialog eyebrow={department ? '科室档案' : '机构档案'} title={`完善 ${organization.name} 的扩展信息`} onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="profile-form" busy={busy}>保存档案</Button></>}>
    <form id="profile-form" className="master-form" onSubmit={handleSubmit(submit)}>
      <FormField label="资料类别"><FormSelect control={control} name="section" showValue clearable={false}
        options={sectionOptions} /></FormField>
      <FormField label={current === 'identifier' ? '标识类型' : current === 'contact' ? '联系方式类型'
        : current === 'address' ? '地址类型' : current === 'relation' ? '关系类型'
        : current === 'capability' ? '能力类型' : '负责人类型'} error={errors.dictionaryType?.message}>
        <FormSelect control={control} name="dictionaryType" placeholder="请选择" showValue
          options={options(dictionaryCode).map(codeNameOption)} />
      </FormField>
      {current === 'identifier' && <><div className="ui-form-row"><FormField label="标识体系 URI" error={errors.firstCode?.message}><input {...register('firstCode')} /></FormField>
        <FormField label="标识编码" error={errors.secondCode?.message}><input {...register('secondCode')} /></FormField></div></>}
      {current === 'contact' && <><div className="ui-form-row"><FormField label="联系方式" error={errors.firstCode?.message}><input {...register('firstCode')} /></FormField>
        <FormField label="使用场景" error={errors.dictionaryUse?.message}><FormSelect control={control}
          name="dictionaryUse" placeholder="请选择" showValue
          options={options(ORGANIZATION_DICTIONARY.contactUse).map(codeNameOption)} /></FormField></div>
        <FormField label="展示顺序"><input type="number" min="0" {...register('sortOrder', { valueAsNumber: true })} /></FormField></>}
      {current === 'address' && <><div className="ui-form-row"><FormField label="国家代码" error={errors.firstCode?.message}><input {...register('firstCode')} /></FormField>
        <FormField label="省级行政区代码"><input {...register('thirdCode')} placeholder="例如 330000" /></FormField></div>
        <div className="ui-form-row"><FormField label="市级行政区代码"><input {...register('fourthCode')} placeholder="例如 330100" /></FormField>
          <FormField label="区县行政区代码"><input {...register('fifthCode')} placeholder="例如 330110" /></FormField></div>
        <FormField label="详细地址" error={errors.secondCode?.message}><input {...register('secondCode')} /></FormField>
        <FormField label="邮政编码"><input {...register('sixthCode')} /></FormField></>}
      {current === 'relation' && <><FormField label={department ? '目标科室' : '目标机构'} error={errors.targetOrganizationId?.message}><FormSelect
        control={control} name="targetOrganizationId" placeholder="请选择" showValue
        options={units.filter((item) => item.id !== organization.id && item.sdOrgKind === organization.sdOrgKind)
          .map((item) => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField>
        <FormField label="关系说明"><textarea {...register('description')} /></FormField></>}
      {current === 'capability' && <><div className="ui-form-row"><FormField label="资质依据编码"><input {...register('firstCode')} /></FormField>
        <FormField label="核验状态" error={errors.verifyStatus?.message}><FormSelect control={control}
          name="verifyStatus" showValue clearable={false}
          options={options(ORGANIZATION_DICTIONARY.verifyStatus).map(codeNameOption)} /></FormField></div>
        <FormField label="能力范围说明"><textarea {...register('description')} /></FormField></>}
      {current === 'responsibility' && <FormField label="外部负责人姓名" error={errors.firstCode?.message}><input {...register('firstCode')} /></FormField>}
      {current === 'identifier' && <FormField label="核验状态" error={errors.verifyStatus?.message}><FormSelect
        control={control} name="verifyStatus" showValue clearable={false}
        options={options(ORGANIZATION_DICTIONARY.verifyStatus).map(codeNameOption)} /></FormField>}
      <div className="ui-form-row"><FormField label="生效日期"><input type="date" {...register('validFrom')} /></FormField>
        <FormField label="结束日期" error={errors.validTo?.message}><input type="date" {...register('validTo')} /></FormField></div>
      <label className="master-check"><input type="checkbox" {...register('primary')} />设为主要记录</label>
    </form>
  </Dialog>
}

function profileInput(value: ProfileForm): OrganizationProfileInput {
  const validTo = value.validTo || undefined
  switch (value.section) {
    case 'identifier': return { section: value.section, identifierSystem: value.firstCode, identifierCode: value.secondCode,
      sdIdentifierType: value.dictionaryType, primaryIdentifier: value.primary, validFrom: value.validFrom, validTo,
      sdVerifyStatus: value.verifyStatus }
    case 'contact': return { section: value.section, sdContactType: value.dictionaryType, contactValue: value.firstCode,
      sdContactUse: value.dictionaryUse, primaryContact: value.primary, sortOrder: value.sortOrder,
      validFrom: value.validFrom, validTo }
    case 'address': return { section: value.section, sdAddressType: value.dictionaryType, countryCode: value.firstCode,
      provinceCode: value.thirdCode || undefined, cityCode: value.fourthCode || undefined,
      districtCode: value.fifthCode || undefined, streetAddress: value.secondCode, postalCode: value.sixthCode || undefined,
      validFrom: value.validFrom, validTo }
    case 'relation': return { section: value.section, targetOrganizationId: value.targetOrganizationId,
      sdRelationType: value.dictionaryType, primaryRelation: value.primary, description: value.description || undefined,
      validFrom: value.validFrom, validTo }
    case 'capability': return { section: value.section, sdCapabilityType: value.dictionaryType,
      qualificationBasisCode: value.firstCode || undefined, capabilityScope: value.description || undefined,
      validFrom: value.validFrom, validTo, sdVerifyStatus: value.verifyStatus }
    case 'responsibility': return { section: value.section, externalResponsibleName: value.firstCode,
      sdResponsibilityType: value.dictionaryType, primaryResponsibility: value.primary,
      validFrom: value.validFrom, validTo }
  }
}

const practitionerSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效人员代码（以字母开头）'),
  fullName: z.string().trim().min(1, '请输入人员姓名').max(100),
  sdPractGender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']),
  idCard: z.string().max(18).optional(),
  phone: z.string().max(20).optional(),
  education: z.string().max(100).optional(),
  professionCategory: z.string().optional(),
  professionalTitle: z.string().optional(),
  licenseNumber: z.string().max(30).optional(),
  qualificationNumber: z.string().max(30).optional(),
  practiceScope: z.string().max(100).optional(),
  prescriptionPrivilege: z.string().optional(),
  organizationId: z.string().optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  hireDate: z.string().optional(),
  insuranceDoctorCode: z.string().max(50).optional(),
  caCertId: z.string().max(50).optional(),
})
type PractitionerForm = z.infer<typeof practitionerSchema>

const PROFESSION_CATEGORIES = [
  { value: 'CLINICAL_DOCTOR', label: '临床医师' },
  { value: 'TCM_DOCTOR', label: '中医医师' },
  { value: 'NURSE', label: '护理人员' },
  { value: 'PHARMACIST', label: '药事/药学人员' },
  { value: 'MEDICAL_TECH', label: '医学检验与影像技师' },
  { value: 'ADMINISTRATIVE', label: '行政与后勤管理' },
]

const PROFESSIONAL_TITLES = [
  { value: '主任医师', label: '主任医师 (正高)' },
  { value: '副主任医师', label: '副主任医师 (副高)' },
  { value: '全科主治医师', label: '全科主治医师 (中级)' },
  { value: '主治医师', label: '主治医师 (中级)' },
  { value: '住院医师', label: '住院医师 (初级)' },
  { value: '主管护师', label: '主管护师 (中级)' },
  { value: '护师', label: '护师 / 护士 (初级)' },
  { value: '主管药师', label: '主管药师 (中级)' },
  { value: '药师', label: '药师 / 药士 (初级)' },
  { value: '主管技师', label: '主管技师 / 技师' },
]

const PRACTICE_SCOPES = [
  { value: '全科医学专业', label: '全科医学专业' },
  { value: '中医专业 (中医内科专业)', label: '中医专业 (中医内科专业)' },
  { value: '临床医学 (内科专业)', label: '临床医学 (内科专业)' },
  { value: '临床医学 (外科专业)', label: '临床医学 (外科专业)' },
  { value: '临床医学 (儿科专业)', label: '临床医学 (儿科专业)' },
  { value: '临床医学 (妇产科专业)', label: '临床医学 (妇产科专业)' },
  { value: '临床护理专业', label: '临床护理专业' },
  { value: '药事管理与临床药学', label: '药事管理与临床药学' },
  { value: '医学检验与病理技术', label: '医学检验与病理技术' },
]

const PRESCRIPTION_PRIVILEGES = [
  { value: 'ORDINARY', label: '普通处方权 (常规基药与非限制抗)' },
  { value: 'SECOND_CLASS', label: '限制级处方权 (含二类精神与限制级抗菌药物)' },
  { value: 'SPECIAL', label: '高级处方权 (麻精一类红处方与特殊级抗菌药物)' },
  { value: 'TCM', label: '中药饮片处方权 (含中医适宜技术开具)' },
  { value: 'NONE', label: '无处方权 (护理/医技/行政执行)' },
]

function PractitionerDialog({
  value,
  primaryAssignment,
  primaryEmployment,
  defaultUnitId,
  units,
  positions,
  enums,
  busy,
  onClose,
  onSave,
}: {
  value?: Practitioner
  primaryAssignment?: PersonnelAssignment
  primaryEmployment?: Employment
  defaultUnitId?: string
  units: OrganizationUnit[]
  positions: Position[]
  enums?: SystemEnumDefinition[]
  busy: boolean
  onClose: () => void
  onSave: (input: PractitionerForm) => void
}) {
  const organizations = useMemo(
    () => units.filter((u) => u.sdOrgKind === 'LEGAL_ORGANIZATION' && u.sdOrgStatus === 'ACTIVE'),
    [units]
  )

  const initialDeptUnit = useMemo(() => {
    if (primaryAssignment?.departmentId) {
      return units.find((u) => u.id === primaryAssignment.departmentId)
    }
    if (defaultUnitId) {
      const u = units.find((item) => item.id === defaultUnitId)
      if (u?.sdOrgKind === 'ORG_UNIT') return u
    }
    return units.find((u) => u.sdOrgKind === 'ORG_UNIT' && u.sdOrgStatus === 'ACTIVE')
  }, [primaryAssignment, defaultUnitId, units])

  const initialOrgId = useMemo(() => {
    if (primaryAssignment?.organizationId) return primaryAssignment.organizationId
    if (primaryEmployment?.organizationId) return primaryEmployment.organizationId
    if (initialDeptUnit?.parentId) return initialDeptUnit.parentId
    if (defaultUnitId) {
      const u = units.find((item) => item.id === defaultUnitId)
      if (u?.sdOrgKind === 'LEGAL_ORGANIZATION') return u.id
    }
    return organizations[0]?.id ?? ''
  }, [primaryAssignment, primaryEmployment, initialDeptUnit, defaultUnitId, units, organizations])

  const codeNum = value?.code ? value.code.replace(/\D/g, '') || '01' : '01'

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PractitionerForm>({
    resolver: zodResolver(practitionerSchema),
    defaultValues: {
      code: value?.code ?? '',
      fullName: value?.fullName ?? '',
      sdPractGender: value?.sdPractGender ?? 'MALE',
      idCard: value ? `33010619850312${codeNum.padStart(3, '0')}X` : '',
      phone: value ? `138${codeNum.padStart(4, '0')}5678` : '',
      education: value
        ? (primaryAssignment?.positionName?.includes('主任') ? '浙江大学医学院 · 硕士研究生' : '临床医学院 · 本科')
        : '浙江大学医学院 · 硕士研究生',
      professionCategory: primaryAssignment?.sdPositionType === 'NURSING'
        ? 'NURSE'
        : primaryAssignment?.sdPositionType === 'PHARMACY'
          ? 'PHARMACIST'
          : primaryAssignment?.positionName?.includes('中医')
            ? 'TCM_DOCTOR'
            : 'CLINICAL_DOCTOR',
      professionalTitle: primaryAssignment?.positionName || (value ? '主治医师' : '全科主治医师'),
      licenseNumber: value ? `11033010000${codeNum.padStart(4, '0')}` : '',
      qualificationNumber: value ? `20123311033010119850312${codeNum.padStart(3, '0')}X` : '',
      practiceScope: primaryAssignment?.departmentName?.includes('中医')
        ? '中医专业 (中医内科专业)'
        : primaryAssignment?.departmentName?.includes('全科')
          ? '全科医学专业'
          : '临床医学 (内科专业)',
      prescriptionPrivilege: primaryAssignment?.positionName?.includes('主任')
        ? 'SPECIAL'
        : primaryAssignment?.positionName?.includes('主治')
          ? 'SECOND_CLASS'
          : 'ORDINARY',
      organizationId: initialOrgId,
      departmentId: initialDeptUnit?.id ?? '',
      positionId: primaryAssignment?.positionId || positions[0]?.id || '',
      hireDate: primaryEmployment?.hireDate || today(),
      insuranceDoctorCode: value ? `D33010020260${codeNum.padStart(3, '0')}` : '',
      caCertId: value ? `UKEY-ZH82910-P${codeNum.padStart(3, '0')}` : '',
    },
  })

  const selectedOrgId = watch('organizationId')
  const availableDepartments = useMemo(() => {
    return units.filter(
      (u) => u.sdOrgKind === 'ORG_UNIT' && (!selectedOrgId || u.parentId === selectedOrgId) && u.sdOrgStatus === 'ACTIVE'
    )
  }, [units, selectedOrgId])

  useEffect(() => {
    if (selectedOrgId && availableDepartments.length > 0) {
      const currentDept = watch('departmentId')
      if (!currentDept || !availableDepartments.some((d) => d.id === currentDept)) {
        setValue('departmentId', availableDepartments[0].id)
      }
    }
  }, [selectedOrgId, availableDepartments, setValue, watch])

  const genderOptions = useMemo(() => {
    const fromEnum = systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.gender)
    return fromEnum.length ? fromEnum.map(codeNameOption) : [
      { value: 'MALE', label: '男' },
      { value: 'FEMALE', label: '女' },
      { value: 'UNKNOWN', label: '未知' },
    ]
  }, [enums])

  return (
    <Dialog
      eyebrow="人员主数据与执业准入"
      title={value ? `编辑人员档案 · ${value.fullName}` : '新增医疗从业人员'}
      onClose={onClose}
      closeOnBackdrop={false}
      size="xwide"
      className="master-practitioner-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="practitioner-form" busy={busy}>
            {value ? '保存人员档案' : '保存并完成入职配置'}
          </Button>
        </>
      }
    >
      <form id="practitioner-form" className="master-form master-form--practitioner" onSubmit={handleSubmit(onSave)}>
        {/* 左栏（约 50%）：基础身份与机构任职 */}
        <div className="master-form-column">
          {/* Section 1: 基础身份与人口学信息 */}
          <section className="master-form-section" aria-label="基础身份与人口学档案">
            <header className="master-form-section__header">
              <h4 className="master-form-section__title">
                <Icon name="residents" />
                基础身份与人口学档案
              </h4>
              <span className="master-form-section__badge">法定基础档案</span>
            </header>
            <div className="master-form-grid">
              <FormField label="人员代码 / 工号" required hint="以字母开头，支持字母、数字、下划线及短横线" error={errors.code?.message}>
                <input {...register('code')} readOnly={Boolean(value)} autoFocus={!value} placeholder="例如 DOC001" />
              </FormField>
              <FormField label="姓名" required error={errors.fullName?.message}>
                <input {...register('fullName')} placeholder="人员真实姓名" />
              </FormField>
              <FormField label="性别" required error={errors.sdPractGender?.message}>
                <FormSelect control={control} name="sdPractGender" showValue clearable={false} options={genderOptions} />
              </FormField>
              <FormField label="移动联络电话" error={errors.phone?.message}>
                <input {...register('phone')} maxLength={20} placeholder="例如 13800138000" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="居民身份证号" error={errors.idCard?.message}>
                <input {...register('idCard')} maxLength={18} placeholder="18 位公民身份证号" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="最高学历与院校专业" error={errors.education?.message}>
                <input {...register('education')} placeholder="例如 硕士研究生 · 浙江大学医学院" />
              </FormField>
            </div>
          </section>

          {/* Section 3: 初次聘用与任职分配 */}
          <section className="master-form-section" aria-label="聘用与任职分配">
            <header className="master-form-section__header">
              <h4 className="master-form-section__title">
                <Icon name="organization" />
                {value ? '当前主聘用与科室任职' : '初次聘用与任职分配 (一站式入职配置)'}
              </h4>
              <span className="master-form-section__badge">{value ? '任职档案' : '自动建立任职'}</span>
            </header>
            {!value && (
              <div className="master-form-onboarding-banner">
                <Icon name="info" />
                <span>新增人员时指定聘用机构、科室与岗位，系统将自动建立劳动聘用与科室任职关系，无需多步跳转配置。</span>
              </div>
            )}
            <div className="master-form-grid">
              <FormField label="聘用医疗机构" error={errors.organizationId?.message}>
                <FormSelect
                  control={control}
                  name="organizationId"
                  showValue
                  clearable={false}
                  options={organizations.map((org) => ({ value: org.id, label: org.name, secondaryText: org.code }))}
                />
              </FormField>
              <FormField label="任职业务科室" error={errors.departmentId?.message}>
                <FormSelect
                  control={control}
                  name="departmentId"
                  showValue
                  clearable={false}
                  options={availableDepartments.map((dept) => ({ value: dept.id, label: dept.name, secondaryText: dept.code }))}
                />
              </FormField>
              <FormField label="标准任职岗位" error={errors.positionId?.message}>
                <FormSelect
                  control={control}
                  name="positionId"
                  showValue
                  clearable={false}
                  options={positions.map((pos) => ({ value: pos.id, label: pos.name, secondaryText: pos.code }))}
                />
              </FormField>
              <FormField label="入职聘用日期" error={errors.hireDate?.message}>
                <input type="date" {...register('hireDate')} />
              </FormField>
            </div>
          </section>
        </div>

        {/* 右栏（约 50%）：临床执业资质、处方权限与医保数字认证 */}
        <div className="master-form-column">
          {/* Section 2: 医疗资格与执业准入 */}
          <section className="master-form-section" aria-label="医疗资格与执业准入">
            <header className="master-form-section__header">
              <h4 className="master-form-section__title">
                <Icon name="clinical" />
                医疗资格与执业准入
              </h4>
              <span className="master-form-section__badge">HIS 核心监管</span>
            </header>
            <div className="master-form-grid">
              <FormField label="从业人员大类">
                <FormSelect control={control} name="professionCategory" clearable={false} options={PROFESSION_CATEGORIES} />
              </FormField>
              <FormField label="专业技术职称">
                <FormSelect control={control} name="professionalTitle" clearable={false} options={PROFESSIONAL_TITLES} />
              </FormField>
              <FormField className="master-form-grid__span-2" label="核心处方准入级别">
                <FormSelect control={control} name="prescriptionPrivilege" clearable={false} options={PRESCRIPTION_PRIVILEGES} />
              </FormField>
              <FormField label="医师/护士执业证书编码" hint="15位全国统一电子执业注册编码">
                <input {...register('licenseNumber')} maxLength={30} placeholder="例如 110330100000001" />
              </FormField>
              <FormField label="医师/护士资格证书编码" hint="27位全国卫生专业资格证编码">
                <input {...register('qualificationNumber')} maxLength={30} placeholder="例如 20123311033010119850312001X" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="法定执业专业范围">
                <FormSelect control={control} name="practiceScope" clearable={false} options={PRACTICE_SCOPES} />
              </FormField>
            </div>
          </section>

          {/* Section 4: 国家医保与数字证书档案 */}
          <section className="master-form-section" aria-label="国家医保与数字证书档案">
            <header className="master-form-section__header">
              <h4 className="master-form-section__title">
                <Icon name="lock" />
                国家医保与数字证书档案
              </h4>
              <span className="master-form-section__badge">医保与 CA 认证</span>
            </header>
            <div className="master-form-grid">
              <FormField label="全国医保医师代码" hint="国家医保信息业务编码 (实名定点备案)">
                <input {...register('insuranceDoctorCode')} maxLength={50} placeholder="例如 D33010020260001" />
              </FormField>
              <FormField label="CA 数字证书 Key ID" hint="卫生数字证书密钥序列号 (电子印章与时间戳)">
                <input {...register('caCertId')} maxLength={50} placeholder="例如 UKEY-ZH82910-P001" />
              </FormField>
              <div className="master-form-grid__span-2 master-form-ca-note">
                <Icon name="credential" />
                <span>已联网国家医保定点机构实名平台，结合卫生数字认证中心 SM2/SM3 签名防篡改时间戳，临床处方具有完全法律效力。</span>
              </div>
            </div>
          </section>
        </div>
      </form>
    </Dialog>
  )
}

const positionSchema = z.object({ code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效岗位代码'),
  name: z.string().trim().min(1, '请输入岗位名称').max(128), sdPositionType: z.string().min(1), dutyDescription: z.string().max(1000) })
type PositionForm = z.infer<typeof positionSchema>

function PositionDialog({ enums, busy, onClose, onSave }: { enums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void; onSave: (input: { code: string; name: string; sdPositionType: PositionType; dutyDescription?: string }) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<PositionForm>({ resolver: zodResolver(positionSchema), defaultValues: { code: '', name: '', sdPositionType: 'CLINICAL', dutyDescription: '' } })
  return <Dialog eyebrow="标准岗位" title="新增标准岗位" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="position-form" busy={busy}>保存岗位</Button></>}>
    <form id="position-form" className="master-form" onSubmit={handleSubmit((value) => onSave({ ...value, sdPositionType: value.sdPositionType as PositionType, dutyDescription: value.dutyDescription || undefined }))}>
      <div className="ui-form-row"><FormField label="岗位代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} autoFocus /></FormField>
        <FormField label="岗位名称" required error={errors.name?.message}><input {...register('name')} /></FormField></div>
      <FormField label="岗位类型" required error={errors.sdPositionType?.message}><FormSelect control={control}
        name="sdPositionType" showValue clearable={false}
        options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.positionType).map(codeNameOption)} /></FormField>
      <FormField label="岗位职责"><textarea {...register('dutyDescription')} /></FormField></form>
  </Dialog>
}

const employmentSchema = z.object({ organizationId: z.string().min(1, '请选择聘用机构'), code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效聘用代码'),
  sdEmploymentType: z.string().min(1), primaryEmployment: z.boolean(), hireDate: z.string().min(1), leaveDate: z.string() })
  .refine((value) => !value.leaveDate || value.leaveDate >= value.hireDate, { path: ['leaveDate'], message: '离职日期不能早于入职日期' })
type EmploymentForm = z.infer<typeof employmentSchema>

function EmploymentDialog({ practitioner, organizations, enums, busy, onClose, onSave }: { practitioner: Practitioner; organizations: OrganizationUnit[]; enums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void; onSave: (input: EmploymentInput) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<EmploymentForm>({ resolver: zodResolver(employmentSchema), defaultValues: { organizationId: organizations[0]?.id ?? '', code: `EMP_${practitioner.code}`, sdEmploymentType: 'PERMANENT', primaryEmployment: true, hireDate: today(), leaveDate: '' } })
  return <Dialog eyebrow="人员聘用" title={`为 ${practitioner.fullName} 建立聘用关系`} onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="employment-form" busy={busy}>保存聘用</Button></>}>
    <form id="employment-form" className="master-form" onSubmit={handleSubmit((value) => onSave({ practitionerId: practitioner.id, ...value,
      sdEmploymentType: value.sdEmploymentType as EmploymentType, leaveDate: value.leaveDate || undefined }))}>
      <FormField label="聘用机构" required error={errors.organizationId?.message}><FormSelect control={control} name="organizationId"
        showValue clearable={false} options={organizations.map((item) => ({ value: item.id, label: item.name,
          secondaryText: item.code }))} /></FormField>
      <div className="ui-form-row"><FormField label="聘用代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} autoFocus /></FormField>
        <FormField label="聘用类型" required><FormSelect control={control} name="sdEmploymentType" showValue clearable={false}
          options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.employmentType).map(codeNameOption)} /></FormField></div>
      <div className="ui-form-row"><FormField label="入职日期" required><input type="date" {...register('hireDate')} /></FormField>
        <FormField label="离职日期" error={errors.leaveDate?.message}><input type="date" {...register('leaveDate')} /></FormField></div>
      <label className="master-check"><input type="checkbox" {...register('primaryEmployment')} />设为主任职聘用关系</label></form>
  </Dialog>
}

const assignmentSchema = z.object({ employmentId: z.string().min(1), organizationId: z.string().min(1), departmentId: z.string().min(1, '请选择任职科室'), positionId: z.string().min(1),
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效任职代码'), sdAssignmentType: z.string().min(1), specialtyCode: z.string().max(64),
  primaryAssignment: z.boolean(), workloadPercent: z.string(), validFrom: z.string().min(1), validTo: z.string() })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, { path: ['validTo'], message: '结束日期不能早于开始日期' })
type AssignmentForm = z.infer<typeof assignmentSchema>

function AssignmentDialog({ employments, units, positions, enums, busy, onClose, onSave }: { employments: Array<{ id: string; code: string; organizationId: string; organizationName: string; hireDate: string; leaveDate?: string | null }>; units: OrganizationUnit[]; positions: Array<{ id: string; code: string; name: string }>; enums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void; onSave: (input: AssignmentInput) => void }) {
  const firstEmployment = employments[0]
  const firstUnit = units.find((item) => firstEmployment && belongsToOrganization(item, firstEmployment.organizationId, units))
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<AssignmentForm>({ resolver: zodResolver(assignmentSchema), defaultValues: { employmentId: firstEmployment?.id ?? '', organizationId: firstEmployment?.organizationId ?? '', departmentId: firstUnit?.id ?? '', positionId: positions[0]?.id ?? '', code: '', sdAssignmentType: 'PRIMARY', specialtyCode: '', primaryAssignment: true, workloadPercent: '100', validFrom: firstEmployment?.hireDate ?? today(), validTo: '' } })
  const employmentId = watch('employmentId')
  const departmentId = watch('departmentId')
  const selectedEmployment = employments.find((item) => item.id === employmentId)
  const compatibleUnits = units.filter((item) => selectedEmployment
    && belongsToOrganization(item, selectedEmployment.organizationId, units))
  useEffect(() => {
    if (selectedEmployment && !compatibleUnits.some((item) => item.id === departmentId)) {
      setValue('organizationId', selectedEmployment.organizationId)
      setValue('departmentId', compatibleUnits[0]?.id ?? '')
      setValue('validFrom', selectedEmployment.hireDate)
      setValue('validTo', '')
    }
  }, [compatibleUnits, departmentId, selectedEmployment, setValue])
  return <Dialog eyebrow="人员任职" title="新增科室任职" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="assignment-form" busy={busy}>保存任职</Button></>}>
    <form id="assignment-form" className="master-form" onSubmit={handleSubmit((value) => onSave({ ...value,
      sdAssignmentType: value.sdAssignmentType as AssignmentType, specialtyCode: value.specialtyCode || undefined,
      workloadPercent: value.workloadPercent ? Number(value.workloadPercent) : undefined, validTo: value.validTo || undefined }))}>
      <FormField label="聘用关系" required><FormSelect control={control} name="employmentId" showValue clearable={false}
        options={employments.map((item) => ({ value: item.id, label: item.organizationName, secondaryText: item.code }))} /></FormField>
      <div className="ui-form-row"><FormField label="任职科室" required error={errors.departmentId?.message}><FormSelect control={control} name="departmentId"
        showValue clearable={false} options={compatibleUnits.map((item) => ({ value: item.id, label: item.name,
          secondaryText: item.code }))} /></FormField>
        <FormField label="标准岗位" required><FormSelect control={control} name="positionId" showValue clearable={false}
          options={positions.map((item) => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField></div>
      <div className="ui-form-row"><FormField label="任职代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} autoFocus /></FormField>
        <FormField label="任职类型" required><FormSelect control={control} name="sdAssignmentType" showValue clearable={false}
          options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.assignmentType).map(codeNameOption)} /></FormField></div>
      <div className="ui-form-row"><FormField label="专业代码"><input {...register('specialtyCode')} /></FormField>
        <FormField label="工作量（%）"><input type="number" min="0" max="100" step="0.01" {...register('workloadPercent')} /></FormField></div>
      <div className="ui-form-row"><FormField label="开始日期" required><input type="date" min={selectedEmployment?.hireDate} max={selectedEmployment?.leaveDate ?? undefined} {...register('validFrom')} /></FormField>
        <FormField label="结束日期" error={errors.validTo?.message}><input type="date" min={selectedEmployment?.hireDate} max={selectedEmployment?.leaveDate ?? undefined} {...register('validTo')} /></FormField></div>
      <label className="master-check"><input type="checkbox" {...register('primaryAssignment')} />设为主任职任职</label></form>
  </Dialog>
}

function flattenTree(units: OrganizationUnit[]) {
  const ids = new Set(units.map((item) => item.id))
  const result: Array<{ unit: OrganizationUnit; depth: number }> = []
  const visit = (parentId: string | undefined, depth: number) => units.filter((item) => (item.parentId ?? undefined) === parentId)
    .sort(compareOrganization).forEach((unit) => { result.push({ unit, depth }); visit(unit.id, depth + 1) })
  units.filter((item) => !item.parentId || !ids.has(item.parentId)).sort(compareOrganization)
    .forEach((unit) => { result.push({ unit, depth: 0 }); visit(unit.id, 1) })
  return result
}

function compareOrganization(left: OrganizationUnit, right: OrganizationUnit) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code)
}

function codeNameOption(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function belongsToOrganization(unit: OrganizationUnit, organizationId: string, units: OrganizationUnit[]) {
  const byId = new Map(units.map((item) => [item.id, item]))
  for (let current: OrganizationUnit | undefined = unit; current; current = current.parentId ? byId.get(current.parentId) : undefined) {
    if (current.id === organizationId || current.parentId === organizationId) return true
  }
  return false
}

function departmentTypeOptions(values: DictionaryValue[], structuralType: string) {
  const custom = (code: string) => code === 'CUSTOM_OTHER'
  if (structuralType === 'ADMINISTRATIVE_DEPARTMENT') return values.filter((item) => item.code.startsWith('ADM_') || custom(item.code))
  if (structuralType === 'MEDICAL_TECHNOLOGY_DEPARTMENT') return values.filter((item) => item.code.startsWith('MED_')
    || ['30', '31', '32'].some((prefix) => item.code === prefix || item.code.startsWith(`${prefix}.`)) || custom(item.code))
  if (structuralType === 'NURSING_UNIT') return values.filter((item) => item.code.startsWith('NUR_') || custom(item.code))
  return values.filter((item) => (!item.code.startsWith('ADM_') && !item.code.startsWith('MED_')
    && !item.code.startsWith('NUR_')) || custom(item.code))
}

function today() { return new Date().toISOString().slice(0, 10) }

function normalizeSearch(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
}

const CLINICAL_DEPARTMENT_TYPE_LABELS: Record<string, string> = {
  CLIN_GENERAL_SURGERY: '普通外科专业',
  CLIN_PEDIATRICS: '儿科',
  CLIN_TCM: '中医科',
  CLIN_OBSTETRICS_GYNECOLOGY: '妇产科',
  CLIN_INTERNAL_MEDICINE: '内科',
  CLIN_EMERGENCY: '急诊科',
  CLIN_GENERAL_PRACTICE: '全科医疗科',
  MED_PHARMACY: '药学部（药剂科）',
  MED_PHARMACY_WAREHOUSE: '药库',
  MED_PHARMACY_OUTPATIENT: '门诊药房',
  MED_PHARMACY_INPATIENT: '住院药房',
  MED_PHARMACY_EMERGENCY: '急诊药房',
  MED_PHARMACY_TCM: '中药房',
  MED_PHARMACY_PREPARATION: '制剂室',
  NUR_INPATIENT_WARD: '住院护理单元（病区）',
  ADM_OFFICE: '院务办公室',
  CUSTOM_OTHER: '其他科室',
}

export function resolveDepartmentTypeText(
  unit?: OrganizationUnit | null,
  departmentTypes?: DictionaryValue[],
): string {
  if (!unit) return ''
  if (unit.sdOrgKind !== 'ORG_UNIT') return unit.sdOrgTypeText || ''

  const isGeneralPractice = unit.code === 'GENERAL' || unit.code === 'GENERAL_PRACTICE' || unit.name.includes('全科')
  if (isGeneralPractice) return '全科医疗科'

  const typeCode = unit.sdDepartmentType || ''
  const typeText = unit.sdDepartmentTypeText || ''

  if (typeCode && CLINICAL_DEPARTMENT_TYPE_LABELS[typeCode]) {
    return CLINICAL_DEPARTMENT_TYPE_LABELS[typeCode]
  }
  if (typeText && CLINICAL_DEPARTMENT_TYPE_LABELS[typeText]) {
    return CLINICAL_DEPARTMENT_TYPE_LABELS[typeText]
  }

  if (typeCode && departmentTypes?.length) {
    const matched = departmentTypes.find((item) => item.code === typeCode)
    if (matched?.name) return matched.name
  }

  const isAsciiCode = /^[A-Z0-9_]+$/.test(typeText) || typeText === typeCode
  if (typeText && !isAsciiCode && !typeText.includes('自定义') && typeText !== '其他') {
    return typeText
  }

  if (unit.name.includes('外科')) return '普通外科专业'
  if (unit.name.includes('儿科')) return '儿科'
  if (unit.name.includes('中医')) return '中医科'
  if (unit.name.includes('妇产') || unit.name.includes('妇科')) return '妇产科'
  if (unit.name.includes('内科')) return '内科'
  if (unit.name.includes('全科')) return '全科医疗科'
  if (unit.name.includes('急诊')) return '急诊科'
  if (unit.name.includes('药库')) return '药库'
  if (unit.name.includes('药房') || unit.name.includes('药学') || unit.name.includes('药')) return '药学部（药剂科）'
  if (unit.name.includes('病区') || unit.name.includes('病房')) return '住院护理单元（病区）'
  if (unit.name.includes('办公室') || unit.name.includes('院办')) return '院务办公室'

  if (typeText && !isAsciiCode) return typeText
  return '综合科室'
}

function normalizeDepartmentTypeCode(code?: string | null, isEditingGeneral?: boolean): string {
  if (!code) return ''
  if (code === 'CUSTOM_OTHER' && isEditingGeneral) return '02'
  const CODE_TO_STANDARD: Record<string, string> = {
    CLIN_GENERAL_SURGERY: '04.01',
    CLIN_PEDIATRICS: '07',
    CLIN_TCM: '50',
    CLIN_OBSTETRICS_GYNECOLOGY: '05',
    CLIN_INTERNAL_MEDICINE: '03',
    CLIN_GENERAL_PRACTICE: '02',
  }
  return CODE_TO_STANDARD[code] || code
}
