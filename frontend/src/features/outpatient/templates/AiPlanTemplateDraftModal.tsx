import { aiServiceValidation, serviceCandidateDraft } from './aiPlanServiceFacts'
import { AiPlanMedicationFields } from './AiPlanMedicationFields'
import { aiMedicationValidation, medicationCandidateDraft } from './aiPlanMedicationFacts'
import { requireEditorStandards } from './templateEditorFacts'
import { confirmConvertedPlan } from './convertedPlanFacts'
import { planNoteContent } from './planNoteContent'
import { WorkspacePane } from '../../../shared/ui/templates/PageTemplates'
import { NoteWritingTemplateEditor } from './NoteWritingTemplateEditor'
import type { OutpatientNoteTemplateContent } from '../../../shared/api/outpatientNoteTemplatesApi'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import '../../../styles/features/outpatient-doctor.css'
import type { RhnApi } from '../../../shared/api'
import { planTextStreamPreview, type OutpatientPlanTemplate, type OutpatientPlanTemplateScope,
  type PlanTextDraft, type PlanTextReviewItem, type SaveOutpatientPlanTemplateInput,
  type CompiledPlanMedicationItem, type CompiledPlanServiceItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import { Alert, Button, Dialog, FormField, Icon, PanelHead, StatusBadge, Tooltip, UnitNumberInput, type IconName } from '../../../shared/ui'
import { errorMessage } from '../../../shared/api/httpClient'
import { safeRandomUUID } from '../../../shared/utils/uuid'
import { formatRouteName, medicationSingleDoseLabel } from './planMedicationPresentation'
import { requireNoteTemplateList, templateApiScope } from './templateApplicationReceipt'
import { saveAiMaintainedPlan, type NoteSaveCheckpoint } from './maintainedTemplateSave'
import { useTemplateApplication } from './useTemplateApplication'
import { searchTemplateDiagnoses, searchTemplateMedications, searchTemplateServices,
  type TemplateDiagnosisCandidate, type TemplateMedicationCandidate, type TemplateServiceCandidate } from './templateCatalogSearch'
import { TemplateCatalogSearchStatus, useTemplateCatalogSearch } from './useTemplateCatalogSearch'


interface AiPlanTemplateDraftModalProps {
  api: RhnApi
  organizationId?: string
  initialScope?: OutpatientPlanTemplateScope
  editingTemplate?: OutpatientPlanTemplate | null
  onClose: () => void
  onSaved: (template: OutpatientPlanTemplate) => void
}

const reviewGroups: Array<{ key: string; label: string; icon: IconName; kinds: PlanTextReviewItem['kind'][] }> = [
  { key: 'diagnosis', label: '诊断与评估', icon: 'stethoscope', kinds: ['DIAGNOSIS'] },
  { key: 'condition', label: '适用条件', icon: 'tasks', kinds: ['CONDITION'] },
  { key: 'medication', label: '用药建议', icon: 'pill', kinds: ['MEDICATION'] },
  { key: 'service', label: '检验检查', icon: 'flask', kinds: ['LABORATORY', 'EXAMINATION'] },
  { key: 'follow-up', label: '宣教与随访', icon: 'tasks', kinds: ['EDUCATION', 'FOLLOW_UP'] },
]

const hasIcd10Code = (text: string) => /\[[A-Z]\d{2}(?:\.\d+)?\]/.test(text)
const catalogTaskKinds = new Set(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION'])


function parseMedicationSpecification(text?: string, details?: string): string | null {
  const source = `${text || ''} ${details || ''}`
  const labeled = /(?:规格|每粒含量|每片含量|含量)[：:]\s*([^\n；;，,。]+)/.exec(source)
  if (labeled) {
    const value = labeled[1].trim()
    return /待确认|不明确|未知|未提供/.test(value) ? null : value
  }
  const perUnit = /[0-9]+(?:\.[0-9]+)?\s*(?:mg|μg|ug|g|mL|ml)\s*[/／]\s*(?:粒|片|支|袋|包)/i.exec(source)
  return perUnit?.[0] ?? null
}

function PlanReviewChecklist({ items, isStreaming, isMatching, onRemove, onUpdateItem }: {
  items: PlanTextReviewItem[]
  isStreaming?: boolean
  isMatching?: boolean
  onRemove?: (index: number) => void
  onUpdateItem?: (index: number, updated: Partial<PlanTextReviewItem>) => void
}) {
  const available = items ?? []
  return (
    <div className={`ai-plan-review-list ${isStreaming ? 'ai-plan-review-list--streaming' : ''}`} role="region" aria-label="临床方案审核清单">
      {reviewGroups.map((group) => {
        const values = available
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => group.kinds.includes(item.kind) && !(item.kind === 'CONDITION' && item.text === '适用条件'))
        if (!values.length) return null
        return (
          <section key={group.key} className="ai-plan-review-group">
            <header className="ai-plan-review-group__header">
              <div className="ai-plan-review-group__title-area">
                <span className="ai-plan-review-group__icon">
                  <Icon name={group.icon} />
                </span>
                <strong className="ai-plan-review-group__label">{group.label}</strong>
              </div>
              <StatusBadge tone="neutral">{values.length} 项</StatusBadge>
            </header>
            <div className="ai-plan-review-items">
              {values.map(({ item, index }) => {
                const isTextItem = item.kind === 'EDUCATION' || item.kind === 'FOLLOW_UP'
                const usageHint = item.kind === 'MEDICATION' ? item.details?.trim() : null
                const specification = item.kind === 'MEDICATION' ? parseMedicationSpecification(item.text, item.details) : null
                return (
                  <article
                    key={`${item.kind}-${item.text}-${index}`}
                    className={`ai-plan-review-item ${isTextItem ? 'ai-plan-review-item--text' : ''}`}
                  >
                    <div className="ai-plan-review-item__main">
                      <div className="ai-plan-review-item__title-row">
                        <strong className="ai-plan-review-item__name">{item.text}</strong>
                        {item.kind === 'MEDICATION' && (
                          <StatusBadge tone={specification ? 'neutral' : 'warning'}>
                            {specification ? `建议规格：${specification}` : '规格待确认'}
                          </StatusBadge>
                        )}
                        {item.kind === 'DIAGNOSIS' && hasIcd10Code(item.text) && (
                          <StatusBadge tone="warning">诊断编码待目录核对</StatusBadge>
                        )}
                        {item.kind === 'CONDITION' && item.details?.includes('尚未匹配院内 ICD-10 术语') && (
                          <StatusBadge tone="warning">待对齐诊断</StatusBadge>
                        )}
                        {item.details && !isTextItem && (
                          <Tooltip content={<div className="ai-plan-tooltip-details">{item.details}</div>}>
                            <Button variant="text" size="sm" type="button" className="ai-plan-info-btn" aria-label={`查看 ${item.text} 依据`}>
                              <Icon name="info" />
                            </Button>
                          </Tooltip>
                        )}
                        {isMatching && catalogTaskKinds.has(item.kind) && <StatusBadge tone="warning">匹配中</StatusBadge>}
                        {isMatching && !catalogTaskKinds.has(item.kind) && item.kind !== 'CONDITION' && (
                          <StatusBadge tone="warning">待医生确认</StatusBadge>
                        )}
                      </div>
                      {usageHint && <small>原始说明：{usageHint}</small>}
                      {isTextItem && (
                        <div className="ai-plan-text-item-body">
                          {onUpdateItem ? (
                            <textarea
                              className="ui-field__control ai-plan-text-item-input"
                              rows={2}
                              value={item.details || ''}
                              placeholder="输入指导、宣教或随访内容..."
                              onChange={(e) => onUpdateItem(index, { details: e.target.value })}
                              aria-label={`${item.text}内容`}
                            />
                          ) : (
                            <p className="ai-plan-text-item-preview">{item.details || '暂无详细指导内容'}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {onRemove && (
                      <Button size="sm" variant="text" aria-label={`移除 ${item.text}`}
                        onClick={() => onRemove(index)}>移除</Button>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
      {!available.length && !isStreaming && (
        <div className="ai-plan-modal-row-empty">当前没有保留的诊疗项目，请通过左侧对话补充需要的内容。</div>
      )}
    </div>
  )
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  round?: number
  webSearch?: boolean
  isError?: boolean
}

const quickStartChips = ['成人风寒感冒', '急性上感对症', '慢支止咳化痰', '血压升高初诊评估', '社区获得性肺炎轻症', '急性扁桃体炎', '小儿积食咳嗽']
const quickRevisionChips = ['删除检验检查', '诊断对齐ICD-10', '补充3天后复诊', '精简口服用药', '增加血常规检查']

export function AiPlanTemplateDraftModal({
  api,
  organizationId,
  initialScope = 'PERSONAL',
  editingTemplate,
  onClose,
  onSaved,
}: AiPlanTemplateDraftModalProps) {
  const isEditing = !!editingTemplate
  const [naturalInput, setNaturalInput] = useState('')
  const [scope, setScope] = useState<OutpatientPlanTemplateScope>(editingTemplate?.scopeType || initialScope)
  const queryClient = useQueryClient()
  const [textDraft, setTextDraft] = useState<PlanTextDraft | null>(null)
  const [noteContent, setNoteContent] = useState<OutpatientNoteTemplateContent>(() => planNoteContent({}, editingTemplate?.tasks ?? []))
  const loadedNoteId = useRef<string | null>(null)
  const savedNote = useRef<NoteSaveCheckpoint | null>(null)
  const linkedNotes = useQuery({ queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE', templateApiScope(api)],
    queryFn: async () => requireNoteTemplateList(await api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'), 'GENERAL_PRACTICE'),
    retry: false,
    enabled: Boolean(editingTemplate?.noteTemplateId),
  })
  useEffect(() => {
    const linked = linkedNotes.data?.find((note) => note.id === editingTemplate?.noteTemplateId)
    if (linked && !textDraft && loadedNoteId.current !== linked.id) {
      loadedNoteId.current = linked.id
      setNoteContent(linked.content)
    }
  }, [linkedNotes.data, editingTemplate?.noteTemplateId, textDraft])

  const [stage, setStage] = useState<'INPUT' | 'TEXT_REVIEW' | 'STRUCTURED_REVIEW'>(editingTemplate ? 'STRUCTURED_REVIEW' : 'INPUT')

  const [compiledDraft, setCompiledDraft] = useState<SaveOutpatientPlanTemplateInput | null>(() => {
    if (!editingTemplate) return null
    return {
      scopeType: editingTemplate.scopeType,
      name: editingTemplate.name,
      description: editingTemplate.description,
      sourceType: editingTemplate.sourceType,
      guidelineReference: editingTemplate.guidelineReference,
      sortOrder: editingTemplate.sortOrder,
      noteTemplateId: editingTemplate.noteTemplateId,
      diagnoses: [...(editingTemplate.diagnoses ?? [])],
      medications: (editingTemplate.medications ?? []).map((m) => ({
        medicationId: m.medicationId,
        catalogItemId: m.catalogItemId,
        packageId: m.packageId,
        medicationName: m.medicationName,
        preparationSpec: m.preparationSpec,
        doseValue: m.doseValue,
        doseUnit: m.doseUnit,
        routeCode: m.routeCode,
        frequencyCode: m.frequencyCode,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        quantity: m.quantity,
        quantityUnit: m.quantityUnit,
        substitutionAllowed: m.substitutionAllowed,
        selfProvided: m.selfProvided,
        medicationInstruction: m.medicationInstruction,
        priceType: m.priceType,
        pricingRequired: m.pricingRequired,
        reason: m.reason,
      })),
      services: (editingTemplate.services ?? []).map((s) => ({
        catalogItemId: s.catalogItemId,
        itemCode: s.itemCode,
        itemName: s.itemName,
        serviceType: s.serviceType,
        quantity: s.quantity,
        unitCode: s.unitCode,
        priceType: s.priceType,
        pricingRequired: s.pricingRequired,
        reason: s.reason,
        clinicalDescription: s.clinicalDescription,
      })),
      tasks: [...(editingTemplate.tasks ?? [])],
    }
  })
  const [compiling, setCompiling] = useState(false)
  const saveOperation = useTemplateApplication(JSON.stringify([templateApiScope(api), organizationId, editingTemplate?.id, editingTemplate?.revision]), false,
    () => JSON.stringify([compiledDraft, noteContent, scope]),
    '当前会话或方案内容已变化，本次未确认保存；远端可能已完成部分保存，请先查询核实。')
  const saving = saveOperation.pending
  const [error, setError] = useState<string | null>(null)
  const [streamSource, setStreamSource] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [initialIntent, setInitialIntent] = useState('')
  const [revisionCount, setRevisionCount] = useState(0)
  const [revisionRunning, setRevisionRunning] = useState(false)
  const conversion = useTemplateApplication(JSON.stringify([templateApiScope(api), organizationId, editingTemplate?.id, editingTemplate?.revision]), compiling || saving,
    () => JSON.stringify([textDraft, scope, initialIntent, naturalInput]),
    '当前会话或文字方案已变化，本次目录转换结果未带入，请重新核对并匹配。')
  const converting = conversion.pending

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (editingTemplate) {
      return [
        {
          id: safeRandomUUID(),
          role: 'assistant',
          content: `正在调整「${editingTemplate.name}」，右侧明细可直接微调。`,
        },
      ]
    }
    return [
      {
        id: safeRandomUUID(),
        role: 'assistant',
        content: '输入临床意图，AI 帮你整理方案。',
      },
    ]
  })
  const compileAbortRef = useRef<AbortController | null>(null)
  const chatThreadRef = useRef<HTMLDivElement | null>(null)
  const speechRecognitionRef = useRef<any>(null)
  const [isListening, setIsListening] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [chipsMoreOpen, setChipsMoreOpen] = useState(false)
  const chipsDropdownRef = useRef<HTMLDivElement | null>(null)
  const streamPreview = useMemo(() => planTextStreamPreview(streamSource), [streamSource])
  const streamedNoteContent = { ...streamPreview.noteTemplateContent }
  for (const [kind, key] of [['EDUCATION', 'healthEducation'], ['FOLLOW_UP', 'followUp']] as const) {
    const text = streamPreview.items.filter((item) => item.kind === kind && item.details !== '正在生成细节...')
      .map((item) => item.details || item.text).join('\n')
    if (streamedNoteContent[key] === undefined && text) streamedNoteContent[key] = text
  }
  const streamedPlanItems = streamPreview.noteTemplateComplete
    ? streamPreview.items.filter((item) => !['EDUCATION', 'FOLLOW_UP'].includes(item.kind)) : []
  const unresolvedCatalogTasks = useMemo(() => (compiledDraft?.tasks ?? []).filter((task) =>
    (catalogTaskKinds.has(task.kind) && task.status !== 'MATCHED')
      || (task.kind === 'CONDITION' && task.details?.includes('尚未匹配院内 ICD-10 术语'))), [compiledDraft?.tasks])
  const missingStandardDiagnosis = !isEditing && !!compiledDraft && compiledDraft.diagnoses.length === 0

  const [activeMedSearchTaskIndex, setActiveMedSearchTaskIndex] = useState<number | null>(null)
  const [medSearchKeyword, setMedSearchKeyword] = useState('')

  const [activeServiceSearchTaskIndex, setActiveServiceSearchTaskIndex] = useState<number | null>(null)
  const [serviceSearchKeyword, setServiceSearchKeyword] = useState('')

  // 诊断微调状态
  const [activeDiagSearchTaskIndex, setActiveDiagSearchTaskIndex] = useState<number | null>(null)
  const [isAddingDiagnosis, setIsAddingDiagnosis] = useState(false)
  const [diagSearchKeyword, setDiagSearchKeyword] = useState('')

  // 药品微调状态
  const [editingMedIndex, setEditingMedIndex] = useState<number | null>(null)
  const [isAddingMed, setIsAddingMed] = useState(false)
  const [newMedSearchKeyword, setNewMedSearchKeyword] = useState('')

  const [pendingMedication, setPendingMedication] = useState<{
    api: RhnApi; context: string; taskIndex?: number; item: CompiledPlanMedicationItem; source?: string
  } | null>(null)
  const medicationContext = JSON.stringify([templateApiScope(api), organizationId, editingTemplate?.id, editingTemplate?.revision, scope, compiledDraft])
  const medicationStandards = useQuery({
    queryKey: ['ai-plan-medication-standards', templateApiScope(api), organizationId, scope],
    queryFn: async () => requireEditorStandards(await api.masterData.clinicalMedicationStandards()),
    retry: false, enabled: stage === 'STRUCTURED_REVIEW' && Boolean(compiledDraft?.medications.length || pendingMedication),
  })
  const standards = medicationStandards.isSuccess && !medicationStandards.isFetching ? medicationStandards.data : undefined
  const medicationValidation = compiledDraft?.medications.map(item => aiMedicationValidation(item, standards)).find(Boolean) ?? ''
  const pendingContextChanged = !!pendingMedication && (pendingMedication.api !== api || pendingMedication.context !== medicationContext)
  const pendingMedicationValidation = pendingMedication
    ? pendingContextChanged ? '当前会话或方案已变化，请取消后重新选择药品。'
      : aiMedicationValidation(pendingMedication.item, standards, pendingMedication.taskIndex !== undefined) : ''

  // 检验检查微调状态
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null)
  const [isAddingService, setIsAddingService] = useState(false)
  const [newServiceSearchKeyword, setNewServiceSearchKeyword] = useState('')

  const [pendingService, setPendingService] = useState<{
    api: RhnApi; context: string; item: CompiledPlanServiceItem; taskIndex?: number; source?: string
  } | null>(null)
  const serviceValidation = compiledDraft?.services.map(aiServiceValidation).find(Boolean) ?? ''
  const serviceContextChanged = !!pendingService && (pendingService.api !== api || pendingService.context !== medicationContext)
  const pendingServiceValidation = pendingService
    ? serviceContextChanged ? '当前机构、会话或方案已变化，请取消后重新选择项目。' : aiServiceValidation(pendingService.item) : ''

  const searchContext = JSON.stringify([templateApiScope(api), organizationId, editingTemplate?.id, editingTemplate?.revision, scope, compiledDraft?.tasks])
  const canSearch = !saving && !compiling && !converting
  const medSearch = useTemplateCatalogSearch(`${searchContext}:${activeMedSearchTaskIndex}`, medSearchKeyword,
    canSearch && activeMedSearchTaskIndex !== null, query => searchTemplateMedications(api, query))
  const serviceSearch = useTemplateCatalogSearch(`${searchContext}:${activeServiceSearchTaskIndex}`, serviceSearchKeyword,
    canSearch && activeServiceSearchTaskIndex !== null, query => searchTemplateServices(api, query, organizationId))
  const diagSearch = useTemplateCatalogSearch(`${searchContext}:${activeDiagSearchTaskIndex}:${isAddingDiagnosis}`, diagSearchKeyword,
    canSearch && (activeDiagSearchTaskIndex !== null || isAddingDiagnosis), query => searchTemplateDiagnoses(api, query))
  const newMedSearch = useTemplateCatalogSearch(searchContext, newMedSearchKeyword,
    canSearch && isAddingMed, query => searchTemplateMedications(api, query))
  const newServiceSearch = useTemplateCatalogSearch(searchContext, newServiceSearchKeyword,
    canSearch && isAddingService, query => searchTemplateServices(api, query, organizationId))
  const medSearchResults = medSearch.rows, serviceSearchResults = serviceSearch.rows, diagSearchResults = diagSearch.rows
  const newMedSearchResults = newMedSearch.rows, newServiceSearchResults = newServiceSearch.rows
  const handleSearchMed = (_keyword: string) => medSearch.search()
  const handleSearchService = (_keyword: string) => serviceSearch.search()
  const handleSearchDiagnosis = (_keyword: string) => diagSearch.search()
  const handleSearchNewMed = (_keyword: string) => newMedSearch.search()
  const handleSearchNewService = (_keyword: string) => newServiceSearch.search()
  useEffect(() => { if (activeMedSearchTaskIndex !== null) void medSearch.search() }, [activeMedSearchTaskIndex])
  useEffect(() => { if (activeServiceSearchTaskIndex !== null) void serviceSearch.search() }, [activeServiceSearchTaskIndex])
  useEffect(() => { if (activeDiagSearchTaskIndex !== null) void diagSearch.search() }, [activeDiagSearchTaskIndex])

  // 其他安排（宣教/随访）微调状态

  const tasksWithIndex = useMemo(() => {
    return (compiledDraft?.tasks ?? []).map((task, index) => ({ task, index }))
  }, [compiledDraft?.tasks])

  const unmatchedDiagnosisTasks = useMemo(() => {
    return tasksWithIndex.filter(({ task }) =>
      task.kind === 'DIAGNOSIS' && task.status !== 'MATCHED'
    )
  }, [tasksWithIndex])

  const unmatchedMedicationTasks = useMemo(() => {
    return tasksWithIndex.filter(({ task }) =>
      task.kind === 'MEDICATION' && task.status !== 'MATCHED'
    )
  }, [tasksWithIndex])

  const unmatchedServiceTasks = useMemo(() => {
    return tasksWithIndex.filter(({ task }) =>
      (task.kind === 'LABORATORY' || task.kind === 'EXAMINATION') && task.status !== 'MATCHED'
    )
  }, [tasksWithIndex])

  const conditionTasks = useMemo(() => {
    return tasksWithIndex.filter(({ task }) => task.kind === 'CONDITION')
  }, [tasksWithIndex])


  useEffect(() => {
    return () => {
      compileAbortRef.current?.abort()
      speechRecognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (!chipsMoreOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (chipsDropdownRef.current && !chipsDropdownRef.current.contains(e.target as Node)) {
        setChipsMoreOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setChipsMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [chipsMoreOpen])

  const isRealtimeSupported = typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  const toggleSpeech = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('当前浏览器环境不支持实时语音听写，推荐使用 Chrome 或 Edge 浏览器并允许麦克风权限。')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'zh-CN'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      recognition.onresult = (event: any) => {
        let finalChunk = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i]
          if (res.isFinal) {
            finalChunk += res[0]?.transcript || ''
          }
        }
        if (finalChunk) {
          const text = finalChunk.trim()
          setChatInput((prev) => (prev ? prev + ' ' : '') + text)
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error', event?.error)
        setIsListening(false)
        if (event?.error === 'not-allowed') {
          setError('麦克风权限已被拒绝，请在浏览器地址栏允许麦克风访问。')
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      speechRecognitionRef.current = recognition
      recognition.start()
    } catch (err: any) {
      console.error('Failed to start speech recognition', err)
      setIsListening(false)
      setError('无法启动语音识别：' + (err?.message || '未知异常'))
    }
  }

  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight
    }
  }, [messages, compiling])

  const capabilities = useQuery({
    queryKey: ['clinical-ai-capabilities'],
    queryFn: () => api.clinicalAi.capabilities(),
  })
  const modelReady = capabilities.data?.mode === 'MODEL' && capabilities.data?.available
    && capabilities.data?.features?.includes('PLAN_COMPILATION')

  const handleSend = async () => {
    if (compiling) return

    if (isListening) {
      speechRecognitionRef.current?.stop()
      setIsListening(false)
    }

    if (!textDraft) {
      // 第一轮生成方案
      setError(null)
      setCompiling(true)
      setRevisionRunning(false)
      setStreamSource('')
      const controller = new AbortController()
      compileAbortRef.current?.abort()
      compileAbortRef.current = controller

      try {
        const input = chatInput.trim()
        if (!input) {
          setError('请输入用于编译方案的临床意图、口述文本或指南推荐。')
          setCompiling(false)
          return
        }
        setNaturalInput(input)
        setInitialIntent(input)
        setMessages((prev) => [
          ...prev,
          { id: safeRandomUUID(), role: 'user', content: input, webSearch: webSearchEnabled },
        ])
        setChatInput('')

        const effectiveInput = webSearchEnabled ? `【联网检索模式】${input}` : input
        const result = await api.outpatientPlanTemplates.compileDraftStream(
          effectiveInput, scope, controller.signal,
          (delta) => { if (!controller.signal.aborted) setStreamSource((current) => current + delta) },
        )
        setTextDraft(result)
        setNoteContent({ ...planNoteContent(result.noteTemplateContent, result.reviewItems), annotations: result.recordAnnotations })
        setCompiledDraft(null)
        setStage('TEXT_REVIEW')
        setMessages((prev) => [
          ...prev,
          {
            id: safeRandomUUID(),
            role: 'assistant',
            content: webSearchEnabled
              ? `已结合最新临床指南与循证文献检索，生成「${result.name}」方案草案。`
              : `已生成「${result.name}」方案草案，右侧清单可直接审阅，下方支持对话微调。`,
          },
        ])
      } catch (e: any) {
        if (controller.signal.aborted) return
        const msg = errorMessage(e) || 'AI 编译方案失败，请重试'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          {
            id: safeRandomUUID(),
            role: 'assistant',
            content: `方案生成遇到问题：${msg}。您可以核对服务状态或重新发送。`,
            isError: true,
          },
        ])
      } finally {
        if (compileAbortRef.current === controller) {
          compileAbortRef.current = null
          setCompiling(false)
        }
      }
    } else {
      // 对已有草案进行对话式修订
      const instruction = chatInput.trim()
      if (!instruction) return
      setError(null)
      setCompiling(true)
      setRevisionRunning(true)
      setStreamSource('')
      const nextRound = revisionCount + 1
      setRevisionCount(nextRound)
      setMessages((prev) => [
        ...prev,
        { id: safeRandomUUID(), role: 'user', content: instruction, round: nextRound, webSearch: webSearchEnabled },
      ])
      setChatInput('')

      const controller = new AbortController()
      compileAbortRef.current?.abort()
      compileAbortRef.current = controller

      try {
        const baseInput = initialIntent || naturalInput.trim() || textDraft.name
        const effectiveInstruction = webSearchEnabled ? `【联网检索模式】${instruction}` : instruction
        const result = await api.outpatientPlanTemplates.reviseDraftStream(
          baseInput, textDraft.narrative, effectiveInstruction, scope, controller.signal,
          (delta) => { if (!controller.signal.aborted) setStreamSource((current) => current + delta) },
        )
        setTextDraft(result)
        setNoteContent({ ...planNoteContent(result.noteTemplateContent, result.reviewItems), annotations: result.recordAnnotations })
        setCompiledDraft(null)
        setStage('TEXT_REVIEW')
        setMessages((prev) => [
          ...prev,
          {
            id: safeRandomUUID(),
            role: 'assistant',
            content: webSearchEnabled
              ? `已结合最新循证文献检索，完成第 ${nextRound} 轮方案调整。`
              : `方案已完成第 ${nextRound} 轮调整，右侧已更新。`,
          },
        ])
      } catch (e: any) {
        if (controller.signal.aborted) return
        const msg = errorMessage(e) || 'AI 修订方案失败，请重试'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          {
            id: safeRandomUUID(),
            role: 'assistant',
            content: `方案调整遇到问题：${msg}。您可以核对服务状态或重新发送。`,
            round: nextRound,
            isError: true,
          },
        ])
      } finally {
        if (compileAbortRef.current === controller) {
          compileAbortRef.current = null
          setCompiling(false)
          setRevisionRunning(false)
        }
      }
    }
  }

  const handleConvert = () => {
    if (!textDraft) return
    setError(null)
    const source = structuredClone(textDraft)
    const requestedScope = scope
    void conversion.run(async () => {
      const result = await api.outpatientPlanTemplates.convertDraft(
        initialIntent || naturalInput.trim(), source.narrative.trim(), source.name, source.reviewItems, requestedScope,
      )
      return confirmConvertedPlan(result, source.reviewItems, source.name, requestedScope)
    }, result => {
      setCompiledDraft(result)
      setStage('STRUCTURED_REVIEW')
    })
  }

  const handleSave = () => {
    if (!compiledDraft || pendingMedication || medicationValidation || pendingService || serviceValidation) return
    setError(null)
    void saveOperation.run(async isCurrent => {
      if (editingTemplate?.noteTemplateId && (linkedNotes.isFetching || linkedNotes.isError)) {
        throw new Error('配套病历模板尚未确认，请重新加载核对。')
      }
      const saved = await saveAiMaintainedPlan(api, { ...compiledDraft, scopeType: scope }, structuredClone(noteContent),
        editingTemplate, linkedNotes.data?.find(note => note.id === editingTemplate?.noteTemplateId), savedNote, isCurrent)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
      return saved
    }, onSaved)
  }

  const removeDiagnosis = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.diagnoses.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, diagnoses: next,
      tasks: compiledDraft.tasks?.map((task) => task.kind === 'DIAGNOSIS' && task.status === 'MATCHED'
        ? { ...task, status: 'NEEDS_REVIEW' as const } : task) })
  }

  const removeMedication = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.medications.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, medications: next,
      tasks: compiledDraft.tasks?.map(task => task.kind === 'MEDICATION' && task.status === 'MATCHED'
        ? { ...task, status: 'NEEDS_REVIEW' as const } : task) })
  }

  const removeService = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.services.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, services: next,
      tasks: compiledDraft.tasks?.map((task) => (task.kind === 'LABORATORY' || task.kind === 'EXAMINATION')
        && task.status === 'MATCHED' ? { ...task, status: 'NEEDS_REVIEW' as const } : task) })
  }

  const removeTask = (idx: number) => {
    if (!compiledDraft) return
    const task = compiledDraft.tasks?.[idx]
    if (!task) return
    setCompiledDraft({
      ...compiledDraft,
      tasks: (compiledDraft.tasks ?? []).filter((_, i) => i !== idx),
    })
  }


  const handleSelectMedProduct = (taskIndex: number, prod: TemplateMedicationCandidate) => {
    if (!compiledDraft || taskIndex !== activeMedSearchTaskIndex || !medSearch.canSelect(prod)) return
    beginMedicationConfirmation(prod, taskIndex)
  }

  const beginMedicationConfirmation = (prod: TemplateMedicationCandidate, taskIndex?: number) => {
    if (!compiledDraft) return
    if (compiledDraft.medications.some(item => item.medicationId === prod.medicationId)) {
      setError('方案中已有该药品，请核对现有明细，未自动重复添加。')
      return
    }
    const task = taskIndex === undefined ? undefined : compiledDraft.tasks?.[taskIndex]
    if (taskIndex !== undefined && !task) return
    const source = task ? [...new Set([task.text, task.sourceQuote, task.details].filter(Boolean))].join('\n') : undefined
    setPendingMedication({ api, context: medicationContext, taskIndex, item: medicationCandidateDraft(prod, source), source })
  }

  const confirmMedication = () => {
    if (!compiledDraft || !pendingMedication || pendingMedicationValidation || saving || compiling) return
    const { item, taskIndex } = pendingMedication
    setCompiledDraft({ ...compiledDraft, medications: [...compiledDraft.medications, item],
      tasks: compiledDraft.tasks?.map((task, index) => index === taskIndex ? { ...task, status: 'MATCHED' as const } : task) })
    setPendingMedication(null)
    setActiveMedSearchTaskIndex(null)
    setIsAddingMed(false)
    setNewMedSearchKeyword('')
  }


  const handleSelectServiceItem = (taskIndex: number, srv: TemplateServiceCandidate) => {
    if (!compiledDraft || taskIndex !== activeServiceSearchTaskIndex || !serviceSearch.canSelect(srv)) return
    beginServiceConfirmation(srv, taskIndex)
  }

  const beginServiceConfirmation = (srv: TemplateServiceCandidate, taskIndex?: number) => {
    if (!compiledDraft || !organizationId || srv.organizationId !== organizationId) return
    if (compiledDraft.services.some(item => item.catalogItemId === srv.id)) {
      setError('方案中已有该项目，请核对现有数量，未自动重复添加。')
      return
    }
    const task = taskIndex === undefined ? undefined : compiledDraft.tasks?.[taskIndex]
    if (taskIndex !== undefined && !task) return
    setPendingService({ api, context: medicationContext, taskIndex, item: serviceCandidateDraft(srv),
      source: task ? [...new Set([task.text, task.sourceQuote, task.details].filter(Boolean))].join('\n') : undefined })
  }

  const confirmService = () => {
    if (!compiledDraft || !pendingService || pendingServiceValidation || saving || compiling) return
    const { item, taskIndex } = pendingService
    setCompiledDraft({ ...compiledDraft, services: [...compiledDraft.services, item],
      tasks: compiledDraft.tasks?.map((task, index) => index === taskIndex ? { ...task, status: 'MATCHED' as const } : task) })
    setPendingService(null)
    setActiveServiceSearchTaskIndex(null)
    setIsAddingService(false)
    setNewServiceSearchKeyword('')
  }


  const makePrimaryDiagnosis = (idx: number) => {
    if (!compiledDraft) return
    const current = compiledDraft.diagnoses
    if (idx === 0 || !current[idx]) return
    const item = current[idx]
    const others = current.filter((_, i) => i !== idx)
    const nextDiagnoses: typeof current = [
      { ...item, type: 'PRIMARY' },
      ...others.map((d) => ({ ...d, type: 'SECONDARY' as const })),
    ]
    setCompiledDraft({ ...compiledDraft, diagnoses: nextDiagnoses })
  }


  const handleSelectDiagnosis = (diag: TemplateDiagnosisCandidate) => {
    if (!compiledDraft || !isAddingDiagnosis || !diagSearch.canSelect(diag)) return
    if (compiledDraft.diagnoses.some((d) => d.conceptId === diag.id || d.codeSystem === diag.codeSystem && d.code === diag.code && d.diagnosisDomain === diag.diagnosisDomain)) {
      setError('该诊断已在方案中')
      return
    }
    setError(null)
    const isFirst = compiledDraft.diagnoses.length === 0
    const newDiag = {
      conceptId: diag.id, codeSystem: diag.codeSystem,
      diagnosisDomain: diag.diagnosisDomain,
      code: diag.code,
      display: diag.display,
      type: (isFirst ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
    }
    setCompiledDraft({
      ...compiledDraft,
      diagnoses: [...compiledDraft.diagnoses, newDiag],
    })
    setIsAddingDiagnosis(false)

    setDiagSearchKeyword('')
  }

  const handleAlignDiagnosisTask = (taskIndex: number, diag: TemplateDiagnosisCandidate) => {
    if (!compiledDraft || taskIndex !== activeDiagSearchTaskIndex || !diagSearch.canSelect(diag)) return
    const isFirst = compiledDraft.diagnoses.length === 0
    const newDiag = {
      conceptId: diag.id, codeSystem: diag.codeSystem,
      diagnosisDomain: diag.diagnosisDomain,
      code: diag.code,
      display: diag.display,
      type: (isFirst ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
    }
    const nextTasks = (compiledDraft.tasks ?? []).map((t, i) =>
      i === taskIndex ? { ...t, status: 'MATCHED' as const } : t
    )
    setCompiledDraft({
      ...compiledDraft,
      diagnoses: [...compiledDraft.diagnoses, newDiag],
      tasks: nextTasks,
    })
    setActiveDiagSearchTaskIndex(null)

    setDiagSearchKeyword('')
  }

  const updateMedication = (idx: number, patch: Partial<CompiledPlanMedicationItem>) => {
    if (!compiledDraft) return
    const nextMedications = compiledDraft.medications.map((m, i) =>
      i === idx ? { ...m, ...patch } : m
    )
    setCompiledDraft({ ...compiledDraft, medications: nextMedications })
  }


  const handleAddMedProduct = (prod: TemplateMedicationCandidate) => {
    if (!compiledDraft || !newMedSearch.canSelect(prod)) return
    beginMedicationConfirmation(prod)
  }


  const updateService = (idx: number, patch: Partial<CompiledPlanServiceItem>) => {
    if (!compiledDraft) return
    const nextServices = compiledDraft.services.map((s, i) =>
      i === idx ? { ...s, ...patch } : s
    )
    setCompiledDraft({ ...compiledDraft, services: nextServices })
  }


  const handleAddServiceItem = (srv: TemplateServiceCandidate) => {
    if (!compiledDraft || !newServiceSearch.canSelect(srv)) return
    beginServiceConfirmation(srv)
  }


  return (
    <>
    <Dialog
      title={isEditing ? '方案调整与明细微调' : '智能方案构建'}
      size="xwide"
      presentation="drawer"
      boundary={document.querySelector<HTMLElement>('.workspace-content')}
      closeOnBackdrop={false}
      className="ai-plan-dialog"
      onClose={() => {
        if (saving) return
        compileAbortRef.current?.abort()
        onClose()
      }}
      actions={
        <div className="ai-plan-head-actions">
          <div className="ai-plan-head-tip">
            <Icon name="info" />
            <span>AI 草稿 · 保存前请核对</span>
          </div>
          <Button size="sm" variant="secondary" disabled={saving} onClick={() => {
            compileAbortRef.current?.abort()
            onClose()
          }}>
            取消
          </Button>
          {stage === 'TEXT_REVIEW' && textDraft ? (
            <Button
              size="sm"
              busy={converting}
              disabled={converting || !textDraft.narrative.trim() || textDraft.reviewItems.length === 0}
              onClick={handleConvert}
            >
              确认方案并匹配院内目录
            </Button>
          ) : compiledDraft ? (
            <Button
              size="sm"
              busy={saving}
              disabled={saving || compiling || (Boolean(editingTemplate?.noteTemplateId) && (linkedNotes.isPending || linkedNotes.isError)) || !compiledDraft.name.trim()
                || missingStandardDiagnosis || Boolean(pendingMedication) || Boolean(medicationValidation) || Boolean(pendingService) || Boolean(serviceValidation)
                || unresolvedCatalogTasks.length > 0
                || !(compiledDraft.diagnoses?.length || compiledDraft.medications?.length
                  || compiledDraft.services?.length || compiledDraft.tasks?.length)}
              onClick={handleSave}
            >
              {isEditing ? '确认保存调整' : '确认存入方案池'}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="ai-plan-modal-body">
        {serviceValidation && !pendingService && <div role="alert" className="doctor-plan-pool-notice">{serviceValidation}</div>}
        {medicationValidation && !pendingMedication && <div role="alert" className="doctor-plan-pool-notice">{medicationValidation}</div>}
        {medicationStandards.isError && !pendingMedication && <div role="alert" className="doctor-plan-pool-notice">用法字典加载失败：{errorMessage(medicationStandards.error)}
          <Button variant="text" onClick={() => void medicationStandards.refetch()}>重新加载用法字典</Button></div>}
        {(error || saveOperation.error || conversion.error) && <div role="alert" className="doctor-plan-pool-notice">{error || saveOperation.error || conversion.error}</div>}
        {linkedNotes.error && <div role="alert" className="doctor-plan-pool-notice">配套病历模板加载失败：{errorMessage(linkedNotes.error)}
          <Button variant="text" onClick={() => void linkedNotes.refetch()}>重新加载病历模板</Button></div>}
        {editingTemplate?.noteTemplateId && linkedNotes.isSuccess && !linkedNotes.data?.some(note => note.id === editingTemplate.noteTemplateId)
          && <div role="alert" className="doctor-plan-pool-notice">配套病历模板已不可用，不能将未加载的正文当作空模板保存。</div>}

        <div className="ai-plan-modal-grid" inert={saving || converting}>
          <div className="ai-plan-modal-left">
            {capabilities.data && !modelReady && <Alert tone="warning">当前未启用真实模型方案编译：{capabilities.data.message}</Alert>}
            {capabilities.isError && <Alert tone="warning">暂时无法读取模型状态，请稍后重试。</Alert>}

            <div className="ai-plan-modal-toolbar">
              <div className="ai-plan-scope-selector" role="radiogroup" aria-label="方案使用范围">
                <span className="ai-plan-scope-label">方案范围</span>
                <div className="ai-plan-scope-pills">
                  {([
                    { value: 'PERSONAL', label: '个人', title: '医生个人高频方案（仅本人可见）' },
                    { value: 'DEPARTMENT', label: '科室', title: '专科/科室临床路径方案（本科室可见）' },
                    { value: 'HOSPITAL', label: '全院', title: '全院临床指南标准方案（全院通用）' },
                  ] as const).map((opt) => (
                    <Button variant="text" size="sm"
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={scope === opt.value}
                      className={`ai-plan-scope-pill ${scope === opt.value ? 'is-active' : ''}`}
                      title={opt.title}
                      onClick={() => setScope(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {modelReady && (
                <span className="ai-plan-model-badge" title="临床 AI 助手已就绪，支持流式建方与病历规范生成">
                  <span className="ai-plan-model-dot" />
                  <span>AI 助手就绪</span>
                </span>
              )}
            </div>

            {/* 对话消息流 (含方案修订记录) */}
            <div
              className="ai-plan-chat-thread"
              role="region"
              aria-label="方案修订记录"
              ref={chatThreadRef}
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`ai-plan-chat-msg ai-plan-chat-msg--${msg.role} ${msg.isError ? 'ai-plan-chat-msg--error' : ''}`}
                >
                  <div className="ai-plan-chat-msg__avatar">
                    {msg.role === 'assistant' ? <Icon name="sparkles" /> : '医'}
                  </div>
                  <div className="ai-plan-chat-msg__bubble">
                    {msg.round !== undefined && (
                      <span className="ai-plan-chat-msg__round">第 {msg.round} 轮修订</span>
                    )}
                    {msg.webSearch && (
                      <span className="ai-plan-chat-msg__websearch">
                        <Icon name="globe" /> 联网检索
                      </span>
                    )}
                    <p>{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 统一对话输入底栏 (Card Composer 截图模式) */}
            <div className="ai-plan-chat-composer">
              <div className="ai-plan-chat-chips" aria-label="快捷灵感推荐">
                <span className="ai-plan-chat-chips-label">
                  <Icon name="sparkles" /> 灵感:
                </span>
                {(textDraft ? quickRevisionChips : quickStartChips).slice(0, 2).map((chip) => (
                  <Button variant="text" size="sm"
                    key={chip}
                    type="button"
                    className="ai-plan-chat-chip"
                    onClick={() => {
                      if (!textDraft) {
                        setChatInput(chip)
                      } else {
                        setChatInput((prev) => (prev ? `${prev}；${chip}` : chip))
                      }
                    }}
                  >
                    + {chip}
                  </Button>
                ))}
                {(textDraft ? quickRevisionChips : quickStartChips).length > 2 && (
                  <div
                    className="ai-plan-chat-chips-more-container"
                    ref={chipsDropdownRef}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setChipsMoreOpen(false)
                      }
                    }}
                  >
                    <Button variant="text" size="sm"
                      type="button"
                      className={`ai-plan-chat-chip ai-plan-chat-chip--more ${chipsMoreOpen ? 'is-active' : ''}`}
                      onClick={() => setChipsMoreOpen((prev) => !prev)}
                      aria-haspopup="true"
                      aria-expanded={chipsMoreOpen}
                    >
                      更多 ▾
                    </Button>
                    {chipsMoreOpen && (
                      <div className="ai-plan-chips-popover" role="menu">
                        <div className="ai-plan-chips-popover-title">更多临床推荐</div>
                        <div className="ai-plan-chips-popover-list">
                          {(textDraft ? quickRevisionChips : quickStartChips).slice(2).map((chip) => (
                            <Button variant="text" size="sm"
                              key={chip}
                              type="button"
                              role="menuitem"
                              className="ai-plan-chips-popover-item"
                              onClick={() => {
                                if (!textDraft) {
                                  setChatInput(chip)
                                } else {
                                  setChatInput((prev) => (prev ? `${prev}；${chip}` : chip))
                                }
                                setChipsMoreOpen(false)
                              }}
                            >
                              + {chip}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="ai-plan-chat-card">
                <textarea
                  className="ai-plan-chat-card__input"
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  aria-label={textDraft ? '对话式修订要求' : '输入问题或描述症状'}
                  placeholder={
                    textDraft
                      ? '请输入方案微调要求（如：增加随访复诊，删除血常规）...'
                      : '请输入您的问题或描述症状、方案需求、指南条文...'
                  }
                />

                <div className="ai-plan-chat-card__toolbar">
                  <div className="ai-plan-chat-card__tools">
                    <Tooltip content={isListening ? '正在语音识别... 点击停止' : (isRealtimeSupported ? '语音输入（点击开始听写）' : '当前浏览器不支持实时语音识别')}>
                      <Button variant="text" size="sm"
                        type="button"
                        className={`ai-plan-tool-btn ${isListening ? 'is-active is-listening' : ''}`}
                        onClick={toggleSpeech}
                        aria-label="语音输入"
                      >
                        <Icon name="mic" />
                      </Button>
                    </Tooltip>

                    <Tooltip content={webSearchEnabled ? '联网检索：已开启（将检索最新临床指南与循证文献）' : '联网检索：已关闭（点击开启）'}>
                      <Button variant="text" size="sm"
                        type="button"
                        className={`ai-plan-tool-btn ${webSearchEnabled ? 'is-active' : ''}`}
                        onClick={() => setWebSearchEnabled((prev) => !prev)}
                        aria-label="联网检索"
                      >
                        <Icon name="globe" />
                      </Button>
                    </Tooltip>
                  </div>

                  <Button variant="text" size="sm"
                    type="button"
                    disabled={compiling || !modelReady || (!chatInput.trim() && !isListening)}
                    className="ai-plan-send-btn"
                    onClick={() => void handleSend()}
                    aria-label="发送"
                  >
                    <Icon name="send" />
                    <span>{compiling ? '生成中...' : '发送'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="ai-plan-modal-right">
            {compiling ? (
              <div className="ai-plan-stream-view__status-card">
                <div className="ai-plan-stream-view__status-left">
                  <div className="ai-plan-stream-view__status-title">
                    <span className="ai-plan-stream-pulse-dot" />
                    <strong>{streamPreview.name || (revisionRunning ? '正在按修订要求更新方案...' : '正在实时构建临床方案...')}</strong>
                  </div>
                  {streamedPlanItems.length === 0 && (
                    <div className="ai-plan-stream-view__loading-hint">
                      <span className="ai-plan-stream-spin" />
                      <span>{streamPreview.noteTemplateComplete ? '正在生成诊断与医嘱建议…' : '病历内容生成后，将在此自动展示诊疗方案…'}</span>
                    </div>
                  )}
                </div>
                <span className="ai-plan-stream-view__badge">
                  {streamedPlanItems.length > 0
                    ? `已结构化梳理 ${streamedPlanItems.length} 项`
                    : (streamPreview.noteTemplateComplete ? '正在生成诊疗条目…' : '正在优先生成病历内容…')}
                </span>
              </div>
            ) : compiledDraft ? (
              <div className="ai-plan-header-config">
                <div className="ai-plan-modal-info-grid">
                  <FormField label="方案名称" required>
                    <input
                      value={compiledDraft.name}
                      onChange={(e) => setCompiledDraft({ ...compiledDraft, name: e.target.value })}
                      placeholder="方案名称（必填）"
                    />
                  </FormField>

                  <FormField label="方案说明">
                    <input
                      value={compiledDraft.description ?? ''}
                      onChange={(e) => setCompiledDraft({ ...compiledDraft, description: e.target.value })}
                      placeholder="简要说明适用场景或临床特点"
                    />
                  </FormField>
                </div>
              </div>
            ) : (
              <div className="ai-plan-modal-right-head">
                <div>
                  <h3>{converting ? '正在匹配院内目录' : stage === 'TEXT_REVIEW'
                    ? textDraft?.name || '临床方案审核' : isEditing ? '方案调整与明细微调' : '系统方案核对'}</h3>
                </div>
                {converting ? (
                  <StatusBadge tone="warning">逐条匹配中</StatusBadge>
                ) : stage === 'TEXT_REVIEW' && textDraft ? (
                  <StatusBadge tone="warning">方案待审阅</StatusBadge>
                ) : null}
              </div>
            )}

            <div className="ai-plan-result-grid">
              <WorkspacePane label="病历书写" className="ai-plan-note-pane"
                header={<PanelHead title="病历书写" meta={compiling ? "正在逐段生成…" : undefined} />}>
                {scope !== 'HOSPITAL' ? <NoteWritingTemplateEditor content={compiling ? { ...noteContent, ...streamedNoteContent } : noteContent} onChange={setNoteContent}
                  disabled={compiling || converting || saving || (Boolean(editingTemplate?.noteTemplateId) && linkedNotes.isPending)} />
                  : <Alert tone="info">全院方案暂不支持关联病历模板；配套病历可在个人或科室范围保存。</Alert>}
              </WorkspacePane>
              <WorkspacePane label="诊疗方案" className="ai-plan-treatment-pane"
                header={<PanelHead title="诊疗方案" />}>
            {compiling && streamedPlanItems.length > 0 ? (
              <div className="ai-plan-stream-view" aria-live="polite" aria-busy="true">
                <div className="ai-plan-stream-content">
                  <PlanReviewChecklist items={streamedPlanItems} isStreaming />
                  <div className="ai-plan-stream-live-indicator">
                    <span className="ai-plan-stream-spin" />
                    <span>正在完成方案生成与一致性校验…</span>
                  </div>
                </div>
              </div>
            ) : converting && textDraft ? (
              <div className="ai-plan-matching-view" aria-live="polite" aria-busy="true">
                <div className="ai-plan-matching-view__head">
                  <span className="ai-plan-stream-pulse-dot" />
                  <div>
                    <strong>正在匹配院内目录</strong>
                    <small>保留原记录，逐条补充目录结果</small>
                  </div>
                </div>
                <PlanReviewChecklist items={textDraft.reviewItems.filter((item) => !['EDUCATION', 'FOLLOW_UP'].includes(item.kind))} isMatching />
              </div>
            ) : (stage === 'TEXT_REVIEW' || compiling) && textDraft ? (
              <div className="ai-plan-modal-text-review">
                <PlanReviewChecklist
                  items={textDraft.reviewItems.filter((item) => !['EDUCATION', 'FOLLOW_UP'].includes(item.kind))}
                  onRemove={compiling ? undefined : (index) => setTextDraft({
                    ...textDraft,
                    reviewItems: textDraft.reviewItems.filter((item) => item !== textDraft.reviewItems.filter((value) => !['EDUCATION', 'FOLLOW_UP'].includes(value.kind))[index]),
                  })}
                  onUpdateItem={compiling ? undefined : (index, updated) => setTextDraft({
                    ...textDraft,
                    reviewItems: textDraft.reviewItems.map((item) =>
                      item === textDraft.reviewItems.filter((value) => !['EDUCATION', 'FOLLOW_UP'].includes(value.kind))[index] ? { ...item, ...updated } : item,
                    ),
                  })}
                />
              </div>
            ) : !compiledDraft ? (
              <div className="ai-plan-empty-view">
                <div className="ai-plan-empty-icon">
                  <Icon name="tasks" />
                </div>
                <h3 className="ai-plan-empty-title">系统方案核对</h3>
                <p className="ai-plan-empty-subtitle">编译结果将在此逐项呈现</p>
                <p className="ai-plan-empty-desc">
                  输入临床意图后，右侧会保留原记录并标记院内目录匹配结果。
                </p>

                <div className="ai-plan-empty-flow" aria-label="方案编译流程">
                  <div className="ai-plan-empty-card">
                    <span className="ai-plan-empty-step-num">01</span>
                    <div className="ai-plan-empty-card-body">
                      <strong>生成文字方案</strong>
                      <small>按门诊场景组织处置</small>
                    </div>
                  </div>
                  <span className="ai-plan-empty-arrow" aria-hidden="true">→</span>
                  <div className="ai-plan-empty-card">
                    <span className="ai-plan-empty-step-num">02</span>
                    <div className="ai-plan-empty-card-body">
                      <strong>医生审核确认</strong>
                      <small>可直接对话修订正文</small>
                    </div>
                  </div>
                  <span className="ai-plan-empty-arrow" aria-hidden="true">→</span>
                  <div className="ai-plan-empty-card">
                    <span className="ai-plan-empty-step-num">03</span>
                    <div className="ai-plan-empty-card-body">
                      <strong>转换系统任务</strong>
                      <small>匹配院内目录后入池</small>
                    </div>
                  </div>
                </div>

                <div className="ai-plan-empty-categories">
                  <span>诊断</span>
                  <span>检查 / 检验</span>
                  <span>用药</span>
                  <span>宣教 / 随访</span>
                </div>
              </div>
            ) : (
              <div className="ai-plan-modal-content">
                {unresolvedCatalogTasks.length > 0 && (
                  <Alert tone="warning">
                    <span className="ai-plan-legacy-copy">仍有 {unresolvedCatalogTasks.length} 项诊断、药品或检验检查未能唯一匹配</span>
                    还有 {unresolvedCatalogTasks.length} 项未能唯一匹配院内目录，请核对或移除。
                  </Alert>
                )}
                {missingStandardDiagnosis && (
                  <Alert tone="warning">
                    <span className="ai-plan-legacy-copy">当前方案尚无已匹配的 ICD-10 标准诊断</span>
                    请补充一个已匹配的 ICD-10 诊断。
                  </Alert>
                )}


                {/* 诊断列表 */}
                <section className="ai-plan-review-group" role="region" aria-label="诊断与评估">
                  <header className="ai-plan-review-group__header">
                    <div className="ai-plan-review-group__title-area">
                      <span className="ai-plan-review-group__icon">
                        <Icon name="stethoscope" />
                      </span>
                      <strong className="ai-plan-review-group__label">诊断与评估</strong>
                    </div>
                    <StatusBadge tone={compiledDraft.diagnoses.length + unmatchedDiagnosisTasks.length > 0 ? 'neutral' : 'warning'}>
                      {compiledDraft.diagnoses.length + unmatchedDiagnosisTasks.length} 项
                    </StatusBadge>
                  </header>
                  <div className="ai-plan-review-items">
                    {compiledDraft.diagnoses.length === 0 && unmatchedDiagnosisTasks.length === 0 ? (
                      <div className="ai-plan-modal-row-empty">请至少指定一个诊断</div>
                    ) : (
                      <>
                        {compiledDraft.diagnoses.map((d, idx) => (
                          <article key={`diag-${idx}`} className="ai-plan-review-item ai-plan-match-result-row">
                            <div className="ai-plan-review-item__main">
                              <div className="ai-plan-review-item__title-row">
                                <strong className="ai-plan-review-item__name">{d.display}</strong>
                                {d.code && <small className="ai-plan-modal-subtext">({d.code})</small>}
                                <StatusBadge tone={d.type === 'PRIMARY' ? 'warning' : 'neutral'}>
                                  {d.type === 'PRIMARY' ? '主诊断' : '次诊断'}
                                </StatusBadge>
                                <StatusBadge tone="success">已匹配标准库</StatusBadge>
                              </div>
                            </div>
                            <div className="ai-plan-modal-actions">
                              {d.type !== 'PRIMARY' && (
                                <Button size="sm" variant="text" onClick={() => makePrimaryDiagnosis(idx)} title="设为主要诊断">
                                  设为主诊断
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="text"
                                aria-label={`移除诊断 ${d.display}`}
                                title="移除"
                                onClick={() => removeDiagnosis(idx)}
                              >
                                <Icon name="close" />
                              </Button>
                            </div>
                          </article>
                        ))}
                        {unmatchedDiagnosisTasks.map(({ task, index }) => (
                          <article key={`diag-task-${index}`} className="ai-plan-review-item ai-plan-row-unmatched">
                            <div className="ai-plan-review-item__main">
                              <div className="ai-plan-review-item__title-row">
                                <strong className="ai-plan-review-item__name">{task.text}</strong>
                                {task.details && (
                                  <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                    <Button variant="text" size="sm" type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                      <Icon name="info" />
                                    </Button>
                                  </Tooltip>
                                )}
                              </div>
                              {activeDiagSearchTaskIndex === index ? (
                                <div className="ai-plan-inline-search">
                                  <div className="ai-plan-inline-search__bar">
                                    <input
                                      type="text"
                                      className="ui-field__control"
                                      value={diagSearchKeyword}
                                      onChange={(e) => setDiagSearchKeyword(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchDiagnosis(diagSearchKeyword) }}
                                      placeholder="输入疾病名称、编码或拼音搜索标准诊断..."
                                      autoFocus
                                    />
                                    <Button size="sm" variant="secondary" onClick={() => void handleSearchDiagnosis(diagSearchKeyword)}>搜索</Button>
                                    <Button size="sm" variant="text" onClick={() => setActiveDiagSearchTaskIndex(null)}>取消</Button>
                                  </div>
                                  <TemplateCatalogSearchStatus search={diagSearch} />
                        {diagSearchResults.length > 0 && (
                                    <div className="ai-plan-inline-search__list">
                                      {diagSearchResults.map((diag) => (
                                        <div key={diag.id} className="ai-plan-inline-search__item" onClick={() => handleAlignDiagnosisTask(index, diag)}>
                                          <div>
                                            <strong>{diag.display}</strong>
                                            <small>{diag.codeSystem} · {diag.code}</small>
                                          </div>
                                          <Button size="sm" variant="secondary">选用</Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div className="ai-plan-modal-actions">
                              {activeDiagSearchTaskIndex !== index && (
                                <Button size="sm" variant="secondary" onClick={() => {
                                  setIsAddingDiagnosis(false); setActiveDiagSearchTaskIndex(index)
                                  setDiagSearchKeyword(task.text)
                                }}>
                                  <Icon name="search" /> 对齐标准诊断
                                </Button>
                              )}
                              <StatusBadge tone="danger">未匹配标准编码</StatusBadge>
                              <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`} title="移除"
                                onClick={() => removeTask(index)}><Icon name="close" /></Button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                  <footer className="ai-plan-review-group__footer">
                    {isAddingDiagnosis ? (
                      <div className="ai-plan-inline-search ai-plan-inline-search--footer">
                        <div className="ai-plan-inline-search__bar">
                          <input
                            type="text"
                            className="ui-field__control"
                            value={diagSearchKeyword}
                            onChange={(e) => setDiagSearchKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchDiagnosis(diagSearchKeyword) }}
                            placeholder="输入疾病名称、编码或拼音搜索标准诊断..."
                            autoFocus
                          />
                          <Button size="sm" variant="secondary" onClick={() => void handleSearchDiagnosis(diagSearchKeyword)}>搜索</Button>
                          <Button size="sm" variant="text" onClick={() => { setIsAddingDiagnosis(false) }}>取消</Button>
                        </div>
                        <TemplateCatalogSearchStatus search={diagSearch} />
                        {diagSearchResults.length > 0 && (
                          <div className="ai-plan-inline-search__list">
                            {diagSearchResults.map((diag) => (
                              <div key={diag.id} className="ai-plan-inline-search__item" onClick={() => handleSelectDiagnosis(diag)}>
                                <div>
                                  <strong>{diag.display}</strong>
                                  <small>{diag.codeSystem} · {diag.code}</small>
                                </div>
                                <Button size="sm" variant="secondary">选用</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => { setActiveDiagSearchTaskIndex(null); setIsAddingDiagnosis(true); setDiagSearchKeyword('') }}>
                        <Icon name="add" /> 添加标准诊断
                      </Button>
                    )}
                  </footer>
                </section>

                {/* 处方药品列表 */}
                <section className="ai-plan-review-group" role="region" aria-label="用药建议">
                  <header className="ai-plan-review-group__header">
                    <div className="ai-plan-review-group__title-area">
                      <span className="ai-plan-review-group__icon">
                        <Icon name="pill" />
                      </span>
                      <strong className="ai-plan-review-group__label">用药建议</strong>
                    </div>
                    <StatusBadge tone="neutral">
                      {compiledDraft.medications.length + unmatchedMedicationTasks.length} 项
                    </StatusBadge>
                  </header>
                  <div className="ai-plan-review-items">
                    {compiledDraft.medications.length === 0 && unmatchedMedicationTasks.length === 0 ? (
                      <div className="ai-plan-modal-row-empty">暂无推荐用药</div>
                    ) : (
                      <>
                        {compiledDraft.medications.map((m, idx) => (
                          <article key={`med-${idx}`} className="ai-plan-review-item ai-plan-match-result-row">
                            <div className="ai-plan-review-item__main">
                              <div className="ai-plan-review-item__title-row">
                                <strong className="ai-plan-review-item__name">{m.medicationName || `目录药品 #${m.medicationId}`}</strong>
                                <StatusBadge tone={m.preparationSpec ? 'neutral' : 'warning'}>
                                  {m.preparationSpec || '规格待确认'}
                                </StatusBadge>
                                <StatusBadge tone="success">{m.catalogItemId ? '产品已对齐' : '已对齐'}</StatusBadge>
                              </div>
                              {editingMedIndex === idx ? (
                                <div>
                                  <AiPlanMedicationFields item={m} standards={standards} disabled={saving}
                                    onChange={patch => updateMedication(idx, patch)} />
                                  <Button size="sm" variant="secondary" disabled={Boolean(aiMedicationValidation(m, standards))}
                                    onClick={() => setEditingMedIndex(null)}>完成</Button>
                                </div>
                              ) : (
                                <small className="ai-plan-modal-row-sub">用法: {[
                                  formatRouteName(m.routeCode, standards?.routes),
                                  standards?.frequencies?.find(frequency => frequency.code === m.frequencyCode)?.name || (m.frequencyCode ? `${m.frequencyCode}（待字典核对）` : '频次待确认'),
                                  medicationSingleDoseLabel(m),
                                  m.durationValue != null ? `${m.durationValue}${m.durationUnit || '（单位待确认）'}` : '疗程待开立时确认',
                                  Number.isFinite(m.quantity) && m.quantity > 0 ? `数量 ${m.quantity}${m.quantityUnit || '（单位待确认）'}` : '数量待确认',
                                ].filter(Boolean).join(' · ')}</small>
                              )}
                            </div>
                            <div className="ai-plan-modal-actions">
                              {editingMedIndex !== idx && (
                                <Button size="sm" variant="text" onClick={() => setEditingMedIndex(idx)} title="修改用法用量">
                                  调整用法
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="text"
                                aria-label={`移除药品 ${m.medicationName || m.medicationId}`}
                                title="移除"
                                onClick={() => removeMedication(idx)}
                              >
                                <Icon name="close" />
                              </Button>
                            </div>
                          </article>
                        ))}
                        {unmatchedMedicationTasks.map(({ task, index }) => {
                          const usageHint = task.details?.trim()
                          const specification = parseMedicationSpecification(task.text, task.details)
                          return (
                            <article key={`med-task-${index}`} className="ai-plan-review-item ai-plan-row-unmatched">
                              <div className="ai-plan-review-item__main">
                                <div className="ai-plan-review-item__title-row">
                                  <strong className="ai-plan-review-item__name">{task.text}</strong>
                                  <StatusBadge tone={specification ? 'neutral' : 'warning'}>
                                    {specification ? `建议规格：${specification}` : '规格待确认'}
                                  </StatusBadge>
                                  {task.details && (
                                    <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                      <Button variant="text" size="sm" type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                        <Icon name="info" />
                                      </Button>
                                    </Tooltip>
                                  )}
                                </div>
                                {usageHint && <small>原始说明：{usageHint}</small>}
                                {activeMedSearchTaskIndex === index ? (
                                  <div className="ai-plan-inline-search">
                                    <div className="ai-plan-inline-search__bar">
                                      <input
                                        type="text"
                                        className="ui-field__control"
                                        value={medSearchKeyword}
                                        onChange={(e) => setMedSearchKeyword(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchMed(medSearchKeyword) }}
                                        placeholder="输入药品名称搜索目录产品或通用主档..."
                                        autoFocus
                                      />
                                      <Button size="sm" variant="secondary" onClick={() => void handleSearchMed(medSearchKeyword)}>搜索</Button>
                                      <Button size="sm" variant="text" onClick={() => setActiveMedSearchTaskIndex(null)}>取消</Button>
                                    </div>
                                    <TemplateCatalogSearchStatus search={medSearch} />
                        {medSearchResults.length > 0 && (
                                      <div className="ai-plan-inline-search__list">
                                        {medSearchResults.map((prod) => (
                                          <div key={prod.key} className="ai-plan-inline-search__item" onClick={() => handleSelectMedProduct(index, prod)}>
                                            <div>
                                              <strong>{prod.name}</strong>
                                              <small>{prod.preparationSpec || ''} {prod.tradeName ? `(${prod.tradeName})` : ''}</small>
                                              {prod.isGenericOnly && <StatusBadge tone="neutral">通用主档</StatusBadge>}
                                            </div>
                                            <Button size="sm" variant="secondary">选用</Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <div className="ai-plan-modal-actions">
                                {activeMedSearchTaskIndex !== index && (
                                  <Button size="sm" variant="secondary" onClick={() => {
                                    setActiveMedSearchTaskIndex(index)
                                    setMedSearchKeyword(task.text)
                                  }}>
                                    <Icon name="search" /> 对齐目录药品
                                  </Button>
                                )}
                                <StatusBadge tone="danger">待匹配目录</StatusBadge>
                                <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`}
                                  title="移除" onClick={() => removeTask(index)}><Icon name="close" /></Button>
                              </div>
                            </article>
                          )
                        })}
                      </>
                    )}
                  </div>
                  <footer className="ai-plan-review-group__footer">
                    {isAddingMed ? (
                      <div className="ai-plan-inline-search ai-plan-inline-search--footer">
                        <div className="ai-plan-inline-search__bar">
                          <input
                            type="text"
                            className="ui-field__control"
                            value={newMedSearchKeyword}
                            onChange={(e) => setNewMedSearchKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchNewMed(newMedSearchKeyword) }}
                            placeholder="输入药品名称搜索目录产品或通用主档..."
                            autoFocus
                          />
                          <Button size="sm" variant="secondary" onClick={() => void handleSearchNewMed(newMedSearchKeyword)}>搜索</Button>
                          <Button size="sm" variant="text" onClick={() => { setIsAddingMed(false) }}>取消</Button>
                        </div>
                        <TemplateCatalogSearchStatus search={newMedSearch} />
                        {newMedSearchResults.length > 0 && (
                          <div className="ai-plan-inline-search__list">
                            {newMedSearchResults.map((prod) => (
                              <div key={prod.key} className="ai-plan-inline-search__item" onClick={() => handleAddMedProduct(prod)}>
                                <div>
                                  <strong>{prod.name}</strong>
                                  <small>{prod.preparationSpec || ''} {prod.tradeName ? `(${prod.tradeName})` : ''}</small>
                                  {prod.isGenericOnly && <StatusBadge tone="neutral">通用主档</StatusBadge>}
                                </div>
                                <Button size="sm" variant="secondary">选用</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => { setIsAddingMed(true); setNewMedSearchKeyword('') }}>
                        <Icon name="add" /> 添加目录药品
                      </Button>
                    )}
                  </footer>
                </section>

                {/* 检验检查服务 */}
                <section className="ai-plan-review-group" role="region" aria-label="检验检查">
                  <header className="ai-plan-review-group__header">
                    <div className="ai-plan-review-group__title-area">
                      <span className="ai-plan-review-group__icon">
                        <Icon name="flask" />
                      </span>
                      <strong className="ai-plan-review-group__label">检验检查</strong>
                    </div>
                    <StatusBadge tone="neutral">
                      {compiledDraft.services.length + unmatchedServiceTasks.length} 项
                    </StatusBadge>
                  </header>
                  <div className="ai-plan-review-items">
                    {compiledDraft.services.length === 0 && unmatchedServiceTasks.length === 0 ? (
                      <div className="ai-plan-modal-row-empty">暂无检验检查项目</div>
                    ) : (
                      <>
                        {compiledDraft.services.map((s, idx) => (
                          <article key={`srv-${idx}`} className="ai-plan-review-item ai-plan-match-result-row">
                            <div className="ai-plan-review-item__main">
                              <div className="ai-plan-review-item__title-row">
                                <strong className="ai-plan-review-item__name">{s.itemName || `服务项目 #${s.catalogItemId}`}</strong>
                                {s.itemCode && <small className="ai-plan-modal-item-code">({s.itemCode})</small>}
                                <StatusBadge tone="neutral">
                                  {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '诊疗'}
                                </StatusBadge>
                                <StatusBadge tone="success">已对齐目录</StatusBadge>
                              </div>
                            </div>
                            <div className="ai-plan-modal-actions">
                              {editingServiceIndex === idx ? (
                                <div className="ai-plan-service-qty-edit">
                                  <FormField label="项目数量" required>
                                    <UnitNumberInput aria-label="项目数量" value={Number.isFinite(s.quantity) ? s.quantity : ''}
                                      unit={s.unitCode ?? ''} unitReadOnly min="0" step="any"
                                      onValueChange={value => updateService(idx, { quantity: value === '' ? Number.NaN : Number(value) })} />
                                  </FormField>
                                  <Button size="sm" variant="secondary" disabled={Boolean(aiServiceValidation(s))}
                                    onClick={() => setEditingServiceIndex(null)}>完成</Button>
                                </div>
                                ) : (
                                  <>
                                    <span className="ai-plan-modal-row-sub">{Number.isFinite(s.quantity) && s.quantity > 0 ? s.quantity : '数量待确认'} {s.unitCode}</span>
                                  <Button size="sm" variant="text" onClick={() => setEditingServiceIndex(idx)} title="修改数量">
                                    调量
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="text"
                                aria-label={`移除项目 ${s.itemName || s.catalogItemId}`}
                                title="移除"
                                onClick={() => removeService(idx)}
                              >
                                <Icon name="close" />
                              </Button>
                            </div>
                          </article>
                        ))}
                        {unmatchedServiceTasks.map(({ task, index }) => (
                          <article key={`srv-task-${index}`} className="ai-plan-review-item ai-plan-row-unmatched">
                            <div className="ai-plan-review-item__main">
                              <div className="ai-plan-review-item__title-row">
                                <strong className="ai-plan-review-item__name">{task.text}</strong>
                                {task.details && (
                                  <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                    <Button variant="text" size="sm" type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                      <Icon name="info" />
                                    </Button>
                                  </Tooltip>
                                )}
                              </div>
                              {activeServiceSearchTaskIndex === index ? (
                                <div className="ai-plan-inline-search">
                                  <div className="ai-plan-inline-search__bar">
                                    <input
                                      type="text"
                                      className="ui-field__control"
                                      value={serviceSearchKeyword}
                                      onChange={(e) => setServiceSearchKeyword(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchService(serviceSearchKeyword) }}
                                      placeholder="输入项目名称搜索院内服务..."
                                      autoFocus
                                    />
                                    <Button size="sm" variant="secondary" onClick={() => void handleSearchService(serviceSearchKeyword)}>搜索</Button>
                                    <Button size="sm" variant="text" onClick={() => setActiveServiceSearchTaskIndex(null)}>取消</Button>
                                  </div>
                                  <TemplateCatalogSearchStatus search={serviceSearch} />
                        {serviceSearchResults.length > 0 && (
                                    <div className="ai-plan-inline-search__list">
                                      {serviceSearchResults.map((srv) => (
                                        <div key={srv.id} className="ai-plan-inline-search__item" onClick={() => handleSelectServiceItem(index, srv)}>
                                          <div>
                                            <strong>{srv.name}</strong>
                                            <small>编码: {srv.code}</small>
                                          </div>
                                          <Button size="sm" variant="secondary">选用</Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div className="ai-plan-modal-actions">
                              {activeServiceSearchTaskIndex !== index && (
                                <Button size="sm" variant="secondary" onClick={() => {
                                  setActiveServiceSearchTaskIndex(index)
                                  setServiceSearchKeyword(task.text)
                                }}>
                                  <Icon name="search" /> 对齐院内项目
                                </Button>
                              )}
                              <StatusBadge tone="danger">未匹配院内项目</StatusBadge>
                              <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`}
                                title="移除" onClick={() => removeTask(index)}><Icon name="close" /></Button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </div>
                  <footer className="ai-plan-review-group__footer">
                    {isAddingService ? (
                      <div className="ai-plan-inline-search ai-plan-inline-search--footer">
                        <div className="ai-plan-inline-search__bar">
                          <input
                            type="text"
                            className="ui-field__control"
                            value={newServiceSearchKeyword}
                            onChange={(e) => setNewServiceSearchKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchNewService(newServiceSearchKeyword) }}
                            placeholder="输入项目名称搜索院内服务..."
                            autoFocus
                          />
                          <Button size="sm" variant="secondary" onClick={() => void handleSearchNewService(newServiceSearchKeyword)}>搜索</Button>
                          <Button size="sm" variant="text" onClick={() => { setIsAddingService(false) }}>取消</Button>
                        </div>
                        <TemplateCatalogSearchStatus search={newServiceSearch} />
                        {newServiceSearchResults.length > 0 && (
                          <div className="ai-plan-inline-search__list">
                            {newServiceSearchResults.map((srv) => (
                              <div key={srv.id} className="ai-plan-inline-search__item" onClick={() => handleAddServiceItem(srv)}>
                                <div>
                                  <strong>{srv.name}</strong>
                                  <small>编码: {srv.code}</small>
                                </div>
                                <Button size="sm" variant="secondary">选用</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => { setIsAddingService(true); setNewServiceSearchKeyword('') }}>
                        <Icon name="add" /> 添加检验/检查
                      </Button>
                    )}
                  </footer>
                </section>

                {conditionTasks.length > 0 && <section className="ai-plan-review-group" aria-label="适用条件">
                  <header><strong>适用条件</strong></header>
                  <div className="ai-plan-review-items">{conditionTasks.map(({ task, index }) =>
                    <article key={`condition-${index}`} className="ai-plan-review-item">
                      <div><strong>{task.text}</strong><p>{task.details}</p></div>
                      <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`} onClick={() => removeTask(index)}>移除</Button>
                    </article>)}</div>
                </section>}
              </div>
            )}
              </WorkspacePane>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
    {pendingMedication && <Dialog title="确认药品用法与数量" size="wide" onClose={() => setPendingMedication(null)}
      closeOnBackdrop={false} actions={<>
        <Button variant="secondary" onClick={() => setPendingMedication(null)}>取消选药</Button>
        <Button disabled={saving || compiling || Boolean(pendingMedicationValidation)} onClick={confirmMedication}>确认加入方案</Button>
      </>}>
      <p><strong>{pendingMedication.item.medicationName}</strong> · {pendingMedication.item.preparationSpec || '规格未维护'}</p>
      {pendingMedication.source && <section aria-label="原始用药建议"><strong>原始用药建议</strong><p>{pendingMedication.source}</p></section>}
      <p>已根据原始建议和目录默认值预填用法与数量，请核对后确认；实际开立时仍会再次校验。</p>
      {pendingMedicationValidation && <div role="alert" className="doctor-plan-pool-notice">{pendingMedicationValidation}</div>}
      {medicationStandards.isError && <div role="alert" className="doctor-plan-pool-notice">用法字典加载失败：{errorMessage(medicationStandards.error)}
        <Button variant="text" onClick={() => void medicationStandards.refetch()}>重新加载用法字典</Button></div>}
      <AiPlanMedicationFields item={pendingMedication.item} standards={standards} requireDirections={pendingMedication.taskIndex !== undefined} disabled={saving || compiling || pendingContextChanged}
        onChange={patch => setPendingMedication(current => current ? { ...current, item: { ...current.item, ...patch } } : current)} />
    </Dialog>}
    {pendingService && <Dialog title="确认项目数量与说明" size="wide" onClose={() => setPendingService(null)} closeOnBackdrop={false}
      actions={<>
        <Button variant="secondary" onClick={() => setPendingService(null)}>取消选择项目</Button>
        <Button disabled={saving || compiling || Boolean(pendingServiceValidation)} onClick={confirmService}>确认项目加入方案</Button>
      </>}>
      <p><strong>{pendingService.item.itemName}</strong> · {pendingService.item.itemCode}</p>
      <p>{pendingService.item.pricingRequired ? '按目录计价，实际价格在开立时核对。' : '当前机构目录不支持计价，确认后作为不计价项目加入。'}</p>
      {pendingService.source && <section aria-label="原始项目建议"><strong>原始项目建议</strong><p>{pendingService.source}</p></section>}
      {pendingServiceValidation && <div role="alert" className="doctor-plan-pool-notice">{pendingServiceValidation}</div>}
      <FormField label="项目数量" required>
        <UnitNumberInput aria-label="项目数量" value={Number.isFinite(pendingService.item.quantity) ? pendingService.item.quantity : ''}
          unit={pendingService.item.unitCode ?? ''} unitReadOnly min="0" step="any" disabled={saving || compiling || serviceContextChanged}
          onValueChange={value => setPendingService(current => current ? { ...current, item: { ...current.item, quantity: value === '' ? Number.NaN : Number(value) } } : current)} />
      </FormField>
      <FormField label="检查检验说明">
        <textarea aria-label="检查检验说明" className="ui-field__control" rows={3} value={pendingService.item.clinicalDescription ?? ''}
          disabled={saving || compiling || serviceContextChanged} onChange={event => setPendingService(current => current
            ? { ...current, item: { ...current.item, clinicalDescription: event.target.value } } : current)} />
      </FormField>
    </Dialog>}
    </>
  )
}
