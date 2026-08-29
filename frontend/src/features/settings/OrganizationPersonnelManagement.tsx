import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  ORGANIZATION_DICTIONARY, ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type AssignmentInput, type AssignmentType, type EmploymentInput, type EmploymentType,
  type DictionaryValue, type OrganizationKind, type OrganizationProfile,
  type OrganizationProfileInput, type OrganizationProfileResult, type OrganizationProfileSection,
  type OrganizationType, type OrganizationUnit, type OrganizationUnitInput, type PersonnelStatus,
  type PositionType, type Practitioner, type PractitionerGender, type RhnApi, type SystemEnumDefinition,
} from '../../shared/rhnApi'
import {
  Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead,
  FormSelect, StatusBadge,
} from '../../shared/ui'
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
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const treeItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const practitionerItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const units = useQuery({ queryKey: ['organization-units'], queryFn: api.organization.tree })
  const selectedTreeUnit = units.data?.find((item) => item.id === selectedUnitId)
  const practitioners = useQuery({ queryKey: ['practitioners'], queryFn: api.organization.practitioners })
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
    mutationFn: (input: { code: string; fullName: string; sdPractGender: PractitionerGender }) =>
      practitionerDialog ? api.organization.updatePractitioner(practitionerDialog.id, {
        expectedRevision: practitionerDialog.revision, fullName: input.fullName, sdPractGender: input.sdPractGender,
      }) : api.organization.createPractitioner(input),
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
  const treeRows = useMemo(() => flattenTree(units.data ?? []).filter((row) => {
    const search = normalizeSearch(query)
    const searchable = normalizeSearch(`${row.unit.name}${row.unit.code}${pinyinInitials(row.unit.name)}`)
    return !search || searchable.includes(search)
  }), [query, units.data])
  const filteredPractitioners = useMemo(() => (practitioners.data ?? []).filter((value) => {
    const search = normalizeSearch(practitionerQuery)
    const searchable = normalizeSearch(`${value.fullName}${value.code}${pinyinInitials(value.fullName)}`)
    return !search || searchable.includes(search)
  }), [practitionerQuery, practitioners.data])
  const treeRovingId = treeRows.some(({ unit }) => unit.id === selectedUnitId)
    ? selectedUnitId : treeRows[0]?.unit.id
  const practitionerRovingId = filteredPractitioners.some((value) => value.id === selectedPractitionerId)
    ? selectedPractitionerId : filteredPractitioners[0]?.id
  const queryError = units.error || practitioners.error || positions.error || systemEnums.error
    || organizationDictionaryQueries.find((item) => item.error)?.error || organizationProfile.error || practitionerDetail.error
  const busy = createUnit.isPending || updateUnit.isPending || unitStatus.isPending || savePractitioner.isPending
    || practitionerStatus.isPending || savePosition.isPending || saveEmployment.isPending || saveAssignment.isPending
    || addProfileItem.isPending

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? 1
      : event.key === 'ArrowLeft' ? (index + 1) % 2 : (index + 1) % 2
    const nextTab: WorkspaceTab = nextIndex === 0 ? 'organization' : 'personnel'
    tabRefs.current[nextIndex]?.focus()
    setTab(nextTab)
  }

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
    <PageHeader eyebrow="平台管理 · 主数据" title="组织与人员"
      description="分别维护机构与科室主数据，通过组合树统一浏览，以聘用、岗位和任职形成工作上下文。"
      actions={<Button onClick={() => tab === 'organization'
        ? setUnitDialog({ mode: 'create' }) : setPractitionerDialog(null)}>
        <Icon name="add" />{tab === 'organization' ? '新建组织' : '新增人员'}</Button>} />

    <div className="master-tabs" role="tablist" aria-label="组织与人员管理范围">
      <button id="organization-tab" role="tab" aria-controls="organization-panel" aria-selected={tab === 'organization'}
        tabIndex={tab === 'organization' ? 0 : -1} ref={(node) => { tabRefs.current[0] = node }}
        className={tab === 'organization' ? 'is-active' : ''} onKeyDown={(event) => handleTabKeyDown(event, 0)}
        onClick={() => setTab('organization')}>组织架构</button>
      <button id="personnel-tab" role="tab" aria-controls="personnel-panel" aria-selected={tab === 'personnel'}
        tabIndex={tab === 'personnel' ? 0 : -1} ref={(node) => { tabRefs.current[1] = node }}
        className={tab === 'personnel' ? 'is-active' : ''} onKeyDown={(event) => handleTabKeyDown(event, 1)}
        onClick={() => setTab('personnel')}>人员任职</button>
    </div>

    {feedback && <Alert tone="success">{feedback}</Alert>}
    {(operationError || queryError) && <Alert>{operationError || errorMessage(queryError)}</Alert>}

    {tab === 'organization' ? <section id="organization-panel" role="tabpanel" aria-labelledby="organization-tab"
      className="master-workspace">
      <Panel className="master-catalog">
        <PanelHead title="组织树" meta={`${units.data?.length ?? 0} 个节点`} />
        <label className="master-search"><Icon name="search" /><span className="visually-hidden">搜索组织</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或代码" /></label>
        <div className="master-tree" role="tree">
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
          {!units.isPending && !treeRows.length && <EmptyState icon="settings" title="暂无组织节点"
            copy="先创建法定机构，再在其下维护院区或科室。" />}
        </div>
      </Panel>
      <Panel className="master-detail">
        {!selectedUnit ? <EmptyState icon="settings" title="选择组织节点" copy="查看节点属性并维护下级组织。" /> : <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">{selectedUnit.sdOrgKindText}</span>
            <h2>{selectedUnit.name}</h2><code>{selectedUnit.code}</code></div><div>
            <Button variant="secondary" onClick={() => setUnitDialog({ mode: 'create', parentId: selectedUnit.id })}>
              新增下级</Button>
            <Button variant="secondary" onClick={() => setUnitDialog({ mode: 'edit', unit: selectedUnit })}>编辑</Button>
            <Button variant={selectedUnit.sdOrgStatus === 'ACTIVE' ? 'danger' : 'secondary'} busy={unitStatus.isPending}
              onClick={() => setStatusConfirmation({ kind: 'unit', value: selectedUnit })}>
              {selectedUnit.sdOrgStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
          <dl className="master-facts">
            <div><dt>组织结构类型</dt><dd>{selectedUnit.sdOrgTypeText}</dd></div>
            <div><dt>科室类型</dt><dd>{selectedUnit.sdDepartmentTypeText || '—'}</dd></div>
            <div><dt>简称</dt><dd>{selectedUnit.shortName || '—'}</dd></div>
            <div><dt>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '业务属性' : '机构性质'}</dt><dd>{selectedUnit.sdOrgKind === 'ORG_UNIT'
              ? selectedUnit.sdDepartmentPropertyText || '—' : selectedUnit.sdOrgPropertyText || '—'}</dd></div>
            <div><dt>当前状态</dt><dd>{selectedUnit.sdOrgStatusText}</dd></div>
            <div><dt>有效期</dt><dd>{selectedUnit.validFrom} 至 {selectedUnit.validTo || '长期'}</dd></div>
            <div><dt>排序 / 虚拟</dt><dd>{selectedUnit.sortOrder} / {selectedUnit.virtual ? '是' : '否'}</dd></div>
            <div><dt>时区</dt><dd>{selectedUnit.timezoneCode || '继承系统时区'}</dd></div>
          </dl>
          {selectedUnit.description && <section className="master-note"><strong>组织说明</strong><p>{selectedUnit.description}</p></section>}
          <div className="master-section-head"><div><h3>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室档案与治理' : '机构档案与治理'}</h3>
            <span>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '联系方式、科室关系、服务能力和负责人分项维护'
              : '多标识、联系方式、地址、机构关系、服务能力和负责人分项维护'}</span></div></div>
          {organizationProfile.isPending ? <LoadingState label="正在加载组织档案…" />
            : <OrganizationProfileCards unit={selectedUnit} profile={organizationProfile.data} onAdd={setProfileDialog} />}
        </>}
      </Panel>
    </section> : !practitioners.isPending && !practitioners.data?.length ?
      <Panel id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-empty-onboarding">
        <EmptyState icon="residents" title="暂无人员" copy="先新增人员，再建立聘用关系和科室任职。" />
        <Button onClick={() => setPractitionerDialog(null)}><Icon name="add" />新增人员</Button>
      </Panel>
      : <section id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-workspace">
      <Panel className="master-catalog">
        <PanelHead title="人员目录" meta={practitionerQuery
          ? `${filteredPractitioners.length} / ${practitioners.data?.length ?? 0} 人`
          : `${practitioners.data?.length ?? 0} 人`} />
        <label className="master-search"><Icon name="search" /><span className="visually-hidden">搜索人员</span>
          <input value={practitionerQuery} onChange={(event) => setPractitionerQuery(event.target.value)}
            placeholder="搜索姓名、代码或拼音首字母" /></label>
        <div className="master-person-list" role="listbox">
          {practitioners.isPending && <LoadingState label="正在加载人员…" />}
          {filteredPractitioners.map((value, index) => <button role="option" aria-selected={value.id === selectedPractitionerId}
            tabIndex={value.id === practitionerRovingId ? 0 : -1}
            ref={(node) => { practitionerItemRefs.current[index] = node }}
            key={value.id} className={value.id === selectedPractitionerId ? 'is-selected' : ''}
            onKeyDown={(event) => handleCollectionKeyDown(event, index, filteredPractitioners.length,
              (nextIndex) => setSelectedPractitionerId(filteredPractitioners[nextIndex].id), practitionerItemRefs.current)}
            onClick={() => setSelectedPractitionerId(value.id)}><span className="master-person-avatar">{value.fullName.slice(0, 1)}</span>
            <span><strong>{value.fullName}</strong><code>{value.code} · {value.sdPractGenderText}</code></span>
            <StatusBadge tone={value.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {value.sdPersonnelStatusText}</StatusBadge></button>)}
          {!practitioners.isPending && practitioners.data?.length && !filteredPractitioners.length
            ? <EmptyState icon="search" title="未找到匹配人员" copy="请尝试姓名、代码或拼音首字母。" /> : null}
        </div>
      </Panel>
      <Panel className="master-detail">
        {!selectedPractitioner ? <EmptyState icon="residents" title="选择人员" copy="查看聘用关系和当前任职。" /> : <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">从业人员</span>
            <h2>{selectedPractitioner.fullName}</h2><code>{selectedPractitioner.code}</code></div><div>
            <Button variant="secondary" onClick={() => setPractitionerDialog(selectedPractitioner)}>编辑人员</Button>
            <Button variant={selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? 'danger' : 'secondary'}
              busy={practitionerStatus.isPending}
              onClick={() => setStatusConfirmation({ kind: 'practitioner', value: selectedPractitioner })}>
              {selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
          <dl className="master-facts"><div><dt>性别</dt><dd>{selectedPractitioner.sdPractGenderText}</dd></div>
            <div><dt>状态</dt><dd>{selectedPractitioner.sdPersonnelStatusText}</dd></div>
            <div><dt>聘用关系</dt><dd>{practitionerDetail.data?.employments.length ?? 0} 条</dd></div>
            <div><dt>任职</dt><dd>{practitionerDetail.data?.assignments.length ?? 0} 条</dd></div></dl>
          <div className="master-section-head"><div><h3>聘用关系</h3><span>人员与法定机构之间的劳动关系</span></div>
            <Button size="sm" variant="secondary" onClick={() => setEmploymentDialog(true)}>新增聘用</Button></div>
          <div className="master-table-wrap"><table className="master-table"><thead><tr><th>机构</th><th>类型</th><th>有效期</th><th>主任职</th></tr></thead>
            <tbody>{practitionerDetail.data?.employments.map((value) => <tr key={value.id}><td><strong>{value.organizationName}</strong><code>{value.code}</code></td>
              <td>{value.sdEmploymentTypeText}</td><td>{value.hireDate} 至 {value.leaveDate || '长期'}</td><td>{value.primaryEmployment ? '是' : '否'}</td></tr>)}</tbody></table>
            {!practitionerDetail.data?.employments.length && <p className="master-table-empty">尚未建立聘用关系</p>}</div>
          <div className="master-section-head"><div><h3>科室任职</h3><span>选择聘用、科室和标准岗位形成工作上下文</span></div><div>
            <Button size="sm" variant="secondary" onClick={() => setPositionDialog(true)}>维护岗位</Button>
            <Button size="sm" disabled={!practitionerDetail.data?.employments.length || !positions.data?.length}
              onClick={() => setAssignmentDialog(true)}>新增任职</Button></div></div>
          <div className="master-table-wrap"><table className="master-table"><thead><tr><th>科室 / 岗位</th><th>任职类型</th><th>工作量</th><th>有效期</th></tr></thead>
            <tbody>{practitionerDetail.data?.assignments.map((value) => <tr key={value.id}><td><strong>{value.departmentName} · {value.positionName}</strong>
              <code>{value.organizationName} · {value.sdPositionTypeText} · {value.code}</code></td>
              <td>{value.sdAssignmentTypeText}</td><td>{value.workloadPercent == null ? '—' : `${value.workloadPercent}%`}</td>
              <td>{value.validFrom} 至 {value.validTo || '长期'}</td></tr>)}</tbody></table>
            {!practitionerDetail.data?.assignments.length && <p className="master-table-empty">尚未建立科室任职</p>}</div>
        </>}
      </Panel>
    </section>}

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
  const parent = state.mode === 'create' ? units.find((item) => item.id === state.parentId) : undefined
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema), defaultValues: {
      code: editing?.code ?? '', name: editing?.name ?? '', shortName: editing?.shortName ?? '',
      description: editing?.description ?? '',
      sdOrgKind: editing?.sdOrgKind ?? (parent ? 'ORG_UNIT' : 'LEGAL_ORGANIZATION'),
      sdOrgType: editing?.sdOrgType ?? (parent ? 'CLINICAL_DEPARTMENT' : 'TOWNSHIP_HEALTH_CENTER'),
      sdOrgProperty: editing?.sdOrgProperty ?? '', virtual: editing?.virtual ?? false,
      sdDepartmentProperty: editing?.sdDepartmentProperty ?? (parent ? 'CLINICAL' : ''),
      sortOrder: editing?.sortOrder ?? 0, timezoneCode: editing?.timezoneCode ?? 'Asia/Shanghai',
      sdDepartmentType: editing?.sdDepartmentType ?? (parent ? '02' : ''),
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
    if (!availableDepartmentTypes.some((item) => item.code === selectedDepartmentType)) {
      setValue('sdDepartmentType', availableDepartmentTypes[0]?.code ?? '')
    }
  }, [availableDepartmentTypeCodes, kind, selectedDepartmentType, setValue, structuralType])
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
  return <Dialog eyebrow="组织主数据" title={editing ? '编辑组织节点' : '新建组织节点'} onClose={onClose} size="wide"
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

function OrganizationProfileCards({ unit, profile, onAdd }: {
  unit: OrganizationUnit; profile?: OrganizationProfileResult; onAdd: (section: OrganizationProfileSection) => void
}) {
  if (!profile) return <div className="master-empty-inline">
    <EmptyState icon="settings" title="暂无组织档案" copy="可以继续维护机构标识、联系方式、地址和治理信息。" />
    <Button size="sm" onClick={() => onAdd(unit.sdOrgKind === 'ORG_UNIT' ? 'contact' : 'identifier')}>新增档案信息</Button>
  </div>
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const organizationProfile = department ? undefined : profile as OrganizationProfile
  const contacts = profile.contacts
  const relations = profile.relations
  const capabilities = profile.capabilities
  const responsibilities = profile.responsibilities
  return <div className="master-profile-grid">
    {!department && <article className="master-profile-card"><header><h4>机构标识</h4><Button size="sm" variant="secondary" onClick={() => onAdd('identifier')}>新增</Button></header>
      {organizationProfile!.identifiers.map((item) => <p key={item.id}><strong>{item.sdIdentifierTypeText}</strong><span>{item.identifierCode}</span></p>)}
      {!organizationProfile!.identifiers.length && <em>暂无机构代码或许可证标识</em>}</article>}
    <article className="master-profile-card"><header><h4>联系方式</h4><Button size="sm" variant="secondary" onClick={() => onAdd('contact')}>新增</Button></header>
      {contacts.map((item) => <p key={item.id}><strong>{item.sdContactTypeText}</strong><span>{item.contactValue}</span></p>)}
      {!contacts.length && <em>暂无联系方式</em>}</article>
    {!department && <article className="master-profile-card"><header><h4>地址</h4><Button size="sm" variant="secondary" onClick={() => onAdd('address')}>新增</Button></header>
      {organizationProfile!.addresses.map((item) => <p key={item.id}><strong>{item.sdAddressTypeText}</strong><span>{item.streetAddress}</span></p>)}
      {!organizationProfile!.addresses.length && <em>暂无执业或服务地址</em>}</article>}
    <article className="master-profile-card"><header><h4>{department ? '科室关系' : '机构关系'}</h4><Button size="sm" variant="secondary" onClick={() => onAdd('relation')}>新增</Button></header>
      {relations.map((item) => <p key={item.id}><strong>{item.sdRelationTypeText}</strong><span>{'targetDepartmentName' in item
        ? item.targetDepartmentName : item.targetOrganizationName}</span></p>)}
      {!relations.length && <em>暂无协作、管理或转诊关系</em>}</article>
    <article className="master-profile-card"><header><h4>服务能力</h4><Button size="sm" variant="secondary" onClick={() => onAdd('capability')}>新增</Button></header>
      {capabilities.map((item) => <p key={item.id}><strong>{item.sdCapabilityTypeText}</strong><span>{item.sdVerifyStatusText}</span></p>)}
      {!capabilities.length && <em>暂无服务能力记录</em>}</article>
    <article className="master-profile-card"><header><h4>负责人</h4><Button size="sm" variant="secondary" onClick={() => onAdd('responsibility')}>新增</Button></header>
      {responsibilities.map((item) => <p key={item.id}><strong>{item.sdResponsibilityTypeText}</strong><span>{item.responsibleName}</span></p>)}
      {!responsibilities.length && <em>暂无负责人记录</em>}</article>
  </div>
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

const practitionerSchema = z.object({ code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效人员代码'),
  fullName: z.string().trim().min(1, '请输入人员姓名').max(100), sdPractGender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']) })
type PractitionerForm = z.infer<typeof practitionerSchema>

function PractitionerDialog({ value, enums, busy, onClose, onSave }: { value?: Practitioner; enums?: SystemEnumDefinition[]; busy: boolean; onClose: () => void; onSave: (input: PractitionerForm) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<PractitionerForm>({ resolver: zodResolver(practitionerSchema),
    defaultValues: { code: value?.code ?? '', fullName: value?.fullName ?? '', sdPractGender: value?.sdPractGender ?? 'UNKNOWN' } })
  return <Dialog eyebrow="人员主数据" title={value ? '编辑人员' : '新增人员'} onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" form="practitioner-form" busy={busy}>保存人员</Button></>}>
    <form id="practitioner-form" className="master-form" onSubmit={handleSubmit(onSave)}><div className="ui-form-row">
      <FormField label="人员代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} readOnly={Boolean(value)} autoFocus /></FormField>
      <FormField label="姓名" required error={errors.fullName?.message}><input {...register('fullName')} /></FormField></div>
      <FormField label="性别" required error={errors.sdPractGender?.message}><FormSelect control={control} name="sdPractGender"
        showValue clearable={false} options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.gender).map(codeNameOption)} /></FormField></form>
  </Dialog>
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
