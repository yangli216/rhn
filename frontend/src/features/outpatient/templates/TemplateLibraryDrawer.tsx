import { MedicalInsertViewerModal, type MedicalInsertTarget } from '../ai/MedicalInsertViewerModal'
import { ServiceInsertButton } from '../ai/ServiceInsertButton'
import { mergeNoteTemplateContent, noteTemplateFields, type NoteTemplateField } from "../record/NoteTemplateBar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DiagnosisInput } from "../../../shared/api/encountersApi";
import type { OutpatientPlanTemplate, MinedPlanSuggestion, HistoricalStablePlan, SaveOutpatientPlanTemplateInput } from "../../../shared/api/outpatientPlanTemplatesApi";
import { requireCreatedPlanReceipt, requireUsedPlanReceipt, requireUsedNoteReceipt, requireNoTemplateOrderConflicts, requirePlanCreationInput, templateApiScope, describeTemplateApplication, type SkippedTemplateItem } from "./templateApplicationReceipt";
import { useTemplateApplication } from "./useTemplateApplication";
import { canSelectHistoricalPlanDifference, hasHistoricalReviewEvidence, selectHistoricalPlanDifferences } from "./historicalPlanSelection";
import { resolveTemplateOrders, resolveTemplateOrdersTolerant, type ToleratedTemplateOrders } from "./resolveTemplateOrders";
import { resolveOrderSetRows, orderSetStaticIssue } from "../orders/orderSetImport";
import type { ItemGroup } from "../../../shared/api/masterDataApi";
import { NotePreviewSection, OrderGroupBar, PreviewZone, RowFlags, filledNoteFields } from "./TemplatePreviewParts";
import {
  defaultKindFilter, defaultSections, diagnosisCodeSet, draftOrderKeys, groupMatchesKeyword, groupMemberKey, initialGroupChecks,
  initialPlanChecks, kindPreference, kindRelevantTo, medicationDuplicateKey, planMedicationKey, planRelevantTo, planServiceKey,
  purposeLabel, rowFailureKey, serviceDuplicateKey, type LibraryKind, type LibraryKindFilter, type OrderSetPreselect, type TemplatePurpose,
} from "./templateLibrary";
import { legacyOrderSetOwnerLabel, templateScopeLabel, templateScopeTone, templateTypeLabel } from "./orderSetTemplate";
import { planSourceReferenceLabel } from "./planTaskPresentation";
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent } from "../../../shared/api/outpatientNoteTemplatesApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { historicalPlanDifferencePresentation } from "../../../shared/presentation";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, DataTable, EmptyState, FormField, LoadingState, Select, StatusBadge, SearchField, tableCellClass, TableShell, Tabs } from "../../../shared/ui";
import type { MedicationPlanDraft } from "../orders/medicationDraft";
import { type ServicePlanDraft } from "../UnifiedOrderListEditor";
import { stageTemplateDiagnoses } from '../workstation/workstationShared'

/**
 * 统一模板抽屉：病历模板、诊疗方案、医嘱组套在同一处检索和带入。
 * purpose 决定默认类型与默认勾选区（病历 / 诊断 / 医嘱），用户可自行切换类型与区段。
 */
export function TemplateLibraryDrawer({ purpose = 'DIAGNOSIS', initialPlanId, initialOrderSet, encounter, busy, allergyContext, allergies, allergyReady, readRecordDraft, diagnoses, setDiagnoses, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, api, onApplyNoteTemplate, onClose, onNotice }: {
  purpose?: TemplatePurpose
  initialPlanId?: string
  /** 医嘱录入框检索选中新医嘱组套：打开后切到“医嘱组套”并预选该组套。 */
  initialOrderSet?: OrderSetPreselect
  encounter: Encounter
  busy: boolean
  allergyContext: string
  allergies: AllergyIntolerance[]
  allergyReady: boolean
  readRecordDraft: () => string
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  medicationDrafts: MedicationPlanDraft[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  serviceDrafts: ServicePlanDraft[]
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  api: RhnApi
  onApplyNoteTemplate: (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => number
  onClose?: () => void
  onNotice?: (msg: string) => void
}) {
  const queryClient = useQueryClient()
  const encounterId = encounter.id
  const apiScope = templateApiScope(api)
  const queryScope = [apiScope, encounter.organizationId, encounter.departmentId]
  const [templateKind, setTemplateKind] = useState<LibraryKindFilter>(() => initialPlanId ? 'PLAN' : initialOrderSet ? 'ORDER_SET' : defaultKindFilter(purpose))
  // 病历 / 医嘱用途下“全部”默认只列相关模板；点击“显示全部”后取消用途过滤。
  const [showAllKinds, setShowAllKinds] = useState(false)
  const [inspectTarget, setInspectTarget] = useState<MedicalInsertTarget | null>(null)
  const [selectedKind, setSelectedKind] = useState<LibraryKind>(() => initialPlanId ? 'PLAN' : initialOrderSet ? 'ORDER_SET' : kindPreference(purpose)[0])
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState(initialPlanId ?? '')
  const [selectedNoteId, setSelectedNoteId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  // 医嘱组套有两个来源：临床模板库的新组套（TEMPLATE）和主数据里尚未迁移的旧组合（LEGACY，只读）。
  const [orderSetSource, setOrderSetSource] = useState<'TEMPLATE' | 'LEGACY'>('TEMPLATE')
  const [selectedOrderSetId, setSelectedOrderSetId] = useState(initialOrderSet?.id ?? '')
  useEffect(() => {
    if (initialPlanId) { setSelectedId(initialPlanId); setSelectedKind('PLAN') }
  }, [initialPlanId])
  useEffect(() => {
    if (!initialOrderSet) return
    setTemplateKind('ORDER_SET'); setSelectedKind('ORDER_SET'); setScopeFilter('ALL'); setSearchKeyword('')
    setOrderSetSource('TEMPLATE'); setSelectedOrderSetId(initialOrderSet.id)
  }, [initialOrderSet])
  // 当前预览的病历模板（独立病历模板，或方案配套病历）的段落勾选；覆盖 / 仅填空沿用 mergeNoteTemplateContent。
  const [checkedNoteFields, setCheckedNoteFields] = useState<Set<NoteTemplateField>>(new Set())
  const [overwriteNoteFields, setOverwriteNoteFields] = useState(false)
  const [selectedMinedKey, setSelectedMinedKey] = useState('')
  const [notice, setNotice] = useState('')
  // 带入时校验失败的明细：键为 来源|id|版本|行键。失败后该行不可勾选并显示原因，直到抽屉关闭或来源版本变化。
  const [rowFailures, setRowFailures] = useState<ReadonlyMap<string, string>>(new Map())

  // 标准方案明细勾选状态
  const [checkedDiagnosisCodes, setCheckedDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedMedicationKeys, setCheckedMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedServiceKeys, setCheckedServiceKeys] = useState<Set<string>>(new Set())
  // 医嘱组套成员勾选状态
  const [checkedGroupMembers, setCheckedGroupMembers] = useState<Set<string>>(new Set())

  // 复诊方案明细勾选状态
  const [checkedHistDiagnosisCodes, setCheckedHistDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedHistMedicationKeys, setCheckedHistMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedHistServiceKeys, setCheckedHistServiceKeys] = useState<Set<string>>(new Set())
  const [comparisonTemplateId, setComparisonTemplateId] = useState('')
  const [checkedComparisonKeys, setCheckedComparisonKeys] = useState<Set<string>>(new Set())
  const [comparisonSources, setComparisonSources] = useState<Map<string, 'HISTORICAL' | 'STANDARD'>>(new Map())

  // AI 挖掘方案明细勾选状态
  const [checkedMinedDiagnosisCodes, setCheckedMinedDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedMinedMedicationKeys, setCheckedMinedMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedMinedServiceKeys, setCheckedMinedServiceKeys] = useState<Set<string>>(new Set())

  const templates = useQuery({
    queryKey: ['outpatient-plan-templates', ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.list(),
    select: (values) => values.filter((value) => value.status === 'ACTIVE' && value.templateKind !== 'ORDER_SET'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  // 临床模板库里的新医嘱组套（kind=ORDER_SET）；与诊疗方案分开读取，诊疗方案接口缺省不含组套。
  const orderSetTemplates = useQuery({
    queryKey: ['outpatient-plan-templates', 'ORDER_SET', ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.list('', 'ORDER_SET'),
    select: (values) => values.filter((value) => value.status === 'ACTIVE' && value.templateKind === 'ORDER_SET'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  })

  const noteTemplates = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE', ...queryScope],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
  })

  // 医嘱组套（旧）：主数据里尚未迁移的“常用组合项目”，只读；加载失败只影响组套类型，不阻断方案与病历模板。
  const orderSets = useQuery({
    queryKey: ['outpatient-order-set-templates', ...queryScope],
    queryFn: async () => {
      const rows = await api.masterData.itemGroups('', 'ORDER_SET', 'ACTIVE')
      if (!Array.isArray(rows)) throw new Error('医嘱组套目录返回异常，请重试')
      return rows
    },
    refetchOnMount: 'always',
    retry: false,
  })

  const minedQuery = useQuery({
    queryKey: ['outpatient-mined-suggestions', ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.minedSuggestions(),
    enabled: false,
  })

  const historicalPlanQuery = useQuery({
    queryKey: ['historical-stable-plan', encounterId, encounter.residentId, ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.getHistoricalStablePlan(encounterId!),
    enabled: Boolean(encounterId) && (scopeFilter === 'ALL' || scopeFilter === 'HISTORICAL'),
  })

  const historicalComparisonQuery = useQuery({
    queryKey: ['historical-plan-comparison', encounterId, comparisonTemplateId, encounter.residentId, ...queryScope],
    queryFn: () => api.outpatientPlanTemplates.compareHistoricalPlan(encounterId!, comparisonTemplateId),
    enabled: Boolean(encounterId && comparisonTemplateId && historicalPlanQuery.data)
      && scopeFilter === 'HISTORICAL',
  })

  const lensOn = templateKind === 'ALL' && !showAllKinds && purpose !== 'DIAGNOSIS'
  const draftKeys = useMemo(() => draftOrderKeys(medicationDrafts, serviceDrafts), [medicationDrafts, serviceDrafts])
  const existingDiagnosisCodes = useMemo(() => diagnosisCodeSet(diagnoses), [diagnoses])

  const filteredTemplates = useMemo(() => {
    if (!templates.data) return []
    return templates.data.filter((value) => {
      if (scopeFilter !== 'ALL' && value.scopeType !== scopeFilter) return false
      if (lensOn && !planRelevantTo(purpose, value)) return false
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase()
        const matchName = value.name.toLowerCase().includes(kw)
        const matchDesc = value.description?.toLowerCase().includes(kw)
        const matchGuideline = value.guidelineReference?.toLowerCase().includes(kw)
        const matchDiag = value.diagnoses.some((d) => d.display.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw))
        const matchMed = value.medications.some((m) => m.medicationName.toLowerCase().includes(kw))
        if (!matchName && !matchDesc && !matchGuideline && !matchDiag && !matchMed) return false
      }
      return true
    })
  }, [templates.data, scopeFilter, searchKeyword, lensOn, purpose])

  const filteredNoteTemplates = useMemo(() => {
    if (!noteTemplates.data || (lensOn && !kindRelevantTo(purpose, 'NOTE'))) return []
    const keyword = searchKeyword.trim().toLowerCase()
    return noteTemplates.data.filter((value) => !keyword
      || value.name.toLowerCase().includes(keyword)
      || value.description?.toLowerCase().includes(keyword)
      || noteTemplateFields.some(({ key }) => value.content[key]?.toLowerCase().includes(keyword)))
  }, [noteTemplates.data, searchKeyword, lensOn, purpose])

  const filteredGroups = useMemo(() => {
    if (!orderSets.data || (lensOn && !kindRelevantTo(purpose, 'ORDER_SET'))) return []
    const keyword = searchKeyword.trim().toLowerCase()
    return orderSets.data.filter((value) => value.groupType === 'ORDER_SET' && value.status === 'ACTIVE'
      && (!keyword || groupMatchesKeyword(value, keyword)))
  }, [orderSets.data, searchKeyword, lensOn, purpose])

  const filteredOrderSetTemplates = useMemo(() => {
    if (!orderSetTemplates.data || (lensOn && !kindRelevantTo(purpose, 'ORDER_SET'))) return []
    const keyword = searchKeyword.trim().toLowerCase()
    return orderSetTemplates.data.filter((value) => !keyword || value.name.toLowerCase().includes(keyword)
      || value.description?.toLowerCase().includes(keyword)
      || value.medications.some((item) => item.medicationName.toLowerCase().includes(keyword))
      || value.services.some((item) => item.itemName.toLowerCase().includes(keyword) || item.itemCode.toLowerCase().includes(keyword)))
  }, [orderSetTemplates.data, searchKeyword, lensOn, purpose])

  const selected = useMemo(() => {
    return filteredTemplates.find((v) => v.id === selectedId)
      || (initialPlanId && selectedId === initialPlanId ? null : filteredTemplates[0]) || null
  }, [filteredTemplates, selectedId, initialPlanId])

  const selectedNote = useMemo(() => filteredNoteTemplates.find((value) => value.id === selectedNoteId)
    || filteredNoteTemplates[0] || null, [filteredNoteTemplates, selectedNoteId])
  const selectedGroup = useMemo(() => filteredGroups.find((value) => value.id === selectedGroupId)
    || filteredGroups[0] || null, [filteredGroups, selectedGroupId])
  // 预选的组套还没加载出来时不要先落到第一项，避免闪动和误勾选。
  const awaitingPreselect = Boolean(initialOrderSet && selectedOrderSetId === initialOrderSet.id && !orderSetTemplates.isSuccess)
  const selectedOrderSet = useMemo(() => filteredOrderSetTemplates.find((value) => value.id === selectedOrderSetId)
    || (awaitingPreselect ? null : filteredOrderSetTemplates[0]) || null, [awaitingPreselect, filteredOrderSetTemplates, selectedOrderSetId])

  // 当前详情区显示的类型：具体类型页签即该类型；“全部”页签跟随最近点选的卡片。
  const detailKind: LibraryKind = templateKind === 'ALL' ? selectedKind : templateKind
  const orderSetView: 'TEMPLATE' | 'LEGACY' = orderSetSource === 'LEGACY' && selectedGroup ? 'LEGACY'
    : selectedOrderSet ? 'TEMPLATE' : 'LEGACY'
  const showingOrderSetTemplate = detailKind === 'ORDER_SET' && orderSetView === 'TEMPLATE' && Boolean(selectedOrderSet)
  // 正在勾选明细行的模板：医嘱组套（新）或诊疗方案；两者共用同一套预览、勾选和带入路径。
  const lineTarget: OutpatientPlanTemplate | null = showingOrderSetTemplate ? selectedOrderSet : selected
  const selectedLinkedNoteTemplate = useMemo(() => lineTarget?.noteTemplateId
    ? noteTemplates.data?.find((value) => value.id === lineTarget.noteTemplateId) || null
    : null, [noteTemplates.data, lineTarget?.noteTemplateId])
  const showingPlanLines = detailKind === 'PLAN' && scopeFilter !== 'HISTORICAL' && scopeFilter !== 'MINED'
  const previewNote = detailKind === 'NOTE' ? selectedNote : showingPlanLines ? selectedLinkedNoteTemplate : null

  const kindCounts = { PLAN: filteredTemplates.length, NOTE: filteredNoteTemplates.length,
    ORDER_SET: filteredOrderSetTemplates.length + filteredGroups.length }
  // “全部”视图下当前类型没有可选项时，改选按用途排序的下一个有内容的类型
  const fallbackKind = templateKind === 'ALL' && !kindCounts[selectedKind]
    ? kindPreference(purpose).find((kind) => kindCounts[kind]) : undefined
  useEffect(() => { if (fallbackKind) setSelectedKind(fallbackKind) }, [fallbackKind])

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
  }, [selected, selectedId])

  useEffect(() => {
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id)
  }, [selectedNote, selectedNoteId])

  useEffect(() => {
    if (selectedGroup && selectedGroup.id !== selectedGroupId) setSelectedGroupId(selectedGroup.id)
  }, [selectedGroup, selectedGroupId])

  useEffect(() => {
    if (selectedOrderSet && selectedOrderSet.id !== selectedOrderSetId) setSelectedOrderSetId(selectedOrderSet.id)
  }, [selectedOrderSet, selectedOrderSetId])

  // 预选的组套在目录中找不到（已停用、改名或不在可见范围）：提示一次，改选列表中的第一项。
  const preselectChecked = useRef<OrderSetPreselect | undefined>(undefined)
  useEffect(() => {
    if (!initialOrderSet || !orderSetTemplates.isSuccess || preselectChecked.current === initialOrderSet) return
    preselectChecked.current = initialOrderSet
    if (!orderSetTemplates.data.some((value) => value.id === initialOrderSet.id)) setNotice('所选医嘱组套已不可用，请重新选择。')
  }, [initialOrderSet, orderSetTemplates.data, orderSetTemplates.isSuccess])

  const initializedNoteSelection = useRef<string | undefined>(undefined)
  const initializedPlanSelection = useRef<string | undefined>(undefined)
  const initializedGroupSelection = useRef<string | undefined>(undefined)
  const initializedMinedSelection = useRef<string | undefined>(undefined)
  const initializedHistoricalSelection = useRef<string | undefined>(undefined)
  // 病历段落默认勾选：独立病历模板全选有内容的段落；方案配套病历只在用途包含病历时默认勾选。
  const previewNoteKey = previewNote ? `${detailKind}:${detailKind === 'PLAN' ? selected?.id : ''}:${previewNote.id}` : ''
  useEffect(() => {
    if (initializedNoteSelection.current === previewNoteKey) return
    initializedNoteSelection.current = previewNoteKey
    setOverwriteNoteFields(false)
    setCheckedNoteFields(previewNote && (detailKind === 'NOTE' || defaultSections(purpose).record)
      ? filledNoteFields(previewNote) : new Set())
  }, [previewNoteKey, previewNote, detailKind, purpose])

  // 方案切换时按用途初始化勾选：已有诊断、与草稿重复的医嘱、已确认失效的行默认不勾选
  useEffect(() => {
    if (initializedPlanSelection.current === lineTarget?.id) return
    initializedPlanSelection.current = lineTarget?.id
    if (lineTarget) {
      const initial = initialPlanChecks(lineTarget, purpose, diagnoses, draftKeys, rowFailures)
      setCheckedDiagnosisCodes(initial.diagnoses)
      setCheckedMedicationKeys(initial.medications)
      setCheckedServiceKeys(initial.services)
    } else {
      setCheckedDiagnosisCodes(new Set())
      setCheckedMedicationKeys(new Set())
      setCheckedServiceKeys(new Set())
    }
  }, [lineTarget, purpose, diagnoses, draftKeys, rowFailures])

  useEffect(() => {
    if (initializedGroupSelection.current === selectedGroup?.id) return
    initializedGroupSelection.current = selectedGroup?.id
    setCheckedGroupMembers(selectedGroup ? initialGroupChecks(selectedGroup, draftKeys, rowFailures) : new Set())
  }, [selectedGroup, draftKeys, rowFailures])

  const selectedMined = useMemo(() => {
    if (!minedQuery.data?.length) return null
    return minedQuery.data.find((v) => v.patternKey === selectedMinedKey) || minedQuery.data[0] || null
  }, [minedQuery.data, selectedMinedKey])

  useEffect(() => {
    if (selectedMined && selectedMined.patternKey !== selectedMinedKey) {
      setSelectedMinedKey(selectedMined.patternKey)
    }
  }, [selectedMined, selectedMinedKey])

  // 挖掘方案切换时默认全选
  useEffect(() => {
    if (initializedMinedSelection.current === selectedMined?.patternKey) return
    initializedMinedSelection.current = selectedMined?.patternKey
    if (selectedMined) {
      setCheckedMinedDiagnosisCodes(new Set(selectedMined.diagnoses.map((d) => d.code)))
      setCheckedMinedMedicationKeys(new Set(selectedMined.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
      setCheckedMinedServiceKeys(new Set(selectedMined.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
    } else {
      setCheckedMinedDiagnosisCodes(new Set())
      setCheckedMinedMedicationKeys(new Set())
      setCheckedMinedServiceKeys(new Set())
    }
  }, [selectedMined])

  // 复诊方案加载或切换时默认全选
  useEffect(() => {
    const key = `${historicalPlanQuery.data?.encounterId ?? ''}|${historicalPlanQuery.data?.sourceEncounterId ?? ''}`
    if (initializedHistoricalSelection.current === key) return
    initializedHistoricalSelection.current = key
    if (historicalPlanQuery.data) {
      setCheckedHistDiagnosisCodes(new Set(historicalPlanQuery.data.diagnoses.map((d) => d.code)))
      setCheckedHistMedicationKeys(new Set(historicalPlanQuery.data.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
      setCheckedHistServiceKeys(new Set(historicalPlanQuery.data.services.map((s, idx) => `${s.catalogItemId || ''}-${idx}`)))
    } else {
      setCheckedHistDiagnosisCodes(new Set())
      setCheckedHistMedicationKeys(new Set())
      setCheckedHistServiceKeys(new Set())
    }
  }, [historicalPlanQuery.data])

  useEffect(() => {
    const candidates = templates.data ?? []
    if (!historicalPlanQuery.data || candidates.length === 0) return
    if (candidates.some((item) => item.id === comparisonTemplateId)) return
    const historyCodes = new Set(historicalPlanQuery.data.diagnoses.map((item) => item.code.toUpperCase()))
    const ranked = [...candidates].sort((left, right) => {
      const rightMatches = right.diagnoses.filter((item) => historyCodes.has(item.code.toUpperCase())).length
      const leftMatches = left.diagnoses.filter((item) => historyCodes.has(item.code.toUpperCase())).length
      return rightMatches - leftMatches || right.useCount - left.useCount || left.id.localeCompare(right.id)
    })
    setComparisonTemplateId(ranked[0]?.id ?? '')
  }, [comparisonTemplateId, historicalPlanQuery.data, templates.data])

  useEffect(() => {
    const differences = historicalComparisonQuery.data?.differences ?? []
    setCheckedComparisonKeys(new Set(differences.filter(item => canSelectHistoricalPlanDifference(item.status)).map((item) => item.key)))
    setComparisonSources(new Map(differences.map((item) => [item.key,
      item.historicalIndex == null ? 'STANDARD' : 'HISTORICAL'])))
  }, [historicalComparisonQuery.data])

  const application = useTemplateApplication(JSON.stringify({
    apiScope, purpose, encounter: [encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId, encounter.status],
    allergyContext, diagnoses, medicationDrafts, serviceDrafts,
    viewed: [selected, selectedOrderSet, selectedNote, selectedGroup, selectedLinkedNoteTemplate, selectedMined, historicalPlanQuery.data, historicalComparisonQuery.data],
    selection: [templateKind, selectedKind, scopeFilter, selectedId, selectedNoteId, selectedGroupId, selectedMinedKey, selectedOrderSetId, orderSetView,
      comparisonTemplateId, [...checkedDiagnosisCodes], [...checkedMedicationKeys], [...checkedServiceKeys],
      [...checkedGroupMembers], [...checkedNoteFields], overwriteNoteFields, [...checkedHistDiagnosisCodes],
      [...checkedHistMedicationKeys], [...checkedHistServiceKeys], [...checkedComparisonKeys], [...comparisonSources],
      [...checkedMinedDiagnosisCodes], [...checkedMinedMedicationKeys], [...checkedMinedServiceKeys]],
  }), busy || encounter.status !== 'IN_PROGRESS', readRecordDraft)

  /** 未被本次带入改变的病历段落（已有内容且未选择覆盖），用于回执中的“跳过”说明。 */
  function retainedNoteFields(note: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean): SkippedTemplateItem[] {
    let current: OutpatientNoteTemplateContent
    try { current = JSON.parse(readRecordDraft()) as OutpatientNoteTemplateContent } catch { return [] }
    const merged = mergeNoteTemplateContent(current, note.content, fields, overwrite)
    return noteTemplateFields.filter(({ key }) => fields.has(key) && merged[key] === current[key])
      .map(({ label }) => ({ label, reason: '已有内容，未覆盖' }))
  }

  /** 把本次校验失败的行记下来：预览中显示原因、取消勾选并禁止再勾选。 */
  function lockRows(kind: LibraryKind, id: string, revision: number, failures: Array<{ rowKey: string; reason: string }>) {
    if (!failures.length) return
    setRowFailures(current => new Map([...current, ...failures.map(({ rowKey, reason }): [string, string] =>
      [rowFailureKey(kind, id, revision, rowKey), reason])]))
    const failed = new Set(failures.map(item => item.rowKey))
    const without = (keys: Set<string>) => new Set([...keys].filter(key => !failed.has(key)))
    if (kind === 'PLAN') { setCheckedMedicationKeys(without); setCheckedServiceKeys(without) } else setCheckedGroupMembers(without)
  }

  interface PlanApplication {
    plan: OutpatientPlanTemplate; orders: ToleratedTemplateOrders; note?: OutpatientNoteTemplate
    noteFields: Set<NoteTemplateField>; overwrite: boolean
    /** 方案中被勾选的药品 / 项目行键（与 plan 中保留的行同序），用于把被跳过的行回写到预览。 */
    medicationKeys: string[]; serviceKeys: string[]; viewed?: OutpatientPlanTemplate
    /** 历史方案、挖掘习惯等“先保存为个人方案再带入”的流程沿用整批重复拒绝。 */
    rejectDuplicates?: boolean
  }

  function finishPlan({ plan, orders, note, noteFields, overwrite, medicationKeys, serviceKeys, viewed, rejectDuplicates }: PlanApplication) {
    if (rejectDuplicates) requireNoTemplateOrderConflicts(plan, medicationDrafts, serviceDrafts)
    const existing = diagnosisCodeSet(diagnoses)
    const newDiagnoses = plan.diagnoses.filter(item => !existing.has(item.code.toUpperCase()))
    const skipped: SkippedTemplateItem[] = [
      ...plan.diagnoses.filter(item => existing.has(item.code.toUpperCase())).map(item => ({ label: item.display, reason: '已在当前诊断中' })),
      ...orders.skipped.map(({ label, reason }) => ({ label, reason })),
      ...(note ? retainedNoteFields(note, noteFields, overwrite) : []),
    ]
    if (viewed) lockRows('PLAN', viewed.id, viewed.revision, orders.skipped.map(item => ({ reason: item.reason,
      rowKey: (item.kind === 'MEDICATION' ? medicationKeys : serviceKeys)[item.index] })).filter(item => item.rowKey))
    stageTemplateDiagnoses(plan.diagnoses, diagnoses, setDiagnoses)
    setMedicationDrafts(current => [...current, ...orders.medications])
    setServiceDrafts(current => [...current, ...orders.services])
    const appliedNoteFields = note ? onApplyNoteTemplate(note, noteFields, overwrite) : 0
    const outcome = describeTemplateApplication({ source: plan.name, skipped, applied: { diagnoses: newDiagnoses.length,
      medications: orders.medications.length, services: orders.services.length, noteFields: appliedNoteFields } })
    void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
    if (note) void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    if (outcome.changed) { setNotice(outcome.message); onNotice?.(outcome.message); onClose?.() }
    else if (skipped.length) application.reject(outcome.message)
    else setNotice(outcome.message)
  }

  const apply = {
    isPending: application.pending,
    mutate: (selection: OutpatientPlanTemplate) => {
      const viewed = lineTarget, linked = selectedLinkedNoteTemplate
      const sourceQuery = viewed?.templateKind === 'ORDER_SET' ? orderSetTemplates : templates
      const noteFields = new Set(checkedNoteFields), overwrite = overwriteNoteFields
      const includeNote = Boolean(viewed?.noteTemplateId) && noteFields.size > 0
      const medicationKeys = (viewed?.medications ?? []).map(planMedicationKey).filter(key => checkedMedicationKeys.has(key))
      const serviceKeys = (viewed?.services ?? []).map(planServiceKey).filter(key => checkedServiceKeys.has(key))
      void application.run(async isCurrent => {
        if (!viewed || sourceQuery.isFetching || sourceQuery.isError) {
          throw new Error(`${viewed?.templateKind === 'ORDER_SET' ? templateTypeLabel('ORDER_SET') : templateTypeLabel('PLAN')}目录尚未确认，请重新加载后带入。`)
        }
        if (includeNote && viewed.noteTemplateId && (!linked || noteTemplates.isFetching || noteTemplates.isError)) {
          throw new Error('所选配套病历模板不可用，本次未带入，请重新加载核对。')
        }
        const expected = structuredClone(viewed), selectedLines = structuredClone(selection)
        const expectedNote = includeNote && linked ? structuredClone(linked) : undefined
        const plan = requireUsedPlanReceipt(await api.outpatientPlanTemplates.use(expected.id), expected, selectedLines)
        if (!isCurrent()) return undefined
        const note = expectedNote ? requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expectedNote.id), expectedNote) : undefined
        if (!isCurrent()) return undefined
        const orders = await resolveTemplateOrdersTolerant(plan, encounter, api, allergies, allergyReady)
        return { plan, note, orders, noteFields, overwrite, medicationKeys, serviceKeys, viewed } satisfies PlanApplication
      }, result => { if (result) finishPlan(result) })
    },
  }

  const applyOrderSet = {
    isPending: application.pending,
    mutate: () => {
      const viewed = selectedGroup
      if (!viewed) return
      const memberIds = new Set(viewed.members.map(groupMemberKey).filter(key => checkedGroupMembers.has(key)))
      void application.run(async isCurrent => {
        if (orderSets.isFetching || orderSets.isError) throw new Error('医嘱组套目录尚未确认，请重新加载后带入。')
        const result = await resolveOrderSetRows(structuredClone(viewed), encounter, api, memberIds)
        return isCurrent() ? { viewed, result } : undefined
      }, payload => {
        if (!payload) return
        const { viewed: group, result } = payload
        lockRows('ORDER_SET', group.id, group.revision, result.skipped.map(item => ({ rowKey: item.memberId, reason: item.reason })))
        setServiceDrafts(current => [...current, ...result.drafts])
        const outcome = describeTemplateApplication({ source: result.name, applied: { services: result.drafts.length },
          skipped: result.skipped.map(({ label, reason }) => ({ label, reason })) })
        if (outcome.changed) { setNotice(outcome.message); onNotice?.(outcome.message); onClose?.() }
        else if (result.skipped.length) application.reject(outcome.message)
        else setNotice(outcome.message)
      })
    },
  }

  const applyNote = {
    isPending: application.pending,
    mutate: (value: OutpatientNoteTemplate) => {
      const fields = new Set(checkedNoteFields), overwrite = overwriteNoteFields
      void application.run(async () => {
        if (noteTemplates.isFetching || noteTemplates.isError || !fields.size) throw new Error('病历模板或勾选段落尚未确认，请重新加载核对。')
        const expected = structuredClone(value)
        return requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expected.id), expected)
      }, note => {
        const retained = retainedNoteFields(note, fields, overwrite)
        const applied = onApplyNoteTemplate(note, fields, overwrite)
        const msg = applied ? describeTemplateApplication({ source: note.name, skipped: retained, applied: { noteFields: applied } }).message
          : '所选病历段落未改变当前内容；如需替换已有段落，请选择覆盖后重新核对。'
        setNotice(msg)
        if (applied) onNotice?.(msg)
        void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
        if (applied) onClose?.()
      })
    },
  }

  function createReviewedPlan(input: SaveOutpatientPlanTemplateInput, applyToDraft: boolean) {
    void application.run(async isCurrent => {
      const expected = requirePlanCreationInput(structuredClone(input))
      const created = requireCreatedPlanReceipt(await api.outpatientPlanTemplates.create(expected), expected)
      if (!isCurrent()) return undefined
      const orders = applyToDraft ? await resolveTemplateOrders(created, encounter, api, allergies, allergyReady) : undefined
      return { created, orders }
    }, result => {
      if (!result) return
      const { created, orders } = result
      if (orders) finishPlan({ plan: created, orders: { ...orders, skipped: [] }, noteFields: new Set(), overwrite: false,
        medicationKeys: [], serviceKeys: [], rejectDuplicates: true })
      else {
        setNotice(`已将开方习惯保存为我的诊疗方案“${created.name}”。`)
        void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
      }
    })
  }
  const applyHistoricalMutation = {
    isPending: application.pending,
    mutate: (plan: HistoricalStablePlan) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.conditionTitle,
      description: plan.summary, sourceType: 'AI_INPUT', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, true),
  }
  const solidifyMinedMutation = {
    isPending: application.pending,
    mutate: (plan: MinedPlanSuggestion) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.suggestedName,
      description: plan.description, sourceType: 'AI_MINED', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, false),
  }
  const applyMinedMutation = {
    isPending: application.pending,
    mutate: (plan: MinedPlanSuggestion) => createReviewedPlan({ scopeType: 'PERSONAL', name: plan.suggestedName,
      description: plan.description, sourceType: 'AI_MINED', diagnoses: plan.diagnoses, medications: plan.medications, services: plan.services }, true),
  }

  // 勾选计数与调入处理
  const totalCheckedStandard = checkedDiagnosisCodes.size + checkedMedicationKeys.size + checkedServiceKeys.size
    + (lineTarget?.noteTemplateId && selectedLinkedNoteTemplate ? checkedNoteFields.size : 0)
  const totalCheckedGroup = checkedGroupMembers.size

  const handleApplyStandard = () => {
    if (!lineTarget) return
    const templateToApply: OutpatientPlanTemplate = {
      ...lineTarget,
      diagnoses: lineTarget.diagnoses.filter((d) => checkedDiagnosisCodes.has(d.code)),
      medications: lineTarget.medications.filter((m, idx) => checkedMedicationKeys.has(planMedicationKey(m, idx))),
      services: lineTarget.services.filter((s, idx) => checkedServiceKeys.has(planServiceKey(s, idx))),
    }
    apply.mutate(templateToApply)
  }

  const totalCheckedHist = checkedHistDiagnosisCodes.size + checkedHistMedicationKeys.size + checkedHistServiceKeys.size
  const effectiveHistoricalSelectionCount = historicalComparisonQuery.data
    ? checkedComparisonKeys.size : totalCheckedHist

  const handleApplyHistorical = () => {
    if (!historicalPlanQuery.data) return
    const comparison = historicalComparisonQuery.data
    if (!hasHistoricalReviewEvidence(historicalPlanQuery.data) || historicalPlanQuery.isFetching || historicalPlanQuery.isError || historicalPlanQuery.data.encounterId !== encounter.id
      || (comparisonTemplateId && (historicalComparisonQuery.isFetching || historicalComparisonQuery.isError || !comparison))) {
      application.reject('历史方案或比较结果尚未确认，请重新加载后带入。'); return
    }
    if (comparison) {
      try {
        applyHistoricalMutation.mutate(selectHistoricalPlanDifferences(comparison, encounter.id,
          comparisonTemplateId, checkedComparisonKeys, comparisonSources))
      } catch (error) { application.reject(errorMessage(error)) }
      return
    }
    const filtered: HistoricalStablePlan = {
      ...historicalPlanQuery.data,
      diagnoses: historicalPlanQuery.data.diagnoses.filter((d) => checkedHistDiagnosisCodes.has(d.code)),
      medications: historicalPlanQuery.data.medications.filter((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`)),
      services: historicalPlanQuery.data.services.filter((s, idx) => checkedHistServiceKeys.has(`${s.catalogItemId || ''}-${idx}`)),
    }
    applyHistoricalMutation.mutate(filtered)
  }

  const totalCheckedMined = checkedMinedDiagnosisCodes.size + checkedMinedMedicationKeys.size + checkedMinedServiceKeys.size

  const handleApplyMined = () => {
    if (!selectedMined) return
    if (minedQuery.isFetching || minedQuery.isError) {
      application.reject('挖掘方案尚未确认，请重新加载后带入。'); return
    }
    const filtered: MinedPlanSuggestion = {
      ...selectedMined,
      diagnoses: selectedMined.diagnoses.filter((d) => checkedMinedDiagnosisCodes.has(d.code)),
      medications: selectedMined.medications.filter((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`)),
      services: selectedMined.services.filter((s, idx) => checkedMinedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`)),
    }
    applyMinedMutation.mutate(filtered)
  }

  const error = application.error || templates.error || noteTemplates.error
    || historicalPlanQuery.error || historicalComparisonQuery.error || minedQuery.error
    || (historicalPlanQuery.data && !hasHistoricalReviewEvidence(historicalPlanQuery.data)
      ? '历史核对状态未返回，请重新加载历史方案后再带入。' : null)
    || (historicalComparisonQuery.data && !hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan)
      ? '历史比较核对状态未返回，请重新加载后再带入。' : null)

  const showingNoteTemplate = detailKind === 'NOTE'
  const showingOrderSet = detailKind === 'ORDER_SET' && !showingOrderSetTemplate
  const orderSetCount = (orderSetTemplates.data?.length ?? 0) + (orderSets.data?.length ?? 0)
  const kindTabs: Array<{ value: LibraryKindFilter; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部', meta: `(${lensOn ? kindCounts.PLAN + kindCounts.NOTE + kindCounts.ORDER_SET
      : (templates.data?.length ?? 0) + (noteTemplates.data?.length ?? 0) + orderSetCount})` },
    { value: 'PLAN', label: '诊疗方案', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
    { value: 'ORDER_SET', label: '医嘱组套', meta: orderSetCount ? `(${orderSetCount})` : undefined },
    { value: 'NOTE', label: '病历模板', meta: noteTemplates.data?.length ? `(${noteTemplates.data.length})` : undefined },
  ]

  const scopeTabs: Array<{ value: 'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
    { value: 'PERSONAL', label: templateScopeLabel('PERSONAL'), meta: templates.data?.filter(t => t.scopeType === 'PERSONAL').length ? `(${templates.data.filter(t => t.scopeType === 'PERSONAL').length})` : undefined },
    { value: 'DEPARTMENT', label: templateScopeLabel('DEPARTMENT'), meta: templates.data?.filter(t => t.scopeType === 'DEPARTMENT').length ? `(${templates.data.filter(t => t.scopeType === 'DEPARTMENT').length})` : undefined },
    { value: 'HOSPITAL', label: templateScopeLabel('HOSPITAL'), meta: templates.data?.filter(t => t.scopeType === 'HOSPITAL').length ? `(${templates.data.filter(t => t.scopeType === 'HOSPITAL').length})` : undefined },
    { value: 'HISTORICAL', label: '复诊成熟方案', meta: historicalPlanQuery.data ? '(1)' : undefined },
  ]

  const orderSetLoadError = <div className="doctor-plan-pool-empty-text" role="status">
    医嘱组套加载失败：{errorMessage(orderSets.error ?? orderSetTemplates.error)}
    <Button variant="text" size="sm" disabled={orderSets.isFetching || orderSetTemplates.isFetching}
      onClick={() => { void orderSets.refetch(); void orderSetTemplates.refetch() }}>重新加载组套</Button>
  </div>
  const renderNoteCard = (item: OutpatientNoteTemplate, metaLabel: string) => (
    <Button variant="text" size="sm" key={`note-${item.id}`} type="button"
      className={`doctor-plan-item-card ${detailKind === 'NOTE' && selectedNote?.id === item.id ? 'is-selected' : ''}`}
      onClick={() => { setSelectedNoteId(item.id); setSelectedKind('NOTE') }}>
      <div className="doctor-plan-item-card__top">
        <div className="doctor-plan-card-badges">
          <StatusBadge tone="info">{templateTypeLabel('NOTE')}</StatusBadge>
          <StatusBadge tone="neutral">{templateScopeLabel(item.scopeType)}</StatusBadge>
        </div>
        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
      </div>
      <div className="doctor-plan-item-card__title">{item.name}</div>
      {item.description && item.description !== item.name && item.description !== '门诊病历段落模板' && (
        <div className="doctor-plan-item-card__desc">{item.description}</div>
      )}
      <div className="doctor-plan-item-card__meta">
        <span>{metaLabel} {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
      </div>
    </Button>
  )
  const renderCompactPlanCard = (item: OutpatientPlanTemplate) => (
    <Button variant="text" size="sm" key={`plan-${item.id}`} type="button"
      className={`doctor-plan-item-card ${detailKind === 'PLAN' && selected?.id === item.id ? 'is-selected' : ''}`}
      onClick={() => { setSelectedId(item.id); setSelectedKind('PLAN') }}>
      <div className="doctor-plan-item-card__top">
        <div className="doctor-plan-card-badges">
          <StatusBadge tone="success">{templateTypeLabel('PLAN')}</StatusBadge>
          <StatusBadge tone="neutral">{templateScopeLabel(item.scopeType)}</StatusBadge>
        </div>
        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
      </div>
      <div className="doctor-plan-item-card__title">{item.name}</div>
      {item.description && item.description !== item.name && item.description !== '由医生审核确认的诊疗方案' && (
        <div className="doctor-plan-item-card__desc">{item.description}</div>
      )}
      <div className="doctor-plan-item-card__meta">
        {item.noteTemplateId && <><span>病历 1</span><span>·</span></>}
        <span>诊断 {item.diagnoses.length}</span><span>·</span>
        <span>药品 {item.medications.length}</span><span>·</span>
        <span>诊疗 {item.services.length}</span>
      </div>
    </Button>
  )
  const renderGroupCard = (item: ItemGroup) => {
    const issue = orderSetStaticIssue(item, encounter)
    return <Button variant="text" size="sm" key={`group-${item.id}`} type="button"
      className={`doctor-plan-item-card ${showingOrderSet && selectedGroup?.id === item.id ? 'is-selected' : ''}`}
      onClick={() => { setSelectedGroupId(item.id); setOrderSetSource('LEGACY'); setSelectedKind('ORDER_SET') }}>
      <div className="doctor-plan-item-card__top">
        <div className="doctor-plan-card-badges">
          <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
          <StatusBadge tone="success">{templateScopeLabel('HOSPITAL')}</StatusBadge>
          {issue && <StatusBadge tone="danger">不可用</StatusBadge>}
        </div>
        <small className="doctor-plan-card-meta-text">{item.code}</small>
      </div>
      <div className="doctor-plan-item-card__title">{item.name}</div>
      <div className="doctor-plan-item-card__meta"><span>项目 {item.members.length}</span><span>·</span><span>由医务科维护</span></div>
    </Button>
  }
  const renderOrderSetTemplateCard = (item: OutpatientPlanTemplate) => (
    <Button variant="text" size="sm" key={`orderset-${item.id}`} type="button"
      className={`doctor-plan-item-card ${showingOrderSetTemplate && selectedOrderSet?.id === item.id ? 'is-selected' : ''}`}
      onClick={() => { setSelectedOrderSetId(item.id); setOrderSetSource('TEMPLATE'); setSelectedKind('ORDER_SET') }}>
      <div className="doctor-plan-item-card__top">
        <div className="doctor-plan-card-badges">
          <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
          <StatusBadge tone={templateScopeTone(item.scopeType)}>{templateScopeLabel(item.scopeType)}</StatusBadge>
        </div>
        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
      </div>
      <div className="doctor-plan-item-card__title">{item.name}</div>
      {item.description && item.description !== item.name && (
        <div className="doctor-plan-item-card__desc">{item.description}</div>
      )}
      <div className="doctor-plan-item-card__meta"><span>药品 {item.medications.length}</span><span>·</span><span>项目 {item.services.length}</span></div>
    </Button>
  )
  // 医嘱组套列表：先显示临床模板库的新组套，再显示主数据里尚未迁移的旧组合。
  const renderOrderSetCards = () => <>
    {filteredOrderSetTemplates.map(renderOrderSetTemplateCard)}
    {filteredGroups.map(renderGroupCard)}
  </>
  const orderSetListError = orderSets.isError || orderSetTemplates.isError

  const renderPlanOrdersZone = (plan: OutpatientPlanTemplate) => (
    <PreviewZone title="医嘱" meta={plan.templateKind === 'ORDER_SET'
      ? '按行勾选；组套设为“不默认勾选”的行初始不勾；与当前医嘱草稿重复的行标“重复”，默认不勾选'
      : '按来源分组；与当前医嘱草稿重复的行标“重复”，默认不勾选'}>
    {(() => {
      const failureOf = (key: string) => rowFailures.get(rowFailureKey('PLAN', plan.id, plan.revision, key))
      const rows = [...plan.medications.map((m, idx) => ({ key: planMedicationKey(m, idx), duplicate: draftKeys.has(medicationDuplicateKey(m)) })),
        ...plan.services.map((s, idx) => ({ key: planServiceKey(s, idx), duplicate: draftKeys.has(serviceDuplicateKey(s)) }))]
      const selectable = rows.filter(row => !row.duplicate && !failureOf(row.key))
      const checkedRows = selectable.filter(row => checkedMedicationKeys.has(row.key) || checkedServiceKeys.has(row.key))
      return <OrderGroupBar title={plan.templateKind === 'ORDER_SET' ? plan.name : '方案自有'} total={rows.length} selectable={selectable.length} selected={checkedRows.length}
        disabled={apply.isPending} hint="整组勾选不含重复行" onToggle={() => {
          const all = checkedRows.length >= selectable.length
          const toggle = (keys: Set<string>) => {
            const next = new Set(keys)
            selectable.forEach(row => { if (all) next.delete(row.key); else next.add(row.key) })
            return next
          }
          setCheckedMedicationKeys(toggle); setCheckedServiceKeys(toggle)
        }} />
    })()}
    <div className="doctor-plan-detail-section">
      <div className="doctor-plan-detail-section__title">处方药品列表 ({plan.medications.length})</div>
      <TableShell className="doctor-plan-table-shell">
        <DataTable compact className="doctor-plan-items-table">
          <thead>
            <tr>
              <th className={tableCellClass('control')}>
                <input
                  type="checkbox"
                  aria-label="全选处方药品"
                  checked={plan.medications.length > 0 && plan.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))}
                  onChange={() => {
                    const isAll = plan.medications.length > 0 && plan.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))
                    if (isAll) {
                      setCheckedMedicationKeys(new Set())
                    } else {
                      setCheckedMedicationKeys(new Set(plan.medications.map((m, idx) => m.lineId || `${m.medicationId}-${idx}`)))
                    }
                  }}
                  disabled={plan.medications.length === 0}
                />
              </th>
              <th className={`${tableCellClass('text')} doctor-col--med-name`}>药品名称及规格</th>
              <th className={`${tableCellClass('numeric')} doctor-col--dose`}>单次剂量</th>
              <th className={`${tableCellClass('text')} doctor-col--route`}>途径</th>
              <th className={`${tableCellClass('text')} doctor-col--frequency`}>频次</th>
              <th className={`${tableCellClass('numeric')} doctor-col--duration`}>疗程</th>
              <th className={`${tableCellClass('text')} doctor-col--instruction`}>用法说明</th>
            </tr>
          </thead>
          <tbody>
            {plan.medications.length > 0 ? (
              plan.medications.map((m, idx) => {
                const medKey = planMedicationKey(m, idx)
                const locked = rowFailures.get(rowFailureKey('PLAN', plan.id, plan.revision, medKey))
                const isChecked = checkedMedicationKeys.has(medKey) && !locked
                return (
                  <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                    <td className={tableCellClass('control')}>
                      <input
                        type="checkbox"
                        aria-label={`选择药品 ${m.medicationName}`}
                        checked={isChecked} disabled={Boolean(locked)}
                        onChange={() => {
                          setCheckedMedicationKeys((prev) => {
                            const next = new Set(prev)
                            if (next.has(medKey)) next.delete(medKey)
                            else next.add(medKey)
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className={`${tableCellClass('text')} doctor-col--med-name`}>
                      <div className="doctor-plan-med-name-cell">
                        <strong>{m.medicationName}</strong>
                        {m.preparationSpec && <span className="doctor-plan-item-spec">{m.preparationSpec}</span>}
                      </div>
                      <RowFlags duplicate={draftKeys.has(medicationDuplicateKey(m))} lockedReason={locked} />
                    </td>
                    <td className={`${tableCellClass('numeric')} doctor-col--dose`}>{m.doseValue} {m.doseUnit}</td>
                    <td className={`${tableCellClass('text')} doctor-col--route`}>{m.routeName || m.routeCode || '—'}</td>
                    <td className={`${tableCellClass('text')} doctor-col--frequency`}>{m.frequencyCode || '—'}</td>
                    <td className={`${tableCellClass('numeric')} doctor-col--duration`}>{m.durationValue} {m.durationUnit}</td>
                    <td className={`${tableCellClass('text')} doctor-col--instruction`}>
                      <div className="doctor-plan-instruction-cell" title={m.medicationInstruction || undefined}>
                        {m.medicationInstruction || '—'}
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="doctor-plan-table-empty">暂无处方药品</td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </TableShell>
    </div>

    <div className="doctor-plan-detail-section">
      <div className="doctor-plan-detail-section__title">检查 / 检验 / 治疗项目 ({plan.services.length})</div>
      <TableShell className="doctor-plan-table-shell">
        <DataTable compact className="doctor-plan-items-table">
          <thead>
            <tr>
              <th className={tableCellClass('control')}>
                <input
                  type="checkbox"
                  aria-label="全选检查检验治疗项目"
                  checked={plan.services.length > 0 && plan.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))}
                  onChange={() => {
                    const isAll = plan.services.length > 0 && plan.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))
                    if (isAll) {
                      setCheckedServiceKeys(new Set())
                    } else {
                      setCheckedServiceKeys(new Set(plan.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
                    }
                  }}
                  disabled={plan.services.length === 0}
                />
              </th>
              <th className={tableCellClass('text')}>项目名称</th>
              <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
              <th className={tableCellClass('numeric')} style={{ width: '80px' }}>数量</th>
              <th className={tableCellClass('text')}>临床要求</th>
            </tr>
          </thead>
          <tbody>
            {plan.services.length > 0 ? (
              plan.services.map((s, idx) => {
                const srvKey = planServiceKey(s, idx)
                const locked = rowFailures.get(rowFailureKey('PLAN', plan.id, plan.revision, srvKey))
                const isChecked = checkedServiceKeys.has(srvKey) && !locked
                return (
                  <tr key={srvKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                    <td className={tableCellClass('control')}>
                      <input
                        type="checkbox"
                        aria-label={`选择项目 ${s.itemName}`}
                        checked={isChecked} disabled={Boolean(locked)}
                        onChange={() => {
                          setCheckedServiceKeys((prev) => {
                            const next = new Set(prev)
                            if (next.has(srvKey)) next.delete(srvKey)
                            else next.add(srvKey)
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className={tableCellClass('text')}>
                      <span className="doctor-order-name-with-action">
                        <strong>{s.itemName}</strong>
                        <ServiceInsertButton name={s.itemName} serviceType={s.serviceType} onView={setInspectTarget} />
                      </span>
                      <RowFlags duplicate={draftKeys.has(serviceDuplicateKey(s))} lockedReason={locked} />
                    </td>
                    <td className={tableCellClass('status')}>
                      <StatusBadge tone="neutral">
                        {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '治疗'}
                      </StatusBadge>
                    </td>
                    <td className={tableCellClass('numeric')}>{s.quantity} {s.unitCode}</td>
                    <td className={tableCellClass('text')}>
                      <div className="doctor-plan-instruction-cell" title={s.clinicalDescription || undefined}>
                        {s.clinicalDescription || '—'}
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="doctor-plan-table-empty">暂无检查检验治疗项目</td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
    </PreviewZone>
  )

  return <>
      <div className="doctor-plan-pool-modal is-drawer">
        {error && <Alert duration={null}>{typeof error === 'string' ? error : errorMessage(error)}
          <Button variant="text" disabled={application.pending} onClick={() => {
            void templates.refetch(); void noteTemplates.refetch(); void orderSets.refetch(); void orderSetTemplates.refetch()
            if (scopeFilter === 'HISTORICAL') { void historicalPlanQuery.refetch(); if (comparisonTemplateId) void historicalComparisonQuery.refetch() }
            if (scopeFilter === 'MINED') void minedQuery.refetch()
          }}>重新加载模板</Button></Alert>}
        {notice && <div className="doctor-plan-pool-notice">{notice}</div>}

        {/* 顶部模板类型、方案范围与确认操作 */}
        <div className="doctor-plan-pool-header">
          <div className="doctor-clinical-template-filters">
            <Tabs
              value={templateKind}
              onChange={(tabId) => {
                setTemplateKind(tabId)
                if (tabId !== 'PLAN') setScopeFilter('ALL')
                if (tabId !== 'ALL') setSelectedKind(tabId)
                setNotice('')
              }}
              label="临床模板类型"
              variant="line"
              items={kindTabs}
            />
            {lensOn && <div className="doctor-plan-pool-hint">
              当前用途：{purposeLabel(purpose)}，只列出{purpose === 'RECORD' ? '病历模板和含病历的方案' : '医嘱组套和含医嘱的方案'}。
              <Button variant="text" size="sm" onClick={() => setShowAllKinds(true)}>显示全部</Button>
            </div>}
            {templateKind === 'PLAN' && <Tabs
              value={scopeFilter}
              onChange={(tabId) => { setScopeFilter(tabId); setNotice('') }}
              label="诊疗方案范围"
              variant="pills"
              items={scopeTabs}
            />}
          </div>
          <div className="doctor-plan-pool-header-actions">
            {showingNoteTemplate ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selectedNote || checkedNoteFields.size === 0 || noteTemplates.isFetching || noteTemplates.isError}
                busy={applyNote.isPending}
                onClick={() => selectedNote && applyNote.mutate(selectedNote)}
              >
                {checkedNoteFields.size > 0 ? `带入病历草稿 (${checkedNoteFields.size})` : '带入病历草稿'}
              </Button>
            ) : showingOrderSetTemplate ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !lineTarget || totalCheckedStandard === 0 || orderSetTemplates.isFetching || orderSetTemplates.isError}
                busy={apply.isPending}
                onClick={handleApplyStandard}
              >
                {totalCheckedStandard > 0 ? `带入医嘱草稿 (${totalCheckedStandard})` : '带入医嘱草稿'}
              </Button>
            ) : showingOrderSet ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selectedGroup || totalCheckedGroup === 0 || orderSets.isFetching || orderSets.isError
                  || Boolean(selectedGroup && orderSetStaticIssue(selectedGroup, encounter))}
                busy={applyOrderSet.isPending}
                onClick={applyOrderSet.mutate}
              >
                {totalCheckedGroup > 0 ? `带入医嘱草稿 (${totalCheckedGroup})` : '带入医嘱草稿'}
              </Button>
            ) : scopeFilter === 'HISTORICAL' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !hasHistoricalReviewEvidence(historicalPlanQuery.data) || !historicalPlanQuery.data || effectiveHistoricalSelectionCount === 0 || historicalPlanQuery.isFetching || historicalPlanQuery.isError
                  || Boolean(comparisonTemplateId && (historicalComparisonQuery.isFetching || historicalComparisonQuery.isError || !historicalComparisonQuery.data
                    || !hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan)))}
                busy={applyHistoricalMutation.isPending}
                onClick={handleApplyHistorical}
              >
                {effectiveHistoricalSelectionCount > 0
                  ? `合并带入草稿 (${effectiveHistoricalSelectionCount})` : '合并带入草稿'}
              </Button>
            ) : scopeFilter === 'MINED' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selectedMined || totalCheckedMined === 0 || minedQuery.isFetching || minedQuery.isError}
                busy={applyMinedMutation.isPending}
                onClick={handleApplyMined}
              >
                {totalCheckedMined > 0 ? `直接带入草稿 (${totalCheckedMined})` : '直接带入草稿'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !selected || totalCheckedStandard === 0 || templates.isFetching || templates.isError}
                busy={apply.isPending}
                onClick={handleApplyStandard}
              >
                {totalCheckedStandard > 0 ? `带入当前草稿 (${totalCheckedStandard})` : '带入当前草稿'}
              </Button>
            )}
          </div>
        </div>

        {/* 宽屏桌面端左右分栏工作区 */}
        <div className="doctor-plan-pool-split">
          {/* 左侧栏：方案索引与检索 */}
          <div className="doctor-plan-pool-sidebar">
            {(templateKind !== 'PLAN' || scopeFilter !== 'HISTORICAL') && (
              <SearchField
                className="doctor-plan-pool-search"
                label="搜索临床模板"
                value={searchKeyword}
                onChange={setSearchKeyword}
                placeholder="搜索模板、诊断、药品或病历内容..."
              />
            )}

            <div className="doctor-plan-pool-list">
              {templateKind === 'NOTE' ? (
                noteTemplates.isPending ? <LoadingState label="正在加载病历模板..." /> :
                filteredNoteTemplates.length ? filteredNoteTemplates.map((item) => renderNoteCard(item, '可用段落')
                ) : <div className="doctor-plan-pool-empty-text">未找到匹配的病历模板</div>
              ) : templateKind === 'ORDER_SET' ? (
                (orderSets.isPending || orderSetTemplates.isPending) && !filteredOrderSetTemplates.length && !filteredGroups.length
                  ? <LoadingState label="正在加载医嘱组套..." /> :
                filteredOrderSetTemplates.length || filteredGroups.length ? <>{renderOrderSetCards()}{orderSetListError && orderSetLoadError}</> :
                orderSetListError ? orderSetLoadError
                  : <div className="doctor-plan-pool-empty-text">未找到匹配的医嘱组套</div>
              ) : templateKind === 'ALL' ? (
                noteTemplates.isPending || templates.isPending ? <LoadingState label="正在加载临床模板..." /> :
                filteredNoteTemplates.length || filteredTemplates.length || filteredOrderSetTemplates.length || filteredGroups.length
                  || orderSetListError ? <>
                  {kindPreference(purpose).map((kind) => kind === 'NOTE' ? filteredNoteTemplates.map((item) => renderNoteCard(item, '病历段落'))
                    : kind === 'PLAN' ? filteredTemplates.map(renderCompactPlanCard)
                      : renderOrderSetCards())}
                  {orderSetListError && orderSetLoadError}
                </> : <div className="doctor-plan-pool-empty-text">未找到匹配的临床模板</div>
              ) : scopeFilter === 'HISTORICAL' ? (
                historicalPlanQuery.isPending ? <LoadingState label="正在识别复诊平稳方案..." /> :
                historicalPlanQuery.data ? (
                  <>
                    <FormField label="对照标准方案">
                      <Select value={comparisonTemplateId} onChange={setComparisonTemplateId}
                        clearable={false} searchable options={(templates.data ?? []).map((item) => ({
                          value: item.id, label: item.name,
                          secondaryText: `${item.diagnoses.length} 个诊断 / ${item.medications.length} 个药品`,
                        }))} placeholder="选择院内标准方案" />
                    </FormField>
                    <div className="doctor-plan-item-card is-selected">
                      <div className="doctor-plan-item-card__top">
                        <StatusBadge tone="success">复诊长程处方</StatusBadge>
                        <small className="doctor-plan-card-meta-text">历史平稳期</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{historicalPlanQuery.data.conditionTitle}</div>
                      <div className="doctor-plan-item-card__desc">{historicalPlanQuery.data.summary}</div>
                      <div className="doctor-plan-item-card__meta">
                        <span>诊断 {historicalPlanQuery.data.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {historicalPlanQuery.data.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {historicalPlanQuery.data.services.length}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    未识别到该患者近180天内的平稳期维持处方
                  </div>
                )
              ) : scopeFilter === 'MINED' ? (
                minedQuery.isPending ? <LoadingState label="正在聚类开方习惯..." /> :
                minedQuery.data?.length ? (
                  minedQuery.data.map((item) => (
                    <div
                      key={item.patternKey}
                      className={`doctor-plan-item-card ${selectedMinedKey === item.patternKey ? 'is-selected' : ''}`}
                      onClick={() => setSelectedMinedKey(item.patternKey)}
                    >
                      <div className="doctor-plan-item-card__top">
                        <StatusBadge tone="info">近30天开立 {item.occurrenceCount} 次</StatusBadge>
                        <small className="doctor-plan-card-meta-text">AI 习惯挖掘</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.suggestedName}</div>
                      <div className="doctor-plan-item-card__desc">{item.description}</div>
                      <div className="doctor-plan-item-card__meta">
                        <span>诊断 {item.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {item.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {item.services.length}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    暂无开方聚类习惯推荐
                  </div>
                )
              ) : (
                templates.isPending ? <LoadingState label="正在加载方案库..." /> :
                filteredTemplates.length ? (
                  filteredTemplates.map((item) => (
                    <div
                      key={item.id}
                      className={`doctor-plan-item-card ${selected?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone={item.scopeType === 'PERSONAL' ? 'neutral' : item.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                            {templateScopeLabel(item.scopeType)}
                          </StatusBadge>
                          {item.sourceType === 'AI_INPUT' && <StatusBadge tone="info">速记</StatusBadge>}
                          {item.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南抽取</StatusBadge>}
                          {item.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方沉淀</StatusBadge>}
                        </div>
                        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.name}</div>
                      {item.guidelineReference && (
                        <div className="doctor-plan-card-guideline">
                          📖 {item.guidelineReference}
                        </div>
                      )}
                      {item.description && item.description !== item.name && item.description !== '由医生审核确认的诊疗方案' && (
                        <div className="doctor-plan-item-card__desc">{item.description}</div>
                      )}
                      <div className="doctor-plan-item-card__meta">
                        {item.noteTemplateId && <><span>病历 1</span><span>·</span></>}
                        <span>诊断 {item.diagnoses.length}</span>
                        <span>·</span>
                        <span>药品 {item.medications.length}</span>
                        <span>·</span>
                        <span>诊疗 {item.services.length}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="doctor-plan-pool-empty-text">
                    未找到匹配方案
                  </div>
                )
              )}
            </div>
          </div>

          {/* 右侧栏：选中方案明细看板与带入操作 */}
          <div className="doctor-plan-pool-detail">
            {showingNoteTemplate ? (
              selectedNote ? <div className="doctor-plan-pool-detail__body">
                <div className="doctor-plan-detail-hero is-compact">
                  <div className="doctor-plan-detail-hero__title">
                    <span>{selectedNote.name}</span>
                    <StatusBadge tone="info">{templateTypeLabel('NOTE')}</StatusBadge>
                    <StatusBadge tone="neutral">{templateScopeLabel(selectedNote.scopeType)}</StatusBadge>
                  </div>
                  {selectedNote.description && <p className="doctor-plan-detail-desc">{selectedNote.description}</p>}
                </div>

                <PreviewZone title="病历" meta="按段落勾选；默认只填充当前为空的段落">
                  <NotePreviewSection note={selectedNote} checked={checkedNoteFields} setChecked={setCheckedNoteFields}
                    overwrite={overwriteNoteFields} setOverwrite={setOverwriteNoteFields} disabled={applyNote.isPending} />
                </PreviewZone>

                <div className="doctor-plan-pool-detail__footer">
                  <span className="doctor-plan-footer-hint">只修改当前病历草稿，不会生成诊断、药品或检查医嘱，也不会自动保存。</span>
                </div>
              </div> : <EmptyState icon="clinical" title="暂无病历模板" copy="当前筛选条件下没有匹配的病历模板。" />
            ) : showingOrderSetTemplate && selectedOrderSet ? (
              <div className="doctor-plan-pool-detail__body">
                <div className="doctor-plan-detail-hero is-compact">
                  <div className="doctor-plan-detail-hero__title">
                    <span>{selectedOrderSet.name}</span>
                    <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
                    <StatusBadge tone={templateScopeTone(selectedOrderSet.scopeType)}>{templateScopeLabel(selectedOrderSet.scopeType)}</StatusBadge>
                  </div>
                  {selectedOrderSet.description && <p className="doctor-plan-detail-desc">{selectedOrderSet.description}</p>}
                </div>
                {renderPlanOrdersZone(selectedOrderSet)}
                <div className="doctor-plan-pool-detail__footer">
                  <span className="doctor-plan-footer-hint">
                    累计已使用 {selectedOrderSet.useCount} 次 · 带入后仍可在医嘱区调整数量和执行科室
                  </span>
                </div>
              </div>
            ) : showingOrderSet ? (
              selectedGroup ? (() => {
                const issue = orderSetStaticIssue(selectedGroup, encounter)
                const members = [...selectedGroup.members].sort((left, right) => left.sortOrder - right.sortOrder)
                const lockedOf = (id: string) => rowFailures.get(rowFailureKey('ORDER_SET', selectedGroup.id, selectedGroup.revision, id))
                const selectable = members.filter(member => !lockedOf(member.id) && !draftKeys.has(serviceDuplicateKey(member)))
                const selectedCount = selectable.filter(member => checkedGroupMembers.has(groupMemberKey(member))).length
                return <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero is-compact">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{selectedGroup.name}</span>
                      <StatusBadge tone="warning">{templateTypeLabel('ORDER_SET')}</StatusBadge>
                      <StatusBadge tone="success">{legacyOrderSetOwnerLabel}</StatusBadge>
                      <small className="doctor-plan-card-meta-text">{selectedGroup.code}</small>
                    </div>
                  </div>
                  {issue && <Alert tone="warning" duration={null}>{issue}，不能带入。</Alert>}
                  <PreviewZone title="医嘱" meta="组套只包含诊疗项目；带入时重新核对目录、价格、单位和执行科室">
                    <OrderGroupBar title={selectedGroup.name} total={members.length} selectable={selectable.length}
                      selected={selectedCount} disabled={Boolean(issue) || applyOrderSet.isPending} hint="整组勾选不含重复行"
                      onToggle={() => setCheckedGroupMembers(current => {
                        const next = new Set(current), ids = selectable.map(groupMemberKey)
                        if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id)); else ids.forEach(id => next.add(id))
                        return next
                      })} />
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead><tr>
                          <th className={tableCellClass('control')}>选择</th>
                          <th className={tableCellClass('text')}>项目名称</th>
                          <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                          <th className={tableCellClass('numeric')} style={{ width: '80px' }}>数量</th>
                          <th className={tableCellClass('text')}>临床要求</th>
                        </tr></thead>
                        <tbody>{members.map((member) => {
                          const locked = lockedOf(member.id), duplicate = draftKeys.has(serviceDuplicateKey(member))
                          const checked = checkedGroupMembers.has(groupMemberKey(member)) && !locked
                          return <tr key={member.id} className={checked ? undefined : 'is-row-unchecked'}>
                            <td className={tableCellClass('control')}><input type="checkbox" aria-label={`选择项目 ${member.itemName}`}
                              checked={checked} disabled={Boolean(locked || issue) || applyOrderSet.isPending}
                              onChange={() => setCheckedGroupMembers(current => {
                                const next = new Set(current), key = groupMemberKey(member)
                                if (next.has(key)) next.delete(key); else next.add(key)
                                return next
                              })} /></td>
                            <td className={tableCellClass('text')}>
                              <span className="doctor-order-name-with-action">
                                <strong>{member.itemName}</strong>
                                <ServiceInsertButton name={member.itemName} serviceType={member.serviceType} onView={setInspectTarget} />
                              </span>
                              <RowFlags duplicate={duplicate} lockedReason={locked} />
                            </td>
                            <td className={tableCellClass('status')}><StatusBadge tone="neutral">
                              {member.serviceType === 'LABORATORY' ? '检验' : member.serviceType === 'EXAMINATION' ? '检查' : '治疗'}
                            </StatusBadge></td>
                            <td className={tableCellClass('numeric')}>{member.quantity} {member.unitCode ?? ''}</td>
                            <td className={tableCellClass('text')}><div className="doctor-plan-instruction-cell" title={member.memberDescription || undefined}>
                              {member.memberDescription || '—'}</div></td>
                          </tr>
                        })}</tbody>
                      </DataTable>
                    </TableShell>
                  </PreviewZone>
                  <div className="doctor-plan-pool-detail__footer">
                    <span className="doctor-plan-footer-hint">该组套由医务科在主数据维护，没有使用计数；带入后仍可在医嘱区调整数量和执行科室。</span>
                  </div>
                </div>
              })() : <EmptyState icon="clinical" title="暂无医嘱组套" copy="当前筛选条件下没有匹配的医嘱组套。" />
            ) : scopeFilter === 'HISTORICAL' ? (
              historicalPlanQuery.data ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{historicalPlanQuery.data.conditionTitle}</span>
                      <StatusBadge tone={historicalPlanQuery.data.reviewItems?.length ? 'warning' : 'info'}>历史重复方案</StatusBadge>
                    </div>
                    <p className="doctor-plan-detail-desc">
                      {historicalPlanQuery.data.summary}
                    </p>
                  </div>

                  {comparisonTemplateId && (historicalComparisonQuery.isPending || historicalComparisonQuery.isFetching
                    ? <LoadingState label="正在计算历史与标准方案差异..." />
                    : !historicalComparisonQuery.isError && historicalComparisonQuery.data
                      && hasHistoricalReviewEvidence(historicalPlanQuery.data)
                      && hasHistoricalReviewEvidence(historicalComparisonQuery.data.historicalPlan) && (
                      <div className="doctor-plan-detail-section">
                        <div className="doctor-plan-detail-section__title">
                          与“{historicalComparisonQuery.data.standardPlan.name}”逐项比较
                        </div>
                        <TableShell className="doctor-plan-table-shell">
                          <DataTable compact className="doctor-plan-items-table">
                            <thead><tr>
                              <th className={tableCellClass('control')}>选择</th>
                              <th className={tableCellClass('status')}>类型</th>
                              <th className={tableCellClass('status')}>差异</th>
                              <th className={tableCellClass('text')}>历史稳定方案</th>
                              <th className={tableCellClass('text')}>院内标准方案</th>
                              <th className={tableCellClass('text')}>采用</th>
                            </tr></thead>
                            <tbody>{historicalComparisonQuery.data.differences.map((item) => {
                              const selectable = canSelectHistoricalPlanDifference(item.status)
                              const status = historicalPlanDifferencePresentation(item.status)
                              const checked = selectable && checkedComparisonKeys.has(item.key)
                              const source = comparisonSources.get(item.key)
                                ?? (item.historicalIndex == null ? 'STANDARD' : 'HISTORICAL')
                              const sourceOptions = [
                                ...(item.historicalIndex == null ? [] : [{ value: 'HISTORICAL', label: '历史方案' }]),
                                ...(item.standardIndex == null ? [] : [{ value: 'STANDARD', label: '标准方案' }]),
                              ]
                              return <tr key={item.key} className={checked ? undefined : 'is-row-unchecked'}>
                                <td className={tableCellClass('control')}><input type="checkbox"
                                  aria-label={`选择差异项 ${item.historicalDisplay || item.standardDisplay || item.key}`}
                                  checked={checked} disabled={!selectable} onChange={() => setCheckedComparisonKeys((current) => {
                                    const next = new Set(current)
                                    if (next.has(item.key)) next.delete(item.key); else next.add(item.key)
                                    return next
                                  })} /></td>
                                <td className={tableCellClass('status')}>{item.category === 'DIAGNOSIS' ? '诊断'
                                  : item.category === 'MEDICATION' ? '药品' : '诊疗'}</td>
                                <td className={tableCellClass('status')}><StatusBadge tone={status.tone}>
                                  {status.label}
                                </StatusBadge></td>
                                <td className={tableCellClass('text')}>{item.historicalDisplay || '—'}</td>
                                <td className={tableCellClass('text')}>{item.standardDisplay || '—'}
                                  <small className="doctor-plan-item-subtext">{item.reason}</small></td>
                                <td className={tableCellClass('text')}>{sourceOptions.length ? <Select aria-label={`选择 ${item.key} 的采用来源`}
                                  value={source} disabled={!selectable} onChange={(value) => setComparisonSources((current) => {
                                    const next = new Map(current)
                                    next.set(item.key, value as 'HISTORICAL' | 'STANDARD')
                                    return next
                                  })} options={sourceOptions} clearable={false} searchable={false} /> : '需重新核对'}</td>
                              </tr>
                            })}</tbody>
                          </DataTable>
                        </TableShell>
                      </div>
                    ))}

                  {hasHistoricalReviewEvidence(historicalPlanQuery.data) && historicalPlanQuery.data.reviewItems.length > 0 && (
                    <div className="doctor-plan-detail-section">
                      <div className="doctor-plan-detail-section__title">待核对的历史记录 ({historicalPlanQuery.data.reviewItems.length})</div>
                      <TableShell className="doctor-plan-table-shell">
                        <DataTable compact className="doctor-plan-items-table">
                          <thead><tr><th className={tableCellClass('text')}>原始记录</th><th className={tableCellClass('text')}>未带入原因</th></tr></thead>
                          <tbody>{historicalPlanQuery.data.reviewItems.map((item, index) => <tr key={`${item.category}:${item.sourceId}:${index}`}>
                            <td className={tableCellClass('text')}>{item.display || item.code || '原记录名称未提供'}</td>
                            <td className={tableCellClass('text')}>{item.reason}</td>
                          </tr>)}</tbody>
                        </DataTable>
                      </TableShell>
                    </div>
                  )}

                  {historicalPlanQuery.data.guidanceNotes.length > 0 && (
                    <div className="doctor-plan-detail-notes">
                      <strong>💡 处方平稳期分析与品规对齐建议：</strong>
                      {historicalPlanQuery.data.guidanceNotes.map((note, idx) => (
                        <div key={idx}>• {note}</div>
                      ))}
                    </div>
                  )}

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断列表 ({historicalPlanQuery.data.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={historicalPlanQuery.data.diagnoses.length > 0 && historicalPlanQuery.data.diagnoses.every((d) => checkedHistDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = historicalPlanQuery.data!.diagnoses.length > 0 && historicalPlanQuery.data!.diagnoses.every((d) => checkedHistDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedHistDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedHistDiagnosisCodes(new Set(historicalPlanQuery.data!.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={historicalPlanQuery.data.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalPlanQuery.data.diagnoses.length > 0 ? (
                            historicalPlanQuery.data.diagnoses.map((d) => {
                              const isChecked = checkedHistDiagnosisCodes.has(d.code)
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedHistDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">长程处方维持用药 ({historicalPlanQuery.data.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选维持用药"
                                checked={historicalPlanQuery.data.medications.length > 0 && historicalPlanQuery.data.medications.every((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = historicalPlanQuery.data!.medications.length > 0 && historicalPlanQuery.data!.medications.every((m, idx) => checkedHistMedicationKeys.has(`${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedHistMedicationKeys(new Set())
                                  } else {
                                    setCheckedHistMedicationKeys(new Set(historicalPlanQuery.data!.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={historicalPlanQuery.data.medications.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>药品及品规</th>
                            <th className={tableCellClass('numeric')}>单次剂量</th>
                            <th className={tableCellClass('text')}>途径</th>
                            <th className={tableCellClass('text')}>频次</th>
                            <th className={tableCellClass('numeric')}>疗程</th>
                            <th className={tableCellClass('numeric')}>数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historicalPlanQuery.data.medications.length > 0 ? (
                            historicalPlanQuery.data.medications.map((m, idx) => {
                              const medKey = `${m.medicationId}-${idx}`
                              const isChecked = checkedHistMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择维持用药 #${m.medicationId}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedHistMedicationKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(medKey)) next.delete(medKey)
                                          else next.add(medKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('text')}>
                                    <div><strong>药品编码 #{m.medicationId}</strong></div>
                                    {m.medicationInstruction && <small className="doctor-plan-item-subtext">{m.medicationInstruction}</small>}
                                  </td>
                                  <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                                  <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                                  <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                                  <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                                  <td className={tableCellClass('numeric')}>{m.quantity} {m.quantityUnit}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={7} className="doctor-plan-table-empty">暂无维持用药</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-pool-detail__footer">
                    <span className="doctor-plan-footer-hint">
                      一键复用将慢病平稳期处方带入草稿，开立前仍执行品规库存和过敏校验。
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="未识别到复诊成熟方案" copy="患者本次就诊暂无近180天内的历史平稳期处方或慢病长程用药记录。" />
              )
            ) : scopeFilter === 'MINED' ? (
              selectedMined ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{selectedMined.suggestedName}</span>
                      <StatusBadge tone="info">近30天高频开立 {selectedMined.occurrenceCount} 次</StatusBadge>
                    </div>
                    <p className="doctor-plan-detail-desc">
                      {selectedMined.description}
                    </p>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断组合 ({selectedMined.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={selectedMined.diagnoses.length > 0 && selectedMined.diagnoses.every((d) => checkedMinedDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = selectedMined.diagnoses.length > 0 && selectedMined.diagnoses.every((d) => checkedMinedDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedMinedDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedMinedDiagnosisCodes(new Set(selectedMined.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={selectedMined.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMined.diagnoses.length > 0 ? (
                            selectedMined.diagnoses.map((d) => {
                              const isChecked = checkedMinedDiagnosisCodes.has(d.code)
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedMinedDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong></td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">常用开方药品 ({selectedMined.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选开方药品"
                                checked={selectedMined.medications.length > 0 && selectedMined.medications.every((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = selectedMined.medications.length > 0 && selectedMined.medications.every((m, idx) => checkedMinedMedicationKeys.has(`${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedMinedMedicationKeys(new Set())
                                  } else {
                                    setCheckedMinedMedicationKeys(new Set(selectedMined.medications.map((m, idx) => `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={selectedMined.medications.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>药品编码</th>
                            <th className={tableCellClass('numeric')}>单次剂量</th>
                            <th className={tableCellClass('text')}>途径</th>
                            <th className={tableCellClass('text')}>频次</th>
                            <th className={tableCellClass('numeric')}>疗程</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMined.medications.length > 0 ? (
                            selectedMined.medications.map((m, idx) => {
                              const medKey = `${m.medicationId}-${idx}`
                              const isChecked = checkedMinedMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择开方药品 #${m.medicationId}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedMinedMedicationKeys((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(medKey)) next.delete(medKey)
                                          else next.add(medKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('text')}><strong>药品 #{m.medicationId}</strong></td>
                                  <td className={tableCellClass('numeric')}>{m.doseValue} {m.doseUnit}</td>
                                  <td className={tableCellClass('text')}>{m.routeCode || '—'}</td>
                                  <td className={tableCellClass('text')}>{m.frequencyCode || '—'}</td>
                                  <td className={tableCellClass('numeric')}>{m.durationValue} {m.durationUnit}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="doctor-plan-table-empty">暂无开方药品</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div>

                  <div className="doctor-plan-pool-detail__footer">
                    <Button
                      variant="secondary"
                      busy={solidifyMinedMutation.isPending}
                      onClick={() => solidifyMinedMutation.mutate(selectedMined)}
                    >
                      固化为我的诊疗方案
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="暂无高频方案建议" copy="AI 暂未挖掘到可聚类的高频开方组合。" />
              )
            ) : (
              selected ? (
                <div className="doctor-plan-pool-detail__body">
                  <div className="doctor-plan-detail-hero is-compact">
                    <div className="doctor-plan-detail-hero__title">
                      <span>{selected.name}</span>
                      <StatusBadge tone={selected.scopeType === 'PERSONAL' ? 'neutral' : selected.scopeType === 'DEPARTMENT' ? 'info' : 'success'}>
                        {templateScopeLabel(selected.scopeType)}
                      </StatusBadge>
                      {selected.sourceType === 'AI_GUIDELINE' && <StatusBadge tone="warning">指南结构化抽取</StatusBadge>}
                      {selected.sourceType === 'AI_INPUT' && <StatusBadge tone="info">AI 智能速记</StatusBadge>}
                      {selected.sourceType === 'AI_MINED' && <StatusBadge tone="info">开方习惯沉淀</StatusBadge>}
                    </div>
                    {selected.guidelineReference && (
                      <div className="doctor-plan-detail-guideline">
                        📖 用户录入的条文来源（未核验）：{planSourceReferenceLabel(selected.guidelineReference)}
                      </div>
                    )}
                  </div>

                  {selected.noteTemplateId && <PreviewZone title="病历" meta={selectedLinkedNoteTemplate
                    ? '按段落勾选；默认只填充当前为空的段落' : undefined}>
                    <div className="doctor-plan-detail-section">
                      <div className="doctor-plan-detail-section__title">配套病历模板</div>
                      {selectedLinkedNoteTemplate
                        ? <><div className="doctor-plan-linked-note"><strong>{selectedLinkedNoteTemplate.name}</strong></div>
                          <NotePreviewSection note={selectedLinkedNoteTemplate} checked={checkedNoteFields} setChecked={setCheckedNoteFields}
                            overwrite={overwriteNoteFields} setOverwrite={setOverwriteNoteFields} disabled={apply.isPending} /></>
                        : <small className="doctor-plan-item-subtext">关联的病历模板当前不可用：可能已停用或超出当前科室可见范围；诊断和医嘱仍可单独带入。</small>}
                    </div>
                  </PreviewZone>}

                  <PreviewZone title="诊断" meta="已在当前诊断中的标“已有”，默认不勾选"><div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">诊断列表 ({selected.diagnoses.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选诊断"
                                checked={selected.diagnoses.length > 0 && selected.diagnoses.every((d) => checkedDiagnosisCodes.has(d.code))}
                                onChange={() => {
                                  const isAll = selected.diagnoses.length > 0 && selected.diagnoses.every((d) => checkedDiagnosisCodes.has(d.code))
                                  if (isAll) {
                                    setCheckedDiagnosisCodes(new Set())
                                  } else {
                                    setCheckedDiagnosisCodes(new Set(selected.diagnoses.map((d) => d.code)))
                                  }
                                }}
                                disabled={selected.diagnoses.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('text')} style={{ width: '130px' }}>ICD-10 编码</th>
                            <th className={tableCellClass('text')}>诊断名称</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.diagnoses.length > 0 ? (
                            selected.diagnoses.map((d) => {
                              const isChecked = checkedDiagnosisCodes.has(d.code)
                              const alreadyPresent = existingDiagnosisCodes.has(d.code.toUpperCase())
                              return (
                                <tr key={d.code} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择诊断 ${d.display}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        setCheckedDiagnosisCodes((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.code)) next.delete(d.code)
                                          else next.add(d.code)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className={tableCellClass('status')}>
                                    <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                      {d.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}
                                    </StatusBadge>
                                  </td>
                                  <td className={tableCellClass('text')}><code>{d.code}</code></td>
                                  <td className={tableCellClass('text')}><strong>{d.display}</strong>
                                    {alreadyPresent && <StatusBadge tone="info" className="doctor-plan-row-badge">已有</StatusBadge>}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="doctor-plan-table-empty">暂无诊断记录</td>
                            </tr>
                          )}
                        </tbody>
                      </DataTable>
                    </TableShell>
                  </div></PreviewZone>

                  {renderPlanOrdersZone(selected)}

                  <div className="doctor-plan-pool-detail__footer">
                    <span className="doctor-plan-footer-hint">
                      累计已使用 {selected.useCount} 次 · 带入后仍可在门诊工作台进一步调整
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState icon="clinical" title="暂无诊疗方案" copy="当前筛选条件下没有匹配的方案。" />
              )
            )}
          </div>
        </div>
      </div>
    <MedicalInsertViewerModal isOpen={Boolean(inspectTarget)} onClose={() => setInspectTarget(null)}
      target={inspectTarget} api={api} />
  </>
}
