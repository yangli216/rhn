import { noteTemplateFields, type NoteTemplateField } from "../record/NoteTemplateBar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DiagnosisInput } from "../../../shared/api/encountersApi";
import type { OutpatientPlanTemplate, MinedPlanSuggestion, HistoricalStablePlan, SaveOutpatientPlanTemplateInput } from "../../../shared/api/outpatientPlanTemplatesApi";
import { requireCreatedPlanReceipt, requireUsedPlanReceipt, requireUsedNoteReceipt, requireNoTemplateOrderConflicts, requirePlanCreationInput, templateApiScope } from "./templateApplicationReceipt";
import { useTemplateApplication } from "./useTemplateApplication";
import { canSelectHistoricalPlanDifference, hasHistoricalReviewEvidence, selectHistoricalPlanDifferences } from "./historicalPlanSelection";
import { resolveTemplateOrders, type ResolvedTemplateOrders } from "./resolveTemplateOrders";
import { planSourceReferenceLabel } from "./planTaskPresentation";
import type { OutpatientNoteTemplate } from "../../../shared/api/outpatientNoteTemplatesApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { historicalPlanDifferencePresentation } from "../../../shared/presentation";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Button, DataTable, EmptyState, FormField, LoadingState, Select, StatusBadge, SearchField, tableCellClass, TableShell, Tabs } from "../../../shared/ui";
import type { MedicationPlanDraft } from "../orders/medicationDraft";
import { type ServicePlanDraft } from "../UnifiedOrderListEditor";
import { stageTemplateDiagnoses } from '../workstation/workstationShared'

export function PlanTemplatePanel({ initialPlanId, encounter, busy, allergyContext, allergies, allergyReady, readRecordDraft, diagnoses, setDiagnoses, medicationDrafts, setMedicationDrafts,
  serviceDrafts, setServiceDrafts, api, onApplyNoteTemplate, onClose, onNotice }: {
  initialPlanId?: string
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
  const [templateKind, setTemplateKind] = useState<'ALL' | 'NOTE' | 'PLAN'>('ALL')
  const [selectedKind, setSelectedKind] = useState<'NOTE' | 'PLAN'>('PLAN')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedId, setSelectedId] = useState(initialPlanId ?? '')
  const [selectedNoteId, setSelectedNoteId] = useState('')
  useEffect(() => {
    if (initialPlanId) { setSelectedId(initialPlanId); setSelectedKind('PLAN') }
  }, [initialPlanId])
  const [checkedNoteFields, setCheckedNoteFields] = useState<Set<NoteTemplateField>>(new Set())
  const [overwriteNoteFields, setOverwriteNoteFields] = useState(false)
  const [selectedMinedKey, setSelectedMinedKey] = useState('')
  const [includeLinkedNoteTemplate, setIncludeLinkedNoteTemplate] = useState(false)
  const [notice, setNotice] = useState('')

  // 标准方案明细勾选状态
  const [checkedDiagnosisCodes, setCheckedDiagnosisCodes] = useState<Set<string>>(new Set())
  const [checkedMedicationKeys, setCheckedMedicationKeys] = useState<Set<string>>(new Set())
  const [checkedServiceKeys, setCheckedServiceKeys] = useState<Set<string>>(new Set())

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
    select: (values) => values.filter((value) => value.status === 'ACTIVE'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })

  const noteTemplates = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE', ...queryScope],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
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

  const filteredTemplates = useMemo(() => {
    if (!templates.data) return []
    return templates.data.filter((value) => {
      if (scopeFilter !== 'ALL' && value.scopeType !== scopeFilter) return false
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
  }, [templates.data, scopeFilter, searchKeyword])

  const filteredNoteTemplates = useMemo(() => {
    if (!noteTemplates.data) return []
    const keyword = searchKeyword.trim().toLowerCase()
    return noteTemplates.data.filter((value) => !keyword
      || value.name.toLowerCase().includes(keyword)
      || value.description?.toLowerCase().includes(keyword)
      || noteTemplateFields.some(({ key }) => value.content[key]?.toLowerCase().includes(keyword)))
  }, [noteTemplates.data, searchKeyword])

  const selected = useMemo(() => {
    return filteredTemplates.find((v) => v.id === selectedId)
      || (initialPlanId && selectedId === initialPlanId ? null : filteredTemplates[0]) || null
  }, [filteredTemplates, selectedId, initialPlanId])

  const selectedNote = useMemo(() => filteredNoteTemplates.find((value) => value.id === selectedNoteId)
    || filteredNoteTemplates[0] || null, [filteredNoteTemplates, selectedNoteId])
  const selectedLinkedNoteTemplate = useMemo(() => selected?.noteTemplateId
    ? noteTemplates.data?.find((value) => value.id === selected.noteTemplateId) || null
    : null, [noteTemplates.data, selected?.noteTemplateId])

  useEffect(() => {
    if (templateKind !== 'ALL') return
    if (selectedKind === 'PLAN' && !filteredTemplates.length && filteredNoteTemplates.length) setSelectedKind('NOTE')
    if (selectedKind === 'NOTE' && !filteredNoteTemplates.length && filteredTemplates.length) setSelectedKind('PLAN')
  }, [filteredNoteTemplates.length, filteredTemplates.length, selectedKind, templateKind])

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
  }, [selected, selectedId])

  useEffect(() => {
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id)
  }, [selectedNote, selectedNoteId])

  const initializedNoteSelection = useRef<string | undefined>(undefined)
  const initializedPlanSelection = useRef<string | undefined>(undefined)
  const initializedMinedSelection = useRef<string | undefined>(undefined)
  const initializedHistoricalSelection = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (initializedNoteSelection.current === selectedNote?.id) return
    initializedNoteSelection.current = selectedNote?.id
    if (!selectedNote) {
      setCheckedNoteFields(new Set())
      return
    }
    setCheckedNoteFields(new Set(noteTemplateFields
      .filter(({ key }) => Boolean(selectedNote.content[key]?.trim()))
      .map(({ key }) => key)))
    setOverwriteNoteFields(false)
  }, [selectedNote])

  // 方案切换时默认全选明细项
  useEffect(() => {
    if (initializedPlanSelection.current === selected?.id) return
    initializedPlanSelection.current = selected?.id
    if (selected) {
      setCheckedDiagnosisCodes(new Set(selected.diagnoses.map((d) => d.code)))
      setCheckedMedicationKeys(new Set(selected.medications.map((m, idx) => m.lineId || `${m.medicationId}-${idx}`)))
      setCheckedServiceKeys(new Set(selected.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
      setIncludeLinkedNoteTemplate(Boolean(selected.noteTemplateId))
    } else {
      setCheckedDiagnosisCodes(new Set())
      setCheckedMedicationKeys(new Set())
      setCheckedServiceKeys(new Set())
      setIncludeLinkedNoteTemplate(false)
    }
  }, [selected])

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
      setCheckedHistServiceKeys(new Set(historicalPlanQuery.data.services.map((s, idx) => `${s.catalogItemId || (s as any).serviceCode || ''}-${idx}`)))
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
    apiScope, encounter: [encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId, encounter.status],
    allergyContext, diagnoses, medicationDrafts, serviceDrafts,
    viewed: [selected, selectedNote, selectedMined, historicalPlanQuery.data, historicalComparisonQuery.data],
    selection: [templateKind, selectedKind, scopeFilter, selectedId, selectedNoteId, selectedMinedKey,
      comparisonTemplateId, [...checkedDiagnosisCodes], [...checkedMedicationKeys], [...checkedServiceKeys],
      [...checkedNoteFields], overwriteNoteFields, includeLinkedNoteTemplate, [...checkedHistDiagnosisCodes],
      [...checkedHistMedicationKeys], [...checkedHistServiceKeys], [...checkedComparisonKeys], [...comparisonSources],
      [...checkedMinedDiagnosisCodes], [...checkedMinedMedicationKeys], [...checkedMinedServiceKeys]],
  }), busy || encounter.status !== 'IN_PROGRESS', readRecordDraft)

  function finishPlan(plan: OutpatientPlanTemplate, orders: ResolvedTemplateOrders, note?: OutpatientNoteTemplate) {
    requireNoTemplateOrderConflicts(plan, medicationDrafts, serviceDrafts)
    const existingDiagnoses = new Set(diagnoses.map(item => item.code.toUpperCase()))
    const newDiagnoses = plan.diagnoses.filter(item => !existingDiagnoses.has(item.code.toUpperCase())).length
    stageTemplateDiagnoses(plan.diagnoses, diagnoses, setDiagnoses)
    setMedicationDrafts(current => [...current, ...orders.medications])
    setServiceDrafts(current => [...current, ...orders.services])
    const appliedNoteFields = note ? onApplyNoteTemplate(note, new Set(noteTemplateFields
      .filter(({ key }) => Boolean(note.content[key]?.trim())).map(({ key }) => key)), false) : 0
    const noteResult = !note ? '' : appliedNoteFields ? `，配套病历新增 ${appliedNoteFields} 个段落` : '，配套病历保留原有内容，未新增段落'
    const changed = newDiagnoses + plan.medications.length + plan.services.length + appliedNoteFields > 0
    const msg = changed ? `已从“${plan.name}”带入 ${newDiagnoses} 项诊断、${plan.medications.length} 项药品和 ${plan.services.length} 项诊疗医嘱${noteResult}，请核对后保存和开立。`
      : '所选方案内容已在当前草稿中，未新增内容。'
    setNotice(msg)
    if (changed) onNotice?.(msg)
    void queryClient.invalidateQueries({ queryKey: ['outpatient-plan-templates'] })
    if (changed) onClose?.()
  }

  const apply = {
    isPending: application.pending,
    mutate: (selection: OutpatientPlanTemplate) => {
      const viewed = selected, includeNote = includeLinkedNoteTemplate
      const linked = viewed?.noteTemplateId ? noteTemplates.data?.find(item => item.id === viewed.noteTemplateId) : undefined
      void application.run(async isCurrent => {
        if (!viewed || templates.isFetching || templates.isError) throw new Error('方案目录尚未确认，请重新加载后带入。')
        if (includeNote && viewed.noteTemplateId && (!linked || noteTemplates.isFetching || noteTemplates.isError)) {
          throw new Error('所选配套病历模板不可用，本次未带入，请重新加载核对。')
        }
        const expected = structuredClone(viewed), selectedLines = structuredClone(selection)
        const expectedNote = includeNote && linked ? structuredClone(linked) : undefined
        const plan = requireUsedPlanReceipt(await api.outpatientPlanTemplates.use(expected.id), expected, selectedLines)
        if (!isCurrent()) return undefined
        const note = expectedNote ? requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expectedNote.id), expectedNote) : undefined
        if (!isCurrent()) return undefined
        const orders = await resolveTemplateOrders(plan, encounter, api, allergies, allergyReady)
        return { plan, note, orders }
      }, result => { if (result) finishPlan(result.plan, result.orders, result.note) })
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
        const applied = onApplyNoteTemplate(note, fields, overwrite)
        const msg = applied ? `已带入病历模板“${note.name}”的 ${applied} 个段落，请结合患者情况核对。`
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
      if (orders) finishPlan(created, orders)
      else {
        setNotice(`已将开方习惯保存为个人常用方案“${created.name}”。`)
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
    + (includeLinkedNoteTemplate && selectedLinkedNoteTemplate ? 1 : 0)

  const handleApplyStandard = () => {
    if (!selected) return
    const templateToApply: OutpatientPlanTemplate = {
      ...selected,
      diagnoses: selected.diagnoses.filter((d) => checkedDiagnosisCodes.has(d.code)),
      medications: selected.medications.filter((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`)),
      services: selected.services.filter((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`)),
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
      services: historicalPlanQuery.data.services.filter((s, idx) => checkedHistServiceKeys.has(`${s.catalogItemId || (s as any).serviceCode || ''}-${idx}`)),
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

  const showingNoteTemplate = templateKind === 'NOTE'
    || (templateKind === 'ALL' && selectedKind === 'NOTE')
  const kindTabs: Array<{ value: 'ALL' | 'NOTE' | 'PLAN'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部', meta: `(${(templates.data?.length ?? 0) + (noteTemplates.data?.length ?? 0)})` },
    { value: 'NOTE', label: '病历模板', meta: noteTemplates.data?.length ? `(${noteTemplates.data.length})` : undefined },
    { value: 'PLAN', label: '诊疗方案', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
  ]

  const scopeTabs: Array<{ value: 'ALL' | 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL' | 'HISTORICAL' | 'MINED'; label: string; meta?: string }> = [
    { value: 'ALL', label: '全部方案', meta: templates.data?.length ? `(${templates.data.length})` : undefined },
    { value: 'PERSONAL', label: '个人高频', meta: templates.data?.filter(t => t.scopeType === 'PERSONAL').length ? `(${templates.data.filter(t => t.scopeType === 'PERSONAL').length})` : undefined },
    { value: 'DEPARTMENT', label: '科室路径', meta: templates.data?.filter(t => t.scopeType === 'DEPARTMENT').length ? `(${templates.data.filter(t => t.scopeType === 'DEPARTMENT').length})` : undefined },
    { value: 'HOSPITAL', label: '全院/指南', meta: templates.data?.filter(t => t.scopeType === 'HOSPITAL').length ? `(${templates.data.filter(t => t.scopeType === 'HOSPITAL').length})` : undefined },
    { value: 'HISTORICAL', label: '复诊成熟方案', meta: historicalPlanQuery.data ? '(1)' : undefined },
  ]

  return <>
      <div className="doctor-plan-pool-modal is-drawer">
        {error && <div role="alert" className="doctor-plan-pool-notice">{typeof error === 'string' ? error : errorMessage(error)}
          <Button variant="text" disabled={application.pending} onClick={() => {
            void templates.refetch(); void noteTemplates.refetch()
            if (scopeFilter === 'HISTORICAL') { void historicalPlanQuery.refetch(); if (comparisonTemplateId) void historicalComparisonQuery.refetch() }
            if (scopeFilter === 'MINED') void minedQuery.refetch()
          }}>重新加载模板</Button></div>}
        {notice && <div className="doctor-plan-pool-notice">{notice}</div>}

        {/* 顶部模板类型、方案范围与确认操作 */}
        <div className="doctor-plan-pool-header">
          <div className="doctor-clinical-template-filters">
            <Tabs
              value={templateKind}
              onChange={(tabId) => {
                setTemplateKind(tabId)
                if (tabId !== 'PLAN') setScopeFilter('ALL')
                if (tabId === 'NOTE') setSelectedKind('NOTE')
                if (tabId === 'PLAN') setSelectedKind('PLAN')
                setNotice('')
              }}
              label="临床模板类型"
              variant="line"
              items={kindTabs}
            />
            {templateKind === 'PLAN' && <Tabs
              value={scopeFilter}
              onChange={(tabId) => { setScopeFilter(tabId); setNotice('') }}
              label="诊疗方案范围"
              variant="line"
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
                filteredNoteTemplates.length ? filteredNoteTemplates.map((item) => (
                  <Button variant="text" size="sm" key={item.id} type="button"
                    className={`doctor-plan-item-card ${selectedNote?.id === item.id ? 'is-selected' : ''}`}
                    onClick={() => { setSelectedNoteId(item.id); setSelectedKind('NOTE') }}>
                    <div className="doctor-plan-item-card__top">
                      <div className="doctor-plan-card-badges">
                        <StatusBadge tone="info">病历模板</StatusBadge>
                        <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : '科室'}</StatusBadge>
                      </div>
                      <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                    </div>
                    <div className="doctor-plan-item-card__title">{item.name}</div>
                    {item.description && item.description !== item.name && item.description !== '门诊病历段落模板' && (
                      <div className="doctor-plan-item-card__desc">{item.description}</div>
                    )}
                    <div className="doctor-plan-item-card__meta">
                      <span>可用段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                    </div>
                  </Button>
                )) : <div className="doctor-plan-pool-empty-text">未找到匹配的病历模板</div>
              ) : templateKind === 'ALL' ? (
                noteTemplates.isPending || templates.isPending ? <LoadingState label="正在加载临床模板..." /> :
                filteredNoteTemplates.length || filteredTemplates.length ? <>
                  {filteredNoteTemplates.map((item) => (
                    <Button variant="text" size="sm" key={`note-${item.id}`} type="button"
                      className={`doctor-plan-item-card ${selectedKind === 'NOTE' && selectedNote?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => { setSelectedNoteId(item.id); setSelectedKind('NOTE') }}>
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone="info">病历模板</StatusBadge>
                          <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : '科室'}</StatusBadge>
                        </div>
                        <small className="doctor-plan-card-meta-text">已用 {item.useCount} 次</small>
                      </div>
                      <div className="doctor-plan-item-card__title">{item.name}</div>
                      {item.description && item.description !== item.name && item.description !== '门诊病历段落模板' && (
                        <div className="doctor-plan-item-card__desc">{item.description}</div>
                      )}
                      <div className="doctor-plan-item-card__meta">
                        <span>病历段落 {noteTemplateFields.filter(({ key }) => item.content[key]?.trim()).length}</span>
                      </div>
                    </Button>
                  ))}
                  {filteredTemplates.map((item) => (
                    <Button variant="text" size="sm" key={`plan-${item.id}`} type="button"
                      className={`doctor-plan-item-card ${selectedKind === 'PLAN' && selected?.id === item.id ? 'is-selected' : ''}`}
                      onClick={() => { setSelectedId(item.id); setSelectedKind('PLAN') }}>
                      <div className="doctor-plan-item-card__top">
                        <div className="doctor-plan-card-badges">
                          <StatusBadge tone="success">诊疗方案</StatusBadge>
                          <StatusBadge tone="neutral">{item.scopeType === 'PERSONAL' ? '个人' : item.scopeType === 'DEPARTMENT' ? '科室' : '全院'}</StatusBadge>
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
                  ))}
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
                            {item.scopeType === 'PERSONAL' ? '个人' : item.scopeType === 'DEPARTMENT' ? '科室' : '全院指南'}
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
                    <StatusBadge tone="info">病历模板</StatusBadge>
                    <StatusBadge tone="neutral">{selectedNote.scopeType === 'PERSONAL' ? '医生个人' : '科室共享'}</StatusBadge>
                  </div>
                  {selectedNote.description && <p className="doctor-plan-detail-desc">{selectedNote.description}</p>}
                </div>

                <label className="doctor-note-template-mode">
                  <input type="checkbox" checked={overwriteNoteFields} disabled={applyNote.isPending}
                    onChange={(event) => setOverwriteNoteFields(event.target.checked)} />
                  <span><strong>覆盖所选段落已有内容</strong><small>默认只填充当前为空的病历段落，避免覆盖医生已书写内容。</small></span>
                </label>

                <div className="doctor-plan-detail-section">
                  <div className="doctor-plan-detail-section__title">选择带入的病历段落 ({checkedNoteFields.size})</div>
                  <div className="doctor-note-template-preview is-workspace">
                    {noteTemplateFields.filter(({ key }) => selectedNote.content[key]?.trim()).map(({ key, label }) => (
                      <label key={key} className={checkedNoteFields.has(key) ? undefined : 'is-row-unchecked'}>
                        <input type="checkbox" checked={checkedNoteFields.has(key)}
                          onChange={() => setCheckedNoteFields((current) => {
                            const next = new Set(current)
                            if (next.has(key)) next.delete(key); else next.add(key)
                            return next
                          })} />
                        <span><strong>{label}</strong><small>{selectedNote.content[key]}</small></span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="doctor-plan-pool-detail__footer">
                  <span className="doctor-plan-footer-hint">只修改当前病历草稿，不会生成诊断、药品或检查医嘱，也不会自动保存。</span>
                </div>
              </div> : <EmptyState icon="clinical" title="暂无病历模板" copy="当前筛选条件下没有匹配的病历模板。" />
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
                      固化为个人常用方案
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
                        {selected.scopeType === 'PERSONAL' ? '医生个人方案' : selected.scopeType === 'DEPARTMENT' ? '科室临床路径' : '全院/指南标准方案'}
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

                  {selected.noteTemplateId && <div className="doctor-plan-detail-section">
                    <div className="doctor-plan-detail-section__title">配套病历模板</div>
                    <label className="doctor-note-template-mode">
                      <input type="checkbox" checked={includeLinkedNoteTemplate}
                        disabled={!selectedLinkedNoteTemplate || apply.isPending}
                        onChange={(event) => setIncludeLinkedNoteTemplate(event.target.checked)} />
                      <span>
                        <strong>{selectedLinkedNoteTemplate?.name || '关联的病历模板当前不可用'}</strong>
                        <small>{selectedLinkedNoteTemplate
                          ? `整体带入 ${noteTemplateFields.filter(({ key }) => selectedLinkedNoteTemplate.content[key]?.trim()).map(({ label }) => label).join('、')}`
                          : '可能已停用或超出当前科室可见范围；诊断和医嘱仍可单独带入。'}</small>
                      </span>
                    </label>
                  </div>}

                  <div className="doctor-plan-detail-section">
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
                    <div className="doctor-plan-detail-section__title">处方药品列表 ({selected.medications.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选处方药品"
                                checked={selected.medications.length > 0 && selected.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))}
                                onChange={() => {
                                  const isAll = selected.medications.length > 0 && selected.medications.every((m, idx) => checkedMedicationKeys.has(m.lineId || `${m.medicationId}-${idx}`))
                                  if (isAll) {
                                    setCheckedMedicationKeys(new Set())
                                  } else {
                                    setCheckedMedicationKeys(new Set(selected.medications.map((m, idx) => m.lineId || `${m.medicationId}-${idx}`)))
                                  }
                                }}
                                disabled={selected.medications.length === 0}
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
                          {selected.medications.length > 0 ? (
                            selected.medications.map((m, idx) => {
                              const medKey = m.lineId || `${m.medicationId}-${idx}`
                              const isChecked = checkedMedicationKeys.has(medKey)
                              return (
                                <tr key={medKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择药品 ${m.medicationName}`}
                                      checked={isChecked}
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
                    <div className="doctor-plan-detail-section__title">检查 / 检验 / 治疗项目 ({selected.services.length})</div>
                    <TableShell className="doctor-plan-table-shell">
                      <DataTable compact className="doctor-plan-items-table">
                        <thead>
                          <tr>
                            <th className={tableCellClass('control')}>
                              <input
                                type="checkbox"
                                aria-label="全选检查检验治疗项目"
                                checked={selected.services.length > 0 && selected.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))}
                                onChange={() => {
                                  const isAll = selected.services.length > 0 && selected.services.every((s, idx) => checkedServiceKeys.has(`${s.catalogItemId || s.itemCode || ''}-${idx}`))
                                  if (isAll) {
                                    setCheckedServiceKeys(new Set())
                                  } else {
                                    setCheckedServiceKeys(new Set(selected.services.map((s, idx) => `${s.catalogItemId || s.itemCode || ''}-${idx}`)))
                                  }
                                }}
                                disabled={selected.services.length === 0}
                              />
                            </th>
                            <th className={tableCellClass('text')}>项目名称</th>
                            <th className={tableCellClass('status')} style={{ width: '90px' }}>类型</th>
                            <th className={tableCellClass('numeric')} style={{ width: '80px' }}>数量</th>
                            <th className={tableCellClass('text')}>临床要求</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.services.length > 0 ? (
                            selected.services.map((s, idx) => {
                              const srvKey = `${s.catalogItemId || s.itemCode || ''}-${idx}`
                              const isChecked = checkedServiceKeys.has(srvKey)
                              return (
                                <tr key={srvKey} className={isChecked ? undefined : 'is-row-unchecked'}>
                                  <td className={tableCellClass('control')}>
                                    <input
                                      type="checkbox"
                                      aria-label={`选择项目 ${s.itemName}`}
                                      checked={isChecked}
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
                                    <strong>{s.itemName}</strong> <small className="doctor-plan-item-subtext">({s.itemCode})</small>
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
  </>
}
