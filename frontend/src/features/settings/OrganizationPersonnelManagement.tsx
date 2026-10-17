import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  ORGANIZATION_DICTIONARY, ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type AssignmentInput, type AssignmentType, type Employment, type EmploymentInput, type EmploymentType,
  type DictionaryValue,
  type OrganizationProfileResult,
  type OrganizationType, type OrganizationUnit, type OrganizationUnitInput,
  type PersonnelAssignment, type Position, type PositionType, type Practitioner, type PractitionerDetail, type RhnApi, type SystemEnumDefinition,
} from '../../shared/rhnApi'
import {
  ActionMenu, Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, type IconName, LoadingState, PageHeader, Panel, PanelHead,
  FormSelect, Pagination, SearchField, Select, type SelectOption, SplitWorkspace, StatusBadge, Tabs, TreePanel,
} from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { pinyinInitials } from '../../shared/ui/pinyinInitials'
import { departmentOwner, departmentStructure, requireCreatedUnit, requireUpdatedUnit, requireUnitStatus, unitUpdateCommand } from './organizationUnitReceipt'
import { enumAvailable, requireEnumChoice, requireOrganizationEnums, requireUnitOptions, unitOptionsAvailable } from './organizationFormOptions'
import { requireOnboardedPractitioner } from './practitionerOnboarding'
import { requireOrganizationDictionary } from './organizationDictionaryFacts'
import { requireOrganizationProfile } from './organizationProfileFacts'
import { requireMaintainedProfile } from './organizationProfileReceipt'
import { requireCreatedAssignment, requireCreatedEmployment, requireCreatedPosition, requirePractitionerStatus, requireUpdatedPractitioner, type PositionInput } from './personnelMutationReceipt'
import { onlyPrimary, requireOrganizationUnits, requirePersonnelAssignments, requirePositions, requirePractitionerDetail, requirePractitioners } from './organizationPersonnelFacts'

import { organizationQueryScope } from './organizationQueryScope'
import { PersonnelLifecycleDialog, type PersonnelMaintenanceAction } from './PersonnelLifecycleDialog'
import { OrganizationProfileEditor, type ProfileEditorHandle, type ProfileChangeDraft } from './OrganizationProfileEditor'
import { OrganizationChangeHistory } from './OrganizationChangeHistory'
import { DepartmentBusinessConfigurationPanel } from './DepartmentBusinessConfigurationPanel'

type WorkspaceTab = 'organization' | 'personnel'
type UnitDialogState = { mode: 'create'; parentId?: string } | { mode: 'edit'; unit: OrganizationUnit }
type StatusConfirmation = { kind: 'unit'; value: OrganizationUnit } | { kind: 'practitioner'; value: Practitioner }

export function OrganizationPersonnelManagement({ api, canManage = false }: { api: RhnApi; canManage?: boolean }) {
  const scope = organizationQueryScope(api)
  const queryClient = useQueryClient()
  const [organizationSection, setOrganizationSection] = useState('staff')
  const [personnelSection, setPersonnelSection] = useState('relationships')
  const [maintenanceAction, setMaintenanceAction] = useState<PersonnelMaintenanceAction>()
  const [maintenanceVersion, setMaintenanceVersion] = useState(0)
  const [includeHistory, setIncludeHistory] = useState(false)
  const [includeInactiveUnits, setIncludeInactiveUnits] = useState(false)
  const [tab, setTab] = useState<WorkspaceTab>('organization')
  const [selectedUnitId, setSelectedUnitId] = useState<string>()
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>()
  const [unitDialog, setUnitDialog] = useState<UnitDialogState>()
  const [practitionerDialog, setPractitionerDialog] = useState<Practitioner | null | undefined>()
  const [positionDialog, setPositionDialog] = useState(false)
  const [employmentDialog, setEmploymentDialog] = useState<Practitioner>()
  const [assignmentDialog, setAssignmentDialog] = useState<PractitionerDetail>()
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [filterUnitId, setFilterUnitId] = useState('')
  const [personnelPage, setPersonnelPage] = useState(0)
  const [personnelPageSize, setPersonnelPageSize] = useState(20)
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>()
  const impactUnit = statusConfirmation?.kind === 'unit' && statusConfirmation.value.sdOrgStatus === 'ACTIVE' ? statusConfirmation.value : undefined
  const impact = useQuery({ queryKey: ['organization-impact', scope, impactUnit?.id], enabled: Boolean(impactUnit) && canManage, queryFn: async () => z.object({ activeChildren: z.number().int().nonnegative(), continuingAssignments: z.number().int().nonnegative(), continuingEmployments: z.number().int().nonnegative() }).parse(await api.organization.deactivationImpact(impactUnit!)) })
  const impactBlocked = Boolean(impactUnit && (!impact.isSuccess || impact.isFetching || impact.data.activeChildren > 0 || impact.data.continuingAssignments > 0 || impact.data.continuingEmployments > 0))
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const unitSession = useRef(0)
  const currentUnitId = useRef(selectedUnitId)
  currentUnitId.current = selectedUnitId
  const practitionerSession = useRef(0)
  const personnelActionSession = useRef(0)
  const currentPersonId = useRef(selectedPractitionerId)
  currentPersonId.current = selectedPractitionerId
  const currentApi = useRef(api)
  currentApi.current = api
  useEffect(() => {
    unitSession.current += 1; practitionerSession.current += 1; personnelActionSession.current += 1; setPractitionerDialog(undefined)
    setEmploymentDialog(undefined); setAssignmentDialog(undefined); setUnitDialog(undefined); setStatusConfirmation(undefined)
    setPositionDialog(false); setMaintenanceAction(undefined)
    setSelectedUnitId(undefined); setSelectedPractitionerId(undefined); setFilterUnitId('')
  }, [api])
  useEffect(() => { setMaintenanceAction(undefined) }, [selectedPractitionerId])
  const practitionerItemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const units = useQuery({ queryKey: ['organization-units', scope], queryFn: async () => requireOrganizationUnits(await api.organization.tree()) })
  const unitsReady = units.isSuccess && !units.isFetching
  const selectedTreeUnit = unitsReady ? units.data.find((item) => item.id === selectedUnitId) : undefined
  const practitioners = useQuery({ queryKey: ['practitioners', scope], queryFn: async () => requirePractitioners(await api.organization.practitioners()) })
  const assignments = useQuery({ queryKey: ['assignments', scope], queryFn: async () => requirePersonnelAssignments(await api.organization.assignments()) })
  const positions = useQuery({ queryKey: ['positions', scope], queryFn: async () => requirePositions(await api.organization.positions()) })
  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums', scope], queryFn: async () => requireOrganizationEnums(await api.dictionaries.systemEnums()), staleTime: Infinity,
  })
  const confirmedEnums = systemEnums.isSuccess && !systemEnums.isFetching ? systemEnums.data : undefined
  const organizationDictionaryQueries = useQueries({ queries: Object.values(ORGANIZATION_DICTIONARY).map((code) => ({
    queryKey: ['dictionary-resolve', code, scope], queryFn: async () => requireOrganizationDictionary(await api.dictionaries.resolve(code)), staleTime: 5 * 60_000,
  })) })
  const organizationDictionaries = useMemo(() => new Map(Object.values(ORGANIZATION_DICTIONARY)
    .flatMap((code, index) => {
      const query = organizationDictionaryQueries[index]
      return query?.isSuccess && !query.isFetching ? [[code, query.data] as const] : []
    })),
  [organizationDictionaryQueries])
  async function reloadOrganizationDictionaries() {
    await Promise.allSettled(organizationDictionaryQueries.map(query => query.refetch()))
  }
  async function reloadUnitOptions() {
    await Promise.allSettled([units.refetch(), systemEnums.refetch(), reloadOrganizationDictionaries()])
  }
  const organizationProfile = useQuery({
    queryKey: ['organization-profile', selectedTreeUnit?.sdOrgKind, selectedUnitId, scope, selectedTreeUnit?.revision],
    queryFn: async () => requireOrganizationProfile(await api.organization.profile(selectedTreeUnit!), selectedTreeUnit!),
    enabled: Boolean(selectedTreeUnit),
  })
  async function reloadOrganizationProfile(unit: OrganizationUnit) {
    // Each query retains its error for the inline failure state; a retry never supplies replacement data.
    await Promise.allSettled([units.refetch(), queryClient.fetchQuery({
      queryKey: ['organization-profile', unit.sdOrgKind, unit.id, scope, unit.revision],
      queryFn: async () => requireOrganizationProfile(await api.organization.profile(unit), unit), staleTime: 0,
    })])
  }
  const practitionerDetail = useQuery({
    queryKey: ['practitioner', selectedPractitionerId, scope],
    queryFn: async () => requirePractitionerDetail(await api.organization.practitioner(selectedPractitionerId!), selectedPractitionerId!),
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
      queryClient.invalidateQueries({ queryKey: ['organization-changes'] }),
      queryClient.invalidateQueries({ queryKey: ['department-business-configuration'] }),
    ])
  }

  type UnitContext = { api: RhnApi; session: number; unitId?: string }
  function beginUnitAction() {
    unitSession.current += 1; setFeedback(''); setOperationError('')
  }
  function unitContext(): UnitContext {
    setFeedback(''); setOperationError('')
    return { api, session: unitSession.current, unitId: selectedUnitId }
  }
  function currentUnitAction(context?: UnitContext) {
    return context?.api === currentApi.current && context.session === unitSession.current && context.unitId === currentUnitId.current
  }
  function unitFailed(error: unknown, _input: unknown, context?: UnitContext) {
    if (!currentUnitAction(context)) return
    setOperationError(errorMessage(error))
    void queryClient.invalidateQueries({ queryKey: ['organization-units', scope] })
  }
  function unitError(mutation: { error: unknown; context?: UnitContext }) {
    return currentUnitAction(mutation.context) && mutation.error
      ? `组织保存结果未确认：${errorMessage(mutation.error)}。请重新核实后再操作。` : undefined
  }
  const createUnit = useMutation({
    mutationFn: async (input: OrganizationUnitInput) => {
      if (!unitsReady) throw new Error('组织目录尚未确认，请重新加载')
      requireUnitOptions(input, confirmedEnums, organizationDictionaries)
      const existing = units.data, command = { ...input }
      const owner = departmentOwner(command.parentId, existing)
      if (existing.some(item => item.code === command.code.trim().toUpperCase() && item.sdOrgKind === command.sdOrgKind
        && (command.sdOrgKind === 'LEGAL_ORGANIZATION' || departmentOwner(item.id, existing) === owner))) {
        throw new Error('目录中已有相同代码的组织，请核实保存结果，未重复提交')
      }
      return requireCreatedUnit(await api.organization.createUnit(command), command, existing)
    },
    onMutate: unitContext,
    onSuccess: (next, _input, context) => {
      if (!currentUnitAction(context)) return
      setSelectedUnitId(next.id); setUnitDialog(undefined); return refreshed(`已创建“${next.name}”`)
    },
    onError: unitFailed,
  })
  const updateUnit = useMutation({
    mutationFn: async ({ unit, profileChanges = [], reason = '组织资料维护', ...input }: UnitMaintenanceInput) => {
      if (!unitsReady || unit.id !== selectedUnitId) throw new Error('组织目录尚未确认，请重新加载')
      requireUnitOptions({ ...input, code: unit.code, sdOrgKind: unit.sdOrgKind }, confirmedEnums, organizationDictionaries)
      const existing = units.data, command = unitUpdateCommand(unit, input, existing)
      const { expectedRevision, ...details } = command
      if (!canManage || !organizationProfile.isSuccess || organizationProfile.isFetching) throw new Error('组织资料尚未确认，请重新加载')
      const result = await api.organization.maintainUnit(unit, { expectedRevision, details, reason,
        changes: profileChanges.map(row => { const { section, ...values } = row.input
          return { section, id: row.id, values: { ...values, expectedRevision: command.expectedRevision, reason, sdDetailStatus: row.status,
            ...(section === 'relation' && unit.sdOrgKind === 'ORG_UNIT' ? { targetDepartmentId: row.input.section === 'relation' ? row.input.targetOrganizationId : undefined } : {}) } }
        }) })
      const profile = requireMaintainedProfile(result, unit, organizationProfile.data, profileChanges)
      const next = 'organization' in profile ? profile.organization : { ...unit, ...profile.department,
        parentId: profile.department.parentId ?? profile.department.organizationId }
      return requireUpdatedUnit(next, unit, input, existing)
    },
    onMutate: unitContext,
    onSuccess: async (next, _input, context) => {
      if (!currentUnitAction(context)) return
      setUnitDialog(undefined); await refreshed(`已更新“${next.name}”的全部资料`); setMaintenanceVersion(value => value + 1)
    },
    onError: unitFailed,
  })
  const unitStatus = useMutation({
    mutationFn: async (unit: OrganizationUnit) => {
      if (!unitsReady || selectedUnitId !== unit.id) throw new Error('组织目录尚未确认，请重新加载')
      const target = unit.sdOrgStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      return requireUnitStatus(await api.organization.changeUnitStatus(unit.id, unit.revision, target), unit, target)
    },
    onMutate: unitContext,
    onSuccess: (next, _input, context) => {
      if (!currentUnitAction(context)) return
      setStatusConfirmation(undefined); return refreshed(`“${next.name}”状态已更新`)
    },
    onError: unitFailed,
  })
  const savePractitioner = useMutation({
    mutationFn: async (input: PractitionerForm) => {
      if (!onboardingReady || (practitionerDialog && (!detailReady || practitionerDialog.id !== selectedPractitionerId))) throw new Error('人员与入职目录尚未确认，请重新加载核实')
      requireEnumChoice(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.gender, input.sdPractGender)
      if (practitionerDialog) {
        const before = practitionerDialog
        const command = { expectedRevision: before.revision, fullName: input.fullName, sdPractGender: input.sdPractGender }
        return requireUpdatedPractitioner(await api.organization.updatePractitioner(before.id, command), before, command)
      }
      if (!input.organizationId || !input.departmentId || !input.positionId || !input.hireDate) {
        throw new Error('请完整选择入职机构、科室、岗位和聘用日期')
      }
      const command = { code: input.code, fullName: input.fullName, sdPractGender: input.sdPractGender,
        organizationId: input.organizationId, departmentId: input.departmentId, positionId: input.positionId, hireDate: input.hireDate }
      return requireOnboardedPractitioner(await api.organization.onboardPractitioner(command), command)
    },
    onMutate: () => { setFeedback(''); setOperationError(''); return { api, session: practitionerSession.current, personId: selectedPractitionerId } },
    onSuccess: (next, _input, submitted) => {
      if (submitted.api !== currentApi.current || submitted.session !== practitionerSession.current || submitted.personId !== currentPersonId.current) return
      setSelectedPractitionerId(next.id); setPractitionerDialog(undefined)
      return refreshed(`已保存人员“${next.fullName}”`)
    },
    onError: (error, _input, submitted) => {
      if (submitted?.api !== currentApi.current || submitted.session !== practitionerSession.current || submitted.personId !== currentPersonId.current) return
      setOperationError(errorMessage(error))
      void queryClient.invalidateQueries({ queryKey: ['practitioners'] })
      void queryClient.invalidateQueries({ queryKey: ['practitioner'] })
    },
  })
  const practitionerSaveError = savePractitioner.context?.api === api && savePractitioner.context.session === practitionerSession.current && savePractitioner.error
    ? `人员保存未确认：${errorMessage(savePractitioner.error)}。请重新加载核实后再操作。` : undefined
  function openPractitioner(value: Practitioner | null) {
    practitionerSession.current += 1; savePractitioner.reset(); setFeedback(''); setPractitionerDialog(value)
  }

  type ActionContext = { api: RhnApi; session: number; personId?: string }
  function beginPersonnelAction() {
    personnelActionSession.current += 1; setFeedback(''); setOperationError('')
  }
  function actionContext(): ActionContext {
    setFeedback(''); setOperationError('')
    return { api, session: personnelActionSession.current, personId: selectedPractitionerId }
  }
  function currentAction(context?: ActionContext) {
    return context?.api === currentApi.current && context.session === personnelActionSession.current
      && context.personId === currentPersonId.current
  }
  function actionFailed(error: unknown, _input: unknown, context?: ActionContext) {
    if (!currentAction(context)) return
    setOperationError(errorMessage(error))
    void queryClient.invalidateQueries({ queryKey: ['practitioners'] })
    void queryClient.invalidateQueries({ queryKey: ['practitioner'] })
    void queryClient.invalidateQueries({ queryKey: ['assignments'] })
    void queryClient.invalidateQueries({ queryKey: ['positions'] })
  }
  function actionError(mutation: { error: unknown; context?: ActionContext }) {
    return currentAction(mutation.context) && mutation.error
      ? `保存结果未确认：${errorMessage(mutation.error)}。请重新加载核实后再操作。` : undefined
  }
  const practitionerStatus = useMutation({
    mutationFn: async (before: Practitioner) => {
      if (!detailReady || before.id !== selectedPractitionerId) throw new Error('人员档案尚未确认，请重新加载')
      const target = before.sdPersonnelStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      return requirePractitionerStatus(await api.organization.changePractitionerStatus(before.id, before.revision, target), before, target)
    },
    onMutate: actionContext,
    onSuccess: (next, _input, context) => {
      if (!currentAction(context)) return
      setStatusConfirmation(undefined); return refreshed(`“${next.fullName}”状态已更新`)
    },
    onError: actionFailed,
  })
  const savePosition = useMutation({
    mutationFn: async (input: PositionInput) => {
      if (!positionsReady) throw new Error('岗位目录尚未确认，请重新加载')
      requireEnumChoice(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.positionType, input.sdPositionType)
      const before = positions.data, command = { ...input }
      return requireCreatedPosition(await api.organization.createPosition(command), command, before)
    },
    onMutate: actionContext,
    onSuccess: (next, _input, context) => {
      if (!currentAction(context)) return
      setPositionDialog(false); return refreshed(`已创建岗位“${next.name}”`)
    },
    onError: actionFailed,
  })
  const saveEmployment = useMutation({
    mutationFn: async (input: EmploymentInput) => {
      if (!unitsReady || !detailReady || !employmentDialog || employmentDialog.id !== selectedPractitionerId || employmentDialog.id !== input.practitionerId) {
        throw new Error('聘用依赖的人员与机构档案尚未确认，请重新加载')
      }
      requireEnumChoice(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.employmentType, input.sdEmploymentType)
      const before = practitionerDetail.data.employments, command = { ...input }
      return requireCreatedEmployment(await api.organization.createEmployment(command), command, before)
    },
    onMutate: actionContext,
    onSuccess: (_next, _input, context) => {
      if (!currentAction(context)) return
      setEmploymentDialog(undefined); return refreshed('已建立聘用关系')
    },
    onError: actionFailed,
  })
  const saveAssignment = useMutation({
    mutationFn: async (input: AssignmentInput) => {
      if (!unitsReady || !positionsReady || !detailReady || !assignmentDialog || assignmentDialog.practitioner.id !== selectedPractitionerId
        || !assignmentDialog.employments.some(item => item.id === input.employmentId && item.organizationId === input.organizationId)) {
        throw new Error('任职依赖的人员、机构与岗位档案尚未确认，请重新加载')
      }
      requireEnumChoice(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.assignmentType, input.sdAssignmentType)
      const before = practitionerDetail.data.assignments, personId = assignmentDialog.practitioner.id, command = { ...input }
      return requireCreatedAssignment(await api.organization.createAssignment(command), command, personId, before)
    },
    onMutate: actionContext,
    onSuccess: (_next, _input, context) => {
      if (!currentAction(context)) return
      setAssignmentDialog(undefined); return refreshed('已建立人员任职')
    },
    onError: actionFailed,
  })

  const selectedUnit = selectedTreeUnit
  const practitionersReady = practitioners.isSuccess && !practitioners.isFetching
  const assignmentsReady = assignments.isSuccess && !assignments.isFetching
  const positionsReady = positions.isSuccess && !positions.isFetching
  const directoryReady = unitsReady && practitionersReady && assignmentsReady
  const detailReady = practitionersReady && practitioners.data.some(item => item.id === selectedPractitionerId)
    && practitionerDetail.isSuccess && !practitionerDetail.isFetching
  const selectedPractitioner = detailReady ? practitionerDetail.data.practitioner : undefined
  const onboardingReady = unitsReady && positionsReady && practitionersReady
  async function reloadDirectory() { await Promise.all([units.refetch(), practitioners.refetch(), assignments.refetch(), positions.refetch(), systemEnums.refetch()]) }
  async function reloadDetail() { await Promise.all([practitionerDetail.refetch(), units.refetch(), positions.refetch(), systemEnums.refetch()]) }
  const visibleUnits = useMemo(() => {
    const all = units.data ?? []
    if (includeInactiveUnits) return all
    const byId = new Map(all.map(unit => [unit.id, unit]))
    const retained = new Set<string>()
    for (const unit of all.filter(value => value.sdOrgStatus === 'ACTIVE')) {
      for (let node: OrganizationUnit | undefined = unit; node && !retained.has(node.id); node = node.parentId ? byId.get(node.parentId) : undefined) retained.add(node.id)
    }
    return all.filter(unit => retained.has(unit.id))
  }, [units.data, includeInactiveUnits])
  const currentUnitStaff = useMemo(() => {
    if (!selectedTreeUnit) return []
    return (assignments.data ?? []).filter((a) => {
      if (!includeHistory && !currentRelationship(a)) return false
      if (selectedTreeUnit.sdOrgKind === 'ORG_UNIT') {
        return a.departmentId === selectedTreeUnit.id
      }
      return a.organizationId === selectedTreeUnit.id
    })
  }, [selectedTreeUnit, assignments.data, includeHistory])

  // 科室任职记录受控真分页状态
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
  const resolvedDescription = selectedUnit?.description?.trim() || ''
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
    const groups = new Map<string, PersonnelAssignment[]>()
    for (const assignment of assignments.data ?? []) {
      if (!assignment.practitionerId) continue
      const group = groups.get(assignment.practitionerId) ?? []
      group.push(assignment); groups.set(assignment.practitionerId, group)
    }
    for (const [id, group] of groups) {
      const primary = onlyPrimary(group, 'assignment')
      if (primary) map.set(id, primary)
    }
    return map
  }, [assignments.data])
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
  const practitionerRovingId = filteredPractitioners.some((value) => value.id === selectedPractitionerId)
    ? selectedPractitionerId : filteredPractitioners[0]?.id
  const queryError = units.error || practitioners.error || assignments.error || positions.error || systemEnums.error
    || organizationDictionaryQueries.find((item) => item.error)?.error || organizationProfile.error || practitionerDetail.error
  const busy = !canManage || createUnit.isPending || updateUnit.isPending || unitStatus.isPending || savePractitioner.isPending
    || practitionerStatus.isPending || savePosition.isPending || saveEmployment.isPending || saveAssignment.isPending


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
      <WorkspacePane label="组织目录" scroll="content" header={<><Button size="sm" disabled={busy} onClick={() => { beginUnitAction(); setUnitDialog({ mode: 'create' }) }}>新建机构</Button><label className="master-check"><input type="checkbox" checked={includeInactiveUnits} onChange={event => setIncludeInactiveUnits(event.target.checked)} />显示停用节点</label></>}>
        {!unitsReady ? <DirectoryState title="组织目录" loading={units.isFetching || units.isPending} onRetry={() => units.refetch()} /> :
          <TreePanel title="组织" rootLabel="全部组织" searchLabel="搜索组织" searchPlaceholder="搜索名称或代码"
            nodes={visibleUnits.map(unit => ({
              id: unit.id, parentId: unit.parentId ?? undefined, label: unit.name, secondaryText: unit.code,
              inactive: unit.sdOrgStatus !== 'ACTIVE', keywords: [unit.code, pinyinInitials(unit.name)],
            }))} selectedId={selectedUnitId} busy={canManage && busy}
            onSelect={id => { if (id) setSelectedUnitId(id) }}
            onAdd={canManage ? parentId => { beginUnitAction(); setUnitDialog({ mode: 'create', parentId }) } : undefined} />}
      </WorkspacePane>
      <WorkspacePane label={organizationSection === 'profile' ? '组织资料维护' : '组织详情'} className="master-detail" resetScrollKey={`${selectedUnitId}:${organizationSection}`}
        footer={selectedUnit && organizationSection === 'profile' && <div className="ui-query-filters">
          <Button type="submit" form="organization-maintenance-form" busy={updateUnit.isPending}
            disabled={busy || !unitsReady || !organizationProfile.isSuccess || organizationProfile.isFetching || !unitOptionsAvailable(selectedUnit.sdOrgKind, confirmedEnums, organizationDictionaries)}>保存全部资料</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void Promise.allSettled([reloadUnitOptions(), reloadOrganizationProfile(selectedUnit)])}>重新加载资料选项</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setOrganizationSection('staff')}>返回人员与任职</Button>
        </div>}
        header={selectedUnit && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">{selectedUnit.sdOrgKindText}</span>
            <h2>{selectedUnit.name}</h2><code>{selectedUnit.code}</code></div><div>
            <Button variant="secondary" disabled={busy} onClick={() => { beginUnitAction(); setUnitDialog({ mode: 'create', parentId: selectedUnit.id }) }}>
              新增科室</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { beginUnitAction(); setOrganizationSection('profile') }}>编辑资料</Button>
            <ActionMenu disabled={busy} items={[{ key: 'status', label: selectedUnit.sdOrgStatus === 'ACTIVE' ? '停用组织' : '启用组织',
              danger: selectedUnit.sdOrgStatus === 'ACTIVE', onSelect: () => { beginUnitAction(); setStatusConfirmation({ kind: 'unit', value: selectedUnit }) } }]} />
          </div></header>
          <Tabs value={organizationSection} onChange={setOrganizationSection} label="组织详情范围" items={[
            { value: 'staff', label: '人员与任职' }, { value: 'profile', label: '资料维护' },
            { value: 'business', label: '运行规则' }, ...(canManage ? [{ value: 'history', label: '变更记录' }] : []),
          ]} />
        </>}>

        {!unitsReady ? <DirectoryState title="组织目录" loading={units.isFetching || units.isPending} onRetry={() => units.refetch()} />
          : !selectedUnit ? <EmptyState icon="settings" title="选择组织节点" copy="查看节点属性并维护下级组织。" /> : <>
          <div className="master-facts-bar">
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">组织类型</span>
              <span className="master-facts-bar__value">
                {selectedUnit.sdOrgKind === 'ORG_UNIT' ? (resolvedDepartmentTypeText || '未维护科室类型') : selectedUnit.sdOrgTypeText}
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室业务属性' : '机构性质'}</span>
              <span className="master-facts-bar__value">
                {selectedUnit.sdOrgKind === 'ORG_UNIT'
                  ? (selectedUnit.sdDepartmentPropertyText || selectedUnit.sdDepartmentProperty || '未维护科室性质')
                  : (selectedUnit.sdOrgPropertyText || selectedUnit.sdOrgProperty || '未维护机构性质')}
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">任职记录数</span>
              <span className="master-facts-bar__value master-facts-bar__value--highlight">
                {assignmentsReady ? `${new Set(currentUnitStaff.map(item => item.practitionerId).filter(Boolean)).size} 人 / ${currentUnitStaff.length} 条任职` : '待确认'}
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

          {organizationSection === 'staff' && <div className="master-detail-split master-detail-split--single">
            {/* 科室人员与任职列表 */}
            <section className="master-detail-split__main" aria-label="任职记录工作区">
              <div className="master-section-head">
                <div>
                  <h3>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室任职记录' : '机构任职记录'}</h3>
                  <span>
                    {assignmentsReady
                      ? (currentUnitStaff.length > 0
                        ? `共 ${currentUnitStaff.length} 条任职记录${selectedUnit.sdOrgKind !== 'ORG_UNIT' ? '（含下属科室与兼任明细）' : ''}`
                        : '当前组织下暂无任职记录')
                      : '任职记录尚未确认'}
                  </span>
                </div>
                <div>
                  <label className="master-check"><input type="checkbox" checked={includeHistory} onChange={event => setIncludeHistory(event.target.checked)} />含历史及待生效任职</label>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setFilterUnitId(selectedUnit.id)
                    setTab('personnel')
                  }}><Icon name="search" />在人员库中查看</Button>
                </div>
              </div>

              <div className="master-staff-card">
                {!assignmentsReady ? <DirectoryState title="任职目录" loading={assignments.isPending || assignments.isFetching} onRetry={() => assignments.refetch()} /> : currentUnitStaff.length > 0 ? (
                  <>
                    <div className="master-table-wrap master-table-wrap--staff" ref={staffTableScrollRef}>
                      <DataTable compact aria-label="组织任职记录">
                        <thead>
                          <tr>
                            <th>人员姓名</th>
                            <th>任职科室</th>
                            <th>标准岗位</th>
                            <th>任职类型</th>
                            <th>任职有效期</th>
                            <th className="ui-table-cell--status">状态</th>
                            <th className="ui-table-cell--actions" aria-label="操作">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedStaff.map((member) => {
                            return (
                              <tr key={member.id}>
                                <td><strong>{member.practitionerName || '—'}</strong><code>{member.practitionerCode || '—'}</code></td>
                                <td>
                                  <strong>{member.departmentName || member.organizationName || '—'}</strong>
                                  {member.departmentName && member.organizationName && member.departmentName !== member.organizationName && (
                                    <code>{member.organizationName}</code>
                                  )}
                                </td>
                                <td>{member.positionName}</td>
                                <td>{member.primaryAssignment ? <span className="master-qualification-tag master-qualification-tag--prescription">主任职</span> : <span className="master-qualification-tag">{member.sdAssignmentTypeText || '兼职'}</span>}</td>
                                <td>{member.validFrom} 至 {member.validTo || '长期'}</td>
                                <td className="ui-table-cell--status">
                                  <StatusBadge tone={member.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                                    {relationshipLabel(member)}
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
                        label="组织任职记录分页"
                      />
                    </footer>
                  </>
                ) : (
                  <div className="master-table-wrap master-table-wrap--staff is-empty">
                    <p className="master-table-empty">当前组织节点暂无任职记录</p>
                  </div>
                )}
              </div>
            </section>

            {/* 右栏（约 40%）：HIS 业务属性、医保对照与档案治理 */}
          </div>}
          {organizationSection === 'history' && canManage && <OrganizationChangeHistory key={selectedUnit.id} api={api} type={selectedUnit.sdOrgKind === 'ORG_UNIT' ? 'department' : 'organization'} id={selectedUnit.id} />}
          {(organizationSection === 'business' || organizationSection === 'profile') && <>
            {(organizationProfile.isFetching || organizationProfile.isPending) && <LoadingState label="正在加载组织资料…" />}
            {organizationProfile.isError && <Alert>组织资料加载失败<Button size="sm" variant="secondary" onClick={() => void reloadOrganizationProfile(selectedUnit)}>重试组织档案</Button></Alert>}
            {organizationProfile.data && (organizationSection === 'business' ?
              <DepartmentBusinessConfigurationPanel api={api} unit={selectedUnit} profile={organizationProfile.data}
                capabilityTypes={organizationDictionaries.get(ORGANIZATION_DICTIONARY.capabilityType) ?? []} /> :
              <UnitDialog key={`${selectedUnit.id}:${maintenanceVersion}`} embedded profile={organizationProfile.data}
                assignments={assignmentsReady ? assignments.data : []} state={{ mode: 'edit', unit: selectedUnit }}
                units={units.data ?? []} enums={confirmedEnums} dictionaries={organizationDictionaries}
                properties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.property) ?? []}
                departmentProperties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentProperty) ?? []}
                departmentTypes={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []}
                available={unitsReady && organizationProfile.isSuccess && !organizationProfile.isFetching}
                saveError={unitError(updateUnit)} onRefresh={async () => { await Promise.allSettled([reloadUnitOptions(), reloadOrganizationProfile(selectedUnit)]) }}
                busy={busy} onClose={() => setOrganizationSection('staff')} onCreate={input => createUnit.mutate(input)}
                onUpdate={input => updateUnit.mutate(input)} />)}
          </>}
        </>}
      </WorkspacePane>
    </SplitWorkspace> : practitionersReady && !practitioners.data.length ?
      <Panel id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-empty-onboarding">
        <EmptyState icon="residents" title="暂无人员" copy="先新增人员，再建立聘用关系和科室任职。" />
        {(!unitsReady || !positionsReady) && <DirectoryState title="机构与岗位目录" loading={units.isFetching || positions.isFetching} onRetry={reloadDirectory} />}
        <Button disabled={busy || !onboardingReady} onClick={() => openPractitioner(null)}><Icon name="add" />新增人员</Button>
      </Panel>
      : <SplitWorkspace id="personnel-panel" role="tabpanel" aria-labelledby="personnel-tab" className="master-workspace">
      <WorkspacePane label="人员目录" resetScrollKey={`${filterUnitId}:${practitionerQuery}:${personnelPage}:${personnelPageSize}`} footer={
        directoryReady && <Pagination page={personnelPage} totalPages={personnelTotalPages} total={allFilteredPractitioners.length}
          pageSize={personnelPageSize} onChange={setPersonnelPage} onPageSizeChange={setPersonnelPageSize}
          pageSizeOptions={[20, 50, 100]} label="人员目录分页" mode="compact" />
      } header={<>
        <PanelHead title="人员目录" meta={!directoryReady ? '数量待确认' : allFilteredPractitioners.length === (practitioners.data?.length ?? 0)
          ? `${practitioners.data?.length ?? 0} 人`
          : `${allFilteredPractitioners.length} / ${practitioners.data?.length ?? 0} 人`}
          actions={<Button size="sm" disabled={busy || !onboardingReady} onClick={() => openPractitioner(null)}>
            <Icon name="add" />新增人员</Button>} />
        <div className="master-catalog__filters">
          <Select disabled={!directoryReady} aria-label="按科室或机构筛选人员" value={filterUnitId} onChange={setFilterUnitId}
            placeholder="全部机构与科室" showValue options={unitFilterOptions} />
          <SearchField className="master-catalog__search-field" label="搜索人员" value={practitionerQuery}
            onChange={setPractitionerQuery} placeholder="搜索姓名、代码或拼音首字母" />
        </div>
        </>}>
        <div className="master-person-list" role="listbox" aria-label="人员列表">
          {!directoryReady && <DirectoryState title="人员与任职目录" loading={practitioners.isFetching || assignments.isFetching || units.isFetching} onRetry={reloadDirectory} />}
          {directoryReady && filteredPractitioners.map((value, index) => <button role="option" aria-selected={value.id === selectedPractitionerId}
            tabIndex={value.id === practitionerRovingId ? 0 : -1}
            ref={(node) => { practitionerItemRefs.current[index] = node }}
            key={value.id} className={value.id === selectedPractitionerId ? 'is-selected' : ''}
            onKeyDown={(event) => handleCollectionKeyDown(event, index, filteredPractitioners.length,
              (nextIndex) => setSelectedPractitionerId(filteredPractitioners[nextIndex].id), practitionerItemRefs.current)}
            onClick={() => setSelectedPractitionerId(value.id)}><span className="master-person-avatar">{value.fullName.slice(0, 1)}</span>
            <span><strong>{value.fullName}</strong><code>{primaryAssignmentMap.get(value.id)
              ? `${primaryAssignmentMap.get(value.id)!.departmentName} · ${primaryAssignmentMap.get(value.id)!.positionName}`
              : `${value.code} · ${value.sdPractGenderText ?? '未填写'}`}</code></span>
            <StatusBadge tone={value.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>
              {value.sdPersonnelStatusText}</StatusBadge></button>)}
          {directoryReady && practitioners.data.length && !filteredPractitioners.length
            ? <EmptyState icon="search" title="未找到匹配人员" copy="请尝试姓名、代码或拼音首字母。" /> : null}
        </div>
      </WorkspacePane>
      <WorkspacePane label="人员详情" className="master-detail" resetScrollKey={`${selectedPractitionerId}:${personnelSection}`}
        header={selectedPractitioner && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">从业人员</span>
            <h2>{selectedPractitioner.fullName}</h2><code>{selectedPractitioner.code}</code></div><div>
            <Button variant="secondary" disabled={busy} onClick={() => openPractitioner(selectedPractitioner)}>编辑人员</Button>
            <Button variant={selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? 'danger' : 'secondary'}
              busy={practitionerStatus.isPending}
              disabled={busy} onClick={() => { beginPersonnelAction(); practitionerStatus.reset(); setStatusConfirmation({ kind: 'practitioner', value: selectedPractitioner }) }}>
              {selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
          <Tabs value={personnelSection} onChange={setPersonnelSection} label="人员详情范围" items={[
            { value: 'relationships', label: '聘用与任职' }, ...(canManage ? [{ value: 'history', label: '变更记录' }] : []),
          ]} />
        </>}>

        {selectedPractitionerId && !detailReady ? (
          <DirectoryState title="人员档案" loading={practitionerDetail.isPending || practitionerDetail.isFetching || practitioners.isFetching} onRetry={async () => { await Promise.all([practitioners.refetch(), reloadDetail()]) }} />
        ) : !selectedPractitioner ? (
          <EmptyState icon="residents" title="选择人员" copy="查看聘用关系、临床资质与业务档案。" />
        ) : personnelSection === 'history' && canManage ? <OrganizationChangeHistory key={selectedPractitioner.id} api={api} type="practitioner" id={selectedPractitioner.id} /> : (
          <PractitionerWorkbench
            practitioner={selectedPractitioner}
            employments={practitionerDetail.data?.employments ?? []}
            assignments={practitionerDetail.data?.assignments ?? []}
            positions={positionsReady ? positions.data : []}
            relationshipsReady={unitsReady && positionsReady && !busy}
            directoryState={!unitsReady || !positionsReady ? <DirectoryState title="机构与岗位目录" loading={units.isFetching || positions.isFetching} onRetry={reloadDirectory} /> : undefined}
            onAddEmployment={() => { beginPersonnelAction(); saveEmployment.reset(); setEmploymentDialog(selectedPractitioner) }}
            onAddAssignment={() => { beginPersonnelAction(); saveAssignment.reset(); setAssignmentDialog(practitionerDetail.data) }}
            onManagePositions={() => { beginPersonnelAction(); savePosition.reset(); setPositionDialog(true) }}
            onMaintain={setMaintenanceAction}
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
      onClose={() => { if (!busy) { unitSession.current += 1; personnelActionSession.current += 1; setStatusConfirmation(undefined) } }} closeOnBackdrop={false}
      footer={<><Button variant="secondary" disabled={busy} onClick={() => { unitSession.current += 1; personnelActionSession.current += 1; setStatusConfirmation(undefined) }}>取消</Button>
        <Button variant={(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
          : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE' ? 'danger' : 'primary'}
          disabled={!canManage || (statusConfirmation.kind === 'unit' ? !unitsReady || impactBlocked || selectedUnitId !== statusConfirmation.value.id : !detailReady)}
          busy={unitStatus.isPending || practitionerStatus.isPending}
          onClick={() => {
            if (busy) return
            if (statusConfirmation.kind === 'unit') unitStatus.mutate(statusConfirmation.value)
            else practitionerStatus.mutate(statusConfirmation.value)
          }}>{(statusConfirmation.kind === 'unit' ? statusConfirmation.value.sdOrgStatus
            : statusConfirmation.value.sdPersonnelStatus) === 'ACTIVE' ? '确认停用' : '确认启用'}</Button></>}>
      {statusConfirmation.kind === 'unit' && unitError(unitStatus) && <PersonnelWriteError error={unitError(unitStatus)!} busy={busy} onRefresh={() => units.refetch()} />}
      {statusConfirmation.kind === 'practitioner' && actionError(practitionerStatus) && <PersonnelWriteError error={actionError(practitionerStatus)!} busy={busy} onRefresh={reloadDetail} />}
      <p className="master-confirm-note">请确认当前业务状态后再继续。</p>
      {impactUnit && <div>{impact.isPending || impact.isFetching ? <p>正在核实停用影响…</p> : impact.isError ? <Alert>停用影响未能确认。<Button variant="secondary" onClick={() => void impact.refetch()}>重新核实停用影响</Button></Alert> : <p>启用下级 {impact.data.activeChildren} 个，未结束或待生效任职 {impact.data.continuingAssignments} 条，未结束聘用 {impact.data.continuingEmployments} 条。须先处理关联记录再停用。</p>}</div>}
    </Dialog>}

    {unitDialog && <UnitDialog state={unitDialog} units={units.data ?? []} enums={confirmedEnums} dictionaries={organizationDictionaries}
      properties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.property) ?? []}
      departmentProperties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentProperty) ?? []}
      departmentTypes={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []}
      available={unitsReady && (unitDialog.mode === 'create' || selectedUnitId === unitDialog.unit.id)}
      saveError={unitDialog.mode === 'create' ? unitError(createUnit) : unitError(updateUnit)} onRefresh={reloadUnitOptions}
      busy={busy} onClose={() => { if (!busy) { unitSession.current += 1; setUnitDialog(undefined) } }} onCreate={(input) => createUnit.mutate(input)}
      onUpdate={(input) => updateUnit.mutate(input)} />}
    {practitionerDialog !== undefined && <PractitionerDialog value={practitionerDialog ?? undefined}
      primaryAssignment={practitionerDialog
        ? onlyPrimary(practitionerDetail.data?.assignments ?? [], 'assignment')
        : undefined}
      primaryEmployment={practitionerDialog
        ? onlyPrimary(practitionerDetail.data?.employments ?? [], 'employment')
        : undefined}
      defaultUnitId={filterUnitId || selectedTreeUnit?.id}
      units={units.data ?? []}
      positions={positions.data ?? []}
      enums={confirmedEnums} busy={busy} saveError={practitionerSaveError}
      available={onboardingReady && enumAvailable(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.gender) && (!practitionerDialog || (detailReady && selectedPractitionerId === practitionerDialog.id))}
      onRefresh={async () => { await reloadDirectory(); if (practitionerDialog) await practitionerDetail.refetch() }}
      onClose={() => { if (!busy) { practitionerSession.current += 1; setPractitionerDialog(undefined) } }}
      onSave={(input) => savePractitioner.mutate(input)} />}
    {maintenanceAction && <PersonnelLifecycleDialog key={`${maintenanceAction.kind}:${maintenanceAction.value.id}:${scope}`}
      api={api} action={maintenanceAction} detail={practitionerDetail.data} units={units.data ?? []} positions={positions.data ?? []}
      onRefresh={async () => { await reloadDirectory(); if (selectedPractitionerId) await reloadDetail() }}
      enums={confirmedEnums} available={canManage && Boolean(confirmedEnums) && unitsReady && positionsReady && (maintenanceAction.kind === 'position' || detailReady)}
      onClose={() => setMaintenanceAction(undefined)} onSaved={() => {
        if (currentApi.current !== api || currentPersonId.current !== selectedPractitionerId) return
        setMaintenanceAction(undefined); void refreshed('维护已保存，变更记录已留存')
      }} />}
    {positionDialog && <PositionDialog positions={positions.data ?? []} onEdit={value => { setPositionDialog(false); setMaintenanceAction({ kind: 'position', value }) }} enums={confirmedEnums} busy={busy} available={positionsReady && enumAvailable(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.positionType)} saveError={actionError(savePosition)} onRefresh={reloadDirectory}
      onClose={() => { if (!busy) { personnelActionSession.current += 1; setPositionDialog(false) } }}
      onSave={(input) => savePosition.mutate(input)} />}
    {employmentDialog && <EmploymentDialog practitioner={employmentDialog}
      available={unitsReady && detailReady && enumAvailable(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.employmentType) && selectedPractitionerId === employmentDialog.id} onRefresh={reloadDetail}
      organizations={(units.data ?? []).filter((item) => item.sdOrgKind === 'LEGAL_ORGANIZATION' && item.sdOrgStatus === 'ACTIVE')}
      enums={confirmedEnums} busy={busy} saveError={actionError(saveEmployment)}
      onClose={() => { if (!busy) { personnelActionSession.current += 1; setEmploymentDialog(undefined) } }}
      onSave={(input) => saveEmployment.mutate(input)} />}
    {assignmentDialog && <AssignmentDialog
      available={unitsReady && positionsReady && detailReady && enumAvailable(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.assignmentType) && selectedPractitionerId === assignmentDialog.practitioner.id} onRefresh={reloadDetail}
      employments={assignmentDialog.employments.filter((item) => item.sdPersonnelStatus === 'ACTIVE')}
      units={(units.data ?? []).filter((item) => item.sdOrgKind === 'ORG_UNIT' && item.sdOrgStatus === 'ACTIVE')}
      positions={(positions.data ?? []).filter((item) => item.sdPersonnelStatus === 'ACTIVE')}
      enums={confirmedEnums} busy={busy} saveError={actionError(saveAssignment)}
      onClose={() => { if (!busy) { personnelActionSession.current += 1; setAssignmentDialog(undefined) } }}
      onSave={(input) => saveAssignment.mutate(input)} />}
  </>
}

function PersonnelWriteError({ error, busy, onRefresh }: { error: string; busy: boolean; onRefresh: () => Promise<unknown> }) {
  return <div role="alert"><p>{error}</p><Button variant="secondary" disabled={busy} onClick={() => void onRefresh()}>重新核实保存结果</Button></div>
}

function DirectoryState({ title, loading, onRetry }: { title: string; loading: boolean; onRetry: () => Promise<unknown> }) {
  return loading ? <LoadingState label={`正在核实${title}…`} /> : <div role="alert">
    <p>{title}尚未确认，不能据此判断有无记录。</p>
    <Button variant="secondary" onClick={() => void onRetry()}>重新加载{title}</Button>
  </div>
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
}).refine((value) => value.sdOrgKind !== 'ORG_UNIT' || value.sdDepartmentType, {
  path: ['sdDepartmentType'], message: '科室或护理单元必须选择具体科室类型',
}).refine((value) => value.sdOrgKind !== 'ORG_UNIT' || value.sdDepartmentProperty.trim(), {
  path: ['sdDepartmentProperty'], message: '请选择科室业务属性',
}).refine((value) => !value.validTo || value.validTo >= value.validFrom, {
  path: ['validTo'], message: '结束日期不能早于开始日期',
})
type UnitForm = z.infer<typeof unitSchema>
type UnitMaintenanceInput = { unit: OrganizationUnit; profileChanges?: ProfileChangeDraft[]; reason?: string } & Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'>

function UnitDialog({ state, units, enums, dictionaries, properties, departmentProperties, departmentTypes, busy, available, saveError, onRefresh, onClose, onCreate, onUpdate, embedded, profile: sourceProfile, assignments = [] }: {
  embedded?: boolean; profile?: OrganizationProfileResult; assignments?: PersonnelAssignment[]
  available: boolean; saveError?: string; onRefresh: () => Promise<unknown>
  dictionaries: Map<string, DictionaryValue[]>
  state: UnitDialogState; units: OrganizationUnit[]; enums?: SystemEnumDefinition[]
  properties: DictionaryValue[]; departmentProperties: DictionaryValue[]; departmentTypes: DictionaryValue[]; busy: boolean
  onClose: () => void; onCreate: (input: OrganizationUnitInput) => void
  onUpdate: (input: UnitMaintenanceInput) => void
}) {
  const [profile] = useState(sourceProfile)
  const [editing] = useState(() => { if (state.mode !== 'edit') return undefined
    return profile ? 'organization' in profile ? profile.organization : { ...state.unit, ...profile.department,
      parentId: profile.department.parentId ?? profile.department.organizationId } : state.unit })
  const profileEditor = useRef<ProfileEditorHandle>(null)
  const [changeReason, setChangeReason] = useState('组织资料维护')
  const formId = embedded ? 'organization-maintenance-form' : 'unit-form'
  const parent = state.mode === 'create' ? units.find((item) => item.id === state.parentId) : undefined
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema), defaultValues: {
      code: editing?.code ?? '', name: editing?.name ?? '', shortName: editing?.shortName ?? '',
      description: editing?.description ?? '',
      sdOrgKind: editing?.sdOrgKind ?? (parent ? 'ORG_UNIT' : 'LEGAL_ORGANIZATION'),
      sdOrgType: editing?.sdOrgType ?? (parent ? 'CLINICAL_DEPARTMENT' : 'TOWNSHIP_HEALTH_CENTER'),
      sdOrgProperty: editing?.sdOrgProperty ?? '', virtual: editing?.virtual ?? false,
      sdDepartmentProperty: editing?.sdDepartmentProperty ?? '',
      sortOrder: editing?.sortOrder ?? 0, timezoneCode: editing ? editing.timezoneCode ?? '' : 'Asia/Shanghai',
      sdDepartmentType: editing?.sdDepartmentType ?? '',
      parentId: editing?.parentId ?? parent?.id ?? '', validFrom: editing?.validFrom ?? today(),
      validTo: editing?.validTo ?? '',
    },
  })
  const kind = watch('sdOrgKind')
  const optionsReady = unitOptionsAvailable(kind, enums, dictionaries)
  const property = watch('sdDepartmentProperty')
  const structuralType = kind === 'ORG_UNIT' ? departmentStructure(property) : watch('sdOrgType')
  const selectedDepartmentType = watch('sdDepartmentType')
  const types = systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.type).filter((item) => kind === 'LEGAL_ORGANIZATION'
    ? ['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC'].includes(item.code)
    : !['TOWNSHIP_HEALTH_CENTER', 'COMMUNITY_HEALTH_CENTER', 'HOSPITAL', 'CLINIC'].includes(item.code))
  const availableDepartmentTypes = departmentTypeOptions(departmentTypes, structuralType, property)
  const departmentTypeSelectOptions = availableDepartmentTypes.map(codeNameOption)
  if (selectedDepartmentType && !departmentTypeSelectOptions.some((item) => item.value === selectedDepartmentType)) {
    departmentTypeSelectOptions.push({ value: selectedDepartmentType,
      label: selectedDepartmentType === editing?.sdDepartmentType
        ? resolveDepartmentTypeText(editing, departmentTypes) : selectedDepartmentType })
  }
  useEffect(() => {
    if ((kind !== 'ORG_UNIT' || structuralType === 'CAMPUS') && selectedDepartmentType) {
      setValue('sdDepartmentType', '')
    }
  }, [kind, selectedDepartmentType, setValue, structuralType])
  const common = (value: UnitForm) => ({ parentId: value.parentId || undefined, name: value.name,
    shortName: value.shortName || undefined, description: value.description || undefined,
    sdOrgType: value.sdOrgKind === 'ORG_UNIT' ? departmentStructure(value.sdDepartmentProperty) : value.sdOrgType as OrganizationType,
    sdOrgProperty: value.sdOrgKind === 'LEGAL_ORGANIZATION' ? value.sdOrgProperty || undefined : undefined,
    sdDepartmentProperty: value.sdOrgKind === 'ORG_UNIT' ? value.sdDepartmentProperty || undefined : undefined,
    virtual: value.virtual, sortOrder: value.sortOrder, timezoneCode: value.sdOrgKind === 'LEGAL_ORGANIZATION' ? value.timezoneCode || undefined : undefined,
    sdDepartmentType: value.sdOrgKind === 'ORG_UNIT'
      ? value.sdDepartmentType : undefined,
    validFrom: value.validFrom, validTo: value.validTo || undefined })
  const submit = async (value: UnitForm) => {
    if (busy || !available || !optionsReady) return
    const profileChanges = embedded ? await profileEditor.current?.changes() : []
    if (embedded && !profileChanges) return
    if (editing) onUpdate({ unit: editing, ...common(value), profileChanges, reason: changeReason })
    else onCreate({ code: value.code, sdOrgKind: value.sdOrgKind, ...common(value) })
  }
  const footer = <><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{embedded ? '返回人员与任职' : '取消'}</Button>
    <Button type="submit" form={formId} busy={busy} disabled={!available || !optionsReady || busy}>{embedded ? '保存全部资料' : '保存组织'}</Button></>
  const body = <>
    {!optionsReady && <DirectoryState title="组织类型与字典选项" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    {!available && <DirectoryState title="组织目录" loading={false} onRetry={onRefresh} />}
    <form id={formId} onSubmit={handleSubmit(submit)}>
      <fieldset disabled={busy || !available} className="organization-profile-editor__basic"><legend>基本资料</legend><div className="master-form master-form--unit">
      <FormField label="组织代码" required hint="字母开头，可使用字母、数字、下划线和短横线" error={errors.code?.message}>
        <input {...register('code')} readOnly={Boolean(editing)} autoFocus /></FormField>
      <FormField label="组织名称" required error={errors.name?.message}><input {...register('name')} /></FormField>
      <FormField label="简称" error={errors.shortName?.message}><input {...register('shortName')} /></FormField>
      <FormField label="组织类别" required error={errors.sdOrgKind?.message}><FormSelect
        control={control} name="sdOrgKind" disabled={Boolean(editing)} showValue clearable={false}
        options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.kind).map(codeNameOption)} /></FormField>
      {kind === 'LEGAL_ORGANIZATION' && <FormField label="组织结构类型" required error={errors.sdOrgType?.message}><FormSelect control={control} name="sdOrgType"
        showValue clearable={false} options={types.map(codeNameOption)} /></FormField>}
      {kind === 'LEGAL_ORGANIZATION' ? <FormField label="机构性质"><FormSelect control={control} name="sdOrgProperty" placeholder="未设置" showValue
        options={properties.map((item) => ({ value: item.code, label: item.name }))} /></FormField>
        : <FormField label="业务属性" required error={errors.sdDepartmentProperty?.message}><FormSelect control={control} name="sdDepartmentProperty" showValue clearable={false}
          options={departmentProperties.map((item) => ({ value: item.code, label: item.name }))} /></FormField>}
      <FormField className={kind === 'ORG_UNIT' && structuralType !== 'CAMPUS' ? 'master-form__span-2' : 'master-form__span-3'}
        label="上级组织" required={kind === 'ORG_UNIT'} error={errors.parentId?.message}><FormSelect control={control} name="parentId"
        placeholder="无上级" showValue options={units
          .filter((item) => item.id !== editing?.id && (kind === 'ORG_UNIT' || item.sdOrgKind === 'LEGAL_ORGANIZATION')
            && (!editing || kind !== 'ORG_UNIT' || departmentOwner(item.id, units) === departmentOwner(editing.id, units)))
          .map((item) => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField>
      {kind === 'ORG_UNIT' && structuralType !== 'CAMPUS' && <FormField label="具体科室类型" required error={errors.sdDepartmentType?.message}>
        <FormSelect control={control} name="sdDepartmentType" placeholder="请选择" showValue
          options={departmentTypeSelectOptions} />
      </FormField>}
      <FormField label="同级排序" error={errors.sortOrder?.message}>
        <input type="number" min="0" {...register('sortOrder', { valueAsNumber: true })} /></FormField>
      {kind === 'LEGAL_ORGANIZATION' && <FormField label="IANA 时区"><input {...register('timezoneCode')} placeholder="Asia/Shanghai" /></FormField>}
      <label className="master-check master-check--field"><input type="checkbox" {...register('virtual')} />
        <span>虚拟组织<small>不对应独立物理科室</small></span></label>
      <FormField label="生效日期" required error={errors.validFrom?.message}><input type="date" {...register('validFrom')} /></FormField>
      <FormField label="结束日期" error={errors.validTo?.message}><input type="date" {...register('validTo')} /></FormField>
      <FormField className="master-form__span-3" label="组织说明" error={errors.description?.message}>
        <textarea rows={3} {...register('description')} /></FormField>
      </div></fieldset>
      {embedded && editing && profile && <><OrganizationProfileEditor ref={profileEditor} profile={profile} unit={editing} units={units}
        assignments={assignments} dictionaries={dictionaries} disabled={busy || !available} />
        <FormField label="变更原因" required><input required maxLength={1000} disabled={busy || !available} value={changeReason} onChange={event => setChangeReason(event.target.value)} /></FormField></>}
    </form>
  </>
  return embedded ? <div className="organization-maintenance-form">{body}</div>
    : <Dialog eyebrow="组织主数据" title={editing ? '编辑组织节点' : '新建组织节点'} onClose={onClose} size="xwide" closeOnBackdrop={false} footer={footer}>{body}</Dialog>
}

function PractitionerWorkbench({ practitioner, employments, assignments, positions, relationshipsReady, directoryState,
  onAddEmployment, onAddAssignment, onManagePositions, onMaintain }: {
  practitioner: Practitioner; employments: Employment[]; assignments: PersonnelAssignment[]; positions: Position[];
  relationshipsReady: boolean; directoryState?: React.ReactNode; onAddEmployment: () => void; onAddAssignment: () => void;
  onManagePositions: () => void; onMaintain: (action: PersonnelMaintenanceAction) => void
}) {
  const [history, setHistory] = useState(false)
  const currentAssignments = assignments.filter(item => currentRelationship(item))
  const primary = onlyPrimary(currentAssignments, 'assignment')
  const visible = assignments.filter(item => history || currentRelationship(item))
  return <>{directoryState}
    <div className="master-facts-bar"><div className="master-facts-bar__item"><span>当前主任职</span><strong>{primary ? `${primary.departmentName} · ${primary.positionName}` : currentAssignments.some(item => item.primaryAssignment) ? '多科室主任职，详见下表' : '未设置当前主任职'}</strong></div>
      <div className="master-facts-bar__item"><span>姓名 / 工号</span><strong>{practitioner.fullName} · {practitioner.code}</strong></div>
      <div className="master-facts-bar__item"><span>性别</span><strong>{practitioner.sdPractGenderText ?? '未填写'}</strong></div></div>
    <section aria-label="科室任职配置"><PanelHead title="科室任职" meta={`${currentAssignments.length} 条当前有效任职`}
      actions={<><Button size="sm" variant="secondary" disabled={!relationshipsReady} onClick={onManagePositions}>维护岗位</Button>
        <Button size="sm" disabled={!relationshipsReady || practitioner.sdPersonnelStatus !== 'ACTIVE' || !employments.some(item => currentRelationship(item)) || !positions.some(item => item.sdPersonnelStatus === 'ACTIVE')} onClick={onAddAssignment}>新增任职</Button></>} />
      <label className="master-check"><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />含历史及待生效任职</label>
      <DataTable compact aria-label="人员科室任职"><thead><tr><th>科室 / 岗位</th><th>任职类型</th><th>任职有效期</th><th>状态</th><th className="ui-table-cell--actions">操作</th></tr></thead>
        <tbody>{visible.map(item => <tr key={item.id}><td><strong>{item.departmentName} · {item.positionName}</strong><code>{item.organizationName} · {item.code}</code></td>
          <td>{item.primaryAssignment ? '本科室主任职' : item.sdAssignmentTypeText}</td><td>{item.validFrom} 至 {item.validTo || '长期'}</td><td>{relationshipLabel(item)}</td>
          <td className="ui-table-cell--actions"><ActionMenu label="维护任职" disabled={!relationshipsReady} items={[
            { key: 'edit', label: '编辑任职', onSelect: () => onMaintain({ kind: 'assignment', value: item }) },
            { key: 'transfer', label: '调岗', disabled: !currentRelationship(item) || practitioner.sdPersonnelStatus !== 'ACTIVE', onSelect: () => onMaintain({ kind: 'transfer', value: item }) },
            { key: 'end', label: '结束任职', disabled: item.sdPersonnelStatus !== 'ACTIVE', onSelect: () => onMaintain({ kind: 'end-assignment', value: item }) },
          ]} /></td></tr>)}</tbody></DataTable>{!visible.length && <p>当前暂无科室任职，可新增任职或查看历史。</p>}
    </section>
    <section aria-label="机构劳动与聘用档案"><PanelHead title="机构聘用" actions={<Button size="sm" variant="secondary" disabled={!relationshipsReady || practitioner.sdPersonnelStatus !== 'ACTIVE'} onClick={onAddEmployment}>新增聘用</Button>} />
      <DataTable compact aria-label="人员聘用关系"><thead><tr><th>机构 / 类型</th><th>聘用期间</th><th>状态</th><th className="ui-table-cell--actions">操作</th></tr></thead>
        <tbody>{employments.filter(item => history || currentRelationship(item)).map(item => <tr key={item.id}><td>{item.organizationName} · {item.sdEmploymentTypeText}{item.primaryEmployment ? ' · 主要聘用' : ''}</td>
          <td>{item.hireDate} 至 {item.leaveDate || '长期'}</td><td>{relationshipLabel(item)}</td><td className="ui-table-cell--actions"><ActionMenu label="维护聘用" disabled={!relationshipsReady} items={[
            { key: 'edit', label: '编辑聘用', onSelect: () => onMaintain({ kind: 'employment', value: item }) },
            { key: 'end', label: '办理离职', disabled: item.sdPersonnelStatus !== 'ACTIVE', onSelect: () => onMaintain({ kind: 'end-employment', value: item }) },
          ]} /></td></tr>)}</tbody></DataTable>
    </section>
    <p>执业资质、医保和 CA 尚未接入。本页维护人员与任职关系；业务授权和登录账号在角色与权限中独立管理。</p>
  </>
}

function currentRelationship(value: Employment | PersonnelAssignment) {
  const today = new Date().toLocaleDateString('sv-SE')
  const from = 'hireDate' in value ? value.hireDate : value.validFrom
  const to = 'hireDate' in value ? value.leaveDate : value.validTo
  return value.sdPersonnelStatus === 'ACTIVE' && from <= today && (!to || to >= today)
}
function relationshipLabel(value: Employment | PersonnelAssignment) {
  const today = new Date().toLocaleDateString('sv-SE')
  const from = 'hireDate' in value ? value.hireDate : value.validFrom
  const to = 'hireDate' in value ? value.leaveDate : value.validTo
  return value.sdPersonnelStatus === 'INACTIVE' ? '已作废' : from > today ? '待生效' : to && to < today ? '已结束' : '当前有效'
}


const practitionerSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效人员代码（以字母开头）'),
  fullName: z.string().trim().min(1, '请输入人员姓名').max(100),
  sdPractGender: z.enum(['1', '2', '0', '9']),
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

function PractitionerDialog({
  value,
  primaryAssignment,
  primaryEmployment,
  defaultUnitId,
  units,
  positions,
  enums,
  busy,
  available, saveError, onRefresh,
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
  available: boolean
  saveError?: string
  onRefresh: () => Promise<void>
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
    if (value) return undefined
    if (defaultUnitId) {
      const u = units.find((item) => item.id === defaultUnitId)
      if (u?.sdOrgKind === 'ORG_UNIT') return u
    }
    return units.find((u) => u.sdOrgKind === 'ORG_UNIT' && u.sdOrgStatus === 'ACTIVE')
  }, [primaryAssignment, defaultUnitId, units, value])

  const initialOrgId = useMemo(() => {
    if (primaryAssignment?.organizationId) return primaryAssignment.organizationId
    if (primaryEmployment?.organizationId) return primaryEmployment.organizationId
    if (value) return ''
    if (initialDeptUnit) return departmentOwner(initialDeptUnit.id, units) ?? ''
    if (defaultUnitId) {
      const u = units.find((item) => item.id === defaultUnitId)
      if (u?.sdOrgKind === 'LEGAL_ORGANIZATION') return u.id
    }
    return organizations[0]?.id ?? ''
  }, [primaryAssignment, primaryEmployment, initialDeptUnit, defaultUnitId, units, organizations, value])

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<PractitionerForm>({
    resolver: zodResolver(practitionerSchema),
    defaultValues: {
      code: value?.code ?? '',
      fullName: value?.fullName ?? '',
      sdPractGender: value?.sdPractGender ?? '0',
      idCard: '',
      phone: '',
      education: '',
      professionCategory: '',
      professionalTitle: '',
      licenseNumber: '',
      qualificationNumber: '',
      practiceScope: '',
      prescriptionPrivilege: '',
      insuranceDoctorCode: '',
      caCertId: '',
      organizationId: initialOrgId,
      departmentId: initialDeptUnit?.id ?? '',
      positionId: primaryAssignment?.positionId ?? (value ? '' : positions[0]?.id ?? ''),
      hireDate: primaryEmployment?.hireDate ?? (value ? '' : today()),
    },
  })

  const selectedOrgId = watch('organizationId')
  const availableDepartments = useMemo(() => {
    return units.filter(
      (u) => u.sdOrgKind === 'ORG_UNIT' && (!selectedOrgId || departmentOwner(u.id, units) === selectedOrgId) && u.sdOrgStatus === 'ACTIVE'
    )
  }, [units, selectedOrgId])

  useEffect(() => {
    if (!value && available && selectedOrgId && availableDepartments.length > 0) {
      const currentDept = watch('departmentId')
      if (!currentDept || !availableDepartments.some((d) => d.id === currentDept)) {
        setValue('departmentId', availableDepartments[0].id)
      }
    }
  }, [selectedOrgId, availableDepartments, setValue, watch, value, available])

  const genderOptions = useMemo(() => systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.gender).map(codeNameOption), [enums])

  return (
    <Dialog
      eyebrow="人员主数据与执业准入"
      title={value ? `编辑人员档案 · ${value.fullName}` : '新增医疗从业人员'}
      onClose={onClose}
      closeOnBackdrop={false}
      size={value ? "wide" : "xwide"}
      className={value ? undefined : "master-practitioner-dialog"}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="practitioner-form" busy={busy} disabled={!available}>
            {value ? '保存人员档案' : '保存并完成入职配置'}
          </Button>
        </>
      }
    >
      {(!available || saveError) && <div role="alert"><p>{saveError ?? '人员类型选项或入职机构与岗位目录尚未确认，请重新加载。'}</p>
        <Button variant="secondary" disabled={busy} onClick={() => void onRefresh()}>重新核实人员目录</Button></div>}
      <form id="practitioner-form" className={`master-form master-form--practitioner${value ? " master-form--personnel-edit" : ""}`} inert={busy} onSubmit={handleSubmit(input => {
        if (busy || !available) return
        if (!value) {
          let valid = true
          for (const field of ['organizationId', 'departmentId', 'positionId', 'hireDate'] as const) {
            if (!input[field]) { setError(field, { message: '请完整填写入职配置' }); valid = false }
          }
          if (!valid) return
        }
        onSave(input)
      })}>
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
            </div>
          </section>

          {/* Section 3: 初次聘用与任职分配 */}
          {!value && <section className="master-form-section" aria-label="聘用与任职分配">
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
                <span>新增人员时指定聘用机构、科室与岗位，系统将一次性建立正式主聘用与主任职配置；任一步失败均不保存。</span>
              </div>
            )}
            <div className="master-form-grid">
              <FormField label="聘用医疗机构" error={errors.organizationId?.message}>
                <FormSelect
                  control={control}
                  name="organizationId"
                  disabled={Boolean(value)}
                  showValue
                  clearable={false}
                  options={organizations.map((org) => ({ value: org.id, label: org.name, secondaryText: org.code }))}
                />
              </FormField>
              <FormField label="任职业务科室" error={errors.departmentId?.message}>
                <FormSelect
                  control={control}
                  name="departmentId"
                  disabled={Boolean(value)}
                  showValue
                  clearable={false}
                  options={availableDepartments.map((dept) => ({ value: dept.id, label: dept.name, secondaryText: dept.code }))}
                />
              </FormField>
              <FormField label="标准任职岗位" error={errors.positionId?.message}>
                <FormSelect
                  control={control}
                  name="positionId"
                  disabled={Boolean(value)}
                  showValue
                  clearable={false}
                  options={positions.map((pos) => ({ value: pos.id, label: pos.name, secondaryText: pos.code }))}
                />
              </FormField>
              <FormField label="入职聘用日期" error={errors.hireDate?.message}>
                <input type="date" disabled={Boolean(value)} {...register('hireDate')} />
              </FormField>
            </div>
          </section>}
        </div>

        {value && <p>本次编辑保存姓名与性别。调岗、兼任和离职请在聘用与任职列表中操作。</p>}
      </form>
    </Dialog>
  )
}

const positionSchema = z.object({ code: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, '请输入有效岗位代码'),
  name: z.string().trim().min(1, '请输入岗位名称').max(128), sdPositionType: z.string().min(1), dutyDescription: z.string().max(1000) })
type PositionForm = z.infer<typeof positionSchema>

function PositionDialog({ positions, onEdit, enums, busy, available, saveError, onRefresh, onClose, onSave }: { positions: Position[]; onEdit: (value: Position) => void; enums?: SystemEnumDefinition[]; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void; onSave: (input: { code: string; name: string; sdPositionType: PositionType; dutyDescription?: string }) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<PositionForm>({ resolver: zodResolver(positionSchema), defaultValues: { code: '', name: '', sdPositionType: 'CLINICAL', dutyDescription: '' } })
  return <Dialog eyebrow="标准岗位" title="标准岗位维护" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form="position-form" busy={busy} disabled={!available}>保存岗位</Button></>}>
    <DataTable compact aria-label="标准岗位目录"><thead><tr><th>代码 / 名称</th><th>类别</th><th>状态</th><th className="ui-table-cell--actions">维护</th></tr></thead>
      <tbody>{positions.map(item => <tr key={item.id}><td>{item.name} · {item.code}</td><td>{item.sdPositionTypeText}</td><td>{item.sdPersonnelStatusText}</td>
        <td className="ui-table-cell--actions"><Button size="sm" variant="text" disabled={busy} onClick={() => onEdit(item)}>编辑 / 启停</Button></td></tr>)}</tbody></DataTable>
    <h3>新增标准岗位</h3>
    {!available && <DirectoryState title="岗位与类型目录" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    <form id="position-form" inert={busy || !available} className="master-form" onSubmit={handleSubmit((value) => { if (busy || !available) return; onSave({ ...value, sdPositionType: value.sdPositionType as PositionType, dutyDescription: value.dutyDescription || undefined }) })}>
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

function EmploymentDialog({ practitioner, organizations, enums, busy, available, saveError, onRefresh, onClose, onSave }: { practitioner: Practitioner; organizations: OrganizationUnit[]; enums?: SystemEnumDefinition[]; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void; onSave: (input: EmploymentInput) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<EmploymentForm>({ resolver: zodResolver(employmentSchema), defaultValues: { organizationId: organizations[0]?.id ?? '', code: `EMP_${practitioner.code}`, sdEmploymentType: 'PERMANENT', primaryEmployment: true, hireDate: today(), leaveDate: '' } })
  return <Dialog eyebrow="人员聘用" title={`为 ${practitioner.fullName} 建立聘用关系`} onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form="employment-form" busy={busy} disabled={!available}>保存聘用</Button></>}>
    {!available && <DirectoryState title="聘用类型与依赖目录" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    <form id="employment-form" inert={busy || !available} className="master-form" onSubmit={handleSubmit((value) => { if (busy || !available) return; onSave({ practitionerId: practitioner.id, ...value,
      sdEmploymentType: value.sdEmploymentType as EmploymentType, leaveDate: value.leaveDate || undefined }) })}>
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
  primaryAssignment: z.boolean(), validFrom: z.string().min(1), validTo: z.string() })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, { path: ['validTo'], message: '结束日期不能早于开始日期' })
type AssignmentForm = z.infer<typeof assignmentSchema>

function AssignmentDialog({ employments, units, positions, enums, busy, available, saveError, onRefresh, onClose, onSave }: { employments: Array<{ id: string; code: string; organizationId: string; organizationName: string; hireDate: string; leaveDate?: string | null }>; units: OrganizationUnit[]; positions: Array<{ id: string; code: string; name: string }>; enums?: SystemEnumDefinition[]; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void; onSave: (input: AssignmentInput) => void }) {
  const firstEmployment = employments[0]
  const firstUnit = units.find((item) => firstEmployment && belongsToOrganization(item, firstEmployment.organizationId, units))
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<AssignmentForm>({ resolver: zodResolver(assignmentSchema), defaultValues: { employmentId: firstEmployment?.id ?? '', organizationId: firstEmployment?.organizationId ?? '', departmentId: firstUnit?.id ?? '', positionId: positions[0]?.id ?? '', code: '', sdAssignmentType: 'PRIMARY', specialtyCode: '', primaryAssignment: true, validFrom: firstEmployment?.hireDate ?? today(), validTo: '' } })
  const employmentId = watch('employmentId')
  const departmentId = watch('departmentId')
  const selectedEmployment = employments.find((item) => item.id === employmentId)
  const compatibleUnits = units.filter((item) => selectedEmployment
    && belongsToOrganization(item, selectedEmployment.organizationId, units))
  useEffect(() => {
    if (available && selectedEmployment && !compatibleUnits.some((item) => item.id === departmentId)) {
      setValue('organizationId', selectedEmployment.organizationId)
      setValue('departmentId', compatibleUnits[0]?.id ?? '')
      setValue('validFrom', selectedEmployment.hireDate)
      setValue('validTo', '')
    }
  }, [compatibleUnits, departmentId, selectedEmployment, setValue, available])
  return <Dialog eyebrow="人员任职" title="新增科室任职" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form="assignment-form" busy={busy} disabled={!available}>保存任职</Button></>}>
    {!available && <DirectoryState title="任职类型与依赖目录" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    <form id="assignment-form" inert={busy || !available} className="master-form" onSubmit={handleSubmit((value) => { if (busy || !available) return; onSave({ ...value,
      sdAssignmentType: value.sdAssignmentType as AssignmentType, specialtyCode: value.specialtyCode || undefined,
      validTo: value.validTo || undefined }) })}>
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
      <FormField label="专业代码"><input {...register('specialtyCode')} /></FormField>
      <div className="ui-form-row"><FormField label="开始日期" required><input type="date" min={selectedEmployment?.hireDate} max={selectedEmployment?.leaveDate ?? undefined} {...register('validFrom')} /></FormField>
        <FormField label="结束日期" error={errors.validTo?.message}><input type="date" min={selectedEmployment?.hireDate} max={selectedEmployment?.leaveDate ?? undefined} {...register('validTo')} /></FormField></div>
      <label className="master-check"><input type="checkbox" {...register('primaryAssignment')} />设为主任职任职</label></form>
  </Dialog>
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

export function departmentTypeOptions(values: DictionaryValue[], structuralType: string, property: string) {
  const specific: Record<string, (code: string) => boolean> = {
    PHARMACY: code => code.startsWith('MED_PHARMACY'),
    EQUIPMENT_ASSET: code => code.startsWith('MED_EQUIPMENT'),
    SUPPLY_LOGISTICS: code => code.startsWith('LOG_') || ['MED_CONSUMABLE_WAREHOUSE', 'MED_SURGICAL_STORE', 'MED_REAGENT_STORE', 'MED_SUPPLY', 'NUR_CSSD'].some(prefix => code.startsWith(prefix)),
    RESEARCH_EDUCATION: code => ['ADM_RESEARCH', 'ADM_EDUCATION', 'ADM_TEACH'].some(prefix => code.startsWith(prefix)),
  }
  if (specific[property]) return values.filter(item => specific[property](item.code) || item.code === 'CUSTOM_OTHER')
  const custom = (code: string) => code === 'CUSTOM_OTHER'
  if (structuralType === 'ADMINISTRATIVE_DEPARTMENT') return values.filter((item) => item.code.startsWith('ADM_') || custom(item.code))
  if (structuralType === 'MEDICAL_TECHNOLOGY_DEPARTMENT') return values.filter((item) => item.code.startsWith('MED_')
    || ['30', '31', '32'].some((prefix) => item.code === prefix || item.code.startsWith(`${prefix}.`)) || custom(item.code))
  if (structuralType === 'NURSING_UNIT') return values.filter((item) => item.code.startsWith('NUR_') || custom(item.code))
  return values.filter((item) => (!item.code.startsWith('ADM_') && !item.code.startsWith('MED_')
    && !item.code.startsWith('NUR_') && !item.code.startsWith('LOG_')
    && !['30', '31', '32'].some(prefix => item.code === prefix || item.code.startsWith(`${prefix}.`))) || custom(item.code))
}

function today() { return new Date().toLocaleDateString('sv-SE') }

function normalizeSearch(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
}

export function resolveDepartmentTypeText(
  unit?: OrganizationUnit | null,
  departmentTypes?: DictionaryValue[],
): string {
  if (!unit) return ''
  if (unit.sdOrgKind !== 'ORG_UNIT') return unit.sdOrgTypeText || ''

  const typeCode = unit.sdDepartmentType?.trim() || ''
  const typeText = unit.sdDepartmentTypeText?.trim() || ''
  const configuredName = departmentTypes?.find((item) => item.code === typeCode)?.name
  if (configuredName) return configuredName
  return typeText || typeCode || '未维护科室类型'

}
