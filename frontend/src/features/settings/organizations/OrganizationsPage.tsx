import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ORGANIZATION_DICTIONARY, errorMessage, type OrganizationProfileResult, type OrganizationProfileSection,
  type OrganizationUnit, type RhnApi } from '../../../shared/rhnApi'
import { ActionMenu, Alert, Button, Dialog, EmptyState, LoadingState, StatusBadge, Switch, TreePanel } from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { pinyinInitials } from '../../../shared/ui/pinyinInitials'
import { OrganizationChangeHistory } from '../OrganizationChangeHistory'
import { requireUnitOptions } from '../organizationFormOptions'
import { requirePersonnelAssignments } from '../organizationPersonnelFacts'
import { requireOrganizationProfile } from '../organizationProfileFacts'
import { requireMaintainedProfile } from '../organizationProfileReceipt'
import { departmentOwner, requireCreatedUnit, requireUnitStatus, requireUpdatedUnit, unitUpdateCommand } from '../organizationUnitReceipt'
import { currentRecord, unitDetails, unitFormDefaults, unitFromProfile, type UnitForm } from './organizationUnitModel'
import { ProfileSectionDialog, type ProfileChange } from './ProfileSectionDialog'
import { UnitDetail, type StaffSummary } from './UnitDetail'
import { UnitFormDialog, type UnitFormTarget } from './UnitFormDialog'
import { UnitStatusDialog } from './UnitStatusDialog'
import { useOrganizationOptions } from './useOrganizationOptions'
import '../../../styles/features/organizations.css'

type DialogState = { kind: 'form'; target: UnitFormTarget } | { kind: 'section'; section: OrganizationProfileSection }
  | { kind: 'status' } | { kind: 'history' }
type ActionContext = { api: RhnApi; unitId?: string }

/** 机构与科室：左侧组织树，右侧只读详情；所有维护在弹窗内完成。 */
export function OrganizationsPage({ api, canManage = false }: { api: RhnApi; canManage?: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const options = useOrganizationOptions(api)
  const { scope, units, unitsReady, dictionaries, enums } = options
  const [selectedId, setSelectedId] = useState<string>()
  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<DialogState>()
  const [feedback, setFeedback] = useState('')
  const current = useRef<ActionContext>({ api, unitId: selectedId })
  current.current = { api, unitId: selectedId }
  useEffect(() => { setSelectedId(undefined); setDialog(undefined) }, [api])

  const allUnits = useMemo(() => units.data ?? [], [units.data])
  const selected = unitsReady ? allUnits.find(item => item.id === selectedId) : undefined
  useEffect(() => {
    if (allUnits.length && (!selectedId || !allUnits.some(item => item.id === selectedId))) setSelectedId(allUnits[0].id)
  }, [allUnits, selectedId])
  const visibleUnits = showInactive ? allUnits : allUnits.filter(item => item.sdOrgStatus === 'ACTIVE' || item.id === selectedId)

  const profile = useQuery({
    queryKey: ['organization-profile', selected?.sdOrgKind, selected?.id, scope, selected?.revision],
    queryFn: async () => requireOrganizationProfile(await api.organization.profile(selected!), selected!), enabled: Boolean(selected),
  })
  const department = selected?.sdOrgKind === 'ORG_UNIT'
  const assignments = useQuery({
    queryKey: ['assignments', scope, selected?.sdOrgKind, selected?.id],
    queryFn: async () => requirePersonnelAssignments(await api.organization.assignments(department ? { departmentId: selected!.id } : { organizationId: selected!.id })),
    enabled: Boolean(selected),
  })
  const staff: StaffSummary | 'error' | undefined = assignments.isError ? 'error' : assignments.data && (() => {
    const held = assignments.data.filter(item => currentRecord({ sdDetailStatus: item.sdPersonnelStatus, validFrom: item.validFrom, validTo: item.validTo }))
    return { current: new Set(held.map(item => item.practitionerId)).size, primary: held.filter(item => item.primaryAssignment).length }
  })()
  const editing = selected && profile.data ? unitFromProfile(selected, profile.data) : undefined

  const begin = (): ActionContext => { setFeedback(''); return { api, unitId: selectedId } }
  const stillCurrent = (context?: ActionContext) => context?.api === current.current.api && context.unitId === current.current.unitId
  async function refreshed(message: string) {
    setDialog(undefined)
    setFeedback(message)
    await Promise.all(['organization-units', 'organization-profile', 'organization-changes', 'department-business-configuration', 'assignments']
      .map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  }
  /** 维护接口一次提交主体字段与档案变更；只改档案时主体字段沿用已加载的原值。 */
  async function maintain(unit: OrganizationUnit, before: OrganizationProfileResult, value: UnitForm, changes: ProfileChange[]) {
    if (!unitsReady) throw new Error('组织目录尚未确认，请重新加载')
    const details = unitDetails(value)
    requireUnitOptions({ ...details, code: unit.code, sdOrgKind: unit.sdOrgKind }, enums, dictionaries)
    const { expectedRevision, ...command } = unitUpdateCommand(unit, details, allUnits)
    const result = await api.organization.maintainUnit(unit, { expectedRevision, details: command, reason: '组织资料维护',
      changes: changes.map(row => { const { section, ...values } = row.input
        return { section, id: row.id, values: { ...values, expectedRevision, reason: '组织资料维护', sdDetailStatus: row.status } } }) })
    const next = requireMaintainedProfile(result, unit, before, changes)
    return requireUpdatedUnit(unitFromProfile(unit, next), unit, details, allUnits)
  }

  const createUnit = useMutation({
    mutationFn: async (value: UnitForm) => {
      if (!unitsReady) throw new Error('组织目录尚未确认，请重新加载')
      const input = { code: value.code, sdOrgKind: value.sdOrgKind, ...unitDetails(value) }
      requireUnitOptions(input, enums, dictionaries)
      const owner = departmentOwner(input.parentId, allUnits)
      if (allUnits.some(item => item.code === input.code.trim().toUpperCase() && item.sdOrgKind === input.sdOrgKind
        && (input.sdOrgKind === 'LEGAL_ORGANIZATION' || departmentOwner(item.id, allUnits) === owner))) {
        throw new Error('目录中已有相同代码的组织，请核实后再保存')
      }
      return requireCreatedUnit(await api.organization.createUnit(input), input, allUnits)
    },
    onMutate: begin,
    onSuccess: async (next, _value, context) => {
      if (context?.api !== current.current.api) return
      setSelectedId(next.id)
      await refreshed(`已创建“${next.name}”`)
    },
  })
  const updateUnit = useMutation({
    mutationFn: async (value: UnitForm) => maintain(editing!, profile.data!, value, []),
    onMutate: begin,
    onSuccess: async (next, _value, context) => { if (stillCurrent(context)) await refreshed(`已保存“${next.name}”`) },
  })
  const saveSection = useMutation({
    mutationFn: async (changes: ProfileChange[]) => maintain(editing!, profile.data!, unitFormDefaults(editing, undefined), changes),
    onMutate: begin,
    onSuccess: async (next, _changes, context) => { if (stillCurrent(context)) await refreshed(`已保存“${next.name}”的资质与联系`) },
  })
  const changeStatus = useMutation({
    mutationFn: async (unit: OrganizationUnit) => {
      const target = unit.sdOrgStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      return requireUnitStatus(await api.organization.changeUnitStatus(unit.id, unit.revision, target), unit, target)
    },
    onMutate: begin,
    onSuccess: async (next, _unit, context) => { if (stillCurrent(context)) await refreshed(`“${next.name}”已${next.sdOrgStatus === 'ACTIVE' ? '启用' : '停用'}`) },
  })
  const busy = createUnit.isPending || updateUnit.isPending || saveSection.isPending || changeStatus.isPending
  const failure = (mutation: { error: unknown }) => mutation.error ? `保存未完成：${errorMessage(mutation.error)}` : undefined
  const open = (next: DialogState) => { createUnit.reset(); updateUnit.reset(); saveSection.reset(); changeStatus.reset(); setFeedback(''); setDialog(next) }
  const ready = Boolean(selected && profile.isSuccess && !profile.isFetching)

  return <MasterDetailPage title="机构与科室" description="维护机构、科室层级与运行属性；人员在「人员管理」中维护。"
    feedback={feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}
    navigationLabel="组织目录"
    navigationHeader={<div className="organization-tree-toolbar">
      {canManage && <Button size="sm" disabled={busy || !unitsReady} onClick={() => open({ kind: 'form', target: { mode: 'create' } })}>新建机构</Button>}
      <Switch size="sm" checked={showInactive} onChange={setShowInactive} label="显示停用" />
    </div>}
    navigation={!unitsReady ? (units.isError
      ? <Alert placement="inline">组织目录加载失败<Button size="sm" variant="secondary" onClick={() => void units.refetch()}>重新加载</Button></Alert>
      : <LoadingState label="正在加载组织目录…" />)
      : <TreePanel title="组织" rootLabel="全部组织" searchLabel="搜索组织" searchPlaceholder="搜索名称、代码或拼音首字母"
        nodes={visibleUnits.map(unit => ({ id: unit.id, parentId: unit.parentId ?? undefined, label: unit.name, secondaryText: unit.code,
          inactive: unit.sdOrgStatus !== 'ACTIVE', keywords: [unit.code, pinyinInitials(unit.name)] }))}
        selectedId={selectedId} onSelect={id => { if (id) setSelectedId(id) }} />}
    detailLabel="组织详情" detailResetScrollKey={selectedId}
    detailHeader={selected && <header className="organization-detail-head">
      <div className="organization-detail-head__title"><span className="ui-eyebrow">{selected.sdOrgKindText}</span>
        <h2>{selected.name}</h2><code>{selected.code}</code>
        <StatusBadge tone={selected.sdOrgStatus === 'ACTIVE' ? 'success' : 'neutral'}>{selected.sdOrgStatusText}</StatusBadge></div>
      {canManage && <div className="organization-detail-head__actions">
        <Button size="sm" variant="secondary" disabled={busy || !ready} onClick={() => open({ kind: 'form', target: { mode: 'edit', unit: editing! } })}>编辑</Button>
        <Button size="sm" variant="secondary" disabled={busy || selected.sdOrgStatus !== 'ACTIVE'}
          onClick={() => open({ kind: 'form', target: { mode: 'create', parent: selected } })}>新增下级科室</Button>
        <ActionMenu disabled={busy} items={[
          { key: 'status', label: selected.sdOrgStatus === 'ACTIVE' ? '停用' : '启用', danger: selected.sdOrgStatus === 'ACTIVE', onSelect: () => open({ kind: 'status' }) },
          { key: 'history', label: '变更记录', onSelect: () => open({ kind: 'history' }) },
        ]} />
      </div>}
    </header>}>
    {!unitsReady ? <LoadingState label="正在加载…" />
      : !selected ? <EmptyState icon="settings" title="选择组织" copy="在左侧选择机构或科室查看详情。" />
      : profile.isError ? <Alert placement="inline">组织资料加载失败<Button size="sm" variant="secondary" onClick={() => void profile.refetch()}>重新加载</Button></Alert>
      : !profile.data ? <LoadingState label="正在加载组织资料…" />
      : <UnitDetail api={api} unit={selected} units={allUnits} profile={profile.data} canManage={canManage} busy={busy || !ready} staff={staff}
        departmentTypes={dictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []}
        onEditSection={section => open({ kind: 'section', section })}
        onViewStaff={() => navigate(`/settings/personnel?${department ? 'departmentId' : 'organizationId'}=${encodeURIComponent(selected.id)}`)} />}
    {dialog?.kind === 'form' && <UnitFormDialog key={dialog.target.mode} target={dialog.target} units={allUnits} enums={enums} dictionaries={dictionaries}
      busy={busy} error={failure(dialog.target.mode === 'create' ? createUnit : updateUnit)} onReload={options.reload} onClose={() => setDialog(undefined)}
      onSubmit={value => dialog.target.mode === 'create' ? createUnit.mutate(value) : updateUnit.mutate(value)} />}
    {dialog?.kind === 'section' && editing && profile.data && <ProfileSectionDialog section={dialog.section} unit={editing} profile={profile.data}
      assignments={assignments.data ?? []} dictionaries={dictionaries} addressApi={api.gridAddresses} busy={busy} error={failure(saveSection)}
      onReload={options.reload} onClose={() => setDialog(undefined)} onSubmit={changes => saveSection.mutate(changes)} />}
    {dialog?.kind === 'status' && selected && <UnitStatusDialog api={api} unit={selected} busy={busy} error={failure(changeStatus)}
      onClose={() => setDialog(undefined)} onConfirm={() => changeStatus.mutate(selected)} />}
    {dialog?.kind === 'history' && selected && <Dialog title={`${selected.name}的变更记录`} size="xwide" onClose={() => setDialog(undefined)}
      footer={<Button onClick={() => setDialog(undefined)}>关闭</Button>}>
      <OrganizationChangeHistory api={api} type={department ? 'department' : 'organization'} id={selected.id} />
    </Dialog>}
  </MasterDetailPage>
}
