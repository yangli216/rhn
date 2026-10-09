import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  ORGANIZATION_DICTIONARY, ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems,
  type AssignmentInput, type AssignmentType, type Employment, type EmploymentInput, type EmploymentType,
  type DictionaryValue,
  type OrganizationProfileInput, type OrganizationProfileResult, type OrganizationProfileSection,
  type OrganizationType, type OrganizationUnit, type OrganizationUnitInput,
  type PersonnelAssignment, type Position, type PositionType, type Practitioner, type PractitionerDetail, type RhnApi, type SystemEnumDefinition,
} from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, Dialog, EmptyState, FormField, Icon, type IconName, LoadingState, PageHeader, Panel, PanelHead,
  FormSelect, Pagination, SearchField, Select, type SelectOption, SplitWorkspace, StatusBadge, Tabs,
} from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { pinyinInitials } from '../../shared/ui/pinyinInitials'
import { departmentOwner, departmentStructure, requireCreatedUnit, requireUpdatedUnit, requireUnitStatus, unitUpdateCommand } from './organizationUnitReceipt'
import { enumAvailable, requireEnumChoice, requireOrganizationEnums, requireUnitOptions, unitOptionsAvailable } from './organizationFormOptions'
import { requireOnboardedPractitioner } from './practitionerOnboarding'
import { profileDictionaryCodes, requireOrganizationDictionary, requireProfileDictionarySelection } from './organizationDictionaryFacts'
import { requireOrganizationProfile } from './organizationProfileFacts'
import { assertNewProfileItem, requireCreatedProfileItem } from './organizationProfileReceipt'
import { requireCreatedAssignment, requireCreatedEmployment, requireCreatedPosition, requirePractitionerStatus, requireUpdatedPractitioner, type PositionInput } from './personnelMutationReceipt'
import { onlyPrimary, requireOrganizationUnits, requirePersonnelAssignments, requirePositions, requirePractitionerDetail, requirePractitioners } from './organizationPersonnelFacts'

type WorkspaceTab = 'organization' | 'personnel'
type UnitDialogState = { mode: 'create'; parentId?: string } | { mode: 'edit'; unit: OrganizationUnit }
type StatusConfirmation = { kind: 'unit'; value: OrganizationUnit } | { kind: 'practitioner'; value: Practitioner }

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0
function queryScope(api: RhnApi) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  return apiScopes.get(api)!
}

export function OrganizationPersonnelManagement({ api }: { api: RhnApi }) {
  const scope = queryScope(api)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<WorkspaceTab>('organization')
  const [selectedUnitId, setSelectedUnitId] = useState<string>()
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>()
  const [unitDialog, setUnitDialog] = useState<UnitDialogState>()
  const [practitionerDialog, setPractitionerDialog] = useState<Practitioner | null | undefined>()
  const [positionDialog, setPositionDialog] = useState(false)
  const [employmentDialog, setEmploymentDialog] = useState<Practitioner>()
  const [assignmentDialog, setAssignmentDialog] = useState<PractitionerDetail>()
  const [profileDialog, setProfileDialog] = useState<{ section: OrganizationProfileSection; unit: OrganizationUnit }>()
  const [query, setQuery] = useState('')
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [filterUnitId, setFilterUnitId] = useState('')
  const [personnelPage, setPersonnelPage] = useState(0)
  const [personnelPageSize, setPersonnelPageSize] = useState(20)
  const [statusConfirmation, setStatusConfirmation] = useState<StatusConfirmation>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const unitSession = useRef(0)
  const profileSession = useRef(0)
  const currentUnitId = useRef(selectedUnitId)
  currentUnitId.current = selectedUnitId
  const practitionerSession = useRef(0)
  const personnelActionSession = useRef(0)
  const currentPersonId = useRef(selectedPractitionerId)
  currentPersonId.current = selectedPractitionerId
  const currentApi = useRef(api)
  currentApi.current = api
  useEffect(() => {
    unitSession.current += 1; profileSession.current += 1; practitionerSession.current += 1; personnelActionSession.current += 1; setPractitionerDialog(undefined)
    setEmploymentDialog(undefined); setAssignmentDialog(undefined); setUnitDialog(undefined); setProfileDialog(undefined); setStatusConfirmation(undefined)
    setPositionDialog(false)
    setSelectedUnitId(undefined); setSelectedPractitionerId(undefined); setFilterUnitId('')
  }, [api])
  const treeItemRefs = useRef<Array<HTMLButtonElement | null>>([])
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
    mutationFn: async ({ unit, ...input }: { unit: OrganizationUnit } & Omit<OrganizationUnitInput, 'code' | 'sdOrgKind'>) => {
      if (!unitsReady || unit.id !== selectedUnitId) throw new Error('组织目录尚未确认，请重新加载')
      requireUnitOptions({ ...input, code: unit.code, sdOrgKind: unit.sdOrgKind }, confirmedEnums, organizationDictionaries)
      const existing = units.data, command = unitUpdateCommand(unit, input, existing)
      return requireUpdatedUnit(await api.organization.updateUnit(unit.id, command), unit, input, existing)
    },
    onMutate: unitContext,
    onSuccess: (next, _input, context) => {
      if (!currentUnitAction(context)) return
      setUnitDialog(undefined); return refreshed(`已更新“${next.name}”`)
    },
    onError: unitFailed,
  })
  const addProfileItem = useMutation({
    mutationFn: async (input: OrganizationProfileInput) => {
      if (!profileDialog || !unitsReady || !organizationProfile.isSuccess || organizationProfile.isFetching
        || selectedTreeUnit?.id !== profileDialog.unit.id) throw new Error('组织治理档案尚未确认，请重新加载')
      const unit = profileDialog.unit, before = organizationProfile.data, command = { ...input }
      requireProfileDictionarySelection(command, unit, organizationDictionaries)
      assertNewProfileItem(before, unit, command)
      return requireCreatedProfileItem(await api.organization.addProfileItem(unit, command), unit, before, command)
    },
    onMutate: () => { setFeedback(''); setOperationError(''); return { api, session: profileSession.current, unitId: profileDialog?.unit.id } },
    onSuccess: async (_next, _input, context) => {
      if (context.api !== currentApi.current || context.session !== profileSession.current || context.unitId !== currentUnitId.current) return
      setProfileDialog(undefined); await refreshed('机构或科室扩展信息已保存')
    },
    onError: (error, _input, context) => {
      if (context?.api !== currentApi.current || context.session !== profileSession.current || context.unitId !== currentUnitId.current) return
      setOperationError(errorMessage(error))
      void queryClient.invalidateQueries({ queryKey: ['organization-profile'] })
    },
  })
  const profileSaveError = addProfileItem.context?.api === api && addProfileItem.context.session === profileSession.current
    && addProfileItem.context.unitId === selectedUnitId && addProfileItem.error
    ? `治理档案保存结果未确认：${errorMessage(addProfileItem.error)}。请重新核实记录后再操作。` : undefined
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
  const currentUnitStaff = useMemo(() => {
    if (!selectedTreeUnit) return []
    return (assignments.data ?? []).filter((a) => {
      if (selectedTreeUnit.sdOrgKind === 'ORG_UNIT') {
        return a.departmentId === selectedTreeUnit.id
      }
      return a.organizationId === selectedTreeUnit.id
    })
  }, [selectedTreeUnit, assignments.data])

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
  const queryError = units.error || practitioners.error || assignments.error || positions.error || systemEnums.error
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
        <PanelHead title="组织树" meta={unitsReady ? `${units.data.length} 个节点` : '数量待确认'}
          actions={<Button size="sm" disabled={!unitsReady || busy} onClick={() => { beginUnitAction(); setUnitDialog({ mode: 'create' }) }}>
            <Icon name="add" />新建组织</Button>} />
        <SearchField className="master-catalog__search" label="搜索组织" value={query}
          onChange={setQuery} placeholder="搜索名称或代码" />
        </>}>
        <div className="master-tree" role="tree" aria-label="组织节点">
          {!unitsReady && <DirectoryState title="组织目录" loading={units.isFetching || units.isPending} onRetry={() => units.refetch()} />}
          {unitsReady && treeRows.map(({ unit, depth }, index) => <button role="treeitem" aria-level={depth + 1}
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
          {unitsReady && !treeRows.length && <EmptyState icon="settings" title={query ? '未找到匹配组织' : '暂无组织节点'}
            copy={query ? '请调整名称或代码，或清空搜索条件。' : '先创建法定机构，再在其下维护院区或科室。'} />}
        </div>
      </WorkspacePane>
      <WorkspacePane label="组织详情" className="master-detail" resetScrollKey={selectedUnitId}
        header={selectedUnit && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">{selectedUnit.sdOrgKindText}</span>
            <h2>{selectedUnit.name}</h2><code>{selectedUnit.code}</code></div><div>
            <Button variant="secondary" disabled={busy} onClick={() => { beginUnitAction(); setUnitDialog({ mode: 'create', parentId: selectedUnit.id }) }}>
              新增下级</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { beginUnitAction(); setUnitDialog({ mode: 'edit', unit: selectedUnit }) }}>编辑</Button>
            <Button variant={selectedUnit.sdOrgStatus === 'ACTIVE' ? 'danger' : 'secondary'} busy={unitStatus.isPending} disabled={busy}
              onClick={() => { beginUnitAction(); setStatusConfirmation({ kind: 'unit', value: selectedUnit }) }}>
              {selectedUnit.sdOrgStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
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
              <span className="master-facts-bar__label">{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室性质' : '机构性质'}</span>
              <span className="master-facts-bar__value">
                {selectedUnit.sdOrgKind === 'ORG_UNIT'
                  ? (selectedUnit.sdDepartmentPropertyText || selectedUnit.sdDepartmentProperty || '未维护科室性质')
                  : (selectedUnit.sdOrgPropertyText || selectedUnit.sdOrgProperty || '未维护机构性质')}
              </span>
            </div>
            <div className="master-facts-bar__item">
              <span className="master-facts-bar__label">任职记录数</span>
              <span className="master-facts-bar__value master-facts-bar__value--highlight">
                {assignmentsReady ? `${currentUnitStaff.length} 条` : '待确认'}
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
            <section className="master-detail-split__main" aria-label="任职记录工作区">
              <div className="master-section-head">
                <div>
                  <h3>{selectedUnit.sdOrgKind === 'ORG_UNIT' ? '科室任职记录' : '机构任职记录'}</h3>
                  <span>{assignmentsReady ? (currentUnitStaff.length > 0 ? `共 ${currentUnitStaff.length} 条任职记录` : '当前组织下暂无任职记录') : '任职记录尚未确认'}</span>
                </div>
                <div>
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
                            return (
                              <tr key={member.id}>
                                <td><strong>{member.practitionerName || '—'}</strong><code>{member.practitionerCode || '—'}</code></td>
                                <td>{member.positionName}</td>
                                <td>{member.sdAssignmentTypeText}</td>
                                <td>
                                  <StatusBadge tone="neutral">未核验</StatusBadge>
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
            <aside className="master-detail-split__side" aria-label="科室业务属性与档案治理">
              {organizationProfile.isPending || organizationProfile.isFetching ? (
                <LoadingState label="正在加载组织治理档案…" />
              ) : organizationProfile.isError ? (
                <div role="alert"><p>组织治理档案加载失败，尚未核验</p>
                  <Button size="sm" variant="secondary" onClick={() => void reloadOrganizationProfile(selectedUnit)}>重试组织档案</Button>
                </div>
              ) : (
                <DepartmentGovernancePanel
                  unit={selectedUnit}
                  profile={organizationProfile.data!} busy={busy}
                  onAdd={section => {
                    if (busy) return
                    profileSession.current += 1; addProfileItem.reset(); setFeedback(''); setOperationError('')
                    setProfileDialog({ section, unit: selectedUnit })
                  }}
                />
              )}
            </aside>
          </div>
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
      <WorkspacePane label="人员详情" className="master-detail" resetScrollKey={selectedPractitionerId}
        header={selectedPractitioner && <>
          <header className="master-detail__head"><div><span className="ui-eyebrow">从业人员</span>
            <h2>{selectedPractitioner.fullName}</h2><code>{selectedPractitioner.code}</code></div><div>
            <Button variant="secondary" disabled={busy} onClick={() => openPractitioner(selectedPractitioner)}>编辑人员</Button>
            <Button variant={selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? 'danger' : 'secondary'}
              busy={practitionerStatus.isPending}
              disabled={busy} onClick={() => { beginPersonnelAction(); practitionerStatus.reset(); setStatusConfirmation({ kind: 'practitioner', value: selectedPractitioner }) }}>
              {selectedPractitioner.sdPersonnelStatus === 'ACTIVE' ? '停用' : '启用'}</Button>
          </div></header>
        </>}>

        {selectedPractitionerId && !detailReady ? (
          <DirectoryState title="人员档案" loading={practitionerDetail.isPending || practitionerDetail.isFetching || practitioners.isFetching} onRetry={async () => { await Promise.all([practitioners.refetch(), reloadDetail()]) }} />
        ) : !selectedPractitioner ? (
          <EmptyState icon="residents" title="选择人员" copy="查看聘用关系、临床资质与业务档案。" />
        ) : (
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
          disabled={statusConfirmation.kind === 'unit' ? !unitsReady || selectedUnitId !== statusConfirmation.value.id : !detailReady}
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
    </Dialog>}

    {unitDialog && <UnitDialog state={unitDialog} units={units.data ?? []} enums={confirmedEnums} dictionaries={organizationDictionaries}
      properties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.property) ?? []}
      departmentProperties={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentProperty) ?? []}
      departmentTypes={organizationDictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []}
      available={unitsReady && (unitDialog.mode === 'create' || selectedUnitId === unitDialog.unit.id)}
      saveError={unitDialog.mode === 'create' ? unitError(createUnit) : unitError(updateUnit)} onRefresh={reloadUnitOptions}
      busy={busy} onClose={() => { if (!busy) { unitSession.current += 1; setUnitDialog(undefined) } }} onCreate={(input) => createUnit.mutate(input)}
      onUpdate={(input) => updateUnit.mutate(input)} />}
    {profileDialog && <OrganizationProfileDialog section={profileDialog.section} organization={profileDialog.unit}
      available={unitsReady && organizationProfile.isSuccess && !organizationProfile.isFetching && selectedTreeUnit?.id === profileDialog.unit.id}
      onRefresh={() => reloadOrganizationProfile(profileDialog.unit)}
      units={units.data ?? []} dictionaries={organizationDictionaries} onReloadDictionaries={reloadOrganizationDictionaries} busy={busy} saveError={profileSaveError}
      onClose={() => { if (!busy) { profileSession.current += 1; setProfileDialog(undefined) } }} onSave={(input) => addProfileItem.mutate(input)} />}
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
    {positionDialog && <PositionDialog enums={confirmedEnums} busy={busy} available={positionsReady && enumAvailable(confirmedEnums, ORGANIZATION_SYSTEM_ENUM.positionType)} saveError={actionError(savePosition)} onRefresh={reloadDirectory}
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

function UnitDialog({ state, units, enums, dictionaries, properties, departmentProperties, departmentTypes, busy, available, saveError, onRefresh, onClose, onCreate, onUpdate }: {
  available: boolean; saveError?: string; onRefresh: () => Promise<unknown>
  dictionaries: Map<string, DictionaryValue[]>
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
  const availableDepartmentTypes = departmentTypeOptions(departmentTypes, structuralType)
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
  const submit = (value: UnitForm) => {
    if (busy || !available || !optionsReady) return
    if (editing) onUpdate({ unit: editing, ...common(value) })
    else onCreate({ code: value.code, sdOrgKind: value.sdOrgKind, ...common(value) })
  }
  return <Dialog eyebrow="组织主数据" title={editing ? '编辑组织节点' : '新建组织节点'} onClose={onClose} size="xwide"
    closeOnBackdrop={false} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button type="submit" form="unit-form" busy={busy} disabled={!available || !optionsReady}>保存组织</Button></>}>
    {!optionsReady && <DirectoryState title="组织类型与字典选项" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    {!available && <DirectoryState title="组织目录" loading={false} onRetry={onRefresh} />}
    <form id="unit-form" className="master-form master-form--unit" inert={busy || !available} onSubmit={handleSubmit(submit)}>
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
    </form>
  </Dialog>
}

function DepartmentGovernancePanel({ unit, profile, busy, onAdd }: {
  unit: OrganizationUnit; profile: OrganizationProfileResult; busy: boolean; onAdd: (section: OrganizationProfileSection) => void
}) {
  const isDept = unit.sdOrgKind === 'ORG_UNIT'
  const { contacts, responsibilities, relations, capabilities } = profile
  const identifiers = 'organization' in profile ? profile.identifiers : []
  const addresses = 'organization' in profile ? profile.addresses : []
  const recordStatus = (item: { sdDetailStatusText: string; validFrom: string; validTo?: string | null }) =>
    <small>记录状态：{item.sdDetailStatusText} · 有效期：{item.validFrom} 至 {item.validTo || '未设终止日期'}</small>

  return <>
    <article className="master-control-card">
      <header><h4><Icon name="clinical" />已登记服务能力</h4>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('capability')}>维护服务能力</Button></header>
      <p>以下为档案登记内容，实际业务权限需在对应业务模块核验。</p>
      {capabilities.length ? <dl className="master-prop-list">
        {capabilities.map(item => <div className="master-prop-item" key={item.id}>
          <dt>{item.sdCapabilityTypeText}</dt>
          <dd><StatusBadge tone="neutral">{item.sdVerifyStatusText}</StatusBadge>
            {item.qualificationBasisCode && <code>{item.qualificationBasisCode}</code>}
            {item.capabilityScope && <p>{item.capabilityScope}</p>}{recordStatus(item)}</dd>
        </div>)}
      </dl> : <p className="master-prop-empty">尚未登记服务能力，不能据此判断业务权限</p>}
    </article>

    <article className="master-control-card">
      <header><h4><Icon name="organization" />医保对照与法定标识</h4>
        {!isDept && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('identifier')}>维护标识</Button>}</header>
      <dl className="master-prop-list">
        <div className="master-prop-item"><dt>{isDept ? '医保标准科室代码' : '国家卫生机构分类码'}</dt><dd>未接入标准对照数据</dd></div>
        <div className="master-prop-item"><dt>医保定点联网状态</dt><dd><StatusBadge tone="neutral">未核验</StatusBadge></dd></div>
        <div className="master-prop-item"><dt>{isDept ? '科室内部代码' : '机构统一代码'}</dt><dd><code>{unit.code}</code></dd></div>
        {identifiers.map(item => <div className="master-prop-item" key={item.id}>
          <dt>{item.sdIdentifierTypeText}{item.primaryIdentifier ? ' · 主要' : ''}</dt>
          <dd><code>{item.identifierCode}</code><small>标识体系：{item.identifierSystem}</small>
            <StatusBadge tone="neutral">{item.sdVerifyStatusText}</StatusBadge>{recordStatus(item)}</dd>
        </div>)}
      </dl>
      {!isDept && !identifiers.length && <p className="master-prop-empty">尚未登记机构标识</p>}
    </article>

    <article className="master-control-card" aria-label="登记联系方式">
      <header><h4><Icon name="residents" />登记联系方式</h4>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('contact')}>维护联络</Button></header>
      {contacts.length ? <dl className="master-prop-list">
        {contacts.map(item => <div className="master-prop-item" key={item.id}>
          <dt>{item.sdContactTypeText} · {item.sdContactUseText}{item.primaryContact ? ' · 主要' : ''}</dt>
          <dd><code>{item.contactValue}</code>{recordStatus(item)}</dd>
        </div>)}
      </dl> : <p className="master-prop-empty">尚未登记联系方式</p>}
    </article>

    <article className="master-control-card" aria-label="登记负责人">
      <header><h4><Icon name="residents" />登记负责人</h4>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('responsibility')}>维护负责人</Button></header>
      {responsibilities.length ? <dl className="master-prop-list">
        {responsibilities.map(item => <div className="master-prop-item" key={item.id}>
          <dt>{item.sdResponsibilityTypeText}{item.primaryResponsibility ? ' · 主要' : ''}</dt>
          <dd><strong>{item.responsibleName}</strong>{recordStatus(item)}</dd>
        </div>)}
      </dl> : <p className="master-prop-empty">尚未登记负责人</p>}
    </article>

    {!isDept && <article className="master-control-card" aria-label="登记地址">
      <header><h4><Icon name="organization" />登记地址</h4>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAdd('address')}>维护地址</Button></header>
      {addresses.length ? <dl className="master-prop-list">
        {addresses.map(item => <div className="master-prop-item" key={item.id}>
          <dt>{item.sdAddressTypeText}</dt>
          <dd><span>{item.streetAddress}</span>
            <small>国家代码：{item.countryCode}{item.postalCode ? ` · 邮政编码：${item.postalCode}` : ''}</small>{recordStatus(item)}</dd>
        </div>)}
      </dl> : <p className="master-prop-empty">尚未登记地址</p>}
    </article>}

    {relations.length > 0 && <details className="master-legacy-details">
      <summary>查看关联协作记录 ({relations.length} 条)</summary>
      <dl className="master-prop-list">{relations.map(item => <div key={item.id} className="master-prop-item">
        <dt>{item.sdRelationTypeText}{item.primaryRelation ? ' · 主要' : ''}</dt>
        <dd>{'targetDepartmentName' in item ? item.targetDepartmentName : item.targetOrganizationName}
          {item.description && <p>{item.description}</p>}{recordStatus(item)}</dd>
      </div>)}</dl>
    </details>}
  </>
}

function PractitionerWorkbench({
  practitioner,
  employments,
  assignments,
  positions,
  relationshipsReady, directoryState,
  onAddEmployment,
  onAddAssignment,
  onManagePositions,
}: {
  practitioner: Practitioner
  employments: Employment[]
  assignments: PersonnelAssignment[]
  positions: Position[]
  relationshipsReady: boolean
  directoryState?: React.ReactNode
  onAddEmployment: () => void
  onAddAssignment: () => void
  onManagePositions: () => void
}) {
  const primaryAssignment = onlyPrimary(assignments, 'assignment')
  const primaryEmployment = onlyPrimary(employments, 'employment')


  return (
    <>
      {directoryState}
      {/* 顶部高密度业务概览条 */}
      <div className="master-facts-bar">
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">主要任职岗位</span>
          <span className="master-facts-bar__value">
            {primaryAssignment
              ? primaryAssignment.positionName
              : assignments.some(item => item.primaryAssignment) ? '多条主要任职，详见下表' : '未设置主要任职'}
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">主要任职科室</span>
          <span className="master-facts-bar__value">
            {primaryAssignment
              ? `${primaryAssignment.organizationName} · ${primaryAssignment.departmentName}`
              : assignments.some(item => item.primaryAssignment) ? '多条主要任职，详见下表' : '未设置主要任职'}
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">核心处方准入</span>
          <span className="master-facts-bar__value master-facts-bar__value--highlight">
            未核验
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">执业与医保状态</span>
          <span className="master-facts-bar__value">
            <StatusBadge tone="neutral">执业与医保未核验</StatusBadge>
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">CA 电子印章</span>
          <span className="master-facts-bar__value">
            <StatusBadge tone="neutral">数字证书未核验</StatusBadge>
          </span>
        </div>
        <div className="master-facts-bar__item">
          <span className="master-facts-bar__label">人员状态</span>
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

            </header>
            <div className="master-switch-list">
              <p>尚无已核验的处方权限记录，不能依据岗位名称判断普通处方、麻精药品或抗菌药物处方权限。</p>
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
                <Button size="sm" variant="secondary" disabled={!relationshipsReady} onClick={onManagePositions}>维护岗位</Button>
                <Button size="sm" disabled={!relationshipsReady || !employments.some(item => item.sdPersonnelStatus === 'ACTIVE') || !positions.some(item => item.sdPersonnelStatus === 'ACTIVE')} onClick={onAddAssignment}>新增任职</Button>
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
              <Button size="sm" variant="secondary" disabled={!relationshipsReady || practitioner.sdPersonnelStatus !== 'ACTIVE'} onClick={onAddEmployment}>新增聘用</Button>
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
                        ) : '非主要聘用'}
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
          <p>以下证书、医保、数字认证与联络资料尚未接入读取，不能据此判断是否已登记。</p>
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
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>医师资格证书编码</dt>
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>法定执业范围</dt>
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>执业级别</dt>
                <dd>未核验</dd>
              </div>
              <div className="master-prop-item">
                <dt>主要聘用机构</dt>
                <dd>{primaryEmployment?.organizationName || (employments.some(item => item.primaryEmployment) ? '多条主要聘用，详见聘用记录' : '未设置主要聘用')}</dd>
              </div>
              <div className="master-prop-item">
                <dt>电子化注册状态</dt>
                <dd><StatusBadge tone="neutral">未核验</StatusBadge></dd>
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
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>医保定点联网状态</dt>
                <dd><StatusBadge tone="neutral">未核验</StatusBadge></dd>
              </div>
              <div className="master-prop-item">
                <dt>医保服务结算类别</dt>
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>实名监管准入</dt>
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>医保信用考核分值</dt>
                <dd>尚未接入</dd>
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
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>证书序列号 (Key ID)</dt>
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>合规手写签名印章</dt>
                <dd><StatusBadge tone="neutral">未核验</StatusBadge></dd>
              </div>
              <div className="master-prop-item">
                <dt>证书有效期限</dt>
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>病历处方签名互认</dt>
                <dd><StatusBadge tone="neutral">未核验</StatusBadge></dd>
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
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>移动联络电话</dt>
                <dd><code>尚未接入</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>最高学历与专业</dt>
                <dd>尚未接入</dd>
              </div>
              <div className="master-prop-item">
                <dt>人员系统代码</dt>
                <dd><code>{practitioner.code}</code></dd>
              </div>
              <div className="master-prop-item">
                <dt>生理性别</dt>
                <dd>{practitioner.sdPractGenderText ?? '未填写'}</dd>
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
    if (!value[field].trim()) context.addIssue({ code: 'custom', path: [field], message })
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

function OrganizationProfileDialog({ section, organization, units, dictionaries, onReloadDictionaries, busy, available, saveError, onRefresh, onClose, onSave }: {
  onReloadDictionaries: () => Promise<void>
  section: OrganizationProfileSection; organization: OrganizationUnit; units: OrganizationUnit[]
  dictionaries: Map<string, DictionaryValue[]>; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void
  onSave: (input: OrganizationProfileInput) => void
}) {
  const initialDraft = (kind: OrganizationProfileSection): ProfileForm => ({
    section: kind, firstCode: kind === 'address' ? 'CN' : '',
    secondCode: '', thirdCode: '', fourthCode: '', fifthCode: '', sixthCode: '', dictionaryType: '', dictionaryUse: '',
    targetOrganizationId: '', description: '', primary: true, sortOrder: 0, validFrom: today(), validTo: '', verifyStatus: '',
  })
  const drafts = useRef<Partial<Record<OrganizationProfileSection, ProfileForm>>>({})
  const { control, register, handleSubmit, watch, getValues, reset, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema), defaultValues: initialDraft(section),
  })
  const current = watch('section')
  function changeSection(value: string) {
    const next = z.enum(['identifier', 'contact', 'address', 'relation', 'capability', 'responsibility']).parse(value)
    drafts.current[current] = getValues()
    reset(drafts.current[next] ?? initialDraft(next))
  }
  const department = organization.sdOrgKind === 'ORG_UNIT'
  const options = (code: string) => dictionaries.get(code) ?? []
  const requiredDictionaries = profileDictionaryCodes(current, department)
  const dictionaryCode = requiredDictionaries[0]
  const dictionariesConfirmed = requiredDictionaries.every(code => dictionaries.has(code))
  const dictionariesAvailable = dictionariesConfirmed && requiredDictionaries.every(code => options(code).length > 0)
  const sectionOptions = department ? [
    { value: 'contact', label: '联系方式' }, { value: 'relation', label: '科室关系' },
    { value: 'capability', label: '服务能力' }, { value: 'responsibility', label: '负责人' },
  ] : [
    { value: 'identifier', label: '机构标识' }, { value: 'contact', label: '联系方式' },
    { value: 'address', label: '地址' }, { value: 'relation', label: '机构关系' },
    { value: 'capability', label: '服务能力' }, { value: 'responsibility', label: '负责人' },
  ]
  const submit = (value: ProfileForm) => { if (!available || !dictionariesAvailable || busy) return; onSave(profileInput(value)) }
  return <Dialog eyebrow={department ? '科室档案' : '机构档案'} title={`完善 ${organization.name} 的扩展信息`} onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form="profile-form" busy={busy} disabled={!available || !dictionariesAvailable}>保存档案</Button></>}>
    {!available && <DirectoryState title="组织治理档案" loading={false} onRetry={onRefresh} />}
    {saveError && <PersonnelWriteError error={saveError} busy={busy} onRefresh={onRefresh} />}
    {!dictionariesAvailable && <div role="alert"><p>{dictionariesConfirmed
      ? '当前资料类别没有可用字典选项，需维护字典后再保存。'
      : '当前资料类别的字典尚未确认，不能使用旧选项或默认值保存。'}</p>
      <Button variant="secondary" disabled={busy} onClick={() => void onReloadDictionaries()}>重新加载档案字典</Button></div>}
    <form id="profile-form" inert={busy || !available} className="master-form" onSubmit={handleSubmit(submit)}>
      <FormField label="资料类别"><Select value={current} onChange={changeSection} showValue clearable={false}
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
      {current !== 'address' && current !== 'capability' && <label className="master-check"><input type="checkbox" {...register('primary')} />设为主要记录</label>}
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
    if (initialDeptUnit?.parentId) return initialDeptUnit.parentId
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
      sdPractGender: value?.sdPractGender ?? 'UNKNOWN',
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
      (u) => u.sdOrgKind === 'ORG_UNIT' && (!selectedOrgId || u.parentId === selectedOrgId) && u.sdOrgStatus === 'ACTIVE'
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
      size="xwide"
      className="master-practitioner-dialog"
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
      <form id="practitioner-form" className="master-form master-form--practitioner" inert={busy} onSubmit={handleSubmit(input => {
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
              <FormField label="移动联络电话" error={errors.phone?.message}>
                <input disabled {...register('phone')} maxLength={20} placeholder="暂不支持维护" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="居民身份证号" error={errors.idCard?.message}>
                <input disabled {...register('idCard')} maxLength={18} placeholder="暂不支持维护" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="最高学历与院校专业" error={errors.education?.message}>
                <input disabled {...register('education')} placeholder="暂不支持维护" />
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
                <span>新增人员时指定聘用机构、科室与岗位，系统将一次性建立正式主聘用、主任职和100%工作量配置；任一步失败均不保存。</span>
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
                <FormSelect control={control} name="professionCategory" disabled placeholder="暂不支持维护" clearable={false} options={PROFESSION_CATEGORIES} />
              </FormField>
              <FormField label="专业技术职称">
                <FormSelect control={control} name="professionalTitle" disabled placeholder="暂不支持维护" clearable={false} options={PROFESSIONAL_TITLES} />
              </FormField>
              <FormField className="master-form-grid__span-2" label="核心处方准入级别">
                <FormSelect control={control} name="prescriptionPrivilege" disabled placeholder="暂不支持维护" clearable={false} options={PRESCRIPTION_PRIVILEGES} />
              </FormField>
              <FormField label="医师/护士执业证书编码" hint="15位全国统一电子执业注册编码">
                <input disabled {...register('licenseNumber')} maxLength={30} placeholder="暂不支持维护" />
              </FormField>
              <FormField label="医师/护士资格证书编码" hint="27位全国卫生专业资格证编码">
                <input disabled {...register('qualificationNumber')} maxLength={30} placeholder="暂不支持维护" />
              </FormField>
              <FormField className="master-form-grid__span-2" label="法定执业专业范围">
                <FormSelect control={control} name="practiceScope" disabled placeholder="暂不支持维护" clearable={false} options={PRACTICE_SCOPES} />
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
                <input disabled {...register('insuranceDoctorCode')} maxLength={50} placeholder="暂不支持维护" />
              </FormField>
              <FormField label="CA 数字证书 Key ID" hint="卫生数字证书密钥序列号 (电子印章与时间戳)">
                <input disabled {...register('caCertId')} maxLength={50} placeholder="暂不支持维护" />
              </FormField>
              <div className="master-form-grid__span-2 master-form-ca-note">
                <Icon name="credential" />
                <span>资质、联络资料与数字证书暂不支持维护；本次仅保存基础人员信息。聘用及任职变更请使用详情页的对应操作。</span>
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

function PositionDialog({ enums, busy, available, saveError, onRefresh, onClose, onSave }: { enums?: SystemEnumDefinition[]; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void; onSave: (input: { code: string; name: string; sdPositionType: PositionType; dutyDescription?: string }) => void }) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<PositionForm>({ resolver: zodResolver(positionSchema), defaultValues: { code: '', name: '', sdPositionType: 'CLINICAL', dutyDescription: '' } })
  return <Dialog eyebrow="标准岗位" title="新增标准岗位" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form="position-form" busy={busy} disabled={!available}>保存岗位</Button></>}>
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
  primaryAssignment: z.boolean(), workloadPercent: z.string(), validFrom: z.string().min(1), validTo: z.string() })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, { path: ['validTo'], message: '结束日期不能早于开始日期' })
type AssignmentForm = z.infer<typeof assignmentSchema>

function AssignmentDialog({ employments, units, positions, enums, busy, available, saveError, onRefresh, onClose, onSave }: { employments: Array<{ id: string; code: string; organizationId: string; organizationName: string; hireDate: string; leaveDate?: string | null }>; units: OrganizationUnit[]; positions: Array<{ id: string; code: string; name: string }>; enums?: SystemEnumDefinition[]; busy: boolean; available: boolean; saveError?: string; onRefresh: () => Promise<void>; onClose: () => void; onSave: (input: AssignmentInput) => void }) {
  const firstEmployment = employments[0]
  const firstUnit = units.find((item) => firstEmployment && belongsToOrganization(item, firstEmployment.organizationId, units))
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<AssignmentForm>({ resolver: zodResolver(assignmentSchema), defaultValues: { employmentId: firstEmployment?.id ?? '', organizationId: firstEmployment?.organizationId ?? '', departmentId: firstUnit?.id ?? '', positionId: positions[0]?.id ?? '', code: '', sdAssignmentType: 'PRIMARY', specialtyCode: '', primaryAssignment: true, workloadPercent: '100', validFrom: firstEmployment?.hireDate ?? today(), validTo: '' } })
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
      workloadPercent: value.workloadPercent ? Number(value.workloadPercent) : undefined, validTo: value.validTo || undefined }) })}>
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

  const typeCode = unit.sdDepartmentType?.trim() || ''
  const typeText = unit.sdDepartmentTypeText?.trim() || ''
  const configuredName = departmentTypes?.find((item) => item.code === typeCode)?.name
  if (configuredName) return configuredName
  if (typeText && typeText !== typeCode && !CLINICAL_DEPARTMENT_TYPE_LABELS[typeText]) return typeText
  return CLINICAL_DEPARTMENT_TYPE_LABELS[typeCode] || CLINICAL_DEPARTMENT_TYPE_LABELS[typeText]
    || typeText || typeCode || '未维护科室类型'

}
